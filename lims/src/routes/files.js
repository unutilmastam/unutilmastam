import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { many, one, query } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { badRequest, notFound, wrap } from '../lib/http.js';

export const router = express.Router();
router.use(requireAuth);

/**
 * Fayl arxivi tuzilishi:
 *   DATA_DIR/Patients/<karta>_<Familiya_Ism>/<yil>/<fayl>
 * Fayl nomi to'qnashsa raqam qo'shiladi; hech narsa ustiga yozilmaydi.
 * Har bir fayl uchun SHA-256 saqlanadi — 100 yildan keyin ham
 * yaxlitlikni tekshirish mumkin.
 */

const ALLOWED = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/tiff',
  'application/dicom', 'text/plain', 'text/csv',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 10 },
});

function patientFolder(p) {
  const safe = `${p.last_name}_${p.first_name}`
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);
  return `${p.card_number}_${safe}`;
}

async function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext).replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80) || 'fayl';
  let candidate = base + ext;
  let i = 1;
  while (fs.existsSync(path.join(dir, candidate))) candidate = `${base}_${i++}${ext}`;
  return path.join(dir, candidate);
}

/** Bemor fayllari ro'yxati (yillar bo'yicha). */
router.get(
  '/patient/:patientId',
  wrap(async (req, res) => {
    const items = await many(
      `SELECT f.id, f.year, f.category, f.original_name, f.mime_type, f.size_bytes,
              f.uploaded_at, u.full_name AS uploaded_by_name, f.order_id
         FROM patient_files f LEFT JOIN users u ON u.id = f.uploaded_by
        WHERE f.patient_id = $1 AND f.deleted_at IS NULL
        ORDER BY f.year DESC, f.uploaded_at DESC`,
      [req.params.patientId],
    );
    res.json({ items });
  }),
);

/** Yuklash: multipart/form-data — file(lar) + category + order_id */
router.post(
  '/patient/:patientId',
  requireRole('admin', 'laborant', 'doctor'),
  upload.array('files', 10),
  wrap(async (req, res) => {
    const p = await one('SELECT * FROM patients WHERE id = $1', [req.params.patientId]);
    if (!p) throw notFound('Bemor topilmadi');
    if (!req.files?.length) throw badRequest('Fayl tanlanmagan');

    const year = new Date().getFullYear();
    const dir = path.join(config.filesDir, patientFolder(p), String(year));
    await fsp.mkdir(dir, { recursive: true });

    const saved = [];
    for (const f of req.files) {
      if (!ALLOWED.has(f.mimetype)) {
        throw badRequest(`Ruxsat etilmagan fayl turi: ${f.originalname} (${f.mimetype})`);
      }
      const target = await uniquePath(dir, f.originalname);
      await fsp.writeFile(target, f.buffer, { mode: 0o640 });
      const sha = crypto.createHash('sha256').update(f.buffer).digest('hex');

      const rec = await one(
        `INSERT INTO patient_files
           (patient_id, order_id, year, category, original_name, stored_path,
            mime_type, size_bytes, sha256, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, original_name, year, category, size_bytes`,
        [
          p.id, req.body.order_id || null, year, req.body.category || 'other',
          f.originalname, path.relative(config.dataDir, target),
          f.mimetype, f.size, sha, req.user.id,
        ],
      );
      saved.push(rec);

      await audit(req, {
        action: 'UPLOAD', entity: 'file', entityId: rec.id, patientId: p.id,
        description: `Fayl yuklandi: ${f.originalname} (${(f.size / 1024).toFixed(0)} KB)`,
        newData: { name: f.originalname, category: req.body.category || 'other', sha256: sha },
      });
    }
    res.status(201).json({ items: saved });
  }),
);

/** Yuklab olish — har bir yuklab olish auditga tushadi. */
router.get(
  '/:id/download',
  wrap(async (req, res) => {
    const f = await one('SELECT * FROM patient_files WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!f) throw notFound('Fayl topilmadi');

    const abs = path.resolve(config.dataDir, f.stored_path);
    if (!abs.startsWith(path.resolve(config.dataDir))) throw notFound('Fayl topilmadi');
    if (!fs.existsSync(abs)) throw notFound('Fayl diskda topilmadi — arxivni tekshiring');

    await audit(req, {
      action: 'DOWNLOAD', entity: 'file', entityId: f.id, patientId: f.patient_id,
      description: `Fayl yuklab olindi: ${f.original_name}`,
    });

    res.setHeader('Content-Type', f.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
    );
    fs.createReadStream(abs).pipe(res);
  }),
);

/** Yaxlitlikni tekshirish: SHA-256 mos kelishini nazorat qiladi. */
router.get(
  '/:id/verify',
  requireRole('admin'),
  wrap(async (req, res) => {
    const f = await one('SELECT * FROM patient_files WHERE id = $1', [req.params.id]);
    if (!f) throw notFound('Fayl topilmadi');
    const abs = path.resolve(config.dataDir, f.stored_path);
    if (!fs.existsSync(abs)) return res.json({ ok: false, reason: 'Fayl diskda yo‘q' });
    const buf = await fsp.readFile(abs);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    res.json({ ok: sha === f.sha256, expected: f.sha256, actual: sha });
  }),
);

/** "O'chirish" — yozuv belgilanadi, fayl diskda qoladi (arxiv talabi). */
router.delete(
  '/:id',
  requireRole('admin'),
  wrap(async (req, res) => {
    const f = await one('SELECT * FROM patient_files WHERE id = $1', [req.params.id]);
    if (!f) throw notFound('Fayl topilmadi');
    await query('UPDATE patient_files SET deleted_at = now(), deleted_by = $2 WHERE id = $1', [
      f.id, req.user.id,
    ]);
    await audit(req, {
      action: 'DELETE', entity: 'file', entityId: f.id, patientId: f.patient_id,
      description: `Fayl ro‘yxatdan olindi (diskda saqlanib qoladi): ${f.original_name}`,
      oldData: { name: f.original_name, path: f.stored_path },
    });
    res.json({ ok: true });
  }),
);
