// Still assets of the stage, made once per project from the style's own CSS and geometry:
//   stage.png        the bare stage (base, glow, grid), rendered by Chrome from tokens.css and stage.css
//   dock-mask.png    white where the face shows: the dock's rounded left corners
//   dock-shadow.png  the soft shadow under the dock (elevation shadow-3 of the design system)
//   dock-border.png  the 2 px line round the dock, open at the screen edge
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sharp = (...a) => createRequire(join(ROOT, "package.json"))("sharp")(...a);

function token(css, name, fallback) {
  const m = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : fallback;
}

export async function makeStageAssets({ browser, style, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const css = readFileSync(join(style.dir, "tokens.css"), "utf8");
  const { frame, dock } = style.manifest.layout;
  const r = dock.radiusLeft, sw = dock.stroke;
  const line = token(css, "--line", "#2B2537");
  const sh = (token(css, "--shadow-3", "0 32px 80px rgba(0, 0, 0, 0.55)").match(/(-?\d+)px\s+(-?\d+)px\s+(\d+)px\s+rgba\(([^)]+)\)/) ?? []);
  const [, , offY = 32, blur = 80, rgba = "0, 0, 0, 0.55"] = sh;
  const [sr, sg, sb, sa] = rgba.split(",").map((x) => parseFloat(x));

  // 1. the bare stage, from the same CSS the cards use
  const page = await browser.newPage();
  await page.setViewport({ width: frame.w, height: frame.h, deviceScaleFactor: 1 });
  const dirStage = join(style.dir, "cards/stage");
  // a file:// page: an about:blank page may not load file:// stylesheets and would render a white stage
  const bare = join(outDir, "stage-bare.html");
  writeFileSync(bare, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(join(style.dir, "tokens.css")).href}"><link rel="stylesheet" href="${pathToFileURL(join(dirStage, "stage.css")).href}"></head><body><div class="stage"><div class="glow"></div><div class="grid"></div></div></body></html>`);
  await page.goto(pathToFileURL(bare).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(outDir, "stage.png"), type: "png" });
  await page.close();

  // 2. dock geometry: the left side rounded, the right side flush with the frame edge
  const { x, y, w, h } = dock;
  const outline = `M${w},0 H${r} A${r},${r} 0 0 0 0,${r} V${h - r} A${r},${r} 0 0 0 ${r},${h} H${w} Z`;
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="black"/><path d="${outline}" fill="white"/></svg>`)).png().toFile(join(outDir, "dock-mask.png"));
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${frame.w}" height="${frame.h}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur / 2}"/></filter></defs><g transform="translate(${x},${y + Number(offY)})" filter="url(#b)"><path d="${outline}" fill="rgb(${sr},${sg},${sb})" fill-opacity="${sa}"/></g></svg>`)).png().toFile(join(outDir, "dock-shadow.png"));
  const half = sw / 2;
  const ring = `M${frame.w},${y + half} H${x + r} A${r - half},${r - half} 0 0 0 ${x + half},${y + r} V${y + h - r} A${r - half},${r - half} 0 0 0 ${x + r},${y + h - half} H${frame.w}`;
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${frame.w}" height="${frame.h}"><path d="${ring}" fill="none" stroke="${line}" stroke-width="${sw}"/></svg>`)).png().toFile(join(outDir, "dock-border.png"));
  return { stage: join(outDir, "stage.png"), mask: join(outDir, "dock-mask.png"), shadow: join(outDir, "dock-shadow.png"), border: join(outDir, "dock-border.png") };
}
