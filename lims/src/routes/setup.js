import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import qrcode from 'qrcode';
import { config } from '../config.js';

export const router = express.Router();

/**
 * Telefonni ulash sahifasi: QR kod, sertifikat va qadamma-qadam ko'rsatma.
 *
 * Bu sahifa ataylab **avtorizatsiyasiz**: telefon hali tizimga kirmagan va
 * sertifikatni ham o'rnatmagan bo'ladi. Sahifada maxfiy ma'lumot yo'q —
 * faqat serverning lokal manzili va ochiq sertifikat (parol emas, kalit emas).
 * Shu sababli u HTTP portida ham ochiladi: aks holda sertifikatni olish uchun
 * sertifikat kerak bo'lib qolardi.
 */

/** Lokal tarmoqdagi IP manzil (127.0.0.1 va virtual adapterlarsiz). */
export function localIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(nets)) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      // Virtual adapterlarni oxiriga suramiz
      const virtual = /virtual|vmware|vbox|docker|wsl|hyper-v|loopback/i.test(name);
      candidates.push({ address: a.address, virtual });
    }
  }
  candidates.sort((a, b) => Number(a.virtual) - Number(b.virtual));
  return candidates[0]?.address || '127.0.0.1';
}

export function serverUrl(req) {
  const scheme = config.ssl.certFile && config.ssl.keyFile ? 'https' : 'http';
  return `${scheme}://${localIp()}:${config.port}`;
}

router.get('/telefon', async (req, res) => {
  const url = serverUrl(req);
  const hasCert = Boolean(config.ssl.certFile && fs.existsSync(config.ssl.certFile));
  const qr = await qrcode.toDataURL(url, { margin: 1, width: 260 });

  res.type('html').send(`<!DOCTYPE html>
<html lang="uz"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.labName)} — telefonga ulash</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px;
         background: #f4f6f9; color: #0f172a; line-height: 1.55; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 22px;
          max-width: 560px; margin: 0 auto 16px; box-shadow: 0 4px 12px rgba(15,23,42,.06); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #64748b; font-size: 13px; margin-bottom: 18px; }
  .url { font-family: Consolas, monospace; font-size: 17px; background: #f1f5f9;
         padding: 10px 12px; border-radius: 8px; word-break: break-all; display: block; }
  img { display: block; margin: 16px auto; border-radius: 8px; }
  ol { padding-left: 20px; } li { margin-bottom: 8px; }
  .btn { display: inline-block; background: #0d7d74; color: #fff; text-decoration: none;
         padding: 11px 18px; border-radius: 8px; font-weight: 600; margin-top: 8px; }
  .warn { background: #fef3c7; color: #92400e; padding: 12px; border-radius: 8px; font-size: 14px; }
  h2 { font-size: 15px; margin: 20px 0 8px; }
</style></head><body>

<div class="card">
  <h1>🧪 ${esc(config.labName)}</h1>
  <div class="sub">Telefonga ilovani o‘rnatish</div>
  <span class="url">${esc(url)}</span>
  <img src="${qr}" width="260" height="260" alt="QR">
  <div class="sub" style="text-align:center;margin:0">
    Telefon kamerasi bilan skanerlang yoki manzilni qo‘lda kiriting
  </div>
</div>

${hasCert ? `
<div class="card">
  <h2>1-qadam. Sertifikatni o‘rnating</h2>
  <div class="warn">
    Bu qadamsiz ilova o‘rnatilmaydi va oflayn rejim ishlamaydi.
  </div>
  <a class="btn" href="/telefon/sertifikat">Sertifikatni yuklab olish</a>

  <h2>Android</h2>
  <ol>
    <li>Yuklab olingan faylni oching (yoki: Sozlamalar → Xavfsizlik →
        Shifrlash va hisob ma’lumotlari → <b>Sertifikat o‘rnatish</b> →
        <b>CA sertifikati</b>)</li>
    <li>“Baribir o‘rnatish” ni tasdiqlang</li>
  </ol>

  <h2>iPhone</h2>
  <ol>
    <li>Fayl yuklangach: Sozlamalar → <b>“Profil yuklandi”</b> → <b>O‘rnatish</b></li>
    <li>So‘ng: Sozlamalar → Umumiy → Ma’lumot →
        <b>Sertifikatga ishonch sozlamalari</b> → LabCore kalitini <b>yoqing</b>
        <br><small>Bu ikkinchi qadam o‘tkazib yuborilsa ishlamaydi.</small></li>
  </ol>
</div>` : `
<div class="card">
  <div class="warn">
    Server HTTPS’siz ishlayapti — telefonga ilova o‘rnatib bo‘lmaydi.
    Serverda sertifikatni sozlang (<code>LABCORE_SSL_CERT</code>, <code>LABCORE_SSL_KEY</code>).
  </div>
</div>`}

<div class="card">
  <h2>${hasCert ? '2' : '1'}-qadam. Ilovani o‘rnating</h2>
  <ol>
    <li>Telefon server bilan <b>bitta Wi-Fi</b> da bo‘lsin</li>
    <li>Yuqoridagi manzilni brauzerda oching va tizimga kiring</li>
    <li><b>Android (Chrome):</b> ⋮ → “Ilovani o‘rnatish”<br>
        <b>iPhone (Safari):</b> ⎙ → “Bosh ekranga qo‘shish”</li>
    <li>Bosh ekranda 🧪 belgichasi paydo bo‘ladi</li>
  </ol>
</div>

</body></html>`);
});

/** CA sertifikatini yuklab berish (ochiq qism — maxfiy emas). */
router.get('/telefon/sertifikat', (req, res) => {
  const file = config.ssl.certFile;
  if (!file || !fs.existsSync(file)) {
    return res.status(404).type('text').send('Sertifikat sozlanmagan');
  }
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="labcore-ca.crt"');
  fs.createReadStream(file).pipe(res);
});

const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
