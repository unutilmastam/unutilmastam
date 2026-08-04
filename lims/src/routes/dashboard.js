import express from 'express';
import { many, one } from '../db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { wrap } from '../lib/http.js';
import { config } from '../config.js';

export const router = express.Router();
router.use(requireAuth);

/**
 * Bosh sahifa: bugungi bemorlar, analizlar, onlayn xodimlar, daromad.
 * Moliyaviy raqamlarni faqat admin va kassir ko'radi.
 */
router.get(
  '/',
  wrap(async (req, res) => {
    const canSeeMoney = ['admin', 'cashier'].includes(req.user.role);

    const [today, pending, online, critical] = await Promise.all([
      one(
        `SELECT
           (SELECT count(*) FROM visits WHERE visit_date::date = current_date) AS patients_today,
           (SELECT count(*) FROM patients WHERE created_at::date = current_date) AS new_patients_today,
           (SELECT count(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.created_at::date = current_date) AS tests_today,
           (SELECT count(*) FROM orders WHERE created_at::date = current_date) AS orders_today,
           (SELECT count(*) FROM results WHERE confirmed_at::date = current_date) AS confirmed_today,
           (SELECT count(*) FROM appointments
             WHERE scheduled_date = current_date AND status NOT IN ('cancelled')) AS appointments_today,
           (SELECT count(*) FROM appointments
             WHERE scheduled_date = current_date AND status IN ('booked','confirmed')) AS appointments_waiting`,
      ),
      one(
        `SELECT
           (SELECT count(*) FROM orders WHERE status IN ('new','in_progress')) AS in_work,
           (SELECT count(*) FROM orders WHERE status = 'ready') AS awaiting_confirm,
           (SELECT count(*) FROM orders WHERE status IN ('new','in_progress') AND due_at < now()) AS overdue`,
      ),
      one(
        `SELECT count(DISTINCT user_id)::int AS c FROM sessions
          WHERE logout_at IS NULL AND last_seen_at > now() - ($1 || ' minutes')::interval`,
        [String(config.onlineWindowMinutes)],
      ),
      many(
        `SELECT o.id AS order_id, o.order_number, t.name AS test_name,
                coalesce(r.value_text, trim_scale(r.value_num)::text) AS value, r.flag,
                p.id AS patient_id, p.last_name, p.first_name
           FROM results r
           JOIN order_items oi ON oi.id = r.order_item_id
           JOIN orders o ON o.id = oi.order_id
           JOIN test_catalog t ON t.id = oi.test_id
           JOIN patients p ON p.id = o.patient_id
          WHERE r.flag IN ('critical_low','critical_high')
            AND r.entered_at > now() - interval '7 days'
          ORDER BY r.entered_at DESC LIMIT 20`,
      ),
    ]);

    let money = null;
    if (canSeeMoney) {
      money = await one(
        `SELECT
           coalesce(sum(amount) FILTER (WHERE NOT is_refund AND created_at::date = current_date),0) AS income_today,
           coalesce(sum(amount) FILTER (WHERE is_refund AND created_at::date = current_date),0) AS refunds_today,
           coalesce(sum(amount) FILTER (WHERE NOT is_refund AND created_at >= date_trunc('month', current_date)),0) AS income_month
         FROM payments`,
      );
    }

    const week = await many(
      `SELECT d::date AS day,
              (SELECT count(*) FROM orders o WHERE o.created_at::date = d::date) AS orders,
              (SELECT count(*) FROM patients p WHERE p.created_at::date = d::date) AS patients
         FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') d
        ORDER BY day`,
    );

    const topTests = await many(
      `SELECT t.name, count(*)::int AS c
         FROM order_items oi JOIN test_catalog t ON t.id = oi.test_id
         JOIN orders o ON o.id = oi.order_id
        WHERE o.created_at >= current_date - interval '30 days'
        GROUP BY t.name ORDER BY c DESC LIMIT 8`,
    );

    const alerts = await many(
      `SELECT name, quantity, unit, min_quantity, expiry_date
         FROM inventory_items
        WHERE is_active AND (quantity <= min_quantity
              OR (expiry_date IS NOT NULL AND expiry_date < current_date + interval '30 days'))
        ORDER BY expiry_date NULLS LAST LIMIT 20`,
    );

    res.json({
      today, pending, online: online.c, money, week, topTests,
      critical, inventoryAlerts: alerts,
      lab: { name: config.labName, currency: config.currency },
    });
  }),
);

/** Moliyaviy hisobot: davr bo'yicha daromad, to'lov turlari, analizlar kesimi. */
router.get(
  '/finance',
  requireRole('admin', 'cashier'),
  wrap(async (req, res) => {
    const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);

    const [byMethod, byDay, byTest, totals] = await Promise.all([
      many(
        `SELECT method, coalesce(sum(amount) FILTER (WHERE NOT is_refund),0) AS amount, count(*)::int AS c
           FROM payments WHERE created_at::date BETWEEN $1 AND $2
          GROUP BY method ORDER BY amount DESC`,
        [from, to],
      ),
      many(
        `SELECT created_at::date AS day,
                coalesce(sum(amount) FILTER (WHERE NOT is_refund),0) AS income,
                coalesce(sum(amount) FILTER (WHERE is_refund),0) AS refunds
           FROM payments WHERE created_at::date BETWEEN $1 AND $2
          GROUP BY day ORDER BY day`,
        [from, to],
      ),
      many(
        `SELECT t.name, count(*)::int AS c, coalesce(sum(oi.price),0) AS revenue
           FROM order_items oi
           JOIN test_catalog t ON t.id = oi.test_id
           JOIN orders o ON o.id = oi.order_id
          WHERE o.created_at::date BETWEEN $1 AND $2 AND o.status <> 'cancelled'
          GROUP BY t.name ORDER BY revenue DESC LIMIT 30`,
        [from, to],
      ),
      one(
        `SELECT
           coalesce(sum(amount) FILTER (WHERE NOT is_refund),0) AS income,
           coalesce(sum(amount) FILTER (WHERE is_refund),0) AS refunds,
           (SELECT coalesce(sum(total_amount - paid_amount),0) FROM orders
             WHERE status <> 'cancelled' AND total_amount > paid_amount) AS debts
         FROM payments WHERE created_at::date BETWEEN $1 AND $2`,
        [from, to],
      ),
    ]);

    res.json({ from, to, totals, byMethod, byDay, byTest, currency: config.currency });
  }),
);

/** Laboratoriya statistikasi: bajarilish muddati, normadan chetlanishlar. */
router.get(
  '/stats',
  requireRole('admin', 'doctor'),
  wrap(async (req, res) => {
    const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);

    const [tat, flags, byCategory] = await Promise.all([
      one(
        `SELECT round(avg(extract(epoch FROM r.confirmed_at - o.created_at)/3600.0)::numeric, 1) AS avg_hours,
                count(*)::int AS confirmed,
                count(*) FILTER (WHERE r.confirmed_at > o.due_at)::int AS late
           FROM results r
           JOIN order_items oi ON oi.id = r.order_item_id
           JOIN orders o ON o.id = oi.order_id
          WHERE r.confirmed_at::date BETWEEN $1 AND $2`,
        [from, to],
      ),
      many(
        `SELECT r.flag, count(*)::int AS c
           FROM results r JOIN order_items oi ON oi.id = r.order_item_id
           JOIN orders o ON o.id = oi.order_id
          WHERE o.created_at::date BETWEEN $1 AND $2 AND r.flag IS NOT NULL
          GROUP BY r.flag ORDER BY c DESC`,
        [from, to],
      ),
      many(
        `SELECT t.category, count(*)::int AS c
           FROM order_items oi JOIN test_catalog t ON t.id = oi.test_id
           JOIN orders o ON o.id = oi.order_id
          WHERE o.created_at::date BETWEEN $1 AND $2
          GROUP BY t.category ORDER BY c DESC`,
        [from, to],
      ),
    ]);

    res.json({ from, to, turnaround: tat, flags, byCategory });
  }),
);
