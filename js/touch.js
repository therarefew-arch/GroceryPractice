'use strict';
// =====================================================================
//  Phone / tablet controls: an on-screen joystick (left) and buttons
//  (right). Turned on automatically on touch screens; add ?touch=1 to the
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

  // ---- joystick ----
  const joy = el.querySelector('#joy'), knob = el.querySelector('#joy-knob');
  let jid = null;
  const setDir = (dx, dy) => {
    const k = RT.keys;
    RT.touchJoy = { x: dx, y: dy }; // analog: any direction, push further to go faster
  };
  const move = e => {
    const b = joy.getBoundingClientRect(), r = b.width / 2;
    let dx = (e.clientX - b.left - r) / r, dy = (e.clientY - b.top - r) / r;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    knob.style.transform = `translate(${dx * r * 0.6}px, ${dy * r * 0.6}px)`;
    setDir(dx, dy);
  };
  const end = () => { jid = null; knob.style.transform = ''; setDir(0, 0); };
  joy.addEventListener('pointerdown', e => { e.preventDefault(); jid = e.pointerId; try { joy.setPointerCapture(jid); } catch (err) { /* ignore */ } move(e); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === jid) move(e); });
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);

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
  window.addEventListener('orientationchange', () => setTimeout(fit, 300));
}

// Hide the on-screen controls while the computer or a popup is open.
function touchFrame() {
  if (!TOUCH) return;
  const el = $('touch'); if (!el) return;
  el.classList.toggle('hidden', !!(UI.open || RT.modal || (G && G.player.away)));
  const q = $('t-q'); if (q) { const a = RT.curIt && RT.curIt.alt && RT.curIt.alt.fn; q.classList.toggle('hidden', !a); if (a) q.title = RT.curIt.alt.label; }
  const p = $('t-pause'); if (p) p.textContent = RT.paused ? '▶' : '⏸';
}

// ---- Add to Home Screen / offline ----
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
setupTouch();
