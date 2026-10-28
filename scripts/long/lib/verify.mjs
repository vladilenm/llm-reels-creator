// Checks the assembled video by looking at its frames, not at the logs: the face really is full-frame where
// FACE.json says so, the dock really shows the crop of the take, the stage is the bare stage, the cut is exactly
// on the frame, a card is really on screen, the audio and the length survived.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fitCrop } from "./filter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sharp = (...a) => createRequire(join(ROOT, "package.json"))("sharp")(...a);

// One frame at time t through a filter chain, as raw rgb24.
export function grab(file, t, vf) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(Math.max(0, t)), "-i", file, "-frames:v", "1", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 28 });
  if (r.status !== 0 || !r.stdout.length) throw new Error(`could not read a frame at ${t} s of ${file}: ${r.stderr}`);
  return r.stdout;
}

export function psnr(a, b) {
  if (a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  const mse = s / a.length;
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

export function meanRgb(buf) {
  const m = [0, 0, 0];
  for (let i = 0; i < buf.length; i += 3) { m[0] += buf[i]; m[1] += buf[i + 1]; m[2] += buf[i + 2]; }
  return m.map((x) => x / (buf.length / 3));
}

export const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export function meanAbsDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

export async function stillRegion(png, x, y, w, h) {
  return sharp(png).extract({ left: x, top: y, width: w, height: h }).removeAlpha().raw().toBuffer();
}

export function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate,r_frame_rate,duration:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === "video");
  const [n, d] = (v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v.r_frame_rate).split("/").map(Number);
  return { w: v.width, h: v.height, fps: n / d, duration: Number(j.format.duration), hasAudio: j.streams.some((s) => s.codec_type === "audio") };
}

// A standard rate close to the measured one (29.97 → 30), else the measured value.
export function snapFps(fps) {
  for (const s of [24, 25, 30, 48, 50, 60]) if (Math.abs(fps - s) < 0.06 * s / 24 + 0.05) return s;
  return Math.round(fps * 100) / 100;
}

export async function verifyStage({ out, take, takeInfo, face, cards, stagePng, layout, dockCrop, fps, totalFrames, relax = 0, bg }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const o = probe(out);
  add("length", Math.abs(o.duration - takeInfo.duration) < 0.15, `${o.duration.toFixed(2)} s against ${takeInfo.duration.toFixed(2)} s of the take`);
  add("audio", o.hasAudio === takeInfo.hasAudio, o.hasAudio ? "present" : "missing");
  const { w: ow, h: oh } = o;
  const scaleBack = `scale=${layout.frame.w}:${layout.frame.h}`;
  const segs = face.segments;
  const pick = (state, n) => {
    const list = segs.filter((s) => s.state === state && s.end - s.start > 0.6);
    return [list[0], list[Math.floor(list.length / 2)], list.at(-1)].filter((x, i, a) => x && a.indexOf(x) === i).slice(0, n);
  };
  // ffmpeg -ss returns the first frame whose pts is at or after the time: aim a quarter frame before frame k's own pts
  const frameAt = (k) => (k - 0.25) / fps;
  const bgRgb = hexRgb(bg);
  const farFromBg = (buf) => Math.max(...meanRgb(buf).map((x, i) => Math.abs(x - bgRgb[i])));
  const smallOut = (t) => grab(out, t, `${scaleBack},scale=480:270`);
  const smallTake = (t) => grab(take, t, "scale=480:270");
  for (const s of pick("full", 3)) {
    const t = frameAt(Math.round(((s.start + s.end) / 2) * fps));
    const p = psnr(smallOut(t), smallTake(t));
    add(`full-frame face at ${t.toFixed(2)} s`, p >= 28 - relax, `PSNR ${p.toFixed(1)} dB against the take`);
  }
  const stageCorner = await stillRegion(stagePng, 0, 0, 96, 96);
  add("bare stage image", farFromBg(stageCorner) <= 16, `its corner is ${meanRgb(stageCorner).map((x) => x.toFixed(0)).join(",")}, the --bg token is ${bgRgb.join(",")}`);
  const dock = layout.dock;
  const crop = fitCrop(dockCrop, takeInfo.w, takeInfo.h, dock.w / dock.h);
  const inner = { x: 40, y: 40, w: dock.w - 48, h: dock.h - 80 };
  for (const s of pick("dock", 3)) {
    const t = frameAt(Math.round(((s.start + s.end) / 2) * fps));
    const c = farFromBg(grab(out, t, `${scaleBack},crop=96:96:0:0`));
    add(`stage at ${t.toFixed(2)} s (dock)`, c <= 18, `the top-left corner is ${c.toFixed(1)} of 255 away from the --bg color`);
    const got = grab(out, t, `${scaleBack},crop=${inner.w}:${inner.h}:${dock.x + inner.x}:${dock.y + inner.y}`);
    const want = grab(take, t, `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${dock.w}:${dock.h},crop=${inner.w}:${inner.h}:${inner.x}:${inner.y}`);
    const p = psnr(got, want);
    add(`dock shows the crop at ${t.toFixed(2)} s`, p >= 24 - relax, `PSNR ${p.toFixed(1)} dB against the cropped take`);
  }
  // the first hard cut from the dock to the full-frame face: the last stage frame, then the take, on exact frames
  const cut = segs.slice(1).find((s, i) => s.state === "full" && segs[i].state === "dock");
  if (cut) {
    const k = Math.round(cut.start * fps);
    const before = grab(out, frameAt(k - 1), `${scaleBack},crop=96:96:0:0`);
    const after = grab(out, frameAt(k), `${scaleBack},scale=480:270`);
    const p = psnr(after, smallTake(frameAt(k)));
    add(`hard cut at frame ${k}`, farFromBg(before) <= 18 && p >= 28 - relax, `frame ${k - 1} is the stage, frame ${k} matches the take (PSNR ${p.toFixed(1)} dB)`);
  }
  // each sampled card is really on screen: its work area differs from the bare stage while it holds
  const wa = layout.content;
  const stageWork = await stillRegion(stagePng, wa.x, wa.y, wa.w, wa.h);
  const shown = cards.filter((c) => c.duration > 1.5);
  for (const c of [shown[0], shown[Math.floor(shown.length / 2)], shown.at(-1)].filter((x, i, a) => x && a.indexOf(x) === i)) {
    const t = frameAt(Math.round((c.start + c.duration - 1.0) * fps));
    const hidden = segs.some((s) => s.state === "full" && s.start <= t && t < s.end);
    if (hidden) continue;
    const d = meanAbsDiff(grab(out, t, `${scaleBack},crop=${wa.w}:${wa.h}:${wa.x}:${wa.y}`), stageWork);
    add(`card ${c.id} on screen at ${t.toFixed(2)} s`, d >= 2, `the work area differs from the bare stage by ${d.toFixed(2)} of 255`);
  }
  return checks;
}
