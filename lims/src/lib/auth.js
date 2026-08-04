import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { audit } from './audit.js';

export const ROLES = ['admin', 'laborant', 'doctor', 'cashier'];

export const ROLE_LABEL = {
  admin: 'Administrator',
  laborant: 'Laborant',
  doctor: 'Shifokor',
  cashier: 'Kassir',
};

export function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
}

/**
 * Har bir so'rovda: token tekshiriladi, sessiya bazada tirikligi
 * tasdiqlanadi (admin sessiyani uzib qo'ysa — kirish darhol yopiladi),
 * so'ng last_seen_at yangilanadi (ish vaqti nazorati uchun).
 */
export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Sessiya muddati tugagan, qayta kiring' });
  }

  const row = await one(
    `SELECT s.id AS session_id, s.logout_at, s.computer_name,
            u.id, u.username, u.full_name, u.role, u.branch_id, u.is_active
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [payload.sid],
  );

  if (!row || row.logout_at) return res.status(401).json({ error: 'Sessiya yopilgan' });
  if (!row.is_active) return res.status(403).json({ error: 'Hisob faolsizlantirilgan' });

  req.user = {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    branch_id: row.branch_id,
    sessionId: row.session_id,
    computerName: row.computer_name,
  };

  // Faollikni yangilaymiz (online xodimlar va ish vaqti hisobi uchun).
  query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]).catch(() => {});
  next();
}

/** Rol tekshiruvi: requireRole('admin') yoki requireRole('admin','laborant'). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
    if (!roles.includes(req.user.role)) {
      audit(req, {
        action: 'ACCESS_DENIED',
        entity: req.baseUrl + req.path,
        description: `${ROLE_LABEL[req.user.role]} ruxsatsiz bo‘limga urindi`,
      });
      return res.status(403).json({ error: 'Bu amal uchun ruxsat yo‘q' });
    }
    next();
  };
}

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.token || null;
}

/**
 * Oddiy xotira ichidagi urinishlar cheklovi (login uchun).
 * Lokal serverda tashqi Redis kerak emas.
 */
const buckets = new Map();
export function rateLimit({ windowMs = 60_000, max = 10, key = (req) => req.ip } = {}) {
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const b = buckets.get(k);
    if (!b || now > b.reset) {
      buckets.set(k, { count: 1, reset: now + windowMs });
      return next();
    }
    if (++b.count > max) {
      return res.status(429).json({ error: 'Juda ko‘p urinish. Biroz kuting.' });
    }
    next();
  };
}

// Eskirgan yozuvlarni tozalab turamiz.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 60_000).unref();
