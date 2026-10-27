"""Shared measurements for the brand sound library (music_screen.py, sfx_screen.py, sound_review.py).
numpy + ffmpeg only, system python3. Functions take float samples in −1…1 (mono unless named x2) and a rate."""
import re, subprocess
import numpy as np


def channels(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels",
                        "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    m = re.match(r"\d+", r.stdout.strip())            # csv may carry a trailing comma ("2,")
    return int(m.group()) if m else 0


def decode(path, sr=22050, seconds=None, start=0.0, mono=True):
    # ffmpeg's mono → stereo upmix lowers each channel by 3 dB and would hide clipping: duplicate instead
    if not mono and channels(path) == 1:
        x = decode(path, sr, seconds, start, mono=True)
        return np.stack([x, x], 1)
    a = ["ffmpeg", "-v", "error"] + (["-ss", str(start)] if start else []) + ["-i", str(path)]
    a += (["-t", str(seconds)] if seconds else []) + ["-vn", "-ac", "1" if mono else "2", "-ar", str(sr), "-f", "f32le", "-"]
    r = subprocess.run(a, capture_output=True)
    if r.returncode != 0: raise RuntimeError(f"ffmpeg decode {path}: {r.stderr.decode()[-300:]}")
    x = np.frombuffer(r.stdout, "<f4").astype(np.float64)
    return x if mono else x.reshape(-1, 2)


def db(v):
    return float(20 * np.log10(max(float(v), 1e-9)))


def frame_rms_db(x, sr, win_s, hop_s):
    w, h = max(1, int(win_s * sr)), max(1, int(hop_s * sr))
    if len(x) < w: return np.array([db(np.sqrt((x ** 2).mean()))]) if len(x) else np.array([-180.0])
    n = 1 + (len(x) - w) // h
    idx = np.arange(w)[None, :] + h * np.arange(n)[:, None]
    return 20 * np.log10(np.sqrt((x[idx] ** 2).mean(axis=1)) + 1e-9)


def clip_fraction(x):
    return float((np.abs(x) >= 0.999).mean()) if len(x) else 0.0


def intro_seconds(x, sr, look_s=60.0, below_db=6.0):
    """Seconds until the 1 s level first comes within below_db of the median level of the first look_s."""
    lv = frame_rms_db(x[: int(look_s * sr)], sr, 1.0, 0.5)
    ref = float(np.median(lv[lv > -70])) if (lv > -70).any() else -70.0
    hit = np.nonzero(lv >= ref - below_db)[0]
    return float(hit[0] * 0.5) if len(hit) else float(len(x) / sr)


def loudness_range_db(x, sr):
    """Spread of the 3 s level (hop 1 s): 95th minus 10th percentile, dB."""
    lv = frame_rms_db(x, sr, 3.0, 1.0)
    return float(np.percentile(lv, 95) - np.percentile(lv, 10))


def steadiest_window(x, sr, start_s, dur_s=25.0, until_s=90.0):
    """(start, range_db) of the most even dur_s window between start_s and until_s, 1 s steps."""
    best = (float(start_s), float("inf"))
    last = min(until_s, len(x) / sr) - dur_s
    for s in np.arange(start_s, max(start_s, last) + 1e-9, 1.0):
        r = loudness_range_db(x[int(s * sr): int((s + dur_s) * sr)], sr)
        if r < best[1] - 1e-9: best = (float(s), r)
    return best


def band_share(x, sr, lo=1000.0, hi=4000.0, total=(50.0, 10000.0)):
    """Share of the power between lo and hi Hz (the voice's presence band) within total."""
    n = 4096
    if len(x) < n: x = np.pad(x, (0, n - len(x)))
    frames = x[: (len(x) // n) * n].reshape(-1, n) * np.hanning(n)
    p = (np.abs(np.fft.rfft(frames, axis=1)) ** 2).sum(axis=0)
    f = np.fft.rfftfreq(n, 1 / sr)
    band, tot = p[(f >= lo) & (f < hi)].sum(), p[(f >= total[0]) & (f < total[1])].sum()
    return float(band / tot) if tot > 0 else 0.0


def audible_span(x, sr, floor_db=-40.0):
    """(start, end) seconds of what is louder than floor_db under the peak."""
    env = np.abs(x)
    pk = env.max() if len(env) else 0.0
    if pk <= 0: return 0.0, 0.0
    on = np.nonzero(env >= pk * 10 ** (floor_db / 20))[0]
    return float(on[0] / sr), float((on[-1] + 1) / sr)


def attack_ms(x, sr):
    """Milliseconds from the first moment within 20 dB of the peak to the peak (2 ms envelope, 1 ms hop)."""
    e = frame_rms_db(x, sr, 0.002, 0.001)
    k = int(np.argmax(e))
    first = int(np.nonzero(e >= e[k] - 20)[0][0])
    return float(k - first)


def hiss(x, sr, frame=1024):
    """(level dB under the peak, spectral flatness 0…1) of the quietest tenth of frames inside the audible span.
    Broadband hiss is flat (about 0.5); a tonal or band-limited tail is not (under 0.2).
    (None, None) when the sound is shorter than one frame."""
    a, b = audible_span(x, sr)
    seg = x[int(a * sr): int(b * sr)]
    n = len(seg) // frame
    if n < 1: return None, None
    fr = seg[: n * frame].reshape(n, frame)
    lv = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)
    quiet = lv <= np.percentile(lv, 10)
    f = np.fft.rfftfreq(frame, 1 / sr)
    band = (f >= 100) & (f <= min(16000.0, sr / 2 - 1))
    p = np.abs(np.fft.rfft(fr[quiet] * np.hanning(frame), axis=1))[:, band] ** 2 + 1e-20
    flat = float(np.mean(np.exp(np.log(p).mean(axis=1)) / p.mean(axis=1)))
    return float(np.median(lv[quiet]) - db(np.abs(seg).max())), flat


def centroid_hz(x, sr):
    p = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / sr)
    return float((f * p).sum() / p.sum()) if p.sum() > 0 else 0.0


def stereo_corr(x2):
    """Correlation of the two channels: 1 the same, about 0 unrelated, negative in antiphase (vanishes in mono)."""
    if x2.ndim == 1 or x2.shape[1] < 2: return 1.0
    a, b = x2[:, 0], x2[:, 1]
    if a.std() == 0 or b.std() == 0: return 1.0
    return float(np.corrcoef(a, b)[0, 1])
