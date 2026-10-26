/* Reels Studio object scenes — filled in by task 3 of docs/superpowers/plans/2026-10-26-remake-fast-night-motion.md */
(function(){
const OK = window.OK;
OK.run = (cfg) => {
  window.READY = Promise.resolve();
  M.scene({W: 1080, H: 1920, T: cfg.T, bg: null, center: [540, 960], intro: null,
    SH: {none: {w: 0, h: 0, r: 0, bg: '#FFFFFF', cam: 1}}, start: 'none', SEQ: [], extra: () => {}});
  document.getElementById('shape').style.display = 'none';
};
})();
