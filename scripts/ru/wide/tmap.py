#!/usr/bin/env python3
"""Чистое время ↔ исходник по EDL.json.

  python3 scripts/ru/wide/tmap.py <project> 12.5 30.0        чистое → src
  python3 scripts/ru/wide/tmap.py <project> --src 84.9       src → чистое (или «вырезано»); флаг — перед каждым src
Всегда печатает склейки на чистом таймлайне."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, c2s_fn, s2c_fn, joins

args = sys.argv[1:]
P = project(args[0]); c2s, s2c = c2s_fn(P), s2c_fn(P)
rest = args[1:]
for i, a in enumerate(rest):
    if a == "--src": continue
    t = float(a)
    if i == 0 or rest[i - 1] != "--src": print(f"clean {t:.2f} → src {c2s(t):.2f}")
    else:
        c = s2c(t); print(f"src {t:.2f} → " + (f"clean {c:.2f}" if c is not None else "вырезано"))
print("склейки (clean):", joins(P))
