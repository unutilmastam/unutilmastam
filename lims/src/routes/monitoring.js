import express from 'express';
import { many, one } from '../db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { paging, wrap } from '../lib/http.js';
import { config } from '../config.js';

export const router = express.Router();
router.use(requireAuth, requireRole('admin'));

/**
 * Audit jurnali — kim, qachon, qaysi kompyuterdan, nimani o'zgartirgan.
 * Filtrlar: user_id, patient_id, action, entity, from, to, q
 */
router.get(
  '/audit',
  wrap(async (req, res) => {
    const { limit, offset } = paging(req.query, { defLimit: 100, maxLimit: 1000 });
    const where = [];
    const params = [];
    const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${params.length}`)); };

    if (req.query.user_id) add('a.user_id = ?', Number(req.query.user_id));
    if (req.query.patient_id) add('a.patient_id = ?', Number(req.query.patient_id));
    if (req.query.action) add('a.action = ?', req.query.action);
    if (req.query.entity) add('a.entity = ?', req.query.entity);
    if (req.query.computer) add('a.computer_name ILIKE ?', `%${req.query.computer}%`);
    if (req.query.from) add('a.at >= ?::date', req.query.from);
    if (req.query.to) add("a.at < (?::date + interval '1 day')", req.query.to);
    if (req.query.q) add('a.description ILIKE ?', `%${req.query.q}%`);
    if (req.query.changes_only === '1') where.push('a.new_data IS NOT NULL');

    const items = await many(
      `SELECT a.id, a.at, a.user_id, a.user_name, a.action, a.entity, a.entity_id,
              a.patient_id, a.description, a.computer_name, a.ip_address,
              a.old_data, a.new_data,
              p.card_number, p.last_name AS patient_last_name, p.first_name AS patient_first_name
         FROM audit_log a
         LEFT JOIN patients p ON p.id = a.patient_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY a.at DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    res.json({ items, limit, offset });
  }),
);

/** Bitta yozuvning "eski → yangi" farqi. */
router.get(
  '/audit/:id',
  wrap(async (req, res) => {
    const row = await one('SELECT * FROM audit_log WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Yozuv topilmadi' });
    const fields = [...new Set([...Object.keys(row.old_data || {}), ...Object.keys(row.new_data || {})])];
    res.json({
      entry: row,
      changes: fields.map((f) => ({
        field: f,
        old: row.old_data?.[f] ?? null,
        new: row.new_data?.[f] ?? null,
      })),
    });
  }),
);

/**
 * Ish stansiyalari va sessiyalar: kim qaysi kompyuterdan, qachon kirgan,
 * hozir onlaynmi, necha soat ishladi.
 */
router.get(
  '/sessions',
  wrap(async (req, res) => {
    const { limit, offset } = paging(req.query, { defLimit: 100 });
    const where = [];
    const params = [];
    if (req.query.user_id) { params.push(Number(req.query.user_id)); where.push(`s.user_id = $${params.length}`); }
    if (req.query.from) { params.push(req.query.from); where.push(`s.login_at >= $${params.length}::date`); }
    if (req.query.to) { params.push(req.query.to); where.push(`s.login_at < ($${params.length}::date + interval '1 day')`); }
    if (req.query.active === '1') where.push('s.logout_at IS NULL');

    const items = await many(
      `SELECT s.id, s.user_id, u.full_name, u.role, s.computer_name, s.ip_address,
              s.login_at, s.last_seen_at, s.logout_at,
              round(extract(epoch FROM coalesce(s.logout_at, s.last_seen_at) - s.login_at)/3600.0, 2) AS hours,
              (s.logout_at IS NULL AND s.last_seen_at > now() - ($${params.length + 1} || ' minutes')::interval) AS is_online,
              (SELECT count(*) FROM audit_log a WHERE a.session_id = s.id) AS actions
         FROM sessions s JOIN users u ON u.id = s.user_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY s.login_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [...params, String(config.onlineWindowMinutes)],
    );
    res.json({ items });
  }),
);

/** Bitta sessiya ichidagi barcha amallar — "ish kuni lentasi". */
router.get(
  '/sessions/:id/activity',
  wrap(async (req, res) => {
    const items = await many(
      `SELECT a.at, a.action, a.entity, a.description, a.patient_id,
              p.card_number, p.last_name, p.first_name
         FROM audit_log a LEFT JOIN patients p ON p.id = a.patient_id
        WHERE a.session_id = $1 ORDER BY a.at`,
      [req.params.id],
    );
    res.json({ items });
  }),
);

/** Hozir tizimda ishlayotgan xodimlar. */
router.get(
  '/online',
  wrap(async (req, res) => {
    const items = await many(
      `SELECT DISTINCT ON (u.id) u.id, u.full_name, u.role, s.computer_name,
              s.ip_address, s.login_at, s.last_seen_at,
              (u.photo_path IS NOT NULL) AS has_photo, u.photo_updated_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.logout_at IS NULL AND s.last_seen_at > now() - ($1 || ' minutes')::interval
        ORDER BY u.id, s.last_seen_at DESC`,
      [String(config.onlineWindowMinutes)],
    );
    res.json({ items });
  }),
);

/** Xodim faoliyati bo'yicha kunlik lenta (misoldagi 09:15 / 09:30 ko'rinishi). */
router.get(
  '/staff/:userId/day',
  wrap(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const items = await many(
      `SELECT a.at, a.action, a.entity, a.description, a.computer_name,
              p.card_number, p.last_name, p.first_name
         FROM audit_log a LEFT JOIN patients p ON p.id = a.patient_id
        WHERE a.user_id = $1 AND a.at::date = $2::date
        ORDER BY a.at`,
      [req.params.userId, date],
    );
    const sessions = await many(
      `SELECT computer_name, login_at, coalesce(logout_at, last_seen_at) AS until
         FROM sessions WHERE user_id = $1 AND login_at::date = $2::date ORDER BY login_at`,
      [req.params.userId, date],
    );
    res.json({ date, sessions, items });
  }),
);
