import './setup-env.js';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/index.js';
import { pool, one, query } from '../src/db.js';
import { hashPassword } from '../src/lib/auth.js';
import { config } from '../src/config.js';
import { parseAstm, parseCsv, parseHl7, ingest } from '../src/services/devices.js';

let server;
let base;
let token;
let barcode;
let orderId;
let device;

before(async () => {
  await query(fs.readFileSync(path.join(config.root, 'db', 'schema.sql'), 'utf8'));
  await query(`TRUNCATE device_messages, device_mappings, devices, audit_log, results,
                        order_items, orders, visits, patients, sessions,
                        test_reference_ranges, test_catalog, users, branches
               RESTART IDENTITY CASCADE`);

  const b = await query(`INSERT INTO branches (name) VALUES ('Test') RETURNING id`);
  await query(
    `INSERT INTO users (username, password_hash, full_name, role, branch_id)
     VALUES ('admin', $1, 'Bosh administrator', 'admin', $2)`,
    [await hashPassword('Admin12345'), b.rows[0].id],
  );
  const t = await query(
    `INSERT INTO test_catalog (code, name, category, unit, price)
     VALUES ('HGB','Gemoglobin','Qon tahlili','g/L',25000) RETURNING id`,
  );
  await query(
    `INSERT INTO test_reference_ranges (test_id, gender, low, high, critical_low, critical_high)
     VALUES ($1,'u',120,150,70,200)`,
    [t.rows[0].id],
  );

  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin12345', computerName: 'TEST-PC' }),
  }).then((r) => r.json());
  token = login.token;

  const patient = await fetch(base + '/api/patients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ last_name: 'Karimov', first_name: 'Anvar', birth_date: '1985-03-12', gender: 'm' }),
  }).then((r) => r.json());

  const order = await fetch(base + '/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ patient_id: patient.id, test_ids: [t.rows[0].id] }),
  }).then((r) => r.json());
  orderId = order.id;

  const item = await one('SELECT sample_barcode FROM order_items WHERE order_id = $1', [orderId]);
  barcode = item.sample_barcode;
});

after(async () => {
  server?.close();
  await pool.end();
});

// ---------------------------------------------------------------------------
// Parserlar
// ---------------------------------------------------------------------------

test('HL7 ORU xabaridan natija ajratiladi', () => {
  const raw = [
    'MSH|^~\\&|BC-20|LAB|LABCORE|LAB|20260804140000||ORU^R01|77|P|2.3.1',
    'PID|1||100025||Karimov^Anvar',
    'OBR|1||NAMUNA-1||||20260804140000',
    'OBX|1|NM|HGB^Hemoglobin||130|g/L|120-150|N|||F',
    'OBX|2|NM|WBC^Leykotsit||6.4|10*9/L|4-9|N|||F',
  ].join('\r');

  const items = parseHl7(raw);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { sample: 'NAMUNA-1', code: 'HGB', value: '130', unit: 'g/L' });
  assert.equal(items[1].code, 'WBC');
});

test('ASTM xabaridan natija ajratiladi', () => {
  const raw = [
    'H|\\^&|||BC-20^1.0|||||||P||20260804',
    'P|1||100025||Karimov^Anvar',
    'O|1|NAMUNA-2||^^^HGB|R|20260804',
    'R|1|^^^HGB|118|g/L||L||F||||20260804',
    'L|1|N',
  ].join('\r');

  const items = parseAstm(raw);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { sample: 'NAMUNA-2', code: 'HGB', value: '118', unit: 'g/L' });
});

test('CSV faylidan natija ajratiladi va sarlavha o‘tkazib yuboriladi', () => {
  const items = parseCsv('sample,code,value,unit\nNAMUNA-3,HGB,142,g/L\n\nNAMUNA-3,GLU,5.1,mmol/L');
  assert.equal(items.length, 2);
  assert.equal(items[0].sample, 'NAMUNA-3');
  assert.equal(items[1].code, 'GLU');
});

// ---------------------------------------------------------------------------
// Natijani buyurtmaga bog'lash
// ---------------------------------------------------------------------------

test('administrator uskuna qo‘shadi va kalit oladi', async () => {
  const res = await fetch(base + '/api/devices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Mindray BC-20', protocol: 'http' }),
  });
  assert.equal(res.status, 201);
  device = await res.json();
  assert.equal(device.api_token.length, 48);
});

test('uskuna shtrix-kod bo‘yicha natijani to‘g‘ri buyurtmaga yozadi', async () => {
  const raw = [
    'MSH|^~\\&|BC-20|LAB|LABCORE|LAB|20260804140000||ORU^R01|78|P|2.3.1',
    `OBR|1||${barcode}||||20260804140000`,
    'OBX|1|NM|HGB^Hemoglobin||118|g/L|120-150|L|||F',
  ].join('\r');

  const res = await fetch(base + '/api/devices/intake', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-device-token': device.api_token },
    body: raw,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.applied, 1);

  const result = await one(
    `SELECT r.* FROM results r JOIN order_items oi ON oi.id = r.order_item_id
      WHERE oi.order_id = $1`,
    [orderId],
  );
  assert.equal(result.value_num, 118);
  assert.equal(result.flag, 'low');           // norma 120–150
  assert.equal(result.device, 'Mindray BC-20');
  assert.equal(result.entered_by, null);      // odam emas, uskuna
  assert.equal(result.confirmed_at, null);    // tasdiqlash hali kutilmoqda

  const order = await one('SELECT status FROM orders WHERE id = $1', [orderId]);
  assert.equal(order.status, 'ready');
});

test('uskuna auditda alohida ko‘rinadi', async () => {
  const log = await one(
    `SELECT * FROM audit_log WHERE entity = 'result' ORDER BY at DESC LIMIT 1`,
  );
  assert.equal(log.user_name, 'Uskuna: Mindray BC-20');
  assert.equal(log.user_id, null);
  assert.match(log.description, /Uskunadan natija keldi/);
  assert.equal(log.new_data.value, 118);
});

test('noto‘g‘ri kalit bilan natija qabul qilinmaydi', async () => {
  const res = await fetch(base + '/api/devices/intake', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-device-token': 'yaroqsiz' },
    body: 'NAMUNA,HGB,130,g/L',
  });
  assert.equal(res.status, 401);
});

test('uskuna odam kiritgan natijani bosib ketmaydi', async () => {
  const item = await one('SELECT id FROM order_items WHERE order_id = $1', [orderId]);

  // Laborant qo'lda tuzatadi
  await fetch(base + `/api/orders/${orderId}/results`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: [{ order_item_id: item.id, value: 131 }] }),
  });

  // Uskuna eski qiymatni qayta yuboradi
  const res = await fetch(base + '/api/devices/intake', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-device-token': device.api_token },
    body: `${barcode},HGB,118,g/L`,
  }).then((r) => r.json());

  assert.equal(res.applied, 0);
  assert.match(res.skipped[0].reason, /allaqachon kiritilgan/);

  const result = await one(
    `SELECT r.value_num FROM results r JOIN order_items oi ON oi.id = r.order_item_id
      WHERE oi.order_id = $1`,
    [orderId],
  );
  assert.equal(result.value_num, 131);   // laborant qiymati saqlanib qoldi
});

test('noma’lum shtrix-kod xato bo‘lib yoziladi, xabar arxivda qoladi', async () => {
  const dev = await one('SELECT * FROM devices WHERE id = $1', [device.id]);
  const res = await ingest(dev, 'YOQ-BUNDAY-KOD,HGB,130,g/L');
  assert.equal(res.applied.length, 0);
  assert.match(res.skipped[0].reason, /topilmadi/);

  const msg = await one('SELECT * FROM device_messages ORDER BY id DESC LIMIT 1');
  assert.equal(msg.status, 'failed');
  assert.match(msg.raw, /YOQ-BUNDAY-KOD/);
});

test('uskuna kodi katalog kodidan farq qilsa, bog‘lanish jadvali ishlaydi', async () => {
  const t = await one(`SELECT id FROM test_catalog WHERE code = 'HGB'`);
  await fetch(base + `/api/devices/${device.id}/mappings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ device_code: 'HB-01', test_id: t.id, factor: 10 }),
  });

  // Yangi buyurtma — bo'sh natija bilan
  const patient = await one('SELECT id FROM patients LIMIT 1');
  const order = await fetch(base + '/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ patient_id: patient.id, test_ids: [t.id] }),
  }).then((r) => r.json());
  const item = await one('SELECT sample_barcode FROM order_items WHERE order_id = $1', [order.id]);

  const res = await fetch(base + '/api/devices/intake', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-device-token': device.api_token },
    body: `${item.sample_barcode},HB-01,13.1,g/dL`,
  }).then((r) => r.json());

  assert.equal(res.applied, 1);
  const result = await one(
    `SELECT r.value_num FROM results r JOIN order_items oi ON oi.id = r.order_item_id
      WHERE oi.order_id = $1`,
    [order.id],
  );
  assert.equal(result.value_num, 131);   // 13.1 g/dL × 10 = 131 g/L
});

// ---------------------------------------------------------------------------
// TCP (HL7 MLLP) — analizator tarmoq orqali natija yuboradi
// ---------------------------------------------------------------------------

test('analizator TCP orqali HL7 yuboradi va ACK oladi', async () => {
  const net = await import('node:net');
  const { startDeviceListeners, stopDeviceListeners } = await import('../src/services/devices.js');

  const port = 15400 + Math.floor(Math.random() * 500);
  const dev = await one(
    `INSERT INTO devices (name, protocol, host, port) VALUES ($1,'hl7','127.0.0.1',$2) RETURNING *`,
    [`Sysmex-TCP-${port}`, port],
  );
  await startDeviceListeners();

  // Yangi buyurtma — uskuna natija yozishi uchun
  const t = await one(`SELECT id FROM test_catalog WHERE code = 'HGB'`);
  const patient = await one('SELECT id FROM patients LIMIT 1');
  const order = await fetch(base + '/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ patient_id: patient.id, test_ids: [t.id] }),
  }).then((r) => r.json());
  const item = await one('SELECT sample_barcode FROM order_items WHERE order_id = $1', [order.id]);

  const hl7 =
    'MSH|^~\\&|SYSMEX|LAB|LABCORE|LAB|20260804150000||ORU^R01|909|P|2.3.1\r' +
    `OBR|1||${item.sample_barcode}||||20260804150000\r` +
    'OBX|1|NM|HGB^Hemoglobin||205|g/L|120-150|H|||F\r';

  const ack = await new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(Buffer.concat([Buffer.from([0x0b]), Buffer.from(hl7), Buffer.from([0x1c, 0x0d])]));
    });
    socket.on('data', (d) => { resolve(d.toString('utf8')); socket.end(); });
    socket.on('error', reject);
    setTimeout(() => reject(new Error('ACK kelmadi')), 5000);
  });

  assert.match(ack, /MSA\|AA\|909/);          // uskuna tasdiq oldi

  const result = await one(
    `SELECT r.value_num, r.flag, r.device FROM results r
       JOIN order_items oi ON oi.id = r.order_item_id WHERE oi.order_id = $1`,
    [order.id],
  );
  assert.equal(result.value_num, 205);
  assert.equal(result.flag, 'critical_high');  // kritik chegara 200
  assert.equal(result.device, dev.name);

  await stopDeviceListeners();
});

test('papkaga tashlangan CSV fayl avtomatik o‘qiladi', async () => {
  const { startDeviceListeners, stopDeviceListeners } = await import('../src/services/devices.js');
  const folder = path.join(process.env.DATA_DIR, 'uskuna-papka');
  fs.mkdirSync(folder, { recursive: true });

  await one(
    `INSERT INTO devices (name, protocol, folder) VALUES ('Papka-uskuna','folder',$1) RETURNING *`,
    [folder],
  );
  await startDeviceListeners();

  const t = await one(`SELECT id FROM test_catalog WHERE code = 'HGB'`);
  const patient = await one('SELECT id FROM patients LIMIT 1');
  const order = await fetch(base + '/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ patient_id: patient.id, test_ids: [t.id] }),
  }).then((r) => r.json());
  const item = await one('SELECT sample_barcode FROM order_items WHERE order_id = $1', [order.id]);

  fs.writeFileSync(path.join(folder, 'natija.csv'), `${item.sample_barcode},HGB,145,g/L\n`);

  // Kuzatuvchi 5 soniyada bir tekshiradi
  let result = null;
  for (let i = 0; i < 20 && !result?.value_num; i++) {
    await new Promise((r) => setTimeout(r, 500));
    result = await one(
      `SELECT r.value_num FROM results r JOIN order_items oi ON oi.id = r.order_item_id
        WHERE oi.order_id = $1`,
      [order.id],
    );
  }
  assert.equal(result.value_num, 145);
  assert.ok(fs.existsSync(path.join(folder, 'qabul_qilingan')));
  assert.equal(fs.existsSync(path.join(folder, 'natija.csv')), false); // arxivga ko'chdi

  await stopDeviceListeners();
});
