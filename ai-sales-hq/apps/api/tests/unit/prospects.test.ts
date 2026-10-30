import { describe, expect, it } from 'vitest';
import { mapHeader, parseCsv } from '../../src/domain/csv';
import { parseStores } from '../../src/domain/firestore-stores';
import {
  canMoveProspect,
  categorize,
  detectDistrict,
  findDuplicate,
  formatPhone,
  isPwaFallbackLocation,
  normalizeBusinessName,
  normalizePhone,
  normalizeTelegram,
  PROSPECT_STAGES,
  scoreProspect,
  stageAfterScoring,
} from '../../src/domain/prospects';
import { mapPlace } from '../../src/integrations/places';

describe('phones', () => {
  it.each([
    ['+998 90 123-45-67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['90 123 45 67', '+998901234567'],
    ['(76) 223-11-22', '+998762231122'],
    ['8 90 123 45 67', '+998901234567'],
    ['12345', null],
    ['+7 901 234 56 78', null],
    ['', null],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });
  it('formats and masks', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123-45-67');
    expect(formatPhone('+998901234567', true)).toBe('+998 90 ***-**-67');
  });
  it('telegram usernames', () => {
    expect(normalizeTelegram('https://t.me/Dokon_Termiz')).toBe('dokon_termiz');
    expect(normalizeTelegram('@abc')).toBeNull();
  });
});

describe('districts and location', () => {
  it.each([
    ['Termiz sh., Al-Termiziy ko‘chasi 5', 'Termiz'],
    ['г. Денау, ул. Ленина', 'Denov'],
    ["Jarqo'rg'on tumani", "Jarqo'rg'on"],
    ['Sherabad bozori', 'Sherobod'],
    ['Toshkent', null],
  ])('%s -> %s', (text, d) => {
    expect(detectDistrict(text)).toBe(d);
  });
  it('flags the PWA random-Tashkent fallback', () => {
    expect(isPwaFallbackLocation(41.32, 69.25)).toBe(true);
    expect(isPwaFallbackLocation(37.22, 67.27)).toBe(false);
  });
});

describe('dedup', () => {
  const existing = [
    { id: 'a', phones: ['+998901234567'], placeId: null, normalizedName: 'baraka', district: 'Termiz' },
    { id: 'b', phones: [], placeId: 'ChIJ1', normalizedName: 'nur', district: 'Denov' },
  ];
  it('matches by place id, phone, then name+district', () => {
    expect(findDuplicate({ phones: [], placeId: 'ChIJ1', normalizedName: 'x', district: null }, existing)).toEqual({
      id: 'b',
      reason: 'place_id',
    });
    expect(
      findDuplicate({ phones: ['+998901234567'], placeId: null, normalizedName: 'x', district: null }, existing),
    ).toEqual({ id: 'a', reason: 'phone' });
    expect(
      findDuplicate({ phones: [], placeId: null, normalizedName: 'baraka', district: 'Termiz' }, existing),
    ).toEqual({ id: 'a', reason: 'name_district' });
    expect(
      findDuplicate({ phones: [], placeId: null, normalizedName: 'baraka', district: 'Denov' }, existing),
    ).toBeNull();
  });
  it('name matching can be switched off', () => {
    expect(
      findDuplicate({ phones: [], placeId: null, normalizedName: 'baraka', district: 'Termiz' }, existing, {
        matchByNameAndDistrict: false,
      }),
    ).toBeNull();
  });
  it('normalizes business names', () => {
    expect(normalizeBusinessName('«Baraka» MCHJ supermarket')).toBe(normalizeBusinessName('BARAKA supermarket'));
  });
});

describe('categories and scoring', () => {
  it('categorizes from Google types and names', () => {
    expect(categorize(['supermarket', 'store'])).toBe('SUPERMARKET');
    expect(categorize(['grocery_store'])).toBe('GROCERY');
    expect(categorize([], 'Ulgurji oziq-ovqat bazasi')).toBe('WHOLESALE');
    expect(categorize(['car_repair'])).toBe('OTHER');
  });
  it('is deterministic, explained and bounded', () => {
    const r = scoreProspect({
      category: 'SUPERMARKET',
      district: 'Termiz',
      hasPhone: true,
      hasVerifiedContact: true,
      isExistingCustomer: true,
      rating: 4.6,
      ratingCount: 40,
      locationKnown: true,
    });
    expect(r.score).toBe(93);
    expect(r.reasons.map((x) => x.points)).toEqual([30, 15, 20, 20, 8]);
    const weak = scoreProspect({
      category: 'OTHER',
      district: null,
      hasPhone: false,
      hasVerifiedContact: false,
      isExistingCustomer: false,
      rating: null,
      ratingCount: null,
      locationKnown: false,
    });
    expect(weak.score).toBe(0);
  });
  it('only verified, strong prospects are auto-qualified', () => {
    expect(stageAfterScoring('NEW', 80, true)).toBe('QUALIFIED');
    expect(stageAfterScoring('NEW', 80, false)).toBe('NEEDS_VERIFICATION');
    expect(stageAfterScoring('NEW', 10, true)).toBe('NEEDS_VERIFICATION');
    expect(stageAfterScoring('CONTACTED', 99, true)).toBe('CONTACTED');
  });
});

describe('pipeline (A10)', () => {
  it('do-not-contact is reachable from everywhere and final', () => {
    for (const s of PROSPECT_STAGES.filter((x) => x !== 'DO_NOT_CONTACT'))
      expect(canMoveProspect(s, 'DO_NOT_CONTACT')).toBe(true);
    for (const s of PROSPECT_STAGES) expect(canMoveProspect('DO_NOT_CONTACT', s)).toBe(false);
  });
  it('cannot skip from NEW straight to WON', () => {
    expect(canMoveProspect('NEW', 'WON')).toBe(false);
    expect(canMoveProspect('INTERESTED', 'WON')).toBe(true);
  });
});

describe('CSV', () => {
  it('reads ; and , files with quotes and BOM; maps Uzbek headers', () => {
    const rows = parseCsv('﻿Nomi;Telefon;Manzil\n"Baraka; savdo";90 123 45 67;"Termiz, ""Markaz"""\n\n');
    expect(rows).toEqual([
      ['Nomi', 'Telefon', 'Manzil'],
      ['Baraka; savdo', '90 123 45 67', 'Termiz, "Markaz"'],
    ]);
    expect(mapHeader(rows[0] as string[])).toEqual({ name: 0, phone: 1, address: 2 });
    expect(parseCsv('name,phone\r\nA,1\r\n')).toEqual([
      ['name', 'phone'],
      ['A', '1'],
    ]);
  });
});

describe('Firestore store list', () => {
  it('keeps business fields only, drops customers and fake locations, counts orders', () => {
    const stores = JSON.stringify([
      {
        id: 's1',
        name: 'Baraka',
        ownerName: 'Ali',
        phone: '901234567',
        address: 'Termiz',
        lat: 41.31,
        lng: 69.28,
        ownerUserId: 'u1',
      },
      { id: 'bad id', name: 'X' },
    ]);
    const users = JSON.stringify([
      { id: 'u1', userType: 'store', storeName: 'Linked', password: 'h1:abc' },
      {
        id: 'u2',
        userType: 'store',
        storeName: 'Nur',
        name: 'Vali',
        contact: '+998911112233',
        password: 'h1:x',
        photo: 'data:',
        ipAddress: '1.2.3.4',
      },
      { id: 'u3', userType: 'customer', name: 'Private person', contact: '+998900000000' },
    ]);
    const orders = JSON.stringify([
      { storeId: 's1', date: '2026-10-01' },
      { storeId: 's1', date: '2026-10-20' },
    ]);
    const out = parseStores(stores, users, orders);
    expect(out).toEqual([
      {
        externalId: 'store:s1',
        name: 'Baraka',
        ownerName: 'Ali',
        phone: '901234567',
        address: 'Termiz',
        lat: null,
        lng: null,
        orderCount: 2,
        lastOrderDate: '2026-10-20',
      },
      {
        externalId: 'user:u2',
        name: 'Nur',
        ownerName: 'Vali',
        phone: '+998911112233',
        address: null,
        lat: null,
        lng: null,
        orderCount: 0,
        lastOrderDate: null,
      },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/password|h1:|ipAddress|photo/);
  });
});

describe('Google Places mapping', () => {
  it('maps the new API shape', () => {
    expect(
      mapPlace({
        id: 'ChIJ',
        displayName: { text: 'Korzinka' },
        formattedAddress: 'Termiz',
        location: { latitude: 37.2, longitude: 67.3 },
        types: ['supermarket'],
        internationalPhoneNumber: '+998 90 123 45 67',
        rating: 4.4,
        userRatingCount: 12,
      }),
    ).toMatchObject({ placeId: 'ChIJ', name: 'Korzinka', phone: '+998 90 123 45 67', rating: 4.4 });
    expect(mapPlace({})).toBeNull();
  });
});
