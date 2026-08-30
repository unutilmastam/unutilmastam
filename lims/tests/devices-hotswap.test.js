import './setup-env.js';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { pool, one, query } from '../src/db.js';
import { config } from '../src/config.js';
import { startDeviceListeners, stopDeviceListeners } from '../src/services/devices.js';

before(async () => {
  await query(fs.readFileSync(path.join(config.root, 'db', 'schema.sql'), 'utf8'));
  await query('TRUNCATE device_messages, device_mappings, devices RESTART IDENTITY CASCADE');
});

after(async () => {
  await stopDeviceListeners();
  await pool.end();
});

/**
 * Yangi uskuna qo'shilganda avvalgi uskunaning ochiq ulanishi uzilmasligi
 * kerak — aks holda o'sha paytda natija yuborayotgan analizator xabari
 * yo'qoladi.
 */
test('yangi uskuna qo‘shilganda eski uskunaning ulanishi uzilmaydi', async () => {
  const portA = 15900 + Math.floor(Math.random() * 200);
  await one(`INSERT INTO devices (name, protocol, host, port)
             VALUES ('Uskuna-A','hl7','127.0.0.1',$1) RETURNING id`, [portA]);
  assert.equal(await startDeviceListeners(), 1);

  // Analizator ulanib turibdi
  const socket = await new Promise((resolve, reject) => {
    const s = net.connect(portA, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  let closed = false;
  socket.on('close', () => { closed = true; });

  // Ikkinchi uskuna qo'shildi
  const portB = portA + 1;
  await one(`INSERT INTO devices (name, protocol, host, port)
             VALUES ('Uskuna-B','hl7','127.0.0.1',$1) RETURNING id`, [portB]);
  assert.equal(await startDeviceListeners(), 2);

  await new Promise((r) => setTimeout(r, 300));
  assert.equal(closed, false, 'A uskunasining ulanishi uzilib ketdi');
  assert.equal(socket.destroyed, false);

  socket.end();
});

test('uskuna o‘chirilsa porti bo‘shatiladi', async () => {
  const dev = await one(`SELECT id, port FROM devices WHERE name = 'Uskuna-B'`);
  await query('UPDATE devices SET is_active = false WHERE id = $1', [dev.id]);
  assert.equal(await startDeviceListeners(), 1);

  // Port bo'shagan bo'lsa, o'sha portni band qila olamiz
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(dev.port, '127.0.0.1', () => probe.close(resolve));
  });
});
