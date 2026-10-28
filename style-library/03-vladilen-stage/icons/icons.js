// Line icons of the stage style, drawn for this kit (a real product logo comes as an image path instead). Design system rule: 1.5 px line on a
// 24 px grid, round caps and joins; the part marked class='a' is the one accent detail. Cards render them with
// window.stageIcon(name) and draw them on with stroke-dashoffset. The object literal below is plain JSON, so Node
// reads the list of names from this file too (scripts/long/lib/plan.mjs) to validate CARDS.json.
window.STAGE_ICONS = {
  "agent": ["<rect x='4' y='7' width='16' height='12' rx='3'/>", "<path d='M12 3v4'/>", "<circle cx='12' cy='3' r='0.9'/>", "<circle class='a' cx='9' cy='12.5' r='1.2'/>", "<circle class='a' cx='15' cy='12.5' r='1.2'/>", "<path d='M9.5 16.2h5'/>"],
  "terminal": ["<rect x='3' y='4' width='18' height='16' rx='2.5'/>", "<path d='M7 9.5l3 2.5-3 2.5'/>", "<path class='a' d='M12.5 15h4.5'/>"],
  "hash": ["<path d='M9.5 4L7.5 20'/>", "<path d='M16.5 4l-2 16'/>", "<path class='a' d='M4.5 9h15.5'/>", "<path d='M4 15h15.5'/>"],
  "phone": ["<rect x='7' y='2.5' width='10' height='19' rx='2.5'/>", "<path class='a' d='M11 18.5h2'/>"],
  "desktop": ["<rect x='3' y='4' width='18' height='12' rx='2'/>", "<path d='M12 16v4'/>", "<path class='a' d='M8 20h8'/>"],
  "chat": ["<path d='M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4.5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z'/>", "<path class='a' d='M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01'/>"],
  "prompt": ["<rect x='3' y='6' width='18' height='12' rx='2'/>", "<path d='M6.5 12h7'/>", "<path class='a' d='M16.5 9v6'/>"],
  "user": ["<circle cx='12' cy='8' r='4'/>", "<path class='a' d='M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'/>"],
  "badge": ["<rect x='3' y='6' width='18' height='14' rx='2'/>", "<path d='M9 6V4.5h6V6'/>", "<circle class='a' cx='8.5' cy='12.5' r='2'/>", "<path d='M6 17c.6-1.3 1.5-2 2.5-2s1.9.7 2.5 2'/>", "<path d='M14 11.5h4M14 15h3'/>"],
  "box": ["<path d='M12 3l8 4.5v9L12 21l-8-4.5v-9z'/>", "<path class='a' d='M4 7.5l8 4.5 8-4.5'/>", "<path d='M12 12v9'/>"],
  "target": ["<circle cx='12' cy='12' r='9'/>", "<circle cx='12' cy='12' r='5.5'/>", "<circle class='a' cx='12' cy='12' r='2'/>"],
  "gear": ["<circle class='a' cx='12' cy='12' r='3'/>", "<circle cx='12' cy='12' r='6.5'/>", "<path d='M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1'/>"],
  "flow": ["<circle cx='6' cy='6' r='2.2'/>", "<circle cx='18' cy='6' r='2.2'/>", "<circle class='a' cx='12' cy='18' r='2.2'/>", "<path d='M8.2 6h7.6M7.2 7.9l3.7 8.2M16.8 7.9l-3.7 8.2'/>"],
  "doc": ["<path d='M6 3h8l4 4v14H6z'/>", "<path d='M14 3v4h4'/>", "<path class='a' d='M9 12h6'/>", "<path d='M9 15.5h6M9 8.5h2.5'/>"],
  "layers": ["<path class='a' d='M12 3l9 5-9 5-9-5z'/>", "<path d='M3 12.5l9 5 9-5'/>", "<path d='M3 16.5l9 5 9-5'/>"],
  "key": ["<circle cx='8' cy='15' r='4'/>", "<path class='a' d='M11 12l8-8'/>", "<path d='M16 7l2 2M14 9l2 2'/>"],
  "lock": ["<rect x='5' y='10.5' width='14' height='10.5' rx='2'/>", "<path d='M8 10.5V7.5a4 4 0 0 1 8 0v3'/>", "<path class='a' d='M12 14.5v2.5'/>"],
  "tasks": ["<rect x='4' y='3' width='16' height='18' rx='2'/>", "<path class='a' d='M7.5 9l1.5 1.5L11.5 8'/>", "<path d='M14 9.5h3M7.5 15l1.5 1.5L11.5 14M14 15.5h3'/>"],
  "briefcase": ["<rect x='3' y='7.5' width='18' height='12' rx='2'/>", "<path d='M9 7.5V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2'/>", "<path class='a' d='M3 12.5h18'/>"],
  "sparkle": ["<path class='a' d='M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'/>", "<path d='M18.5 15.5v4M16.5 17.5h4'/>"],
  "bolt": ["<path class='a' d='M13 2L5 13h6l-1 9 8-11h-6z'/>"],
  "bulb": ["<path d='M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.3 1.1 2.2h5c0-.9.3-1.6 1.1-2.2A6 6 0 0 0 12 3z'/>", "<path class='a' d='M9.5 18.5h5'/>", "<path d='M10.5 21h3'/>"],
  "arrow": ["<path d='M4 12h15'/>", "<path class='a' d='M14 7l5 5-5 5'/>"],
  "calendar": ["<rect x='3' y='5' width='18' height='16' rx='2'/>", "<path d='M3 10h18M8 3v4M16 3v4'/>", "<circle class='a' cx='12' cy='15' r='1.2'/>"],
  "mail": ["<rect x='3' y='5' width='18' height='14' rx='2'/>", "<path class='a' d='M3.5 6.5l8.5 6 8.5-6'/>"],
  "clock": ["<circle cx='12' cy='12' r='9'/>", "<path class='a' d='M12 7v5l3.5 2'/>"],
  "check": ["<circle cx='12' cy='12' r='9'/>", "<path class='a' d='M8 12.5l2.7 2.7L16 9.5'/>"],
  "question": ["<circle cx='12' cy='12' r='9'/>", "<path class='a' d='M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7'/>", "<path d='M12 17h.01'/>"],
  "chart": ["<path d='M4 4v16h16'/>", "<path class='a' d='M7.5 15l4-4 3 3 5-6'/>"],
  "eye": ["<path d='M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'/>", "<circle class='a' cx='12' cy='12' r='3'/>"]
};

// SVG markup of a named icon; an unknown name falls back to "sparkle" so a typo never breaks a render
// (the plan check reports unknown names before rendering).
window.stageIcon = function (name, strokeWidth) {
  const parts = window.STAGE_ICONS[name] || window.STAGE_ICONS.sparkle;
  return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='" + (strokeWidth || 1.5) + "' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + parts.join("") + "</svg>";
};

// Fills every element with class "ic" that holds an icon name, and returns a function that adds the draw-on
// tweens for one rendered icon to a timeline: each line is drawn from its start, deterministic.
window.stageIconsInit = function (root, strokeWidth) {
  root.querySelectorAll(".ic").forEach(function (el) {
    const name = el.textContent.trim();
    if (/^file:|\.(png|jpe?g|webp|svg)$/i.test(name)) { el.innerHTML = "<img alt='' src='" + name + "'>"; el.classList.add("logo"); }
    else if (name) el.innerHTML = window.stageIcon(name, el.dataset.stroke || strokeWidth);
  });
  return function drawOn(tl, el, at, duration, ease) {
    el.querySelectorAll("path, circle, rect").forEach(function (shape, i) {
      const len = Math.ceil(shape.getTotalLength ? shape.getTotalLength() : 60) + 1;
      shape.style.strokeDasharray = len;
      tl.fromTo(shape, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: duration || 0.8, ease: ease || "power2.inOut" }, at + i * 0.06);
    });
  };
};
