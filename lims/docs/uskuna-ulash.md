# Analizatorni tizimga ulash — qadamma-qadam

Bu ish **keyinchalik**, uskuna olingandan keyin bajariladi. Tizimni qayta
o'rnatish, kod yozish yoki bazani o'zgartirish shart emas — hammasi admin
panelidan qilinadi va boshqa uskunalarning ishi to'xtamaydi.

Uskuna ulanmaguncha laborant natijani qo'lda kiritadi — bu to'liq ishlaydi.

---

## 1. Uskuna sotib olishda nima so'rash kerak

Sotuvchidan yoki texnik xizmatdan aniqlang:

1. **"LIS interfeysi bormi?"** — laboratoriya axborot tizimiga ulanish imkoni.
   Deyarli barcha zamonaviy analizatorlarda bor, lekin ba'zan alohida
   litsenziya/kabel sifatida sotiladi.
2. **Qaysi protokol?** — `HL7 v2`, `ASTM E1394` yoki `CSV/TXT faylga yozish`.
3. **Qanday ulanadi?** — tarmoq (LAN/Ethernet) yoki COM-port (RS-232).
   Tarmoq afzal. COM-port bo'lsa "Serial→Ethernet" konverteri kerak bo'ladi
   (Moxa NPort va shunga o'xshash), yoki uskuna papkaga fayl yozadigan
   rejimga o'tkaziladi.
4. **Uskuna qanday kod yuboradi?** — `HGB` mi, `HB-01` mi. Namuna xabarni
   so'rang (bir varaq matn) — sozlash shu bilan bir necha daqiqada bo'ladi.
5. **Qaysi birlikda beradi?** — masalan gemoglobin `g/dL` yoki `g/L`.

---

## 2. Tarmoq sozlamasi

Uskunaning "LIS / Host" sozlamalarida:

```
Host IP   : 192.168.1.10      ← laboratoriya serverining manzili
Port      : 5100              ← siz tanlagan bo'sh port
Protokol  : HL7 (yoki ASTM)
```

Serverda o'sha port ochiq bo'lsin:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 5100 proto tcp
```

> Uskuna portini **faqat lokal tarmoqqa** oching — internetga chiqarmang.

---

## 3. Tizimga qo'shish

**Boshqaruv → Uskunalar → + Uskuna qo'shish**

| Maydon | Nima yoziladi |
|---|---|
| Nomi | `Mindray BC-20` (auditda shu nom ko'rinadi) |
| Ulanish turi | `HL7 (TCP)` / `ASTM (TCP)` / `Papka` / `HTTP` |
| Tinglash manzili | `0.0.0.0` (barcha tarmoq kartalari) |
| Port | `5100` |

Papka rejimida esa uskuna yozadigan papkani ko'rsatasiz, masalan
`/var/lib/labcore/analizator` yoki Windows'dagi umumiy papka.

Qo'shilishi bilan tinglovchi darhol ishga tushadi — serverni qayta ishga
tushirish kerak emas.

---

## 4. Kodlarni bog'lash

Uskuna kodi katalog kodi bilan bir xil bo'lsa (`HGB` → `HGB`) — hech narsa
qilish shart emas, avtomatik topiladi.

Farq qilsa: **Kodlar** tugmasi → uskuna kodini katalogdagi analizga bog'lang.

Birlik farq qilsa koeffitsiyent bering:

| Uskuna beradi | Katalogda | Koeffitsiyent |
|---|---|---|
| `13.1 g/dL` | `g/L` | `10` |
| `131 g/L` | `g/L` | `1` |

---

## 5. Sinash (ulashdan oldin ham mumkin)

**Sinov** tugmasi → uskuna yuboradigan xabarni qo'lda kiriting:

```
<probirka-shtrix-kodi>,HGB,131,g/L
```

yoki to'liq HL7 xabarini joylashtiring. Natija haqiqiy buyurtmaga tushadi va
qaysi analizga bog'langani ko'rinadi. Xato bo'lsa sabab yoziladi
("mos analiz topilmadi", "natija allaqachon kiritilgan").

Uskuna ulangandan keyin **Xabarlar** tugmasi orqali undan kelgan xom
xabarlarni ko'rish mumkin — nosozlikni topishning eng tez yo'li.

---

## 6. Kundalik ish qanday ketadi

```
Laborant probirkaga shtrix-kod yopishtiradi
        ↓
Analizator tahlil qiladi va natijani yuboradi
        ↓
Tizim shtrix-kod bo'yicha buyurtmani topadi, normaga solishtiradi
        ↓
Natija laborant ekranida "uskunadan keldi" belgisi bilan turadi
        ↓
Laborant ko'rib tasdiqlaydi  →  bemorga chiqadi
```

Kafolatlar:

* Uskuna natijasi **o'z-o'zidan tasdiqlanmaydi** — odam tasdiqlaydi.
* Uskuna **odam kiritgan qiymatni bosib ketmaydi**.
* Har bir xom xabar saqlanadi va auditda `Uskuna: <nomi>` bo'lib ko'rinadi.

---

## 7. Rentgen va UTT (ultratovush)

Bu qurilmalar **DICOM** protokolida ishlaydi va raqam emas, tasvir yuboradi —
yuqoridagi ulanish ularga to'g'ri kelmaydi. Hozircha rentgen/UTT tasviri va
shifokor xulosasi bemor kartasiga **fayl sifatida** yuklanadi
(`Bemor kartasi → Fayllar`), yillar bo'yicha papkalarga tushadi va SHA-256
bilan himoyalanadi.

To'liq DICOM/PACS ulanishi kerak bo'lsa — qurilma modeli va DICOM sozlamalari
(AE Title, port) aniq bo'lgach alohida qo'shiladi.
