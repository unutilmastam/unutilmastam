# BRILIANT — universal kamera platformasi

Turli ishlab chiqaruvchilarning IP kameralarini bitta akkaunt orqali ulash,
koʻrish va boshqarish uchun **mobil ilova (Android)** va **PWA (iPhone/desktop)**.

| Nima | Qayerda |
|---|---|
| PWA (mijoz ilovasi) | [`/cctv`](../cctv) → `https://unutilmastam.uz/cctv/` |
| Android ilova (WebView + ONVIF koʻprigi) | [`/android`](../android) |
| Backend API shartnomasi | [`CCTV-API.md`](CCTV-API.md) |
| APK yigʻish (CI) | [`.github/workflows/android.yml`](../.github/workflows/android.yml) |

> Saytning ildizi (`unutilmastam.uz`) — boshqa ilova ("Unutilmas Ta'm").
> CCTV ilovasi `/cctv/` ostida, oʻz manifesti va Service Worker'i bilan alohida ishlaydi.

---

## 1. Ishga tushirish

### iPhone / iPad (PWA)

1. Safari'da `https://unutilmastam.uz/cctv/` ni oching.
2. **Ulashish → Home Screen'ga qoʻshish**.
3. Ilovani ekrandan oching — u toʻliq ekranda, alohida ilova sifatida ishlaydi.

Push bildirishnoma iOS 16.4+ da, faqat Home Screen'ga qoʻshilgan holatda ishlaydi.

### Android

- Ilova (APK): CI artefaktidan yoki `./gradlew assembleRelease` orqali.
- Yoki Chrome'da saytni ochib "Ilovani oʻrnatish" taklifini tasdiqlang.

### Lokal ishga tushirish

```bash
npx http-server -p 8080 -c-1
# → http://localhost:8080/cctv/
```

Kirish sahifasida **"Demo rejimda koʻrish"** tugmasi — serversiz, qurilmada
sintez qilinadigan kamera oqimlari bilan butun ilovani sinab koʻrish mumkin.

---

## 2. Ilova tuzilishi

```
cctv/
  index.html            ilova qobigʻi
  css/app.css           dizayn tizimi (tungi/kunduzgi mavzu)
  js/app.js             yadro: router, navigatsiya, SW, native koʻprik
  js/ui.js              komponentlar: ikonka, sheet, toast, router
  js/store.js           holat, lokal saqlash, demo maʼlumot, rollar, tariflar
  js/api.js             REST + WebSocket adapteri (JWT + refresh)
  js/brands.js          brendlar, RTSP shablonlari, ONVIF discovery, QR parser
  js/player.js          WebRTC(WHEP) / HLS / MJPEG pleyer + demo generator, yozib olish, talkback
  js/screens.js         auth, dashboard, kameralar, kamera qoʻshish, tafsilotlar, ulashish
  js/live.js            jonli koʻrish, multi-ekran, PTZ, arxiv, hodisalar, xarita
  js/settings.js        sozlamalar, akkaunt, xavfsizlik, obuna, yordam
  js/admin.js           admin panel (13 boʻlim)
  sw.js                 offline kesh + Web Push
  manifest.webmanifest  PWA manifesti, shortcuts
  icons/                ilova ikonkalari
```

Kutubxonasiz, toza ES-modullar. Yagona tashqi bogʻliqlik — HLS uchun
`hls.js` (faqat kerak boʻlganda CDN'dan yuklanadi) va xarita uchun Yandex Maps.

---

## 3. Kamera ulash usullari

| Usul | Qanday ishlaydi |
|---|---|
| **QR kod** | `BarcodeDetector` API bilan skaner; RTSP URL, JSON yoki qurilma yorligʻi (SN/CODE) tanib olinadi |
| **ONVIF avtomatik topish** | Android ilovada — telefondan UDP multicast WS-Discovery; brauzerda — backend `/cameras/discover` |
| **RTSP manzil** | Foydalanuvchi havolani kiritadi; brendlar boʻyicha yoʻllar jadvali koʻrsatiladi |
| **IP + login + parol** | Brend tanlanadi → RTSP manzil avtomatik yigʻiladi va koʻrsatiladi |
| **Cloud API** | Tuya/Smart Life, EZVIZ, IMOU, UniFi Protect — kalitlar serverda saqlanadi |

### Brendlar boʻyicha oqim yoʻllari (`js/brands.js`)

| Brend | Asosiy oqim | Qoʻllab-quvvatlash |
|---|---|---|
| Hikvision | `/Streaming/Channels/{ch}01` | toʻliq |
| Dahua | `/cam/realmonitor?channel={ch}&subtype=0` | toʻliq |
| Uniview | `/media/video{ch}` | toʻliq |
| Axis | `/axis-media/media.amp?camera={ch}` | toʻliq |
| Reolink | `/h264Preview_0{ch}_main` | toʻliq |
| TP-Link VIGI | `/stream{ch}` | toʻliq |
| UniFi Protect | `rtsps://host:7441/{key}` | toʻliq (API) |
| ONVIF (universal) | `/onvif{ch}` | toʻliq |
| Tuya / Smart Life | Cloud API | API orqali |
| EZVIZ | `/H.264` | API orqali |
| IMOU | `/cam/realmonitor?...` | API orqali |
| V380 / iCSee / Yoosee / YCC365 | `/live/ch00_0`, `/onvif1`, … | cheklangan — ishlab chiqaruvchi RTSP/ONVIF ni ochgan boʻlsa |

---

## 4. Oqim (streaming)

Pleyer manbani avtomatik tanlaydi:

1. **WebRTC (WHEP)** — eng past kechikish (MediaMTX, Janus va h.k.);
2. **HLS** — iOS Safari'da native, boshqa joyda `hls.js` orqali;
3. **MJPEG / snapshot polling** — zaxira variant;
4. **Demo generator** — server ulanmagan boʻlsa, canvas'da sintez qilingan sahna
   (kunduz/tun rejimi, harakatlanuvchi obyektlar, AI ramkalari, OSD vaqt belgisi).

Qoʻshimcha: snapshot saqlash, `MediaRecorder` bilan video yozib olish,
mikrofon orqali gapirish (WHIP → ONVIF backchannel), tungi rejim (IR), PTZ va presetlar,
1/4/9/16 multi-ekran, ekran oʻchishining oldini olish (Wake Lock).

---

## 5. Android ilova

`android/` — Kotlin, WebView asosidagi qobiq. Nima beradi:

- PWA ilova ichida bundlangan (`assets/web`) — internetsiz ham ochiladi;
  `REMOTE_URL` toʻldirilsa masofaviy versiya yuklanadi, xato boʻlsa lokalga qaytadi;
- **ONVIF WS-Discovery** — brauzer qila olmaydigan UDP multicast qidiruv
  (`OnvifDiscovery.kt`, multicast lock bilan);
- Kamera/mikrofon/joylashuv ruxsatlari, fayl tanlash;
- Snapshot va videolarni "Downloads" ga saqlash (`saveBase64` — WebView'da `blob:` yuklab olish ishlamaydi);
- Orqaga tugmasi PWA router bilan integratsiya, pull-to-refresh, splash;
- Push token uchun tayyor interfeys (FCM qoʻshilganda `getPushToken()` toʻldiriladi).

JavaScript koʻprigi (`window.BRILIANT`):

| Metod | Vazifasi |
|---|---|
| `discoverOnvif(cbName, timeoutMs)` | WS-Discovery, natija `window[cbName](json)` ga qaytadi |
| `saveBase64(dataUrl, fileName, mime)` | Faylni Downloads ga saqlash |
| `getPushToken()` | FCM token |
| `deviceInfo()` | `{platform, sdk, model, app}` |
| `keepAwake(bool)` | Ekranni yoqiq ushlab turish |
| `toast(text)` | Native toast |

### APK yigʻish

```bash
cd android
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # imzosiz release
```

`cctv/` papkasi build vaqtida avtomatik `assets/web` ga nusxalanadi (`copyPwa` taski).
GitHub Actions (`.github/workflows/android.yml`) har bir push'da APK yigʻib, artefakt sifatida yuklaydi.

Release APK ni imzolash uchun `android/app/build.gradle.kts` ga `signingConfigs` qoʻshing
va kalitni CI secret'lari orqali bering.

Push (FCM) qoʻshish: `google-services.json` ni `android/app/` ga qoʻying,
`com.google.gms.google-services` plaginini yoqing va tokenni
`SharedPreferences("briliant").fcm_token` ga yozadigan `FirebaseMessagingService` qoʻshing —
koʻprikning qolgan qismi tayyor.

---

## 6. Backend

Mijoz tomonidan kutiladigan interfeys toʻliq [`CCTV-API.md`](CCTV-API.md) da yozilgan:
auth (JWT + refresh), kameralar, probe/discover, stream URL'lar, PTZ, IR, arxiv,
hodisalar, bildirishnomalar (Web Push/FCM/Telegram), bulut integratsiyalari, billing va WebSocket.

Tavsiya etilgan arxitektura:

```
Client → API Gateway (Nginx/Traefik) → NestJS servislari
   ├── Auth        (JWT, refresh rotation, 2FA)
   ├── Camera      (ONVIF, RTSP probe, credential shifrlash)
   ├── Streaming   (MediaMTX: RTSP → WebRTC/HLS, FFmpeg)
   ├── AI          (YOLOv11 / ONNX Runtime, hodisa → BullMQ)
   ├── Notification(Web Push, FCM, SMTP, Telegram bot)
   └── Storage     (MinIO / S3 / B2, retention siyosati)
PostgreSQL · Redis · Prometheus + Grafana
```

Backend hali tayyor boʻlmasa ham ilova toʻliq ishlaydi: **demo rejim**da barcha
maʼlumot qurilmada saqlanadi va oqim canvas'da sintez qilinadi.

---

## 7. Xavfsizlik

- Transport: HTTPS/TLS; WebView'da faqat lokal kameralar uchun cleartext ruxsat;
- JWT access + refresh (rotatsiya), rol asosida ruxsatlar (RBAC), 2FA (TOTP);
- Kamera parollari serverda AES-256 bilan shifrlanadi va javoblarda qaytarilmaydi;
- Demo rejimda barcha maʼlumot faqat qurilmada — tashqariga hech narsa yuborilmaydi;
- Audit log (kamera qoʻshish/oʻchirish, PTZ, snapshot, kirish/chiqish) — eksport qilinadi.

---

## 8. Hozircha bajarilmagani

Ushbu repozitoriyda **mijoz qismi** (PWA + Android) toʻliq; server tomoni alohida
loyiha sifatida amalga oshiriladi:

- NestJS servislari, PostgreSQL sxemasi, BullMQ navbatlari;
- MediaMTX/FFmpeg klaster konfiguratsiyasi va arxiv yozuvi;
- YOLOv11 inferens xizmati (odam/avto/hayvon/yuz, LPR, yongʻin);
- Payme/Click toʻlov integratsiyasi;
- Home Assistant / Google Home / Alexa / HomeKit integratsiyalari.

Admin panel interfeysi tayyor va yuqoridagi API'ga ulanishi kifoya.
