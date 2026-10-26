#!/usr/bin/env python3
"""S1 «речь без слов»: куски звука > −45 дБ, которых нет в transcript.words.json, для любого дубля
(scan.py --gaps делает то же для широкой записи, но режет экран и на вертикали 1080×1920 падает).

  python3 scripts/ru/wide/gaps.py <project> [t0-t1 …]    → work/GAPS.md, work/gaps/*.m4a|raw.json

По каждому куску: длина, пик, f0 и голосовость (речь Владилена: f0 95–180 Гц, голос ≳ 40 %); голосовые куски
(> 30 %) дорасшифровываются отдельно. Аргументы t0-t1 (src, с) — фразы, которые надо дорасшифровать целиком:
whisper пропускает повторы, путает числа и пишет кашу на слитной речи. Кэш transcribe.mjs по SHA-256: повторный
запуск не платит. Whisper в тишине пишет «Ну, всё, пока» / «Спасибо за просмотр» — такой текст не речь."""
import json, subprocess, sys, pathlib
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, raw, envelope, pcm16k, f0_voicing

ROOT = pathlib.Path(__file__).resolve().parents[3]
P = project(sys.argv[1]); gd = P / "work" / "gaps"; gd.mkdir(parents=True, exist_ok=True)


def tr(t0, t1, tag):
    f = gd / f"{tag}-{t0:.2f}-{t1:.2f}"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, t0):.2f}", "-to", f"{t1:.2f}", "-i", str(raw(P)), "-vn", "-ac", "1",
                    "-c:a", "aac", "-b:a", "160k", f"{f}.m4a"], check=True)
    subprocess.run(["node", str(ROOT / "scripts/ru/transcribe.mjs"), f"{f}.m4a", "--out", f"{f}.raw.json", "--language", "ru"], capture_output=True)
    try: return json.loads(pathlib.Path(f"{f}.raw.json").read_text()).get("text", "").strip() or "—"
    except Exception: return "ошибка"


db = envelope(raw(P), P / "work" / "env10ms.npy")
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
for a, b in merged:
    if b - a < 8 or cover[a:b].mean() > 0.6: continue
    t0, t1 = a / 100, b / 100
    f0, vo = f0_voicing(a16, t0, t1)
    txt = tr(t0 - 0.2, t1 + 0.2, "as-is") if vo > 0.3 else ""
    out.append(f"| {t0:.2f}–{t1:.2f} | {t1 - t0:.2f} | {db[a:b].max():.0f} | {f0:.0f} | {vo:.0%} | {txt} |")
if sys.argv[2:]:
    out += ["", "## Фразы целиком"]
    for spec in sys.argv[2:]:
        t0, t1 = map(float, spec.split("-"))
        out.append(f"- {t0:.2f}–{t1:.2f}: {tr(t0, t1, 'phrase')}")
(P / "work" / "GAPS.md").write_text("\n".join(out) + "\n")
print("\n".join(out))
