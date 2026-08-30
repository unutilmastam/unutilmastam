import express from 'express';
import { many, one, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { badRequest, notFound, required, wrap } from '../lib/http.js';

export const router = express.Router();
router.use(requireAuth, requireRole('admin', 'laborant'));

/** Ombor: reaktivlar va sarf materiallari + ogohlantirishlar. */
router.get(
  '/',
  wrap(async (req, res) => {
    const items = await many(
      `SELECT i.*, b.name AS branch_name,
              (i.quantity <= i.min_quantity) AS low_stock,
              (i.expiry_date IS NOT NULL AND i.expiry_date < current_date) AS expired,
              (i.expiry_date IS NOT NULL AND i.expiry_date BETWEEN current_date
                 AND current_date + interval '30 days') AS expiring_soon
         FROM inventory_items i LEFT JOIN branches b ON b.id = i.branch_id
        WHERE i.is_active ORDER BY low_stock DESC, i.expiry_date NULLS LAST, i.name`,
    );
    res.json({ items });
  }),
);

router.post(
  '/',
  requireRole('admin'),
  wrap(async (req, res) => {
    required(req.body, ['name']);
    const i = await one(
      `INSERT INTO inventory_items (name, unit, quantity, min_quantity, expiry_date, supplier, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.body.name, req.body.unit || 'dona', req.body.quantity || 0,
        req.body.min_quantity || 0, req.body.expiry_date || null,
        req.body.supplier || null, req.body.branch_id || null,
      ],
    );
    await audit(req, {
      action: 'CREATE', entity: 'inventory', entityId: i.id,
      description: `Omborga yangi pozitsiya: ${i.name}`, newData: i,
    });
    res.status(201).json(i);
  }),
);

/** Kirim/chiqim. delta > 0 kirim, delta < 0 chiqim. */
router.post(
  '/:id/move',
  wrap(async (req, res) => {
    required(req.body, ['delta']);
    const delta = Number(req.body.delta);
    if (!Number.isFinite(delta) || delta === 0) throw badRequest('Miqdor noto‘g‘ri');

    const result = await tx(async (c) => {
      const cur = await c.query('SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!cur.rows[0]) throw notFound('Pozitsiya topilmadi');
      const next = Number(cur.rows[0].quantity) + delta;
      if (next < 0) throw badRequest('Omborda yetarli miqdor yo‘q');

      await c.query('INSERT INTO inventory_moves (item_id, delta, reason, user_id) VALUES ($1,$2,$3,$4)', [
        req.params.id, delta, req.body.reason || null, req.user.id,
      ]);
      const upd = await c.query('UPDATE inventory_items SET quantity = $2 WHERE id = $1 RETURNING *', [
        req.params.id, next,
      ]);
      return { before: cur.rows[0], after: upd.rows[0] };
    });

    await audit(req, {
      action: 'UPDATE', entity: 'inventory', entityId: req.params.id,
      description: `Ombor harakati: ${result.after.name} ${delta > 0 ? '+' : ''}${delta} ${result.after.unit}` +
        (req.body.reason ? ` (${req.body.reason})` : ''),
      oldData: { quantity: result.before.quantity },
      newData: { quantity: result.after.quantity },
    });
    res.json(result.after);
  }),
);

router.get(
  '/:id/moves',
  wrap(async (req, res) => {
    const items = await many(
      `SELECT m.*, u.full_name FROM inventory_moves m LEFT JOIN users u ON u.id = m.user_id
        WHERE m.item_id = $1 ORDER BY m.created_at DESC LIMIT 200`,
      [req.params.id],
    );
    res.json({ items });
  }),
);
