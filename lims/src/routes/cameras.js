import express from 'express';
import crypto from 'node:crypto';
import { many, one, query } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { badRequest, notFound, required, wrap } from '../lib/http.js';
import { decrypt, encrypt } from '../lib/secretbox.js';
import { attendanceForDate, eventsForUserDay, purgeOldEvents } from '../services/presence.js';

export const router = express.Router();

/**
 * Kamera/NVR dagi AI hodisa yuboradi.
 *   POST /api/cameras/events
 *   X-Camera-Token: <kamera kaliti>
 *   { "type": "face", "face_label": "Dilnoza", "confidence": 96.4, "at": "..." }
 *
 * Bir nechta hodisani birdan yuborish uchun: { "events": [ ... ] }
 * Kameralar login/parol bilan ishlay olmaydi — shuning uchun kalit.
 */
router.post(
  '/events',
  express.json({ limit: '256kb' }),
  wrap(async (req, res) => {
    const token = req.headers['x-camera-token'];
    if (!token) throw badRequest('X-Camera-Token sarlavhasi yo‘q');

    const camera = await one('SELECT * FROM cameras WHERE api_token = $1 AND is_active', [token]);
    if (!camera) return res.status(401).json({ error: 'Kamera kaliti noto‘g‘ri' });

    const list = Array.isArray(req.body?.events) ? req.body.events : [req.body];
    const accepted = [];

    for (const ev of list) {
      const type = String(ev?.type || 'motion');
      if (!['face', 'motion', 'present', 'absent', 'tamper', 'offline'].includes(type)) continue;

      const label = ev.face_label ? String(ev.face_label).slice(0, 100) : null;
      let userId = null;
      if (label) {
        const face = await one('SELECT user_id FROM camera_faces WHERE lower(face_label) = lower($1)', [label]);
        userId = face?.user_id ?? null;
      }

      const row = await one(
        `INSERT INTO camera_events (camera_id, at, type, face_label, user_id, confidence, snapshot_path, meta)
         VALUES ($1, coalesce($2::timestamptz, now()), $3, $4, $5, $6, $7, $8)
         RETURNING id, at, type, user_id`,
        [
          camera.id, ev.at || null, type, label, userId,
          Number.isFinite(Number(ev.confidence)) ? Number(ev.confidence) : null,
          ev.snapshot_url ? String(ev.snapshot_url).slice(0, 500) : null,
          ev.meta ? JSON.stringify(ev.meta) : null,
        ],
      );
      accepted.push(row);
    }

    await query('UPDATE cameras SET last_event_at = now() WHERE id = $1', [camera.id]);
    res.json({ accepted: accepted.length, unmapped: accepted.filter((a) => !a.user_id).length });
  }),
);

// Qolgan hamma narsa — faqat administrator
router.use(requireAuth, requireRole('admin'));

router.get(
  '/',
  wrap(async (_req, res) => {
    const items = await many(
      `SELECT c.id, c.name, c.location, c.workstation, c.stream_type, c.stream_url,
              c.snapshot_url, c.is_active, c.last_event_at, c.api_token IS NOT NULL AS has_token,
              (c.password_enc IS NOT NULL) AS has_password,
              (SELECT count(*) FROM camera_events e
                WHERE e.camera_id = c.id AND e.at > now() - interval '24 hours') AS events_24h
         FROM cameras c ORDER BY c.name`,
    );
    res.json({ items });
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    required(req.body, ['name']);
    const b = req.body;
    const c = await one(
      `INSERT INTO cameras (name, location, workstation, stream_type, stream_url, snapshot_url,
                            username, password_enc, branch_id, api_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, name, api_token`,
      [
        b.name, b.location || null, b.workstation || null,
        b.stream_type || 'rtsp', b.stream_url || '', b.snapshot_url || null,
        b.username || null, encrypt(b.password), b.branch_id || null,
        crypto.randomBytes(24).toString('hex'),
      ],
    );
    await audit(req, {
      action: 'CREATE', entity: 'camera', entityId: c.id,
      description: `Kamera qo‘shildi: ${c.name}`,
      newData: { name: b.name, location: b.location, workstation: b.workstation },
    });
    res.status(201).json(c);
  }),
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const before = await one('SELECT * FROM cameras WHERE id = $1', [req.params.id]);
    if (!before) throw notFound('Kamera topilmadi');

    const fields = ['name', 'location', 'workstation', 'stream_type', 'stream_url', 'snapshot_url', 'username', 'is_active'];
    const patch = {};
    for (const f of fields) if (req.body[f] !== undefined) patch[f] = req.body[f];
    if (req.body.password !== undefined) patch.password_enc = encrypt(req.body.password);
    if (!Object.keys(patch).length) return res.json({ ok: true });

    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 2}`);
    await query(`UPDATE cameras SET ${sets.join(', ')} WHERE id = $1`, [before.id, ...Object.values(patch)]);

    await audit(req, {
      action: 'UPDATE', entity: 'camera', entityId: before.id,
      description: `Kamera sozlamasi o‘zgartirildi: ${before.name}`,
      newData: { ...patch, password_enc: patch.password_enc ? '***' : undefined },
    });
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const c = await one('DELETE FROM cameras WHERE id = $1 RETURNING *', [req.params.id]);
    if (!c) throw notFound('Kamera topilmadi');
    await audit(req, {
      action: 'DELETE', entity: 'camera', entityId: c.id,
      description: `Kamera o‘chirildi: ${c.name}`, oldData: { name: c.name, location: c.location },
    });
    res.json({ ok: true });
  }),
);

/**
 * Kadr (snapshot) proksi. Kamera lokal tarmoqda va o'z parolini talab qiladi;
 * brauzerga parol berilmaydi — server o'zi olib beradi.
 */
router.get(
  '/:id/snapshot',
  wrap(async (req, res) => {
    const c = await one('SELECT * FROM cameras WHERE id = $1', [req.params.id]);
    if (!c) throw notFound('Kamera topilmadi');
    if (!c.snapshot_url) throw badRequest('Bu kamera uchun kadr manzili sozlanmagan');

    const headers = {};
    const pass = decrypt(c.password_enc);
    if (c.username) {
      headers.authorization = 'Basic ' + Buffer.from(`${c.username}:${pass ?? ''}`).toString('base64');
    }

    try {
      const upstream = await fetch(c.snapshot_url, { headers, signal: AbortSignal.timeout(5000) });
      if (!upstream.ok) return res.status(502).json({ error: `Kamera javobi: ${upstream.status}` });
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      res.status(504).json({ error: `Kameraga ulanib bo‘lmadi: ${err.message}` });
    }
  }),
);

/** Kalitni yangilash. */
router.post(
  '/:id/token',
  wrap(async (req, res) => {
    const token = crypto.randomBytes(24).toString('hex');
    const c = await one('UPDATE cameras SET api_token = $2 WHERE id = $1 RETURNING id, name', [
      req.params.id, token,
    ]);
    if (!c) throw notFound('Kamera topilmadi');
    await audit(req, {
      action: 'UPDATE', entity: 'camera', entityId: c.id,
      description: `Kamera kaliti yangilandi: ${c.name}`,
    });
    res.json({ token });
  }),
);

// ---------------------------------------------------------------------------
// Yuz yorliqlarini xodimlarga bog'lash
// ---------------------------------------------------------------------------

router.get(
  '/faces',
  wrap(async (_req, res) => {
    const items = await many(
      `SELECT f.*, u.full_name, u.role,
              (SELECT count(*) FROM camera_events e WHERE e.face_label = f.face_label) AS events
         FROM camera_faces f LEFT JOIN users u ON u.id = f.user_id
        ORDER BY f.face_label`,
    );
    // AI yuborayotgan, lekin hali bog'lanmagan yorliqlar
    const unmapped = await many(
      `SELECT face_label, count(*)::int AS events, max(at) AS last_seen
         FROM camera_events
        WHERE face_label IS NOT NULL AND user_id IS NULL
        GROUP BY face_label ORDER BY events DESC LIMIT 50`,
    );
    res.json({ items, unmapped });
  }),
);

router.post(
  '/faces',
  wrap(async (req, res) => {
    required(req.body, ['face_label', 'user_id']);
    const f = await one(
      `INSERT INTO camera_faces (face_label, user_id, note) VALUES ($1,$2,$3)
       ON CONFLICT (face_label) DO UPDATE SET user_id = EXCLUDED.user_id, note = EXCLUDED.note
       RETURNING *`,
      [String(req.body.face_label).trim(), req.body.user_id, req.body.note || null],
    );

    // Eski hodisalarni ham shu xodimga bog'laymiz — davomat to'liq bo'lsin
    const { rowCount } = await query(
      `UPDATE camera_events SET user_id = $2
        WHERE lower(face_label) = lower($1) AND user_id IS NULL`,
      [f.face_label, f.user_id],
    );

    const u = await one('SELECT full_name FROM users WHERE id = $1', [f.user_id]);
    await audit(req, {
      action: 'CREATE', entity: 'camera_face', entityId: f.id,
      description: `Yuz yorlig‘i bog‘landi: "${f.face_label}" → ${u?.full_name} (${rowCount} ta eski hodisa yangilandi)`,
      newData: { face_label: f.face_label, user_id: f.user_id },
    });
    res.status(201).json({ ...f, updated_events: rowCount });
  }),
);

router.delete(
  '/faces/:id',
  wrap(async (req, res) => {
    const f = await one('DELETE FROM camera_faces WHERE id = $1 RETURNING *', [req.params.id]);
    if (!f) throw notFound('Bog‘lanish topilmadi');
    await audit(req, {
      action: 'DELETE', entity: 'camera_face', entityId: f.id,
      description: `Yuz yorlig‘i bog‘lanishi olib tashlandi: ${f.face_label}`, oldData: f,
    });
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Hodisalar va davomat
// ---------------------------------------------------------------------------

router.get(
  '/events',
  wrap(async (req, res) => {
    const where = [];
    const params = [];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };

    if (req.query.camera_id) add('e.camera_id = ?', Number(req.query.camera_id));
    if (req.query.user_id) add('e.user_id = ?', Number(req.query.user_id));
    if (req.query.type) add('e.type = ?', req.query.type);
    if (req.query.date) add('e.at::date = ?::date', req.query.date);

    const items = await many(
      `SELECT e.id, e.at, e.type, e.face_label, e.confidence, e.snapshot_path,
              c.name AS camera_name, u.full_name
         FROM camera_events e
         LEFT JOIN cameras c ON c.id = e.camera_id
         LEFT JOIN users u ON u.id = e.user_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY e.at DESC LIMIT 200`,
      params,
    );
    res.json({ items });
  }),
);

/** Kunlik davomat: kamerada ko'ringan vaqt va tizim sessiyasi yonma-yon. */
router.get(
  '/attendance',
  wrap(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const items = await attendanceForDate(date, req.query.user_id ? Number(req.query.user_id) : null);

    await audit(req, {
      action: 'VIEW', entity: 'attendance',
      description: `Davomat ko‘rildi (${date})`,
    });
    res.json({ date, items });
  }),
);

router.get(
  '/attendance/:userId',
  wrap(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const [summary] = await attendanceForDate(date, Number(req.params.userId));
    const events = await eventsForUserDay(Number(req.params.userId), date);
    res.json({ date, summary, events });
  }),
);

/** Eski hodisalarni qo'lda tozalash (avtomatik tozalash ham ishlaydi). */
router.post(
  '/purge',
  wrap(async (req, res) => {
    const days = Number(req.body?.days) || undefined;
    const removed = await purgeOldEvents(days);
    await audit(req, {
      action: 'DELETE', entity: 'camera_events',
      description: `Kamera hodisalari tozalandi: ${removed} ta yozuv`,
    });
    res.json({ removed });
  }),
);
