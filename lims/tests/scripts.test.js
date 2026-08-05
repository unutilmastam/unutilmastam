import './setup-env.js';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

/**
 * Windows PowerShell 5.1 .ps1 faylni UTF-8 emas, ANSI (CP1251/CP1252) deb
 * o'qiydi. Shunda '—' belgisi (E2 80 94) 'â€"' bo'lib chiqadi va ichidagi
 * qo'shtirnoq satrni erta yopib yuboradi — butun skript ishga tushmaydi.
 *
 * Shuning uchun .ps1 fayllar faqat ASCII belgilardan iborat bo'lishi shart:
 * u holda kodlash qanday talqin qilinishidan qat'i nazar fayl bir xil o'qiladi.
 */
test('PowerShell skriptlari faqat ASCII belgilardan iborat', () => {
  const dir = path.join(config.root, 'deploy', 'windows');
  const scripts = fs.readdirSync(dir).filter((f) => f.endsWith('.ps1'));
  assert.ok(scripts.length > 0, 'skriptlar topilmadi');

  for (const name of scripts) {
    const buf = fs.readFileSync(path.join(dir, name));
    const bad = [];
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > 127) {
        const line = buf.subarray(0, i).toString('utf8').split('\n').length;
        bad.push(`${name}:${line} — bayt 0x${buf[i].toString(16)}`);
        if (bad.length >= 5) break;
      }
    }
    assert.equal(bad.length, 0,
      `${name} ichida ASCII bo'lmagan belgi bor (PowerShell 5.1 buzib o'qiydi):\n  ${bad.join('\n  ')}`);
  }
});

/** Sintaksis buzilmaganini oddiy tekshiruv: qavslar muvozanati. */
test('PowerShell skriptlarida qavslar muvozanatda', () => {
  const dir = path.join(config.root, 'deploy', 'windows');
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.ps1'))) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8')
      .replace(/#.*$/gm, '')          // izohlar
      .replace(/"[^"\n]*"/g, '""')    // qo'shtirnoqli satrlar
      .replace(/'[^'\n]*'/g, "''");   // bitta tirnoqli satrlar
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      const o = (text.match(new RegExp('\\' + open, 'g')) || []).length;
      const c = (text.match(new RegExp('\\' + close, 'g')) || []).length;
      assert.equal(o, c, `${name}: ${open}${close} qavslari muvozanatda emas (${o} va ${c})`);
    }
  }
});

/**
 * Avtozapusk uchta joyda bir-biriga bog'langan: asosiy jarayon (main.js),
 * ko'prik (preload.js) va sozlash oynasi (setup.js). Biri o'zgarib,
 * ikkinchisi qolib ketsa belgi bosiladi-yu hech narsa bo'lmaydi —
 * shuning uchun bog'lanish shu yerda tekshiriladi.
 */
test('Windows dasturida avtozapusk uchi-uchiga ulangan', () => {
  const dir = path.join(config.root, 'desktop');
  const main = fs.readFileSync(path.join(dir, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(dir, 'preload.js'), 'utf8');
  const setup = fs.readFileSync(path.join(dir, 'setup.js'), 'utf8');
  const html = fs.readFileSync(path.join(dir, 'setup.html'), 'utf8');

  assert.match(main, /setLoginItemSettings/, 'main.js avtozapuskni sozlamaydi');
  assert.match(main, /ipcMain\.handle\('labcore:set-autostart'/, 'set-autostart kanali yo‘q');
  assert.match(main, /ipcMain\.handle\('labcore:get-autostart'/, 'get-autostart kanali yo‘q');
  assert.match(main, /requestSingleInstanceLock/, 'dastur ikki marta ochilishi mumkin');

  assert.match(preload, /labcore:set-autostart/, 'preload set-autostart ni uzatmaydi');
  assert.match(preload, /labcore:get-autostart/, 'preload get-autostart ni uzatmaydi');

  assert.match(html, /id="autostart"/, 'sozlash oynasida belgi yo‘q');
  assert.match(setup, /autoStart:\s*autoStart\.checked/, 'belgi saqlanmaydi');
});

/** Avtozapusk skripti yoqish, o'chirish va holatni ko'rsatishni biladi. */
test('avtozapusk.ps1 uchala rejimni qo‘llaydi', () => {
  const file = path.join(config.root, 'deploy', 'windows', 'avtozapusk.ps1');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /\[switch\]\$Off/);
  assert.match(text, /\[switch\]\$Status/);
  assert.match(text, /CurrentVersion\\Run/);
  assert.match(text, /Remove-ItemProperty/, 'o‘chirish yo‘q');
  assert.match(text, /Set-ItemProperty/, 'yoqish yo‘q');
});

/**
 * Windows hisob nomlari tilga bog'liq: ruscha Windows'da "Administrators"
 * va "SYSTEM" degan hisoblar yo'q. Ularni matn sifatida ishlatilsa skript
 *   "Some or all identity references could not be translated"
 * xatosi bilan to'xtaydi. Shuning uchun faqat SID ishlatiladi.
 */
test('PowerShell skriptlarida tilga bog\'liq hisob nomlari yo\'q', () => {
  const dir = path.join(config.root, 'deploy', 'windows');
  const bad = [];

  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.ps1'))) {
    const lines = fs.readFileSync(path.join(dir, name), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.trim().startsWith('#')) return;                    // izohlar
      // Tirnoq ichidagi hisob nomlari: "Administrators", 'SYSTEM', "Everyone" ...
      const m = line.match(/["'](Administrators|SYSTEM|Everyone|Users|BUILTIN\\[^"']+|NT AUTHORITY\\[^"']+)["']/);
      if (m) bad.push(`${name}:${i + 1} — ${m[1]}`);
    });
  }

  assert.deepEqual(bad, [],
    `Hisob nomi o'rniga SID ishlating (S-1-5-32-544 = Administrators, S-1-5-18 = SYSTEM):\n  ${bad.join('\n  ')}`);
});

/** Vazifa yaratishda SYSTEM SID'dan mahalliy nomga o'giriladi. */
test('rejalashtirilgan vazifa SID orqali yaratiladi', () => {
  const text = fs.readFileSync(
    path.join(config.root, 'deploy', 'windows', 'install-server.ps1'), 'utf8');
  assert.match(text, /S-1-5-18/, 'SYSTEM SID ishlatilmagan');
  assert.match(text, /S-1-5-32-544/, 'Administrators SID ishlatilmagan');
  assert.match(text, /Translate\(\[System\.Security\.Principal\.NTAccount\]\)/,
    'SID mahalliy nomga o‘girilmagan');
});
