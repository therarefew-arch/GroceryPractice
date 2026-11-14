'use strict';
// =====================================================================
//  Menus:
//   - Title screen: Continue, New game, Load game, Options. 3 save slots.
//   - In game: 💾 saves to your slot, 📂 opens Load / Options / Title.
//   - Options: controls (auto, desktop or phone), music and sound volume,
//     aisle hints on case labels, "Now playing" pop-ups.
//   - 🎵 and 🔊 open a volume slider.
//   - Tap or click does the main action; hold it for more options
//     (the second action, keep going, crew orders, save, go home).
// =====================================================================
const HOLD_MS = 450;
const SETTINGS_KEY = 'groceryPractice.mode'; // 'auto' | 'desktop' | 'phone'
const ctrlMode = () => { try { return localStorage.getItem(SETTINGS_KEY) || 'auto'; } catch (e) { return 'auto'; } };

// ---------------------------------------------------------------- title
const TITLE = { view: 'main', confirm: null };
function showTitle(view) {
  if (G && (G.phase === 'day' || G.phase === 'night')) save();
  G = null; RT.keys = {};
  if (UI.open) UI.closeComputer();
  UI.hideModal(); if (IVS.id != null) ivsClose();
  let el = $('title');
  if (!el) { el = document.createElement('div'); el.id = 'title'; document.body.appendChild(el); }
  try { el.style.setProperty('--bgimg', `url(${BG.toDataURL()})`); } catch (e) { /* ignore */ }
  el.classList.remove('hidden');
  TITLE.view = view || 'main'; TITLE.confirm = null;
  titleRender();
}
function hideTitle() { const el = $('title'); if (el) el.classList.add('hidden'); }
function latestSlot() {
  let best = 0, at = -1;
  for (let n = 1; n <= SLOTS; n++) { const m = slotMeta(n); if (m && (m.at || 0) > at) { at = m.at || 0; best = n; } }
  return best;
}
function slotLine(m) {
  if (!m) return '<span class="mute">Empty</span>';
  const when = m.at ? new Date(m.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  return `${m.day ? `<b>${esc(dayLabel(m.day))}</b>` : '<b>Saved store</b>'}${m.lvl ? `<div>Lv ${m.lvl} · ${esc(m.title || '')} · bank ${money(m.bank || 0)}</div>` : ''}${when ? `<div class="mute">Saved ${esc(when)}</div>` : ''}`;
}
function titleRender() {
  const el = $('title'); if (!el) return;
  const v = TITLE.view;
  let body = '';
  if (TITLE.confirm) {
    const c = TITLE.confirm;
    body = `<h2>${esc(c.title)}</h2><p>${esc(c.body)}</p><div class="tt-row"><button onclick="TITLE.confirm=null;titleRender()">Cancel</button><button class="danger" onclick="const f=TITLE.confirm.fn;TITLE.confirm=null;f()">${esc(c.yes)}</button></div>`;
  } else if (v === 'main') {
    const last = latestSlot();
    body = `<div class="tt-menu">
      ${last ? `<button class="primary" onclick="playSlot(${last})">▶ Continue <span class="tt-sub">Slot ${last}${slotMeta(last).day ? ' · Day ' + slotMeta(last).day : ''}</span></button>` : ''}
      <button class="${last ? '' : 'primary'}" onclick="TITLE.view='new';titleRender()">✚ New game</button>
      <button ${last ? '' : 'disabled'} onclick="TITLE.view='load';titleRender()">📂 Load game</button>
      <button onclick="TITLE.view='guide';titleRender()">📖 How to play</button>
      <button onclick="TITLE.view='options';titleRender()">⚙ Options</button></div>`;
  } else if (v === 'new' || v === 'load') {
    body = `<h2>${v === 'new' ? '✚ New game: pick a slot' : '📂 Load game'}</h2><div class="slots">${slotCardsHTML(v, false)}</div><div class="tt-row"><button onclick="TITLE.view='main';titleRender()">← Back</button></div>`;
  } else if (v === 'guide') {
    body = `<h2>📖 How to play</h2>${guideHTML(0)}<div class="tt-row"><button onclick="TITLE.view='main';titleRender()">← Back</button></div>`;
  } else if (v === 'options') {
    body = `<h2>⚙ Options</h2>${optionsHTML()}<div class="tt-row"><button onclick="TITLE.view='main';titleRender()">← Back</button></div>`;
  }
  el.innerHTML = `<div class="tt-wrap">
    <div class="tt-logo"><div class="tt-l1">GROCERY</div><div class="tt-l2">PRACTICE</div><div class="tt-tag">Store manager simulator</div></div>
    <div class="tt-panel">${body}</div>
    <div class="tt-ver">v${VERSION}${G ? '' : ' · tap anywhere for music'}</div></div>`;
}
// Slot cards, for the title screen (inGame false) or the in-game Load box (inGame true).
function slotCardsHTML(mode, inGame) {
  let h = '';
  for (let n = 1; n <= SLOTS; n++) {
    const m = slotMeta(n), cur = inGame && n === SLOT;
    let btns = '';
    if (mode === 'new') btns = m ? `<button class="danger" onclick="askSlot('Start over in slot ${n}?', 'The store saved in slot ${n} will be erased. This can\\'t be undone.', 'Erase and start', () => newInSlot(${n}))">Overwrite</button>` : `<button class="primary" onclick="newInSlot(${n})">Start here</button>`;
    else if (m) btns = `<button class="primary" onclick="playSlot(${n})">${cur ? 'Reload' : 'Play'}</button><button class="danger" onclick="askSlot('Delete slot ${n}?', 'The store saved in slot ${n} will be erased. This can\\'t be undone.', 'Delete', () => { clearSlot(${n}); ${inGame ? (cur ? 'showTitle()' : 'UI.loadMenu()') : "titleRender()"}; })">Delete</button>`;
    else btns = inGame ? `<button onclick="saveToSlot(${n})">Save here</button>` : '';
    h += `<div class="slot${cur ? ' cur' : ''}"><div class="slot-n">SLOT ${n}${cur ? ' · playing' : ''}</div><div class="slot-i">${slotLine(m)}</div><div class="slot-b">${btns}</div></div>`;
  }
  return h;
}
function askSlot(title, body, yes, fn) {
  if (G) UI.ask(title, body, yes, fn, true);
  else { TITLE.confirm = { title, body, yes, fn }; titleRender(); }
}
function playSlot(n) {
  if (G && (G.phase === 'day' || G.phase === 'night')) save();
  UI.hideModal(); if (UI.open) UI.closeComputer();
  if (!load(n)) { toast('That save could not be loaded.', 'bad'); return; }
  hideTitle();
  try { localStorage.setItem('groceryPractice.lastSlot', String(n)); } catch (e) { /* ignore */ }
  if (G.phase === 'summary') UI.showSummary(G.lastResult);
  toast(`📂 Slot ${n}: ${dayLabel(G.day)}`, 'info');
}
function newInSlot(n) {
  clearSlot(n); SLOT = n;
  hideTitle(); UI.hideModal();
  newGame(); save();
  UI.showWelcome();
}
function saveToSlot(n) {
  if (!G) return;
  SLOT = n; save(); UI.hideModal();
  toast(`💾 Saved to slot ${n}.`, 'good');
}

// ---------------------------------------------------------------- options
function optionsHTML() {
  const mode = ctrlMode();
  const seg = (k, lab, desc) => `<button class="${mode === k ? 'on' : ''}" onclick="setCtrlMode('${k}')" title="${esc(desc)}">${lab}</button>`;
  return `<div class="opt"><div class="opt-l">Controls<div class="mute">${TOUCH ? 'Phone controls are on' : 'Desktop controls are on'}</div></div><div class="seg">${seg('auto', 'Auto', 'Pick for this device')}${seg('desktop', '🖥 Desktop', 'Keyboard and mouse')}${seg('phone', '📱 Phone', 'Joystick and touch buttons')}</div></div>
    <div class="opt"><div class="opt-l">🎵 Music</div><div class="opt-c"><input type="range" min="0" max="100" value="${Math.round(MUSIC.vol * 100)}" oninput="setMusicVol(this.value)"><button class="${MUSIC.on ? 'on' : ''}" onclick="toggleMusic(); this.classList.toggle('on', MUSIC.on); this.textContent = MUSIC.on ? 'On' : 'Off'">${MUSIC.on ? 'On' : 'Off'}</button></div></div>
    <div class="opt"><div class="opt-l">🔊 Sound effects</div><div class="opt-c"><input type="range" min="0" max="100" value="${Math.round(FX.vol * 100)}" oninput="setSfxVol(this.value)" onchange="SFX.info()"><button class="${FX.muted ? '' : 'on'}" onclick="toggleMute(); this.classList.toggle('on', !FX.muted); this.textContent = FX.muted ? 'Muted' : 'On'">${FX.muted ? 'Muted' : 'On'}</button></div></div>
    <div class="opt"><div class="opt-l">"Now playing" pop-ups</div><div class="opt-c"><button class="${MUSIC.toasts ? 'on' : ''}" onclick="MUSIC.toasts = !MUSIC.toasts; try { localStorage.setItem('groceryPractice.npToasts', MUSIC.toasts ? '1' : '0'); } catch (e) {} this.classList.toggle('on', MUSIC.toasts); this.textContent = MUSIC.toasts ? 'On' : 'Off'">${MUSIC.toasts ? 'On' : 'Off'}</button></div></div>
    <div class="opt"><div class="opt-l">Aisle hints on cases<div class="mute">Case labels say which aisle they go to (easier)</div></div><div class="opt-c"><button class="${RT.settings.labels ? 'on' : ''}" onclick="UI.setLabels(!RT.settings.labels); this.classList.toggle('on', RT.settings.labels); this.textContent = RT.settings.labels ? 'On' : 'Off'">${RT.settings.labels ? 'On' : 'Off'}</button></div></div>`;
}
function setCtrlMode(m) {
  if (m === ctrlMode()) return;
  try { localStorage.setItem(SETTINGS_KEY, m); } catch (e) { /* ignore */ }
  if (G && (G.phase === 'day' || G.phase === 'night')) save();
  // the controls are set up when the page loads, so reload into the same slot
  try { sessionStorage.setItem('groceryPractice.resume', G ? String(SLOT) : 'title-options'); } catch (e) { /* ignore */ }
  location.reload();
}
function setMusicVol(v) { MUSIC.vol = clamp(+v / 100, 0, 1); try { localStorage.setItem('groceryPractice.musicVol', String(MUSIC.vol)); } catch (e) { /* ignore */ } if (MUSIC.vol > 0 && !MUSIC.on) toggleMusic(); sfxInit(); }
function setSfxVol(v) { FX.vol = clamp(+v / 100, 0, 1); try { localStorage.setItem('groceryPractice.sfxVol', String(FX.vol)); } catch (e) { /* ignore */ } volIcons(); }
function volIcons() {
  const m = $('btn-mute'); if (m) m.textContent = FX.muted || FX.vol === 0 ? '🔇' : FX.vol < 0.4 ? '🔉' : '🔊';
  musicButton();
}

// ---------------------------------------------------------------- volume popovers (🎵 / 🔊)
function volPopup(kind, btn) {
  sfxInit();
  let p = $('volpop');
  if (p && p.dataset.kind === kind && !p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
  if (!p) { p = document.createElement('div'); p.id = 'volpop'; document.body.appendChild(p); }
  p.dataset.kind = kind;
  const music = kind === 'music';
  const on = music ? MUSIC.on : !FX.muted, vol = music ? MUSIC.vol : FX.vol;
  p.innerHTML = `<div class="vp-h">${music ? '🎵 Music' : '🔊 Sound effects'}<span id="vp-v">${Math.round(vol * 100)}%</span></div>
    <input type="range" min="0" max="100" value="${Math.round(vol * 100)}" oninput="$('vp-v').textContent = this.value + '%'; ${music ? 'setMusicVol' : 'setSfxVol'}(this.value)"${music ? '' : ' onchange="SFX.info()"'}>
    <div class="vp-r"><button class="${on ? 'on' : ''}" onclick="${music ? 'toggleMusic()' : 'toggleMute(); volIcons()'}; volPopup('${kind}', null); volPopup('${kind}', null)">${music ? (on ? 'Music on' : 'Music off') : (on ? 'Sound on' : 'All muted')}</button>${music && MUSIC.track ? `<span class="mute">♪ ${esc(MUSIC.track.name)}</span>` : ''}</div>`;
  p.classList.remove('hidden');
  const a = (btn || $(music ? 'btn-music' : 'btn-mute')).getBoundingClientRect();
  p.style.top = Math.round(a.bottom + 6) + 'px';
  p.style.left = Math.round(clamp(a.left + a.width / 2 - 120, 6, innerWidth - 246)) + 'px';
}
document.addEventListener('pointerdown', e => {
  const p = $('volpop'); if (!p || p.classList.contains('hidden')) return;
  if (p.contains(e.target) || e.target.id === 'btn-music' || e.target.id === 'btn-mute') return;
  p.classList.add('hidden');
});

// ---------------------------------------------------------------- tap / hold
// Calls onTap for a quick press, onHold once a press lasts HOLD_MS.
function holdTap(el, onTap, onHold, opts) {
  opts = opts || {};
  let timer = 0, held = false, down = false, sx = 0, sy = 0;
  el.addEventListener('pointerdown', e => {
    if (opts.button0 && e.button !== 0) return;
    if (opts.prevent !== false) e.preventDefault();
    down = true; held = false; sx = e.clientX; sy = e.clientY;
    if (opts.onDown) opts.onDown(e);
    clearTimeout(timer);
    timer = setTimeout(() => { if (!down) return; held = true; try { navigator.vibrate && navigator.vibrate(15); } catch (err) { /* ignore */ } onHold(e); }, HOLD_MS);
  });
  el.addEventListener('pointermove', e => { if (down && Math.hypot(e.clientX - sx, e.clientY - sy) > 14) { clearTimeout(timer); down = false; } });
  el.addEventListener('pointerup', e => { if (!down) return; down = false; clearTimeout(timer); if (!held) onTap(e); });
  ['pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => { down = false; clearTimeout(timer); }));
}
const canAct = () => G && !RT.modal && !UI.open && !isPaused() && !G.player.work && (G.phase === 'day' || G.phase === 'night') && !G.player.away;
function doMainAction() { if (!canAct()) return; RT.autoRep = false; const it = getInteraction(); if (it && it.fn) it.fn(); }

// ---------------------------------------------------------------- the hold menu
function advancedActions() {
  const out = [], it = getInteraction(), p = G.player;
  if (it && it.fn) out.push(['👆', it.label, it.fn]);
  if (it && it.alt && it.alt.fn) out.push(['↪', it.alt.label, it.alt.fn]);
  if (it && it.fn && it.rep) out.push(['🔁', `Keep going: ${it.label}`, () => { RT.autoRep = true; toast('🔁 Keep going. Move to stop.', 'info'); }]);
  const near = crewNear(p, 3.5);
  if (near) out.push(['📌', `Give ${near.name} orders`, () => showOrders(near)]);
  if (near && (G.standards || []).length && !out.some(o => o[1].includes('Talk standards'))) out.push(['📏', `Talk standards with ${near.name}`, () => UI.stdCoach(near.id)]);
  // every kind of talk with the person next to you, even when another one is the main action
  for (const t of [devInteraction(p), ownerInteraction(p)]) if (t && t.fn && !out.some(o => o[1] === t.label)) out.push(['💬', t.label, t.fn]);
  if (RT.autoRep) out.push(['⏹', 'Stop repeating', () => { RT.autoRep = false; }]);
  out.push(['💾', `Save game (slot ${SLOT})`, () => saveToSlot(SLOT)]);
  if (!$('btn-home').classList.contains('hidden')) out.push(['🏠', 'Clock out and go home', () => askGoHome()]);
  return out;
}
function openActionMenu() {
  if (!canAct()) return;
  RT.keys = {};
  const acts = advancedActions(); RT.actList = acts;
  UI.showModal(`<h2>More options</h2>${acts.length <= 2 && !(getInteraction() || {}).fn ? '<p class="mute">Nothing to work on right here.</p>' : ''}<div class="actmenu">${acts.map(([ic, lab], i) => `<button onclick="runAct(${i})"><span class="am-i">${ic}</span>${esc(lab)}</button>`).join('')}</div><div class="row" style="justify-content:flex-end;margin-top:10px"><button onclick="UI.hideModal()">Cancel</button></div>`);
}
function runAct(i) { const a = (RT.actList || [])[i]; UI.hideModal(); RT.actList = null; if (a) a[2](); }

// ---------------------------------------------------------------- in-game Save / Load
UI.loadMenu = function () {
  this.showModal(`<h2>📂 Game menu</h2><p class="mute">You're playing in slot ${SLOT}. The game also saves itself at the end of each day and when you leave the page.</p><div class="slots">${slotCardsHTML('load', true)}</div>
    <div class="row" style="justify-content:space-between;margin-top:12px"><span><button onclick="UI.optionsMenu()">⚙ Options</button> <button onclick="UI.howToPlay('UI.loadMenu()')">📖 How to play</button></span><span><button onclick="UI.ask('Go to the title screen?', 'Your game is saved to slot ${SLOT} first.', 'Title screen', () => showTitle())">⏏ Title screen</button> <button class="primary" onclick="UI.hideModal()">Back to the store</button></span></div>`);
};
UI.optionsMenu = function () {
  this.showModal(`<h2>⚙ Options</h2>${optionsHTML()}<div class="row" style="justify-content:flex-end;margin-top:12px"><button onclick="UI.loadMenu()">← Back</button><button class="primary" onclick="UI.hideModal()">Done</button></div>`);
};

// ---------------------------------------------------------------- setup
(function setupMenus() {
  try { const v = parseFloat(localStorage.getItem('groceryPractice.musicVol')); if (v >= 0 && v <= 1) MUSIC.vol = v; } catch (e) { /* ignore */ }
  try { const v = parseFloat(localStorage.getItem('groceryPractice.sfxVol')); if (v >= 0 && v <= 1) FX.vol = v; } catch (e) { /* ignore */ }
  try { MUSIC.toasts = localStorage.getItem('groceryPractice.npToasts') !== '0'; } catch (e) { MUSIC.toasts = true; }
  const hud = $('btn-mute');
  if (hud && !$('btn-save')) {
    hud.insertAdjacentHTML('afterend', '<button id="btn-save" title="Save game">💾</button><button id="btn-load" title="Load game, options, title screen">📂</button>');
    $('btn-save').onclick = e => { e.currentTarget.blur(); if (G) saveToSlot(SLOT); };
    $('btn-load').onclick = e => { e.currentTarget.blur(); if (G) UI.loadMenu(); };
  }
  $('btn-music').onclick = e => { e.currentTarget.blur(); volPopup('music', e.currentTarget); };
  $('btn-mute').onclick = e => { e.currentTarget.blur(); volPopup('sfx', e.currentTarget); };
  volIcons();
  // The action prompt at the bottom: tap to act, hold for more.
  holdTap($('prompt'), doMainAction, openActionMenu);
  // Desktop: click the store to act, hold (or right-click) for more. Clicking an associate still opens their orders.
  if (!TOUCH) {
    holdTap(canvas, () => { if (!crewAtMouse()) doMainAction(); }, () => { if (!crewAtMouse()) openActionMenu(); }, { button0: true, prevent: false });
    canvas.addEventListener('contextmenu', e => { e.preventDefault(); openActionMenu(); });
  }
  // Coming back from a controls change: go back where you were.
  let resume = null; try { resume = sessionStorage.getItem('groceryPractice.resume'); sessionStorage.removeItem('groceryPractice.resume'); } catch (e) { /* ignore */ }
  if (resume) setTimeout(() => {
    if (resume === 'title-options') { TITLE.view = 'options'; titleRender(); }
    else if (+resume >= 1) { playSlot(+resume); UI.optionsMenu(); }
  }, 0);
})();
if (TOUCH && $('t-e')) holdTap($('t-e'), () => touchInteract(), openActionMenu);

// ---------------------------------------------------------------- phone-width tables
// A table wider than the screen turns into a stack of cards: each row is a
// card and each cell shows its column name, so nothing runs off the side.
function stackWideTables(root) {
  if (!root || innerWidth > 760) return;
  root.querySelectorAll('table').forEach(tb => {
    if (tb.classList.contains('stack') || tb.scrollWidth <= tb.parentElement.clientWidth + 2) return;
    let heads = null;
    tb.querySelectorAll('tr').forEach(tr => {
      const cells = [...tr.children];
      if (cells.length && cells.every(c => c.tagName === 'TH')) { heads = cells.map(c => c.textContent.trim()); tr.classList.add('st-head'); return; }
      if (cells.length === 1) { tr.classList.add('st-full'); return; }
      cells.forEach((c, i) => { if (heads && heads[i]) c.dataset.label = heads[i]; });
    });
    tb.classList.add('stack');
  });
}

// ---------------------------------------------------------------- phone top bar: ☰ menu
// On a phone the top bar keeps the clock, the stats and Go home; speed, music,
// sound, save, load and your level move into ☰.
function hudMenu(btn) {
  let p = $('hudmenu');
  if (p && !p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
  if (!p) { p = document.createElement('div'); p.id = 'hudmenu'; document.body.appendChild(p); }
  if (!G) return;
  const L = level(), a = xpForLevel(L), b = xpForLevel(L + 1);
  const sp = v => `<button class="${v === 0 ? (RT.paused ? 'on' : '') : (!RT.paused && G.speed === v ? 'on' : '')}" onclick="${v === 0 ? 'RT.paused = !RT.paused' : `setSpeed(${v})`}; hudMenu(); hudMenu()">${v === 0 ? (RT.paused ? '▶' : '⏸') : v + '×'}</button>`;
  p.innerHTML = `<div class="hm-lv">Lv ${L} · ${esc(title())}<span>bank ${money(G.bank)}</span></div><div class="xpbar"><div style="width:${(G.xp - a) / (b - a) * 100}%"></div></div>
    <div class="hm-h">Speed</div><div class="seg hm-seg">${[0, 1, 2, 4].map(sp).join('')}</div>
    <div class="hm-g"><button onclick="hudMenu(); volPopup('music', $('btn-menu'))">🎵 Music${MUSIC.on ? '' : ' (off)'}</button><button onclick="hudMenu(); volPopup('sfx', $('btn-menu'))">${FX.muted ? '🔇' : '🔊'} Sound${FX.muted ? ' (muted)' : ''}</button>
    <button onclick="hudMenu(); saveToSlot(SLOT)">💾 Save</button><button onclick="hudMenu(); UI.loadMenu()">📂 Game menu</button></div>`;
  p.classList.remove('hidden');
  const r = (btn || $('btn-menu')).getBoundingClientRect();
  p.style.top = Math.round(r.bottom + 6) + 'px';
  p.style.right = Math.max(6, Math.round(innerWidth - r.right)) + 'px';
}
(function setupHudMenu() {
  const hud = $('hud'); if (!hud || $('btn-menu')) return;
  ($('btn-endnight') || hud).insertAdjacentHTML($('btn-endnight') ? 'afterend' : 'beforeend', '<button id="btn-menu" title="Menu">☰</button>');
  $('btn-menu').onclick = e => { e.currentTarget.blur(); sfxInit(); hudMenu(e.currentTarget); };
  document.addEventListener('pointerdown', e => {
    const p = $('hudmenu'); if (!p || p.classList.contains('hidden')) return;
    if (p.contains(e.target) || e.target.id === 'btn-menu') return;
    p.classList.add('hidden');
  });
})();
