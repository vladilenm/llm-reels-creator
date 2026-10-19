---
name: remake-fast
description: Use for /remake-fast and whenever Vladilen drops someone else's reel and wants the short cycle — «закину рилс, сразу дай что говорить и что доснять», «сделай превью», «ускорить цикл ремейка». Also when he says he has shot the lines and recordings for a fast remake («снял», «закинул ролики»), or answers «да» / «ок» / правки on a fast-remake preview.
---

# remake-fast

The fast remake cycle. The customer touches it exactly twice: he shoots what `SAY.md` and
`SCREEN.md` ask for, and he answers «ок / правки» on the preview. Everything between is
decided by Claude under the usual rules. The only other reason to stop is a blocker
nothing can work around: an unusable transcript, a missing API key, no take in the footage.

```
/remake-fast <reference> [— brief]      → F1: text to say + what to record → stop «снимай»
/remake-fast <remake project>           → F2: footage → preview → stop «ок или правки?»
«ок» / «да» on the preview              → F3: final + ×1.1 + Instagram caption
```

Engines: `reel-remake` (R0–R3) and `vladilen-reels` (S0–S8). Read both SKILL.md files and run
their commands; this skill decides where they stop. Rule priority is unchanged (customer's
words → `lessons.md` → `brand.md` → skills). Two projects exist: the remake project
`video-projects/<date>-remake-<slug>/` (F1) and the reel project made in F2.

## F1 · Reference → what to say

1. `reel-remake` R0–R2 as written (intake, transcription — the only paid call, cached —
   sheets, `BREAKDOWN.md`).
2. R3 without ГЕЙТ R, without the `refs/NOTES.md` offer and without the build offer
   (devices marked «собрать» are built in F2 S4). Every `[проверь: …]` is resolved here:
   - a fact Claude can verify (GitHub, README, a public site, past transcripts) → verify it
     and write the source into `SCRIPT.md`;
   - a claim about Vladilen that nothing confirms → rewrite the line so it is true without
     it (describe the tool, not his result) and list the change in the hand-over;
   - CTA keyword: the brief's, else the last one in `lessons.md`, else `cta_default`.
3. Write `SCRIPT.md` and `SHOOT.md` (formats: `reel-remake/references/formats.md`), plus
   `SAY.md` and `SCREEN.md` in the formats below. Default shoot: one location, one take.
   `SHOOT.md` «После съёмки» names `inbox/<slug>/` and `/remake-fast <remake project>`, not `/reel`.
4. `mkdir -p inbox/<slug>`; `status.mjs <remake> --stage R3 --state done` with the decisions.

`SAY.md` — the card he reads from:

```markdown
# Текст · <slug>
Каждую фразу целиком, пауза 1–2 с. Сбился — начни фразу заново.
🎧 — тебя в кадре не будет: читай с листа, но с того же места и тем же голосом.

1. <фраза>
2. 🎧 <фраза>
```

A line gets 🎧 when its «Что в кадре» in `SCRIPT.md` is a full-frame insert for the whole
line. Never the hook line. Window-above-head and card lines are on camera. In F2 S3 these
lines stay covered by a full insert — the customer read them.

`SCREEN.md` — one entry per recording, the file name in bold with its extension (this is
what `footage-check.mjs` matches):

```markdown
**A-obsidian.mov** (~10 с) — фраза 1. Что открыть, куда кликать, сколько держать. Без личного: …
```

Public pages (GitHub, docs, sites) are not on this list: Claude screenshots them headless
with Playwright (`node_modules/playwright`, `deviceScaleFactor: 2`) into the reel project's
`screens/` in F2.

**Hand-over — stop.** In chat: the full `SAY.md`, the recordings (file → what to do), the
framing line from `SHOOT.md`, the decisions taken instead of questions. Last line, with the
real path: «Снимай, клади всё в `inbox/<slug>/` и напиши
`/remake-fast video-projects/<date>-remake-<slug>`».

## F2 · Footage → preview

A remake project whose `status.mjs --next` is R4 means F2: skip R4, go on.

```bash
node scripts/ru/footage-check.mjs <remake project>     # take, recordings, head position
```

- No folder or `take: null` → stop and say what is missing (the one allowed blocker).
- `missing` recording → build that line from what exists (README, a public page, a run Claude
  can do with tools already on this Mac — no installs, accounts or paid calls) and say so;
  never fake a run or a result. `extra` files → look at a frame, map them by content.
- `take.relocate: true` → `fx.json` `relocate` on every window line (фон: his room blurred
  and lifted, decision 2026-10-19); close-ups stay the plain frame.

Reel project: `node scripts/ru/intake.mjs <take.file> --slug <slug> --brief "<one line from the
remake BRIEF.md>" --mode full --remake <remake project>`, then `vladilen-reels` S1–S6 with:
S2 — keep the last complete take of each line; S3 — `PLAN.json` straight from `SCRIPT.md`,
hook = the script's hook, no ГЕЙТ B (alternatives go to `DESIGN.md`); recordings with private
data (notes, names, messengers) get `blur` marks; captions `kinetic` for window-above-head
remakes. S6 self-review is mandatory (2–3 sheets), then `assemble.mjs <reel> --preview`.

**Preview — stop.** Show `renders/preview.mp4` to the customer (SendUserFile, plus the
path), what differs from `SCRIPT.md`, the automatic decisions, one line from `REVIEW.md`,
the sound line. One question: «Ок или правки?» Corrections → apply, re-render what changed,
show the preview again.

## F3 · «ок» → final (`<reel>` = the reel project from F2)

```bash
node scripts/ru/assemble.mjs <reel> --final              # renders/final.mp4 + check-reel
node scripts/ru/speed-variant.mjs <reel> --factor 1.1    # renders/final.x1.1.mp4 (lessons 2026-10-19)
```

Write `<reel>/CAPTION.md` and give it in chat: line 1 — the CTA keyword («Напиши «…» в
комментариях — пришлю ссылку»), then 3–4 short paragraphs on the reel's topic in his voice
(`brand.md` → «Словами»), the last one ending with an open question the viewer wants to
answer. Only true facts. Then `vladilen-reels` S8 (lessons, `log-run.mjs`); its proposals go
into the final report and do not hold the final.

## Report lines

Every report that touches sound ends with «Звук мной не прослушан: громкость, музыку и
склейки по интонации проверь на слух». Nothing is published or posted.
