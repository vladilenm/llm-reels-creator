#!/usr/bin/env python3
"""Build motion-broll clips that use the Reels Studio screen kit (scripts/ru/broll/screen-kit.js).

usage: python3 scripts/ru/broll/build.py <out_dir> <clip.html> [<clip.html> ...]

Adds to each fragment, then runs the motion-broll engine build:
  - brand tokens from brand/brand.md (SK.BRAND),
  - Cyrillic brand fonts from brand.md as 'SK Sans' (font_body), 'SK Serif' (font_serif.italic)
    and 'SK Mono' (font_mono); the motion-broll stage and .mono switch to them too,
  - the kit itself,
  - SK.BASE, so media paths in the fragment stay relative to the fragment's folder.
A fragment that does not call SK.run builds exactly like a plain motion-broll clip."""
import base64, json, os, pathlib, re, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ENGINE = ROOT / '.claude/skills/motion-broll/engine'
sys.path.insert(0, str(ENGINE))
import build as engine  # noqa: E402


DEFAULT_FONTS = {
    'font_body': {'files': {'500': 'brand/fonts/Inter-500.ttf', '700': 'brand/fonts/Inter-700.ttf', '800': 'brand/fonts/Inter-800.ttf'}},
    'font_serif': {'italic': 'brand/fonts/PlayfairDisplay-Italic-Variable.ttf'},
    'font_mono': {'files': {'500': 'brand/fonts/GeistMono-Medium.woff2'}},
}


def brand_json():
    for name in ('brand.md', 'brand.example.md'):
        p = ROOT / 'brand' / name
        if p.exists():
            m = re.search(r'```json\s*\n(.*?)\n```', p.read_text(encoding='utf-8'), re.S)
            if m:
                return json.loads(m.group(1))
    return {}


def brand_tokens(b=None):
    b = brand_json() if b is None else b
    return {k: b[k] for k in ('accent', 'accent_light', 'accent_soft', 'background', 'ink', 'glow') if k in b}


def font_face(family, path, weight, style='normal'):
    data = base64.b64encode((ROOT / path).read_bytes()).decode()
    fmt, mime = ('woff2', 'font/woff2') if str(path).endswith('.woff2') else ('truetype', 'font/ttf')
    return (f"@font-face{{font-family:'{family}';src:url(data:{mime};base64,{data}) format('{fmt}');"
            f"font-weight:{weight};font-style:{style};font-display:block}}")


def weighted_faces(family, files):
    """{weight: path} → @font-face rules; one variable file listed under several weights becomes one range."""
    by_path = {}
    for w, p in files.items():
        by_path.setdefault(p, []).append(int(w))
    out = []
    for p, ws in by_path.items():
        out.append(font_face(family, p, f'{min(ws)} {max(ws)}' if len(ws) > 1 else ws[0]))
    return ''.join(out)


def brand_faces(b):
    body = (b.get('font_body') or DEFAULT_FONTS['font_body'])['files']
    serif = (b.get('font_serif') or DEFAULT_FONTS['font_serif'])['italic']
    mono = (b.get('font_mono') or DEFAULT_FONTS['font_mono'])['files']
    return (weighted_faces('SK Sans', body) + font_face('SK Serif', serif, '400 900', 'italic')
            + weighted_faces('SK Mono', mono)
            + "#stage{font-family:'SK Sans','Geist',system-ui,sans-serif}.mono{font-family:'SK Mono','Geist Mono',ui-monospace,monospace}")


def kit_head(fragment_dir, out_dir):
    b = brand_json()
    faces = brand_faces(b)
    base = os.path.relpath(fragment_dir, out_dir).replace(os.sep, '/') + '/'
    pre = f"window.SK={{BRAND:{json.dumps(brand_tokens(b))},BASE:{json.dumps(base)}}};\n"
    return f'<style>{faces}</style>\n<script>{pre}{(HERE / "screen-kit.js").read_text(encoding="utf-8")}</script>\n'


def build(src, out_dir):
    src = pathlib.Path(src).resolve()
    out_dir = pathlib.Path(out_dir).resolve()
    frag = src.read_text(encoding='utf-8')
    with tempfile.TemporaryDirectory() as tmp:
        t = pathlib.Path(tmp) / src.name
        # the kit's <script> goes first so the fragment's own script can call SK.run
        t.write_text(kit_head(src.parent, out_dir) + frag, encoding='utf-8')
        dst = out_dir / (src.stem + '.html')
        engine.build(str(t), str(dst))
    return dst


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    for s in sys.argv[2:]:
        print('built', build(s, out))
