'use strict';
// =====================================================================
//  Store life: Special Item Requests, dated dairy (code dates, markdowns,
//  rotation), spills, cooler breakdowns, DM store walks, health
//  inspections and seasonal events.
// =====================================================================

// ---- Catalog (items carried) & Special Item Requests -----------------------
const DEFAULT_ITEMS = {}; DEPTS.forEach(d => { DEFAULT_ITEMS[d.id] = d.items.map(i => i.slice()); });
const SKU_SLOTS = 8; // shelf space per department: add one, deactivate one
const SIR_POOL = {
  A1: ['Coconut Milk 13.5oz', 'Chickpeas 15oz', 'Instant Ramen 6pk', 'Quinoa 12oz', 'Chipotle Peppers 7oz'],
  A2: ['Kombucha 16oz', 'Pork Rinds 5oz', 'Energy Drink 16oz', 'Mango Seltzer 8pk', 'Veggie Straws 7oz'],
  A3: ['Gluten-Free Flour 2lb', 'Pure Maple Syrup 12oz', 'Almond Butter 12oz', 'Protein Pancake Mix', 'Cold Brew Coffee 32oz'],
  A4: ['Laundry Pods 42ct', 'Bamboo Paper Towels', 'Dryer Sheets 120ct', 'Disinfecting Wipes 80ct', 'Compostable Plates 50ct'],
  HBC: ['Sunscreen SPF 50', 'Allergy Relief 24ct', 'Beard Oil 1oz', 'Electrolyte Powder', 'Kids Toothpaste 4oz'],
  DAI: ['Oat Milk Half Gallon', 'Lactose-Free Milk', 'Cottage Cheese 16oz', 'Kefir 32oz', 'Plant-Based Butter'],
  FRZ: ['Non-Dairy Ice Cream', 'Frozen Dumplings 24ct', 'Cauliflower Rice 12oz', 'Breakfast Sandwiches 4ct', 'Acai Bowls 2ct'],
};
const SIR_WHO = ['A regular', 'A young mom', 'An older gentleman', 'A college student', 'A nurse coming off night shift', 'A local cafe owner', 'A customer with a food allergy'];

function applyCatalog() {
  DEPTS.forEach(d => { d.items = (G && G.catalog && G.catalog[d.id] ? G.catalog[d.id] : DEFAULT_ITEMS[d.id]).map(i => i.slice()); });
  if (G) DEPTS.forEach(d => d.items.forEach(([n]) => { if (!G.itemHistory[n]) G.itemHistory[n] = [0, 0, 0, 0, 0, 0, 0]; }));
}
// Department demand moves with what you carry: swap a slow item for a wanted one and sales grow.
function catalogFactor(dept) { return sum(DEPT[dept].items.map(i => i[1])) / sum(DEFAULT_ITEMS[dept].map(i => i[1])); }
function itemWeekUnits(n) { const h = G.itemHistory[n] || []; return Math.round(sum(h.slice(-7))); }

function newSIR() {
  const dept = pick(DEPTS).id;
  const carried = new Set(DEPT[dept].items.map(i => i[0]));
  const opts = SIR_POOL[dept].filter(n => !carried.has(n) && !(G.sirs || []).some(s => s.item === n && s.status === 'open'));
  if (!opts.length) return;
  const w = Math.round(rand(4, 15));
  const wsum = sum(DEPT[dept].items.map(i => i[1]));
  const trueWk = DEPT[dept].demand * DEPT[dept].upc * 7 * w / wsum;
  const s = { id: nid(), dept, item: pick(opts), w, estWk: Math.round(trueWk * rand(0.75, 1.25)), who: pick(SIR_WHO), day: G.day, status: 'open' };
  G.sirs = (G.sirs || []).concat([s]).slice(-30);
  mail('Customer Service Desk', `Special Item Request: ${s.item}`, `${s.who} asked if we can carry ${s.item} (${DEPT[dept].name}). Vendor estimate: about ${s.estWk} units a week.\nApprove or decline it on the office computer → 🛒 Special Items within 3 days. Remember: ${DEPT[dept].name} only has room for ${SKU_SLOTS} items, so carrying it means dropping one.`);
  toast(`🛒 Special Item Request: ${s.who.toLowerCase()} wants ${s.item}.`, 'info');
}
function approveSIR(id, drop) {
  const s = (G.sirs || []).find(x => x.id === id); if (!s || s.status !== 'open') return;
  const d = DEPT[s.dept];
  const out = d.items.find(i => i[0] === drop); if (!out) return;
  const before = itemWeekUnits(drop);
  G.catalog = G.catalog || {};
  G.catalog[s.dept] = d.items.filter(i => i !== out).map(i => i.slice()).concat([[s.item, s.w]]);
  applyCatalog();
  s.status = 'approved'; s.dropped = drop; s.droppedWk = before;
  G.sat = Math.min(100, G.sat + 3);
  const ranks = d.items.filter(i => i[0] !== s.item).map(i => itemWeekUnits(i[0])).sort((a, b) => a - b);
  const slowest = ranks[0] != null && before <= ranks[0];
  toast(`✅ Now carrying ${s.item}. Dropped ${drop} (${before} units last week).`, 'good');
  if (!slowest && before > s.estWk) toast(`⚠ ${drop} sold more than the new item is expected to. Check the slow movers first next time.`, 'warn');
  mail('Customer Service Desk', `${s.item} is on the shelf`, `We let the customer know. They were thrilled and said they'll tell their friends.\n${drop} was deactivated to make room (it sold ${before} units in the last 7 days).`);
  addXP(10, G.player);
}
function declineSIR(id) {
  const s = (G.sirs || []).find(x => x.id === id); if (!s || s.status !== 'open') return;
  s.status = 'declined'; G.sat = Math.max(0, G.sat - 1);
  toast(`Declined: ${s.item}. The customer was told we can't carry it.`, 'info');
}
function sirDay() {
  (G.sirs || []).forEach(s => {
    if (s.status === 'open' && G.day - s.day >= 3) {
      s.status = 'expired'; G.sat = Math.max(0, G.sat - 3);
      mail('Customer Service Desk', `No answer on ${s.item}`, `The customer who asked for ${s.item} came back and nobody had an answer. They weren't happy. Even a "no" is better than silence.`);
    }
  });
}

// ---- Dated dairy: code dates, markdowns, rotation ---------------------------
const CODE_DEPTS = ['DAI'];
function codes(dept) { G.codes = G.codes || {}; return (G.codes[dept] = G.codes[dept] || { short: 0, exp: 0, md: 0 }); }
function codeExp(dept) { return CODE_DEPTS.includes(dept) ? codes(dept).exp : 0; }
function codesFix(dept) { const c = codes(dept), s = G.stock[dept].shelf; const tot = c.short + c.exp + c.md; if (tot > s) { const k = s / tot; c.short = Math.floor(c.short * k); c.exp = Math.floor(c.exp * k); c.md = Math.floor(c.md * k); } }
// Each morning: anything short-dated or marked down that didn't sell is now out of date.
function codesDay() {
  for (const dept of CODE_DEPTS) {
    const c = codes(dept), s = G.stock[dept].shelf;
    c.exp += c.short + c.md; c.md = 0; c.rotated = false;
    const fresh = Math.max(0, s - c.exp);
    const over = Math.max(0, s - forecastFor(dept, G.day) * 1.5); // over-ordering ages product
    c.short = Math.min(fresh, Math.round(fresh * 0.05 + over * 0.35));
    codesFix(dept);
  }
}
// Units sold: markdowns sell first, then short-dated if the shelf was rotated (oldest in front).
// Returns the money given up on markdowns.
function codesSold(dept, got, cu) {
  if (!CODE_DEPTS.includes(dept)) return 0;
  const c = codes(dept), s = G.stock[dept].shelf + got;
  let left = got, lost = 0;
  const md = Math.min(c.md, left); c.md -= md; left -= md; lost += md * DEPT[dept].price * 0.5;
  const shortShare = c.rotated ? 1 : c.short / Math.max(1, s - c.exp);
  const sh = Math.min(c.short, Math.round(left * shortShare)); c.short -= sh;
  if (c.exp > 0 && Math.random() < c.exp / s) {
    G.sat = Math.max(0, G.sat - 0.8); cu.emote = 'EXP'; cu.emoteT = 2.5;
    G.today.expFound = (G.today.expFound || 0) + 1;
    if (!RT.expWarned || G.time - RT.expWarned > 90) { RT.expWarned = G.time; toast(`🥛 A customer found expired product in ${DEPT[dept].name}! Pull dates.`, 'bad'); }
  }
  G.today.markdown = (G.today.markdown || 0) + lost;
  return lost;
}
function pullDates(dept) {
  const c = codes(dept), d = DEPT[dept];
  const loss = c.exp * d.price * 0.6;
  G.stock[dept].shelf -= c.exp;
  G.today.shrink += loss; G.today.expPulled = (G.today.expPulled || 0) + c.exp;
  const md = c.short; c.md += c.short; c.short = 0; c.rotated = true;
  toast(`📆 ${d.name} code check: pulled ${c.exp} expired (−${money(loss)}), marked down ${md} short-dated, rotated oldest to the front.`, c.exp ? 'warn' : 'good');
  c.exp = 0;
}
function codesNeedWork(dept) { const c = codes(dept); return c.exp > 0 || c.short > 0; }
// A Dairy Clerk on shift does the code check mid-morning (well-trained ones do it right).
function codesHour(h) {
  if (h !== 9 && h !== 15) return;
  for (const dept of CODE_DEPTS) {
    if (!codesNeedWork(dept)) continue;
    const clerk = G.crew.find(c => c.role === 'dairy' && onShift(c));
    if (clerk && !rollMistake(clerk, 'stock', 0.5)) { pullDates(dept); toast(`${clerk.name} did the dairy code check.`, 'info'); }
  }
}

// ---- Spills ------------------------------------------------------------------
const SPILL_WINDOW = 30;
function spawnSpill() {
  const dept = pick(DEPTS).id, t = pick(MAPD.access[dept]);
  G.spills = (G.spills || []).concat([{ id: nid(), x: t.x + rand(0.3, 0.7), y: t.y + rand(0.3, 0.7), at: G.time, dept, what: pick(['broken pickle jar', 'leaking milk jug', 'spilled soda', 'cracked eggs', 'dropped laundry soap']) }]);
  toast(`🧽 Spill in ${DEPT[dept].aisle} (${G.spills[G.spills.length - 1].what}). Clean it up before someone slips!`, 'warn');
}
function spillTick(gm) {
  for (const s of (G.spills || []).slice()) {
    G.sat = Math.max(0, G.sat - 0.01 * gm);
    if (G.time - s.at >= SPILL_WINDOW) {
      G.spills = G.spills.filter(x => x !== s);
      G.sat = Math.max(0, G.sat - 6); G.today.incidents = (G.today.incidents || 0) + 1;
      toast(`🚑 A customer slipped on the ${s.what} in ${DEPT[s.dept].aisle}. Incident report filed.`, 'bad');
      mail('Store Manager', 'Customer incident', `A customer slipped on a spill (${s.what}) in ${DEPT[s.dept].aisle} that had been on the floor ${SPILL_WINDOW}+ minutes.\nSpills are the #1 cause of customer injuries. Anyone who sees one owns it until it's cleaned up.`);
    }
  }
}
function cleanSpill(s, crew) {
  G.spills = (G.spills || []).filter(x => x !== s); G.today.spillsCleaned = (G.today.spillsCleaned || 0) + 1;
  if (crew) toast(`🧽 ${crew.name.split(' ')[0]} cleaned up the ${s.what}.`, 'good');
  else { toast('🧽 Spill cleaned up.', 'good'); addXP(4, G.player); }
}

// ---- Cooler breakdown -----------------------------------------------------------
function breakCooler() {
  const dept = pick(['DAI', 'FRZ']);
  G.cooler = { dept, at: G.time, pulled: false, fixAt: null };
  toast(`🚨 The ${DEPT[dept].name} case is down! Temps are climbing. Go pull the product and call maintenance.`, 'bad');
}
function coolerBlocked(dept) { return !!(G.cooler && G.cooler.dept === dept); }
function coolerHour() {
  const k = G.cooler; if (!k || k.pulled) return;
  const s = G.stock[k.dept], n = Math.round(s.shelf * 0.15);
  if (n > 0) { s.shelf -= n; const loss = n * DEPT[k.dept].price * 0.6; G.today.shrink += loss; G.today.coolerLoss = (G.today.coolerLoss || 0) + loss; if (CODE_DEPTS.includes(k.dept)) codesFix(k.dept); toast(`🌡 ${n} units of ${DEPT[k.dept].name} went warm and had to be thrown out (−${money(loss)}).`, 'bad'); }
}
function pullCooler(crew) {
  const k = G.cooler; if (!k || k.pulled) return;
  const s = G.stock[k.dept];
  const good = s.shelf - codeExp(k.dept);
  s.back += good; s.shelf = 0;
  if (CODE_DEPTS.includes(k.dept)) { const c = codes(k.dept); c.short = c.exp = c.md = 0; }
  k.pulled = true; k.fixAt = G.time + 150;
  toast(`🧊 ${crew ? crew.name.split(' ')[0] + ' pulled' : 'Pulled'} ${good} units into the backroom cooler and called maintenance. ETA ${fmtTime(k.fixAt)}.`, 'good');
  if (!crew) addXP(10, G.player);
}
function coolerTick() {
  const k = G.cooler; if (!k || !k.pulled) return;
  if (G.time >= k.fixAt) { toast(`🔧 Maintenance fixed the ${DEPT[k.dept].name} case. Restock it from backstock!`, 'good'); G.cooler = null; }
}

// ---- Interactions ------------------------------------------------------------------
function eventsInteraction(p, shelfDept, urgent) {
  if (!urgent) return codeCheckInteraction(shelfDept);
  const sp = (G.spills || []).find(s => dist(s, p) < 1.2);
  if (sp) return { label: `Clean up the spill (${sp.what})`, fn: () => startWork(2, 'Cleaning spill', () => { if ((G.spills || []).includes(sp)) cleanSpill(sp); }), at: sp };
  if (G.cooler && !G.cooler.pulled && shelfDept === G.cooler.dept) return { label: `🚨 Pull ${DEPT[shelfDept].name} to the backroom cooler & call maintenance`, fn: () => startWork(3, 'Pulling product', () => pullCooler()) };
  return null;
}
function codeCheckInteraction(shelfDept) {
  if (shelfDept && CODE_DEPTS.includes(shelfDept) && codesNeedWork(shelfDept) && !coolerBlocked(shelfDept)) {
    const c = codes(shelfDept);
    return { label: `Code check ${DEPT[shelfDept].name}: ${c.exp} expired, ${c.short} short-dated (pull, mark down, rotate)`, fn: () => startWork(3, 'Checking dates', () => pullDates(shelfDept)) };
  }
  return null;
}

// ---- Seasons -----------------------------------------------------------------------
const SEASONS = [
  { name: 'Summer Cookout', lift: { A2: 1.45, A4: 1.3, FRZ: 1.35 }, tip: 'Beverage, paper plates and ice fly off the shelf.' },
  { name: 'Back to School', lift: { A1: 1.25, A3: 1.35, HBC: 1.2 }, tip: 'Lunch staples, cereal and kids\' health items.' },
  { name: 'Big Game Weekend', lift: { A2: 1.6, FRZ: 1.3 }, days: ['Fri', 'Sat', 'Sun'], tip: 'Chips, soda and frozen pizza, mostly Friday to Sunday.' },
  { name: 'Thanksgiving', lift: { A3: 1.6, DAI: 1.45, A1: 1.3 }, tip: 'Baking, butter, milk, eggs and canned vegetables.' },
  { name: 'Holiday Season', lift: { A1: 1.2, A2: 1.25, A3: 1.3, A4: 1.2, HBC: 1.25, DAI: 1.3, FRZ: 1.2 }, tip: 'Everything is up. Order heavy and staff up.' },
];
// One seasonal event every other week, starting week 2.
function seasonOfWeek(w) { return w >= 2 && w % 2 === 0 ? SEASONS[(w / 2 - 1) % SEASONS.length] : null; }
function seasonLift(dept, day) {
  const s = seasonOfWeek(weekOf(day)); if (!s) return 1;
  if (s.days && !s.days.includes(dowOf(day))) return 1;
  return s.lift[dept] || 1;
}
function seasonBanner() {
  const now = seasonOfWeek(weekOf(G.day)), next = seasonOfWeek(weekOf(G.day) + 1);
  const fmt = s => Object.entries(s.lift).map(([d, v]) => `${DEPT[d].name} +${Math.round((v - 1) * 100)}%`).join(', ');
  let h = '';
  if (now) h += `<div class="card" style="margin-bottom:10px"><b>🎉 This week: ${now.name}</b>${now.days ? ` (${now.days.join('/')})` : ''}. Expect ${fmt(now)}. <span class="mute">${now.tip} The suggested order does NOT include this: adjust it yourself.</span></div>`;
  if (next) h += `<div class="card" style="margin-bottom:10px"><b>📅 Next week: ${next.name}</b>. Expect ${fmt(next)}. <span class="mute">Order ahead on the trucks before it starts.</span></div>`;
  return h;
}

// ---- DM store walk & health inspection ---------------------------------------------------
function conditionsCheck() {
  const shelves = sum(DEPTS.map(d => shelfPct(d.id))) / DEPTS.length;
  const coldOut = sum(G.pallets.concat(G.floats).map(c => c.cases.filter(cs => DEPT[cs.d].cold).length));
  return {
    shelves, trash: (G.trash || []).length, tags: G.tags.length, spills: (G.spills || []).length,
    exp: sum(CODE_DEPTS.map(d => codes(d).exp)), cooler: G.cooler && !G.cooler.pulled ? G.cooler.dept : null, coldOut,
    ...backroomCheck(),
  };
}
function dmWalk() {
  const c = conditionsCheck(), notes = [];
  let score = 100;
  const hit = (pts, txt) => { score -= pts; notes.push(txt); };
  if (c.shelves < 0.6) hit(25, `Shelves are only ${Math.round(c.shelves * 100)}% full on average. Customers judge the whole store by the holes. Fill from backstock first.`);
  else if (c.shelves < 0.75) hit(10, `Shelves average ${Math.round(c.shelves * 100)}%. Not bad, but I can see holes from the front end.`);
  if (c.exp) hit(20, `I found ${c.exp} expired units in dairy. That's a food-safety and trust problem. Code check every morning.`);
  if (c.spills) hit(15, `There's a spill on the floor right now. That's a lawsuit waiting to happen.`);
  if (c.cooler) hit(20, `The ${DEPT[c.cooler].name} case is down and the product is still in it. Pull product first, then call maintenance.`);
  if (c.trash) hit(Math.min(15, c.trash * 4), `${c.trash} pieces of cardboard in the aisles. Pick it up as you go, and make your crew do the same.`);
  if (c.tags > 4) hit(10, `${c.tags} price tags still need to be hung or fixed. Wrong prices cost money at the register and trust with customers.`);
  if (c.birds.length) hit(Math.min(20, c.birds.length * 10), `Backstock birds are sitting on the sales floor in ${c.birds.map(d => DEPT[d].aisle).join(', ')}. That's a wall in front of the customer, and it tells me we ordered more than we can hold.`);
  if (c.dirt > 50) hit(10, 'The backroom is filthy. Your crew works in there all day; it says what you tolerate.');
  if (c.empties > 5) hit(5, `${c.empties} empty pallets are sitting in receiving. Where does tomorrow's truck go?`);
  if (c.crooked > 2) hit(5, `${c.crooked} floats are crooked or out of place. Float staging should be square: it's faster and safer.`);
  if (G.conflict) hit(10, `Two of your people were arguing on the floor while I was here. Deal with it in the back, not in front of customers.`);
  score = Math.max(0, score);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  G.today.dmWalk = { score, grade };
  const open = score >= 90 ? 'Store looks sharp. This is what I want to see every time I walk in.' : score >= 70 ? 'Decent, but I found things a customer would notice.' : 'I\'m disappointed. I told you I was coming, and this is what I found.';
  UI.showModal(`<h2>👔 District Manager store walk: ${grade} (${score})</h2><p><i>"${esc(open)}"</i></p>${notes.length ? '<ul>' + notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : ''}<p class="mute">Why it matters: a planned walk is the easiest test you'll get. You know when he's coming, so the store should be at its best.</p><div class="row" style="justify-content:flex-end"><button class="primary" onclick="UI.hideModal()">Back to work</button></div>`);
  mail('District Manager', `Store walk: ${grade}`, open + '\n\n' + notes.map(n => '• ' + n).join('\n'));
  if (score >= 90) { addXP(30, G.player); confetti(G.player.x, G.player.y, 40); }
}
function inspection() {
  const c = conditionsCheck(), v = [];
  if (c.exp) v.push(['Expired product for sale', `${c.exp} expired dairy units on the shelf.`, 'Customers can get sick, and selling past-date food is a violation. Code check every morning and pull it before doors open.']);
  if (c.cooler) v.push(['Product out of temperature', `${DEPT[c.cooler].name} still in a broken case.`, 'Cold food above 41°F grows bacteria fast. Move it to the backroom cooler the moment a case goes down.']);
  if (c.coldOut > 6) v.push(['Cold product sitting out', `${c.coldOut} cold cases on pallets/floats outside the cooler.`, 'Dairy and frozen should go straight into the cooler or onto the shelf. Work cold first.']);
  if (c.spills) v.push(['Slip hazard', 'An uncleaned spill on the sales floor.', 'Spills must be blocked off and cleaned immediately.']);
  if (c.dirt > 60) v.push(['Unsanitary backroom', `The backroom floor is dirty (${Math.round(c.dirt)}%).`, 'Debris and spilled product attract pests. Sweep mid-day and at close, every day.']);
  if (c.birds.length) v.push(['Blocked aisle', `Backstock parked in ${c.birds.map(d => DEPT[d].aisle).join(', ')}.`, 'Aisles must stay clear for customers and for an emergency exit.']);
  if (c.trash > 3) v.push(['Housekeeping', `${c.trash} pieces of cardboard on the floor.`, 'Clutter hides hazards and attracts pests. Clean as you go.']);
  const pass = v.length === 0, score = Math.max(0, 100 - v.length * 15 - (c.exp ? 10 : 0));
  G.today.inspection = { pass, score };
  if (!pass) G.sat = Math.max(0, G.sat - 8);
  UI.showModal(`<h2>🧑‍⚕️ Health inspection: ${pass ? 'PASSED' : 'FAILED'} (${score})</h2><p class="mute">Unannounced visit at ${fmtTime(G.time)}.</p>${pass ? '<p>No violations. That\'s what daily routines buy you: you\'re ready when nobody tells you they\'re coming.</p>' : '<table><tr><th>Violation</th><th>Found</th><th>Why it matters</th></tr>' + v.map(x => `<tr><td><b>${esc(x[0])}</b></td><td>${esc(x[1])}</td><td class="mute">${esc(x[2])}</td></tr>`).join('') + '</table>'}<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="primary" onclick="UI.hideModal()">Back to work</button></div>`);
  mail('Health Department', `Inspection ${pass ? 'passed' : 'failed'} (${score})`, pass ? 'No violations found.' : v.map(x => `• ${x[0]}: ${x[1]}`).join('\n'));
  pass ? addXP(25, G.player) : toast('Inspection failed. Read the violations.', 'bad');
}

// ---- Scheduling the day's events ---------------------------------------------------------
function eventsStartDay() {
  G.spills = []; G.cooler = null;
  const ev = G.events = { spills: [], sir: null, cooler: null, walk: null, insp: null };
  const n = Math.random() < 0.5 ? 1 : 2;
  for (let i = 0; i < n; i++) ev.spills.push(randi(OPEN + 30, CLOSE - 60));
  if (G.day > 1 && Math.random() < 0.45) ev.sir = randi(600, 1080);
  if (G.day > 3 && Math.random() < 0.14) ev.cooler = randi(540, 1140);
  if (G.day > 2 && Math.random() < 0.2) { ev.walk = pick([600, 780, 840, 900]); mail('District Manager', `Store walk today at ${fmtTime(ev.walk)}`, `I'll be in today at ${fmtTime(ev.walk)} to walk the store. Shelves full, aisles clean, dairy dated, no surprises.`); }
  if (G.day > 4 && Math.random() < 0.12) ev.insp = randi(600, 1080);
  codesDay(); sirDay();
  const now = seasonOfWeek(weekOf(G.day)), next = seasonOfWeek(weekOf(G.day) + 1);
  if (dowOf(G.day) === 'Sat' && now) toast(`🎉 ${now.name} week starts today!`, 'gold');
  if (dowOf(G.day) === 'Mon' && next) mail('District Manager', `Heads up: ${next.name} next week`, `${next.name} starts Saturday. ${next.tip}\nExpect: ${Object.entries(next.lift).map(([d, v]) => `${DEPT[d].name} +${Math.round((v - 1) * 100)}%`).join(', ')}.\nThe system's suggested order won't include it, so plan your orders on this week's trucks.`);
}
function eventsTick(prev, gm) {
  const ev = G.events; if (!ev) return;
  const at = t => prev < t && G.time >= t;
  ev.spills.forEach(t => { if (at(t)) spawnSpill(); });
  if (ev.sir && at(ev.sir)) newSIR();
  if (ev.cooler && at(ev.cooler)) breakCooler();
  if (ev.walk && at(ev.walk)) dmWalk();
  if (ev.insp && at(ev.insp)) inspection();
  spillTick(gm); coolerTick();
}
function eventsHour(h) { coolerHour(); codesHour(h); }
function eventsTips() {
  const t = G.today, tips = [];
  if (t.incidents) tips.push(`${t.incidents} customer incident(s) from spills. A spill is everyone's job the moment they see it.`);
  if (t.expFound) tips.push(`Customers found expired dairy ${t.expFound} time(s). Do the code check (E at the dairy shelf) every morning: pull expired, mark down short-dated, rotate oldest to the front.`);
  if (t.markdown) tips.push(`Markdowns cost ${money(t.markdown)} today. Markdowns beat throwing it away, but too many means you're over-ordering dairy.`);
  if (t.coolerLoss) tips.push(`A cooler went down and ${money(t.coolerLoss)} spoiled before the product was pulled. Pull first, call second.`);
  if (G.cooler && !G.cooler.pulled) { tips.push('The cooler was still down at close with product in it.'); G.cooler = null; }
  if (t.inspection && !t.inspection.pass) tips.push('You failed the health inspection. The violations are in your email, and each one comes from a daily routine that got skipped.');
  return tips;
}

// ---- Drawing ---------------------------------------------------------------------
function drawEvents() {
  for (const s of (G.spills || [])) {
    const x = s.x * T, y = s.y * T, a = 0.6 + 0.3 * Math.sin(performance.now() / 300);
    ctx.fillStyle = `rgba(120,200,255,${a})`; ctx.beginPath(); ctx.ellipse(x, y, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.fillRect(Math.round(x + 10), Math.round(y - 16), 3, 14); ctx.fillRect(Math.round(x + 6), Math.round(y - 18), 11, 6);
    label(ctx, '!', x + 11.5, y - 15, { font: PX(6), color: '#1a1200' });
  }
  if (G.cooler) for (const t of MAPD.shelfTiles[G.cooler.dept] || []) {
    const a = 0.25 + 0.2 * Math.sin(performance.now() / 200);
    ctx.fillStyle = G.cooler.pulled ? 'rgba(255,200,60,0.25)' : `rgba(255,60,40,${a})`; ctx.fillRect(t.x * T, t.y * T, T, T);
  }
  for (const dept of CODE_DEPTS) {
    const c = codes(dept), tiles = MAPD.shelfTiles[dept] || [];
    const nExp = Math.min(tiles.length, Math.ceil(c.exp / 6)), nMd = Math.min(tiles.length, Math.ceil(c.md / 8));
    for (let i = 0; i < nExp; i++) { const t = tiles[(i * 3) % tiles.length]; ctx.fillStyle = '#ff3b30'; ctx.fillRect(t.x * T + 4, t.y * T + 4, 6, 4); }
    for (let i = 0; i < nMd; i++) { const t = tiles[(i * 3 + 1) % tiles.length]; ctx.fillStyle = '#ffd34d'; ctx.fillRect(t.x * T + 20, t.y * T + 4, 7, 4); }
  }
}
