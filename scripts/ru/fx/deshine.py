#!/usr/bin/env python3
# Skin shine removal (customer, 2026-10-21: «такие блики как-то можно убрать?»). numpy + Pillow only.
#
#   python3 scripts/ru/fx/deshine.py <in.png> <out.png> [--beta 0.8] [--mask person.png]
#   from deshine import deshine; deshine(img, person=None, beta=0.8) → PIL.Image RGB
#
# Oily shine on skin is a patch brighter than the skin around it AND paler (still warm). In phone and
# webcam footage it is almost never clipped, so it can be pulled down:
#   - skin: warm tone in YCbCr (Cr 137–185, Cb 75–132, Y > 60) — teeth and the whites of the eyes stay out;
#     `person` (0..1, white = person) keeps the warm room out;
#   - reference brightness and colour: skin blurred (σ 20), normalised by the skin area around;
#   - strength: how much brighter than the reference (+6…+36), how much paler (chroma −1…−9) and how
#     light at all (Y 150…190);
#   - the correction lives on low frequencies (σ 3): brightness toward the reference by beta, colour
#     toward its warm tone — light and shade and the fine skin texture stay.
# beta 0.8 is what the customer approved on voice-studio; stronger looks plastic (tried and rolled back).
# Used by obs_relocate.py (before the cut-out) and fx_picture.py (fx.json "skin": {"deshine": 0.8}).
import numpy as np
from PIL import Image

MARGIN = 72                    # > support of the σ 20 reference blur (3 box passes × 20 px): the crop is exact


def _box(a, k, axis):
    """running mean of width 2k+1 along an axis (edges repeat the last value)"""
    pad = [(0, 0)] * a.ndim; pad[axis] = (k + 1, k)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
    hi = [slice(None)] * a.ndim; lo = [slice(None)] * a.ndim
    hi[axis] = slice(2 * k + 1, None); lo[axis] = slice(0, c.shape[axis] - 2 * k - 1)
    return ((c[tuple(hi)] - c[tuple(lo)]) / (2 * k + 1)).astype(np.float32)


def _blur(a, sigma):
    """gaussian ≈ three box passes (numpy, no scipy/cv2)"""
    k = max(1, int(round(np.sqrt(12 * sigma * sigma / 3 + 1) / 2)))
    for _ in range(3):
        a = _box(_box(a, k, 0), k, 1)
    return a


def skin_of(ycc, person=None):
    Y, Cb, Cr = ycc[..., 0], ycc[..., 1], ycc[..., 2]
    skin = ((Cr > 137) & (Cr < 185) & (Cb > 75) & (Cb < 132) & (Y > 60)).astype(np.float32)
    if person is not None: skin *= (person > 0.5)
    return skin


def _deshine(ycc, skin, beta):
    base = _blur(ycc, 3)
    w = _blur(skin, 20) + 1e-3                                   # skin tone around: blur over skin only
    ref = _blur(ycc * skin[..., None], 20) / w[..., None]
    over = base[..., 0] - ref[..., 0]
    ch = np.hypot(base[..., 1] - 128, base[..., 2] - 128)        # chroma
    ch_ref = np.hypot(ref[..., 1] - 128, ref[..., 2] - 128)
    # shine = brighter than the skin around AND paler; ordinary shading (brighter, same warmth) stays
    s = np.clip((over - 6) / 30, 0, 1) * np.clip((ch_ref - ch - 1) / 8, 0, 1) * np.clip((base[..., 0] - 150) / 40, 0, 1)
    s = _blur(s * skin, 2) * beta
    d = np.zeros_like(ycc)
    d[..., 0] = -s * np.maximum(over, 0)                         # brightness toward the skin around
    d[..., 1] = s * (ref[..., 1] - base[..., 1])                  # colour toward its warm tone
    d[..., 2] = s * (ref[..., 2] - base[..., 2])
    return ycc + d


def deshine(img, person=None, beta=0.8):
    """img: PIL RGB; person: H×W 0..1 or None. Works on the skin's bounding box only (same result)."""
    if beta <= 0: return img
    ycc = np.asarray(img.convert("YCbCr"), np.float32)
    skin = skin_of(ycc, person)
    if skin.sum() < 500: return img
    rows, cols = np.flatnonzero(skin.any(1)), np.flatnonzero(skin.any(0))
    y0, y1 = max(0, rows[0] - MARGIN), min(skin.shape[0], rows[-1] + 1 + MARGIN)
    x0, x1 = max(0, cols[0] - MARGIN), min(skin.shape[1], cols[-1] + 1 + MARGIN)
    out = ycc.copy()
    out[y0:y1, x0:x1] = _deshine(ycc[y0:y1, x0:x1], skin[y0:y1, x0:x1], beta)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "YCbCr").convert("RGB")


if __name__ == "__main__":
    import sys
    a = sys.argv[1:]
    if len(a) < 2:
        print("usage: deshine.py <in.png> <out.png> [--beta 0.8] [--mask person.png]"); sys.exit(1)
    im = Image.open(a[0]).convert("RGB")
    beta = float(a[a.index("--beta") + 1]) if "--beta" in a else 0.8
    m = None
    if "--mask" in a:
        m = np.asarray(Image.open(a[a.index("--mask") + 1]).convert("L").resize(im.size, Image.BILINEAR), np.float32) / 255
    deshine(im, m, beta).save(a[1])
