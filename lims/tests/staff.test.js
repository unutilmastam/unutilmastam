/**
 * Xodim rasmi va PIN kod bilan kirish testlari.
 *
 * Talab: bo'sh test bazasi (api.test.js dagi kabi).
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
      'x-computer-name': headers['x-computer-name'] || 'LAB-PC-07',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

/** Eng kichik haqiqiy PNG (1×1 piksel) — rasm yuklashni sinash uchun. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function uploadPhoto(userId, token, { buffer = PNG_1PX, filename = 'rasm.png', type = 'image/png' } = {}) {
  const fd = new FormData();
  fd.append('photo', new Blob([buffer], { type }), filename);
  const res = await fetch(`${base}/api/users/${userId}/photo`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-computer-name': 'LAB-PC-07' },
    body: fd,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

let adminToken;
let labToken;
let labUserId;

before(async () => {
  const sql = fs.readFileSync(path.join(config.root, 'db', 'schema.sql'), 'utf8');
  await query(sql);
  await query(`TRUNCATE audit_log, notifications, patient_files, payments, results,
                        order_items, orders, diagnoses, visits, patient_contacts, patients,
                        sessions, inventory_moves, inventory_items, test_reference_ranges,
                        test_catalog, cameras, users, branches RESTART IDENTITY CASCADE`);

  await query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ('admin', $1, 'Bosh administrator', 'admin')`,
    [await hashPassword('Admin12345')],
  );
  const lab = await query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ('dilnoza', $1, 'Dilnoza Karimova', 'laborant') RETURNING id`,
    [await hashPassword('Laborant12345')],
  );
  labUserId = lab.rows[0].id;

  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  adminToken = (await api('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'Admin12345' },
  })).body.token;
  labToken = (await api('POST', '/api/auth/login', {
    body: { username: 'dilnoza', password: 'Laborant12345' },
  })).body.token;
});

after(async () => {
  server?.close();
  await pool.end();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Xodim rasmi
// ---------------------------------------------------------------------------

test('administrator xodimga rasm yuklaydi va u ro‘yxatda ko‘rinadi', async () => {
  const up = await uploadPhoto(labUserId, adminToken);
  assert.equal(up.status, 200);

  const list = await api('GET', '/api/users', { token: adminToken });
  const lab = list.body.items.find((u) => u.id === labUserId);
  assert.equal(lab.has_photo, true);
  assert.ok(lab.photo_updated_at, 'rasm vaqti yozilmadi');

  // Fayl haqiqatan diskda va bemor fayllaridan alohida papkada
  const saved = path.join(config.staffPhotoDir, `${labUserId}.png`);
  assert.ok(fs.existsSync(saved), 'rasm fayli saqlanmadi');
});

test('rasm faqat kirgan xodimga beriladi', async () => {
  const anon = await fetch(`${base}/api/users/${labUserId}/photo`);
  assert.equal(anon.status, 401);

  const ok = await fetch(`${base}/api/users/${labUserId}/photo`, {
    headers: { authorization: `Bearer ${labToken}` },
  });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type') || '', /image\/png/);
});

test('rasm yuklash auditga tushadi', async () => {
  const r = await api('GET', `/api/monitoring/audit?entity=user&action=UPLOAD`, { token: adminToken });
  assert.ok(r.body.items.some((a) => a.description.includes('rasm yuklandi')));
});

test('laborant boshqa xodimning rasmini almashtira olmaydi', async () => {
  const other = await query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ('aziz', $1, 'Aziz Rahimov', 'doctor') RETURNING id`,
    [await hashPassword('Shifokor12345')],
  );
  const up = await uploadPhoto(other.rows[0].id, labToken);
  assert.equal(up.status, 403);
});

test('faqat rasm formatlari qabul qilinadi', async () => {
  const up = await uploadPhoto(labUserId, adminToken, {
    buffer: Buffer.from('%PDF-1.4 fake'),
    filename: 'hujjat.pdf',
    type: 'application/pdf',
  });
  assert.equal(up.status, 400);
  assert.match(up.body.error, /JPG/);
});

test('rasmni o‘chirish faylni ham o‘chiradi', async () => {
  const del = await api('DELETE', `/api/users/${labUserId}/photo`, { token: adminToken });
  assert.equal(del.status, 200);
  assert.ok(!fs.existsSync(path.join(config.staffPhotoDir, `${labUserId}.png`)));

  const list = await api('GET', '/api/users', { token: adminToken });
  assert.equal(list.body.items.find((u) => u.id === labUserId).has_photo, false);

  // Keyingi testlar uchun qaytarib qo'yamiz
  await uploadPhoto(labUserId, adminToken);
});

// ---------------------------------------------------------------------------
// PIN kod
// ---------------------------------------------------------------------------

test('zaif PIN qabul qilinmaydi', async () => {
  for (const pin of ['1234', '0000', '4321', '12', 'abcd']) {
    const r = await api('POST', `/api/users/${labUserId}/pin`, { token: adminToken, body: { pin } });
    assert.equal(r.status, 400, `${pin} qabul qilindi`);
  }
});

test('administrator PIN qo‘yadi, xodim shu PIN bilan kiradi', async () => {
  const set = await api('POST', `/api/users/${labUserId}/pin`, {
    token: adminToken, body: { pin: '5093' },
  });
  assert.equal(set.status, 200);

  const login = await api('POST', '/api/auth/login-pin', {
    body: { user_id: labUserId, pin: '5093', computerName: 'LAB-PC-07' },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.full_name, 'Dilnoza Karimova');
  assert.equal(login.body.user.has_pin, true);
  assert.ok(login.body.token);
});

test('PIN bilan kirish sessiyalar ro‘yxatida va auditda ko‘rinadi', async () => {
  const a = await api('GET', '/api/monitoring/audit?action=LOGIN', { token: adminToken });
  const entry = a.body.items.find((i) => i.description.includes('PIN kod'));
  assert.ok(entry, 'PIN bilan kirish auditga yozilmadi');
  assert.equal(entry.computer_name, 'LAB-PC-07');

  const s = await api('GET', '/api/monitoring/sessions', { token: adminToken });
  assert.ok(s.body.items.some((x) => x.computer_name === 'LAB-PC-07'));
});

test('kirish oynasi ro‘yxati faqat PIN qo‘ygan xodimlarni beradi', async () => {
  const r = await api('GET', '/api/auth/pin-users');
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, true);
  assert.deepEqual(r.body.items.map((u) => u.full_name), ['Dilnoza Karimova']);
  // Login, telefon va boshqa maxfiy maydonlar chiqmasin
  assert.equal(r.body.items[0].username, undefined);
  assert.equal(r.body.items[0].pin_hash, undefined);
  assert.equal(r.body.items[0].has_photo, true);
});

test('kirish oynasidagi rasm avtorizatsiyasiz ochiladi', async () => {
  const res = await fetch(`${base}/api/auth/pin-users/${labUserId}/photo`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /image\/png/);
});

test('PIN qo‘ymagan xodimning rasmi kirish oynasida ochilmaydi', async () => {
  const admin = await query(`SELECT id FROM users WHERE username = 'admin'`);
  await uploadPhoto(admin.rows[0].id, adminToken);
  const res = await fetch(`${base}/api/auth/pin-users/${admin.rows[0].id}/photo`);
  assert.equal(res.status, 404);
});

test('noto‘g‘ri PIN uch urinishdan keyin vaqtincha bloklanadi', async () => {
  for (let i = 0; i < config.pin.maxFailed; i++) {
    const r = await api('POST', '/api/auth/login-pin', {
      body: { user_id: labUserId, pin: '9999' },
    });
    assert.equal(r.status, 401);
  }
  const blocked = await api('POST', '/api/auth/login-pin', {
    body: { user_id: labUserId, pin: '5093' },
  });
  assert.equal(blocked.status, 423);
  assert.match(blocked.body.error, /bloklangan/);
});

test('PIN bloklangan bo‘lsa ham parol bilan kirish ishlaydi', async () => {
  const r = await api('POST', '/api/auth/login', {
    body: { username: 'dilnoza', password: 'Laborant12345' },
  });
  assert.equal(r.status, 200);
  // Muvaffaqiyatli kirish PIN blokini ham bo'shatadi
  const after = await api('POST', '/api/auth/login-pin', {
    body: { user_id: labUserId, pin: '5093' },
  });
  assert.equal(after.status, 200);
});

test('xodim o‘z PIN kodini parol bilan tasdiqlab almashtiradi', async () => {
  const wrong = await api('POST', '/api/auth/set-pin', {
    token: labToken, body: { currentPassword: 'notogri', pin: '7412' },
  });
  assert.equal(wrong.status, 401);

  const ok = await api('POST', '/api/auth/set-pin', {
    token: labToken, body: { currentPassword: 'Laborant12345', pin: '7412' },
  });
  assert.equal(ok.status, 200);

  const eski = await api('POST', '/api/auth/login-pin', { body: { user_id: labUserId, pin: '5093' } });
  assert.equal(eski.status, 401);
  const yangi = await api('POST', '/api/auth/login-pin', { body: { user_id: labUserId, pin: '7412' } });
  assert.equal(yangi.status, 200);
});

test('xodim PIN kodini o‘chira oladi', async () => {
  const r = await api('POST', '/api/auth/remove-pin', { token: labToken });
  assert.equal(r.status, 200);

  const login = await api('POST', '/api/auth/login-pin', { body: { user_id: labUserId, pin: '7412' } });
  assert.equal(login.status, 401);

  const list = await api('GET', '/api/auth/pin-users');
  assert.equal(list.body.items.length, 0);
});

test('faqat administrator boshqa xodimga PIN qo‘ya oladi', async () => {
  const r = await api('POST', `/api/users/${labUserId}/pin`, { token: labToken, body: { pin: '8351' } });
  assert.equal(r.status, 403);
});
