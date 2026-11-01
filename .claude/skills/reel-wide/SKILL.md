---
name: reel-wide
description: Use for /reel-wide and whenever Vladilen drops a wide OBS recording (Reels-wide-*.mp4, 4104×1964 — his reels layout on the left, the Mac screen 1:1 on the right) or says «сделай рилс из этой записи», «широкая запись», «вырежи пустоту, сопоставь экран с тем, что я говорю». Full cycle without questions in the middle: every spoken comment kept, silence and typing cut, the screen moment that matches each phrase shown in a window with zooms, our captions, background swaps, SFX and music → preview (normal + ×1.12) → «ок» → final.
---

# reel-wide

A raw talking-head-plus-screen recording from OBS becomes a finished reel. The customer touches it
twice: he drops the file, and he answers «ок / правки» on the preview. Engine: `vladilen-reels`
(S0–S8, its scripts, gates and rules) — read its SKILL.md; this skill fixes the format and replaces
S2 cutting, S4 graphics and the S4b base for this kind of footage. Rule priority is unchanged:
the customer's words → `lessons.md` → `brand/brand.md` → `vladilen-reels` → this skill → chassis skills.

```
/reel-wide <Reels-wide-*.mp4> [— brief] [--slug name] [--speed 1.12]
```

## The standing brief (customer, 2026-10-23)

«Чтобы влезли туда все мои комментарии, которые я давал звуком; там, где пустота, это всё нужно
вырезать, и сопоставлял видео и то, что я говорю, и смонтировал итоговый рилс — с зумами, с субтитрами
в нашем стиле, эффекты звуковые, которые увеличат удержание. Вначале покажи превьюшку, я скажу ок или
не ок, и если ок — рендерим финал.» The first run on this brief (`2026-10-23-anatomy-llm`) was approved
without changes: «Топ, мне нравится».

So, by default:
- **Keep every spoken comment.** Cut only what carries no speech: typing, waiting while an agent works,
  scrolling, clicks, hums and mumbles, a filler that only pads («В общем», «Значит» when it opens nothing),
  a closing «Спасибо» after the CTA. A real retake or broken phrase is cut as in `cut-mistakes`.
- **The screen follows the words, not the recording clock.** Each phrase gets the screen moment it talks
  about, taken from anywhere in the source (sped up ×2–3 if it is an action: typing, a long log scroll).
- `--mode full`, ГЕЙТ A off, **ГЕЙТ B skipped** (the plan goes straight into the preview; list the
  decisions in the report). The only stop is the preview (ГЕЙТ C). Other stops: unusable transcript,
  a missing key, no speech in the file.
- Preview and final come in two speeds: normal and **×1.12** (`--speed` changes it) — he asks for
  10–12 % faster on almost every reel.

## The recording

OBS profile «Рилсы широкий 4104x1964», files `~/Movies/Reels-wide-<date> <time>.mp4`. Wide frame 4104×1964, HEVC, 25 fps:
x 0–1080 / y 0–1920 — his reels layout: template placeholders on top («Заголовок ролика», «главная мысль»,
a screen thumbnail), the camera as a rounded card at x 46–1035, y 1098–1920 (iPhone or FX30);
x 1080–4104 — the Mac screen 1:1 (3024×1964 px; the dock starts at y 1830 and is never framed).
Shared constants live in `scripts/ru/wide/common.py`.

## The format (what the reel looks like)

- **Layout** (as approved on `replica` and `anatomy-llm`): light brand canvas; title at y 200 (Golos 56 +
  Spectral italic on the accent plate); window x 540, y 380, w 900, h 480 (canvas 900×428); kinetic
  captions at y 985; the camera card as recorded below — **no person mask** (he rejected masks twice).
- **Take at a plain wall** (nothing by the shoulder — claude-sfx, he asked for the mask): `obs_base.py --mask`
  cuts him out onto the canvas without the card (×1.1, shoulders past the edges); swaps go into
  `fx/swaps.json` (text behind the head, `references/config.md`), not `broll/clips.json`; punch-ins 1.00 ↔ 1.05.
- **Hook**: the result is on screen at frame 0 (the finished demo, the generated file, the chart),
  title = what was made in plain words from the payoff («Claude нарисовал, / как LLM пишет текст»),
  his first words over it. The payoff phrase later repeats the hook title («В итоге — демка: / как LLM
  пишет текст»). Frame 0: eyes open, voice from the first frame, the first caption word lit.
- **Sections**: one kit clip per block between background swaps, a title per section (`titles` in
  screen-kit — the window does not blink between sections), whip between apps and pages, blur between
  states of the same app.
- **Window shots, one per phrase**: zoom to what the phrase names (repo name, About, the input with the
  typed prompt, «Готово», the result file, a step image, the figure, its parts). Text in the window must
  read at 1080 px: camera width ≤ 1150 native px for text, ≤ 1600 for a whole UI, never a whole empty
  screen. Private chats and other projects in the sidebar are not framed.
- **Marks, baked into the frames**: `hl` sweeps under the exact words as he says them (the English UI
  words he paraphrases in Russian), `ring` on the thing he acts on (copied link, sent message, typed
  command, result file, a number in the figure). One mark at a time where possible.
- **Background swaps 2–3 per reel**, around the card (dark #0E0B14 + purple glow, big text above the
  card): a number or time jump («Спустя / 40 / минут» with a counter and the reel's one `hit`), the main
  claim («для научных работ»), the CTA. Each ≥ 1.2 s, the key word on screen ≥ 0.6 s; captions hidden.
- **Card punch-ins** 1.00 ↔ 1.07 on joins, not more often than once a second, none in the final swap.
- **Sound**: quiet SFX on every visual event — whoosh on window changes (0.08–0.10), whoosh_big on swaps
  (0.12–0.14), pop on titles and appearances (0.04–0.06), tick on highlights (0.03–0.04), click on rings
  (0.045–0.05), chime on «готово / результат / CTA» (0.05–0.07), one `hit` on the key number (0.22).
  `sfx.py` must print no WARN: move a sound to the nearest word boundary or drop it. Music: the brand
  lo-fi bed (`brand/music/`), `level_db -17`, `duck_db -9`, a stop-down before the time-jump word.
- **CTA**: what he says. A keyword he did not name stays generic on the plate («или напиши ключевое
  слово — пришлю в личку») and goes into the report as a question. Never invent the word.

## Stages

Mark stages with `scripts/ru/status.mjs` as in `vladilen-reels`. P = `video-projects/<date>-<slug>`.

**W0 · intake** — `node scripts/ru/intake.mjs <file> --slug <slug> --brief "<brief>" --mode full --density medium`.
Append to `BRIEF.md` what matters from brand/lessons for this reel.

**W1 · transcript and survey**
```bash
node scripts/ru/transcribe.mjs $P/assets/raw.mp4 --out $P/transcript.raw.json
node scripts/ru/normalize-transcript.mjs $P/transcript.raw.json --media $P/assets/raw.mp4 --out $P/transcript.words.json
python3 scripts/ru/wide/scan.py $P --gaps --transcribe     # src sheets, SCREEN.md, GAPS.md (cents of paid calls)
```
Read every `work/wide/src-sheet-*.jpg` and `SCREEN.md`: write down the screen story (which app, what
happens, when) next to the transcript. Read `GAPS.md`: a chunk is speech only if f0 is 95–180 Hz,
voicing ≳ 40 % and the re-transcription gives real words; whisper in silence writes «Ну, всё, пока»,
«Спасибо за просмотр», «Десять». Mouth moving without words = mumble, cut it and name it in the report.

**W2 · cuts (no stop)** — decide every cut yourself, src seconds, reasons in Russian:
- `work/cuts.manual.json` `{cuts:[{start, end, reason}]}`: silences with typing/waiting, mumbles, padding
  fillers, the tail. Boundaries from the envelope (`work/env10ms.npy`), never from whisper word times:
  whisper stretches words over pauses and puts words into silence. Check the f0 of anything between words.
- A phrase whisper hears twice («Выглядит очень круто. Это очень круто») is a duplicate only if it fits
  physically: his rate is ~6 syllables/s. If the «repeat» needs 12 syl/s, it is a whisper echo — do not cut.
```bash
python3 scripts/ru/wide/env-cuts.py $P                     # + pauses inside kept pieces → work/cuts.approved.json
node scripts/ru/build-edl.mjs --transcript $P/transcript.words.json --approved $P/work/cuts.approved.json \
  --video $P/assets/raw.mp4 --project $P --snap-fps 25     # no --silence-edl, no --max-pause
python3 scripts/ru/wide/clean-words.py $P                  # whisper on clean.mp4 + work/clean-fixes.json → transcript.clean.json
python3 scripts/ru/wide/tmap.py $P <clean t …>             # clean ↔ src, joins
```
`work/clean-fixes.json` fixes commas, names, the doubled phrase and starts that whisper misplaces.

**W3 · plan (no stop)** — `PLAN.json` / `PLAN.md` on the clean timeline (events = window shots, swaps,
CTA) and its `captions` block (kinetic, `y_keys [{at:0, y:985}]`, one accent word per phrase, `hide` over
every swap). Pick the hook as in «The format». Write `DESIGN.md` briefly (promise, hook, loops).

**W4 · window and clips**
```bash
python3 scripts/ru/wide/native.py $P <src t …>             # gridded native frames for coordinates
python3 scripts/ru/wide/native.py $P <src t> --text x0,y0,x1,y1   # exact word rects for hl / ring
# write broll/screen.json and broll/clips.json (references/config.md)
python3 scripts/ru/wide/render_screen.py $P                # screens/<shot>/ frames, broll/shots.json
python3 scripts/ru/wide/make_clips.py $P                   # broll/clips/*.html, broll/plan.json
NODE_PATH=./node_modules node .claude/skills/motion-broll/engine/beats.js $P/broll/dist/<clip>.html $P/review/<clip>.png <t …>
scripts/ru/wide/render-clips.sh $P                         # build.py + render.js → broll/*.mov (2 in parallel)
```
Check the window frames before rendering clips (a contact sheet of `screens/*/NNNNN.jpg`): text readable,
marks on the right words, no empty dark windows, no frame from the wrong moment (a send changes the
layout — end typing shots before it; `SCREEN.md` small events ~2 are sends).

**W5 · picture and sound**
```bash
python3 scripts/ru/fx/sfx.py $P                            # fx/fx.json "sfx" (by t), must print no WARN
python3 scripts/ru/fx/sound.py $P                          # voice polish + SFX + music → fx/mix.wav
python3 scripts/ru/wide/obs_base.py $P --mix               # canvas + card + punch-ins → renders/picture.mp4
python3 scripts/ru/wide/obs_base.py $P --mask --stills 3,7  # plain-wall take: check stills, then --mask --mix
```
**W6 · captions** — `node scripts/ru/make-captions.mjs $P --render`.

**W7 · self-review and preview** — `assemble.mjs $P --preview`, `contact-sheet.mjs … --plan $P/PLAN.json
--every 2`, read every sheet against `vladilen-reels/references/review-checklist.md`, then stills at every
swap edge (in/out ± 0.12 s): no light flash between window and dark layer. Fix, re-sheet (max 3).
Make `renders/preview.x1.12.mp4` (`setpts=PTS/1.12,fps=25` + `atempo=1.12`). Write `REVIEW.md`.
Send both previews (SendUserFile) and stop: «ок или правки?».

**W8 · final** — on «ок»: `assemble.mjs $P --final` (check-reel must PASS), `speed-variant.mjs $P --factor 1.12`,
then `check-reel.mjs renders/final.x1.12.mp4 --fps 25`; look at hero frames of the final; S8 lessons in
his words + `log-run.mjs`. Corrections → apply, re-preview, ask again. Publish nothing.

## Report

Short, Russian, in this order: the two preview/final paths and durations; what was cut (with src times for
anything that might have been words); what each part of the screen shows under which phrase; the open
questions (keyword, whisper-doubtful spots with src times). End with «Звук мной не прослушан: громкость,
музыку и склейки по интонации проверь на слух».

## References

- `references/config.md` — `broll/screen.json`, `broll/clips.json`, `fx.json` and `PLAN.json` captions for
  this format, with the anatomy-llm values as the worked example.
- `scripts/ru/wide/*` — the format's scripts (headers document each one).
- `vladilen-reels/SKILL.md` and its references — stages, review checklist, sound rules.
