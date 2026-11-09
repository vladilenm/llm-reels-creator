---
description: Подпись и обложка к готовому рилсу (Reels Studio)
argument-hint: [video-projects/<date>-<slug>] [— бриф: подпись, текст плашки, цвет, объект] [--no-object] [--purple]
---

Запусти скилл `reel-package` и сделай для готового рилса подпись (`CAPTION.txt`) и обложку
(`cover/cover.png`) строго по `.claude/skills/reel-package/SKILL.md`.

Аргументы: $ARGUMENTS

- Первый аргумент — проект рилса; без него — самый свежий `video-projects/*` с `renders/final*.mp4`.
- Стиль обложки — референс `refs/cover-ref-01.webp`: мой кадр из рилса, наклонная красная плашка
  с капсом, 3D-предмет под ней. `--purple` — плашка фирменным фиолетовым.
- Предмет генерируется в Higgsfield только после моего «да» на промпт и цену. `--no-object` — без него.
- Ничего не публиковать.
