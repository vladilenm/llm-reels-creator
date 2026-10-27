#!/usr/bin/env python3
# S4c «Звуковой слой»: voice polish + click-free joins + music bed with ducking + SFX → one mix.
#   python3 scripts/ru/fx/sound.py <project> [--music file] [--variant B] [--no-music] [--stems]
#   →  <project>/fx/mix[.<variant>].wav (48 kHz stereo, clean length) + fx/sound[.<variant>].json
#   python3 scripts/ru/fx/sound.py <project> --plan [--music f] [--bpm n] [--variant B]
#   →  work/sound/music[.B].wav only: the music aligned to the clean timeline (ducked, stops) — for sfx_real.py
#   --sfx fx/sfx.B.wav   mix this SFX track (an sfx_real.py variant) instead of "sound.sfx"
#   --level -13 --duck -5   override sound.music level_db / duck_db for this run
#
# numpy + ffmpeg only (system python3). Settings live in <project>/fx/fx.json under "sound":
#   voice:     {chain: "default" | "off" | "<ffmpeg -af string>", denoise: "auto" | true | false}
#   join_fade_ms: 6                    raised-cosine dip at every audio join of renders/clean.mp4
#   sfx:       "fx/sfx.wav"            (scripts/ru/fx/sfx.py) — kept at its level relative to the voice
#   music: {
#     src:      "brand/music/x.mp3"    (or --music); omit the block for a voice-only mix
#     bpm:      100                    tempo hint for the beat grid (music-grid.mjs, ±6 %)
#     start:    "auto" | seconds       offset into the track; auto puts key events on beats
#     align:    [t | {word, after?} | {t, w}]  extra events to land on beats (titles, joins, hits are added)
#     level_db: -16                    music RMS against the voice RMS while nobody speaks
#     duck_db:  -9                     extra cut under speech (≈ 65 % amplitude, sound-rules.md)
#     stops:    [{word, after?, lead: 0.25, back_word?, back_after?: 0.15}]
#               music drops out «lead» s before the word, returns at back_word or «back_after» s
#               after the word ends — a stop-down before a punchline; the grid keeps running
#     fade_in:  0.03, fade_out: 1.2
#   }
# Levels follow .claude/skills/vladilen-reels/references/sound-rules.md. Loudness (−14 LUFS)
# is set later by scripts/ru/export-reel.mjs; this script only keeps the mix below 0 dBFS.
import json, os, subprocess, sys
import numpy as np

SR = 48000
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GRID = os.path.join(ROOT, ".claude/skills/motion-showreel/scripts/music-grid.mjs")
VOICE_CHAIN = ",".join([
    "highpass=f=75",
    "equalizer=f=250:t=q:w=1.2:g=-2",          # less boxy room
    "equalizer=f=4200:t=q:w=1.0:g=2",          # presence
    "deesser=i=0.35",
    "acompressor=threshold=-22dB:ratio=3:attack=8:release=140:knee=4:makeup=2",
])


def decode(path, ss=None):
    a = ["ffmpeg", "-v", "error"] + (["-ss", str(ss)] if ss else []) + ["-i", path, "-vn", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    r = subprocess.run(a, capture_output=True)
    if r.returncode != 0: raise RuntimeError(f"ffmpeg decode {path}: {r.stderr.decode()[-300:]}")
    return np.frombuffer(r.stdout, "<f4").reshape(-1, 2).astype(np.float64)


def ffilter(x, af):
    r = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", "-af", af,
                        "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], input=x.astype("<f4").tobytes(), capture_output=True)
    if r.returncode != 0: raise RuntimeError(f"ffmpeg filter: {r.stderr.decode()[-300:]}")
    y = np.frombuffer(r.stdout, "<f4").reshape(-1, 2).astype(np.float64)
    return fit(y, len(x))


def write_wav(path, x):
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", "-c:a", "pcm_s24le", path],
                       input=x.astype("<f4").tobytes(), capture_output=True)
    if r.returncode != 0: raise RuntimeError(f"ffmpeg write {path}: {r.stderr.decode()[-300:]}")


def fit(x, n):
    return x[:n] if len(x) >= n else np.vstack([x, np.zeros((n - len(x), 2))])


def db(v):
    return float(20 * np.log10(max(float(v), 1e-9)))


def frame_rms(x, hop=480):                      # 10 ms frames, mono
    m = x.mean(axis=1); n = len(m) // hop
    return np.sqrt((m[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)


def smooth_gain(target_db, hop_s, attack, release):
    """One-pole smoothing of a per-frame gain curve (dB): fast going down, slow coming back."""
    out = np.empty_like(target_db); g = target_db[0]
    ka, kr = 1 - np.exp(-hop_s / attack), 1 - np.exp(-hop_s / release)
    for i, t in enumerate(target_db):
        g += (t - g) * (ka if t < g else kr); out[i] = g
    return out


def to_samples(curve, hop, n):
    idx = np.arange(n) / hop
    return np.interp(idx, np.arange(len(curve)), curve)


def norm(s):
    return s.strip(".,!?«»…:;\"").lower()


class Words:
    def __init__(self, words): self.w = words

    def find(self, word, after=0.0):
        for w in self.w:
            if w["start"] >= after - 1e-6 and norm(w["text"]) == norm(word): return w
        raise KeyError(f"word «{word}» after {after}")

    def speech_mask(self, n, pad=0.04):
        m = np.zeros(n, bool)
        for w in self.w:
            m[max(0, int((w["start"] - pad) * SR)): int((w["end"] + pad) * SR)] = True
        return m


# ---------- voice ----------

def audio_joins(P):
    edl = json.load(open(os.path.join(P, "EDL.json")))
    d = np.cumsum([r["end"] - r["start"] for r in edl["keep_ranges"]])
    return [float(t) for t in d[:-1]]


def dip_joins(x, joins, ms):
    h = max(1, int(ms / 1000 * SR)); win = 0.5 - 0.5 * np.cos(np.pi * np.arange(h) / h)   # 0 → 1
    for t in joins:
        i = int(round(t * SR))
        a, b = max(0, i - h), min(len(x), i + h)
        x[a:i] *= win[::-1][h - (i - a):, None]       # … → 0 at the join
        x[i:b] *= win[: b - i, None]                  # 0 → …
    return x


def voice_layer(P, cfg, words, n, rep):
    x = fit(decode(os.path.join(P, "renders", "clean.mp4")), n)
    speech = words.speech_mask(n)
    gaps = x[~speech]
    floor = db(np.sqrt((gaps ** 2).mean())) if len(gaps) > SR * 0.3 else None
    active0 = db(np.sqrt((x[speech] ** 2).mean()))
    joins = audio_joins(P)
    fade = cfg.get("join_fade_ms", 6)
    if fade: x = dip_joins(x, joins, fade)
    vc = cfg.get("voice", {})
    chain = vc.get("chain", "default")
    chain = VOICE_CHAIN if chain == "default" else ("" if chain == "off" else chain)
    dn = vc.get("denoise", "auto")
    use_dn = dn is True or (dn == "auto" and floor is not None and floor > -52)
    if use_dn: chain = "afftdn=nr=10:nf=-50:tn=1" + ("," + chain if chain else "")
    if chain: x = ffilter(x, chain)
    active1 = db(np.sqrt((x[speech] ** 2).mean()))
    x *= 10 ** ((active0 - active1) / 20)        # keep the voice where the SFX levels were set
    rep["voice"] = {"noise_floor_dbfs": None if floor is None else round(floor, 1), "denoise": use_dn,
                    "chain": chain or "off", "joins_faded": len(joins) if fade else 0, "join_fade_ms": fade,
                    "speech_rms_dbfs": round(active0, 1), "peak_dbfs": round(db(np.abs(x).max()), 1)}
    return x, speech, active0


# ---------- music ----------

def beat_grid(src, bpm, scratch):
    out = os.path.join(scratch, "grid.json")
    r = subprocess.run(["node", GRID, src, "--bpm", str(bpm), "--json", out], capture_output=True, text=True)
    if r.returncode != 0: raise RuntimeError(f"music-grid: {r.stderr[-300:]}")
    g = json.load(open(out))
    return g["period"], g["phase"]


def key_events(P, fx, mc, words):
    """Times on the clean timeline that should land on a beat, with weights (downbeat-worthy first)."""
    ev = []
    for t in fx.get("titles", []):
        if "reveal" in t: ev.append((float(t["reveal"][0]), 3.0))
    for e in fx.get("sfx", []):
        if e.get("kind") == "hit":
            t = e["t"] if "t" in e else words.find(e["word"], e.get("after", 0.0))["start"]
            ev.append((t + e.get("offset", 0.0), 3.0))
    for j in fx.get("location_joins", []): ev.append((float(j), 1.5))
    for a in mc.get("align", []):
        if isinstance(a, (int, float)): ev.append((float(a), 1.0))
        elif "t" in a: ev.append((float(a["t"]), float(a.get("w", 1.0))))
        else: ev.append((words.find(a["word"], a.get("after", 0.0))["start"], float(a.get("w", 1.0))))
    return sorted(ev)


def align_score(events, period, phase, o):
    """Weighted closeness of events to beats; main events (w ≥ 3) also prefer the downbeat."""
    s = 0.0
    for t, w in events:
        d = ((t + o - phase) / period) % 1.0; d = min(d, 1 - d) * period
        s += w * np.exp(-(d / 0.03) ** 2 / 2)
        if w >= 3:
            q = ((t + o - phase) / (4 * period)) % 1.0; q = min(q, 1 - q) * 4 * period
            s += 0.5 * np.exp(-(q / 0.03) ** 2 / 2)
    return s


def choose_offset(events, period, phase, track_len, dur):
    """Offset into the track within the first bar (alignment repeats every bar, the intro stays)."""
    hi = min(max(0.0, track_len - dur), 4 * period)
    if not events: return 0.0, []
    best, best_o = -1.0, 0.0
    for o in np.arange(0.0, hi + 1e-9, 0.005):
        sc = align_score(events, period, phase, o)
        if sc > best + 1e-6: best, best_o = sc, float(o)
    return best_o, None


def suggest_bpm(events, lo=84, hi=132):
    """Tempos at which the reel's own events fall on beats — a brief for generated music."""
    res = []
    for bpm in np.arange(lo, hi + 0.01, 0.5):
        period = 60 / bpm; best = (-1, 0)
        for o in np.arange(0, 4 * period, 0.005):
            sc = align_score(events, period, 0.0, o)
            if sc > best[0]: best = (sc, o)
        offs = [abs(on_beat(t, t + best[1], period, 0.0)) for t, _ in events]
        res.append((best[0] / sum(w for _, w in events), float(bpm), offs))
    return sorted(res, reverse=True)[:5]


def loop_to(x, n, period, phase):
    """Extend a short track by repeating whole bars from the last downbeat region, 40 ms crossfades."""
    if len(x) >= n: return x
    bar = int(round(4 * period * SR)); start = int(round(phase * SR)); xf = int(0.04 * SR)
    body = x[start:]; loops = [x]
    total = len(x)
    while total < n:
        seg = body[: (len(body) // bar) * bar] if len(body) >= bar else body
        loops.append(seg); total += len(seg) - xf
    y = loops[0]
    ramp = np.linspace(0, 1, xf)[:, None]
    for seg in loops[1:]:
        y = np.vstack([y[:-xf], y[-xf:] * (1 - ramp) + seg[:xf] * ramp, seg[xf:]])
    return y


def stop_windows(mc, words):
    """[(a, b, restart)] on the clean timeline: music out from a, back at b."""
    out = []
    for s in mc.get("stops", []):
        w = words.find(s["word"], s.get("after", 0.0))
        a = w["start"] - s.get("lead", 0.25)
        b = words.find(s["back_word"], w["start"])["start"] if "back_word" in s else w["end"] + s.get("back_after", 0.15)
        out.append((a, b, s.get("restart", True), s["word"]))
    return sorted(out)


def on_beat(t, tt, period, phase):
    d = ((tt - phase) / period) % 1.0; d = (d if d < 0.5 else d - 1) * period
    return round(d * 1000)


def music_layer(P, fx, mc, words, n, speech, voice_rms, scratch, rep):
    src = mc["src"] if os.path.isabs(mc["src"]) else next(
        (p for p in (os.path.join(P, mc["src"]), os.path.join(ROOT, mc["src"])) if os.path.exists(p)), mc["src"])
    raw = decode(src); dur = n / SR
    period, phase = beat_grid(src, mc.get("bpm", 100), scratch)
    bar = 4 * period
    stops = stop_windows(mc, words)
    events = key_events(P, fx, mc, words)
    first_restart = next((a for a, b, r, _ in stops if r), dur)
    start = mc.get("start", "auto")
    if start == "auto": off, _ = choose_offset([e for e in events if e[0] < first_restart], period, phase, len(raw) / SR, min(dur, first_restart))
    else: off = float(start)

    # segments [(clean_t, track_t)]: a restart re-enters on the next downbeat after the stop began
    segs = [(0.0, off)]
    for a, b, r, _ in stops:
        if not r: continue
        t0, o0 = segs[-1]; ta = o0 + (a - t0)
        k = np.ceil((ta - phase) / bar - 1e-6); segs.append((b, phase + k * bar))
    need = max(o + dur for _, o in segs) + 1
    full = loop_to(raw, int(need * SR), period, phase)
    m = np.zeros((n, 2))
    for i, (t0, o0) in enumerate(segs):
        t1 = segs[i + 1][0] if i + 1 < len(segs) else dur
        a, b = int(t0 * SR), min(n, int(t1 * SR)); c = int(o0 * SR)
        m[a:b] = fit(full[c: c + (b - a)], b - a)
    track_t = lambda t: next(o0 + (t - t0) for t0, o0 in reversed(segs) if t >= t0)
    rows = [{"t": round(t, 3), "weight": w, "off_beat_ms": on_beat(t, track_t(t), period, phase)} for t, w in events]

    # level: music RMS = voice RMS + level_db (measured where it plays)
    playing = np.ones(n, bool)
    for a, b, _, _ in stops: playing[int(a * SR): int(b * SR)] = False
    m *= 10 ** ((voice_rms + mc.get("level_db", -16) - db(np.sqrt((m[playing] ** 2).mean()))) / 20)

    # ducking under speech (word-timed, so it never pumps on breaths)
    hop = 480; nf = n // hop + 1
    sp = np.array([speech[i * hop: (i + 1) * hop].any() for i in range(nf)])
    g = smooth_gain(np.where(sp, float(mc.get("duck_db", -9)), 0.0), hop / SR, attack=0.03, release=0.30)
    gain = 10 ** (to_samples(g, hop, n) / 20)
    for a, b, _, _ in stops:                                   # hard stop-downs: 40 ms out, 15 ms back in
        ia, ib = int(a * SR), int(b * SR); fo, fi = int(0.04 * SR), int(0.015 * SR)
        gain[ia: ia + fo] *= np.linspace(1, 0, len(gain[ia: ia + fo]))
        gain[ia + fo: ib] = 0
        gain[ib: ib + fi] *= np.linspace(0, 1, len(gain[ib: ib + fi]))
    fi, fo = int(mc.get("fade_in", 0.03) * SR), int(mc.get("fade_out", 1.2) * SR)
    if fi: gain[:fi] *= np.linspace(0, 1, fi)
    if fo: gain[-fo:] *= np.linspace(1, 0, fo) ** 2
    m *= gain[:, None]

    under = m[speech]; free = m[~speech & (gain > 0.5)]
    rep["music"] = {"src": os.path.relpath(src, ROOT), "bpm": round(60 / period, 2), "phase_s": round(phase, 3),
                    "offset_s": round(off, 3), "segments": [[round(t, 3), round(o, 3)] for t, o in segs],
                    "events_on_beat": rows,
                    "under_speech_db_vs_voice": round(db(np.sqrt((under ** 2).mean())) - voice_rms, 1) if len(under) else None,
                    "between_phrases_db_vs_voice": round(db(np.sqrt((free ** 2).mean())) - voice_rms, 1) if len(free) else None,
                    "stops": [{"word": w, "out": round(a, 3), "back": round(b, 3), "restart_on_downbeat": r} for a, b, r, w in stops]}
    return m


# ---------- main ----------

def main():
    a = sys.argv[1:]
    if not a or a[0].startswith("--"):
        print(__doc__ or "usage: sound.py <project> [--music file] [--variant B] [--no-music] [--stems]"); sys.exit(1)
    P = os.path.abspath(a[0])
    opt = lambda k: a[a.index(k) + 1] if k in a else None
    fx = json.load(open(os.path.join(P, "fx", "fx.json")))
    cfg = dict(fx.get("sound", {}))
    mc = dict(cfg.get("music", {}))
    if opt("--music"): mc["src"] = opt("--music")
    if opt("--bpm"): mc["bpm"] = float(opt("--bpm"))
    if opt("--level"): mc["level_db"] = float(opt("--level"))
    if opt("--duck"): mc["duck_db"] = float(opt("--duck"))
    if "--no-music" in a: mc = {}
    var = opt("--variant"); suf = f".{var}" if var else ""
    tr = json.load(open(os.path.join(P, "transcript.clean.json")))
    words = Words([w for w in tr["words"] if w.get("type", "word") == "word"])
    n = int(round(float(tr["audio_duration_secs"]) * SR))
    scratch = os.path.join(P, "work", "sound"); os.makedirs(scratch, exist_ok=True)
    rep = {"variant": var}

    if "--suggest-bpm" in a:
        ev = key_events(P, fx, mc, words); first = next((x for x, _, r, _ in stop_windows(mc, words) if r), 1e9)
        ev = [e for e in ev if e[0] < first]                     # after a restart the grid re-phases itself
        print(f"{len(ev)} events before the first restart: " + ", ".join(f"{t:.2f}×{w:g}" for t, w in ev))
        for sc, bpm, offs in suggest_bpm(ev):
            print(f"bpm {bpm:6.1f}  score {sc:.2f}  off-beat ms {offs}")
        return

    if "--plan" in a:
        if not mc.get("src"):
            print("no music in fx.json sound.music and no --music: nothing to plan"); return
        v, speech, vrms = voice_layer(P, cfg, words, n, rep)
        m = music_layer(P, fx, mc, words, n, speech, vrms, scratch, rep)
        stem = os.path.join(scratch, f"music{suf}.wav"); write_wav(stem, m)
        json.dump(rep, open(os.path.join(P, "fx", f"sound{suf}.json"), "w"), ensure_ascii=False, indent=1)
        print(f"→ {os.path.relpath(stem, ROOT)} (music on the clean timeline, no mix)")
        return

    v, speech, vrms = voice_layer(P, cfg, words, n, rep)
    mix = v.copy()
    sfx_path = os.path.join(P, opt("--sfx") or cfg.get("sfx", "fx/sfx.wav"))
    if os.path.exists(sfx_path):
        s = fit(decode(sfx_path), n); mix += s
        rep["sfx"] = {"src": os.path.relpath(sfx_path, P), "peak_dbfs": round(db(np.abs(s).max()), 1)}
    m = None
    if mc.get("src"):
        m = music_layer(P, fx, mc, words, n, speech, vrms, scratch, rep)
        vp = np.abs(v[speech]).max(); mp = np.abs(m[speech]).max()
        rep["music"]["peak_under_speech_db_vs_voice_peak"] = round(db(mp) - db(vp), 1)
        mix += m
    peak = np.abs(mix).max()
    if peak > 0.89: mix *= 0.89 / peak                # headroom for loudnorm's true-peak limiter
    rep["mix"] = {"peak_dbfs": round(db(np.abs(mix).max()), 1), "duration_s": round(n / SR, 3)}

    out = os.path.join(P, "fx", f"mix{suf}.wav"); write_wav(out, mix)
    if "--stems" in a:
        write_wav(os.path.join(scratch, f"voice{suf}.wav"), v)
        if m is not None: write_wav(os.path.join(scratch, f"music{suf}.wav"), m)
    json.dump(rep, open(os.path.join(P, "fx", f"sound{suf}.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(rep, ensure_ascii=False, indent=1))
    print(f"→ {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
