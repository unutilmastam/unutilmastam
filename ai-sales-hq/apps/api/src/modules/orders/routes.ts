import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ORDER_STATUSES } from '../../domain/orders';
import { can } from '../../domain/permissions';
import { parseBody, requireAuth } from '../../http/guard';
import { ORDER_DECISIONS, type OrderService } from './service';

const idParam = z.object({ id: z.uuid() });
const items = z
  .array(
    z.object({
      productId: z.uuid(),
      // Totals are always computed on the server from confirmed prices; the client sends quantities only.
      quantity: z.number().int().min(1).max(10_000),
      priceType: z.enum(['RETAIL', 'WHOLESALE']),
    }),
  )
  .max(50);
const text = (max: number) => z.string().trim().max(max);

export function orderRoutes(app: FastifyInstance, deps: { orders: OrderService }) {
  const { orders } = deps;
  const who = (req: Parameters<typeof requireAuth>[0]) => {
    const { user } = requireAuth(req);
    return { actor: { type: 'user' as const, id: user.id }, isOwner: can(user.role, 'orders.approve') };
  };

  app.get('/orders', { config: { access: 'orders.view' } }, async (req) => {
    const q = parseBody(
      z.object({ status: z.enum(ORDER_STATUSES).optional(), prospectId: z.uuid().optional() }),
      req.query,
    );
    return { orders: await orders.list(q) };
  });

  app.get('/orders/products', { config: { access: 'orders.view' } }, async () => ({
    products: await orders.orderableProducts(),
  }));

  app.get('/orders/:id', { config: { access: 'orders.view' } }, async (req) =>
    orders.get(parseBody(idParam, req.params).id),
  );

  app.post('/orders', { config: { access: 'orders.edit' } }, async (req) => {
    const body = parseBody(
      z.object({
        prospectId: z.uuid(),
        items,
        deliveryAddress: text(300).optional(),
        contactPhone: text(30).optional(),
        contactName: text(120).optional(),
        notes: text(2000).optional(),
      }),
      req.body,
    );
    const o = await orders.create(body, who(req).actor);
    return orders.get(o.id);
  });

  app.post('/orders/:id/items', { config: { access: 'orders.edit' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    await orders.replaceItems(id, parseBody(z.object({ items }), req.body).items, who(req).actor);
    return orders.get(id);
  });

  app.post('/orders/:id/details', { config: { access: 'orders.edit' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    const d = parseBody(
      z.object({
        deliveryAddress: text(300).nullable().optional(),
        contactPhone: text(30).nullable().optional(),
        contactName: text(120).nullable().optional(),
        notes: text(2000).nullable().optional(),
        requestedDeliveryAt: z.iso.datetime().nullable().optional(),
      }),
      req.body,
    );
    await orders.updateDetails(
      id,
      {
        ...d,
        requestedDeliveryAt:
          d.requestedDeliveryAt === undefined
            ? undefined
            : d.requestedDeliveryAt
              ? new Date(d.requestedDeliveryAt)
              : null,
      },
      who(req).actor,
    );
    return orders.get(id);
  });

  app.post('/orders/:id/request-confirmation', { config: { access: 'orders.edit' } }, async (req) => {
    const { actor, isOwner } = who(req);
    return orders.requestConfirmation(parseBody(idParam, req.params).id, actor, isOwner);
  });

  app.post('/orders/:id/customer-confirmed', { config: { access: 'orders.edit' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    const { note } = parseBody(z.object({ note: text(500).min(1) }), req.body);
    const { actor, isOwner } = who(req);
    await orders.customerConfirmed(id, note, actor, isOwner);
    return orders.get(id);
  });

  // Approve/reject/hold are owner-only; the domain rejects them for staff (OWNER_ONLY).
  app.post('/orders/:id/decision', { config: { access: 'orders.edit' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    const body = parseBody(z.object({ decision: z.enum(ORDER_DECISIONS), note: text(500).optional() }), req.body);
    const { actor, isOwner } = who(req);
    await orders.ownerDecision(id, body.decision, body.note || null, actor, isOwner);
    return orders.get(id);
  });

  app.post('/orders/:id/delivered', { config: { access: 'orders.deliver' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    const { actor, isOwner } = who(req);
    await orders.markDelivered(id, actor, isOwner);
    return orders.get(id);
  });

  app.post('/orders/:id/close', { config: { access: 'orders.deliver' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    const { actor, isOwner } = who(req);
    await orders.close(id, actor, isOwner);
    return orders.get(id);
  });

  app.post('/orders/:id/payments', { config: { access: 'payments.record' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    const body = parseBody(
      z.object({ amountSom: z.number().int().positive().max(10_000_000_000), note: text(300).optional() }),
      req.body,
    );
    await orders.recordPayment(id, body.amountSom, body.note || null, requireAuth(req).user.id);
    return orders.get(id);
  });
}
