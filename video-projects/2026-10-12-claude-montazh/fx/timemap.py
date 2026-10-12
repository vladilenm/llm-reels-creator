# Old clean timeline (work/EDL.v1.json, pauses 0.24) → current clean timeline (EDL.json, pauses ≤ 0.12).
# A time inside a range the new EDL deleted lands on that join.
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.normpath(os.path.join(HERE, ".."))


def keeps(edl):
    dur, out, s = edl["source_duration"], [], 0.0
    for d in sorted(edl["delete_ranges"], key=lambda d: d["start"]):
        if d["start"] > s: out.append((s, d["start"]))
        s = max(s, d["end"])
    if s < dur: out.append((s, dur))
    return out


OLD = keeps(json.load(open(os.path.join(P, "work", "EDL.v1.json"))))
NEW = keeps(json.load(open(os.path.join(P, "EDL.json"))))


def clean_to_src(K, t):
    c = 0.0
    for a, b in K:
        if t <= c + (b - a) + 1e-9: return a + (t - c)
        c += b - a
    return K[-1][1]


def src_to_clean(K, s):
    c = 0.0
    for a, b in K:
        if s < a: return c                       # inside a deleted range → the join
        if s <= b + 1e-9: return c + (s - a)
        c += b - a
    return c


def remap(t):
    return round(src_to_clean(NEW, clean_to_src(OLD, t)), 3)


JOINS = []
_c = 0.0
for a, b in NEW[:-1]:
    _c += b - a; JOINS.append(round(_c, 3))

if __name__ == "__main__":
    for t in (0.22, 1.42, 4.42, 4.91, 8.857, 12.47, 14.05, 14.378, 17.10, 21.74, 26.45, 30.93, 33.582, 35.38, 38.88):
        print(f"{t:7.3f} → {remap(t):7.3f}")
    print("joins", JOINS)
