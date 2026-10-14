---
description: Смонтировать сырой вертикальный рилс (Reels Studio)
argument-hint: <файл> [— бриф одной строкой] [--mode kit|full] [--review-cuts] [--density light|medium|heavy] [--slug name] [--remake video-projects/<date>-remake-<slug>]
---

Запусти скилл `vladilen-reels` для этого рилса и веди его по стадиям S0–S8 строго по
`.claude/skills/vladilen-reels/SKILL.md`.

Аргументы: $ARGUMENTS

- Первый аргумент — путь к сырому файлу (обычно в `inbox/`). Текст после `—` — бриф.
- `--remake <проект ремейка>` — сырьё снято по сценарию из `/remake`: передай флаг в
  `intake.mjs`, сценарий `SCRIPT.md` — основа для S2 и S3 (раздел «Ремейк» в скилле).
- По умолчанию: `--mode kit`, `--density medium`, ГЕЙТ A выключен.
- Если проект этого рилса уже существует — продолжи с первой незавершённой стадии
  (`node scripts/ru/status.mjs <project> --next`), без повторных платных вызовов.
- Остановки: ГЕЙТ B (хук и план графики) и ГЕЙТ C (правки по превью) — всегда;
  ГЕЙТ A — только с `--review-cuts`; S1 — только если транскрипт мусор.
