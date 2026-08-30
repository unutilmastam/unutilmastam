#!/usr/bin/env node
/**
 * Administrator yaratish yoki parolini tiklash.
 *   node scripts/create-admin.js <login> <parol> "To'liq ism"
 * Parol berilmasa tasodifiy kuchli parol yaratiladi.
 */
import crypto from 'node:crypto';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/auth.js';

const [username, passwordArg, fullName] = process.argv.slice(2);

if (!username) {
  console.error('Foydalanish: node scripts/create-admin.js <login> [parol] ["To\'liq ism"]');
  process.exit(1);
}

const password = passwordArg || crypto.randomBytes(9).toString('base64url');

try {
  const hash = await hashPassword(password);
  const existing = await pool.query('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE users SET password_hash = $2, role = 'admin', is_active = true,
              must_change_pw = true, failed_attempts = 0, locked_until = NULL
        WHERE id = $1`,
      [existing.rows[0].id, hash],
    );
    console.log(`✓ "${username}" administratori yangilandi`);
  } else {
    const branch = await pool.query('SELECT id FROM branches ORDER BY id LIMIT 1');
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, branch_id, must_change_pw)
       VALUES ($1,$2,$3,'admin',$4,true)`,
      [username, hash, fullName || 'Administrator', branch.rows[0]?.id ?? null],
    );
    console.log(`✓ "${username}" administratori yaratildi`);
  }
  console.log(`  Parol: ${password}`);
  console.log('  Birinchi kirishda parolni almashtirish talab qilinadi.');
} catch (err) {
  console.error('✗ Xato:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
