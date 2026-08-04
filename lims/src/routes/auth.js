import express from 'express';
import crypto from 'node:crypto';
import qrcode from 'qrcode';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { audit, clientIp, computerName } from '../lib/audit.js';
import {
  checkPassword,
  hashPassword,
  rateLimit,
  requireAuth,
  signToken,
} from '../lib/auth.js';
import { generateSecret, provisioningUri, verifyToken } from '../lib/totp.js';
import { HttpError, required, wrap } from '../lib/http.js';

export const router = express.Router();

/**
 * POST /api/auth/login
 * body: { username, password, totp?, computerName? }
 */
router.post(
  '/login',
  rateLimit({ windowMs: 60_000, max: 10 }),
  wrap(async (req, res) => {
    required(req.body, ['username', 'password']);
    const { username, password, totp } = req.body;
    const station = req.body.computerName || computerName(req);

    const user = await one('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);

    // Foydalanuvchi topilmasa ham bir xil vaqt ketishi uchun tekshiruvni bajaramiz.
    const ok = user ? await checkPassword(password, user.password_hash) : false;

    if (!user || !ok) {
      if (user) {
        const attempts = user.failed_attempts + 1;
        const lock =
          attempts >= config.maxFailedLogins
            ? new Date(Date.now() + config.lockMinutes * 60_000)
            : null;
        await query('UPDATE users SET failed_attempts = $2, locked_until = $3 WHERE id = $1', [
          user.id,
          lock ? 0 : attempts,
          lock,
        ]);
      }
      await audit(
        { headers: req.headers, ip: req.ip, socket: req.socket, user: null },
        {
          action: 'LOGIN_FAILED',
          entity: 'user',
          entityId: user?.id ?? null,
          userName: username,
          computerName: station,
          description: `Muvaffaqiyatsiz kirish urinishi (${station})`,
        },
      );
      throw new HttpError(401, 'Login yoki parol noto‘g‘ri');
    }

    if (!user.is_active) throw new HttpError(403, 'Hisob faolsizlantirilgan');
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60_000);
      throw new HttpError(423, `Hisob vaqtincha bloklangan. ${mins} daqiqadan so‘ng urinib ko‘ring.`);
    }

    // Ikki bosqichli tekshiruv
    if (user.totp_enabled) {
      if (!totp) return res.status(200).json({ totpRequired: true });
      if (!verifyToken(user.totp_secret, totp)) {
        await audit({ headers: req.headers, ip: req.ip, socket: req.socket, user: null }, {
          action: 'LOGIN_FAILED',
          entity: 'user',
          entityId: user.id,
          userName: user.full_name,
          computerName: station,
          description: 'Ikki bosqichli kod noto‘g‘ri',
        });
        throw new HttpError(401, 'Tasdiqlash kodi noto‘g‘ri');
      }
    }

    const sessionId = crypto.randomUUID();
    await query(
      `INSERT INTO sessions (id, user_id, computer_name, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5)`,
      [sessionId, user.id, station, clientIp(req), req.headers['user-agent'] || null],
    );
    await query(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1',
      [user.id],
    );

    const token = signToken({ uid: user.id, sid: sessionId, role: user.role });
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: config.sessionHours * 3600 * 1000,
    });

    // Sessiyada qayd etilgan ish stansiyasi nomi auditda ham aynan shunday bo'lsin.
    req.user = { id: user.id, full_name: user.full_name, sessionId, computerName: station };
    await audit(req, {
      action: 'LOGIN',
      entity: 'user',
      entityId: user.id,
      computerName: station,
      description: `Tizimga kirdi (${station})`,
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        branch_id: user.branch_id,
        must_change_pw: user.must_change_pw,
        totp_enabled: user.totp_enabled,
      },
      lab: { name: config.labName, currency: config.currency },
    });
  }),
);

router.post(
  '/logout',
  requireAuth,
  wrap(async (req, res) => {
    await query('UPDATE sessions SET logout_at = now() WHERE id = $1', [req.user.sessionId]);
    await audit(req, { action: 'LOGOUT', entity: 'user', entityId: req.user.id, description: 'Tizimdan chiqdi' });
    res.clearCookie('token');
    res.json({ ok: true });
  }),
);

/** Joriy foydalanuvchi ma'lumoti (sahifa yangilanganda). */
router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const u = await one(
      `SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.must_change_pw,
              u.totp_enabled, b.name AS branch_name
         FROM users u LEFT JOIN branches b ON b.id = u.branch_id
        WHERE u.id = $1`,
      [req.user.id],
    );
    res.json({ user: u, lab: { name: config.labName, currency: config.currency } });
  }),
);

/** Parolni o'zgartirish (o'zi uchun). */
router.post(
  '/change-password',
  requireAuth,
  wrap(async (req, res) => {
    required(req.body, ['currentPassword', 'newPassword']);
    const { currentPassword, newPassword } = req.body;
    if (String(newPassword).length < 8) throw new HttpError(400, 'Yangi parol kamida 8 belgidan iborat bo‘lsin');

    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!(await checkPassword(currentPassword, user.password_hash)))
      throw new HttpError(401, 'Joriy parol noto‘g‘ri');

    await query('UPDATE users SET password_hash = $2, must_change_pw = false WHERE id = $1', [
      user.id,
      await hashPassword(newPassword),
    ]);
    await audit(req, {
      action: 'UPDATE',
      entity: 'user',
      entityId: user.id,
      description: 'Parolini o‘zgartirdi',
    });
    res.json({ ok: true });
  }),
);

/** Ikki bosqichli loginni yoqish: 1-qadam — QR olish. */
router.post(
  '/2fa/setup',
  requireAuth,
  wrap(async (req, res) => {
    const secret = generateSecret();
    await query('UPDATE users SET totp_secret = $2 WHERE id = $1', [req.user.id, secret]);
    const uri = provisioningUri(secret, req.user.username, config.labName.replace(/[:\s]+/g, '_'));
    res.json({ secret, uri, qr: await qrcode.toDataURL(uri, { margin: 1, width: 220 }) });
  }),
);

/** 2-qadam — ilovadagi kodni kiritib tasdiqlash. */
router.post(
  '/2fa/enable',
  requireAuth,
  wrap(async (req, res) => {
    required(req.body, ['totp']);
    const user = await one('SELECT totp_secret FROM users WHERE id = $1', [req.user.id]);
    if (!user?.totp_secret) throw new HttpError(400, 'Avval sozlashni boshlang');
    if (!verifyToken(user.totp_secret, req.body.totp)) throw new HttpError(400, 'Kod noto‘g‘ri');

    await query('UPDATE users SET totp_enabled = true WHERE id = $1', [req.user.id]);
    await audit(req, {
      action: 'UPDATE',
      entity: 'user',
      entityId: req.user.id,
      description: 'Ikki bosqichli loginni yoqdi',
      newData: { totp_enabled: true },
    });
    res.json({ ok: true });
  }),
);

router.post(
  '/2fa/disable',
  requireAuth,
  wrap(async (req, res) => {
    required(req.body, ['password']);
    const user = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await checkPassword(req.body.password, user.password_hash)))
      throw new HttpError(401, 'Parol noto‘g‘ri');
    await query('UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1', [req.user.id]);
    await audit(req, {
      action: 'UPDATE',
      entity: 'user',
      entityId: req.user.id,
      description: 'Ikki bosqichli loginni o‘chirdi',
      oldData: { totp_enabled: true },
      newData: { totp_enabled: false },
    });
    res.json({ ok: true });
  }),
);
