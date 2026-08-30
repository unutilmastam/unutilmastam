import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import qrcode from 'qrcode';
import { config } from '../config.js';
import { many, one, query } from '../db.js';
import { audit, clientIp, computerName } from '../lib/audit.js';
import {
  checkPassword,
  hashPassword,
  rateLimit,
  requireAuth,
  signToken,
} from '../lib/auth.js';
import { generateSecret, provisioningUri, verifyToken } from '../lib/totp.js';
import { HttpError, notFound, required, wrap } from '../lib/http.js';

export const router = express.Router();

/**
 * Muvaffaqiyatli kirishdan keyingi umumiy qism: sessiya ochiladi, token
 * beriladi va audit yoziladi. Parol bilan ham, PIN bilan ham shu ishlatiladi —
 * shunda ikkala usul sessiyalar ro'yxatida bir xil ko'rinadi.
 */
async function startSession(req, res, user, station, { method }) {
  const sessionId = crypto.randomUUID();
  await query(
    `INSERT INTO sessions (id, user_id, computer_name, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5)`,
    [sessionId, user.id, station, clientIp(req), req.headers['user-agent'] || null],
  );
  await query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL,
            pin_failed_attempts = 0, pin_locked_until = NULL, last_login_at = now()
      WHERE id = $1`,
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
    description: `Tizimga kirdi (${station}, ${method === 'pin' ? 'PIN kod' : 'parol'})`,
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      branch_id: user.branch_id,
      must_change_pw: user.must_change_pw,
      totp_enabled: user.totp_enabled,
      has_pin: !!user.pin_hash,
      has_photo: !!user.photo_path,
      photo_updated_at: user.photo_updated_at,
    },
    lab: { name: config.labName, currency: config.currency },
  };
}

/**
 * POST /api/auth/login
 * body: { username, password, totp?, computerName? }
 */
router.post(
  '/login',
  rateLimit({ windowMs: 60_000, max: config.loginRateMax }),
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

    res.json(await startSession(req, res, user, station, { method: 'password' }));
  }),
);

// ---------------------------------------------------------------------------
// PIN kod bilan kirish
// ---------------------------------------------------------------------------

/**
 * Kirish oynasidagi xodimlar ro'yxati (rasm bilan). Avtorizatsiyasiz —
 * xodim hali kirmagan. Shu sababli faqat eng zarur maydonlar beriladi:
 * login, telefon, rol huquqlari va boshqa hech narsa chiqmaydi.
 */
router.get(
  '/pin-users',
  rateLimit({ windowMs: 60_000, max: 60 }),
  wrap(async (_req, res) => {
    if (!config.pin.enabled) return res.json({ enabled: false, items: [] });
    const items = await many(
      `SELECT id, full_name, role, (photo_path IS NOT NULL) AS has_photo,
              photo_updated_at
         FROM users
        WHERE is_active AND pin_hash IS NOT NULL
        ORDER BY full_name`,
    );
    res.json({ enabled: true, minLength: config.pin.minLength, items });
  }),
);

/** Kirish oynasi uchun xodim rasmi (faqat PIN qo'ygan faol xodimlarniki). */
router.get(
  '/pin-users/:id/photo',
  rateLimit({ windowMs: 60_000, max: 120 }),
  wrap(async (req, res) => {
    if (!config.pin.enabled) throw notFound('Rasm topilmadi');
    const u = await one(
      `SELECT photo_path FROM users
        WHERE id = $1 AND is_active AND pin_hash IS NOT NULL AND photo_path IS NOT NULL`,
      [req.params.id],
    );
    if (!u || !fs.existsSync(u.photo_path)) throw notFound('Rasm topilmadi');
    res.sendFile(u.photo_path);
  }),
);

/**
 * PIN bilan kirish. Xodim avval o'z rasmini tanlaydi, keyin PIN teradi —
 * shuning uchun user_id ham keladi va bloklash har bir xodim uchun alohida
 * hisoblanadi (bir xodimning PIN'ini terib boshqasini bloklab bo'lmaydi).
 */
router.post(
  '/login-pin',
  rateLimit({ windowMs: 60_000, max: config.loginRateMax * 2 }),
  wrap(async (req, res) => {
    if (!config.pin.enabled) throw new HttpError(403, 'PIN bilan kirish o‘chirilgan');
    required(req.body, ['user_id', 'pin']);
    const station = req.body.computerName || computerName(req);
    const pin = String(req.body.pin);

    const user = await one('SELECT * FROM users WHERE id = $1', [req.body.user_id]);
    const ok = user?.pin_hash ? await checkPassword(pin, user.pin_hash) : false;

    if (!user || !user.pin_hash || !ok) {
      if (user?.pin_hash) {
        const attempts = user.pin_failed_attempts + 1;
        const lock =
          attempts >= config.pin.maxFailed
            ? new Date(Date.now() + config.pin.lockMinutes * 60_000)
            : null;
        await query('UPDATE users SET pin_failed_attempts = $2, pin_locked_until = $3 WHERE id = $1', [
          user.id,
          lock ? 0 : attempts,
          lock,
        ]);
      }
      await audit({ headers: req.headers, ip: req.ip, socket: req.socket, user: null }, {
        action: 'LOGIN_FAILED',
        entity: 'user',
        entityId: user?.id ?? null,
        userName: user?.full_name ?? null,
        computerName: station,
        description: `PIN kod noto‘g‘ri (${station})`,
      });
      throw new HttpError(401, 'PIN kod noto‘g‘ri');
    }

    if (!user.is_active) throw new HttpError(403, 'Hisob faolsizlantirilgan');
    if (user.pin_locked_until && new Date(user.pin_locked_until) > new Date()) {
      const mins = Math.ceil((new Date(user.pin_locked_until) - Date.now()) / 60_000);
      throw new HttpError(423, `PIN vaqtincha bloklangan. ${mins} daqiqadan so‘ng urinib ko‘ring yoki parol bilan kiring.`);
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new HttpError(423, 'Hisob vaqtincha bloklangan');
    }

    // Ikki bosqichli tekshiruv PIN uchun ham amal qiladi.
    if (user.totp_enabled) {
      if (!req.body.totp) return res.status(200).json({ totpRequired: true });
      if (!verifyToken(user.totp_secret, req.body.totp)) {
        await audit({ headers: req.headers, ip: req.ip, socket: req.socket, user: null }, {
          action: 'LOGIN_FAILED',
          entity: 'user',
          entityId: user.id,
          userName: user.full_name,
          computerName: station,
          description: 'Ikki bosqichli kod noto‘g‘ri (PIN)',
        });
        throw new HttpError(401, 'Tasdiqlash kodi noto‘g‘ri');
      }
    }

    res.json(await startSession(req, res, user, station, { method: 'pin' }));
  }),
);

/** O'z PIN kodini qo'yish yoki almashtirish (parol bilan tasdiqlanadi). */
router.post(
  '/set-pin',
  requireAuth,
  wrap(async (req, res) => {
    required(req.body, ['currentPassword', 'pin']);
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!(await checkPassword(req.body.currentPassword, user.password_hash)))
      throw new HttpError(401, 'Joriy parol noto‘g‘ri');

    await setUserPin(user.id, req.body.pin);
    await audit(req, {
      action: 'UPDATE',
      entity: 'user',
      entityId: user.id,
      description: user.pin_hash ? 'PIN kodini almashtirdi' : 'PIN kod o‘rnatdi',
      newData: { pin_set: true },
    });
    res.json({ ok: true });
  }),
);

/** O'z PIN kodini o'chirish. */
router.post(
  '/remove-pin',
  requireAuth,
  wrap(async (req, res) => {
    await query(
      `UPDATE users SET pin_hash = NULL, pin_set_at = NULL,
              pin_failed_attempts = 0, pin_locked_until = NULL
        WHERE id = $1`,
      [req.user.id],
    );
    await audit(req, {
      action: 'UPDATE',
      entity: 'user',
      entityId: req.user.id,
      description: 'PIN kodini o‘chirdi',
      oldData: { pin_set: true },
      newData: { pin_set: false },
    });
    res.json({ ok: true });
  }),
);

/**
 * PIN ni bazaga yozish. Faqat raqamlar; uzunligi sozlamadagidan kam bo'lmasin.
 * Ketma-ket (1234) va bir xil (0000) raqamlar taqiqlanadi — PIN qisqa,
 * shuning uchun eng ko'p terib ko'riladigan variantlarni yopamiz.
 */
export async function setUserPin(userId, rawPin) {
  const pin = String(rawPin).trim();
  const { minLength, maxLength } = config.pin;
  if (!/^\d+$/.test(pin)) throw new HttpError(400, 'PIN faqat raqamlardan iborat bo‘lsin');
  if (pin.length < minLength || pin.length > maxLength)
    throw new HttpError(400, `PIN ${minLength}–${maxLength} ta raqamdan iborat bo‘lsin`);
  if (/^(\d)\1*$/.test(pin)) throw new HttpError(400, 'Bir xil raqamlardan iborat PIN ishlatilmaydi');
  if (isSequential(pin)) throw new HttpError(400, 'Ketma-ket raqamlardan iborat PIN ishlatilmaydi');

  await query(
    `UPDATE users SET pin_hash = $2, pin_set_at = now(),
            pin_failed_attempts = 0, pin_locked_until = NULL
      WHERE id = $1`,
    [userId, await hashPassword(pin)],
  );
}

function isSequential(pin) {
  let up = true;
  let down = true;
  for (let i = 1; i < pin.length; i++) {
    const d = Number(pin[i]) - Number(pin[i - 1]);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  return up || down;
}

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
              u.totp_enabled, (u.pin_hash IS NOT NULL) AS has_pin,
              (u.photo_path IS NOT NULL) AS has_photo, u.photo_updated_at,
              b.name AS branch_name
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
