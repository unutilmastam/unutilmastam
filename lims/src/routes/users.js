import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { many, one, query } from '../db.js';
import { audit, diff } from '../lib/audit.js';
import { ROLES, hashPassword, requireAuth, requireRole } from '../lib/auth.js';
import { HttpError, conflict, notFound, required, wrap } from '../lib/http.js';
import { config } from '../config.js';
import { setUserPin } from './auth.js';

export const router = express.Router();

// Xodim rasmi: faqat oddiy rasm formatlari va kichik hajm.
const PHOTO_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxPhotoBytes, files: 1 },
});

router.use(requireAuth);

/** Xodimlar ro'yxati — faqat administrator. */
router.get(
  '/',
  requireRole('admin'),
  wrap(async (req, res) => {
    const rows = await many(
      `SELECT u.id, u.username, u.full_name, u.role, u.phone, u.is_active,
              u.totp_enabled, u.last_login_at, u.created_at, b.name AS branch_name,
              (u.photo_path IS NOT NULL) AS has_photo, u.photo_updated_at,
              (u.pin_hash IS NOT NULL) AS has_pin, u.pin_set_at,
              (u.pin_locked_until IS NOT NULL AND u.pin_locked_until > now()) AS pin_locked,
              (SELECT count(*) FROM sessions s
                WHERE s.user_id = u.id AND s.logout_at IS NULL
                  AND s.last_seen_at > now() - ($1 || ' minutes')::interval) > 0 AS is_online
         FROM users u LEFT JOIN branches b ON b.id = u.branch_id
        ORDER BY u.is_active DESC, u.full_name`,
      [String(config.onlineWindowMinutes)],
    );
    res.json({ items: rows });
  }),
);

/** Yangi xodim qo'shish. */
router.post(
  '/',
  requireRole('admin'),
  wrap(async (req, res) => {
    required(req.body, ['username', 'password', 'full_name', 'role']);
    const { username, password, full_name, role, phone, branch_id } = req.body;
    if (!ROLES.includes(role)) throw new HttpError(400, 'Noto‘g‘ri rol');
    if (String(password).length < 8) throw new HttpError(400, 'Parol kamida 8 belgidan iborat bo‘lsin');

    const exists = await one('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);
    if (exists) throw conflict('Bunday login allaqachon mavjud');

    const user = await one(
      `INSERT INTO users (username, password_hash, full_name, role, phone, branch_id, created_by, must_change_pw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       RETURNING id, username, full_name, role, phone, branch_id, is_active`,
      [username, await hashPassword(password), full_name, role, phone || null, branch_id || null, req.user.id],
    );

    await audit(req, {
      action: 'CREATE',
      entity: 'user',
      entityId: user.id,
      description: `Yangi xodim qo‘shildi: ${full_name} (${role})`,
      newData: { username, full_name, role, phone: phone || null },
    });
    res.status(201).json(user);
  }),
);

/** Xodim ma'lumotlarini tahrirlash. */
router.patch(
  '/:id',
  requireRole('admin'),
  wrap(async (req, res) => {
    const before = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!before) throw notFound('Xodim topilmadi');

    const fields = ['full_name', 'role', 'phone', 'branch_id', 'is_active'];
    const patch = {};
    for (const f of fields) if (req.body[f] !== undefined) patch[f] = req.body[f];
    if (patch.role && !ROLES.includes(patch.role)) throw new HttpError(400, 'Noto‘g‘ri rol');

    // Oxirgi faol administratorni o'chirib qo'yishning oldini olamiz.
    if ((patch.is_active === false || (patch.role && patch.role !== 'admin')) && before.role === 'admin') {
      const { count } = await one(
        `SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND is_active AND id <> $1`,
        [before.id],
      );
      if (count === 0) throw conflict('Tizimda kamida bitta faol administrator qolishi kerak');
    }

    if (!Object.keys(patch).length) return res.json(before);

    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 2}`);
    const after = await one(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [before.id, ...Object.values(patch)],
    );

    const d = diff(before, after, fields);
    if (d) {
      await audit(req, {
        action: 'UPDATE',
        entity: 'user',
        entityId: before.id,
        description: `Xodim ma'lumoti o‘zgartirildi: ${after.full_name}`,
        ...d,
      });
    }
    res.json({ id: after.id, full_name: after.full_name, role: after.role, is_active: after.is_active });
  }),
);

/** Parolni tiklash (administrator tomonidan). */
router.post(
  '/:id/reset-password',
  requireRole('admin'),
  wrap(async (req, res) => {
    required(req.body, ['password']);
    if (String(req.body.password).length < 8) throw new HttpError(400, 'Parol kamida 8 belgidan iborat bo‘lsin');
    const user = await one('SELECT id, full_name FROM users WHERE id = $1', [req.params.id]);
    if (!user) throw notFound('Xodim topilmadi');

    await query(
      `UPDATE users SET password_hash = $2, must_change_pw = true, failed_attempts = 0, locked_until = NULL
        WHERE id = $1`,
      [user.id, await hashPassword(req.body.password)],
    );
    await audit(req, {
      action: 'UPDATE',
      entity: 'user',
      entityId: user.id,
      description: `${user.full_name} uchun parol administrator tomonidan tiklandi`,
    });
    res.json({ ok: true });
  }),
);

/** Xodimning ochiq sessiyalarini majburan yopish. */
router.post(
  '/:id/logout-all',
  requireRole('admin'),
  wrap(async (req, res) => {
    const { rowCount } = await query(
      `UPDATE sessions SET logout_at = now(), revoked_by = $2, revoke_reason = $3
        WHERE user_id = $1 AND logout_at IS NULL`,
      [req.params.id, req.user.id, req.body?.reason || 'Administrator tomonidan yopildi'],
    );
    await audit(req, {
      action: 'UPDATE',
      entity: 'session',
      entityId: req.params.id,
      description: `Xodimning ${rowCount} ta sessiyasi majburan yopildi`,
    });
    res.json({ closed: rowCount });
  }),
);

// ---------------------------------------------------------------------------
// Xodim rasmi
// ---------------------------------------------------------------------------

/**
 * Rasmni ko'rish. Har qanday kirgan xodim ko'ra oladi — rasm ish stansiyasida
 * "hozir kim ishlayapti" ro'yxatida va kirish oynasida ko'rsatiladi.
 * Brauzer eski rasmni saqlab qolmasligi uchun manzilga ?v=photo_updated_at
 * qo'shiladi; shuning uchun uzoq muddatli kesh xavfsiz.
 */
router.get(
  '/:id/photo',
  wrap(async (req, res) => {
    const u = await one('SELECT photo_path FROM users WHERE id = $1', [req.params.id]);
    if (!u?.photo_path || !fs.existsSync(u.photo_path)) throw notFound('Rasm topilmadi');
    if (req.query.v) res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(u.photo_path);
  }),
);

/** Rasm yuklash. Xodim o'zinikini, administrator har kimnikini qo'ya oladi. */
router.post(
  '/:id/photo',
  photoUpload.single('photo'),
  wrap(async (req, res) => {
    const targetId = Number(req.params.id);
    if (req.user.role !== 'admin' && req.user.id !== targetId)
      throw new HttpError(403, 'Faqat o‘z rasmingizni almashtira olasiz');
    if (!req.file) throw new HttpError(400, 'Rasm yuborilmadi');

    const ext = PHOTO_TYPES[req.file.mimetype];
    if (!ext) throw new HttpError(400, 'Faqat JPG, PNG yoki WEBP rasm bo‘lishi mumkin');

    const user = await one('SELECT id, full_name, photo_path FROM users WHERE id = $1', [targetId]);
    if (!user) throw notFound('Xodim topilmadi');

    await fsp.mkdir(config.staffPhotoDir, { recursive: true });
    const file = path.join(config.staffPhotoDir, `${user.id}${ext}`);
    await fsp.writeFile(file, req.file.buffer);

    // Format o'zgargan bo'lsa eski fayl qolib ketmasin.
    if (user.photo_path && user.photo_path !== file) {
      await fsp.rm(user.photo_path, { force: true });
    }

    await query('UPDATE users SET photo_path = $2, photo_updated_at = now() WHERE id = $1', [user.id, file]);
    await audit(req, {
      action: 'UPLOAD',
      entity: 'user',
      entityId: user.id,
      description: `${user.full_name} uchun rasm yuklandi`,
      newData: { photo: path.basename(file), size_bytes: req.file.size },
    });
    res.json({ ok: true, photo_updated_at: new Date().toISOString() });
  }),
);

/** Rasmni o'chirish. */
router.delete(
  '/:id/photo',
  wrap(async (req, res) => {
    const targetId = Number(req.params.id);
    if (req.user.role !== 'admin' && req.user.id !== targetId)
      throw new HttpError(403, 'Faqat o‘z rasmingizni o‘chira olasiz');

    const user = await one('SELECT id, full_name, photo_path FROM users WHERE id = $1', [targetId]);
    if (!user) throw notFound('Xodim topilmadi');
    if (user.photo_path) await fsp.rm(user.photo_path, { force: true });

    await query('UPDATE users SET photo_path = NULL, photo_updated_at = NULL WHERE id = $1', [user.id]);
    await audit(req, {
      action: 'DELETE',
      entity: 'user',
      entityId: user.id,
      description: `${user.full_name} rasmi o‘chirildi`,
    });
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// PIN kod — administrator tomonidan
// ---------------------------------------------------------------------------

/** Xodimga PIN qo'yish yoki tiklash (xodim PIN'ini unutganda). */
router.post(
  '/:id/pin',
  requireRole('admin'),
  wrap(async (req, res) => {
    required(req.body, ['pin']);
    const user = await one('SELECT id, full_name, pin_hash FROM users WHERE id = $1', [req.params.id]);
    if (!user) throw notFound('Xodim topilmadi');

    await setUserPin(user.id, req.body.pin);
    await audit(req, {
      action: 'UPDATE',
      entity: 'user',
      entityId: user.id,
      description: `${user.full_name} uchun PIN kod administrator tomonidan ${user.pin_hash ? 'tiklandi' : 'o‘rnatildi'}`,
      newData: { pin_set: true },
    });
    res.json({ ok: true });
  }),
);

/** Xodimning PIN kodini o'chirish (u endi faqat parol bilan kiradi). */
router.delete(
  '/:id/pin',
  requireRole('admin'),
  wrap(async (req, res) => {
    const user = await one('SELECT id, full_name FROM users WHERE id = $1', [req.params.id]);
    if (!user) throw notFound('Xodim topilmadi');

    await query(
      `UPDATE users SET pin_hash = NULL, pin_set_at = NULL,
              pin_failed_attempts = 0, pin_locked_until = NULL
        WHERE id = $1`,
      [user.id],
    );
    await audit(req, {
      action: 'UPDATE',
      entity: 'user',
      entityId: user.id,
      description: `${user.full_name} uchun PIN kod o‘chirildi`,
      oldData: { pin_set: true },
      newData: { pin_set: false },
    });
    res.json({ ok: true });
  }),
);

/** Xodim KPI ko'rsatkichlari. */
router.get(
  '/kpi',
  requireRole('admin'),
  wrap(async (req, res) => {
    const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const rows = await many(
      `SELECT u.id, u.full_name, u.role,
              (SELECT count(*) FROM results r
                WHERE r.entered_by = u.id AND r.entered_at::date BETWEEN $1 AND $2) AS results_entered,
              (SELECT count(*) FROM results r
                WHERE r.confirmed_by = u.id AND r.confirmed_at::date BETWEEN $1 AND $2) AS results_confirmed,
              (SELECT count(*) FROM patients p
                WHERE p.created_by = u.id AND p.created_at::date BETWEEN $1 AND $2) AS patients_created,
              (SELECT coalesce(sum(pm.amount),0) FROM payments pm
                WHERE pm.cashier_id = u.id AND NOT pm.is_refund
                  AND pm.created_at::date BETWEEN $1 AND $2) AS cash_collected,
              (SELECT coalesce(round(sum(extract(epoch FROM
                     coalesce(s.logout_at, s.last_seen_at) - s.login_at))/3600.0, 1), 0)
                 FROM sessions s
                WHERE s.user_id = u.id AND s.login_at::date BETWEEN $1 AND $2) AS hours_worked
         FROM users u
        WHERE u.is_active
        ORDER BY u.full_name`,
      [from, to],
    );
    res.json({ from, to, items: rows });
  }),
);
