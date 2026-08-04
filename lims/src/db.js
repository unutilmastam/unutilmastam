import pg from 'pg';
import { config } from './config.js';

// numeric (NUMERIC/DECIMAL) ni JS number sifatida o'qiymiz — narx va
// tahlil qiymatlari uchun aniqlik yetarli (12,2 va 14,4).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.db.connectionString,
  max: config.db.max,
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
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
