#!/usr/bin/env node
/**
 * Sxemani o'rnatadi/yangilaydi. Barcha DDL "IF NOT EXISTS" bo'lgani uchun
 * qayta ishga tushirish xavfsiz.
 *   npm run migrate
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';

const file = path.join(config.root, 'db', 'schema.sql');

try {
  const sql = fs.readFileSync(file, 'utf8');
  await pool.query(sql);
  console.log('✓ Sxema o‘rnatildi:', config.db.connectionString.replace(/:[^:@/]*@/, ':***@'));
} catch (err) {
  console.error('✗ Migratsiya xatosi:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
