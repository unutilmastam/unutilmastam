import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { Config } from '../config';
import { can, type Permission } from '../domain/permissions';
import { safeEqual } from '../lib/crypto';
import { badRequest, forbidden, unauthorized } from '../lib/errors';
import type { AuthContext, AuthService, ClientInfo } from '../modules/auth/service';

/**
 * Route access, declared in each route's `config.access`. Routes without it require a session
 * (secure by default).
 *   'public'  — no session needed (health, login, setup)
 *   'session' — any signed-in user
 *   'webhook' — machine callers (Telegram); the route verifies its own shared secret
 *   Permission — signed-in user whose role has that permission
 */
export type Access = 'public' | 'session' | 'webhook' | Permission;

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: Access;
    // Reachable before TOTP enrolment (only the enrolment flow itself, me, logout).
    allowWithoutTotp?: boolean;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    // Every route with its declared access; read by the security tests (route permission matrix).
    routeTable: { method: string; url: string; access: Access }[];
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function sessionCookieName(config: Config): string {
  // __Host- forces Secure, path=/ and no Domain — only possible over HTTPS.
  return config.APP_ORIGIN.startsWith('https://') ? '__Host-hq_session' : 'hq_session';
}

export const MFA_COOKIE = 'hq_mfa';

export function clientInfo(req: FastifyRequest): ClientInfo {
  const ua = req.headers['user-agent'];
  return { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua : null };
}

export function makeGuard(config: Config, auth: AuthService) {
  const cookieName = sessionCookieName(config);
  const origin = new URL(config.APP_ORIGIN).origin;

  return async function guard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    req.auth = null;
    const access = req.routeOptions.config?.access ?? 'session';
    if (access === 'webhook') return;
    const mutating = !SAFE_METHODS.has(req.method);

    // CSRF layer 1: a browser always sends Origin on cross-site POSTs; refuse foreign ones.
    if (mutating) {
      const sent = req.headers.origin;
      if (sent !== undefined && sent !== origin) throw forbidden("So'rov boshqa saytdan keldi");
    }

    const token = req.cookies[cookieName];
    if (token) req.auth = await auth.resolveSession(token);

    if (access === 'public') {
      // Login and setup forms: no session yet, so require the Origin header itself.
      if (mutating && req.headers.origin === undefined) throw forbidden("So'rov manbasi noma'lum");
      return;
    }
    if (!req.auth) throw unauthorized();

    // CSRF layer 2: double-submit — the token from /auth/me must come back in a header.
    if (mutating) {
      const header = req.headers['x-csrf-token'];
      if (typeof header !== 'string' || !safeEqual(header, req.auth.csrfToken)) {
        throw forbidden('CSRF tekshiruvi muvaffaqiyatsiz. Sahifani yangilang.');
      }
    }

    if (config.TOTP_REQUIRED && !req.auth.user.totpEnabled && !req.routeOptions.config?.allowWithoutTotp) {
      throw forbidden('Avval ikki bosqichli kirishni yoqing');
    }
    if (access !== 'session' && !can(req.auth.user.role, access)) throw forbidden();
  };
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function parseBody<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const res = schema.safeParse(value ?? {});
  if (!res.success) {
    throw badRequest(
      'validation_error',
      "Ma'lumotlar noto'g'ri",
      res.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return res.data;
}
