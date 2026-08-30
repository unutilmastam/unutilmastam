import { query } from '../db.js';

/**
 * Audit yozuvi. Har bir muhim amal shu funksiya orqali yoziladi.
 * Yozuv hech qachon o'zgartirilmaydi (DB triggeri bilan himoyalangan).
 *
 * @param {object} req    — express so'rovi (kim, qaysi kompyuter, qaysi IP)
 * @param {object} entry  — { action, entity, entityId, patientId, description, oldData, newData }
 */
export async function audit(req, entry) {
  const u = req.user || {};
  const {
    action,
    entity = null,
    entityId = null,
    patientId = null,
    description = null,
    oldData = null,
    newData = null,
  } = entry;

  try {
    await query(
      `INSERT INTO audit_log
         (user_id, user_name, session_id, computer_name, ip_address,
          action, entity, entity_id, patient_id, description, old_data, new_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        u.id ?? null,
        u.full_name ?? entry.userName ?? null,
        u.sessionId ?? null,
        entry.computerName ?? computerName(req),
        clientIp(req),
        action,
        entity,
        entityId === null ? null : String(entityId),
        patientId,
        description,
        oldData ? JSON.stringify(oldData) : null,
        newData ? JSON.stringify(newData) : null,
      ],
    );
  } catch (err) {
    // Audit yozuvi asosiy amalni to'xtatmasligi kerak, lekin jim qolmasligi ham kerak.
    console.error('[audit] yozib bo‘lmadi:', err.message, entry.action);
  }
}

/**
 * O'zgarishlarni solishtiradi va faqat farq qilgan maydonlarni qaytaradi.
 * Natijada auditda "eski qiymat → yangi qiymat" aniq ko'rinadi.
 */
export function diff(before, after, fields) {
  const oldData = {};
  const newData = {};
  const keys = fields || [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  for (const k of keys) {
    const a = normalize(before?.[k]);
    const b = normalize(after?.[k]);
    if (a !== b) {
      oldData[k] = before?.[k] ?? null;
      newData[k] = after?.[k] ?? null;
    }
  }
  return Object.keys(newData).length ? { oldData, newData } : null;
}

function normalize(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export function clientIp(req) {
  const raw =
    (req.headers?.['x-forwarded-for']?.split(',')[0] || '').trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    null;
  if (!raw) return null;
  // Express ::ffff:192.168.1.5 ko'rinishida beradi — inet uchun tozalaymiz.
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

/**
 * Ish stansiyasi nomi. Klient (Windows dasturi yoki brauzer) X-Computer-Name
 * sarlavhasini yuboradi; bo'lmasa user-agent asosida taxminiy nom beriladi.
 */
export function computerName(req) {
  const explicit = req.headers?.['x-computer-name'];
  if (explicit) return String(explicit).slice(0, 100);
  if (req.user?.computerName) return req.user.computerName;
  const ua = req.headers?.['user-agent'] || '';
  const m = ua.match(/\(([^)]+)\)/);
  return m ? `brauzer: ${m[1].slice(0, 60)}` : 'noma’lum';
}
