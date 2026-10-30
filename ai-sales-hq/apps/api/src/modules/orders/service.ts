import {
  canMoveOrder,
  confirmationText,
  EDITABLE,
  lineTotal,
  MAX_QUANTITY,
  missingInformation,
  type OrderStatus,
  OWNER_ONLY,
  orderNumber,
  orderTotal,
  PRICE_GUARDED,
  paymentStatus,
} from '../../domain/orders';
import { canMoveProspect, normalizePhone } from '../../domain/prospects';
import { toTashkent } from '../../domain/schedule';
import type { Order, PriceType } from '../../generated/prisma/client';
import type { Db } from '../../lib/db';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { type Actor, writeAudit } from '../audit';
import { notify } from '../notifications/service';
import type { ProspectService } from '../prospects/service';
import type { SalesService } from '../sales/service';

export interface ItemInput {
  productId: string;
  quantity: number;
  priceType: PriceType;
}

export const ORDER_DECISIONS = ['approve', 'reject', 'hold', 'resume', 'cancel', 'needs_info'] as const;
export type OrderDecision = (typeof ORDER_DECISIONS)[number];

/** Orders still being prepared: a second "create" for the same prospect returns this one (idempotent). */
const OPEN_DRAFT: OrderStatus[] = ['DRAFT', 'NEEDS_INFORMATION', 'CUSTOMER_CONFIRMATION_PENDING', 'PRICE_CHANGED'];

type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

export class OrderService {
  constructor(
    private readonly db: Db,
    private readonly prospects: ProspectService,
    private readonly sales: SalesService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---------- items and prices ----------

  /** Snapshot of the CURRENT CONFIRMED price for each line; never an invented price (§13, D-005). */
  async #snapshot(tx: Tx, items: ItemInput[]) {
    if (items.length === 0) return [];
    if (items.length > 50) throw badRequest('too_many_items', "Ko'pi bilan 50 ta qator");
    const at = this.now();
    const out = [];
    for (const it of items) {
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > MAX_QUANTITY) {
        throw badRequest('invalid_quantity', `Miqdor 1 dan ${MAX_QUANTITY} gacha butun son bo'lsin`);
      }
      const product = await tx.product.findUnique({
        where: { id: it.productId },
        include: { prices: { where: { priceType: it.priceType, validTo: null, status: 'CONFIRMED' } } },
      });
      if (!product?.isActive) throw badRequest('unknown_product', 'Mahsulot topilmadi yoki faol emas');
      const price = product.prices[0];
      if (!price) {
        throw new AppError(
          409,
          'price_not_confirmed',
          `"${product.name}" uchun ${it.priceType === 'WHOLESALE' ? 'ulgurji' : 'chakana'} narx tasdiqlanmagan`,
        );
      }
      out.push({
        productId: product.id,
        productName: product.name,
        packageWeightGrams: product.packageWeightGrams,
        quantity: it.quantity,
        priceType: it.priceType,
        priceId: price.id,
        priceSource: price.source,
        unitPriceSom: price.amount,
        lineTotalSom: lineTotal({ quantity: it.quantity, unitPriceSom: price.amount }),
        snapshotAt: at,
      });
    }
    return out;
  }

  /** Lines whose snapshot price is no longer the current confirmed price (A8 PRICE_CHANGED). */
  async stalePriceLines(orderId: string): Promise<string[]> {
    const items = await this.db.orderItem.findMany({ where: { orderId } });
    const stale: string[] = [];
    for (const it of items) {
      const current = await this.db.productPrice.findFirst({
        where: { productId: it.productId, priceType: it.priceType, validTo: null, status: 'CONFIRMED' },
      });
      if (!current || current.id !== it.priceId || current.amount !== it.unitPriceSom) stale.push(it.id);
    }
    return stale;
  }

  /** Two orders created at the same moment may pick the same number; the unique index decides, we retry. */
  async #withNumberRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt < 3 && (err as { code?: string }).code === 'P2002') continue;
        throw err;
      }
    }
  }

  async #nextNumber(tx: Tx): Promise<string> {
    const year = Number(toTashkent(this.now()).date.slice(0, 4));
    const count = await tx.order.count({ where: { number: { startsWith: `UT-${year}-` } } });
    return orderNumber(year, count + 1);
  }

  // ---------- transitions ----------

  async #move(order: Order, to: OrderStatus, actor: Actor, note: string | null, isOwner: boolean, data: object = {}) {
    if (!canMoveOrder(order.status, to)) {
      throw new AppError(409, 'illegal_status', `"${order.status}" holatidan "${to}" ga o'tib bo'lmaydi`);
    }
    if (OWNER_ONLY.has(to) && !isOwner) throw forbidden('Bu amalni faqat egasi bajaradi');
    const at = this.now();
    await this.db.$transaction(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: to, ...data },
      });
      if (res.count !== 1) throw conflict('status_changed', "Buyurtma holati o'zgargan — sahifani yangilang");
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: to,
          actorType: actor.type,
          actorId: 'id' in actor ? (actor.id ?? null) : null,
          note,
          createdAt: at,
        },
      });
      await writeAudit(tx, {
        actor,
        action: 'order.status',
        entityType: 'order',
        entityId: order.id,
        details: { from: order.status, to, note },
      });
    });
  }

  async #get(id: string): Promise<Order> {
    const o = await this.db.order.findUnique({ where: { id } });
    if (!o) throw notFound('Buyurtma topilmadi');
    return o;
  }

  // ---------- owner / staff actions ----------

  async create(
    input: {
      prospectId: string;
      items: ItemInput[];
      deliveryAddress?: string;
      contactPhone?: string;
      contactName?: string;
      notes?: string;
    },
    actor: Actor,
  ): Promise<Order> {
    const p = await this.db.prospect.findUnique({ where: { id: input.prospectId }, include: { contacts: true } });
    if (!p) throw notFound('Mijoz topilmadi');
    if (p.stage === 'DO_NOT_CONTACT') throw new AppError(409, 'suppressed', "Bu mijoz bog'lanmaslik ro'yxatida");
    const open = await this.db.order.findFirst({ where: { prospectId: p.id, status: { in: OPEN_DRAFT } } });
    if (open) return open;
    const phone = input.contactPhone
      ? normalizePhone(input.contactPhone)
      : (p.contacts.find((c) => c.kind === 'PHONE')?.value ?? null);
    if (input.contactPhone && !phone) throw badRequest('invalid_phone', "Telefon raqami noto'g'ri");
    const at = this.now();
    const order = await this.#withNumberRetry(() =>
      this.db.$transaction(async (tx) => {
        const lines = await this.#snapshot(tx, input.items);
        const created = await tx.order.create({
          data: {
            number: await this.#nextNumber(tx),
            prospectId: p.id,
            status: 'DRAFT',
            totalSom: orderTotal(lines),
            deliveryAddress: input.deliveryAddress?.trim() || p.address,
            contactPhone: phone,
            contactName: input.contactName?.trim() || p.contactPersonName,
            notes: input.notes ?? null,
            createdById: actor.type === 'user' ? actor.id : null,
            createdAt: at,
            items: { create: lines },
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId: created.id,
            toStatus: 'DRAFT',
            actorType: actor.type,
            actorId: 'id' in actor ? (actor.id ?? null) : null,
            createdAt: at,
          },
        });
        return created;
      }),
    );
    // A customer who orders is in negotiation (A10); earlier stages are left as they are.
    if (p.stage === 'CONTACTED') await this.prospects.moveStage(p.id, 'INTERESTED', actor, `order ${order.number}`);
    if (p.stage === 'CONTACTED' || p.stage === 'INTERESTED')
      await this.prospects.moveStage(p.id, 'NEGOTIATION', actor, `order ${order.number}`);
    await writeAudit(this.db, {
      actor,
      action: 'order.created',
      entityType: 'order',
      entityId: order.id,
      details: { number: order.number },
    });
    return order;
  }

  async replaceItems(orderId: string, items: ItemInput[], actor: Actor) {
    const o = await this.#get(orderId);
    if (!EDITABLE.has(o.status)) throw conflict('not_editable', "Bu holatda mahsulotlarni o'zgartirib bo'lmaydi");
    await this.db.$transaction(async (tx) => {
      const lines = await this.#snapshot(tx, items);
      await tx.orderItem.deleteMany({ where: { orderId } });
      if (lines.length) await tx.orderItem.createMany({ data: lines.map((l) => ({ ...l, orderId })) });
      await tx.order.update({ where: { id: orderId }, data: { totalSom: orderTotal(lines) } });
    });
    // New prices were snapshotted: a PRICE_CHANGED order goes back to DRAFT for re-confirmation.
    if (o.status === 'PRICE_CHANGED') await this.#move(o, 'DRAFT', actor, 'narxlar yangilandi', true);
    await writeAudit(this.db, {
      actor,
      action: 'order.items',
      entityType: 'order',
      entityId: orderId,
      details: { lines: items.length },
    });
  }

  async updateDetails(
    orderId: string,
    d: {
      deliveryAddress?: string | null;
      contactPhone?: string | null;
      contactName?: string | null;
      notes?: string | null;
      requestedDeliveryAt?: Date | null;
    },
    actor: Actor,
  ) {
    const o = await this.#get(orderId);
    if (['DELIVERED', 'CLOSED', 'CANCELLED', 'REJECTED'].includes(o.status))
      throw conflict('closed', 'Buyurtma yopilgan');
    const phone = d.contactPhone === undefined ? undefined : d.contactPhone ? normalizePhone(d.contactPhone) : null;
    if (d.contactPhone && !phone) throw badRequest('invalid_phone', "Telefon raqami noto'g'ri");
    await this.db.order.update({
      where: { id: orderId },
      data: {
        ...(d.deliveryAddress !== undefined ? { deliveryAddress: d.deliveryAddress?.trim() || null } : {}),
        ...(phone !== undefined ? { contactPhone: phone } : {}),
        ...(d.contactName !== undefined ? { contactName: d.contactName?.trim() || null } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
        ...(d.requestedDeliveryAt !== undefined ? { requestedDeliveryAt: d.requestedDeliveryAt } : {}),
      },
    });
    await writeAudit(this.db, { actor, action: 'order.details', entityType: 'order', entityId: orderId });
  }

  /** DRAFT -> CUSTOMER_CONFIRMATION_PENDING once nothing is missing; returns the text to send. */
  async requestConfirmation(orderId: string, actor: Actor, isOwner: boolean) {
    const o = await this.#get(orderId);
    const view = await this.get(orderId);
    if (view.missing.length) {
      throw new AppError(409, 'missing_information', `Yetishmaydi: ${view.missing.join('; ')}`);
    }
    await this.#move(o, 'CUSTOMER_CONFIRMATION_PENDING', actor, null, isOwner);
    return { text: view.confirmationText };
  }

  async customerConfirmed(orderId: string, note: string | null, actor: Actor, isOwner: boolean) {
    const o = await this.#get(orderId);
    if (o.status !== 'CUSTOMER_CONFIRMATION_PENDING') throw conflict('illegal_status', 'Buyurtma tasdiq kutmayapti');
    if ((await this.stalePriceLines(orderId)).length) {
      await this.#move(o, 'PRICE_CHANGED', actor, 'narx o‘zgargan', true);
      throw new AppError(409, 'price_changed', "Narx o'zgargan — buyurtmani yangilab, mijozdan qayta tasdiq oling");
    }
    await this.#move(o, 'READY_FOR_OWNER_REVIEW', actor, note, isOwner, {
      customerConfirmedAt: this.now(),
      customerConfirmation: note?.slice(0, 500) ?? null,
    });
    const p = await this.db.prospect.findUniqueOrThrow({ where: { id: o.prospectId } });
    await notify(
      this.db,
      {
        kind: 'order.ready_for_review',
        severity: 'WARNING',
        title: `Yangi buyurtma ${o.number}: ${p.name}`,
        body: `Mijoz tasdiqladi. Jami: ${o.totalSom.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm. Ko'rib chiqing va tasdiqlang.`,
        link: `/orders/view/?id=${o.id}`,
        dedupeKey: `order-ready-${o.id}`,
      },
      this.now(),
    );
  }

  async ownerDecision(orderId: string, decision: OrderDecision, note: string | null, actor: Actor, isOwner: boolean) {
    const o = await this.#get(orderId);
    if (decision === 'approve') {
      if ((await this.stalePriceLines(orderId)).length) {
        await this.#move(o, 'PRICE_CHANGED', actor, 'narx o‘zgargan', true);
        throw new AppError(409, 'price_changed', "Narx o'zgargan — tasdiqlashdan oldin buyurtmani yangilang");
      }
      return this.#move(o, 'APPROVED_FOR_DELIVERY', actor, note, isOwner, {
        approvedAt: this.now(),
        approvedById: actor.type === 'user' ? actor.id : null,
      });
    }
    const to: Record<typeof decision, OrderStatus> = {
      reject: 'REJECTED',
      hold: 'ON_HOLD',
      resume: 'READY_FOR_OWNER_REVIEW',
      cancel: 'CANCELLED',
      needs_info: 'NEEDS_INFORMATION',
    };
    // "back to draft" from NEEDS_INFORMATION is the same button as resume in the UI.
    const target = decision === 'resume' && o.status === 'NEEDS_INFORMATION' ? 'DRAFT' : to[decision];
    return this.#move(o, target, actor, note, isOwner);
  }

  /** Never automatic (MASTER_SPEC §12): only the owner records delivery. */
  async markDelivered(orderId: string, actor: Actor, isOwner: boolean) {
    const o = await this.#get(orderId);
    await this.#move(o, 'DELIVERED', actor, null, isOwner, {
      deliveredAt: this.now(),
      deliveredById: actor.type === 'user' ? actor.id : null,
    });
    const p = await this.db.prospect.findUniqueOrThrow({ where: { id: o.prospectId } });
    if (canMoveProspect(p.stage, 'WON')) await this.prospects.moveStage(p.id, 'WON', actor, `order ${o.number}`);
  }

  async close(orderId: string, actor: Actor, isOwner: boolean) {
    const o = await this.#get(orderId);
    await this.#move(o, 'CLOSED', actor, null, isOwner, { closedAt: this.now() });
  }

  async recordPayment(orderId: string, amountSom: number, note: string | null, actorUserId: string) {
    if (!Number.isInteger(amountSom) || amountSom <= 0)
      throw badRequest('invalid_amount', "Summa musbat butun son (so'm) bo'lsin");
    const o = await this.#get(orderId);
    if (!['APPROVED_FOR_DELIVERY', 'DELIVERED', 'CLOSED'].includes(o.status)) {
      throw conflict('not_approved', "To'lov faqat tasdiqlangan yoki yetkazilgan buyurtmaga yoziladi");
    }
    const paid = o.amountPaidSom + BigInt(amountSom);
    if (paid > o.totalSom) throw badRequest('overpayment', "To'lov buyurtma summasidan oshib ketadi");
    await this.db.$transaction(async (tx) => {
      await tx.payment.create({
        data: { orderId, amountSom: BigInt(amountSom), note, recordedById: actorUserId, createdAt: this.now() },
      });
      const res = await tx.order.updateMany({
        // Guarded by the amount we read, so two payments at once cannot exceed the total.
        where: { id: orderId, amountPaidSom: o.amountPaidSom },
        data: { amountPaidSom: paid, paymentStatus: paymentStatus(o.totalSom, paid) },
      });
      if (res.count !== 1) throw conflict('payment_changed', "To'lov boshqa joyda yozildi — sahifani yangilang");
      await writeAudit(tx, {
        actor: { type: 'user', id: actorUserId },
        action: 'order.payment',
        entityType: 'order',
        entityId: orderId,
        details: { amountSom, paid: Number(paid) },
      });
    });
  }

  // ---------- agent check ----------

  /** Order Manager: open orders whose snapshot no longer matches the catalog -> PRICE_CHANGED + notify. */
  async checkOpenOrderPrices(actor: Actor): Promise<number> {
    const open = await this.db.order.findMany({ where: { status: { in: [...PRICE_GUARDED] } } });
    let changed = 0;
    for (const o of open) {
      if (!(await this.stalePriceLines(o.id)).length) continue;
      await this.#move(o, 'PRICE_CHANGED', actor, 'katalog narxi o‘zgardi', true);
      await notify(
        this.db,
        {
          kind: 'order.price_changed',
          severity: 'WARNING',
          title: `${o.number}: narx o'zgardi`,
          body: 'Buyurtmadagi narx katalogdagidan farq qiladi. Yangilab, mijozdan qayta tasdiq oling.',
          link: `/orders/view/?id=${o.id}`,
          dedupeKey: `order-price-${o.id}`,
        },
        this.now(),
      );
      changed++;
    }
    return changed;
  }

  // ---------- reading ----------

  async get(id: string) {
    const o = await this.db.order.findUnique({
      where: { id },
      include: {
        items: { orderBy: [{ productName: 'asc' }, { priceType: 'asc' }] },
        events: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!o) throw notFound('Buyurtma topilmadi');
    const p = await this.db.prospect.findUniqueOrThrow({ where: { id: o.prospectId }, include: { contacts: true } });
    const stale = await this.stalePriceLines(o.id);
    const signature = (await this.sales.settings()).signature;
    const products = await this.db.product.findMany({
      where: { id: { in: o.items.map((i) => i.productId) } },
      select: { id: true, availability: true },
    });
    const availability = new Map(products.map((x) => [x.id, x.availability]));
    return {
      ...o,
      totalSom: Number(o.totalSom),
      amountPaidSom: Number(o.amountPaidSom),
      prospect: {
        id: p.id,
        name: p.name,
        stage: p.stage,
        contacts: p.contacts.map((c) => ({ id: c.id, kind: c.kind, value: c.value, isVerified: c.isVerified })),
      },
      items: o.items.map((i) => ({
        ...i,
        unitPriceSom: Number(i.unitPriceSom),
        lineTotalSom: Number(i.lineTotalSom),
        priceStale: stale.includes(i.id),
        // MASTER_SPEC §12: unverified availability is shown as UNKNOWN and needs owner review.
        availability: availability.get(i.productId) === 'IN_STOCK' ? 'VERIFIED' : 'UNKNOWN',
      })),
      events: o.events.map((e) => ({ ...e, id: Number(e.id) })),
      payments: o.payments.map((x) => ({ ...x, amountSom: Number(x.amountSom) })),
      missing: missingInformation({
        itemCount: o.items.length,
        deliveryAddress: o.deliveryAddress,
        contactPhone: o.contactPhone,
        unavailablePrices: stale.length,
      }),
      confirmationText: confirmationText(
        o.number,
        p.name,
        o.items.map((i) => ({
          name: i.productName,
          grams: i.packageWeightGrams,
          quantity: i.quantity,
          unitPriceSom: i.unitPriceSom,
          lineTotalSom: i.lineTotalSom,
        })),
        o.totalSom,
        o.deliveryAddress,
        signature,
      ),
    };
  }

  async list(filter: { status?: OrderStatus; prospectId?: string } = {}) {
    const rows = await this.db.order.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.prospectId ? { prospectId: filter.prospectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { items: { select: { id: true } } },
    });
    const names = new Map(
      (
        await this.db.prospect.findMany({
          where: { id: { in: rows.map((r) => r.prospectId) } },
          select: { id: true, name: true },
        })
      ).map((p) => [p.id, p.name]),
    );
    return rows.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      prospectId: o.prospectId,
      prospectName: names.get(o.prospectId) ?? '',
      totalSom: Number(o.totalSom),
      amountPaidSom: Number(o.amountPaidSom),
      paymentStatus: o.paymentStatus,
      itemCount: o.items.length,
      createdAt: o.createdAt,
    }));
  }

  /** Products the order form may use: only lines with a confirmed price. */
  async orderableProducts() {
    const rows = await this.db.product.findMany({
      where: { isActive: true },
      include: { prices: { where: { validTo: null, status: 'CONFIRMED' } } },
      orderBy: [{ name: 'asc' }, { packageWeightGrams: 'desc' }],
    });
    return rows
      .map((p) => ({
        id: p.id,
        name: p.name,
        packageWeightGrams: p.packageWeightGrams,
        retailSom: p.prices.find((x) => x.priceType === 'RETAIL')
          ? Number(p.prices.find((x) => x.priceType === 'RETAIL')?.amount)
          : null,
        wholesaleSom: p.prices.find((x) => x.priceType === 'WHOLESALE')
          ? Number(p.prices.find((x) => x.priceType === 'WHOLESALE')?.amount)
          : null,
      }))
      .filter((p) => p.retailSom !== null || p.wholesaleSom !== null);
  }
}
