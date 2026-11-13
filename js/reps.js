'use strict';
// =====================================================================
//  Vendor reps.
//  Sales reps from the DSD companies (and the broker for the dry grocery
//  brands) email to set up a visit, then meet you in the office (E at the
//  rep). Each visit they pitch two things, and it's your call:
//  - Some help the store: building their ad display, a scan-back the
//    vendor pays for, pulling their own out-of-code product for credit,
//    extra cases right before a storm.
//  - Some help only them: taking the other brand's shelf space, cutting in
//    an item that isn't in the system, dumping extra cases you can't sell,
//    a gift for you.
//  Say yes to the good ones, no to the rest, and stay on the planogram.
//  A rep who waits 40 minutes and never sees you leaves.
// =====================================================================
const REP_WAIT = 40;                // minutes a rep waits in the office
const REP_SPOT = { x: 35, y: 4 };   // office, by the computer
const REP_CHANCE = 0.4;             // chance a rep asks for tomorrow
const REPS = [
  ...VENDORS.map(v => ({ co: v.name, dept: v.dept, dsd: true })),
  { co: 'Summit Brands (broker)', dept: null, dsd: false },
];
const repCo = name => REPS.find(r => r.co === name);
const repNow = () => (G.repVisits || []).find(v => v.day === G.day && v.state === 'here');
function ensureReps() { G.repVisits = G.repVisits || []; G.repLift = G.repLift || []; G.repFx = G.repFx || []; }

// Department a pitch is about.
function repDept(r) { return r.dept || pick(['A1', 'A3', 'A4', 'HBC']); }
const repOnAd = d => !!((G.ad && G.ad.depts.includes(d)) || (G.nextAd && G.nextAd.includes(d)));
const repStormSoon = () => [1, 2].some(k => WX[k === 1 ? wxDay(G.day + k).near : wxDay(G.day + k).far].big);

// The pitches. Each: when it can come up, what the rep says, and the choices.
const REP_PITCH = {
  display: { ok: (r, d) => repOnAd(d), say: (r, d) => `"${DEPT[d].name} is in the ad. I've got a shipper display on the truck. Let me build it at the front of the aisle so the ad product is right there."`,
    ch: [['yes', 'Yes, build it. Keep the aisle clear.'], ['no', 'No thanks, the shelf is enough.']] },
  scanback: { ok: () => true, say: (r, d) => `"We're funding a scan-back on our ${DEPT[d].name} items: a dollar off for a week, all our money, not yours. I just need the tags hung."`,
    ch: [['yes', 'Yes. Send the tags and we\'ll hang them today.'], ['no', 'Not this week.']] },
  credit: { ok: (r) => r.dsd, say: (r, d) => `"I've got some product of ours that's past code on your shelf. Let me pull it and write you a credit."`,
    ch: [['yes', 'Go ahead. I\'ll sign the credit.'], ['no', 'Leave it, we\'ll sell through it.']] },
  extra: { ok: (r) => r.dsd, say: (r, d) => `"I've got 6 extra cases of ${DEPT[d].name} on the truck. Let me leave them, you'll sell them."`,
    ch: [['yes', 'Leave all 6.'], ['some', 'Leave 2.'], ['no', 'No, we\'ll take our regular order.']] },
  grab: { ok: () => true, say: (r, d) => `"Your ${DEPT[d].name} set is cluttered. Let me take a few of the other brand's facings and give ours more room. Nobody'll notice."`,
    ch: [['yes', 'Sure, go ahead.'], ['no', 'No. The shelf stays on the planogram.']] },
  newitem: { ok: () => true, say: (r, d) => `"We've got a new item out. Let me cut it in on your ${DEPT[d].name} shelf today. I'll make the tag myself."`,
    ch: [['yes', 'Sure, cut it in.'], ['no', 'Not until it comes through corporate and it\'s in our system.']] },
  gift: { ok: () => true, say: () => `"Thanks for all the business. Here are two tickets to Sunday's game, just for you."`,
    ch: [['yes', 'Thanks! I\'ll take them.'], ['raffle', 'I\'ll raffle them off to the crew.'], ['no', 'I appreciate it, but I can\'t accept gifts from vendors.']] },
};
function repPitches(r) {
  const keys = Object.keys(REP_PITCH).filter(k => k !== 'display' && k !== 'extra');
  const out = [], used = new Set();
  // the good ones come up when the situation is there
  const d0 = repDept(r);
  if (repOnAd(d0) && Math.random() < 0.7) { out.push({ key: 'display', dept: d0 }); used.add('display'); }
  if (r.dsd && Math.random() < 0.4) { out.push({ key: 'extra', dept: d0 }); used.add('extra'); }
  while (out.length < 2) {
    const k = pick(keys.filter(x => !used.has(x) && REP_PITCH[x].ok(r, d0)));
    used.add(k); out.push({ key: k, dept: k === 'gift' ? null : repDept(r) });
  }
  return shuffle(out.slice(0, 2));
}

// ---- days ----
function repsStartDay() {
  ensureReps();
  const t = G.today;
  // what happens later because of a yes
  for (const f of G.repFx.filter(x => x.day <= G.day)) {
    if (f.kind === 'audit') { mail('District office', 'Planogram audit', `The district planogram audit found ${DEPT[f.dept].name} off the planogram: a vendor took facings that belong to another item. Reset it to the planogram today. Vendors don't decide shelf space; the planogram does.`); G.sat = Math.max(0, G.sat - 3); t.repAudit = (t.repAudit || 0) + 1; for (let i = 0; i < 2; i++) addTagIn(f.dept, 'error'); }
    if (f.kind === 'ethics') { mail('HR', 'Vendor gift', 'A vendor told corporate they gave you game tickets. Our ethics policy says no gifts from vendors: it looks like they bought your shelf space. This goes in your file. Next time, thank them and say no.'); t.repEthics = 1; }
    if (f.kind === 'stale') { t.shrink += f.cost; mail('Inventory control', 'Extra DSD cases went stale', `The ${f.cases} extra cases of ${DEPT[f.dept].name} a vendor left didn't sell before their code date. That's ${money(f.cost)} of shrink. DSD you sign for is yours.`); }
  }
  G.repFx = G.repFx.filter(x => x.day > G.day);
  G.repLift = G.repLift.filter(x => x.until >= G.day);
  // a rep asks for a visit tomorrow (only on days you work)
  const sk = mgrShift(G.day + 1);
  if (sk && !G.repVisits.some(v => v.day === G.day + 1) && Math.random() < REP_CHANCE) {
    const s = SHIFTS[sk], lo = Math.max(s.start + 60, 9 * 60), hi = Math.min(s.end - 90, 15 * 60);
    if (hi > lo) {
      const r = pick(REPS), time = Math.round((lo + Math.random() * (hi - lo)) / 30) * 30;
      G.repVisits.push({ id: nid(), co: r.co, day: G.day + 1, time, state: 'set', pitches: null, answers: [] });
      mail(`${r.co} rep`, `Visit ${dowOf(G.day + 1)} at ${fmtTime(time)}`, `Hi! I'd like to stop by ${dowOf(G.day + 1)} ${fmtMD(G.day + 1)} around ${fmtTime(time)} to go over a couple of things for ${r.dept ? DEPT[r.dept].name : 'your dry grocery aisles'}. I'll meet you in the office.\n— your ${r.co} rep`);
    }
  }
  G.repVisits = G.repVisits.filter(v => v.day >= G.day - 14);
}
function addTagIn(dept, kind) {
  const free = MAPD.shelfTiles[dept].filter(t => !G.tags.some(x => x.x === t.x && x.y === t.y));
  if (!free.length) return;
  const t = pick(free); G.tags.push({ id: nid(), dept, x: t.x, y: t.y, kind });
}
const repLift = (dept, day) => G.repLift ? G.repLift.filter(x => x.dept === dept && x.until >= day).reduce((m, x) => m * x.mult, 1) : 1;

// The rep shows up, waits in the office, and leaves if nobody comes.
function updateReps(dt) {
  ensureReps();
  for (const v of G.repVisits.filter(x => x.day === G.day)) {
    if (v.state === 'set' && G.time >= v.time && G.time < CLOSE - 60) {
      v.state = 'here'; v.arrived = G.time; v.pitches = repPitches(repCo(v.co));
      toast(`🤝 The ${v.co} rep is here for your meeting (office).`, 'info');
    }
    let n = RT.repNpc;
    if (v.state === 'here') {
      if (!n || n.v !== v) {
        n = RT.repNpc = { x: MAPD.staffDoor.x + 0.5, y: MAPD.staffDoor.y + 0.5, fx: 0, fy: 1, path: null, v };
        if (G.time - v.arrived > 3) { n.x = REP_SPOT.x + 0.5; n.y = REP_SPOT.y + 0.5; } else setPath(n, pathToTiles(n, [REP_SPOT]) || []);
      }
      if (G.time - v.arrived > REP_WAIT) {
        v.state = 'missed'; G.today.repMissed = (G.today.repMissed || 0) + 1;
        mail(`${v.co} rep`, 'Sorry I missed you', `I waited in the office about ${REP_WAIT} minutes but couldn't find you. I'll try again another time.\n— your ${v.co} rep`);
        toast(`The ${v.co} rep left without meeting you.`, 'bad');
        n.leaving = true; setPath(n, pathToTiles(n, [MAPD.staffDoor]) || []);
      }
    }
    if (n && n.v === v && n.path) { if (moveAlong(n, dt, 2.6)) { n.path = null; if (n.leaving) RT.repNpc = null; } }
    else if (n && n.v === v && n.leaving) RT.repNpc = null;
  }
}

// ---- you ----
function repInteraction(p) {
  const v = repNow(), n = RT.repNpc;
  if (!v || !n || n.leaving || dist(n, p) > 1.8) return null;
  return { label: `🤝 Meet the ${v.co} rep`, at: n, fn: () => UI.repMeet() };
}
function repPitchHTML() {
  const v = repNow(); if (!v) return null;
  const i = v.answers.length, pc = v.pitches[i], P = REP_PITCH[pc.key];
  return `<h2>🤝 ${esc(v.co)} rep (${i + 1} of ${v.pitches.length})</h2><p style="font-size:17px"><i>${esc(P.say(repCo(v.co), pc.dept))}</i></p><div style="margin-top:10px">${shuffle(P.ch.slice()).map(([k, txt]) => `<button style="display:block;width:100%;text-align:left;margin:6px 0" onclick="UI.repPick('${k}')">"${esc(txt)}"</button>`).join('')}</div><p class="mute" style="margin-top:8px">Good reps help you sell. Their job is to sell their product; yours is to run the store. Say yes when it helps the store.</p>`;
}
// Resolve an answer. Returns {good, title, why}.
function repAnswer(key) {
  const v = repNow(); if (!v) return null;
  const pc = v.pitches[v.answers.length], d = pc.dept, t = G.today, D = d ? DEPT[d] : null;
  let good = 'ok', title = '', why = '';
  const lift = (mult, days) => G.repLift.push({ dept: d, mult, until: G.day + days });
  switch (pc.key) {
    case 'display':
      if (key === 'yes') { good = 'best'; lift(1.15, 6); title = 'Display built'; why = `The ad brings customers in for ${D.name}; a display at the front of the aisle sells more of it. A vendor building it on their own labor is a gift. Just keep the aisle clear.`; }
      else { good = 'bad'; title = 'Missed ad sales'; why = 'The ad is the reason customers come in this week. A display the vendor builds for free puts more of it in front of them.'; }
      break;
    case 'scanback':
      if (key === 'yes') { good = 'best'; lift(1.12, 6); for (let i = 0; i < 3; i++) addTagIn(d, 'change'); title = 'Scan-back on'; why = `The vendor pays for the discount, so it's more sales at no cost to your margin. Hang the 3 yellow tags in ${D.name} today so the shelf matches the register.`; }
      else { good = 'ok'; title = 'Passed on it'; why = 'Not wrong, but a vendor-funded price cut is free sales. Take those when they come.'; }
      break;
    case 'credit':
      if (key === 'yes') { good = 'best'; const c = randi(25, 60); t.shrink = Math.max(0, t.shrink - c); t.repCredit = (t.repCredit || 0) + c; title = `${money(c)} credit`; why = 'Out-of-code product on the shelf is a bad customer experience and shrink. A DSD vendor pulling their own and crediting you is how it should work.'; }
      else { good = 'bad'; G.sat = Math.max(0, G.sat - 1); title = 'Out-of-code product stays out'; why = 'Nobody should buy product past its code. You also gave up a credit: that product will be shrink at full cost.'; }
      break;
    case 'extra': {
      const need = repStormSoon() || repOnAd(d), upc = D.upc, cost = c => Math.round(c * upc * D.price * 0.6);
      if (key === 'yes' || key === 'some') {
        const cs = key === 'yes' ? 6 : 2;
        stockUnits(d, cs * upc);
        if (need) { good = key === 'yes' ? 'best' : 'ok'; title = `${cs} extra cases in`; why = repStormSoon() ? 'A storm is in the forecast: the day before, everyone stocks up. Extra product now is sales, not shrink.' : `${D.name} is in the ad, so the extra will sell.`; }
        else { good = key === 'yes' ? 'bad' : 'ok'; G.repFx.push({ day: G.day + 4, kind: 'stale', dept: d, cases: Math.round(cs * 0.4) || 1, cost: cost(Math.round(cs * 0.4) || 1) }); title = `${cs} extra cases you didn't need`; why = 'DSD you sign for is yours. Extra cases with no ad, no storm and no hole to fill sit in the back until they go stale. Take what you\'ll sell.'; }
      } else { good = need ? 'ok' : 'best'; title = need ? 'Regular order' : 'Regular order: right call'; why = need ? (repStormSoon() ? 'A storm is coming. The day before, the shelves empty out. Extra cases would have sold.' : `${D.name} is in the ad. Extra cases would have sold.`) : 'Nothing is driving extra sales. Taking only what you\'ll sell keeps the backroom clear and the shrink down.'; }
      break;
    }
    case 'grab':
      if (key === 'yes') { good = 'bad'; G.repFx.push({ day: G.day + randi(2, 4), kind: 'audit', dept: d }); title = 'Off the planogram'; why = 'The planogram decides shelf space, not vendors. The other brand pays for its space too, and the next audit will find it.'; }
      else { good = 'best'; title = 'The shelf stays on plan'; why = 'Right. Shelf space comes from the planogram. If they want more room, they work it out with corporate.'; }
      break;
    case 'newitem':
      if (key === 'yes') { good = 'bad'; for (let i = 0; i < 2; i++) addTagIn(d, 'error'); title = 'It won\'t scan'; why = 'An item that isn\'t in the system rings up wrong or not at all. You now have scan errors in ' + D.name + '. New items come through corporate with a planogram and a price.'; }
      else { good = 'best'; title = 'Through corporate first'; why = 'Right. A new item needs to be set up in the system and on the planogram before it hits the shelf, or it won\'t scan.'; }
      break;
    case 'gift':
      if (key === 'yes') { good = 'bad'; G.repFx.push({ day: G.day + randi(3, 6), kind: 'ethics' }); title = 'You took a vendor gift'; why = 'Ethics policy: no gifts from vendors. It looks like they bought your decisions about their product, and it will come out.'; }
      else if (key === 'raffle') { good = 'ok'; title = 'Better, but still a gift'; why = 'Generous, but it\'s still a vendor gift to the store. Most policies say no. Politely decline.'; }
      else { good = 'best'; title = 'Politely declined'; why = 'Right. Thank them and say no. Your decisions about their product have to stay clean.'; }
      break;
  }
  v.answers.push({ key: pc.key, pick: key, good });
  t.repBest = (t.repBest || 0) + (good === 'best' ? 1 : 0); t.repBad = (t.repBad || 0) + (good === 'bad' ? 1 : 0);
  if (good !== 'bad') addXP(good === 'best' ? 6 : 2, G.player);
  if (v.answers.length >= v.pitches.length) {
    v.state = 'met'; t.repMet = (t.repMet || 0) + 1;
    const n = RT.repNpc; if (n) { n.leaving = true; setPath(n, pathToTiles(n, [MAPD.staffDoor]) || []); }
  }
  return { good, title, why, more: v.state === 'here' };
}

// ---- drawing ----
function drawRep() {
  const n = RT.repNpc; if (!n) return;
  const top = pixelPerson(n, '#3b4f9a', { seed: hash(n.v.co), hat: null });
  if (n.v.state !== 'here') return;
  const left = 1 - (G.time - n.v.arrived) / REP_WAIT;
  nameplate(ctx, 'REP', n.x * T, top - 16, { font: PX(8), h: 12, edge: '#7aa2ff' });
  const bx = Math.round(n.x * T - 14), by = Math.round(top - 7);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, 30, 6);
  ctx.fillStyle = left > 0.5 ? '#7aa2ff' : left > 0.25 ? '#f0b429' : '#e5534b'; ctx.fillRect(bx, by, 28 * clamp(left, 0, 1), 4);
}

// ---- checklist & reports ----
const repToday = () => (G.repVisits || []).filter(v => v.day === G.day);
function repsTips() {
  const t = G.today, tips = [];
  if (t.repMissed) tips.push(`A vendor rep waited in the office and left without seeing you. Visits come by email the day before: put them on your plan.`);
  if (t.repBad) tips.push(`${plural(t.repBad, 'vendor pitch')} went the vendor's way, not the store's. Say yes to ad displays, scan-backs and credits; no to planogram changes, uncut items, extra cases you can't sell, and gifts.`);
  if (t.repAudit) tips.push('The planogram audit found a vendor\'s facings where they don\'t belong. Shelf space comes from the planogram.');
  return tips;
}
function repsDayExtras() {
  const t = G.today;
  return { repMet: t.repMet || 0, repMissed: t.repMissed || 0, repBest: t.repBest || 0, repBad: t.repBad || 0, repCredit: t.repCredit || 0, repEthics: t.repEthics || 0, repAudit: t.repAudit || 0 };
}
function repsReviewNotes(days, note, praise) {
  const s = k => sum(days.map(d => d[k] || 0));
  if (s('repEthics')) note('Vendors', 'You accepted a gift from a vendor this week.',
    'It looks like they bought your decisions about their product. That\'s an ethics problem, not a thank-you.',
    'Thank them and politely decline. Every time.');
  if (s('repMissed')) note('Vendors', `${plural(s('repMissed'), 'vendor rep')} came for a scheduled visit and never saw you.`,
    'Reps bring the ad displays, scan-backs and credits. Stand them up and they stop bringing them to you.',
    'Visits are emailed the day before and show on your checklist. Be in the office at that time.');
  if (s('repBad') >= 2) note('Vendors', `${s('repBad')} vendor pitches went the vendor's way, not the store's.`,
    'A rep\'s job is to sell their product. Yours is to run the store: the planogram, the system, the backroom and your ethics.',
    'Yes: ad displays, vendor-funded scan-backs, out-of-code credits, extra cases before a storm. No: shelf grabs, items not in the system, extra cases you can\'t sell, gifts.');
  else if (s('repMet') && !s('repBad')) praise.push(`You met ${plural(s('repMet'), 'vendor rep')} and every call went the store's way.`);
}
