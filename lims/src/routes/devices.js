import express from 'express';
import crypto from 'node:crypto';
import { many, one, query } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { badRequest, notFound, required, wrap } from '../lib/http.js';
import { ingest, startDeviceListeners } from '../services/devices.js';

export const router = express.Router();

/**
 * Uskunadan natija qabul qilish (HTTP protokoli).
 * Bu manzil avtorizatsiyasiz, lekin uskuna kalitini talab qiladi —
 * analizatorlar login/parol bilan ishlay olmaydi.
 *   POST /api/devices/intake
 *   X-Device-Token: <kalit>
 *   Tanasi: CSV yoki HL7/ASTM matni
 */
router.post(
  '/intake',
  express.text({ type: '*/*', limit: '1mb' }),
  wrap(async (req, res) => {
    const token = req.headers['x-device-token'];
    if (!token) throw badRequest('X-Device-Token sarlavhasi yo‘q');

    const device = await one('SELECT * FROM devices WHERE api_token = $1 AND is_active', [token]);
    if (!device) return res.status(401).json({ error: 'Uskuna kaliti noto‘g‘ri' });

    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!raw?.trim()) throw badRequest('Bo‘sh xabar');

    const result = await ingest(device, raw);
    res.json({
      applied: result.applied.length,
      skipped: result.skipped,
      message_id: result.messageId,
    });
  }),
);

// Qolgan barcha manzillar administrator uchun
router.use(requireAuth, requireRole('admin'));

router.get(
  '/',
  wrap(async (_req, res) => {
    const items = await many(
      `SELECT d.*, (SELECT count(*) FROM device_mappings m WHERE m.device_id = d.id) AS mappings,
              (SELECT count(*) FROM device_messages dm
                WHERE dm.device_id = d.id AND dm.received_at > now() - interval '24 hours') AS messages_24h
         FROM devices d ORDER BY d.name`,
    );
    res.json({ items });
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    required(req.body, ['name', 'protocol']);
    const b = req.body;
    if (!['hl7', 'astm', 'folder', 'http'].includes(b.protocol)) throw badRequest('Noto‘g‘ri protokol');

    const d = await one(
      `INSERT INTO devices (name, protocol, host, port, folder, api_token, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        b.name, b.protocol, b.host || null, b.port || null, b.folder || null,
        b.protocol === 'http' ? crypto.randomBytes(24).toString('hex') : null,
        b.branch_id || null,
      ],
    );
    await audit(req, {
      action: 'CREATE', entity: 'device', entityId: d.id,
      description: `Uskuna qo‘shildi: ${d.name} (${d.protocol})`,
      newData: { name: d.name, protocol: d.protocol, host: d.host, port: d.port, folder: d.folder },
    });
    await startDeviceListeners();
    res.status(201).json(d);
  }),
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const before = await one('SELECT * FROM devices WHERE id = $1', [req.params.id]);
    if (!before) throw notFound('Uskuna topilmadi');

    const fields = ['name', 'host', 'port', 'folder', 'is_active'];
    const patch = {};
    for (const f of fields) if (req.body[f] !== undefined) patch[f] = req.body[f];
    if (!Object.keys(patch).length) return res.json(before);

    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 2}`);
    const after = await one(
      `UPDATE devices SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [before.id, ...Object.values(patch)],
    );
    await audit(req, {
      action: 'UPDATE', entity: 'device', entityId: before.id,
      description: `Uskuna sozlamasi o‘zgartirildi: ${after.name}`,
      oldData: patch, newData: after,
    });
    await startDeviceListeners();
    res.json(after);
  }),
);

/** Uskuna kodlarini katalogdagi analizlarga bog'lash. */
router.get(
  '/:id/mappings',
  wrap(async (req, res) => {
    const items = await many(
      `SELECT m.*, t.code AS test_code, t.name AS test_name, t.unit
         FROM device_mappings m JOIN test_catalog t ON t.id = m.test_id
        WHERE m.device_id = $1 ORDER BY m.device_code`,
      [req.params.id],
    );
    res.json({ items });
  }),
);

router.post(
  '/:id/mappings',
  wrap(async (req, res) => {
    required(req.body, ['device_code', 'test_id']);
    const m = await one(
      `INSERT INTO device_mappings (device_id, device_code, test_id, factor)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (device_id, device_code) DO UPDATE
         SET test_id = EXCLUDED.test_id, factor = EXCLUDED.factor
       RETURNING *`,
      [req.params.id, req.body.device_code, req.body.test_id, req.body.factor || 1],
    );
    await audit(req, {
      action: 'CREATE', entity: 'device_mapping', entityId: m.id,
      description: `Uskuna kodi bog‘landi: ${m.device_code}`, newData: m,
    });
    res.status(201).json(m);
  }),
);

router.delete(
  '/mappings/:id',
  wrap(async (req, res) => {
    const m = await one('DELETE FROM device_mappings WHERE id = $1 RETURNING *', [req.params.id]);
    if (!m) throw notFound('Bog‘lanish topilmadi');
    await audit(req, {
      action: 'DELETE', entity: 'device_mapping', entityId: m.id,
      description: `Uskuna kodi bog‘lanishi olib tashlandi: ${m.device_code}`, oldData: m,
    });
    res.json({ ok: true });
  }),
);

/** Uskunadan kelgan xom xabarlar — nosozlikni topish uchun. */
router.get(
  '/:id/messages',
  wrap(async (req, res) => {
    const items = await many(
      `SELECT id, received_at, status, applied_count, error, left(raw, 1000) AS raw
         FROM device_messages WHERE device_id = $1
        ORDER BY received_at DESC LIMIT 50`,
      [req.params.id],
    );
    res.json({ items });
  }),
);

/** Sinov: uskuna yuboradigan xabarni qo'lda kiritib tekshirish. */
router.post(
  '/:id/simulate',
  wrap(async (req, res) => {
    required(req.body, ['raw']);
    const device = await one('SELECT * FROM devices WHERE id = $1', [req.params.id]);
    if (!device) throw notFound('Uskuna topilmadi');

    const result = await ingest(device, req.body.raw);
    await audit(req, {
      action: 'CREATE', entity: 'device', entityId: device.id,
      description: `Uskuna sinovdan o‘tkazildi: ${device.name} — ${result.applied.length} ta natija`,
    });
    res.json({ applied: result.applied, skipped: result.skipped });
  }),
);

/** Yangi kalit (http protokoli uchun). */
router.post(
  '/:id/token',
  wrap(async (req, res) => {
    const token = crypto.randomBytes(24).toString('hex');
    const d = await one('UPDATE devices SET api_token = $2 WHERE id = $1 RETURNING id, name', [
      req.params.id, token,
    ]);
    if (!d) throw notFound('Uskuna topilmadi');
    await audit(req, {
      action: 'UPDATE', entity: 'device', entityId: d.id,
      description: `Uskuna kaliti yangilandi: ${d.name}`,
    });
    res.json({ token });
  }),
);
