#!/usr/bin/env node
/**
 * Boshlang'ich ma'lumotlar: filial, administrator, analiz katalogi va
 * norma oraliqlari. Qayta ishga tushirilsa mavjud yozuvlarga tegmaydi.
 *   npm run seed
 */
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/auth.js';

const ADMIN_USER = process.env.SEED_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD || 'Admin12345';

// [kod, nom, kategoriya, birlik, narx, [oraliqlar]]
// oraliq: { gender, age_min, age_max, low, high, critical_low, critical_high }
const TESTS = [
  // --- Umumiy qon tahlili ---
  ['HGB', 'Gemoglobin', 'Qon tahlili', 'g/L', 25000, [
    { gender: 'm', low: 130, high: 170, critical_low: 70, critical_high: 200 },
    { gender: 'f', low: 120, high: 150, critical_low: 70, critical_high: 200 },
    { gender: 'u', age_min: 0, age_max: 14, low: 110, high: 145, critical_low: 60 },
  ]],
  ['RBC', 'Eritrotsitlar', 'Qon tahlili', '10¹²/L', 20000, [
    { gender: 'm', low: 4.0, high: 5.5 },
    { gender: 'f', low: 3.7, high: 4.7 },
  ]],
  ['WBC', 'Leykotsitlar', 'Qon tahlili', '10⁹/L', 20000, [
    { gender: 'u', low: 4.0, high: 9.0, critical_low: 1.5, critical_high: 30 },
  ]],
  ['PLT', 'Trombotsitlar', 'Qon tahlili', '10⁹/L', 20000, [
    { gender: 'u', low: 180, high: 320, critical_low: 50, critical_high: 1000 },
  ]],
  ['ESR', 'ECHT (SOE)', 'Qon tahlili', 'mm/soat', 15000, [
    { gender: 'm', low: 2, high: 10 },
    { gender: 'f', low: 2, high: 15 },
  ]],
  ['HCT', 'Gematokrit', 'Qon tahlili', '%', 18000, [
    { gender: 'm', low: 39, high: 49 },
    { gender: 'f', low: 35, high: 45 },
  ]],

  // --- Biokimyo ---
  ['GLU', 'Qandli glyukoza', 'Biokimyo', 'mmol/L', 30000, [
    { gender: 'u', low: 3.3, high: 5.5, critical_low: 2.2, critical_high: 20 },
  ]],
  ['CHOL', 'Umumiy xolesterin', 'Biokimyo', 'mmol/L', 30000, [
    { gender: 'u', low: 3.0, high: 5.2, critical_high: 10 },
  ]],
  ['CREA', 'Kreatinin', 'Biokimyo', 'µmol/L', 32000, [
    { gender: 'm', low: 62, high: 106, critical_high: 500 },
    { gender: 'f', low: 44, high: 88, critical_high: 500 },
  ]],
  ['UREA', 'Mochevina', 'Biokimyo', 'mmol/L', 30000, [
    { gender: 'u', low: 2.5, high: 8.3, critical_high: 30 },
  ]],
  ['ALT', 'ALT (AlAT)', 'Biokimyo', 'U/L', 32000, [
    { gender: 'm', low: 0, high: 41, critical_high: 500 },
    { gender: 'f', low: 0, high: 33, critical_high: 500 },
  ]],
  ['AST', 'AST (AsAT)', 'Biokimyo', 'U/L', 32000, [
    { gender: 'u', low: 0, high: 40, critical_high: 500 },
  ]],
  ['TBIL', 'Umumiy bilirubin', 'Biokimyo', 'µmol/L', 30000, [
    { gender: 'u', low: 3.4, high: 20.5, critical_high: 100 },
  ]],
  ['TP', 'Umumiy oqsil', 'Biokimyo', 'g/L', 28000, [
    { gender: 'u', low: 64, high: 83 },
  ]],

  // --- Siydik tahlili ---
  ['U-PRO', 'Siydikda oqsil', 'Siydik tahlili', 'g/L', 18000, [
    { gender: 'u', low: 0, high: 0.033 },
  ]],
  ['U-GLU', 'Siydikda glyukoza', 'Siydik tahlili', 'mmol/L', 18000, [
    { gender: 'u', low: 0, high: 0.8 },
  ]],
  ['U-LEU', 'Siydikda leykotsitlar', 'Siydik tahlili', 'k/m', 18000, [
    { gender: 'm', low: 0, high: 3 },
    { gender: 'f', low: 0, high: 6 },
  ]],

  // --- Gormonlar ---
  ['TSH', 'TTG (TSH)', 'Gormonlar', 'mIU/L', 55000, [
    { gender: 'u', low: 0.4, high: 4.0, critical_high: 20 },
  ]],
  ['T4', 'Erkin T4', 'Gormonlar', 'pmol/L', 55000, [
    { gender: 'u', low: 9, high: 22 },
  ]],
];

const client = await pool.connect();
try {
  await client.query('BEGIN');

  // Filial
  const branch = await client.query(
    `INSERT INTO branches (name, address)
     SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM branches)
     RETURNING id`,
    [process.env.LAB_NAME || 'Markaziy laboratoriya', ''],
  );
  const branchId =
    branch.rows[0]?.id || (await client.query('SELECT id FROM branches ORDER BY id LIMIT 1')).rows[0].id;

  // Administrator
  const exists = await client.query('SELECT id FROM users WHERE lower(username) = lower($1)', [ADMIN_USER]);
  if (!exists.rows[0]) {
    await client.query(
      `INSERT INTO users (username, password_hash, full_name, role, branch_id, must_change_pw)
       VALUES ($1,$2,$3,'admin',$4,true)`,
      [ADMIN_USER, await hashPassword(ADMIN_PASS), 'Laboratoriya egasi', branchId],
    );
    console.log(`✓ Administrator yaratildi: ${ADMIN_USER} / ${ADMIN_PASS}`);
    console.log('  DIQQAT: birinchi kirishda parolni almashtirish talab qilinadi.');
  } else {
    console.log('• Administrator allaqachon mavjud — o‘tkazib yuborildi');
  }

  // Katalog
  let added = 0;
  for (const [code, name, category, unit, price, ranges] of TESTS) {
    const t = await client.query(
      `INSERT INTO test_catalog (code, name, category, unit, price, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
      [code, name, category, unit, price, added * 10],
    );
    if (!t.rows[0]) continue;
    added++;
    for (const r of ranges) {
      await client.query(
        `INSERT INTO test_reference_ranges
           (test_id, gender, age_min, age_max, low, high, critical_low, critical_high)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          t.rows[0].id, r.gender || 'u', r.age_min ?? 0, r.age_max ?? 200,
          r.low ?? null, r.high ?? null, r.critical_low ?? null, r.critical_high ?? null,
        ],
      );
    }
  }
  console.log(`✓ Katalogga ${added} ta analiz qo‘shildi (jami ${TESTS.length})`);

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('✗ Seed xatosi:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
