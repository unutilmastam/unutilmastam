/**
 * "Server bir ishlaydi, bir ishlamaydi" — barqarorlik tekshiruvi.
 *
 * MUAMMO. pg.Pool bo'sh turgan (idle) ulanishda xato yuz berganda 'error'
 * hodisasini chiqaradi. Node'da EventEmitter'ning 'error' hodisasini hech
 * kim tinglamasa, jarayon O'SHA ZAHOTI QULAYDI — hech qanday xabar
 * qoldirmasdan.
 *
 * Amalda bu shunday ko'rinardi: server ko'tariladi, foydalanuvchi tizimga
 * kiradi, keyin PostgreSQL yoki antivirus/VPN bo'sh TCP ulanishini uzadi va
 * server "sababsiz" o'chadi. Windows vazifasi uni har daqiqada qayta
 * ko'taradi — cheksiz aylanma hosil bo'ladi.
 *
 * Quyidagi testlar shu holatni haqiqiy PostgreSQL ustida takrorlaydi.
 */
import './setup-env.js';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';

test('pool uchun "error" tinglovchisi ro‘yxatdan o‘tgan', () => {
  assert.ok(pool.listenerCount('error') > 0,
    'pool.on(\'error\') yo‘q — bo‘sh ulanishdagi xato jarayonni qulatadi');
});

test('db.js da keepAlive va idle vaqti sozlangan', () => {
  const text = fs.readFileSync(path.join(config.root, 'src', 'db.js'), 'utf8');
  assert.match(text, /pool\.on\(\s*'error'/, 'pool.on(\'error\') satri yo‘q');
  assert.match(text, /keepAlive:\s*true/, 'keepAlive yoqilmagan');
  assert.match(text, /idleTimeoutMillis/, 'idleTimeoutMillis berilmagan');
});

/**
 * Eng ishonchli tekshiruv: alohida jarayonda bo'sh ulanishni bazaning
 * o'zidan uzib tashlaymiz (pg_terminate_backend) va jarayon tirik
 * qolishini talab qilamiz. Tuzatishsiz bu jarayon 1 kod bilan quladi.
 */
test('bo‘sh ulanish uzilganda jarayon qulamaydi', async () => {
  const kod = `
    import { pool, query } from '${pathToUrl(path.join(config.root, 'src', 'db.js'))}';
    // Ikkita alohida ulanish: birinchisini bo'sh qoldiramiz, ikkinchisi orqali
    // uni bazaning o'zidan uzib tashlaymiz (antivirus/VPN qiladigan ish).
    const qurbon = await pool.connect();
    const qotil = await pool.connect();
    const { rows } = await qurbon.query('SELECT pg_backend_pid() AS pid');
    qurbon.release();                  // ulanish endi hovuzda BO'SH turibdi
    await qotil.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
    await new Promise((r) => setTimeout(r, 1500));   // 'error' hodisasi shu yerda keladi
    qotil.release();
    const { rows: r2 } = await query('SELECT 1 AS n');   // yangi ulanish olinadi
    console.log('TIRIK', r2[0].n);
    await pool.end();
  `;

  const child = spawn(process.execPath, ['--input-type=module', '-e', kod], {
    cwd: config.root,
    env: process.env,
  });

  let chiqish = '';
  child.stdout.on('data', (d) => { chiqish += d; });
  child.stderr.on('data', (d) => { chiqish += d; });

  const code = await new Promise((r) => child.on('exit', r));

  assert.equal(code, 0,
    `Jarayon ${code} kodi bilan tugadi — bo‘sh ulanishdagi xato uni qulatdi.\n${chiqish}`);
  assert.match(chiqish, /TIRIK 1/, `Yangi ulanish olinmadi:\n${chiqish}`);
});

/** Qulash sababi jurnalga yozilishi kerak — vazifa sifatida ekran yo'q. */
test('ushlanmagan xato jurnalga yoziladi', async () => {
  const kod = `
    import { installCrashLogging } from '${pathToUrl(path.join(config.root, 'src', 'index.js'))}';
    installCrashLogging();
    setTimeout(() => { throw new Error('sinov-xatosi'); }, 10);
  `;

  const child = spawn(process.execPath, ['--input-type=module', '-e', kod], {
    cwd: config.root,
    env: process.env,
  });

  let chiqish = '';
  child.stdout.on('data', (d) => { chiqish += d; });
  child.stderr.on('data', (d) => { chiqish += d; });
  await new Promise((r) => child.on('exit', r));

  assert.match(chiqish, /QULASH/, `Qulash sababi yozilmadi:\n${chiqish}`);
  assert.match(chiqish, /sinov-xatosi/, `Xato matni yozilmadi:\n${chiqish}`);
  // Vaqt tamg'asi bo'lishi shart: jurnalda "qachon" eng muhim ma'lumot
  assert.match(chiqish, /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/,
    `Jurnal satrlarida vaqt yo‘q:\n${chiqish}`);
});

function pathToUrl(p) {
  return new URL(`file://${p.startsWith('/') ? '' : '/'}${p.replace(/\\/g, '/')}`).href;
}
