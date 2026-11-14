'use strict';
// =====================================================================
//  Endcap displays, switched on Tuesday.
//  Each endcap is a real display that holds its own product: up to 6 cases
//  of one department, built from that department's backstock.
//  - The Display Planner (office computer) only PLANS the next set. The
//    switch is physical work: Tuesday from 6 PM (the ad flip), through the
//    night, or Wednesday before noon (late). E at the endcap, or the
//    closing crew does it. Tearing down a display sends what's left on it
//    back to that department's backstock; building one pulls up to 6 cases
//    from the new department's backstock. No backstock, no display: order
//    extra for the ad on Monday's truck.
//  - A stocked endcap lifts its department (+12% each, 2 max) and sells
//    product off the display. An empty display lifts nothing and looks bad,
//    so fill endcaps from backstock (E at the endcap; Replenishment and
//    idle crew do it too).
// =====================================================================
const EC_CASES = 6;       // cases an endcap holds
const EC_SHARE = 0.10;    // share of a department's shoppers who take it off the endcap
const ecCap = dept => EC_CASES * DEPT[dept].upc;
const ecStockOf = id => (G.ecStock && G.ecStock[id]) || 0;
const ecCenter = e => ({ x: e.x + 0.5, y: e.y + 0.5 });
const ecName = e => `${DEPT[SHELF_DEPT[e.gondola]].aisle} ${e.end.toLowerCase()} endcap`;
const ecUnits = dept => sum(MAPD.endcaps.filter(e => G.endcaps[e.id] === dept).map(e => ecStockOf(e.id)));
const ecHas = dept => MAPD.endcaps.some(e => G.endcaps[e.id] === dept && ecStockOf(e.id) > 0);
const ecPlanned = e => G.ecPlan && G.ecPlan[e.id] !== undefined && (G.ecPlan[e.id] || null) !== (G.endcaps[e.id] || null);
const ecPending = () => MAPD.endcaps.filter(ecPlanned);
const ecWindow = () => (dowOf(G.day) === 'Tue' && (G.phase === 'night' || G.time >= 1080)) || (dowOf(G.day) === 'Wed' && G.phase === 'day' && G.time < 720);
// units to build the planned displays that will hold this department (the suggested order adds them)
const ecOrderNeed = dept => ecPending().filter(e => G.ecPlan[e.id] === dept).length * ecCap(dept);
// tearing a display down can happen any day; building a new set waits for the Tuesday flip
const ecCanSwitch = e => ecPlanned(e) && (ecWindow() || !G.ecPlan[e.id]);
const ecLow = e => G.endcaps[e.id] && ecStockOf(e.id) < ecCap(G.endcaps[e.id]) * 0.5 && G.stock[G.endcaps[e.id]].back > 0;

function ensureEndcaps() {
  const fresh = !G.ecStock;
  G.ecStock = G.ecStock || {}; G.ecPlan = G.ecPlan || {};
  // displays from before they held product start full
  if (fresh) MAPD.endcaps.forEach(e => { const d = G.endcaps[e.id]; if (d) G.ecStock[e.id] = ecCap(d); });
}

// ---- moving product ----
function fillEndcap(e) {
  const d = G.endcaps[e.id]; if (!d) return 0;
  const u = Math.max(0, Math.min(ecCap(d) - ecStockOf(e.id), G.stock[d].back));
  G.stock[d].back -= u; G.ecStock[e.id] = ecStockOf(e.id) + u;
  return u;
}
function switchEndcap(e, crew) {
  if (!ecPlanned(e)) return;
  const old = G.endcaps[e.id], nu = G.ecPlan[e.id] || null, t = G.today;
  if (old) G.stock[old].back += ecStockOf(e.id);
  G.ecStock[e.id] = 0; G.endcaps[e.id] = nu; delete G.ecPlan[e.id];
  const u = nu ? fillEndcap(e) : 0;
  t.ecSwitched = (t.ecSwitched || 0) + 1;
  if (dowOf(G.day) === 'Wed') t.ecLate = (t.ecLate || 0) + 1;
  const what = nu ? `${DEPT[nu].name} display built${u < ecCap(nu) ? ` with only ${u} of ${ecCap(nu)} units: not enough ${DEPT[nu].name} backstock` : ''}` : 'display taken down';
  if (crew) floater(e.x + 0.5, e.y - 0.3, nu ? `${DEPT[nu].aisle} display` : 'Torn down', nu ? DEPT[nu].color : '#ccc');
  else { addXP(6, G.player); toast(`🛒 ${ecName(e)}: ${what}.${old ? ` The ${DEPT[old].name} left on it went back to backstock.` : ''}`, nu && u < ecCap(nu) ? 'warn' : 'good'); }
  if (nu && u < ecCap(nu)) t.ecShort = (t.ecShort || 0) + 1;
}
// A shopper takes product off the endcap. Returns units taken.
function ecTake(dept, q) {
  const es = MAPD.endcaps.filter(e => G.endcaps[e.id] === dept && ecStockOf(e.id) > 0);
  if (!es.length) return 0;
  const e = pick(es), got = Math.min(q, ecStockOf(e.id));
  G.ecStock[e.id] -= got;
  return got;
}

// ---- you ----
function endcapInteraction(p) {
  const e = nearest(MAPD.endcaps.map(x => ({ ...ecCenter(x), e: x })), p, 1.5);
  if (!e) return null;
  const x = e.e, cur = G.endcaps[x.id];
  if (ecCanSwitch(x)) {
    const nu = G.ecPlan[x.id];
    return { label: `🛒 Switch the ${ecName(x)}: ${cur ? `tear down ${DEPT[cur].name}, ` : ''}${nu ? `build ${DEPT[nu].name} (${Math.min(ecCap(nu), G.stock[nu].back)} of ${ecCap(nu)} units in backstock)` : 'leave it empty'}`, at: e, fn: () => startWork(4, 'Switching endcap', () => switchEndcap(x, null)) };
  }
  if (cur && ecLow(x)) return { label: `🛒 Fill the ${DEPT[cur].name} endcap (${ecStockOf(x.id)}/${ecCap(cur)})`, at: e, fn: () => startWork(1.5, 'Filling endcap', () => { const u = fillEndcap(x); if (u) { addXP(2, G.player); floater(x.x + 0.5, x.y - 0.3, `+${u}`, DEPT[cur].color); } }) };
  return null;
}

// ---- crew ----
function planEndcapSwitch(c, r) {
  if (G.phase !== 'day') return null;
  RT.ecClaim = RT.ecClaim || {};
  const e = ecPending().filter(x => ecCanSwitch(x) && !RT.ecClaim[x.id]).sort((a, b) => dist(r, ecCenter(a)) - dist(r, ecCenter(b)))[0];
  if (!e) return null;
  RT.ecClaim[e.id] = c.id;
  r.cleanups.push(() => { if (RT.ecClaim[e.id] === c.id) delete RT.ecClaim[e.id]; });
  r.intent = `Switching the ${ecName(e)}`;
  return [
    { go: () => tilesAround(ecCenter(e), 1) },
    { wait: 8, label: 'Switching endcap' },
    { do: () => { switchEndcap(e, c); return true; } },
  ];
}
function planEndcapFill(c, r) {
  if (G.phase !== 'day') return null;
  RT.ecClaim = RT.ecClaim || {};
  const e = MAPD.endcaps.filter(x => ecLow(x) && !RT.ecClaim[x.id] && !ecPlanned(x)).sort((a, b) => ecStockOf(a.id) - ecStockOf(b.id))[0];
  if (!e) return null;
  const d = G.endcaps[e.id];
  RT.ecClaim[e.id] = c.id;
  r.cleanups.push(() => { if (RT.ecClaim[e.id] === c.id) delete RT.ecClaim[e.id]; });
  r.intent = `Filling the ${DEPT[d].name} endcap`;
  return [
    { go: () => [rackAccess(d)] },
    { wait: 1.2, label: 'Pulling backstock' },
    { go: () => tilesAround(ecCenter(e), 1) },
    { wait: 2.5, label: 'Filling endcap' },
    { do: () => { if (G.endcaps[e.id] === d) fillEndcap(e); return true; } },
  ];
}

// ---- time ----
function endcapsHour(h) {
  if (h === 12 && dowOf(G.day) === 'Wed' && ecPending().length) {
    G.today.ecMissed = ecPending().length;
    toast(`🛒 Noon: ${plural(ecPending().length, 'endcap')} never got switched to the new set. They stay as they are until next Tuesday's flip.`, 'bad');
  }
  if (h * 60 <= OPEN || h * 60 > CLOSE) return;
  const empty = MAPD.endcaps.filter(e => G.endcaps[e.id] && ecStockOf(e.id) <= 0).length;
  if (empty) { G.sat = Math.max(0, G.sat - 0.2 * empty); G.today.ecEmptyHrs = (G.today.ecEmptyHrs || 0) + empty; }
}
function endcapsEndDay() {
  if (dowOf(G.day) === 'Tue' && ecPending().length) G.today.ecOpen = ecPending().length;
}
function endcapsStartDay() {
  ensureEndcaps(); RT.ecClaim = {};
  if (dowOf(G.day) === 'Wed' && ecPending().length) toast(`🛒 ${plural(ecPending().length, 'endcap')} still not switched to the new set. You have until noon.`, 'warn');
}

// ---- reports ----
function endcapsTips() {
  const t = G.today, tips = [];
  if (t.ecOpen) tips.push(`${plural(t.ecOpen, 'endcap')} still need to be switched for tomorrow's ad. Do it tonight (E at the endcap) or before noon tomorrow. The closing crew flips endcaps Tuesday from 6 PM when they have the time.`);
  if (t.ecMissed) tips.push(`${plural(t.ecMissed, 'endcap')} never got switched to this week's set. The ad started without them.`);
  if (t.ecShort) tips.push(`${plural(t.ecShort, 'new display')} went up short: not enough backstock to fill ${t.ecShort === 1 ? 'it' : 'them'}. Each endcap holds ${EC_CASES} cases; order extra for the ad departments on Monday's truck.`);
  if (t.ecEmptyHrs >= 4) tips.push(`Empty endcaps sat for ${t.ecEmptyHrs} display-hours today. An empty display lifts nothing and looks like we gave up. Fill them from backstock (E at the endcap).`);
  return tips;
}
function endcapsDayExtras() {
  const t = G.today;
  return { ecEmptyHrs: t.ecEmptyHrs || 0, ecMissed: t.ecMissed || 0, ecSwitched: t.ecSwitched || 0, ecShort: t.ecShort || 0, ecLate: t.ecLate || 0 };
}
function endcapsReviewNotes(days, note, praise) {
  const empty = sum(days.map(d => d.ecEmptyHrs || 0)), missed = sum(days.map(d => d.ecMissed || 0)), late = sum(days.map(d => d.ecLate || 0));
  if (missed) note('Ad flip', `${plural(missed, 'endcap')} never got switched to the new ad set${late ? ` (and ${late} went up late Wednesday)` : ''}.`,
    'The ad hits customers\' mailboxes Wednesday. If the endcaps still show last week\'s product, they come in for the deal and can\'t find it.',
    'Plan the new set Monday in the Display Planner, order the product on Monday\'s truck, and schedule closers Tuesday to flip it from 6 PM.');
  else if (empty >= 15) note('Endcaps', `Endcaps sat empty for ${empty} display-hours this week.`,
    'Endcaps are the most expensive real estate in the store. Empty, they sell nothing and make the store look picked over.',
    'Check every endcap on your walks and fill it from backstock. A Replenishment associate keeps them full.');
  else if (late) note('Ad flip', `${plural(late, 'endcap')} went up Wednesday instead of Tuesday night.`, 'Customers start shopping the ad Wednesday morning. A display built at 11 AM missed the morning.', 'Schedule enough closers Tuesday to flip the endcaps from 6 PM, or do them yourself that night.');
  else if (days.some(d => (d.ecSwitched || 0) > 0)) praise.push('The endcaps were flipped on time for the new ad.');
}

// ---- drawing: fill bar under each display, the planned set during the flip ----
function drawEndcapExtras() {
  const blink = Math.floor(performance.now() / 400) % 2;
  for (const e of MAPD.endcaps) {
    const d = G.endcaps[e.id], px = e.x * T, py = e.y * T;
    if (d) {
      const f = ecStockOf(e.id) / ecCap(d);
      ctx.fillStyle = '#000'; ctx.fillRect(px + 4, py + T - 5, T - 8, 3);
      ctx.fillStyle = f >= 0.5 ? DEPT[d].color : f > 0 ? '#f0b429' : '#e5534b';
      ctx.fillRect(px + 4, py + T - 5, Math.round((T - 8) * f), 3);
    }
    // planned change: shown on the display itself (always during the flip window, blinking otherwise)
    if (ecPlanned(e) && (ecCanSwitch(e) || blink)) {
      const nu = G.ecPlan[e.id];
      badge(px + T / 2, py + T / 2, '→' + (nu || '∅'), ecCanSwitch(e) && blink ? '#8a5200' : '#333');
    }
  }
}
