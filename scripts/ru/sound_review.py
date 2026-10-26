#!/usr/bin/env python3
# The customer's listening page for the brand sound library (design 2026-10-26). Claude cannot hear:
# the customer marks «беру / нет» once, and the marks become the library.
#   python3 scripts/ru/sound_review.py build [--out .cache/sound-review] [--voice-reel <reel>] [--voice-start 5] [--swap-t 43.29]
#   python3 scripts/ru/sound_review.py serve [--out .cache/sound-review] [--port 8765]   → http://127.0.0.1:8765
#   python3 scripts/ru/sound_review.py apply [--out .cache/sound-review] [--no-index]
#   common: [--music-dir brand/music] [--lib brand/sfx/library]
#
# build: music that passed music_screen.py → 25 s clean + the same 25 s under the voice of <reel> at the levels
#        sound.py uses (music −17 dB against the voice between phrases, −9 dB more under speech); SFX shortlisted
#        by sfx_screen.py with a spectrogram; 3 signature variants, alone and on a background swap of <reel>.
# serve: the page on 127.0.0.1 only; marks go to <music-dir>/review.json and <lib>/review.json.
# apply: approved tracks → full download into <music-dir> + tracks.json, rejected ids → rejected.json; rejected
#        SFX → <lib>/../rejected/<folder>/, approved get credits "approved"; the chosen signature →
#        <lib>/../signature.json; then Real SFX build_index.py.
import datetime, json, os, re, shutil, subprocess, sys, urllib.parse, urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
sys.path.insert(0, os.path.join(HERE, "fx"))
sys.path.insert(0, HERE)
import sound as S                                    # decode, fit, db, smooth_gain, to_samples, Words, SR

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
REAL_SFX = os.path.join(ROOT, ".claude", "skills", "real-sfx")
LEVEL_DB, DUCK_DB, EXCERPT_S = -17.0, -9.0, 25.0
DEFAULT_REEL = os.path.join(ROOT, "video-projects", "2026-10-25-understand-anything")


# ---------- audio ----------

def write_audio(path, x):
    x = x if x.ndim == 2 else np.stack([x, x], 1)
    codec = ["-c:a", "libmp3lame", "-b:a", "192k"] if path.endswith(".mp3") else ["-c:a", "pcm_s16le"]
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(S.SR), "-i", "-", *codec, path],
                       input=np.clip(x, -1, 1).astype("<f4").tobytes(), capture_output=True)
    if r.returncode != 0: raise RuntimeError(r.stderr.decode()[-300:])


def fades(x, s=0.5):
    n = min(len(x) // 2, int(s * S.SR))
    r = np.linspace(0, 1, n)[:, None]
    x = x.copy(); x[:n] *= r; x[len(x) - n:] *= r[::-1]
    return x


def rms_db(x):
    return S.db(np.sqrt((x ** 2).mean() + 1e-18))


def voice_stretch(reel, start, dur):
    n = int(dur * S.SR)
    v = S.fit(S.decode(os.path.join(reel, "renders", "clean.mp4"), ss=start or None), n)
    tr = json.load(open(os.path.join(reel, "transcript.clean.json")))
    words = [dict(w, start=w["start"] - start, end=w["end"] - start) for w in tr["words"]
             if w.get("type", "word") == "word" and w["end"] > start and w["start"] < start + dur]
    return v, S.Words(words).speech_mask(n)


def under_voice(voice, speech, music):
    """sound.py's level rule on a short stretch: music RMS = voice RMS + LEVEL_DB where nobody speaks, DUCK_DB more under speech."""
    v_rms = rms_db(voice[speech]) if speech.any() else rms_db(voice)
    free = music[~speech] if (~speech).any() else music
    m = music * 10 ** ((v_rms + LEVEL_DB - rms_db(free)) / 20)
    hop = 480; nf = len(m) // hop + 1
    sp = np.array([speech[i * hop: (i + 1) * hop].any() for i in range(nf)])
    g = S.smooth_gain(np.where(sp, DUCK_DB, 0.0), hop / S.SR, attack=0.03, release=0.30)
    mix = voice + m * (10 ** (S.to_samples(g, hop, len(m)) / 20))[:, None]
    pk = np.abs(mix).max()
    return mix * (0.89 / pk) if pk > 0.89 else mix


def render_layers(layers, n, t):
    """Each layer's loudest point at t + dt (how Real SFX anchors hits and whooshes), gains in dB from full scale."""
    y = np.zeros((n, 2))
    for L in layers:
        x = S.decode(os.path.join(ROOT, L["file"]))
        x = x / (np.abs(x).max() + 1e-9) * 10 ** (L["gain_db"] / 20)
        at = int((t + L["dt"]) * S.SR) - int(np.argmax(np.abs(x).mean(axis=1)))
        a, b = max(0, at), min(n, at + len(x))
        if b > a: y[a:b] += x[a - at: b - at]
    return y


# ---------- build ----------

def build_music(out, mdir, voice, speech):
    cdir = os.path.join(mdir, "candidates")
    scr = json.load(open(os.path.join(cdir, "screen.json")))
    cands = json.load(open(os.path.join(cdir, "candidates.json")))
    os.makedirs(os.path.join(out, "music"), exist_ok=True)
    items = []
    for i in sorted((i for i, m in scr.items() if m.get("status") == "pass"), key=lambda i: -scr[i].get("score", 0)):
        c, m = cands[i], scr[i]
        src = c["file"] if os.path.isabs(c["file"]) else os.path.join(ROOT, c["file"])
        x = fades(S.fit(S.decode(src, ss=m.get("excerpt_start") or None), len(voice)))
        x = x * 10 ** ((-16 - rms_db(x)) / 20)
        write_audio(os.path.join(out, "music", f"{i}.clean.mp3"), x)
        write_audio(os.path.join(out, "music", f"{i}.voice.mp3"), under_voice(voice, speech, x))
        items.append({"section": "music", "id": i, "title": f"{c.get('title', i)} — {c.get('creator', '')}",
                      "meta": f"{', '.join(c.get('mood', []))} · {m.get('bpm') or 'без бита'} BPM · {c.get('license_name', c.get('license', ''))}",
                      "audio": [["Музыка", f"a/music/{i}.clean.mp3"], ["Под голосом", f"a/music/{i}.voice.mp3"]]})
    return items


def build_sfx(out, lib):
    scr = json.load(open(os.path.join(lib, "screen.json")))
    os.makedirs(os.path.join(out, "sfx"), exist_ok=True)
    items = []
    for k in sorted(k for k, m in scr.items() if m["status"] == "shortlist"):
        png = os.path.join(out, "sfx", k.replace("/", "__") + ".png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(lib, k), "-lavfi",
                        "showspectrumpic=s=360x90:legend=0:color=intensity", png], check=True)
        m = scr[k]
        items.append({"section": "sfx", "group": k.split("/")[0], "id": k, "title": k.split("/")[1],
                      "meta": f"{m['dur']} с · атака {m['attack_ms']:.0f} мс · {m['centroid']} Гц",
                      "audio": [["", "lib/" + urllib.parse.quote(k)]], "img": f"a/sfx/{os.path.basename(png)}"})
    return items


def variants(lib):
    """Three signature builds from the shortlist: A whoosh + low hit, B + shimmer, C riser + low hit + shimmer."""
    scr = json.load(open(os.path.join(lib, "screen.json")))

    def best(folders, key):
        for f in folders:
            ks = [k for k, m in scr.items() if m["status"] in ("shortlist", "approved") and k.startswith(f + "/")]
            if ks: return max(ks, key=lambda k: key(scr[k]))
        return None

    rel = lambda k: os.path.relpath(os.path.join(lib, k), ROOT)
    w = best(["whoosh_big", "whoosh"], lambda m: m["score"])
    low = best(["subdrop", "hit"], lambda m: -m["centroid"])
    sh = best(["chime"], lambda m: m["score"])
    ri = best(["riser"], lambda m: m["score"])
    low_l = low and {"file": rel(low), "role": "sub_drop" if low.startswith("subdrop/") else "hit", "dt": 0.0, "gain_db": -3.0}
    sh_l = sh and {"file": rel(sh), "role": "chime", "dt": 0.03, "gain_db": -8.0}
    out = {}
    if w and low: out["A"] = [{"file": rel(w), "role": "whoosh", "dt": 0.0, "gain_db": 0.0}, low_l]
    if w and low and sh: out["B"] = out["A"] + [sh_l]
    if ri and low and sh: out["C"] = [{"file": rel(ri), "role": "riser", "dt": 0.0, "gain_db": -2.0}, low_l, sh_l]
    return out


NAMES = {"A": "вжух + мягкий низкий удар", "B": "вжух + низкий удар + шиммер", "C": "нарастание + низкий удар + шиммер"}


def build_signature(out, lib, reel, swap_t):
    var = variants(lib)
    d = os.path.join(out, "signature"); os.makedirs(d, exist_ok=True)
    json.dump(var, open(os.path.join(d, "variants.json"), "w"), ensure_ascii=False, indent=1)
    voice, _ = voice_stretch(reel, max(0.0, swap_t - 3.0), 6.0)
    t_in = min(3.0, swap_t)
    items = []
    for name, layers in var.items():
        alone = render_layers(layers, int(2.5 * S.SR), 1.2)
        write_audio(os.path.join(d, f"{name}.mp3"), alone * (10 ** (-3 / 20) / (np.abs(alone).max() + 1e-9)))
        sig = render_layers(layers, len(voice), t_in)
        sig *= 10 ** ((S.db(np.abs(voice).max()) - 9) / 20) / (np.abs(sig).max() + 1e-9)
        write_audio(os.path.join(d, f"{name}.context.mp3"), voice + sig)
        items.append({"section": "signature", "id": name, "title": f"Вариант {name}: {NAMES[name]}",
                      "audio": [["Отдельно", f"a/signature/{name}.mp3"], ["На смене фона", f"a/signature/{name}.context.mp3"]]})
    return items


PAGE = r"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Отбор звука</title>
<style>
:root{--ink:#17141C;--muted:#6B6475;--canvas:#EFEDF4;--card:#fff;--accent:#7C3AED;--soft:#EDE6FF;--line:#E5E1EA}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:16px/1.45 -apple-system,"Golos Text",system-ui,sans-serif}
header{position:sticky;top:0;background:var(--canvas);padding:20px 16px 12px;border-bottom:1px solid var(--line);z-index:2}
header>*{max-width:880px;margin-left:auto;margin-right:auto}
h1{margin:0 0 4px;font-size:24px}h2{margin:32px 0 12px;font-size:20px}
h3{margin:20px 0 8px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
main{max-width:880px;margin:0 auto;padding:0 16px 80px}p{margin:4px 0;color:var(--muted)}
.card{background:var(--card);border-radius:14px;padding:14px;margin:10px 0;display:grid;gap:8px;border:2px solid transparent}
.card.yes{border-color:var(--accent);background:var(--soft)}.card.no{opacity:.45}
.t{font-weight:600}.m{font-size:13px;color:var(--muted)}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
audio{width:100%;max-width:420px;height:36px}img{width:100%;max-width:360px;border-radius:8px;display:block}
button{font:inherit;border:0;border-radius:10px;padding:8px 16px;cursor:pointer;background:var(--line)}
button.on{background:var(--accent);color:#fff}label{font-size:13px;color:var(--muted);min-width:96px}
</style></head><body>
<header><h1>Отбор звука</h1><p id="count"></p>
<p>Слушай в наушниках. «Беру» — в фирменную библиотеку, «Нет» — больше не появится. Фирменный звук — выбери один вариант. Когда закончишь, напиши в чат «отметил».</p></header>
<main id="app"></main>
<script>
const ITEMS = __ITEMS__;
const SECTIONS = [["music", "Музыка"], ["sfx", "Звуки"], ["signature", "Фирменный звук"]];
let marks = { music: {}, sfx: {}, signature: null };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const state = (it) => it.section === "signature" ? (marks.signature === it.id ? "yes" : (marks.signature ? "no" : "")) : (marks[it.section][it.id] || "");
async function mark(it, verdict) {
  const r = await fetch("/verdict", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section: it.section, id: it.id, verdict }) });
  if (!r.ok) { alert("Не сохранилось: " + (await r.text())); return; }
  if (it.section === "signature") marks.signature = it.id; else marks[it.section][it.id] = verdict;
  render();
}
function card(it) {
  const c = el("div", "card " + state(it));
  c.append(el("div", "t", it.title || it.id));
  if (it.meta) c.append(el("div", "m", it.meta));
  if (it.img) { const i = el("img"); i.src = it.img; i.alt = ""; c.append(i); }
  for (const [label, src] of it.audio) {
    const r = el("div", "row"); if (label) r.append(el("label", "", label));
    const a = el("audio"); a.controls = true; a.preload = "none"; a.src = src; r.append(a); c.append(r);
  }
  const b = el("div", "row");
  if (it.section === "signature") {
    const x = el("button", state(it) === "yes" ? "on" : "", state(it) === "yes" ? "Выбран" : "Выбрать");
    x.onclick = () => mark(it, "pick"); b.append(x);
  } else {
    const y = el("button", state(it) === "yes" ? "on" : "", "Беру"); y.onclick = () => mark(it, "yes");
    const n = el("button", state(it) === "no" ? "on" : "", "Нет"); n.onclick = () => mark(it, "no");
    b.append(y, n);
  }
  c.append(b); return c;
}
function render() {
  const app = document.getElementById("app"); app.replaceChildren();
  for (const [sec, name] of SECTIONS) {
    const items = ITEMS.filter((i) => i.section === sec); if (!items.length) continue;
    app.append(el("h2", "", `${name} · ${items.length}`));
    let group = null;
    for (const it of items) { if (it.group && it.group !== group) { group = it.group; app.append(el("h3", "", group)); } app.append(card(it)); }
  }
  const ids = new Set(ITEMS.filter((i) => i.section !== "signature").map((i) => i.section + ":" + i.id));
  const done = [...Object.keys(marks.music).map((k) => "music:" + k), ...Object.keys(marks.sfx).map((k) => "sfx:" + k)].filter((k) => ids.has(k)).length;
  document.getElementById("count").textContent = `Отмечено ${done} из ${ids.size}` + (marks.signature ? ` · фирменный звук: ${marks.signature}` : " · фирменный звук не выбран");
}
fetch("/verdicts").then((r) => r.json()).then((m) => { marks = m; render(); }).catch(() => render());
</script></body></html>
"""


def build(out, mdir, lib, reel, voice_start, swap_t):
    os.makedirs(out, exist_ok=True)
    voice, speech = voice_stretch(reel, voice_start, EXCERPT_S)
    items = build_music(out, mdir, voice, speech) + build_sfx(out, lib) + build_signature(out, lib, reel, swap_t)
    data = json.dumps(items, ensure_ascii=False, indent=1).replace("</", "<\\/")
    open(os.path.join(out, "index.html"), "w").write(PAGE.replace("__ITEMS__", data))
    n = {s: sum(i["section"] == s for i in items) for s in ("music", "sfx", "signature")}
    print(f"music {n['music']}, sfx {n['sfx']}, signature variants {n['signature']} → {os.path.relpath(out, ROOT)}/index.html")


# ---------- marks ----------

def review_file(mdir, lib, section):
    return os.path.join(mdir, "review.json") if section == "music" else os.path.join(lib, "review.json")


def load_marks(mdir, lib):
    rd = lambda p: json.load(open(p)) if os.path.exists(p) else {}
    m, s = rd(review_file(mdir, lib, "music")), rd(review_file(mdir, lib, "sfx"))
    return {"music": m.get("music", {}), "sfx": s.get("sfx", {}), "signature": s.get("signature")}


def record_verdict(mdir, lib, section, id, verdict):
    """One mark from the page. music / sfx: verdict "yes" | "no"; signature: id is the chosen variant."""
    if section not in ("music", "sfx", "signature") or not isinstance(id, str) or not id: raise ValueError(f"bad mark {section} {id}")
    if section != "signature" and verdict not in ("yes", "no"): raise ValueError(f"bad verdict {verdict}")
    f = review_file(mdir, lib, section)
    d = json.load(open(f)) if os.path.exists(f) else {}
    if section == "signature": d["signature"] = id
    else: d.setdefault(section, {})[id] = verdict
    d["updated"] = datetime.datetime.now().isoformat(timespec="seconds")
    os.makedirs(os.path.dirname(f), exist_ok=True)
    json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)


# ---------- serve ----------

TYPES = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
         ".png": "image/png", ".html": "text/html; charset=utf-8"}


def serve(out, mdir, lib, port):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _send(self, code, data, ctype):
            self.send_response(code); self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

        def _file(self, base, rel):
            p = os.path.realpath(os.path.join(base, rel))
            if not p.startswith(os.path.realpath(base) + os.sep) or not os.path.isfile(p): return self._send(404, b"not found", "text/plain")
            self._send(200, open(p, "rb").read(), TYPES.get(os.path.splitext(p)[1].lower(), "application/octet-stream"))

        def _json(self, obj, code=200):
            self._send(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

        def do_GET(self):
            path = urllib.parse.unquote(self.path.split("?")[0])
            if path in ("/", "/index.html"): return self._file(out, "index.html")
            if path == "/verdicts": return self._json(load_marks(mdir, lib))
            if path.startswith("/a/"): return self._file(out, path[3:])
            if path.startswith("/lib/"): return self._file(lib, path[5:])
            self._send(404, b"not found", "text/plain")

        def do_POST(self):
            if self.path != "/verdict": return self._send(404, b"not found", "text/plain")
            try:
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                record_verdict(mdir, lib, body.get("section"), body.get("id"), body.get("verdict"))
            except (ValueError, TypeError) as e:
                return self._json({"ok": False, "error": str(e)}, 400)
            self._json({"ok": True})

    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    print(f"http://127.0.0.1:{port}  (Ctrl+C — стоп)", flush=True)
    srv.serve_forever()


# ---------- apply ----------

def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return (s or "track")[:40].strip("-")


def apply(out, mdir, lib, index=True):
    from sfx_screen import move, credit_key
    rd = lambda p, d: json.load(open(p)) if os.path.exists(p) else d
    wr = lambda p, o: json.dump(o, open(p, "w"), ensure_ascii=False, indent=1)
    today = datetime.date.today().isoformat()
    marks = load_marks(mdir, lib)
    cdir = os.path.join(mdir, "candidates")
    cands, scr = rd(os.path.join(cdir, "candidates.json"), {}), rd(os.path.join(cdir, "screen.json"), {})
    tracks, rejected = rd(os.path.join(mdir, "tracks.json"), {"tracks": []}), rd(os.path.join(mdir, "rejected.json"), [])
    n = {"music+": 0, "music-": 0, "sfx+": 0, "sfx-": 0}
    for i, v in marks["music"].items():
        c = cands.get(i)
        if not c: continue
        src = c["file"] if os.path.isabs(c["file"]) else os.path.join(ROOT, c["file"])
        if v == "yes":
            name = f"{slug(c['title'])}-{i[:8]}.mp3"
            req = urllib.request.Request(c["url"], headers={"User-Agent": "reels-studio-fetch"})
            with urllib.request.urlopen(req, timeout=120) as r, open(os.path.join(mdir, name), "wb") as f:
                shutil.copyfileobj(r, f)
            s = scr.get(i, {})
            tracks["tracks"].append({"file": name, "mood": c.get("mood", []), "bpm": s.get("bpm"),
                                     "excerpt_start": s.get("excerpt_start"), "source": f"Openverse · {c['source']} · {c['page']}",
                                     "license": c["license_name"], "license_url": c.get("license_url"), "credit": c.get("credit"),
                                     "openverse_id": i})
            n["music+"] += 1
        else:
            rejected.append(i); n["music-"] += 1
        if os.path.exists(src): os.remove(src)
        cands.pop(i)
    wr(os.path.join(mdir, "tracks.json"), tracks)
    wr(os.path.join(mdir, "rejected.json"), rejected)
    if os.path.isdir(cdir): wr(os.path.join(cdir, "candidates.json"), cands)

    cp = os.path.join(lib, "credits.json")
    credits = rd(cp, {})
    for k, v in marks["sfx"].items():
        if not os.path.exists(os.path.join(lib, k)): continue
        if v == "no":
            move(lib, k, "rejected", credits); n["sfx-"] += 1
        else:
            key = credit_key(credits, k) or f"brand/sfx/library/{k}"
            credits.setdefault(key, {})["approved"] = today; n["sfx+"] += 1
    wr(cp, credits)

    if marks["signature"]:
        var = rd(os.path.join(out, "signature", "variants.json"), {})
        if marks["signature"] in var:
            wr(os.path.join(os.path.dirname(lib), "signature.json"),
               {"chosen": marks["signature"], "date": today, "layers": var[marks["signature"]]})
    print(f"music: {n['music+']} taken, {n['music-']} rejected · sfx: {n['sfx+']} taken, {n['sfx-']} rejected · "
          f"signature: {marks['signature'] or 'not chosen'}")
    if index:
        r = subprocess.run([sys.executable, "scripts/build_index.py"], cwd=REAL_SFX, capture_output=True, text=True)
        print((r.stdout.strip().splitlines() or [r.stderr[-300:]])[-1])


# ---------- main ----------

def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("build", "serve", "apply"):
        print("usage: sound_review.py build | serve | apply [--out DIR] [--music-dir DIR] [--lib DIR] …"); sys.exit(1)
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    out = os.path.abspath(opt("--out", os.path.join(ROOT, ".cache", "sound-review")))
    mdir = os.path.abspath(opt("--music-dir", os.path.join(ROOT, "brand", "music")))
    lib = os.path.abspath(opt("--lib", os.path.join(ROOT, "brand", "sfx", "library")))
    if a[0] == "build":
        build(out, mdir, lib, os.path.abspath(opt("--voice-reel", DEFAULT_REEL)), float(opt("--voice-start", 5)), float(opt("--swap-t", 43.29)))
    elif a[0] == "serve":
        serve(out, mdir, lib, int(opt("--port", 8765)))
    else:
        apply(out, mdir, lib, index="--no-index" not in a)


if __name__ == "__main__":
    main()
