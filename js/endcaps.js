'use strict';
// =====================================================================
//  Endcap displays, switched on Tuesday.
//  Each endcap is a real display that holds its own product: up to 6 cases
//  of one department, built from that department's backstock.
//  - The Display Planner (office computer) only PLANS the next set. The
//    flip is physical work: Tuesday from 6 PM (the ad flip), through the
//    night, or Wednesday before noon (late). Two steps per endcap:
//    1. TAKE DOWN: E at the display; carry what's left on it to that
//       department's bird in BACKSTOCK and put it back.
//    2. BUILD: E at the new department's bird pulls up to 6 cases; E at the
//       endcap marked with it stacks the new display.
//    The closing crew does the same walk. No backstock, no display: order
//    extra for the ad on Monday's truck.
//  - Ad departments sell faster all week (AD_LIFT, js/game.js) and an out
//    on an ad item costs twice the satisfaction.
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
// The flip is two physical steps. TAKE DOWN: empty the display and carry
// what's left on it to its own department's bird (backstock). BUILD: pull up
// to 6 cases of the new department off its bird and stack the display.
const ecDown = e => !G.endcaps[e.id] && ecPlanned(e) && !!G.ecPlan[e.id]; // torn down, waiting for its new product
const ecCases = (dept, u) => Math.ceil(u / DEPT[dept].upc);
function ecTearDown(e, crew) {
  const old = G.endcaps[e.id], u = ecStockOf(e.id);
  G.ecStock[e.id] = 0; G.endcaps[e.id] = null;
  if (!G.ecPlan[e.id]) { delete G.ecPlan[e.id]; ecDone(e, crew); }
  if (crew) floater(e.x + 0.5, e.y - 0.3, 'Torn down', '#ccc');
  return old && u ? { dept: old, units: u } : null;
}
function ecBuild(e, load, crew) {
  const nu = load.dept, u = load.units, t = G.today;
  G.endcaps[e.id] = nu; G.ecStock[e.id] = u; delete G.ecPlan[e.id];
  ecDone(e, crew);
  if (u < ecCap(nu)) t.ecShort = (t.ecShort || 0) + 1;
  if (crew) floater(e.x + 0.5, e.y - 0.3, `${DEPT[nu].aisle} display`, DEPT[nu].color);
  else { addXP(6, G.player); toast(`🛒 ${ecName(e)}: ${DEPT[nu].name} display built${u < ecCap(nu) ? ` with only ${ecCases(nu, u)} of ${EC_CASES} cases: not enough ${DEPT[nu].name} backstock` : ''}.`, u < ecCap(nu) ? 'warn' : 'good'); }
}
function ecDone(e, crew) {
  const t = G.today;
  t.ecSwitched = (t.ecSwitched || 0) + 1;
  if (dowOf(G.day) === 'Wed') t.ecLate = (t.ecLate || 0) + 1;
  if (!crew && !G.endcaps[e.id]) toast(`🛒 ${ecName(e)} taken down.`, 'good');
}
// pull product off a bird for a display
function ecPull(dept) { const u = Math.min(ecCap(dept), G.stock[dept].back); G.stock[dept].back -= u; return u ? { dept, units: u } : null; }
// whatever is still in someone's hands goes back to its bird
function ecReturn(load) { if (load && load.units) G.stock[load.dept].back += load.units; }
function ecDropLoad(who) { if (who && who.ecLoad) { ecReturn(who.ecLoad); who.ecLoad = null; } }
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
  if (ecCanSwitch(x) && cur) {
    const nu = G.ecPlan[x.id];
    return { label: `🛒 Take down the ${DEPT[cur].name} display (${ecStockOf(x.id) ? plural(ecCases(cur, ecStockOf(x.id)), 'case') + ' back to its bird' : 'empty'})${nu ? `, then build ${DEPT[nu].name}` : ''}`, at: e, fn: () => startWork(3, 'Taking down display', () => { if (G.endcaps[x.id] !== cur) return; const l = ecTearDown(x, null); if (l) { G.player.ecLoad = { ...l, kind: 'down' }; toast(`🛒 Take the ${DEPT[cur].name} to its bird in BACKSTOCK (${DEPT[cur].aisle}).`, 'info'); } }) };
  }
  if (ecCanSwitch(x) && ecDown(x)) {
    const nu = G.ecPlan[x.id];
    return { label: `🛒 This endcap gets ${DEPT[nu].name}: pull it off the ${DEPT[nu].aisle} bird in BACKSTOCK (${plural(Math.min(EC_CASES, backCases(nu)), 'case')} there)`, fn: null, at: e };
  }
  if (cur && ecLow(x)) return { label: `🛒 Fill the ${DEPT[cur].name} endcap (${ecStockOf(x.id)}/${ecCap(cur)})`, at: e, fn: () => startWork(1.5, 'Filling endcap', () => { const u = fillEndcap(x); if (u) { addXP(2, G.player); floater(x.x + 0.5, x.y - 0.3, `+${u}`, DEPT[cur].color); } }) };
  return null;
}
// at a bird: pull its product for a torn-down display that is waiting for it
function ecPullInteraction(p, bird) {
  if (!bird || !ecWindow() || !MAPD.endcaps.some(e => ecDown(e) && G.ecPlan[e.id] === bird.dept)) return null;
  const d = DEPT[bird.dept], n = Math.min(EC_CASES, backCases(bird.dept));
  if (!n) return { label: `🛒 No ${d.name} backstock left for the new display. Order extra on Monday's truck.`, fn: null, bad: true };
  return { label: `🛒 Pull ${plural(n, 'case')} of ${d.name} for the new endcap display`, at: bird, fn: () => startWork(1.5, 'Pulling for display', () => { if (G.player.ecLoad) return; const l = ecPull(bird.dept); if (l) G.player.ecLoad = { ...l, kind: 'build' }; }) };
}
// your hands are full of display product: only the next step of the flip
function ecLoadInteraction(p) {
  const l = p.ecLoad, d = DEPT[l.dept], n = plural(ecCases(l.dept, l.units), 'case');
  const b = birdOf(l.dept), atBird = b && dist(b, p) < 1.6;
  if (l.kind === 'down') {
    if (atBird) return { label: `🛒 Put ${n} of ${d.name} back on its bird`, at: b, fn: () => startWork(1.5, 'Backstocking', () => { if (!p.ecLoad) return; ecDropLoad(p); addXP(2, p); toast(`🛒 The ${d.name} is in backstock. Now build the new display.`, 'good'); }) };
    return { label: `🛒 Carry the ${d.name} (${n}) to its bird in BACKSTOCK (${d.aisle})`, fn: null };
  }
  const e = nearest(MAPD.endcaps.map(x => ({ ...ecCenter(x), e: x })), p, 1.5);
  if (e && ecDown(e.e) && G.ecPlan[e.e.id] === l.dept) return { label: `🛒 Build the ${d.name} display (${n})`, at: e, fn: () => startWork(3, 'Building display', () => { if (!p.ecLoad || !ecDown(e.e)) return; ecBuild(e.e, p.ecLoad, null); p.ecLoad = null; }) };
  if (e) return { label: `✗ This endcap isn't waiting for ${d.name}. Look for the ones marked →${l.dept}`, fn: null, bad: true };
  if (atBird) return { label: `Put the ${d.name} back on its bird`, at: b, fn: () => ecDropLoad(p) };
  return { label: `🛒 Bring the ${d.name} (${n}) to an endcap marked →${l.dept}`, fn: null };
}

// ---- crew: the whole flip, step by step ----
function planEndcapSwitch(c, r) {
  if (G.phase !== 'day') return null;
  RT.ecClaim = RT.ecClaim || {};
  const e = ecPending().filter(x => ecCanSwitch(x) && !RT.ecClaim[x.id] && !(ecDown(x) && G.stock[G.ecPlan[x.id]].back <= 0)).sort((a, b) => dist(r, ecCenter(a)) - dist(r, ecCenter(b)))[0];
  if (!e) return null;
  const old = G.endcaps[e.id], nu = G.ecPlan[e.id] || null;
  RT.ecClaim[e.id] = c.id;
  r.cleanups.push(() => { if (RT.ecClaim[e.id] === c.id) delete RT.ecClaim[e.id]; ecDropLoad(r); });
  r.intent = `Flipping the ${ecName(e)}`;
  const steps = [];
  if (old) steps.push(
    { go: () => tilesAround(ecCenter(e), 1) },
    { wait: 5, label: 'Taking down display' },
    { do: () => { if (G.endcaps[e.id] !== old) return false; const l = ecTearDown(e, c); if (l) r.ecLoad = l; return true; } },
    goEnt(() => birdOf(old)),
    { wait: 1.5, label: 'Backstocking' },
    { do: () => { ecDropLoad(r); return true; } });
  if (nu) steps.push(
    goEnt(() => birdOf(nu)),
    { wait: 1.5, label: 'Pulling for display' },
    { do: () => { if (!ecDown(e) || G.ecPlan[e.id] !== nu) return false; const l = ecPull(nu); if (!l) return false; r.ecLoad = l; return true; } },
    { go: () => tilesAround(ecCenter(e), 1) },
    { wait: 5, label: 'Building display' },
    { do: () => { if (!r.ecLoad || !ecDown(e) || G.ecPlan[e.id] !== nu) return false; ecBuild(e, r.ecLoad, c); r.ecLoad = null; return true; } });
  return steps;
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
    toast(`🛒 Noon: ${plural(ecPending().length, 'endcap')} never got switched to the new set. Untouched ones stay as they are until next Tuesday's flip; torn-down ones are empty displays now. Fill them.`, 'bad');
    MAPD.endcaps.filter(ecDown).forEach(e => { G.endcaps[e.id] = G.ecPlan[e.id]; G.ecStock[e.id] = 0; delete G.ecPlan[e.id]; });
  }
  if (h * 60 <= OPEN || h * 60 > CLOSE) return;
  const empty = MAPD.endcaps.filter(e => G.endcaps[e.id] && ecStockOf(e.id) <= 0).length;
  if (empty) { G.sat = Math.max(0, G.sat - 0.2 * empty); G.today.ecEmptyHrs = (G.today.ecEmptyHrs || 0) + empty; }
}
function endcapsEndDay() {
  ecDropLoad(G.player);
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
  if (t.adOuts >= 3) tips.push(`${plural(t.adOuts, 'shopper')} found an ad item out of stock today. Ad departments sell about ${Math.round((AD_LIFT - 1) * 100)}% faster all week, and an out on the ad hurts twice as much. Order more for them and keep their shelves and endcaps full.`);
  if (t.ecEmptyHrs >= 4) tips.push(`Empty endcaps sat for ${t.ecEmptyHrs} display-hours today. An empty display lifts nothing and looks like we gave up. Fill them from backstock (E at the endcap).`);
  return tips;
}
function endcapsDayExtras() {
  const t = G.today;
  return { ecEmptyHrs: t.ecEmptyHrs || 0, ecMissed: t.ecMissed || 0, ecSwitched: t.ecSwitched || 0, ecShort: t.ecShort || 0, ecLate: t.ecLate || 0, adOuts: t.adOuts || 0 };
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
  const adOuts = sum(days.map(d => d.adOuts || 0));
  if (adOuts >= 10) note('Ad outs', `Shoppers found ad items out of stock ${adOuts} times this week.`, 'The ad is a promise in every mailbox. An out on an ad item sends that customer to the competition for the whole trip.', "Order the ad departments heavy on Monday's truck (the suggested order already adds the ad lift) and check their shelves first on every walk.");
  if (missed || empty >= 15 || late) return;
  if (days.some(d => (d.ecSwitched || 0) > 0)) praise.push('The endcaps were flipped on time for the new ad.');
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
