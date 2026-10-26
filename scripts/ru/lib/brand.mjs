// Reads the first ```json block of brand/brand.md (the machine-readable tokens).
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const DEFAULT_BRAND = {
  accent: "#FF5A1F",
  background: "#0B0B0F",
  ink: "#F4F2EE",
  canvas: "#E9E7E2",
  glow: "#1E1630",
  font_body: { family: "Inter", files: { 400: "brand/fonts/Inter-400.ttf", 700: "brand/fonts/Inter-700.ttf" } },
  // Serif: `italic` is the kinetic-caption accent and the screen-kit plate, `display` the giant fx textmask.
  font_serif: {
    family: "Playfair Display",
    italic: "brand/fonts/PlayfairDisplay-Italic-Variable.ttf",
    display: "brand/fonts/PlayfairDisplay-Variable.ttf",
  },
  font_mono: { family: "Geist Mono", files: { 500: "brand/fonts/GeistMono-Medium.woff2" } },
  captions: {
    style: "anchor-rail", font_px: 64, weight: 700, color: "#FFFFFF", active_color: "#FF5A1F",
    max_chars_per_line: 22, max_lines: 2, baseline_y: 1330,
    shadow: "0 2px 8px rgba(0,0,0,.45)", backdrop: "rgba(11,11,15,.62)",
  },
};

export function loadBrand(path = join(ROOT, "brand/brand.md")) {
  // brand.md is local (gitignored); a fresh clone falls back to the shipped template.
  if (!existsSync(path) && path === join(ROOT, "brand/brand.md")) path = join(ROOT, "brand/brand.example.md");
  if (!existsSync(path)) return { ...DEFAULT_BRAND, _source: "defaults" };
  const md = readFileSync(path, "utf8");
  const m = /```json\s*\n([\s\S]*?)\n```/.exec(md);
  if (!m) return { ...DEFAULT_BRAND, _source: "defaults (no json block)" };
  const b = JSON.parse(m[1]);
  return { ...DEFAULT_BRAND, ...b, captions: { ...DEFAULT_BRAND.captions, ...(b.captions ?? {}) }, _source: path };
}
