#!/usr/bin/env node
// Final Instagram Reels encode (SPEC §9) + check-reel.
//
//   node scripts/ru/export-reel.mjs <in.mp4> <out.mp4> [--fps 30] [--lufs -14] [--preview] [--no-check] [--audio mix.wav]
//
// - 1080x1920 (scaled to fit and padded on black if the input is another shape)
// - frame rate kept as the input's (or --fps); never upsampled
// - H.264 High, CRF 18, yuv420p, limited range, BT.709 tags via setparams
//   (ffmpeg 8 ignores -color_primaries/-color_trc on untagged input otherwise)
// - AAC 48 kHz 160 kb/s; a silent track is added when the input has no audio
// - loudness: two-pass loudnorm to -14 LUFS integrated, -1.5 dBTP, LRA 11
// - +faststart
// --preview: 540x960, CRF 26, one-pass loudnorm — for the ГЕЙТ C review copy.
// --audio:   replace the soundtrack (scripts/ru/fx/sound.py variants) without re-rendering the picture.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReel } from "./check-reel.mjs";

function probe(path) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", path], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  const s = JSON.parse(r.stdout).streams;
  const v = s.find((x) => x.codec_type === "video");
  const [n, d] = String(v?.avg_frame_rate ?? "30/1").split("/").map(Number);
  return { hasAudio: s.some((x) => x.codec_type === "audio"), fps: d ? n / d : n, fpsRational: v?.avg_frame_rate ?? "30/1" };
}

export function measureLoudness(input, { lufs = -14, tp = -1.5, lra = 11 } = {}) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-map", "0:a:0", "-af", `loudnorm=I=${lufs}:TP=${tp}:LRA=${lra}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  const m = /\{[\s\S]*?"input_i"[\s\S]*?\}/.exec(r.stderr ?? "");
  if (!m) throw new Error("loudnorm analysis failed");
  return JSON.parse(m[0]);
}

export function exportReel(input, output, { fps, lufs = -14, preview = false, check = true, audio } = {}) {
  input = resolve(input);
  output = resolve(output);
  const p = probe(input);
  if (audio) { audio = resolve(audio); p.hasAudio = true; }
  const aIn = audio ?? input;
  const W = preview ? 540 : 1080, H = preview ? 960 : 1920;
  const rate = fps ? String(fps) : p.fpsRational;
  const vf = [
    `scale=${W}:${H}:force_original_aspect_ratio=decrease:out_color_matrix=bt709:out_range=tv`,
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "setsar=1",
    `fps=${rate}`,
    "format=yuv420p",
    "setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709",
  ].join(",");

  let af;
  let loud = null;
  if (p.hasAudio) {
    if (preview) af = `loudnorm=I=${lufs}:TP=-1.5:LRA=11`;
    else {
      loud = measureLoudness(aIn, { lufs });
      af = `loudnorm=I=${lufs}:TP=-1.5:LRA=11:measured_I=${loud.input_i}:measured_TP=${loud.input_tp}:measured_LRA=${loud.input_lra}:measured_thresh=${loud.input_thresh}:offset=${loud.target_offset}:linear=true`;
    }
    af += ",aresample=48000";
  }
  const args = ["-v", "error", "-y", "-i", input];
  if (audio) args.push("-i", audio);
  else if (!p.hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  args.push("-map", "0:v:0", "-map", audio || !p.hasAudio ? "1:a:0" : "0:a:0", "-vf", vf);
  if (af) args.push("-af", af);
  args.push(
    "-c:v", "libx264", "-profile:v", "high", "-preset", preview ? "veryfast" : "slow", "-crf", preview ? "26" : "18",
    "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-shortest", "-movflags", "+faststart", output,
  );
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg export failed: ${r.stderr.slice(-800)}`);
  const result = { output, preview, loudness_in: loud ? Number(loud.input_i) : null };
  if (check && !preview) result.check = checkReel(output, { fps: fps ?? p.fps, lufs });
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a.length < 2 || a.includes("--help")) {
    console.log("Usage: node scripts/ru/export-reel.mjs <in.mp4> <out.mp4> [--fps 30] [--lufs -14] [--preview] [--no-check] [--audio mix.wav]");
    process.exit(a.length < 2 ? 1 : 0);
  }
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const r = exportReel(a[0], a[1], { fps: get("--fps"), lufs: get("--lufs") ? Number(get("--lufs")) : -14, preview: a.includes("--preview"), check: !a.includes("--no-check"), audio: get("--audio") });
  console.log(`wrote ${r.output}${r.loudness_in !== null ? ` (input ${r.loudness_in} LUFS)` : ""}`);
  if (r.check) {
    for (const x of r.check.results) console.log(`${x.status.padEnd(4)}  ${x.item}${x.detail !== undefined ? ` — ${x.detail}` : ""}`);
    console.log(r.check.ok ? "RESULT: PASS" : "RESULT: FAIL");
    process.exitCode = r.check.ok ? 0 : 1;
  }
}
