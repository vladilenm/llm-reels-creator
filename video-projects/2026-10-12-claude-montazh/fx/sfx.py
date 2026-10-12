# Quiet SFX accents, synthesised locally (no paid calls, no samples).
# Every time comes from transcript.clean.json words or PLAN.json/fx events (clean timeline).
# Levels follow references/sound-rules.md: main hit 0.3, transitions 0.15, helpers 0.06–0.12.
#   python fx/sfx.py  →  fx/sfx.wav (stereo 48 kHz, clean-timeline length) + fx/sfx.json
import json, os, wave, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, "..")
SR = 48000
words = json.load(open(os.path.join(P, "transcript.clean.json")))["words"]
DUR = float(json.load(open(os.path.join(P, "transcript.clean.json")))["audio_duration_secs"])
rng = np.random.default_rng(7)


def at(text, after=0.0):
    """start time of the first word `text` (punctuation ignored) at or after `after`"""
    for w in words:
        if w["start"] >= after - 1e-6 and w["text"].strip(".,!?«»").lower() == text.lower():
            return w["start"]
    raise KeyError(text)


def env(n, a, d):  # attack/decay envelope in samples
    e = np.ones(n)
    a = max(1, int(a * SR)); e[:a] = np.linspace(0, 1, a)
    e[a:] = np.exp(-np.linspace(0, d, n - a))
    return e


def lowpass(x, cut):  # one-pole, cut may be an array (sweep)
    y = np.zeros_like(x); k = 1 - np.exp(-2 * np.pi * np.broadcast_to(cut, x.shape) / SR); s = 0.0
    for i in range(len(x)):
        s += k[i] * (x[i] - s); y[i] = s
    return y


def whoosh(length=0.42, lo=300, hi=3800, big=False):
    n = int(length * SR); t = np.linspace(0, 1, n)
    cut = lo + (hi - lo) * np.sin(np.pi * t) ** 2
    x = lowpass(rng.standard_normal(n), cut) - lowpass(rng.standard_normal(n), cut * 0.25)
    x *= np.sin(np.pi * t) ** (1.6 if big else 2.2)
    if big:
        x += 0.5 * np.sin(2 * np.pi * (70 - 30 * t) * t * length) * np.exp(-4 * t)
    return x


def pop(f=660, length=0.09):
    n = int(length * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * (f * (1 + 0.6 * np.exp(-t * 60))) * t) * env(n, 0.002, 9)


def click(length=0.03):
    n = int(length * SR); t = np.arange(n) / SR
    return (0.6 * rng.standard_normal(n) + np.sin(2 * np.pi * 2400 * t)) * env(n, 0.0005, 14)


def tick(length=0.025):
    n = int(length * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * 1760 * t) * env(n, 0.0005, 10)


def chime(f=880, length=0.45):  # two notes, A major
    n = int(length * SR); t = np.arange(n) / SR
    a = np.sin(2 * np.pi * f * t) * env(n, 0.003, 7)
    b = np.zeros(n); k = int(0.07 * SR); b[k:] = np.sin(2 * np.pi * f * 1.5 * t[: n - k]) * env(n - k, 0.003, 7)
    return a + 0.8 * b


def hit(length=0.6):
    n = int(length * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (55 + 90 * np.exp(-t * 18)) * t) * env(n, 0.002, 6)
    snap = lowpass(rng.standard_normal(n), 2500) * env(n, 0.001, 40)
    return body + 0.5 * snap


# (time, name, sound, gain, pan)  pan −1 left … +1 right
import sys; sys.path.insert(0, HERE)
from timemap import JOINS as ALLJ
J = {"tripod_window": ALLJ[2], "window_selfie": ALLJ[4], "selfie_mirror": ALLJ[5], "mirror_close": ALLJ[8], "close_end": ALLJ[10]}
prev_end = lambda t: max(w["end"] for w in words if w["end"] <= t + 1e-6)
EV = []
for k, t in J.items():
    # ГЕЙТ C: the whoosh never starts before the last word has ended (it masked «субтитры»)
    EV.append((max(t - 0.12, prev_end(t) + 0.03), f"переход {k}", whoosh(), 0.15, 0.0))
EV += [
    (at("монтировал"), "хук: «монтировал»", pop(660), 0.08, 0.0),
    (at("склейки"), "хук: «склейки»", pop(740), 0.08, 0.0),
    (at("собрал"), "хук: «Claude» удар", hit(), 0.30, 0.0),
    (4.42 - 0.12, "хук: фон раскрывается", whoosh(0.55, 200, 3000, big=True), 0.18, 0.0),
    (at("CapCut") + 0.29, "зачёркнут CapCut", tick(), 0.06, -0.2),
    (at("премьера") + 0.12, "зачёркнут Premiere", tick(), 0.06, 0.2),
    (at("видео", 7.0), "промпт /reel отправлен", click(), 0.10, 0.0),
    (at("командой"), "промпт: готово", chime(880), 0.07, 0.0),
    (at("графику"), "всплыла графика (слева)", pop(880), 0.07, -0.6),
    (at("слова", 12.5), "всплыла графика (справа)", pop(990), 0.07, 0.6),
    (at("исходник") - 0.20, "телефон с исходником", pop(587), 0.08, -0.6),
    (at("рилс", 16.0) + 0.0, "счётчик 1:47 → 0:38", tick(), 0.07, -0.6),
    (at("рилс", 16.0) + 0.06, "счётчик", tick(), 0.06, -0.6),
    (at("рилс", 16.0) + 0.12, "счётчик", tick(), 0.05, -0.6),
    (at("словами"), "промпт «опусти ниже» отправлен", click(), 0.10, 0.0),
    (at("вниз") - 0.06, "субтитры уезжают вниз", whoosh(0.3, 500, 2500), 0.07, 0.0),
    (at("ошибок"), "lessons.md: запомнил", chime(880), 0.06, 0.0),
    (at("одобряю"), "кнопка «Одобрить»", click(), 0.10, 0.0),
    (at("подписывайся") - 0.12, "фон раскрывается (финал)", whoosh(0.5, 200, 3000, big=True), 0.15, 0.0),
    (at("подписывайся") + 0.55, "кнопка «Подписаться»", click(), 0.10, 0.3),
]

out = np.zeros((int(DUR * SR) + SR, 2))
log = []
for t, name, x, g, pan in EV:
    x = x / (np.max(np.abs(x)) + 1e-9) * g
    i = int(round(t * SR)); x = x[: max(0, len(out) - i)]
    l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    out[i:i + len(x), 0] += x * l * 1.414; out[i:i + len(x), 1] += x * r * 1.414
    log.append({"t": round(t, 3), "name": name, "gain": g})
out = out[: int(DUR * SR)]
pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")
with wave.open(os.path.join(HERE, "sfx.wav"), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
json.dump(sorted(log, key=lambda e: e["t"]), open(os.path.join(HERE, "sfx.json"), "w"), ensure_ascii=False, indent=1)
print(len(log), "events → fx/sfx.wav, peak", round(float(np.max(np.abs(out))), 3))
