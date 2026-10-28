// The ffmpeg filter graph of the stage: a pure function of the face plan, the card windows and the geometry.
//
// Layers, bottom to top: the take (shown as is where the face is full-frame), the still stage, the dock (shadow,
// the crop of the take with rounded left corners, a border), the cards. Every cut is a one-frame hard cut: a
// window is a half-open range of frames [k0, k1) written as gte(t,(k0-0.5)/fps)*lt(t,(k1-0.5)/fps). The half
// frame keeps the comparison away from floating-point noise, so a boundary never hits two frames or none.

const f6 = (x) => (Math.round(x * 1e6) / 1e6).toString();

// Frame windows [k0, k1) per state; contiguous from 0 to totalFrames.
export function frameWindows(segments, fps, totalFrames) {
  const out = { full: [], dock: [], none: [] };
  segments.forEach((s, i) => {
    const k0 = i === 0 ? 0 : Math.round(s.start * fps);
    const k1 = i === segments.length - 1 ? totalFrames : Math.round(s.end * fps);
    if (k1 > k0) (out[s.state] ??= []).push([k0, k1]);
  });
  for (const k of Object.keys(out)) out[k] = merge(out[k]);
  out.nonFull = merge([...out.dock, ...out.none]);
  return out;
}

export function merge(w) {
  const sorted = [...w].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of sorted) {
    if (out.length && a <= out.at(-1)[1]) out.at(-1)[1] = Math.max(out.at(-1)[1], b);
    else out.push([a, b]);
  }
  return out;
}

export function intersect(a, b) {
  const out = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) { const k0 = Math.max(a0, b0), k1 = Math.min(a1, b1); if (k1 > k0) out.push([k0, k1]); }
  return merge(out);
}

// enable='…' expression for a list of frame windows; true for frame k exactly when k lies in a window.
export function enableExpr(windows, fps) {
  if (!windows.length) return "0";
  return windows.map(([k0, k1]) => `gte(t,${f6((k0 - 0.5) / fps)})*lt(t,${f6((k1 - 0.5) / fps)})`).join("+");
}

// Mirror of enableExpr for tests: would ffmpeg enable the overlay at frame k?
export function frameEnabled(windows, k) {
  return windows.some(([k0, k1]) => k >= k0 && k < k1);
}

// The dock crop in source pixels: the normalized crop of FACE.json, forced to the dock's aspect and to even numbers.
export function fitCrop(crop, W, H, aspect = 2 / 3) {
  let ch = Math.round(crop.h * H), cw = Math.round(crop.w * W);
  if (cw / ch > aspect) cw = Math.round(ch * aspect); else ch = Math.round(cw / aspect);
  cw = Math.max(2, cw - (cw % 2)); ch = Math.max(2, ch - (ch % 2));
  const cx = Math.min(Math.max(0, Math.round(crop.x * W + (crop.w * W - cw) / 2)), W - cw);
  const cy = Math.min(Math.max(0, Math.round(crop.y * H + (crop.h * H - ch) / 2)), H - ch);
  return { x: cx - (cx % 2), y: cy - (cy % 2), w: cw, h: ch };
}

// inputs: indexes of the -i arguments: { take: 0, stage, shadow, mask, border } and cards [{ index, startFrame, endFrame }]
export function buildStageGraph({ fps, totalFrames, takeSize, layout, dockCrop, segments, cards, inputs, out }) {
  const win = frameWindows(segments, fps, totalFrames);
  const dock = layout.dock;
  const crop = fitCrop(dockCrop, takeSize.w, takeSize.h, dock.w / dock.h);
  const frame = layout.frame;
  const dockOn = enableExpr(win.dock, fps);
  const f = [];
  f.push(`[${inputs.take}:v]fps=${fps},setsar=1,split=2[a][b]`);
  f.push(`[a]scale=${frame.w}:${frame.h}:flags=bicubic,format=yuv420p[base]`);
  f.push(`[b]crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${dock.w}:${dock.h}:flags=bicubic,format=yuva444p[dk]`);
  f.push(`[${inputs.mask}:v]format=gray,scale=${dock.w}:${dock.h}[mk]`);
  f.push(`[dk][mk]alphamerge[dock]`);
  f.push(`[${inputs.stage}:v]format=yuv420p,setsar=1[st]`);
  f.push(`[base][st]overlay=0:0:enable='${enableExpr(win.nonFull, fps)}':format=yuv420[l1]`);
  f.push(`[${inputs.shadow}:v]format=yuva420p[sh]`);
  f.push(`[l1][sh]overlay=0:0:enable='${dockOn}':format=yuv420[l2]`);
  f.push(`[l2][dock]overlay=${dock.x}:${dock.y}:enable='${dockOn}':format=yuv420[l3]`);
  f.push(`[${inputs.border}:v]format=yuva420p[bd]`);
  f.push(`[l3][bd]overlay=0:0:enable='${dockOn}':format=yuv420[l4]`);
  let last = "l4";
  cards.forEach((c, k) => {
    const when = intersect([[c.startFrame, c.endFrame]], win.nonFull);
    f.push(`[${c.index}:v]setpts=PTS-STARTPTS+${f6(c.startFrame / fps)}/TB,format=yuva444p[c${k}]`);
    f.push(`[${last}][c${k}]overlay=0:0:enable='${enableExpr(when, fps)}':eof_action=pass:format=yuv420[m${k}]`);
    last = `m${k}`;
  });
  f.push(`[${last}]scale=${out.w}:${out.h}:flags=bicubic,format=yuv420p[out]`);
  return { graph: f.join(";\n"), crop, windows: win };
}
