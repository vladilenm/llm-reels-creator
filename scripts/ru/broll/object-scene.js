/* Reels Studio object scenes (night look, design 2026-10-26): objects from object-kit.js placed in the frame and
   moved by verbs; every style is a pure function of t (engine contract). Built by scripts/ru/broll/build.py.

   OK.run({
     T, mode:'panel'|'full', theme:'night'|'light',
     bg:{zoom:[t, dur, to], flip:[t, dur]},    full mode only. night: grid + glow, zoom = the grid flies into depth
                                                and the glow flares. light: canvas + faint grid; flip = it wipes in
                                                from the left over the night
     chapter:{idx, l1, l2, y:200, tin, keys:[[t, {idx, l1, l2}]]},     «глава»: stays, the text swaps on keys
     items:[{id, kind, x, y, size, tin, label:{text, tin, dy:44}, states:[[t, {open:1}, dur]], active:[[t, 0|1]],
             check:t, ghost:true}],                                  «материализация», «активный пункт»
     links:[{from, to, tin, dur:0.5, dash:false}],                    «дерево и связи»: an elbow from → to
     fly:{id, t, dur:0.4},                                            «сквозной пролёт» into an item
     words:[{text, font:'display'|'serif'|'sans'|'mono', size, y, x:540, t, color}],   accent words: a wipe
     line:{y, t, w:520},                                              the glowing line under the words
     counter:{t, to, label, y, dur:1.2},
     terminal:{x, y, w, h, title, tin:-1, lines:[{t, text, kind:'cmd'|'out'|'ok', dur:0.55}]},   «живой интерфейс»
   })
   Items: x, y = frame px of the object's floor centre, size = drawn width. DOM ids (tests, debugging): ok-scene,
   ok-item-<id>, ok-label-<id>, ok-check-<id>, ok-link-<n>, ok-idx, ok-flip, ok-grid, ok-count, ok-term, ok-row-<n>. */
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
#ok .okc{left:0;width:${W}px;text-align:center}`;
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

  // items («материализация», «активный пункт»)
  const items = {};
  for (const it of cfg.items || []) {
    const O = OK.O[it.kind]; if (!O) throw new Error('OK: unknown object ' + it.kind);
    const [vx, vy, vw, vh] = O.vb, k = it.size / vw;
    const svg = document.createElementNS(NS, 'svg'); svg.id = 'ok-item-' + it.id;
    svg.setAttribute('viewBox', O.vb.join(' ')); svg.setAttribute('width', it.size); svg.setAttribute('height', vh * k);
    Object.assign(svg.style, {position: 'absolute', left: (it.x + vx * k) + 'px', top: (it.y + vy * k) + 'px', overflow: 'visible'});
    svg.innerHTML = `<g class="okobj">${O.svg()}</g>`;
    scene.appendChild(svg);
    const P = {}; svg.querySelectorAll('[data-p]').forEach((n) => { P[n.dataset.p] = n; });
    const names = new Set(); (it.states || []).forEach(([, s]) => Object.keys(s).forEach((n) => names.add(n)));
    const tracks = {};
    for (const n of names) tracks[n] = M.track(0, (it.states || []).filter(([, s]) => n in s).map(([t, s, d]) => [t, s[n], d ? [6 / d, 0.9] : M.FAST]));
    const act = M.track(0, (it.active || []).map(([t, v]) => [t, v, M.FAST]));
    let lb = null, ck = null;
    if (it.label) {
      lb = el('a oklb', scene, 'div', 'ok-label-' + it.id); lb.textContent = it.label.text;
      lb.style.left = it.x + 'px'; lb.style.top = (it.y + (it.label.dy ?? 44)) + 'px';
    }
    if (it.check != null) {
      ck = el('a okck', scene, 'div', 'ok-check-' + it.id); ck.style.background = TH.accent;
      ck.style.left = (it.x + it.size * 0.3) + 'px'; ck.style.top = (it.y + vy * k * 0.75) + 'px';
      ck.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    }
    items[it.id] = {it, O, svg, g: svg.firstChild, P, tracks, act, lb, ck, k};
  }

  // links («дерево и связи»)
  const links = (cfg.links || []).map((L, n) => {
    const a = items[L.from], b = items[L.to];
    const x1 = a.it.x, y1 = a.it.y + (a.it.label ? (a.it.label.dy ?? 44) + 44 : 30), x2 = b.it.x, y2 = b.it.y + b.O.vb[1] * b.k - 16, ym = (y1 + y2) / 2;
    const p = document.createElementNS(NS, 'path'); p.id = 'ok-link-' + n;
    for (const [key, v] of Object.entries({d: `M${x1},${y1} V${ym} H${x2} V${y2}`, fill: 'none', stroke: TH.line, 'stroke-width': 3, 'stroke-linecap': 'round'})) p.setAttribute(key, v);
    lsvg.appendChild(p);
    const len = p.getTotalLength();
    let drawn = p;
    if (L.dash) {
      const m = document.createElementNS(NS, 'mask'); m.id = 'okm' + n; m.setAttribute('maskUnits', 'userSpaceOnUse');
      const mp = p.cloneNode(); mp.removeAttribute('id'); mp.setAttribute('stroke', '#fff'); mp.setAttribute('stroke-width', '8');
      m.appendChild(mp); lsvg.appendChild(m);
      p.setAttribute('stroke-dasharray', '10 12'); p.setAttribute('mask', `url(#okm${n})`); drawn = mp;
    }
    drawn.style.strokeDasharray = len;
    return {L, p, drawn, len};
  });

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

    for (const I of Object.values(items)) {
      const it = I.it, a = t - it.tin;
      const show = a >= 0;
      for (const e of [I.svg, I.lb, I.ck]) if (e) e.style.display = show ? '' : 'none';
      if (!show) continue;
      const e = ex(a / 0.5);
      if (it.ghost === false) { I.g.setAttribute('fill-opacity', '1'); I.g.setAttribute('stroke-opacity', '1'); I.svg.style.opacity = e.toFixed(3); }
      else { I.g.setAttribute('stroke-opacity', clamp(a / 0.2).toFixed(3)); I.g.setAttribute('fill-opacity', ex((a - 0.15) / 0.35).toFixed(3)); }
      const s = {t, active: clamp(I.act(t)), open: 0, spin: 0, struck: 0, play: 0};
      for (const [n, f] of Object.entries(I.tracks)) s[n] = f(t);
      I.O.pose(I.P, s, TH);
      I.svg.style.filter = `drop-shadow(0 0 ${(4 + 14 * s.active).toFixed(1)}px rgba(${TH.glow},${(0.35 + 0.4 * s.active).toFixed(2)}))`;
      I.svg.style.transform = `translateY(${((1 - e) * 16).toFixed(1)}px)`;
      if (I.lb) {
        const la = t - (it.label.tin ?? it.tin + 0.3);
        I.lb.style.display = la < 0 ? 'none' : '';
        I.lb.style.clipPath = wipe(ex(la / 0.5));
        I.lb.style.color = mix(TH.label, TH.on, s.active);
      }
      if (I.ck) {
        const ca = t - it.check;
        I.ck.style.display = ca < 0 ? 'none' : '';
        I.ck.style.opacity = clamp(ca / 0.12).toFixed(3);
        I.ck.style.transform = `scale(${(0.6 + 0.4 * ex(ca / 0.35)).toFixed(3)})`;
      }
    }

    for (const L of links) {
      L.p.style.display = t < L.L.tin ? 'none' : '';
      L.drawn.style.strokeDashoffset = (L.len * (1 - ex((t - L.L.tin) / (L.L.dur ?? 0.5)))).toFixed(2);
    }

    if (cfg.fly) {
      const f = cfg.fly, I = items[f.id], u = eio(clamp((t - f.t) / (f.dur ?? 0.4)));
      const cy = I.it.y + (I.O.vb[1] + I.O.vb[3] / 2) * I.k;
      scene.style.transformOrigin = `${I.it.x}px ${cy.toFixed(1)}px`;
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
  };

  window.READY = Promise.resolve();
  M.scene({W, H, T, bg: full ? (theme === 'light' && !cfg.bg?.flip ? '#EFEDF4' : '#0E0B14') : null, center: [W / 2, H / 2], intro: null,
    SH: {none: {w: 0, h: 0, r: 0, bg: '#FFFFFF', cam: 1}}, start: 'none', SEQ: [], extra: (t) => draw(t)});
  document.getElementById('shape').style.display = 'none';
};
})();
