#!/usr/bin/env python3
"""Reel cover 1080x1920 in the «plate + object» style (refs: big face, a slanted red plate with white
italic caps across the chest, a glossy 3D object under it). Text is drawn here, never by an image model.

usage:
  python3 scripts/ru/cover/make_cover.py <project>                 # reads <project>/cover/cover.json
  python3 scripts/ru/cover/make_cover.py <project> --frames 0.4,1.1,4,14.5,26.5,33   # candidates sheet
  python3 scripts/ru/cover/make_cover.py <project> --cut <object.png>  # black background → <name>-cut.png

cover.json (all optional except lines):
  { "lines": ["ИИ-ЧЕРНОБЫЛЬ", "УЖЕ БЛИЗКО?"],   1–3 short lines, caps
    "frame_time": 1.1,                          seconds of renders/picture.mp4 (else clean.mp4)
    "frame": "cover/frame.png",                 or an explicit still (wins over frame_time)
    "color": "red" | "purple" | "#RRGGBB",      plate colour; red = the refs, purple = brand accent
    "plate_y": 1010,                            top of the first plate
    "object": "cover/radiation-cut.png",        RGBA object under the plate (see --cut)
    "object_size": 450, "object_y": 1185, "object_dx": 20,
    "out": "cover/cover.png" }
Writes <out> and <out>.grid45.png — the 4:5 profile-grid crop (y 285–1635); both plate and object must
sit inside it."""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
FONT = os.path.join(ROOT, 'brand/fonts/GolosText-Variable.ttf')
COLORS = {'red': (232, 22, 32), 'purple': (124, 58, 237)}
W, H, GRID = 1080, 1920, (285, 1635)


def hexc(c):
    if isinstance(c, (list, tuple)): return tuple(c)
    if c in COLORS: return COLORS[c]
    c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def grab(project, t, out, size=None):
    src = os.path.join(project, 'renders', 'picture.mp4')
    if not os.path.exists(src): src = os.path.join(project, 'renders', 'clean.mp4')
    vf = ['-vf', f'scale={size}:-1'] if size else []
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', src, '-frames:v', '1', *vf, out], check=True)


def frames_sheet(project, times):
    d = os.path.join(project, 'cover', 'cand'); os.makedirs(d, exist_ok=True)
    tiles = []
    for t in times:
        p = os.path.join(d, f'{t:07.2f}.png'); grab(project, t, p, 270)
        im = Image.open(p).convert('RGB'); ImageDraw.Draw(im).text((10, 10), f'{t:.2f}', fill='yellow',
                                                                    font=ImageFont.truetype(FONT, 28))
        tiles.append(im)
    cols = min(6, len(tiles)); rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 274, rows * tiles[0].height + rows * 4), 'black')
    for i, im in enumerate(tiles): sheet.paste(im, ((i % cols) * 274, (i // cols) * (im.height + 4)))
    out = os.path.join(project, 'cover', 'candidates.png'); sheet.save(out); print(out)


def cut(path):
    """object rendered on pure black → RGBA: background = dark area connected to the corners."""
    im = Image.open(path).convert('RGB'); w, h = im.size
    b = Image.fromarray(((np.asarray(im).max(-1) > 14) * 255).astype('uint8'))
    b = b.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    for c in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]: ImageDraw.floodfill(b, c, 128)
    al = Image.fromarray(((np.asarray(b) != 128) * 255).astype('uint8'))
    al = al.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(2.5))
    o = im.convert('RGBA'); o.putalpha(al)
    out = os.path.splitext(path)[0] + '-cut.png'; o.crop(al.getbbox()).save(out); print(out)


def fit_font(d, lines, max_w=930, start=112):
    size = start
    while size > 60:
        f = ImageFont.truetype(FONT, size)
        try: f.set_variation_by_axes([900])
        except Exception: pass
        if max(d.textlength(s, font=f) for s in lines) <= max_w: return f, size
        size -= 4
    return f, size


def build(project, cfg):
    fp = cfg.get('frame')
    if fp: fp = os.path.join(project, fp)
    else:
        fp = os.path.join(project, 'cover', 'frame.png'); grab(project, cfg.get('frame_time', 1.0), fp)
    im = Image.open(fp).convert('RGB').resize((W, H))
    ramp = np.clip((np.arange(H) - 1000) / 920, 0, 1) * 150          # darker bottom: plate and object pop
    g = Image.fromarray(np.repeat(ramp[:, None], W, 1).astype('uint8'))
    im = Image.composite(Image.new('RGB', im.size, (8, 6, 10)), im, g)
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    lines = cfg['lines']; font, size = fit_font(d, lines)
    col = hexc(cfg.get('color', 'red')); dark = tuple(int(v * 0.4) for v in col)
    ph, step = int(size * 1.3), int(size * 1.18); Y = cfg.get('plate_y', 1010)
    for i, s in enumerate(lines):
        w = d.textlength(s, font=font); x0 = (W - w) / 2 - 34; y = Y + i * step
        d.rounded_rectangle((x0, y, x0 + w + 68, y + ph), 18, fill=col)
        d.text((x0 + 34, y + size * 0.09), s, font=font, fill='white', stroke_width=3, stroke_fill=dark)
    cy = Y + (len(lines) * step) / 2
    lay = lay.transform(lay.size, Image.AFFINE, (1, 0.18, -0.18 * cy, 0, 1, 0), resample=Image.BICUBIC)
    lay = lay.rotate(-3, center=(W / 2, cy), resample=Image.BICUBIC)
    sh = lay.split()[3].filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.6))
    im.paste((0, 0, 0), (6, 14), sh)
    if cfg.get('object'):
        o = Image.open(os.path.join(project, cfg['object'])).convert('RGBA')
        n = cfg.get('object_size', 450); o.thumbnail((n, n))
        x, y = (W - o.width) // 2 + cfg.get('object_dx', 20), cfg.get('object_y', Y + len(lines) * step - 90)
        s2 = o.split()[3].filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * 0.7))
        im.paste((0, 0, 0), (x + 10, y + 24), s2); im.paste(o, (x, y), o)
        if y + o.height > GRID[1]: print(f'WARN object bottom {y + o.height} > grid 4:5 bottom {GRID[1]}')
    im.paste(lay, (0, 0), lay)
    bb = lay.split()[3].getbbox()
    if bb and (bb[1] < GRID[0] or bb[3] > GRID[1]): print(f'WARN plate {bb[1]}–{bb[3]} outside grid 4:5 {GRID}')
    out = os.path.join(project, cfg.get('out', 'cover/cover.png')); im.save(out)
    im.crop((0, GRID[0], W, GRID[1])).save(out.replace('.png', '.grid45.png'))
    a = im.resize((506, 900)); b = im.crop((0, GRID[0], W, GRID[1])).resize((720, 900))
    s = Image.new('RGB', (506 + 720 + 8, 900), 'black'); s.paste(a, (0, 0)); s.paste(b, (514, 0))
    s.save(out.replace('.png', '.sheet.png')); print(out)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    P = a[0]
    if '--frames' in a: frames_sheet(P, [float(x) for x in a[a.index('--frames') + 1].split(',')])
    elif '--cut' in a: cut(a[a.index('--cut') + 1])
    else: build(P, json.load(open(os.path.join(P, 'cover', 'cover.json'))))
