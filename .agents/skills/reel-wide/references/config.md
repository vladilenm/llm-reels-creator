# reel-wide · configs

All times are on the **clean** timeline unless a field says `src`. Coordinates of the screen are native
screen pixels (3024×1964, the right part of the wide frame): read them from
`python3 scripts/ru/wide/native.py $P <src t>` (grid every 200 px) and
`… --text x0,y0,x1,y1` (word rects).

## `broll/screen.json` — the window content (`scripts/ru/wide/render_screen.py`)

```json
{"shots": [
  {"id": "a2-gh", "t0": 2.72, "t1": 9.65, "url": "github.com/wheresryan22/anatomy",
   "src": {"at": 4.04, "max": 6.92},
   "cams": [[2.72, [230, 180, 1150], 0], [3.30, [2140, 520, 640], 0.7]],
   "marks": [{"kind": "hl", "rect": [2559, 578, 127, 34], "t0": 4.82, "note": "detailed"}]}
]}
```

| field | meaning |
|---|---|
| `id` | folder `screens/<id>/`; shots of one kit clip follow each other without gaps |
| `t0`, `t1` | clean seconds the shot covers (the next shot starts at `t1`) |
| `url` | text in the window's address pill: a domain, «Claude», a file name |
| `src` | which source second is shown at clean time t: `{"at": s, "speed": k, "min", "max"}` = s + (t − t0)·k, clamped (`max` holds the last good frame before a scroll or a send); `{"hold": s}` one frame; `{"real": true}` the frame recorded under these words (EDL map); `{"lin": [[t, s], …]}` piecewise |
| `cams` | `[t, [x, y, w], dur]`: the screen rectangle shown (h = w / 2.103); each key eases (in-out cubic) from where the camera is; y is clamped above the dock (1830) |
| `marks` | `hl` — purple marker under words, sweeps in 0.28 s, stays to the end of the shot (or `t1`); `ring` — spring ring with glow, `t0`–`t1`; `rect` = `[x, y, w, h]` of the words |

Camera widths that read well at 1080 px: text 600–1150, a whole UI 1300–1600, a figure as a whole
1300–1560. A typing shot: `{"at": <typing start>, "speed": 2–2.5}` ending before the send (the layout jumps).
A long agent log: `{"at": …, "speed": 3–3.5}` on a wide camera — reads as «он работает долго».

## `broll/clips.json` — clips (`scripts/ru/wide/make_clips.py`)

```json
{"title": "anatomy-llm · …", "fps": 25,
 "layout": {"title_y": 200, "win": {"x": 540, "y": 380, "w": 900, "h": 480, "tin": -1}},
 "kits": [
  {"name": "A-hook-install", "in": 0.0, "out": 26.80,
   "titles": [{"l1": "Claude нарисовал,", "l2": "как LLM пишет текст", "tin": -1, "tout": 2.60},
              {"l1": "Скилл", "l2": "Anatomy", "tin": 2.72, "tout": 12.06}],
   "shots": [["a1-hook", "cut"], ["a2-gh", "whip"], ["a5-inst", "blur"]]}],
 "swaps": [
  {"name": "S1-40min", "in": 26.44, "out": 28.85, "note": "«И спустя 40 минут»",
   "items": [{"cls": "ln", "text": "Спустя", "top": 430, "size": 66, "t": 26.98, "kind": "line"},
             {"cls": "num", "text": "40", "top": 520, "size": 300, "t": 27.42, "kind": "count"},
             {"cls": "big", "text": "минут", "top": 840, "size": 130, "t": 28.04, "kind": "pop"}]},
  {"name": "S3-cta", "in": 58.56, "out": 61.88, "fade_out": false, "items": [
             {"cls": "pill", "text": "github.com/wheresryan22/anatomy", "top": 500, "t": 58.62, "kind": "pop"}]}]}
```

- Kit clip: the first shot starts at the clip's `in`; `titles[].tin/tout` in clean seconds; transitions
  `cut` (first shot), `whip` (another app or page), `blur` (another state of the same app).
- Swap: dark layer fades in 0.25 s from `in`, out over the last 0.3 s (`fade_out: false` holds to the end).
  Overlap the neighbouring kit clips by 0.15–0.3 s on both sides: the window slides under the dark layer.
  Text block between y 430 and 1000 (the card starts at 1100); widths ≤ 960 px: `big` 100–130 px for
  15–17 characters, `ln` 50–66 px. Item `t` = the start of the word it shows.
- `plan.json` is written with swaps last (on top). Render: `scripts/ru/wide/render-clips.sh $P [names]`.

## `fx/swaps.json` — swaps in the masked base (`scripts/ru/wide/obs_base.py --mask`)

For a take at a plain wall with nothing by the shoulder (claude-sfx). The speaker is cut out of the wall
and stands on the canvas without the card; a swap is drawn into the base: dark #0E0B14 + purple glow,
big text BEHIND the head, the speaker on top. Such swaps stay out of `broll/clips.json` (its card-shaped
hole would cover the speaker); captions are hidden over them as usual.

```json
{"swaps": [
  {"name": "S1-не-слышит", "in": 5.52, "out": 8.97, "note": "«не слышит звук, и эффекты ставит вслепую»",
   "items": [{"text": "не слышит", "font": "display", "size": 150, "y": 1000, "t": 5.80, "kind": "pop"},
             {"text": "звук", "font": "italic", "size": 112, "y": 830, "t": 6.40, "kind": "line", "color": "#B79CFF"}]}]}
```

| field | meaning |
|---|---|
| `in`, `out` | clean seconds; the dark background fades in over 0.25 s from `in`, out over the last 0.3 s (`fade_out: false` holds it to `out`) |
| `items[].text`, `size` | one line of text; size in px |
| `items[].font` | `display` Spectral ExtraBold (default) · `italic` Spectral SemiBold Italic · `mono` IBM Plex Mono · `golos` Golos 700 |
| `items[].y` | centre of the line in the frame; x is always the frame centre |
| `items[].t` | the start of the word it shows; the item comes in over 0.42 s out of a blur and stays to the swap's end |
| `items[].kind` | `pop` — spring scale 0.86 → 1; `line` (default) — rises 26 px |
| `items[].color` | `#RRGGBB`, default `#F5F3FA`; the accent line `#B79CFF` |
| `name`, `note` | labels only |

The head top sits around y 1020–1090 (×1.1 from the frame bottom): as approved, the big word 150–172 px
(≤ 820 px wide) is centred at y 950–1000 and tucks behind the head, the small line (`italic` 112 px or
`mono` 60 px) at y 790–830. Joins inside a swap (±0.3 s) do not change the punch-in (1.00 ↔ 1.05).
Masks: `fx/masks/<frame>.png`, Apple Vision on every card frame (989×822) of `renders/clean.mp4`; the
script makes them when the folder is empty and stops when their count differs from the video's frames —
after re-cutting `clean.mp4`, delete `fx/masks`. Check: `obs_base.py $P --mask --stills <t,…>` →
`review/base-<t>.png` (one still per swap and one between swaps).

## `PLAN.json` → `captions`

```json
"captions": {"style": "kinetic",
  "kinetic": {"y_keys": [{"at": 0, "y": 985}], "theme_keys": [{"at": 0, "theme": "light"}],
              "accent": [2.72, 6.21, 11.64]},
  "hide": [{"in": 26.44, "out": 28.70}, {"in": 58.56, "out": 61.95}]}
```
`accent` — start times of one word per phrase (Spectral italic); `hide` — every swap.

## `fx/fx.json`

```json
{"sfx": [{"name": "окно → GitHub", "kind": "whoosh", "t": 2.62, "gain": 0.09},
         {"name": "40", "kind": "hit", "t": 27.42, "gain": 0.22}],
 "audio": {"mix": "fx/mix.wav"},
 "sound": {"music": {"src": "brand/music/generated-lofi-106.wav", "bpm": 106, "start": "auto",
                     "level_db": -17, "duck_db": -9, "fade_out": 1.2,
                     "stops": [{"word": "спустя", "lead": 0.3, "back_word": "работает"}]}}}
```
Levels per kind are in SKILL.md «The format». A whoosh may start 0.1 s before its transition; pops,
ticks, clicks and chimes go on word boundaries (sfx.py warns otherwise).

## `work/cuts.manual.json` and `work/clean-fixes.json`

```json
{"cuts": [{"start": 16.24, "end": 27.84, "reason": "вручную: клавиатура и ожидание, слов нет"}]}
```
```json
{"text": {"Вот,": "Вот", "Anatomy,@21.54": "Anatomy", "Это@49.67": "Это,"},
 "drop": ["очень@49.88", "круто,@50.10"],
 "times": {"Значит,@12.07": [12.18, 12.40]}}
```
Keys of `clean-fixes.json` are `слово@начало` from `work/clean.whisper.words.json` (a bare word fixes
every occurrence).
