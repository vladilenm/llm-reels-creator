#!/usr/bin/env python3
"""W1 «разведка» широкой OBS-записи: что на экране и где речь — до любых резов.

  python3 scripts/ru/wide/scan.py <project> [--every 2] [--gaps] [--transcribe]

  work/wide/src-sheet-NN.jpg   весь кадр (макет + экран) каждые --every с, метка времени src
  work/wide/screen-diff.npy    разница соседних кадров экрана (378×245, серый) — события экрана
  work/wide/SCREEN.md          переключения окон, скроллы, мелкие события (отправка сообщения ~2)
  work/env10ms.npy             огибающая звука src
  work/wide/GAPS.md            (--gaps) куски звука > −45 дБ, которых нет в transcript.words.json:
                               f0 и голосовость (речь Владилена: f0 95–180 Гц, голос ≳ 40 %), с --transcribe — дорасшифровка
                               каждого куска (как есть и +14 дБ без промпта; кэш transcribe.mjs, копейки)
Whisper в тишине пишет «Ну, всё, пока» / «Спасибо за просмотр» — такой текст не речь."""
import json, subprocess, sys, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, raw, fps, envelope, pcm16k, f0_voicing, SCREEN

ROOT = pathlib.Path(__file__).resolve().parents[3]
args = sys.argv[1:]
P = project(args[0]); W = P / "work" / "wide"; W.mkdir(parents=True, exist_ok=True)
EVERY = float(args[args.index("--every") + 1]) if "--every" in args else 2.0
FPS = fps(P)
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 26)

# ── листы исходника ──────────────────────────────────────────────────────────────────────────
fw, fh = 684, 328                                  # 4104×1964 / 6
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(raw(P)), "-vf", f"fps=1/{EVERY},scale={fw}:{fh}",
                      "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
frames = [Image.frombuffer("RGB", (fw, fh), pcm[i:i + fw * fh * 3], "raw", "RGB", 0, 1) for i in range(0, len(pcm), fw * fh * 3)]
for f in W.glob("src-sheet-*.jpg"): f.unlink()
for k in range(0, len(frames), 12):
    chunk = frames[k:k + 12]; sheet = Image.new("RGB", (fw * 3, fh * ((len(chunk) + 2) // 3)), "black")
    for j, im in enumerate(chunk):
        im = im.copy(); d = ImageDraw.Draw(im); t = (k + j) * EVERY
        d.rectangle([0, 0, 92, 32], fill="black"); d.text((6, 2), f"{t:.1f}", fill="yellow", font=font)
        sheet.paste(im, ((j % 3) * fw, (j // 3) * fh))
    sheet.save(W / f"src-sheet-{k // 12 + 1:02d}.jpg", quality=85)
print("листы:", (len(frames) + 11) // 12, "→", W.relative_to(ROOT))

# ── события экрана ───────────────────────────────────────────────────────────────────────────
sx, sy, sw, sh = SCREEN; w, h = 378, 245
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(raw(P)), "-vf", f"crop={sw}:{sh}:{sx}:{sy},scale={w}:{h}",
                      "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
small = np.frombuffer(pcm, np.uint8).reshape(-1, h, w).astype(np.int16)
d = np.abs(np.diff(small, axis=0)).mean((1, 2)); np.save(W / "screen-diff.npy", d)
lines = ["# SCREEN · события экрана (src, с)", "",
         "Переключение окна — разница > 40; скролл — подряд > 3; мелкое событие (отправка сообщения, выделение) — 0,8–3.", ""]
i = 0
while i < len(d):
    if d[i] > 40: lines.append(f"- {(i + 1) / FPS:7.2f}  переключение ({d[i]:.0f})"); i += 1; continue
    if d[i] > 3:
        j = i
        while j < len(d) and d[j] > 1.0: j += 1
        lines.append(f"- {(i + 1) / FPS:7.2f}–{(j + 1) / FPS:.2f}  движение (скролл/анимация, пик {d[i:j].max():.0f})"); i = j; continue
    if d[i] > 0.8: lines.append(f"- {(i + 1) / FPS:7.2f}  мелкое ({d[i]:.1f})")
    i += 1
(W / "SCREEN.md").write_text("\n".join(lines) + "\n")
print("события экрана:", len(lines) - 4, "→", (W / "SCREEN.md").relative_to(ROOT))

# ── речь против транскрипта ──────────────────────────────────────────────────────────────────
db = envelope(raw(P), P / "work" / "env10ms.npy")
if "--gaps" in args or "--transcribe" in args:
    on = db > -45; segs, s = [], None
    for k, v in enumerate(on):
        if v and s is None: s = k
        if not v and s is not None: segs.append([s, k]); s = None
    if s is not None: segs.append([s, len(on)])
    merged = []
    for a, b in segs:
        if merged and a - merged[-1][1] < 15: merged[-1][1] = b
        else: merged.append([a, b])
    words = json.loads((P / "transcript.words.json").read_text())["words"]
    cover = np.zeros(len(db), bool)
    for x in words: cover[int(x["start"] * 100): int(x["end"] * 100)] = True
    a16 = pcm16k(raw(P))
    out = ["# GAPS · звук без слов в транскрипте", "", "| src | длина | пик дБ | f0 Гц | голос | дорасшифровка |", "|---|---|---|---|---|---|"]
    gd = P / "work" / "gaps"; gd.mkdir(exist_ok=True)
    for a, b in merged:
        seg = slice(a, b)
        if b - a < 8 or cover[seg].mean() > 0.6: continue
        t0, t1 = a / 100, b / 100
        f0, vo = f0_voicing(a16, t0, t1)
        txt = ""
        if "--transcribe" in args:
            res = []
            for tag, af, lang in (("as-is", None, "ru"), ("boost", "volume=14dB,alimiter=limit=0.9", "auto")):
                f = gd / f"{tag}-{t0:.2f}-{t1:.2f}"
                cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, t0 - 0.2):.2f}", "-to", f"{t1 + 0.2:.2f}", "-i", str(raw(P)), "-vn", "-ac", "1"]
                if af: cmd += ["-af", af]
                subprocess.run(cmd + ["-c:a", "aac", "-b:a", "128k", f"{f}.m4a"], check=True)
                subprocess.run(["node", str(ROOT / "scripts/ru/transcribe.mjs"), f"{f}.m4a", "--out", f"{f}.raw.json", "--language", lang],
                               capture_output=True)
                try: res.append(json.loads(pathlib.Path(f"{f}.raw.json").read_text()).get("text", "").strip() or "—")
                except Exception: res.append("ошибка")
            txt = " / ".join(res)
        out.append(f"| {t0:.2f}–{t1:.2f} | {t1 - t0:.2f} | {db[seg].max():.0f} | {f0:.0f} | {vo:.0%} | {txt} |")
    out += ["", "Речь Владилена: f0 95–180 Гц и голосовость ≳ 40 % (замер 2026-10-23). Тон ~290 Гц, клавиатура и бормотание (голосовость < 20 %),", "текст «Ну, всё, пока» / «Спасибо за просмотр» — не речь. Решение — по f0, голосовости и дорасшифровке вместе."]
    (W / "GAPS.md").write_text("\n".join(out) + "\n")
    print("куски без слов:", len(out) - 6, "→", (W / "GAPS.md").relative_to(ROOT))
