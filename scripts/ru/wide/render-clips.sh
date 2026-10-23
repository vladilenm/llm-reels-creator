#!/bin/zsh
# W4 сборка и рендер клипов широкого рилса: build.py (шрифты бренда) → render.js → broll/<name>.mov (ProRes 4444, альфа).
#   scripts/ru/wide/render-clips.sh <project> [name …]     без имён — все клипы из broll/clips/; по два параллельно
set -e
cd "$(dirname $0)/../../.."
P=${1:?project}; shift
SK=.claude/skills/motion-broll
FPS=$(python3 -c "import json;print(json.load(open('$P/meta.json')).get('fps',25))")
names=("$@"); [ ${#names} -eq 0 ] && names=($(ls $P/broll/clips/*.html | xargs -n1 basename | sed 's/\.html$//'))
python3 scripts/ru/broll/build.py $P/broll/dist $P/broll/clips/${^names}.html >/dev/null
r(){ NODE_PATH=./node_modules node $SK/engine/render.js $P/broll/dist/$1.html $P/broll/$1.mov $FPS > $P/broll/$1.log 2>&1 && echo "$1 ok" || echo "$1 FAIL (см. broll/$1.log)"; }
for n in $names; do r $n & ; while [ $(jobs -r | wc -l) -ge 2 ]; do sleep 1; done; done; wait
