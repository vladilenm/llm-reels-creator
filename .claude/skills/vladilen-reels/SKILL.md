---
name: vladilen-reels
description: Reels Studio orchestrator for Vladilen's raw vertical talking-head reels in Russian (AI and frontend topics). Use for /reel and whenever a raw reel needs the full edit — pauses, flubs and retakes cut, a 3-second hook, word-timed motion graphics, Russian captions, frame self-review and an Instagram Reels export. Routes into cut-silences, cut-mistakes, short-form-edit, motion-broll and reel-export with Russian-specific rules, two mandatory human gates and a lessons log.
---

# vladilen-reels

Claude does not edit on a timeline. It turns the video into data (word times),
decides in text (EDL, plan), and lets tools execute (ffmpeg, HyperFrames,
Playwright). It sees frames through contact sheets. **It cannot hear**: the final
sound is checked by the human, and every report says so.

## Invocation

```
/reel <file> [— brief in one line] [--mode kit|full] [--review-cuts] [--density light|medium|heavy] [--slug name] [--remake <remake project>] [--principles]
```

Defaults: `--mode kit`, `--density medium`, ГЕЙТ A off, principles off. Without `--slug`, pick a
short Latin kebab-case slug from the brief (`agents-10h`). The project is
`video-projects/<YYYY-MM-DD>-<slug>/`.

## Before anything creative

Read, in this priority order when they conflict (higher wins):

1. the customer's words in the current message;
2. `lessons.md` (customer's own past corrections);
3. `brand/brand.md` (tokens in its JSON block are read by the scripts);
4. this skill and its `references/`;
5. chassis skills (`short-form-edit`, `cut-*`, `hyperframes*`);
6. other skills (`motion-broll`, `motion-principles`, `reel-export`, …).

Also read `refs/NOTES.md` and `MOTION_PHILOSOPHY.md`. Educational speech: let
phrases breathe; this is not a sizzle cut. Never invent numbers, facts, results,
quotes or testimonials — only what is said in the video or given by the customer.
Never publish or send anything.

## Wide OBS recordings

A `Reels-wide-*.mp4` (4104×1964: the reels layout left, the Mac screen 1:1 right) goes to the `reel-wide`
skill (`/reel-wide`): it runs these stages with its own cutting, window and base scripts (`scripts/ru/wide/`)
and the customer's standing brief for that format.

## Remake (`--remake`)

The raw footage was shot from a script made by `reel-remake` (`/remake`): someone
else's reel taken apart and adapted. Pass `--remake <project>` to `intake.mjs`; it
refuses without an approved `SCRIPT.md` and writes a «Ремейк» section into `BRIEF.md`.
Then, on top of the usual rules:

- S2: the script is the intended text. A line said twice is a retake — keep the best
  take; off-script words are not cut just for being off-script.
- S3: build `PLAN.json` from the script's «Что в кадре» column, moved onto the clean
  timeline; one of the three hooks is the script's hook. Show at ГЕЙТ B what differs
  from the script and why (a line dropped, a device that did not fit the footage).
- S4/S4b: devices the script marked «собрать» are built here unless built earlier.
- The reference's footage, sound and words never enter the reel.

## Resume

`STATUS.json`/`STATUS.md` track stages. If the project already exists, run
`node scripts/ru/status.mjs <project> --next` and continue from that stage. Never
repeat a paid call: transcription is cached by SHA-256 of the source.

## Stages

Mark each stage with `node scripts/ru/status.mjs <project> --stage SX --state done --note "…"`
(`running` when starting, `waiting` at a gate, `failed` with the reason). Record
human decisions with `--decision "…"`.

### S0 Приём — no stop

```bash
node scripts/ru/intake.mjs <file> --slug <slug> --brief "<brief>" --mode kit --density medium [--review-cuts] [--remake <remake project>] [--principles]
```

Creates the project via `new-video`, copies the source to `assets/raw.*` (the
original is never touched), writes `PROBE.json`, `BRIEF.md`, `STATUS.md`. Then
append to `BRIEF.md` 3–6 bullets of what matters from brand/lessons/refs for this
reel. Deal with PROBE warnings (rotation, VFR, HEVC/HDR) in the plan.

### S1 Транскрипция — stop only if the transcript is garbage

```bash
node scripts/ru/transcribe.mjs <project>/assets/raw.<ext> --out <project>/transcript.raw.json
node scripts/ru/normalize-transcript.mjs <project>/transcript.raw.json --media <project>/assets/raw.<ext> --out <project>/transcript.words.json
```

Provider: `TRANSCRIBE_PROVIDER` in `.env` (default `openai` = whisper-1 with word
timestamps; `elevenlabs` = Scribe v2, needs a route ElevenLabs accepts). If no key
is set, ask the customer to put it in `.env` themselves — never ask them to paste a
key in chat. Sanity check: `cyrillic_share` ≥ 0.6 and the text reads as the topic
of the brief; otherwise stop and show the first lines. Note in STATUS whether the
result came from cache.

**Speech whisper missed** (lessons voice-studio, senior-ai, gpt-watermarks, fake-customers, claude-phone,
harness2): whisper skips a repeated phrase, glues coughs and «кхм» to words, invents «Спасибо за просмотр» in
noise and garbles fast speech. Right after S1:

```bash
python3 scripts/ru/wide/gaps.py $P [t0-t1 …]      # wide recordings: scan.py $P --gaps --transcribe
```

`work/GAPS.md` lists every sound > −45 dB with no word on it (f0, voicing; voiced chunks re-transcribed) and
re-transcribes the src ranges you pass — every phrase that reads as garbage or carries a number. Speech is
f0 95–180 Hz with voicing ≳ 40 %; a 290 Hz tone or 0 % voicing is a click or hum. Cached, so a rerun is free.

### S2 Чистка — stop only with --review-cuts (ГЕЙТ A)

```bash
P=<project>
node .claude/skills/cut-mistakes/scripts/find-cut-candidates.mjs $P/transcript.words.json --out-dir $P/work
```

Then **read the whole transcript yourself** (`transcript.words.json` text, with
times, plus `work/GAPS.md`) — mandatory even if the detector reports nothing. Decide every candidate:
`hesitation` cut; `retake_marker` cut when the restart repeats the fragment;
`filler` only when it is padding; add any missed retake, false start or broken
phrase by hand, and every click, cough or mumble from `GAPS.md`. Rules: `references/ru-fillers.md`.

**Pauses come from the audio envelope, not from whisper word times** (folded from ten reels'
lessons, 2026-10-12…25: whisper stretches words over pauses and hides silence inside them; the
customer asked for shorter joins on almost every reel). Write only the content cuts to
`$P/work/cuts.manual.json` (`{ "cuts": [{ "start", "end", "reason" }] }`, source seconds, reasons in
Russian, manual ones `вручную: …`), including the head up to the first word and the tail after the
last one. Then:

```bash
python3 scripts/ru/wide/env-cuts.py $P             # + every pause inside kept pieces → 0.08 s → work/cuts.approved.json
node scripts/ru/build-edl.mjs --transcript $P/transcript.words.json --approved $P/work/cuts.approved.json \
  --video $P/assets/raw.<ext> --project $P --snap-fps <source fps>     # no --silence-edl, no --max-pause
python3 scripts/ru/wide/clean-words.py $P          # whisper on clean.mp4 + work/clean-fixes.json → transcript.clean.json
```

Outputs `EDL.json` (source timeline), `CUTS.md`, `renders/clean.mp4`,
`transcript.clean.json` (clean timeline — everything after S2 uses only this; spelling, merged words and
start times whisper misplaces go to `work/clean-fixes.json`).
With `--review-cuts`: show `CUTS.md` and wait before building. Check: no kept
gap > 0.6 s, no cut inside a word, the first word survives, and **frame 0 is the first word** with the
eyes open — no silent lead-in (youtube-skills, geo-sleuth, voice-studio). Read the envelope around every
manual cut (`work/env10ms.npy`) before trusting a word edge.

### S3 Драматургия — ГЕЙТ B, always stop

Follow `short-form-edit`'s opening rules on the clean transcript:

- The question: «убеждают ли первые 3 секунды досмотреть?»
- `DESIGN.md`: audience, the promise, **3 genuinely different first-3-second
  variants** (which words open, what is on screen at frame 0, what changes by 3 s),
  open loops and where they pay off, the CTA (from `brand.md` unless the brief says
  otherwise), visual direction from `brand.md`.
- `OPEN-LOOPS.json`: `[{ id, question, setup_at, payoff_at, supporting_words }]`
  plus `opening: { variant, benefit, evidence_by_3s, payoff_at }`.
- `PLAN.md` + `PLAN.json`: the graphics plan on the clean timeline. Format:
  `references/plan-format.md`. Each event: in/out, type (`full` полноэкранная
  врезка / `panel` панель рядом / `card` карточка поверх / `none` ничего), the exact
  phrase it rides, what is shown, the reason. Density: light 2–4/min, medium 4–7/min,
  heavy most lines with short gaps of face. Keep ≥ 2 s of face after the hook and
  between full-frame cutaways; never cover the first second of the hook.

A hook variant that needs reordering speech is allowed only as a proposal; it
becomes a new EDL after approval.

**Principles** (only with `principles: true` in `STATUS.json` or on request): run the
checks of `.claude/skills/reel-remake/references/script-principles.md` on the clean
transcript — 1, 3, 4, 6, 7 without `--remake`, only 7 (fluff not in the script) with it.
The speech is already shot: an edit may only cut, reorder or show on screen what was
said. Write `$P/PRINCIPLES.md`; cuts and reorders stay proposals like the hook reorder.

**ГЕЙТ B:** show the three hooks and the plan table (with principles, also the verdict
table and numbered edits), recommend one hook, then stop and wait. Record the answer with `status.mjs --decision` and count requested changes
for `gate_b_changes`.

**Motion storyboard (night look, `fx.json` `"look": "night"`).** `PLAN.json` `motion`: one entry per state change,
`{at, word, verb, what}` — `at` is the start of `word` on the clean timeline, verbs from `scripts/ru/motion-check.mjs`
(16: fly, pull, live, layers, lens, grid, materialize, rebuild, tree, physics, callouts, active, chapter, return, morph,
prompt). No verb twice in a row, at least 5 different ones, one hero scene built by hand for the tool (usually the hook
or the main claim), 1–2 light accents on the strongest moments, the rest of the accents are night ones.
`node scripts/ru/motion-check.mjs $P` must PASS. It runs at S3 before `work/accents.json` and `broll/plan.json`
exist, so run it again after S4/S4b, once the accents exist, before the preview; that run's `MOTION.md` goes into
the preview report.

### S4 Графика — no stop

Build each approved event with **motion-broll** (read its `reference/engine-api.md`
and examples first). Vertical: every clip uses `W:1080,H:1920` and the source fps.

**Window above the head** (remakes in the clone-app-good-ref look): write clips with `SK.run`
from `scripts/ru/broll/screen-kit.js` (schema in its header: title, icons, browser window with our
screenshots or recordings, camera moves, `hl`/`ring` marks, cursor, counter; `mode:'dark'` for the
full-frame insert) and build them with `python3 scripts/ru/broll/build.py $P/broll/dist <clips>`;
cut recordings with `node scripts/ru/broll/screen-frames.mjs <rec> $P/screens/<name> --from --to`.
Light clips are panels (`.mov`), dark ones are `full`. Then render with the engine as usual.
If the head sits high in the raw (no room above it), put the window phrases into `fx.json`
`relocate` windows (customer, 2026-10-19: speaker cut out and moved down over his own blurred, lifted
room) and run `fx_picture.py $P --prep-relocate` first; close-ups stay the plain frame.

**Night look** (`look: "night"`): windows `SK.run({theme: 'night', …})` — public pages screenshotted headless with
Playwright `colorScheme: 'dark'`; glass list and night card; `pull`, `enter: 'grid'`, `layers`, `lens`. Object scenes
and accents: `OK.run` (`scripts/ru/broll/object-scene.js`, schema in its header) with objects from
`scripts/ru/broll/object-kit.js` (32 objects listed in its header). A missing object: draw it in the reel's generator
from `OK.box/cyl/disc/face/plate/circ` in the same style; reusable → add it to `object-kit.js` with a `checkObjects`
test. Accents are full `OK.run` layers listed in `work/accents.json` (`kind: night | light`; schema in the header of `night_base.py`), not in `broll/plan.json`;
a light full insert carries `theme: "light"` in `broll/plan.json`. Joins: full clips and panels butt (out = the next
in); a full clip that follows a frame with the speaker starts its entry 0.08–0.1 s before the cut. Lines ≥ 3 px,
labels ≥ 30 px, entries expo-out 0.6–0.9 s, exits 0.3–0.4 s, no bouncing springs.

- `full` → opaque clip, render to `.mp4`.
- `panel` / `card` → `bg:null`, render to `.mov` (ProRes 4444 with alpha), placed
  where `PLAN.json` says, never over the face unless the plan says so.
- Text and logos inside y 360–1420, x ≤ 960. Brand colours/fonts from `brand.md`;
  Cyrillic fonts only. Build every reel clip with `scripts/ru/broll/build.py`: it embeds
  `font_body` as 'SK Sans', `font_serif.italic` as 'SK Serif', `font_mono` as 'SK Mono' and
  switches the engine's `#stage`/`.mono` from Geist to them. Headings in clips use
  `font_heading`. Apply `motion-principles` for easing and choreography.
- Each state change lands on its word: clip-local time = word time on the clean
  timeline − clip in-point (`transcript.clean.json`).
- Only real figures from the speech or the customer; otherwise relative bars,
  skeleton lines or labels from the transcript.
- **Every clip is complete on its first frame** (senior-ai, fake-customers, harness2): window, title and
  cards enter at `tin −0.3`, so a clip that follows another never shows 0.1–0.25 s of an empty window or a
  blank title plate at the join. A background-swap layer ends with a cut, not a fade: a fade shows the
  empty light canvas before the next window.

```bash
SK=.claude/skills/motion-broll
python3 scripts/ru/broll/build.py $P/broll/dist $P/broll/clips/NN-name.html
NODE_PATH=./node_modules node $SK/engine/beats.js $P/broll/dist/NN-name.html $P/review/NN-beats.png 0.4 1.2 …
NODE_PATH=./node_modules node $SK/engine/render.js $P/broll/dist/NN-name.html $P/broll/NN-name.mov 30
node scripts/ru/check-glyphs.mjs --font <font_body file> --font <font_heading file> --html $P/broll/clips/NN-name.html
```

Write `$P/broll/plan.json` (motion-broll schema: `{ title, video: "../renders/clean.mp4",
fps, clips: [{ id, title, line, in, out, kind: "full"|"panel", file }] }`, clean
timeline, `file` relative to `broll/`).

### S4b Картинка и звук — no stop

The edit effects (the customer asked for them on 2026-10-12: «эффект вау», not bare cuts
plus cards) are baked into `renders/picture.mp4`; cards and captions stay overlays.
Everything reel-specific lives in `$P/fx/fx.json` (schema in the header of
`scripts/ru/fx/fx_picture.py`): zoom-blur on location changes, punch-ins on cuts inside
a location and slow drift in long shots, title moments (the frame shrinks onto the dark
brand background with giant text; with person masks the text sits behind the head and
the room opens back through an iris), a phone PiP with a real cut take, floating
thumbnails of real artifacts, quiet SFX.

```bash
swift scripts/ru/fx/person-mask.swift <frames-dir> $P/fx/masks/<seg>   # Apple Vision, offline; frames = clean.mp4 frame numbers
ffmpeg -i $P/renders/clean.mp4 -vf fps=30,scale=360:640 -start_number 0 $P/work/face-frames/%05d.png
swift scripts/ru/fx/face-track.swift $P/work/face-frames $P/fx/faces.json   # face box per frame, ~10 s per reel
python3 scripts/ru/fx/sfx.py $P                                          # fx/sfx.wav from fx.json "sfx" + location joins
python3 scripts/ru/fx/fx_picture.py $P --validate                       # fx.json against EDL.json joins
python3 scripts/ru/fx/fx_picture.py $P --stills 1.0,4.6                 # check frames before the full pass
python3 scripts/ru/fx/fx_picture.py $P                                  # → renders/picture.mp4 (voice + SFX)
```

**Sound layer (S4c, part of S4b).** One soundtrack instead of voice + SFX:
voice polish, a 6 ms dip at every join, the SFX, and — when the brief or the customer
wants it — a music bed that ducks under speech, sits on the beat and can stop before a
punchline. Settings: `fx.json` → `"sound"` (schema in the header of `scripts/ru/fx/sound.py`).
Music comes only from `brand/music/` (licensed, listed in `tracks.json`) or from a paid
generation the customer approved; never invent a source.

```bash
python3 scripts/ru/fx/sfx.py $P                       # fx/sfx.wav (kit samples from brand/sfx/ when present)
python3 scripts/ru/fx/sound.py $P --suggest-bpm       # tempo brief for generated music
python3 scripts/ru/fx/sound.py $P                     # → fx/mix.wav + fx/sound.json (levels, beat offsets)
python3 scripts/ru/fx/sound.py $P --music brand/music/x.mp3 --variant B   # alternative → fx/mix.B.wav
node scripts/ru/export-reel.mjs $P/work/composite-full.mov $P/renders/final.B.mp4 --audio $P/fx/mix.B.wav
```

Set `"audio": {"mix": "fx/mix.wav"}` in `fx.json` so `fx_picture.py` uses it. To compare
soundtracks on a built reel, export variants with `--audio` — no re-render. Offer 2–3
music variants at ГЕЙТ C: the choice is by ear. Report `under_speech_db_vs_voice`,
`events_on_beat` and the stop-downs from `fx/sound.json`.

**Picture polish (default since 2026-10-13, customer asked for it).** In `fx.json`:
`"face": {"track": "fx/faces.json", "follow": true, "eye_match": true}` — punch-ins and
drift go to the face, and on every location change the outgoing and incoming faces meet
halfway so the eye does not jump (skipped next to title moments).
`"grade": {"match": 0.7, "tint": 0.5, "contrast": 0.12, "grain": 2.0}` — locations are
matched in colour toward the median shot, a light brand tint sits in the shadows, fine grain.
Keep skin natural (`brand.md`): if a shot looks off, lower `match` or `tint`, never push past
the defaults without the customer. `fx_picture.py` prints the per-shot gains and shifts —
check them. A new look next to an approved one: `fx_picture.py $P --out renders/picture.v2.mp4`,
then `assemble.mjs $P --final --tag v2` → `renders/final.v2.mp4`; the approved files stay.

**World swap and impact (default since 2026-10-13).** `"world_swap": {"joins": "all", "dur": 0.32}`:
on each location change (not next to a title moment) the speaker is cut out and stays while
the old room whips left and the new one whips in; the cut lands at full speed and the new
shot settles in 3 frames. Masks first: `fx_picture.py $P --prep-swap` (Apple Vision, seconds).
`"impacts"`: by default the `hit` SFX word gets 0.25 s of shake + RGB split + flash — one per
reel; more dilutes it. Check stills inside each swap window: no hole or ghost on the person.

Then set `"video": "../renders/picture.mp4"` in `broll/plan.json`; `assemble.mjs`
builds on it. `fx_picture.py` snaps join times to the frame where `clean.mp4` really
cuts. SFX: never inside a word (`sfx.py` warns), a transition whoosh never starts
before the last word has ended. Skip S4b only when the customer asks for a plain cut.
Default (customer, 2026-10-12): background-swap title moments almost every reel — the hook,
the strongest claims and the ending (usually 2–4 per reel, ≥ 1.2 s each, each on its own
phrase), with person masks so the text sits behind the head, plus zoom-blur on every
location change. Propose them in the S3 plan as `fx` events.
**OBS-template takes** (1080×1920 from his OBS scene: placeholders on top, the camera as a rounded card
from y 1098). The base is `python3 scripts/ru/wide/obs_base.py $P [--mix]` — brand canvas, the card as
recorded, punch-ins 1.00 ↔ 1.07 on the joins — not `fx_picture.py`.
With `look: "night"` the base is `python3 scripts/ru/wide/night_base.py $P --prep` (Vision masks for the whole reel; chair or clutter at the shoulder: skip `--prep`, use `--card`; `--allow-missing` only when you know why masks are missing) →
`--stills <t,…>` (check the mask edges, the halo, every accent) → `--mix`: the night background drawn in code, the
speaker by the mask ×1.1 from the bottom with a halo (a soft shadow on light accents), punch-ins 1.00 ↔ 1.05 on the
joins, accents from `work/accents.json` under him — the word is always behind the head. `obs_base.py` and `obs_swaps.py`
stay for the light look.
In the light look, background swaps depend on the wall:
- **plain wall, nothing at the shoulder → swaps with the mask** (customer twice on 2026-10-25, claude-sfx and
  harness2: «с маской, чтоб фон вырезать»): render each swap as a full dark `.mp4` (background, glow behind
  the speaker, text; no hole for the card), list them in `work/swaps.json` and leave them out of
  `broll/plan.json`, then `python3 scripts/ru/wide/obs_swaps.py $P --prep` and `obs_swaps.py $P` → the room and
  the card frame go, he stays in place on the dark background. Check stills on every swap frame range.
- **a chair or clutter at the shoulder → no mask**: the swap is a `.mov` layer that darkens everything around
  the card (geo-sleuth, voice-studio: the Vision mask flickered on the chair back).
Captions are hidden (`captions.hide`) over a swap whose big text repeats the words.

Also default (customer, 2026-10-12): quiet SFX on every visual event (`scripts/ru/fx/sfx.py`:
whoosh on transitions, click on presses, pop on appearances, one hit on the key word) and
small smooth animated transitions on every card — spring in/out with a short blur (night look: expo-out with a long brake, no bounce), morph
between states (motion-broll `M.vis` / `SEQ`), never a hard pop-in.

**Real sounds instead of the synth (since 2026-10-25).** `sfx.py` plays `brand/sfx/<kind>.wav`
when it exists. The kit comes from `node scripts/ru/sfx-kit.mjs` (earshot bank: sounds made in
code, rendered by id, audited by `earshot sfx check`; choice in `brand/sfx/kit.json`) or, per kind,
from a CC0 Freesound recording fetched from Openverse (`sfx-fetch.mjs` → `brand/sfx/library/`,
`sfx-kit.mjs --source openverse`). Check that `sfx.py` prints `kit: brand/sfx`, not `none (synth)`.
When the customer asks for real recorded sounds on a finished render («озвучь настоящими
звуками»), use the `real-sfx` skill on `renders/final.mp4` with `--voice-safe`; its library is
`brand/sfx/library`. Never both on one reel: Real SFX takes the baked-in layer out, not doubles it.

### S5 Субтитры — no stop

```bash
node scripts/ru/make-captions.mjs $P --render
```

«anchor rail» from our transcript (no re-transcription): ≤ 22 chars per line, ≤ 2
lines, no hyphenation, active word in the accent colour, positioned from
`brand.md` (`captions.baseline_y`). Writes `captions/index.html`, `captions.srt`,
`renders/kit/captions.mov` (ProRes 4444 alpha). Fails if the font lacks any glyph.
Why not the `embedded-captions` engine: `references/output-modes.md` § captions.

**Kinetic style** (customer, 2026-10-18: a separate style for remakes with a window above the
head): `PLAN.json` `captions.style: "kinetic"` → 1–3 words centred between the window and the head,
future words dimmed, one accent word per phrase in the brand serif italic, `font_serif.italic` (`captions.kinetic.accent_words`
or `accent` times, `breaks`, `y_keys`, `theme_keys` light/dark — schema in the header of
`kineticHtml`). Use it when the remake's SCRIPT.md asks for it; anchor rail stays the default.
With `look: "night"` kinetic captions are dark and switch to the light theme over light accents and light full inserts by themselves (`nightCaptions`); explicit `theme_keys` win.

### S6 Самопроверка — no stop, max 3 iterations

```bash
node scripts/ru/assemble.mjs $P --preview
node scripts/ru/contact-sheet.mjs $P/renders/preview.mp4 --plan $P/PLAN.json --every 2 --out $P/review/sheet-1.png
```

Then let earshot listen for you (since 2026-10-25; ~20 s, models cached in `tools/earshot/.cache`):

```bash
tools/earshot/.venv/bin/earshot timeline $P/renders/preview.mp4 --video $P/renders/preview.mp4 --out $P/review/earshot-timeline.json
```

Read its summary: every SFX tagged near a cut should say `OK` (within 1 frame); `near` with more
than ±60 ms means the whoosh or hit missed its cut — move it in `fx.json` and re-run `sfx.py`.
Also look for a whoosh or pop tagged inside speech and for a strong accent where the plan has
none. These are measurements, not listening: the customer still checks by ear.

Look at every sheet yourself (Read the PNG). Go through
`references/review-checklist.md` item by item. Fix, re-render what changed,
re-sheet (`sheet-2`, `sheet-3`). After 3 iterations stop fixing and list what
remains. Write `REVIEW.md`: what was checked, what was fixed, which sheet shows it,
what remains. Never claim a fix that was not re-rendered and looked at.

### S7 Сборка — ГЕЙТ C, always stop

`renders/preview.mp4` (540×960) is the review copy. **Speed:** he asks for a faster cut on almost
every reel; show the preview at normal speed and at **F = clamp(3.45 ÷ words per second of the clean
timeline, 1.05, 1.12)**, rounded to 0.01 (words of `transcript.clean.json` ÷ `EDL.json` clean_duration).
Calibrated on 18 approved reels (2026-10-19…25): dense takes land at ≈ 3.45 words/s after the speed-up —
2.6–3.0 w/s → ×1.1–1.12, 3.1–3.15 → ×1.1, 3.28 (harness2) → ×1.05; on slow takes (≈ 2.5 w/s, voice-studio,
replica) he once asked for up to ×1.2 after the final. Preview copy:
`ffmpeg -i renders/preview.mp4 -filter_complex "[0:v]setpts=PTS/F,fps=<fps>[v];[0:a]atempo=F[a]" … renders/preview.xF.mp4`;
the final variant: `node scripts/ru/speed-variant.mjs $P --factor F`. His number always wins.

**ГЕЙТ C:** give the path
(`open video-projects/<slug>/renders/preview.mp4`), the sheet paths and a short
list of what to look at; say «Звук мной не прослушан: громкость, музыку и склейки
по интонации проверь на слух». Wait. Apply the corrections (count them for
`gate_c_changes`), then:

- mode `kit`: `node scripts/ru/assemble.mjs $P --preview --kit` → `renders/kit/`
  (`clean.mp4`, `broll/NN-name_0m32s40.mov|mp4`, `captions.mov`, `captions.srt`,
  `TIMING.md`, `compare.html`, `viewer.html`).
- mode `full`: `node scripts/ru/assemble.mjs $P --final` → `renders/final.mp4`;
  `check-reel` must print `RESULT: PASS`.

### S8 Уроки — rules change only after «да»

1. Append the customer's corrections to `lessons.md` in their own words (format
   inside the file). Your own conclusions go on separate lines marked
   `предложение:`.
2. `node scripts/ru/log-run.mjs $P --review-iterations N --transcription-cached true|false --render-minutes N --gate-b-changes N --gate-c-changes N`
3. Every 5th run (count lines in `runs.log.jsonl`) propose folding repeated lessons
   into this SKILL.md; edit it only after the customer says yes.

## Report format

Short, per stage: what was done, what was decided, what needs the human. No
retelling of steps. End every report that includes audio with: «Звук мной не
прослушан: громкость, музыку и склейки по интонации проверь на слух».

## References

- `references/review-checklist.md` — S6 checklist (adapted from whaleyxbt/claude-motion review-loop).
- `references/sound-rules.md` — loudness, music under voice, SFX restraint (adapted from claude-motion sound-design).
- `references/ru-fillers.md` — Russian fillers, retake markers, cut judgement.
- `references/output-modes.md` — kit vs full, file formats, editors, captions engine choice.
- `references/plan-format.md` — `PLAN.json` / `PLAN.md` / `broll/plan.json`.
- `scripts/README.md` — every script in `scripts/ru/`.
