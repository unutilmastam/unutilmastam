import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { can, type Permission } from '../../src/domain/permissions';
import { Client, hasDb, makeApp, ORIGIN, ownerClient, resetDb } from '../helpers';

// MASTER_SPEC §19 security tests: a permission matrix over EVERY registered API route, so a new
// route that forgets its access rule fails here.
describe.skipIf(!hasDb)('security: route permission matrix, CSRF, headers (MySQL)', () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  let owner: Client;
  let staff: Client;

  beforeAll(async () => {
    ctx = await makeApp({}, undefined, { catalogSource: null });
    await resetDb(ctx.db);
    owner = await ownerClient(ctx.app);
    const user = await ctx.db.user.findFirstOrThrow();
    await ctx.db.user.create({
      data: { username: 'staff', displayName: 'X', passwordHash: user.passwordHash, role: 'STAFF' },
    });
    staff = new Client(ctx.app);
    await staff.post('/api/v1/auth/login', { username: 'staff', password: 'Qovun-Termiz-2026' });
  });
  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.$disconnect();
  });

  const api = () => ctx.app.routeTable.filter((r) => r.url.startsWith('/api/v1/'));
  const concrete = (url: string) =>
    url
      .replace(':key', 'director')
      .replace(':action', 'start')
      .replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000');

  it('every route declares its access; only the account self-service routes are plain "session"', () => {
    expect(api().length).toBeGreaterThan(60);
    const session = api()
      .filter((r) => r.access === 'session')
      .map((r) => `${r.method} ${r.url}`)
      .sort();
    expect(session).toEqual([
      'GET /api/v1/auth/me',
      'POST /api/v1/auth/logout',
      'POST /api/v1/auth/password',
      'POST /api/v1/auth/totp/confirm',
      'POST /api/v1/auth/totp/setup',
    ]);
    const publicRoutes = api()
      .filter((r) => r.access === 'public' || r.access === 'webhook')
      .map((r) => `${r.method} ${r.url}`)
      .sort();
    expect(publicRoutes).toEqual([
      'GET /api/v1/health',
      'GET /api/v1/ready',
      'GET /api/v1/setup/status',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/login/totp',
      'POST /api/v1/setup',
      'POST /api/v1/telegram/webhook',
    ]);
  });

  it('anonymous callers get 401 on every private route', async () => {
    const failures: string[] = [];
    for (const r of api().filter((x) => x.access !== 'public' && x.access !== 'webhook')) {
      const res = await ctx.app.inject({
        method: r.method as 'GET' | 'POST',
        url: concrete(r.url),
        headers: { origin: ORIGIN },
        payload: r.method === 'POST' ? {} : undefined,
      });
      if (res.statusCode !== 401) failures.push(`${r.method} ${r.url} -> ${res.statusCode}`);
    }
    expect(failures).toEqual([]);
  });

  it('staff get 403 on every owner-only route, before any handler runs', async () => {
    const ownerOnly = api().filter(
      (r) => !['public', 'webhook', 'session'].includes(r.access) && !can('STAFF', r.access as Permission),
    );
    expect(ownerOnly.length).toBeGreaterThan(20);
    const failures: string[] = [];
    for (const r of ownerOnly) {
      const res = await staff.request(
        r.method as 'GET' | 'POST',
        concrete(r.url),
        r.method === 'POST' ? {} : undefined,
      );
      if (res.status !== 403) failures.push(`${r.method} ${r.url} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('state-changing requests need the CSRF header and our own origin', async () => {
    const noToken = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
      headers: { origin: ORIGIN, cookie: [...owner.cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
      payload: {},
    });
    expect(noToken.statusCode).toBe(403);
    const foreign = await owner.post('/api/v1/notifications/read-all', {}, { origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    expect((await owner.post('/api/v1/notifications/read-all', {})).status).toBe(200);
  });

  it('security headers and an error envelope without internals', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' });
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    // HSTS is production-only (app.ts); outside production it must stay off so plain-http dev works.
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeDefined();
    // Anonymous callers cannot probe which API paths exist.
    const probe = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(probe.statusCode).toBe(401);
    const missing = await owner.get('/api/v1/nope');
    expect(missing.status).toBe(404);
    expect(Object.keys((missing.json as { error: object }).error).sort()).toEqual(['code', 'message', 'requestId']);
    expect(missing.res.body).not.toMatch(/stack|at .*\.ts/);
  });
});
