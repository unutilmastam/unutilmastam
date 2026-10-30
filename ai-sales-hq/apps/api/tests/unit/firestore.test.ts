import { createVerify, generateKeyPairSync } from 'node:crypto';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeDocument,
  FirestoreCatalogSource,
  FirestoreError,
  loadServiceAccount,
  signJwt,
} from '../../src/integrations/firestore';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = {
  project_id: 'unutilmastam-test',
  client_email: 'reader@unutilmastam-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

describe('service account JWT', () => {
  it('is a valid RS256 token with the read scope', () => {
    const jwt = signJwt(sa, 1_700_000_000);
    const [h, c, s] = jwt.split('.') as [string, string, string];
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      exp: 1_700_003_600,
    });
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
  });
});

describe('loadServiceAccount', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sa-'));
  it('refuses world-readable files and non service-account JSON', () => {
    const file = join(dir, 'key.json');
    writeFileSync(file, JSON.stringify({ type: 'service_account', ...sa }));
    chmodSync(file, 0o644);
    expect(() => loadServiceAccount(file)).toThrow(/world-readable/);
    chmodSync(file, 0o600);
    expect(loadServiceAccount(file).client_email).toBe(sa.client_email);
    writeFileSync(file, JSON.stringify({ type: 'authorized_user' }));
    expect(() => loadServiceAccount(file)).toThrow(/not a Google service account/);
  });
});

describe('decodeDocument', () => {
  it('reads the PWA {v, t} shape', () => {
    expect(decodeDocument({ fields: { v: { stringValue: '[1]' }, t: { integerValue: '1730000000000' } } })).toEqual({
      value: '[1]',
      updatedAtMs: 1730000000000,
    });
    expect(decodeDocument({})).toEqual({ value: null, updatedAtMs: null });
  });
});

describe('FirestoreCatalogSource', () => {
  const doc = (v: string) => ({ fields: { v: { stringValue: v }, t: { integerValue: '5' } } });

  it('exchanges a token, then only GETs the two documents', async () => {
    const calls: { url: string; method: string }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? 'GET' });
      if (url.includes('oauth2')) return Response.json({ access_token: 'tok', expires_in: 3600 });
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
      return Response.json(url.endsWith('/products') ? doc('[{"id":"p1"}]') : doc('[]'));
    }) as typeof fetch;
    const snap = await new FirestoreCatalogSource(sa, fake).fetchCatalog();
    expect(snap.products.value).toBe('[{"id":"p1"}]');
    expect(calls.filter((c) => c.url.includes('firestore')).every((c) => c.method === 'GET')).toBe(true);
    expect(calls[1]?.url).toContain('/projects/unutilmastam-test/databases/(default)/documents/app/');
  });

  it('maps permission errors and missing documents', async () => {
    const deny = (async (url: string) =>
      url.includes('oauth2')
        ? Response.json({ access_token: 't' })
        : new Response('', { status: 403 })) as typeof fetch;
    await expect(new FirestoreCatalogSource(sa, deny).fetchCatalog()).rejects.toMatchObject({ kind: 'auth' });
    const missing = (async (url: string) =>
      url.includes('oauth2')
        ? Response.json({ access_token: 't' })
        : new Response('', { status: 404 })) as typeof fetch;
    await expect(new FirestoreCatalogSource(sa, missing).fetchCatalog()).rejects.toBeInstanceOf(FirestoreError);
    const badKey = (async () => new Response('', { status: 400 })) as typeof fetch;
    await expect(new FirestoreCatalogSource(sa, badKey).fetchCatalog()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('reassembles a split document (v14.5: app/<key> = {c, t}, app/<key>__pN = {v, t})', async () => {
    const big = JSON.stringify([
      { id: 'p1', name: 'Manti' },
      { id: 'p2', name: 'Tiftel' },
    ]);
    const half = Math.ceil(big.length / 2);
    const part = (v: string, t = '9') => ({ fields: { v: { stringValue: v }, t: { integerValue: t } } });
    const docs: Record<string, unknown> = {
      products: {
        fields: { c: { integerValue: '2' }, t: { integerValue: '9' }, len: { integerValue: String(big.length) } },
      },
      products__p0: part(big.slice(0, half)),
      products__p1: part(big.slice(half)),
      categories: doc('[]'),
    };
    const fake = (async (url: string) => {
      if (url.includes('oauth2')) return Response.json({ access_token: 'tok' });
      const key = decodeURIComponent(url.split('/app/')[1] ?? '');
      return key in docs ? Response.json(docs[key]) : new Response('', { status: 404 });
    }) as typeof fetch;
    const snap = await new FirestoreCatalogSource(sa, fake).fetchCatalog();
    expect(snap.products).toEqual({ value: big, updatedAtMs: 9 });

    // A piece from another save (different t) is refused instead of mixing versions.
    docs.products__p1 = part(big.slice(half), '8');
    await expect(new FirestoreCatalogSource(sa, fake).fetchCatalog()).rejects.toMatchObject({ kind: 'response' });
    delete docs.products__p1;
    await expect(new FirestoreCatalogSource(sa, fake).fetchCatalog()).rejects.toMatchObject({ kind: 'response' });
  });
});
