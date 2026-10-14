#!/usr/bin/env node
// Instagram Reels delivery check (SPEC §9). PASS/FAIL per item, exit 1 on any FAIL.
//
//   node scripts/ru/check-reel.mjs <final.mp4> [--fps 30 | --source raw.mov] [--lufs -14] [--tolerance 1] [--json]
//
// Checks: H.264 High, yuv420p, limited range (tv), BT.709 (matrix/primaries/
// transfer), 1080x1920, fps equal to the source, AAC 48 kHz audio present,
// audio bitrate 128–192 kb/s, +faststart (moov before mdat), integrated loudness
// near the target (ebur128) and true peak. A silent track is valid for a reel
// without sound; loudness is then reported as WARN, not FAIL.
// Safe zones are not checked here — that is S6's contact-sheet review.

import { spawnSync } from "node:child_process";
import { openSync, readSync, closeSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function ffprobe(path) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${path}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const rate = (s) => { if (!s) return NaN; const [a, b] = s.split("/").map(Number); return b ? a / b : a; };

export function topLevelAtoms(path) {
  const fd = openSync(path, "r");
  const size = statSync(path).size;
  const atoms = [];
  const buf = Buffer.alloc(16);
  let pos = 0;
  try {
    while (pos + 8 <= size && atoms.length < 64) {
      readSync(fd, buf, 0, 16, pos);
      let len = buf.readUInt32BE(0);
      const type = buf.toString("latin1", 4, 8);
      if (len === 1) len = Number(buf.readBigUInt64BE(8));
      else if (len === 0) len = size - pos;
      if (len < 8) break;
      atoms.push(type);
      pos += len;
    }
  } finally { closeSync(fd); }
  return atoms;
}

export function loudness(path) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  const s = r.stderr ?? "";
  const summary = s.slice(s.lastIndexOf("Summary:"));
  const I = Number(/I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(summary)?.[1]);
  const peak = Number(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(summary)?.[1]);
  return { integrated: Number.isFinite(I) ? I : -Infinity, truePeak: Number.isFinite(peak) ? peak : -Infinity };
}

export function checkReel(path, { fps, source, lufs = -14, tolerance = 1 } = {}) {
  const info = ffprobe(path);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  const results = [];
  const add = (item, status, detail) => results.push({ item, status, detail });
  const pass = (item, ok, detail) => add(item, ok ? "PASS" : "FAIL", detail);

  if (!v) { add("video stream", "FAIL", "none"); return { ok: false, results }; }
  pass("codec H.264", v.codec_name === "h264", v.codec_name);
  pass("profile High", /^High$/i.test(v.profile ?? ""), v.profile);
  pass("pix_fmt yuv420p", v.pix_fmt === "yuv420p", v.pix_fmt);
  pass("color range limited (tv)", v.color_range === "tv", v.color_range ?? "unset");
  pass("colorspace bt709", v.color_space === "bt709", v.color_space ?? "unset");
  pass("primaries bt709", v.color_primaries === "bt709", v.color_primaries ?? "unset");
  pass("transfer bt709", v.color_transfer === "bt709", v.color_transfer ?? "unset");
  pass("resolution 1080x1920", v.width === 1080 && v.height === 1920, `${v.width}x${v.height}`);

  const got = rate(v.avg_frame_rate) || rate(v.r_frame_rate);
  let want = Number(fps);
  if (!Number.isFinite(want) && source) {
    const sv = ffprobe(source).streams.find((s) => s.codec_type === "video");
    want = rate(sv?.avg_frame_rate) || rate(sv?.r_frame_rate);
  }
  if (!Number.isFinite(want)) want = 30;
  pass(`fps = ${+want.toFixed(3)}`, Math.abs(got - want) < 0.01, `${+got.toFixed(3)}`);

  if (!a) add("audio stream", "FAIL", "none (add a silent AAC track)");
  else {
    pass("audio AAC", a.codec_name === "aac", a.codec_name);
    pass("audio 48 kHz", Number(a.sample_rate) === 48000, a.sample_rate);
    const kbps = Number(a.bit_rate) / 1000;
    if (Number.isFinite(kbps)) add("audio bitrate 128–192 kb/s", kbps >= 120 && kbps <= 200 ? "PASS" : "WARN", `${Math.round(kbps)} kb/s`);
    const L = loudness(path);
    if (L.integrated < -60) add("loudness", "WARN", "silent track (valid only for a reel without sound)");
    else {
      pass(`loudness ${lufs}±${tolerance} LUFS`, Math.abs(L.integrated - lufs) <= tolerance, `${L.integrated.toFixed(1)} LUFS`);
      add("true peak ≤ -1 dBTP", L.truePeak <= -1 ? "PASS" : "WARN", `${L.truePeak.toFixed(1)} dBTP`);
    }
  }

  const atoms = topLevelAtoms(path);
  const moov = atoms.indexOf("moov"), mdat = atoms.indexOf("mdat");
  pass("faststart (moov before mdat)", moov >= 0 && (mdat < 0 || moov < mdat), atoms.join(","));

  const dur = Number(info.format.duration);
  add("duration", "INFO", `${dur.toFixed(2)}s`);
  return { ok: results.every((r) => r.status !== "FAIL"), results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (!a.length || a.includes("--help")) {
    console.log("Usage: node scripts/ru/check-reel.mjs <final.mp4> [--fps 30 | --source raw.mov] [--lufs -14] [--tolerance 1] [--json]");
    process.exit(a.length ? 0 : 1);
  }
  const o = {};
  let file = null, json = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--json") json = true;
    else if (a[i].startsWith("--")) o[a[i].slice(2)] = a[++i];
    else file = a[i];
  }
  const r = checkReel(resolve(file), { fps: o.fps, source: o.source && resolve(o.source), lufs: o.lufs ? Number(o.lufs) : undefined, tolerance: o.tolerance ? Number(o.tolerance) : undefined });
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    for (const x of r.results) console.log(`${x.status.padEnd(4)}  ${x.item}${x.detail !== undefined ? ` — ${x.detail}` : ""}`);
    console.log(r.ok ? "RESULT: PASS" : "RESULT: FAIL");
  }
  process.exitCode = r.ok ? 0 : 1;
}
