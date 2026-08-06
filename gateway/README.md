# BRILIANT — haqiqiy kameralarni ulash (gateway)

Telefon (brauzer ham, ilova ham) **RTSP ni ijro eta olmaydi**. Kamera RTSP beradi,
telefon esa WebRTC / HLS / JPEG tushunadi. Shu ikkisining orasida turadigan
konverter — **gateway**. Bu papkada tayyor konfiguratsiya bor: MediaMTX
(bepul, ochiq kodli, bitta konteyner).

To'liq NestJS backend kerak emas — u faqat akkauntlar, arxiv, AI va bulut
funksiyalari uchun keyinroq qo'shiladi.

---

## Nima kerak

- Kameralar bilan **bitta tarmoqda** turadigan kompyuter: eski noutbuk,
  mini-PC, Raspberry Pi 4/5 yoki NAS. 24/7 yoqiq turishi kerak.
- Docker o'rnatilgan bo'lsin.
- Kameralarning IP manzili, login va paroli.

---

## 1-qadam. Kameralarni tayyorlash

Har bir kameraning veb-panelida:

1. **Statik IP** bering (yoki routerda DHCP reservation).
2. **ONVIF** va **RTSP** ni yoqing (odatda: Network → Advanced → ONVIF/RTSP).
3. Alohida **`viewer`** foydalanuvchi yarating — admin parolini gateway'ga bermang.
4. Kamerani **internetga chiqarmang**, UPnP va port forwarding'ni o'chiring.
   Tashqi ulanish faqat gateway orqali bo'ladi.

RTSP manzilini ilovaning o'zi ham ko'rsatadi:
**Kamera qo'shish → IP + login + parol** → brend tanlansa, manzil avtomatik yig'iladi.

---

## 2-qadam. Gateway'ni ishga tushirish

```bash
git clone https://github.com/unutilmastam/unutilmastam.git
cd unutilmastam/gateway

# mediamtx.yml ni oching va o'z kameralaringizni yozing:
#   paths: cam1: source: rtsp://viewer:PAROL@192.168.1.64:554/Streaming/Channels/101
# hamda authInternalUsers dagi parollarni almashtiring

docker compose up -d
docker compose logs -f          # "[path cam1] ready" ko'rinsa — bo'ldi
```

Tekshirish (kompyuterda): `http://<gateway-IP>:8888/cam1/index.m3u8` ochilsa, oqim tayyor.

---

## 3-qadam. Ilovaga qo'shish

Ilovada: **Kamera qo'shish → Gateway oqimi (HLS / WebRTC)**

| Maydon | Qiymat |
|---|---|
| Gateway manzili | `192.168.1.10` (gateway kompyuterining IP si) |
| Oqim yo'li | `cam1` |

Havolalar avtomatik yig'iladi:

```
WebRTC : http://192.168.1.10:8889/cam1/whep
HLS    : http://192.168.1.10:8888/cam1/index.m3u8
```

Parol qo'ygan bo'lsangiz: `...?user=viewer&pass=PAROL`

Mavjud kameraga ham qo'shsa bo'ladi: **Kamera → sozlamalar → Oqim manzillari**.

---

## 4-qadam. Uydan tashqarida ko'rish

Uch variant, oddiydan murakkabga:

### A. Cloudflare Tunnel (tavsiya etiladi)

Oq IP, ochiq port va sertifikat kerak emas; iPhone PWA ham (HTTPS) ishlaydi.

1. `one.dash.cloudflare.com` → Networks → Tunnels → tunnel yarating, tokenni oling.
2. `gateway/.env` ga `TUNNEL_TOKEN=...` yozing, `docker-compose.yml` dagi
   `cloudflared` blokini oching, `docker compose up -d`.
3. Tunnel'da public hostname qo'shing: `cctv.example.uz` → `http://localhost:8889`.
4. Ilovada gateway manzili sifatida `https://cctv.example.uz` ni kiriting.

### B. VPN (Tailscale / WireGuard)

Gateway va telefonga Tailscale o'rnatiladi, telefon uydagi tarmoqqa ulangandek
ishlaydi. Hech narsa internetga ochilmaydi — eng xavfsizi.

### C. VPS + Nginx + Let's Encrypt

Oq IP li serverga MediaMTX qo'yib, TLS bilan chiqarasiz.
Kameralar boshqa joyda bo'lsa, ular VPS ga oqimni o'zi uzatadi (publish).

> **Muhim:** iPhone Safari HTTPS sahifadan HTTP oqimni ochmaydi (mixed content).
> Uzoqdan ko'rish uchun gateway albatta HTTPS orqali chiqarilishi kerak.
> Android ilovasida lokal tarmoqdagi HTTP oqim ishlaydi (network_security_config).

---

## Arxivga yozish (ixtiyoriy)

`mediamtx.yml` dagi kerakli path ga qo'shing:

```yaml
  cam1:
    source: rtsp://viewer:PAROL@192.168.1.64:554/Streaming/Channels/101
    record: yes
    recordPath: /recordings/%path/%Y-%m-%d_%H-%M-%S
    recordFormat: fmp4
    recordSegmentDuration: 1h
    recordDeleteAfter: 168h        # 7 kun
```

Yozuvlar `gateway/recordings/` ichida bo'ladi. Ilovadagi arxiv ekrani
segmentlarni backend orqali oladi (`/cameras/:id/recordings`) — bu qism
backend yozilgandan keyin ulanadi.

---

## Ish unumi

| Kameralar soni | Talab |
|---|---|
| 1–4 | Raspberry Pi 4 (2 GB) yetadi — `sourceOnDemand: yes` bilan |
| 5–16 | 2 yadro / 4 GB mini-PC |
| 16+ | 4 yadro / 8 GB, sub-oqimlardan foydalaning |

MediaMTX videoni qayta kodlamaydi (copy) — protsessor deyarli yuklanmaydi.
Faqat H.265 kamerani H.264 ga o'girishda FFmpeg ishlaydi va yuk ortadi.

Maslahatlar:
- Multi-ekran (4/9/16) uchun **sub-oqim** (`cam1_sub`) qo'shing — ilova
  tejamkor rejimda o'shani so'raydi;
- `sourceOnDemand: yes` — hech kim ko'rmayotganda kameraga ulanmaydi;
- WebRTC kechikishi ~0.3 s, HLS ~2 s. Ilova avval WebRTC ni sinaydi.

---

## Nosozliklar

| Alomat | Sabab / yechim |
|---|---|
| Ilovada "Signal yo'q" | `docker compose logs` — RTSP manzil yoki parol xato |
| Video ochilmaydi, HLS ishlaydi | WebRTC UDP porti yopiq → `network_mode: host` yoki 8189/udp ni oching |
| iPhone'da qora ekran | H.265 kamera → FFmpeg bilan H.264 ga o'giring (yuqoridagi `cam6` namunasi) |
| Uzoqdan ochilmayapti | Mixed content: HTTPS sahifa + HTTP oqim. Cloudflare Tunnel ishlating |
| Uyali internetda WebRTC yo'q | CGNAT → TURN server qo'shing (`webrtcICEServers2`) yoki HLS ga o'ting |
