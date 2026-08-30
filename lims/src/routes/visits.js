import express from 'express';
import { many, one } from '../db.js';
import { audit, diff } from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { notFound, required, wrap } from '../lib/http.js';
import { ensureCanEdit } from '../lib/policy.js';

export const router = express.Router();
router.use(requireAuth);

/** Murojaat ochish (shikoyat bilan). */
router.post(
  '/',
  requireRole('admin', 'laborant', 'doctor'),
  wrap(async (req, res) => {
    required(req.body, ['patient_id']);
    const v = await one(
      `INSERT INTO visits (patient_id, complaint, doctor_id, branch_id, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        req.body.patient_id, req.body.complaint || null,
        req.body.doctor_id || (req.user.role === 'doctor' ? req.user.id : null),
        req.body.branch_id || req.user.branch_id || null, req.user.id,
      ],
    );
    await audit(req, {
      action: 'CREATE', entity: 'visit', entityId: v.id, patientId: v.patient_id,
      description: `Murojaat ochildi: ${v.complaint || 'shikoyat ko‘rsatilmagan'}`,
      newData: { complaint: v.complaint },
    });
    res.status(201).json(v);
  }),
);

/** Shifokor xulosasi: tashxis, tavsiya, dori, muolaja. */
router.post(
  '/diagnoses',
  requireRole('admin', 'doctor'),
  wrap(async (req, res) => {
    required(req.body, ['patient_id', 'diagnosis']);
    const d = await one(
      `INSERT INTO diagnoses (patient_id, visit_id, doctor_id, diagnosis, recommendation,
                              medication, procedure, follow_up_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        req.body.patient_id, req.body.visit_id || null, req.user.id, req.body.diagnosis,
        req.body.recommendation || null, req.body.medication || null,
        req.body.procedure || null, req.body.follow_up_date || null,
      ],
    );
    await audit(req, {
      action: 'CREATE', entity: 'diagnosis', entityId: d.id, patientId: d.patient_id,
      description: `Tashxis yozildi: ${d.diagnosis}`,
      newData: {
        diagnosis: d.diagnosis, recommendation: d.recommendation,
        medication: d.medication, procedure: d.procedure,
      },
    });
    res.status(201).json(d);
  }),
);

router.patch(
  '/diagnoses/:id',
  requireRole('admin', 'doctor'),
  wrap(async (req, res) => {
    const before = await one('SELECT * FROM diagnoses WHERE id = $1', [req.params.id]);
    if (!before) throw notFound('Tashxis topilmadi');
    ensureCanEdit(req.user, before, { ownerField: 'doctor_id', what: 'tashxis' });

    const fields = ['diagnosis', 'recommendation', 'medication', 'procedure', 'follow_up_date'];
    const patch = {};
    for (const f of fields) if (req.body[f] !== undefined) patch[f] = req.body[f];
    if (!Object.keys(patch).length) return res.json(before);

    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 2}`);
    const after = await one(
      `UPDATE diagnoses SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [before.id, ...Object.values(patch)],
    );
    const d = diff(before, after, fields);
    if (d) {
      await audit(req, {
        action: 'UPDATE', entity: 'diagnosis', entityId: before.id, patientId: before.patient_id,
        description: `Tashxis o‘zgartirildi: ${after.diagnosis}`, ...d,
      });
    }
    res.json(after);
  }),
);

/** Shifokor uchun ish ro'yxati: tasdiqlangan, lekin xulosasiz buyurtmalar. */
router.get(
  '/doctor-queue',
  requireRole('admin', 'doctor'),
  wrap(async (req, res) => {
    const items = await many(
      `SELECT o.id AS order_id, o.order_number, o.created_at,
              p.id AS patient_id, p.card_number, p.last_name, p.first_name, p.birth_date,
              (SELECT count(*) FROM order_items oi JOIN results r ON r.order_item_id = oi.id
                WHERE oi.order_id = o.id AND r.flag IN ('critical_low','critical_high')) AS critical_count,
              (SELECT count(*) FROM order_items oi JOIN results r ON r.order_item_id = oi.id
                WHERE oi.order_id = o.id AND r.flag IN ('low','high','abnormal')) AS abnormal_count
         FROM orders o
         JOIN patients p ON p.id = o.patient_id
        WHERE o.status = 'confirmed'
          AND NOT EXISTS (SELECT 1 FROM diagnoses d WHERE d.visit_id = o.visit_id)
        ORDER BY critical_count DESC, o.created_at DESC
        LIMIT 100`,
    );
    res.json({ items });
  }),
);
