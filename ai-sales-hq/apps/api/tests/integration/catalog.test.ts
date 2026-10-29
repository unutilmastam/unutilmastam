import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, FakeCatalogSource, hasDb, makeApp, ownerClient, resetDb } from '../helpers';

const product = (id: string, price: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Mahsulot ${id}`,
  gram: 500,
  price,
  stock: 10,
  category: 'c1',
  ...extra,
});

describe.skipIf(!hasDb)('catalog + Firestore sync (MySQL)', () => {
  const source = new FakeCatalogSource();
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  let owner: Client;

  beforeAll(async () => {
    ctx = await makeApp({}, undefined, { catalogSource: source });
  });
  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(ctx.db);
    source.products = [];
    source.categories = [{ id: 'c1', name: 'Chuchvara' }];
    source.failWith = null;
    owner = await ownerClient(ctx.app);
  });

  const sync = () => owner.post('/api/v1/integrations/firestore/sync');
  const products = async () => (await owner.get('/api/v1/catalog/products?inactive=1')).json.products as any[];

  it('first sync imports products with unconfirmed retail prices and no wholesale', async () => {
    source.products = [product('p1', 25000), product('p2', 16000, { gram: 300 })];
    const run = (await sync()).json;
    expect(run).toMatchObject({ status: 'SUCCEEDED', createdCount: 2, fetchedCount: 2 });
    const list = await products();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      source: 'FIRESTORE',
      categoryName: 'Chuchvara',
      availability: 'UNVERIFIED',
      retail: { amount: 25000, status: 'OWNER_UNCONFIRMED', source: 'FIRESTORE' },
      wholesale: null,
    });
    const status = (await owner.get('/api/v1/integrations/firestore')).json;
    expect(status.status).toBe('CONNECTED');
    expect(status.lastSuccessfulSyncAt).not.toBeNull();
    const notes = (await owner.get('/api/v1/notifications')).json.items as any[];
    expect(notes.map((n) => n.kind)).toContain('catalog.prices_to_confirm');
  });

  it('repeated sync is idempotent; price change creates a new version, removal deactivates', async () => {
    source.products = [product('p1', 25000), product('p2', 16000)];
    await sync();
    expect((await sync()).json).toMatchObject({ createdCount: 0, updatedCount: 0, priceChangeCount: 0 });
    expect(await ctx.db.product.count()).toBe(2);

    source.products = [product('p1', 26000)];
    expect((await sync()).json).toMatchObject({ status: 'SUCCEEDED', priceChangeCount: 1, deactivatedCount: 1 });
    const p1 = (await products()).find((p) => p.externalId === 'p1');
    expect(p1.retail.amount).toBe(26000);
    const detail = (await owner.get(`/api/v1/catalog/products/${p1.id}`)).json;
    expect(detail.prices.map((p: any) => [p.amount, p.status])).toEqual([
      [26000, 'OWNER_UNCONFIRMED'],
      [25000, 'SUPERSEDED'],
    ]);
    expect((await products()).find((p) => p.externalId === 'p2').isActive).toBe(false);
  });

  it('holds a mass change until the owner approves it', async () => {
    source.products = Array.from({ length: 10 }, (_, i) => product(`p${i}`, 10000));
    await sync();
    source.products = Array.from({ length: 10 }, (_, i) => product(`p${i}`, i < 5 ? 1 : 10000));
    const held = (await sync()).json;
    expect(held).toMatchObject({ status: 'HELD', priceChangeCount: 5 });
    expect((await products()).every((p) => p.retail.amount === 10000)).toBe(true);
    expect(held.report.priceChanges).toHaveLength(5);

    const applied = (await owner.post(`/api/v1/integrations/firestore/runs/${held.id}/apply`)).json;
    expect(applied.status).toBe('APPLIED_AFTER_HOLD');
    expect((await products()).filter((p) => p.retail.amount === 1)).toHaveLength(5);
    expect(await ctx.db.auditLog.count({ where: { action: 'catalog.held_sync_applied' } })).toBe(1);
  });

  it('an empty source never wipes the catalog', async () => {
    source.products = [product('p1', 100)];
    await sync();
    source.products = [];
    expect((await sync()).json.status).toBe('HELD');
    expect((await products())[0].isActive).toBe(true);
  });

  it('invalid records are reported, valid ones still sync', async () => {
    source.products = [product('p1', 100), { id: 'p2', name: 'Bad', price: 99.5 }, 'junk'];
    const run = (await sync()).json;
    expect(run).toMatchObject({ status: 'SUCCEEDED', createdCount: 1, invalidCount: 2 });
    expect(run.report.invalid).toHaveLength(2);
  });

  it('a failing source marks the integration ERROR and notifies once', async () => {
    source.failWith = new Error('Firestore denied access (HTTP 403)');
    expect((await sync()).json).toMatchObject({ status: 'FAILED', errorMessage: 'Firestore denied access (HTTP 403)' });
    await sync();
    const status = (await owner.get('/api/v1/integrations/firestore')).json;
    expect(status).toMatchObject({ status: 'ERROR', lastError: 'Firestore denied access (HTTP 403)' });
    const notes = (await owner.get('/api/v1/notifications')).json;
    expect(notes.items.filter((n: any) => n.kind === 'catalog.sync_failed')).toHaveLength(1);

    source.failWith = null;
    source.products = [product('p1', 100)];
    await sync();
    const after = (await owner.get('/api/v1/notifications')).json.items as any[];
    expect(after.find((n) => n.kind === 'catalog.sync_failed').readAt).not.toBeNull();
  });

  it('a concurrent sync is refused while the lock is held', async () => {
    await ctx.db.lock.create({
      data: {
        name: 'catalog-sync',
        holder: 'other',
        lockedUntil: new Date(Date.now() + 60_000),
        acquiredAt: new Date(),
      },
    });
    expect((await sync()).status).toBe(409);
  });

  it('owner confirms prices and sets wholesale; website retail cannot be overridden', async () => {
    source.products = [product('p1', 25000)];
    await sync();
    const p1 = (await products())[0];
    expect((await owner.post(`/api/v1/catalog/prices/${p1.retail.id}/confirm`)).json.status).toBe('CONFIRMED');
    expect((await owner.post(`/api/v1/catalog/products/${p1.id}/price`, { type: 'RETAIL', amount: 1 })).status).toBe(
      409,
    );
    expect(
      (await owner.post(`/api/v1/catalog/products/${p1.id}/price`, { type: 'WHOLESALE', amount: 21000.5 })).status,
    ).toBe(400);
    const w = (await owner.post(`/api/v1/catalog/products/${p1.id}/price`, { type: 'WHOLESALE', amount: 21000 })).json;
    expect(w).toMatchObject({ type: 'WHOLESALE', amount: 21000, status: 'CONFIRMED', source: 'OWNER' });
    await owner.post(`/api/v1/catalog/products/${p1.id}/price`, { type: 'WHOLESALE', amount: 20000 });
    const after = (await products())[0];
    expect(after.wholesale.amount).toBe(20000);
    expect(await ctx.db.productPrice.count({ where: { productId: p1.id, priceType: 'WHOLESALE' } })).toBe(2);
  });

  it('seed loads the owner list once and is retired by matching live products', async () => {
    expect((await owner.post('/api/v1/catalog/seed')).json).toEqual({ created: 12 });
    expect((await owner.post('/api/v1/catalog/seed')).status).toBe(409);
    source.products = [{ id: 'lag', name: 'Lag‘mon', gram: 1000, price: 15000 }];
    await sync();
    const list = await products();
    const seedLagmon = list.filter((p) => p.source === 'SEED' && p.name === "LAG'MON");
    expect(seedLagmon.find((p) => p.packageWeightGrams === 1000).isActive).toBe(false);
    expect(seedLagmon.find((p) => p.packageWeightGrams === 500).isActive).toBe(true);
  });

  it('staff cannot manage integrations or prices; not configured is reported honestly', async () => {
    const plain = await makeApp({}, undefined, { catalogSource: null });
    try {
      // The owner already exists in this database (beforeEach); just log in.
      const cl = new Client(plain.app);
      await cl.post('/api/v1/auth/login', { username: 'owner', password: 'Qovun-Termiz-2026' });
      expect((await cl.get('/api/v1/integrations/firestore')).json.status).toBe('NOT_CONFIGURED');
      expect((await cl.post('/api/v1/integrations/firestore/sync')).status).toBe(409);
    } finally {
      await plain.app.close();
      await plain.db.$disconnect();
    }

    const hash = await ctx.db.user.findFirstOrThrow();
    await ctx.db.user.create({
      data: { username: 'staff', displayName: 'Xodim', passwordHash: hash.passwordHash, role: 'STAFF' },
    });
    const staff = new Client(ctx.app);
    await staff.post('/api/v1/auth/login', { username: 'staff', password: 'Qovun-Termiz-2026' });
    expect((await staff.get('/api/v1/catalog/products')).status).toBe(200);
    expect((await staff.get('/api/v1/integrations/firestore')).status).toBe(403);
    expect((await staff.post('/api/v1/catalog/seed')).status).toBe(403);
  });
});
