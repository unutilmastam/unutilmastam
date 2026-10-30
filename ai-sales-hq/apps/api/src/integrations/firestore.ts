import { createSign } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

// Read-only access to the PWA's Firestore over the REST API with a service account
// (docs/DECISIONS.md D-004, D-012). Only GET requests are ever made.

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface FirestoreDocument {
  // The PWA stores each state key as {v: JSON string, t: client timestamp ms}. Since v14.5 a key
  // longer than 300 000 characters is split: app/<key> = {c: parts, t, len} and
  // app/<key>__p0..N-1 = {v: piece, t}; it is reassembled here (D-019).
  value: string | null;
  updatedAtMs: number | null;
}

export interface CatalogSnapshot {
  products: FirestoreDocument;
  categories: FirestoreDocument;
}

export interface StoreListSnapshot {
  stores: FirestoreDocument;
  users: FirestoreDocument;
  orders: FirestoreDocument;
}

/** Everything the "website today" overview reads (counts and business data only). */
export interface SiteSnapshot extends StoreListSnapshot {
  products: FirestoreDocument;
  ledger: FirestoreDocument;
}

export interface CatalogSource {
  readonly name: string;
  fetchCatalog(): Promise<CatalogSnapshot>;
  // Existing store list for discovery (A4 source 1). Same read-only access.
  fetchStoreList(): Promise<StoreListSnapshot>;
  // Live overview of the website for the owner (never stored).
  fetchSite?(): Promise<SiteSnapshot>;
}

export class FirestoreError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'not_found' | 'network' | 'response',
  ) {
    super(message);
  }
}

type FetchFn = typeof fetch;

const SCOPE = 'https://www.googleapis.com/auth/datastore';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function loadServiceAccount(path: string): ServiceAccount {
  const st = statSync(path);
  if ((st.mode & 0o004) !== 0) {
    throw new FirestoreError('Service account file is world-readable; set permissions to 600', 'auth');
  }
  const json = JSON.parse(readFileSync(path, 'utf8')) as Partial<ServiceAccount> & { type?: string };
  if (json.type !== 'service_account' || !json.client_email || !json.private_key || !json.project_id) {
    throw new FirestoreError('File is not a Google service account key', 'auth');
  }
  return { project_id: json.project_id, client_email: json.client_email, private_key: json.private_key };
}

export function signJwt(sa: ServiceAccount, nowSeconds: number): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = enc({ alg: 'RS256', typ: 'JWT' });
  const claims = enc({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(sa.private_key).toString('base64url')}`;
}

/** Firestore REST field value -> JS (only the shapes the PWA writes). */
export function decodeDocument(doc: unknown): FirestoreDocument {
  const { value, t } = decodeFields(doc);
  return { value, updatedAtMs: t };
}

export const MAX_PARTS = 64;
const PART_SEP = '__p';

/** Raw fields of an `app/*` document: a value, or the part count of a split one. */
export function decodeFields(doc: unknown): { value: string | null; t: number | null; parts: number | null } {
  const fields = (doc as { fields?: Record<string, Record<string, unknown>> })?.fields ?? {};
  const num = (f: Record<string, unknown> | undefined) => {
    const n = f?.integerValue ?? f?.doubleValue;
    return n !== undefined && Number.isFinite(Number(n)) ? Number(n) : null;
  };
  const v = fields.v?.stringValue;
  const c = num(fields.c);
  return {
    value: typeof v === 'string' ? v : null,
    t: num(fields.t),
    parts: typeof v !== 'string' && c !== null && Number.isInteger(c) && c > 0 ? c : null,
  };
}

/**
 * Joins the pieces of a split key exactly like the PWA does (js/2-sync.js tryAssemble): every
 * piece must carry the meta document's timestamp, otherwise a write is in progress and the
 * read is refused rather than mixing two versions.
 */
export function assembleParts(
  key: string,
  meta: { parts: number; t: number | null },
  pieces: { value: string | null; t: number | null }[],
): string {
  if (meta.parts > MAX_PARTS) throw new FirestoreError(`app/${key}: too many parts (${meta.parts})`, 'response');
  if (pieces.length !== meta.parts || pieces.some((p) => p.value === null || p.t !== meta.t)) {
    throw new FirestoreError(`app/${key}: parts do not match (the website is saving); try again`, 'response');
  }
  return pieces.map((p) => p.value).join('');
}

export class FirestoreCatalogSource implements CatalogSource {
  readonly name = 'firestore';
  #token: { value: string; expiresAt: number } | null = null;
  #pending: Promise<string> | null = null;

  constructor(
    private readonly sa: ServiceAccount,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async #accessToken(): Promise<string> {
    if (this.#token && this.#token.expiresAt > this.now() + 60_000) return this.#token.value;
    // Parallel document reads share one token exchange.
    this.#pending ??= this.#exchangeToken().finally(() => {
      this.#pending = null;
    });
    return this.#pending;
  }

  async #exchangeToken(): Promise<string> {
    const assertion = signJwt(this.sa, Math.floor(this.now() / 1000));
    let res: Response;
    try {
      res = await this.fetchFn(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new FirestoreError(`Google token request failed: ${(e as Error).message}`, 'network');
    }
    if (!res.ok) throw new FirestoreError(`Google rejected the service account (HTTP ${res.status})`, 'auth');
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new FirestoreError('Google token response has no access_token', 'auth');
    this.#token = { value: body.access_token, expiresAt: this.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  async #getDocument(key: string): Promise<FirestoreDocument> {
    const doc = await this.#getRaw(key);
    if (doc === null) return { value: null, updatedAtMs: null };
    const f = decodeFields(doc);
    if (f.parts === null) return { value: f.value, updatedAtMs: f.t };
    const parts = f.parts;
    if (parts > MAX_PARTS) throw new FirestoreError(`app/${key}: too many parts (${parts})`, 'response');
    const pieces = await Promise.all(
      Array.from({ length: parts }, async (_, i) => {
        const raw = await this.#getRaw(`${key}${PART_SEP}${i}`);
        return raw === null ? { value: null, t: null } : decodeFields(raw);
      }),
    );
    return { value: assembleParts(key, { parts, t: f.t }, pieces), updatedAtMs: f.t };
  }

  async #getRaw(key: string): Promise<unknown | null> {
    const token = await this.#accessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.sa.project_id)}/databases/(default)/documents/app/${encodeURIComponent(key)}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new FirestoreError(`Firestore request failed: ${(e as Error).message}`, 'network');
    }
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
      throw new FirestoreError(`Firestore denied access (HTTP ${res.status}); check the Datastore Viewer role`, 'auth');
    }
    if (!res.ok) throw new FirestoreError(`Firestore answered HTTP ${res.status}`, 'response');
    return res.json();
  }

  async fetchSite(): Promise<SiteSnapshot> {
    const [products, stores, users, orders, ledger] = await Promise.all(
      ['products', 'stores', 'users', 'orders', 'ledger'].map((k) => this.#getDocument(k)),
    );
    return {
      products: products as FirestoreDocument,
      stores: stores as FirestoreDocument,
      users: users as FirestoreDocument,
      orders: orders as FirestoreDocument,
      ledger: ledger as FirestoreDocument,
    };
  }

  async fetchStoreList(): Promise<StoreListSnapshot> {
    const [stores, users, orders] = await Promise.all([
      this.#getDocument('stores'),
      this.#getDocument('users'),
      this.#getDocument('orders'),
    ]);
    return { stores, users, orders };
  }

  async fetchCatalog(): Promise<CatalogSnapshot> {
    const [products, categories] = await Promise.all([this.#getDocument('products'), this.#getDocument('categories')]);
    if (products.value === null) throw new FirestoreError('Document app/products not found', 'not_found');
    return { products, categories };
  }
}

/** Reads the key file on every call so a fixed/replaced file is picked up without a restart. */
export function firestoreSourceFromFile(path: string, fetchFn: FetchFn = fetch): CatalogSource {
  return {
    name: 'firestore',
    fetchCatalog: () => new FirestoreCatalogSource(loadServiceAccount(path), fetchFn).fetchCatalog(),
    fetchStoreList: () => new FirestoreCatalogSource(loadServiceAccount(path), fetchFn).fetchStoreList(),
    fetchSite: () => new FirestoreCatalogSource(loadServiceAccount(path), fetchFn).fetchSite(),
  };
}
