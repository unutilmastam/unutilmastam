import type { FastifyInstance } from 'fastify';
import type { Db } from '../../lib/db';

export const SERVICE_NAME = "Unutilmas Ta'm AI Sales HQ";

export function systemRoutes(app: FastifyInstance, deps: { db: Db }) {
  app.get('/health', { config: { access: 'public' } }, async () => ({ status: 'ok', service: SERVICE_NAME }));

  app.get('/ready', { config: { access: 'public' } }, async (req, reply) => {
    try {
      await deps.db.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'ok' };
    } catch (err) {
      req.log.warn({ err }, 'readiness check failed');
      return reply.code(503).send({ status: 'not_ready', database: 'error' });
    }
  });
}
