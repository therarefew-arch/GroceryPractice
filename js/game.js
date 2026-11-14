'use strict';
// =====================================================================
//  Core simulation: state, day/night cycle, crew AI, customers, player.
// =====================================================================
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const FLOAT_CAP = 40, CARRY_CAP = 3, PALLET_SIZE = 36;
const OPEN = 420, CLOSE = 1380, NIGHT_END = 1740;
const OT_PER_PALLET = 15, LABOR_TARGET = 12;
// Levels get further apart: going from level L to L+1 takes 400 + 200·(L−1) XP (400 for the first).
const xpForLevel = L => (L - 1) * 400 + 100 * (L - 1) * (L - 2); // total XP to reach level L
function levelOf(xp) { let L = 1; while (xpForLevel(L + 1) <= xp) L++; return L; }
const MAX_CREW = 14; // the building only holds so many associates
const VERSION = '0.0.39'; // bump the last number on every update

let G = null;   // persistent, saved state
let BG = null;  // pre-rendered static map
const RT = {    // runtime-only state (not saved)
  crew: {}, customers: [], vendorNpcs: {}, floaters: [], keys: {}, lastTs: 0, paused: false, modal: false,
  replenClaim: {}, custAcc: 0, outsWarned: {}, settings: { labels: true },
};

// ---------- utils ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sum = arr => arr.reduce((a, b) => a + b, 0);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function wpick(items, wfn) {
  let t = 0; for (const i of items) t += wfn(i);
  let r = Math.random() * t;
  for (const i of items) { r -= wfn(i); if (r <= 0) return i; }
  return items[items.length - 1];
}
function fmtTime(m) {
  m = Math.floor(m) % 1440;
  let h = Math.floor(m / 60); const mm = m % 60, ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, '0')} ${ap}`;
}
// ---------- calendar ----------
const dowIdx = day => (day - 1) % 7;
const dowOf = day => WEEKDAYS[dowIdx(day)];
const weekOf = day => Math.floor((day - 1) / 7) + 1;
const dowFactor = day => DOW_FACTOR[dowOf(day)] || 1;
const trucksOn = day => TRUCK_SCHEDULE[dowOf(day)] || [];
const isTruckNight = day => trucksOn(day).length > 0;
const deptOnTruck = (dept, day) => trucksOn(day).some(t => TRUCK_TYPES[t].depts.includes(dept));
function nextTruckDay(day) { for (let d = day; d < day + 8; d++) if (isTruckNight(d)) return d; return day; }
function nextTruckDayFor(dept, day) { for (let d = day; d < day + 8; d++) if (deptOnTruck(dept, d)) return d; return day + 7; }
// Days of sales a department's order on truck night `td` has to cover (until its next truck is worked).
function coverDaysFor(dept, td) { return deptOnTruck(dept, td) ? nextTruckDayFor(dept, td + 1) - td : 0; }
function coverDays(td) { return Math.max(1, ...DEPTS.map(d => coverDaysFor(d.id, td))); }
const dayLabel = day => `Wk ${weekOf(day)} · ${dowOf(day)} · Day ${day}`;
const orderOpen = () => G.phase === 'day' && isTruckNight(G.day) && G.time < ORDER_CUTOFF && !G.orderLocked;

const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
const nid = () => G.nextId++;
const caseUnits = c => (c.u != null ? c.u : DEPT[c.d].upc);
function makeCase(dept) { const it = wpick(DEPT[dept].items, i => i[1]); return { d: dept, item: it[0] }; }

// ---------- world queries ----------
const floatById = id => G.floats.find(f => f.id === id);
const floatOf = dept => G.floats.find(f => f.dept === dept);
const shelfPct = dept => G.stock[dept].shelf / DEPT[dept].capU;
const canStock = dept => !coolerBlocked(dept) && DEPT[dept].capU - G.stock[dept].shelf >= DEPT[dept].upc * 0.5;
// only a display with product on it counts (js/endcaps.js)
const endcapCount = dept => MAPD.endcaps.filter(e => G.endcaps[e.id] === dept && ecStockOf(e.id) > 0).length;
const promoLift = dept => 1 + 0.12 * Math.min(2, endcapCount(dept));
const crewName = id => (G.crew.find(c => c.id === id) || { name: 'Someone' }).name;
const level = () => levelOf(G.xp);
const title = () => TITLES[Math.min(TITLES.length - 1, level() - 1)];
const maxCrew = () => Math.min(MAX_CREW, 3 + level());

function palletCases(dept) { let n = 0; for (const p of G.pallets) for (const c of p.cases) if (c.d === dept) n++; return n; }
function truckRemaining() { return sum(G.pallets.map(p => p.cases.length)) + sum(G.floats.map(f => f.cases.length)); }
function removeEmptyPallets() { G.pallets = G.pallets.filter(p => { if (p.cases.length) return true; palletEmptied(p); return false; }); }

function stockUnits(dept, u) {
  const s = G.stock[dept], d = DEPT[dept];
  const fit = Math.max(0, Math.min(u, d.capU - s.shelf));
  s.shelf += fit;
  s.back += u - fit;
  frontFromStocking(dept, fit);
  return fit;
}
// A case becomes shelf (or backstock) units. A recalled case keeps being recalled product.
function stockCase(cs) { const u = caseUnits(cs), fit = stockUnits(cs.d, u); if (cs.rc) recallIn(cs, fit, u - fit); return fit; }
function backCase(cs) { const u = caseUnits(cs); G.stock[cs.d].back += u; if (cs.rc) recallIn(cs, 0, u); }
function floatToBack(f) { f.cases.forEach(backCase); f.cases = []; }

function onHandUnits(dept) {
  let u = G.stock[dept].shelf + G.stock[dept].back + ecUnits(dept);
  const add = cont => cont.cases.forEach(c => { if (c.d === dept) u += caseUnits(c); });
  G.pallets.forEach(add); G.trailer.forEach(add); G.floats.forEach(add);
  return u;
}

// ---------- forecasting ----------
const TRAFFIC_SUM = sum(Object.values(TRAFFIC));
function trafficRemaining(t) {
  let rem = 0;
  for (const [h, w] of Object.entries(TRAFFIC)) {
    const hs = h * 60;
    if (t <= hs) rem += w; else if (t < hs + 60) rem += w * (hs + 60 - t) / 60;
  }
  return rem / TRAFFIC_SUM;
}
function avgDemand(dept) { const h = G.history[dept].slice(-7); return sum(h) / h.length; }
function forecastUnits(dept) { return avgDemand(dept) * promoLift(dept); }
function forecastFor(dept, day) { return forecastUnits(dept) * dowFactor(day); }
function dsdUnits(dept) { return sum(VENDORS.filter(v => v.dept === dept).map(v => v.cases * DEPT[dept].upc)); }
function suggestedCases(dept, td) {
  td = td || nextTruckDay(G.day);
  const d = DEPT[dept], cover = coverDaysFor(dept, td);
  if (!cover) return 0;
  let need = 0;
  for (let k = 1; k <= cover; k++) need += forecastFor(dept, td + k);
  // what will still sell between now and the truck night
  let before = 0;
  for (let k = G.day; k <= td; k++) before += forecastFor(dept, k) * (k === G.day ? (G.phase === 'day' ? trafficRemaining(G.time) : 0) : 1);
  need += forecastFor(dept, td + 1) * 0.25 - (sysOnHand(dept) - before) - dsdUnits(dept) * 0.8 * cover + ecOrderNeed(dept);
  return Math.max(0, Math.ceil(need / d.upc));
}
function suggestedOrder() { const o = {}; DEPTS.forEach(d => { o[d.id] = suggestedCases(d.id); }); return o; }

// ---------- truck ----------
// night = tonight's real trucks: the warehouse cuts what it can't ship, and now and then a case is short.
function buildTruck(order, night) {
  const pallets = [], dry = [];
  DEPTS.forEach(d => {
    const n = Math.max(0, Math.floor(order[d.id] || 0));
    const cs = []; for (let i = 0; i < n; i++) cs.push(makeCase(d.id));
    if (night) { resetShip(d.id, cs); cutCases(d.id, cs); invoiceShorts(d.id, cs); }
    misShip(cs); truckDamage(cs);
    if (d.cold) { for (let i = 0; i < cs.length; i += PALLET_SIZE) pallets.push({ id: nid(), cold: true, cases: cs.slice(i, i + PALLET_SIZE) }); }
    else dry.push(...cs);
  });
  shuffle(dry);
  for (let i = 0; i < dry.length; i += PALLET_SIZE) pallets.push({ id: nid(), cold: false, cases: dry.slice(i, i + PALLET_SIZE) });
  return pallets;
}
function freeRecvSpot(near) {
  const taken = G.pallets.concat(G.empties || []);
  const spots = MAPD.recvSpots.filter(s => !s.reserved && !taken.some(p => Math.abs(p.x - s.x - 0.5) < 0.6 && Math.abs(p.y - s.y - 0.5) < 0.6));
  if (!spots.length) return null;
  if (near) spots.sort((a, b) => Math.hypot(a.x + 0.5 - near.x, a.y + 0.5 - near.y) - Math.hypot(b.x + 0.5 - near.x, b.y + 0.5 - near.y));
  return spots[0];
}
function placePallet(p, spot) {
  spot = spot || freeRecvSpot() || pick(MAPD.recvSpots);
  p.x = spot.x + 0.5; p.y = spot.y + 0.5;
  G.pallets.push(p);
}

// ---------- mail, toasts, xp ----------
function mail(from, subject, body) { G.emails.unshift({ id: nid(), day: G.day, time: G.time, from, subject, body, read: false }); }
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  if (typeof SFX !== 'undefined') (SFX[kind] || SFX.info)();
  setTimeout(() => el.remove(), 5000);
}
function floater(x, y, text, color) { RT.floaters.push({ x, y, text, color: color || '#fff', t: 0 }); }
function addXP(n, at) {
  const before = level();
  G.xp += n;
  if (G.today) G.today.xp += n;
  if (at) floater(at.x, at.y - 0.7, `+${n} XP`, '#ffd34d');
  if (level() > before) { confetti(G.player.x, G.player.y, 70); }
  if (level() > before) toast(`⭐ LEVEL UP! Level ${level()} — ${title()}. +1 crew slot unlocked.`, 'gold');
}

function makeCandidate() {
  const role = pick(Object.keys(ROLES)), skill = randi(1, 5);
  const shift = role === 'unloader' ? 'night' : pick(['open', 'truck6', 'truck7', 'truck8', 'mid', 'close', 'close']);
  return makeApplicantTruth({
    id: nid(), name: pick(FIRST_NAMES) + ' ' + pick(LAST_INITIALS) + '.', role, skill,
    shift, avail: makeAvail(shift),
    exp: hireTrainingBase(skill),
  });
}

function addTag(kind) {
  const dept = pick(DEPTS).id, t = pick(MAPD.shelfTiles[dept]);
  if (G.tags.some(x => x.x === t.x && x.y === t.y)) return;
  G.tags.push({ id: nid(), dept, x: t.x, y: t.y, kind });
}
function fixTag(tag, byPlayer) {
  G.tags = G.tags.filter(t => t !== tag);
  G.today.tagsFixed++;
  if (byPlayer) addXP(5, G.player);
}

// =====================================================================
//  Game lifecycle
// =====================================================================
function newGame() {
  G = {
    version: 1, day: 1, time: 300, phase: 'night', speed: 1, xp: 0, bank: 0, sat: 80, nextId: 1,
    stock: {}, pallets: [], trailer: [], floats: [], crew: [], candidates: [], emails: [], endcaps: {},
    history: {}, itemHistory: {}, order: null, orderSubmitted: false, tags: [], vendorsToday: [], badges: {},
    ad: null, today: null, lastResult: null, pastDays: [], nightLabor: 0, overtime: 0, nightPallets: 0,
    player: { x: 30.5, y: 6.5, fx: 0, fy: 1, carry: [], floatId: null, birdId: null, pallet: null, work: null, away: false },
  };
  applyCatalog();
  DEPTS.forEach(d => {
    G.stock[d.id] = { shelf: Math.round(d.capU * 0.3), back: d.upc };
    G.history[d.id] = Array.from({ length: 7 }, () => Math.round(d.demand * d.upc * rand(0.88, 1.12)));
    const wsum = sum(d.items.map(i => i[1]));
    d.items.forEach(([n, w]) => { G.itemHistory[n] = G.history[d.id].map(u => Math.round(u * w / wsum * rand(0.85, 1.15))); });
  });
  G.layout = null; ensureLayout();
  MAPD.floatSpots.forEach(s => G.floats.push({ id: nid(), dept: s.dept, x: s.x + 0.5, y: s.y + 0.5, homeX: s.x + 0.5, homeY: s.y + 0.5, cases: [], carriedBy: null, claimedBy: null, incoming: 0 }));
  MAPD.endcaps.forEach(e => { G.endcaps[e.id] = null; });
  G.endcaps[MAPD.endcaps[3].id] = 'A2';
  G.endcaps[MAPD.endcaps[5].id] = 'A3';
  ensureEndcaps();
  G.crew.push({ id: nid(), name: 'Maria L.', role: 'breakdown', shift: 'open', skill: 3, wage: 16.25, calledOut: false });
  G.crew.push({ id: nid(), name: 'Devon P.', role: 'freight', shift: 'truck6', skill: 3, wage: 16.25, calledOut: false });
  G.crew.forEach(c => ensureMorale(ensureTrain(c, 40)));
  G.trash = [];
  ensureBackroom();
  ensureFacing();
  ensureCounts();
  ensureDamages();
  ensureCuts();
  ensureRecalls();
  ensureResets();
  buildTruck(suggestedOrder()).forEach(p => placePallet(p));
  RT.crew = {}; RT.customers = []; RT.vendorNpcs = {}; RT.repNpc = null; RT.dmNpc = null; RT.replenClaim = {};
  mail('Store Training', 'Welcome to your store!', [
    'Welcome aboard! Last night\'s truck is sitting in Receiving (top-left, yellow area).',
    '',
    'Your first-day checklist:',
    '  1. Grab cases off a pallet [E] and sort them onto the matching department float (blue spots).',
    '  2. Push a built float [E] to its aisle and work it onto the shelf.',
    '  3. Dairy & Frozen pallets (blue outline) spoil if they sit — work them first.',
    '  4. Check in DSD vendors at the back door when they show up.',
    '  5. Hang the yellow price-change tags; fix red scan errors.',
    '  6. Before close, review Forecast & Order for tonight\'s truck.',
    '',
    'Maria (Truck Breakdown) and Devon (Freight Pusher) are on the Open shift. Hire more help in the Hiring tab — but watch labor %.',
  ].join('\n'));
  startDay();
}

function startDay() {
  G.phase = 'day';
  G.time = 300;
  if (G.day > 1) G.sat = G.sat * 0.6 + 32; // customers partly forgive overnight
  RT.customers = []; RT.outsWarned = {}; RT.custAcc = 0; RT.replenClaim = {}; RT.faceClaim = {}; RT.gobackClaim = null; RT.voWarned = {}; RT.dmgClaim = null; RT.reclaimClaim = null;
  ensureFacing(); ensureDamages();
  G.floats.forEach(f => {
    if (f.carriedBy === 'player') return;
    f.x = f.homeX; f.y = f.homeY; f.carriedBy = null; f.claimedBy = null; f.incoming = 0;
  });
  G.today = {
    sales: 0, customers: 0, units: {}, demand: {}, lost: {}, itemDemand: {}, requests: 0, misses: 0,
    labor: G.nightLabor, overtime: G.overtime, nightPallets: G.nightPallets, shrink: 0, spoiled: 0, scanLoss: 0,
    truckDoneAt: null, truckCases: truckRemaining(), tagsFixed: 0, vendorsIn: 0, vendorsMissed: 0,
    missorts: 0, youSorted: 0, youStocked: 0, xp: 0,
    goal: Math.round(sum(DEPTS.map(d => forecastFor(d.id, G.day) * d.price))),
  };
  G.nightLabor = 0; G.overtime = 0; G.nightPallets = 0;
  const nTags = 4 + (G.day % 3) * 2;
  for (let i = 0; i < nTags; i++) addTag('change');
  G.vendorsToday = VENDORS.map(v => ({ ...v, state: 'pending' }));
  G.candidates = [makeCandidate(), makeCandidate(), makeCandidate()];
  G.order = null; G.orderSubmitted = false; G.orderLocked = false; G.conflict = null;
  timeoffStartDay();
  perfStartDay();
  laborStartDay();
  G.crew.forEach(c => {
    c.calledOut = G.day > 1 && !!curShift(c) && Math.random() < calloutChance(ensureMorale(c));
    if (c.calledOut) mail(c.name, 'Can\'t make it in today', `Hey, I'm sick and can't make my ${SHIFTS[curShift(c)].name} shift today. Sorry!\n— ${c.name}`);
  });
  timeoffCallouts();
  discStartDay();
  weatherStartDay();
  repsStartDay();
  dmStartDay();
  const dowNow = dowOf(G.day);
  if (!G.ad && G.day === 1) G.ad = { depts: shuffle(DEPTS.map(d => d.id)).slice(0, 2), from: 1 };
  if (dowNow === 'Mon') {
    G.nextAd = shuffle(DEPTS.map(d => d.id)).slice(0, 2);
    mail('District Manager', `Next ad chart: ${G.nextAd.map(d => DEPT[d].name).join(' & ')}`,
      `The new ad starts Wednesday. Plan the new set today in the Display Planner (2 endcaps each for ${G.nextAd.map(d => DEPT[d].name).join(' and ')}), and order extra on tonight's truck: each endcap holds ${EC_CASES} cases, built from backstock. The closing crew flips the endcaps Tuesday from 6 PM; verify it Wednesday morning.\nEndcaps lift sales, but only while there's product on them and the shelves behind them stay full.`);
  }
  if (dowNow === 'Wed' && G.nextAd) {
    G.ad = { depts: G.nextAd, from: G.day }; G.nextAd = null;
    mail('District Manager', 'New ad is live', `Today's ad features ${G.ad.depts.map(d => DEPT[d].name).join(' & ')}. Verify every ad endcap is up and full by noon.`);
  }
  eventsStartDay();
  backroomStartDay();
  countsStartDay();
  cutsStartDay();
  recallsStartDay();
  resetsStartDay();
  endcapsStartDay();
  G.list = buildChecklist();
  shiftStartDay();
  const nt = nextTruckDay(G.day);
  mail('District Manager', `${WEEKDAY_NAMES[dowIdx(G.day)]} game plan (${dayLabel(G.day)})`, [
    `Morning! It's ${WEEKDAY_NAMES[dowIdx(G.day)]}, week ${weekOf(G.day)}. Here's today:`,
    `  • Tonight's trucks: ${trucksOn(G.day).join(', ') || 'none'}. Order due by ${fmtTime(ORDER_CUTOFF)}.`,
    `  • Invoices to close today: ${(TRUCK_SCHEDULE[dowOf(G.day - 1 || 7)] || []).join(', ')} + DSD`,
    `  • Backstock birds today: ${(BACKSTOCK_RUNS[dowNow] || []).map(d => DEPT[d].aisle).join(', ') || 'none'}`,
    `  • Sales goal: ${money(G.today.goal)}`,
    `  • Labor: ${LABOR_TARGET}% of sales or less`,
    `  • Truck: ${G.today.truckCases} cases — have it worked by noon`,
    `  • Price changes: ${G.tags.length} tags to hang`,
    `  • Reloads: ${stopText()} (${reloadUsed()}/${RELOAD_SLOTS} slots staged)`,
    `  • DSD today: ${VENDORS.map(v => `${fmtTime(v.time)} ${v.name}`).join(', ')}`,
    '',
    'Cold freight first. Let\'s have a great day.',
  ].join('\n'));
  save();
}

function despawnCrew(c) {
  const r = RT.crew[c.id];
  if (!r) return;
  finishPlan(c, r);
  r.inBuilding = false;
}

function endDay() {
  const t = G.today;
  G.vendorsToday.forEach(v => { if (v.state === 'waiting') { v.state = 'left'; t.vendorsMissed++; } });
  RT.vendorNpcs = {}; RT.customers = [];
  G.crew.forEach(despawnCrew);
  tenureDay();
  countsEndDay(); damagesEndDay(); cutsEndDay(); recallsEndDay(); resetsEndDay(); endcapsEndDay(); perfEndDay();
  const res = computeResults();
  res.tips.push(...moraleDay(res), ...eventsTips(), ...backroomTips(), ...facingTips(), ...countsTips(), ...damagesTips(), ...cutsTips(), ...recallsTips(), ...resetsTips(), ...endcapsTips(), ...timeoffTips(), ...interviewTips(), ...huddleTips(), ...perfTips(), ...custTips(), ...weatherTips(), ...repsTips(), ...dmTips(), ...discTips());
  DEPTS.forEach(d => {
    G.history[d.id].push(t.demand[d.id] || 0);
    if (G.history[d.id].length > 14) G.history[d.id].shift();
    d.items.forEach(([n]) => { const h = G.itemHistory[n]; h.push(t.itemDemand[n] || 0); if (h.length > 14) h.shift(); });
  });
  res.badges.forEach(b => { G.badges[b] = (G.badges[b] || 0) + 1; });
  G.bank += res.bonus;
  addXP(res.xp);
  G.pastDays.push({ day: G.day, grade: res.grade, score: Math.round(res.score), sales: t.sales, goal: t.goal, laborPct: res.laborPct, inStock: res.inStock, truckDoneAt: t.truckDoneAt, ...dayExtras(res), ...laborDayExtras(), ...backroomDayExtras(), ...facingDayExtras(), ...countsDayExtras(), ...damagesDayExtras(), ...cutsDayExtras(), ...recallsDayExtras(), ...resetsDayExtras(), ...endcapsDayExtras(), ...timeoffDayExtras(), ...interviewDayExtras(), ...huddleDayExtras(), ...perfDayExtras(), ...custDayExtras(), ...weatherDayExtras(), ...pnlDayExtras(), ...repsDayExtras(), ...dmDayExtras(), ...discDayExtras() });
  if (G.pastDays.length > 30) G.pastDays.shift();
  updateRecords(G.pastDays[G.pastDays.length - 1]);
  if (dowOf(G.day) === 'Fri') {
    const rv = buildWeekReview(weekOf(G.day));
    if (rv) { G.reviews = (G.reviews || []).concat([rv]).slice(-12); G.pendingReview = rv; mail('District Manager', `Week ${rv.week} review: ${rv.grade}`, reviewText(rv)); }
    buildPnl(weekOf(G.day));
  }
  G.lastResult = res;
  G.phase = 'summary';
  save();
  UI.showSummary(res);
}

function computeResults() {
  const t = G.today;
  const laborPct = t.sales > 0 ? t.labor / t.sales * 100 : 100;
  const inStock = t.requests ? 1 - t.misses / t.requests : 1;
  const salesR = t.goal ? t.sales / t.goal : 1;
  const td = t.truckDoneAt;
  const tagsAll = t.tagsFixed + G.tags.length;
  const vAll = t.vendorsIn + t.vendorsMissed;
  const parts = [
    { name: 'Sales vs goal', detail: `${money(t.sales)} of ${money(t.goal)} (${Math.round(salesR * 100)}%)`, pts: 30 * clamp(salesR, 0, 1), max: 30 },
    { name: 'In-stock', detail: `${(inStock * 100).toFixed(1)}% · ${t.misses} customers hit an empty shelf`, pts: 25 * clamp((inStock - 0.8) / 0.18, 0, 1), max: 25 },
    { name: 'Labor', detail: `${laborPct.toFixed(1)}% of sales (${money(t.labor)})`, pts: laborPct <= LABOR_TARGET ? 20 : 20 * clamp((20 - laborPct) / 8, 0, 1), max: 20 },
    { name: 'Truck worked', detail: td ? `Done at ${fmtTime(td)}` : (t.truckCases ? `${truckRemaining()} cases still in the back` : 'No truck'), pts: t.truckCases === 0 ? 15 : !td ? 0 : td <= 720 ? 15 : td <= 960 ? 8 : 3, max: 15 },
    { name: 'Price integrity', detail: `${t.tagsFixed}/${tagsAll} tags & scan errors fixed`, pts: 5 * (tagsAll ? t.tagsFixed / tagsAll : 1), max: 5 },
    { name: 'DSD vendors', detail: `${t.vendorsIn}/${vAll} checked in`, pts: 5 * (vAll ? t.vendorsIn / vAll : 1), max: 5 },
  ];
  const score = sum(parts.map(p => p.pts));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const badges = [];
  if (td && td <= 600) badges.push('truck10');
  if (t.misses === 0 && t.requests > 50) badges.push('zeroOuts');
  if (t.sales > 0 && laborPct < 10) badges.push('laborHawk');
  if (t.vendorsMissed === 0 && t.vendorsIn > 0) badges.push('vendorPal');
  if (G.tags.length === 0) badges.push('tagTeam');
  if (t.spoiled === 0) badges.push('coldChain');
  if (G.ad && G.ad.depts.every(d => endcapCount(d) >= 2)) badges.push('adStar');
  if (grade === 'A') badges.push('straightA');
  if ((t.coached || 0) >= 4) badges.push('coach');
  if (facedAll(90) && !(G.gobacks || []).length) badges.push('facedUp');
  if (countsToday().length && countsToday().every(k => k.status === 'done')) badges.push('countKeeper');
  if (t.claims && !t.claimsMissed) badges.push('claimsClerk');
  if (shortsToday().length && shortsToday().every(s => s.state === 'claimed')) badges.push('shortStop');
  if (recallTodayBadge()) badges.push('recallReady');
  if (resetBadgeToday()) badges.push('resetCrew');
  const tips = [];
  if (t.misses) {
    const worst = Object.entries(t.lost).sort((a, b) => b[1] - a[1])[0];
    tips.push(`${t.misses} customers hit an empty shelf — worst was ${DEPT[worst[0]].name} (${worst[1]} units lost). Fill holes from backstock and order enough for tomorrow.`);
  }
  if (t.truckCases && (!td || td > 720)) tips.push('The truck wasn\'t worked by noon. Put more Breakdown/Freight hands on the Open shift, or hire a Night Unloader so pallets are ready at 5 AM.');
  if (t.spoiled) tips.push(`${t.spoiled} cold cases spoiled in the backroom (${money(t.shrink)}). Break down and work Dairy & Frozen first — every hour counts.`);
  if (laborPct > LABOR_TARGET) tips.push(`Labor ran ${laborPct.toFixed(1)}%. Trim overlapping shifts or move people to where the work is.`);
  if (laborPct < 8 && (t.misses > 20 || !td)) tips.push('Labor was lean but the store suffered — sometimes one more person pays for themselves.');
  if (G.tags.length) tips.push(`${G.tags.length} price tags / scan errors were left open. Unhung tags cause overcharges and complaints.`);
  if (t.vendorsMissed) tips.push(`${t.vendorsMissed} DSD vendor(s) left without being checked in. Put someone on DSD, or watch the back door.`);
  if (t.missorts) tips.push(`You tried ${t.missorts} case(s) on the wrong float. Know your aisles: ${DEPTS.map(d => `${d.aisle} ${d.name}`).join(' · ')}.`);
  if (t.crewMistakes) tips.push(`Your crew made ${t.crewMistakes} mistake(s) and you coached ${t.coached || 0}. Coach right away: that's how rookies become superstars.`);
  if ((G.trash || []).length) tips.push(`${G.trash.length} piece(s) of cardboard are still on the floor. Messy aisles lower customer satisfaction every hour.`);
  if (t.systemOrder) tips.push(`You missed the order window (${fmtTime(ORDER_CUTOFF)}) and the system order went instead. The system doesn't know your store: check Forecast & Order before the cutoff on every truck day.`);
  if (!tips.length) tips.push('Clean day. Try for a faster truck or tighter labor tomorrow.');
  const gradeXP = { A: 150, B: 100, C: 60, D: 30, F: 10 }[grade];
  return {
    day: G.day, grade, score, parts, laborPct, inStock, badges, tips,
    xp: gradeXP + badges.length * 25, bonus: { A: 150, B: 100, C: 50, D: 20, F: 0 }[grade],
    earnedToday: t.xp,
  };
}

function startNight() {
  G.phase = 'night';
  G.time = CLOSE;
  if (isTruckNight(G.day)) {
    if (!G.orderSubmitted) { G.order = suggestedOrder(); G.today.systemOrder = true; }
    const ord = G.order || suggestedOrder();
    G.trailer = buildTruck(ord, true);
    cutReport(ord);
    toast(`🚚 Tonight's trucks (${trucksOn(G.day).join(', ')}): ${G.trailer.length} pallets. Pull them into Receiving at the dock doors (top-left), or press "End night".`, 'info');
  } else {
    G.trailer = [];
    toast(`No truck tonight. Next truck: ${WEEKDAY_NAMES[dowIdx(nextTruckDay(G.day + 1))]} night. Press "End night" when you're ready.`, 'info');
  }
  G.orderSubmitted = true; G.orderLocked = true;
  shiftStartNight();
  save();
}

function endNight() {
  if (G.player.pallet) { if (G.player.pallet.empty) G.empties.push({ id: G.player.pallet.id, x: G.player.x, y: G.player.y }); else placePallet(G.player.pallet, freeRecvSpot(G.player)); G.player.pallet = null; }
  G.player.work = null;
  G.crew.forEach(despawnCrew);
  if (G.trailer.length) {
    const n = G.trailer.length, cost = n * OT_PER_PALLET;
    G.overtime += cost; G.nightLabor += cost;
    G.trailer.forEach(p => placePallet(p));
    G.trailer = [];
    toast(`Overtime crew unloaded ${n} pallet${n > 1 ? 's' : ''} (+${money(cost)} labor).`, 'warn');
  }
  MAPD.recvSpots.forEach(s => { s.reserved = null; });
  reloadsEndNight();
  G.day++;
  startDay();
}

function confirmEndNight() {
  if (G.phase !== 'night') return;
  const n = G.trailer.length;
  if (!n) return endNight();
  UI.ask('End the night?', `${n} pallet${n > 1 ? 's are' : ' is'} still on the trailer. An overtime crew will unload ${n > 1 ? 'them' : 'it'} for ${money(n * OT_PER_PALLET)} of labor (counts against tomorrow).`, 'End the night', () => { if (G.phase === 'night') endNight(); });
}

// =====================================================================
//  Main update
// =====================================================================
function isPaused() { return RT.paused || UI.open || RT.modal || !G || (G.phase !== 'day' && G.phase !== 'night'); }

function update(dt) {
  const night = G.phase === 'night';
  const gm = dt * (night ? 3 : 1);   // game minutes this step
  const prev = G.time;
  G.time += gm;
  mgrTick(gm);
  if (!night) {
    if (G.time >= CLOSE) { G.time = CLOSE; endDay(); return; }
    if (Math.floor(G.time / 60) !== Math.floor(prev / 60)) onHour(Math.floor(G.time / 60));
    spawnCustomers(gm);
    orderWindowTick(prev);
    listTick();
    recallsTick();
    resetsTick();
    conflictTick(gm);
    eventsTick(prev, gm);
    laborTick();
    if (G.time > OPEN && G.time < CLOSE - 60 && Math.random() < gm / 140) {
      const before = G.tags.length;
      addTag('error');
      if (G.tags.length > before) toast(`A customer reported a scan error in ${DEPT[G.tags[G.tags.length - 1].dept].name}.`, 'warn');
    }
    updateVendors(dt);
    updateReps(dt);
    updateDm(dt);
    updateCustomers(dt);
    if (!G.today.truckDoneAt && G.today.truckCases > 0 && truckRemaining() === 0) {
      G.today.truckDoneAt = G.time;
      toast(`🚚 Truck worked! Finished at ${fmtTime(G.time)}.`, 'good');
      addXP(20, G.player);
      confetti(G.player.x, G.player.y, 50);
    }
  } else if (G.time >= NIGHT_END) { endNight(); return; }
  updateCrew(dt, gm);
}

function orderWindowTick(prev) {
  if (!isTruckNight(G.day) || G.orderLocked) return;
  if (!G.orderSubmitted && prev < ORDER_CUTOFF - 60 && G.time >= ORDER_CUTOFF - 60) toast(`⏰ Order window closes at ${fmtTime(ORDER_CUTOFF)}: one hour left to submit tonight's order.`, 'warn');
  if (G.time >= ORDER_CUTOFF) {
    G.orderLocked = true;
    if (!G.orderSubmitted) {
      G.order = suggestedOrder(); G.orderSubmitted = true; G.today.systemOrder = true;
      mail('Replenishment System', 'Order window closed: system order sent', `No order was submitted by ${fmtTime(ORDER_CUTOFF)}, so the suggested order was sent automatically (${sum(Object.values(G.order))} cases). You can't change it now.`);
      toast('Order window closed. The system order was sent for you.', 'bad');
    } else toast(`Order window closed. Your order (${sum(Object.values(G.order))} cs) is locked in.`, 'info');
  }
}

function onHour(h) {
  if (h >= 9 && h <= 21) spoilCheck();
  mentorHour(); trashHour(); moraleHour(); eventsHour(h); backroomHour(); facingHour(h); damagesHour(); recallsHour(h); resetsHour(h); endcapsHour(h); timeoffHour(); custHour(h); weatherHour(h); dmHour(h); discHour();
  if (h === 13 && G.sat < 55) mail('Customer Service Desk', 'Complaints are piling up', 'We\'re getting a lot of complaints about empty shelves and wrong prices today. Can someone check the floor?');
  if (h === 16) toast('🛒 Rush hour is coming (4–7 PM). Top off the fast movers now!', 'warn');
  if (h % 2 === 0) save();
}

function spoilCheck() {
  let n = 0, loss = 0;
  const chk = cont => {
    cont.cases = cont.cases.filter(cs => {
      if (DEPT[cs.d].cold && Math.random() < 0.04) { n++; loss += caseUnits(cs) * DEPT[cs.d].price * 0.6; return false; }
      return true;
    });
  };
  G.pallets.forEach(chk); G.floats.forEach(chk);
  removeEmptyPallets();
  if (n) {
    G.today.shrink += loss; G.today.spoiled += n;
    toast(`❄ ${n} cold case${n > 1 ? 's' : ''} spoiled in the backroom (−${money(loss)}). Work Dairy & Frozen first!`, 'bad');
  }
}

// ---------- customers ----------
const CUST_PER_DAY = sum(DEPTS.map(d => d.demand * d.upc)) / 6;
const CUST_COLORS = ['#e76f51', '#f4a261', '#2a9d8f', '#264653', '#8ab17d', '#b5838d', '#6d597a', '#457b9d', '#e9c46a', '#a8dadc'];

function spawnCustomers(gm) {
  if (G.time < OPEN || G.time > CLOSE - 20) return;
  const w = TRAFFIC[Math.floor(G.time / 60)] || 0;
  const satMult = clamp(0.7 + 0.3 * G.sat / 80, 0.7, 1.08);
  RT.custAcc += CUST_PER_DAY * dowFactor(G.day) * wxTraffic(G.day) * satMult * w / TRAFFIC_SUM / 60 * gm;
  while (RT.custAcc >= 1) { RT.custAcc -= 1; spawnCustomer(); }
}

function spawnCustomer() {
  const n = randi(2, 4), stops = [], pool = DEPTS.slice();
  for (let i = 0; i < n && pool.length; i++) {
    const d = wpick(pool, x => x.demand * x.upc * promoLift(x.id) * catalogFactor(x.id) * seasonLift(x.id, G.day) * wxLift(x.id, G.day) * repLift(x.id, G.day));
    stops.push(d.id); pool.splice(pool.indexOf(d), 1);
  }
  const door = pick(MAPD.frontDoor);
  const cu = { x: door.x + 0.5, y: door.y + 0.5, fx: 0, fy: -1, stops, i: 0, state: 'walk', t: 0, path: null, color: pick(CUST_COLORS), emote: null, emoteT: 0, speed: rand(2.0, 2.8) };
  routeCustomer(cu);
  RT.customers.push(cu);
}

function routeCustomer(cu) {
  let tiles;
  if (cu.state === 'walk') tiles = [pick(MAPD.access[cu.stops[cu.i]])];
  else if (cu.state === 'toReg') tiles = [pick(MAPD.registers)];
  else tiles = MAPD.frontDoor;
  const p = pathToTiles(cu, tiles);
  if (!p) { cu.dead = true; return; }
  setPath(cu, p);
}

function updateCustomers(dt) {
  for (const cu of RT.customers) {
    if (cu.emoteT > 0) cu.emoteT -= dt;
    if (cu.state === 'help') { custReqTick(cu, dt); continue; } // waiting for help (js/customers.js)
    if (cu.path) { if (moveAlong(cu, dt, cu.speed)) cu.path = null; else continue; }
    cu.t += dt;
    if (cu.state === 'walk') { cu.state = 'shop'; cu.t = 0; }
    else if (cu.state === 'shop' && cu.t > 1.2) {
      buy(cu, cu.stops[cu.i]); cu.i++;
      cu.state = cu.i < cu.stops.length ? 'walk' : 'toReg';
      routeCustomer(cu);
    } else if (cu.state === 'toReg') { cu.state = 'pay'; cu.t = 0; }
    else if (cu.state === 'pay' && cu.t > 1.8) { G.today.customers++; cu.state = 'leave'; routeCustomer(cu); }
    else if (cu.state === 'leave') cu.dead = true;
  }
  RT.customers = RT.customers.filter(c => !c.dead);
}

function buy(cu, dept) {
  const d = DEPT[dept], s = G.stock[dept], t = G.today;
  let q = randi(1, 3) + (endcapCount(dept) && Math.random() < 0.3 ? 1 : 0);
  const sl = seasonLift(dept, G.day) * wxLift(dept, G.day) * repLift(dept, G.day);
  if (sl > 1 && Math.random() < Math.min(1, (sl - 1) * 1.6)) q++;
  t.requests++;
  t.demand[dept] = (t.demand[dept] || 0) + q;
  const it = wpick(d.items, i => i[1])[0];
  t.itemDemand[it] = (t.itemDemand[it] || 0) + q;
  const fromEc = ecHas(dept) && (s.shelf - codeExp(dept) <= 0 || Math.random() < EC_SHARE);
  if (!fromEc && s.shelf - codeExp(dept) <= 0) {
    t.misses++;
    countsOnOut(dept);
    t.lost[dept] = (t.lost[dept] || 0) + q;
    G.sat = Math.max(0, G.sat - 0.4);
    cu.emote = '!'; cu.emoteT = 2.5;
    if (!RT.outsWarned[dept] || G.time - RT.outsWarned[dept] > 60) {
      RT.outsWarned[dept] = G.time;
      toast(`OUT OF STOCK: ${d.name}! Customers are walking away empty-handed.`, 'bad');
    }
    return;
  }
  if (recallBlock(dept, it, cu)) return;
  if (outHole(dept, it, cu, q)) return;
  if (!fromEc && visualOut(dept, cu, q)) return;
  const got = fromEc ? ecTake(dept, q) : Math.min(q, s.shelf - codeExp(dept));
  if (!fromEc) s.shelf -= got;
  t.sales += got * d.price - (fromEc ? 0 : codesSold(dept, got, cu));
  t.units[dept] = (t.units[dept] || 0) + got;
  G.sat = Math.min(100, G.sat + 0.08);
  shopMess(dept, got, cu);
  countsOnBuy(dept, got);
  shelfDamage(dept, cu);
  const tag = G.tags.find(tg => tg.dept === dept && tg.kind === 'error') || G.tags.find(tg => tg.dept === dept);
  if (tag && Math.random() < (tag.kind === 'error' ? 0.08 : 0.03)) {
    t.scanLoss += 2.5; G.sat = Math.max(0, G.sat - 0.5);
    cu.emote = '$?'; cu.emoteT = 2.5;
  }
}

// ---------- DSD vendors ----------
function updateVendors(dt) {
  for (const v of G.vendorsToday) {
    let n = RT.vendorNpcs[v.name];
    if (v.state === 'pending' && G.time >= v.time && G.time < CLOSE - 30) {
      v.state = 'waiting'; v.arrived = G.time;
      n = RT.vendorNpcs[v.name] = { x: MAPD.staffDoor.x + 0.5, y: MAPD.staffDoor.y + 0.5, fx: 0, fy: 1, path: null, mode: 'wait', v };
      setPath(n, pathToTiles(n, [MAPD.vendorSpot]) || []);
      toast(`🚚 DSD: ${v.name} is at the back door with ${v.cases} cases of ${DEPT[v.dept].name}. Check them in!`, 'info');
    }
    if (v.state === 'waiting' && G.time - v.arrived > VENDOR_PATIENCE) {
      v.state = 'left'; G.today.vendorsMissed++; G.sat = Math.max(0, G.sat - 2);
      mail(v.name, 'Missed delivery', `We waited ${VENDOR_PATIENCE} minutes at your back door and nobody checked us in. ${v.cases} cases of ${DEPT[v.dept].name} were not delivered today.`);
      toast(`${v.name} gave up waiting and left. ${v.cases} cases not delivered.`, 'bad');
      if (n) { n.mode = 'exit'; setPath(n, pathToTiles(n, [MAPD.staffDoor]) || []); }
    }
    if (!n) continue;
    if (n.path) { if (moveAlong(n, dt, 2.6)) n.path = null; else continue; }
    if (n.mode === 'toAisle') {
      for (let i = 0; i < v.cases; i++) stockUnits(v.dept, DEPT[v.dept].upc);
      v.state = 'done'; n.mode = 'exit';
      setPath(n, pathToTiles(n, [MAPD.staffDoor]) || []);
    } else if (n.mode === 'exit') delete RT.vendorNpcs[v.name];
  }
}

function checkInVendor(v, byPlayer) {
  vendorCredits(v);
  v.state = 'stocking';
  G.today.vendorsIn++;
  const n = RT.vendorNpcs[v.name];
  if (n) { n.mode = 'toAisle'; setPath(n, pathToTiles(n, MAPD.access[v.dept]) || []); }
  else { for (let i = 0; i < v.cases; i++) stockUnits(v.dept, DEPT[v.dept].upc); v.state = 'done'; }
  if (byPlayer) addXP(10, G.player);
  toast(`${v.name} checked in — stocking ${DEPT[v.dept].name}.`, 'good');
}
