/**
 * Uchdan-uchgacha (end-to-end) testlar: haqiqiy PostgreSQL bazasi va
 * haqiqiy HTTP so'rovlari bilan ishlaydi.
 *
 * Talab: bo'sh test bazasi.
 *   createdb labcore_test
 *   TEST_DATABASE_URL=postgres://labcore:labcore@127.0.0.1:5432/labcore_test npm test
 */
import './setup-env.js'; // ← muhit sozlamalari boshqa importlardan oldin yuklanishi shart

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/index.js';
import { pool, query } from '../src/db.js';
import { hashPassword } from '../src/lib/auth.js';
import { config } from '../src/config.js';

let server;
let base;

async function api(method, url, { token, body, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-computer-name': headers['x-computer-name'] || 'TEST-PC-01',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

before(async () => {
  const sql = fs.readFileSync(path.join(config.root, 'db', 'schema.sql'), 'utf8');
  await query(sql);
  // Toza holat
  await query(`TRUNCATE audit_log, notifications, patient_files, payments, results,
                        order_items, orders, diagnoses, visits, patient_contacts, patients,
                        sessions, inventory_moves, inventory_items, test_reference_ranges,
                        test_catalog, cameras, users, branches RESTART IDENTITY CASCADE`);

  const b = await query(`INSERT INTO branches (name) VALUES ('Test filial') RETURNING id`);
  await query(
    `INSERT INTO users (username, password_hash, full_name, role, branch_id)
     VALUES ('admin', $1, 'Bosh administrator', 'admin', $2)`,
    [await hashPassword('Admin12345'), b.rows[0].id],
  );
  const t = await query(
    `INSERT INTO test_catalog (code, name, category, unit, price)
     VALUES ('HGB','Gemoglobin','Qon tahlili','g/L', 25000) RETURNING id`,
  );
  await query(
    `INSERT INTO test_reference_ranges (test_id, gender, low, high, critical_low, critical_high)
     VALUES ($1,'u',120,150,70,200)`,
    [t.rows[0].id],
  );

  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await pool.end();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

let adminToken;
let labToken;
let patientId;
let orderId;
let orderItemId;

test('health endpoint bazani tekshiradi', async () => {
  const r = await api('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.db, 'up');
});

test('noto‘g‘ri parol bilan kirish rad etiladi va auditga yoziladi', async () => {
  const r = await api('POST', '/api/auth/login', { body: { username: 'admin', password: 'xato' } });
  assert.equal(r.status, 401);
  const log = await query(`SELECT * FROM audit_log WHERE action = 'LOGIN_FAILED'`);
  assert.equal(log.rows.length, 1);
  assert.match(log.rows[0].description, /Muvaffaqiyatsiz/);
});

test('administrator tizimga kiradi, sessiya kompyuter nomi bilan yoziladi', async () => {
  const r = await api('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'Admin12345', computerName: 'ADMIN-PC' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'admin');
  adminToken = r.body.token;

  const s = await query('SELECT * FROM sessions');
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0].computer_name, 'ADMIN-PC');

  const log = await query(`SELECT * FROM audit_log WHERE action = 'LOGIN'`);
  assert.equal(log.rows[0].computer_name, 'ADMIN-PC');
});

test('administrator laborant qo‘shadi', async () => {
  const r = await api('POST', '/api/users', {
    token: adminToken,
    body: { username: 'dilnoza', password: 'Laborant123', full_name: 'Dilnoza Karimova', role: 'laborant' },
  });
  assert.equal(r.status, 201);

  const login = await api('POST', '/api/auth/login', {
    body: { username: 'dilnoza', password: 'Laborant123', computerName: 'LAB-PC-02' },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.must_change_pw, true);
  labToken = login.body.token;
});

test('laborant xodimlar ro‘yxatiga kira olmaydi (rol chegarasi)', async () => {
  const r = await api('GET', '/api/users', { token: labToken });
  assert.equal(r.status, 403);
  const denied = await query(`SELECT * FROM audit_log WHERE action = 'ACCESS_DENIED'`);
  assert.equal(denied.rows.length, 1);
});

test('laborant yangi bemor qo‘shadi, karta raqami avtomatik beriladi', async () => {
  const r = await api('POST', '/api/patients', {
    token: labToken,
    body: {
      last_name: 'Karimov', first_name: 'Anvar', birth_date: '1985-03-12',
      gender: 'm', phone: '+998901234567', address: 'Toshkent',
    },
  });
  assert.equal(r.status, 201);
  assert.match(r.body.card_number, /^\d+$/);
  patientId = r.body.id;

  const log = await query(`SELECT * FROM audit_log WHERE action='CREATE' AND entity='patient'`);
  assert.equal(log.rows[0].patient_id, patientId);
  assert.equal(log.rows[0].computer_name, 'TEST-PC-01');
});

test('bemorni ism bo‘yicha qidirish ishlaydi va qidiruv auditga tushadi', async () => {
  const r = await api('GET', '/api/patients?q=karimov', { token: labToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.items[0].last_name, 'Karimov');

  const byPhone = await api('GET', '/api/patients?q=901234567', { token: labToken });
  assert.equal(byPhone.body.items.length, 1);

  const search = await query(`SELECT * FROM audit_log WHERE action='SEARCH'`);
  assert.ok(search.rows.length >= 1);
});

test('bemor kartasini ochish auditga yoziladi (kim qaysi bemorni ochdi)', async () => {
  const r = await api('GET', `/api/patients/${patientId}`, { token: labToken });
  assert.equal(r.status, 200);
  const log = await query(`SELECT * FROM audit_log WHERE action='VIEW' AND entity='patient'`);
  assert.match(log.rows[0].description, /Karimov Anvar/);
});

test('buyurtma yaratiladi, probirkaga shtrix-kod beriladi', async () => {
  const tests = await api('GET', '/api/catalog/tests', { token: labToken });
  const hgb = tests.body.items.find((t) => t.code === 'HGB');

  const r = await api('POST', '/api/orders', {
    token: labToken,
    body: { patient_id: patientId, test_ids: [hgb.id], complaint: 'Qorin og‘rig‘i' },
  });
  assert.equal(r.status, 201);
  assert.match(r.body.order_number, /^\d{4}-\d{6}$/);
  assert.equal(r.body.total_amount, 25000);
  orderId = r.body.id;

  const detail = await api('GET', `/api/orders/${orderId}`, { token: labToken });
  assert.equal(detail.body.items.length, 1);
  assert.ok(detail.body.items[0].sample_barcode);
  assert.equal(detail.body.items[0].range.low, 120);
  orderItemId = detail.body.items[0].order_item_id;
});

test('past natija "low" deb belgilanadi', async () => {
  const r = await api('POST', `/api/orders/${orderId}/results`, {
    token: labToken,
    body: { items: [{ order_item_id: orderItemId, value: 110 }] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ready');

  const res = await query('SELECT * FROM results WHERE order_item_id = $1', [orderItemId]);
  assert.equal(res.rows[0].value_num, 110);
  assert.equal(res.rows[0].flag, 'low');
  assert.match(r.body.summary.conclusion, /normadan chetda/);
});

test('natija o‘zgartirilsa audit eski va yangi qiymatni saqlaydi', async () => {
  const r = await api('POST', `/api/orders/${orderId}/results`, {
    token: labToken,
    body: { items: [{ order_item_id: orderItemId, value: 130 }] },
  });
  assert.equal(r.status, 200);

  const log = await query(
    `SELECT * FROM audit_log WHERE entity='result' AND action='UPDATE' ORDER BY at DESC LIMIT 1`,
  );
  assert.equal(log.rows[0].old_data.value, 110);
  assert.equal(log.rows[0].new_data.value, 130);
  assert.equal(log.rows[0].old_data.flag, 'low');
  assert.equal(log.rows[0].new_data.flag, 'normal');
  assert.match(log.rows[0].description, /110 → 130/);
  assert.equal(log.rows[0].user_name, 'Dilnoza Karimova');

  const res = await query('SELECT * FROM results WHERE order_item_id = $1', [orderItemId]);
  assert.equal(res.rows[0].revision, 2);
});

test('audit yozuvini o‘zgartirib yoki o‘chirib bo‘lmaydi', async () => {
  await assert.rejects(
    () => query(`UPDATE audit_log SET description = 'soxta' WHERE id = (SELECT min(id) FROM audit_log)`),
    /faqat qo|immutable/i,
  );
  await assert.rejects(
    () => query(`DELETE FROM audit_log WHERE id = (SELECT min(id) FROM audit_log)`),
    /faqat qo|immutable/i,
  );
});

test('natijalar tasdiqlanadi va buyurtma yopiladi', async () => {
  const r = await api('POST', `/api/orders/${orderId}/confirm`, { token: labToken });
  assert.equal(r.status, 200);
  const o = await query('SELECT status FROM orders WHERE id = $1', [orderId]);
  assert.equal(o.rows[0].status, 'confirmed');
  const res = await query('SELECT * FROM results WHERE order_item_id = $1', [orderItemId]);
  assert.ok(res.rows[0].confirmed_at);
});

test('tasdiqlangan natijani laborant o‘zgartira olmaydi, admin esa o‘zgartiradi', async () => {
  const lab = await api('POST', `/api/orders/${orderId}/results`, {
    token: labToken,
    body: { items: [{ order_item_id: orderItemId, value: 145 }] },
  });
  assert.equal(lab.status, 403);
  assert.match(lab.body.error, /tasdiqlangan/i);

  const admin = await api('POST', `/api/orders/${orderId}/results`, {
    token: adminToken,
    body: { items: [{ order_item_id: orderItemId, value: 145 }] },
  });
  assert.equal(admin.status, 200);

  const log = await query(
    `SELECT * FROM audit_log WHERE entity='result' ORDER BY at DESC LIMIT 1`,
  );
  assert.equal(log.rows[0].user_name, 'Bosh administrator');
  assert.equal(log.rows[0].old_data.value, 130);
});

test('bemor tarixi yillar bo‘yicha guruhlanadi', async () => {
  const r = await api('GET', `/api/patients/${patientId}/history`, { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.orders.length, 1);
  assert.equal(r.body.orders[0].results[0].test, 'Gemoglobin');
  assert.ok(r.body.years.length >= 1);
  assert.equal(r.body.years[0].year, new Date().getFullYear());
});

test('kassir to‘lov qabul qiladi, chek raqami beriladi', async () => {
  await api('POST', '/api/users', {
    token: adminToken,
    body: { username: 'kassir', password: 'Kassir12345', full_name: 'Nodira Yusupova', role: 'cashier' },
  });
  const login = await api('POST', '/api/auth/login', {
    body: { username: 'kassir', password: 'Kassir12345' },
  });
  const token = login.body.token;

  const pay = await api('POST', '/api/payments', {
    token,
    body: { patient_id: patientId, order_id: orderId, amount: 25000, method: 'cash' },
  });
  assert.equal(pay.status, 201);
  assert.match(pay.body.receipt_no, /^CH-\d{4}-\d{6}$/);

  // Kassir bemor qo'sha olmaydi
  const forbidden = await api('POST', '/api/patients', {
    token, body: { last_name: 'Test', first_name: 'Test' },
  });
  assert.equal(forbidden.status, 403);

  const o = await query('SELECT paid_amount FROM orders WHERE id = $1', [orderId]);
  assert.equal(o.rows[0].paid_amount, 25000);
});

test('fayl yuklanadi, SHA-256 saqlanadi va papka tuzilishi to‘g‘ri bo‘ladi', async () => {
  const form = new FormData();
  form.append('files', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'Qon_tahlili.pdf');
  form.append('category', 'analysis');

  const res = await fetch(`${base}/api/files/patient/${patientId}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${labToken}` },
    body: form,
  });
  assert.equal(res.status, 201);

  const rec = await query('SELECT * FROM patient_files');
  assert.equal(rec.rows.length, 1);
  assert.equal(rec.rows[0].sha256.length, 64);
  assert.match(rec.rows[0].stored_path, /Patients\/\d+_Karimov_Anvar\/\d{4}\/Qon_tahlili\.pdf/);
  assert.ok(fs.existsSync(path.join(process.env.DATA_DIR, rec.rows[0].stored_path)));

  const verify = await api('GET', `/api/files/${rec.rows[0].id}/verify`, { token: adminToken });
  assert.equal(verify.body.ok, true);
});

test('dashboard egaga bugungi ko‘rsatkichlarni beradi', async () => {
  const r = await api('GET', '/api/dashboard', { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.today.orders_today, 1);
  assert.equal(r.body.money.income_today, 25000);
  assert.ok(r.body.online >= 1);
});

test('monitoring: kim qaysi kompyuterdan ishlaganini ko‘rsatadi', async () => {
  const sessions = await api('GET', '/api/monitoring/sessions', { token: adminToken });
  const pcs = sessions.body.items.map((s) => s.computer_name);
  assert.ok(pcs.includes('LAB-PC-02'));
  assert.ok(pcs.includes('ADMIN-PC'));

  const audit = await api('GET', '/api/monitoring/audit?changes_only=1', { token: adminToken });
  assert.ok(audit.body.items.length > 0);
  assert.ok(audit.body.items.every((i) => i.new_data !== null));

  const day = await api('GET', `/api/monitoring/staff/2/day`, { token: adminToken });
  assert.ok(day.body.items.length > 0);
  assert.equal(day.body.sessions[0].computer_name, 'LAB-PC-02');
});

test('laborant monitoring bo‘limiga kira olmaydi', async () => {
  const r = await api('GET', '/api/monitoring/audit', { token: labToken });
  assert.equal(r.status, 403);
});

test('administrator sessiyani majburan yopadi — token darhol ishlamay qoladi', async () => {
  const r = await api('POST', '/api/users/2/logout-all', { token: adminToken, body: { reason: 'Smena tugadi' } });
  assert.equal(r.status, 200);
  assert.ok(r.body.closed >= 1);

  const after = await api('GET', '/api/patients', { token: labToken });
  assert.equal(after.status, 401);
});
