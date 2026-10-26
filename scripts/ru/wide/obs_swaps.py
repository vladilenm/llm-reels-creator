#!/usr/bin/env python3
"""Смены фона с маской для OBS-дубля (камера-карточка снизу): поверх renders/picture.base.mp4 (obs_base.py) в окнах
смен фона кадр = полный тёмный слой (фон, свечение, текст; motion-broll .mp4 без дыры под карточку) + спикер по маске
Apple Vision. Комната и рамка карточки уходят, спикер остаётся на месте; вход и выход — стык.
Заказчик просил вырезать фон дважды за 2026-10-25 (claude-sfx, harness2), когда за спиной ровная стена без мебели;
с креслом у плеча маска мигает (geo-sleuth, voice-studio) — тогда тёмный слой вокруг карточки, без этого скрипта.

  python3 scripts/ru/wide/obs_swaps.py <project> --prep     кадры окон из picture.base.mp4 → fx/masks/swaps (Vision, ~1 мин)
  python3 scripts/ru/wide/obs_swaps.py <project> [--out renders/picture.mp4]
          → renders/picture.base.masked.mp4 + <out> со звуком fx/mix.wav (или звуком базы, если микса нет)

work/swaps.json: [{"id", "in", "out", "file"}] — время чистого таймлайна, file — полный слой смены фона .mp4 от корня
проекта (те же клипы не попадают в broll/plan.json). Маски считаются по picture.base.mp4, а не по clean.mp4: наезды
obs_base меняют геометрию карточки. Маска сглажена по ±1 кадру, но не через склейку, край размыт на 1,6 px."""
import json, os, subprocess, sys, pathlib
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, fps, joins

ROOT = pathlib.Path(__file__).resolve().parents[3]
args = sys.argv[1:]
P = project(args[0]); FPS = fps(P); W, H = 1080, 1920
SW = json.loads((P / "work" / "swaps.json").read_text())
base, masks = P / "renders" / "picture.base.mp4", P / "fx" / "masks" / "swaps"
win = [(round(s["in"] * FPS), round(s["out"] * FPS), P / s["file"]) for s in SW]

if "--prep" in args:
    fr = P / "work" / "swap-frames"; fr.mkdir(parents=True, exist_ok=True); masks.mkdir(parents=True, exist_ok=True)
    for f0, f1, _ in win:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{f0 / FPS:.4f}", "-i", str(base), "-frames:v", str(f1 - f0),
                        "-start_number", str(f0), str(fr / "%05d.png")], check=True)
    subprocess.run(["swift", str(ROOT / "scripts/ru/fx/person-mask.swift"), str(fr), str(masks)], check=True)
    sys.exit(0)

CUTS = {round(j * FPS) + d for j in joins(P) for d in (-2, -1, 0, 1, 2)}   # obs_base снапит склейку ±2 кадра


def frames(path):
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    n = W * H * 3
    while True:
        b = p.stdout.read(n)
        if len(b) < n: break
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)


def mask(f):
    acc, ws = None, 0.0
    for k, w in ((-1, 0.25), (0, 0.5), (1, 0.25)):
        if k and (f in CUTS or f + k in CUTS): continue
        q = masks / f"{f + k:05d}.png"
        if not q.exists(): continue
        m = np.asarray(Image.open(q).convert("L").resize((W, H), Image.BILINEAR), np.float32)
        acc = m * w if acc is None else acc + m * w; ws += w
    if acc is None: raise SystemExit(f"нет маски для кадра {f}: запусти --prep")
    m = Image.fromarray(np.clip(acc / ws, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
    return np.asarray(m, np.float32)[..., None] / 255


out = P / (args[args.index("--out") + 1] if "--out" in args else "renders/picture.mp4")
out_v = P / "renders" / "picture.base.masked.mp4"
its = [(f0, f1, frames(path)) for f0, f1, path in win]
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", f"{FPS:g}", "-i", "-",
                        "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p", str(out_v)], stdin=subprocess.PIPE)
n = baked = 0
for f, fr in enumerate(frames(base)):
    for f0, f1, it in its:
        if f0 <= f < f1:
            layer = next(it, None)
            if layer is not None:
                m = mask(f)
                fr = (fr.astype(np.float32) * m + layer.astype(np.float32) * (1 - m)).astype(np.uint8); baked += 1
            break
    enc.stdin.write(np.ascontiguousarray(fr).tobytes()); n += 1
enc.stdin.close(); enc.wait()
mix = P / "fx" / "mix.wav"
audio = ["-i", str(mix), "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "256k"] if mix.exists() else ["-i", str(base), "-map", "0:v", "-map", "1:a", "-c:a", "copy"]
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out_v), *audio, "-c:v", "copy", "-shortest", str(out)], check=True)
print(f"кадров {n}, с маской {baked} → {os.path.relpath(out_v)}, {os.path.relpath(out)}")
