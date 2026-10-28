#!/usr/bin/env python3
# S4b «Звуковые акценты» from real recordings (Real SFX + the brand library) — fx.json "sfx_engine": "real".
#   python3 scripts/ru/fx/sfx_real.py <project> [--variant v2] [--music file] [--bpm n] [--dry] [--open B]
#   --open B: the opening with another candidate of brand/sfx/open.json (to compare by ear) instead of the chosen one
#   →  <project>/fx/sfx[.<variant>].wav       SFX only, ducked under the voice, the loudest peak 9 dB under the voice's
#      <project>/fx/sfx.real[.<variant>].json  kept and dropped events with the reason, picks, checks
#   --dry: the events and the typed list only (work/sfx-real[.<variant>]/events.json), no Real SFX run.
#
# fx.json: sfx [{name, kind, word | t, after?, offset?, gain, len?}] and location_joins — the same list as sfx.py;
#          sfx_real: {peak_below_voice_db: 9, budget_s: 2.0, merge_s: 0.4, run_max: 3}
#          sound.music.src (or --music, with --bpm): tonal sounds are tuned to it (sound.py --plan aligns it first).
# Brand rules «чисто и дорого» (sound-rules.md, design 2026-10-26): at most one accent per budget_s (the
# signature does not count); events closer than merge_s are one sound; runs of ticks / pops stop after run_max;
# one hit per reel (the rest become soft thumps); whoosh_big (a background swap, the CTA) plays the brand
# signature from brand/sfx/signature.json; Real SFX varies the files of repeats; no synthesis (--ui library).
# The opening zoom of the whole frame (scripts/ru/fx/opening.py; fx.json "open", on by default, "open": false switches it off)
# adds the "open" event: one brand sound «вжух-приближение» from brand/sfx/open.json, its peak on the end of the zoom, outside
# the budget and the density rules. The voice speaks from frame 0, so it is not ducked by the voice (that would take it away):
# its peak sits sfx_real.open_below_voice_db (4) under the voice's — louder than the other SFX (9): at 7 dB it added only 1–2 dB
# over the first word (agency-agents, 2026-10-28).
import json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SKILL = os.path.join(ROOT, ".claude", "skills", "real-sfx")
sys.path.insert(0, HERE)
import sound as S                                    # decode, fit, db, write_wav, Words, SR
import opening as O                                  # fx.json "open": the opening zoom of the whole frame (customer, 2026-10-28)

DEFAULTS = {"peak_below_voice_db": 9.0, "budget_s": 2.0, "merge_s": 0.4, "run_max": 3, "open_below_voice_db": 4.0}
PRIORITY = {"open": 7, "whoosh_big": 6, "hit": 5, "whoosh": 4, "riser": 4, "chime": 3, "click": 2, "pop": 2, "whoosh_small": 2, "tick": 1}
# sfx.py gains that mean «nominal» (Real SFX g = 1.0)
BASE_GAIN = {"open": 0.1, "whoosh": 0.09, "whoosh_small": 0.08, "whoosh_big": 0.12, "pop": 0.05, "click": 0.045, "tick": 0.03,
             "chime": 0.08, "hit": 0.22, "riser": 0.1}
RUNS = ("tick", "pop")
# our kind → Real SFX typed kind and default length (s). The hero hit plays as a «drop» (soft low sub_drop first,
# then a dark long hit): the customer approved low drops and no punchy hits (2026-10-26), and the signature is one too.
TYPES = {"whoosh": ("whoosh", 0.5), "whoosh_small": ("whoosh", 0.3), "whoosh_big": ("whoosh", 0.8), "pop": ("pop", None),
         "click": ("click", None), "tick": ("tick", None), "chime": ("chime", None), "hit": ("drop", None),
         "thump": ("thump", None), "riser": ("riser", 1.5)}


def resolve_events(fx, words):
    """fx.json sfx + location_joins → [{name, kind, t, gain, len?}] on the clean timeline (sfx.py's rules)."""
    W = S.Words(words)
    prev_end = lambda t: max([w["end"] for w in words if w["end"] <= t + 1e-6] or [0.0])
    ev = [{"name": f"переход {j:.2f}", "kind": "whoosh", "t": round(max(j - 0.12, prev_end(j) + 0.03), 3),
           "gain": BASE_GAIN["whoosh"]} for j in fx.get("location_joins", [])]
    for e in fx.get("sfx", []):
        t = e["t"] if "t" in e else W.find(e["word"], e.get("after", 0.0))["start"]
        x = {"name": e["name"], "kind": e["kind"], "t": round(t + e.get("offset", 0.0), 3),
             "gain": e.get("gain", BASE_GAIN.get(e["kind"], 0.08))}
        if e.get("len"): x["len"] = e["len"]
        ev.append(x)
    oc = O.cfg_from(fx)
    if oc: ev.append({"name": "открытие · вжух", "kind": "open", "t": oc["dur"], "gain": BASE_GAIN["open"]})
    return sorted(ev, key=lambda e: e["t"])


def thin(events, dur, cfg):
    """Brand density rules → (kept, dropped with "why": run | merged | budget). The opening ("open") is outside them: it
    always plays, and does not count in the budget."""
    opening = [e for e in events if e["kind"] == "open"]
    events = [e for e in events if e["kind"] != "open"]
    kept, dropped = [], []
    drop = lambda e, why: dropped.append(dict(e, why=why))
    # 1. a run of ticks or pops (each within 1.5 s of the previous one of its kind) stops after run_max
    last, count = {}, {}
    for e in events:
        k = e["kind"]
        if k in RUNS:
            count[k] = count.get(k, 0) + 1 if k in last and e["t"] - last[k] <= 1.5 else 1
            last[k] = e["t"]
            if count[k] > cfg["run_max"]:
                drop(e, "run"); continue
        kept.append(e)
    # 2. events closer than merge_s are one sound: the higher priority stays (the earlier one on a tie)
    out = []
    for e in kept:
        if out and e["t"] - out[-1]["t"] < cfg["merge_s"]:
            if PRIORITY.get(e["kind"], 0) > PRIORITY.get(out[-1]["kind"], 0):
                drop(out.pop(), "merged"); out.append(e)
            else:
                drop(e, "merged")
            continue
        out.append(e)
    # 3. at most one accent per budget_s (the signature does not count): the lowest priority, quietest, latest go first
    acc = [e for e in out if e["kind"] != "whoosh_big"]
    over = max(0, len(acc) - int(np.ceil(dur / cfg["budget_s"])))
    for e in sorted(acc, key=lambda e: (PRIORITY.get(e["kind"], 0), e["gain"], -e["t"]))[:over]:
        out.remove(e); drop(e, "budget")
    return sorted(out + opening, key=lambda e: e["t"]), sorted(dropped, key=lambda e: e["t"])


def hero(events):
    """One hit per reel: the loudest stays «hit» (the hero), the others become soft «thump»; no hit → the first signature."""
    hits = [e for e in events if e["kind"] == "hit"]
    top = max(hits, key=lambda e: e["gain"]) if hits else next((e for e in events if e["kind"] == "whoosh_big"), None)
    return [dict(e, hero=e is top, kind="thump" if e["kind"] == "hit" and e is not top else e["kind"]) for e in events]


def signature_cue(e, signature):
    """brand/sfx/signature.json layers → one Real SFX cue with layers (files by absolute path); the hero gets +2 dB.
    Every layer is placed by its arrival: a low drop placed by its peak lands its body ~0.24 s before the swap."""
    L = [dict(l, file=os.path.join(ROOT, l["file"])) for l in signature["layers"]]
    boost = 2.0 if e.get("hero") else 0.0
    return {"t": e["t"], "label": f"signature · {e['name']}", "file": L[0]["file"], "role": L[0]["role"],
            "gain_db": L[0].get("gain_db", 0.0) + boost, "anchor": "arrive",
            "layers": [{"dt": l.get("dt", 0.0), "file": l["file"], "role": l["role"], "gain_db": l.get("gain_db", 0.0) + boost,
                        "anchor": "arrive"}
                       for l in L[1:]]}


def typed(events, signature):
    """→ (Real SFX typed list for from_cues.py, signature cues appended to its sheet)."""
    lst, sig = [], []
    for e in events:
        if e["kind"] == "whoosh_big" and signature:
            sig.append(signature_cue(e, signature)); continue
        if e["kind"] == "open": continue          # built apart by open_sound(): one brand file, not ducked by the voice
        typ, ln = TYPES.get(e["kind"], (e["kind"], None))
        g = 0.6 if e["kind"] == "thump" else float(np.clip(e["gain"] / BASE_GAIN.get(e["kind"], 0.08), 0.5, 1.5))
        if e["kind"] == "whoosh_small": g *= 0.7
        item = {"t": e["t"], "type": typ, "g": round(g, 3)}
        if e.get("len") or ln: item["len"] = e.get("len") or ln
        lst.append(item)
    return lst, sig


def open_sound(dur, n, key=None):
    """The opening zoom's sound → ((n, 2) track, picks): the one brand sound of brand/sfx/open.json (the customer picks it by
    ear), its peak on the end of the zoom. No file → silence and no picks: never a stand-in."""
    f = O.brand_sound(key)
    track = np.zeros((n, 2))
    if not f: return track, []
    start, x = O.place(S.decode(f), S.SR, dur)
    i = int(round(start * S.SR)); x = x[: max(0, n - i)]
    track[i:i + len(x)] += x
    return track, [{"t": round(start, 3), "label": "open · вжух", "role": "open", "file": os.path.relpath(f, ROOT)}]


def fit_to_voice(sfx, voice, below_db):
    """Scale the SFX so its loudest peak sits below_db under the voice's peak; never louder than it came."""
    trim = min(0.0, (S.db(np.abs(voice).max()) - below_db) - S.db(np.abs(sfx).max()))
    return sfx * 10 ** (trim / 20), round(trim, 1)


def run(cmd, what, fatal=True):
    """fatal=False for critique.py: it exits 1 whenever it has advice, which goes into the report."""
    r = subprocess.run(cmd, cwd=SKILL, capture_output=True, text=True)
    if r.returncode != 0 and fatal: raise SystemExit(f"{what} failed:\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}")
    return r.stdout


def top3(text):
    lines = text.splitlines()
    i = next((k for k, l in enumerate(lines) if l.startswith("Three worst problems")), None)
    return [l.strip() for l in lines[i + 1: i + 4]] if i is not None else []


def main():
    a = sys.argv[1:]
    if not a or a[0].startswith("--"):
        print("usage: sfx_real.py <project> [--variant v2] [--music file] [--bpm n] [--dry]"); sys.exit(1)
    P = os.path.abspath(a[0])
    opt = lambda k: a[a.index(k) + 1] if k in a else None
    var = opt("--variant"); suf = f".{var}" if var else ""
    fx = json.load(open(os.path.join(P, "fx", "fx.json")))
    cfg = {**DEFAULTS, **fx.get("sfx_real", {})}
    tr = json.load(open(os.path.join(P, "transcript.clean.json")))
    words = [w for w in tr["words"] if w.get("type", "word") == "word"]
    dur = float(tr["audio_duration_secs"])
    events = resolve_events(fx, words)
    kept, dropped = thin(events, dur, cfg)
    kept = hero(kept)
    sig_path = os.path.join(ROOT, "brand", "sfx", "signature.json")
    signature = json.load(open(sig_path)) if os.path.exists(sig_path) else None
    opening_ev = [e for e in kept if e["kind"] == "open"]
    lst, sig = typed([e for e in kept if e["kind"] != "open"], signature)
    work = os.path.join(P, "work", f"sfx-real{suf}"); os.makedirs(work, exist_ok=True)
    json.dump(lst, open(os.path.join(work, "events.json"), "w"), ensure_ascii=False, indent=1)
    rep = {"variant": var, "events": len(events),
           "kept": [dict({k: e[k] for k in ("name", "kind", "t")}, **({"hero": True} if e.get("hero") else {})) for e in kept],
           "dropped": [{k: e[k] for k in ("name", "kind", "t", "why")} for e in dropped],
           "signature": signature.get("chosen") if signature else None}
    rep_path = os.path.join(P, "fx", f"sfx.real{suf}.json")
    if "--dry" in a:
        json.dump(rep, open(rep_path, "w"), ensure_ascii=False, indent=1)
        print(f"{len(events)} events → {len(kept)} kept, {len(dropped)} dropped (dry) → {os.path.relpath(rep_path, ROOT)}")
        return

    music = opt("--music") or fx.get("sound", {}).get("music", {}).get("src")
    ref = []
    if music:
        cmd = [sys.executable, os.path.join(HERE, "sound.py"), P, "--plan", "--music", music]
        cmd += (["--bpm", opt("--bpm")] if opt("--bpm") else []) + (["--variant", var] if var else [])
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0: raise SystemExit(f"sound.py --plan failed:\n{r.stderr[-800:]}")
        ref = ["--music-ref", os.path.join(P, "work", "sound", f"music{suf}.wav")]
    clean = os.path.join(P, "renders", "clean.mp4")
    cues = os.path.join(work, "cues.json")
    run([sys.executable, "scripts/from_cues.py", os.path.join(work, "events.json"), "--video", clean, "--out", cues,
         "--ui", "library", "--no-check", "--no-stems"], "from_cues.py")
    sheet = json.load(open(cues)); sheet["cues"] += sig
    json.dump(sheet, open(cues, "w"), ensure_ascii=False, indent=1)
    run([sys.executable, "scripts/mix.py", cues, "--out", os.path.join(work, "sfx.mp4"), "--voice-safe", "--no-loudnorm"] + ref, "mix.py")
    stem = os.path.join(work, "sfx")
    resolved_path, track_dry = f"{stem}_resolved_cues.json", f"{stem}_sfx_track.wav"
    resolved = json.load(open(resolved_path))
    n = int(round(dur * S.SR))
    sfx = S.fit(S.decode(resolved.get("sfx_ducked") or track_dry), n)
    voice = S.fit(S.decode(clean), n)
    sfx, trim = fit_to_voice(sfx, voice, cfg["peak_below_voice_db"])
    open_picks = []
    if opening_ev:                                   # the opening: apart from the voice ducking, laid over the trimmed SFX
        op, open_picks = open_sound(opening_ev[0]["t"], n, opt("--open"))
        if open_picks:
            op = op * 10 ** (((S.db(np.abs(voice).max()) - cfg["open_below_voice_db"]) - S.db(np.abs(op).max())) / 20)
            sfx = sfx + op
        else: print("  открытие: нет brand/sfx/open.json или его файла — звук открытия молчит")
    out = os.path.join(P, "fx", f"sfx{suf}.wav"); S.write_wav(out, sfx)
    ver = run([sys.executable, "scripts/verify.py", resolved_path, track_dry], "verify.py")
    crit = run([sys.executable, "scripts/critique.py", resolved_path, track_dry, "--out", os.path.join(work, "critique.md")], "critique.py", fatal=False)
    placed = sum(1 for c in resolved["cues"] if not c.get("_layer"))
    rep.update({"trim_db": trim, "peak_below_voice_db": cfg["peak_below_voice_db"], "music_ref": bool(ref),
                "placed": placed, "silent": max(0, len(lst) + len(sig) - placed),
                "picks": [{"t": c["t"], "label": c["label"], "role": c["role"], "file": os.path.relpath(c["file"], ROOT)}
                          for c in resolved["cues"]] + open_picks,
                "verify": ver.strip().splitlines()[-3:], "critique_top": top3(crit)})
    json.dump(rep, open(rep_path, "w"), ensure_ascii=False, indent=1)
    print(f"{len(events)} events → {len(kept)} kept, {len(dropped)} dropped; {placed} placed, {rep['silent']} silent; "
          f"trim {trim} dB; signature {rep['signature']}")
    for l in rep["critique_top"]: print("  critique:", l)
    print(f"→ {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
