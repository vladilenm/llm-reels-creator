// A 16:9 contact sheet of the assembled video for the human gate. scripts/ru/contact-sheet.mjs is made for vertical
// reels (it forces a 9:16 tile and would stretch 16:9 frames), so the stage has its own.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sharp = (...a) => createRequire(join(ROOT, "package.json"))("sharp")(...a);

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

function frame(file, t, w, h) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(Math.max(0, t)), "-i", file, "-frames:v", "1", "-vf", `scale=${w}:${h}`, "-f", "image2pipe", "-c:v", "png", "-"], { maxBuffer: 1 << 27 });
  return r.status === 0 && r.stdout.length ? r.stdout : null;
}

// times: seconds; written as <out>-01.png, <out>-02.png … with `perSheet` tiles each (4 columns).
export async function reviewSheets({ video, times, fps, out, tile = { w: 480, h: 270 }, perSheet = 16, cols = 4 }) {
  const files = [];
  for (let s = 0; s * perSheet < times.length; s++) {
    const group = times.slice(s * perSheet, (s + 1) * perSheet);
    const rows = Math.ceil(group.length / cols);
    const bar = 26;
    const composites = [];
    for (const [i, t] of group.entries()) {
      const png = frame(video, t - 0.25 / fps, tile.w, tile.h);
      if (!png) continue;
      const left = (i % cols) * tile.w, top = Math.floor(i / cols) * (tile.h + bar);
      const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tile.w}" height="${bar}"><rect width="${tile.w}" height="${bar}" fill="#000"/><text x="8" y="18" font-family="monospace" font-size="15" fill="#fff">${fmt(t)}  frame ${Math.round(t * fps)}</text></svg>`);
      composites.push({ input: png, left, top }, { input: label, left, top: top + tile.h });
    }
    const file = `${out}-${String(s + 1).padStart(2, "0")}.png`;
    await sharp({ create: { width: cols * tile.w, height: rows * (tile.h + bar), channels: 3, background: "#111" } }).composite(composites).png().toFile(file);
    files.push(file);
  }
  return files;
}
