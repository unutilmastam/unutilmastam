import { describe, expect, it } from 'vitest';
import { siteOverview } from '../../src/domain/site-overview';

describe('siteOverview', () => {
  it('survives missing, broken and hostile documents', () => {
    const o = siteOverview(
      {
        products: null,
        stores: 'not json',
        users: '{"a":1}',
        orders: '[null, 5, {"status": 7}]',
        ledger: '[{"partyType":"store","partyId":"s1","debt":-5}]',
      },
      '2026-10-29',
    );
    expect(o.products.total).toBe(0);
    expect(o.orders).toMatchObject({ total: 1, new: 0 });
    expect(o.debts).toEqual({ totalSom: 0, stores: 0, top: [] });
  });

  it('treats a store owner without storeStatus as approved (as the website does)', () => {
    const o = siteOverview(
      { products: '[]', stores: '[]', users: '[{"id":"u1","userType":"store"}]', orders: '[]', ledger: '[]' },
      '2026-10-29',
    );
    expect(o.storeOwners).toMatchObject({ approved: 1, pending: 0 });
  });
});
