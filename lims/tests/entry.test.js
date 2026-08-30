/**
 * Server ishga tushishi — "to'g'ridan-to'g'ri ishga tushirildimi?" tekshiruvi.
 *
 * Windows'da server jimgina, hech qanday xabarsiz ishga tushmay chiqib
 * ketardi. Sababi shu bitta satr edi:
 *
 *     if (import.meta.url === `file://${process.argv[1]}`) start();
 *
 * Linux'da bu ishlaydi ("file://" + "/home/..." = "file:///home/..."),
 * Windows'da esa hech qachon:
 *     import.meta.url        -> file:///C:/LabCore/src/index.js
 *     "file://" + argv[1]    -> file://C:\LabCore\src\index.js
 *
 * Natijada Node modulni yuklardi, start() chaqirilmasdi va jarayon
 * xatosiz, bo'sh ekran bilan tugardi. Diagnostika ham hech narsa
 * ko'rsatolmasdi - chunki chiqish umuman yo'q edi.
 */
import './setup-env.js';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { config } from '../src/config.js';

/** Windows yo'li bilan solishtirish: eski usul yiqiladi, yangisi — yo'q. */
test('kirish nuqtasi tekshiruvi Windows yo‘llarida ham ishlaydi', () => {
  const winArgv = 'C:\\LabCore\\src\\index.js';
  const winUrl = 'file:///C:/LabCore/src/index.js';

  // Eski usul — Windows'da hech qachon mos kelmaydi
  assert.notEqual(winUrl, `file://${winArgv}`,
    'eski usul kutilmaganda ishlab ketdi — test eskirgan');

  // pathToFileURL esa platformaga qarab to'g'ri qiymat beradi
  const posixArgv = '/opt/labcore/src/index.js';
  assert.equal(pathToFileURL(posixArgv).href, 'file:///opt/labcore/src/index.js');
});

test('src/index.js kirish nuqtasini pathToFileURL bilan aniqlaydi', () => {
  const file = path.join(config.root, 'src', 'index.js');
  const text = fs.readFileSync(file, 'utf8');

  assert.match(text, /pathToFileURL\(process\.argv\[1\]\)\.href/,
    'kirish nuqtasi pathToFileURL bilan tekshirilmagan');

  // Eski, Windows'da buziladigan shakl qaytib kelmasin
  const bad = text.split('\n').filter((l) =>
    !l.trim().startsWith('*') && !l.trim().startsWith('//') && /`file:\/\/\$\{/.test(l));
  assert.deepEqual(bad, [],
    `Windows'da buziladigan shakl ishlatilgan:\n  ${bad.join('\n  ')}`);
});

/**
 * Eng ishonchli tekshiruv: serverni haqiqatan ishga tushirib ko'ramiz.
 * Agar kirish nuqtasi ishlamasa, jarayon hech narsa yozmasdan tugaydi -
 * test aynan shuni ushlaydi.
 */
test('node src/index.js serverni haqiqatan ko‘taradi', async () => {
  const port = 4700 + Math.floor(Math.random() * 100);
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: config.root,
    env: { ...process.env, PORT: String(port) },
  });

  let chiqish = '';
  child.stdout.on('data', (d) => { chiqish += d; });
  child.stderr.on('data', (d) => { chiqish += d; });

  const kutildi = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 15_000);
    const check = setInterval(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (r.ok) { clearTimeout(t); clearInterval(check); resolve(true); }
      } catch { /* hali ko'tarilmadi */ }
    }, 300);
    child.on('exit', () => { clearTimeout(t); clearInterval(check); resolve(false); });
  });

  child.kill('SIGTERM');
  await new Promise((r) => child.on('exit', r));

  assert.ok(kutildi,
    `Server ko‘tarilmadi. Jarayon chiqishi:\n${chiqish || '(bo‘sh — start() umuman chaqirilmagan)'}`);
});
