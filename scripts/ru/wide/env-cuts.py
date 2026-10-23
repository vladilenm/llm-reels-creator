#!/usr/bin/env python3
"""W2 резы только по огибающей: ручные резы + паузы внутри оставшихся кусков (whisper прячет тишину в словах).

  python3 scripts/ru/wide/env-cuts.py <project> [--thr -41] [--min 0.16] [--keep 0.08]
  читает work/cuts.manual.json {cuts:[{start, end, reason}]} (src, причины по-русски) → work/cuts.approved.json

Пауза = подряд ≥ --min с ниже --thr дБ (сглаживание 30 мс); внутри куска остаётся --keep с (55 % после слова,
45 % до следующего), у склейки — 0,10 с после последнего слова и 0,04 с перед первым. Края — на сетке кадров
исходника внутрь тишины. Дальше: build-edl.mjs --approved work/cuts.approved.json --snap-fps <fps> (без --silence-edl)."""
import json, math, sys, pathlib
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, raw, fps, envelope

args = sys.argv[1:]
P = project(args[0])
arg = lambda k, d: float(args[args.index(k) + 1]) if k in args else d
THR, MIN, KEEP, G = arg("--thr", -41), arg("--min", 0.16), arg("--keep", 0.08), fps(P)
db = envelope(raw(P), P / "work" / "env10ms.npy"); db = np.convolve(db, np.ones(3) / 3, "same")
manual = json.loads((P / "work" / "cuts.manual.json").read_text())["cuts"]
dur = len(db) / 100
keep, cur = [], 0.0
for m in sorted(manual, key=lambda m: m["start"]):
    if m["start"] > cur: keep.append((cur, m["start"]))
    cur = max(cur, m["end"])
if cur < dur: keep.append((cur, dur))
auto = []
for a, b in keep:
    i0, i1 = int(round(a * 100)), int(round(b * 100))
    q = db[i0:i1] < THR; i = 0
    while i < len(q):
        if not q[i]: i += 1; continue
        j = i
        while j < len(q) and q[j]: j += 1
        s, e = (i0 + i) / 100, (i0 + j) / 100
        if i == 0 and a > 0 and e - s > 0.08:
            auto.append([a, e - 0.04, f"пауза после склейки {e - s:.2f} с"])
        elif j == len(q) and e - s > 0.14 and b < dur:
            auto.append([s + 0.10, b, f"пауза до склейки {e - s:.2f} с"])
        elif i > 0 and j < len(q) and e - s >= MIN:
            auto.append([s + KEEP * 0.55, e - KEEP * 0.45, f"пауза по огибающей {e - s:.2f} с → {KEEP:.2f} с"])
        i = j
cuts = [dict(start=m["start"], end=m["end"], reason=m["reason"]) for m in manual]
for s, e, why in auto:
    s2 = s if any(abs(s - k[0]) < 1e-6 for k in keep) else math.ceil(s * G - 1e-6) / G
    e2 = e if any(abs(e - k[1]) < 1e-6 for k in keep) else math.floor(e * G + 1e-6) / G
    if e2 - s2 >= 0.04: cuts.append(dict(start=round(s2, 3), end=round(e2, 3), reason="вручную: " + why))
cuts.sort(key=lambda c: c["start"])
(P / "work" / "cuts.approved.json").write_text(json.dumps({"cuts": cuts}, ensure_ascii=False, indent=1))
print(len(auto), "пауз по огибающей, вырежут", round(sum(e - s for s, e, _ in auto), 2), "с")
for s, e, why in auto: print(f"  {s:7.2f}–{e:7.2f}  {why}")
