import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../../http/guard';
import type { Db } from '../../lib/db';

export function notificationRoutes(app: FastifyInstance, deps: { db: Db; now: () => Date }) {
  const { db } = deps;

  app.get('/notifications', { config: { access: 'system.view' } }, async () => {
    const [items, unread] = await Promise.all([
      db.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      db.notification.count({ where: { readAt: null } }),
    ]);
    return { unread, items };
  });

  app.post('/notifications/:id/read', { config: { access: 'system.view' } }, async (req) => {
    const { id } = parseBody(z.object({ id: z.uuid() }), req.params);
    await db.notification.updateMany({ where: { id, readAt: null }, data: { readAt: deps.now() } });
    return { ok: true };
  });

  app.post('/notifications/read-all', { config: { access: 'system.view' } }, async () => {
    await db.notification.updateMany({ where: { readAt: null }, data: { readAt: deps.now() } });
    return { ok: true };
  });
}
