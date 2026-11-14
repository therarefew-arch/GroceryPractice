'use strict';
// =====================================================================
//  Save slots, save / load, and boot (split out of game.js).
// =====================================================================
const SAVE_KEY = 'groceryPractice.save.v1'; // the one save from before save slots (moved into slot 1)
const SLOTS = 3;
let SLOT = 1; // the save slot you're playing in
const slotKey = n => 'groceryPractice.slot' + n;
function slotMeta(n) {
  try {
    const m = localStorage.getItem(slotKey(n) + '.meta'); if (m) return JSON.parse(m);
    if (localStorage.getItem(slotKey(n))) return { day: null, at: 0 };
  } catch (e) { /* ignore */ }
  return null;
}
function clearSlot(n) { try { localStorage.removeItem(slotKey(n)); localStorage.removeItem(slotKey(n) + '.meta'); } catch (e) { /* ignore */ } }
function migrateOldSave() {
  try {
    const old = localStorage.getItem(SAVE_KEY); if (!old) return;
    if (!localStorage.getItem(slotKey(1))) {
      localStorage.setItem(slotKey(1), old);
      const s = JSON.parse(old), lv = levelOf(s.xp || 0);
      localStorage.setItem(slotKey(1) + '.meta', JSON.stringify({ day: s.day, lvl: lv, title: TITLES[Math.min(TITLES.length - 1, lv - 1)], bank: s.bank || 0, at: Date.now() }));
    }
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* ignore */ }
}

// =====================================================================
//  Save / load
// =====================================================================
function save() {
  if (!G) return;
  try {
    const s = JSON.parse(JSON.stringify(G));
    s.player.work = null;
    for (const c of G.crew) {
      const r = RT.crew[c.id];
      if (!r) continue;
      r.carry.forEach(cs => { s.stock[cs.d].back += caseUnits(cs); });
      (r.gobacks || []).forEach(g => { (s.gobacks = s.gobacks || []).push({ ...g, where: 'cart' }); });
      (r.damages || []).forEach(d => { (s.damages = s.damages || []).push({ ...d, where: 'bin', x: RECLAIM_C.x, y: RECLAIM_C.y }); });
      if (r.pallet && r.pallet.empty) s.empties.push({ id: r.pallet.id, x: r.x, y: r.y });
      else if (r.pallet) { if (s.phase === 'night') s.trailer.unshift(r.pallet); else s.pallets.push({ ...r.pallet, x: r.x, y: r.y }); }
    }
    s.floats.forEach(f => { if (f.carriedBy !== 'player') f.carriedBy = null; f.claimedBy = null; f.incoming = 0; });
    s.tags.forEach(t => { t.claimedBy = null; });
    Object.values(s.birds || {}).forEach(b => { if (b.carriedBy !== 'player') b.carriedBy = null; b.claimedBy = null; });
    (s.spills || []).forEach(x => { x.claimedBy = null; });
    if (s.cooler) s.cooler.claimedBy = null;
    s.vendorsToday.forEach(v => {
      v.claimedBy = null;
      if (v.state === 'stocking') { s.stock[v.dept].back += v.cases * DEPT[v.dept].upc; v.state = 'done'; }
    });
    localStorage.setItem(slotKey(SLOT), JSON.stringify(s));
    localStorage.setItem(slotKey(SLOT) + '.meta', JSON.stringify({ day: G.day, lvl: level(), title: title(), bank: G.bank, at: Date.now() }));
  } catch (e) { console.warn('Save failed', e); }
}

function load(n) {
  try {
    n = n || SLOT;
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.version !== 1) return false;
    G = s; SLOT = n;
    applyCatalog();
    G.trash = G.trash || [];
    G.crew.forEach(c => ensureMorale(ensureTrain(c, 40)));
    ensureLabor();
    ensureBackroom();
    ensureLayout();
    ensureFacing();
    ensureCounts();
    ensureDamages();
    ensureCuts();
    ensureRecalls();
    ensureResets();
    ensureEndcaps();
    ensureTimeoff();
    ensurePerf();
    (G.candidates || []).forEach(k => { if (!k.rel) makeApplicantTruth(k); });
    if (G.phase === 'day' && (!G.counts || G.counts.day !== G.day)) countsStartDay();
    if (!G.list && G.phase === 'day') G.list = buildChecklist();
    RT.crew = {}; RT.customers = []; RT.vendorNpcs = {}; RT.repNpc = null; RT.dmNpc = null; RT.replenClaim = {}; RT.faceClaim = {}; RT.gobackClaim = null; RT.countClaim = {}; RT.dmgClaim = null; RT.reclaimClaim = null; RT.outTagClaim = {}; RT.holeWarned = {}; RT.recallClaim = {}; RT.recallWarned = {}; RT.resetWorkers = {};
    G.vendorsToday.forEach(v => {
      if (v.state === 'waiting') RT.vendorNpcs[v.name] = { x: MAPD.vendorSpot.x + 0.5, y: MAPD.vendorSpot.y + 0.5, fx: 0, fy: 1, path: null, mode: 'wait', v };
    });
    if (G.player.floatId && !floatById(G.player.floatId)) G.player.floatId = null;
    if (G.player.birdId && !(G.birds[G.player.birdId] && G.birds[G.player.birdId].carriedBy === 'player')) G.player.birdId = null;
    if (G.player.away == null) { // a save from before you were on the schedule: start it tomorrow
      G.player.away = false;
      if (G.today) G.today.endAsked = G.today.autoIn = mgrShift(G.day);
    }
    return true;
  } catch (e) { console.warn('Load failed', e); return false; }
}

// =====================================================================
//  Boot & loop
// =====================================================================
function frame(ts) {
  const dt = Math.min(0.05, (ts - (RT.lastTs || ts)) / 1000);
  RT.lastTs = ts;
  if (G) {
    pollGamepad();
    if (!isPaused()) {
      if (G.player.away) awayStep(dt); // off the clock: the crew runs the store, time flies
      else {
        // You move and work at game speed too: one player step for every game step.
        for (let i = 0; i < G.speed; i++) {
          updatePlayer(dt);
          update(dt);
          if ((G.phase !== 'day' && G.phase !== 'night') || G.player.away) break;
        }
        holdRepeat(dt);
      }
      shiftTick();
    }
    RT.floaters.forEach(f => { f.t += dt; f.y -= dt * 0.6; });
    RT.floaters = RT.floaters.filter(f => f.t < 1.4);
    render();
    UI.frame();
  }
  requestAnimationFrame(frame);
}

function boot() {
  buildMap();
  canvas.width = MW * TILE; canvas.height = MH * TILE;
  BG = drawBG();
  volIcons();
  const ver = document.getElementById('ver'); if (ver) ver.textContent = 'v' + VERSION;
  document.title = 'Grocery Practice v' + VERSION;
  if (document.fonts) document.fonts.load(PX(8)).then(() => { BG = drawBG(); }).catch(() => {});
  UI.init();
  try { RT.settings.labels = localStorage.getItem('groceryPractice.labels') === 'on'; } catch (e) { /* ignore */ }
  migrateOldSave();
  showTitle(); // js/menu.js: title screen, save slots, options
  window.addEventListener('beforeunload', () => { if (G && (G.phase === 'day' || G.phase === 'night')) save(); });
  requestAnimationFrame(frame);
}
