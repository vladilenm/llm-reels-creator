#!/usr/bin/env python3
# S4b «Звуковые акценты»: quiet SFX synthesised locally (numpy, no samples, no paid calls).
#   python3 scripts/ru/fx/sfx.py <project>   →  <project>/fx/sfx.wav (48 kHz stereo, clean length) + fx/sfx.json
#
# <project>/fx/fx.json:
#   location_joins: [t]                 a whoosh on each (never before the last word has ended)
#   sfx: [{name, kind, word | t, after?, offset?, gain, pan?, f?}]
#     kind: whoosh | whoosh_big | pop | click | tick | chime | hit
#     word: first transcript word (punctuation and case ignored) starting at or after `after`
# Kit: real samples from fx.json "sfx_kit" (default brand/sfx/<kind>.wav|mp3) replace the synth per kind;
#   pop/chime samples are pitched by "f". Missing kinds fall back to the synth.
# Levels follow .claude/skills/vladilen-reels/references/sound-rules.md: main hit ≤ 0.3,
# transitions 0.15, helpers 0.06–0.12. Never place a sound inside a word on purpose.
import json, os, subprocess, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def env(n, a, d):
    e = np.ones(n); a = max(1, int(a * SR)); e[:a] = np.linspace(0, 1, a)
    e[a:] = np.exp(-np.linspace(0, d, n - a)); return e


def lowpass(x, cut):
    y = np.zeros_like(x); k = 1 - np.exp(-2 * np.pi * np.broadcast_to(cut, x.shape) / SR); s = 0.0
    for i in range(len(x)):
        s += k[i] * (x[i] - s); y[i] = s
    return y


def whoosh(length=0.42, lo=300, hi=3800, big=False):
    n = int(length * SR); t = np.linspace(0, 1, n)
    cut = lo + (hi - lo) * np.sin(np.pi * t) ** 2
    x = lowpass(rng.standard_normal(n), cut) - lowpass(rng.standard_normal(n), cut * 0.25)
    x *= np.sin(np.pi * t) ** (1.6 if big else 2.2)
    if big: x += 0.5 * np.sin(2 * np.pi * (70 - 30 * t) * t * length) * np.exp(-4 * t)
    return x


def pop(f=660, length=0.09):
    n = int(length * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * (f * (1 + 0.6 * np.exp(-t * 60))) * t) * env(n, 0.002, 9)


def click(length=0.03):
    n = int(length * SR); t = np.arange(n) / SR
    return (0.6 * rng.standard_normal(n) + np.sin(2 * np.pi * 2400 * t)) * env(n, 0.0005, 14)


def tick(length=0.025):
    n = int(length * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * 1760 * t) * env(n, 0.0005, 10)


def chime(f=880, length=0.45):
    n = int(length * SR); t = np.arange(n) / SR
    a = np.sin(2 * np.pi * f * t) * env(n, 0.003, 7)
    b = np.zeros(n); k = int(0.07 * SR); b[k:] = np.sin(2 * np.pi * f * 1.5 * t[: n - k]) * env(n - k, 0.003, 7)
    return a + 0.8 * b


def hit(length=0.6):
    n = int(length * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (55 + 90 * np.exp(-t * 18)) * t) * env(n, 0.002, 6)
    return body + 0.5 * lowpass(rng.standard_normal(n), 2500) * env(n, 0.001, 40)


KINDS = {
    "whoosh": lambda e: whoosh(), "whoosh_big": lambda e: whoosh(0.55, 200, 3000, big=True),
    "whoosh_small": lambda e: whoosh(0.3, 500, 2500), "pop": lambda e: pop(e.get("f", 660)),
    "click": lambda e: click(), "tick": lambda e: tick(), "chime": lambda e: chime(e.get("f", 880)), "hit": lambda e: hit(),
}


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
BASE_F = {"pop": 660, "chime": 880}          # a kit sample is pitched by e["f"] / BASE_F
_kit_cache = {}


def kit_sample(kit, kind):
    """brand/sfx/<kind>.wav|mp3 (mono mix, 48 kHz) or None — real samples beat the synth."""
    if not kit: return None
    for ext in ("wav", "mp3", "m4a"):
        p = os.path.join(kit, f"{kind}.{ext}")
        if os.path.exists(p):
            if p not in _kit_cache:
                r = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
                x = np.frombuffer(r.stdout, "<f4").astype(np.float64)
                nz = np.nonzero(np.abs(x) > 0.01 * (np.abs(x).max() + 1e-9))[0]   # trim leading silence: hit lands on time
                _kit_cache[p] = x[nz[0]:] if len(nz) else x
            return _kit_cache[p]
    return None


def make(kind, e, kit):
    x = kit_sample(kit, kind)
    if x is None: return KINDS[kind](e)
    if kind in BASE_F and "f" in e:              # pitch by resampling (pops rise along a sequence)
        r = e["f"] / BASE_F[kind]; idx = np.arange(0, len(x) - 1, r)
        x = np.interp(idx, np.arange(len(x)), x)
    return x


def norm(s):
    return s.strip(".,!?«»…:;").lower()


def main():
    if len(sys.argv) < 2:
        print("usage: sfx.py <project>"); sys.exit(1)
    P = os.path.abspath(sys.argv[1])
    cfg = json.load(open(os.path.join(P, "fx", "fx.json")))
    tr = json.load(open(os.path.join(P, "transcript.clean.json")))
    words, dur = tr["words"], float(tr["audio_duration_secs"])
    kit = os.path.join(ROOT, cfg.get("sfx_kit", "brand/sfx"))
    kit = kit if os.path.isdir(kit) else None

    def at(word, after=0.0):
        for w in words:
            if w["start"] >= after - 1e-6 and norm(w["text"]) == norm(word): return w["start"]
        raise KeyError(f"word «{word}» after {after}")

    def prev_end(t):
        return max([w["end"] for w in words if w["end"] <= t + 1e-6] or [0.0])

    ev = []
    for j in cfg.get("location_joins", []):
        ev.append(dict(name=f"переход {j:.2f}", t=max(j - 0.12, prev_end(j) + 0.03), x=make("whoosh", {}, kit), gain=0.15, pan=0.0))
    for e in cfg.get("sfx", []):
        t = e["t"] if "t" in e else at(e["word"], e.get("after", 0.0))
        t += e.get("offset", 0.0)
        inside = [w["text"] for w in words if w["start"] + 0.04 < t < w["end"] - 0.04]
        if inside and e["kind"] not in ("whoosh", "whoosh_big", "whoosh_small", "hit"):
            print(f"WARN {e['name']}: {t:.2f} is inside the word «{inside[0]}»")
        ev.append(dict(name=e["name"], t=t, x=make(e["kind"], e, kit), gain=e["gain"], pan=e.get("pan", 0.0)))

    out = np.zeros((int(dur * SR) + SR, 2)); log = []
    for e in ev:
        x = e["x"] / (np.max(np.abs(e["x"])) + 1e-9) * e["gain"]
        i = int(round(e["t"] * SR)); x = x[: max(0, len(out) - i)]
        l, r = np.sqrt((1 - e["pan"]) / 2), np.sqrt((1 + e["pan"]) / 2)
        out[i:i + len(x), 0] += x * l * 1.414; out[i:i + len(x), 1] += x * r * 1.414
        log.append({"t": round(e["t"], 3), "name": e["name"], "gain": e["gain"]})
    out = out[: int(dur * SR)]
    pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")
    with wave.open(os.path.join(P, "fx", "sfx.wav"), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    json.dump(sorted(log, key=lambda e: e["t"]), open(os.path.join(P, "fx", "sfx.json"), "w"), ensure_ascii=False, indent=1)
    print(f"kit: {os.path.relpath(kit, ROOT) if kit else 'none (synth)'}")
    print(f"{len(log)} events → fx/sfx.wav, peak {float(np.max(np.abs(out))):.3f}")


if __name__ == "__main__":
    main()
