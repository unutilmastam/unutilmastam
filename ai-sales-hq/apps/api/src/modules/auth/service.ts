import { createHmac, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { Config } from '../../config';
import { passwordProblem } from '../../domain/password-policy';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../../domain/totp';
import type { Role } from '../../generated/prisma/enums';
import { randomToken, SecretBox, safeEqual, sha256Hex } from '../../lib/crypto';
import type { Db } from '../../lib/db';
import { AppError, badRequest, conflict, forbidden, tooManyRequests, unauthorized } from '../../lib/errors';
import { writeAudit } from '../audit';

// OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1).
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const MFA_CHALLENGE_SECONDS = 300;
const RECOVERY_CODE_COUNT = 10;

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  totpEnabled: boolean;
}

export interface AuthContext {
  sessionId: string;
  csrfToken: string;
  user: SessionUser;
}

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

export type LoginResult =
  | { kind: 'session'; token: string; context: AuthContext }
  | { kind: 'totp_required'; challenge: string };

export class AuthService {
  readonly #totpBox: SecretBox;
  #dummyHash: Promise<string> | null = null;

  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.#totpBox = new SecretBox(config.APP_SECRET_KEY, 'totp-seed');
  }

  hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2);
  }

  // ---------- first owner ----------

  async needsSetup(): Promise<boolean> {
    return (await this.db.user.count()) === 0;
  }

  async createFirstOwner(
    input: { setupToken: string; username: string; displayName: string; password: string },
    client: ClientInfo,
  ): Promise<void> {
    const expected = this.config.SETUP_TOKEN;
    if (!expected) throw forbidden("Dastlabki sozlash o'chirilgan");
    if (!safeEqual(input.setupToken, expected)) {
      await writeAudit(this.db, { actor: { type: 'anonymous' }, action: 'setup.bad_token', ipAddress: client.ip });
      throw forbidden("Sozlash kodi noto'g'ri");
    }
    const problem = passwordProblem(input.password, input.username);
    if (problem) throw badRequest('weak_password', problem);
    const passwordHash = await this.hashPassword(input.password);
    await this.db.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) throw conflict('already_set_up', 'Egasi allaqachon yaratilgan');
      const user = await tx.user.create({
        data: { username: input.username, displayName: input.displayName, passwordHash, role: 'OWNER' },
      });
      await writeAudit(tx, {
        actor: { type: 'anonymous' },
        action: 'setup.owner_created',
        entityType: 'user',
        entityId: user.id,
        ipAddress: client.ip,
      });
    });
  }

  // ---------- login ----------

  async #assertNotThrottled(username: string, ip: string | null): Promise<void> {
    const since = new Date(this.now().getTime() - this.config.LOGIN_WINDOW_MINUTES * 60_000);
    const max = this.config.LOGIN_MAX_FAILURES;
    const byUser = await this.db.loginAttempt.count({
      where: { username, succeeded: false, createdAt: { gte: since } },
    });
    const byIp = ip
      ? await this.db.loginAttempt.count({ where: { ipAddress: ip, succeeded: false, createdAt: { gte: since } } })
      : 0;
    if (byUser >= max || byIp >= max * 4) {
      throw tooManyRequests(`Juda ko'p urinish. ${this.config.LOGIN_WINDOW_MINUTES} daqiqadan keyin qayta urining.`);
    }
  }

  async #recordAttempt(username: string, ip: string | null, succeeded: boolean): Promise<void> {
    await this.db.loginAttempt.create({ data: { username, ipAddress: ip, succeeded, createdAt: this.now() } });
  }

  async login(username: string, password: string, client: ClientInfo): Promise<LoginResult> {
    const name = username.trim().toLowerCase();
    await this.#assertNotThrottled(name, client.ip);
    const user = await this.db.user.findUnique({ where: { username: name } });
    // Verify against a dummy hash for unknown users so timing does not reveal usernames.
    this.#dummyHash ??= this.hashPassword(randomToken());
    const ok = await verify(user?.passwordHash ?? (await this.#dummyHash), password).catch(() => false);
    if (!user || !ok || !user.isActive) {
      await this.#recordAttempt(name, client.ip, false);
      await writeAudit(this.db, {
        actor: { type: 'anonymous' },
        action: 'auth.login_failed',
        details: { username: name },
        ipAddress: client.ip,
      });
      throw unauthorized("Login yoki parol noto'g'ri");
    }
    if (user.totpSecretEnc) {
      await writeAudit(this.db, {
        actor: { type: 'user', id: user.id },
        action: 'auth.password_ok_totp_pending',
        ipAddress: client.ip,
      });
      return { kind: 'totp_required', challenge: this.#signChallenge(user.id) };
    }
    await this.#recordAttempt(name, client.ip, true);
    return this.#startSession(user.id, client, 'password');
  }

  async completeTotpLogin(challenge: string | undefined, code: string, client: ClientInfo): Promise<LoginResult> {
    const userId = challenge ? this.#readChallenge(challenge) : null;
    if (!userId) throw new AppError(401, 'challenge_expired', 'Vaqt tugadi, qaytadan kiring');
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user?.isActive || !user.totpSecretEnc) throw unauthorized();
    await this.#assertNotThrottled(user.username, client.ip);

    const trimmed = code.trim();
    let method: 'totp' | 'recovery_code' | null = null;
    if (/^\d{6}$/.test(trimmed)) {
      const step = verifyTotp(
        this.#totpBox.open(user.totpSecretEnc),
        trimmed,
        Math.floor(this.now().getTime() / 1000),
        user.totpLastStep === null ? null : Number(user.totpLastStep),
      );
      if (step !== null) {
        // Conditional update makes a concurrent replay of the same code fail.
        const updated = await this.db.user.updateMany({
          where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: BigInt(step) } }] },
          data: { totpLastStep: BigInt(step) },
        });
        if (updated.count === 1) method = 'totp';
      }
    } else if (await this.#useRecoveryCode(user.id, trimmed)) {
      method = 'recovery_code';
    }

    if (!method) {
      await this.#recordAttempt(user.username, client.ip, false);
      await writeAudit(this.db, {
        actor: { type: 'user', id: user.id },
        action: 'auth.totp_failed',
        ipAddress: client.ip,
      });
      throw unauthorized("Kod noto'g'ri");
    }
    await this.#recordAttempt(user.username, client.ip, true);
    return this.#startSession(user.id, client, method);
  }

  async #useRecoveryCode(userId: string, code: string): Promise<boolean> {
    const normalized = code.toLowerCase().replace(/\s/g, '');
    if (!/^[a-z0-9]{5}-[a-z0-9]{5}$/.test(normalized)) return false;
    const codes = await this.db.totpRecoveryCode.findMany({ where: { userId, usedAt: null } });
    for (const c of codes) {
      if (await verify(c.codeHash, normalized).catch(() => false)) {
        const res = await this.db.totpRecoveryCode.updateMany({
          where: { id: c.id, usedAt: null },
          data: { usedAt: this.now() },
        });
        return res.count === 1;
      }
    }
    return false;
  }

  #signChallenge(userId: string): string {
    const exp = Math.floor(this.now().getTime() / 1000) + MFA_CHALLENGE_SECONDS;
    const payload = `${userId}.${exp}`;
    return `${payload}.${this.#mac(payload)}`;
  }

  #readChallenge(challenge: string): string | null {
    const [userId, exp, mac] = challenge.split('.');
    if (!userId || !exp || !mac) return null;
    if (!safeEqual(mac, this.#mac(`${userId}.${exp}`))) return null;
    if (Number(exp) < Math.floor(this.now().getTime() / 1000)) return null;
    return userId;
  }

  #mac(payload: string): string {
    return createHmac('sha256', this.config.APP_SECRET_KEY).update(`mfa:${payload}`).digest('base64url');
  }

  async #startSession(userId: string, client: ClientInfo, method: string): Promise<LoginResult> {
    const token = randomToken();
    const now = this.now();
    const session = await this.db.session.create({
      data: {
        tokenHash: sha256Hex(token),
        userId,
        csrfToken: randomToken(),
        ipAddress: client.ip,
        userAgent: client.userAgent?.slice(0, 255) ?? null,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + this.config.SESSION_ABSOLUTE_HOURS * 3_600_000),
      },
      include: { user: true },
    });
    await writeAudit(this.db, {
      actor: { type: 'user', id: userId },
      action: 'auth.login',
      details: { method },
      ipAddress: client.ip,
    });
    return {
      kind: 'session',
      token,
      context: { sessionId: session.id, csrfToken: session.csrfToken, user: toSessionUser(session.user) },
    };
  }

  // ---------- sessions ----------

  async resolveSession(token: string): Promise<AuthContext | null> {
    const session = await this.db.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt || !session.user.isActive) return null;
    const now = this.now();
    const idleLimit = session.lastSeenAt.getTime() + this.config.SESSION_IDLE_MINUTES * 60_000;
    if (session.expiresAt <= now || idleLimit <= now.getTime()) return null;
    // Sliding idle expiry; write at most once a minute.
    if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
      await this.db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    return { sessionId: session.id, csrfToken: session.csrfToken, user: toSessionUser(session.user) };
  }

  async logout(ctx: AuthContext, client: ClientInfo): Promise<void> {
    await this.db.session.update({ where: { id: ctx.sessionId }, data: { revokedAt: this.now() } });
    await writeAudit(this.db, {
      actor: { type: 'user', id: ctx.user.id },
      action: 'auth.logout',
      ipAddress: client.ip,
    });
  }

  async changePassword(ctx: AuthContext, current: string, next: string, client: ClientInfo): Promise<void> {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (!(await verify(user.passwordHash, current).catch(() => false))) {
      throw badRequest('wrong_password', "Joriy parol noto'g'ri");
    }
    const problem = passwordProblem(next, user.username);
    if (problem) throw badRequest('weak_password', problem);
    const passwordHash = await this.hashPassword(next);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      // Every other device is logged out.
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, NOT: { id: ctx.sessionId } },
        data: { revokedAt: this.now() },
      });
      await writeAudit(tx, {
        actor: { type: 'user', id: user.id },
        action: 'auth.password_changed',
        ipAddress: client.ip,
      });
    });
  }

  // ---------- TOTP enrolment ----------

  async beginTotpSetup(ctx: AuthContext): Promise<{ secret: string; uri: string }> {
    if (ctx.user.totpEnabled) throw conflict('totp_enabled', 'Ikki bosqichli kirish allaqachon yoqilgan');
    const secret = generateTotpSecret();
    await this.db.user.update({ where: { id: ctx.user.id }, data: { totpPendingEnc: this.#totpBox.seal(secret) } });
    return { secret, uri: otpauthUri(secret, ctx.user.username) };
  }

  async confirmTotpSetup(ctx: AuthContext, code: string, client: ClientInfo): Promise<string[]> {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (user.totpSecretEnc) throw conflict('totp_enabled', 'Ikki bosqichli kirish allaqachon yoqilgan');
    if (!user.totpPendingEnc) throw badRequest('no_pending_setup', 'Avval QR kodni oling');
    const secret = this.#totpBox.open(user.totpPendingEnc);
    const step = verifyTotp(secret, code.trim(), Math.floor(this.now().getTime() / 1000), null);
    if (step === null) throw badRequest('bad_code', "Kod noto'g'ri. Ilovadagi yangi kodni kiriting.");

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => recoveryCode());
    const hashes = await Promise.all(codes.map((c) => this.hashPassword(c)));
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          totpSecretEnc: user.totpPendingEnc,
          totpPendingEnc: null,
          totpEnabledAt: this.now(),
          totpLastStep: BigInt(step),
        },
      });
      await tx.totpRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.totpRecoveryCode.createMany({ data: hashes.map((codeHash) => ({ userId: user.id, codeHash })) });
      await writeAudit(tx, { actor: { type: 'user', id: user.id }, action: 'auth.totp_enabled', ipAddress: client.ip });
    });
    return codes;
  }
}

function recoveryCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function toSessionUser(u: {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  totpSecretEnc: string | null;
}): SessionUser {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role, totpEnabled: !!u.totpSecretEnc };
}
