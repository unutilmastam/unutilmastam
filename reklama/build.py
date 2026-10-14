# -*- coding: utf-8 -*-
"""
Unutilmas Ta'm — reklamaga diktor ovozini qo'shadi.

  1) script.json dagi har bir gapni o'zbekcha erkak neyron ovozida
     (Microsoft "uz-UZ-SardorNeural") o'qitadi
  2) har bir gapni o'z vaqtiga joylaydi; sig'masa — biroz tezlashtiradi
  3) musiqa va effektlar ustiga qo'yadi (musiqa diktor gapirganda
     allaqachon pasaytirilgan)
  4) ovozsiz videoga birlashtiradi va ijtimoiy tarmoqlar uchun ovoz
     balandligini -14 LUFS ga keltiradi

Ishga tushirish:
    python build.py                 # haqiqiy ovoz (internet kerak)
    python build.py --fake-tts      # sinov: ovoz o'rniga signal
"""
import asyncio
import json
import os
import subprocess
import sys

HERE   = os.path.dirname(os.path.abspath(__file__))
OUT    = os.path.join(HERE, "out")
VOICE  = os.environ.get("VO_VOICE", "uz-UZ-SardorNeural")
RATE   = os.environ.get("VO_RATE",  "-4%")      # biroz shoshilmasdan
PITCH  = os.environ.get("VO_PITCH", "-2Hz")     # biroz chuqurroq, iliq
MAX_SPEEDUP = 1.22                               # bundan tez — g'alati eshitiladi
TAIL_ROOM   = 0.25                               # gap o'z oynasidan shuncha oshsa ham bo'ladi


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-2000:])
        raise SystemExit(f"Buyruq xato bilan tugadi: {' '.join(cmd[:4])} ...")
    return r.stdout


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                      "-of", "default=nw=1:nk=1", path]).strip())


async def tts_line(text, path):
    import edge_tts
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH).save(path)
            if os.path.getsize(path) > 1000:
                return
        except Exception as e:                       # noqa: BLE001
            print(f"  qayta urinish ({attempt+1}): {e}")
        await asyncio.sleep(2 + attempt * 2)
    raise SystemExit(f"Ovoz yaratilmadi: {text}")


def fake_line(text, path, seconds):
    """Sinov uchun: gap uzunligiga mos signal (internetsiz)."""
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", f"sine=frequency=220:duration={seconds:.2f}",
         "-af", "volume=0.6", "-ar", "48000", path])


def main():
    fake = "--fake-tts" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    sc = json.load(open(os.path.join(HERE, "script.json"), encoding="utf-8"))
    lines = sc["lines"]
    total = float(sc["duration"])

    # ── 1. har bir gapni o'qitish ──
    print(f"Ovoz: {'SINOV (signal)' if fake else VOICE}  tezlik {RATE}  ohang {PITCH}")
    for L in lines:
        raw = os.path.join(OUT, f"raw_{L['i']}.mp3" if not fake else f"raw_{L['i']}.wav")
        L["_raw"] = raw
        if fake:
            fake_line(L["vo"], raw, 0.14 * len(L["vo"]) / 1.6)
        else:
            asyncio.run(tts_line(L["vo"], raw))

    # ── 2. har bir gapni o'z oynasiga moslash ──
    report = []
    for L in lines:
        slot = (L["t1"] - L["t0"]) + TAIL_ROOM
        # boshidagi va oxiridagi jimlikni kesamiz — gap aniq vaqtida boshlansin
        trimmed = os.path.join(OUT, f"trim_{L['i']}.wav")
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", L["_raw"], "-af",
             "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
             "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse",
             "-ar", "48000", "-ac", "1", trimmed])
        d = duration(trimmed)
        speed = 1.0
        if d > slot:
            speed = min(MAX_SPEEDUP, d / slot)
        fitted = os.path.join(OUT, f"fit_{L['i']}.wav")
        af = f"atempo={speed:.4f}" if speed > 1.0005 else "anull"
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", trimmed, "-af", af,
             "-ar", "48000", "-ac", "1", fitted])
        d2 = duration(fitted)
        L["_fit"] = fitted
        flag = "OK" if d2 <= slot + 0.05 else "UZUN"
        report.append((L["i"], L["t0"], d, speed, d2, slot, flag))

    # Tezlashtirish ham yetmasa — gapni biroz OLDINROQ boshlaymiz
    # (oldingi gap tugagandan keyingi bo'sh joyga). Oxirgi so'z hech
    # qachon kesilib qolmasligi uchun.
    prev_end = 0.0
    for k, L in enumerate(lines):
        d2 = duration(L["_fit"])
        limit = L["t1"] + TAIL_ROOM
        start = L["t0"]
        if start + d2 > limit:
            start = max(prev_end + 0.15, limit - d2)
        if k == len(lines) - 1 and start + d2 > total - 0.12:
            start = max(prev_end + 0.15, total - 0.12 - d2)
        L["_start"] = start
        prev_end = start + d2
        r = list(report[k]); r[1] = start
        r[6] = "OK" if start + d2 <= max(limit, total - 0.1) + 0.02 else "UZUN"
        if abs(start - L["t0"]) > 0.01 and r[6] == "OK":
            r[6] = f"OK (boshi {L['t0'] - start:+.2f}s oldinroq)"
        report[k] = tuple(r)

    print("\n  #   boshl.   asl     tezl.   natija  oyna   holat")
    for r in report:
        print(f"  {r[0]}  {r[1]:6.2f}s  {r[2]:5.2f}s  x{r[3]:.2f}  {r[4]:5.2f}s  {r[5]:4.2f}s  {r[6]}")

    # ── 3. diktor yo'lini yig'ish ──
    inputs, filters, labels = [], [], []
    for k, L in enumerate(lines):
        inputs += ["-i", L["_fit"]]
        ms = int(round(L["_start"] * 1000))
        filters.append(f"[{k}:a]adelay={ms}|{ms},apad=whole_dur={total}[v{k}]")
        labels.append(f"[v{k}]")
    filters.append("".join(labels) + f"amix=inputs={len(lines)}:normalize=0,"
                   f"atrim=0:{total},"
                   # erkak ovozi uchun: past shovqinni olib tashlash, "iliqlik" va aniqlik
                   "highpass=f=80,"
                   "equalizer=f=180:t=q:w=1.0:g=2,"
                   "equalizer=f=3200:t=q:w=1.2:g=2.5,"
                   "acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=3"
                   "[vo]")
    vo = os.path.join(OUT, "diktor.wav")
    run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filters),
         "-map", "[vo]", "-ac", "2", "-ar", "48000", vo])

    # ── 4. musiqa bilan aralashtirish + video ──
    final = os.path.join(OUT, "unutilmastam-reklama-30s-ovozli.mp4")
    run(["ffmpeg", "-y", "-loglevel", "error",
         "-i", os.path.join(HERE, "video_ovozsiz.mp4"),
         "-i", vo,
         "-i", os.path.join(HERE, "musiqa.flac"),
         "-filter_complex",
         "[1:a]volume=1.0[d];[2:a]volume=0.62[m];"
         "[d][m]amix=inputs=2:normalize=0,"
         "loudnorm=I=-14:TP=-1.5:LRA=9[a]",
         "-map", "0:v", "-map", "[a]",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-t", f"{total}", "-movflags", "+faststart", final])

    # alohida — faqat diktor (keyin montaj qilmoqchi bo'lsa)
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", vo,
         "-af", "loudnorm=I=-16:TP=-1.5", "-c:a", "libmp3lame", "-b:a", "192k",
         os.path.join(OUT, "faqat-diktor.mp3")])

    print(f"\nTayyor: {final}  ({duration(final):.2f} s)")
    long_lines = [r for r in report if not str(r[6]).startswith("OK")]
    if long_lines:
        print("DIQQAT: ba'zi gaplar oynasidan uzun:", [r[0] for r in long_lines])


if __name__ == "__main__":
    main()
