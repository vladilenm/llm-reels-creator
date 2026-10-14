# vladilen-reels scripts

The orchestrator's scripts live in the repo at `scripts/ru/` (one copy, tested by
`npm test`). Run them from the repo root:

| Stage | Script |
|---|---|
| S0 | `scripts/ru/intake.mjs`, `scripts/ru/status.mjs` |
| S1 | `scripts/ru/transcribe.mjs`, `scripts/ru/normalize-transcript.mjs` |
| S2 | `.agents/skills/cut-silences/scripts/cut-silences.mjs`, `.agents/skills/cut-mistakes/scripts/find-cut-candidates.mjs`, `scripts/ru/build-edl.mjs` |
| S4 | `.agents/skills/motion-broll/engine/*`, `scripts/ru/check-glyphs.mjs` |
| S4b | `scripts/ru/fx/fx_picture.py`, `scripts/ru/fx/sfx.py`, `scripts/ru/fx/person-mask.swift` |
| S5 | `scripts/ru/make-captions.mjs`, `scripts/ru/words-to-srt.mjs` |
| S6 | `scripts/ru/assemble.mjs --preview`, `scripts/ru/contact-sheet.mjs` |
| S7 | `scripts/ru/assemble.mjs --kit` / `--final`, `scripts/ru/export-reel.mjs`, `scripts/ru/check-reel.mjs` |
| S8 | `scripts/ru/log-run.mjs` |
| tests | `scripts/ru/make-ru-fixture.sh` (synthetic Russian reel) |

`/remake` (skill `reel-remake`) uses the same folder:

| Stage | Script |
|---|---|
| R0 | `scripts/ru/ref-intake.mjs` (copy, scene cuts, contact sheets `--label-only`, audio summary) |
| R1 | `scripts/ru/transcribe.mjs --language auto`, `scripts/ru/normalize-transcript.mjs`, `scripts/ru/ref-intake.mjs --gaps` |
| R2 | `scripts/ru/contact-sheet.mjs --from --to --every --label-only` (extra frames) |
| R4 | `scripts/ru/intake.mjs --remake` (in `/reel`) |
