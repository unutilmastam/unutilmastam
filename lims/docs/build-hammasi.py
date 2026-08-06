#!/usr/bin/env python3
"""
LabCore-HAMMASI.html — bitta faylda hamma narsa.

Mavjud rasmli qo'llanmani (44 ta ekran rasmi) asos qilib oladi va unga
qilingan ishlarning to'liq yozuvini qo'shadi: internetsiz o'rnatish,
tuzatishlar tarixi, texnik ma'lumot va tezkor ma'lumotnoma.
"""
import re
import sys
import pathlib

SRC = pathlib.Path('docs/qollanma.html')
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'docs/hammasi.html')

raw = SRC.read_text(encoding='utf-8')
css = raw[:raw.index('</style>')].replace('<title>', '', 1)
css = css[css.index('<style>') + len('<style>'):] if '<style>' in css else css
body = raw[raw.index('</style>') + len('</style>'):]

# --- mavjud bo'limlarni ajratib olamiz -------------------------------------
IDS = ['boshlash', 'ornatish', 'oyna', 'kundalik', 'nazorat', 'sozlash', 'yangi', 'xizmat']
starts = {i: body.index(f'<section id="{i}"') for i in IDS}
order = sorted(starts.items(), key=lambda kv: kv[1])
bounds = []
for n, (sid, pos) in enumerate(order):
    end = order[n + 1][1] if n + 1 < len(order) else body.index('<footer>')
    bounds.append((sid, body[pos:end]))
SEC = dict(bounds)


def remark(html, letter):
    """Bo'lim harfini almashtiradi (yangi bo'limlar orasiga qo'shilgani uchun)."""
    return re.sub(r'<span class="sec-mark">[^<]*</span>',
                  f'<span class="sec-mark">{letter}</span>', html, count=1)


# ===========================================================================
#  QO'SHIMCHA USLUBLAR — yangi bo'limlar uchun
# ===========================================================================
EXTRA_CSS = """
  /* ---- HAMMASI faylining qo'shimcha bo'laklari ---- */
  .stats{display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin:26px 0}
  .stat{background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:14px 16px}
  .stat b{display:block; font-family:var(--serif); font-size:1.7rem; line-height:1.1; color:var(--teal)}
  .stat span{display:block; font-size:.8rem; color:var(--muted); margin-top:4px}

  .bug{background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--crimson);
       border-radius:0 10px 10px 0; padding:18px 20px; margin:16px 0}
  .bug > h4{margin:0 0 12px; font-family:var(--serif); font-size:1.08rem; font-weight:600;
            display:flex; align-items:baseline; gap:10px; flex-wrap:wrap}
  .bug .no{font-family:var(--mono); font-size:.72rem; color:var(--muted); letter-spacing:.1em}
  .bug dl{display:grid; grid-template-columns:auto minmax(0,1fr); gap:7px 16px; margin:0; font-size:.92rem}
  .bug dt{font-family:var(--mono); font-size:.68rem; letter-spacing:.1em; text-transform:uppercase;
          color:var(--muted); padding-top:3px; white-space:nowrap}
  .bug dd{margin:0; color:var(--ink-2)}
  .bug dd code{white-space:normal}
  .bug.fixed{border-left-color:var(--teal)}
  @media (max-width:640px){ .bug dl{grid-template-columns:1fr; gap:2px 0} .bug dt{padding-top:9px} }

  .kv{width:100%; border-collapse:collapse; font-size:.9rem}
  .kv td{padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top}
  .kv td:first-child{white-space:nowrap; color:var(--muted); font-family:var(--mono); font-size:.78rem}

  .tree{font-family:var(--mono); font-size:.78rem; line-height:1.75; color:var(--ink-2);
        background:var(--surface-2); border:1px solid var(--line); border-radius:9px;
        padding:16px 18px; overflow-x:auto; white-space:pre; margin:18px 0}
  .tree b{color:var(--teal-deep); font-weight:600}
  .tree i{color:var(--muted); font-style:normal}

  .toc{background:var(--surface); border:1px solid var(--line); border-radius:12px;
       padding:22px 24px; margin:30px 0}
  .toc h4{margin:0 0 14px; font-family:var(--mono); font-size:.72rem; letter-spacing:.14em;
          text-transform:uppercase; color:var(--muted); font-weight:600}
  .toc ol{list-style:none; counter-reset:t; margin:0; padding:0;
          display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:2px 26px}
  .toc li{counter-increment:t; margin:0; border-bottom:1px solid var(--line)}
  .toc li:last-child{border-bottom:0}
  .toc a{display:grid; grid-template-columns:26px 1fr; gap:10px; padding:9px 0;
         text-decoration:none; color:var(--ink); font-size:.93rem; align-items:baseline}
  .toc a::before{content:counter(t,upper-alpha); font-family:var(--mono); font-size:.72rem;
                 color:var(--teal); font-weight:700}
  .toc a:hover{color:var(--teal)}
  /* Sarlavha ostidagi izoh birinchi (tor) ustunga tushib qolmasin */
  .toc a span{grid-column:2; color:var(--muted); font-size:.82rem; display:block; margin-top:2px}
"""

# ===========================================================================
#  A. TIZIM NIMA QILA OLADI
# ===========================================================================
S_TIZIM = """
  <section id="tizim">
    <div class="sec-head"><span class="sec-mark">A</span><h2>Tizim nima qila oladi</h2></div>
    <div class="col">
      <p class="sec-lede">
        LabCore — laboratoriyaning butun ish oqimi uchun bitta dastur: bemor telefon qilgan
        daqiqadan tortib, natija shifokor xulosasi bilan chiqarilib, pul kassaga tushgunicha.
        Hamma narsa <strong>sizning kompyuteringizda</strong> turadi; internet, obuna va tashqi
        xizmat kerak emas.
      </p>
    </div>

    <div class="stats">
      <div class="stat"><b>25</b><span>baza jadvali</span></div>
      <div class="stat"><b>111</b><span>server manzili (API)</span></div>
      <div class="stat"><b>4</b><span>rol: admin, laborant, shifokor, kassir</span></div>
      <div class="stat"><b>108</b><span>avtomatik test</span></div>
      <div class="stat"><b>0</b><span>oylik to'lov</span></div>
    </div>

    <div class="col">
      <h3>Bo'limlar ro'yxati</h3>
      <p>
        Quyidagilarning hammasi tayyor va ishlaydi. Har biri o'z bo'limida batafsil
        ko'rsatilgan — rasmlari bilan.
      </p>
    </div>

    <div class="tablewrap">
      <table>
        <thead><tr><th>Bo'lim</th><th>Nima qiladi</th><th>Kim ishlatadi</th></tr></thead>
        <tbody>
          <tr><td><b>Bosh sahifa</b></td><td>Bugungi bemorlar, tushum, kutilayotgan natijalar, ogohlantirishlar</td><td>Hamma</td></tr>
          <tr><td><b>Navbat</b></td><td>Oldindan yozilish, kelmaganlarni belgilash, eslatma yuborish, soatlik statistika</td><td>Registratura</td></tr>
          <tr><td><b>Bemorlar</b></td><td>Karta ochish, tarix, QR kod, fayl biriktirish, ko'rsatkich dinamikasi</td><td>Registratura, shifokor</td></tr>
          <tr><td><b>Analizlar</b></td><td>Buyurtma, namuna, natija kiritish, norma bilan solishtirish, tasdiqlash</td><td>Laborant</td></tr>
          <tr><td><b>Shifokor xulosasi</b></td><td>Tasdiqlangan natijalarga tashxis va tavsiya, chop etiladigan javob</td><td>Shifokor</td></tr>
          <tr><td><b>Kassa</b></td><td>To'lov, qaytarish, chek, kunlik yakun, qarzdorlar ro'yxati</td><td>Kassir</td></tr>
          <tr><td><b>Analiz katalogi</b></td><td>O'z analizlaringiz, narxlar, yosh va jinsga qarab norma chegaralari</td><td>Admin</td></tr>
          <tr><td><b>Ombor</b></td><td>Reaktiv va sarf material qoldig'i, eng kam chegara, ogohlantirish</td><td>Admin, laborant</td></tr>
          <tr><td><b>Uskunalar</b></td><td>Analizatordan natijani avtomatik olish (HL7, ASTM, papka, ketma-ket port)</td><td>Admin</td></tr>
          <tr><td><b>Kameralar</b></td><td>Xona kameralari, yuz bo'yicha davomat, hodisalar tarixi</td><td>Rahbar</td></tr>
          <tr><td><b>Ish nazorati</b></td><td>Kim qaysi kompyuterda, qachon kirdi, nima qildi</td><td>Rahbar</td></tr>
          <tr><td><b>Audit jurnali</b></td><td>O'zgartirib bo'lmaydigan yozuv: har bir ko'rish va tahrir</td><td>Rahbar</td></tr>
          <tr><td><b>Rahbar paneli (telefon)</b></td><td>Daromad, navbat, kritik natijalar — telefon ekranida</td><td>Rahbar</td></tr>
          <tr><td><b>Yorliqlar</b></td><td>Probirka uchun shtrix-kod va yorliq chop etish</td><td>Laborant</td></tr>
          <tr><td><b>Sozlamalar</b></td><td>Laboratoriya nomi, ish vaqti, parol, ikki bosqichli kirish, zaxira</td><td>Admin</td></tr>
        </tbody>
      </table>
    </div>

    <div class="col">
      <h3>Uchta narsa boshqa dasturlarda kam uchraydi</h3>
    </div>
    <div class="cards">
      <div class="card">
        <h4>Audit jurnalini o'chirib bo'lmaydi</h4>
        <p>Yozuvni tahrirlash yoki o'chirish bazaning o'zida taqiqlangan. Kim, qachon, qaysi
           kompyuterdan nimani ko'rgani va o'zgartirgani — hammasi qoladi.</p>
      </div>
      <div class="card">
        <h4>Natija tahriri izsiz qolmaydi</h4>
        <p>Tasdiqlangan natija o'zgartirilsa, eski qiymat ham saqlanadi va o'zgarish sababi
           so'raladi. Tahrir oynasi tugagach natija qulflanadi.</p>
      </div>
      <div class="card">
        <h4>Internetsiz to'liq ishlaydi</h4>
        <p>Server, ish stansiyalari va telefon bir Wi-Fi ichida ishlaydi. Internet faqat
           dasturni birinchi marta yuklab olish uchun kerak — u ham boshqa qurilmada bo'lsa bo'ldi.</p>
      </div>
    </div>
  </section>
"""

# ===========================================================================
#  C. INTERNETSIZ O'RNATISH
# ===========================================================================
S_OFFLINE = """
  <section id="internetsiz">
    <div class="sec-head"><span class="sec-mark">C</span><h2>Internetsiz o'rnatish — fleshka orqali</h2></div>
    <div class="col">
      <p class="sec-lede">
        Server kompyuterda internet bo'lishi <strong>shart emas</strong>. Telefoningizda yoki
        interneti bor boshqa kompyuterda uchta faylni yuklab olasiz, fleshkaga solasiz va
        laboratoriyadagi kompyuterga o'tkazasiz. Boshqa hech narsa kerak bo'lmaydi.
      </p>
    </div>

    <div class="tablewrap">
      <table>
        <thead><tr><th>Nechanchi</th><th>Fayl</th><th>Hajmi</th><th>Qayerdan</th></tr></thead>
        <tbody>
          <tr>
            <td class="num">1</td><td><code>LabCore-toliq.zip</code></td><td class="num">78 MB</td>
            <td class="hash">github.com/unutilmastam/unutilmastam/raw/yuklab-olish/LabCore-toliq.zip</td>
          </tr>
          <tr>
            <td class="num">2</td><td>Node.js LTS <code>.msi</code></td><td class="num">~30 MB</td>
            <td class="hash">nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi</td>
          </tr>
          <tr>
            <td class="num">3</td><td>PostgreSQL o'rnatuvchisi</td><td class="num">~350 MB</td>
            <td class="hash">postgresql.org/download/windows/ &rarr; "Download the installer" &rarr; Windows x86-64</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="col">
      <p>
        LabCore'ning o'z kutubxonalari (1666 ta fayl) <strong>arxivning ichida</strong> keladi —
        o'rnatish paytida internet umuman so'ralmaydi.
      </p>
    </div>

    <div class="note danger">
      <b>Ikkita tuzoq — ularga tushmang</b>
      <p><strong>Chocolatey.</strong> Internetda "Windows'ga dastur o'rnatish" deb qidirsangiz
      <code>choco install ...</code> buyruqlari chiqadi. Ular internetdan yuklab oladi va sizda
      <em>"Unable to resolve remote name"</em> xatosini beradi. LabCore uchun ular
      <strong>umuman kerak emas</strong> — yuqoridagi uchta fayl yetarli.</p>
      <p><strong>Stack Builder.</strong> PostgreSQL o'rnatilib bo'lgach oxirida "Stack Builder"
      oynasi ochiladi. U ham internetdan qo'shimcha dastur yuklaydi. <strong>Cancel</strong>
      (ruscha "Отмена") bosing — LabCore uchun kerak emas.</p>
    </div>

    <div class="col">
      <h3>Tartib</h3>
    </div>
    <ol class="steps">
      <li class="step">
        <div class="step-n">1</div>
        <div class="step-body">
          <h3 class="step-h">Node.js</h3>
          <p><code>node-v22.20.0-x64.msi</code> &rarr; ikki marta bosing &rarr; Next &mdash; Next &mdash;
          Install. Hech narsani o'zgartirmang.</p>
        </div>
      </li>
      <li class="step">
        <div class="step-n">2</div>
        <div class="step-body">
          <h3 class="step-h">PostgreSQL</h3>
          <p>Next bosib borasiz. <strong>"postgres" foydalanuvchisiga parol so'raydi — o'sha
          parolni yozib qo'ying</strong>, keyingi qadamda kerak bo'ladi. Port: 5432, o'zgartirmang.
          Oxirida Stack Builder chiqsa — Cancel.</p>
        </div>
      </li>
      <li class="step">
        <div class="step-n">3</div>
        <div class="step-body">
          <h3 class="step-h">Kompyuterni qayta yoqing</h3>
          <p>Bu shart: Windows yangi dasturlarni "ko'rishi" uchun kerak. Aks holda o'rnatuvchi
          <em>"Node.js topilmadi"</em> deb chiqadi.</p>
        </div>
      </li>
      <li class="step">
        <div class="step-n">4</div>
        <div class="step-body">
          <h3 class="step-h">LabCore</h3>
          <p><code>LabCore-toliq.zip</code> ni <code>C:\\</code> diskiga chiqaring
          (o'ng tugma &rarr; Extract All), so'ng <code>ORNATISH.bat</code> &rarr;
          <strong>o'ng tugma &rarr; "Run as administrator"</strong>.</p>
          <p>Skript PostgreSQL parolini so'raydi, qolganini o'zi qiladi: bazani yaratadi,
          tizimni <code>C:\\LabCore</code> ga qo'yadi, HTTPS sertifikat yasaydi, ish stolida
          belgicha chiqaradi, avtozapusk va kunlik zaxirani yoqadi.</p>
        </div>
      </li>
    </ol>

    <div class="note">
      <b>Oxirida ekranda chiqadigan manzilni yozib oling</b>
      Masalan <code>https://192.168.1.45:4000</code>. Xodim kompyuterlariga va telefonga
      aynan shu manzil kiritiladi. Keyin unutsangiz — <code>TEKSHIR.bat</code> qayta aytadi.
    </div>
  </section>
"""

# ===========================================================================
#  K. TUZATISHLAR TARIXI
# ===========================================================================
BUGS = [
    ("Server bir ishlab, bir o'chib qolardi", "4-nashr", "eng og'iri",
     "Server ko'tariladi, tizimga kirasiz, keyin bir necha soniya yoki daqiqadan keyin "
     "hech qanday xabarsiz o'chadi. Windows vazifasi uni qayta ko'taradi — va shu takrorlanaveradi.",
     "Server bazaga bir nechta ulanishni ochiq saqlab turadi. Shu ulanishlardan biri "
     "<strong>bo'sh turganda</strong> uzilsa (antivirus, brandmauer, VPN yoki PostgreSQL'ning "
     "o'zi uzsa) <code>pg.Pool</code> <code>error</code> hodisasini chiqaradi. Node'da bu "
     "hodisani hech kim tinglamasa — jarayon o'sha zahoti to'xtaydi. Hech qanday xato "
     "yozilmasdi ham, shuning uchun jurnalda ham iz qolmagan.",
     "Xato ushlanadi: buzilgan ulanish tashlab yuboriladi, keyingi so'rov yangisini oladi, "
     "server ishlashda davom etadi. <code>keepAlive</code> yoqildi, bo'sh ulanish 30 soniyadan "
     "keyin yopiladi. Har qanday kutilmagan xato endi vaqti bilan <code>logs\\server.log</code> "
     "ga <code>QULASH</code> so'zi bilan yoziladi.",
     "<code>tests/barqarorlik.test.js</code> — haqiqiy PostgreSQL ulanishini "
     "<code>pg_terminate_backend</code> bilan uzadi va jarayon tirik qolishini talab qiladi."),

    ("Windows'da server umuman ishga tushmasdi", "3.6-nashr", "jimgina",
     "Ekranda hech narsa yo'q. Xato ham yo'q. Vazifa bajarilgandek ko'rinadi, lekin port bo'sh.",
     "Kirish nuqtasi <code>import.meta.url === `file://${process.argv[1]}`</code> deb "
     "tekshirilardi. Linux'da bu ishlaydi, Windows'da esa <strong>hech qachon</strong>: "
     "<code>file:///C:/LabCore/src/index.js</code> va <code>file://C:\\LabCore\\src\\index.js</code> "
     "teng emas. Natijada <code>start()</code> chaqirilmasdi va jarayon xatosiz tugardi.",
     "<code>pathToFileURL(process.argv[1]).href</code> ishlatiladi — u platforma farqini "
     "o'zi hisobga oladi.",
     "<code>tests/entry.test.js</code> — serverni haqiqatan ishga tushirib, "
     "<code>/api/health</code> javob berishini tekshiradi."),

    (".env o'qilmay, SASL xatosi chiqardi", "3.7-nashr", "huquq",
     "<code>SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string</code> va "
     "<code>DATABASE_URL: postgres://localhost:5432/labcore</code> — bu manzil "
     "<code>.env</code> dagi emas, sukut bo'yicha qiymat.",
     "<code>.env</code> faylini ataylab faqat administratorlar o'qiy oladi — unda baza paroli "
     "turadi (tibbiy ma'lumot himoyasi). Tekshiruv skripti esa oddiy huquq bilan ochilgan edi: "
     "fayl ko'rinmadi, vazifa ko'rinmadi, node parolni ololmadi. Server buzuq emas edi — "
     "huquq yetmagan.",
     "<code>TUZAT.bat</code> va <code>TEKSHIR.bat</code> administrator huquqini "
     "<strong>o'zi so'raydi</strong> (Windows tasdiq oynasi). <code>TUZAT.bat</code> "
     "fayllarni almashtirgach serverni ham qayta ishga tushiradi.",
     "<code>tests/scripts.test.js</code> — ikkala skriptda huquq tekshiruvi borligini talab qiladi."),

    ("Oyna ochilib, darrov yopilib ketardi", "3.5-nashr", "CRLF",
     "<code>.bat</code> faylni bosasiz, qora oyna bir lahza ko'rinadi va yo'qoladi. Nima "
     "yozilganini o'qishga ulgurmaysiz.",
     "<code>.bat</code> fayllar Linux'da yasalgani uchun qator tugashi <code>\\n</code> edi. "
     "<code>cmd.exe</code> esa <code>\\r\\n</code> kutadi va faylni buzib o'qiydi — "
     "<code>pause</code> ga yetmasdan chiqib ketadi.",
     "Barcha <code>.bat</code> fayllar CRLF ga o'girildi, ishga tushirgichlar 5 qatorga "
     "qisqartirildi va <code>.ps1</code> skriptlarning o'zi Enter kutadigan bo'ldi.",
     "<code>tests/scripts.test.js</code> — har bir <code>.bat</code> faylda CRLF borligini tekshiradi."),

    ("O'rnatish 3/8-qadamda to'xtardi", "3.1-nashr", "ruscha Windows",
     "<code>Exception calling \"AddAccessRule\"</code> / "
     "<code>IdentityNotMappedException: Some or all identity references could not be translated</code>",
     "<code>.env</code> fayl huquqlari inglizcha <code>Administrators</code> va "
     "<code>SYSTEM</code> nomlari bilan qo'yilgan edi. Ruscha (yoki boshqa tildagi) Windows'da "
     "bunday nomdagi hisob yo'q.",
     "Nom o'rniga SID ishlatiladi: <code>S-1-5-32-544</code> (administratorlar) va "
     "<code>S-1-5-18</code> (tizim). Huquq qo'yib bo'lmasa ham o'rnatish to'xtamaydi.",
     "<code>tests/scripts.test.js</code> — skriptda hisob nomlari emas, SID ishlatilishini talab qiladi."),

    ("HTTPS yasalmasdi: \"openssl topilmadi\"", "3.2-nashr", "sertifikat",
     "O'rnatish tugaydi, lekin dastur ulanmaydi: <code>ECONNREFUSED</code>. Sababi — server "
     "HTTPS'siz qolgan, dastur esa <code>https://</code> manziliga uringan.",
     "O'rnatuvchi Windows yasagan sertifikatni PEM formatiga o'girish uchun "
     "<code>openssl</code> ni qidirardi — u Windows'da odatda o'rnatilmagan.",
     "Windows beradigan <strong>PFX</strong> sertifikati to'g'ridan-to'g'ri ishlatiladi, "
     "<code>openssl</code> umuman kerak emas. Sertifikat buzuq bo'lsa server HTTP rejimida "
     "ishlashda davom etadi — laboratoriya to'xtab qolmaydi.",
     "<code>tests/scripts.test.js</code> + <code>src/index.js</code> da PFX birinchi tekshiriladi."),

    ("Noto'g'ri parol kiritilsa ham \"OK\" chiqardi", "3.3-nashr", "yutilgan xato",
     "O'rnatish muvaffaqiyatli ko'rinadi, keyin migratsiya paytida tushunarsiz xato chiqadi.",
     "PowerShell tashqi buyruq (<code>psql</code>) xato qaytarsa o'zi to'xtamaydi — "
     "<code>$LASTEXITCODE</code> ni qo'lda tekshirish kerak. Bir joyda bu unutilgan edi: "
     "<code>postgres</code> paroli noto'g'ri bo'lsa ham skript davom etardi, baza va "
     "foydalanuvchi esa yaratilmasdi.",
     "Parol <strong>oldindan</strong> tekshiriladi va noto'g'ri bo'lsa 3 marta qayta so'raladi. "
     "Har bir tashqi buyruq natijasi ko'riladi. Oxirida <code>/api/health</code> orqali "
     "server haqiqatan javob berayotgani tasdiqlanadi.",
     "<code>tests/scripts.test.js</code> — <code>$LASTEXITCODE</code> tekshiruvi va parolning "
     "oldindan sinalishini talab qiladi."),

    ("psql \"Permission denied (10013)\" berardi", "3.3-nashr", "IPv6",
     "<code>could not connect to server: Permission denied (0x0000274D/10013)</code> — "
     "<code>::1</code> manziliga urinish.",
     "<code>localhost</code> Windows'da avval IPv6 (<code>::1</code>) ga hal qilinadi. "
     "Brandmauer yoki antivirus uni bloklasa, ulanish umuman bo'lmaydi.",
     "<code>psql</code> aniq <code>127.0.0.1</code> ga ulanadi.",
     "<code>tests/scripts.test.js</code> — skriptda <code>-h 127.0.0.1</code> borligini tekshiradi."),

    ("HOLAT.bat PowerShell'da yiqilardi", "3.4-nashr", "PS 5.1",
     "<code>A parameter cannot be found that matches parameter name 'SkipCertificateCheck'</code>",
     "<code>-SkipCertificateCheck</code> faqat PowerShell 7 da bor. Windows 10/11 da esa "
     "PowerShell <strong>5.1</strong> o'rnatilgan bo'ladi.",
     "Skript PowerShell 5.1 uchun qayta yozildi: o'z-o'zini imzolagan sertifikat "
     "<code>ICertificatePolicy</code> orqali qabul qilinadi.",
     "<code>tests/scripts.test.js</code> — skriptlarda PowerShell 7 ga xos parametrlar "
     "ishlatilmasligini tekshiradi."),

    ("Skriptlar \"Unexpected token\" deb qizarardi", "2-nashr", "kodlash",
     "Har bir <code>.ps1</code> faylni ishga tushirganda o'nlab qizil sintaksis xatolari.",
     "Windows PowerShell 5.1 <code>.ps1</code> faylni <strong>ANSI</strong> deb o'qiydi. "
     "Skriptlardagi o'zbekcha apostrof va tirelar buzilib, sintaksisni sindirardi.",
     "Barcha PowerShell skriptlari faqat ASCII belgilardan iborat qilib qayta yozildi.",
     "<code>tests/scripts.test.js</code> — har bir <code>.ps1</code> faylni bayt-bayt tekshiradi: "
     "127 dan katta bayt bo'lsa test yiqiladi."),

    ("Server xatosi hech qayerda ko'rinmasdi", "3.4-nashr", "diagnostika",
     "Server ishlamayapti, lekin nima uchun ishlamayotganini bilishning iloji yo'q — "
     "vazifa sifatida ishlaganda ekran bo'lmaydi.",
     "Rejalashtirilgan vazifa <code>node.exe</code> ni to'g'ridan-to'g'ri chaqirardi va "
     "chiqishni hech qayerga yozmasdi.",
     "Vazifa endi <code>cmd</code> orqali ishga tushadi va butun chiqishni "
     "<code>logs\\server.log</code> ga yozadi. <code>TEKSHIR.bat</code> qo'shildi: u fayllarni, "
     "vazifani, portni, HTTP va HTTPS javobini, tarmoq manzillarini, qulash tarixini "
     "ko'rsatadi va kerak bo'lsa serverni o'zi sinab ishga tushirib xatoni ekranga chiqaradi.",
     "<code>tests/scripts.test.js</code> — vazifa jurnal yozishini va tekshiruv skripti "
     "jurnalni ko'rsatishini talab qiladi."),

    ("Navbat testlari kechqurun yiqilardi", "—", "vaqt",
     "Soat 23:00 dan keyin testlar sababsiz qizarardi.",
     "Navbat vaqtlari ish vaqti tugagach keyingi ish kuniga siljiydi — test esa buni "
     "hisobga olmagan edi.",
     "Test kunning istalgan soatida to'g'ri ishlaydigan qilib tuzatildi.",
     "<code>tests/appointments.test.js</code>"),
]


def bug_html(n, b):
    title, nashr, chip, belgi, sabab, yechim, himoya = b
    return f"""
      <div class="bug fixed">
        <h4><span class="no">{n:02d}</span> {title} <span class="chip amber">{chip}</span></h4>
        <dl>
          <dt>Belgisi</dt><dd>{belgi}</dd>
          <dt>Sabab</dt><dd>{sabab}</dd>
          <dt>Yechim</dt><dd>{yechim}</dd>
          <dt>Himoya</dt><dd>{himoya}</dd>
        </dl>
      </div>"""


S_BUGS = """
  <section id="tuzatishlar">
    <div class="sec-head"><span class="sec-mark">K</span><h2>Tuzatishlar tarixi</h2></div>
    <div class="col">
      <p class="sec-lede">
        O'rnatish paytida chiqqan har bir xato shu yerda yozilgan: <strong>nima ko'rindi</strong>,
        <strong>haqiqiy sababi nima edi</strong>, <strong>qanday tuzatildi</strong> va
        <strong>qaytib kelmasligi uchun qanday test qo'yildi</strong>.
      </p>
      <p>
        Oxirgi ustun eng muhimi. Har bir xato uchun avtomatik test yozilgan — ya'ni bu
        xatolarning birortasi ham <strong>sezdirmasdan qaytib kela olmaydi</strong>. Testlar
        har safar kod o'zgarganda ishga tushadi.
      </p>
    </div>
""" + '\n'.join(bug_html(i + 1, b) for i, b in enumerate(BUGS)) + """

    <div class="col">
      <h3>Nega bularning hammasi faqat Windows'da chiqdi</h3>
      <p>
        Tizim Linux'da yozilgan va u yerda birinchi kundan ishlagan. Yuqoridagi xatolarning
        deyarli barchasi <strong>Windows'ga xos</strong>: yo'l ko'rinishi
        (<code>C:\\</code> va <code>/</code>), qator tugashi (<code>\\r\\n</code>), fayl kodlashi
        (ANSI), hisob nomlarining tarjimasi, PowerShell'ning eski nusxasi,
        <code>openssl</code> ning yo'qligi, IPv6 bloklanishi. Ularning har biri alohida
        "kichik farq", lekin birgalikda o'rnatishni to'xtatib qo'yadi.
      </p>
      <p>
        Endi bularning hammasi test bilan qoplangan: skriptlarni tekshiradigan
        <code>tests/scripts.test.js</code> Linux'da ishlasa ham, aynan Windows'da
        buziladigan narsalarni qidiradi.
      </p>
    </div>
  </section>
"""

# ===========================================================================
#  L. TEXNIK MA'LUMOT
# ===========================================================================
S_TEXNIK = """
  <section id="texnik">
    <div class="sec-head"><span class="sec-mark">L</span><h2>Texnik ma'lumot</h2></div>
    <div class="col">
      <p class="sec-lede">
        Bu bo'lim laboratoriyani boshqarish uchun kerak emas. U kelajakda tizimni boshqa
        dasturchiga topshirsangiz yoki o'zingiz nimadir qo'shmoqchi bo'lsangiz kerak bo'ladi.
      </p>
      <h3>Nimadan qurilgan</h3>
    </div>
    <div class="tablewrap">
      <table class="kv">
        <tbody>
          <tr><td>Server</td><td>Node.js 22 (LTS) + Express 5, ES modullari</td></tr>
          <tr><td>Baza</td><td>PostgreSQL 16 yoki undan yangi, <code>pg</code> kutubxonasi</td></tr>
          <tr><td>Interfeys</td><td>Toza JavaScript (ES modul), hash-router, ramka ishlatilmagan</td></tr>
          <tr><td>Telefon</td><td>PWA — brauzerdan bosh ekranga qo'shiladi, ilova do'koni kerak emas</td></tr>
          <tr><td>Ish stansiyasi</td><td>Electron 33 (<code>LabCore-DASTUR.exe</code>, o'rnatish shart emas)</td></tr>
          <tr><td>Kirish</td><td>bcrypt parol + JWT + serverdagi sessiya jadvali; TOTP (ikki bosqichli); PIN kod</td></tr>
          <tr><td>Testlar</td><td><code>node --test</code>, 108 ta test, haqiqiy PostgreSQL ustida</td></tr>
          <tr><td>Hajmi</td><td>~13 700 satr (server, interfeys, testlar, skriptlar)</td></tr>
        </tbody>
      </table>
    </div>

    <div class="col">
      <h3>Fayllar qayerda turadi</h3>
    </div>
    <div class="tree"><b>C:\\LabCore\\</b>
  <b>src\\</b>              <i>server kodi</i>
    index.js         <i>kirish nuqtasi, HTTPS/HTTP, qulash jurnali</i>
    config.js        <i>barcha sozlamalar bir joyda</i>
    db.js            <i>baza ulanishlari hovuzi</i>
    <b>routes\\</b>         <i>16 ta fayl, 111 ta manzil (API)</i>
    <b>services\\</b>       <i>uskunalar, kameralar, navbat, xabarnomalar</i>
    <b>lib\\</b>            <i>audit, kirish, siyosat, shifrlash, TOTP</i>
  <b>public\\</b>           <i>brauzer va telefon interfeysi</i>
  <b>db\\</b>schema.sql    <i>25 ta jadval, indekslar, himoya qoidalari</i>
  <b>deploy\\windows\\</b>  <i>o'rnatish, tekshirish, zaxira, avtozapusk skriptlari</i>
  <b>data\\</b>             <i>bemor fayllari, xodim rasmlari</i>
  <b>logs\\</b>server.log  <i>server jurnali (vaqt bilan)</i>
  <b>backups\\</b>          <i>har kuni 01:30 da olinadigan zaxira</i>
  .env             <i>parollar — faqat administratorlar o'qiy oladi</i>
</div>

    <div class="col">
      <h3>Baza jadvallari</h3>
      <p>
        25 ta jadval. Eng muhimlari: <code>patients</code> (bemorlar),
        <code>visits</code> (tashriflar), <code>orders</code> va <code>order_items</code>
        (buyurtmalar), <code>results</code> (natijalar), <code>payments</code> (to'lovlar),
        <code>audit_log</code> (o'zgartirib bo'lmaydigan jurnal), <code>users</code> va
        <code>sessions</code> (xodimlar va kirishlar), <code>appointments</code> (navbat),
        <code>devices</code> (uskunalar), <code>cameras</code> (kameralar),
        <code>inventory_items</code> (ombor).
      </p>
      <p>
        Sxema <strong>bir necha marta ishga tushirilsa ham buzilmaydi</strong>: yangi ustunlar
        <code>ADD COLUMN IF NOT EXISTS</code> bilan qo'shiladi. Shuning uchun yangilash
        skripti bazani xavfsiz yangilaydi.
      </p>
    </div>

    <div class="col">
      <h3>Foydali buyruqlar</h3>
    </div>
    <div class="console"><span class="d"># holat</span>
<span class="c">powershell</span> -ExecutionPolicy Bypass -File deploy\\windows\\status.ps1
<span class="d"># to'liq tekshiruv (nima uchun ulanmayapti)</span>
TEKSHIR.bat
<span class="d"># zaxira nusxa olish</span>
<span class="c">powershell</span> -ExecutionPolicy Bypass -File deploy\\windows\\backup.ps1
<span class="d"># avtozapusk: yoqish / o'chirish / holati</span>
<span class="c">powershell</span> -ExecutionPolicy Bypass -File deploy\\windows\\avtozapusk.ps1
<span class="c">powershell</span> -ExecutionPolicy Bypass -File deploy\\windows\\avtozapusk.ps1 -Off
<span class="c">powershell</span> -ExecutionPolicy Bypass -File deploy\\windows\\avtozapusk.ps1 -Status
<span class="d"># jurnalning oxirgi 30 satri</span>
<span class="c">powershell</span> -Command "Get-Content C:\\LabCore\\logs\\server.log -Tail 30"
<span class="d"># qulash sabablari</span>
<span class="c">powershell</span> -Command "Select-String C:\\LabCore\\logs\\server.log -Pattern QULASH"
</div>

    <div class="col">
      <h3>Xavfsizlik</h3>
    </div>
    <ul class="legend">
      <li><span class="n">1</span><span><b>Audit jurnali o'zgarmas.</b> Yozuvni tahrirlash va
        o'chirish bazaning o'zida taqiqlangan — administrator ham o'chira olmaydi.</span></li>
      <li><span class="n">2</span><span><b>Parollar bcrypt bilan saqlanadi.</b> Bazani ko'rgan
        odam ham parolni bilib ololmaydi. PIN kodlar ham xuddi shunday.</span></li>
      <li><span class="n">3</span><span><b>Sessiya serverda turadi.</b> Xodimni chiqarib
        yuborsangiz uning kaliti darrov ishlamay qoladi.</span></li>
      <li><span class="n">4</span><span><b>PIN kod cheklangan.</b> Ketma-ket (1234) va bir xil
        (1111) raqamlar qabul qilinmaydi; ketma-ket noto'g'ri urinishdan keyin PIN vaqtincha
        bloklanadi va parol bilan kirish talab qilinadi.</span></li>
      <li><span class="n">5</span><span><b>Kirishga urinish cheklangan.</b> Bitta manzildan
        ketma-ket ko'p urinish bo'lsa, keyingilari rad etiladi.</span></li>
      <li><span class="n">6</span><span><b>Parollar fayli yopiq.</b> <code>.env</code> ni faqat
        administratorlar o'qiy oladi (aynan shu bir vaqtlar diagnostikani chalg'itgan edi).</span></li>
      <li><span class="n">7</span><span><b>Tarmoqda HTTPS.</b> Bemor ma'lumoti Wi-Fi orqali
        ochiq ketmaydi.</span></li>
      <li><span class="n">8</span><span><b>Bulutga zaxira — shifrlangan.</b> Shifrlash paroli
        berilmagan bo'lsa, tizim tibbiy ma'lumotni bulutga umuman yubormaydi.</span></li>
    </ul>
  </section>
"""

# ===========================================================================
#  M. TEZKOR MA'LUMOTNOMA
# ===========================================================================
S_TEZ = """
  <section id="tez">
    <div class="sec-head"><span class="sec-mark">M</span><h2>Tezkor ma'lumotnoma</h2></div>
    <div class="col">
      <p class="sec-lede">Bir sahifada eng kerakli narsalar.</p>
      <h3>Qaysi faylni qachon yuklaysiz</h3>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Fayl</th><th>Hajmi</th><th>Qachon kerak</th></tr></thead>
        <tbody>
          <tr><td><code>LabCore-toliq.zip</code></td><td class="num">78 MB</td>
              <td>Birinchi marta o'rnatishda. Ichida hamma narsa bor.</td></tr>
          <tr><td><code>LabCore-TUZATISH.zip</code></td><td class="num">390 KB</td>
              <td>Muammo chiqqanda. Server fayllarini almashtiradi va qayta ishga tushiradi.</td></tr>
          <tr><td><code>LabCore-YANGILASH.zip</code></td><td class="num">2.9 MB</td>
              <td>Allaqachon o'rnatilgan bo'lsa — yangi imkoniyatlarni qo'shish uchun.</td></tr>
          <tr><td><code>LabCore-DASTUR.exe</code></td><td class="num">71 MB</td>
              <td>Har bir xodim kompyuteriga. O'rnatish shart emas, shundoq ishlaydi.</td></tr>
        </tbody>
      </table>
    </div>
    <div class="col">
      <p class="hash">Hammasi shu yerda:
      github.com/unutilmastam/unutilmastam/tree/yuklab-olish</p>
    </div>

    <div class="col">
      <h3>Ish stolidagi va arxivdagi tugmalar</h3>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Fayl</th><th>Nima qiladi</th></tr></thead>
        <tbody>
          <tr><td><code>ORNATISH.bat</code></td><td>Tizimni o'rnatadi (o'ng tugma &rarr; Run as administrator)</td></tr>
          <tr><td><code>TEKSHIR.bat</code></td><td>Nima uchun ishlamayotganini topadi va manzilni aytadi</td></tr>
          <tr><td><code>TUZAT.bat</code></td><td>Yangi fayllarni qo'yadi, serverni qayta ishga tushiradi va 30 soniya kuzatadi</td></tr>
          <tr><td><code>HOLAT.bat</code></td><td>Server ishlayaptimi — qisqa javob</td></tr>
          <tr><td><code>TELEFONGA-ULASH.bat</code></td><td>Telefon uchun QR kod sahifasini ochadi</td></tr>
        </tbody>
      </table>
    </div>

    <div class="col">
      <h3>Muammo chiqsa — nima qilish</h3>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Ekranda</th><th>Ma'nosi</th><th>Nima qilasiz</th></tr></thead>
        <tbody>
          <tr><td>Server bir ishlab, bir o'chyapti</td><td>Bo'sh baza ulanishi uzilgan (eski nashr)</td>
              <td><code>LabCore-TUZATISH.zip</code> (4-nashr) &rarr; <code>TUZAT.bat</code></td></tr>
          <tr><td>Ulanib bo'lmadi: server javob bermadi</td><td>Manzil noto'g'ri yoki server o'chgan</td>
              <td><code>TEKSHIR.bat</code> — u to'g'ri manzilni aytadi</td></tr>
          <tr><td><code>ECONNREFUSED</code></td><td>Port yopiq yoki HTTPS o'rniga HTTP kerak</td>
              <td><code>TEKSHIR.bat</code> — manzil <code>http</code> yoki <code>https</code> ekanini ko'rsatadi</td></tr>
          <tr><td>Node.js topilmadi</td><td>1-qadam bajarilmagan yoki qayta yoqilmagan</td>
              <td>Node.js MSI ni o'rnating va kompyuterni qayta yoqing</td></tr>
          <tr><td>PostgreSQL topilmadi</td><td>2-qadam bajarilmagan yoki qayta yoqilmagan</td>
              <td>PostgreSQL ni o'rnating va kompyuterni qayta yoqing</td></tr>
          <tr><td>Unable to resolve remote name</td><td>Internetga chiqmoqchi bo'lgan buyruq</td>
              <td>Chocolatey kerak emas — uchta fayl yetarli</td></tr>
          <tr><td>Unexpected token (qizil)</td><td>Eski nashr</td><td>Yangi arxivni yuklab oling</td></tr>
          <tr><td>Oyna ochilib yopilib ketyapti</td><td>Eski nashr (CRLF muammosi)</td>
              <td>Yangi arxivni yuklab oling</td></tr>
          <tr><td>Xodim PIN'ini unutdi</td><td>—</td><td>Xodimlar &rarr; "PIN qo'yish" &rarr; yangisini bering</td></tr>
          <tr><td>Svet o'chdi</td><td>—</td><td>Svet kelgach server o'zi ishga tushadi</td></tr>
        </tbody>
      </table>
    </div>

    <div class="note warn">
      <b>Birinchi kirish ma'lumotlari</b>
      login: <code>admin</code> &nbsp;&middot;&nbsp; parol: <code>Admin12345</code> &nbsp;&middot;&nbsp;
      port: <code>4000</code><br>
      <strong>Birinchi ish — parolni almashtirish.</strong> Bu parol hamma bilgan parol.
    </div>

    <div class="col">
      <h3>Birinchi hafta uchun ro'yxat</h3>
    </div>
    <ul class="legend">
      <li><span class="n">1</span><span>Admin parolini almashtiring</span></li>
      <li><span class="n">2</span><span>Har bir xodimga <b>alohida</b> hisob oching — umumiy hisob
        ishlatilsa audit jurnalining ma'nosi qolmaydi</span></li>
      <li><span class="n">3</span><span>Xodim rasmlarini qo'ying va PIN kod bering</span></li>
      <li><span class="n">4</span><span>Analiz katalogini o'zingizning narxlaringiz va norma
        chegaralaringiz bilan to'ldiring</span></li>
      <li><span class="n">5</span><span>Ish vaqtini va laboratoriya nomini sozlang</span></li>
      <li><span class="n">6</span><span>Zaxira papkasini tashqi diskka yo'naltiring</span></li>
      <li><span class="n">7</span><span>Telefonga rahbar panelini o'rnating</span></li>
      <li><span class="n">8</span><span>Bir hafta o'tgach audit jurnaliga qarang — hammasi
        yozilayotganiga ishonch hosil qiling</span></li>
    </ul>
  </section>
"""

# ===========================================================================
#  HERO + NAV + TOC
# ===========================================================================
HEADER = """
<header class="topbar">
  <div class="wrap">
    <div class="brandmark"><b>LabCore</b><span>To'liq hujjat</span></div>
    <nav class="navlinks">
      <a href="#tizim">Tizim</a>
      <a href="#internetsiz">Internetsiz</a>
      <a href="#ornatish">O'rnatish</a>
      <a href="#kundalik">Kundalik ish</a>
      <a href="#nazorat">Nazorat</a>
      <a href="#yangi">Rasm va PIN</a>
      <a href="#tuzatishlar">Tuzatishlar</a>
      <a href="#texnik">Texnik</a>
      <a href="#tez">Ma'lumotnoma</a>
    </nav>
  </div>
</header>

<div class="wrap">

  <div class="hero">
    <p class="eyebrow">Laboratoriya boshqaruv tizimi &middot; 4-nashr &middot; bitta faylda hammasi</p>
    <h1>LabCore — to'liq hujjat</h1>
    <p class="lede">
      Bu bitta faylda <strong>hamma narsa</strong> bor: tizim nima qila olishi, internetsiz
      qanday o'rnatilishi, har bir oynaning nima uchun kerakligi, xodim rasmi va PIN kod,
      o'rnatish paytida chiqqan <strong>har bir xatoning sababi va yechimi</strong>, hamda
      texnik ma'lumot. Barcha rasmlar — ishlab turgan tizimning haqiqiy ekranlari.
    </p>
    <dl class="facts">
      <div class="fact"><dt>Bo'limlar</dt><dd>13 ta</dd><p>O'rnatishdan texnik ma'lumotgacha</p></div>
      <div class="fact"><dt>Ekran rasmlari</dt><dd>44 ta</dd><p>Haqiqiy tizimdan olingan</p></div>
      <div class="fact"><dt>Tuzatilgan xatolar</dt><dd>12 ta</dd><p>Har biri test bilan qoplangan</p></div>
      <div class="fact"><dt>Internet</dt><dd>Shart emas</dd><p>Butun tizim mahalliy Wi-Fi'da</p></div>
    </dl>
  </div>

  <div class="toc">
    <h4>Ichida nima bor</h4>
    <ol>
      <li><a href="#tizim">Tizim nima qila oladi<span>Bo'limlar ro'yxati va imkoniyatlar</span></a></li>
      <li><a href="#boshlash">Boshlashdan oldin<span>Nima kerak, qanday kompyuter</span></a></li>
      <li><a href="#internetsiz">Internetsiz o'rnatish<span>Fleshka orqali, uchta fayl</span></a></li>
      <li><a href="#ornatish">O'rnatish — sakkiz qadam<span>Boshidan oxirigacha, rasmlar bilan</span></a></li>
      <li><a href="#oyna">Ochiladigan oyna<span>Qayerda nima turadi, rol bo'yicha</span></a></li>
      <li><a href="#kundalik">Kundalik ish<span>Bemor yo'li: navbatdan chekgacha</span></a></li>
      <li><a href="#nazorat">Rahbar nazorati<span>Audit, ish nazorati, kameralar, telefon</span></a></li>
      <li><a href="#sozlash">Qo'shimcha sozlashlar<span>Uskunalar, ombor, sozlamalar</span></a></li>
      <li><a href="#yangi">Xodim rasmi, PIN va avtozapusk<span>Oxirgi qo'shilgan imkoniyatlar</span></a></li>
      <li><a href="#xizmat">Har kungi xizmat<span>Zaxira, tiklash, tez-tez uchraydigan holatlar</span></a></li>
      <li><a href="#tuzatishlar">Tuzatishlar tarixi<span>Har bir xato: sabab, yechim, test</span></a></li>
      <li><a href="#texnik">Texnik ma'lumot<span>Tuzilishi, fayllar, buyruqlar, xavfsizlik</span></a></li>
      <li><a href="#tez">Tezkor ma'lumotnoma<span>Bir sahifada eng kerakli narsalar</span></a></li>
    </ol>
  </div>
"""

FOOTER = """
  <footer>
    <p>
      <strong>LabCore, 4-nashr.</strong> Hujjatdagi barcha ekran rasmlari ishlab turgan tizimdan
      olingan; namuna sifatida "Shifo Lab" nomli laboratoriya ma'lumotlari ishlatilgan. Windows
      o'rnatuvchisining qora oynasidagi matn — skript chiqaradigan haqiqiy yozuvlar; sizdagi
      manzil va versiya raqamlari boshqacha bo'ladi.
    </p>
    <p>
      Tayyor to'plamlar: <span class="hash">github.com/unutilmastam/unutilmastam/tree/yuklab-olish</span><br>
      Kod: <span class="hash">github.com/unutilmastam/unutilmastam</span>, shoxobcha
      <code>claude/lab-management-system-ipsi88</code>
    </p>
    <p>
      Arxiv ichidagi qo'shimcha hujjatlar: <code>server\\docs\\ornatish.md</code>,
      <code>uskuna-ulash.md</code>, <code>kamera-ulash.md</code>.
    </p>
  </footer>
</div>
"""

# ===========================================================================
#  YIG'AMIZ
# ===========================================================================
parts = [
    HEADER,
    S_TIZIM,
    remark(SEC['boshlash'], 'B'),
    S_OFFLINE,
    remark(SEC['ornatish'], 'D'),
    remark(SEC['oyna'], 'E'),
    remark(SEC['kundalik'], 'F'),
    remark(SEC['nazorat'], 'G'),
    remark(SEC['sozlash'], 'H'),
    remark(SEC['yangi'], 'I'),
    remark(SEC['xizmat'], 'J'),
    S_BUGS,
    S_TEXNIK,
    S_TEZ,
    FOOTER,
]

doc = (
    '<!doctype html>\n<html lang="uz">\n<head>\n'
    '<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    "<title>LabCore — to'liq hujjat (4-nashr)</title>\n"
    '<style>\n' + css + EXTRA_CSS + '\n</style>\n'
    '</head>\n<body>\n'
    + ''.join(parts) +
    '\n</body>\n</html>\n'
)

OUT.write_text(doc, encoding='utf-8')
print(f'{OUT}: {len(doc):,} bayt')
