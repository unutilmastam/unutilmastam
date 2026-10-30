// Order rules (MASTER_SPEC §12, SPEC_AMENDMENTS A8/A10). Pure; money is integer so'm (BigInt).

export const ORDER_STATUSES = [
  'DRAFT',
  'NEEDS_INFORMATION',
  'CUSTOMER_CONFIRMATION_PENDING',
  'READY_FOR_OWNER_REVIEW',
  'APPROVED_FOR_DELIVERY',
  'DELIVERED',
  'CLOSED',
  'ON_HOLD',
  'REJECTED',
  'CANCELLED',
  'PRICE_CHANGED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const FLOW: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['CUSTOMER_CONFIRMATION_PENDING', 'NEEDS_INFORMATION', 'CANCELLED'],
  NEEDS_INFORMATION: ['DRAFT', 'CANCELLED'],
  CUSTOMER_CONFIRMATION_PENDING: ['READY_FOR_OWNER_REVIEW', 'NEEDS_INFORMATION', 'PRICE_CHANGED', 'CANCELLED'],
  READY_FOR_OWNER_REVIEW: ['APPROVED_FOR_DELIVERY', 'REJECTED', 'ON_HOLD', 'NEEDS_INFORMATION', 'PRICE_CHANGED'],
  PRICE_CHANGED: ['DRAFT', 'CANCELLED'],
  ON_HOLD: ['READY_FOR_OWNER_REVIEW', 'CANCELLED'],
  APPROVED_FOR_DELIVERY: ['DELIVERED', 'ON_HOLD', 'CANCELLED', 'PRICE_CHANGED'],
  DELIVERED: ['CLOSED'],
  CLOSED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canMoveOrder(from: OrderStatus, to: OrderStatus): boolean {
  return FLOW[from].includes(to);
}

/** Moves only the owner may make (A10: DELIVERED and payments are owner-only; approval too). */
export const OWNER_ONLY: ReadonlySet<OrderStatus> = new Set([
  'APPROVED_FOR_DELIVERY',
  'REJECTED',
  'ON_HOLD',
  'DELIVERED',
  'CLOSED',
]);

/** Statuses in which items and prices can still change. */
export const EDITABLE: ReadonlySet<OrderStatus> = new Set(['DRAFT', 'NEEDS_INFORMATION', 'PRICE_CHANGED']);

/** Statuses whose price snapshot must still match the catalog. */
export const PRICE_GUARDED: ReadonlySet<OrderStatus> = new Set([
  'CUSTOMER_CONFIRMATION_PENDING',
  'READY_FOR_OWNER_REVIEW',
  'APPROVED_FOR_DELIVERY',
]);

export const MAX_QUANTITY = 10_000;

export interface Line {
  quantity: number;
  unitPriceSom: bigint;
}

export function lineTotal(l: Line): bigint {
  if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QUANTITY) throw new Error('Invalid quantity');
  return l.unitPriceSom * BigInt(l.quantity);
}

/** Server-side total; integer arithmetic only (MASTER_SPEC §12). */
export function orderTotal(lines: readonly Line[]): bigint {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0n);
}

export interface OrderFacts {
  itemCount: number;
  deliveryAddress: string | null;
  contactPhone: string | null;
  unavailablePrices: number; // lines whose price is no longer the current confirmed one
}

/** What is still missing before the customer can be asked to confirm (shown to the owner). */
export function missingInformation(f: OrderFacts): string[] {
  const out: string[] = [];
  if (f.itemCount === 0) out.push("Mahsulot qo'shilmagan");
  if (!f.deliveryAddress) out.push('Yetkazish manzili yo‘q');
  if (!f.contactPhone) out.push('Aloqa telefoni yo‘q');
  if (f.unavailablePrices > 0) out.push(`${f.unavailablePrices} ta mahsulot narxi o'zgargan yoki tasdiqlanmagan`);
  return out;
}

export function paymentStatus(total: bigint, paid: bigint): 'UNPAID' | 'PARTIAL' | 'PAID' {
  if (paid <= 0n) return 'UNPAID';
  return paid >= total ? 'PAID' : 'PARTIAL';
}

export function orderNumber(year: number, sequence: number): string {
  return `UT-${year}-${String(sequence).padStart(4, '0')}`;
}

/** Customer-facing summary the owner sends for confirmation (assisted manual, A5). */
export function confirmationText(
  number: string,
  businessName: string,
  lines: readonly {
    name: string;
    grams: number | null;
    quantity: number;
    unitPriceSom: bigint;
    lineTotalSom: bigint;
  }[],
  total: bigint,
  address: string | null,
  signature: string,
): string {
  const som = (n: bigint) => `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
  const rows = lines.map(
    (l) => `• ${l.name}${l.grams ? ` ${l.grams} g` : ''} × ${l.quantity} = ${som(l.lineTotalSom)}`,
  );
  return [
    `Assalomu alaykum! "${businessName}" uchun buyurtma ${number}:`,
    rows.join('\n'),
    `Jami: ${som(total)}`,
    address ? `Manzil: ${address}` : '',
    'Iltimos, buyurtmani tasdiqlang. Yetkazish vaqtini rahbarimiz alohida kelishadi.',
    `Hurmat bilan, ${signature}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
