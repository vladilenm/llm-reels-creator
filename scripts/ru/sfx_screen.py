#!/usr/bin/env python3
# Screen of the brand SFX library (sfx-fetch.mjs) by measurement, before the customer listens.
#   python3 scripts/ru/sfx_screen.py [--lib brand/sfx/library] [--per-role 6] [--dry]
#   → <lib>/screen.json {"<folder>/<file>": {status: shortlist | reserve | rejected | approved, reasons, dur, ...}}
# A failing file moves to <lib>/../rejected/<folder>/, one past the per-role shortlist to <lib>/../reserve/<folder>/
# (Real SFX indexes only the library); credits.json keys follow the move. A file the customer approved
# (credits "approved") always stays. --dry moves nothing.
# Rules (design 2026-10-26): audible length within the role's limits, no clipping, no broadband hiss
# (quietest frames louder than −35 dB under the peak AND flat; not for ambience), channels not in antiphase.
# The shortlist is ranked by closeness to the role's brightness and attack («чисто и дорого»: soft whooshes
# and risers, crisp clicks, dark low hits).
import json, os, shutil, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
import audio_measure as A

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SR = 44100
AUDIO = (".wav", ".mp3", ".flac", ".ogg", ".aif", ".aiff", ".m4a")
# folder: (min s, max s, attack "soft" | "sharp" | None, target centroid Hz)
RULES = {
    "whoosh": (0.2, 1.6, "soft", 1500), "whoosh_big": (0.4, 2.5, "soft", 900), "whoosh_small": (0.1, 0.8, "soft", 2000),
    "riser": (1.0, 5.0, "soft", 1500), "hit": (0.15, 3.0, "sharp", 300), "subdrop": (0.3, 3.5, None, 120),
    "click": (0.005, 0.4, "sharp", 3000), "click_tick": (0.005, 0.4, "sharp", 3500), "pop": (0.02, 0.5, "sharp", 1200),
    "paper": (0.05, 1.5, None, 3000), "glass": (0.05, 1.5, "sharp", 4000), "chime": (0.2, 3.0, None, 3000),
    "keyboard": (1.0, 8.0, None, 2500), "ambience": (8.0, 600.0, None, 500),
}
DEFAULT_RULE = (0.01, 10.0, None, 1500)


def measure(path, folder):
    lo, hi, att, target = RULES.get(folder, DEFAULT_RULE)
    x2 = A.decode(path, sr=SR, seconds=hi + 5, mono=False)
    x = x2.mean(axis=1)
    a, b = A.audible_span(x, SR)
    body = x[int(a * SR): int(b * SR)] if b > a else x
    h_lv, flat = A.hiss(x, SR)
    m = {"dur": round(b - a, 3), "peak_db": round(A.db(np.abs(x).max()) if len(x) else -180.0, 1),
         "clip": round(A.clip_fraction(x2.ravel()), 5), "hiss_db": None if h_lv is None else round(h_lv, 1),
         "flatness": None if flat is None else round(flat, 2), "attack_ms": A.attack_ms(x, SR) if len(x) else 0.0,
         "centroid": round(A.centroid_hz(body, SR)), "corr": round(A.stereo_corr(x2), 2), "reasons": []}
    if not lo <= m["dur"] <= hi: m["reasons"].append("length")
    if m["clip"] > 0.001: m["reasons"].append("clipping")
    if folder != "ambience" and h_lv is not None and h_lv > -35 and flat > 0.4: m["reasons"].append("noisy")
    if m["corr"] < -0.3: m["reasons"].append("antiphase")
    soft = m["attack_ms"] >= 25
    m["score"] = round(-abs(np.log2(max(m["centroid"], 20) / target)) - (0.5 if att and soft != (att == "soft") else 0.0), 2)
    return m


def credit_key(credits, rel):
    return next((k for k in credits if k.endswith("/library/" + rel)), None)


def move(lib, rel, part, credits):
    """library/<folder>/<file> → <part>/<folder>/<file> next to the library; the credits key follows."""
    dst = os.path.join(os.path.dirname(lib), part, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(os.path.join(lib, rel), dst)
    k = credit_key(credits, rel)
    if k: credits[k[: -len("/library/" + rel)] + f"/{part}/" + rel] = credits.pop(k)


def screen(lib, per_role, dry=False):
    cp = os.path.join(lib, "credits.json")
    credits = json.load(open(cp)) if os.path.exists(cp) else {}
    res = {}
    for folder in sorted(os.listdir(lib)):
        d = os.path.join(lib, folder)
        if not os.path.isdir(d): continue
        ms = {f"{folder}/{f}": measure(os.path.join(d, f), folder) for f in sorted(os.listdir(d)) if f.lower().endswith(AUDIO)}
        approved = {k for k in ms if (credits.get(credit_key(credits, k)) or {}).get("approved")}
        ok = sorted((k for k, m in ms.items() if not m["reasons"] and k not in approved), key=lambda k: -ms[k]["score"])
        for k, m in ms.items():
            m["status"] = ("approved" if k in approved else "rejected" if m["reasons"]
                           else "shortlist" if ok.index(k) < per_role else "reserve")
        res.update(ms)
    if not dry:
        for k, m in res.items():
            if m["status"] in ("rejected", "reserve"): move(lib, k, m["status"], credits)
        json.dump(credits, open(cp, "w"), ensure_ascii=False, indent=1)
    json.dump(res, open(os.path.join(lib, "screen.json"), "w"), ensure_ascii=False, indent=1)
    return res


def main():
    a = sys.argv[1:]
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    lib = os.path.abspath(opt("--lib", os.path.join(ROOT, "brand", "sfx", "library")))
    res = screen(lib, int(opt("--per-role", 6)), dry="--dry" in a)
    by = {}
    for k, m in res.items():
        f = by.setdefault(k.split("/")[0], {})
        f[m["status"]] = f.get(m["status"], 0) + 1
    for f, c in by.items(): print(f"{f:14s} " + ", ".join(f"{s} {n}" for s, n in sorted(c.items())))
    print(f"→ {os.path.relpath(os.path.join(lib, 'screen.json'), ROOT)}" + (" (dry: nothing moved)" if "--dry" in a else ""))


if __name__ == "__main__":
    main()
