"""Shared bits for wide OBS recordings (Reels-wide-*.mp4, OBS profile «Рилсы широкий 4104x1964»).

Frame map: x 0–1080, y 0–1920 — the reels layout (template placeholders on top, camera card at the bottom);
x 1080–4104, y 0–1964 — the Mac screen 1:1. Times: «src» = assets/raw.mp4, «clean» = renders/clean.mp4
(EDL.json keep ranges)."""
import json, pathlib, subprocess
import numpy as np

LAYOUT = (0, 0, 1080, 1920)                 # x, y, w, h in the wide frame
SCREEN = (1080, 0, 3024, 1964)
CARD = (46, 1098, 1035, 1921)               # camera card bbox inside the layout (x0, y0, x1, y1)
DOCK = 1830                                 # screen y where the macOS dock starts: never framed
WIN_CANVAS = (900, 428)                     # window canvas: screen-kit win w 900, h 480, bar 52


def project(p):
    P = pathlib.Path(p).resolve()
    if not (P / "assets").is_dir(): raise SystemExit(f"{p}: not a reel project (no assets/)")
    return P


def raw(P):
    return P / "assets" / "raw.mp4"


def fps(P):
    try: return float(json.loads((P / "PROBE.json").read_text())["summary"]["fps"])
    except Exception: return 25.0


def keep_ranges(P):
    return [(k["start"], k["end"]) for k in json.loads((P / "EDL.json").read_text())["keep_ranges"]]


def c2s_fn(P):
    K = keep_ranges(P)
    def c2s(t):
        acc = 0.0
        for a, b in K:
            if t < acc + (b - a) + 1e-9: return a + (t - acc)
            acc += b - a
        return K[-1][1]
    return c2s


def s2c_fn(P):
    K = keep_ranges(P)
    def s2c(t):
        acc = 0.0
        for a, b in K:
            if a - 1e-9 <= t <= b + 1e-9: return acc + t - a
            acc += b - a
        return None
    return s2c


def joins(P):
    acc, out = 0.0, []
    for a, b in keep_ranges(P)[:-1]:
        acc += b - a; out.append(round(acc, 3))
    return out


def envelope(path, cache=None, sr=16000, hop=160):
    """RMS in dBFS per 10 ms, mono 16 kHz. Cached as .npy when `cache` is given."""
    if cache and pathlib.Path(cache).exists(): return np.load(cache)
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768; n = len(a) // hop
    db = 20 * np.log10(np.sqrt((a[: n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
    if cache: pathlib.Path(cache).parent.mkdir(parents=True, exist_ok=True); np.save(cache, db)
    return db


def pcm16k(path):
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768


def f0_voicing(a, t0, t1, sr=16000):
    """Median f0 (Hz) and share of voiced 40 ms frames in [t0, t1): a frame is voiced when its autocorrelation has
    a real peak (local maximum, not the edge of the range) ≥ 0.5 at 70–300 Hz. Vladilen: f0 95–180 Hz, ≳ 40 % voiced."""
    f0s, n = [], 0
    lo, hi = sr // 300, sr // 70
    for t in np.arange(t0, t1, 0.04):
        x = a[int(t * sr): int(t * sr) + 640]
        if len(x) < 640: break
        x = x - x.mean(); n += 1
        if np.sqrt((x ** 2).mean()) < 1e-3: continue
        r = np.correlate(x, x, "full")[639:]; r /= r[0] + 1e-9
        seg = r[lo - 1: hi + 2]
        peaks = [k for k in range(1, len(seg) - 1) if seg[k] > seg[k - 1] and seg[k] >= seg[k + 1]]
        if not peaks: continue
        k = max(peaks, key=lambda k: seg[k])
        if seg[k] >= 0.5: f0s.append(sr / (lo - 1 + k))
    return (float(np.median(f0s)) if f0s else 0.0), (len(f0s) / n if n else 0.0)
