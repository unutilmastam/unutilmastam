import { chromium } from '/home/user/unutilmastam/lims/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 2 });
const kishilar = [
  ['nodira',  'NI', '#0b6b5f', '#e2efec'],
  ['bekzod',  'BR', '#1e4d7b', '#e3eef8'],
  ['gulnora', 'GS', '#8a5a06', '#fbf1de'],
  ['shahzod', 'SA', '#5b3a7a', '#efe6f7'],
  ['admin',   'LE', '#8f2437', '#fbe7e9'],
];
for (const [nom, harf, rang, fon] of kishilar) {
  await p.setContent(`<div style="width:400px;height:400px;display:grid;place-items:center;
    background:linear-gradient(140deg,${fon},#fff);font-family:Georgia,serif">
    <div style="width:250px;height:250px;border-radius:50%;background:${rang};color:#fff;
      display:grid;place-items:center;font-size:110px;font-weight:600;letter-spacing:2px">${harf}</div></div>`);
  await p.screenshot({ path: `/tmp/avatars/${nom}.png` });
}
await b.close();
console.log('rasmlar tayyor');
