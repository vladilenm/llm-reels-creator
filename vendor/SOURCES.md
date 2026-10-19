# Vendored sources

Everything borrowed from third-party repositories, pinned by commit. Upgrades are
manual: re-clone at a new SHA, re-apply the local changes listed here, re-run
`npm test`, `npm run check` and the fixture run, then update this file.

All repositories were checked on 2026-10-11. Licenses are taken from each repo's
root `LICENSE`.

| Repository | Commit (date) | License | What we use | Where it lives |
|---|---|---|---|---|
| `nateherkai/hyperframes-student-kit` | `0d30152a82b9ceb93cfdd9bdbf46f0d5ab3cde86` (2026-09-28) | MIT | Whole chassis: `package.json`, `scripts/`, 15 skills, `style-library/`, docs, tests | repo root; `LICENSE`, `THIRD_PARTY_NOTICES.md`, `licenses/` kept |
| `Barty-Bart/motion-graphics` | `83355bb58f78cdb486d6a00f6cfa22e40e538f03` (2026-10-05) | MIT | `skills/motion-broll`, `skills/object-separation` | `.claude/skills/motion-broll/`, `.claude/skills/object-separation/` |
| `heygen-com/hyperframes` | `d4dd6c097d22ca890c0eea401eaebf550ce10fae` (2026-10-11) | Apache-2.0 | `skills/embedded-captions`, `skills/talking-head-recut`, `skills/hyperframes/references/brief-contract.md` | `.claude/skills/embedded-captions/`, `.claude/skills/talking-head-recut/` |
| `LottieFiles/motion-design-skill` | `f9a8a041b85185ee4881b3471d3415e939aac772` (2026-05-18) | MIT | `skills/motion-design` → renamed `motion-principles` | `.claude/skills/motion-principles/` |
| `charlie947/motion-graphics-skills` | `229022ebca76972e119e36ada23a1648d51665ab` (2026-10-11) | MIT | `skills/reel-export` | `.claude/skills/reel-export/` |
| `whaleyxbt/claude-motion` | `e627941543d9988b155dc610bb9cc0115a5e365e` (2026-10-09) | MIT | Text of the `review-loop` checklist and `sound-design` rules, adapted (not installed as skills) | `.claude/skills/vladilen-reels/references/` |

Copyright notices: Nate Herk (2026), Bart (2026), HeyGen (Apache-2.0, see
`.claude/skills/talking-head-recut/NOTICE.md`), LottieFiles (2025), Charlie Hills
(2026), whaleyxbt (2026).

## How each was installed

- **Chassis.** The repo is ~420 MB, almost all of it finished example MP4s. On a
  slow link a full clone was impractical, so it was fetched with
  `git clone --filter=blob:none` + sparse checkout excluding `*.mp4 *.mov *.wav
  *.mp3 *.m4a` and `examples/showcase/`. All other upstream tracked files (1011)
  are committed here unchanged. Example projects under `video-projects/` keep
  their HTML/JSON but not their media. Upstream `.git` is not kept.
- **Other skills.** Copied directory-for-directory from a shallow clone
  (`npx skills add` was not used: it resolves the latest commit rather than a pin,
  and copying gives the same files).

## Local changes to vendored files

| File | Change | Why |
|---|---|---|
| `package.json` / `package-lock.json` | `hyperframes` 0.7.109 → **0.8.147** | See "HyperFrames version decision" |
| `.gitignore` | Removed blanket `video-projects/` and `**/assets/`; added targeted Reels Studio rules | Spec §6 phase 1: per-reel `.md`/`.json`/HTML are committed, media is not |
| `.env.example` | Added `HIGGSFIELD_API_KEY`, `HYPERFRAMES_NO_TELEMETRY`, `HYPERFRAMES_NO_UPDATE_CHECK` | Spec §4; no outbound telemetry from renders |
| `.claude/skills/motion-principles/SKILL.md` | `name: motion-design` → `name: motion-principles` | Spec §5: avoid a name clash |
| `.claude/skills/embedded-captions/SKILL.md`, `.claude/skills/talking-head-recut/SKILL.md` | Replaced the "Plugin installs" line and the "keep this skill fresh / `hyperframes skills update`" instruction with a Reels Studio note (pinned copy, project CLI, no re-transcription). Link to `../hyperframes/references/brief-contract.md` → local `references/heygen-brief-contract.md` | The chassis `hyperframes` skill is an older layout without these references; auto-updating would break the pin |
| `.claude/skills/*/references/heygen-brief-contract.md` | New: verbatim copy of heygen `skills/hyperframes/references/brief-contract.md` | Resolve the cross-skill link inside the vendored copy |
| `.claude/skills/embedded-captions/scripts/hf-cli.cjs` | Added a final fallback: walk up from the script to the nearest `node_modules/hyperframes/dist/cli.js` | Upstream only finds a HeyGen source checkout or their plugin launcher; we use the project's pinned npm CLI |
| `.claude/skills/object-separation/SKILL.md` | Windows home-directory example path → `%USERPROFILE%\.cache` | The chassis `npm run check` rejects machine-specific paths |
| `scripts/check-kit.mjs` | Also skips `fixtures/out`, `inbox`, `refs`, `.cache` | Generated fixture media, raw inputs and reference reels are local-only and gitignored |
| `scripts/transcribe-elevenlabs.mjs` | Default model `scribe_v1` → `scribe_v2`; default language `en` → `ru`; SHA-256 cache in `.cache/transcripts/` (key = file hash + model + language + flags; a hit copies the response and makes no API call; `--no-cache`, `--cache-dir`) | `scribe_v1` was removed by ElevenLabs on 2026-07-09; Russian is our language; never pay twice for the same source |
| `.claude/skills/cut-mistakes/scripts/find-cut-candidates.mjs` | Tokens are Unicode-aware (was `[a-z0-9]` only, so every Cyrillic token was empty and the detector was blind on Russian). Stop words moved to a JSON config (`--lang`, `--fillers`; `config/en.json` keeps the original English list). Russian retake signatures compare 5-letter prefixes. New candidate types `hesitation`, `filler` (review only), `retake_marker` (chained markers, abandoned fragment) | SPEC §3.3 |
| `.claude/skills/cut-mistakes/config/en.json` | New: the English vocabulary that used to be hard-coded, plus um/uh as hesitations | Config, not code |
| `.claude/skills/cut-mistakes/SKILL.md` | Documents the language config, new types and the "read the whole transcript anyway" rule | |
| `.claude/skills/motion-broll/scripts/words.py` | Also accepts a word-level JSON transcript and prints exact word times | SPEC §3.5: no ±0.2 s SRT estimate |
| `.claude/skills/motion-broll/engine/beats.js` | Resizes the viewport to the clip's stage before screenshots; tiles 360 px wide for vertical clips | Was fixed at 1920×1080, so 1080×1920 sheets lost the bottom 840 px |
| `.claude/skills/motion-broll/engine/render.js`, `beats.js` | After `document.fonts.ready` also await `window.READY` when a clip sets it | The screen kit (`scripts/ru/broll/screen-kit.js`) preloads screenshots and recording frames; the first seek must not draw an empty window |
| `.claude/skills/motion-broll/scripts/make_pages.py` | The on-black web preview of a `.mov` panel uses the clip's own size | Was fixed at 1920×1080 |
| `.claude/skills/reel-export/SKILL.md` | Added `setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709` to the encode filter chain | With ffmpeg 8.1 the original command writes `color_primaries`/`color_trc` as unknown; verified with ffprobe |

## Discrepancies between SPEC.md and the real repositories

- **Spec says chassis pins `hyperframes@0.7.109`** — correct, but `embedded-captions`
  (heygen @ d4dd6c0) is written against CLI 0.8.x (e.g. `render --dir`). Resolved
  by the version decision below.
- **heygen skills assume a plugin install or a HeyGen monorepo checkout** to find
  the CLI (`hf-cli.cjs`). Patched as above.
- **`embedded-captions` caption fonts are Latin-only subsets**
  (`modes/standard/fonts/files/*-latin-*.woff2`). Cyrillic needs our own fonts (`brand/fonts/`).
- **motion-broll `setup.sh` installs its own Playwright + Chromium into
  `./motion/node_modules`.** The chassis already ships Playwright 1.63 (Chromium
  rev 1243), so we run the engine with `NODE_PATH=<repo>/node_modules` and skip the
  per-project install. Verified: `build.py` → `beats.js` → `render.js` renders an
  example clip.
- **heygen caption helpers (`preview-frames.cjs`, `check-*.cjs`)** launch the system
  Google Chrome via `executablePath`, so no Puppeteer browser download is needed.
- **ElevenLabs `scribe_v1`** (the chassis default) no longer exists (removed
  2026-07-09); `scribe_v2` is the batch model. `language_code` accepts ISO-639-1
  or -3 (`ru`/`rus`); the response's `language_code` is ISO-639-3 (`rus`).
- **ElevenLabs is geo-restricted from this machine's network**: on 2026-10-11 both
  `elevenlabs.io/docs` and `api.elevenlabs.io` answered 302 to the
  "restricted countries" help page. Transcription needs a network route ElevenLabs
  accepts. The fixture therefore ships an exact synthetic transcript so S2 is
  testable without the API. **Decision (2026-10-11, with the customer): the default
  S1 provider is OpenAI `whisper-1`** (reachable from this network; the only OpenAI
  model with word timestamps), via `scripts/ru/transcribe.mjs`. ElevenLabs stays
  available with `--provider elevenlabs`. Whisper tends to clean up disfluencies, so
  the request carries a disfluent Russian prompt; a dropped «э-э» still leaves a gap
  between words that the silence pass removes.
- **Inter is Latin-only everywhere it is bundled**: HyperFrames' own font cache
  (`~/.cache/hyperframes/fonts/inter`), `talking-head-recut/assets/fonts/Inter-*-latin`
  and `embedded-captions/.../inter-latin-*`. Rendering Cyrillic with them falls back
  to a system font silently. `brand/fonts/` carries full Inter 4.001 (Google Fonts
  static TTFs, OFL) and Geist (from motion-broll, OFL), both checked with
  `scripts/ru/check-glyphs.mjs`.
- **`embedded-captions` is not used for S5.** Its renderer needs a subject matte
  (u2net, ~168 MB, minutes of CPU per 10 s), the `anchor` theme is tuned for 1280×720
  (at 1920 high the rail lands under the Reels UI), every bundled font is a Latin
  subset and the rail has no line breaking. `scripts/ru/make-captions.mjs` implements
  the same rail rules for 9:16 Russian with our transcript and fonts; the skill stays
  installed for embedded/cinematic captions on request.
- **`talking-head-recut` is not used by default either**: «карточка поверх» is built
  as a transparent motion-broll panel, so S4 has one graphics engine.
- **ffmpeg 8.1 + `-color_primaries/-color_trc`** does not tag the stream unless
  `setparams` sets them in the filter graph (see reel-export patch).

## HyperFrames version decision (phase 2, 2026-10-11)

**Decision: raise the chassis pin from `hyperframes@0.7.109` to `0.8.147`** (the CLI
version in heygen @ d4dd6c0, also npm `latest` on this date).

- Why: `embedded-captions/scripts/render-and-composite.sh` calls
  `hyperframes render --dir …`; 0.7.109 has no `--dir` flag (DIR is positional).
  The heygen skills are authored against the 0.8 CLI.
- Checks on 0.8.147: `npm test` 11/11 green; `npm run check` 0 errors; the demo
  project lints with 0 errors (1 new warning: `nested_structure_needs_subcomposition`
  on the starter template) and renders (`renders/demo-08.mp4`, 1920×1080, 8.0 s,
  ffprobe clean).
- Known cost: the 0.8 linter has new rules (`gsap_css_transform_conflict`,
  `font_family_without_font_face`) that flag the chassis' legacy example projects
  under `video-projects/` (plus `missing_local_asset` because their media was not
  cloned). These are teaching examples, not pipeline code; nothing in our flow
  lints them. `font_family_without_font_face` is useful for us: it catches fonts
  with no `@font-face`, the start of most Cyrillic fallback bugs.
- The separate-subproject fallback from the spec was not needed.
- First render on a new CLI version downloads its own chrome-headless-shell
  (~100 MB into `~/.cache/hyperframes/chrome`); later renders start in seconds.

## Runtime dependencies added to `package.json`

| Package | Version | Why |
|---|---|---|
| `puppeteer` | 25.8.0 (exact) | `embedded-captions` preview/measure/check helpers. Install with `PUPPETEER_SKIP_DOWNLOAD=1`: the helpers launch the system Google Chrome, the bundled browser download (~170 MB) is not needed |
| `sharp` | 0.35.3 (exact) | `embedded-captions` safe-zones / occlusion checks (already a transitive dep of hyperframes; now explicit) |
| `fontkit` | 2.0.4 (exact) | `scripts/ru/check-glyphs.mjs` (already transitive; now explicit) |

`gsap` stays at the chassis pin 3.14.2 (heygen suggests 3.15.0 in the caption
project; the helpers only read `gsap.min.js` and work with 3.14.2).

The caption helpers look for their dependencies in `<caption project>/node_modules`.
Instead of a per-reel `npm install`, the orchestrator symlinks the repo's
`node_modules` into the caption project (verified: `preview-frames.cjs` finds
puppeteer + sharp through the link).
