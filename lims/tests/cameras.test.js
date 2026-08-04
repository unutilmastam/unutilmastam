import './setup-env.js';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/index.js';
import { pool, one, query } from '../src/db.js';
import { hashPassword } from '../src/lib/auth.js';
import { config } from '../src/config.js';
import { mergeIntervals, findGaps, purgeOldEvents } from '../src/services/presence.js';
import { encrypt, decrypt } from '../src/lib/secretbox.js';

let server;
let base;
let token;
let camera;
let labId;

const api = (method, url, { body, headers = {}, tok } = {}) =>
  fetch(base + url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(tok !== null ? { authorization: `Bearer ${tok ?? token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  await query(fs.readFileSync(path.join(config.root, 'db', 'schema.sql'), 'utf8'));
  await query(`TRUNCATE camera_events, camera_faces, cameras, audit_log, sessions, users, branches
               RESTART IDENTITY CASCADE`);

  const b = await query(`INSERT INTO branches (name) VALUES ('Test') RETURNING id`);
  await query(
    `INSERT INTO users (username, password_hash, full_name, role, branch_id)
     VALUES ('admin', $1, 'Bosh administrator', 'admin', $2)`,
    [await hashPassword('Admin12345'), b.rows[0].id],
  );
  const lab = await query(
    `INSERT INTO users (username, password_hash, full_name, role, branch_id)
     VALUES ('dilnoza', $1, 'Dilnoza Karimova', 'laborant', $2) RETURNING id`,
    [await hashPassword('Laborant123'), b.rows[0].id],
  );
  labId = lab.rows[0].id;

  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin12345' }),
  }).then((r) => r.json());
  token = login.token;
});

after(async () => {
  server?.close();
  await pool.end();
});

// ---------------------------------------------------------------------------
// Vaqt hisoblash mantiqi (sof funksiyalar)
// ---------------------------------------------------------------------------

const at = (h, m) => new Date(`2026-08-04T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);

test('yaqin hodisalar bitta oraliqqa birlashadi', () => {
  const intervals = mergeIntervals([
    { at: at(9, 0) }, { at: at(9, 3) }, { at: at(9, 8) }, { at: at(9, 12) },
  ], 10);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].minutes, 12);
  assert.equal(intervals[0].events, 4);
});

test('uzun tanaffus oraliqni ikkiga bo‘ladi', () => {
  const intervals = mergeIntervals([
    { at: at(9, 0) }, { at: at(9, 5) },
    { at: at(11, 0) }, { at: at(11, 8) }, { at: at(11, 16) }, { at: at(11, 24) }, { at: at(11, 30) },
  ], 10);
  assert.equal(intervals.length, 2);
  assert.equal(intervals[0].minutes, 5);
  assert.equal(intervals[1].minutes, 30);

  const gaps = findGaps(intervals);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].minutes, 115);   // 09:05 → 11:00
});

test('"absent" hodisasi oraliqni darhol yopadi', () => {
  const intervals = mergeIntervals([
    { at: at(9, 0), type: 'face' },
    { at: at(9, 4), type: 'absent' },
    { at: at(9, 6), type: 'face' },
  ], 30);
  assert.equal(intervals.length, 2);
});

test('yolg‘iz hodisa nol daqiqa deb hisoblanmaydi', () => {
  const intervals = mergeIntervals([{ at: at(9, 0) }], 10);
  assert.equal(intervals.length, 1);
  assert.ok(intervals[0].minutes > 0);
});

test('kamera paroli shifrlanadi va qayta ochiladi', () => {
  const packed = encrypt('kamera-parol-123');
  assert.notEqual(packed, 'kamera-parol-123');
  assert.equal(decrypt(packed), 'kamera-parol-123');
  assert.equal(decrypt('buzilgan.yozuv.xxx'), null);
  assert.equal(encrypt(''), null);
});

// ---------------------------------------------------------------------------
// Kamera va hodisalar
// ---------------------------------------------------------------------------

test('administrator kamera qo‘shadi va kalit oladi', async () => {
  const res = await api('POST', '/api/cameras', {
    body: {
      name: 'Laborant xonasi',
      location: '1-qavat',
      workstation: 'LAB-PC-02',
      stream_type: 'rtsp',
      stream_url: 'rtsp://192.168.1.50:554/stream1',
      snapshot_url: 'http://192.168.1.50/snapshot.jpg',
      username: 'admin',
      password: 'kamera-parol',
    },
  });
  assert.equal(res.status, 201);
  camera = await res.json();
  assert.equal(camera.api_token.length, 48);

  // Parol bazada ochiq saqlanmaydi
  const row = await one('SELECT password_enc FROM cameras WHERE id = $1', [camera.id]);
  assert.notEqual(row.password_enc, 'kamera-parol');
  assert.equal(decrypt(row.password_enc), 'kamera-parol');
});

test('kamera AI hodisa yuboradi, bog‘lanmagan yorliq ajratib ko‘rsatiladi', async () => {
  const res = await api('POST', '/api/cameras/events', {
    tok: null,
    headers: { 'x-camera-token': camera.api_token },
    body: { type: 'face', face_label: 'Dilnoza', confidence: 96.4, at: at(9, 0).toISOString() },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.accepted, 1);
  assert.equal(body.unmapped, 1);      // yorliq hali xodimga bog'lanmagan

  const list = await api('GET', '/api/cameras/faces').then((r) => r.json());
  assert.equal(list.unmapped[0].face_label, 'Dilnoza');
});

test('yorliq xodimga bog‘lansa, eski hodisalar ham unga tegishli bo‘ladi', async () => {
  const res = await api('POST', '/api/cameras/faces', {
    body: { face_label: 'Dilnoza', user_id: labId },
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.updated_events, 1);   // avval kelgan hodisa ham bog'landi

  const ev = await one('SELECT user_id FROM camera_events ORDER BY id LIMIT 1');
  assert.equal(ev.user_id, labId);
});

test('noto‘g‘ri kalit bilan hodisa qabul qilinmaydi', async () => {
  const res = await api('POST', '/api/cameras/events', {
    tok: null,
    headers: { 'x-camera-token': 'yaroqsiz' },
    body: { type: 'face', face_label: 'Dilnoza' },
  });
  assert.equal(res.status, 401);
});

test('davomat: kamera vaqti va tizim sessiyasi yonma-yon ko‘rsatiladi', async () => {
  // Kun davomidagi hodisalar: 09:00–09:40 va 14:00–14:20
  const events = [
    at(9, 10), at(9, 20), at(9, 30), at(9, 40),
    at(14, 0), at(14, 10), at(14, 20),
  ].map((d) => ({ type: 'face', face_label: 'Dilnoza', at: d.toISOString() }));

  await api('POST', '/api/cameras/events', {
    tok: null,
    headers: { 'x-camera-token': camera.api_token },
    body: { events },
  });

  const date = at(9, 0).toISOString().slice(0, 10);
  const res = await api('GET', `/api/cameras/attendance?date=${date}`).then((r) => r.json());
  const dilnoza = res.items.find((i) => i.user_id === labId);

  assert.equal(dilnoza.intervals.length, 2);
  assert.equal(dilnoza.camera_minutes, 60);       // 40 + 20
  assert.equal(dilnoza.gaps.length, 1);
  assert.equal(dilnoza.gaps[0].minutes, 260);     // 09:40 → 14:00
  assert.ok(dilnoza.cameras.includes('Laborant xonasi'));
  assert.equal(dilnoza.session_minutes, 0);       // bugun tizimga kirmagan

  // Davomatni ko'rish ham auditga tushadi
  const log = await one(`SELECT * FROM audit_log WHERE entity = 'attendance' ORDER BY at DESC LIMIT 1`);
  assert.match(log.description, /Davomat ko‘rildi/);
});

test('laborant kamera bo‘limiga kira olmaydi', async () => {
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'dilnoza', password: 'Laborant123' }),
  }).then((r) => r.json());

  for (const url of ['/api/cameras', '/api/cameras/attendance', '/api/cameras/events']) {
    const res = await api('GET', url, { tok: login.token });
    assert.equal(res.status, 403, url);
  }
});

test('saqlash muddati tugagan hodisalar o‘chiriladi', async () => {
  await query(
    `INSERT INTO camera_events (camera_id, at, type, face_label, user_id)
     VALUES ($1, now() - interval '200 days', 'face', 'Dilnoza', $2)`,
    [camera.id, labId],
  );
  const before = await one('SELECT count(*)::int AS c FROM camera_events');
  const removed = await purgeOldEvents(90);
  const after = await one('SELECT count(*)::int AS c FROM camera_events');

  assert.equal(removed, 1);
  assert.equal(after.c, before.c - 1);
});

test('kamera oqimi manzili faqat administratorga ko‘rinadi', async () => {
  const list = await api('GET', '/api/cameras').then((r) => r.json());
  assert.equal(list.items[0].stream_url, 'rtsp://192.168.1.50:554/stream1');
  assert.equal(list.items[0].has_password, true);
  assert.equal(list.items[0].password_enc, undefined);   // parol hech qachon chiqmaydi
});
