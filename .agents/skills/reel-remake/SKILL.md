---
name: reel-remake
description: Remake someone else's reel for Vladilen. Use for /remake and whenever the customer drops a downloaded reel by another author and wants it replicated — take it apart (story, hook, rhythm, shots, graphics, captions, sound by numbers), adapt the text to Vladilen's voice and true facts, give a shooting plan with locations and lines, then hand the raw footage to /reel with --remake. Never reuses the reference's footage, audio or words in the final reel.
---

# reel-remake

Someone else's reel in → a breakdown, an adapted Russian script and a shooting plan
out. The customer shoots by the plan, and the raw footage goes through the usual
`/reel` with `--remake`. The reference is studied, never used: its frames, sound
and words do not reach our render.

Worked example of the target quality: `refs/ref-04.md` (breakdown + adaptation) and
`refs/ref-04-text.md` (shooting text). Formats: `references/formats.md`.

## Invocation

```
/remake <reference file> [— brief: topic, what to keep, what to change] [--slug name] [--principles]
```

`--principles` (off by default) adds the script check from `references/script-principles.md`
to R3. Pass it to `ref-intake.mjs`, which stores it in `STATUS.json` (`principles: true`).
The same check runs on request («проверь сценарий по принципам») on an existing project.

Without `--slug`, pick a short Latin kebab-case slug from the reference's topic.
The project is `video-projects/<YYYY-MM-DD>-remake-<slug>/`. If it already exists,
run `node scripts/ru/status.mjs <project> --next` and continue from that stage.

## Before anything creative

Priority when rules conflict (higher wins): the customer's words in the current
message → `lessons.md` → `brand/brand.md` → this skill → `vladilen-reels`.
Also read `refs/NOTES.md`, `MOTION_PHILOSOPHY.md` and the S4/S4b sections of
`.agents/skills/vladilen-reels/SKILL.md` — that is what our pipeline can already build.

Hard rules:

- **Never invent facts.** Every claim, number, result or story in the adapted text is
  either true for Vladilen (said by him, in the brief, in `guide/`, in past projects'
  transcripts, in `lessons.md`) or marked `[проверь: …]` and asked at ГЕЙТ R.
  The reference author's results are not Vladilen's results.
- Borrow structure and mechanics, not words: the script is rewritten in Vladilen's
  voice (`brand.md` → «Словами»), not translated line by line.
- No other people's content in our reel (screenshots of their reels, their faces,
  their music). Replace with our own artifacts or drop.
- Paid calls: only the R1 transcription (cached by SHA-256). Nothing is published.
- Claude cannot hear: sound is described only from numbers (`REF.json`), and every
  report says so.

## Stages

Mark each with `node scripts/ru/status.mjs <project> --stage RX --state done --note "…"`;
decisions with `--decision "…"`.

### R0 Приём — no stop

```bash
node scripts/ru/ref-intake.mjs <file> --slug <slug> --brief "<brief>" [--principles]
```

Copies the reference to `assets/ref.*`, finds hard cuts, writes `REF.json` (probe,
`shots`, `rhythm`, `audio`), contact sheets `review/ref-every-NN.png` (every 0.5 s,
true colours, timecodes) and `review/ref-shots.png` (one frame per shot), `BRIEF.md`,
`STATUS.md`. Scene detection misses morphs and whip-pans and over-counts flashes:
treat `shots` as a draft and correct it from the sheets.

### R1 Транскрипция — no stop

```bash
P=<project>
node scripts/ru/transcribe.mjs $P/assets/ref.<ext> --out $P/transcript.raw.json --language auto
node scripts/ru/normalize-transcript.mjs $P/transcript.raw.json --media $P/assets/ref.<ext> --out $P/transcript.words.json
node scripts/ru/ref-intake.mjs --gaps $P
```

`--language auto`: references are often in English; the Cyrillic warning from
normalize is expected then. `--gaps` adds speech pace and the loudness inside pauses
(music bed or not) to `REF.json`. No speech (music-only reel): mark R1 `skipped` and
read the on-screen text from the sheets. Burned-in captions on the sheets are a second
source: when they disagree with whisper, trust the captions for wording, whisper for times.

### R2 Разбор — no stop

Read every sheet yourself (Read the PNGs) together with the transcript. For dense
moments (the first 3 s, fast graphics) take extra frames:

```bash
node scripts/ru/contact-sheet.mjs $P/assets/ref.<ext> --from 0 --to 3 --every 0.2 --label-only --cols 6 --out $P/review/ref-hook.png
```

Write `$P/BREAKDOWN.md` by `references/formats.md` § BREAKDOWN: passport, story in one
line, beats, the timed table (phrase → what is on screen → device), the hook frame by
frame, rhythm, visual system, how it was shot, sound by numbers, why it holds attention,
and the device inventory against our pipeline (есть / собрать / не берём). Foreign
speech: original phrase plus a short Russian gloss.

### R3 Адаптация — ГЕЙТ R, always stop

Write `$P/SCRIPT.md` and `$P/SHOOT.md` by `references/formats.md`.

- **Topic.** Keep the reference's topic if it fits Vladilen (AI, Claude, frontend,
  business with AI) and the brief does not say otherwise; else transfer the mechanics
  to the brief's topic.
- **Length.** Target the reference's duration ±15 %. Words: use Vladilen's real pace
  from past projects (`video-projects/*/transcript.clean.json`: words ÷ speech time);
  without data, ≈ 2,5 слова/с.
- **Hook.** Mirror the reference's first-3-second mechanic (what is on screen at frame
  0, what changes by 1 s and 3 s) with Vladilen's words; give one alternative.
- **Lines.** One sentence per line, speakable in one breath, every line tied to a
  location and to what appears on screen on which word. CTA: from the brief, else
  `brand.md` `cta_default`; one call to action.
- **Shooting.** Locations with framing and why; what to prepare (screen recordings,
  files, props); where 4K or a wider frame is needed for a later zoom-out.
- **New builds.** List devices our pipeline lacks, ranked by effect, with what each
  costs; offer to build them before the shoot so the edit does not wait.
- **Principles** (only with `principles: true` in `STATUS.json` or on request). After
  `SCRIPT.md` is written, run all 8 checks of `references/script-principles.md` and write
  `$P/PRINCIPLES.md`: a verdict per principle (✓ уместно / ~ спорно / — не здесь, with the
  reason for this script) and numbered edits «было → стало». `SCRIPT.md` stays as written
  until the customer picks edits.

**ГЕЙТ R:** show the story in one line, the full text as it will sound, the locations,
every `[проверь: …]` question, and the new builds; with principles, also the verdict table
and the numbered edits from `PRINCIPLES.md`. Recommend, then stop and wait. Edits the
customer takes («бери 1 и 3») go into `SCRIPT.md`.
Apply the edits, record decisions with `status.mjs --decision`, mark R3 done when the
customer approves. Then offer to add a row about this reference to `refs/NOTES.md`
(write it only after «да»).

### R4 Передача — waits for the shoot

Tell the customer: shoot by `SHOOT.md`, drop the file into `inbox/`, then

```
/reel inbox/<file> --remake video-projects/<date>-remake-<slug> [— бриф]
```

`intake.mjs --remake` links the script into the reel project and closes R4 here.
From then on `vladilen-reels` runs as usual, with the script as the plan's backbone.

## Report format

Short, per stage: done, decided, needs the human. Every report that describes the
reference's sound ends with «Звук мной не прослушан: громкость, музыку и склейки по
интонации проверь на слух».
