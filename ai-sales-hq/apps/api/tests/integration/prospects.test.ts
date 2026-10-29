import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DiscoveryService } from '../../src/modules/discovery/service';
import { ProspectService } from '../../src/modules/prospects/service';
import { Client, FakeCatalogSource, FakePlaces, hasDb, makeApp, ownerClient, resetDb } from '../helpers';

const place = (id: string, name: string, phone: string | null, extra = {}) => ({
  placeId: id,
  name,
  address: 'Termiz shahri',
  lat: 37.22,
  lng: 67.27,
  types: ['supermarket'],
  phone,
  rating: 4.5,
  ratingCount: 20,
  mapsUrl: `https://maps.google.com/?cid=${id}`,
  ...extra,
});

describe.skipIf(!hasDb)('prospects + discovery (MySQL)', () => {
  const source = new FakeCatalogSource();
  const places = new FakePlaces();
  let clock = new Date('2026-10-28T05:00:00Z');
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  let owner: Client;

  beforeAll(async () => {
    ctx = await makeApp({}, () => clock, { catalogSource: source, places });
  });
  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(ctx.db);
    clock = new Date('2026-10-28T05:00:00Z');
    places.results = [];
    places.searches = [];
    source.stores = [];
    source.users = [];
    source.orders = [];
    owner = await ownerClient(ctx.app);
  });

  const list = async (q = '') => (await owner.get(`/api/v1/prospects${q}`)).json;

  it('manual entry normalizes, detects district, records provenance and queues scoring', async () => {
    const r = await owner.post('/api/v1/prospects', {
      name: 'Baraka market',
      phone: '90 123 45 67',
      address: 'Termiz, Navoiy 5',
    });
    expect(r.status).toBe(201);
    const p = (await owner.get(`/api/v1/prospects/${r.json.prospectId}`)).json;
    expect(p).toMatchObject({ district: 'Termiz', stage: 'NEW', category: 'GROCERY' });
    expect(p.contacts).toEqual([expect.objectContaining({ kind: 'PHONE', value: '+998901234567', isVerified: false })]);
    expect(p.sources[0].sourceType).toBe('MANUAL');
    expect(await ctx.db.job.count({ where: { type: 'prospects.score' } })).toBe(1);
    expect((await owner.post('/api/v1/prospects', { name: 'X shop', phone: '123' })).status).toBe(400);
  });

  it('dedup: same phone from another source merges instead of duplicating', async () => {
    await owner.post('/api/v1/prospects', { name: 'Baraka', phone: '+998901234567' });
    places.results = [place('ChIJ1', 'Baraka Supermarket', '+998 90 123 45 67')];
    const r = (await owner.post('/api/v1/discovery/places-search', { query: 'supermarket', district: 'Termiz' })).json;
    expect(r).toMatchObject({ found: 1, created: 0, merged: 1 });
    const all = await list();
    expect(all.total).toBe(1);
    expect(all.items[0].sources.sort()).toEqual(['GOOGLE_PLACES', 'MANUAL']);
    expect(all.items[0]).toMatchObject({ name: 'Baraka', rating: 4.5 }); // owner's name kept
  });

  it('CSV dry run classifies rows without writing; import writes valid ones', async () => {
    await owner.post('/api/v1/prospects', { name: 'Bor', phone: '911112233' });
    const csv =
      'Nomi;Telefon;Manzil\nYangi;90 000 11 22;Denov\nBor;+998 91 111 22 33;Termiz\nXato;123;Termiz\nYangi;90 000 11 22;Denov\n;;\n';
    const preview = (await owner.post('/api/v1/prospects/import/preview', { csv })).json;
    expect(preview.counts).toEqual({ ok: 1, invalid: 1, duplicate_in_file: 1, exists: 1 });
    expect(await ctx.db.prospect.count()).toBe(1);
    const res = (await owner.post('/api/v1/prospects/import', { csv })).json;
    expect(res).toEqual({ created: 1, merged: 1, skipped: 0, rejected: 2 });
    expect(await ctx.db.prospect.count()).toBe(2);
    expect((await owner.post('/api/v1/prospects/import/preview', { csv: 'phone\n123' })).status).toBe(400);
  });

  it('imports existing stores from Firestore; existing customers flagged; no personal-customer data', async () => {
    source.stores = [{ id: 's1', name: 'Nur', phone: '+998935554433', address: 'Denov', ownerName: 'Vali' }];
    source.users = [{ id: 'u9', userType: 'customer', name: 'Private', contact: '+998900000001' }];
    source.orders = [{ storeId: 's1', date: '2026-10-01' }];
    const r = (await owner.post('/api/v1/discovery/firestore-import')).json;
    expect(r).toEqual({ found: 1, created: 1, merged: 0, skipped: 0 });
    const again = (await owner.post('/api/v1/discovery/firestore-import')).json;
    expect(again).toMatchObject({ created: 0, merged: 1 });
    const p = (await list()).items[0];
    expect(p).toMatchObject({ name: 'Nur', isExistingCustomer: true, district: 'Denov' });
    expect(await ctx.db.contactPoint.count({ where: { value: '+998900000001' } })).toBe(0);
  });

  it('Places search respects the daily budget and counts usage', async () => {
    await owner.post('/api/v1/discovery/settings', {
      placesDailyLimit: 1,
      queries: ['supermarket'],
      districts: ['Termiz'],
      matchByNameAndDistrict: true,
      qualifyThreshold: 45,
    });
    places.results = [place('ChIJ2', 'Korzinka', null)];
    expect(
      (await owner.post('/api/v1/discovery/places-search', { query: 'supermarket', district: 'Termiz' })).status,
    ).toBe(200);
    const second = await owner.post('/api/v1/discovery/places-search', { query: 'minimarket', district: 'Termiz' });
    expect(second.status).toBe(429);
    expect(places.searches).toHaveLength(1);
    const status = (await owner.get('/api/v1/discovery')).json;
    expect(status.places).toMatchObject({ configured: true, status: 'CONNECTED', usedToday: 1, dailyLimit: 1 });
    clock = new Date('2026-10-29T05:00:00Z');
    const fresh = new Client(ctx.app); // yesterday's session expired with the clock jump
    await fresh.post('/api/v1/auth/login', { username: 'owner', password: 'Qovun-Termiz-2026' });
    expect((await fresh.get('/api/v1/discovery')).json.places.usedToday).toBe(0);
  });

  it('expired Places data is redacted when it cannot be refreshed (ToS), place_id kept', async () => {
    places.results = [place('ChIJ3', 'Oila market', '+998977776655')];
    await owner.post('/api/v1/discovery/places-search', { query: 'market', district: 'Termiz' });
    clock = new Date('2026-12-01T05:00:00Z');
    const svc = new DiscoveryService(
      ctx.db,
      new ProspectService(ctx.db, () => clock),
      () => null,
      null,
      () => clock,
    );
    expect(await svc.refreshExpiredPlaces({ type: 'system' })).toEqual({ refreshed: 0, redacted: 1 });
    const p = await ctx.db.prospect.findFirstOrThrow({ include: { contacts: true } });
    expect(p).toMatchObject({ googlePlaceId: 'ChIJ3', rating: null, address: null });
    expect(p.contacts).toHaveLength(0);
  });

  it('scoring explains itself; verifying the phone can qualify the prospect', async () => {
    const r = (
      await owner.post('/api/v1/prospects', { name: 'Baraka supermarket', phone: '901234567', address: 'Termiz' })
    ).json;
    let p = (await owner.post(`/api/v1/prospects/${r.prospectId}/score`)).json;
    expect(p).toMatchObject({ stage: 'NEEDS_VERIFICATION', score: 50 });
    const detail = (await owner.get(`/api/v1/prospects/${r.prospectId}`)).json;
    p = (await owner.post(`/api/v1/contacts/${detail.contacts[0].id}/verify`)).json;
    expect(p).toMatchObject({ stage: 'QUALIFIED', score: 60 });
    const reasons = (await owner.get(`/api/v1/prospects/${r.prospectId}`)).json.scoreReasons;
    expect(reasons.map((x: any) => x.text)).toContain('Tasdiqlangan aloqa mavjud');
  });

  it('do-not-contact suppresses all channels and future imports', async () => {
    const r = (await owner.post('/api/v1/prospects', { name: 'Opt out', phone: '935550000', telegram: '@optout_shop' }))
      .json;
    await owner.post(`/api/v1/prospects/${r.prospectId}/stage`, { to: 'DO_NOT_CONTACT', reason: 'Mijoz so‘radi' });
    expect(await ctx.db.suppressionRecord.count()).toBe(3);
    expect((await owner.post(`/api/v1/prospects/${r.prospectId}/stage`, { to: 'QUALIFIED' })).status).toBe(409);
    const again = (await owner.post('/api/v1/prospects', { name: 'Boshqa nom', phone: '+998935550000' })).json;
    expect(again.action).toBe('merged');
    // A brand-new business whose phone is on the list starts suppressed too.
    await owner.post('/api/v1/suppression', { kind: 'PHONE', value: '977001122', reason: 'STOP' });
    const fresh = (await owner.post('/api/v1/prospects', { name: 'Yangi', phone: '977001122' })).json;
    expect((await owner.get(`/api/v1/prospects/${fresh.prospectId}`)).json.stage).toBe('DO_NOT_CONTACT');
  });

  it('staff may edit prospects but not change discovery settings', async () => {
    const u = await ctx.db.user.findFirstOrThrow();
    await ctx.db.user.create({
      data: { username: 'staff', displayName: 'X', passwordHash: u.passwordHash, role: 'STAFF' },
    });
    const staff = new Client(ctx.app);
    await staff.post('/api/v1/auth/login', { username: 'staff', password: 'Qovun-Termiz-2026' });
    expect((await staff.post('/api/v1/prospects', { name: 'Staff added' })).status).toBe(201);
    expect((await staff.post('/api/v1/discovery/places-search', { query: 'x1', district: 'Termiz' })).status).toBe(403);
  });
});
