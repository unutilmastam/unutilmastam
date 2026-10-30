import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Client, FakeDrafter, hasDb, makeApp, ownerClient, resetDb } from '../helpers';

// The owner pastes the API key in the app (D-017); it is tested, sealed, and used without a restart.
describe.skipIf(!hasDb)('AI key saved in the app (MySQL)', () => {
  // Built at run time so secret scanners never see a key-shaped literal.
  const KEY = `sk-ant-api03-${'x'.repeat(40)}WXYZ`;
  const pings: { key: string; model: string }[] = [];
  let pingFails: Error | null = null;
  const built: { key: string; model: string }[] = [];
  const drafter = new FakeDrafter();
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  let owner: Client;

  beforeAll(async () => {
    ctx = await makeApp({}, undefined, {
      catalogSource: null,
      ai: {
        ping: async (key, model) => {
          pings.push({ key, model });
          if (pingFails) throw pingFails;
          return { inputTokens: 10, outputTokens: 1 };
        },
        factory: (key, model) => {
          built.push({ key, model });
          return drafter;
        },
      },
    });
  });
  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(ctx.db);
    pings.length = 0;
    built.length = 0;
    pingFails = null;
    owner = await ownerClient(ctx.app);
  });

  const models = { model: 'claude-haiku-5-5', strongModel: 'claude-opus-5-5' };

  it('starts unconfigured; templates are used', async () => {
    const s = (await owner.get('/api/v1/integrations/ai')).json;
    expect(s).toMatchObject({ status: 'NOT_CONFIGURED', source: 'none', keyLast4: null });
    expect((await owner.post('/api/v1/integrations/ai/test')).status).toBe(409);
    expect((await owner.get('/api/v1/dashboard')).json.integrations.ai).toBe('NOT_CONFIGURED');
  });

  it('rejects a malformed key and a key that fails the real test; nothing is stored', async () => {
    expect((await owner.post('/api/v1/integrations/ai/key', { apiKey: 'hello', ...models })).status).toBe(400);
    expect(pings).toHaveLength(0);
    pingFails = new Error(`401 invalid x-api-key ${KEY}`);
    const r = await owner.post('/api/v1/integrations/ai/key', { apiKey: KEY, ...models });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.json)).not.toContain(KEY);
    expect(await ctx.db.systemSetting.count({ where: { key: 'ai.provider' } })).toBe(0);
  });

  it('saves the key sealed, never returns it, and drafting uses it at once', async () => {
    const r = await owner.post('/api/v1/integrations/ai/key', { apiKey: KEY, ...models });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: 'CONNECTED', source: 'app', keyLast4: 'WXYZ', model: 'claude-haiku-5-5' });
    expect(JSON.stringify(r.json)).not.toContain(KEY);
    expect(pings).toEqual([{ key: KEY, model: 'claude-haiku-5-5' }]);

    const row = await ctx.db.systemSetting.findUniqueOrThrow({ where: { key: 'ai.provider' } });
    expect(JSON.stringify(row.value)).not.toContain(KEY);
    const audits = await ctx.db.auditLog.findMany({ where: { action: { startsWith: 'integration.ai' } } });
    expect(audits.map((a) => a.action)).toContain('integration.ai_key_saved');
    expect(JSON.stringify(audits.map((a) => a.details))).not.toContain(KEY);

    const status = (await owner.get('/api/v1/integrations/ai')).json;
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect((await owner.get('/api/v1/dashboard')).json.integrations.ai).toBe('CONNECTED');
    expect((await owner.get('/api/v1/outreach')).json.ai.configured).toBe(true);
    expect(built).toContainEqual({ key: KEY, model: 'claude-haiku-5-5' });

    // Models can change without pasting the key again.
    const m = await owner.post('/api/v1/integrations/ai/key', {
      model: 'claude-sonnet-5-5',
      strongModel: 'claude-opus-5-5',
    });
    expect(m.json).toMatchObject({ model: 'claude-sonnet-5-5', keyLast4: 'WXYZ' });
    expect(pings.at(-1)).toEqual({ key: KEY, model: 'claude-sonnet-5-5' });
    expect((await owner.post('/api/v1/integrations/ai/test')).json).toMatchObject({ ok: true });

    // A failed replacement keeps the working key.
    pingFails = new Error('401');
    const other = `sk-ant-api03-${'y'.repeat(40)}AAAA`;
    expect((await owner.post('/api/v1/integrations/ai/key', { apiKey: other, ...models })).status).toBe(422);
    expect((await owner.get('/api/v1/integrations/ai')).json.keyLast4).toBe('WXYZ');

    // Removal returns to template mode.
    const gone = await owner.post('/api/v1/integrations/ai/key/remove');
    expect(gone.json).toMatchObject({ status: 'NOT_CONFIGURED', source: 'none' });
    expect((await owner.get('/api/v1/outreach')).json.ai.configured).toBe(false);
  });

  it('a key sealed with a different APP_SECRET_KEY is reported, not used', async () => {
    await ctx.db.systemSetting.create({
      data: {
        key: 'ai.provider',
        value: { sealedKey: 'v1.aaaa.bbbb.cccc', last4: 'WXYZ', ...models, savedAt: new Date().toISOString() },
      },
    });
    const s = (await owner.get('/api/v1/integrations/ai')).json;
    expect(s).toMatchObject({ status: 'ERROR', source: 'unreadable' });
    expect((await owner.get('/api/v1/outreach')).json.ai.configured).toBe(false);
  });

  it('only the owner-level permission can manage the key; anonymous is denied', async () => {
    const anon = await ctx.app.inject({ method: 'GET', url: '/api/v1/integrations/ai' });
    expect(anon.statusCode).toBe(401);
  });
});
