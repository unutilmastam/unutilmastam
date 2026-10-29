import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { type AppDeps, buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/lib/db';

export const hasDb = !!process.env.TEST_DATABASE_URL;
export const ORIGIN = 'http://localhost:3000';

/**
 * Empties all tables in foreign-key order. (SET FOREIGN_KEY_CHECKS + TRUNCATE is unsafe here:
 * the pool may run the two statements on different connections.)
 */
export async function resetDb(db: Db): Promise<void> {
  await db.jobEvent.deleteMany();
  await db.job.deleteMany();
  await db.workerRun.deleteMany();
  await db.agent.deleteMany();
  await db.productPrice.deleteMany();
  await db.product.deleteMany();
  await db.productSyncRun.deleteMany();
  await db.integration.deleteMany();
  await db.notification.deleteMany();
  await db.systemSetting.deleteMany();
  await db.lock.deleteMany();
  await db.totpRecoveryCode.deleteMany();
  await db.session.deleteMany();
  await db.loginAttempt.deleteMany();
  await db.auditLog.deleteMany();
  await db.user.deleteMany();
}

export async function makeApp(
  overrides: Record<string, string> = {},
  now?: () => Date,
  extra: Partial<Pick<AppDeps, 'catalogSource' | 'telegramApi'>> = {},
) {
  const config = loadConfig({ ...process.env, ...overrides });
  const db = createDb(config.DATABASE_URL);
  const app = await buildApp({ config, db, logger: false, now, ...extra });
  return { app, db, config };
}

/** Minimal cookie jar + CSRF-aware client around app.inject. */
export class Client {
  cookies = new Map<string, string>();
  csrf: string | null = null;

  constructor(private readonly app: FastifyInstance) {}

  async request(method: 'GET' | 'POST', url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method,
      url,
      payload: body as object | undefined,
      headers: {
        origin: ORIGIN,
        ...(this.csrf ? { 'x-csrf-token': this.csrf } : {}),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
    });
    this.#store(res);
    const json = res.body ? safeJson(res.body) : null;
    if (json && typeof json.csrfToken === 'string') this.csrf = json.csrfToken;
    return { status: res.statusCode, json, res };
  }

  get = (url: string) => this.request('GET', url);
  post = (url: string, body?: unknown, headers?: Record<string, string>) =>
    this.request('POST', url, body ?? {}, headers);

  #store(res: LightMyRequestResponse) {
    for (const c of res.cookies) {
      if (
        c.value === '' ||
        (c.maxAge !== undefined && c.maxAge <= 0) ||
        (c.expires && c.expires.getTime() < Date.now())
      ) {
        this.cookies.delete(c.name);
      } else this.cookies.set(c.name, c.value);
    }
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Signs up the owner (no TOTP required in these tests) and returns a logged-in client. */
export async function ownerClient(app: FastifyInstance): Promise<Client> {
  const c = new Client(app);
  await c.post('/api/v1/setup', {
    setupToken: 'setup-token-for-tests-0123456789',
    username: 'owner',
    displayName: 'Ega',
    password: 'Qovun-Termiz-2026',
  });
  const res = await c.post('/api/v1/auth/login', { username: 'owner', password: 'Qovun-Termiz-2026' });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return c;
}

/** In-memory stand-in for the Firestore catalog (never touches the network). */
export class FakeCatalogSource {
  readonly name = 'fake';
  products: unknown[] = [];
  categories: unknown[] = [];
  failWith: Error | null = null;
  calls = 0;

  async fetchCatalog() {
    this.calls++;
    if (this.failWith) throw this.failWith;
    return {
      products: { value: JSON.stringify(this.products), updatedAtMs: 1_761_700_000_000 },
      categories: { value: JSON.stringify(this.categories), updatedAtMs: null },
    };
  }
}

/** Records Telegram Bot API calls instead of sending them. */
export class FakeTelegram {
  calls: { method: string; body: Record<string, unknown> }[] = [];
  failWith: Error | null = null;
  async call<T>(method: string, body: object): Promise<T> {
    if (this.failWith) throw this.failWith;
    this.calls.push({ method, body: body as Record<string, unknown> });
    return (method === 'getMe' ? { username: 'ut_shtab_bot' } : true) as T;
  }
}
