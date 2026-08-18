/**
 * LabCore — mijozga ko'rsatish uchun video va rasmlar.
 *
 * Hamma harakat HAQIQIY dasturda bajariladi: montaj ham, chizma ham yo'q.
 * Ekranda ko'ringan har bir raqam bazadan keladi.
 */
import { chromium } from '/home/user/unutilmastam/lims/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = 'http://127.0.0.1:4950';
const OUT = process.env.OUT || '/tmp/demo-chiqish';
const SHOTS = path.join(OUT, 'rasmlar');
const VIDEO = path.join(OUT, 'video');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VIDEO, { recursive: true });

const PAROL = 'ShifoLab2026';
let raqam = 0;

// ---------------------------------------------------------------------------
// Ekranga yozuv va kursor — video tushunarli bo'lishi uchun
// ---------------------------------------------------------------------------
const BEZAK = `
  (() => {
    if (document.getElementById('demo-bezak')) return;
    const s = document.createElement('style');
    s.id = 'demo-bezak';
    s.textContent = \`
      #demo-caption{
        position:fixed; left:0; right:0; bottom:0; z-index:2147483647;
        background:linear-gradient(0deg, rgba(6,25,22,.97), rgba(6,25,22,.90));
        color:#fff; font:500 21px/1.45 "Segoe UI",system-ui,sans-serif;
        padding:18px 34px; letter-spacing:.2px;
        border-top:3px solid #14b8a6; box-shadow:0 -10px 40px rgba(0,0,0,.35);
        transform:translateY(105%); transition:transform .35s cubic-bezier(.2,.8,.2,1);
        display:flex; align-items:center; gap:16px;
      }
      #demo-caption.on{ transform:translateY(0) }
      #demo-caption b{ color:#5eead4; font-weight:600 }
      #demo-caption .num{
        flex:none; width:34px; height:34px; border-radius:50%; background:#14b8a6; color:#04201c;
        display:grid; place-items:center; font:700 15px/1 ui-monospace,monospace;
      }
      #demo-cursor{
        position:fixed; z-index:2147483646; width:26px; height:26px; margin:-13px 0 0 -13px;
        border-radius:50%; background:rgba(20,184,166,.30); border:2.5px solid #14b8a6;
        pointer-events:none; transition:left .55s cubic-bezier(.3,.7,.2,1), top .55s cubic-bezier(.3,.7,.2,1);
        left:-100px; top:-100px; box-shadow:0 0 0 6px rgba(20,184,166,.13);
      }
      #demo-cursor.tap{ animation:demo-tap .45s ease-out }
      @keyframes demo-tap{
        0%{ transform:scale(1) } 45%{ transform:scale(.55); background:rgba(20,184,166,.65) } 100%{ transform:scale(1) }
      }
    \`;
    document.head.appendChild(s);
    const c = document.createElement('div'); c.id = 'demo-caption';
    c.innerHTML = '<span class="num"></span><span class="txt"></span>';
    document.body.appendChild(c);
    const k = document.createElement('div'); k.id = 'demo-cursor';
    document.body.appendChild(k);
  })();
`;

const bezakla = async (p) => { try { await p.evaluate(BEZAK); } catch {} };

async function yozuv(p, matn, n) {
  await bezakla(p);
  await p.evaluate(([t, num]) => {
    const c = document.getElementById('demo-caption');
    if (!c) return;
    c.querySelector('.txt').innerHTML = t;
    c.querySelector('.num').textContent = num ?? '';
    c.classList.add('on');
  }, [matn, n ?? '']);
}

const yozuvniYash = (p) => p.evaluate(() => document.getElementById('demo-caption')?.classList.remove('on')).catch(() => {});

async function kursor(p, sel) {
  await bezakla(p);
  const el = p.locator(sel).first();
  const box = await el.boundingBox().catch(() => null);
  if (!box) return null;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await p.evaluate(([x, y]) => {
    const k = document.getElementById('demo-cursor');
    if (k) { k.style.left = x + 'px'; k.style.top = y + 'px'; }
  }, [x, y]);
  await p.waitForTimeout(650);
  return { x, y };
}

async function bos(p, sel, kut = 900) {
  await kursor(p, sel);
  await p.evaluate(() => {
    const k = document.getElementById('demo-cursor');
    if (k) { k.classList.remove('tap'); void k.offsetWidth; k.classList.add('tap'); }
  }).catch(() => {});
  await p.waitForTimeout(220);
  await p.locator(sel).first().click({ timeout: 15000 });
  await p.waitForTimeout(kut);
  await bezakla(p);
}

/**
 * Rasm — mijozga ko'rsatiladigan galereya uchun TOZA olinadi:
 * sarlavha va kursor vaqtincha yashiriladi, keyin qaytariladi.
 * (Videoda ular ko'rinib turadi — u yerda kerak.)
 */
async function rasm(p, nom) {
  raqam++;
  await p.evaluate(() => {
    const c = document.getElementById('demo-caption');
    const k = document.getElementById('demo-cursor');
    if (c) c.style.visibility = 'hidden';
    if (k) k.style.visibility = 'hidden';
  }).catch(() => {});
  await p.waitForTimeout(150);
  const f = path.join(SHOTS, `${String(raqam).padStart(2, '0')}-${nom}.png`);
  await p.screenshot({ path: f });
  await p.evaluate(() => {
    const c = document.getElementById('demo-caption');
    const k = document.getElementById('demo-cursor');
    if (c) c.style.visibility = '';
    if (k) k.style.visibility = '';
  }).catch(() => {});
  console.log('  rasm:', path.basename(f));
}

const oting = (p, hash, kut = 1400) =>
  p.evaluate((h) => { location.hash = h; }, hash).then(() => p.waitForTimeout(kut)).then(() => bezakla(p));

// ---------------------------------------------------------------------------
async function kontekst(browser, nom, size = { width: 1440, height: 900 }, pcNomi = null) {
  const ctx = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    recordVideo: { dir: path.join(VIDEO, nom), size },
    locale: 'uz-UZ',
  });
  // Ish stansiyasi nomi audit jurnaliga tushadi. Windows dasturida u
  // kompyuterdan avtomatik olinadi; brauzerda localStorage'da turadi.
  if (pcNomi) {
    await ctx.addInitScript((pc) => {
      try { localStorage.setItem('labcore.pc', pc); } catch {}
    }, pcNomi);
  }
  const p = await ctx.newPage();
  p.on('console', () => {});
  return { ctx, p };
}

async function yop(ctx, p, nom) {
  const v = p.video();
  await ctx.close();
  if (v) {
    const src = await v.path();
    const dst = path.join(VIDEO, `${nom}.webm`);
    fs.renameSync(src, dst);
    fs.rmSync(path.join(VIDEO, nom), { recursive: true, force: true });
    const mb = (fs.statSync(dst).size / 1048576).toFixed(1);
    console.log(`VIDEO: ${nom}.webm (${mb} MB)`);
  }
}

// PIN bilan kirish — xodim rasmini bosib, kodini teradi
async function pinBilanKir(p, ism, pin) {
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await bezakla(p);
  const pinTugma = p.locator('button, a').filter({ hasText: /PIN/i }).first();
  if (await pinTugma.count()) {
    await bos(p, 'button:has-text("PIN"), a:has-text("PIN")', 1200);
  }
  const kishi = p.locator(`text=${ism}`).first();
  if (await kishi.count()) {
    await bos(p, `text=${ism}`, 1100);
    for (const d of pin.split('')) {
      const t = p.locator(`button:text-is("${d}")`).first();
      if (await t.count()) { await t.click(); await p.waitForTimeout(230); }
    }
    await p.waitForTimeout(1800);
  }
  return p.url().includes('#/login') === false;
}

// Oddiy kirish (parol bilan)
async function kir(p, login, parol, ish = 'LAB-PC-02') {
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await bezakla(p);
  await p.fill('input[name="username"], #username', login);
  await p.waitForTimeout(250);
  await p.fill('input[name="password"], #password', parol);
  await p.waitForTimeout(250);
  const ws = p.locator('input[name="workstation"], #workstation');
  if (await ws.count()) { await ws.fill(ish); await p.waitForTimeout(250); }
  await p.locator('button[type="submit"], button:has-text("Kirish")').first().click();
  await p.waitForTimeout(2200);
  await bezakla(p);
}

export { chromium, CHROME, URL, OUT, SHOTS, VIDEO, PAROL, yozuv, yozuvniYash, bos, kursor, rasm, oting, kontekst, yop, kir, pinBilanKir, bezakla };
