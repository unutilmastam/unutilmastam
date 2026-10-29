import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody, requireAuth } from '../../http/guard';
import { conflict, notFound } from '../../lib/errors';
import type { IntegrationService } from '../integrations/service';
import { firestoreSettingsSchema } from '../integrations/service';
import type { CatalogService } from './service';
import type { CatalogSyncService } from './sync';

const idParam = z.object({ id: z.uuid() });
const priceBody = z.object({ type: z.enum(['RETAIL', 'WHOLESALE']), amount: z.number().int() });

export function catalogRoutes(
  app: FastifyInstance,
  deps: { catalog: CatalogService; sync: CatalogSyncService; integrations: IntegrationService },
) {
  const { catalog, sync, integrations } = deps;

  app.get('/catalog/products', { config: { access: 'catalog.view' } }, async (req) => {
    const q = req.query as { inactive?: string };
    return { products: await catalog.list(q.inactive === '1') };
  });

  app.get('/catalog/products/:id', { config: { access: 'catalog.view' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    return catalog.get(id);
  });

  app.post('/catalog/seed', { config: { access: 'prices.confirm' } }, async (req, reply) => {
    const count = await catalog.seed(requireAuth(req).user.id);
    return reply.code(201).send({ created: count });
  });

  app.post('/catalog/prices/:id/confirm', { config: { access: 'prices.confirm' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    return catalog.confirmPrice(id, requireAuth(req).user.id);
  });

  app.post('/catalog/products/:id/price', { config: { access: 'prices.confirm' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    const body = parseBody(priceBody, req.body);
    return catalog.setOwnerPrice(id, body.type, body.amount, requireAuth(req).user.id);
  });

  // ----- "Sayt bilan integratsiya" -----

  app.get('/integrations/firestore', { config: { access: 'integrations.manage' } }, async () =>
    serialize(await integrations.firestoreStatus()),
  );

  app.post('/integrations/firestore/test', { config: { access: 'integrations.manage' } }, async (req) =>
    integrations.testFirestore(requireAuth(req).user.id),
  );

  app.post('/integrations/firestore/settings', { config: { access: 'integrations.manage' } }, async (req) => {
    await integrations.updateFirestoreSettings(parseBody(firestoreSettingsSchema, req.body), requireAuth(req).user.id);
    return { ok: true };
  });

  app.post('/integrations/firestore/sync', { config: { access: 'integrations.manage' } }, async (req) =>
    serialize(await sync.run({ trigger: 'MANUAL', actorUserId: requireAuth(req).user.id })),
  );

  // Owner reviewed a held run and accepts the changes: fetch again and apply without the guard.
  app.post('/integrations/firestore/runs/:id/apply', { config: { access: 'integrations.manage' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    const status = await integrations.firestoreStatus();
    const latest = status.runs[0];
    if (!latest || latest.id !== id) throw notFound("Bu to'xtatilgan sinxronizatsiya eng oxirgisi emas");
    if (latest.status !== 'HELD') throw conflict('not_held', "Bu sinxronizatsiya to'xtatilmagan");
    return serialize(await sync.run({ trigger: 'OWNER_APPROVED', actorUserId: requireAuth(req).user.id, force: true }));
  });
}

/** BigInt-free JSON (Prisma rows can carry BigInt). */
function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
}
