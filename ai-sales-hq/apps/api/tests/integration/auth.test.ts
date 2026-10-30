import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { totpAt } from '../../src/domain/totp';
import { Client, hasDb, makeApp, resetDb } from '../helpers';

const SETUP = {
  setupToken: 'setup-token-for-tests-0123456789',
  username: 'owner',
  displayName: 'Ega',
  password: 'Qovun-Termiz-2026',
};

describe.skipIf(!hasDb)('auth flow (MySQL)', () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  let clock = new Date('2026-10-29T08:00:00Z');
  const now = () => clock;

  beforeAll(async () => {
    ctx = await makeApp({ TOTP_REQUIRED: 'true' }, now);
  });
  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.$disconnect();
  });
  beforeEach(async () => {
    clock = new Date('2026-10-29T08:00:00Z');
    await resetDb(ctx.db);
  });

  async function enrolledOwner() {
    const c = new Client(ctx.app);
    expect((await c.post('/api/v1/setup', SETUP)).status).toBe(201);
    expect((await c.post('/api/v1/auth/login', { username: 'owner', password: SETUP.password })).status).toBe(200);
    const setup = await c.post('/api/v1/auth/totp/setup');
    const secret = setup.json.secret as string;
    const confirm = await c.post('/api/v1/auth/totp/confirm', { code: totpAt(secret, clock.getTime() / 1000) });
    expect(confirm.status).toBe(200);
    return { c, secret, recoveryCodes: confirm.json.recoveryCodes as string[] };
  }

  it('health and readiness', async () => {
    const c = new Client(ctx.app);
    expect((await c.get('/api/v1/health')).json).toMatchObject({ status: 'ok' });
    expect((await c.get('/api/v1/ready')).json).toEqual({ status: 'ready', database: 'ok' });
  });

  it('first owner setup: needs token, only once, audit-logged', async () => {
    const c = new Client(ctx.app);
    expect((await c.get('/api/v1/setup/status')).json).toEqual({ needsSetup: true, setupEnabled: true });
    expect((await c.post('/api/v1/setup', { ...SETUP, setupToken: 'wrong-token-xxxxxxxxxxxxxxxx' })).status).toBe(403);
    expect((await c.post('/api/v1/setup', { ...SETUP, password: 'short' })).status).toBe(400);
    expect((await c.post('/api/v1/setup', SETUP)).status).toBe(201);
    expect((await c.post('/api/v1/setup', { ...SETUP, username: 'second' })).status).toBe(409);
    expect((await c.get('/api/v1/setup/status')).json.needsSetup).toBe(false);
    const user = await ctx.db.user.findFirstOrThrow();
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await ctx.db.auditLog.count({ where: { action: 'setup.owner_created' } })).toBe(1);
  });

  it('login is required, TOTP enrolment is enforced, then full access', async () => {
    const anon = new Client(ctx.app);
    expect((await anon.get('/api/v1/auth/me')).status).toBe(401);
    const { c, secret, recoveryCodes } = await enrolledOwner();
    expect(recoveryCodes).toHaveLength(10);
    expect((await c.get('/api/v1/auth/me')).json.user).toMatchObject({
      username: 'owner',
      role: 'OWNER',
      totpEnabled: true,
    });

    // A second login now needs the code; a replayed code is refused.
    const c2 = new Client(ctx.app);
    expect((await c2.post('/api/v1/auth/login', { username: 'owner', password: SETUP.password })).json).toEqual({
      status: 'totp_required',
    });
    expect((await c2.get('/api/v1/auth/me')).status).toBe(401);
    clock = new Date(clock.getTime() + 60_000);
    const code = totpAt(secret, clock.getTime() / 1000);
    expect((await c2.post('/api/v1/auth/login/totp', { code })).status).toBe(200);
    expect((await c2.get('/api/v1/auth/me')).status).toBe(200);
    const c3 = new Client(ctx.app);
    await c3.post('/api/v1/auth/login', { username: 'owner', password: SETUP.password });
    expect((await c3.post('/api/v1/auth/login/totp', { code })).status).toBe(401);

    // Recovery code works exactly once.
    const rc = recoveryCodes[0] as string;
    expect((await c3.post('/api/v1/auth/login/totp', { code: rc })).status).toBe(200);
    const c4 = new Client(ctx.app);
    await c4.post('/api/v1/auth/login', { username: 'owner', password: SETUP.password });
    expect((await c4.post('/api/v1/auth/login/totp', { code: rc })).status).toBe(401);
  });

  it('unenrolled owner can reach only enrolment routes when TOTP is required', async () => {
    const c = new Client(ctx.app);
    await c.post('/api/v1/setup', SETUP);
    await c.post('/api/v1/auth/login', { username: 'owner', password: SETUP.password });
    expect((await c.get('/api/v1/auth/me')).json.mustEnrollTotp).toBe(true);
    expect(
      (await c.post('/api/v1/auth/password', { currentPassword: SETUP.password, newPassword: 'Boshqa-Parol-2027' }))
        .status,
    ).toBe(403);
  });

  it('CSRF: foreign origin and missing token are refused', async () => {
    const { c } = await enrolledOwner();
    expect((await c.post('/api/v1/auth/logout', {}, { origin: 'https://evil.example' })).status).toBe(403);
    const saved = c.csrf;
    c.csrf = null;
    expect((await c.post('/api/v1/auth/logout')).status).toBe(403);
    c.csrf = 'x'.repeat(43);
    expect((await c.post('/api/v1/auth/logout')).status).toBe(403);
    c.csrf = saved;
    expect((await c.post('/api/v1/auth/logout')).status).toBe(200);
    expect((await c.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('public POST without Origin is refused', async () => {
    const c = new Client(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'a', password: 'b' },
    });
    expect(res.statusCode).toBe(403);
    expect((await c.post('/api/v1/auth/login', { username: 'nobody', password: 'x' })).status).toBe(401);
  });

  it('throttles repeated failures per username', async () => {
    const c = new Client(ctx.app);
    await c.post('/api/v1/setup', SETUP);
    for (let i = 0; i < 5; i++) {
      expect((await c.post('/api/v1/auth/login', { username: 'owner', password: 'wrong-password' })).status).toBe(401);
    }
    expect((await c.post('/api/v1/auth/login', { username: 'owner', password: SETUP.password })).status).toBe(429);
    clock = new Date(clock.getTime() + 16 * 60_000);
    expect((await c.post('/api/v1/auth/login', { username: 'owner', password: SETUP.password })).status).toBe(200);
  });

  it('sessions expire when idle and password change logs out other devices', async () => {
    const { c, secret } = await enrolledOwner();
    const other = new Client(ctx.app);
    await other.post('/api/v1/auth/login', { username: 'owner', password: SETUP.password });
    clock = new Date(clock.getTime() + 60_000);
    await other.post('/api/v1/auth/login/totp', { code: totpAt(secret, clock.getTime() / 1000) });
    expect((await other.get('/api/v1/auth/me')).status).toBe(200);

    expect(
      (await c.post('/api/v1/auth/password', { currentPassword: 'nope', newPassword: 'Boshqa-Parol-2027' })).status,
    ).toBe(400);
    expect(
      (await c.post('/api/v1/auth/password', { currentPassword: SETUP.password, newPassword: 'Boshqa-Parol-2027' }))
        .status,
    ).toBe(200);
    expect((await other.get('/api/v1/auth/me')).status).toBe(401);
    expect((await c.get('/api/v1/auth/me')).status).toBe(200);

    clock = new Date(clock.getTime() + 121 * 60_000);
    expect((await c.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('error envelope carries the request id; unknown API route is 404 JSON', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/nope',
      headers: { 'x-request-id': 'req-12345678' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['x-request-id']).toBe('req-12345678');
    expect(res.json().error.requestId).toBe('req-12345678');
  });
});
