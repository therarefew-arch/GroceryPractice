'use strict';
// =====================================================================
//  Phone layout (screens narrower than 600px). The desktop layout is untouched.
//  - A bottom tab bar (Store · Today · Crew · Stats · More) that sits above the
//    phone's gesture bar.
//  - Bottom sheets that slide up for the secondary info (swipe down, tap
//    outside or ✕ to close).
//  - A taller game view that fills the space between the top bar and the controls.
//  - Big text and 48px+ buttons (css/style.css, "Phone layout"), a pressed state
//    and a light buzz on every button where the phone supports it.
// =====================================================================
const PHONE_MQ = matchMedia('(max-width: 599px)');
const isPhone = () => PHONE_MQ.matches;
let PHONE_STRIP = 176; // height of the joystick + buttons strip above the tab bar (bigger buttons: js/gestures.js)
const PHONE_TABS = [['floor', '🏪', 'Store'], ['today', '📋', 'Today'], ['crew', '👥', 'Crew'], ['stats', '📊', 'Stats'], ['more', '☰', 'More']];
const SHEET = { kind: null, fn: null, title: '', lastRefresh: 0, touching: false };

// ---------------------------------------------------------------- bottom sheet
function sheetOpen(kind, title, fn) {
  const sh = $('sheet'); if (!sh) return;
  SHEET.kind = kind; SHEET.fn = fn; SHEET.title = title;
  $('sh-title').textContent = title;
  sheetFill();
  $('sh-body').scrollTop = 0;
  sh.classList.remove('hidden', 'closing');
  sh.querySelector('.sh-card').style.transform = '';
  phoneNavState();
}
function sheetFill() {
  if (!SHEET.fn) return;
  const b = $('sh-body'), top = b.scrollTop;
  b.innerHTML = SHEET.fn();
  b.scrollTop = top;
  SHEET.lastRefresh = performance.now();
}
function sheetClose() {
  const sh = $('sheet'); if (!sh || sh.classList.contains('hidden')) return;
  SHEET.kind = null; SHEET.fn = null;
  sh.classList.add('closing');
  setTimeout(() => { if (!SHEET.kind) sh.classList.add('hidden'); sh.classList.remove('closing'); }, 180);
  phoneNavState();
}
const sheetIsOpen = () => !!SHEET.kind;

// ---------------------------------------------------------------- sheet contents
function phoneTodayHTML() {
  const L = G.list || [], p = listProgress();
  const ic = t => t.status === 'done' ? '<span class="good">✓</span>' : t.status === 'missed' ? '<span class="bad">✗</span>' : (t.due <= G.time + 60 ? '<span class="warn">●</span>' : '○');
  const open = L.filter(t => t.status === 'open'), rest = L.filter(t => t.status !== 'open');
  return `<div class="ph-sum"><b>${p.done}/${p.total}</b> done</div>` +
    (L.length ? `<div class="ph-list">${open.concat(rest).map(t => `<div class="ph-item ${t.status}"><span class="ph-ic">${ic(t)}</span><span class="ph-main"><b>${esc(t.label)}</b><small>${esc(t.sub || '')}</small></span><span class="ph-due">${t.mode === 'by' ? 'by' : 'at'}<br>${fmtTime(t.due)}</span></div>`).join('')}</div>` : '<p class="mute">Nothing on the list today.</p>') +
    '<p class="mute">● due within the hour. The full list, recalls and invoices are on the office computer.</p>';
}
function phoneCrewHTML() {
  const on = G.crew.filter(c => onShift(c) && RT.crew[c.id] && RT.crew[c.id].inBuilding);
  const off = G.crew.length - on.length;
  const flag = c => (c.needsCoach ? ' <span class="bad">⚠ coach</span>' : '') + (c.notice ? ' <span class="bad">🚪 notice</span>' : '') + (c.order ? ' <span class="warn">📌</span>' : '');
  return (on.length ? `<div class="ph-list">${on.map(c => {
    const r = RT.crew[c.id], md = moodOf(c);
    return `<button class="ph-crew" onclick="sheetClose(); showOrders(G.crew.find(x => x.id === ${c.id}))"><span class="ph-dot" style="background:${ROLES[c.role].color}"></span><span class="ph-main"><b>${esc(c.name)}${c.lead ? ' ◆' : ''}</b>${flag(c)}<small>${esc(ROLES[c.role].name)} · ${esc(r.intent || r.label || 'Looking for work')}</small></span><span class="ph-mood" title="Morale">${md.icon}<small>${Math.round(c.morale)}</small></span></button>`;
  }).join('')}</div>` : '<p class="mute">Nobody is on the floor right now.</p>') +
    `<p class="mute">${off ? `${plural(off, 'person')} off the floor. ` : ''}Tap someone for orders and their details.</p>`;
}
function phoneStatsHTML() {
  const t = G.today, lp = t.sales > 0 ? t.labor / t.sales * 100 : 0, unread = G.emails.filter(m => !m.read).length, p = listProgress();
  const L = level(), a = xpForLevel(L), b = xpForLevel(L + 1);
  const card = (k, v, s, cls) => `<div class="card"><div class="k">${k}</div><div class="v ${cls || ''}">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  return `<div class="ph-lv"><b>Lv ${L}</b> ${esc(title())}<div class="xpbar"><div style="width:${(G.xp - a) / (b - a) * 100}%"></div></div></div>
    <div class="ph-cards">
    ${card('💵 Sales', money(t.sales), `goal ${money(t.goal)}`, t.sales >= t.goal ? 'good' : '')}
    ${card('🙂 Customers', Math.round(G.sat), 'out of 100', G.sat < 60 ? 'bad' : G.sat < 75 ? 'warn' : 'good')}
    ${card('👷 Labor', t.sales > 0 ? lp.toFixed(1) + '%' : '—', `target ${LABOR_TARGET}%`, lp > 15 ? 'bad' : lp > LABOR_TARGET ? 'warn' : '')}
    ${card('🚚 Truck', G.phase === 'night' ? `${G.trailer.length}` : t.truckDoneAt ? '✓' : truckRemaining(), G.phase === 'night' ? 'pallets' : t.truckDoneAt ? 'done' : 'cases left')}
    ${card('📧 Email', unread, 'unread', unread ? 'warn' : '')}
    ${card('📋 List', `${p.done}/${p.total}`, 'done')}
    ${card('🏦 Bank', money(G.bank), '')}
    ${card('🕒 Store', G.phase === 'night' ? 'Night' : G.phase === 'summary' ? 'Closed' : G.time < OPEN ? 'Pre-open' : 'Open', dayLabel(G.day))}
    </div>`;
}
function phoneMoreHTML() {
  const sp = v => `<button class="${v === 0 ? (RT.paused ? 'on' : '') : (!RT.paused && G.speed === v ? 'on' : '')}" onclick="${v === 0 ? 'RT.paused = !RT.paused' : `setSpeed(${v})`}; sheetFill()">${v === 0 ? (RT.paused ? '▶' : '⏸') : v + '×'}</button>`;
  return `<div class="ph-h">Speed</div><div class="seg ph-seg">${[0, 1, 2, 4].map(sp).join('')}</div>
    <div class="ph-h">Zoom</div><div class="seg ph-seg"><button onclick="setZoom(CAM.target / 1.25)">－ Out</button><button onclick="setZoom(CAM.target * 1.25)">＋ In</button></div>
    <div class="ph-grid">
      <button onclick="sheetClose(); volPopup('music', $('bnav'))">🎵 Music${MUSIC.on ? '' : ' (off)'}</button>
      <button onclick="sheetClose(); volPopup('sfx', $('bnav'))">${FX.muted ? '🔇' : '🔊'} Sound</button>
      <button onclick="saveToSlot(SLOT)">💾 Save</button>
      <button onclick="sheetClose(); UI.loadMenu()">📂 Game menu</button>
      <button onclick="sheetClose(); UI.howToPlay()">📖 How to play</button>
      <button onclick="phoneFull()">⛶ Full screen</button>
    </div>
    <div class="ph-h">Buttons</div>${typeof ctrlPrefsHTML === 'function' ? ctrlPrefsHTML('sheetFill()') : ''}`;
}
function phoneFull() {
  const d = document.documentElement;
  if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
  else if (d.requestFullscreen) d.requestFullscreen().catch(() => {});
  else toast('On iPhone: tap Share → Add to Home Screen to play full screen.', 'info');
}
// The office computer's sections, as a sheet instead of a sideways-scrolling tab row.
function pcPick() {
  sheetOpen('pc', '🖥️ StoreNet', () => `<div class="ph-grid ph-tabs">${(UI.tabList || []).map(([k, l]) => `<button class="${UI.tab === k ? 'on' : ''}" onclick="sheetClose(); UI.setTab('${k}')">${l}</button>`).join('')}</div>`);
}

// ---------------------------------------------------------------- tab bar
function phoneTab(k) {
  if (k === 'floor') { sheetClose(); if (UI.open) UI.closeComputer(); return; }
  if (SHEET.kind === k) { sheetClose(); return; }
  if (!G) return;
  const T = { today: ['📋 Today\'s list', phoneTodayHTML], crew: ['👥 On the floor', phoneCrewHTML], stats: ['📊 Today', phoneStatsHTML], more: ['☰ More', phoneMoreHTML] }[k];
  if (T) sheetOpen(k, T[0], T[1]);
}
function phoneNavState() {
  const nav = $('bnav'); if (!nav) return;
  const blocked = !G || RT.modal || TS.c || IVS.id != null;
  nav.querySelectorAll('button').forEach(b => {
    const k = b.dataset.tab;
    b.classList.toggle('on', SHEET.kind ? SHEET.kind === k : (k === 'floor' && !UI.open));
    b.disabled = blocked ? true : UI.open ? k !== 'floor' : false;
  });
  const fl = nav.querySelector('[data-tab=floor] .bn-l'); if (fl) fl.textContent = UI.open ? 'Log off' : 'Store';
  if (!G) return;
  const badge = (k, n, cls) => { const e = nav.querySelector(`[data-tab=${k}] .bn-badge`); if (!e) return; e.textContent = n; e.className = 'bn-badge ' + (cls || '') + (n ? '' : ' hidden'); };
  badge('today', (G.list || []).filter(t => t.status === 'open' && t.due <= G.time + 60).length, 'warn');
  badge('crew', G.crew.filter(c => c.needsCoach || c.notice).length, 'bad');
  badge('stats', G.emails.filter(m => !m.read).length, 'warn');
}
let phoneLast = 0, phoneHB = 0;
function phoneFrame() {
  if (!isPhone()) return;
  const now = performance.now(); if (now - phoneLast < 250) return; phoneLast = now;
  phoneNavState();
  // the top bar or the prompt changed height (End night button, two-line prompt): re-fit the game view
  const hb = $('hud').offsetHeight + $('bar').offsetHeight;
  if (hb !== phoneHB) { phoneHB = hb; fit(); if (typeof layoutJoyZone === 'function') layoutJoyZone(); }
  if (SHEET.kind && SHEET.kind !== 'more' && SHEET.kind !== 'pc' && !SHEET.touching && now - SHEET.lastRefresh > 1000) sheetFill();
  if (SHEET.kind && (RT.modal || TS.c || IVS.id != null)) sheetClose();
}

// ---------------------------------------------------------------- layout
function phoneLayout() {
  const on = isPhone();
  PHONE_STRIP = Math.round(160 * ((typeof CTRL !== 'undefined' && CTRL.scale) || 1)) + 16;
  document.body.classList.toggle('phone', on);
  const nav = $('bnav');
  document.documentElement.style.setProperty('--nav-h', (on && nav ? nav.offsetHeight : 0) + 'px');
  document.documentElement.style.setProperty('--strip-h', (on && TOUCH ? PHONE_STRIP : 0) + 'px');
  if (!on) sheetClose();
  fit();
  if (typeof layoutJoyZone === 'function') layoutJoyZone();
  OVERLAY = null;
}

(function setupPhone() {
  const nav = document.createElement('nav'); nav.id = 'bnav';
  nav.innerHTML = PHONE_TABS.map(([k, ic, lab]) => `<button data-tab="${k}" aria-label="${lab}"><span class="bn-i">${ic}</span><span class="bn-l">${lab}</span><b class="bn-badge hidden"></b></button>`).join('');
  document.body.appendChild(nav);
  nav.addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) phoneTab(b.dataset.tab); });

  const sh = document.createElement('div'); sh.id = 'sheet'; sh.className = 'hidden';
  sh.innerHTML = '<div class="sh-back"></div><div class="sh-card" role="dialog"><div class="sh-grab"></div><div class="sh-head"><b id="sh-title"></b><button class="sh-x" aria-label="Close">✕</button></div><div class="sh-body" id="sh-body"></div></div>';
  document.body.appendChild(sh);
  sh.querySelector('.sh-back').addEventListener('click', sheetClose);
  sh.querySelector('.sh-x').addEventListener('click', sheetClose);
  // swipe the handle or the title down to close
  const card = sh.querySelector('.sh-card');
  let sy = null;
  ['.sh-grab', '.sh-head'].forEach(s => {
    const el = sh.querySelector(s);
    el.addEventListener('pointerdown', e => { if (e.target.closest('.sh-x')) return; sy = e.clientY; try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } card.style.transition = 'none'; });
    el.addEventListener('pointermove', e => { if (sy == null) return; card.style.transform = `translateY(${Math.max(0, e.clientY - sy)}px)`; });
    const up = e => { if (sy == null) return; const dy = e.clientY - sy; sy = null; card.style.transition = ''; card.style.transform = ''; if (dy > 70) sheetClose(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  // don't rebuild a sheet under a finger that's about to tap it
  sh.addEventListener('pointerdown', () => { SHEET.touching = true; });
  ['pointerup', 'pointercancel'].forEach(ev => sh.addEventListener(ev, () => { setTimeout(() => { SHEET.touching = false; }, 300); }));

  // a light buzz on every button press (Android; iPhones don't allow it from a web page)
  document.addEventListener('pointerdown', e => {
    if (!TOUCH || !e.target.closest || !e.target.closest('button')) return;
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) { /* ignore */ }
  }, true);
  // no long-press text menu or image drag on the game
  document.addEventListener('contextmenu', e => { if (isPhone() && !e.target.closest('input, textarea, select')) e.preventDefault(); });

  const uf = UI.frame; UI.frame = function () { uf.call(this); phoneFrame(); };
  const relayout = () => setTimeout(phoneLayout, 60);
  if (PHONE_MQ.addEventListener) PHONE_MQ.addEventListener('change', relayout); else PHONE_MQ.addListener(relayout);
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(phoneLayout, 300));
  phoneLayout();
})();
