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
  await db.payment.deleteMany();
  await db.orderEvent.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.aiUsageRecord.deleteMany();
  await db.contactPoint.deleteMany();
  await db.prospectSource.deleteMany();
  await db.prospect.deleteMany();
  await db.suppressionRecord.deleteMany();
  await db.providerUsage.deleteMany();
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
  extra: Partial<Pick<AppDeps, 'catalogSource' | 'telegramApi' | 'places' | 'drafters' | 'ai'>> = {},
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
  stores: unknown[] = [];
  users: unknown[] = [];
  orders: unknown[] = [];
  ledger: unknown[] = [];
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

  async fetchSite() {
    if (this.failWith) throw this.failWith;
    const doc = (v: unknown[]) => ({ value: JSON.stringify(v), updatedAtMs: 1_761_700_000_000 });
    return {
      products: doc(this.products),
      stores: doc(this.stores),
      users: doc(this.users),
      orders: doc(this.orders),
      ledger: doc(this.ledger),
    };
  }

  async fetchStoreList() {
    if (this.failWith) throw this.failWith;
    const doc = (v: unknown[]) => ({ value: JSON.stringify(v), updatedAtMs: null });
    return { stores: doc(this.stores), users: doc(this.users), orders: doc(this.orders) };
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

/** Stand-in for Google Places: returns canned results and counts calls. */
export class FakePlaces {
  results: import('../src/integrations/places').PlaceResult[] = [];
  details_: Map<string, import('../src/integrations/places').PlaceResult> = new Map();
  searches: string[] = [];
  async searchText(query: string) {
    this.searches.push(query);
    return { places: this.results, nextPageToken: null };
  }
  async details(placeId: string) {
    return this.details_.get(placeId) ?? null;
  }
}

/** Deterministic stand-in for the AI drafter; `next` is what the "model" writes. */
export class FakeDrafter {
  readonly provider = 'fake';
  readonly model = 'claude-haiku-5-5';
  next = "Assalomu alaykum! Chuchvara 500 g — 25 000 so'm. Hurmat bilan, Unutilmas Ta'm";
  calls: import('../src/integrations/ai').DraftRequest[] = [];
  failWith: Error | null = null;
  async draft(req: import('../src/integrations/ai').DraftRequest) {
    this.calls.push(req);
    if (this.failWith) throw this.failWith;
    return { text: this.next, language: 'uz' as const, model: this.model, inputTokens: 1000, outputTokens: 200 };
  }
}
