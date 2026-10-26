/* Reels Studio object scenes (night look, design 2026-10-26): objects from object-kit.js placed in the frame and
   moved by verbs; every style is a pure function of t (engine contract). Built by scripts/ru/broll/build.py.

   OK.run({
     T, mode:'panel'|'full', theme:'night'|'light',
     bg:{zoom:[t, dur, to], flip:[t, dur]},    full mode only. night: grid + glow, zoom = the grid flies into depth
                                                and the glow flares. light: canvas + faint grid; flip = it wipes in
                                                from the left over the night
     chapter:{idx, l1, l2, y:200, tin, keys:[[t, {idx, l1, l2}]]},     «глава»: stays, the text swaps on keys
     items:[{id, kind, x, y, size, tin, tout, label:{text, tin, dy:44}, states:[[t, {open:1}, dur]], active:[[t, 0|1]],
             check:t, ghost:true, keys:[[t, {x, y, size}, dur:0.7]]}],   «материализация», «активный пункт»,
                                                                     «перестройка» (keys move and resize, tout leaves)
     callouts:[{at:'id'|[x, y], text, t, dx:170, dy:-90, tout}],      «выноски»: a dotted elbow to a glass label
     returns:{to, from:[ids], t, gap:0.12, dur:0.5, bend:0.25, tout},  «возврат»: arrows back to the first item
     drops:[{into:'id'|[x, y], kind:'document', n:1, t, gap:0.22, size:70, from:-320|[x, y]}],   «физика предмета»
     morph:{from, t, dur:0.8, x:540, y, w:760, dots:[{at:0..1, t, on}], head:{t0, t1}},          «морф значка»
     prompt:{x:540, y, w:840, text, t, dur:0.9, send, reply:{t, text}, tout},                      «строка ввода»
     assemble:{rect:[x, y, w, h], t, dur:0.8, then:'id'},      «сборка из сетки» (full mode only: cells match the clip's grid)
     links:[{from, to, tin, dur:0.5, dash:false}],                    «дерево и связи»: an elbow from → to
     fly:{id, t, dur:0.4},                                            «сквозной пролёт» into an item
     words:[{text, font:'display'|'serif'|'sans'|'mono', size, y, x:540, t, color}],   accent words: a wipe
     line:{y, t, w:520},                                              the glowing line under the words
     counter:{t, to, label, y, dur:1.2},
     terminal:{x, y, w, h, title, tin:-1, lines:[{t, text, kind:'cmd'|'out'|'ok', dur:0.55}]},   «живой интерфейс»
   })
   OK.gridCells(parent, rect, {t, dur, step:84, ox:52, oy:52, drift:0, color, id:'ok-cells'}) → {el, draw(t)}: the grid's
   cells whose centre lies inside rect (at least the one under its centre) light in a sweep from the centre and fade
   (screen-kit win.enter:'grid' uses it too). The night grid starts at 52, the light grid at 0: pass ox, oy to match.
   Items: x, y = frame px of the object's floor centre, size = drawn width. DOM ids (tests, debugging): ok-scene,
   ok-item-<id>, ok-label-<id>, ok-check-<id>, ok-link-<n>, ok-idx, ok-flip, ok-grid, ok-count, ok-term, ok-row-<n>,
   ok-co-<n>, ok-co-line-<n>, ok-ret-<n>, ok-ret-head-<n>, ok-drop-<n>-<j>, ok-tl, ok-tl-dot-<i>, ok-tl-head, ok-prompt,
   ok-prompt-text, ok-prompt-send, ok-prompt-reply, ok-cells. */
(function(){
const OK = window.OK;
const {clamp, eo, eio} = M;
const ex = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));     // expo-out: the long brake of the night look
const W = 1080, H = 1920, NS = 'http://www.w3.org/2000/svg';
const fontOf = (kind, size) => ({display: `800 ${size}px 'SK Display','SK Serif',serif`, serif: `italic 600 ${size}px 'SK Serif',serif`,
  sans: `700 ${size}px 'SK Sans',sans-serif`, mono: `500 ${size}px 'SK Mono',monospace`})[kind || 'sans'];
const mix = (a, b, u) => { const A = M.hex(a), B = M.hex(b); return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * clamp(u))).join(',')})`; };
const groups = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const wipe = (u, pad = '-20%') => `inset(${pad} ${(100 - 100 * u).toFixed(2)}% ${pad} 0)`;

// «сборка из сетки»: the cells of the background grid whose centre lies inside rect light up in a sweep from its centre,
// then fade; a rect too small to hold a centre keeps the one cell under its centre. Cells sit on the clip grid (night: OK
// and SK grids start at −200 px, lines at 52 + 84·n; light: lines at 84·n, pass ox/oy 0), drift follows a drifting grid.
OK.gridCells = (parent, rect, o = {}) => {
  const step = o.step ?? 84, ox = o.ox ?? 52, oy = o.oy ?? 52, [rx, ry, rw, rh] = rect, color = o.color || '183,156,255';
  const box = document.createElement('div'); box.id = o.id || 'ok-cells';
  Object.assign(box.style, {position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', pointerEvents: 'none'});
  parent.appendChild(box);
  const cells = [], cx = rx + rw / 2, cy = ry + rh / 2, R = Math.hypot(rw / 2, rh / 2) || 1, spots = [];
  for (let gx = ox + Math.floor((rx - ox) / step) * step; gx < rx + rw; gx += step)
    for (let gy = oy + Math.floor((ry - oy) / step) * step; gy < ry + rh; gy += step) {
      const mx = gx + step / 2, my = gy + step / 2;
      if (mx >= rx && mx < rx + rw && my >= ry && my < ry + rh) spots.push([gx, gy]);     // a 4 px overlap does not light a whole column
    }
  const lone = !spots.length;
  if (lone) spots.push([ox + Math.floor((cx - ox) / step) * step, oy + Math.floor((cy - oy) / step) * step]);
  for (const [gx, gy] of spots) {
    const e = document.createElement('div');
    Object.assign(e.style, {position: 'absolute', left: (gx + 2) + 'px', top: (gy + 2) + 'px', width: (step - 2) + 'px', height: (step - 2) + 'px',
      background: `rgba(${color},.34)`, boxShadow: `0 0 18px rgba(${color},.45)`, opacity: '0'});
    box.appendChild(e);
    cells.push({e, d: lone ? 0 : Math.hypot(gx + step / 2 - cx, gy + step / 2 - cy) / R});     // a lone cell is the centre: it lights first
  }
  const dur = o.dur ?? 0.8;
  return {el: box, draw: (t) => {
    const a = (t - o.t) / dur, live = a >= 0 && a <= 1.05;
    box.style.display = live ? '' : 'none';
    box.style.transform = `translateY(${(-(o.drift ?? 0) * t).toFixed(1)}px)`;
    for (const c of cells) c.e.style.opacity = live ? (ex((a - c.d * 0.45) / 0.18) * (1 - clamp((a - 0.6) / 0.4))).toFixed(3) : '0';
  }};
};

OK.run = (cfg) => {
  const T = cfg.T, theme = cfg.theme || 'night', TH = OK.THEMES[theme], full = cfg.mode === 'full';
  const st = document.createElement('style');
  st.textContent = OK.css('night') + OK.css('light') + `
#ok{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:5;overflow:hidden}
#ok .a{position:absolute}
#ok .okgrid{background-image:linear-gradient(rgba(183,156,255,.10) 2px,transparent 2px),linear-gradient(90deg,rgba(183,156,255,.10) 2px,transparent 2px);background-size:84px 84px}
#ok .okgrid.lt{background-image:linear-gradient(rgba(23,20,28,.06) 2px,transparent 2px),linear-gradient(90deg,rgba(23,20,28,.06) 2px,transparent 2px)}
#ok .oklb{transform:translateX(-50%);white-space:nowrap;font:500 30px 'SK Mono',monospace;letter-spacing:.02em}
#ok .okw{transform:translateX(-50%);white-space:nowrap;line-height:1.1}
#ok .okidx{left:0;width:${W}px;text-align:center;font:500 30px 'SK Mono',monospace;letter-spacing:.06em;white-space:nowrap}
#ok .okt1{left:0;width:${W}px;text-align:center;font:700 56px 'SK Sans',sans-serif;letter-spacing:-.02em;line-height:1;white-space:nowrap}
#ok .okt2{left:0;width:${W}px;text-align:center;font:italic 600 68px 'SK Serif',serif;line-height:1.1;white-space:nowrap}
#ok .okck{width:52px;height:52px;border-radius:26px;display:flex;align-items:center;justify-content:center}
#ok .okterm{border-radius:22px;overflow:hidden;padding:24px 30px;font:500 26px/40px 'SK Mono',monospace;white-space:pre}
#ok .okcar{display:inline-block;width:14px;height:30px;margin-left:4px;vertical-align:-5px}
#ok .okc{left:0;width:${W}px;text-align:center}
#ok .okco{padding:8px 20px;border-radius:14px;font:500 30px 'SK Mono',monospace;white-space:nowrap}
#ok .okpr{height:96px;border-radius:48px;padding:0 110px 0 40px;display:flex;align-items:center;font:500 32px 'SK Mono',monospace;white-space:pre;overflow:hidden;box-sizing:border-box}
#ok .okbtn{position:absolute;right:16px;top:16px;width:64px;height:64px;border-radius:32px;display:flex;align-items:center;justify-content:center}
#ok .okrep{font:500 30px 'SK Mono',monospace;white-space:nowrap}`;
  document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'ok'; root.className = `ok-${theme}`;
  document.getElementById('stage').appendChild(root);
  const el = (cls, parent = root, tagName = 'div', id) => {
    const e = document.createElement(tagName); if (cls) e.className = cls; if (id) e.id = id; parent.appendChild(e); return e;
  };
  const fill = (e, extra = {}) => (Object.assign(e.style, {left: '0', top: '0', width: W + 'px', height: H + 'px', ...extra}), e);

  // ---------- background (full mode) ----------
  let grid = null, glow = null, flip = null;
  if (full && (theme === 'night' || cfg.bg?.flip)) {
    grid = el('a okgrid', root, 'div', 'ok-grid');
    Object.assign(grid.style, {left: '-200px', top: '-200px', width: (W + 400) + 'px', height: (H + 400) + 'px'});
    glow = fill(el('a'), {background: 'radial-gradient(60% 38% at 50% 98%,rgba(124,58,237,.42) 0%,rgba(30,22,48,.18) 55%,rgba(14,11,20,0) 75%)'});
  }
  if (full && theme === 'light') {
    flip = el('a', root, 'div', 'ok-flip'); fill(flip, {background: '#EFEDF4'});
    fill(el('a okgrid lt', flip));
  }

  // ---------- scene: everything the fly zooms ----------
  const scene = el('a', root, 'div', 'ok-scene'); fill(scene);
  const lsvg = document.createElementNS(NS, 'svg');
  lsvg.setAttribute('width', W); lsvg.setAttribute('height', H);
  Object.assign(lsvg.style, {position: 'absolute', left: '0', top: '0', overflow: 'visible'});
  scene.appendChild(lsvg);

  // chapter («глава»)
  let chapter = [];
  if (cfg.chapter) {
    const c = cfg.chapter, y = c.y ?? 200;
    const states = [{t: c.tin ?? 0, idx: c.idx, l1: c.l1, l2: c.l2},
      ...(c.keys || []).map(([t, s]) => ({t, idx: s.idx ?? c.idx, l1: s.l1 ?? c.l1, l2: s.l2 ?? c.l2}))];
    chapter = states.map((s, i) => {
      const box = el('a', scene); box.style.left = '0'; box.style.top = '0';
      const idx = el('a okidx', box, 'div', i === 0 ? 'ok-idx' : undefined); idx.style.top = (y - 52) + 'px'; idx.style.color = TH.on;
      const t1 = el('a okt1', box); t1.textContent = s.l1 || ''; t1.style.top = y + 'px'; t1.style.color = TH.ink;
      const t2 = el('a okt2', box); t2.textContent = s.l2 || ''; t2.style.top = (y + 62) + 'px'; t2.style.color = TH.on;
      return {s, box, idx, t1, t2, end: states[i + 1]?.t ?? null};
    });
  }

  // «перестройка»: an item moves and resizes on keys [[t, {x, y, size}, dur]], expo-out from wherever it is
  const geoTrack = (it) => {
    const ks = [{t: -1e9, v: [it.x, it.y, it.size], d: 0}];
    for (const [t, o, d] of (it.keys || []).slice().sort((a, b) => a[0] - b[0])) {
      const p = ks[ks.length - 1].v; ks.push({t, v: [o.x ?? p[0], o.y ?? p[1], o.size ?? p[2]], d: Math.max(1e-3, d ?? 0.7)});
    }
    return (t) => {
      let v = ks[0].v;
      for (let i = 1; i < ks.length && t >= ks[i].t; i++) { const u = ex((t - ks[i].t) / ks[i].d); v = v.map((a, j) => a + (ks[i].v[j] - a) * u); }
      return v;
    };
  };

  // items («материализация», «активный пункт», «перестройка»)
  const items = {};
  for (const it of cfg.items || []) {
    const O = OK.O[it.kind]; if (!O) throw new Error('OK: unknown object ' + it.kind);
    const svg = document.createElementNS(NS, 'svg'); svg.id = 'ok-item-' + it.id;
    svg.setAttribute('viewBox', O.vb.join(' '));
    Object.assign(svg.style, {position: 'absolute', overflow: 'visible'});
    svg.innerHTML = `<g class="okobj">${O.svg()}</g>`;
    scene.appendChild(svg);
    const P = {}; svg.querySelectorAll('[data-p]').forEach((n) => { P[n.dataset.p] = n; });
    const names = new Set(); (it.states || []).forEach(([, s]) => Object.keys(s).forEach((n) => names.add(n)));
    const tracks = {};
    for (const n of names) tracks[n] = M.track(0, (it.states || []).filter(([, s]) => n in s).map(([t, s, d]) => [t, s[n], d ? [6 / d, 0.9] : M.FAST]));
    const act = M.track(0, (it.active || []).map(([t, v]) => [t, v, M.FAST]));
    let lb = null, ck = null;
    if (it.label) { lb = el('a oklb', scene, 'div', 'ok-label-' + it.id); lb.textContent = it.label.text; }
    if (it.check != null) {
      ck = el('a okck', scene, 'div', 'ok-check-' + it.id); ck.style.background = TH.accent;
      ck.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    }
    items[it.id] = {it, O, svg, g: svg.firstChild, P, tracks, act, lb, ck, geo: geoTrack(it), at: null};
  }
  // where an item stands at t; its svg, label and check follow
  const place = (I, t) => {
    const [x, y, size] = I.geo(t), [vx, vy, vw, vh] = I.O.vb, k = size / vw;
    I.svg.setAttribute('width', size.toFixed(1)); I.svg.setAttribute('height', (vh * k).toFixed(1));
    I.svg.style.left = (x + vx * k).toFixed(1) + 'px'; I.svg.style.top = (y + vy * k).toFixed(1) + 'px';
    if (I.lb) { I.lb.style.left = x.toFixed(1) + 'px'; I.lb.style.top = (y + (I.it.label.dy ?? 44)).toFixed(1) + 'px'; }
    if (I.ck) { I.ck.style.left = (x + size * 0.3).toFixed(1) + 'px'; I.ck.style.top = (y + vy * k * 0.75).toFixed(1) + 'px'; }
    return (I.at = {x, y, k, size});
  };
  const centre = (I) => [I.at.x, I.at.y + (I.O.vb[1] + I.O.vb[3] / 2) * I.at.k];
  const need = (id, what) => { if (!items[id]) throw new Error(`OK: ${what} → unknown item ${id}`); return items[id]; };

  // links («дерево и связи»): an elbow from under the parent (below its label) to the top of the child; the path
  // follows items that move
  const linkD = (L) => {
    const a = items[L.from], b = items[L.to], A = a.at, Bq = b.at;
    const x1 = A.x, y1 = A.y + (a.it.label ? (a.it.label.dy ?? 44) + 44 : 30), x2 = Bq.x, y2 = Bq.y + b.O.vb[1] * Bq.k - 16, ym = (y1 + y2) / 2;
    const r = (v) => +v.toFixed(1);                                   // no trailing ".0": a still link reads M540,588 as before
    return `M${r(x1)},${r(y1)} V${r(ym)} H${r(x2)} V${r(y2)}`;
  };
  const links = (cfg.links || []).map((L, n) => {
    need(L.from, `links[${n}].from`); need(L.to, `links[${n}].to`);
    const p = document.createElementNS(NS, 'path'); p.id = 'ok-link-' + n;
    for (const [key, v] of Object.entries({fill: 'none', stroke: TH.line, 'stroke-width': 3, 'stroke-linecap': 'round'})) p.setAttribute(key, v);
    lsvg.appendChild(p);
    let drawn = p;
    if (L.dash) {
      const m = document.createElementNS(NS, 'mask'); m.id = 'okm' + n; m.setAttribute('maskUnits', 'userSpaceOnUse');
      const mp = document.createElementNS(NS, 'path');
      for (const [key, v] of Object.entries({fill: 'none', stroke: '#fff', 'stroke-width': 8, 'stroke-linecap': 'round'})) mp.setAttribute(key, v);
      m.appendChild(mp); lsvg.appendChild(m);
      p.setAttribute('stroke-dasharray', '10 12'); p.setAttribute('mask', `url(#okm${n})`); drawn = mp;
    }
    return {L, p, drawn, len: 0, d: ''};
  });

  // callouts («выноски»): a dot on the point, a dotted elbow, a glass plate with a mono label; one per word
  const callouts = (cfg.callouts || []).map((c, n) => {
    if (typeof c.at === 'string') need(c.at, `callouts[${n}].at`);
    const p = document.createElementNS(NS, 'path'); p.id = 'ok-co-line-' + n;
    for (const [key, v] of Object.entries({fill: 'none', stroke: TH.line, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '1 10'})) p.setAttribute(key, v);
    const m = document.createElementNS(NS, 'mask'); m.id = 'okcm' + n; m.setAttribute('maskUnits', 'userSpaceOnUse');
    const mp = document.createElementNS(NS, 'path');
    for (const [key, v] of Object.entries({fill: 'none', stroke: '#fff', 'stroke-width': 10, 'stroke-linecap': 'round'})) mp.setAttribute(key, v);
    m.appendChild(mp); lsvg.appendChild(m); p.setAttribute('mask', `url(#okcm${n})`); lsvg.appendChild(p);
    const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('fill', TH.on); lsvg.appendChild(dot);
    const plate = el('a okco', scene, 'div', 'ok-co-' + n); plate.textContent = c.text;
    Object.assign(plate.style, {color: TH.ink, background: theme === 'night' ? 'rgba(24,18,38,.94)' : '#FFFFFF',
      boxShadow: `0 0 0 3px rgba(${TH.glow},.45),0 0 30px rgba(${TH.glow},.18)`});
    return {c, p, mp, dot, plate, len: 0, d: ''};
  });

  // returns («возврат»): curved arrows from items back to the one the scene started with, one after another
  if (cfg.returns) need(cfg.returns.to, 'returns.to');
  const returns = (cfg.returns?.from || []).map((id, n) => {
    need(id, `returns.from[${n}]`);
    const p = document.createElementNS(NS, 'path'); p.id = 'ok-ret-' + n;
    for (const [key, v] of Object.entries({fill: 'none', stroke: TH.on, 'stroke-width': 3, 'stroke-linecap': 'round'})) p.setAttribute(key, v);
    const head = document.createElementNS(NS, 'polygon'); head.id = 'ok-ret-head-' + n; head.setAttribute('fill', TH.on);
    lsvg.appendChild(p); lsvg.appendChild(head);
    return {id, n, p, head, len: 0, d: ''};
  });

  // drops («физика предмета»): small objects fall into an item or onto a point one after another, land with a squash,
  // sink in and fade; the target dips on each landing
  const FALL = 0.55;
  const drops = (cfg.drops || []).flatMap((D, n) => {
    if (typeof D.into === 'string') need(D.into, `drops[${n}].into`);
    const O = OK.O[D.kind || 'document']; if (!O) throw new Error(`OK: drops[${n}].kind → unknown object ${D.kind}`);
    return Array.from({length: D.n ?? 1}, (_, j) => {
      const size = D.size ?? 70, [vx, vy, vw, vh] = O.vb, k = size / vw;
      const svg = document.createElementNS(NS, 'svg'); svg.id = `ok-drop-${n}-${j}`;
      svg.setAttribute('viewBox', O.vb.join(' ')); svg.setAttribute('width', size); svg.setAttribute('height', (vh * k).toFixed(1));
      Object.assign(svg.style, {position: 'absolute', overflow: 'visible', transformOrigin: '50% 100%'});
      svg.innerHTML = `<g class="okobj">${O.svg()}</g>`;
      scene.appendChild(svg);
      const P = {}; svg.querySelectorAll('[data-p]').forEach((e) => { P[e.dataset.p] = e; });
      O.pose(P, {t: 0, active: 0, open: 0, spin: 0, struck: 0, play: 0, on: 0, fill: 0}, TH);
      return {D, j, svg, k, vx, vy, t0: D.t + j * (D.gap ?? 0.22)};
    });
  });
  const dropTarget = (D) => { if (Array.isArray(D.into)) return D.into; const I = items[D.into]; return [I.at.x, I.at.y + I.O.vb[1] * I.at.k * 0.55]; };

  // morph («морф значка»): an item folds into a dot and a line grows out of it into a timeline; dots pop on their
  // times; a playhead sweeps and lights the dots it passes
  let morph = null;
  if (cfg.morph) {
    const m = cfg.morph, line = document.createElementNS(NS, 'line'); line.id = 'ok-tl';
    need(m.from, 'morph.from');
    for (const [key, v] of Object.entries({stroke: TH.line, 'stroke-width': 3, 'stroke-linecap': 'round'})) line.setAttribute(key, v);
    lsvg.appendChild(line);
    const dots = (m.dots || []).map((d, i) => {
      const c = document.createElementNS(NS, 'circle'); c.id = 'ok-tl-dot-' + i;
      for (const [key, v] of Object.entries({r: 11, stroke: TH.line, 'stroke-width': 3, fill: TH.left})) c.setAttribute(key, v);
      lsvg.appendChild(c); return {d, c};
    });
    const head = m.head ? el('a', scene, 'div', 'ok-tl-head') : null;
    if (head) Object.assign(head.style, {width: '4px', height: '140px', borderRadius: '2px', background: TH.on, boxShadow: `0 0 18px 3px rgba(${TH.glow},.8)`});
    morph = {m, line, dots, head};
  }

  // prompt («строка ввода»): a glass input bar over the head; the query types, the send button lights, the reply comes
  let prompt = null;
  if (cfg.prompt) {
    const c = cfg.prompt, w = c.w ?? 840, x = (c.x ?? 540) - w / 2;
    const bar = el('a okpr', root, 'div', 'ok-prompt');
    Object.assign(bar.style, {left: x + 'px', top: c.y + 'px', width: w + 'px', color: TH.ink,
      background: theme === 'night' ? 'rgba(24,18,38,.94)' : '#FFFFFF', boxShadow: `0 0 0 3px rgba(${TH.glow},.45),0 0 40px 2px rgba(124,58,237,.22)`});
    const tx = el('okx', bar, 'span', 'ok-prompt-text'), car = el('okcar', bar, 'span'); car.style.background = TH.on;
    const btn = el('okbtn', bar, 'div', 'ok-prompt-send');
    btn.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
    let reply = null;
    if (c.reply) {
      reply = el('a okrep', root, 'div', 'ok-prompt-reply'); reply.textContent = c.reply.text;
      Object.assign(reply.style, {left: (x + 30) + 'px', top: (c.y + 124) + 'px', color: TH.on});
    }
    prompt = {c, bar, tx, car, btn, reply};
  }

  // assemble («сборка из сетки»): full mode only; the item `then` appears as the cells fade
  let cellsA = null;
  if (cfg.assemble) {
    const A = cfg.assemble;
    if (!full) throw new Error("OK: assemble needs mode 'full' (its cells sit on the clip's own grid)");
    if (A.then) need(A.then, 'assemble.then');
    const g0 = theme === 'light' ? 0 : 52;                                  // the light grid starts at 0, the night grid at 52
    cellsA = OK.gridCells(scene, A.rect, {t: A.t, dur: A.dur, ox: g0, oy: g0, drift: theme === 'night' ? 6 : 0, color: TH.glow});
    scene.insertBefore(cellsA.el, scene.firstChild);
    if (A.then) { items[A.then].it.tin = A.t + (A.dur ?? 0.8) * 0.55; items[A.then].it.ghost = false; }
  }

  // ---------- above the scene ----------
  const words = (cfg.words || []).map((w) => {
    const e = el('a okw'); e.textContent = w.text; e.style.font = fontOf(w.font, w.size);
    e.style.left = (w.x ?? 540) + 'px'; e.style.top = (w.y - w.size * 0.55) + 'px'; e.style.color = w.color || TH.ink;
    return {w, e};
  });
  let line = null;
  if (cfg.line) {
    const w = cfg.line.w ?? 520; line = el('a');
    Object.assign(line.style, {left: (540 - w / 2) + 'px', top: cfg.line.y + 'px', width: w + 'px', height: '4px', borderRadius: '2px',
      background: TH.on, boxShadow: `0 0 18px 2px rgba(${TH.glow},.8)`, transformOrigin: '0 50%'});
  }
  let counter = null;
  if (cfg.counter) {
    const c = cfg.counter, box = el('a okc', root, 'div', 'ok-count'); box.style.top = (c.y - 90) + 'px';
    const num = el('', box); Object.assign(num.style, {font: "500 150px 'SK Mono',monospace", color: TH.ink, letterSpacing: '-.02em'});
    const lbl = el('', box); Object.assign(lbl.style, {font: "600 36px 'SK Sans',sans-serif", color: TH.dim, marginTop: '10px'});
    lbl.textContent = c.label || '';
    counter = {c, box, num};
  }
  let term = null;
  if (cfg.terminal) {
    const c = cfg.terminal, box = el('a okterm', root, 'div', 'ok-term');
    root.insertBefore(box, scene);                                    // objects draw above the terminal
    Object.assign(box.style, {left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', color: TH.ink,
      background: theme === 'night' ? 'rgba(24,18,38,.94)' : '#FFFFFF',
      boxShadow: `0 0 0 3px rgba(${TH.glow},.45),0 0 40px 2px rgba(124,58,237,.22)`});
    const head = el('', box); head.textContent = c.title || ''; Object.assign(head.style, {color: TH.dim, fontSize: '30px', marginBottom: '8px'});
    const rows = c.lines.map((l, i) => {
      const r = el('', box, 'div', 'ok-row-' + i); r.style.color = l.kind === 'ok' ? TH.on : TH.ink;
      if (l.kind !== 'cmd') { r.textContent = l.text; return {l, r}; }
      const pr = el('', r, 'span'); pr.textContent = '$ '; pr.style.color = TH.on;
      const tx = el('okx', r, 'span'); const car = el('okcar', r, 'span'); car.style.background = TH.on;
      return {l, r, tx, car};
    });
    term = {c, box, rows};
  }

  const draw = (t) => {
    if (grid) {
      const z = cfg.bg?.zoom, u = z ? eio(clamp((t - z[0]) / z[1])) : 0;
      grid.style.transform = `translateY(${(-t * 6).toFixed(1)}px) scale(${(1 + ((z?.[2] ?? 1) - 1) * u).toFixed(4)})`;
      if (z) glow.style.opacity = (0.7 + 0.3 * Math.sin(Math.PI * clamp((t - z[0]) / 0.8))).toFixed(3);
    }
    if (flip && cfg.bg?.flip) { const [a, d] = cfg.bg.flip; flip.style.clipPath = `inset(0 ${(100 - 100 * ex((t - a) / d)).toFixed(2)}% 0 0)`; }

    for (const c of chapter) {
      const on = t >= c.s.t - 1e-6 && (c.end == null || t < c.end);
      c.box.style.display = on ? '' : 'none'; if (!on) continue;
      c.box.style.opacity = (c.end == null ? 1 : 1 - clamp((t - (c.end - 0.15)) / 0.15)).toFixed(3);
      const s = c.s.idx || ''; M.setText(c.idx, s.slice(0, Math.round(s.length * clamp((t - c.s.t) / 0.4))));
      c.t1.style.clipPath = wipe(ex((t - c.s.t - 0.1) / 0.7));
      c.t2.style.clipPath = wipe(ex((t - c.s.t - 0.22) / 0.7));
    }

    for (const I of Object.values(items)) place(I, t);
    const dip = {};
    for (const d of drops) {
      if (typeof d.D.into !== 'string') continue;
      const l = t - d.t0 - FALL;
      if (l >= 0 && l < 0.18) dip[d.D.into] = (dip[d.D.into] || 0) + 5 * Math.sin(Math.PI * l / 0.18);
    }
    for (const I of Object.values(items)) {
      const it = I.it, a = t - it.tin, out = it.tout == null ? 0 : ex((t - it.tout) / 0.35);
      const folded = morph && morph.m.from === it.id ? ex((t - morph.m.t) / 0.35) : 0, gone = Math.max(out, folded);
      I.gone = gone;                                  // links and arrows to a departed or folded item leave with it
      const show = a >= 0 && gone < 0.999;
      for (const e of [I.svg, I.lb, I.ck]) if (e) { e.style.display = show ? '' : 'none'; if (!show) e.style.opacity = '0'; }   // a hidden item holds no stale opacity: its state is a function of t
      if (!show) continue;
      const e = ex(a / 0.5);
      if (it.ghost === false) { I.g.setAttribute('fill-opacity', '1'); I.g.setAttribute('stroke-opacity', '1'); }
      else { I.g.setAttribute('stroke-opacity', clamp(a / 0.2).toFixed(3)); I.g.setAttribute('fill-opacity', ex((a - 0.15) / 0.35).toFixed(3)); }
      I.svg.style.opacity = ((it.ghost === false ? e : 1) * (1 - gone)).toFixed(3);
      const s = {t, active: clamp(I.act(t)), open: 0, spin: 0, struck: 0, play: 0, on: 0, fill: 0};
      for (const [n, f] of Object.entries(I.tracks)) s[n] = f(t);
      I.O.pose(I.P, s, TH);
      I.svg.style.filter = `drop-shadow(0 0 ${(4 + 14 * s.active).toFixed(1)}px rgba(${TH.glow},${(0.35 + 0.4 * s.active).toFixed(2)}))`;
      I.svg.style.transform = `translateY(${((1 - e) * 16 + (dip[it.id] || 0)).toFixed(1)}px) scale(${(1 - 0.1 * out - 0.8 * folded).toFixed(4)})`;
      if (I.lb) {
        const la = t - (it.label.tin ?? it.tin + 0.3);
        I.lb.style.display = la < 0 ? 'none' : '';
        I.lb.style.clipPath = wipe(ex(la / 0.5));
        I.lb.style.color = mix(TH.label, TH.on, s.active);
        I.lb.style.opacity = (1 - gone).toFixed(3);
      }
      if (I.ck) {
        const ca = t - it.check;
        I.ck.style.display = ca < 0 ? 'none' : '';
        I.ck.style.opacity = (clamp(ca / 0.12) * (1 - gone)).toFixed(3);
        I.ck.style.transform = `scale(${(0.6 + 0.4 * ex(ca / 0.35)).toFixed(3)})`;
      }
    }

    for (const L of links) {
      L.p.style.display = '';
      const d = linkD(L.L);
      if (d !== L.d) { L.p.setAttribute('d', d); if (L.drawn !== L.p) L.drawn.setAttribute('d', d); L.len = L.p.getTotalLength(); L.drawn.style.strokeDasharray = L.len; L.d = d; }
      const lg = Math.max(items[L.L.from].gone, items[L.L.to].gone);
      L.p.style.display = t < L.L.tin || lg >= 0.999 ? 'none' : '';
      L.drawn.style.strokeDashoffset = (L.len * (1 - ex((t - L.L.tin) / (L.L.dur ?? 0.5)))).toFixed(2);
      L.p.style.opacity = (1 - lg).toFixed(3);
    }

    for (const C of callouts) {
      const c = C.c, a = t - c.t, out = c.tout == null ? 0 : clamp((t - c.tout) / 0.3), on = a >= 0 && out < 1;
      for (const e of [C.p, C.dot, C.plate]) e.style.display = on ? '' : 'none';
      if (!on) continue;
      const [ax, ay] = typeof c.at === 'string' ? centre(items[c.at]) : c.at;
      const dx = c.dx ?? 170, dy = c.dy ?? -90, bx = ax + dx, by = ay + dy;
      const d = `M${ax.toFixed(1)},${ay.toFixed(1)} L${(ax + dx * 0.35).toFixed(1)},${by.toFixed(1)} L${bx.toFixed(1)},${by.toFixed(1)}`;
      if (d !== C.d) { C.p.setAttribute('d', d); C.mp.setAttribute('d', d); C.len = C.mp.getTotalLength(); C.mp.style.strokeDasharray = C.len; C.d = d; }
      C.mp.style.strokeDashoffset = (C.len * (1 - ex(a / 0.4))).toFixed(2);
      C.dot.setAttribute('cx', ax.toFixed(1)); C.dot.setAttribute('cy', ay.toFixed(1)); C.dot.setAttribute('r', (7 * ex(a / 0.25)).toFixed(2));
      const o = (1 - out).toFixed(3);
      C.p.style.opacity = o; C.dot.style.opacity = o; C.plate.style.opacity = o;
      C.plate.style.top = (by - 26).toFixed(1) + 'px';
      C.plate.style.left = (dx >= 0 ? bx + 10 : bx - 10).toFixed(1) + 'px';
      C.plate.style.transform = dx >= 0 ? '' : 'translateX(-100%)';
      const pu = ex((a - 0.25) / 0.5);              // left-to-right wipe that keeps 20 px around for the ring and glow
      C.plate.style.clipPath = `inset(-20px calc(${(100 - 100 * pu).toFixed(2)}% + ${(20 - 40 * pu).toFixed(1)}px) -20px -20px round 14px)`;
    }

    if (cfg.returns) {
      const R = cfg.returns, To = items[R.to], [bx, by] = centre(To), out = R.tout == null ? 0 : clamp((t - R.tout) / 0.3);
      for (const r of returns) {
        const I = items[r.id], [ax, ay] = centre(I), a = t - (R.t + r.n * (R.gap ?? 0.12)), lg = Math.max(I.gone, To.gone);
        const on = a >= 0 && out < 1 && lg < 0.999;
        r.p.style.display = on ? '' : 'none'; r.head.style.display = on ? '' : 'none';
        if (!on) continue;
        const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
        const sx = ax + ux * I.at.size * 0.42, sy = ay + uy * I.at.size * 0.42, tx = bx - ux * To.at.size * 0.5, ty = by - uy * To.at.size * 0.5;
        const side = ax < bx - 1 ? -1 : ax > bx + 1 ? 1 : 0, bend = (R.bend ?? 0.25) * L * side;
        const qx = (sx + tx) / 2 - uy * bend, qy = (sy + ty) / 2 + ux * bend;
        const d = `M${sx.toFixed(1)},${sy.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`;
        if (d !== r.d) { r.p.setAttribute('d', d); r.len = r.p.getTotalLength(); r.p.style.strokeDasharray = r.len; r.d = d; }
        const u = ex(a / (R.dur ?? 0.5));
        r.p.style.strokeDashoffset = (r.len * (1 - u)).toFixed(2);
        const hl = Math.hypot(tx - qx, ty - qy) || 1, hx = (tx - qx) / hl, hy = (ty - qy) / hl;
        r.head.setAttribute('points', [[tx, ty], [tx - hx * 16 - hy * 9, ty - hy * 16 + hx * 9], [tx - hx * 16 + hy * 9, ty - hy * 16 - hx * 9]].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
        r.head.style.opacity = (clamp((u - 0.85) / 0.15) * (1 - out) * (1 - lg)).toFixed(3);
        r.p.style.opacity = ((1 - out) * (1 - lg)).toFixed(3);
      }
    }

    for (const d of drops) {
      const a = t - d.t0, land = a - FALL, [tx, ty] = dropTarget(d.D);
      d.svg.style.display = a < 0 || land > 0.2 ? 'none' : '';
      if (a < 0 || land > 0.2) continue;
      const from = d.D.from ?? -320, [fx, fy] = Array.isArray(from) ? from : [tx + (d.j % 2 ? 18 : -18), ty + from];
      const u = clamp(a / FALL), sink = clamp(land / 0.2), sq = land > 0 ? Math.sin(Math.PI * clamp(land / 0.12)) * 0.12 : 0;
      const x = fx + (tx - fx) * u, y = fy + (ty - fy) * u * u + 22 * sink;
      d.svg.style.left = (x + d.vx * d.k).toFixed(1) + 'px'; d.svg.style.top = (y + d.vy * d.k).toFixed(1) + 'px';
      d.svg.style.transform = `rotate(${((1 - u) * (d.j % 2 ? 14 : -14)).toFixed(2)}deg) scale(${(1 + sq * 0.5).toFixed(3)}, ${(1 - sq).toFixed(3)})`;
      d.svg.style.opacity = (1 - sink).toFixed(3);
    }

    if (morph) {
      const m = morph.m, [cx, cy] = centre(items[m.from]), X = m.x ?? 540, Y = m.y ?? cy, w = m.w ?? 760;
      const a = t - m.t, u = ex((a - 0.15) / (m.dur ?? 0.8));
      morph.line.style.display = a >= 0.15 ? '' : 'none';
      const y = cy + (Y - cy) * u;
      morph.line.setAttribute('x1', (cx + (X - w / 2 - cx) * u).toFixed(1)); morph.line.setAttribute('x2', (cx + (X + w / 2 - cx) * u).toFixed(1));
      morph.line.setAttribute('y1', y.toFixed(1)); morph.line.setAttribute('y2', y.toFixed(1));
      const hp = m.head ? eio(clamp((t - m.head.t0) / (m.head.t1 - m.head.t0))) : null;
      if (morph.head) {
        morph.head.style.display = t >= m.head.t0 && t <= m.head.t1 + 0.3 ? '' : 'none';
        morph.head.style.left = (X - w / 2 + w * hp - 2).toFixed(1) + 'px'; morph.head.style.top = (Y - 70).toFixed(1) + 'px';
        morph.head.style.opacity = (1 - clamp((t - m.head.t1) / 0.3)).toFixed(3);
      }
      for (const {d, c} of morph.dots) {
        const b = t - d.t;
        c.style.display = b < 0 ? 'none' : '';
        c.setAttribute('cx', (X - w / 2 + w * d.at).toFixed(1)); c.setAttribute('cy', Y.toFixed(1));
        c.setAttribute('r', (11 * (0.4 + 0.6 * ex(b / 0.35))).toFixed(2));
        const lit = (m.head && t >= m.head.t0 && hp >= d.at) || (d.on != null && t >= d.on);
        c.setAttribute('fill', lit ? TH.on : TH.left);
      }
    }

    if (cfg.fly) {
      const f = cfg.fly, I = items[f.id], u = eio(clamp((t - f.t) / (f.dur ?? 0.4))), [cx, cy] = centre(I);
      scene.style.transformOrigin = `${cx.toFixed(1)}px ${cy.toFixed(1)}px`;
      scene.style.transform = `scale(${(1 + 7 * u * u).toFixed(4)})`;
      scene.style.filter = u > 0.01 ? `blur(${(Math.sin(Math.PI * u) * 6).toFixed(2)}px)` : 'none';
      scene.style.opacity = (1 - clamp((u - 0.6) / 0.4)).toFixed(3);
    }

    for (const {w, e} of words) {
      const u = ex((t - w.t) / 0.7);
      e.style.display = t < w.t ? 'none' : '';
      e.style.clipPath = wipe(u, '-30%');
      e.style.filter = u < 0.98 ? `blur(${((1 - u) * 6).toFixed(2)}px)` : 'none';
    }
    if (line) { line.style.display = t < cfg.line.t ? 'none' : ''; line.style.transform = `scaleX(${ex((t - cfg.line.t) / 0.8).toFixed(4)})`; }

    if (counter) {
      const c = counter.c, a = t - c.t;
      counter.box.style.display = a < 0 ? 'none' : '';
      counter.box.style.opacity = clamp(a / 0.2).toFixed(3);
      M.setText(counter.num, groups(Math.round(c.to * eo(a / (c.dur ?? 1.2)))));
    }

    if (term) {
      const u = ex((t - (term.c.tin ?? -1)) / 0.6);    // left-to-right wipe: the right clip edge runs from x = -60 to W + 60, so the ring and glow survive and nothing shows before tin
      term.box.style.clipPath = `inset(-60px calc(${(100 - 100 * u).toFixed(2)}% + ${(60 - 120 * u).toFixed(1)}px) -60px -60px round 22px)`;
      for (const {l, r, tx, car} of term.rows) {
        const b = t - l.t;
        if (l.kind === 'cmd') {
          const n = Math.round(l.text.length * clamp(b / (l.dur ?? 0.55)));
          r.style.display = b < 0 ? 'none' : '';
          M.setText(tx, l.text.slice(0, n));
          car.style.opacity = n < l.text.length || Math.floor(t * 2.5) % 2 === 0 ? '1' : '0';
        } else {
          const u = ex(b / 0.3);
          r.style.opacity = (b < 0 ? 0 : u).toFixed(3);
          r.style.transform = `translateY(${((1 - u) * 8).toFixed(1)}px)`;
        }
      }
    }

    if (prompt) {
      const c = prompt.c, a = t - c.t, out = c.tout == null ? 0 : clamp((t - c.tout) / 0.3), on = a >= 0 && out < 1;
      prompt.bar.style.display = on ? '' : 'none';
      if (prompt.reply) prompt.reply.style.display = on && t >= c.reply.t ? '' : 'none';
      if (on) {
        const u = ex(a / 0.6);
        prompt.bar.style.clipPath = `inset(-60px calc(${(100 - 100 * u).toFixed(2)}% + ${(60 - 120 * u).toFixed(1)}px) -60px -60px round 48px)`;
        prompt.bar.style.opacity = (1 - out).toFixed(3);
        const n = Math.round(c.text.length * clamp((a - 0.25) / (c.dur ?? 0.9)));
        M.setText(prompt.tx, c.text.slice(0, n));
        prompt.car.style.opacity = n < c.text.length || Math.floor(t * 2.5) % 2 === 0 ? '1' : '0';
        prompt.btn.style.background = mix(theme === 'night' ? '#2C2342' : '#E4DFEC', TH.accent, c.send == null ? 0 : ex((t - c.send) / 0.3));
        prompt.btn.style.transform = `scale(${(1 + 0.12 * Math.sin(Math.PI * clamp((t - (c.send ?? 1e9)) / 0.3))).toFixed(3)})`;
        if (prompt.reply && t >= c.reply.t) {
          const r = ex((t - c.reply.t) / 0.4);
          prompt.reply.style.opacity = (r * (1 - out)).toFixed(3); prompt.reply.style.transform = `translateY(${((1 - r) * 10).toFixed(1)}px)`;
        }
      }
    }
    if (cellsA) cellsA.draw(t);
  };

  window.READY = Promise.resolve();
  M.scene({W, H, T, bg: full ? (theme === 'light' && !cfg.bg?.flip ? '#EFEDF4' : '#0E0B14') : null, center: [W / 2, H / 2], intro: null,
    SH: {none: {w: 0, h: 0, r: 0, bg: '#FFFFFF', cam: 1}}, start: 'none', SEQ: [], extra: (t) => draw(t)});
  document.getElementById('shape').style.display = 'none';
};
})();
