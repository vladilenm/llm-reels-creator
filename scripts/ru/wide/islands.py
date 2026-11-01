#!/usr/bin/env python3
"""S1 куски речи по огибающей: звук > −45 дБ, разрывы короче --gap (0,35 с) склеены, куски короче 0,25 с выброшены →
диапазоны src для gaps.py, который расшифровывает каждый отдельно (whisper по всему файлу петляет и склеивает дубли).

  python3 scripts/ru/wide/islands.py <project> [--gap 0.35]  → печатает «t0-t1 …»; вместе: gaps.py $P $(islands.py $P)"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, raw, envelope

a = sys.argv[1:]
P = project(a[0]); gap = float(a[a.index("--gap") + 1]) if "--gap" in a else 0.35
db = envelope(raw(P), P / "work" / "env10ms.npy")
on = db > -45; segs, s = [], None
for k, v in enumerate(on):
    if v and s is None: s = k
    if not v and s is not None: segs.append([s, k]); s = None
if s is not None: segs.append([s, len(on)])
out = []
for x0, x1 in segs:
    if out and (x0 - out[-1][1]) * 0.01 < gap: out[-1][1] = x1
    else: out.append([x0, x1])
print(" ".join(f"{max(0, x0 * 0.01 - 0.08):.2f}-{x1 * 0.01 + 0.08:.2f}" for x0, x1 in out if (x1 - x0) * 0.01 >= 0.25))
