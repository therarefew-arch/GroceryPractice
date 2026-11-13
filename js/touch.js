'use strict';
// =====================================================================
//  Phone / tablet controls: a floating joystick (thumb down anywhere on
//  the left) and buttons (right). Turned on automatically on touch screens; add ?touch=1 to the
//  URL to force it on, or ?touch=0 to turn it off.
// =====================================================================
const TOUCH = (() => {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
})();

function touchInteract() {
  if (!G || RT.modal || UI.open || isPaused() || G.player.work) return;
  const it = getInteraction();
  if (it && it.fn) it.fn();
}

function setupTouch() {
  if (!TOUCH) return;
  document.body.classList.add('touch');
  // Start zoomed in so the camera follows you; the whole store is too small on a phone.
  let saved = null; try { saved = localStorage.getItem('groceryPractice.zoom'); } catch (e) { /* ignore */ }
  if (!saved) { CAM.zoom = CAM.target = 2; }

  const el = document.createElement('div');
  el.id = 'touch';
  el.innerHTML = `
    <div id="joy"><div id="joy-knob"></div></div>
    <div id="tbtns">
      <button id="t-e" class="tbig">E</button>
      <button id="t-q" class="tq hidden">Q</button>
      <button id="t-run" class="tmid">RUN</button>
      <div class="tsmall">
        <button id="t-zin">＋</button><button id="t-zout">－</button><button id="t-pause">⏸</button><button id="t-full">⛶</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  // ---- joystick: it floats. Put your thumb down anywhere in the left part of the
  // screen and the stick starts right there; drag past the edge and it follows you.
  // A quick tap (no drag) passes through to the game, so you can still tap crew.
  const zone = document.createElement('div'); zone.id = 'joyzone'; el.prepend(zone);
  const joy = el.querySelector('#joy'), knob = el.querySelector('#joy-knob');
  let jid = null, cx = 0, cy = 0, sx = 0, sy = 0, t0 = 0, moved = false;
  const R = () => joy.offsetWidth / 2;
  const setBase = (x, y) => { const r = R(); cx = x; cy = y; joy.style.left = (cx - r) + 'px'; joy.style.top = (cy - r) + 'px'; joy.style.bottom = 'auto'; };
  const rest = () => { joy.style.left = joy.style.top = joy.style.bottom = ''; joy.classList.remove('live'); knob.style.transform = ''; RT.touchJoy = { x: 0, y: 0 }; };
  const move = e => {
    const r = R();
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > r) { setBase(cx + dx / l * (l - r), cy + dy / l * (l - r)); dx = dx / l * r; dy = dy / l * r; }
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) moved = true;
    knob.style.transform = `translate(${dx * 0.6}px, ${dy * 0.6}px)`;
    RT.touchJoy = { x: dx / r, y: dy / r }; // analog: any direction, push further to go faster
  };
  const tapThrough = (x, y) => {
    const b = canvas.getBoundingClientRect();
    if (x < b.left || x > b.right || y < b.top || y > b.bottom) return;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
  };
  zone.addEventListener('pointerdown', e => {
    if (jid != null) return;
    e.preventDefault(); jid = e.pointerId; sx = e.clientX; sy = e.clientY; t0 = performance.now(); moved = false;
    try { zone.setPointerCapture(jid); } catch (err) { /* ignore */ }
    const r = R();
    setBase(clamp(e.clientX, r + 4, innerWidth - r - 4), clamp(e.clientY, r + 4, innerHeight - r - 4));
    joy.classList.add('live');
    move(e);
  });
  zone.addEventListener('pointermove', e => { if (e.pointerId === jid) move(e); });
  const end = (e, cancel) => {
    if (e.pointerId !== jid) return;
    jid = null; rest();
    if (!cancel && !moved && performance.now() - t0 < 300) tapThrough(e.clientX, e.clientY);
  };
  zone.addEventListener('pointerup', e => end(e)); zone.addEventListener('pointercancel', e => end(e, true));
  layoutJoyZone();

  // ---- buttons ----
  const tap = (id, fn) => el.querySelector(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(e); });
  tap('#t-e', () => { RT.keys.TouchE = true; RT.holdT = 0; touchInteract(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.querySelector('#t-e').addEventListener(ev, () => { RT.keys.TouchE = false; }));
  tap('#t-q', () => { if (!G || RT.modal || UI.open || isPaused() || G.player.work) return; const it = getInteraction(); if (it && it.alt && it.alt.fn) it.alt.fn(); });
  tap('#t-run', e => { RT.keys.TouchRun = !RT.keys.TouchRun; e.currentTarget.classList.toggle('on', RT.keys.TouchRun); });
  tap('#t-zin', () => setZoom(CAM.target * 1.25));
  tap('#t-zout', () => setZoom(CAM.target / 1.25));
  tap('#t-pause', () => { RT.paused = !RT.paused; });
  tap('#t-full', () => {
    const d = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
    else if (d.requestFullscreen) d.requestFullscreen().then(() => { try { screen.orientation.lock('landscape'); } catch (e) { /* ignore */ } }).catch(() => {});
    else toast('On iPhone: tap Share → Add to Home Screen to play full screen.', 'info');
  });
  // The action prompt at the bottom is a button too.
  $('prompt').addEventListener('pointerdown', e => { e.preventDefault(); touchInteract(); });
  // Tap a crew member to see their info card (the mouse-hover card on a computer).
  canvas.addEventListener('pointerdown', e => {
    const b = canvas.getBoundingClientRect();
    MOUSE.x = (e.clientX - b.left) * canvas.width / b.width;
    MOUSE.y = (e.clientY - b.top) * canvas.height / b.height;
    MOUSE.in = true;
    clearTimeout(RT.tapTip); RT.tapTip = setTimeout(() => { MOUSE.in = false; }, 3500);
  });
  // No pinch-zoom / double-tap zoom on the page itself.
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  window.addEventListener('orientationchange', () => setTimeout(() => { fit(); layoutJoyZone(); }, 300));
  window.addEventListener('resize', () => setTimeout(layoutJoyZone, 60));
}

// Where the floating joystick listens. Phone upright: everything under the game.
// Sideways: the lower-left of the screen, above the action prompt.
function layoutJoyZone() {
  const zone = $('joyzone'), bar = $('bar'); if (!zone || !bar) return;
  const b = bar.getBoundingClientRect(), H = innerHeight;
  RT.joyLayoutAt = performance.now();
  if (H - b.bottom >= 150) { zone.style.top = Math.round(b.bottom) + 'px'; zone.style.bottom = '0px'; }
  else { zone.style.top = Math.round(H * 0.4) + 'px'; zone.style.bottom = Math.max(0, Math.round(H - b.top)) + 'px'; }
}

// Hide the on-screen controls while the computer or a popup is open.
function touchFrame() {
  if (!TOUCH) return;
  const el = $('touch'); if (!el) return;
  el.classList.toggle('hidden', !!(UI.open || RT.modal || (G && G.player.away)));
  const q = $('t-q'); if (q) { const a = RT.curIt && RT.curIt.alt && RT.curIt.alt.fn; q.classList.toggle('hidden', !a); if (a) q.title = RT.curIt.alt.label; }
  const p = $('t-pause'); if (p) p.textContent = RT.paused ? '▶' : '⏸';
  if (performance.now() - (RT.joyLayoutAt || 0) > 1000) layoutJoyZone();
}

// ---- Add to Home Screen / offline ----
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
setupTouch();
