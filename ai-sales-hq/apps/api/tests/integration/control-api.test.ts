import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, FakeTelegram, hasDb, makeApp, ownerClient, resetDb } from '../helpers';

const SECRET = 'webhook-secret-0123456789abcdef';

describe.skipIf(!hasDb)('control center + Telegram API (MySQL)', () => {
  const tg = new FakeTelegram();
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  let owner: Client;

  beforeAll(async () => {
    ctx = await makeApp(
      {
        TELEGRAM_BOT_TOKEN: '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        TELEGRAM_OWNER_CHAT_IDS: '111, 222',
        TELEGRAM_WEBHOOK_SECRET: SECRET,
      },
      () => new Date('2026-10-28T05:00:00Z'),
      { telegramApi: tg, catalogSource: null },
    );
  });
  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(ctx.db);
    tg.calls = [];
    tg.failWith = null;
    owner = await ownerClient(ctx.app);
  });

  const webhook = (body: object, secret = SECRET) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/telegram/webhook',
      payload: body,
      headers: { 'x-telegram-bot-api-secret-token': secret },
    });

  it('overview lists six agents with allowed actions and an unhealthy worker', async () => {
    const o = (await owner.get('/api/v1/control/overview')).json;
    expect(o.agents).toHaveLength(6);
    const director = o.agents.find((a: any) => a.key === 'director');
    expect(director).toMatchObject({ state: 'DRAFT', available: true, allowedActions: ['activate'] });
    expect(o.agents.find((a: any) => a.key === 'sales')).toMatchObject({ available: false, allowedActions: [] });
    expect(o.worker).toMatchObject({ healthy: false, lastRunAt: null });
  });

  it('owner commands change persisted state; staff may only look', async () => {
    expect((await owner.post('/api/v1/agents/director/activate')).json).toEqual({ key: 'director', state: 'STOPPED' });
    expect((await owner.post('/api/v1/agents/director/start')).json.state).toBe('RUNNING');
    expect((await owner.post('/api/v1/agents/director/disable')).status).toBe(409);
    expect((await owner.post('/api/v1/agents/nobody/start')).status).toBe(400);
    const set = await owner.post('/api/v1/agents/director/settings', {
      workingDays: [1, 2, 3],
      startTime: '08:00',
      endTime: '17:30',
      dailyTaskLimit: 50,
    });
    expect(set.status).toBe(200);
    const bad = await owner.post('/api/v1/agents/director/settings', {
      workingDays: [],
      startTime: '8',
      endTime: 'x',
      dailyTaskLimit: 0,
    });
    expect(bad.status).toBe(400);
    const history = (await owner.get('/api/v1/agents/director/history')).json.items;
    expect(history.map((h: any) => h.action)).toEqual(['agent.settings', 'agent.transition', 'agent.transition']);

    const user = await ctx.db.user.findFirstOrThrow();
    await ctx.db.user.create({
      data: { username: 'staff', displayName: 'X', passwordHash: user.passwordHash, role: 'STAFF' },
    });
    const staff = new Client(ctx.app);
    await staff.post('/api/v1/auth/login', { username: 'staff', password: 'Qovun-Termiz-2026' });
    expect((await staff.get('/api/v1/control/overview')).status).toBe(200);
    expect((await staff.post('/api/v1/agents/director/stop')).status).toBe(403);
    expect((await staff.post('/api/v1/control/stop-all')).status).toBe(403);
  });

  it('webhook: wrong secret 401, strangers ignored, owner gets /status and /stop_all', async () => {
    expect(
      (await webhook({ message: { chat: { id: 111 }, text: '/status' } }, 'wrong-secret-xxxxxxxxxxxxxxx')).statusCode,
    ).toBe(401);
    expect((await webhook({ message: { chat: { id: 999 }, text: '/stop_all' } })).json()).toEqual({ ok: true });

    await owner.get('/api/v1/control/overview');
    await owner.post('/api/v1/agents/director/activate');
    await owner.post('/api/v1/agents/director/start');
    const status = (await webhook({ message: { chat: { id: 111 }, text: '/status' } })).json();
    expect(status).toMatchObject({ method: 'sendMessage', chat_id: 111 });
    expect(status.text).toContain('Direktor: ishlayapti');

    const stop = (await webhook({ message: { chat: { id: 222 }, text: '/stop_all@ut_bot' } })).json();
    expect(stop.text).toContain('1 ta agent');
    expect((await ctx.db.agent.findUniqueOrThrow({ where: { key: 'director' } })).state).toBe('STOPPED');
    const audit = await ctx.db.auditLog.findFirstOrThrow({ where: { action: 'agents.stop_all' } });
    expect(audit).toMatchObject({ actorType: 'system', actorId: 'telegram:222' });
  });

  it('telegram test sets CONNECTED only after a real call; failure -> ERROR', async () => {
    expect((await owner.get('/api/v1/integrations/telegram')).json.status).toBe('CONFIGURED');
    expect((await owner.post('/api/v1/integrations/telegram/test')).json).toEqual({ ok: true, bot: 'ut_shtab_bot' });
    expect(tg.calls.filter((c) => c.method === 'sendMessage').map((c) => c.body.chat_id)).toEqual(['111', '222']);
    expect((await owner.get('/api/v1/integrations/telegram')).json.status).toBe('CONNECTED');
    tg.failWith = new Error('Telegram getMe failed: Unauthorized');
    expect((await owner.post('/api/v1/integrations/telegram/test')).status).toBe(502);
    expect((await owner.get('/api/v1/integrations/telegram')).json).toMatchObject({ status: 'ERROR' });
  });

  it('setWebhook registers the HTTPS endpoint with the secret', async () => {
    tg.failWith = null;
    const res = (await owner.post('/api/v1/integrations/telegram/webhook')).json;
    expect(res.url).toBe('http://localhost:3000/api/v1/telegram/webhook');
    expect(tg.calls.at(-1)).toMatchObject({ method: 'setWebhook', body: { secret_token: SECRET } });
  });
});
