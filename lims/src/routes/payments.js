import express from 'express';
import { many, one, query, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { badRequest, notFound, paging, required, wrap } from '../lib/http.js';
import { config } from '../config.js';

export const router = express.Router();
router.use(requireAuth);

/** Kassa ro'yxati. */
router.get(
  '/',
  requireRole('admin', 'cashier'),
  wrap(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const where = [];
    const params = [];
    if (req.query.from) { params.push(req.query.from); where.push(`pm.created_at >= $${params.length}::date`); }
    if (req.query.to) { params.push(req.query.to); where.push(`pm.created_at < ($${params.length}::date + interval '1 day')`); }
    if (req.query.patient_id) { params.push(req.query.patient_id); where.push(`pm.patient_id = $${params.length}`); }

    const items = await many(
      `SELECT pm.*, p.card_number, p.last_name, p.first_name, u.full_name AS cashier_name,
              o.order_number
         FROM payments pm
         JOIN patients p ON p.id = pm.patient_id
         JOIN users u ON u.id = pm.cashier_id
         LEFT JOIN orders o ON o.id = pm.order_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY pm.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const totals = await one(
      `SELECT coalesce(sum(amount) FILTER (WHERE NOT is_refund),0) AS income,
              coalesce(sum(amount) FILTER (WHERE is_refund),0) AS refunds
         FROM payments pm ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
      params,
    );
    res.json({ items, totals, limit, offset });
  }),
);

/** To'lov qabul qilish + chek raqami. */
router.post(
  '/',
  requireRole('admin', 'cashier'),
  wrap(async (req, res) => {
    required(req.body, ['patient_id', 'amount', 'method']);
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Summa noto‘g‘ri');
    if (!['cash', 'card', 'transfer'].includes(req.body.method)) throw badRequest('To‘lov turi noto‘g‘ri');

    const patient = await one('SELECT * FROM patients WHERE id = $1', [req.body.patient_id]);
    if (!patient) throw notFound('Bemor topilmadi');

    const payment = await tx(async (c) => {
      const seq = await c.query(`SELECT nextval('receipt_number_seq') AS n`);
      const receiptNo = `CH-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(6, '0')}`;
      const p = await c.query(
        `INSERT INTO payments (receipt_no, patient_id, order_id, amount, method, cashier_id, branch_id, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          receiptNo, patient.id, req.body.order_id || null, amount, req.body.method,
          req.user.id, patient.branch_id || req.user.branch_id || null, req.body.note || null,
        ],
      );
      if (req.body.order_id) {
        await c.query('UPDATE orders SET paid_amount = paid_amount + $2 WHERE id = $1', [
          req.body.order_id, amount,
        ]);
      }
      return p.rows[0];
    });

    await audit(req, {
      action: 'PAYMENT',
      entity: 'payment',
      entityId: payment.id,
      patientId: patient.id,
      description:
        `To‘lov qabul qilindi ${payment.receipt_no}: ${amount.toLocaleString('uz-UZ')} ${config.currency} ` +
        `(${req.body.method}) — ${patient.last_name} ${patient.first_name}`,
      newData: { receipt_no: payment.receipt_no, amount, method: payment.method },
    });
    res.status(201).json(payment);
  }),
);

/** Qaytarish (refund) — faqat administrator. */
router.post(
  '/:id/refund',
  requireRole('admin'),
  wrap(async (req, res) => {
    const orig = await one('SELECT * FROM payments WHERE id = $1', [req.params.id]);
    if (!orig) throw notFound('To‘lov topilmadi');
    if (orig.is_refund) throw badRequest('Bu allaqachon qaytarish yozuvi');

    const done = await one('SELECT id FROM payments WHERE refund_of = $1', [orig.id]);
    if (done) throw badRequest('Bu to‘lov bo‘yicha qaytarish allaqachon rasmiylashtirilgan');

    const seq = await one(`SELECT nextval('receipt_number_seq') AS n`);
    const receiptNo = `QT-${new Date().getFullYear()}-${String(seq.n).padStart(6, '0')}`;
    const refund = await one(
      `INSERT INTO payments (receipt_no, patient_id, order_id, amount, method, cashier_id,
                             branch_id, note, is_refund, refund_of)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING *`,
      [
        receiptNo, orig.patient_id, orig.order_id, orig.amount, orig.method, req.user.id,
        orig.branch_id, req.body?.reason || null, orig.id,
      ],
    );
    if (orig.order_id) {
      await query('UPDATE orders SET paid_amount = paid_amount - $2 WHERE id = $1', [orig.order_id, orig.amount]);
    }
    await audit(req, {
      action: 'PAYMENT',
      entity: 'payment',
      entityId: refund.id,
      patientId: orig.patient_id,
      description: `To‘lov qaytarildi ${orig.receipt_no} → ${receiptNo}: ${req.body?.reason || 'sabab ko‘rsatilmagan'}`,
      oldData: { receipt_no: orig.receipt_no, amount: orig.amount },
      newData: { receipt_no: receiptNo, refund: true },
    });
    res.status(201).json(refund);
  }),
);

/** Chek ma'lumoti (chop etish uchun). */
router.get(
  '/:id/receipt',
  requireRole('admin', 'cashier'),
  wrap(async (req, res) => {
    const p = await one(
      `SELECT pm.*, pa.card_number, pa.last_name, pa.first_name, u.full_name AS cashier_name,
              o.order_number
         FROM payments pm
         JOIN patients pa ON pa.id = pm.patient_id
         JOIN users u ON u.id = pm.cashier_id
         LEFT JOIN orders o ON o.id = pm.order_id
        WHERE pm.id = $1`,
      [req.params.id],
    );
    if (!p) throw notFound('Chek topilmadi');
    await audit(req, {
      action: 'PRINT', entity: 'payment', entityId: p.id, patientId: p.patient_id,
      description: `Chek chop etildi: ${p.receipt_no}`,
    });
    res.json({ payment: p, lab: { name: config.labName, currency: config.currency } });
  }),
);

/** Qarzdorlar: to'lanmagan buyurtmalar. */
router.get(
  '/debts',
  requireRole('admin', 'cashier'),
  wrap(async (req, res) => {
    const items = await many(
      `SELECT o.id, o.order_number, o.created_at, o.total_amount, o.paid_amount,
              (o.total_amount - o.paid_amount) AS debt,
              p.id AS patient_id, p.card_number, p.last_name, p.first_name, p.phone
         FROM orders o JOIN patients p ON p.id = o.patient_id
        WHERE o.status <> 'cancelled' AND o.total_amount > o.paid_amount
        ORDER BY o.created_at DESC LIMIT 200`,
    );
    const total = items.reduce((s, i) => s + Number(i.debt), 0);
    res.json({ items, total });
  }),
);
