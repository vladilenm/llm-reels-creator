# Фирменный набор SFX

`scripts/ru/fx/sfx.py` берёт отсюда настоящие сэмплы вместо синтеза: файл
`<kind>.wav|mp3|m4a` заменяет синтезатор для этого вида звука. Если файла нет, звук
синтезируется, как раньше. Аудио в git не попадает.

Откуда берутся файлы (с 2026-10-25):

- `node scripts/ru/sfx-kit.mjs` — по умолчанию из банка earshot: звуки, записанные кодом,
  рендер по id без моделей и сети (`tools/earshot`). Какой id у какого вида — `kit.json`;
  другой вариант: `--set pop=pro_pop/tink` (список: `tools/earshot/.venv/bin/earshot sfx list`).
- `node scripts/ru/sfx-fetch.mjs` — настоящие записи CC0 с Freesound через Openverse API
  (бесплатно, без ключа) в `library/<вид>/`, авторы и лицензии в `library/credits.json`.
  Взять запись в набор: `node scripts/ru/sfx-kit.mjs --source openverse --kinds hit`.
  Эта же библиотека — основная для скилла Real SFX (`.claude/skills/real-sfx`).

| Файл | Где звучит |
|---|---|
| `whoosh.wav` | переход на смене локации |
| `whoosh_big.wav` | раскрытие фона (title moment) |
| `whoosh_small.wav` | мелкий сдвиг: субтитры уехали, карточка ушла |
| `pop.wav` | появление карточки или чипа; высота меняется по `f` (база 660 Гц) |
| `click.wav` | нажатие кнопки, отправка промпта |
| `tick.wav` | счётчик, перелистывание цифр |
| `chime.wav` | успех, «готово»; высота по `f` (база 880 Гц) |
| `hit.wav` | один главный удар на рилс |

Тишину в начале файла скрипт обрезает сам, поэтому удар попадает точно в событие.
Сэмплы должны быть с лицензией на коммерческое использование (CC0 из Openverse — да).
Другую папку можно указать в `fx/fx.json` → `"sfx_kit"`.

## Палитра «чисто и дорого» (с 2026-10-26)

`node scripts/ru/sfx-fetch.mjs` качает CC0-записи по палитре `scripts/ru/lib/sfx-palette.mjs` в папки-роли
Real SFX (`whoosh`, `riser`, `hit`, `subdrop`, `click`, `click_tick`, `pop`, `paper`, `glass`, `chime`, `keyboard`,
`ambience`). `python3 scripts/ru/sfx_screen.py` отсеивает по замерам: брак — в `rejected/`, лишнее — в `reserve/`.
Отбор на слух и фирменный звук — `scripts/ru/sound_review.py` (`signature.json` рядом с этой папкой).
В remake-fast звуки ставит `scripts/ru/fx/sfx_real.py`, набор `<вид>.wav` выше — для старого `sfx.py`.
