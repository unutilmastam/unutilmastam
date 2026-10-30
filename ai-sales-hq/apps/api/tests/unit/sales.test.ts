import { describe, expect, it } from 'vitest';
import {
  cooldownLeftDays,
  costMicroUsd,
  maskPersonalData,
  needsOwnerDecision,
  pricesIn,
  productLine,
  qualityGate,
  recommendProducts,
  templateOutreach,
} from '../../src/domain/sales';

const catalog = [
  { name: 'CHUCHVARA', grams: 500, retailSom: 25000, wholesaleSom: 22000 },
  { name: 'TEFTIL', grams: 300, retailSom: 24000, wholesaleSom: null },
  { name: "LAG'MON", grams: 1000, retailSom: 15000, wholesaleSom: null },
  { name: 'GALUPTSI', grams: 1000, retailSom: null, wholesaleSom: null },
];
const allowed = new Set([25000, 22000, 24000, 15000]);

describe('recommendations', () => {
  it('offers only products with a confirmed price, cheapest first, sized by category', () => {
    expect(recommendProducts('SUPERMARKET', catalog).map((p) => p.name)).toEqual(["LAG'MON", 'TEFTIL', 'CHUCHVARA']);
    expect(recommendProducts('OTHER', [...catalog, ...catalog, ...catalog])).toHaveLength(4);
  });
  it('formats lines with weights and both price types', () => {
    expect(productLine(catalog[0] as (typeof catalog)[number])).toBe(
      "CHUCHVARA 500 g — chakana 25 000 so'm, ulgurji 22 000 so'm",
    );
    expect(productLine(catalog[2] as (typeof catalog)[number])).toBe("LAG'MON 1 kg — chakana 15 000 so'm");
  });
});

describe('quality gate', () => {
  it('the deterministic template always passes', () => {
    const text = templateOutreach('Baraka', recommendProducts('SUPERMARKET', catalog), "Unutilmas Ta'm");
    expect(qualityGate(text, allowed)).toEqual([]);
    expect(text).toContain("25 000 so'm");
  });
  it('detects prices but not weights or counts', () => {
    expect(pricesIn("Chuchvara 500 g — 25 000 so'm, 10 ta qadoq, 1000 gramm")).toEqual([25000]);
    expect(pricesIn('narxi 23.500 сум')).toEqual([23500]);
  });
  it.each([
    ["Chuchvara atigi 19 000 so'm!", 'unknown_price'],
    ['Birinchi buyurtmaga 10% chegirma', 'discount'],
    ['Bepul yetkazib beramiz', 'discount'],
    ['Ertaga yetkazamiz, kafolat beramiz', 'promise'],
    ['Saytimiz: https://unutilmastam.uz', 'link'],
    ["Qo'ng'iroq qiling: +998 90 123 45 67", 'phone_number'],
    ['', 'empty'],
  ])('%s -> %s', (text, code) => {
    expect(qualityGate(text, allowed).map((i) => i.code)).toContain(code);
  });
  it('flags overly long messages', () => {
    expect(qualityGate('a'.repeat(901), allowed).map((i) => i.code)).toEqual(['too_long']);
  });
});

describe('inbound and privacy', () => {
  it.each([
    ['Narxi qancha bo‘ladi?', true],
    ['Optom olsak chegirma bormi', true],
    ['Nasiyaga bera olasizmi', true],
    ['Скидка будет?', true],
    ['Rahmat, keyinroq gaplashamiz', false],
  ])('%s -> needs owner %s', (text, expected) => {
    expect(needsOwnerDecision(text)).toBe(expected);
  });
  it('masks phone numbers before AI calls', () => {
    expect(maskPersonalData('Menga +998 90 123-45-67 ga qo‘ng‘iroq qiling')).toBe('Menga [raqam] ga qo‘ng‘iroq qiling');
  });
});

describe('frequency and cost', () => {
  const now = new Date('2026-10-28T05:00:00Z');
  it('cooldown in whole days', () => {
    expect(cooldownLeftDays(null, now, 7)).toBe(0);
    expect(cooldownLeftDays(new Date(now.getTime() - 2 * 86_400_000), now, 7)).toBe(5);
    expect(cooldownLeftDays(new Date(now.getTime() - 8 * 86_400_000), now, 7)).toBe(0);
  });
  it('cost from list prices; unknown models count at the highest listed rate', () => {
    expect(costMicroUsd('claude-haiku-5-5', 1000, 200)).toBe(200n); // 0.1*1000 + 0.5*200
    expect(costMicroUsd('claude-opus-5-5', 1000, 200)).toBe(8000n);
    expect(costMicroUsd('unknown', 1000, 200)).toBe(8000n);
  });
});
