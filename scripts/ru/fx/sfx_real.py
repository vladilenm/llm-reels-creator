#!/usr/bin/env python3
# S4b «Звуковые акценты» from real recordings (Real SFX + the brand library) — fx.json "sfx_engine": "real".
#   python3 scripts/ru/fx/sfx_real.py <project> [--variant v2] [--music file] [--bpm n] [--dry]
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
import json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SKILL = os.path.join(ROOT, ".claude", "skills", "real-sfx")
sys.path.insert(0, HERE)
import sound as S                                    # decode, fit, db, write_wav, Words, SR

DEFAULTS = {"peak_below_voice_db": 9.0, "budget_s": 2.0, "merge_s": 0.4, "run_max": 3}
PRIORITY = {"whoosh_big": 6, "hit": 5, "whoosh": 4, "riser": 4, "chime": 3, "click": 2, "pop": 2, "whoosh_small": 2, "tick": 1}
# sfx.py gains that mean «nominal» (Real SFX g = 1.0)
BASE_GAIN = {"whoosh": 0.09, "whoosh_small": 0.08, "whoosh_big": 0.12, "pop": 0.05, "click": 0.045, "tick": 0.03,
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
    return sorted(ev, key=lambda e: e["t"])


def thin(events, dur, cfg):
    """Brand density rules → (kept, dropped with "why": run | merged | budget)."""
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
    return out, sorted(dropped, key=lambda e: e["t"])


def hero(events):
    """One hit per reel: the loudest stays «hit» (the hero), the others become soft «thump»; no hit → the first signature."""
    hits = [e for e in events if e["kind"] == "hit"]
    top = max(hits, key=lambda e: e["gain"]) if hits else next((e for e in events if e["kind"] == "whoosh_big"), None)
    return [dict(e, hero=e is top, kind="thump" if e["kind"] == "hit" and e is not top else e["kind"]) for e in events]


def signature_cue(e, signature):
    """brand/sfx/signature.json layers → one Real SFX cue with layers (files by absolute path); the hero gets +2 dB."""
    L = [dict(l, file=os.path.join(ROOT, l["file"])) for l in signature["layers"]]
    boost = 2.0 if e.get("hero") else 0.0
    return {"t": e["t"], "label": f"signature · {e['name']}", "file": L[0]["file"], "role": L[0]["role"],
            "gain_db": L[0].get("gain_db", 0.0) + boost,
            "layers": [{"dt": l.get("dt", 0.0), "file": l["file"], "role": l["role"], "gain_db": l.get("gain_db", 0.0) + boost}
                       for l in L[1:]]}


def typed(events, signature):
    """→ (Real SFX typed list for from_cues.py, signature cues appended to its sheet)."""
    lst, sig = [], []
    for e in events:
        if e["kind"] == "whoosh_big" and signature:
            sig.append(signature_cue(e, signature)); continue
        typ, ln = TYPES.get(e["kind"], (e["kind"], None))
        g = 0.6 if e["kind"] == "thump" else float(np.clip(e["gain"] / BASE_GAIN.get(e["kind"], 0.08), 0.5, 1.5))
        if e["kind"] == "whoosh_small": g *= 0.7
        item = {"t": e["t"], "type": typ, "g": round(g, 3)}
        if e.get("len") or ln: item["len"] = e.get("len") or ln
        lst.append(item)
    return lst, sig


def fit_to_voice(sfx, voice, below_db):
    """Scale the SFX so its loudest peak sits below_db under the voice's peak; never louder than it came."""
    trim = min(0.0, (S.db(np.abs(voice).max()) - below_db) - S.db(np.abs(sfx).max()))
    return sfx * 10 ** (trim / 20), round(trim, 1)


def run(cmd, what):
    r = subprocess.run(cmd, cwd=SKILL, capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit(f"{what} failed:\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}")
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
    lst, sig = typed(kept, signature)
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
    sfx, trim = fit_to_voice(sfx, S.fit(S.decode(clean), n), cfg["peak_below_voice_db"])
    out = os.path.join(P, "fx", f"sfx{suf}.wav"); S.write_wav(out, sfx)
    ver = run([sys.executable, "scripts/verify.py", resolved_path, track_dry], "verify.py")
    crit = run([sys.executable, "scripts/critique.py", resolved_path, track_dry, "--out", os.path.join(work, "critique.md")], "critique.py")
    placed = sum(1 for c in resolved["cues"] if not c.get("_layer"))
    rep.update({"trim_db": trim, "peak_below_voice_db": cfg["peak_below_voice_db"], "music_ref": bool(ref),
                "placed": placed, "silent": max(0, len(lst) + len(sig) - placed),
                "picks": [{"t": c["t"], "label": c["label"], "role": c["role"], "file": os.path.relpath(c["file"], ROOT)}
                          for c in resolved["cues"]],
                "verify": ver.strip().splitlines()[-3:], "critique_top": top3(crit)})
    json.dump(rep, open(rep_path, "w"), ensure_ascii=False, indent=1)
    print(f"{len(events)} events → {len(kept)} kept, {len(dropped)} dropped; {placed} placed, {rep['silent']} silent; "
          f"trim {trim} dB; signature {rep['signature']}")
    for l in rep["critique_top"]: print("  critique:", l)
    print(f"→ {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
