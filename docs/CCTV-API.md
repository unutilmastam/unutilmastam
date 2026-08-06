# BRILIANT — Backend API shartnomasi

Mijoz (PWA + Android ilova) quyidagi HTTP/WebSocket interfeysni kutadi.
Backend manzili ilovada **Sozlamalar → Server ulanishi** boʻlimida kiritiladi
(`localStorage: briliant:settings.apiBase`). Manzil boʻsh boʻlsa yoki demo rejim
yoqilgan boʻlsa, ilova qurilmadagi maʼlumotlar bilan mustaqil ishlaydi.

Barcha soʻrovlar `Content-Type: application/json`, javoblar UTF-8.
Himoyalangan endpointlar `Authorization: Bearer <accessToken>` talab qiladi.
`401` javobida mijoz avtomatik `/auth/refresh` ni chaqiradi va soʻrovni bir marta takrorlaydi.

Tavsiya etilgan stek: NestJS + PostgreSQL + Redis + BullMQ + MediaMTX + YOLOv11 (ONNX Runtime).

---

## 1. Sogʻliq

| Method | Path | Izoh |
|---|---|---|
| GET | `/health` | `200 OK` — ilova "Ulanishni tekshirish" tugmasida shuni chaqiradi |

---

## 2. Autentifikatsiya

| Method | Path | Body | Javob |
|---|---|---|---|
| POST | `/auth/register` | `{name, email, password}` | `{user, accessToken, refreshToken}` |
| POST | `/auth/login` | `{email, password}` | `{user, accessToken, refreshToken}` |
| POST | `/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken?}` |
| POST | `/auth/logout` | — | `204` |
| POST | `/auth/forgot` | `{email}` | `204` (mavjudligini oshkor qilmaydi) |
| POST | `/auth/change-password` | `{current, next}` | `204` |
| POST | `/auth/2fa/enable` | — | `{secret, otpauthUrl}` |

`user` obyekti:

```json
{ "id": "usr_1", "name": "Aziz", "email": "aziz@example.com",
  "role": "owner|admin|operator|viewer", "plan": "free|pro|business|enterprise" }
```

Parollar Argon2id bilan xeshlanadi, refresh token rotatsiya qilinadi (bir marta ishlatiladi).

---

## 3. Kameralar

| Method | Path | Izoh |
|---|---|---|
| GET | `/cameras` | Foydalanuvchiga koʻrinadigan barcha kameralar |
| POST | `/cameras` | Yangi kamera (quyidagi payload) |
| PATCH | `/cameras/:id` | Qismli yangilash |
| DELETE | `/cameras/:id` | Oʻchirish |
| POST | `/cameras/probe` | Saqlashdan oldin ulanishni tekshirish |
| GET | `/cameras/discover` | Serverdagi ONVIF WS-Discovery natijasi |
| GET | `/cameras/:id/stream` | Ijro manzillari |
| GET | `/cameras/:id/snapshot` | `{url}` yoki `image/jpeg` |
| POST | `/cameras/:id/ptz` | `{command, speed}` |
| POST | `/cameras/:id/ir` | `{mode: "auto"\|"on"\|"off"}` |
| POST | `/cameras/:id/record` | `{enabled}` |
| GET | `/cameras/:id/recordings?date=YYYY-MM-DD` | Arxiv segmentlari |
| GET | `/cameras/:id/export?from=&to=` | MP4 klip (unix sekund) |
| POST | `/cameras/:id/talk` | `Content-Type: application/sdp` → WHIP offer, javob: SDP answer |

### Kamera payload (POST /cameras)

```json
{
  "name": "Kirish darvozasi",
  "brand": "hikvision",
  "method": "qr|onvif|rtsp|ip|cloud",
  "host": "192.168.1.64", "port": 554,
  "username": "admin", "password": "••••",
  "rtspUrl": "", "channel": 1,
  "groupId": null, "ptz": false,
  "lat": 41.3111, "lng": 69.2797
}
```

Parol serverda shifrlanadi (AES-256-GCM, kalit KMS/env da) va **javoblarda hech qachon qaytarilmaydi**.

### POST /cameras/probe javobi

```json
{ "ok": true, "resolution": "1920x1080", "codec": "H.264", "fps": 20,
  "ptz": true, "audio": true, "onvifProfiles": ["Profile_1", "Profile_2"] }
```

### GET /cameras/discover javobi

```json
{ "devices": [ { "host": "192.168.1.64", "name": "HIKVISION DS-2CD2143G2",
                 "xaddr": "http://192.168.1.64/onvif/device_service", "model": "DS-2CD2143G2" } ] }
```

### GET /cameras/:id/stream javobi

```json
{ "webrtc": "https://stream.example.uz/cam_1/whep",
  "hls": "https://stream.example.uz/cam_1/index.m3u8",
  "snapshot": "https://api.example.uz/cameras/cam_1/snapshot.jpg" }
```

Mijoz avval WebRTC (WHEP) ni sinaydi, boʻlmasa HLS ga, undan keyin snapshot pollingga tushadi.
WHEP: `POST <webrtc>` body — SDP offer, javob — SDP answer + `Location` sarlavhasi
(seansni yopish uchun `DELETE <Location>`).

### PTZ buyruqlari

`up, down, left, right, up-left, up-right, down-left, down-right, zoom-in, zoom-out, home, stop, preset:<n>`

Tugma bosilganda buyruq, qoʻyib yuborilganda `stop` yuboriladi (ONVIF ContinuousMove/Stop).

### GET /cameras/:id/recordings javobi

```json
{ "segments": [ { "from": 1754440000, "to": 1754450000, "url": "https://.../seg1.m3u8" } ] }
```

---

## 4. Hodisalar (AI)

| Method | Path | Izoh |
|---|---|---|
| GET | `/events?camera=&type=&from=&to=&limit=` | Hodisalar roʻyxati |

```json
{ "events": [ { "id": "ev_1", "cameraId": "cam_1", "type": "person",
    "ts": 1754440000000, "confidence": 0.93,
    "thumbUrl": "https://.../thumb.jpg", "clipUrl": "https://.../clip.mp4" } ] }
```

`type`: `person | vehicle | animal | face | motion | line | intrusion | fire`

---

## 5. Bildirishnomalar

| Method | Path | Body |
|---|---|---|
| GET | `/notifications/vapid` | → `{publicKey}` (Web Push) |
| POST | `/notifications/subscribe` | `PushSubscription.toJSON()` |
| POST | `/notifications/device` | `{platform:"android", token}` (FCM) |
| POST | `/notifications/telegram` | `{chat}` |

Web Push payload (service worker shuni kutadi):

```json
{ "title": "Odam aniqlandi", "body": "Kirish darvozasi", "cameraId": "cam_1" }
```

---

## 6. Integratsiyalar (bulut kameralar)

| Method | Path | Body |
|---|---|---|
| POST | `/integrations/:provider/link` | `{key, secret, region}` |
| GET | `/integrations/:provider/devices` | → `{devices:[{id,name}]}` |

`provider`: `tuya | ezviz | imou | unifi`. Kalitlar faqat serverda saqlanadi.

---

## 7. Billing

| Method | Path | Body | Javob |
|---|---|---|---|
| POST | `/billing/checkout` | `{plan}` | `{url}` — Payme/Click sahifasi |

---

## 8. WebSocket

`wss://<apiBase>/ws?token=<accessToken>` — mijoz JSON xabarlarni qabul qiladi:

```json
{ "type": "camera.status", "cameraId": "cam_1", "online": false, "name": "Koridor" }
{ "type": "ai.event", "cameraId": "cam_1", "eventType": "person",
  "confidence": 0.94, "ts": 1754440000000, "thumbUrl": "...", "clipUrl": "..." }
{ "type": "notification", "title": "...", "body": "...", "kind": "info", "cameraId": "cam_1" }
```

Ulanish uzilsa mijoz 5 soniyada qayta ulanadi.

---

## 9. Xatoliklar

```json
{ "statusCode": 422, "message": "RTSP manzil notoʻgʻri", "error": "UnprocessableEntity" }
```

Mijoz `message` maydonini foydalanuvchiga koʻrsatadi — matn oʻzbek tilida boʻlgani maʼqul.

---

## 10. Rollar (RBAC)

| Rol | Ruxsatlar |
|---|---|
| `owner` | hammasi |
| `admin` | camera.add/edit/delete, user.manage, ptz, playback, share, admin |
| `operator` | ptz, playback, share |
| `viewer` | playback |

Mijoz tomonidagi tekshiruv faqat interfeys uchun; haqiqiy nazorat backendda.
