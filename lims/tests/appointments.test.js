import './setup-env.js';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/index.js';
import { pool, one, many, query } from '../src/db.js';
import { hashPassword } from '../src/lib/auth.js';
import { config } from '../src/config.js';
import { localDate, localTime, sendReminders, markNoShows } from '../src/services/appointments.js';

let server;
let base;
let regToken;   // registratura (laborant)
let adminToken;
let doctorToken;

const api = (method, url, { body, tok } = {}) =>
  fetch(base + url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${tok ?? regToken}`,
      'x-computer-name': 'REGISTRATURA-PC',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

/**
 * Kelajakdagi n-chi bo'sh oraliq (15 daqiqalik qadam bilan).
 * Test kun davomida istalgan vaqtda ishlashi uchun soat qat'iy yozilmaydi.
 */
const SLOT_MS = 15 * 60_000;

/**
 * Boshlang'ich nuqta: hozirdan 30 daqiqa keyingi oraliq. Lekin test kech
 * ishga tushsa (masalan 22:50 da), keyingi bir necha oraliq ish vaqti
 * oxiridan yoki hatto yarim tundan o'tib ketadi va navbatlar boshqa kunga
 * tushib qoladi. Shunda testlar sababsiz yiqilardi. Shuning uchun kun
 * oxiriga yaqin bo'lsak, ertangi kunning ish boshiga o'tamiz.
 */
const SLOTS_NEEDED = 6;
const startOfSlots = (() => {
  const rounded = Math.ceil((Date.now() + 30 * 60_000) / SLOT_MS) * SLOT_MS;
  const last = new Date(rounded + SLOTS_NEEDED * SLOT_MS);

  const [endH, endM] = (process.env.WORK_END || '23:45').split(':').map(Number);
  const endsToday = localTime(new Date(rounded)) <= localTime(last)          // yarim tundan o'tmadi
    && localTime(last) <= `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  if (endsToday) return rounded;

  // Ertangi kunning ish boshi (laboratoriya vaqt mintaqasida)
  const [startH, startM] = (process.env.WORK_START || '08:00').split(':').map(Number);
  const t = new Date(Date.now() + 864e5);
  const iso = `${localDate(t)}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`;
  // Sana laboratoriya mintaqasida berilgani uchun mintaqa siljishini hisobga olamiz.
  const asUtc = new Date(iso + 'Z');
  const shift = new Date(asUtc.toLocaleString('en-US', { timeZone: config.timezone })) - asUtc;
  return Math.ceil((asUtc.getTime() - shift + 60 * 60_000) / SLOT_MS) * SLOT_MS;
})();

function slot(index = 0) {
  return new Date(startOfSlots + index * SLOT_MS).toISOString();
}

/**
 * Navbatlar tushadigan kun (laboratoriya vaqt mintaqasida).
 * Test yarim tunga yaqin ishga tushsa, "bugun" bilan navbat kuni farq qilishi
 * mumkin — shuning uchun sana hamma joyda shu o'zgaruvchidan olinadi.
 */
const DAY = () => localDate(slot(0));

before(async () => {
  await query(fs.readFileSync(path.join(config.root, 'db', 'schema.sql'), 'utf8'));
  await query(`TRUNCATE appointments, notifications, audit_log, orders, visits, patients,
                        sessions, users, branches RESTART IDENTITY CASCADE`);

  const b = await query(`INSERT INTO branches (name) VALUES ('Markaziy') RETURNING id`);
  for (const [u, name, role] of [
    ['admin', 'Bosh administrator', 'admin'],
    ['dilnoza', 'Dilnoza Karimova', 'laborant'],
    ['shifokor', 'Aziz Rahimov', 'doctor'],
  ]) {
    await query(
      `INSERT INTO users (username, password_hash, full_name, role, branch_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [u, await hashPassword('Parol12345'), name, role, b.rows[0].id],
    );
  }

  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const login = async (u) => (await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: u, password: 'Parol12345' }),
  }).then((r) => r.json())).token;

  adminToken = await login('admin');
  regToken = await login('dilnoza');
  doctorToken = await login('shifokor');
});

after(async () => {
  server?.close();
  await pool.end();
});

// ---------------------------------------------------------------------------

let first;

test('registratura telefondagi bemorni navbatga yozadi', async () => {
  const res = await api('POST', '/api/appointments', {
    body: {
      last_name: 'Karimov', first_name: 'Anvar', age_years: 41, gender: 'm',
      phone: '+998901234567', region: 'Toshkent viloyati', district: 'Zangiota',
      scheduled_at: slot(0), note: 'Och qoringa keladi',
    },
  });
  assert.equal(res.status, 201);
  first = await res.json();

  assert.equal(first.queue_number, 1);
  assert.equal(first.status, 'booked');
  assert.equal(first.phone, '+998901234567');
  assert.equal(first.region, 'Toshkent viloyati');
  assert.equal(first.patient_id, null);       // karta hali ochilmagan
  assert.equal(first.scheduled_date, localDate(first.scheduled_at));
  assert.equal(first.scheduled_date, DAY());

  const log = await one(`SELECT * FROM audit_log WHERE entity = 'appointment' ORDER BY at DESC LIMIT 1`);
  assert.match(log.description, /Navbatga yozildi №1: Karimov Anvar/);
  assert.match(log.description, /Zangiota/);
  assert.equal(log.computer_name, 'REGISTRATURA-PC');
});

test('navbat raqami kun bo‘yicha ketma-ket beriladi', async () => {
  const second = await api('POST', '/api/appointments', {
    body: {
      last_name: 'Yusupova', first_name: 'Nodira', age_years: 29, gender: 'f',
      phone: '+998935556677', region: 'Toshkent shahri',
      scheduled_at: slot(1),
    },
  }).then((r) => r.json());
  assert.equal(second.queue_number, 2);
});

test('bir vaqtga sig‘imdan ortiq yozib bo‘lmaydi', async () => {
  const busy = slot(2);
  const ok1 = await api('POST', '/api/appointments', {
    body: { last_name: 'A', first_name: 'A', phone: '+998900000001', scheduled_at: busy },
  });
  const ok2 = await api('POST', '/api/appointments', {
    body: { last_name: 'B', first_name: 'B', phone: '+998900000002', scheduled_at: busy },
  });
  const third = await api('POST', '/api/appointments', {
    body: { last_name: 'C', first_name: 'C', phone: '+998900000003', scheduled_at: busy },
  });

  assert.equal(ok1.status, 201);
  assert.equal(ok2.status, 201);
  assert.equal(third.status, 409);            // sig'im 2 ta
  assert.match((await third.json()).error, /band/);
});

test('o‘tgan vaqtga navbat berilmaydi', async () => {
  const res = await api('POST', '/api/appointments', {
    body: {
      last_name: 'X', first_name: 'X', phone: '+998900000009',
      scheduled_at: new Date(Date.now() - 3600_000).toISOString(),
    },
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /O‘tgan vaqtga/);
});

test('bo‘sh vaqtlar ro‘yxati band joylarni ko‘rsatadi', async () => {
  const d = await api('GET', `/api/appointments/slots?date=${DAY()}`).then((r) => r.json());

  const full = d.slots.find((s) => s.time === localTime(slot(2)));
  assert.equal(full.booked, 2);
  assert.equal(full.free, 0);

  const half = d.slots.find((s) => s.time === localTime(slot(0)));
  assert.equal(half.booked, 1);
  assert.equal(half.free, 1);
});

test('o‘tib ketgan vaqtlar bo‘sh deb ko‘rsatilmaydi', async () => {
  const d = await api('GET', `/api/appointments/slots?date=${localDate()}`).then((r) => r.json());
  const nowHM = localTime(new Date());
  const past = d.slots.filter((s) => s.time <= nowHM);

  // Bugungi kun uchun o'tgan oraliqlar tanlanmaydi
  assert.ok(past.every((s) => s.past === true && s.free === 0));
  // Ertangi kun uchun hammasi bo'sh.
  // Sana laboratoriya vaqt mintaqasida hisoblanadi — UTC bo'yicha "ertaga"
  // Toshkent vaqtida "bugun" bo'lib qolishi mumkin (yarim tundan keyin).
  const tomorrow = localDate(new Date(Date.now() + 864e5));
  const t = await api('GET', `/api/appointments/slots?date=${tomorrow}`).then((r) => r.json());
  assert.ok(t.slots.every((s) => s.past === false));
});

test('kunlik navbat ro‘yxati vaqt bo‘yicha tartiblanadi', async () => {
  const d = await api('GET', `/api/appointments?date=${DAY()}`).then((r) => r.json());
  assert.equal(d.counts.total, 4);
  assert.equal(d.counts.waiting, 4);
  assert.equal(d.items[0].queue_number, 1);
  assert.equal(d.items[0].time, localTime(d.items[0].scheduled_at));
});

test('telefon raqami bo‘yicha oldingi murojaat topiladi', async () => {
  const d = await api('GET', '/api/appointments/lookup?q=901234567').then((r) => r.json());
  assert.equal(d.previous.length, 1);
  assert.equal(d.previous[0].last_name, 'Karimov');
  assert.equal(d.previous[0].region, 'Toshkent viloyati');
});

test('navbat yaqinlashganda bemorga xabar navbatga qo‘yiladi', async () => {
  // 20 daqiqadan keyingi navbat
  const soon = await api('POST', '/api/appointments', {
    body: {
      last_name: 'Toshmatov', first_name: 'Olim', phone: '+998901112233',
      scheduled_at: new Date(Date.now() + 20 * 60_000).toISOString(),
    },
  }).then((r) => r.json());

  const sent = await sendReminders();
  assert.ok(sent >= 1);

  const n = await one(`SELECT * FROM notifications WHERE recipient = '+998901112233'`);
  assert.equal(n.channel, 'sms');
  assert.match(n.body, new RegExp(`navbat №${soon.queue_number}`));
  assert.match(n.body, /navbatdasiz/);
  assert.equal(n.status, 'queued');    // kanal sozlanmagan — navbatda saqlanadi

  // Ikkinchi marta yuborilmaydi
  await sendReminders();
  const count = await one(`SELECT count(*)::int AS c FROM notifications WHERE recipient = '+998901112233'`);
  assert.equal(count.c, 1);

  // Xodim ekranida ko'rinishi uchun audit yozuvi (aynan shu navbat bo'yicha)
  const log = await one(
    `SELECT * FROM audit_log WHERE action = 'REMINDER' AND entity_id = $1`,
    [String(soon.id)],
  );
  assert.match(log.description, /Navbat yaqinlashmoqda/);
  assert.match(log.description, /Toshmatov Olim/);
});

test('yaqinlashayotgan navbatlar ro‘yxati qancha vaqt qolganini ko‘rsatadi', async () => {
  const d = await api('GET', '/api/appointments/upcoming').then((r) => r.json());
  const olim = d.items.find((i) => i.last_name === 'Toshmatov');
  assert.ok(olim);
  assert.ok(olim.minutes_left <= 20 && olim.minutes_left >= 18);
});

test('bemor kelganda karta avtomatik ochiladi', async () => {
  const res = await api('POST', `/api/appointments/${first.id}/arrive`, { body: {} });
  assert.equal(res.status, 200);
  const r = await res.json();

  assert.equal(r.created_card, true);
  assert.ok(r.patient_id);

  const p = await one('SELECT * FROM patients WHERE id = $1', [r.patient_id]);
  assert.equal(p.last_name, 'Karimov');
  assert.equal(p.phone, '+998901234567');
  assert.match(p.address, /Zangiota/);          // hudud manzilga o'tdi
  assert.equal(new Date(p.birth_date).getFullYear(), new Date().getFullYear() - 41);

  const a = await one('SELECT * FROM appointments WHERE id = $1', [first.id]);
  assert.equal(a.status, 'arrived');
  assert.equal(a.patient_id, r.patient_id);
});

test('bir xil bemor qayta kelsa yangi karta ochilmaydi', async () => {
  const repeat = await api('POST', '/api/appointments', {
    body: {
      last_name: 'Karimov', first_name: 'Anvar', phone: '+998901234567',
      scheduled_at: slot(6),
    },
  }).then((r) => r.json());

  const r = await api('POST', `/api/appointments/${repeat.id}/arrive`, { body: {} }).then((x) => x.json());
  assert.equal(r.created_card, false);          // mavjud karta topildi

  const count = await one(`SELECT count(*)::int AS c FROM patients WHERE phone = '+998901234567'`);
  assert.equal(count.c, 1);
});

test('kelmagan bemor avtomatik belgilanadi', async () => {
  const target = await one(
    `SELECT id FROM appointments WHERE status IN ('booked','confirmed')
      ORDER BY queue_number LIMIT 1`,
  );
  await query(
    `UPDATE appointments SET scheduled_at = now() - interval '90 minutes' WHERE id = $1`,
    [target.id],
  );
  const marked = await markNoShows(45);
  assert.ok(marked >= 1);

  const a = await one('SELECT status FROM appointments WHERE id = $1', [target.id]);
  assert.equal(a.status, 'no_show');
});

test('shifokor navbat yoza olmaydi, lekin ko‘ra oladi', async () => {
  const post = await api('POST', '/api/appointments', {
    tok: doctorToken,
    body: { last_name: 'Y', first_name: 'Y', phone: '+998900000010', scheduled_at: slot(8) },
  });
  assert.equal(post.status, 403);

  const get = await api('GET', '/api/appointments', { tok: doctorToken });
  assert.equal(get.status, 200);
});

test('hudud statistikasi administrator uchun ochiq', async () => {
  const d = await api('GET', `/api/appointments/stats?from=${DAY()}&to=${DAY()}`, { tok: adminToken }).then((r) => r.json());
  const tv = d.byRegion.find((r) => r.region === 'Toshkent viloyati');
  assert.ok(tv.c >= 1);
  assert.ok(d.summary.total >= 5);

  const forbidden = await api('GET', '/api/appointments/stats');   // laborant
  assert.equal(forbidden.status, 403);
});

test('navbat bekor qilinsa auditda sabab qoladi', async () => {
  const a = await many(`SELECT id FROM appointments WHERE status = 'booked' LIMIT 1`);
  const res = await api('POST', `/api/appointments/${a[0].id}/cancel`, {
    body: { reason: 'Bemor o‘zi bekor qildi' },
  });
  assert.equal(res.status, 200);

  const log = await one(`SELECT * FROM audit_log WHERE description LIKE 'Navbat bekor%' ORDER BY at DESC LIMIT 1`);
  assert.match(log.description, /Bemor o‘zi bekor qildi/);
});
