// Personal studio files are gitignored; the repo ships *.example templates.
// ensurePersonalFiles() creates any missing working copy from its template and
// never overwrites an existing one.
import { copyFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const PERSONAL_FILES = [
  ["brand/brand.example.md", "brand/brand.md"],
  ["lessons.example.md", "lessons.md"],
  ["refs/NOTES.example.md", "refs/NOTES.md"],
  ["brand/music/tracks.example.json", "brand/music/tracks.json"],
];

export function ensurePersonalFiles(root = ROOT) {
  const created = [];
  for (const [template, target] of PERSONAL_FILES) {
    if (existsSync(join(root, target)) || !existsSync(join(root, template))) continue;
    copyFileSync(join(root, template), join(root, target));
    created.push(target);
  }
  return created;
}
