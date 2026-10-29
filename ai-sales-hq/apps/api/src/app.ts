import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import { makeGuard } from './http/guard';
import { type CatalogSource, firestoreSourceFromFile } from './integrations/firestore';
import type { Db } from './lib/db';
import { AppError } from './lib/errors';
import { loggerOptions } from './lib/logger';
import { authRoutes } from './modules/auth/routes';
import { AuthService } from './modules/auth/service';
import { catalogRoutes } from './modules/catalog/routes';
import { CatalogService } from './modules/catalog/service';
import { CatalogSyncService } from './modules/catalog/sync';
import { IntegrationService } from './modules/integrations/service';
import { notificationRoutes } from './modules/notifications/routes';
import { systemRoutes } from './modules/system/routes';

export interface AppDeps {
  config: Config;
  db: Db;
  now?: () => Date;
  // Directory with the static PWA build (apps/web/out). Served at "/" when present.
  webDir?: string;
  logger?: boolean;
  // Test/dev override for the Firestore catalog source; null = not configured.
  catalogSource?: CatalogSource | null;
}

export function catalogSourceFor(deps: AppDeps): () => CatalogSource | null {
  if (deps.catalogSource !== undefined) return () => deps.catalogSource ?? null;
  const file = deps.config.FIREBASE_SERVICE_ACCOUNT_FILE;
  const source = file ? firestoreSourceFromFile(file) : null;
  return () => source;
}

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const app = Fastify({
    logger: deps.logger === false ? false : loggerOptions(config.LOG_LEVEL),
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1_048_576,
    requestIdHeader: false,
    genReqId: (req) => {
      const sent = req.headers['x-request-id'];
      return typeof sent === 'string' && REQUEST_ID.test(sent) ? sent : randomUUID();
    },
  });

  app.decorateRequest('auth', null);
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Next.js static export inlines small bootstrap scripts.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Only over HTTPS; on a plain-http dev origin it would break every request.
        upgradeInsecureRequests: config.APP_ORIGIN.startsWith('https://') ? [] : null,
      },
    },
    hsts: config.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details, requestId: req.id },
      });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      // Fastify's own client errors (malformed JSON, body too large, ...).
      return reply
        .code(status)
        .send({ error: { code: 'bad_request', message: "So'rov noto'g'ri", requestId: req.id } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({
      error: { code: 'internal_error', message: 'Ichki xatolik. Keyinroq qayta urining.', requestId: req.id },
    });
  });

  const now = deps.now ?? (() => new Date());
  const auth = new AuthService(db, config, now);
  const getSource = catalogSourceFor(deps);
  const sync = new CatalogSyncService(db, getSource, now);
  const catalog = new CatalogService(db, now);
  const integrations = new IntegrationService(db, getSource, () => getSource() !== null, now);

  await app.register(
    async (api) => {
      api.addHook('preHandler', makeGuard(config, auth));
      systemRoutes(api, { db });
      authRoutes(api, { auth, config });
      catalogRoutes(api, { catalog, sync, integrations });
      notificationRoutes(api, { db, now });
      api.setNotFoundHandler((req, reply) =>
        reply.code(404).send({ error: { code: 'not_found', message: 'Topilmadi', requestId: req.id } }),
      );
    },
    { prefix: '/api/v1' },
  );

  if (deps.webDir && existsSync(deps.webDir)) {
    await app.register(fastifyStatic, { root: deps.webDir, extensions: ['html'], index: ['index.html'] });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Topilmadi', requestId: req.id } });
      }
      return reply.code(404).type('text/html').sendFile('404.html');
    });
  }

  return app;
}
