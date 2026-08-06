import './setup-env.js';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

/** deploy/windows ichidagi barcha .ps1 fayllar (ichki papkalar bilan). */
function psScripts() {
  const root = path.join(config.root, 'deploy', 'windows');
  const out = [];
  const walk = (dir, prefix = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), prefix + e.name + '/');
      else if (e.name.endsWith('.ps1')) out.push({ name: prefix + e.name, file: path.join(dir, e.name) });
    }
  };
  walk(root);
  return out;
}

/**
 * Windows PowerShell 5.1 .ps1 faylni UTF-8 emas, ANSI (CP1251/CP1252) deb
 * o'qiydi. Shunda '—' belgisi (E2 80 94) 'â€"' bo'lib chiqadi va ichidagi
 * qo'shtirnoq satrni erta yopib yuboradi — butun skript ishga tushmaydi.
 *
 * Shuning uchun .ps1 fayllar faqat ASCII belgilardan iborat bo'lishi shart:
 * u holda kodlash qanday talqin qilinishidan qat'i nazar fayl bir xil o'qiladi.
 */
test('PowerShell skriptlari faqat ASCII belgilardan iborat', () => {
  const scripts = psScripts();
  assert.ok(scripts.length > 0, 'skriptlar topilmadi');

  for (const { name, file } of scripts) {
    const buf = fs.readFileSync(file);
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
  for (const { name, file } of psScripts()) {
    const text = fs.readFileSync(file, 'utf8')
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
  const bad = [];

  for (const { name, file } of psScripts()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
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

/**
 * Windows sertifikatni PFX ko'rinishida beradi. Uni PEM'ga o'girish uchun
 * openssl kerak, u esa Windows'da odatda yo'q — o'rnatish shu joyda
 * "openssl topilmadi" deb HTTPS'siz qolib ketardi. Endi Node PFX'ni
 * to'g'ridan-to'g'ri o'qiydi va o'rnatuvchi ham shuni yozadi.
 */
test('o‘rnatuvchi sertifikatni openssl’siz sozlaydi', () => {
  const text = fs.readFileSync(
    path.join(config.root, 'deploy', 'windows', 'install-server.ps1'), 'utf8');

  assert.match(text, /LABCORE_SSL_PFX=/, '.env ga PFX yozilmaydi');
  assert.match(text, /LABCORE_SSL_PFX_PASSWORD=/, 'PFX paroli yozilmaydi');
  assert.doesNotMatch(text, /LABCORE_SSL_CERT=\$InstallDir/,
    'hali ham PEM yo‘liga tayanadi (openssl kerak bo‘lib qoladi)');
  assert.match(text, /Export-PfxCertificate/, 'PFX eksport qilinmaydi');
});

/** Ulanmaganda sabab topish uchun tekshiruv skripti bo'lishi kerak. */
test('tekshiruv skripti bor va manzilni aytadi', () => {
  const file = path.join(config.root, 'deploy', 'windows', 'tekshir.ps1');
  assert.ok(fs.existsSync(file), 'tekshir.ps1 yo‘q');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /Get-NetTCPConnection/, 'port tinglanayotgani tekshirilmaydi');
  assert.match(text, /api\/health/, 'serverga so‘rov yuborilmaydi');
  assert.match(text, /DASTURGA SHU MANZILNI YOZING/, 'manzil aytilmaydi');
});

/**
 * PowerShell'da tashqi dastur (psql, npm) xato qaytarsa skript o'zi
 * to'xtamaydi — $LASTEXITCODE qo'lda tekshirilishi kerak. Bir marta shu
 * sabab: postgres paroli noto'g'ri kiritilgan, psql yiqilgan, skript esa
 * "OK: Foydalanuvchi yaratildi" deb davom etgan va xato ancha keyin,
 * tushunarsiz ko'rinishda chiqqan.
 */
test('o‘rnatuvchi psql va npm natijasini tekshiradi', () => {
  const text = fs.readFileSync(
    path.join(config.root, 'deploy', 'windows', 'install-server.ps1'), 'utf8');

  assert.match(text, /\$LASTEXITCODE/, 'tashqi buyruq natijasi umuman tekshirilmaydi');

  // postgres paroli oldindan tekshiriladi va qayta so'raladi
  assert.match(text, /psql .*-tAc "SELECT 1"/, 'postgres paroli oldindan tekshirilmaydi');
  assert.match(text, /for \(\$i = 1; \$i -le 3; \$i\+\+\)/, 'parolni qayta so‘rash yo‘q');

  // labcore foydalanuvchisi haqiqatan ulana olishi tekshiriladi
  assert.match(text, /psql -h \$PgHost -U \$DbUser -d \$DbName/,
    'dastur foydalanuvchisining ulanishi tekshirilmaydi');

  // migratsiya jimgina o'tib ketmaydi
  assert.match(text, /Migratsiya xatosi/, 'migratsiya natijasi tekshirilmaydi');
});

/**
 * "localhost" Windows'da avval IPv6 (::1) ga uriniladi. VPN yoki antivirus
 * uni bloklasa "Permission denied (10013)" chiqadi. 127.0.0.1 ishonchli.
 */
test('psql aniq 127.0.0.1 manziliga ulanadi', () => {
  const text = fs.readFileSync(
    path.join(config.root, 'deploy', 'windows', 'install-server.ps1'), 'utf8');
  assert.match(text, /\$PgHost = "127\.0\.0\.1"/, 'PgHost belgilanmagan');

  const bare = text.split('\n').filter((l) =>
    !l.trim().startsWith('#') && /(^|[^-])\bpsql -U /.test(l));
  assert.deepEqual(bare, [], `psql manzilsiz chaqirilgan:\n  ${bare.join('\n  ')}`);
});

/** O'rnatish oxirida server haqiqatan javob berayotgani tekshiriladi. */
test('o‘rnatuvchi oxirida serverni tekshiradi', () => {
  const text = fs.readFileSync(
    path.join(config.root, 'deploy', 'windows', 'install-server.ps1'), 'utf8');
  assert.match(text, /api\/health/, 'server javob berishi tekshirilmaydi');
  assert.match(text, /Server ishlayapti \(\$scheme\)/, 'natija aytilmaydi');
});

/**
 * Windows'da odatiy qobiq — PowerShell 5.1. Unda Invoke-RestMethod'ning
 * -SkipCertificateCheck bayrog'i YO'Q (u PowerShell 7 da paydo bo'lgan) va
 * "A parameter cannot be found that matches parameter name
 * 'SkipCertificateCheck'" xatosini beradi. Foydalanuvchida aynan shu chiqqan.
 */
test('skriptlar PowerShell 5.1 da ishlaydi', () => {
  const faqatPs7 = ['-SkipCertificateCheck', '-SkipHttpErrorCheck', 'ForEach-Object -Parallel'];
  const bad = [];

  for (const { name, file } of psScripts()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.trim().startsWith('#')) return;
      for (const flag of faqatPs7) {
        if (line.includes(flag)) bad.push(`${name}:${i + 1} — ${flag}`);
      }
    });
  }

  assert.deepEqual(bad, [],
    `PowerShell 7 ga xos imkoniyat ishlatilgan (5.1 da yiqiladi):\n  ${bad.join('\n  ')}`);
});

/**
 * Server vazifa sifatida ishlaganda ekran bo'lmaydi. Xatoni ko'radigan
 * yagona joy — jurnal fayli. Usiz "nega ishlamayapti?" degan savolga
 * javob topib bo'lmaydi.
 */
test('server chiqishi jurnalga yoziladi', () => {
  const text = fs.readFileSync(
    path.join(config.root, 'deploy', 'windows', 'install-server.ps1'), 'utf8');
  assert.match(text, /logs\\server\.log|Join-Path \$logDir "server\.log"/,
    'vazifa jurnal yozmaydi');
  assert.match(text, /New-ScheduledTaskAction -Execute "cmd\.exe"/,
    'chiqishni faylga yo‘naltirish uchun cmd ishlatilmagan');

  const tekshir = fs.readFileSync(
    path.join(config.root, 'deploy', 'windows', 'tekshir.ps1'), 'utf8');
  assert.match(tekshir, /server\.log/, 'tekshiruv jurnalni ko‘rsatmaydi');
  assert.match(tekshir, /Start-Process/, 'tekshiruv serverni sinab ko‘rmaydi');
});

/**
 * "Bir ishlaydi, bir ishlamaydi" holatida server tekshiruv paytida
 * ko'tarilgan bo'lishi mumkin — o'shanda ham qulash tarixi ko'rinishi shart,
 * aks holda tekshiruv "hammasi joyida" deb noto'g'ri xulosa beradi.
 */
test('tekshiruv jurnaldagi qulash izlarini har doim ko‘rsatadi', () => {
  const text = fs.readFileSync(
    path.join(config.root, 'deploy', 'windows', 'tekshir.ps1'), 'utf8');

  assert.match(text, /QULASH/, 'qulash izlari qidirilmaydi');

  // Qulash tarixi "server ishlamayapti" shartidan OLDIN, ya'ni har qanday
  // holatda bajarilishi kerak.
  const qulashJoyi = text.indexOf('Qulash tarixi');
  const shartJoyi = text.indexOf('if (-not $ishlaydi)');
  assert.ok(qulashJoyi > 0, 'qulash tarixi bo‘limi yo‘q');
  assert.ok(qulashJoyi < shartJoyi,
    'qulash tarixi faqat server o‘chganda ko‘rsatilyapti — ishlab turganda ham kerak');

  // 8 soniyadan keyin serverni tekshiruvning O'ZI to'xtatishi aytilishi kerak:
  // foydalanuvchi buni "server yana uchib ketdi" deb tushunmasin.
  assert.match(text, /ataylab to'xtatdi/,
    'sinov serverini tekshiruv o‘zi to‘xtatgani tushuntirilmagan');
});

/**
 * Server vazifa sifatida ishlaydi — ekran yo'q. Qulash sababi jurnalga
 * tushmasa, "sababsiz o'chib qolish"ni hech kim topa olmaydi.
 */
test('server qulash sababini jurnalga yozadi', () => {
  const text = fs.readFileSync(path.join(config.root, 'src', 'index.js'), 'utf8');
  assert.match(text, /uncaughtException/, 'ushlanmagan xato tutilmaydi');
  assert.match(text, /unhandledRejection/, 'ushlanmagan rad etish tutilmaydi');
  assert.match(text, /installCrashLogging\(\);\s*\n\s*start\(\);/,
    'kirish nuqtasida qulash jurnali yoqilmagan');
});

/**
 * Windows'ning cmd.exe .bat faylni CRLF (\r\n) bilan kutadi. Linux'da
 * yasalgan fayl faqat \n bilan chiqadi va cmd uni noto'g'ri o'qiydi:
 * oyna bir lahza ochilib, "pause" ga yetmasdan yopilib ketadi.
 * Foydalanuvchida aynan shu bo'lgan.
 */
test('.bat fayllar CRLF bilan yoziladi', () => {
  const dir = path.join(config.root, 'deploy', 'windows');
  const bad = [];
  const walk = (d, prefix = '') => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { walk(path.join(d, e.name), prefix + e.name + '/'); continue; }
      if (!e.name.endsWith('.bat')) continue;
      const buf = fs.readFileSync(path.join(d, e.name));
      const lf = (buf.toString('binary').match(/\n/g) || []).length;
      const crlf = (buf.toString('binary').match(/\r\n/g) || []).length;
      if (lf !== crlf) bad.push(`${prefix}${e.name} — ${lf - crlf} ta yolg'iz LF`);
    }
  };
  walk(dir);
  assert.deepEqual(bad, [], `cmd.exe bu fayllarni buzib o'qiydi:\n  ${bad.join('\n  ')}`);
});

/**
 * Ishga tushirgich .bat lar imkon qadar sodda bo'lsin: ko'p qatorli
 * qavs bloklari (if ... ( ... ) else ...) cmd'da eng nozik joy.
 * Butun mantiq .ps1 ichida bo'ladi.
 */
test('ishga tushirgich .bat lar sodda', () => {
  const dir = path.join(config.root, 'deploy', 'windows', 'paket');
  for (const name of ['TUZAT.bat', 'TEKSHIR.bat']) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.ok(text.split('\n').length <= 10, `${name}: juda uzun (${text.split('\n').length} qator)`);
    assert.doesNotMatch(text, /\(\s*$/m, `${name}: ko'p qatorli qavs bloki bor`);
    assert.match(text, /^pause/m, `${name}: pause yo'q - oyna yopilib ketadi`);
  }
});

/** Skript erta chiqsa ham oyna kutib turadi. */
test('tekshiruv va tuzatish oynasi o‘zi yopilmaydi', () => {
  for (const f of [
    path.join(config.root, 'deploy', 'windows', 'tekshir.ps1'),
    path.join(config.root, 'deploy', 'windows', 'paket', 'tuzat.ps1'),
  ]) {
    const text = fs.readFileSync(f, 'utf8');
    assert.match(text, /function Wait-Enter/, `${path.basename(f)}: kutish funksiyasi yo'q`);
    // Har bir erta chiqishdan oldin ham kutilsin
    const bareReturn = text.split('\n').filter((l) => /^\s*return\s*$/.test(l));
    assert.deepEqual(bareReturn, [], `${path.basename(f)}: kutmasdan chiqib ketadigan joy bor`);
  }
});

/**
 * .env faylini ataylab faqat administratorlar o'qiy oladi (tibbiy ma'lumot
 * himoyasi). Shu sababli tuzatish va tekshiruv skriptlari administrator
 * huquqisiz ishlatilsa, ular ".env yo'q", "vazifa yo'q" deb NOTO'G'RI
 * xulosa chiqarardi. Endi skript o'zini administrator sifatida qayta ochadi.
 */
test('tuzatish va tekshiruv skriptlari huquqni o‘zi so‘raydi', () => {
  for (const f of [
    path.join(config.root, 'deploy', 'windows', 'tekshir.ps1'),
    path.join(config.root, 'deploy', 'windows', 'paket', 'tuzat.ps1'),
  ]) {
    const text = fs.readFileSync(f, 'utf8');
    assert.match(text, /WindowsBuiltInRole\]::Administrator/,
      `${path.basename(f)}: administrator huquqi tekshirilmaydi`);
    assert.match(text, /Start-Process powershell -Verb RunAs/,
      `${path.basename(f)}: huquq so'ralmaydi`);
  }
});

/** Fayllar almashtirilgach server qayta ishga tushmasa, foyda yo'q. */
test('tuzatish skripti serverni qayta ishga tushiradi', () => {
  const text = fs.readFileSync(
    path.join(config.root, 'deploy', 'windows', 'paket', 'tuzat.ps1'), 'utf8');
  assert.match(text, /Stop-ScheduledTask -TaskName "LabCore"/, 'vazifa to‘xtatilmaydi');
  assert.match(text, /Start-ScheduledTask -TaskName "LabCore"/, 'vazifa ishga tushirilmaydi');
  assert.match(text, /api\/health/, 'natija tekshirilmaydi');
  assert.match(text, /DASTURGA SHU MANZILNI YOZING/, 'manzil aytilmaydi');
});
