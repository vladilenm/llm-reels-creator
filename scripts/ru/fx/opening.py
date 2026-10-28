#!/usr/bin/env python3
"""Открытие рилса (заказчик, 2026-10-28): первые полсекунды весь готовый кадр — спикер, графика, субтитры — летит на
зрителя: из уменьшенного (0,82) в полный, с зум-смазом, под один фирменный звук «вжух-приближение». Чтобы тот, кто листает
ленту, сразу увидел действие; дальше рилс идёт как обычно.

fx.json "open": false — выключить; {"from": 0.82, "dur": 0.5, "anchor": [0.5, 0.65]} — с какого масштаба, сколько секунд,
к какой точке кадра (доли ширины и высоты; 0,65 — лицо в OBS-дубле). Картинка — scripts/ru/fx/open_zoom.py (assemble.mjs
зовёт его на готовом композите), звук — событие "open" в sfx_real.py и sfx.py: файл из brand/sfx/open.json, пик звука
ложится на конец зума."""
import json, os
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
DEFAULT = {"from": 0.82, "dur": 0.5, "anchor": [0.5, 0.65]}
SOUND = os.path.join(ROOT, "brand", "sfx", "open.json")


def cfg_from(fx):
    """fx.json dict → настройки открытия или None, если выключено"""
    o = (fx or {}).get("open", True)
    if o is False or o is None: return None
    c = {**DEFAULT, **(o if isinstance(o, dict) else {})}
    if not (0.3 <= c["from"] < 1.0 and 0.1 <= c["dur"] <= 2.0): raise SystemExit(f'fx.json "open": from {c["from"]}, dur {c["dur"]} — нужно 0,3 ≤ from < 1, 0,1 ≤ dur ≤ 2')
    return c


def cfg(project):
    p = os.path.join(project, "fx", "fx.json")
    try: fx = json.load(open(p))
    except (OSError, ValueError): fx = {}
    return cfg_from(fx)


def scale(t, c):
    """масштаб всего кадра в момент t: from → 1 за dur, ease-out cubic (рывок в начале, мягкая посадка)"""
    if t >= c["dur"]: return 1.0
    u = max(t, 0.0) / c["dur"]
    return c["from"] + (1 - c["from"]) * (1 - (1 - u) ** 3)


def brand_sound(key=None):
    """brand/sfx/open.json → абсолютный путь к выбранному файлу (key — другой кандидат, для прослушки) или None: файла нет —
    звук открытия молчит, а не подменяется"""
    try: j = json.load(open(SOUND))
    except (OSError, ValueError): return None
    f = j.get("candidates", {}).get(key or j.get("chosen"), {}).get("file") or (None if key else j.get("file"))
    f = f and os.path.join(ROOT, f)
    return f if f and os.path.exists(f) else None


def place(x, sr, dur):
    """звук (N, ch) → (сдвиг в секундах, звук): пик огибающей (окна 20 мс) ложится на конец зума; не влезает в начало ролика —
    голова срезается с атакой 15 мс"""
    w = max(1, int(0.02 * sr)); env = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    k = [env[i:i + w].max() for i in range(0, max(1, len(env) - w + 1), w)]
    start = dur - (int(np.argmax(k)) * w + w / 2) / sr
    if start >= 0: return start, x
    cut = int(round(-start * sr)); y = x[cut:].copy()
    a = min(len(y), int(0.015 * sr)); ramp = np.linspace(0, 1, a)
    y[:a] *= ramp[:, None] if y.ndim == 2 else ramp
    return 0.0, y
