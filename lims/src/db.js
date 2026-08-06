import pg from 'pg';
import { config } from './config.js';

// numeric (NUMERIC/DECIMAL) ni JS number sifatida o'qiymiz — narx va
// tahlil qiymatlari uchun aniqlik yetarli (12,2 va 14,4).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

// DATE (vaqtsiz sana) matn holida qoladi: 'YYYY-MM-DD'.
// Aks holda u JS Date'ga aylanib, JSON'da '2026-08-04T00:00:00.000Z' bo'lib
// ketadi va manfiy vaqt mintaqasidagi klientda bir kun orqaga siljiydi
// (tug'ilgan sana, navbat sanasi uchun bu jiddiy xato).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({
  connectionString: config.db.connectionString,
  max: config.db.max,
  // Bo'sh turgan ulanishni o'zimiz yangilaymiz. Aks holda uni tashqi
  // tomon (antivirus, VPN, brandmauer yoki PostgreSQL'ning o'zi) uzib
  // qo'yishi mumkin va bu xato bo'lib qaytadi.
  keepAlive: true,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

/**
 * ENG MUHIM SATR.
 *
 * pg.Pool bo'sh turgan (idle) ulanishda xato yuz berganda 'error'
 * hodisasini chiqaradi. Node'da EventEmitter'ning 'error' hodisasini
 * hech kim tinglamasa, jarayon BUTUNLAY QULAB TUSHADI.
 *
 * Amalda bu shunday ko'rinadi: server ishlab turadi, keyin PostgreSQL
 * ulanishni uzadi yoki antivirus/VPN bo'sh TCP ulanishini yopadi va
 * server "sababsiz" o'chib qoladi. Vazifa uni qayta ishga tushiradi,
 * bir necha daqiqadan keyin yana o'chadi - "bir ishlab, bir ishlamaydi".
 *
 * Bu yerda xatoni ushlab, faqat yozib qo'yamiz: buzilgan ulanish
 * hovuzdan chiqarib tashlanadi, keyingi so'rov yangisini oladi.
 */
pool.on('error', (err) => {
  console.error(
    `[baza] bo'sh ulanishda xato: ${err.message} — ` +
    'ulanish tashlab yuborildi, server ishlashda davom etadi',
  );
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Bitta qator qaytaradi yoki null. */
export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

/** Qatorlar ro'yxati. */
export async function many(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

/** Tranzaksiya: cb(client) xato tashlasa ROLLBACK bo'ladi. */
export async function tx(cb) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await cb(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // ROLLBACK ning o'zi ham yiqilishi mumkin (ulanish uzilgan bo'lsa).
    // U holda asosiy xatoni yashirib qo'ymaymiz.
    try { await client.query('ROLLBACK'); } catch { /* ulanish allaqachon yo'q */ }
    throw err;
  } finally {
    client.release();
  }
}
