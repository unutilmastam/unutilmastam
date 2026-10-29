import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Client, FakeCatalogSource, hasDb, makeApp, ownerClient, resetDb } from '../helpers';

describe.skipIf(!hasDb)('dashboard + office (MySQL)', () => {
  const source = new FakeCatalogSource();
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  let owner: Client;
  beforeAll(async () => {
    ctx = await makeApp({}, () => new Date('2026-10-28T05:00:00Z'), { catalogSource: source });
  });
  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(ctx.db);
    owner = await ownerClient(ctx.app);
  });

  it('reports real counts and null for modules that do not exist yet', async () => {
    source.products = [{ id: 'p1', name: 'A', price: 100 }];
    await owner.post('/api/v1/integrations/firestore/sync');
    await owner.post('/api/v1/agents/director/activate');
    await owner.post('/api/v1/agents/director/start');
    const d = (await owner.get('/api/v1/dashboard')).json;
    expect(d.agents).toMatchObject({ running: 1, stopped: 5, error: 0 });
    expect(d.attention).toMatchObject({ unconfirmedPrices: 1, heldSync: false, failedJobsToday: 0 });
    expect(d.integrations).toEqual({ website: 'CONNECTED', telegram: 'NOT_CONFIGURED', ai: 'NOT_CONFIGURED' });
    expect(d.lastSuccessfulSyncAt).not.toBeNull();
    expect(d.prospects).toEqual({ newToday: 0, qualified: 0, needsReview: 0, total: 0 });
    expect(d.conversations).toEqual({ active: 0, needsOwner: 0 });
    expect(d.orders).toEqual({ awaitingReview: 0, draftValue: 0, approvedValue: 0, deliveredValue: 0, paidSom: 0 });
  });

  it('office shows the director idle (running, no work) and others absent', async () => {
    await owner.post('/api/v1/agents/director/activate');
    await owner.post('/api/v1/agents/director/start');
    const o = (await owner.get('/api/v1/office')).json;
    expect(o.agents.find((a: any) => a.key === 'director')).toMatchObject({ room: 'director', pose: 'idle' });
    expect(o.agents.filter((a: any) => a.pose === 'absent')).toHaveLength(5);
  });
});
