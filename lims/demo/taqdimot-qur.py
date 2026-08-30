#!/usr/bin/env python3
"""
LabCore-TANISHTIRUV.html — mijozga ko'rsatiladigan bitta fayl.

Video ham, rasm ham faylning ichida keladi: internet kerak emas,
fleshkada olib borsa ham ishlaydi.
"""
import base64
import pathlib
import sys

SRC = pathlib.Path('/tmp/demo-chiqish')
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/LabCore-TANISHTIRUV.html')


def b64(p, mime):
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()


def rasm(nom):
    f = SRC / 'rasmlar' / nom
    return b64(f, 'image/png')


def video(nom):
    f = SRC / 'video' / 'mp4' / nom
    return b64(f, 'video/mp4')


# ---------------------------------------------------------------------------
VIDEOLAR = [
    ('1-kundalik-ish.mp4', 'Kundalik ish', '59 soniya',
     'Xodim PIN kod bilan kiradi, bemor qidiriladi, kartasi ochiladi, analiz natijasi '
     'kiritiladi va tasdiqlanadi. Normadan chetlashgan qiymat darrov belgilanadi.'),
    ('2-shifokor.mp4', 'Shifokor xulosasi', '23 soniya',
     'Shifokorga faqat tasdiqlangan, ko\'rilishi kerak bo\'lgan natijalar chiqadi. '
     'U tashxis va tavsiya yozadi — bemorga beriladigan javob shundan yig\'iladi.'),
    ('3-kassa.mp4', 'Kassa va qarzdorlar', '22 soniya',
     'To\'lov qabul qilinadi, kunlik yakun ko\'rinadi. Qarzdorlar ro\'yxatida kim qancha '
     'va qancha vaqtdan beri qarzdor ekani telefoni bilan turadi.'),
    ('4-rahbar-nazorati.mp4', 'Rahbar nazorati', '48 soniya',
     'Bosh sahifadagi kunlik ko\'rsatkichlar, audit jurnali (kim nima qilgani), '
     'ish nazorati, navbat statistikasi va davomat.'),
    ('5-sozlash.mp4', 'Sozlash va boshqaruv', '41 soniya',
     'Xodimlar va ularning rasmlari, analiz katalogi va narxlar, ombor qoldig\'i, '
     'analizatorlar, kameralar va umumiy sozlamalar.'),
    ('6-telefon.mp4', 'Telefondagi rahbar paneli', '19 soniya',
     'Laboratoriyaga bormasdan turib: bugungi daromad, navbat, kritik natijalar. '
     'QR kod orqali o\'rnatiladi — ilova do\'koni kerak emas.'),
]

GURUHLAR = [
    ('Kirish va ish boshlash', 'kirish', [
        ('01-kirish-pin.png', 'Kirish oynasi',
         'Xodim o\'z rasmini bosadi va 4–8 raqamli shaxsiy PIN kodini teradi. '
         'Uzun parol terish shart emas — kun davomida o\'nlab marta kiriladi.'),
        ('02-laborant-bosh-sahifa.png', 'Laborant ko\'radigan ekran',
         'Menyu rolga qarab qisqaradi: laborantda kassa va qarzdorlar yo\'q. '
         'Har kim faqat o\'z ishini ko\'radi.'),
    ]),
    ('Kundalik ish', 'kundalik', [
        ('03-navbat.png', 'Navbat',
         'Telefon qilgan bemor oldindan yoziladi. Kelgani belgilanadi, kelmagani '
         'avtomatik qayd etiladi.'),
        ('04-bemorlar.png', 'Bemorlar ro\'yxati',
         'Karta raqami tizim tomonidan beriladi (100001, 100002…) va hech qachon '
         'takrorlanmaydi.'),
        ('05-bemor-qidiruv.png', 'Qidiruv',
         'Familiya, ism, telefon raqami yoki karta raqami — istalgan biri bo\'yicha.'),
        ('06-bemor-kartasi.png', 'Bemor kartasi',
         'Butun tarix bir joyda: tashriflar, analizlar, tashxislar, fayllar. '
         'QR kod chop etilsa, keyingi kelishida skanerlanadi.'),
        ('07-analizlar.png', 'Analizlar ro\'yxati',
         'Holat rangi bilan ko\'rinadi: yangi → ish jarayonida → tayyor → tasdiqlangan.'),
        ('08-buyurtma.png', 'Buyurtma oynasi',
         'Laborantning asosiy ish oynasi. Har bir analiz uchun probirka shtrix-kodi bor.'),
        ('09-natija-kiritish.png', 'Natija kiritish',
         'Raqam yozilishi bilan tizim uni bemorning yoshi va jinsiga mos normaga '
         'solishtiradi.'),
        ('10-natija-saqlandi.png', 'Natija saqlandi',
         'Kim kiritgani va qachon kiritgani avtomatik yoziladi — hech kim qo\'lda '
         'o\'zgartira olmaydi.'),
    ]),
    ('Shifokor va kassa', 'moliya', [
        ('11-shifokor-navbati.png', 'Shifokor navbati',
         'Faqat tasdiqlangan, ko\'rilishi kerak bo\'lgan natijalar chiqadi.'),
        ('12-shifokor-xulosasi.png', 'Shifokor xulosasi',
         'Tashxis va tavsiya. Bemorga chiqariladigan javob blankasi shundan yig\'iladi.'),
        ('13-kassir-bosh-sahifa.png', 'Kassir ekrani',
         'Kassirga natija kiritish oynalari umuman ko\'rinmaydi.'),
        ('14-kassa.png', 'Kassa',
         'To\'lov, qaytarish, chek. Yuqorida kunlik yakun: tushum, qaytarilgan, sof summa.'),
        ('15-qarzdorlar.png', 'Qarzdorlar',
         'Kim qancha qarzdor va qancha vaqtdan beri — telefon raqami bilan birga.'),
    ]),
    ('Rahbar nazorati', 'nazorat', [
        ('16-rahbar-bosh-sahifa.png', 'Bosh sahifa',
         'Bugungi bemorlar, analizlar, daromad, hozir ishlayotgan xodimlar — bir qarashda.'),
        ('17-bosh-sahifa-ogohlantirish.png', 'Ogohlantirishlar',
         'Kritik natijalar va ombor qoldig\'i haqidagi ogohlantirishlar shu yerda.'),
        ('18-audit-jurnali.png', 'Audit jurnali',
         'Har bir amal: kim, qachon, qaysi kompyuterdan. Yozuvni o\'chirib ham, '
         'tahrirlab ham bo\'lmaydi — bu bazaning o\'zida taqiqlangan.'),
        ('19-audit-tafsilot.png', 'O\'zgarish tafsiloti',
         'Natija o\'zgartirilsa, eski va yangi qiymat yonma-yon ko\'rinadi.'),
        ('20-ish-nazorati.png', 'Ish nazorati',
         'Hozir kim ishlayapti, qaysi kompyuterda, qachon kirdi.'),
        ('21-navbat-statistikasi.png', 'Navbat statistikasi',
         'Qaysi soatlarda gavjum, qanchasi kelmagan, o\'rtacha kutish qancha.'),
        ('22-davomat.png', 'Davomat',
         'Kamera yuz bo\'yicha tanigan xodimlarning kelish-ketishi.'),
    ]),
    ('Sozlash va boshqaruv', 'sozlash', [
        ('23-xodimlar.png', 'Xodimlar',
         'Har birida rasm, rol va PIN kod. Rasm kirish oynasida va ish nazoratida ko\'rinadi.'),
        ('24-analiz-katalogi.png', 'Analiz katalogi',
         'O\'z analizlaringiz, narxlaringiz va yosh-jinsga qarab norma chegaralari.'),
        ('25-ombor.png', 'Ombor',
         'Reaktiv va sarf material qoldig\'i. Eng kam chegaradan tushsa — ogohlantiradi.'),
        ('26-uskunalar.png', 'Uskunalar',
         'Analizator natijani o\'zi yuboradi — laborant qo\'lda terib o\'tirmaydi. '
         'To\'rtta ulanish usuli: HL7, ASTM, papka va HTTP.'),
        ('27-kameralar.png', 'Kameralar',
         'Xona kameralari, ish joyiga biriktirish va yuz bo\'yicha davomat.'),
        ('28-sozlamalar.png', 'Sozlamalar',
         'Laboratoriya nomi, ish vaqti, parol, ikki bosqichli kirish, zaxira nusxa.'),
    ]),
    ('Telefondagi rahbar paneli', 'telefon', [
        ('29-telefon-rahbar-paneli.png', 'Telefon ekrani',
         'QR kod orqali o\'rnatiladi. Play Market yoki App Store kerak emas.'),
        ('30-telefon-pastki-qism.png', 'Kunlik ko\'rsatkichlar',
         'Daromad, navbat, kritik natijalar va so\'nggi o\'zgarishlar lentasi.'),
    ]),
]

# ---------------------------------------------------------------------------
CSS = """
:root{
  --paper:#eef1f1; --surface:#fff; --surface-2:#f5f7f7;
  --ink:#0f1e1b; --ink-2:#33453f; --muted:#667872; --line:#d7dedc;
  --teal:#0b6b5f; --teal-deep:#063f38; --teal-soft:#e2efec;
  --shadow:0 1px 2px rgba(15,30,27,.06), 0 12px 34px -18px rgba(15,30,27,.3);
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Charter,Georgia,serif;
  --sans:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;
  --mono:"Cascadia Mono",Consolas,"DejaVu Sans Mono",ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --paper:#0a1312; --surface:#111d1b; --surface-2:#162321;
    --ink:#e4ebe9; --ink-2:#b9c8c4; --muted:#849792; --line:#25342f;
    --teal:#4cbfae; --teal-deep:#8ad9cb; --teal-soft:#122a27;
    --shadow:0 1px 2px rgba(0,0,0,.5), 0 14px 36px -20px rgba(0,0,0,.85);
  }
}
:root[data-theme="dark"]{
  --paper:#0a1312; --surface:#111d1b; --surface-2:#162321;
  --ink:#e4ebe9; --ink-2:#b9c8c4; --muted:#849792; --line:#25342f;
  --teal:#4cbfae; --teal-deep:#8ad9cb; --teal-soft:#122a27;
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 14px 36px -20px rgba(0,0,0,.85);
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
     font-size:16px;line-height:1.62;-webkit-text-size-adjust:100%}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px}
@media (max-width:640px){ .wrap{padding:0 16px} }

.topbar{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--paper) 88%,transparent);
        backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.topbar .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;
              min-height:60px;flex-wrap:wrap}
.brand{font-family:var(--serif);font-size:1.22rem;font-weight:600;letter-spacing:.2px}
.brand span{color:var(--muted);font-family:var(--sans);font-size:.76rem;
            text-transform:uppercase;letter-spacing:.16em;margin-left:10px;font-weight:600}
.navlinks{display:flex;gap:18px;flex-wrap:wrap}
.navlinks a{color:var(--ink-2);text-decoration:none;font-size:.88rem}
.navlinks a:hover{color:var(--teal)}
@media (max-width:700px){ .navlinks{display:none} }

.hero{padding:64px 0 34px}
.eyebrow{font-family:var(--mono);font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;
         color:var(--teal);margin:0 0 14px;font-weight:600}
h1{font-family:var(--serif);font-size:clamp(2.1rem,5vw,3.4rem);line-height:1.1;
   margin:0 0 20px;font-weight:600;letter-spacing:-.5px}
.lede{font-size:clamp(1.02rem,2.2vw,1.2rem);color:var(--ink-2);max-width:62ch;margin:0 0 8px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:34px 0 0}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:15px 17px}
.stat b{display:block;font-family:var(--serif);font-size:1.75rem;line-height:1.1;color:var(--teal)}
.stat span{display:block;font-size:.79rem;color:var(--muted);margin-top:5px}

section{padding:52px 0;border-top:1px solid var(--line)}
.sec-head{display:flex;align-items:baseline;gap:14px;margin-bottom:8px;flex-wrap:wrap}
.sec-mark{flex:none;width:30px;height:30px;border-radius:8px;background:var(--teal-soft);
          color:var(--teal-deep);display:grid;place-items:center;
          font-family:var(--mono);font-size:.78rem;font-weight:700}
h2{font-family:var(--serif);font-size:clamp(1.5rem,3.4vw,2.05rem);margin:0;font-weight:600}
.sec-lede{color:var(--ink-2);max-width:64ch;margin:10px 0 26px}

.videolar{display:grid;gap:26px}
.vid{background:var(--surface);border:1px solid var(--line);border-radius:14px;
     overflow:hidden;box-shadow:var(--shadow)}
.vid video{display:block;width:100%;height:auto;background:#0b1413}
.vid-body{padding:17px 21px 19px}
.vid-body h3{font-family:var(--serif);font-size:1.16rem;margin:0 0 5px;font-weight:600;
             display:flex;align-items:baseline;gap:11px;flex-wrap:wrap}
.vid-body h3 em{font-style:normal;font-family:var(--mono);font-size:.7rem;color:var(--muted);
                letter-spacing:.08em;background:var(--surface-2);padding:3px 8px;border-radius:20px;
                border:1px solid var(--line)}
.vid-body p{margin:0;color:var(--ink-2);font-size:.94rem}
@media (min-width:900px){ .videolar{grid-template-columns:1fr 1fr} }

.shots{display:grid;gap:30px;margin-top:8px}
.shot{background:var(--surface);border:1px solid var(--line);border-radius:13px;
      overflow:hidden;box-shadow:var(--shadow)}
.shot img{display:block;width:100%;height:auto;border-bottom:1px solid var(--line)}
.shot-body{padding:15px 20px 18px}
.shot-body h4{font-family:var(--serif);font-size:1.06rem;margin:0 0 4px;font-weight:600}
.shot-body p{margin:0;color:var(--ink-2);font-size:.92rem}

.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin-top:24px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:17px 19px}
.card h4{font-family:var(--serif);font-size:1.04rem;margin:0 0 6px;font-weight:600}
.card p{margin:0;font-size:.9rem;color:var(--ink-2)}

.note{border-left:3px solid var(--teal);background:var(--surface);padding:15px 19px;
      border-radius:0 9px 9px 0;margin:26px 0;font-size:.94rem}
.note b{display:block;margin-bottom:4px}

footer{padding:44px 0 66px;border-top:1px solid var(--line);color:var(--muted);font-size:.88rem}
footer p{max-width:66ch}
"""

# ---------------------------------------------------------------------------
def vid_html():
    out = []
    for fayl, nom, uzunlik, izoh in VIDEOLAR:
        out.append(f"""
      <figure class="vid">
        <video controls preload="metadata" playsinline src="{video(fayl)}"></video>
        <figcaption class="vid-body">
          <h3>{nom} <em>{uzunlik}</em></h3>
          <p>{izoh}</p>
        </figcaption>
      </figure>""")
    return '\n'.join(out)


def guruh_html():
    out = []
    for n, (sarlavha, ident, rasmlar) in enumerate(GURUHLAR):
        harf = chr(ord('A') + n)
        kartalar = '\n'.join(f"""
        <figure class="shot">
          <img src="{rasm(f)}" alt="{nom}" loading="lazy">
          <figcaption class="shot-body">
            <h4>{nom}</h4>
            <p>{izoh}</p>
          </figcaption>
        </figure>""" for f, nom, izoh in rasmlar)
        out.append(f"""
  <section id="{ident}">
    <div class="sec-head"><span class="sec-mark">{harf}</span><h2>{sarlavha}</h2></div>
    <div class="shots">{kartalar}
    </div>
  </section>""")
    return '\n'.join(out)


HTML = f"""<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LabCore — tizim bilan tanishuv</title>
<style>{CSS}</style>
</head>
<body>

<header class="topbar">
  <div class="wrap">
    <div class="brand">LabCore <span>Tanishuv</span></div>
    <nav class="navlinks">
      <a href="#videolar">Videolar</a>
      <a href="#kirish">Kirish</a>
      <a href="#kundalik">Kundalik ish</a>
      <a href="#moliya">Kassa</a>
      <a href="#nazorat">Nazorat</a>
      <a href="#sozlash">Sozlash</a>
      <a href="#telefon">Telefon</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <div class="hero">
    <p class="eyebrow">Laboratoriya boshqaruv tizimi</p>
    <h1>Ishlab turgan tizim —<br>o‘z ko‘zingiz bilan</h1>
    <p class="lede">
      Quyidagi videolar va rasmlarning hammasi <strong>haqiqiy dasturdan</strong> olingan:
      chizma ham, montaj ham yo‘q. Ekranda ko‘ringan har bir raqam bazadan keladi.
      Namuna sifatida &laquo;Shifo Lab diagnostika markazi&raquo; ma’lumotlari ishlatilgan.
    </p>
    <div class="stats">
      <div class="stat"><b>15</b><span>bo‘lim</span></div>
      <div class="stat"><b>4</b><span>rol: admin, laborant, shifokor, kassir</span></div>
      <div class="stat"><b>3.5</b><span>daqiqa video</span></div>
      <div class="stat"><b>30</b><span>ekran rasmi</span></div>
      <div class="stat"><b>0</b><span>oylik to‘lov</span></div>
    </div>
  </div>

  <section id="videolar">
    <div class="sec-head"><span class="sec-mark">▶</span><h2>Videolar</h2></div>
    <p class="sec-lede">
      Oltita qisqa video — tizimning butun ish oqimi. Har biri alohida ko‘rilsa ham tushunarli.
      Ekran ostidagi yozuvlar nima bo‘layotganini aytib boradi.
    </p>
    <div class="videolar">{vid_html()}
    </div>
  </section>
{guruh_html()}

  <section id="xulosa">
    <div class="sec-head"><span class="sec-mark">✦</span><h2>Nimasi bilan ajralib turadi</h2></div>
    <div class="kv">
      <div class="card">
        <h4>Audit jurnalini o‘chirib bo‘lmaydi</h4>
        <p>Yozuvni tahrirlash va o‘chirish bazaning o‘zida taqiqlangan — administrator ham
           qila olmaydi. Kim, qachon, qaysi kompyuterdan nima qilgani qoladi.</p>
      </div>
      <div class="card">
        <h4>Natija tahriri izsiz qolmaydi</h4>
        <p>Tasdiqlangan natija o‘zgartirilsa, eski qiymat ham saqlanadi va sabab so‘raladi.
           Tahrir oynasi tugagach natija butunlay qulflanadi.</p>
      </div>
      <div class="card">
        <h4>Internetsiz to‘liq ishlaydi</h4>
        <p>Server, xodim kompyuterlari va telefon bitta mahalliy tarmoqda ishlaydi.
           Internet uzilsa ham laboratoriya to‘xtamaydi.</p>
      </div>
      <div class="card">
        <h4>Analizator bilan bevosita aloqa</h4>
        <p>Natija uskunadan to‘g‘ridan-to‘g‘ri keladi: HL7, ASTM, papka yoki HTTP.
           Qo‘lda terishda bo‘ladigan xatolar yo‘qoladi.</p>
      </div>
      <div class="card">
        <h4>Har bir xodim — o‘z hisobi</h4>
        <p>PIN kod bilan tez kiriladi, lekin har bir amal aniq kishiga bog‘lanadi.
           Umumiy hisob ishlatilmaydi.</p>
      </div>
      <div class="card">
        <h4>Kunlik zaxira va tiklash</h4>
        <p>Har kuni 01:30 da avtomatik zaxira olinadi. Zaxira haqiqatan ishlashini
           bitta tugma bilan tekshirib ko‘rish mumkin.</p>
      </div>
    </div>

    <div class="note">
      <b>Ma’lumot qayerda turadi</b>
      Hamma narsa laboratoriyaning o‘z kompyuterida saqlanadi. Bemor ma’lumoti tashqi
      xizmatlarga yuborilmaydi va bulutga obuna talab qilinmaydi.
    </div>
  </section>

  <footer>
    <p>
      Bu faylning ichida videolar ham, rasmlar ham bor — internet kerak emas.
      Fleshkada olib borsa ham, telefonga tashlasa ham ochiladi.
    </p>
  </footer>
</div>

</body>
</html>
"""

OUT.write_text(HTML, encoding='utf-8')
mb = OUT.stat().st_size / 1048576
print(f'{OUT}: {mb:.1f} MB')
