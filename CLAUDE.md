# HyperFrames Student Kit: workspace guide

Turn a talking-head recording into an intentional edit using local HyperFrames
rendering, transcript-driven cuts, and reusable motion graphics.

## Runtime routing

`AGENTS.md` and `CLAUDE.md` contain the same standing guide. Keep them synchronized.
Claude Code uses `.claude/skills/`. Codex uses the generated `.agents/skills/`.
Edit canonical skills in `.claude/skills/`, then run `npm run sync:skills`.
Use `$edit-video` in Codex, `/edit-video` in Claude Code, or natural language.
Model and permission choices belong to the user; `.codex/config.toml` only adds
document loading defaults. Work locally unless the user requests subagents.

## Start and route

Read `README.md` for installation and `docs/WORKFLOW.md` for a complete edit.
Use `edit-video` to coordinate transcription, cuts, design, and verification.
For one stage, load the matching local skill:

| Need | Skill |
| --- | --- |
| Reels, Shorts, and short advertisements | `short-form-edit` |
| Motion-design showreels and brand reels cut to music | `motion-showreel` |
| New motion-graphics video from a brief | `make-a-video` |
| Website-inspired compositions | `website-to-hyperframes` |
| Full raw-video edit | `edit-video` |
| Silence removal | `cut-silences` |
| Retakes, false starts, or stutters | `cut-mistakes` |
| Narrative arc, persistent world, and visual callbacks | `video-storytelling` |
| Overlay beats, paper takeovers, and glass cards | `hyperframes-video-beats` |
| Select or extend styles and templates | `style-library` |
| HTML compositions and media timing | `hyperframes` |
| Preview, lint, and rendering | `hyperframes-cli` |
| Timeline animation | `gsap` |
| Install HyperFrames catalog blocks | `hyperframes-registry` |

Before a creative session read `MOTION_PHILOSOPHY.md` and the project's DESIGN.md.
The philosophy's fast sizzle pacing is a style reference. Give educational speech
room to breathe. The project brief controls pacing, palette, and typography.
Framework skill contracts override historical code recipes in the style guide.

## Workspace

Create a project with `npm run new-video -- my-video`. Keep source media, EDLs,
transcripts, compositions, and renders together under `video-projects/<slug>/`.
Run HyperFrames from that project's directory. The root `scripts/` utilities
accept paths from the working directory. `style-library/registry.json` indexes
cards; each style has a DESIGN.md, CSS tokens, and named text slots.
See `style-templates/README.md` for whole-scene templates.

Preserve raw files. Use a new output filename for each editing stage. Archive
obsolete work. Video projects, personal footage, transcripts, credentials, and
renders are gitignored: everything under `video-projects/`, `inbox/` and `refs/`
stays local. Never print secrets or copy private media into library examples.
`lessons.md`, `refs/NOTES.md`, `brand/music/tracks.json` and `runs.log.jsonl` are local
too; `brand/brand.md` is tracked in this private repo. `npm run setup` or /reel S0 creates
any of the first four that is missing from its `*.example` template. Write taste and brand
changes to `brand/brand.md` / `lessons.md`; edit a template only to change the default for
everyone who clones the kit.

## Editing and timing

Before choosing a transcription, asset-generation, or voiceover service, read
`docs/TOOLS-AND-API-KEYS.md` and check the user's provider choice and local setup.
ElevenLabs Scribe is Nate's default; honor requests for OpenAI Whisper, local
Whisper, or another provider. Normalize verified word timestamps for the cutting
tools. The included transcription script is ElevenLabs-only. Kie.ai is optional
and needs a configured integration and credits. Reuse existing transcripts and
assets; make any unapproved uploads or paid calls concrete before asking.

Cut silences first; use its edited video AND retimed transcript for cut-mistakes.
Review each mistake in context. Intentional repetition is not a mistake. Record
the reviewed decisions before applying them. If no cuts are needed, preserve the
input or use an empty cuts list. Never mix original timestamps with edited footage.

Load the relevant skills before changing HTML. Root compositions use a visible
div with id, data-composition-id, data-start, duration, width, and height. Timed
elements carry data-start, data-duration, and data-track-index; same-track clips
must not overlap. Visible timed divs use class="clip"; videos do not.
Mute videos and use sibling audio for the mix. Animate a non-timed video wrapper.
Register one synchronous paused GSAP timeline per composition in window.__timelines
using its exact composition ID. Keep finite timelines and explicit durations.
HyperFrames owns media playback. Use deterministic animation and local assets.

## Verification and approvals

Run `node scripts/preflight.mjs <project>` and HyperFrames lint. For anchored
sub-compositions, run `node scripts/validate-beat-sync.mjs <project>`; each beat
needs data-anchor with an exact transcript phrase. Enter between 0.2 seconds after
and 1.8 seconds before that word. Inline timelines require manual timing review.

Review Studio before draft rendering. Review the encoded draft, extract and
inspect hero frames and transition boundaries, and listen to the audio joins.
Check cropped faces, overflow, black flashes, readable labels, clipping, and A/V
sync. Resolve problems before the final render. Save evidence in VERIFY.md.
Use a Range-capable preview server for MP4 scrubbing (for example `npx serve`).

Honor approvals already provided. When review approval is missing, prepare the
concrete preview or cut proposal first. Never claim a lint result proves visual
quality. Only publish or upload a finished video when the user authorizes it.
Automated browser checks must be headless, with Pointer Lock and cursor capture
disabled; synthetic input must remain inside the virtual browser.

For short-form edits, read `docs/SHORT-FORM.md` and use the plan and footage
validators. Structural checks supplement rendered video and audio review.

## Reels Studio: added skills

| Need | Skill |
| --- | --- |
| Word-timed motion-graphic B-roll clips (one morphing shape) | `motion-broll` |
| Captions on a talking head (rail + embedded peak) | `embedded-captions` |
| Designed overlay cards on an untouched talking head | `talking-head-recut` |
| Timing, easing and choreography principles | `motion-principles` |
| Instagram Reels encode and safe zones | `reel-export` |
| Rotoscope a subject with SAM 2 | `object-separation` (optional, heavy) |
| Replicate someone else's reel: breakdown, adapted script, shooting plan | `reel-remake` |
| Fast remake cycle: text to say → shoot → preview → final, fewest stops | `remake-fast` |
| Wide OBS recording (layout + screen 1:1) → reel: all speech, screen matched to words | `reel-wide` |

`object-separation` is optional and heavy: it needs a Python venv with torch and
a 150–900 MB SAM 2 model, installed on first use only. Never run it in a reel
unless the user asks for it. Vendored versions and local patches: `vendor/SOURCES.md`.

## Reels Studio

The main scenario is `/reel <file> [— brief] [--mode kit|full] [--review-cuts] [--density …] [--principles]`.
Route every reel to the `vladilen-reels` skill, not straight to `short-form-edit`;
the orchestrator calls the chassis skills itself. Spec: `SPEC.md`.
Someone else's reel to replicate goes to `/remake <file> [— brief]` (`reel-remake`):
breakdown → adapted script and shooting plan → ГЕЙТ R → the customer shoots →
`/reel <raw> --remake <remake project>`. The reference is studied, never reused.
The short cycle is `/remake-fast <file> [— brief]` (`remake-fast`): the text to say
(`SAY.md`, 🎧 marks lines where an insert covers the speaker so he reads them) and the
recordings to make → he shoots → `/remake-fast <remake project>` → preview → «да» →
final, a ×1.1 cut and the Instagram caption. No ГЕЙТ R, A or B in this cycle.
A wide OBS recording (`Reels-wide-*.mp4`, 4104×1964: layout left, screen right) goes to
`/reel-wide <file> [— brief]` (`reel-wide`, engine `vladilen-reels`): every spoken comment kept, empty
stretches cut, the matching screen moment under each phrase, preview (normal + ×1.12) → «ок» → final.
No ГЕЙТ A or B; scripts in `scripts/ru/wide/`.
`--principles` (on `/reel`, `/remake`, `/remake-fast`; off by default, or «проверь сценарий
по принципам») checks the script against `reel-remake/references/script-principles.md`:
a verdict per principle (уместно / спорно / не здесь) and numbered edits in `PRINCIPLES.md`.
Apply only the edits the customer picks; never invent a number to make a line specific.

- Before creative work read `brand/brand.md`, `lessons.md`, `refs/NOTES.md`,
  `MOTION_PHILOSOPHY.md`.
- Priority when rules conflict: the customer's words in the current message →
  `lessons.md` → `brand/brand.md` → `vladilen-reels` → chassis skills → other skills.
- Educational speech: let phrases breathe; never turn it into a sizzle cut.
- Never invent facts, numbers, results or testimonials.
- Sources are read-only. Every derivative goes to `video-projects/<YYYY-MM-DD-slug>/`.
- Publish or send nothing.
- Paid calls (OpenAI/ElevenLabs transcription, Higgsfield) only inside a run.
  Never re-transcribe a cached source (SHA-256 cache in `.cache/transcripts/`).
  Higgsfield is phase 7: only on explicit request, with the prompt and expected
  cost shown and a «да» before each generation.
- Russian text only in fonts with Cyrillic (`brand/fonts/`); the bundled Inter
  copies in HyperFrames and the vendored skills are Latin-only.
- Claude cannot hear. Every report that touches audio ends with «Звук мной не
  прослушан: громкость, музыку и склейки по интонации проверь на слух».
- Reports: short, by stage — done, decided, needs the human.
- `SETUP.md` is the customer's one-page map of every setting (brand, music, SFX,
  keys, `/reel` flags, `fx.json`, captions). When you add, rename, remove or change
  the default of a setting, update `SETUP.md` in the same change: short, in Russian,
  where it lives and what it affects.
