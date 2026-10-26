/* Reels Studio object kit: isometric «blueprint» objects for the night look (design 2026-10-26,
   docs/superpowers/specs/2026-10-26-remake-fast-night-motion-design.md): light lines, dark glass, one purple accent.
   An object is SVG built from iso primitives; its parts (data-p) move with its state. Scenes that place and animate
   objects: object-scene.js (OK.run). Both are built into clips by scripts/ru/broll/build.py.

   OK.iso(x, y, z) → [sx, sy]   true isometric (30°): +x goes right-down, +y left-down, +z up; origin = floor centre
   OK.ellipse(r) → [rx, ry]     a circle of radius r lying in the x-y plane
   OK.O[kind] = {vb:[x, y, w, h], svg:() => markup, pose:(P, s, T) => void}
     vb    the drawing's box in iso screen units around the origin
     P     {part name: element} for every data-p in the markup
     s     {t, active, open, spin, struck, play, on, fill}: numbers, 0..1 except t (clip seconds) — pose is a pure function of s
     T     the theme (OK.THEMES.night | light)
   A new object: compose it from OK.box / OK.cyl / OK.disc / OK.poly / OK.face / OK.plate / OK.circ, give moving parts a
   data-p, write its pose; its vb must hold every pose (tests/night.test.mjs checkObjects). */
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
const c01 = (v) => Math.max(0, Math.min(1, v));
// a polygon standing in the plane y from [x, z] pairs; a plate: the same outline at y −d (the side tone) and at y 0
const face = OK.face = (xz, y = 0, cls = 'fl', id) => OK.poly(xz.map(([x, z]) => [x, y, z]), cls, id);
const plate = OK.plate = (xz, d, c = {}) => `<g${tag(c.id)}>${face(xz, -d, c.b || 'fr')}${face(xz, 0, c.f || 'fl')}</g>`;
// n points of a circle of radius r around (cx, cz) in the x-z plane, from the angle a0
const circ = OK.circ = (cx, cz, r, n = 28, a0 = 0) => Array.from({length: n}, (_, i) => {
  const a = a0 + i / n * Math.PI * 2; return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
});

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

// ---------- the work desk ----------

// document (a file, a README, a page): a sheet with a folded corner over two more; open slides the top sheet off,
// fill lights its lines one by one (a page being read), active tints it
const SHEET = [[-45, 0], [45, 0], [45, 100], [25, 120], [-45, 120]];
OK.O.document = {
  vb: [-62, -162, 120, 190],
  svg: () => face(SHEET, -16, 'fr') + face(SHEET, -8, 'fr')
    + `<g data-p="pg">${face(SHEET, 0, 'fl', 'sh')}${face([[25, 120], [25, 100], [45, 100]], 0, 'ft')}`
    + [90, 76, 62, 48, 34].map((z, i) => { const x1 = i === 4 ? 6 : 30; return face([[-32, z], [x1, z], [x1, z + 6], [-32, z + 6]], 0, 'fd', 'l' + i); }).join('')
    + '</g>',
  pose: (P, s, T) => {
    P.pg.setAttribute('transform', `translate(${f1(-18 * s.open)} ${f1(-14 * s.open)})`);
    for (let i = 0; i < 5; i++) P['l' + i].style.fill = s.fill * 5 > i + 0.5 ? T.on : '';
    P.sh.style.fill = s.active > 0.5 ? `rgba(${T.glow},.30)` : '';
  },
};

// laptop (a computer, the work itself): a base with keys; open raises the lid (0 closed … 1 open), on lights the screen
const lid = (o, inset = 0) => {
  const a = o * 1.75, c = Math.cos(a), s = Math.sin(a), w = 66 - inset;
  const p = (d) => [-50 + d * c, 8 + d * s], [ya, za] = p(inset), [yb, zb] = p(92 - inset);
  return [[-w, ya, za], [w, ya, za], [w, yb, zb], [-w, yb, zb]];
};
OK.O.laptop = {
  vb: [-110, -174, 232, 242],
  svg: () => OK.box(-70, -50, 0, 140, 100, 8)
    + [-30, -8, 14].map((y) => OK.poly([[-50, y, 8], [50, y, 8], [50, y + 14, 8], [-50, y + 14, 8]], 'fd')).join('')
    + OK.poly(lid(1), 'fr', 'lid') + OK.poly(lid(1, 7), 'ft', 'scr'),
  pose: (P, s, T) => {
    P.lid.setAttribute('points', pts(lid(s.open)));
    P.scr.setAttribute('points', pts(lid(s.open, 7)));
    P.scr.style.display = s.open < 0.35 ? 'none' : '';
    P.scr.style.fill = s.on > 0.01 ? `rgba(${T.glow},${(0.2 + 0.5 * s.on).toFixed(2)})` : '';
  },
};

// terminal (a command line, a run): a dark panel; fill types its rows one by one, active blinks the accent caret
const ROWS = [[66, 74], [50, 40], [34, 58], [18, 30]];
OK.O.terminal = {
  vb: [-70, -150, 148, 196],
  svg: () => OK.box(-70, -8, 0, 140, 8, 100)
    + face([[-70, 84], [70, 84], [70, 100], [-70, 100]], 0, 'ft')
    + [-58, -48, -38].map((x) => face(circ(x, 92, 3.5, 10), 0, 'fd')).join('')
    + ROWS.map(([z, w], i) => face([[-56, z], [-56 + w, z], [-56 + w, z + 7], [-56, z + 7]], 0, 'fd', 'r' + i)).join('')
    + face([[0, 0], [6, 0], [6, 10], [0, 10]], 0, 'fa', 'car'),
  pose: (P, s) => {
    const n = s.fill * ROWS.length;
    ROWS.forEach(([z, w], i) => {
      const k = c01(n - i), r = P['r' + i];
      r.style.opacity = k > 0 ? '1' : '0';
      r.setAttribute('points', pts([[-56, 0, z], [-56 + w * k, 0, z], [-56 + w * k, 0, z + 7], [-56, 0, z + 7]]));
    });
    const i = Math.min(ROWS.length - 1, Math.floor(n)), [z, w] = ROWS[i], p = at(-52 + w * c01(n - i), 0, z - 1);
    P.car.setAttribute('transform', `translate(${p[0]} ${p[1]})`);
    P.car.style.opacity = s.active > 0.5 && Math.floor(s.t * 2.5) % 2 === 0 ? '1' : '0';
  },
};

// browser (a site, a web app): a window with an address bar, a picture and text; active lights the picture,
// fill highlights the text lines (a passage being read)
OK.O.browser = {
  vb: [-80, -164, 166, 214],
  svg: () => OK.box(-80, -8, 0, 160, 8, 110)
    + face([[-80, 94], [80, 94], [80, 110], [-80, 110]], 0, 'ft')
    + face([[-40, 98], [52, 98], [52, 106], [-40, 106]], 0, 'fd')
    + [-70, -62, -54].map((x) => face(circ(x, 102, 3, 10), 0, 'fd')).join('')
    + face([[-66, 22], [-8, 22], [-8, 80], [-66, 80]], 0, 'ft', 'img')
    + face([[-56, 30], [-36, 58], [-24, 44], [-16, 30]], 0, 'fd')
    + [72, 58, 44, 30].map((z, i) => { const x1 = i % 2 ? 50 : 66; return face([[4, z], [x1, z], [x1, z + 6], [4, z + 6]], 0, 'fd', 'l' + i); }).join(''),
  pose: (P, s, T) => {
    P.img.style.fill = s.active > 0.01 ? `rgba(${T.glow},${(0.25 + 0.45 * s.active).toFixed(2)})` : '';
    for (let i = 0; i < 4; i++) P['l' + i].style.fill = s.fill * 4 > i + 0.5 ? T.on : '';
  },
};

// phone (a mobile app, a message): a slab with a screen; on lights the screen, fill slides a notification in
OK.O.phone = {
  vb: [-38, -148, 78, 172],
  svg: () => OK.box(-30, -6, 0, 60, 6, 118)
    + face([[-24, 8], [24, 8], [24, 108], [-24, 108]], 0, 'ft', 'scr')
    + face([[-8, 111], [8, 111], [8, 114], [-8, 114]], 0, 'fd')
    + face([[-20, 80], [20, 80], [20, 98], [-20, 98]], 0, 'fa', 'note'),
  pose: (P, s, T) => {
    P.scr.style.fill = s.on > 0.01 ? `rgba(${T.glow},${(0.2 + 0.45 * s.on).toFixed(2)})` : '';
    P.note.style.opacity = s.fill.toFixed(3);
    P.note.setAttribute('transform', `translate(0 ${f1(14 * (1 - s.fill))})`);
  },
};

// chat (a conversation, an answer): a question bubble and an accent answer; fill brings the answer in,
// play shows the typing dots in it
OK.O.chat = {
  vb: [-72, -158, 152, 216],
  svg: () => OK.box(-70, -6, 60, 90, 6, 50) + face([[-60, 60], [-70, 46], [-44, 60]], 0, 'fl')
    + face([[-56, 92], [6, 92], [6, 98], [-56, 98]], 0, 'fd') + face([[-56, 76], [-14, 76], [-14, 82], [-56, 82]], 0, 'fd')
    + `<g data-p="b1">${OK.box(-20, -6, 4, 90, 6, 42, {l: 'fa'})}${face([[56, 4], [70, -8], [44, 4]], 0, 'fa')}`
    + [8, 24, 40].map((x, i) => face(circ(x, 25, 4.5, 10), 0, 'fi', 'd' + i)).join('') + '</g>',
  pose: (P, s) => {
    P.b1.style.opacity = s.fill.toFixed(3);
    P.b1.setAttribute('transform', `translate(${f1(10 * (1 - s.fill))} ${f1(8 * (1 - s.fill))})`);
    for (let i = 0; i < 3; i++) P['d' + i].style.opacity = s.play > 0.01 ? (0.35 + 0.65 * Math.max(0, Math.sin(s.t * 7 - i * 0.9))).toFixed(3) : '1';
  },
};

// code (</>): an extruded glyph that faces the camera like a sign (drawn in screen coordinates u right / v up and
// mapped onto the plane y 0, so the chevrons stay upright under the iso shear); active lights the slash,
// play breathes the brackets outward
const upright = (uv) => uv.map(([u, v]) => { const x = u / 0.866; return [x, 0.5 * x + v]; });
// the brackets stand 8 units clear of the slash at rest: the depth plate sits 7 units right of its front, so less looks touching
const LT = upright([[-30, 80], [-66, 50], [-30, 20], [-22, 30], [-48, 50], [-22, 70]]);
const RT = upright([[30, 80], [66, 50], [30, 20], [22, 30], [48, 50], [22, 70]]);
const SL = upright([[4, 86], [13, 86], [-4, 14], [-13, 14]]);
OK.O.code = {
  vb: [-78, -96, 162, 90],
  svg: () => plate(LT, 8, {id: 'lt'}) + plate(SL, 8, {id: 'sl'}) + plate(RT, 8, {id: 'rt'}),
  pose: (P, s, T) => {
    const d = 6 * s.play * Math.abs(Math.sin(s.t * 3));
    P.lt.setAttribute('transform', `translate(${f1(-d)} 0)`);
    P.rt.setAttribute('transform', `translate(${f1(d)} 0)`);
    P.sl.lastChild.style.fill = s.active > 0.5 ? T.accent : '';
  },
};

// graph (a knowledge graph, a pipeline): nodes on the floor; fill draws the edges one by one, active lights the hub
const NODES = [[0, 0], [-62, -34], [62, -40], [-40, 62], [56, 50]];
OK.O.graph = {
  vb: [-112, -76, 224, 146],
  svg: () => NODES.slice(1).map(([x, y], i) => { const a = at(0, 0, 10), b = at(x, y, 10);
      return `<line class="ln" data-p="e${i}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" pathLength="1" style="vector-effect:none;stroke-width:5;stroke-dasharray:1;stroke-dashoffset:1"/>`; }).join('')
    + NODES.map(([x, y], i) => OK.cyl(x, y, 0, i ? 14 : 20, i ? 10 : 14, {id: 'n' + i})).join(''),
  pose: (P, s, T) => {
    for (let i = 0; i < 4; i++) P['e' + i].style.strokeDashoffset = (1 - c01(s.fill * 4 - i)).toFixed(4);
    P.n0.lastChild.style.fill = s.active > 0.5 ? T.accent : '';
  },
};

// server (a backend, hosting, an API): three rack units; active lights the LEDs, play makes them blink in turn
OK.O.server = {
  vb: [-86, -150, 172, 204],
  svg: () => [0, 1, 2].map((i) => OK.box(-50, -40, i * 34, 100, 80, 28)
    + OK.poly([[-38, 40, i * 34 + 10], [10, 40, i * 34 + 10], [10, 40, i * 34 + 16], [-38, 40, i * 34 + 16]], 'fd')
    + OK.poly([[26, 40, i * 34 + 9], [36, 40, i * 34 + 9], [36, 40, i * 34 + 17], [26, 40, i * 34 + 17]], 'fd', 'led' + i)).join(''),
  pose: (P, s, T) => {
    for (let i = 0; i < 3; i++) {
      const on = s.active > 0.5, blink = s.play > 0.01 && Math.floor(s.t * 4 + i) % 3 !== 0 ? 0.35 : 1;
      P['led' + i].style.fill = on ? T.on : '';
      P['led' + i].style.opacity = on ? String(blink) : '1';
    }
  },
};

// ---------- tools ----------

// cloud (a hosted service, sync, deploy): a puffy plate; active shows the upload arrow, play bobs it
const CL = [[-40, 40, 28], [0, 58, 36], [40, 40, 28]];
const CLOUD = (() => {
  const top = [], bot = [];
  for (let x = -68; x <= 68.001; x += 4) {
    let zt = -Infinity;
    for (const [cx, cz, r] of CL) if (Math.abs(x - cx) <= r) zt = Math.max(zt, cz + Math.sqrt(r * r - (x - cx) ** 2));
    const [sx, sz, sr] = CL[x < 0 ? 0 : 2], dx = Math.abs(x - sx);
    top.push([x, zt]); bot.push([x, Math.abs(x) <= 40 ? 12 : sz - Math.sqrt(Math.max(0, sr * sr - dx * dx))]);
  }
  return [...top, ...bot.reverse()];
})();
OK.O.cloud = {
  vb: [-66, -112, 144, 130],
  svg: () => plate(CLOUD, 14) + face([[-8, 22], [8, 22], [8, 42], [18, 42], [0, 62], [-18, 42], [-8, 42]], 0, 'fa', 'up'),
  pose: (P, s) => {
    P.up.style.opacity = s.active.toFixed(3);
    P.up.setAttribute('transform', `translate(0 ${f1(-6 * s.play * Math.abs(Math.sin(s.t * 3)))})`);
  },
};

// lock (security, a login, a paywall): a body and a shackle; open lifts the shackle, active lights the keyhole
const SHACKLE = (() => {
  const o = [], i = [];
  for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; o.push([28 * Math.cos(a), 90 + 28 * Math.sin(a)]); i.push([18 * Math.cos(a), 90 + 18 * Math.sin(a)]); }
  return [[28, 66], ...o, [-28, 66], [-18, 66], ...i.reverse(), [18, 66]];
})();
OK.O.lock = {
  vb: [-54, -146, 108, 180],
  svg: () => `<g data-p="sh">${plate(SHACKLE, 8)}</g>` + OK.box(-40, -14, 0, 80, 28, 70)
    + OK.disc(0, 14, 42, 9, 'y', 'fd', 'kh') + OK.poly([[-3, 14, 20], [3, 14, 20], [3, 14, 38], [-3, 14, 38]], 'fd', 'ks'),
  pose: (P, s, T) => {
    P.sh.setAttribute('transform', `translate(0 ${f1(-16 * s.open)})`);
    for (const e of [P.kh, P.ks]) e.style.fill = s.active > 0.5 ? T.on : '';
  },
};

// gear (settings, automation, a process): a cog facing us; spin turns it, play keeps it turning
const cog = (a0) => Array.from({length: 40}, (_, k) => {
  const a = a0 + k / 40 * Math.PI * 2, r = k % 4 < 2 ? 50 : 38; return [r * Math.cos(a), 60 + r * Math.sin(a)];
});
OK.O.gear = {
  vb: [-50, -128, 110, 132],
  svg: () => plate(cog(0), 10, {id: 'cg'}) + face(circ(0, 60, 14, 20), 0, 'fd'),
  pose: (P, s) => {
    const xz = cog((s.spin + s.t * 0.2 * s.play) * Math.PI * 2);
    P.cg.firstChild.setAttribute('points', pts(xz.map(([x, z]) => [x, -10, z])));
    P.cg.lastChild.setAttribute('points', pts(xz.map(([x, z]) => [x, 0, z])));
  },
};

// magnifier (search, a detail, review): a ring on a handle; active lights the glass, play runs a glint across it
OK.O.magnifier = {
  vb: [-52, -140, 116, 168],
  svg: () => { const a = at(-24, 0, 92), b = at(-12, 0, 102);
    return plate([[20, 50], [30, 58], [62, 18], [52, 10]], 8) + plate(circ(-10, 80, 40, 32), 8)
      + face(circ(-10, 80, 30, 32), 0, 'ft', 'gl')
      + `<line class="ln" data-p="gn" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" style="opacity:0"/>`; },
  pose: (P, s, T) => {
    P.gl.style.fill = s.active > 0.01 ? `rgba(${T.glow},${(0.2 + 0.4 * s.active).toFixed(2)})` : '';
    const u = (s.t * 0.7) % 1;
    P.gn.style.opacity = s.play > 0.01 ? (s.play * Math.sin(Math.PI * u)).toFixed(3) : '0';
    P.gn.setAttribute('transform', `translate(${f1(30 * u * 0.866)} ${f1(30 * u * 0.5)})`);
  },
};

// star (GitHub stars, a rating, favourites): a five-point star; active fills it with the accent, play twinkles it
const STAR = Array.from({length: 10}, (_, i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 52; return [r * Math.cos(a), 60 + r * Math.sin(a)]; });
OK.O.star = {
  vb: [-52, -128, 114, 134],
  svg: () => plate(STAR, 10, {id: 'st'}),
  pose: (P, s, T) => {
    P.st.lastChild.style.fill = s.active > 0.5 ? T.accent : '';
    const [cx, cy] = OK.iso(0, 0, 60), k = 1 + 0.06 * s.play * Math.sin(s.t * 5);
    P.st.setAttribute('transform', `translate(${f1(cx)} ${f1(cy)}) scale(${k.toFixed(4)}) translate(${f1(-cx)} ${f1(-cy)})`);
  },
};

// plugin (a plugin, an integration): two puzzle pieces; open slides the second one in until it covers the knob,
// active tints it
OK.O.plugin = {
  vb: [-110, -90, 232, 164],
  svg: () => OK.box(-84, -37, 0, 74, 74, 20) + OK.cyl(4, 0, 0, 12, 20)
    + `<g data-p="pb">${OK.box(4, -37, 0, 74, 74, 20)}</g>`,
  pose: (P, s, T) => {
    const d = 22 * (1 - s.open);
    P.pb.setAttribute('transform', `translate(${f1(d * 0.866)} ${f1(d * 0.5)})`);
    P.pb.querySelectorAll('polygon')[2].style.fill = s.active > 0.5 ? `rgba(${T.glow},.45)` : '';
  },
};

// camera (filming, a video, the take): a body, a lens and a viewfinder; play blinks the REC dot, active lights the lens
OK.O.camera = {
  vb: [-78, -114, 156, 164],
  svg: () => { const r = at(38, 30, 50);
    return OK.box(-50, -30, 0, 100, 60, 60) + OK.box(-30, -20, 60, 40, 30, 18)
      + OK.disc(6, 30, 30, 22, 'y', 'ft') + OK.disc(6, 30, 30, 13, 'y', 'fd', 'lens')
      + `<circle class="fa" data-p="rec" cx="${r[0]}" cy="${r[1]}" r="6"/>`; },
  pose: (P, s, T) => {
    P.lens.style.fill = s.active > 0.01 ? `rgba(${T.glow},${(0.3 + 0.5 * s.active).toFixed(2)})` : '';
    P.rec.style.opacity = s.play > 0.01 ? (Math.floor(s.t * 2) % 2 ? '0.25' : '1') : '0.5';
  },
};

// mic (a voice, a recording, a podcast): a capsule on a stand; play sends waves out both sides, active lights its top
OK.O.mic = {
  vb: [-64, -134, 128, 158],
  svg: () => {
    const [cx, cy] = OK.iso(0, 0, 82);
    const waves = [0, 1].map((i) => [-1, 1].map((side) => { const R = 40 + 16 * i, x = f1(cx + side * R * 0.5);
      return `<path class="ln" data-p="w${i}${side > 0 ? 'r' : 'l'}" d="M${x},${f1(cy - R * 0.866)} A${R},${R} 0 0 ${side > 0 ? 1 : 0} ${x},${f1(cy + R * 0.866)}" style="opacity:0"/>`;
    }).join('')).join('');
    return OK.cyl(0, 0, 0, 30, 6) + OK.box(-4, -4, 6, 8, 8, 48) + OK.cyl(0, 0, 54, 22, 52, {id: 'cap'})
      + [66, 78, 90].map((z) => OK.poly([[25.5, 5.7, z], [5.7, 25.5, z], [5.7, 25.5, z + 4], [25.5, 5.7, z + 4]], 'fd')).join('') + waves;
  },
  pose: (P, s, T) => {
    P.cap.lastChild.style.fill = s.active > 0.5 ? T.accent : '';
    for (const i of [0, 1]) for (const side of ['l', 'r'])
      P['w' + i + side].style.opacity = (s.play * Math.pow(0.5 + 0.5 * Math.sin(s.t * 6 - i * 1.2), 2)).toFixed(3);
  },
};

// montage (editing, cuts): a film strip with scissors over it; struck cuts the strip (its halves part),
// open opens the blades, play snips
const PV = [-40, 72];
const blade = (phi) => {
  const dx = Math.cos(phi), dz = Math.sin(phi), nx = -dz * 6, nz = dx * 6;
  return [[PV[0] + nx, PV[1] + nz], [PV[0] + 64 * dx, PV[1] + 64 * dz], [PV[0] - nx, PV[1] - nz]];
};
const grip = (phi) => circ(PV[0] - 34 * Math.cos(phi), PV[1] - 34 * Math.sin(phi), 11, 16);
OK.O.montage = {
  vb: [-106, -146, 212, 210],
  svg: () => [0, 1].map((h) => `<g data-p="h${h}">${OK.box(h ? 2 : -92, -18, 0, 90, 36, 6)}`
      + [0, 1, 2, 3].map((k) => { const x0 = (h ? 10 : -84) + k * 21;
        return OK.poly([[x0, -10, 6], [x0 + 16, -10, 6], [x0 + 16, 10, 6], [x0, 10, 6]], 'fd'); }).join('') + '</g>').join('')
    + face(blade(-0.9), 0, 'ft', 'b0') + face(blade(-0.9), 0, 'ft', 'b1')
    + face(grip(-0.9), 0, 'fl', 'g0') + face(grip(-0.9), 0, 'fl', 'g1')
    + face(circ(PV[0], PV[1], 4, 10), 0, 'fa'),
  pose: (P, s) => {
    const th = 0.06 + 0.3 * c01(s.open + s.play * 0.5 * (1 + Math.sin(s.t * 9))), d = 8 * s.struck;
    for (const [i, sg] of [[0, 1], [1, -1]]) {
      const phi = -0.9 + sg * th;
      P['b' + i].setAttribute('points', pts(blade(phi).map(([x, z]) => [x, 0, z])));
      P['g' + i].setAttribute('points', pts(grip(phi).map(([x, z]) => [x, 0, z])));
    }
    P.h0.setAttribute('transform', `translate(${f1(-d * 0.866)} ${f1(-d * 0.5)})`);
    P.h1.setAttribute('transform', `translate(${f1(d * 0.866)} ${f1(d * 0.5)})`);
  },
};
})();
