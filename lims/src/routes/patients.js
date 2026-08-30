import express from 'express';
import { many, one, query } from '../db.js';
import { audit, diff } from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { conflict, notFound, paging, required, wrap } from '../lib/http.js';
import { ensureCanEdit } from '../lib/policy.js';

export const router = express.Router();
router.use(requireAuth);

const EDITABLE = [
  'last_name', 'first_name', 'middle_name', 'birth_date', 'gender',
  'phone', 'address', 'passport', 'notes', 'branch_id',
];

/**
 * GET /api/patients?q=...&limit=&offset=
 * Qidiruv: ism, familiya, telefon, karta raqami, tug'ilgan sana.
 * 100 yildan keyin ham ishlashi uchun indekslangan search_text ustunidan foydalanamiz.
 */
router.get(
  '/',
  wrap(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const q = String(req.query.q || '').trim().toLowerCase();
    const birth = String(req.query.birth_date || '').trim();

    const where = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      where.push(`p.search_text LIKE $${params.length}`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
      params.push(birth);
      where.push(`p.birth_date = $${params.length}`);
    }
    if (req.query.archived !== 'all') where.push('NOT p.is_archived');

    const sql = `
      SELECT p.id, p.card_number, p.last_name, p.first_name, p.middle_name,
             p.birth_date, p.gender, p.phone, p.address, p.created_at,
             (SELECT max(o.created_at) FROM orders o WHERE o.patient_id = p.id) AS last_order_at,
             (SELECT count(*) FROM orders o WHERE o.patient_id = p.id) AS orders_count
        FROM patients p
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY p.last_name, p.first_name
       LIMIT ${limit} OFFSET ${offset}`;

    const items = await many(sql, params);
    const total = await one(
      `SELECT count(*)::int AS c FROM patients p ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
      params,
    );

    if (q || birth) {
      await audit(req, {
        action: 'SEARCH',
        entity: 'patient',
        description: `Bemor qidirdi: "${req.query.q || birth}" — ${items.length} ta natija`,
      });
    }
    res.json({ items, total: total.c, limit, offset });
  }),
);

/** Yangi bemor. Karta raqami avtomatik beriladi. */
router.post(
  '/',
  requireRole('admin', 'laborant', 'doctor'),
  wrap(async (req, res) => {
    required(req.body, ['last_name', 'first_name']);
    const body = req.body;

    if (body.phone) {
      const dup = await one(
        `SELECT id, card_number, last_name, first_name FROM patients
          WHERE phone = $1 AND lower(last_name) = lower($2) AND lower(first_name) = lower($3)`,
        [body.phone, body.last_name, body.first_name],
      );
      if (dup && !body.allow_duplicate)
        throw conflict(
          `Shu ism va telefon bilan bemor mavjud: ${dup.card_number} — ${dup.last_name} ${dup.first_name}`,
        );
    }

    const card = await one(`SELECT nextval('patient_card_seq')::text AS n`);
    const p = await one(
      `INSERT INTO patients
         (card_number, last_name, first_name, middle_name, birth_date, gender,
          phone, address, passport, notes, branch_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        card.n,
        body.last_name, body.first_name, body.middle_name || null,
        body.birth_date || null, body.gender || 'u',
        body.phone || null, body.address || null, body.passport || null,
        body.notes || null, body.branch_id || req.user.branch_id || null, req.user.id,
      ],
    );

    await audit(req, {
      action: 'CREATE',
      entity: 'patient',
      entityId: p.id,
      patientId: p.id,
      description: `Yangi bemor: ${p.last_name} ${p.first_name} (karta ${p.card_number})`,
      newData: pick(p, EDITABLE),
    });
    res.status(201).json(p);
  }),
);

/** Bemor kartasi — ochilishi ham auditga tushadi (kim qaysi bemorni ochdi). */
router.get(
  '/:id',
  wrap(async (req, res) => {
    const p = await one(
      `SELECT p.*, u.full_name AS created_by_name, b.name AS branch_name
         FROM patients p
         LEFT JOIN users u ON u.id = p.created_by
         LEFT JOIN branches b ON b.id = p.branch_id
        WHERE p.id = $1 OR p.card_number = $2`,
      [Number(req.params.id) || 0, req.params.id],
    );
    if (!p) throw notFound('Bemor topilmadi');

    // Kassir bemorning pasport ma'lumotini ko'rmasligi kerak.
    if (req.user.role === 'cashier') delete p.passport;

    await audit(req, {
      action: 'VIEW',
      entity: 'patient',
      entityId: p.id,
      patientId: p.id,
      description: `Bemor kartasini ochdi: ${p.last_name} ${p.first_name} (${p.card_number})`,
    });
    res.json(p);
  }),
);

/** Bemor tahriri — eski yozuvlar himoyalangan (policy.js). */
router.patch(
  '/:id',
  requireRole('admin', 'laborant', 'doctor'),
  wrap(async (req, res) => {
    const before = await one('SELECT * FROM patients WHERE id = $1', [req.params.id]);
    if (!before) throw notFound('Bemor topilmadi');
    ensureCanEdit(req.user, before, { what: 'bemor kartasi' });

    const patch = {};
    for (const f of EDITABLE) if (req.body[f] !== undefined) patch[f] = req.body[f];
    if (!Object.keys(patch).length) return res.json(before);

    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 2}`);
    const after = await one(
      `UPDATE patients SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [before.id, ...Object.values(patch)],
    );

    const d = diff(before, after, EDITABLE);
    if (d) {
      await audit(req, {
        action: 'UPDATE',
        entity: 'patient',
        entityId: before.id,
        patientId: before.id,
        description: `Bemor kartasi o‘zgartirildi: ${after.last_name} ${after.first_name}`,
        ...d,
      });
    }
    res.json(after);
  }),
);

/**
 * Bemorning to'liq tarixi: murojaatlar, buyurtmalar+natijalar,
 * tashxislar, fayllar, to'lovlar — yillar bo'yicha.
 */
router.get(
  '/:id/history',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const p = await one('SELECT id, card_number, last_name, first_name FROM patients WHERE id = $1', [id]);
    if (!p) throw notFound('Bemor topilmadi');

    const [visits, orders, diagnoses, files, payments] = await Promise.all([
      many(
        `SELECT v.*, d.full_name AS doctor_name
           FROM visits v LEFT JOIN users d ON d.id = v.doctor_id
          WHERE v.patient_id = $1 ORDER BY v.visit_date DESC`,
        [id],
      ),
      many(
        `SELECT o.id, o.order_number, o.status, o.created_at, o.total_amount, o.paid_amount,
                u.full_name AS created_by_name,
                (SELECT json_agg(json_build_object(
                          'test', t.name, 'code', t.code, 'unit', coalesce(r.unit, t.unit),
                          'value', coalesce(r.value_text, trim_scale(r.value_num)::text),
                          'flag', r.flag,
                          'entered_by', eu.full_name, 'entered_at', r.entered_at,
                          'confirmed_by', cu.full_name, 'confirmed_at', r.confirmed_at)
                          ORDER BY t.sort_order, t.name)
                   FROM order_items oi
                   JOIN test_catalog t ON t.id = oi.test_id
                   LEFT JOIN results r ON r.order_item_id = oi.id
                   LEFT JOIN users eu ON eu.id = r.entered_by
                   LEFT JOIN users cu ON cu.id = r.confirmed_by
                  WHERE oi.order_id = o.id) AS results
           FROM orders o LEFT JOIN users u ON u.id = o.created_by
          WHERE o.patient_id = $1 ORDER BY o.created_at DESC`,
        [id],
      ),
      many(
        `SELECT d.*, u.full_name AS doctor_name
           FROM diagnoses d JOIN users u ON u.id = d.doctor_id
          WHERE d.patient_id = $1 ORDER BY d.created_at DESC`,
        [id],
      ),
      many(
        `SELECT id, year, category, original_name, size_bytes, uploaded_at
           FROM patient_files WHERE patient_id = $1 AND deleted_at IS NULL
          ORDER BY year DESC, uploaded_at DESC`,
        [id],
      ),
      req.user.role === 'laborant'
        ? []
        : many(
            `SELECT p.id, p.receipt_no, p.amount, p.method, p.created_at, p.is_refund,
                    u.full_name AS cashier_name
               FROM payments p JOIN users u ON u.id = p.cashier_id
              WHERE p.patient_id = $1 ORDER BY p.created_at DESC`,
            [id],
          ),
    ]);

    // Yillar bo'yicha guruhlash — "2026: qon kasalligi, 2027: davolanish" ko'rinishi uchun
    const byYear = {};
    const add = (date, kind, title, ref) => {
      const y = new Date(date).getFullYear();
      (byYear[y] ||= []).push({ at: date, kind, title, ref });
    };
    visits.forEach((v) => add(v.visit_date, 'visit', v.complaint || 'Murojaat', v.id));
    orders.forEach((o) => add(o.created_at, 'order', `Buyurtma ${o.order_number}`, o.id));
    diagnoses.forEach((d) => add(d.created_at, 'diagnosis', d.diagnosis, d.id));
    files.forEach((f) => add(f.uploaded_at, 'file', f.original_name, f.id));

    res.json({
      patient: p,
      visits,
      orders,
      diagnoses,
      files,
      payments,
      years: Object.keys(byYear)
        .sort((a, b) => b - a)
        .map((y) => ({ year: Number(y), events: byYear[y] })),
    });
  }),
);

/** Bemor bo'yicha barcha audit yozuvlari (kim ko'rgan, kim o'zgartirgan). */
router.get(
  '/:id/audit',
  requireRole('admin'),
  wrap(async (req, res) => {
    const { limit, offset } = paging(req.query, { defLimit: 100 });
    const items = await many(
      `SELECT id, at, user_name, action, entity, description, computer_name,
              ip_address, old_data, new_data
         FROM audit_log WHERE patient_id = $1
        ORDER BY at DESC LIMIT ${limit} OFFSET ${offset}`,
      [req.params.id],
    );
    res.json({ items });
  }),
);

/** Arxivlash (o'chirish emas — tibbiy yozuv hech qachon yo'qolmaydi). */
router.post(
  '/:id/archive',
  requireRole('admin'),
  wrap(async (req, res) => {
    const p = await one(
      'UPDATE patients SET is_archived = NOT is_archived WHERE id = $1 RETURNING *',
      [req.params.id],
    );
    if (!p) throw notFound('Bemor topilmadi');
    await audit(req, {
      action: 'UPDATE',
      entity: 'patient',
      entityId: p.id,
      patientId: p.id,
      description: p.is_archived ? 'Bemor arxivga o‘tkazildi' : 'Bemor arxivdan qaytarildi',
      newData: { is_archived: p.is_archived },
    });
    res.json(p);
  }),
);

function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
}
