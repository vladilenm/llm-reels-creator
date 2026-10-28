---
name: vladilen-youtube
description: YouTube video (16:9) for Vladilen from a raw recording, in the stage format - a dark brand stage with one idea card at a time, an image on every idea, facts checked against sources, his face in the dock (or full-frame on his own lines), voice only. Use for /youtube and whenever he drops a horizontal recording for YouTube («смонтируй ролик для ютуба», «запись для YouTube», «сделай как в том ролике со сценой»). Not for reels: those go to vladilen-reels.
---

# vladilen-youtube

A raw horizontal recording in, a YouTube video in the stage format out. The chassis: `longform-stage` (face states,
`FACE.json`), `stage-cards` (cards, `CARDS.json`, assembly), `cut-silences`, `scripts/ru/transcribe.mjs`. The customer's guide (how
to record, run, give edits) is `docs/YOUTUBE.md`. Worked example, local only (gitignored), if present:
`video-projects/2026-10-28-yt-first-take/` (`FACTS.md`, `mkplan.mjs`, `mkill.mjs`, `CARDS.json`).

## Invocation

```
/youtube <file> [— brief] [--slug name] [--review-plan]
```

Project: `video-projects/<YYYY-MM-DD>-yt-<slug>/`. If it exists, continue from the first stage whose output is missing.
One stop by default: the preview (Y7). `--review-plan` adds a stop after the plan (Y5).

## Before anything creative

Read `brand/brand.md`, `lessons.md`, `style-library/03-vladilen-stage/DESIGN.md` and the two chassis skills. Priority:
the customer's words → `lessons.md` → `brand/brand.md` → this skill → chassis skills.

Hard rules:
- Never invent a fact, number, quote or result. Every checkable claim goes through Y4; on screen only what the speech
  says or what a source confirms, with the source signed. His own experience («я два года…») is taken as said.
- The speech is not rewritten. A correction (a misheard name, a wrong attribution) goes on the card, not into the audio,
  and into the report.
- An organization that is banned in Russia is named with «запрещена в России» on screen (Meta).
- A named product is shown with its real logo (official source or Wikimedia Commons, `assets/logos/`), never a redrawn
  look-alike; a source that the facts check found is shown as its screenshot, signed with its domain.
- One paid call per source: the transcription (SHA-256 cache). Web search is free; nothing is published.
- Claude cannot hear: every report ends with «Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух».

## Stages

### Y0 Приём
Create the project, link the raw file as `assets/raw.mp4` (the source stays read-only), probe it, and look at one frame
(`ffmpeg -ss 30 -i assets/raw.mp4 -frames:v 1 work/raw30.png`, then Read it). Decide the take type:
- **talking head** — the face fills the frame: the full-frame face is available (`longform-stage`).
- **screen + camera card** — his OBS «YouTube» scene: the screen with his camera in a small card on the right (about
  192×320 at 1714,364 at 1920×1080). No full-frame face; the dock crops the camera card. Measure the card on the frame.
- anything else: say what it is and ask.
Also note what the screen shows: a screen recording may hold private things; `full` would show them.

### Y1 Расшифровка
`node scripts/ru/transcribe.mjs assets/raw.mp4 --out transcript.raw.json --language ru` (cached), then
`normalize-transcript.mjs` to `transcript.rawtimeline.words.json`. Read the text by sentences.

### Y2 Чистка
`cut-silences` at its defaults (it keeps ~0.2 s of breath after a sentence: the cuts of the face live there):
`node .claude/skills/cut-silences/scripts/cut-silences.mjs transcript.rawtimeline.words.json --video assets/raw.mp4
--out-dir assets --output renders/clean.mp4 --apply`, then copy `assets/source.silence-transcript.json` to
`transcript.words.json` (the timeline of `clean.mp4`). Retakes and a test remark at the start («сделаем для прогона»)
are flagged in the report, cut only on request (`cut-mistakes`).

### Y3 Лицо
Talking head: `node scripts/long/face-plan.mjs transcript.words.json --lang ru --out FACE.json --explain`, then adjust by
hand: the face goes full-frame on his own lines (a personal remark, «если честно», a joke, a conclusion), cuts in the
breath between sentences. Screen + camera card: one `dock` segment for the whole video, `dock.crop` set to the inside of
the camera card (normalized), no `full`.

### Y4 Факты
List every checkable claim: people and roles, products and their owners, launches and dates, numbers, anything
attributed («Anthropic пишет…»). Check each with web search, prefer the primary source (docs, the company's own
announcement). Write `FACTS.md`: claim · verdict (✓ / ~ / ✗ / — personal) · what is true · source · what goes on screen.
Whisper often mangles product names: the source fixes the spelling on the card (example: «дуэт» → Claude Duet).
Questions that only the customer can answer get `[проверь: …]`.
For every source that goes on screen take its screenshot:
`node scripts/long/web-shot.mjs <url> --out assets/web/<name>.png --phrase "фраза на странице"` (headless, nothing is
clicked or accepted; a page behind a login or a captcha is not shot, use another source). Logos of named products go to
`assets/logos/` (download from the official site or Wikimedia Commons, note the source in `FACTS.md`).

### Y5 План карточек
Write `mkplan.mjs` in the project (it writes `FACE.json` boundaries and `CARDS.json` from phrases; see the worked
example) and run it. Rules:
- One idea, one card, a new card every 5–10 s; the stage is never empty for more than 6 s.
- Show, do not write: a thought that can be drawn is a full-stage `figure` illustration (draw them in the project's `mkill.mjs` with
  `scripts/long/lib/ill.mjs`: `svg`, `text`, `icon`, `arrow`, `pill`, colors `C` from the tokens); a claim from a found source is a `figure` with its screenshot and the phrase highlighted. Text cards
  only where the words themselves are the point. Aim for at least a third of the cards being figures.
- An image on every idea: `scene` (a large line icon, or A → B) for a thought or a metaphor; `icons` for 2–4 named
  things (products, ways, parts); `compare` with icons for before / after; `flow` with icons for a path; `metric` for a
  number he says; `quote` for an exact quote with its source; `term` for a definition; `steps` for an order; `doc` for a
  cited page; `chat` for a conversation. Vary the kinds; do not put three scenes in a row.
- Icons from `style-library/03-vladilen-stage/icons/icons.js` (agent, terminal, hash, phone, desktop, chat, prompt, user,
  badge, box, target, gear, flow, doc, layers, key, lock, tasks, briefcase, sparkle, bolt, bulb, arrow, calendar, mail,
  clock, check, question, chart, eye), or a path to a real logo. A missing image is a new icon drawn in the same style.
- Facts on cards only as in `FACTS.md`; the `source` slot on every card that shows an external fact.
- `node scripts/long/stage-assemble.mjs <project> --check` until it passes; warnings about the face on a screen take
  are expected.
With `--review-plan`: show the list (time · card · image · text · source) and the open questions, wait.

### Y6 Превью
`node scripts/long/stage-assemble.mjs <project> --preview --review`. Open every review sheet (one frame per card, when
it has built up, plus both sides of every face cut). Fix what is wrong — text cut, an icon that does not match the
words, an empty stage, a card that comes too late — and rebuild (cards are cached by content).

### Y7 ГЕЙТ: превью
Show: the preview path, the sheets, the fact table (what was corrected), the open questions, what was not done. Wait
for «ок» or edits. Edits go into `mkplan.mjs`, then Y5–Y6 again.

### Y8 Финал
`--final` (1920×1080, x264 crf 17, aq-mode 3); with `--loudnorm` when asked. Report the path, the checks, and offer the
YouTube texts with the global skills (`yt-chapters` for chapters from the transcript, `yt-seo` for the description,
`yt-package` for the title and thumbnail text) — only on «да».

## Report format

Short, by stage: done, decided, needs the human. Name the corrections from `FACTS.md`. End with the sound line.
