// Shapes returned by /api/v1/orders (amounts are integer so'm).

export interface OrderRow {
  id: string;
  number: string;
  status: string;
  prospectId: string;
  prospectName: string;
  totalSom: number;
  amountPaidSom: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  itemCount: number;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  packageWeightGrams: number | null;
  quantity: number;
  priceType: 'RETAIL' | 'WHOLESALE';
  priceSource: string;
  unitPriceSom: number;
  lineTotalSom: number;
  snapshotAt: string;
  priceStale: boolean;
  availability: 'VERIFIED' | 'UNKNOWN';
}

export interface OrderDetail extends Omit<OrderRow, 'prospectName' | 'itemCount'> {
  deliveryAddress: string | null;
  contactPhone: string | null;
  contactName: string | null;
  requestedDeliveryAt: string | null;
  notes: string | null;
  customerConfirmedAt: string | null;
  customerConfirmation: string | null;
  approvedAt: string | null;
  deliveredAt: string | null;
  prospect: { id: string; name: string; stage: string };
  items: OrderItem[];
  events: {
    id: number;
    fromStatus: string | null;
    toStatus: string;
    actorType: string;
    note: string | null;
    createdAt: string;
  }[];
  payments: { id: string; amountSom: number; note: string | null; createdAt: string }[];
  missing: string[];
  confirmationText: string;
}

export interface OrderableProduct {
  id: string;
  name: string;
  packageWeightGrams: number | null;
  retailSom: number | null;
  wholesaleSom: number | null;
}

export const ORDER_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted' | 'gold'> = {
  DRAFT: 'muted',
  NEEDS_INFORMATION: 'warn',
  CUSTOMER_CONFIRMATION_PENDING: 'gold',
  READY_FOR_OWNER_REVIEW: 'warn',
  APPROVED_FOR_DELIVERY: 'ok',
  DELIVERED: 'ok',
  CLOSED: 'muted',
  ON_HOLD: 'warn',
  REJECTED: 'bad',
  CANCELLED: 'muted',
  PRICE_CHANGED: 'bad',
};

export const ORDER_FILTERS = [
  '',
  'READY_FOR_OWNER_REVIEW',
  'DRAFT',
  'CUSTOMER_CONFIRMATION_PENDING',
  'PRICE_CHANGED',
  'APPROVED_FOR_DELIVERY',
  'DELIVERED',
] as const;

export const EDITABLE = new Set(['DRAFT', 'NEEDS_INFORMATION', 'PRICE_CHANGED']);
