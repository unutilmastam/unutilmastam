import type { OrderStatus } from '../../domain/orders';
import type { Db } from '../../lib/db';

const DRAFT_VALUE: OrderStatus[] = [
  'DRAFT',
  'NEEDS_INFORMATION',
  'CUSTOMER_CONFIRMATION_PENDING',
  'READY_FOR_OWNER_REVIEW',
  'PRICE_CHANGED',
  'ON_HOLD',
];

/**
 * Order figures for the dashboard (MASTER_SPEC §17): draft, approved and delivered values are kept
 * apart, and "paid" is only what the owner recorded as payments — never projected revenue.
 */
export async function orderMetrics(db: Db) {
  const sum = async (status: OrderStatus[]) =>
    Number(
      (await db.order.aggregate({ where: { status: { in: status } }, _sum: { totalSom: true } }))._sum.totalSom ?? 0n,
    );
  const [awaitingReview, draftValue, approvedValue, deliveredValue, paid] = await Promise.all([
    db.order.count({ where: { status: 'READY_FOR_OWNER_REVIEW' } }),
    sum(DRAFT_VALUE),
    sum(['APPROVED_FOR_DELIVERY']),
    sum(['DELIVERED', 'CLOSED']),
    db.payment.aggregate({ _sum: { amountSom: true } }),
  ]);
  return { awaitingReview, draftValue, approvedValue, deliveredValue, paidSom: Number(paid._sum.amountSom ?? 0n) };
}
