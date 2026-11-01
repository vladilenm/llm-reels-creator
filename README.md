# Reels Studio

Монтаж вертикальных рилсов на русском в Claude Code. Кладёшь сырое видео с говорящей
головой, пишешь одну команду и получаешь смонтированный рилс: паузы и дубли
вырезаны, есть хук, графика под слова, русские субтитры, звук и экспорт под
Instagram Reels.

```
/reel inbox/<файл> — бриф одной строкой
```

- **[START.md](START.md)**: установка, первый рилс, что настроить под себя.
- **[SETUP.md](SETUP.md)**: шпаргалка по всем настройкам (бренд, звук, флаги, `fx.json`).

## Установка

Нужны Mac, Claude Code, Node 22+, git, ffmpeg и ffprobe, Python 3 и Google Chrome.
Подробности в [START.md](START.md).

```sh
git clone https://github.com/vladilenm/llm-reels-creator.git
cd llm-reels-creator
npm ci
npm run setup
npm test
```

GitHub Actions проверяет структуру проекта, общие тесты и демопроект на Linux, Windows и macOS.
Полный набор медиатестов выполняется на macOS: монтажная студия использует Apple Vision
и рассчитана на Mac. Эти проверки включают браузерные сцены, синтетические рендеры и сборку YouTube.

`setup` проверяет инструменты и создаёт локальные файлы, которых нет в репозитории:

| Файл | Из шаблона | Что это |
|---|---|---|
| `.env` | `.env.example` | ключи API (нужен только `OPENAI_API_KEY`) |
| `brand/brand.md` | `brand/brand.example.md` | твой бренд: цвета, шрифты, субтитры, тон, CTA |
| `lessons.md` | `lessons.example.md` | журнал твоих правок, заполняется сам после каждого рилса |
| `refs/NOTES.md` | `refs/NOTES.example.md` | рилсы-эталоны: что брать, что нет |
| `brand/music/tracks.json` | `brand/music/tracks.example.json` | твои треки с лицензиями |

Эти файлы, а также `inbox/`, `refs/` и `video-projects/`, в гит не попадают: твои
видео, расшифровки и вкус остаются у тебя.

## Команды

| Команда | Что делает |
|---|---|
| `/reel <файл> — бриф` | полный монтаж рилса; флаги `--mode kit\|full`, `--density`, `--review-cuts` |
| `/remake <чужой рилс> — бриф` | разбор чужого рилса, текст под тебя и план съёмки; снятое потом идёт в `/reel --remake` |

Главный сценарий со стадиями S0–S8: [.claude/skills/vladilen-reels/SKILL.md](.claude/skills/vladilen-reels/SKILL.md).
Исходная спецификация студии: [SPEC.md](SPEC.md).

## Что внутри

- `scripts/ru/`: русский пайплайн: транскрипция с кэшем, чистка пауз и дублей,
  субтитры, эффекты картинки и звука, сборка и экспорт.
- `.claude/skills/`: скиллы для Claude Code (их зеркало для Codex лежит в `.agents/skills/`,
  его собирает `npm run sync:skills`).
- `brand/fonts/`: шрифты с кириллицей (Inter, Geist, Playfair Display; лицензии OFL рядом).
- `style-library/` и `style-templates/`: карточки и шаблоны сцен для моушн-графики.
- `MOTION_PHILOSOPHY.md`: словарь движения и переходов.

## Проверки

```sh
npm test        # тесты пайплайна
npm run check   # синхронизация скиллов, библиотека карточек, нет медиа и секретов в гите
```

## Основа и лицензии

Студия собрана на [HyperFrames Student Kit](https://github.com/nateherkai/hyperframes-student-kit)
Нейта Херка (MIT, см. [LICENSE](LICENSE)) и [HyperFrames](https://github.com/heygen-com/hyperframes)
(Apache-2.0). Сторонние ресурсы и их лицензии: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md),
[licenses/](licenses/), [vendor/SOURCES.md](vendor/SOURCES.md).
