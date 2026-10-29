import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import { makeGuard } from './http/guard';
import type { AiDrafter } from './integrations/ai';
import { type CatalogSource, firestoreSourceFromFile } from './integrations/firestore';
import { type PlacesClient, placesClient } from './integrations/places';
import type { Db } from './lib/db';
import { AppError } from './lib/errors';
import { loggerOptions } from './lib/logger';
import { agentRoutes } from './modules/agents/routes';
import { AgentService } from './modules/agents/service';
import { authRoutes } from './modules/auth/routes';
import { AuthService } from './modules/auth/service';
import { catalogRoutes } from './modules/catalog/routes';
import { CatalogService } from './modules/catalog/service';
import { CatalogSyncService } from './modules/catalog/sync';
import { dashboardRoutes } from './modules/dashboard/routes';
import { DashboardService } from './modules/dashboard/service';
import { DiscoveryService, matchSettingsFrom } from './modules/discovery/service';
import { IntegrationService } from './modules/integrations/service';
import { notificationRoutes } from './modules/notifications/routes';
import { orderRoutes } from './modules/orders/routes';
import { OrderService } from './modules/orders/service';
import { prospectRoutes } from './modules/prospects/routes';
import { ProspectService } from './modules/prospects/service';
import { type AiPing, AiProviderService, type DrafterFactory } from './modules/sales/ai-provider';
import { salesRoutes } from './modules/sales/routes';
import { SalesService } from './modules/sales/service';
import { systemRoutes } from './modules/system/routes';
import { type TelegramApi, telegramApi } from './modules/telegram/client';
import { telegramRoutes } from './modules/telegram/routes';
import { TelegramService } from './modules/telegram/service';

export interface AppDeps {
  config: Config;
  db: Db;
  now?: () => Date;
  // Directory with the static PWA build (apps/web/out). Served at "/" when present.
  webDir?: string;
  logger?: boolean;
  // Test/dev override for the Firestore catalog source; null = not configured.
  catalogSource?: CatalogSource | null;
  // Test override for the Telegram Bot API.
  telegramApi?: TelegramApi | null;
  // Test override for Google Places; null = not configured.
  places?: PlacesClient | null;
  // Test override for the AI drafters; null = not configured (templates are used).
  drafters?: { fast: AiDrafter | null; strong: AiDrafter | null };
  // Test override for the key check and the drafter built from a key saved in the app.
  ai?: { ping?: AiPing; factory?: DrafterFactory };
}

export function aiProviderFor(deps: Pick<AppDeps, 'config' | 'db' | 'drafters' | 'ai'>, now: () => Date) {
  return new AiProviderService(deps.db, deps.config, now, { ...deps.ai, fixed: deps.drafters });
}

export function placesFor(deps: Pick<AppDeps, 'config' | 'places'>): PlacesClient | null {
  if (deps.places !== undefined) return deps.places;
  return deps.config.GOOGLE_PLACES_API_KEY ? placesClient(deps.config.GOOGLE_PLACES_API_KEY) : null;
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
  const agents = new AgentService(db, now);
  const tgApi =
    deps.telegramApi !== undefined
      ? deps.telegramApi
      : config.TELEGRAM_BOT_TOKEN
        ? telegramApi(config.TELEGRAM_BOT_TOKEN)
        : null;
  const telegram = new TelegramService(db, config, tgApi, agents, now);
  const prospects = new ProspectService(db, now, matchSettingsFrom(db));
  const discovery = new DiscoveryService(db, prospects, getSource, placesFor(deps), now);
  const ai = aiProviderFor(deps, now);
  const sales = new SalesService(db, prospects, () => ai.drafters(), now);
  const orders = new OrderService(db, prospects, sales, now);

  await app.register(
    async (api) => {
      api.addHook('preHandler', makeGuard(config, auth));
      systemRoutes(api, { db });
      authRoutes(api, { auth, config });
      catalogRoutes(api, { catalog, sync, integrations });
      notificationRoutes(api, { db, now });
      agentRoutes(api, { db, agents, now });
      dashboardRoutes(api, { dashboard: new DashboardService(db, now, () => ai.configured()), agents });
      telegramRoutes(api, { telegram, config });
      prospectRoutes(api, { db, prospects, discovery, now });
      salesRoutes(api, { sales, ai });
      orderRoutes(api, { orders });
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
