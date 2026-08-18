/**
 * LabCore — mijozga ko'rsatish uchun to'liq demo.
 *
 * To'rtta video va butun galereya. Hamma harakat haqiqiy dasturda,
 * haqiqiy ma'lumot ustida bajariladi.
 */
import {
  chromium, CHROME, URL, yozuv, yozuvniYash, bos, kursor,
  rasm, kontekst, yop, bezakla,
} from './demo-yoz.mjs';

const browser = await chromium.launch({ executablePath: CHROME });
const K = (p, ms) => p.waitForTimeout(ms);

const PIN = {
  egasi:   ['Laboratoriya egasi', '246810'],
  laborant:['Nodira Ismoilova',   '135790'],
  shifokor:['Bekzod Rahmonov',    '482619'],
  kassir:  ['Gulnora Sattorova',  '703528'],
};

async function pinKir(p, kim, izoh, n) {
  const [ism, pin] = PIN[kim];
  await p.goto(URL, { waitUntil: 'networkidle' });
  await K(p, 1300);
  await bezakla(p);
  if (izoh) { await yozuv(p, izoh, n); await K(p, 2000); }
  await bos(p, `.pin-person:has-text("${ism}")`, 800);
  for (const d of pin.split('')) {
    await p.locator(`button:text-is("${d}")`).first().click();
    await K(p, 250);
  }
  await K(p, 500);
  await p.locator('button:has-text("✓")').click();
  await K(p, 2700);
  await bezakla(p);
}

async function ot(p, hash, ms = 1700) {
  await p.evaluate((h) => { location.hash = h; }, hash);
  await K(p, ms);
  await bezakla(p);
}

// ===========================================================================
// 1-VIDEO — KUNDALIK ISH: bemor kelganidan natijagacha
// ===========================================================================
{
  const { ctx, p } = await kontekst(browser, 'v1-kundalik', undefined, 'LAB-PC-02');

  await pinKir(p, 'laborant',
    'Xodim <b>o‘z rasmini</b> bosadi va shaxsiy <b>PIN kodini</b> teradi — uzun parol shart emas', 1);
  await rasm(p, 'kirish-pin');

  await yozuv(p, 'Laborant <b>Nodira Ismoilova</b> kirdi. Menyu uning roliga qarab qisqargan', 2);
  await K(p, 3000);
  await rasm(p, 'laborant-bosh-sahifa');

  await ot(p, '#/queue');
  await yozuv(p, '<b>Navbat.</b> Telefon qilgan bemor oldindan yoziladi, kelgani belgilanadi', 3);
  await K(p, 3200);
  await rasm(p, 'navbat');

  await ot(p, '#/patients');
  await yozuv(p, '<b>Bemorlar.</b> Karta raqami tizim tomonidan beriladi — hech qachon takrorlanmaydi', 4);
  await K(p, 2600);
  await rasm(p, 'bemorlar');

  const qid = 'input[placeholder*="karta raqami"]';
  await kursor(p, qid);
  await yozuv(p, 'Ism, familiya, telefon yoki karta raqami bo‘yicha qidiriladi', 4);
  await p.locator(qid).type('Karimov', { delay: 150 });
  await K(p, 2000);
  await rasm(p, 'bemor-qidiruv');

  await bos(p, 'table tbody tr', 2200);
  await yozuv(p, '<b>Bemor kartasi:</b> butun tarix bir joyda. QR kod — keyingi kelishida skanerlanadi', 5);
  await K(p, 3400);
  await rasm(p, 'bemor-kartasi');

  await ot(p, '#/orders');
  await yozuv(p, '<b>Analizlar.</b> Holat rangi bilan: yangi → ish jarayonida → tayyor → tasdiqlangan', 6);
  await K(p, 3200);
  await rasm(p, 'analizlar');

  await bos(p, 'table tbody tr', 2300);
  await yozuv(p, '<b>Laborantning asosiy oynasi.</b> Har bir analiz uchun probirka shtrix-kodi bor', 7);
  await K(p, 3000);
  await rasm(p, 'buyurtma');

  // Haqiqiy natija kiritamiz
  const maydon = p.locator('.result-input').first();
  if (await maydon.count()) {
    await kursor(p, '.result-input');
    await yozuv(p, 'Raqam yozilishi bilan tizim uni <b>yosh va jinsga mos normaga</b> solishtiradi', 7);
    await maydon.fill('');
    await maydon.type('14.8', { delay: 260 });
    await K(p, 2200);
    await rasm(p, 'natija-kiritish');

    const saqla = p.locator('button:has-text("Natijalarni saqlash")').first();
    if (await saqla.count()) {
      await yozuv(p, 'Natija saqlanadi — kim kiritgani va qachon kiritgani <b>avtomatik yoziladi</b>', 7);
      await bos(p, 'button:has-text("Natijalarni saqlash")', 2600);
      await rasm(p, 'natija-saqlandi');
    }
  }

  const tasdiq = p.locator('button:has-text("Tasdiqlash")').first();
  if (await tasdiq.count()) {
    await yozuv(p, '<b>Tasdiqlash.</b> Shundan keyin natija qulflanadi — o‘zgartirish iz qoldiradi', 8);
    await bos(p, 'button:has-text("Tasdiqlash")', 2600);
    await rasm(p, 'natija-tasdiqlandi');
  }

  await yozuvniYash(p);
  await K(p, 800);
  await yop(ctx, p, '1-kundalik-ish');
}

// ===========================================================================
// 2-VIDEO — SHIFOKOR VA KASSA
// ===========================================================================
{
  const { ctx, p } = await kontekst(browser, 'v2-shifokor-kassa', undefined, 'SHIFOKOR-PC');

  await pinKir(p, 'shifokor', 'Endi <b>shifokor</b> sifatida kiramiz', 9);
  await ot(p, '#/doctor');
  await yozuv(p, '<b>Shifokor navbati.</b> Faqat tasdiqlangan, ko‘rilishi kerak bo‘lgan natijalar', 10);
  await K(p, 3400);
  await rasm(p, 'shifokor-navbati');

  const bem = p.locator('table tbody tr').first();
  if (await bem.count()) {
    await bos(p, 'table tbody tr', 2300);
    await yozuv(p, 'Shifokor tashxis va tavsiya yozadi — bemorga chiqariladigan javob shundan yig‘iladi', 10);
    await K(p, 3000);
    await rasm(p, 'shifokor-xulosasi');
  }

  await yozuvniYash(p);
  await K(p, 600);
  await yop(ctx, p, '2-shifokor');
}

{
  const { ctx, p } = await kontekst(browser, 'v2b-kassa', undefined, 'KASSA-01');
  await pinKir(p, 'kassir', '<b>Kassir</b> — har bir xodim o‘z hisobi bilan ishlaydi', 11);
  await rasm(p, 'kassir-bosh-sahifa');

  await ot(p, '#/cashier');
  await yozuv(p, '<b>Kassa.</b> To‘lov qabul qilinadi, chek chiqariladi, kunlik yakun ko‘rinadi', 12);
  await K(p, 3400);
  await rasm(p, 'kassa');

  await ot(p, '#/debts');
  await yozuv(p, '<b>Qarzdorlar.</b> Kim qancha va qancha vaqtdan beri qarzdor — telefoni bilan', 13);
  await K(p, 3200);
  await rasm(p, 'qarzdorlar');

  await yozuvniYash(p);
  await K(p, 600);
  await yop(ctx, p, '3-kassa');
}

// ===========================================================================
// 3-VIDEO — RAHBAR NAZORATI
// ===========================================================================
{
  const { ctx, p } = await kontekst(browser, 'v3-nazorat', undefined, 'RAHBAR-PC');

  await pinKir(p, 'egasi', 'Endi <b>laboratoriya egasi</b> sifatida kiramiz — unga hamma bo‘lim ochiq', 14);

  await yozuv(p, '<b>Bosh sahifa.</b> Bugungi bemorlar, daromad, kutilayotgan natijalar — bir qarashda', 15);
  await K(p, 3600);
  await rasm(p, 'rahbar-bosh-sahifa');

  await p.evaluate(() => window.scrollTo(0, 400));
  await K(p, 900);
  await yozuv(p, '<b>Kritik natijalar</b> va <b>ombor ogohlantirishlari</b> shu yerda ko‘rinadi', 15);
  await K(p, 3000);
  await rasm(p, 'bosh-sahifa-ogohlantirish');
  await p.evaluate(() => window.scrollTo(0, 0));
  await K(p, 600);

  await ot(p, '#/audit');
  await yozuv(p, '<b>Audit jurnali.</b> Har bir amal: kim, qachon, qaysi kompyuterdan', 16);
  await K(p, 3400);
  await rasm(p, 'audit-jurnali');

  const yozuv1 = p.locator('table tbody tr').first();
  if (await yozuv1.count()) {
    await bos(p, 'table tbody tr', 2000);
    await yozuv(p, 'Yozuvni <b>o‘chirib ham, tahrirlab ham bo‘lmaydi</b> — bazaning o‘zida taqiqlangan', 16);
    await K(p, 3200);
    await rasm(p, 'audit-tafsilot');
    await p.keyboard.press('Escape').catch(() => {});
    await K(p, 700);
  }

  await ot(p, '#/monitoring');
  await yozuv(p, '<b>Ish nazorati.</b> Hozir kim ishlayapti, qaysi kompyuterda, qachon kirdi', 17);
  await K(p, 3400);
  await rasm(p, 'ish-nazorati');

  await ot(p, '#/queue-stats');
  await yozuv(p, '<b>Navbat statistikasi.</b> Qaysi soatlarda gavjum, qanchasi kelmagan', 18);
  await K(p, 3200);
  await rasm(p, 'navbat-statistikasi');

  await ot(p, '#/attendance');
  await yozuv(p, '<b>Davomat.</b> Xodimlarning kelish-ketishi', 19);
  await K(p, 3000);
  await rasm(p, 'davomat');

  await yozuvniYash(p);
  await K(p, 600);
  await yop(ctx, p, '4-rahbar-nazorati');
}

// ===========================================================================
// 4-VIDEO — SOZLASH VA BOSHQARUV
// ===========================================================================
{
  const { ctx, p } = await kontekst(browser, 'v4-sozlash', undefined, 'RAHBAR-PC');
  await pinKir(p, 'egasi', null, null);

  await ot(p, '#/staff');
  await yozuv(p, '<b>Xodimlar.</b> Har birida rasm, rol va PIN kod. Rasm kirish oynasida ko‘rinadi', 20);
  await K(p, 3600);
  await rasm(p, 'xodimlar');

  await ot(p, '#/catalog');
  await yozuv(p, '<b>Analiz katalogi.</b> O‘z analizlaringiz, narxlaringiz va norma chegaralaringiz', 21);
  await K(p, 3400);
  await rasm(p, 'analiz-katalogi');

  await ot(p, '#/inventory');
  await yozuv(p, '<b>Ombor.</b> Reaktiv qoldig‘i eng kam chegaradan tushsa — ogohlantiradi', 22);
  await K(p, 3400);
  await rasm(p, 'ombor');

  await ot(p, '#/devices');
  await yozuv(p, '<b>Uskunalar.</b> Analizatordan natija avtomatik keladi — qo‘lda terish shart emas', 23);
  await K(p, 3400);
  await rasm(p, 'uskunalar');

  await ot(p, '#/cameras');
  await yozuv(p, '<b>Kameralar.</b> Xona kameralari va yuz bo‘yicha davomat', 24);
  await K(p, 3200);
  await rasm(p, 'kameralar');

  await ot(p, '#/settings');
  await yozuv(p, '<b>Sozlamalar.</b> Laboratoriya nomi, ish vaqti, parol, ikki bosqichli kirish, zaxira', 25);
  await K(p, 3400);
  await rasm(p, 'sozlamalar');

  await yozuvniYash(p);
  await K(p, 600);
  await yop(ctx, p, '5-sozlash');
}

// ===========================================================================
// 5-VIDEO — TELEFONDAGI RAHBAR PANELI
// ===========================================================================
{
  const { ctx, p } = await kontekst(browser, 'v5-telefon', { width: 420, height: 880 }, 'Telefon');
  await pinKir(p, 'egasi', null, null);
  await ot(p, '#/mobile', 2200);
  await yozuv(p, '<b>Telefondagi rahbar paneli.</b> QR kod orqali o‘rnatiladi — ilova do‘koni kerak emas', 26);
  await K(p, 3800);
  await rasm(p, 'telefon-rahbar-paneli');

  await p.evaluate(() => window.scrollTo(0, 500));
  await K(p, 1200);
  await rasm(p, 'telefon-pastki-qism');
  await K(p, 2200);

  await yozuvniYash(p);
  await K(p, 600);
  await yop(ctx, p, '6-telefon');
}

await browser.close();
console.log('\nDEMO TAYYOR');
