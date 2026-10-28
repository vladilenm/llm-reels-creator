---
name: stage-cards
description: Idea cards for the long YouTube stage (style-library/03-vladilen-stage): quote, term, doc, steps, compare, metric, flow, chat, scene, icons, and figure (a full-stage illustration or a screenshot of a cited source). Use to pick a card for a beat of a long-form video, fill its slots within the character limits, set word-synced reveal times, mount a card in a project, check cards, or add a new card kind. Brand palette, one accent per frame, voice only by default.
---

# stage-cards

One idea, one card, on a persistent dark stage; the face lives beside it (see `longform-stage`).
The cards are in `style-library/03-vladilen-stage/cards/stage/` with a shared `stage.css`; their slots,
limits and durations are in that style's `style.json`, the rules in its `DESIGN.md`. Read both before
adding or changing a card. A card is standalone: it previews and renders on its own and takes everything from
`tokens.css`.

The compositor `scripts/long/stage-assemble.mjs` builds the video from `FACE.json` and `CARDS.json` (below). Not built yet:
the `/long` orchestrator that writes both plans from the transcript, so for now Claude writes `CARDS.json` at the gate.
Posters are static frames; no mp4 previews of single cards are rendered.

## Which card for which beat

| The speaker… | Card | Notes |
|---|---|---|
| quotes someone, or states one line worth reading | `quote` | key word in `<em>` lights on its word |
| introduces a term or defines a word | `term` | light paper; at most one paper card in a frame |
| cites an article, a page or a document | `doc` | the spoken phrase in `<mark>`; always fill `source` |
| walks through steps in order | `steps` | up to 4; the active step is the accent |
| contrasts two things | `compare` | up to 3 + 3 lines; the right column is the accent |
| says a number | `metric` | only a number that is spoken or in the project's facts; `source` filled |
| describes a path or a pipeline | `flow` | up to 4 nodes; drop a node + arrow pair to get fewer |
| shows a conversation with an assistant | `chat` | own mock-up, no third-party logos |
| makes a point or a metaphor (a black box, an employee, from A to B) | `scene` | a large line icon drawn on, or `icon` → `icon2`; headline + note |
| names 2–4 things (products, ways, parts) | `icons` | tiles: icon, label, note, meta (a date); the active tile is the accent; a real logo for a named product |
| says something that can be drawn (a team, a system, a path, a box) | `figure` + `svg` | a full-stage illustration, tag ИЛЛЮСТРАЦИЯ |
| leans on a page that was found (an announcement, docs, an article) | `figure` + `image` | a screenshot of that page, zoom and highlight on the phrase |

`compare` takes `left_icon` / `right_icon`, `flow` nodes take an `icon` field. Icons are the style's own line set in
`style-library/03-vladilen-stage/icons/icons.js` (24 px grid, 1.5 line, round caps, one accent part): agent, terminal,
hash, phone, desktop, chat, prompt, user, badge, box, target, gear, flow, doc, layers, key, lock, tasks, briefcase,
sparkle, bolt, bulb, arrow, calendar, mail, clock, check, question, chart, eye. `--check` rejects an unknown name. A new
icon is drawn in the same style and added to that file.

Real logos: any icon field (`scene.icon`, `icons.tiles[].icon`, `compare.*_icon`, `flow.nodes[].icon`) also takes a path
relative to the project (`assets/logos/chatgpt.svg`, png, jpg, webp); it is shown on a light plate. Use it only for the
product that is named, from an official source (the company's site or press kit, Wikimedia Commons), never redrawn or
recolored. `--check` fails on a missing file.

One card per idea (about 5–10 s). If a card has to say two things, split it. Prefer an image to plain text: a viewer
on YouTube reads a picture faster than a sentence. A full-stage `figure` beats a text card whenever the thought can be
drawn or shown; text cards (`quote`, `term`, `steps`) are for what really is words.

## figure: illustrations and screenshots

- `svg`: a path to an `.svg` of the project (inlined, lines drawn on at the reveal, captions after the lines). The
  media area is 1568×760; draw with the style's icons and token colors, lines 3–6 px, captions Golos 28 px and up, one
  accent part, nothing important within 40 px of an edge. Draw them with a project script on
  `scripts/long/lib/ill.mjs` (`svg`, `text`, `icon`, `arrow`, `pill`, `C` = token colors, `writeIllustrations`). `label`: «ИЛЛЮСТРАЦИЯ».
- `image`: a screenshot of the source, taken with
  `node scripts/long/web-shot.mjs <url> --out <project>/assets/web/<name>.png --phrase "text on the page"`. It hides
  fixed layers (banners, sticky bars) without accepting anything and writes `<name>.json` beside the PNG; the assembly
  fills `host`, `mark` (the phrase box) and `label` («ИСТОЧНИК · domain») from it. At the reveal the page zooms to the
  phrase (1.2–1.7×) and the highlight sweeps over it. Pick a phrase of 3–8 words that the speaker paraphrases.
- One reveal (`at` of one phrase): the illustration or the highlight. Keep `headline` short; the picture carries it.

## Filling slots

- Fill every slot within `maxChars` / `maxItems` of `style.json`. The limits were checked at the maximum: past
  them text leaves the work area or is clipped. Shorten the text or pick another card; never shrink the font.
- An empty slot disappears. A list slot is made of children (`li`, `.step`, `.node`); multi-field children carry
  `data-field`. Remove surplus children, never leave placeholder text.
- Facts: no invented numbers, quotes, names or results. A scheme with decorative numbers carries the tag
  «ИЛЛЮСТРАЦИЯ» (on by default in `flow`); a real fact names its source in `source`. A third-party screenshot or
  photo shows a source that the facts check found, signed with its domain.
- The section label is `NN / РАЗДЕЛ` in `kicker`, numbered by the chapter of the video.
- Text of the viewer's language only in fonts with Cyrillic (the style ships them); never a hard-coded color, font
  or size in a card: tokens only.

## Word-synced timing

An element with `data-at="<seconds from the start of the card>"` appears on that word. The compositor rewrites
these from the transcript; the defaults in a card are placeholders.

- Start the card clip 0.1–0.3 s before the first word of its idea; the exit takes 0.3 s and the next card
  enters over it (overlap 0.1–0.2 s).
- Put each `data-at` 0.1–0.2 s before its word, so the picture is there when the word lands. Reveals less than
  0.4 s apart read as one; leave them out or merge them.
- The card's `data-duration` is its slot: from the clip start to 0.3 s after the last word of the idea, inside the
  `duration` range of the manifest. The exit tween ends 0.001 s after the slot, so the timeline is never shorter.
- The accent lights on the key word, not with the card.

## CARDS.json and the assembly

`CARDS.json` is the plan of cards, in `video-projects/<slug>/` beside `FACE.json`. Times are on the timeline of the transcript (the cleaned take).

```json
{
  "facts": ["12 %"],
  "cards": [
    { "id": "c1", "card": "quote", "from": "хорошая карточка", "until": "читается за секунду",
      "slots": { "kicker": "01 / ЦИТАТА", "quote": "Одна <em>мысль</em> на карточку", "source": "…" },
      "at": ["мысль"] },
    { "card": "steps", "start": 31.4, "end": 46.0,
      "slots": { "headline": "…", "items": [ { "label": "Цель", "note": "…" } ] },
      "at": ["сначала цель", "потом контекст"] }
  ]
}
```

- `card`: quote, term, doc, steps, compare, metric, flow, chat, scene, icons, figure. `from` / `until` are phrases from the transcript (case,
  ё and punctuation do not matter; `{"phrase": "…", "nth": 2}` picks the second occurrence); `start` / `end` are seconds
  instead. The card starts `lead` (0.2 s) before its first word and ends `tail` (0.3 s) after its last; both can be set
  per card or at the top of the file, as can `revealLead` (0.15 s).
- `slots`: text, or `<em>` / `<mark>` for the word that lights; arrays for list slots (strings, or objects with the
  fields). A slot the plan does not name is emptied, so sample text never reaches a video. Required slots are in
  `style.json`.
- `at`: the reveal times in DOM order, a phrase (the picture comes `revealLead` before it) or absolute seconds. The count
  must equal the number of timed elements of the filled card (`reveals` in `style.json` names them: for `compare` left
  lines, vs, right lines, note). The assistant's message in `chat` needs 1.2 s or more after the user's.
- `facts`: numbers the customer confirmed, for `metric` cards.

```bash
node scripts/long/stage-assemble.mjs video-projects/<slug> --check       # plan, limits, anchors, the cards themselves
node scripts/long/stage-assemble.mjs video-projects/<slug> --preview --review   # 960×540, quick, and a 16:9 sheet of the cuts
node scripts/long/stage-assemble.mjs video-projects/<slug> --final       # 1920×1080
```

Inputs: `renders/clean.mp4` (or `--video`), `transcript.words.json`, `FACE.json`, `CARDS.json`. `--check` stops at the first error and says
what to fix: an unknown phrase, a slot over its limit, two cards overlapping by more than 0.3 s, a reveal count that differs
from the card. Warnings do not stop: a card hidden behind the full-frame face, an empty stage for more than 6 s, reveals
under 0.4 s apart, a metric number that is neither spoken nor in `facts` nor tagged ИЛЛЮСТРАЦИЯ.

What the assembly does: renders each card with a transparent background to a ProRes 4444 clip (headless Chrome seeks the
paused timeline, `stage/clips/`, cached by content, so a changed face plan re-renders nothing) and builds one ffmpeg pass:
the take where the face is full-frame; elsewhere the bare stage, the dock (a 2:3 crop of the same take with rounded left
corners, a shadow and a border) and the card of the moment. Every change of state is a one-frame hard cut on the frame the
plan names. The audio is the take's own, copied through AAC; `--loudnorm` adds −14 LUFS. After the render it looks at
frames, not logs: the full-frame face matches the take, the stage corner is the `--bg` color, the dock shows the crop,
the hard cut is exactly on its frame, a card is on screen, the length and the audio survived. `--review` writes sheets of
the frames either side of every cut and of every card to `review/`: open them. Cost: about 0.5 s of work per second of
card on screen (three cards at a time) and 0.15 s per second of video for the pass; a 4-minute video with 20 cards took 2 minutes.

## Checking

```bash
node scripts/long/check-stage-cards.mjs --static                  # contract and tokens, no browser
node scripts/long/check-stage-cards.mjs [--card stage-quote] [--poster]
node scripts/long/check-stage-cards.mjs --static --hyperframes    # the framework's lint, validate (contrast), inspect
npm run catalog && npm run check && npm test
```

The browser pass checks that the timeline is paused and at least as long as `data-duration`; that the same frame
is identical after seeking elsewhere and back; that every slot filled to its maximum stays inside the work area
(x 96–1664, y 96–984) and its card, is not clipped, and is at least 24 px (key slots 40 px). `--poster` rewrites the
posters; look at them, a pass is not a verdict on the look. After a visual change, regenerate the posters and
open them.

## Adding a card kind

1. Copy the closest card (`stage-flow.html` for lists, `stage-metric.html` for a single figure) and keep the
   contract in `DESIGN.md`: root `id` = `data-composition-id` = file name, `data-duration`, the `.stage` layers,
   the `.dock` placeholder, `.scene-content` for the work area, one paused timeline registered under the id,
   entrance with `fromTo` and `opacity` (not `autoAlpha`), the exit `to(…, D - 0.299)` last.
2. Vary the eases (at most two independent tweens with one ease), enter 0.6 s, exit 0.3 s, no springs.
3. Declare it in `style.json`: slots with `maxChars` / `maxItems` / `fields`, `minPx` for key text (`fieldMin` per
   field), `duration`, `preview`.
4. Run the checks above; fix what they find at the maximum text, then rebuild the registry (`npm run catalog`).
5. List the new kind in the table of `DESIGN.md` and in this skill.

## Report format

Short, by stage: done, decided, needs the human. A report that touches sound ends with «Звук мной не прослушан:
громкость, музыку и склейки по интонации проверь на слух».
