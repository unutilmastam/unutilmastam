import express from 'express';
import bwipjs from 'bwip-js';
import qrcode from 'qrcode';
import { one } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { notFound, wrap } from '../lib/http.js';

export const router = express.Router();
router.use(requireAuth);

/**
 * Probirka uchun Code128 shtrix-kod (SVG — printerda aniq chiqadi).
 * GET /api/labels/barcode/<kod>.svg
 */
router.get(
  '/barcode/:code',
  wrap(async (req, res) => {
    const text = String(req.params.code).replace(/\.svg$/i, '');
    const svg = bwipjs.toSVG({
      bcid: 'code128',
      text,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
    });
    res.type('image/svg+xml').set('Cache-Control', 'private, max-age=3600').send(svg);
  }),
);

/**
 * Bemor kartasi uchun QR kod. Skanerlanganda karta raqami chiqadi —
 * qabulda bemorni bir soniyada topish uchun.
 */
router.get(
  '/qr/patient/:id',
  wrap(async (req, res) => {
    const p = await one('SELECT card_number, last_name, first_name FROM patients WHERE id = $1', [
      req.params.id,
    ]);
    if (!p) throw notFound('Bemor topilmadi');
    const payload = JSON.stringify({ card: p.card_number, n: `${p.last_name} ${p.first_name}` });
    const svg = await qrcode.toString(payload, { type: 'svg', margin: 1, width: 200 });
    res.type('image/svg+xml').send(svg);
  }),
);

/** Skanerdan kelgan shtrix-kod bo'yicha analiz qatorini topish. */
router.get(
  '/scan/:barcode',
  wrap(async (req, res) => {
    const row = await one(
      `SELECT oi.id AS order_item_id, o.id AS order_id, o.order_number, t.name AS test_name,
              p.id AS patient_id, p.card_number, p.last_name, p.first_name
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN test_catalog t ON t.id = oi.test_id
         JOIN patients p ON p.id = o.patient_id
        WHERE oi.sample_barcode = $1`,
      [req.params.barcode],
    );
    if (!row) throw notFound('Bu shtrix-kod bo‘yicha analiz topilmadi');
    res.json(row);
  }),
);
