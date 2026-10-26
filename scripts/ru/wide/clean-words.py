#!/usr/bin/env python3
"""W2 слова чистого таймлайна: расшифровка renders/clean.mp4 целиком (сплошная речь — whisper ставит слова
точнее, чем в исходнике с паузами) + правки → transcript.clean.json (версия из EDL — в work/transcript.clean.edl.json).

  python3 scripts/ru/wide/clean-words.py <project> [--no-transcribe]
  правки — work/clean-fixes.json (ключ «слово@начало» по расшифровке work/clean.whisper.words.json):
    {"text":  {"Вот,": "Вот", "Anatomy,@21.54": "Anatomy"},      без @ — во всех местах
     "drop":  ["очень@49.88", "круто,@50.10"],                    whisper задвоил фразу
     "times": {"Значит,@12.07": [12.18, 12.40]}}                  начало/конец по огибающей
Начала слов, попавшие в тишину (< −38 дБ), сдвигаются к первому громкому кадру; первое слово с 0,00,
если речь начинается в первые 0,25 с (иначе в кадре 0 оно серое)."""
import json, shutil, subprocess, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, envelope

ROOT = pathlib.Path(__file__).resolve().parents[3]
args = sys.argv[1:]
P = project(args[0]); work = P / "work"
audio, rawj, words_j = work / "clean-audio.m4a", work / "clean.raw.json", work / "clean.whisper.words.json"
if "--no-transcribe" not in args:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(P / "renders/clean.mp4"), "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "160k", str(audio)], check=True)
    subprocess.run(["node", str(ROOT / "scripts/ru/transcribe.mjs"), str(audio), "--out", str(rawj)], check=True)
    subprocess.run(["node", str(ROOT / "scripts/ru/normalize-transcript.mjs"), str(rawj), "--media", str(audio), "--out", str(words_j)], check=True)
src = json.loads(words_j.read_text())
fx_path = work / "clean-fixes.json"
fx = json.loads(fx_path.read_text()) if fx_path.exists() else {}
key = lambda w: f'{w["text"]}@{w["start"]:.2f}'
drop = set(fx.get("drop", []))
out = []
for w in src["words"]:
    k = key(w)
    if k in drop: continue
    w = dict(w)
    if k in fx.get("times", {}): w["start"], w["end"] = fx["times"][k]
    w["text"] = fx.get("text", {}).get(k, fx.get("text", {}).get(w["text"], w["text"]))
    out.append(w)
missing = drop - {key(w) for w in src["words"]} | (set(fx.get("times", {})) - {key(w) for w in src["words"]})
if missing: raise SystemExit(f"нет таких слов в {words_j.name}: {sorted(missing)}")
db = envelope(P / "renders/clean.mp4"); n = len(db); moved = 0
for w in out:
    i0, i1 = int(w["start"] * 100), int(w["end"] * 100)
    if i0 < n and db[i0] < -38:
        loud = [k for k in range(i0, min(i1, n)) if db[k] > -32]
        if loud and loud[0] - i0 >= 6: w["start"] = round(loud[0] / 100 - 0.03, 2); moved += 1
out.sort(key=lambda w: w["start"])
if out and out[0]["start"] < 0.25: out[0]["start"] = 0.0
for k in range(1, len(out)):
    if out[k - 1]["end"] > out[k]["start"]: out[k - 1]["end"] = out[k]["start"]
edl_copy = work / "transcript.clean.edl.json"
if not edl_copy.exists() and (P / "transcript.clean.json").exists(): shutil.copy(P / "transcript.clean.json", edl_copy)
res = dict(src, words=out, text=" ".join(w["text"] for w in out), timeline="clean", source="whisper-1 по renders/clean.mp4 + work/clean-fixes.json")
# длительность — по текущему clean.mp4: с --no-transcribe расшифровка могла остаться от прошлой сборки (другой хвост)
dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(P / "renders/clean.mp4")],
                     capture_output=True, text=True, check=True).stdout.strip()
res["audio_duration_secs"] = round(float(dur), 3)
(P / "transcript.clean.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
print(len(out), "слов, сдвинуто начал:", moved); print(res["text"])
