#!/usr/bin/env node
// STATUS.json (machine) + STATUS.md (human) for one reel project. A run that is
// interrupted resumes from the first stage that is not "done".
//
//   node scripts/ru/status.mjs <project>                       print
//   node scripts/ru/status.mjs <project> --stage S2 --state done [--note "…"]
//   node scripts/ru/status.mjs <project> --decision "Хук: вариант B"
//   node scripts/ru/status.mjs <project> --next                 first unfinished stage

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGES = [
  ["S0", "Приём"],
  ["S1", "Транскрипция"],
  ["S2", "Чистка"],
  ["S3", "Драматургия → ГЕЙТ B"],
  ["S4", "Графика"],
  ["S5", "Субтитры"],
  ["S6", "Самопроверка"],
  ["S7", "Сборка → ГЕЙТ C"],
  ["S8", "Уроки"],
];
const STATES = new Set(["todo", "running", "waiting", "done", "skipped", "failed"]);

export function readStatus(project) {
  const p = join(project, "STATUS.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  return { slug: basename(project), stages: Object.fromEntries(STAGES.map(([id]) => [id, { state: "todo", note: "", at: null }])), decisions: [] };
}

export function writeStatus(project, s) {
  writeFileSync(join(project, "STATUS.json"), JSON.stringify(s, null, 2) + "\n");
  const icon = { todo: "·", running: "…", waiting: "⏸", done: "✓", skipped: "–", failed: "✗" };
  const md = [
    `# STATUS · ${s.slug}`,
    "",
    s.mode ? `Режим: \`${s.mode}\` · плотность: \`${s.density ?? "medium"}\`${s.reviewCuts ? " · --review-cuts" : ""}` : "",
    "",
    "| Стадия | Состояние | Заметка | Когда |",
    "|---|---|---|---|",
    ...STAGES.map(([id, name]) => {
      const st = s.stages[id] ?? { state: "todo" };
      return `| ${id} ${name} | ${icon[st.state] ?? ""} ${st.state} | ${(st.note ?? "").replaceAll("|", "/")} | ${st.at ?? ""} |`;
    }),
    "",
    "## Решения",
    "",
    ...(s.decisions.length ? s.decisions.map((d) => `- ${d.at} — ${d.text}`) : ["- пока нет"]),
    "",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  writeFileSync(join(project, "STATUS.md"), md.join("\n") + "\n");
}

export function nextStage(s) {
  return STAGES.find(([id]) => !["done", "skipped"].includes(s.stages[id]?.state))?.[0] ?? null;
}

export const now = () => new Date().toLocaleString("sv-SE").slice(0, 16);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const project = resolve(a[0] ?? "");
  if (!a[0] || !existsSync(project)) { console.error("Usage: node scripts/ru/status.mjs <project> [--stage S2 --state done --note …] [--decision …] [--next]"); process.exit(1); }
  const s = readStatus(project);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  if (a.includes("--next")) { console.log(nextStage(s) ?? "complete"); process.exit(0); }
  const stage = get("--stage");
  if (stage) {
    const state = get("--state") ?? "done";
    if (!s.stages[stage]) throw new Error(`unknown stage ${stage}`);
    if (!STATES.has(state)) throw new Error(`state must be one of ${[...STATES].join(", ")}`);
    s.stages[stage] = { state, note: get("--note") ?? s.stages[stage].note ?? "", at: now() };
  }
  const decision = get("--decision");
  if (decision) s.decisions.push({ at: now(), text: decision });
  for (const k of ["mode", "density"]) if (get(`--${k}`)) s[k] = get(`--${k}`);
  writeStatus(project, s);
  console.log(readFileSync(join(project, "STATUS.md"), "utf8"));
}
