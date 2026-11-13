'use strict';
// =====================================================================
//  Your shift. You're on the schedule like everyone else (the "You" row in
//  Schedule). When you're off the clock the crew runs the store by
//  themselves and time moves fast until your next shift. When your shift
//  ends, go home and let them finish the day.
//  - While you're away: watch, skip ahead, come in early, or log in from
//    home (the computer works from home; nothing else does).
//  - The crew covers what has to happen with or without you: DSD vendors,
//    spills, a cooler going down, price tags, sweeping, birds left out.
//    A Lead on shift settles arguments when you're not there.
//  - Store managers are salaried: your shifts count in full (no unpaid
//    lunch) on the GR-Mgr line of the Labor Demand report.
// =====================================================================
const AWAY_RATE = 60; // game minutes per real second while you're away
const AWAY_SKIP = 8;  // "Skip ahead" is this much faster

// ---- schedule helpers ----
function shiftCovers(sk) { const s = SHIFTS[sk]; return !!s && G.time >= s.start && G.time < s.end; }
function nextShiftText() {
  for (let d = G.day; d < G.day + 9; d++) {
    const sk = mgrShift(d); if (!sk) continue;
    const s = SHIFTS[sk];
    if (d === G.day && (G.time >= s.end || G.today.autoIn === sk)) continue;
    const when = d === G.day ? 'today' : d === G.day + 1 ? 'tomorrow' : WEEKDAY_NAMES[dowIdx(d)];
    return `${when} at ${fmtTime(s.start)} (${s.name})`;
  }
  return 'you\'re not on the schedule. Add yourself in Schedule';
}

// ---- clocking in and out ----
function clockIn(early) {
  const p = G.player;
  if (!p.away) return;
  p.away = false;
  p.x = MAPD.staffDoor.x + 0.5; p.y = MAPD.staffDoor.y + 0.6; p.fx = 0; p.fy = 1;
  p.work = null;
  RT.awayFast = false;
  const sk = mgrShift(G.day);
  toast(early ? '🚪 You came in early. You\'re on the clock.' : `🕐 You clocked in${sk ? ` (${SHIFTS[sk].name})` : ''}.`, 'good');
  save();
}
function clockOut(quiet) {
  const p = G.player;
  if (p.away) return;
  if (p.carry.length) playerCarryToBack();
  if (p.floatId) releaseFloat(true);
  if (p.birdId) releaseBird(false);
  if (p.gobacks && p.gobacks.length) playerDropGobacks();
  playerDropDamages();
  if (p.pallet) {
    if (p.pallet.empty) G.empties.push({ id: p.pallet.id, x: p.x, y: p.y });
    else if (G.phase === 'night') G.trailer.unshift(p.pallet);
    else placePallet(p.pallet, freeRecvSpot(p));
    p.pallet = null;
  }
  p.work = null;
  p.away = true;
  RT.awayFast = false;
  if (!quiet) toast('🏠 You went home. The crew has the store.', 'info');
  save();
}
function askGoHome() {
  const sk = mgrShift(G.day), over = sk && G.time >= SHIFTS[sk].end;
  UI.ask('Clock out and go home?', `${over || !sk ? '' : `Your shift runs until ${fmtTime(SHIFTS[sk].end)}. `}The crew keeps working while you're gone and time moves fast until your next shift: ${nextShiftText()}. You can come back in any time.`, 'Go home', () => clockOut(false), false, 'Stay');
}

// ---- the day and night start with your schedule ----
function shiftStartDay() {
  const p = G.player;
  if (p.away == null) p.away = false;
  const sk = mgrShift(G.day);
  if (sk && shiftCovers(sk)) { G.today.autoIn = sk; if (p.away) clockIn(false); }
  else if (!p.away) clockOut(true);
}
function shiftStartNight() {
  const p = G.player, sk = mgrShift(G.day);
  if (sk === 'night') { G.today.autoIn = sk; if (p.away) clockIn(false); }
  else if (!p.away) clockOut(true);
}
function worksTonight() { return mgrShift(G.day) === 'night'; }

// ---- every frame ----
function awayStep(dt) {
  let left = dt * AWAY_RATE * (RT.awayFast ? AWAY_SKIP : 1);
  while (left > 0 && G.player.away) {
    const gm = Math.min(0.5, left); left -= gm;
    update(G.phase === 'night' ? gm / 3 : gm);
    if (G.phase !== 'day' && G.phase !== 'night') return;
    const sk = mgrShift(G.day);
    // Your shift starts: clock in (once per shift; if you went home early, you stay home).
    if (sk && G.today.autoIn !== sk && shiftCovers(sk) && (G.phase === 'night') === (sk === 'night')) { G.today.autoIn = sk; clockIn(false); return; }
  }
}
// When your shift ends, offer to go home (once).
function shiftTick() {
  const p = G.player;
  if (p.away || G.phase !== 'day' || RT.modal || UI.open) return;
  const sk = mgrShift(G.day); if (!sk || sk === 'night') return;
  const end = SHIFTS[sk].end;
  if (end >= CLOSE || G.time < end || G.today.endAsked === sk) return;
  G.today.endAsked = sk;
  UI.ask('Your shift is over', `It's ${fmtTime(G.time)}. Go home and let the crew run the rest of the day? You'll see how they did in the closing report. Stay as long as you like: the 🏠 button (top bar) or the staff door clocks you out later.`, 'Go home', () => clockOut(false), false, 'Stay a while');
}
// Your hours, for the week.
function mgrTick(gm) {
  if (G.player.away) return;
  const w = weekOf(G.day);
  G.mgrMin = G.mgrMin || {};
  G.mgrMin[w] = (G.mgrMin[w] || 0) + gm;
}

// ---- the crew covers what can't wait, with or without you ----
const dsdOnShift = () => G.crew.some(c => c.role === 'dsd' && onShift(c) && RT.crew[c.id] && RT.crew[c.id].inBuilding && !RT.crew[c.id].onBreak);
const priceOnShift = () => G.crew.some(c => c.role === 'price' && onShift(c) && RT.crew[c.id] && RT.crew[c.id].inBuilding);
const BACK_ROLES = ['breakdown', 'freight', 'unloader', 'replen'];
function coverPlan(c, r) {
  if (G.phase !== 'day' || !G.today) return null;
  const away = G.player.away;
  // A spill: whoever sees it owns it. (When you're here you get the first few minutes.)
  const sp = (G.spills || []).find(s => !s.claimedBy && (away || G.time - s.at >= 8));
  if (sp) return planSpill(c, r, sp);
  // A cooler going down: pull the product to the backroom cooler.
  const k = G.cooler;
  if (k && !k.pulled && !k.claimedBy && (away || ROLES[c.role].dept === k.dept || G.time - k.at >= 20)) return planCooler(c, r);
  // A DSD vendor waiting and nobody on DSD: someone in the back checks them in.
  if (BACK_ROLES.includes(c.role) && !dsdOnShift() && G.vendorsToday.some(v => v.state === 'waiting' && !v.claimedBy && RT.vendorNpcs[v.name] && (away || G.time - v.arrived >= 20))) return planDSD(c, r);
  return null;
}
// Something that can't wait for them to finish what they're doing (one person drops their work).
function coverNeeded(c) {
  if (G.phase !== 'day' || c.order) return false;
  const away = G.player.away;
  if ((G.spills || []).some(s => !s.claimedBy && G.time - s.at >= (away ? 5 : 15))) return true;
  const k = G.cooler;
  if (k && !k.pulled && !k.claimedBy && G.time - k.at >= (away ? 10 : 25)) return true;
  return BACK_ROLES.includes(c.role) && !dsdOnShift() && G.vendorsToday.some(v => v.state === 'waiting' && !v.claimedBy && RT.vendorNpcs[v.name] && G.time - v.arrived >= (away ? 5 : 20));
}
function planSpill(c, r, sp) {
  sp.claimedBy = c.id;
  r.cleanups.push(() => { if (sp.claimedBy === c.id) sp.claimedBy = null; });
  r.intent = 'Cleaning up a spill';
  return [
    { go: () => ((G.spills || []).includes(sp) ? tilesAround(sp, 1) : null) },
    { wait: 2, label: 'Cleaning spill' },
    { do: () => { if (!(G.spills || []).includes(sp)) return false; cleanSpill(sp, c); return true; } },
  ];
}
function planCooler(c, r) {
  const k = G.cooler;
  k.claimedBy = c.id;
  r.cleanups.push(() => { if (G.cooler === k && k.claimedBy === c.id) k.claimedBy = null; });
  r.intent = `Pulling ${DEPT[k.dept].name} to the backroom cooler`;
  return [
    { go: () => (G.cooler === k && !k.pulled ? MAPD.access[k.dept] : null) },
    { wait: 3, label: 'Pulling product' },
    { do: () => { if (G.cooler !== k || k.pulled) return false; pullCooler(c); return true; } },
  ];
}
// When their own job has nothing left: tags (if no price clerk), cold or piled-up go-backs, birds, holes,
// sweeping, then facing the messiest aisle and clearing any go-backs.
const sweepDue = () => (G.time >= 660 && G.time < 900 && !sweptAfter(660)) || (G.time >= 1260 && !sweptAfter(1260));
function helpPlan(c, r) {
  if (G.phase !== 'day') return null;
  return (!priceOnShift() ? planPrice(c, r) : null) ||
    (gobacksUrgent() ? planGobacks(c, r) : null) ||
    (salesFloorDamages().length ? planDamages(c, r) : null) ||
    (!priceOnShift() && reclaimDue() ? planReclaim(c, r) : null) ||
    planReturnBird(c, r) ||
    planBirdRunToday(c, r) ||
    planReplen(c, r, null, 0.9) ||
    (sweepDue() && G.dirt >= 5 && !RT.sweepClaim ? planSweep(c, r) : null) ||
    planDamages(c, r) ||
    (G.time >= OPEN ? planFaceMessiest(c, r, 90) || planGobacks(c, r) : null);
}
function planSweep(c, r) {
  RT.sweepClaim = c.id;
  r.cleanups.push(() => { if (RT.sweepClaim === c.id) RT.sweepClaim = null; });
  r.intent = 'Sweeping the backroom';
  return [{ go: () => [pick(MAPD.backroomTiles)] }, { wait: 4, label: 'Sweeping' }, { do: () => { sweep(false); return true; } }];
}

// ---- the off-the-clock banner ----
function setupAway() {
  const el = document.createElement('div');
  el.id = 'away'; el.className = 'hidden';
  el.innerHTML = `<div class="away-card"><div><b>🏠 Off the clock.</b> <span id="away-msg"></span></div>
    <div class="row"><button id="away-skip">⏩ Skip ahead</button><button id="away-in">🚪 Come in now</button><button id="away-pc">💻 Log in from home</button></div></div>`;
  $('stage').appendChild(el);
  $('away-skip').onclick = e => { e.currentTarget.blur(); RT.awayFast = !RT.awayFast; };
  $('away-in').onclick = e => { e.currentTarget.blur(); clockIn(true); };
  $('away-pc').onclick = e => { e.currentTarget.blur(); UI.openComputer(); };
}
function awayText() {
  let t = (G.phase === 'night' ? 'The night crew has the store.' : 'The crew is running the store.') + ' Your next shift: ' + nextShiftText() + '.';
  if (G.phase === 'day' && isTruckNight(G.day) && !G.orderLocked && !G.orderSubmitted) t += ` Tonight's truck order is due by ${fmtTime(ORDER_CUTOFF)}: log in from home, or the system order goes.`;
  if (forecastOpen()) t += ` Next week's forecast is due by ${fmtTime(FORECAST_CUTOFF)}.`;
  const ns = G.sched && G.sched[weekOf(G.day) + 1];
  if (G.phase === 'day' && dowOf(G.day) === 'Thu' && G.time < SCHED_CUTOFF && ns && !ns.posted) t += ` Post next week's schedule by ${fmtTime(SCHED_CUTOFF)}.`;
  return t;
}
function awayFrame() {
  const el = $('away'); if (!el) return;
  const show = !!G && G.player.away && (G.phase === 'day' || G.phase === 'night') && !RT.modal && !UI.open;
  el.classList.toggle('hidden', !show);
  if (!show) return;
  const now = performance.now();
  if (now - (RT.awayTxtAt || 0) > 100) { RT.awayTxtAt = now; $('away-msg').textContent = awayText(); }
  $('away-skip').textContent = RT.awayFast ? '▶ Slow down' : '⏩ Skip ahead';
}
setupAway();
