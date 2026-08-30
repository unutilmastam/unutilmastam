import express from 'express';
import crypto from 'node:crypto';
import { many, one, query, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { HttpError, badRequest, notFound, paging, required, wrap } from '../lib/http.js';
import { ensureCanEditResult } from '../lib/policy.js';
import { FLAG_LABEL, ageYears, evaluate, pickRange, summarizeOrder } from '../services/analyzer.js';
import { queueCriticalAlert, queueOrderReady } from '../services/notify.js';

export const router = express.Router();
router.use(requireAuth);

/**
 * Ish ro'yxati (worklist).
 * ?status=new|in_progress|ready|confirmed  ?patient_id=  ?from=  ?to=  ?q=
 */
router.get(
  '/',
  wrap(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const where = [];
    const params = [];
    const add = (sql, val) => {
      params.push(val);
      where.push(sql.replace('?', `$${params.length}`));
    };

    if (req.query.status) add('o.status = ?', req.query.status);
    if (req.query.patient_id) add('o.patient_id = ?', Number(req.query.patient_id));
    if (req.query.from) add('o.created_at >= ?::date', req.query.from);
    if (req.query.to) add("o.created_at < (?::date + interval '1 day')", req.query.to);
    if (req.query.q) {
      params.push(`%${String(req.query.q).toLowerCase()}%`, `%${req.query.q}%`);
      where.push(`(p.search_text LIKE $${params.length - 1} OR o.order_number ILIKE $${params.length})`);
    }

    const items = await many(
      `SELECT o.id, o.order_number, o.status, o.priority, o.created_at, o.due_at,
              o.total_amount, o.paid_amount,
              p.id AS patient_id, p.card_number, p.last_name, p.first_name, p.birth_date,
              u.full_name AS created_by_name,
              (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS tests_count,
              (SELECT count(*) FROM order_items oi JOIN results r ON r.order_item_id = oi.id
                WHERE oi.order_id = o.id AND (r.value_num IS NOT NULL OR r.value_text IS NOT NULL)) AS entered_count
         FROM orders o
         JOIN patients p ON p.id = o.patient_id
         LEFT JOIN users u ON u.id = o.created_by
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY o.priority = 'urgent' DESC, o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    res.json({ items, limit, offset });
  }),
);

/**
 * Yangi buyurtma.
 * body: { patient_id, visit_id?, test_ids: [], priority?, complaint? }
 */
router.post(
  '/',
  requireRole('admin', 'laborant', 'doctor'),
  wrap(async (req, res) => {
    required(req.body, ['patient_id', 'test_ids']);
    const testIds = [...new Set((req.body.test_ids || []).map(Number).filter(Boolean))];
    if (!testIds.length) throw badRequest('Kamida bitta analiz tanlanishi kerak');

    const patient = await one('SELECT * FROM patients WHERE id = $1', [req.body.patient_id]);
    if (!patient) throw notFound('Bemor topilmadi');

    const tests = await many(
      'SELECT * FROM test_catalog WHERE id = ANY($1::int[]) AND is_active',
      [testIds],
    );
    if (tests.length !== testIds.length) throw badRequest('Ba’zi analizlar katalogda topilmadi');

    const order = await tx(async (c) => {
      let visitId = req.body.visit_id || null;
      if (!visitId) {
        const v = await c.query(
          `INSERT INTO visits (patient_id, complaint, doctor_id, branch_id, created_by)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [
            patient.id, req.body.complaint || null,
            req.body.doctor_id || (req.user.role === 'doctor' ? req.user.id : null),
            patient.branch_id || req.user.branch_id || null, req.user.id,
          ],
        );
        visitId = v.rows[0].id;
      }

      const year = new Date().getFullYear();
      const seq = await c.query(`SELECT nextval('order_number_seq') AS n`);
      const orderNumber = `${year}-${String(seq.rows[0].n).padStart(6, '0')}`;
      const total = tests.reduce((s, t) => s + Number(t.price || 0), 0);
      const maxTat = Math.max(...tests.map((t) => t.turnaround_h || 24));

      const o = await c.query(
        `INSERT INTO orders (order_number, patient_id, visit_id, branch_id, priority,
                             total_amount, due_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' hours')::interval, $8) RETURNING *`,
        [
          orderNumber, patient.id, visitId, patient.branch_id || req.user.branch_id || null,
          req.body.priority === 'urgent' ? 'urgent' : 'normal', total, String(maxTat), req.user.id,
        ],
      );

      for (const t of tests) {
        const barcode = makeBarcode(orderNumber, t.code);
        const item = await c.query(
          `INSERT INTO order_items (order_id, test_id, sample_barcode, price)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [o.rows[0].id, t.id, barcode, t.price || 0],
        );
        // Har bir analiz uchun bo'sh natija qatori — ish ro'yxatida ko'rinishi uchun
        await c.query('INSERT INTO results (order_item_id, unit) VALUES ($1,$2)', [
          item.rows[0].id, t.unit || null,
        ]);
      }
      return o.rows[0];
    });

    await audit(req, {
      action: 'CREATE',
      entity: 'order',
      entityId: order.id,
      patientId: patient.id,
      description:
        `Buyurtma yaratildi ${order.order_number}: ${tests.map((t) => t.name).join(', ')} ` +
        `(${patient.last_name} ${patient.first_name})`,
      newData: { order_number: order.order_number, tests: tests.map((t) => t.code), total: order.total_amount },
    });

    res.status(201).json(order);
  }),
);

/** Buyurtma tafsiloti: bemor, analizlar, natijalar, normalar. */
router.get(
  '/:id',
  wrap(async (req, res) => {
    const order = await one(
      `SELECT o.*, p.card_number, p.last_name, p.first_name, p.middle_name,
              p.birth_date, p.gender, p.phone,
              u.full_name AS created_by_name, v.complaint, d.full_name AS doctor_name
         FROM orders o
         JOIN patients p ON p.id = o.patient_id
         LEFT JOIN users u ON u.id = o.created_by
         LEFT JOIN visits v ON v.id = o.visit_id
         LEFT JOIN users d ON d.id = v.doctor_id
        WHERE o.id = $1 OR o.order_number = $2`,
      [Number(req.params.id) || 0, req.params.id],
    );
    if (!order) throw notFound('Buyurtma topilmadi');

    const items = await many(
      `SELECT oi.id AS order_item_id, oi.status, oi.sample_barcode, oi.price,
              t.id AS test_id, t.code, t.name, t.category, t.value_type, t.enum_options,
              coalesce(r.unit, t.unit) AS unit,
              r.id AS result_id, r.value_num, r.value_text, r.flag, r.comment, r.device,
              r.entered_at, r.confirmed_at, r.revision,
              eu.full_name AS entered_by_name, cu.full_name AS confirmed_by_name
         FROM order_items oi
         JOIN test_catalog t ON t.id = oi.test_id
         LEFT JOIN results r ON r.order_item_id = oi.id
         LEFT JOIN users eu ON eu.id = r.entered_by
         LEFT JOIN users cu ON cu.id = r.confirmed_by
        WHERE oi.order_id = $1
        ORDER BY t.category, t.sort_order, t.name`,
      [order.id],
    );

    // Har bir analiz uchun bemorga mos norma oralig'i
    const age = ageYears(order.birth_date);
    const ranges = await many(
      `SELECT * FROM test_reference_ranges WHERE test_id = ANY($1::int[])`,
      [items.map((i) => i.test_id)],
    );
    for (const it of items) {
      const r = pickRange(ranges.filter((x) => x.test_id === it.test_id), order.gender, age);
      it.range = r ? { low: r.low, high: r.high, critical_low: r.critical_low, critical_high: r.critical_high, note: r.text_note } : null;
      it.flag_label = it.flag ? FLAG_LABEL[it.flag] : null;
    }

    await audit(req, {
      action: 'VIEW',
      entity: 'order',
      entityId: order.id,
      patientId: order.patient_id,
      description: `Buyurtmani ochdi ${order.order_number}`,
    });

    res.json({ order, items, summary: await summarizeOrder(order.id), patient_age: age });
  }),
);

/**
 * Natijalarni kiritish / tuzatish.
 * body: { items: [{ order_item_id, value, comment?, device? }] }
 * Har bir o'zgarish auditga "eski qiymat → yangi qiymat" ko'rinishida tushadi.
 */
router.post(
  '/:id/results',
  requireRole('admin', 'laborant'),
  wrap(async (req, res) => {
    required(req.body, ['items']);
    const order = await one(
      `SELECT o.*, p.gender, p.birth_date, p.last_name, p.first_name
         FROM orders o JOIN patients p ON p.id = o.patient_id WHERE o.id = $1`,
      [req.params.id],
    );
    if (!order) throw notFound('Buyurtma topilmadi');
    if (order.status === 'cancelled') throw badRequest('Bekor qilingan buyurtmaga natija kiritib bo‘lmaydi');

    const age = ageYears(order.birth_date);
    const changes = [];

    for (const input of req.body.items) {
      const item = await one(
        `SELECT oi.id, oi.order_id, t.id AS test_id, t.code, t.name, t.unit, t.value_type,
                r.id AS result_id, r.value_num, r.value_text, r.flag, r.comment,
                r.entered_by, r.entered_at, r.confirmed_at
           FROM order_items oi
           JOIN test_catalog t ON t.id = oi.test_id
           LEFT JOIN results r ON r.order_item_id = oi.id
          WHERE oi.id = $1 AND oi.order_id = $2`,
        [input.order_item_id, order.id],
      );
      if (!item) throw notFound(`Analiz qatori topilmadi (#${input.order_item_id})`);

      // Eski yozuvni himoya qilish qoidasi
      if (item.entered_at || item.confirmed_at) ensureCanEditResult(req.user, item);

      const isNumber = item.value_type === 'number';
      const raw = input.value;
      const valueNum = isNumber && raw !== '' && raw !== null && raw !== undefined ? Number(raw) : null;
      if (isNumber && raw !== '' && raw !== null && raw !== undefined && !Number.isFinite(valueNum))
        throw badRequest(`${item.name}: qiymat son bo‘lishi kerak`);
      const valueText = isNumber ? null : raw === '' || raw === undefined ? null : String(raw);

      const ranges = await many('SELECT * FROM test_reference_ranges WHERE test_id = $1', [item.test_id]);
      const range = pickRange(ranges, order.gender, age);
      const flag = isNumber ? evaluate(valueNum, range) : valueText ? 'normal' : null;

      const before = {
        value: item.value_text ?? (item.value_num !== null ? item.value_num : null),
        flag: item.flag,
        comment: item.comment,
      };
      const after = { value: valueText ?? valueNum, flag, comment: input.comment ?? item.comment ?? null };

      if (String(before.value) === String(after.value) && before.comment === after.comment) continue;

      await query(
        `INSERT INTO results (order_item_id, value_num, value_text, unit, flag, comment, device,
                              entered_by, entered_at, revision)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), 1)
         ON CONFLICT (order_item_id) DO UPDATE SET
           value_num = EXCLUDED.value_num,
           value_text = EXCLUDED.value_text,
           unit = coalesce(EXCLUDED.unit, results.unit),
           flag = EXCLUDED.flag,
           comment = EXCLUDED.comment,
           device = coalesce(EXCLUDED.device, results.device),
           entered_by = EXCLUDED.entered_by,
           entered_at = now(),
           confirmed_by = NULL,
           confirmed_at = NULL,
           -- buyurtma yaratilganda ochilgan bo'sh qator revizyon hisoblanmaydi
           revision = CASE WHEN results.entered_at IS NULL THEN 1 ELSE results.revision + 1 END`,
        [
          item.id, valueNum, valueText, item.unit || null, flag,
          input.comment ?? null, input.device ?? null, req.user.id,
        ],
      );
      await query(`UPDATE order_items SET status = 'entered' WHERE id = $1`, [item.id]);

      changes.push({ item, before, after });

      await audit(req, {
        action: item.entered_at ? 'UPDATE' : 'CREATE',
        entity: 'result',
        entityId: item.id,
        patientId: order.patient_id,
        description: item.entered_at
          ? `Natija o‘zgartirildi — ${item.name}: ${fmt(before.value)} → ${fmt(after.value)} ` +
            `(${order.last_name} ${order.first_name}, ${order.order_number})`
          : `Natija kiritildi — ${item.name}: ${fmt(after.value)} ` +
            `(${order.last_name} ${order.first_name}, ${order.order_number})`,
        oldData: item.entered_at ? before : null,
        newData: after,
      });
    }

    // Buyurtma holatini yangilaymiz
    const stat = await one(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE r.value_num IS NOT NULL OR r.value_text IS NOT NULL)::int AS filled
         FROM order_items oi LEFT JOIN results r ON r.order_item_id = oi.id
        WHERE oi.order_id = $1`,
      [order.id],
    );
    const newStatus = stat.filled === 0 ? 'new' : stat.filled < stat.total ? 'in_progress' : 'ready';
    if (order.status !== 'confirmed' || newStatus !== 'ready') {
      await query('UPDATE orders SET status = $2 WHERE id = $1', [order.id, newStatus]);
    }

    res.json({ updated: changes.length, status: newStatus, summary: await summarizeOrder(order.id) });
  }),
);

/** Natijalarni tasdiqlash — bemorga xabar shu bosqichda navbatga qo'yiladi. */
router.post(
  '/:id/confirm',
  requireRole('admin', 'laborant', 'doctor'),
  wrap(async (req, res) => {
    const order = await one(
      `SELECT o.*, p.last_name, p.first_name, p.phone
         FROM orders o JOIN patients p ON p.id = o.patient_id WHERE o.id = $1`,
      [req.params.id],
    );
    if (!order) throw notFound('Buyurtma topilmadi');

    const pending = await one(
      `SELECT count(*)::int AS c FROM order_items oi
         LEFT JOIN results r ON r.order_item_id = oi.id
        WHERE oi.order_id = $1 AND r.value_num IS NULL AND r.value_text IS NULL`,
      [order.id],
    );
    if (pending.c > 0) throw new HttpError(400, `${pending.c} ta analiz natijasi hali kiritilmagan`);

    await query(
      `UPDATE results SET confirmed_by = $2, confirmed_at = now()
        WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = $1)
          AND confirmed_at IS NULL`,
      [order.id, req.user.id],
    );
    await query(`UPDATE order_items SET status = 'confirmed' WHERE order_id = $1`, [order.id]);
    await query(`UPDATE orders SET status = 'confirmed' WHERE id = $1`, [order.id]);

    const summary = await summarizeOrder(order.id);
    await audit(req, {
      action: 'CONFIRM',
      entity: 'order',
      entityId: order.id,
      patientId: order.patient_id,
      description:
        `Natijalar tasdiqlandi ${order.order_number} (${order.last_name} ${order.first_name}). ` +
        summary.conclusion,
      newData: { status: 'confirmed' },
    });

    const queued = await queueOrderReady(order, req.user.id);
    // Kritik ko'rsatkich bo'lsa shifokor va administratorga darhol ogohlantirish
    if (summary.critical > 0) {
      queued.push(...(await queueCriticalAlert(order, summary.notes, req.user.id)));
    }
    res.json({ ok: true, summary, notifications: queued });
  }),
);

router.post(
  '/:id/cancel',
  requireRole('admin'),
  wrap(async (req, res) => {
    const order = await one('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order) throw notFound('Buyurtma topilmadi');
    const after = await one(
      `UPDATE orders SET status = 'cancelled', cancelled_by = $2, cancel_reason = $3
        WHERE id = $1 RETURNING *`,
      [order.id, req.user.id, req.body?.reason || null],
    );
    await audit(req, {
      action: 'UPDATE',
      entity: 'order',
      entityId: order.id,
      patientId: order.patient_id,
      description: `Buyurtma bekor qilindi ${order.order_number}: ${req.body?.reason || 'sabab ko‘rsatilmagan'}`,
      oldData: { status: order.status },
      newData: { status: 'cancelled' },
    });
    res.json(after);
  }),
);

/** Chop etish uchun natija blanki (bosma ko'rinish klientda shakllantiriladi). */
router.get(
  '/:id/report',
  wrap(async (req, res) => {
    const order = await one(
      `SELECT o.*, p.card_number, p.last_name, p.first_name, p.middle_name, p.birth_date,
              p.gender, p.phone
         FROM orders o JOIN patients p ON p.id = o.patient_id WHERE o.id = $1`,
      [req.params.id],
    );
    if (!order) throw notFound('Buyurtma topilmadi');

    const items = await many(
      `SELECT t.code, t.name, t.category, coalesce(r.unit, t.unit) AS unit,
              r.value_num, r.value_text, r.flag, r.comment,
              eu.full_name AS entered_by_name, cu.full_name AS confirmed_by_name, r.confirmed_at
         FROM order_items oi
         JOIN test_catalog t ON t.id = oi.test_id
         LEFT JOIN results r ON r.order_item_id = oi.id
         LEFT JOIN users eu ON eu.id = r.entered_by
         LEFT JOIN users cu ON cu.id = r.confirmed_by
        WHERE oi.order_id = $1 ORDER BY t.category, t.sort_order`,
      [order.id],
    );
    const age = ageYears(order.birth_date);
    const ranges = await many(
      `SELECT r.* FROM test_reference_ranges r
        WHERE r.test_id IN (SELECT test_id FROM order_items WHERE order_id = $1)`,
      [order.id],
    );

    await audit(req, {
      action: 'PRINT',
      entity: 'order',
      entityId: order.id,
      patientId: order.patient_id,
      description: `Natija blankasi chop etish uchun ochildi ${order.order_number}`,
    });

    res.json({ order, items, ranges, age, summary: await summarizeOrder(order.id) });
  }),
);

function makeBarcode(orderNumber, code) {
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${orderNumber.replace('-', '')}${code}${rand}`.slice(0, 32);
}

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
