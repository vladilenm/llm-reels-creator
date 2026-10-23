#!/usr/bin/env python3
"""Нативные кадры экрана (3024×1964) для разметки окна: координаты камер и меток в broll/screen.json.

  python3 scripts/ru/wide/native.py <project> <src_t> [<src_t> …]          → work/native/s<t>.jpg + g<t>.jpg (сетка 200 px)
  python3 scripts/ru/wide/native.py <project> <src_t> --text x0,y0,x1,y1   строки и слова текста в прямоугольнике:
                                                                          [x, y, w, h] — готовые rect для hl/ring
  --thr 150 (яркость текста; на светлом фоне --dark), --gap 14 (пробел между словами, px)
Сетка: тонкие линии каждые 200 px, толстые — каждые 1000; на g-кадре координаты = пиксели × 2."""
import subprocess, sys, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, raw, SCREEN

args = sys.argv[1:]
P = project(args[0]); out = P / "work" / "native"; out.mkdir(parents=True, exist_ok=True)
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
VALUED = {"--text", "--thr", "--gap"}
times = [a for i, a in enumerate(args[1:], 1) if not a.startswith("--") and args[i - 1] not in VALUED]
sx, sy, sw, sh = SCREEN
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 34)

def grab(t):
    f = out / f"s{float(t):.2f}.jpg"
    if not f.exists():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(raw(P)), "-frames:v", "1",
                        "-vf", f"crop={sw}:{sh}:{sx}:{sy}", "-q:v", "2", str(f)], check=True)
    return f

def boxes(f, x0, y0, x1, y1, thr, gap, dark):
    im = np.asarray(Image.open(f).convert("L")).astype(int)
    mask = (im < thr) if dark else (im > thr)
    rows = mask[y0:y1, x0:x1].sum(1); res, s = [], None
    for y, v in enumerate(list(rows) + [0]):
        if v > 0 and s is None: s = y
        if v == 0 and s is not None:
            if y - s > 6:
                cols = mask[y0 + s:y0 + y, x0:x1].sum(0); words, a, g = [], None, 0
                for x, c in enumerate(list(cols) + [0] * (gap + 1)):
                    if c > 0:
                        if a is None: a = x
                        g = 0; e = x
                    elif a is not None:
                        g += 1
                        if g > gap: words.append([x0 + a, y0 + s, e - a + 1, y - s]); a = None
                res.append((y0 + s, y0 + y, words))
            s = None
    return res

for t in times:
    f = grab(t)
    if "--text" in args:
        x0, y0, x1, y1 = map(int, opt("--text", "").split(","))
        for a, b, words in boxes(f, x0, y0, x1, y1, int(opt("--thr", 150)), int(opt("--gap", 14)), "--dark" in args):
            print(f"строка y {a}–{b}:", " ".join(str(w) for w in words))
        continue
    im = Image.open(f).resize((sw // 2, sh // 2)); d = ImageDraw.Draw(im)
    for x in range(0, sw // 2, 100): d.line([(x, 0), (x, sh // 2)], fill=(255, 0, 255) if x % 500 == 0 else (255, 140, 255), width=1)
    for y in range(0, sh // 2, 100): d.line([(0, y), (sw // 2, y)], fill=(255, 0, 255) if y % 500 == 0 else (255, 140, 255), width=1)
    d.rectangle([0, 0, 170, 44], fill="black"); d.text((6, 2), f"{float(t):.2f}", fill="yellow", font=font)
    g = out / f"g{float(t):.2f}.jpg"; im.save(g, quality=88); print(g.relative_to(P))
