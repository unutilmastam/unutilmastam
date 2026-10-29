import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/lib/db';

export const hasDb = !!process.env.TEST_DATABASE_URL;
export const ORIGIN = 'http://localhost:3000';

/**
 * Empties all tables in foreign-key order. (SET FOREIGN_KEY_CHECKS + TRUNCATE is unsafe here:
 * the pool may run the two statements on different connections.)
 */
export async function resetDb(db: Db): Promise<void> {
  await db.totpRecoveryCode.deleteMany();
  await db.session.deleteMany();
  await db.loginAttempt.deleteMany();
  await db.auditLog.deleteMany();
  await db.user.deleteMany();
}

export async function makeApp(overrides: Record<string, string> = {}, now?: () => Date) {
  const config = loadConfig({ ...process.env, ...overrides });
  const db = createDb(config.DATABASE_URL);
  const app = await buildApp({ config, db, logger: false, now });
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
