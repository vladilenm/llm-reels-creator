#!/usr/bin/env node
// S3 · раскадровка движений (ночной стиль, дизайн 2026-10-26): PLAN.json `motion` — по записи на каждую смену
// состояния в кадре: {at, word, verb, what}. at — секунды чистого таймлайна, word — слово, на которое приходится смена
// (из transcript.clean.json), verb — один из 16 глаголов ниже, what — что в кадре.
// Правила: глагол из списка; один глагол не идёт два раза подряд; разных глаголов не меньше 5; слово звучит в at ±0,25 с;
// светлых акцентов (work/accents.json kind "light" и полные клипы broll/plan.json с theme "light") 1–2.
// Пишет MOTION.md — таблицу для отчёта на превью.
//   node scripts/ru/motion-check.mjs <project>      код выхода 1, если правило нарушено
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, lightWindows } from "./make-captions.mjs";

export const VERBS = {
  fly: "сквозной пролёт", pull: "вытягивание", live: "живой интерфейс", layers: "слои в глубину", lens: "линза",
  grid: "сборка из сетки", materialize: "материализация", rebuild: "перестройка", tree: "дерево и связи",
  physics: "физика предмета", callouts: "выноски", active: "активный пункт", chapter: "глава", return: "возврат",
  morph: "морф значка", prompt: "строка ввода",
};
const norm = (s) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, "");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");

export function checkMotion(motion = [], words = [], lights = 0) {
  const errors = [], warnings = [], list = [];
  if (!Array.isArray(motion)) { errors.push("motion в PLAN.json должен быть списком записей {at, word, verb, what}"); motion = []; }
  motion.forEach((m, i) => {
    const bad = [];
    if (m == null || typeof m !== "object") bad.push("это не запись {at, word, verb, what}");
    else {
      if (typeof m.at !== "number" || !Number.isFinite(m.at)) bad.push(`at должно быть числом секунд, а не ${JSON.stringify(m.at)}`);
      if (typeof m.word !== "string" || !m.word.trim()) bad.push(`word должно быть словом из расшифровки, а не ${JSON.stringify(m.word)}`);
    }
    if (bad.length) errors.push(`запись ${i + 1}: ${bad.join("; ")}`); else list.push(m);
  });
  list.sort((a, b) => a.at - b.at);
  list.forEach((m, i) => {
    const known = Object.hasOwn(VERBS, m.verb);
    if (!known) errors.push(`${m.at} «${m.word}»: неизвестный глагол «${m.verb}» (есть: ${Object.keys(VERBS).join(", ")})`);
    if (i && list[i - 1].verb === m.verb) errors.push(`${m.at} «${m.word}»: «${known ? VERBS[m.verb] : m.verb}» второй раз подряд`);
    if (!words.some((w) => norm(w.text) === norm(m.word) && Math.abs(w.start - m.at) <= 0.25)) errors.push(`${m.at}: слова «${m.word}» нет в ±0,25 с`);
  });
  const kinds = new Set(list.map((m) => m.verb));
  if (kinds.size < 5) errors.push(`разных глаголов ${kinds.size}, нужно не меньше 5`);
  if (lights > 2) errors.push(`светлых акцентов ${lights}, нужно 1–2`);
  if (lights === 0) warnings.push("светлых акцентов нет: обычно 1–2 на самые сильные места");
  const fmt = (s) => s.toFixed(2).replace(".", ",");
  const table = ["| Время | Слово | Глагол | Что в кадре |", "|---|---|---|---|",
    ...list.map((m) => `| ${fmt(m.at)} | ${cell(m.word)} | ${cell(Object.hasOwn(VERBS, m.verb) ? VERBS[m.verb] : m.verb)} | ${cell(m.what)} |`)].join("\n");
  return { errors, warnings, table, verbs: kinds.size };
}

export function motionCheck(project) {
  project = resolve(project);
  const words = (readJson(project, "transcript.clean.json")?.words ?? []).filter((w) => (w.type ?? "word") === "word");
  const lights = lightWindows(project, { merge: false }).length;
  const r = checkMotion(readJson(project, "PLAN.json")?.motion ?? [], words, lights);
  writeFileSync(join(project, "MOTION.md"), `# Раскадровка движений\n\nГлаголов: ${r.verbs} · светлых акцентов: ${lights}\n\n${r.table}\n`);
  return { ...r, lights };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.log("Usage: node scripts/ru/motion-check.mjs <project>"); process.exit(1); }
  let r;
  try { r = motionCheck(process.argv[2]); } catch (e) { console.log("✗ " + (e.message || e)); process.exit(1); }
  for (const w of r.warnings) console.log("⚠ " + w);
  for (const e of r.errors) console.log("✗ " + e);
  console.log(r.errors.length ? `FAIL · ${r.errors.length}` : `PASS · глаголов ${r.verbs}, светлых акцентов ${r.lights} → MOTION.md`);
  process.exit(r.errors.length ? 1 : 0);
}
