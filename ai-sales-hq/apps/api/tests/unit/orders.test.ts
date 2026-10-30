import { describe, expect, it } from 'vitest';
import { definitionFor, isAvailable } from '../../src/domain/agents';
import {
  canMoveOrder,
  confirmationText,
  lineTotal,
  missingInformation,
  ORDER_STATUSES,
  OWNER_ONLY,
  orderNumber,
  orderTotal,
  paymentStatus,
} from '../../src/domain/orders';

describe('order status flow (A10)', () => {
  it('follows the main chain', () => {
    const chain = [
      'DRAFT',
      'CUSTOMER_CONFIRMATION_PENDING',
      'READY_FOR_OWNER_REVIEW',
      'APPROVED_FOR_DELIVERY',
      'DELIVERED',
      'CLOSED',
    ] as const;
    for (const [i, to] of chain.slice(1).entries()) {
      expect(canMoveOrder(chain[i] as (typeof chain)[number], to)).toBe(true);
    }
  });

  it('never skips the customer confirmation or the owner review', () => {
    expect(canMoveOrder('DRAFT', 'READY_FOR_OWNER_REVIEW')).toBe(false);
    expect(canMoveOrder('DRAFT', 'APPROVED_FOR_DELIVERY')).toBe(false);
    expect(canMoveOrder('CUSTOMER_CONFIRMATION_PENDING', 'APPROVED_FOR_DELIVERY')).toBe(false);
    expect(canMoveOrder('READY_FOR_OWNER_REVIEW', 'DELIVERED')).toBe(false);
  });

  it('terminal statuses are final', () => {
    for (const s of ORDER_STATUSES) {
      expect(canMoveOrder('CLOSED', s)).toBe(false);
      expect(canMoveOrder('REJECTED', s)).toBe(false);
      expect(canMoveOrder('CANCELLED', s)).toBe(false);
    }
  });

  it('a price change sends the order back to DRAFT for re-confirmation, never forward', () => {
    expect(canMoveOrder('PRICE_CHANGED', 'DRAFT')).toBe(true);
    expect(canMoveOrder('PRICE_CHANGED', 'READY_FOR_OWNER_REVIEW')).toBe(false);
    expect(canMoveOrder('PRICE_CHANGED', 'APPROVED_FOR_DELIVERY')).toBe(false);
  });

  it('approval, delivery and closing are owner-only', () => {
    for (const s of ['APPROVED_FOR_DELIVERY', 'DELIVERED', 'CLOSED', 'REJECTED', 'ON_HOLD'] as const) {
      expect(OWNER_ONLY.has(s)).toBe(true);
    }
    expect(OWNER_ONLY.has('CUSTOMER_CONFIRMATION_PENDING')).toBe(false);
  });
});

describe("money is integer so'm (A8)", () => {
  it('computes totals with BigInt', () => {
    expect(lineTotal({ quantity: 3, unitPriceSom: 25_000n })).toBe(75_000n);
    expect(
      orderTotal([
        { quantity: 3, unitPriceSom: 25_000n },
        { quantity: 10, unitPriceSom: 18_500n },
      ]),
    ).toBe(260_000n);
    expect(orderTotal([])).toBe(0n);
    // Large amounts stay exact (beyond float precision).
    expect(lineTotal({ quantity: 10_000, unitPriceSom: 900_719_925_474_099n })).toBe(9_007_199_254_740_990_000n);
  });

  it('rejects invalid quantities', () => {
    expect(() => lineTotal({ quantity: 0, unitPriceSom: 1n })).toThrow();
    expect(() => lineTotal({ quantity: 1.5, unitPriceSom: 1n })).toThrow();
    expect(() => lineTotal({ quantity: 10_001, unitPriceSom: 1n })).toThrow();
  });

  it('payment status', () => {
    expect(paymentStatus(100n, 0n)).toBe('UNPAID');
    expect(paymentStatus(100n, 40n)).toBe('PARTIAL');
    expect(paymentStatus(100n, 100n)).toBe('PAID');
  });
});

describe('order texts', () => {
  it('numbers', () => {
    expect(orderNumber(2026, 7)).toBe('UT-2026-0007');
  });

  it('lists what is missing', () => {
    expect(
      missingInformation({
        itemCount: 1,
        deliveryAddress: 'Termiz',
        contactPhone: '+998901234567',
        unavailablePrices: 0,
      }),
    ).toEqual([]);
    expect(
      missingInformation({ itemCount: 0, deliveryAddress: null, contactPhone: null, unavailablePrices: 2 }),
    ).toHaveLength(4);
  });

  it('confirmation text carries only the snapshot prices and no promises', () => {
    const text = confirmationText(
      'UT-2026-0001',
      'Supermarket A',
      [{ name: 'CHUCHVARA', grams: 500, quantity: 4, unitPriceSom: 25_000n, lineTotalSom: 100_000n }],
      100_000n,
      'Termiz',
      "Unutilmas Ta'm",
    );
    expect(text).toContain("CHUCHVARA 500 g × 4 = 100 000 so'm");
    expect(text).toContain("Jami: 100 000 so'm");
    expect(text).not.toMatch(/chegirma|bepul|kafolat/i);
  });
});

describe('agent availability', () => {
  it('order manager arrives in phase 7', () => {
    const def = definitionFor('order_manager');
    expect(def && isAvailable(def, 6)).toBe(false);
    expect(def && isAvailable(def, 7)).toBe(true);
  });
});
