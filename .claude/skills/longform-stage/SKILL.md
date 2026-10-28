---
name: longform-stage
description: The stage for long YouTube videos (16:9) in the Vladilen brand. A talking head over one persistent dark stage with a single idea card at a time; the face is a state machine (full-frame on personal beats, a narrow dock at the right edge otherwise). Use for the stage layout, the face plan `FACE.json` (where the face goes full-frame) and the rules every long-form card and cut follows. Voice only by default.
---

# longform-stage

Long YouTube videos get their own flow beside `/reel`; nothing in the Reels Studio changes.
The look is the style pack `style-library/03-vladilen-stage/` (read its `DESIGN.md`, `tokens.css`
and `style.json`). The mechanics come from a studied reference: one stage for the whole video,
one idea card at a time, a new card every 5–7 s, quiet transitions, the face returning on the
speaker's own lines.

Status: the style pack with nine cards, the face planner and the compositor exist (`stage-cards` has the plan format
and the assembly). The `/long` orchestrator, which would write `FACE.json` and `CARDS.json` from the transcript and run the
gates, is not built yet; Claude does those steps by hand. Do not describe the orchestrator as available.

## The three face states

| State | Frame | When |
|---|---|---|
| `full` | the take at 1920×1080, untreated | hook; a turning question; a personal line; a conclusion; a section border; the closing |
| `dock` | a 2:3 crop of the same take at the right edge (208×312 at x 1712, y 406) | everything else, the default |
| `none` | no face: voice and a large illustration | by hand only, never longer than 75 s in a row |

Face ↔ stage is a one-frame hard cut on a sentence boundary, in the breath between two sentences.
No dissolve, no zoom-in, no flash. Inside a `full` segment there are no cuts or punch-ins: it is one
continuous piece of the take. The dock is a crop of the same continuous take, so pose and mimic do
not jump across the cut.

## Before the plan

The plan needs a word transcript on the timeline of the cleaned video. Reuse an existing transcript
(never re-transcribe a cached source). Clean the pauses with the kit's `cut-silences` at its defaults
(`--gap 0.55`; it keeps a breath of about 0.2 s after a sentence), not with the reels' tight pauses:
long-form speech has to breathe, and the cuts of the face live in that breath. Normalize the words with
`scripts/ru/normalize-transcript.mjs` if the transcript is raw.

## FACE.json

```bash
node scripts/long/face-plan.mjs video-projects/<slug>/transcript.words.json --out video-projects/<slug>/FACE.json [--hook 2.0] [--share 0.07] [--explain]
node scripts/long/face-plan.mjs --check video-projects/<slug>/FACE.json --transcript video-projects/<slug>/transcript.words.json
```

The planner is a proposal for the human gate, not a decision. It scores every sentence (and every pair of
short neighbours) by cues a human editor would call a human beat, then keeps the best ones inside the limits.
The cues are listed in `scripts/long/face-lexicon.json` (Russian and English; edit it freely):

| Cue | Reads as | Weight |
|---|---|---|
| question (not a how-to question) | a turn or a rhetorical question | 3 |
| first person, emotion, conclusion, section border | personal line, a conclusion, a new part | 2 each |
| tag question («да?», «правда?») | rhetorical | 1.5 |
| short sentence after a long one | a punch line | 1.5 |
| transition word, contrast, short, compact | weak, never enough alone | 0.5–1 |

A sentence needs 2 or more points. A «как это сделать?» question is the setup of an explanation, so it scores
nothing. A sentence that sells (a link, a program, a course, «в описании») never takes the face, so the
offer stays on a card in the dock. The closing starts at the first outro cue in the last 15 % («надеюсь, было
полезно», «подписывайся») and runs to the end.

Limits (flags, defaults): hook until the first word boundary after `--hook` 2.0 s; ordinary anchors together
at most `--share` 7 % of the video; at least `--min-gap` 11 s between two full-frame segments; at most
`--max-gap` 75 s without the face returning (then a keep-alive anchor is added); a full-frame segment 1.5–6 s,
the closing up to 12 s. `--dock-crop x,y,w,h` is a normalized crop of the source for the dock (default: a
centred 2:3 head-and-shoulders crop; check it against the first frame).

Output (`FACE.json`, version 1): `source`, `params`, `dock.crop`, `segments[]` (`state`, `start`, `end`, `role`:
`hook`|`anchor`|`keep-alive`|`closing`|`default`, `why`, `sentences`, `text`) and `stats` (shares, the longest
stretch without the face). Segments are contiguous from 0 to the video length. `--check` reports structural
errors (gaps, overlaps, unknown state, wrong end) with exit code 1, and style warnings (a cut inside a word,
a full-frame under 1.5 s or over its cap, no hook, a stretch over 75 s without the face, a share over 25 %).

At the gate show the customer the list: time, the phrase, the role and why. Offer the edits as numbered
lines («убрать 3, добавить лицо на 2:15»). Apply only the ones the customer picks, then run `--check` again.
`none` stretches are added by hand when a large illustration needs the whole frame.

## Assembling

`node scripts/long/stage-assemble.mjs video-projects/<slug> --check | --preview --review | --final` turns the cleaned take,
`FACE.json` and `CARDS.json` into `renders/stage.preview.mp4` / `stage.final.mp4` (details in the `stage-cards` skill). Order of a
real edit: clean the take, transcribe (cached), `face-plan`, show the list at the gate, write `CARDS.json`, `--check`,
`--preview --review`, look at the sheets and the picture, adjust, `--final`. The dock crop of `FACE.json` (`dock.crop`) is a
guess for a centred speaker: check it on the review sheet and set `--dock-crop` in the planner if the head is cut.

## A take that is a screen recording with a camera card

Vladilen's OBS «YouTube» recordings (1920×1080) are the screen with his camera in a small card on the right (about 192×320 at
1714,364), not a talking head: there is no full-frame face to cut to, and enlarging the card to the frame would be a blur. For
such a take: set `dock.crop` in `FACE.json` to the inside of the camera card (normalized x, y, w, h; at 1920×1080 about
x 1720, y 372, 180×304 px), use no `full` segment (one `dock` segment for the whole video; the planner's warnings about no hook
and a long stretch without the face are expected), and fill the places where the face would have been with cards
(`--check` warns about an empty stage over 6 s). Look at a frame of the raw file before planning: the screen may hold something
that should not be shown, and `full` shows the screen as it is.

## Rules for everything built on the stage

- Palette and type from the style pack only; one accent per frame; no gradients except the stage glow.
- Key text at least 40 px, labels at least 24 px, diagram lines at least 3 px at 1080p. Nothing important
  under the dock (x ≥ 1664).
- Card entrance 0.6 s (power4.out, blur 12 → 0, rise 40 px), exit 0.3 s (power2.in, motion blur up), elements
  one by one 0.12 s apart. No springs. A card enters with the start of the sentence, the accent lights on
  the key word.
- Facts: a number on a card is either spoken in the video or listed in the project's facts. A scheme with
  decorative numbers carries the tag «ИЛЛЮСТРАЦИЯ». Cite a real source in the `source` slot. Never invent a
  figure or a result.
- Sound: voice only by default (no music, no SFX, no burned-in captions). Music and Real SFX are a per-project
  flag and then follow `brand/brand.md`. Target −14 LUFS.
- Russian text only in fonts with Cyrillic from `brand/fonts/`; run `scripts/ru/check-glyphs.mjs` before a render.
  When a card is copied into a project, copy its fonts to `assets/fonts/` and rewrite the `url()` paths in its
  `tokens.css`: HyperFrames lint rejects paths above the project root (`stage.base` lints clean after that).
- Rendering is slow (a reel costs 0.4–0.85 render minutes per output second): render cards as separate short
  clips with a cache and composite with ffmpeg; 3D scenes only when the project asks for them.

## Report format

Short, by stage: done, decided, needs the human. A report that touches sound ends with «Звук мной не прослушан:
громкость, музыку и склейки по интонации проверь на слух».

## Limits of the planner

The cues were derived from one studied reference, and the planner agrees with it, not independently: on that
video it found 10 of 16 full-frame moments exactly and 12 of 16 within one neighbouring sentence, and about
half of what it proposed was in the reference. Two reasons for the gap: a human picks one of several equally
good sentences, and the reference also cuts to the face in the middle of a sentence, which the planner does
not do. Treat the result as a draft, expect to change a large part of it, and extend the lexicon from the
customer's edits.
