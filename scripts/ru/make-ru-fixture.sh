#!/usr/bin/env bash
# Synthetic Russian reel fixture (macOS `say` + ffmpeg). See make-ru-fixture.mjs.
# Usage: bash scripts/ru/make-ru-fixture.sh [--out fixtures/out/ru-agents] [--force]
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node scripts/ru/make-ru-fixture.mjs "$@"
