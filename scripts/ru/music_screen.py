#!/usr/bin/env python3
# Screen of the brand music candidates (music-fetch.mjs) by measurement, before the customer listens.
#   python3 scripts/ru/music_screen.py [--dir brand/music/candidates] [--keep 30]
#   → <dir>/screen.json {id: {status: pass | cut | fail, reasons, bpm, beat, intro_s, excerpt_start, range_db, voice_share, score}}
# Rules (design 2026-10-26): tempo 80–125 BPM or no beat (a pad); the level reaches its working value within
# 4 s; the most even 25 s window spreads ≤ 8 dB; no clipping; the voice band 1–4 kHz is not crowded — the most
# crowded quarter of the batch is dropped (with ≥ 8 tracks; otherwise a share above 0.45). The best `keep`
# pass, the rest are cut. Tempo: Real SFX beats.py on the analysed stretch. numpy + ffmpeg only.
import json, os, subprocess, sys, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
import audio_measure as A

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BEATS = os.path.join(ROOT, ".claude", "skills", "real-sfx", "scripts", "beats.py")
SR = 22050
TEMPO = (80.0, 125.0)
MAX_INTRO_S, MAX_RANGE_DB, MAX_CLIP, EXCERPT_S, LOOK_S = 4.0, 8.0, 0.001, 25.0, 90.0


def tempo_of(x, sr):
    """(bpm or None, beat) from beats.py; confidence under 0.5 is a pad (no beat). Octaves fold into 80–125."""
    with tempfile.TemporaryDirectory() as d:
        wav, out = os.path.join(d, "a.wav"), os.path.join(d, "b.json")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "1", "-ar", str(sr), "-i", "-", wav],
                       input=x.astype("<f4").tobytes(), check=True)
        r = subprocess.run([sys.executable, BEATS, wav, "--out", out], capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(out): return None, False
        b = json.load(open(out))
    if (b.get("confidence") or 0) < 0.5: return None, False
    bpm = float(b["tempo"])
    while bpm > TEMPO[1] and bpm / 2 >= 60: bpm /= 2
    while bpm < TEMPO[0] and bpm * 2 <= TEMPO[1]: bpm *= 2
    return round(bpm, 1), True


def measure(path):
    x = A.decode(path, sr=SR, seconds=LOOK_S + 10)
    m = {"reasons": [], "bpm": None, "beat": False}
    if len(x) < 40 * SR:
        m["reasons"].append("short"); return m
    m["clip"] = round(A.clip_fraction(x), 5)
    if m["clip"] > MAX_CLIP: m["reasons"].append("clipping")
    m["intro_s"] = A.intro_seconds(x, SR)
    if m["intro_s"] > MAX_INTRO_S: m["reasons"].append("intro")
    if m["reasons"]: return m
    start, rng = A.steadiest_window(x, SR, m["intro_s"], EXCERPT_S, LOOK_S)
    m["excerpt_start"], m["range_db"] = start, round(rng, 1)
    if rng > MAX_RANGE_DB:
        m["reasons"].append("uneven"); return m
    m["voice_share"] = round(A.band_share(x[int(start * SR): int((start + EXCERPT_S) * SR)], SR), 3)
    m["bpm"], m["beat"] = tempo_of(x[int(m["intro_s"] * SR):], SR)
    if m["beat"] and not TEMPO[0] <= m["bpm"] <= TEMPO[1]: m["reasons"].append("tempo")
    return m


def screen(paths, keep):
    """{id: path} → {id: measurement + status}."""
    out = {i: measure(p) for i, p in paths.items()}
    ok = [i for i, m in out.items() if not m["reasons"]]
    shares = [out[i]["voice_share"] for i in ok]
    cut = float(np.percentile(shares, 75)) if len(shares) >= 8 else 0.45
    for i in ok:
        if out[i]["voice_share"] > cut + 1e-9: out[i]["reasons"].append("voice-band")
    ok = [i for i in ok if not out[i]["reasons"]]
    for i in ok: out[i]["score"] = round(-out[i]["range_db"] - 20 * out[i]["voice_share"], 2)
    ok.sort(key=lambda i: -out[i]["score"])
    for i, m in out.items():
        m["status"] = "fail" if m["reasons"] else ("pass" if ok.index(i) < keep else "cut")
    return out


def main():
    a = sys.argv[1:]
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    d = os.path.abspath(opt("--dir", os.path.join(ROOT, "brand", "music", "candidates")))
    keep = int(opt("--keep", 30))
    cands = json.load(open(os.path.join(d, "candidates.json")))
    paths = {i: (c["file"] if os.path.isabs(c["file"]) else os.path.join(ROOT, c["file"])) for i, c in cands.items()}
    res = screen({i: p for i, p in paths.items() if os.path.exists(p)}, keep)
    json.dump(res, open(os.path.join(d, "screen.json"), "w"), ensure_ascii=False, indent=1)
    st = [m["status"] for m in res.values()]
    why = {}
    for m in res.values():
        for r in m["reasons"]: why[r] = why.get(r, 0) + 1
    print(f"{len(res)} tracks: {st.count('pass')} pass, {st.count('cut')} cut, {st.count('fail')} fail {why}")
    print(f"→ {os.path.relpath(os.path.join(d, 'screen.json'), ROOT)}")


if __name__ == "__main__":
    main()
