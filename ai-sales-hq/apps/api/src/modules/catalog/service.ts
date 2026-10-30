import { MAX_PRICE_SOM } from '../../domain/catalog';
import { SEED_CATALOG } from '../../domain/seed-catalog';
import type { PriceType, ProductPrice } from '../../generated/prisma/client';
import type { Db } from '../../lib/db';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { writeAudit } from '../audit';

export interface PriceDto {
  id: string;
  type: PriceType;
  amount: number;
  currency: string;
  source: string;
  status: string;
  validFrom: Date;
  validTo: Date | null;
  confirmedAt: Date | null;
}

const toPriceDto = (p: ProductPrice): PriceDto => ({
  id: p.id,
  type: p.priceType,
  amount: Number(p.amount),
  currency: p.currency,
  source: p.source,
  status: p.status,
  validFrom: p.validFrom,
  validTo: p.validTo,
  confirmedAt: p.confirmedAt,
});

const CURRENT = { validTo: null, status: { not: 'SUPERSEDED' as const } };

export class CatalogService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(includeInactive: boolean) {
    const rows = await this.db.product.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { prices: { where: CURRENT } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { packageWeightGrams: 'desc' }],
    });
    return rows.map((p) => {
      const retail = p.prices.find((x) => x.priceType === 'RETAIL');
      const wholesale = p.prices.find((x) => x.priceType === 'WHOLESALE');
      return {
        id: p.id,
        source: p.source,
        externalId: p.externalId,
        name: p.name,
        description: p.description,
        categoryName: p.categoryName,
        packageWeightGrams: p.packageWeightGrams,
        unitType: p.unitType,
        isFrozen: p.isFrozen,
        availability: p.availability,
        stockReported: p.stockReported,
        isActive: p.isActive,
        lastSyncedAt: p.lastSyncedAt,
        retail: retail ? toPriceDto(retail) : null,
        wholesale: wholesale ? toPriceDto(wholesale) : null,
      };
    });
  }

  async get(id: string) {
    const p = await this.db.product.findUnique({
      where: { id },
      include: { prices: { orderBy: { validFrom: 'desc' } } },
    });
    if (!p) throw notFound('Mahsulot topilmadi');
    const { prices, ...rest } = p;
    return { ...rest, prices: prices.map(toPriceDto) };
  }

  /** Loads the owner's initial list (MASTER_SPEC §5) once, into an empty catalog. */
  async seed(actorUserId: string): Promise<number> {
    if ((await this.db.product.count()) > 0) throw conflict('catalog_not_empty', "Katalog bo'sh emas");
    const now = this.now();
    await this.db.$transaction(async (tx) => {
      for (const item of SEED_CATALOG) {
        await tx.product.create({
          data: {
            source: 'SEED',
            name: item.name,
            packageWeightGrams: item.grams,
            isFrozen: true,
            availability: 'UNKNOWN',
            prices: {
              create: {
                priceType: 'RETAIL',
                amount: BigInt(item.retailSom),
                source: 'SEED',
                status: 'OWNER_UNCONFIRMED',
                validFrom: now,
              },
            },
          },
        });
      }
      await writeAudit(tx, {
        actor: { type: 'user', id: actorUserId },
        action: 'catalog.seeded',
        details: { count: SEED_CATALOG.length },
      });
    });
    return SEED_CATALOG.length;
  }

  async confirmPrice(priceId: string, actorUserId: string) {
    const price = await this.db.productPrice.findUnique({ where: { id: priceId } });
    if (!price) throw notFound('Narx topilmadi');
    if (price.validTo !== null || price.status === 'SUPERSEDED') {
      throw conflict('price_not_current', 'Bu narx endi amalda emas — sahifani yangilang');
    }
    if (price.status === 'CONFIRMED') return toPriceDto(price);
    const updated = await this.db.productPrice.update({
      where: { id: priceId },
      data: { status: 'CONFIRMED', confirmedById: actorUserId, confirmedAt: this.now() },
    });
    await writeAudit(this.db, {
      actor: { type: 'user', id: actorUserId },
      action: 'catalog.price_confirmed',
      entityType: 'product_price',
      entityId: priceId,
      details: { productId: price.productId, type: price.priceType, amount: Number(price.amount) },
    });
    return toPriceDto(updated);
  }

  /**
   * Owner sets a price. Wholesale prices only come from the owner (D-005). Retail prices of
   * products synced from the website cannot be overridden here: the website is authoritative.
   */
  async setOwnerPrice(productId: string, type: PriceType, amount: number, actorUserId: string) {
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_PRICE_SOM) {
      throw badRequest('invalid_amount', "Narx butun son (so'm) bo'lishi kerak");
    }
    const product = await this.db.product.findUnique({ where: { id: productId } });
    if (!product) throw notFound('Mahsulot topilmadi');
    if (type === 'RETAIL' && product.source === 'FIRESTORE') {
      throw conflict('retail_from_website', "Chakana narx saytdan olinadi — uni saytda o'zgartiring");
    }
    const now = this.now();
    const created = await this.db.$transaction(async (tx) => {
      const previous = await tx.productPrice.findFirst({ where: { productId, priceType: type, ...CURRENT } });
      await tx.productPrice.updateMany({
        where: { productId, priceType: type, validTo: null },
        data: { status: 'SUPERSEDED', validTo: now },
      });
      const price = await tx.productPrice.create({
        data: {
          productId,
          priceType: type,
          amount: BigInt(amount),
          source: 'OWNER',
          status: 'CONFIRMED',
          validFrom: now,
          confirmedById: actorUserId,
          confirmedAt: now,
        },
      });
      await writeAudit(tx, {
        actor: { type: 'user', id: actorUserId },
        action: 'catalog.price_set',
        entityType: 'product',
        entityId: productId,
        details: { type, from: previous ? Number(previous.amount) : null, to: amount },
      });
      return price;
    });
    return toPriceDto(created);
  }
}
