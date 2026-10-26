#!/usr/bin/env python3
# Procedural lo-fi bed for a reel when brand/music has no licensed track: chords, soft bass,
# brushed drums and a little vinyl noise, synthesised with numpy (ours by construction,
# no samples, no paid calls). Meant to sit quietly under the voice (sound.py ducks it).
#
#   python3 scripts/ru/fx/music-bed.py <out.wav> [--bpm 106] [--seconds 60] [--seed 1]
#
# Claude cannot hear the result: the customer judges it by ear and swaps it for a real track
# (brand/music + tracks.json) whenever they like.
import sys, wave
import numpy as np

SR = 48000


def arg(name, default, cast=float):
    a = sys.argv
    return cast(a[a.index(name) + 1]) if name in a else default


def midi(n): return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a, r):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    tail = int(r * SR)
    if tail and tail < n: e[-tail:] *= np.linspace(1, 0, tail) ** 2
    return e


def lowpass(x, fc):
    k = 1 - np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)): acc += k * (x[i] - acc); y[i] = acc
    return y


def main():
    out = sys.argv[1]
    bpm, secs, seed = arg("--bpm", 106.0), arg("--seconds", 60.0), arg("--seed", 1, int)
    rng = np.random.default_rng(seed)
    beat = 60 / bpm; bar = 4 * beat
    N = int(secs * SR); L = np.zeros(N); R = np.zeros(N)
    # Am9 – Fmaj7 – Cmaj7 – G6, voiced around middle C
    prog = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 59, 64, 67], [55, 59, 62, 64, 71]]
    roots = [45, 41, 48, 43]
    nb = int(np.ceil(secs / bar))
    t_bar = np.arange(int(bar * SR)) / SR
    for b in range(nb):
        s0 = int(b * bar * SR); ch = prog[b % 4]
        n = min(len(t_bar), N - s0)
        if n <= 0: break
        tt = t_bar[:n]
        pad = np.zeros(n)
        for j, m in enumerate(ch):
            f = midi(m)
            for det, pan in ((-0.12, -1), (0.12, 1)):
                ff = f * 2 ** (det / 12 / 4)
                tone = np.sin(2 * np.pi * ff * tt) + 0.25 * np.sin(2 * np.pi * 2 * ff * tt) + 0.08 * np.sin(2 * np.pi * 3 * ff * tt)
                tone *= 1 + 0.04 * np.sin(2 * np.pi * 0.35 * tt + j)          # slow wobble
                pad += tone * (0.5 + 0.12 * pan * (j - 2))
        pad *= env(n, 0.35, 0.4) * 0.05
        L[s0:s0 + n] += pad; R[s0:s0 + n] += pad
        # bass on beats 1 and 3
        for k in (0, 2):
            p0 = s0 + int(k * beat * SR); m = int(beat * 1.8 * SR)
            if p0 >= N: continue
            m = min(m, N - p0); tb = np.arange(m) / SR
            bs = np.sin(2 * np.pi * midi(roots[b % 4]) * tb) * np.exp(-tb * 1.6) * env(m, 0.01, 0.1) * 0.22
            L[p0:p0 + m] += bs; R[p0:p0 + m] += bs
    # drums: kick 1 & 3, brushed snare 2 & 4, soft hats on eighths with swing
    nbeat = int(secs / beat)
    for i in range(nbeat):
        p0 = int(i * beat * SR)
        if i % 2 == 0:
            m = min(int(0.35 * SR), N - p0); tk = np.arange(m) / SR
            f = 45 + 75 * np.exp(-tk * 30)
            k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tk * 9) * 0.35
            L[p0:p0 + m] += k; R[p0:p0 + m] += k
        else:
            m = min(int(0.22 * SR), N - p0); tk = np.arange(m) / SR
            nz = lowpass(rng.normal(0, 1, m), 2500) * np.exp(-tk * 18) * 0.12
            L[p0:p0 + m] += nz * 0.9; R[p0:p0 + m] += nz
        for half in (0, 1):
            h0 = p0 + int((half * 0.5 + (0.06 if half else 0)) * beat * SR)
            m = min(int(0.05 * SR), N - h0)
            if m <= 0: continue
            nz = rng.normal(0, 1, m); nz = nz - lowpass(nz, 6000)
            hh = nz * np.exp(-np.arange(m) / SR * 70) * (0.035 if half else 0.05)
            L[h0:h0 + m] += hh * 0.7; R[h0:h0 + m] += hh
    # vinyl: low hiss and sparse crackle
    hiss = lowpass(rng.normal(0, 1, N), 3000) * 0.004
    crk = np.zeros(N); idx = rng.integers(0, N, int(secs * 6)); crk[idx] = rng.normal(0, 0.08, len(idx))
    L += hiss + crk; R += hiss + np.roll(crk, 7)
    # warm it up, fade, normalise to −16 dBFS RMS with a −1 dBFS ceiling
    L, R = lowpass(L, 7000), lowpass(R, 7000)
    f = np.ones(N); fi, fo = int(1.0 * SR), int(2.0 * SR)
    f[:fi] = np.linspace(0, 1, fi); f[-fo:] = np.linspace(1, 0, fo)
    L *= f; R *= f
    rms = np.sqrt((L ** 2 + R ** 2).mean() / 2)
    g = 10 ** (-16 / 20) / max(rms, 1e-9)
    peak = max(np.abs(L).max(), np.abs(R).max()) * g
    if peak > 10 ** (-1 / 20): g *= 10 ** (-1 / 20) / peak
    st = np.stack([L, R], 1) * g
    with wave.open(out, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(st, -1, 1) * 32767).astype(np.int16).tobytes())
    print(f"music bed → {out} · {bpm:g} bpm · {secs:g} s")


if __name__ == "__main__":
    main()
