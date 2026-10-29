import type { FastifyInstance, FastifyReply } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import type { Config } from '../../config';
import { can, PERMISSIONS, type Permission } from '../../domain/permissions';
import { clientInfo, MFA_COOKIE, parseBody, requireAuth, sessionCookieName } from '../../http/guard';
import type { AuthContext, AuthService } from './service';

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,64}$/, 'Login 3–64 belgi: lotin harflari, raqam, . _ -');

const setupBody = z.object({
  setupToken: z.string().min(1).max(200),
  username,
  displayName: z.string().trim().min(2).max(120),
  password: z.string().min(1).max(200),
});
const loginBody = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) });
const codeBody = z.object({ code: z.string().trim().min(6).max(20) });
const passwordBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });

export function authRoutes(app: FastifyInstance, deps: { auth: AuthService; config: Config }) {
  const { auth, config } = deps;
  const secure = config.APP_ORIGIN.startsWith('https://');
  const cookieName = sessionCookieName(config);

  const setSession = (reply: FastifyReply, token: string) =>
    reply.setCookie(cookieName, token, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: config.SESSION_ABSOLUTE_HOURS * 3600,
    });

  const me = (ctx: AuthContext) => ({
    user: ctx.user,
    csrfToken: ctx.csrfToken,
    mustEnrollTotp: config.TOTP_REQUIRED && !ctx.user.totpEnabled,
    permissions: (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(ctx.user.role, p)),
  });

  app.get('/setup/status', { config: { access: 'public' } }, async () => ({
    needsSetup: await auth.needsSetup(),
    setupEnabled: !!config.SETUP_TOKEN,
  }));

  app.post('/setup', { config: { access: 'public' } }, async (req, reply) => {
    const body = parseBody(setupBody, req.body);
    await auth.createFirstOwner(body, clientInfo(req));
    return reply.code(201).send({ ok: true });
  });

  app.post('/auth/login', { config: { access: 'public' } }, async (req, reply) => {
    const body = parseBody(loginBody, req.body);
    const result = await auth.login(body.username, body.password, clientInfo(req));
    if (result.kind === 'totp_required') {
      reply.setCookie(MFA_COOKIE, result.challenge, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 300,
      });
      return { status: 'totp_required' };
    }
    setSession(reply, result.token);
    return { status: 'ok', ...me(result.context) };
  });

  app.post('/auth/login/totp', { config: { access: 'public' } }, async (req, reply) => {
    const body = parseBody(codeBody, req.body);
    const result = await auth.completeTotpLogin(req.cookies[MFA_COOKIE], body.code, clientInfo(req));
    reply.clearCookie(MFA_COOKIE, { path: '/api/v1/auth' });
    if (result.kind !== 'session') throw new Error('unexpected login state');
    setSession(reply, result.token);
    return { status: 'ok', ...me(result.context) };
  });

  app.get('/auth/me', { config: { access: 'session', allowWithoutTotp: true } }, async (req) => me(requireAuth(req)));

  app.post('/auth/logout', { config: { access: 'session', allowWithoutTotp: true } }, async (req, reply) => {
    await auth.logout(requireAuth(req), clientInfo(req));
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });

  app.post('/auth/password', { config: { access: 'session' } }, async (req) => {
    const body = parseBody(passwordBody, req.body);
    await auth.changePassword(requireAuth(req), body.currentPassword, body.newPassword, clientInfo(req));
    return { ok: true };
  });

  app.post('/auth/totp/setup', { config: { access: 'session', allowWithoutTotp: true } }, async (req, reply) => {
    const { secret, uri } = await auth.beginTotpSetup(requireAuth(req));
    const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    reply.header('cache-control', 'no-store');
    return { secret, uri, qrSvg };
  });

  app.post('/auth/totp/confirm', { config: { access: 'session', allowWithoutTotp: true } }, async (req, reply) => {
    const body = parseBody(codeBody, req.body);
    const recoveryCodes = await auth.confirmTotpSetup(requireAuth(req), body.code, clientInfo(req));
    reply.header('cache-control', 'no-store');
    return { recoveryCodes };
  });
}
