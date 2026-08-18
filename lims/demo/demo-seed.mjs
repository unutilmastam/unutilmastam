/**
 * Mijozga ko'rsatish uchun ishonarli demo ma'lumot.
 *
 * Hamma narsa HAQIQIY API orqali kiritiladi — shuning uchun audit jurnali
 * ham o'z-o'zidan to'ladi va ekranda haqiqiy ish oqimi ko'rinadi.
 */
const B = process.env.DEMO_API || 'http://127.0.0.1:4950/api';

let PC = 'LAB-SERVER';                      // joriy ish stansiyasi nomi
const call = async (m, p, b, T) => {
  const r = await fetch(B + p, {
    method: m,
    headers: { 'content-type': 'application/json', 'x-computer-name': PC,
               ...(T ? { authorization: 'Bearer ' + T } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  const x = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${m} ${p} -> ${r.status} ${JSON.stringify(x).slice(0, 200)}`);
  return x;
};

const login = async (username, password, workstation) =>
  (await call('POST', '/auth/login', { username, password, workstation })).token;

// ---------------------------------------------------------------------------
const A = await login('admin', 'Admin12345', 'LAB-SERVER');
console.log('kirildi');

// --- Xodimlar ---------------------------------------------------------------
const xodimlar = [
  { username: 'nodira',  full_name: 'Nodira Ismoilova',  role: 'laborant', phone: '998901112233' },
  { username: 'bekzod',  full_name: 'Bekzod Rahmonov',   role: 'doctor',   phone: '998901112234' },
  { username: 'gulnora', full_name: 'Gulnora Sattorova', role: 'cashier',  phone: '998901112235' },
  { username: 'shahzod', full_name: 'Shahzod Aliyev',    role: 'laborant', phone: '998901112236' },
];
const idlar = {};
for (const x of xodimlar) {
  const u = await call('POST', '/users', { ...x, password: 'Xodim12345' }, A).catch((e) => {
    if (/mavjud/.test(e.message)) return null;
    throw e;
  });
  if (u) idlar[x.username] = u.id;
}
console.log('xodimlar:', Object.keys(idlar).length);

// --- Analiz katalogi: narxlarni jonlantiramiz -------------------------------
const { items: tests } = await call('GET', '/catalog/tests', null, A);
console.log('katalog:', tests.length, 'ta analiz');

const kod = (c) => tests.find((t) => t.code === c) || tests[0];

// --- Bemorlar ---------------------------------------------------------------
const bemorlar = [
  ['Karimov',    'Anvar',    'm', '1978-03-14', '998901234501'],
  ['Yusupova',   'Dilnoza',  'f', '1992-07-22', '998901234502'],
  ['Toshmatov',  'Sardor',   'm', '1985-11-03', '998901234503'],
  ['Rahimova',   'Malika',   'f', '1990-01-19', '998901234504'],
  ['Ergashev',   'Jasur',    'm', '1966-05-28', '998901234505'],
  ['Nazarova',   'Feruza',   'f', '2001-09-08', '998901234506'],
  ['Qodirov',    'Otabek',   'm', '1973-12-30', '998901234507'],
  ['Sultonova',  'Zilola',   'f', '1988-04-11', '998901234508'],
  ['Xolmatov',   'Ulug\'bek','m', '1995-08-25', '998901234509'],
  ['Yo\'ldosheva','Nigora',  'f', '1981-02-17', '998901234510'],
  ['Abdullayev', 'Rustam',   'm', '1959-06-05', '998901234511'],
  ['Sharipova',  'Kamola',   'f', '1997-10-12', '998901234512'],
];

PC = 'REG-PC-01';
const yaratilgan = [];
for (const [last_name, first_name, gender, birth_date, phone] of bemorlar) {
  const p = await call('POST', '/patients',
    { last_name, first_name, gender, birth_date, phone, address: 'Toshkent sh.' }, A);
  yaratilgan.push(p);
}
console.log('bemorlar:', yaratilgan.length);
PC = 'LAB-SERVER';

// --- Buyurtmalar: turli holatlarda ------------------------------------------
const guruh = {
  qon:      ['CBC', 'HGB', 'WBC'].map(kod).filter(Boolean),
  biokimyo: ['GLU', 'ALT', 'AST', 'CHOL'].map(kod).filter(Boolean),
  siydik:   ['UA'].map(kod).filter(Boolean),
};
const barchaTest = [...new Set([...guruh.qon, ...guruh.biokimyo, ...guruh.siydik].map((t) => t.id))];
const tanla = (n) => barchaTest.slice(0, n).length ? barchaTest.slice(0, n) : [tests[0].id];

PC = 'LAB-PC-02';
const L = await login('nodira', 'Xodim12345', 'LAB-PC-02');
PC = 'SHIFOKOR-PC';
const D = await login('bekzod', 'Xodim12345', 'LAB-PC-03');
PC = 'KASSA-01';
const K = await login('gulnora', 'Xodim12345', 'KASSA-01');

let n = 0;
for (const p of yaratilgan) {
  n++;
  const testIds = tanla(2 + (n % 4));
  const o = await call('POST', '/orders',
    { patient_id: p.id, test_ids: testIds, complaint: n % 3 === 0 ? 'Profilaktik ko\'rik' : 'Shifokor yo\'llanmasi' },
    n % 2 ? L : A);

  // 1-3: yangi (natija kiritilmagan) — laborant ishlaydigan holat
  if (n <= 3) continue;

  const full = await call('GET', `/orders/${o.id}`, null, L);

  // Natijalar: ba'zilari ataylab normadan tashqarida — ranglar ko'rinsin
  const qiymat = (i) => {
    const t = full.items[i];
    const nom = (t.name || '').toLowerCase();
    if (nom.includes('glyukoza')) return n === 5 ? '9.8' : '5.1';      // 5-bemor: yuqori
    if (nom.includes('gemoglobin')) return n === 7 ? '96' : '138';      // 7-bemor: past
    if (nom.includes('xolesterin')) return n === 9 ? '7.4' : '4.6';
    return String((3 + (i * 1.7) + (n % 3)).toFixed(1));
  };
  await call('POST', `/orders/${o.id}/results`,
    { items: full.items.map((it, i) => ({ order_item_id: it.order_item_id, value: qiymat(i) })) }, L);

  // 4-6: natija kiritilgan, tasdiqlanmagan
  if (n <= 6) continue;

  await call('POST', `/orders/${o.id}/confirm`, {}, L);

  // 7-9: tasdiqlangan, to'lanmagan (qarzdorlar ro'yxati uchun)
  if (n <= 9) continue;

  await call('POST', '/payments',
    { patient_id: p.id, order_id: o.id, amount: Number(o.total_amount) || 50000, method: n % 2 ? 'cash' : 'card' }, K);
}
console.log('buyurtmalar:', n, 'ta (turli holatlarda)');

// --- Shifokor xulosasi ------------------------------------------------------
const { items: tayyor } = await call('GET', '/orders?status=confirmed&limit=5', null, D).catch(() => ({ items: [] }));
console.log('shifokor ko\'radigan:', tayyor.length);

// --- Ombor ------------------------------------------------------------------
const ombor = [
  { name: 'Glyukoza reaktivi',        unit: 'flakon', quantity: 24, min_quantity: 10, supplier: 'MedReaktiv' },
  { name: 'Gemoglobin reaktivi',      unit: 'flakon', quantity: 6,  min_quantity: 10, supplier: 'MedReaktiv' },
  { name: 'Probirka 5 ml',            unit: 'dona',   quantity: 850, min_quantity: 200, supplier: 'LabPlast' },
  { name: 'Bir martalik qo\'lqop M',  unit: 'quti',   quantity: 3,  min_quantity: 5,  supplier: 'SanMed' },
  { name: 'Spirt salfetka',           unit: 'quti',   quantity: 42, min_quantity: 10, supplier: 'SanMed' },
];
for (const i of ombor) {
  await call('POST', '/inventory',
    { ...i, expiry_date: '2027-06-30' }, A).catch(() => {});
}
console.log('ombor:', ombor.length, 'ta pozitsiya (2 tasi kam qolgan)');

// --- Navbat: bugunga va ertaga ---------------------------------------------
const bugun = new Date();
const soat = (h, m, kun = 0) => {
  const d = new Date(bugun);
  d.setDate(d.getDate() + kun);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const navbat = [
  ['Umarov',    'Doniyor', '998903334401', 0, 9, 0],
  ['Ismoilova', 'Sevara',  '998903334402', 0, 9, 30],
  ['Xasanov',   'Аziz',    '998903334403', 0, 10, 0],
  ['Turdiyeva', 'Madina',  '998903334404', 0, 10, 30],
  ['Yoqubov',   'Farrux',  '998903334405', 0, 11, 0],
];
let nav = 0;
for (const [last_name, first_name, phone, kun, h, m] of navbat) {
  await call('POST', '/appointments',
    { last_name, first_name, phone, scheduled_at: soat(h, m, kun), note: 'Och qoringa kelsin' }, A)
    .then(() => nav++)
    .catch((e) => console.log('  navbat:', e.message.slice(0, 90)));
}
console.log('navbat:', nav, 'ta yozuv');

console.log('\nDEMO MA\'LUMOT TAYYOR');
