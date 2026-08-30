import express from 'express';
import { many, one } from '../db.js';
import { audit, diff } from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { notFound, required, wrap } from '../lib/http.js';

export const router = express.Router();
router.use(requireAuth);

/** Analiz katalogi + norma oraliqlari. */
router.get(
  '/tests',
  wrap(async (req, res) => {
    const items = await many(
      `SELECT t.*,
              coalesce((SELECT json_agg(row_to_json(r) ORDER BY r.age_min)
                          FROM test_reference_ranges r WHERE r.test_id = t.id), '[]'::json) AS ranges
         FROM test_catalog t
        ${req.query.all === '1' ? '' : 'WHERE t.is_active'}
        ORDER BY t.category, t.sort_order, t.name`,
    );
    res.json({ items });
  }),
);

router.post(
  '/tests',
  requireRole('admin'),
  wrap(async (req, res) => {
    required(req.body, ['code', 'name']);
    const b = req.body;
    const t = await one(
      `INSERT INTO test_catalog (code, name, category, unit, value_type, enum_options, price, turnaround_h, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        b.code.toUpperCase(), b.name, b.category || 'Umumiy', b.unit || null,
        b.value_type || 'number', b.enum_options || null, b.price || 0,
        b.turnaround_h || 24, b.sort_order || 100,
      ],
    );
    await audit(req, {
      action: 'CREATE', entity: 'test', entityId: t.id,
      description: `Katalogga analiz qo‘shildi: ${t.name} (${t.code})`,
      newData: { code: t.code, name: t.name, price: t.price },
    });
    res.status(201).json(t);
  }),
);

router.patch(
  '/tests/:id',
  requireRole('admin'),
  wrap(async (req, res) => {
    const before = await one('SELECT * FROM test_catalog WHERE id = $1', [req.params.id]);
    if (!before) throw notFound('Analiz topilmadi');

    const fields = ['name', 'category', 'unit', 'price', 'turnaround_h', 'is_active', 'sort_order'];
    const patch = {};
    for (const f of fields) if (req.body[f] !== undefined) patch[f] = req.body[f];
    if (!Object.keys(patch).length) return res.json(before);

    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 2}`);
    const after = await one(
      `UPDATE test_catalog SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [before.id, ...Object.values(patch)],
    );
    const d = diff(before, after, fields);
    if (d) {
      await audit(req, {
        action: 'UPDATE', entity: 'test', entityId: before.id,
        description: `Analiz o‘zgartirildi: ${after.name}`, ...d,
      });
    }
    res.json(after);
  }),
);

/** Norma oralig'ini qo'shish/yangilash. */
router.post(
  '/tests/:id/ranges',
  requireRole('admin'),
  wrap(async (req, res) => {
    const b = req.body;
    const r = await one(
      `INSERT INTO test_reference_ranges
         (test_id, gender, age_min, age_max, low, high, critical_low, critical_high, text_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        req.params.id, b.gender || 'u', b.age_min ?? 0, b.age_max ?? 200,
        num(b.low), num(b.high), num(b.critical_low), num(b.critical_high), b.text_note || null,
      ],
    );
    await audit(req, {
      action: 'CREATE', entity: 'reference_range', entityId: r.id,
      description: `Norma oralig‘i qo‘shildi (analiz #${req.params.id})`, newData: r,
    });
    res.status(201).json(r);
  }),
);

router.delete(
  '/ranges/:id',
  requireRole('admin'),
  wrap(async (req, res) => {
    const r = await one('DELETE FROM test_reference_ranges WHERE id = $1 RETURNING *', [req.params.id]);
    if (!r) throw notFound('Oraliq topilmadi');
    await audit(req, {
      action: 'DELETE', entity: 'reference_range', entityId: r.id,
      description: 'Norma oralig‘i o‘chirildi', oldData: r,
    });
    res.json({ ok: true });
  }),
);

/** Filiallar. */
router.get(
  '/branches',
  wrap(async (_req, res) => {
    res.json({ items: await many('SELECT * FROM branches WHERE is_active ORDER BY name') });
  }),
);

router.post(
  '/branches',
  requireRole('admin'),
  wrap(async (req, res) => {
    required(req.body, ['name']);
    const b = await one(
      'INSERT INTO branches (name, address, phone) VALUES ($1,$2,$3) RETURNING *',
      [req.body.name, req.body.address || null, req.body.phone || null],
    );
    await audit(req, {
      action: 'CREATE', entity: 'branch', entityId: b.id,
      description: `Filial qo‘shildi: ${b.name}`, newData: b,
    });
    res.status(201).json(b);
  }),
);

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
