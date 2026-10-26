/* Reels Studio object kit: isometric «blueprint» objects for the night look (design 2026-10-26,
   docs/superpowers/specs/2026-10-26-remake-fast-night-motion-design.md): light lines, dark glass, one purple accent.
   An object is SVG built from iso primitives; its parts (data-p) move with its state. Scenes that place and animate
   objects: object-scene.js (OK.run). Both are built into clips by scripts/ru/broll/build.py.

   OK.iso(x, y, z) → [sx, sy]   true isometric (30°): +x goes right-down, +y left-down, +z up; origin = floor centre
   OK.ellipse(r) → [rx, ry]     a circle of radius r lying in the x-y plane
   OK.O[kind] = {vb:[x, y, w, h], svg:() => markup, pose:(P, s, T) => void}
     vb    the drawing's box in iso screen units around the origin
     P     {part name: element} for every data-p in the markup
     s     {t, active, open, spin, struck, play}: numbers, 0..1 except t (clip seconds) — pose is a pure function of s
     T     the theme (OK.THEMES.night | light)
   A new object: compose it from OK.box / OK.cyl / OK.disc / OK.poly, give moving parts a data-p, write its pose. */
(function(){
const OK = window.OK = window.OK || {};
const C30 = Math.cos(Math.PI / 6);
OK.iso = (x, y, z) => [(x - y) * C30, (x + y) * 0.5 - z];
OK.ellipse = (r) => [r * Math.SQRT2 * C30, r * Math.SQRT2 * 0.5];
const f1 = (v) => String(Math.round(v * 10) / 10);
const pts = (list) => list.map(([x, y, z]) => OK.iso(x, y, z).map(f1).join(',')).join(' ');
const tag = (id) => (id ? ` data-p="${id}"` : '');
const at = (x, y, z) => OK.iso(x, y, z).map(f1);

OK.THEMES = {
  night: {line: '#B79CFF', ink: '#F5F3FA', left: '#1A1428', right: '#221B33', top: '#2C2342', accent: '#7C3AED',
          label: '#F5F3FA', on: '#B79CFF', dim: 'rgba(245,243,250,.42)', glow: '183,156,255'},
  light: {line: '#17141C', ink: '#17141C', left: '#E4DFEC', right: '#F1EEF6', top: '#FFFFFF', accent: '#7C3AED',
          label: '#17141C', on: '#7C3AED', dim: 'rgba(23,20,28,.38)', glow: '124,58,237'},
};
OK.css = (name) => {
  const T = OK.THEMES[name];
  const s = `stroke:${T.line};stroke-width:4;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke`;
  return `.ok-${name} .ln{fill:none;${s}}.ok-${name} .fl{fill:${T.left};${s}}.ok-${name} .fr{fill:${T.right};${s}}`
    + `.ok-${name} .ft{fill:${T.top};${s}}.ok-${name} .fa{fill:${T.accent};${s}}`
    + `.ok-${name} .fd{fill:${T.dim};stroke:none}.ok-${name} .fi{fill:${T.ink};stroke:none}`;
};

OK.poly = (list, cls = 'fl', id) => `<polygon class="${cls}"${tag(id)} points="${pts(list)}"/>`;
// box from corner (x, y, z), size w along x, d along y, h up: the left face (y + d), the right face (x + w), the top
OK.box = (x, y, z, w, d, h, c = {}) => `<g${tag(c.id)}>`
  + OK.poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], c.l || 'fl')
  + OK.poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], c.r || 'fr')
  + OK.poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], c.t || 'ft') + '</g>';
// vertical cylinder standing on (cx, cy, z): the side, then the top ellipse
OK.cyl = (cx, cy, z, r, h, c = {}) => {
  const [rx, ry] = OK.ellipse(r), [X, Yb] = OK.iso(cx, cy, z), Yt = Yb - h;
  return `<g${tag(c.id)}><path class="${c.s || 'fr'}" d="M${f1(X - rx)},${f1(Yt)} V${f1(Yb)} A${f1(rx)},${f1(ry)} 0 0 0 ${f1(X + rx)},${f1(Yb)} V${f1(Yt)} Z"/>`
    + `<ellipse class="${c.t || 'ft'}" cx="${f1(X)}" cy="${f1(Yt)}" rx="${f1(rx)}" ry="${f1(ry)}"/></g>`;
};
// flat disc in a vertical plane: 'y' — facing +y (on a left face), 'x' — facing +x (on a right face)
OK.disc = (cx, cy, cz, r, plane = 'y', cls = 'ft', id) => {
  const list = [];
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, u = r * Math.cos(a), v = r * Math.sin(a);
    list.push(plane === 'y' ? [cx + u, cy, cz + v] : [cx, cy + u, cz + v]);
  }
  return OK.poly(list, cls, id);
};
const line = (a, b, id, extra = '') => `<line class="ln"${tag(id)} x1="${at(...a)[0]}" y1="${at(...a)[1]}" x2="${at(...b)[0]}" y2="${at(...b)[1]}"${extra}/>`;

OK.O = {};

// database (Openverse, a library, storage): three disks; open lifts the top one, active lights the LEDs
OK.O.database = {
  vb: [-90, -172, 180, 222],
  svg: () => [0, 1, 2].map((i) => OK.cyl(0, 0, i * 32, 62, 24, {id: 'd' + i})
    + `<ellipse class="fd" data-p="led${i}" cx="${at(44, 44, i * 32 + 12)[0]}" cy="${at(44, 44, i * 32 + 12)[1]}" rx="7" ry="4"/>`).join(''),
  pose: (P, s, T) => {
    const lift = `translate(0 ${f1(-30 * s.open)})`;
    P.d2.setAttribute('transform', lift); P.led2.setAttribute('transform', lift);
    for (const i of [0, 1, 2]) P['led' + i].style.fill = s.active > 0.5 ? T.on : '';
  },
};

// agent (an AI agent, Claude Code): a body with a face screen and an antenna; active lights the eyes
OK.O.agent = {
  vb: [-90, -128, 180, 182],
  svg: () => OK.box(-45, -45, 0, 90, 90, 72)
    + OK.poly([[-34, 45, 12], [34, 45, 12], [34, 45, 60], [-34, 45, 60]], 'ft')
    + OK.poly([[-22, 45, 30], [-10, 45, 30], [-10, 45, 44], [-22, 45, 44]], 'fd', 'e0')
    + OK.poly([[10, 45, 30], [22, 45, 30], [22, 45, 44], [10, 45, 44]], 'fd', 'e1')
    + line([0, 0, 72], [0, 0, 96])
    + `<circle class="fa" data-p="tip" cx="${at(0, 0, 102)[0]}" cy="${at(0, 0, 102)[1]}" r="7"/>`,
  pose: (P, s, T) => {
    for (const e of [P.e0, P.e1]) e.style.fill = s.active > 0.5 ? T.on : '';
    P.tip.style.opacity = (0.45 + 0.55 * s.active).toFixed(3);
  },
};

// turntable (sound placed on the timeline, Real SFX): spin turns the marker on the platter, active lights the label
OK.O.turntable = {
  vb: [-140, -108, 280, 192],
  svg: () => OK.box(-75, -75, 0, 150, 150, 22)
    + OK.cyl(-8, -8, 22, 56, 8, {id: 'plat'})
    + `<g data-p="lab"><ellipse class="fd" cx="${at(-8, -8, 31)[0]}" cy="${at(-8, -8, 31)[1]}" rx="${f1(OK.ellipse(16)[0])}" ry="${f1(OK.ellipse(16)[1])}"/></g>`
    + `<ellipse class="fi" data-p="mark" rx="5" ry="3"/>`
    + OK.box(50, -62, 22, 12, 12, 18)
    + line([56, -56, 40], [8, 14, 34])
    + OK.box(2, 10, 30, 12, 8, 6),
  pose: (P, s, T) => {
    const a = (s.spin + s.t * 0.6 * s.active) * Math.PI * 2, [x, y] = OK.iso(-8 + 38 * Math.cos(a), -8 + 38 * Math.sin(a), 30);
    P.mark.setAttribute('cx', f1(x)); P.mark.setAttribute('cy', f1(y));
    P.lab.querySelector('ellipse').style.fill = s.active > 0.5 ? T.accent : '';
  },
};

// speaker (a sound made in code, earshot): play pulses the woofer and sends the waves
OK.O.speaker = {
  vb: [-118, -168, 196, 222],
  svg: () => {
    const [cx, cy] = OK.iso(0, 35, 42);
    const waves = [0, 1, 2].map((i) => {
      const R = 46 + 18 * i;
      return `<path class="ln" data-p="w${i}" d="M${f1(cx - R * 0.5)},${f1(cy - R * 0.866)} A${R},${R} 0 0 0 ${f1(cx - R * 0.5)},${f1(cy + R * 0.866)}" style="opacity:0"/>`;
    }).join('');
    return OK.box(-40, -35, 0, 80, 70, 120) + OK.disc(0, 35, 42, 26, 'y', 'fd', 'woof') + OK.disc(0, 35, 42, 12, 'y', 'fl')
      + OK.disc(0, 35, 94, 11, 'y', 'fd') + waves;
  },
  pose: (P, s) => {
    const [cx, cy] = OK.iso(0, 35, 42), k = 1 + 0.05 * s.play * Math.sin(s.t * 12);
    P.woof.setAttribute('transform', `translate(${f1(cx)} ${f1(cy)}) scale(${k.toFixed(4)}) translate(${f1(-cx)} ${f1(-cy)})`);
    for (const i of [0, 1, 2]) P['w' + i].style.opacity = (s.play * Math.pow(0.5 + 0.5 * Math.sin(s.t * 6 - i * 1.2), 2)).toFixed(3);
  },
};

// key (an API key): lies flat; struck draws an accent line across it («без ключа»)
OK.O.key = {
  vb: [-112, -72, 224, 124],
  svg: () => OK.cyl(-52, 0, 0, 26, 9)
    + `<ellipse class="fl" cx="${at(-52, 0, 9)[0]}" cy="${at(-52, 0, 9)[1]}" rx="${f1(OK.ellipse(11)[0])}" ry="${f1(OK.ellipse(11)[1])}"/>`
    + OK.box(-28, -7, 0, 88, 14, 9) + OK.box(42, 7, 0, 9, 9, 9) + OK.box(56, 7, 0, 9, 14, 9)
    + `<line class="ln" data-p="strike" x1="-100" y1="-56" x2="100" y2="40" pathLength="1" style="vector-effect:none;stroke-dasharray:1;stroke-dashoffset:1"/>`,
  pose: (P, s, T) => {
    P.strike.style.stroke = T.accent; P.strike.style.strokeWidth = '8';
    P.strike.style.strokeDashoffset = (1 - s.struck).toFixed(4);
  },
};

// folder (a project, files): stands up; open tilts the front panel forward, active tints it
const front = (o) => {
  const a = o * 0.7, h = 66;
  return [[-60, 4, 0], [60, 4, 0], [60, 4 + h * Math.sin(a), h * Math.cos(a)], [-60, 4 + h * Math.sin(a), h * Math.cos(a)]];
};
OK.O.folder = {
  vb: [-100, -130, 200, 172],
  svg: () => OK.poly([[-60, -6, 0], [60, -6, 0], [60, -6, 80], [-16, -6, 80], [-22, -6, 90], [-60, -6, 90]], 'fl')
    + OK.poly([[-52, -2, 6], [52, -2, 6], [52, -2, 74], [-52, -2, 74]], 'ft')
    + OK.poly([[-48, 0, 4], [48, 0, 4], [48, 0, 70], [-48, 0, 70]], 'ft')
    + OK.poly(front(0), 'fl', 'front'),
  pose: (P, s, T) => {
    P.front.setAttribute('points', pts(front(s.open)));
    P.front.style.fill = s.active > 0.5 ? `rgba(${T.glow},.35)` : '';
  },
};
})();
