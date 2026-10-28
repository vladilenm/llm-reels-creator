// Drawing kit for full-stage illustrations of the `figure` card (style 03-vladilen-stage): an svg of 1568×760 (the media
// area of the card), colors from tokens.css, the style's own line icons, Golos captions. A project script imports it:
//
//   import { svg, text, icon, arrow, pill, C, writeIllustrations } from "../../scripts/long/lib/ill.mjs";
//   writeIllustrations(new URL("./assets/ill/", import.meta.url), { team: svg(pill(…) + icon("agent", …) + text(…)) });
//
// The card draws every stroked shape on, fades fills in after the lines and shows <text> after them, so keep shapes as
// plain paths, circles and rects. One accent part (C.acc), lines 3–6 px, captions 28 px and up, nothing important
// within 40 px of an edge.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STYLE = new URL("../../../style-library/03-vladilen-stage/", import.meta.url);
export const W = 1568, H = 760;

const tokens = readFileSync(new URL("tokens.css", STYLE), "utf8");
const tok = (name) => {
  const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`tokens.css has no color --${name}`);
  return m[1];
};
// ink, muted and sub are the three text tones; line and strong the two line tones; surf, sunk and bg the fills; acc and
// soft the accent and its soft fill
export const C = {
  ink: tok("ink"), muted: tok("ink-muted"), sub: tok("ink-subtle"), line: tok("line"), strong: tok("line-strong"),
  surf: tok("surface"), sunk: tok("surface-sunken"), bg: tok("bg"), acc: tok("accent"), soft: tok("accent-soft"),
};

const iconsSrc = readFileSync(new URL("icons/icons.js", STYLE), "utf8");
const a0 = iconsSrc.indexOf("window.STAGE_ICONS = ") + "window.STAGE_ICONS = ".length;
export const ICONS = JSON.parse(iconsSrc.slice(a0, iconsSrc.indexOf("};", a0) + 1));

export const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const st = (color = C.ink, w = 3) => `stroke="${color}" stroke-width="${w}"`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const text = (x, y, s, { size = 34, color = C.muted, anchor = "middle", weight = 400, family = "Golos Text" } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" stroke="none">${esc(s)}</text>`;

// a line icon of the style with its top-left corner at (x, y), `size` px, lines of `w` px; its accent part in `accent`
export const icon = (name, x, y, size, color = C.ink, w = 4, accent = C.acc) => {
  if (!ICONS[name]) throw new Error(`no icon "${name}" (have ${Object.keys(ICONS).join(", ")})`);
  const k = size / 24;
  const parts = ICONS[name].join("").replace(/class='a'/g, `stroke='${accent}'`);
  return `<g transform="translate(${x},${y}) scale(${k})" stroke="${color}" stroke-width="${w / k}">${parts}</g>`;
};

export const arrow = (x1, y1, x2, y2, color = C.strong, w = 3) => {
  const ang = Math.atan2(y2 - y1, x2 - x1), h = 16;
  const p = (a) => `${x2 - h * Math.cos(ang - a)},${y2 - h * Math.sin(ang - a)}`;
  return `<path d="M${x1},${y1} L${x2},${y2}" ${st(color, w)}/><path d="M${p(0.45)} L${x2},${y2} L${p(-0.45)}" ${st(color, w)}/>`;
};

export const pill = (x, y, w, h, color = C.line, fill = C.surf, r = 20) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${st(color, 3)}/>`;

// writes <dir>/<name>.svg for every entry and returns the names
export function writeIllustrations(dir, out) {
  const path = dir instanceof URL ? fileURLToPath(dir) : dir;
  mkdirSync(path, { recursive: true });
  for (const [name, s] of Object.entries(out)) writeFileSync(`${path.replace(/\/$/, "")}/${name}.svg`, s + "\n");
  return Object.keys(out);
}
