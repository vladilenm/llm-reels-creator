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
/reel <file> [— brief in one line] [--mode kit|full] [--review-cuts] [--density light|medium|heavy] [--slug name]
```

Defaults: `--mode kit`, `--density medium`, ГЕЙТ A off. Without `--slug`, pick a
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
node scripts/ru/intake.mjs <file> --slug <slug> --brief "<brief>" --mode kit --density medium [--review-cuts]
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

### S2 Чистка — stop only with --review-cuts (ГЕЙТ A)

```bash
P=<project>
node .agents/skills/cut-silences/scripts/cut-silences.mjs $P/transcript.words.json --out-dir $P/work
node .agents/skills/cut-mistakes/scripts/find-cut-candidates.mjs $P/transcript.words.json --out-dir $P/work
```

Then **read the whole transcript yourself** (`transcript.words.json` text, with
times) — mandatory even if the detector reports nothing. Decide every candidate:
`hesitation` cut; `retake_marker` cut when the restart repeats the fragment;
`filler` only when it is padding; add any missed retake, false start or broken
phrase by hand. Rules: `references/ru-fillers.md`. Write the decisions to
`$P/work/cuts.approved.json` (`{ "cuts": [{ "start", "end", "reason" }] }`, source
seconds; reasons in Russian, mark manual ones `вручную: …`). Then:

```bash
node scripts/ru/build-edl.mjs --transcript $P/transcript.words.json --silence-edl $P/work/source.silence-edl.json \
  --approved $P/work/cuts.approved.json --video $P/assets/raw.<ext> --project $P
```

Outputs `EDL.json` (source timeline), `CUTS.md`, `renders/clean.mp4`,
`transcript.clean.json` (clean timeline — everything after S2 uses only this).
With `--review-cuts`: show `CUTS.md` and wait before building. Check: no kept
gap > 0.6 s, no cut inside a word, the first word survives.

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

**ГЕЙТ B:** show the three hooks and the plan table, recommend one hook, then stop
and wait. Record the answer with `status.mjs --decision` and count requested changes
for `gate_b_changes`.

### S4 Графика — no stop

Build each approved event with **motion-broll** (read its `reference/engine-api.md`
and examples first). Vertical: every clip uses `W:1080,H:1920` and the source fps.

- `full` → opaque clip, render to `.mp4`.
- `panel` / `card` → `bg:null`, render to `.mov` (ProRes 4444 with alpha), placed
  where `PLAN.json` says, never over the face unless the plan says so.
- Text and logos inside y 360–1420, x ≤ 960. Brand colours/fonts from `brand.md`;
  Cyrillic fonts only (the engine's Geist has Cyrillic; for Inter add `@font-face`
  from `brand/fonts/`). Apply `motion-principles` for easing and choreography.
- Each state change lands on its word: clip-local time = word time on the clean
  timeline − clip in-point (`transcript.clean.json`).
- Only real figures from the speech or the customer; otherwise relative bars,
  skeleton lines or labels from the transcript.

```bash
SK=.agents/skills/motion-broll
python3 $SK/engine/build.py $P/broll/dist $P/broll/clips/NN-name.html
NODE_PATH=./node_modules node $SK/engine/beats.js $P/broll/dist/NN-name.html $P/review/NN-beats.png 0.4 1.2 …
NODE_PATH=./node_modules node $SK/engine/render.js $P/broll/dist/NN-name.html $P/broll/NN-name.mov 30
node scripts/ru/check-glyphs.mjs --font brand/fonts/Inter-700.ttf --font $SK/engine/fonts/Geist-Variable.woff2 --html $P/broll/clips/NN-name.html
```

Write `$P/broll/plan.json` (motion-broll schema: `{ title, video: "../renders/clean.mp4",
fps, clips: [{ id, title, line, in, out, kind: "full"|"panel", file }] }`, clean
timeline, `file` relative to `broll/`).

### S5 Субтитры — no stop

```bash
node scripts/ru/make-captions.mjs $P --render
```

«anchor rail» from our transcript (no re-transcription): ≤ 22 chars per line, ≤ 2
lines, no hyphenation, active word in the accent colour, positioned from
`brand.md` (`captions.baseline_y`). Writes `captions/index.html`, `captions.srt`,
`renders/kit/captions.mov` (ProRes 4444 alpha). Fails if the font lacks any glyph.
Why not the `embedded-captions` engine: `references/output-modes.md` § captions.

### S6 Самопроверка — no stop, max 3 iterations

```bash
node scripts/ru/assemble.mjs $P --preview
node scripts/ru/contact-sheet.mjs $P/renders/preview.mp4 --plan $P/PLAN.json --every 2 --out $P/review/sheet-1.png
```

Look at every sheet yourself (Read the PNG). Go through
`references/review-checklist.md` item by item. Fix, re-render what changed,
re-sheet (`sheet-2`, `sheet-3`). After 3 iterations stop fixing and list what
remains. Write `REVIEW.md`: what was checked, what was fixed, which sheet shows it,
what remains. Never claim a fix that was not re-rendered and looked at.

### S7 Сборка — ГЕЙТ C, always stop

`renders/preview.mp4` (540×960) is the review copy. **ГЕЙТ C:** give the path
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
