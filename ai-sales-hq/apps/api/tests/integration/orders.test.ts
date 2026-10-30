import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { createDb } from '../../src/lib/db';
import { AgentService } from '../../src/modules/agents/service';
import { TelegramService } from '../../src/modules/telegram/service';
import { createWorker } from '../../src/worker/setup';
import { Client, hasDb, makeApp, ownerClient, resetDb } from '../helpers';

describe.skipIf(!hasDb)('orders: preparation, owner handoff, delivery, payments (MySQL)', () => {
  let clock = new Date('2026-10-29T06:00:00Z');
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  let owner: Client;
  let productId: string;

  beforeAll(async () => {
    ctx = await makeApp({}, () => clock, { catalogSource: null, drafters: { fast: null, strong: null } });
  });
  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(ctx.db);
    clock = new Date('2026-10-29T06:00:00Z');
    owner = await ownerClient(ctx.app);
    await owner.post('/api/v1/catalog/seed');
    const products = (await owner.get('/api/v1/catalog/products')).json.products as any[];
    const ch = products.find((p) => p.name === 'CHUCHVARA' && p.packageWeightGrams === 500);
    productId = ch.id;
    await owner.post(`/api/v1/catalog/prices/${ch.retail.id}/confirm`); // 25 000 so'm retail
    await owner.post(`/api/v1/catalog/products/${ch.id}/price`, { type: 'WHOLESALE', amount: 21000 });
  });

  async function prospect(name = 'Supermarket Order') {
    const r = (await owner.post('/api/v1/prospects', { name, phone: '901234567', address: 'Termiz, Alpomish 5' })).json;
    return r.prospectId as string;
  }

  async function staffClient() {
    const user = await ctx.db.user.findFirstOrThrow();
    await ctx.db.user.create({
      data: { username: 'staff', displayName: 'X', passwordHash: user.passwordHash, role: 'STAFF' },
    });
    const staff = new Client(ctx.app);
    await staff.post('/api/v1/auth/login', { username: 'staff', password: 'Qovun-Termiz-2026' });
    return staff;
  }

  it('full walk: draft -> confirmation -> owner review -> approved -> delivered -> paid -> closed', async () => {
    const pid = await prospect();
    // The client sends quantities only; any total it sends is ignored.
    const created = await owner.post('/api/v1/orders', {
      prospectId: pid,
      items: [
        { productId, quantity: 4, priceType: 'RETAIL' },
        { productId, quantity: 10, priceType: 'WHOLESALE' },
      ],
      totalSom: 1,
    });
    expect(created.status).toBe(200);
    const o = created.json;
    expect(o).toMatchObject({ number: 'UT-2026-0001', status: 'DRAFT', totalSom: 310_000, currency: 'UZS' });
    expect(o.items.map((i: any) => [i.priceType, i.unitPriceSom, i.lineTotalSom, i.priceSource])).toEqual([
      ['RETAIL', 25_000, 100_000, 'SEED'],
      ['WHOLESALE', 21_000, 210_000, 'OWNER'],
    ]);
    expect(o.items.every((i: any) => i.availability === 'UNKNOWN')).toBe(true);
    expect(o.contactPhone).toBe('+998901234567');
    expect(o.deliveryAddress).toBe('Termiz, Alpomish 5');
    expect(o.missing).toEqual([]);
    expect(o.confirmationText).toContain("Jami: 310 000 so'm");

    // Idempotent: a second create while the draft is open returns the same order.
    const again = await owner.post('/api/v1/orders', { prospectId: pid, items: [] });
    expect(again.json.id).toBe(o.id);

    // Cannot jump to approval.
    expect((await owner.post(`/api/v1/orders/${o.id}/decision`, { decision: 'approve' })).status).toBe(409);

    const conf = await owner.post(`/api/v1/orders/${o.id}/request-confirmation`);
    expect(conf.json.text).toContain('UT-2026-0001');
    const ready = await owner.post(`/api/v1/orders/${o.id}/customer-confirmed`, {
      note: 'Telefonda "ha, olamiz" dedi',
    });
    expect(ready.json.status).toBe('READY_FOR_OWNER_REVIEW');
    expect(ready.json.customerConfirmedAt).not.toBeNull();
    expect(await ctx.db.notification.count({ where: { kind: 'order.ready_for_review' } })).toBe(1);
    expect((await owner.get('/api/v1/dashboard')).json.orders).toMatchObject({
      awaitingReview: 1,
      draftValue: 310_000,
    });

    // Payments only after approval.
    expect((await owner.post(`/api/v1/orders/${o.id}/payments`, { amountSom: 1000 })).status).toBe(409);

    const approved = await owner.post(`/api/v1/orders/${o.id}/decision`, { decision: 'approve', note: 'ertaga' });
    expect(approved.json.status).toBe('APPROVED_FOR_DELIVERY');
    expect((await owner.get('/api/v1/dashboard')).json.orders).toMatchObject({
      awaitingReview: 0,
      approvedValue: 310_000,
    });

    expect((await owner.post(`/api/v1/orders/${o.id}/payments`, { amountSom: 100_000 })).json.paymentStatus).toBe(
      'PARTIAL',
    );
    expect((await owner.post(`/api/v1/orders/${o.id}/payments`, { amountSom: 300_000 })).status).toBe(400); // overpayment
    expect((await owner.post(`/api/v1/orders/${o.id}/payments`, { amountSom: 10.5 })).status).toBe(400);

    const delivered = await owner.post(`/api/v1/orders/${o.id}/delivered`);
    expect(delivered.json).toMatchObject({ status: 'DELIVERED' });
    const paid = await owner.post(`/api/v1/orders/${o.id}/payments`, { amountSom: 210_000, note: 'naqd' });
    expect(paid.json).toMatchObject({ paymentStatus: 'PAID', amountPaidSom: 310_000 });
    expect((await owner.post(`/api/v1/orders/${o.id}/close`)).json.status).toBe('CLOSED');

    const d = (await owner.get('/api/v1/dashboard')).json.orders;
    expect(d).toEqual({
      awaitingReview: 0,
      draftValue: 0,
      approvedValue: 0,
      deliveredValue: 310_000,
      paidSom: 310_000,
    });
    const view = (await owner.get(`/api/v1/orders/${o.id}`)).json;
    expect(view.events.map((e: any) => e.toStatus)).toEqual([
      'DRAFT',
      'CUSTOMER_CONFIRMATION_PENDING',
      'READY_FOR_OWNER_REVIEW',
      'APPROVED_FOR_DELIVERY',
      'DELIVERED',
      'CLOSED',
    ]);
    expect((await owner.get(`/api/v1/orders?prospectId=${pid}`)).json.orders).toHaveLength(1);
  });

  it('missing information blocks the confirmation request', async () => {
    const pid = await prospect();
    await ctx.db.prospect.update({ where: { id: pid }, data: { address: null } });
    const o = (await owner.post('/api/v1/orders', { prospectId: pid, items: [] })).json;
    expect(o.missing).toHaveLength(2);
    const r = await owner.post(`/api/v1/orders/${o.id}/request-confirmation`);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('missing_information');
    await owner.post(`/api/v1/orders/${o.id}/items`, { items: [{ productId, quantity: 2, priceType: 'RETAIL' }] });
    await owner.post(`/api/v1/orders/${o.id}/details`, { deliveryAddress: 'Denov bozori' });
    expect((await owner.post(`/api/v1/orders/${o.id}/request-confirmation`)).status).toBe(200);
  });

  it('unconfirmed prices cannot be ordered; nothing is invented', async () => {
    const pid = await prospect();
    const products = (await owner.get('/api/v1/catalog/products')).json.products as any[];
    const other = products.find((p) => p.id !== productId && p.retail?.status !== 'CONFIRMED');
    const r = await owner.post('/api/v1/orders', {
      prospectId: pid,
      items: [{ productId: other.id, quantity: 1, priceType: 'RETAIL' }],
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('price_not_confirmed');
    expect(await ctx.db.order.count()).toBe(0);
    const orderable = (await owner.get('/api/v1/orders/products')).json.products;
    expect(orderable.map((p: any) => p.id)).toEqual([productId]);
  });

  it('a catalog price change flags the order PRICE_CHANGED (A8); the Order Manager catches it too', async () => {
    const pid = await prospect();
    const o = (
      await owner.post('/api/v1/orders', {
        prospectId: pid,
        items: [{ productId, quantity: 10, priceType: 'WHOLESALE' }],
      })
    ).json;
    await owner.post(`/api/v1/orders/${o.id}/request-confirmation`);
    await owner.post(`/api/v1/catalog/products/${productId}/price`, { type: 'WHOLESALE', amount: 22000 });
    const r = await owner.post(`/api/v1/orders/${o.id}/customer-confirmed`, { note: 'ha' });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('price_changed');
    let view = (await owner.get(`/api/v1/orders/${o.id}`)).json;
    expect(view.status).toBe('PRICE_CHANGED');
    expect(view.totalSom).toBe(210_000); // never silently recalculated
    expect(view.items[0].priceStale).toBe(true);

    // Re-snapshot -> back to DRAFT with the new price, customer must confirm again.
    view = (
      await owner.post(`/api/v1/orders/${o.id}/items`, { items: [{ productId, quantity: 10, priceType: 'WHOLESALE' }] })
    ).json;
    expect(view).toMatchObject({ status: 'DRAFT', totalSom: 220_000 });

    // Worker path: confirmation pending, price changes again, the Order Manager flags it.
    await owner.post(`/api/v1/orders/${o.id}/request-confirmation`);
    await owner.post(`/api/v1/catalog/products/${productId}/price`, { type: 'WHOLESALE', amount: 23000 });
    const config = loadConfig({ ...process.env });
    const db = createDb(config.DATABASE_URL);
    const agents = new AgentService(db, () => clock);
    try {
      const worker = createWorker({
        db,
        config,
        getSource: () => null,
        telegram: new TelegramService(db, config, null, agents, () => clock),
        drafters: { fast: null, strong: null },
        now: () => clock,
      });
      await agents.ensureAgents();
      await agents.command('order_manager', 'activate', { type: 'user', id: 'o' });
      await agents.command('order_manager', 'start', { type: 'user', id: 'o' });
      await worker.tick({ budgetMs: 8000 });
      await worker.tick({ budgetMs: 8000 }); // same 10-minute bucket: no duplicate job
      expect(await db.job.count({ where: { type: 'orders.check_prices' } })).toBe(1);
    } finally {
      await db.$disconnect();
    }
    expect((await owner.get(`/api/v1/orders/${o.id}`)).json.status).toBe('PRICE_CHANGED');
    expect(await ctx.db.notification.count({ where: { kind: 'order.price_changed' } })).toBe(1);
  });

  it('staff prepares orders but cannot approve, deliver or record payments; anonymous is denied', async () => {
    const pid = await prospect();
    const staff = await staffClient();
    const o = (
      await staff.post('/api/v1/orders', { prospectId: pid, items: [{ productId, quantity: 1, priceType: 'RETAIL' }] })
    ).json;
    expect(o.status).toBe('DRAFT');
    await staff.post(`/api/v1/orders/${o.id}/request-confirmation`);
    expect((await staff.post(`/api/v1/orders/${o.id}/customer-confirmed`, { note: 'ha' })).status).toBe(200);
    expect((await staff.post(`/api/v1/orders/${o.id}/decision`, { decision: 'approve' })).status).toBe(403);
    expect((await staff.post(`/api/v1/orders/${o.id}/decision`, { decision: 'reject' })).status).toBe(403);
    expect((await staff.post(`/api/v1/orders/${o.id}/delivered`)).status).toBe(403);
    expect((await staff.post(`/api/v1/orders/${o.id}/payments`, { amountSom: 1 })).status).toBe(403);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/orders' })).statusCode).toBe(401);
    expect((await owner.post(`/api/v1/orders/${o.id}/decision`, { decision: 'approve' })).status).toBe(200);
  });

  it('do-not-contact prospects get no orders', async () => {
    const pid = await prospect();
    await owner.post(`/api/v1/prospects/${pid}/stage`, { to: 'DO_NOT_CONTACT' });
    expect((await owner.post('/api/v1/orders', { prospectId: pid, items: [] })).status).toBe(409);
  });
});
