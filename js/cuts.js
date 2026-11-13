'use strict';
// =====================================================================
//  Warehouse cuts (order shorts).
//  You don't always get what you order. When the warehouse is out of an
//  item, every case of it on your order is CUT, and the invoice bills you
//  only for what shipped.
//  - Warehouse outs: an item is out at the warehouse for a few days. Most
//    are on the morning bulletin (and the order screen) before you order;
//    some you only find out about on the cut report.
//  - Allocation: the manufacturer is short, so every store gets at most a
//    few cases of the item per order. Ordering more just gets cut.
//  - Short at selection: the slot was empty when the selector got there.
//    Nobody warns you about these.
//  The cut report comes in when the trucks leave the warehouse. A cut item
//  leaves a hole on the shelf: customers who wanted it either buy the next
//  item over or walk. A "temporarily out" tag on the hole tells them it's
//  the warehouse, not you, and more of them switch. When the item comes
//  back in, pull the tag.
//  The system orders as if the warehouse had everything. When an item's
//  out, its customers buy the rest of the department: order that up.
//  Order shorts: now and then a case is on the invoice but not on the
//  truck. You find out when the truck is worked and the invoice still has
//  a case nobody found. File a shortage claim before you close the
//  invoice, or you paid for it and the system thinks it's on the shelf.
// =====================================================================
const WH_OUT_CHANCE = 0.4;       // per day: an item goes out at the warehouse
const WH_SURPRISE = 0.35;        // share of new outs that are first seen on the cut report
const WH_ALLOC_CHANCE = 0.07;    // per day: an item goes on allocation
const WH_MAX_OUTS = 4;
const SELECT_SHORT = 0.008;      // per case: short at selection
const INVOICE_SHORT = 0.005;     // per case: on the invoice, not on the truck
const OUT_SUB = { tagged: 0.7, bare: 0.45 }; // chance a customer switches to another item in the department

const itemShare = (dept, item) => { const its = DEPT[dept].items, w = (its.find(i => i[0] === item) || [0, 0])[1]; return w / sum(its.map(i => i[1])); };
const wd = day => WEEKDAYS[dowIdx(day)];

function ensureCuts() {
  G.whOuts = G.whOuts || []; G.shorts = G.shorts || []; G.cutLog = G.cutLog || [];
}
const activeOut = (dept, item) => (G.whOuts || []).find(o => o.dept === dept && o.item === item && o.state === 'out');
const knownOuts = dept => (G.whOuts || []).filter(o => o.state === 'out' && !o.hidden && (!dept || o.dept === dept));
const holes = () => (G.whOuts || []).filter(o => o.hole);
const outTagJobs = () => (G.whOuts || []).filter(o => (o.hole && !o.tagged) || o.state === 'pull');
const shortsToday = () => (G.shorts || []).filter(s => s.day === G.day - 1);
const lastCutReport = () => (G.cutLog || []).find(r => r.day === G.day - 1) || null;
const shortCost = s => s.units * DEPT[s.dept].price * 0.6;

// About how many of `n` ordered cases the warehouse will cut, from what you know.
function expectedCut(dept, n) {
  let cut = 0;
  for (const o of knownOuts(dept)) {
    const mine = n * itemShare(dept, o.item);
    cut += o.kind === 'alloc' ? Math.max(0, mine - o.cap) : mine;
  }
  return cut;
}

// ---- the warehouse, every morning ----
function cutsStartDay() {
  ensureCuts();
  RT.outTagClaim = {}; RT.holeWarned = {};
  const news = [], back = [], slipped = [];
  for (const o of G.whOuts) {
    if (o.state === 'out' && G.day >= o.back) {
      if (o.kind === 'out' && (o.slips || 0) < 2 && Math.random() < 0.3) { o.back += randi(1, 3); o.slips = (o.slips || 0) + 1; if (!o.hidden) slipped.push(o); }
      else { o.state = o.kind === 'alloc' ? 'done' : 'back'; if (!o.hidden) back.push(o); }
    }
    if (o.state === 'back' && !o.hole) o.state = 'done';
    if (o.state === 'back' && o.restockDay && G.day >= o.restockDay) { o.hole = false; o.state = o.tagged ? 'pull' : 'done'; }
  }
  G.whOuts = G.whOuts.filter(o => o.state !== 'done');
  G.shorts = G.shorts.filter(s => s.day >= G.day - 7);
  const taken = new Set(G.whOuts.map(o => o.item));
  const freshItem = () => { const d = pick(DEPTS), it = pick(d.items)[0]; return taken.has(it) ? null : { dept: d.id, item: it }; };
  if (G.day > 1 && G.whOuts.filter(o => o.state === 'out').length < WH_MAX_OUTS && Math.random() < WH_OUT_CHANCE) {
    const f = freshItem();
    if (f) {
      const tile = pick(MAPD.shelfTiles[f.dept]);
      const o = { id: nid(), kind: 'out', ...f, from: G.day, back: G.day + randi(2, 7), slips: 0, cut: 0, hole: false, tagged: false, state: 'out', hidden: Math.random() < WH_SURPRISE, x: tile.x, y: tile.y };
      G.whOuts.push(o); taken.add(o.item);
      if (!o.hidden) news.push(o);
    }
  }
  if (G.day > 1 && !G.whOuts.some(o => o.kind === 'alloc' && o.state === 'out') && Math.random() < WH_ALLOC_CHANCE) {
    const f = freshItem();
    if (f) {
      const d = DEPT[f.dept], typical = d.demand * 2 * itemShare(f.dept, f.item);
      const o = { id: nid(), kind: 'alloc', ...f, cap: Math.max(1, Math.round(typical * rand(0.35, 0.6))), from: G.day, back: G.day + randi(4, 9), cut: 0, hole: false, tagged: false, state: 'out', hidden: false, x: 0, y: 0 };
      G.whOuts.push(o); news.push(o);
    }
  }
  if (news.length || back.length || slipped.length) {
    const L = ['Store bulletin from the distribution center:', ''];
    news.forEach(o => L.push(o.kind === 'alloc'
      ? `  • ON ALLOCATION: ${o.item} (${DEPT[o.dept].name}). The manufacturer is short. Max ${plural(o.cap, 'case')} per store per order until about ${wd(o.back)} (Day ${o.back}). Anything over that is cut.`
      : `  • OUT: ${o.item} (${DEPT[o.dept].name}). Every case ordered will be cut. Expected back ${wd(o.back)} (Day ${o.back}).`));
    slipped.forEach(o => L.push(`  • STILL OUT: ${o.item}. The new date is ${wd(o.back)} (Day ${o.back}).`));
    back.forEach(o => L.push(o.kind === 'alloc' ? `  • Allocation lifted: ${o.item}. Order normally.` : `  • BACK IN: ${o.item}. It ships on your next ${DEPT[o.dept].name} order. Take the ${o.recall ? 'recall notice' : '"temporarily out" tag'} down once it's on the shelf.`));
    const still = knownOuts().filter(o => !o.disc && !news.includes(o) && !slipped.includes(o));
    if (still.length) { L.push('', 'Still out or limited:'); still.forEach(o => L.push(`  • ${o.item}: ${o.kind === 'alloc' ? `max ${o.cap} cs per order` : 'out'} until about ${wd(o.back)}`)); }
    L.push('', 'Your suggested order doesn\'t know about cuts. When an item is out, its customers buy the rest of the department: order that up. Tag every hole so customers know it\'s us, not you.');
    mail('Distribution Center', `Warehouse bulletin: ${[news.length ? `${news.length} new` : '', back.length ? `${back.length} back` : '', slipped.length ? `${slipped.length} delayed` : ''].filter(Boolean).join(', ')}`, L.join('\n'));
  }
}

// ---- the trucks get built (night) ----
// Cut what the warehouse can't ship. Mutates cs.
function cutCases(dept, cs) {
  if (!G.whOuts) return;
  const rows = (RT.cutRows = RT.cutRows || []), alloc = {};
  const add = (item, why, o) => {
    const r = rows.find(x => x.dept === dept && x.item === item && x.why === why);
    if (r) r.cs++; else rows.push({ dept, item, why, cs: 1, back: o ? o.back : null, cap: o ? o.cap : null });
  };
  for (let i = cs.length - 1; i >= 0; i--) {
    const it = cs[i].item, o = activeOut(dept, it);
    let why = null;
    if (o && o.kind === 'out') why = o.disc ? 'disc' : 'out';
    else if (o && o.kind === 'alloc') { alloc[it] = (alloc[it] || 0) + 1; if (alloc[it] > o.cap) why = 'alloc'; }
    else if (Math.random() < SELECT_SHORT) why = 'select';
    if (!why) continue;
    cs.splice(i, 1); add(it, why, o);
    if (o) { o.cut++; o.hidden = false; if (o.kind === 'out' && !o.recall && !o.disc) o.hole = true; }
  }
  // an item that's back at the warehouse and shipped tonight is on the shelf tomorrow
  G.whOuts.forEach(o => { if (o.dept === dept && o.state === 'back' && o.hole && !o.restockDay && cs.some(c => c.item === o.item)) o.restockDay = G.day + 1; });
}
// On the invoice, not on the truck. The system takes the invoice's word for it.
function invoiceShorts(dept, cs) {
  if (!G.shorts) return;
  for (let i = cs.length - 1; i >= 0; i--) {
    if (Math.random() >= INVOICE_SHORT) continue;
    const c = cs.splice(i, 1)[0], u = caseUnits(c);
    const trucks = trucksOn(G.day).filter(t => TRUCK_TYPES[t].depts.includes(dept));
    G.shorts.push({ id: nid(), day: G.day, truck: pick(trucks.length ? trucks : trucksOn(G.day)), dept, item: c.item, units: u, state: 'open' });
    G.ohErr[dept] += u;
  }
}
const CUT_WHY = { out: 'warehouse out', alloc: 'allocation', select: 'short at selection', disc: 'discontinued' };
function cutReport(order) {
  const rows = RT.cutRows || []; RT.cutRows = null;
  const ordered = sum(Object.values(order).map(n => Math.max(0, Math.floor(n || 0))));
  if (!ordered) return;
  const cut = sum(rows.map(r => r.cs));
  rows.sort((a, b) => b.cs - a.cs);
  G.cutLog = G.cutLog.concat([{ day: G.day, trucks: trucksOn(G.day).slice(), ordered, cut, rows }]).slice(-21);
  const fill = (ordered - cut) / ordered * 100;
  const L = [`Tonight's trucks (${trucksOn(G.day).join(', ')}): you ordered ${ordered} cases, we shipped ${ordered - cut}. Fill rate ${fill.toFixed(1)}%.`, ''];
  if (!cut) L.push('Nothing cut. Everything you ordered is on the truck.');
  else {
    L.push('Cut:');
    rows.forEach(r => L.push(`  • ${DEPT[r.dept].name}: ${r.item}, ${plural(r.cs, 'case')} (${CUT_WHY[r.why]}${r.why === 'out' && r.back ? `, back about ${wd(r.back)}` : r.why === 'alloc' ? `, max ${r.cap} per order` : ''})`));
    L.push('', 'The invoice only bills what shipped. Plan around the holes: tag them tomorrow ("temporarily out"), and order the rest of those departments up a little on the next truck.');
  }
  mail('Distribution Center', `Cut report: ${cut ? `${plural(cut, 'case')} cut` : 'nothing cut'} (fill rate ${fill.toFixed(1)}%)`, L.join('\n'));
  if (cut) toast(`📉 Cut report: the warehouse cut ${plural(cut, 'case')} of ${ordered} from tonight's order. Check your email.`, 'warn');
}

// ---- customers ----
// A customer wanted the item that isn't there. Returns true if they walk.
function outHole(dept, item, cu, q) {
  const o = (G.whOuts || []).find(x => x.hole && x.dept === dept && x.item === item);
  if (!o) return false;
  const t = G.today;
  if (Math.random() < (o.tagged ? OUT_SUB.tagged : OUT_SUB.bare)) { t.whSubs = (t.whSubs || 0) + 1; return false; }
  t.whMisses = (t.whMisses || 0) + 1;
  if (!o.tagged) t.whBare = (t.whBare || 0) + 1;
  t.whLost = (t.whLost || 0) + q * DEPT[dept].price;
  G.sat = Math.max(0, G.sat - (o.tagged ? 0.15 : 0.5));
  cu.emote = '?'; cu.emoteT = 2.5;
  if (!o.tagged && (!RT.holeWarned[o.id] || G.time - RT.holeWarned[o.id] > 120)) {
    RT.holeWarned[o.id] = G.time;
    toast(`A customer couldn't find ${item} (${DEPT[dept].aisle}): it's out at the warehouse. Hang a "temporarily out" tag on the hole so they know it isn't you.`, 'warn');
  }
  return true;
}

// ---- tags: you and the crew ----
function doOutTag(o, crew) {
  if (!G.whOuts.includes(o)) return;
  if (o.state === 'pull') {
    G.whOuts = G.whOuts.filter(x => x !== o);
    if (!crew) { addXP(4, G.player); toast(`Out tag pulled: ${o.item} is back on the shelf.`, 'good'); }
  } else if (o.hole && !o.tagged) {
    o.tagged = true; G.today.outTagged = (G.today.outTagged || 0) + 1;
    if (!crew) { addXP(6, G.player); toast(`"Temporarily out" tag hung for ${o.item}. Customers see it's the warehouse, and more of them buy the next item over.`, 'good'); }
  }
}
function outTagInteraction(p) {
  const jobs = outTagJobs().filter(o => !(RT.outTagClaim && RT.outTagClaim[o.id])).map(o => ({ x: o.x + 0.5, y: o.y + 0.5, o }));
  const n = nearest(jobs, p, 1.5);
  if (!n) return null;
  const o = n.o, pull = o.state === 'pull';
  return { label: pull ? `Take down the ${o.recall ? 'recall notice' : 'out tag'}: ${o.item} is back in stock` : o.recall ? `Post the recall notice: ${o.item}` : `Hang a "temporarily out" tag: ${o.item} (warehouse out${o.state === 'out' ? `, back about ${wd(o.back)}` : ', on its way'})`, fn: () => startWork(1.5, pull ? 'Pulling tag' : 'Hanging out tag', () => doOutTag(o, null)), at: n };
}
function planOutTag(c, r) {
  if (G.phase !== 'day') return null;
  RT.outTagClaim = RT.outTagClaim || {};
  const tc = o => ({ x: o.x + 0.5, y: o.y + 0.5 });
  const o = outTagJobs().filter(x => !RT.outTagClaim[x.id]).sort((a, b) => dist(r, tc(a)) - dist(r, tc(b)))[0];
  if (!o) return null;
  RT.outTagClaim[o.id] = c.id;
  r.cleanups.push(() => { if (RT.outTagClaim[o.id] === c.id) delete RT.outTagClaim[o.id]; });
  const pull = o.state === 'pull';
  r.intent = pull ? `Pulling an out tag (${o.item})` : `Tagging a warehouse out (${o.item})`;
  return [
    { go: () => tilesAround(tc(o), 1) },
    { wait: 1.8, label: pull ? 'Pulling out tag' : 'Hanging out tag' },
    { do: () => { doOutTag(o, c); return true; } },
  ];
}

// ---- shortage claims (office computer → Today) ----
function claimShort(id) {
  const s = (G.shorts || []).find(x => x.id === id);
  if (!s || s.state !== 'open') return;
  s.state = 'claimed';
  G.ohErr[s.dept] -= s.units;
  const t = G.today, c = shortCost(s);
  t.shortsClaimed = (t.shortsClaimed || 0) + 1; t.shortCredit = (t.shortCredit || 0) + c;
  addXP(8);
  toast(`Shortage claim filed: 1 case of ${s.item} (${money(c)} credit). The invoice and the system on-hand are corrected.`, 'good');
}
function loseShort(s, why) {
  s.state = 'lost';
  const t = G.today, c = shortCost(s);
  t.shortsLost = (t.shortsLost || 0) + 1; t.shortLost = (t.shortLost || 0) + c; t.shrink += c;
  t.shortWhy = why;
}
// Closing an invoice ends its claims.
function shortsOnClose(type) {
  const open = shortsToday().filter(s => s.truck === type && s.state === 'open');
  if (!open.length) return;
  open.forEach(s => loseShort(s, 'closed'));
  toast(`You closed the ${type} invoice with ${plural(open.length, 'short')} unclaimed. You paid ${money(sum(open.map(shortCost)))} for product that never came, and the system thinks it's here.`, 'bad');
}
function cutsEndDay() {
  shortsToday().filter(s => s.state === 'open').forEach(s => loseShort(s, truckWorked(s.truck) ? 'unclaimed' : 'unworked'));
}

// ---- reports ----
function cutsTips() {
  const t = G.today, tips = [], rep = lastCutReport();
  if (rep && rep.cut) {
    const worst = rep.rows.slice(0, 3).map(r => `${r.item} ${r.cs}`).join(', ');
    tips.push(`Last night's trucks came in with ${plural(rep.cut, 'case')} cut (fill rate ${((rep.ordered - rep.cut) / rep.ordered * 100).toFixed(1)}%: ${worst}). A cut isn't your fault, but the hole is your problem: tag it, and order the rest of the department up.`);
  }
  if (t.whMisses) tips.push(`${plural(t.whMisses, 'customer')} wanted an item that's out at the warehouse and walked away (${money(t.whLost || 0)} in sales)${t.whBare ? `; ${t.whBare} of them at a hole with no tag` : ''}. With a "temporarily out" tag up, more customers buy the next item over.`);
  const bare = holes().filter(o => !o.tagged).length, pulls = (G.whOuts || []).filter(o => o.state === 'pull').length;
  if (bare) tips.push(`${plural(bare, 'warehouse-out hole')} still ${bare === 1 ? 'has' : 'have'} no tag. A Scan/Price Clerk hangs them, or press E at the hole.`);
  if (pulls) tips.push(`${plural(pulls, '"temporarily out" tag')} ${pulls === 1 ? 'is' : 'are'} still up for product that's back on the shelf. Pull ${pulls === 1 ? 'it' : 'them'}: a tag in front of product tells customers we don't have it.`);
  if (t.shortsLost) tips.push(`${plural(t.shortsLost, 'warehouse short')} went unclaimed (${money(t.shortLost || 0)}): ${t.shortWhy === 'unworked' ? 'the truck wasn\'t worked, so nobody found the missing case' : 'the invoice said it shipped, nobody filed the claim'}. You paid for it, and the system counts it as on hand. Check every invoice for shorts (Today tab) before you close it.`);
  else if (t.shortsClaimed) tips.push(`You caught ${plural(t.shortsClaimed, 'warehouse short')} and claimed ${money(t.shortCredit || 0)}. That's money and on-hand accuracy saved.`);
  return tips;
}
function cutsDayExtras() {
  const t = G.today, rep = lastCutReport();
  return { cutOrdered: rep ? rep.ordered : 0, cutCases: rep ? rep.cut : 0, whMisses: t.whMisses || 0, whBare: t.whBare || 0, whLost: Math.round(t.whLost || 0), shortsClaimed: t.shortsClaimed || 0, shortsLost: t.shortsLost || 0, shortLost: Math.round(t.shortLost || 0) };
}
function cutsReviewNotes(days, note, praise) {
  const bare = sum(days.map(d => d.whBare || 0)), lost = sum(days.map(d => d.shortsLost || 0)), lostAmt = sum(days.map(d => d.shortLost || 0)), claimed = sum(days.map(d => d.shortsClaimed || 0));
  if (lost >= 2) note('Warehouse shorts', `${lost} cases were on an invoice but never on the truck, and nobody claimed them (${money(lostAmt)}).`,
    'An unclaimed short is product you paid for and never got. The system thinks it\'s on hand, so it won\'t reorder it either.',
    'When a truck is worked, check its invoice for shorts (office computer → Today) and file the claim before you close it.');
  else if (claimed >= 2 && !lost) praise.push(`You claimed every warehouse short this week (${claimed}).`);
  if (bare >= 15) note('Warehouse outs', `${bare} customers walked away from an untagged hole left by a warehouse out.`,
    'Customers don\'t know the warehouse is out. To them an empty spot with no tag looks like the store doesn\'t care.',
    'Read the bulletin and the cut report every day. Tag every hole the morning after the cut, and pull the tags when the product is back.');
}

// ---- office computer ----
function cutsOrderPanel(td) {
  const outs = knownOuts().filter(o => deptOnTruck(o.dept, td));
  let h = '<h3>Warehouse</h3>';
  if (!outs.length) h += '<p class="mute">Nothing out or on allocation for tonight\'s departments. A few cases still get cut at selection on any night (about 1%).</p>';
  else h += '<table><tr><th>Item</th><th>Department</th><th>Status</th><th class="n">Share of dept cases</th></tr>' + outs.map(o => `<tr><td>${o.item}</td><td>${DEPT[o.dept].name}</td><td class="${o.kind === 'alloc' ? 'warn' : 'bad'}">${o.kind === 'alloc' ? `Allocation: max ${plural(o.cap, 'case')} per order` : o.disc ? 'Discontinued: every case cut' : o.recall ? 'Recalled: every case cut' : 'Out: every case cut'} · ${o.disc ? 'leaves the shelf at the reset' : `until about ${wd(o.back)}`}</td><td class="n">${Math.round(itemShare(o.dept, o.item) * 100)}%</td></tr>`).join('') + '</table><p class="mute">The suggested order doesn\'t know about cuts. "Ships ≈" is what to expect after known cuts. When an item is out, its customers buy the rest of the department, so order up to cover it.</p>';
  const lg = G.cutLog || [], rep = lg[lg.length - 1];
  if (rep) h += `<p class="mute">Last cut report (${wd(rep.day)} night, Day ${rep.day}): ordered ${rep.ordered}, shipped ${rep.ordered - rep.cut} (${((rep.ordered - rep.cut) / rep.ordered * 100).toFixed(1)}%)${rep.rows.length ? ': ' + rep.rows.map(r => `${r.item} ${r.cs} (${CUT_WHY[r.why]})`).join(', ') : ''}.</p>`;
  return h;
}
function cutsTodayHTML() {
  let h = '';
  const sh = shortsToday();
  if (sh.length) {
    h += '<p><b>Shorts</b> <span class="mute">(on the invoice, not on the truck: you find them once the truck is worked)</span></p><div class="row">';
    sh.forEach(s => {
      const found = truckWorked(s.truck);
      h += s.state === 'claimed' ? `<button disabled>✓ Claimed: ${s.item} (${s.truck})</button>`
        : s.state === 'lost' ? `<button disabled class="bad">✗ Lost: ${s.item} (${s.truck})</button>`
          : found ? `<button class="primary" onclick="claimShort(${s.id});UI.render()">File shortage claim: 1 cs ${s.item} (${s.truck}, ${money(shortCost(s))})</button>`
            : `<button disabled>${s.truck}: check when the truck is worked</button>`;
    });
    h += '</div>';
  }
  const hs = holes(), pulls = (G.whOuts || []).filter(o => o.state === 'pull');
  h += '<h3>Warehouse outs</h3>';
  if (!hs.length && !pulls.length) h += '<p class="mute">No holes from warehouse cuts right now.</p>';
  else h += '<p>' + hs.map(o => `${o.item} (${DEPT[o.dept].aisle}): ${o.tagged ? '<span class="good">tagged</span>' : '<span class="warn">no tag</span>'}${o.state === 'back' ? ' · back at the warehouse, on its way' : ` · back about ${wd(o.back)}`}`).concat(pulls.map(o => `${o.item}: <span class="warn">back on the shelf, pull the tag</span>`)).join('<br>') + '</p><p class="mute">Press E at the hole to hang a "temporarily out" tag (a Scan/Price Clerk does it too). Pull it when the product is back.</p>';
  return h;
}

// ---- drawing ----
function drawOutTags() {
  const blink = Math.floor(performance.now() / 450) % 2;
  for (const o of G.whOuts || []) {
    if (!o.hole && o.state !== 'pull') continue;
    const px = o.x * T, py = o.y * T;
    if (o.hole && G.phase === 'day') { ctx.fillStyle = '#07090c'; ctx.fillRect(px + 3, py + T - 13, 13, 9); }
    if (o.tagged) {
      const stale = o.state === 'pull';
      const col = o.recall ? '#ff3b30' : '#e8962e';
      glowRect(ctx, px + 2, py + T - 12, 16, 8, stale ? (blink ? '#3cc47c' : col) : col, 6);
      label(ctx, o.recall ? 'RCL' : 'OUT', px + 10, py + T - 7.5, { font: PX(6), color: o.recall ? '#fff' : '#000' });
    }
  }
}
