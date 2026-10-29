import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { createDb } from '../../src/lib/db';
import { AgentService } from '../../src/modules/agents/service';
import { TelegramService } from '../../src/modules/telegram/service';
import { createWorker } from '../../src/worker/setup';
import { type Client, FakeDrafter, hasDb, makeApp, ownerClient, resetDb } from '../helpers';

describe.skipIf(!hasDb)('sales workflow, assisted manual (MySQL)', () => {
  const fast = new FakeDrafter();
  let clock = new Date('2026-10-28T05:00:00Z');
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  let owner: Client;

  beforeAll(async () => {
    ctx = await makeApp({}, () => clock, { drafters: { fast, strong: fast }, catalogSource: null });
  });
  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(ctx.db);
    clock = new Date('2026-10-28T05:00:00Z');
    fast.calls = [];
    fast.failWith = null;
    fast.next = "Assalomu alaykum! Chuchvara 500 g — 25 000 so'm. Hurmat bilan, Unutilmas Ta'm";
    owner = await ownerClient(ctx.app);
    // Catalog: seed, confirm the CHUCHVARA 500 g retail price only.
    await owner.post('/api/v1/catalog/seed');
    const products = (await owner.get('/api/v1/catalog/products')).json.products as any[];
    const ch = products.find((p) => p.name === 'CHUCHVARA' && p.packageWeightGrams === 500);
    await owner.post(`/api/v1/catalog/prices/${ch.retail.id}/confirm`);
  });

  let n = 0;
  async function qualifiedProspect(phone = '901234567', name = `Supermarket ${'ABCDEFGH'[n++ % 8]}`) {
    const r = (await owner.post('/api/v1/prospects', { name, phone, address: 'Termiz' })).json;
    const d = (await owner.get(`/api/v1/prospects/${r.prospectId}`)).json;
    await owner.post(`/api/v1/contacts/${d.contacts[0].id}/verify`);
    return r.prospectId as string;
  }

  it('AI draft uses only confirmed prices and masks nothing it does not need; usage and cost recorded', async () => {
    const id = await qualifiedProspect();
    const m = (await owner.post(`/api/v1/prospects/${id}/draft`, {})).json;
    expect(m).toMatchObject({ status: 'DRAFT', generatedBy: 'claude-haiku-5-5', direction: 'OUTBOUND' });
    expect(fast.calls[0]?.productLines).toEqual(["CHUCHVARA 500 g — chakana 25 000 so'm"]);
    expect(JSON.stringify(fast.calls[0])).not.toContain('901234567');
    expect((await owner.get(`/api/v1/prospects/${id}`)).json.stage).toBe('CONTACT_PENDING');
    const usage = await ctx.db.aiUsageRecord.findFirstOrThrow();
    expect(usage).toMatchObject({
      purpose: 'outreach',
      inputTokens: 1000,
      outputTokens: 200,
      costMicroUsd: 200n,
      ok: true,
    });
    // Idempotent: one open draft per prospect.
    expect((await owner.post(`/api/v1/prospects/${id}/draft`, {})).json.id).toBe(m.id);
  });

  it('a draft that invents a price or a discount cannot be sent until edited', async () => {
    const id = await qualifiedProspect();
    fast.next = "Chuchvara 20 000 so'm, birinchi buyurtmaga 10% chegirma!";
    const m = (await owner.post(`/api/v1/prospects/${id}/draft`, {})).json;
    expect(m.status).toBe('NEEDS_EDIT');
    expect(m.checks.map((c: any) => c.code).sort()).toEqual(['discount', 'unknown_price']);
    expect((await owner.post(`/api/v1/messages/${m.id}/sent`, { channel: 'SMS' })).status).toBe(409);
    const fixed = (
      await owner.post(`/api/v1/messages/${m.id}/edit`, { body: "Chuchvara 500 g — 25 000 so'm. Unutilmas Ta'm" })
    ).json;
    expect(fixed.status).toBe('DRAFT');
    expect((await owner.post(`/api/v1/messages/${m.id}/sent`, { channel: 'SMS' })).status).toBe(200);
    expect((await owner.get(`/api/v1/prospects/${id}`)).json.stage).toBe('CONTACTED');
  });

  it('without an AI provider (or when it fails) the template is used', async () => {
    const id = await qualifiedProspect();
    fast.failWith = new Error('overloaded');
    const m = (await owner.post(`/api/v1/prospects/${id}/draft`, {})).json;
    expect(m).toMatchObject({ status: 'DRAFT', generatedBy: 'template' });
    expect(m.body).toContain("CHUCHVARA 500 g — chakana 25 000 so'm");
    expect((await owner.get('/api/v1/integrations/ai')).json).toMatchObject({ status: 'NOT_CONFIGURED' }); // no key in test config
    expect(await ctx.db.aiUsageRecord.count({ where: { ok: false } })).toBe(1);
  });

  it('cooldown and do-not-contact are enforced on every manual channel', async () => {
    const id = await qualifiedProspect();
    const m = (await owner.post(`/api/v1/prospects/${id}/draft`, {})).json;
    await owner.post(`/api/v1/messages/${m.id}/sent`, { channel: 'PHONE_CALL' });
    const again = await owner.post(`/api/v1/prospects/${id}/draft`, {});
    expect(again.status).toBe(409);
    expect(again.json.error.message).toMatch(/7 kundan keyin/);

    const id2 = await qualifiedProspect('935556677');
    const m2 = (await owner.post(`/api/v1/prospects/${id2}/draft`, {})).json;
    await owner.post(`/api/v1/prospects/${id2}/stage`, { to: 'DO_NOT_CONTACT' });
    expect((await owner.post(`/api/v1/messages/${m2.id}/sent`, { channel: 'TELEGRAM' })).status).toBe(409);
    expect((await owner.post(`/api/v1/prospects/${id2}/draft`, {})).status).toBe(409);
  });

  it('inbound price question -> owner decision; reply draft never negotiates', async () => {
    const id = await qualifiedProspect();
    const m = (await owner.post(`/api/v1/prospects/${id}/draft`, {})).json;
    await owner.post(`/api/v1/messages/${m.id}/sent`, { channel: 'TELEGRAM' });
    clock = new Date(clock.getTime() + 60_000);
    const r = (
      await owner.post(`/api/v1/prospects/${id}/inbound`, { body: 'Optom olsak chegirma bormi?', channel: 'TELEGRAM' })
    ).json;
    expect(r).toEqual({ needsOwner: true });
    const reply = (await owner.post(`/api/v1/prospects/${id}/reply-draft`, {})).json;
    expect(reply).toMatchObject({ generatedBy: 'template', status: 'DRAFT' });
    expect(reply.body).toContain("rahbarimiz o'zi");
    expect(fast.calls.filter((c) => c.purpose === 'reply')).toHaveLength(0);
    const desk = (await owner.get('/api/v1/outreach')).json;
    expect(desk.needsOwner).toHaveLength(1);
    expect(await ctx.db.notification.count({ where: { kind: 'sales.needs_owner' } })).toBe(1);

    clock = new Date(clock.getTime() + 60_000); // the second reply arrives a minute later
    await owner.post(`/api/v1/prospects/${id}/inbound`, {
      body: 'Rahmat, qanday mahsulotlar bor?',
      channel: 'TELEGRAM',
    });
    const reply2 = (await owner.post(`/api/v1/prospects/${id}/reply-draft`, {})).json;
    expect(reply2.generatedBy).toBe('claude-haiku-5-5');
    expect(fast.calls.at(-1)?.history?.map((h) => h.direction)).toEqual(['OUTBOUND', 'INBOUND', 'INBOUND']);
  });

  it('outcomes move the pipeline and set follow-ups', async () => {
    const id = await qualifiedProspect();
    const m = (await owner.post(`/api/v1/prospects/${id}/draft`, {})).json;
    await owner.post(`/api/v1/messages/${m.id}/sent`, { channel: 'PHONE_CALL' });
    await owner.post(`/api/v1/prospects/${id}/outcome`, { outcome: 'NO_ANSWER' });
    const conv = await ctx.db.conversation.findFirstOrThrow();
    expect(conv.followUpAt?.toISOString()).toBe('2026-10-30T05:00:00.000Z');
    await owner.post(`/api/v1/prospects/${id}/outcome`, { outcome: 'INTERESTED' });
    expect((await owner.get(`/api/v1/prospects/${id}`)).json.stage).toBe('INTERESTED');
    expect((await ctx.db.conversation.findFirstOrThrow()).followUpAt).toBeNull();
    await owner.post(`/api/v1/prospects/${id}/outcome`, { outcome: 'NOT_INTERESTED' });
    expect((await owner.get(`/api/v1/prospects/${id}`)).json.stage).toBe('LOST');
  });

  it('worker: communication agent drafts for qualified prospects; budget exhaustion pauses it', async () => {
    const config = loadConfig({ ...process.env });
    const db = createDb(config.DATABASE_URL);
    const agents = new AgentService(db, () => clock);
    const worker = createWorker({
      db,
      config,
      getSource: () => null,
      telegram: new TelegramService(db, config, null, agents, () => clock),
      drafters: { fast, strong: fast },
      now: () => clock,
    });
    try {
      await qualifiedProspect();
      await qualifiedProspect('935550011');
      await agents.command('communication', 'activate', { type: 'user', id: 'o' });
      await agents.command('communication', 'start', { type: 'user', id: 'o' });
      // Budget below one call's cost after the first draft: 0.0001 $ = 100 micro-USD < 200.
      await owner.post('/api/v1/sales/settings', {
        cooldownDays: 7,
        dailyDraftLimit: 20,
        signature: "Unutilmas Ta'm",
        language: 'uz',
        aiEnabled: true,
        aiDailyBudgetUsd: 0.0001,
      });
      await worker.tick({ budgetMs: 8000 });
      expect(await db.message.count({ where: { direction: 'OUTBOUND' } })).toBe(1);
      const agent = await db.agent.findUniqueOrThrow({ where: { key: 'communication' } });
      expect(agent).toMatchObject({ state: 'PAUSED', stateReason: 'BUDGET_EXCEEDED' });
      expect(await db.job.count({ where: { type: 'outreach.draft', status: 'QUEUED' } })).toBe(1);
    } finally {
      await db.$disconnect();
    }
  });
});
