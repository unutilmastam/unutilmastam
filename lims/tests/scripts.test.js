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
