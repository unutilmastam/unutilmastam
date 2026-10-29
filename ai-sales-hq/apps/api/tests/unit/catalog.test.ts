import { describe, expect, it } from 'vitest';
import {
  diffCatalog,
  type ExistingProduct,
  holdReason,
  normalizeProductName,
  parseCategories,
  parseProducts,
} from '../../src/domain/catalog';

const cats = parseCategories(JSON.stringify([{ id: 'gosht', name: "Go'shtli" }, { id: 5 }, { id: 'x', name: '' }]));

describe('parseProducts', () => {
  it('maps valid records and drops images to a flag', () => {
    const { products, invalid } = parseProducts(
      JSON.stringify([
        {
          id: 'p1',
          name: '  Chuchvara\n500g ',
          gram: 500,
          price: 25000,
          stock: 24,
          category: 'gosht',
          image: 'data:image/jpeg;base64,AAA',
        },
        { id: 'p2', name: 'Patir', price: '12000', gram: 0 },
      ]),
      cats,
    );
    expect(invalid).toEqual([]);
    expect(products[0]).toMatchObject({
      externalId: 'p1',
      name: 'Chuchvara 500g',
      packageWeightGrams: 500,
      priceSom: 25000n,
      stockReported: 24,
      categoryName: "Go'shtli",
      hasSourceImage: true,
    });
    expect(products[1]).toMatchObject({ priceSom: 12000n, packageWeightGrams: null, categoryName: null });
  });

  it('rejects untrusted garbage record by record', () => {
    const { products, invalid } = parseProducts(
      JSON.stringify([
        null,
        { name: 'no id', price: 1 },
        { id: 'bad id!', name: 'x', price: 1 },
        { id: 'p1', name: '', price: 1 },
        { id: 'p2', name: 'float', price: 1000.5 },
        { id: 'p3', name: 'negative', price: -1 },
        { id: 'p4', name: 'huge', price: 1e12 },
        { id: 'p5', name: 'ok', price: 100 },
        { id: 'p5', name: 'dup', price: 100 },
        { id: 'p6', name: 'weird weight', price: 100, gram: 'abc' },
      ]),
      cats,
    );
    expect(products.map((p) => p.externalId)).toEqual(['p5']);
    expect(invalid).toHaveLength(9);
    expect(invalid.find((i) => i.externalId === 'p2')?.reason).toMatch(/whole number/);
  });

  it('throws on a non-array document', () => {
    expect(() => parseProducts('{"a":1}', cats)).toThrow(/not an array/);
    expect(() => parseProducts('not json', cats)).toThrow(/not valid JSON/);
  });
});

describe('normalizeProductName', () => {
  it('treats apostrophe variants and case as equal', () => {
    expect(normalizeProductName('Lag‘mon')).toBe(normalizeProductName("LAG'MON"));
    expect(normalizeProductName('Qat-qat  patir')).toBe('QAT QAT PATIR');
  });
});

const existing = (over: Partial<ExistingProduct> & { externalId: string }): ExistingProduct => ({
  id: `id-${over.externalId}`,
  name: 'N',
  description: null,
  categoryName: null,
  packageWeightGrams: null,
  unitType: null,
  stockReported: null,
  hasSourceImage: false,
  isActive: true,
  currentRetailSom: 100n,
  lastSiteWholesaleSom: null,
  ...over,
});
const incoming = (externalId: string, priceSom = 100n, name = 'N', wholesaleSom: bigint | null = null) => ({
  externalId,
  name,
  description: null,
  categoryName: null,
  packageWeightGrams: null,
  unitType: null,
  priceSom,
  wholesaleSom,
  stockReported: null,
  hasSourceImage: false,
});

describe('diffCatalog', () => {
  it('detects create, update, price change, reactivate, deactivate', () => {
    const diff = diffCatalog(
      [
        existing({ externalId: 'a' }),
        existing({ externalId: 'b' }),
        existing({ externalId: 'c', isActive: false }),
        existing({ externalId: 'gone' }),
      ],
      [incoming('a'), incoming('b', 120n, 'B2'), incoming('c'), incoming('new', 50n)],
    );
    expect(diff.create.map((p) => p.externalId)).toEqual(['new']);
    expect(diff.update).toEqual([expect.objectContaining({ id: 'id-b', fields: ['name'] })]);
    expect(diff.priceChanges).toEqual([
      { id: 'id-b', externalId: 'b', from: 100n, to: 120n },
      { id: null, externalId: 'new', from: null, to: 50n },
    ]);
    expect(diff.reactivate).toEqual(['id-c']);
    expect(diff.deactivate).toEqual([{ id: 'id-gone', externalId: 'gone', name: 'N' }]);
  });

  it('is empty when nothing changed', () => {
    const diff = diffCatalog([existing({ externalId: 'a' })], [incoming('a')]);
    expect(diff).toEqual({
      create: [],
      update: [],
      priceChanges: [],
      wholesaleChanges: [],
      reactivate: [],
      deactivate: [],
    });
  });

  it('website shop price (priceStore): new, changed, unchanged, removed', () => {
    const diff = diffCatalog(
      [
        existing({ externalId: 'a' }),
        existing({ externalId: 'b', lastSiteWholesaleSom: 80n }),
        existing({ externalId: 'c', lastSiteWholesaleSom: 80n }),
        existing({ externalId: 'd', lastSiteWholesaleSom: 80n }),
      ],
      [
        incoming('a', 100n, 'N', 85n),
        incoming('b', 100n, 'N', 90n),
        incoming('c', 100n, 'N', 80n),
        incoming('d', 100n, 'N', null),
        incoming('e', 100n, 'N', 70n),
      ],
    );
    expect(diff.wholesaleChanges).toEqual([
      { id: 'id-a', externalId: 'a', from: null, to: 85n },
      { id: 'id-b', externalId: 'b', from: 80n, to: 90n },
      { id: null, externalId: 'e', from: null, to: 70n },
    ]);
  });
});

describe('holdReason (mass-change guard)', () => {
  const ten = Array.from({ length: 10 }, (_, i) => existing({ externalId: `p${i}` }));
  it('holds when the source suddenly has no products', () => {
    expect(holdReason(10, 0, diffCatalog(ten, []))).toMatch(/birorta ham/);
  });
  it('holds when more than 30% of prices change', () => {
    const next = ten.map((p, i) => incoming(p.externalId, i < 4 ? 999n : 100n));
    expect(holdReason(10, 10, diffCatalog(ten, next))).toMatch(/4 ta narx/);
  });
  it('allows 30% or less, and any change for a small catalog', () => {
    const next = ten.map((p, i) => incoming(p.externalId, i < 3 ? 999n : 100n));
    expect(holdReason(10, 10, diffCatalog(ten, next))).toBeNull();
    const small = ten.slice(0, 3);
    expect(
      holdReason(
        3,
        3,
        diffCatalog(
          small,
          small.map((p) => incoming(p.externalId, 5n)),
        ),
      ),
    ).toBeNull();
  });
});

describe('v14.5 product fields', () => {
  it('reads priceStore as the shop price and upload URLs as images', () => {
    const { products, invalid } = parseProducts(
      JSON.stringify([
        { id: 'p1', name: 'Manti', gram: 500, price: 35000, priceStore: 30000, image: 'uploads/products/a.jpg' },
        { id: 'p2', name: 'Tiftel', gram: 400, price: 28000, priceStore: 0, image: null },
        { id: 'p3', name: 'Somsa', gram: 400, price: 20000, priceStore: 'abc' },
      ]),
      new Map(),
    );
    expect(invalid).toEqual([]);
    expect(products.map((p) => [p.externalId, p.wholesaleSom, p.hasSourceImage])).toEqual([
      ['p1', 30000n, true],
      ['p2', null, false],
      ['p3', null, false],
    ]);
  });
});
