# Бренд · Владилен Минин

> Заготовка. Заполни поля в JSON ниже (их читают скрипты `scripts/ru/*`) и при
> желании допиши словами, как бренд должен ощущаться. Пока здесь значения по
> умолчанию: Claude использует их и пишет об этом в отчёте.

## Токены

```json
{
  "accent": "#FF5A1F",
  "background": "#0B0B0F",
  "ink": "#F4F2EE",
  "canvas": "#E9E7E2",
  "font_heading": { "family": "Inter", "files": { "700": "brand/fonts/Inter-700.ttf", "800": "brand/fonts/Inter-800.ttf" } },
  "font_body": { "family": "Inter", "files": { "400": "brand/fonts/Inter-400.ttf", "500": "brand/fonts/Inter-500.ttf", "700": "brand/fonts/Inter-700.ttf" } },
  "font_mono": { "family": "Geist Mono", "files": { "500": "brand/fonts/GeistMono-Medium.woff2" } },
  "captions": {
    "style": "anchor-rail",
    "font_px": 64,
    "weight": 700,
    "color": "#FFFFFF",
    "active_color": "#FF5A1F",
    "max_chars_per_line": 22,
    "max_lines": 2,
    "baseline_y": 1330,
    "shadow": "0 3px 14px rgba(0,0,0,.55), 0 0 2px rgba(0,0,0,.9)"
  },
  "cta_default": "Подписывайся — разбираю AI и фронтенд без воды",
  "logo": null
}
```

## Словами

- Тон: _заполнить_ (например: спокойно, по делу, без кликбейта).
- Что нельзя: _заполнить_.
- Логотип: положи файл в `brand/logo/` и впиши путь в `"logo"`.

## Правила

- Только шрифты с кириллицей. Перед рендером `scripts/ru/check-glyphs.mjs` проверяет
  каждый символ субтитров и графики; урезанные латинские подмножества (как Inter в кэше
  HyperFrames) запрещены.
- Весь значимый текст и логотипы — в безопасной зоне Reels: y 360–1420, x ≤ 960.
