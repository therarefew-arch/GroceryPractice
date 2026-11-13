'use strict';
// =====================================================================
//  Recalls.
//  A recall notice comes in from corporate during the day: one item,
//  certain lots, and why (a germ, an allergen that isn't on the label,
//  pieces of plastic, the wrong product in the package).
//  - The register blocks the item right away. Every customer who brings
//    one up gets turned away at the register, upset.
//  - Pull it from the SHELF first: a Class I recall has to be off the
//    shelf within 2 hours, Class II within 4. Pulling the shelf also posts
//    the recall notice where the product was.
//  - Then pull it from BACKSTOCK (the aisle's bird) and from any FREIGHT
//    still on pallets or floats, by close. A recalled case that gets
//    worked to the shelf before anyone pulls it is back on the shelf.
//  - Pulled product is held in the back. CERTIFY the recall on the office
//    computer (Today) by close tomorrow: the units are scanned out and the
//    vendor credits them in full. Certify before it's all pulled and the
//    recall is still on your shelf with your name on the form.
//  - The warehouse pulls the lots too, so the item is out (cut) for a few
//    days. Pull the recall notice off the shelf when it's back.
//  A Scan/Price Clerk works recalls first; department clerks pull their
//  own department, and anyone idle helps. Rookies miss some on the shelf.
// =====================================================================
const RECALL_CHANCE = 0.13;   // per day, from day 4
const RECALL_REASONS = {
  food: [['I', 'possible Listeria contamination'], ['I', 'possible Salmonella contamination'], ['I', 'undeclared peanuts (an allergen not on the label)'],
    ['I', 'undeclared milk (an allergen not on the label)'], ['II', 'foreign material: small pieces of plastic'], ['II', 'mislabeled: the wrong product in the package']],
  HBC: [['II', 'possible bacterial contamination'], ['II', 'mislabeled: wrong directions on the label']],
  A4: [['II', 'packaging is not child-resistant'], ['II', 'possible bacterial contamination']],
};
const RECALL_SHELF_MIN = { I: 120, II: 240 };

function ensureRecalls() { G.recalls = G.recalls || []; }
const openRecalls = () => (G.recalls || []).filter(r => r.state === 'open');
const recallById = id => (G.recalls || []).find(r => r.id === id);
function recallFreight(rs, forCrew) {
  const out = [];
  G.pallets.concat(G.floats).forEach(cont => {
    if (forCrew && cont.carriedBy) return;
    const n = cont.cases.filter(cs => cs.rc === rs.id).length;
    if (n) out.push({ cont, n });
  });
  return out;
}
const freightU = rs => sum(G.pallets.concat(G.floats, G.trailer).map(c => sum(c.cases.filter(cs => cs.rc === rs.id).map(caseUnits))));
const recallLeft = rs => rs.shelfU + rs.backU + freightU(rs);
const recallUrgent = () => openRecalls().some(rs => (rs.shelfAt == null && rs.shelfU > 0) || rs.backU > 0 || freightU(rs) > 0);
// Recalled backstock that got worked to the shelf is on the shelf now.
function recallNormalize(rs) {
  const s = G.stock[rs.dept];
  if (rs.backU > s.back) { rs.shelfU += rs.backU - s.back; rs.backU = s.back; }
  if (rs.shelfU > s.shelf) rs.shelfU = s.shelf;
}

// ---- the notice ----
function recallsStartDay() {
  ensureRecalls();
  RT.recallClaim = {}; RT.recallWarned = {};
  G.recalls = G.recalls.filter(r => r.state === 'open' || G.day - r.day <= 10);
  G.recallHour = G.day >= 4 && !openRecalls().length && Math.random() < RECALL_CHANCE ? randi(8, 16) : null;
}
function recallTasks(add) {
  openRecalls().forEach(rs => add('recallcert-' + rs.id, 'recallcert', `Certify the ${rs.item} recall`, `Office computer → Today. Everything pulled first: shelf, backstock, freight${rs.certDue === G.day ? '' : ` (due Day ${rs.certDue})`}`, 1370, 'by', { id: rs.id }));
}
function recallsHour(h) { if (G.recallHour === h) { G.recallHour = null; issueRecall(); } }
function issueRecall() {
  ensureRecalls(); ensureCuts();
  const outs = new Set((G.whOuts || []).map(o => o.item));
  let d, it;
  for (let k = 0; k < 20; k++) { d = pick(DEPTS); it = pick(d.items)[0]; if (!outs.has(it)) break; }
  const dept = d.id, pool = RECALL_REASONS[dept] || RECALL_REASONS.food, [cls, reason] = pick(pool);
  const share = itemShare(dept, it), lots = rand(0.5, 1), s = G.stock[dept];
  const shelfU = s.shelf > 0 ? Math.max(1, Math.round(s.shelf * share * lots)) : 0;
  const backU = Math.round(s.back * share * lots);
  const rs = { id: nid(), dept, item: it, cls, reason, day: G.day, at: G.time, shelfDue: Math.min(CLOSE - 10, G.time + RECALL_SHELF_MIN[cls]), certDue: G.day + 1,
    shelfU, backU, pulled: 0, shelfAt: shelfU ? null : G.time, shelfDay: G.day, backAt: backU ? null : G.time, by: { shelf: shelfU ? null : 'nothing on the shelf', back: backU ? null : 'nothing in backstock' }, state: 'open', blocked: 0, inBuilding: !G.player.away };
  let nf = 0;
  G.pallets.concat(G.floats, G.trailer).forEach(c => c.cases.forEach(cs => { if (cs.d === dept && cs.item === it && Math.random() < lots + 0.2) { cs.rc = rs.id; nf++; } }));
  G.recalls.push(rs);
  // the warehouse pulls the lots too: orders get cut until new product ships
  const tile = pick(MAPD.shelfTiles[dept]), backDay = G.day + randi(4, 9);
  G.whOuts.push({ id: nid(), kind: 'out', dept, item: it, from: G.day, back: backDay, slips: 0, cut: 0, hole: !shelfU, tagged: false, state: 'out', hidden: false, recall: true, x: tile.x, y: tile.y });
  const who = dept === 'HBC' || dept === 'A4' ? 'Corporate Product Safety' : 'Corporate Food Safety';
  mail(who, `RECALL (Class ${cls}): ${it}`, [
    `Class ${cls} recall: ${it} (${DEPT[dept].name}), certain lot codes. Reason: ${reason}.`,
    '',
    `The register is blocking this item now. Remove it from sale:`,
    `  1. SHELF: pull it within ${RECALL_SHELF_MIN[cls] / 60} hours (by ${fmtTime(rs.shelfDue)}) and post the recall notice where it was.`,
    `  2. BACKSTOCK: pull it off the ${DEPT[dept].aisle} bird.`,
    `  3. FREIGHT: check every pallet and float for cases of it${nf ? ` (${plural(nf, 'case')} shipped to you recently and aren't on the shelf yet)` : ''}.`,
    `  4. CERTIFY the recall on the office computer (Today) by close on Day ${rs.certDue}, once everything is pulled. Pulled product is scanned out at certification and credited in full.`,
    '',
    `The warehouse has pulled these lots too. Orders for ${it} will be cut until new product ships (about ${WEEKDAYS[dowIdx(backDay)]}, Day ${backDay}). Take the recall notice down when it's back on the shelf.`,
  ].join('\n'));
  toast(`🚨 RECALL (Class ${cls}): ${it}, ${reason}. Pull it off the ${DEPT[dept].aisle} shelf by ${fmtTime(rs.shelfDue)}, then backstock and freight. Check your email.`, 'bad');
  if (G.list) {
    G.list.push({ id: 'recall-' + rs.id, kind: 'recallshelf', label: `RECALL: ${it} off the shelf`, sub: `Class ${cls}: pull it from the ${DEPT[dept].aisle} shelf and post the recall notice`, due: rs.shelfDue, mode: 'by', arg: { id: rs.id }, status: 'open' });
    G.list.push({ id: 'recallall-' + rs.id, kind: 'recallall', label: `RECALL: ${it} out of backstock and freight`, sub: `${DEPT[dept].aisle} bird, pallets and floats`, due: 1375, mode: 'by', arg: { id: rs.id }, status: 'open' });
  }
}

// ---- customers ----
// The register blocks recalled product. Returns true if the customer leaves without it.
function recallBlock(dept, item, cu) {
  const rs = (G.recalls || []).find(r => r.dept === dept && r.item === item && r.shelfU > 0);
  if (!rs) return false;
  recallNormalize(rs);
  if (rs.shelfU <= 0) return false;
  const t = G.today;
  rs.blocked++; t.recallBlocked = (t.recallBlocked || 0) + 1;
  G.sat = Math.max(0, G.sat - 0.8);
  cu.emote = '✗'; cu.emoteT = 2.5;
  if (!RT.recallWarned[rs.id] || G.time - RT.recallWarned[rs.id] > 45) {
    RT.recallWarned[rs.id] = G.time;
    toast(`🚫 A customer brought recalled ${item} to the register. The register blocked it and the customer left upset: it's still on the ${DEPT[dept].aisle} shelf.`, 'bad');
  }
  return true;
}

// ---- pulling it ----
function pulledUnits(rs, u) {
  rs.pulled += u;
  if (rs.state === 'open') G.ohErr[rs.dept] += u;   // the system still has it until it's scanned out
  else { G.today.recallCredit = (G.today.recallCredit || 0) + u * DEPT[rs.dept].price * 0.6; }
}
function pullShelf(rs, crew) {
  recallNormalize(rs);
  const s = G.stock[rs.dept];
  let u = Math.min(rs.shelfU, s.shelf), leave = 0;
  if (crew && u > 2 && rollMistake(crew, 'price', 0.3)) { leave = Math.max(1, Math.round(u * rand(0.15, 0.35))); u -= leave; }
  s.shelf -= u; rs.shelfU = leave;
  pulledUnits(rs, u);
  if (rs.shelfAt == null) { rs.shelfAt = G.time; rs.shelfDay = G.day; rs.by.shelf = crew ? crew.name : 'you'; }
  const o = (G.whOuts || []).find(x => x.recall && x.item === rs.item && x.dept === rs.dept);
  if (o) { o.hole = true; o.tagged = true; }
  if (crew) toast(`🚨 ${crew.name.split(' ')[0]} pulled ${u} recalled ${rs.item} off the shelf and posted the recall notice.`, 'info');
  else {
    addXP(10, G.player);
    toast(`Pulled ${u} recalled ${rs.item} off the shelf and posted the recall notice.${rs.backU > 0 || freightU(rs) > 0 ? ' Now backstock and freight.' : ' Certify it on the office computer (Today).'}`, 'good');
  }
}
function pullBack(rs, crew) {
  recallNormalize(rs);
  const s = G.stock[rs.dept], u = Math.min(rs.backU, s.back);
  s.back -= u; rs.backU = 0;
  pulledUnits(rs, u);
  if (rs.backAt == null) { rs.backAt = G.time; rs.by.back = crew ? crew.name : 'you'; }
  if (!crew) { addXP(6, G.player); toast(`Pulled ${u} recalled ${rs.item} out of backstock.`, 'good'); }
}
function pullFreight(rs, cont, crew) {
  const mine = cont.cases.filter(cs => cs.rc === rs.id);
  if (!mine.length) return;
  cont.cases = cont.cases.filter(cs => cs.rc !== rs.id);
  pulledUnits(rs, sum(mine.map(caseUnits)));
  if (!cont.cases.length && G.pallets.includes(cont)) removeEmptyPallets();
  if (!crew) { addXP(4, G.player); toast(`Pulled ${plural(mine.length, 'recalled case')} of ${rs.item} off the ${G.floats.includes(cont) ? 'float' : 'pallet'}.`, 'good'); }
}
// A recalled case that gets worked before anyone pulls it is on the shelf (or in backstock) now.
function recallIn(cs, shelfU, backU) {
  const rs = recallById(cs.rc);
  if (!rs) return;
  rs.shelfU += shelfU; rs.backU += backU;
}

// ---- you ----
function recallInteraction(p, shelfDept, shelf, bird, pal, fl) {
  for (const rs of G.recalls || []) {
    if (rs.state !== 'open' && recallLeft(rs) <= 0) continue;
    if (shelfDept === rs.dept && rs.shelfU > 0) return { label: `🚨 RECALL: pull ${rs.item} off the shelf and post the recall notice`, at: tileC(shelf), fn: () => startWork(2 + rs.shelfU / 15, 'Pulling recalled product', () => pullShelf(rs, null)) };
    if (bird && bird.dept === rs.dept && rs.backU > 0) return { label: `🚨 RECALL: pull ${rs.item} out of the ${DEPT[rs.dept].aisle} backstock`, at: bird, fn: () => startWork(1.5 + rs.backU / 20, 'Pulling recalled backstock', () => pullBack(rs, null)) };
    const cont = [pal, fl].find(c => c && c.cases.some(cs => cs.rc === rs.id));
    if (cont) { const n = cont.cases.filter(cs => cs.rc === rs.id).length; return { label: `🚨 RECALL: pull ${plural(n, 'case')} of ${rs.item} off this ${cont === fl ? 'float' : 'pallet'}`, at: cont, fn: () => startWork(1 + n * 0.4, 'Pulling recalled cases', () => pullFreight(rs, cont, null)) }; }
  }
  return null;
}

// ---- crew ----
function planRecall(c, r, only) {
  if (G.phase !== 'day') return null;
  RT.recallClaim = RT.recallClaim || {};
  const rs = openRecalls().find(x => (!only || only.includes(x.dept)) && !RT.recallClaim[x.id] && ((x.shelfAt == null && x.shelfU > 0) || x.backU > 0 || recallFreight(x, true).length));
  if (!rs) return null;
  RT.recallClaim[rs.id] = c.id;
  r.cleanups.push(() => { if (RT.recallClaim[rs.id] === c.id) delete RT.recallClaim[rs.id]; });
  r.intent = `🚨 Recall: pulling ${rs.item}`;
  return [
    { do: () => (rs.shelfAt == null && rs.shelfU > 0 ? [
      { go: () => MAPD.access[rs.dept] },
      { wait: 2.5 + rs.shelfU / 12, label: 'Pulling recalled product' },
      { do: () => { pullShelf(rs, c); return true; } },
    ] : true) },
    { do: () => (rs.backU > 0 ? [
      goEnt(() => birdOf(rs.dept)),
      { wait: 2 + rs.backU / 15, label: 'Pulling recalled backstock' },
      { do: () => { pullBack(rs, c); return true; } },
    ] : true) },
    { do: () => {
      const f = recallFreight(rs, true);
      if (!f.length) return true;
      const cont = f[0].cont;
      return [
        { go: () => tilesAround(cont, 1) },
        { wait: 1 + f[0].n * 0.4, label: 'Pulling recalled cases' },
        { do: () => { pullFreight(rs, cont, c); return true; } },
      ];
    } },
  ];
}

// ---- certification (office computer → Today) ----
function certifyRecall(id, sure) {
  const rs = recallById(id);
  if (!rs || rs.state !== 'open') return;
  const known = [!rs.shelfAt && 'the shelf', !rs.backAt && 'backstock', recallFreight(rs).length && 'freight'].filter(Boolean);
  if (known.length && !sure) {
    UI.ask('Certify an incomplete recall?', `You haven't pulled ${known.join(', ')} yet. Certifying tells corporate this item is off your sales floor and out of your building.`, 'Certify anyway', () => { certifyRecall(id, true); UI.render(); }, true, 'Not yet');
    return;
  }
  recallNormalize(rs);
  const left = recallLeft(rs), t = G.today, d = DEPT[rs.dept], credit = rs.pulled * d.price * 0.6;
  Object.assign(rs, { state: 'certified', certAt: G.time, certDay: G.day, falseCert: left > 0, late: G.day > rs.certDue });
  G.ohErr[rs.dept] -= rs.pulled;
  t.recallCredit = (t.recallCredit || 0) + credit; t.recallsCertified = (t.recallsCertified || 0) + 1;
  if (rs.falseCert) t.recallFalse = (t.recallFalse || 0) + 1;
  addXP(15, G.player);
  toast(`Recall certified: ${rs.item}, ${rs.pulled} units scanned out (${money(credit)} credit).`, 'good');
}

// ---- time ----
function recallsTick() {
  for (const rs of G.recalls || []) {
    if (rs.shelfU <= 0 || rs.state !== 'open') continue;
    recallNormalize(rs);
    if (G.day === rs.day && G.time >= rs.shelfDue && !rs.lateWarned && rs.shelfAt == null) {
      rs.lateWarned = true; G.today.recallLate = (G.today.recallLate || 0) + 1;
      toast(`🚨 ${rs.item} was supposed to be off the shelf by ${fmtTime(rs.shelfDue)}. It's a Class ${rs.cls} recall: pull it now.`, 'bad');
    }
  }
}
function recallsEndDay() {
  const t = G.today;
  for (const rs of openRecalls()) {
    if (G.day >= rs.certDue && !rs.escalated) {
      rs.escalated = true; t.recallCertLate = (t.recallCertLate || 0) + 1;
      mail('District Manager', `Recall not certified: ${rs.item}`, `Corporate called me: your store still hasn't certified the ${rs.item} recall (Class ${rs.cls}, ${rs.reason}). It was due by close today. Pull everything and certify it first thing tomorrow. This goes on the compliance report.`);
    }
  }
  t.recallOnShelf = sum((G.recalls || []).filter(rs => rs.shelfU > 0).map(rs => rs.shelfU));
}
const recallOnShelfLate = () => sum((G.recalls || []).filter(rs => rs.shelfU > 0 && (rs.state !== 'open' || G.day > rs.day || G.time >= rs.shelfDue)).map(rs => rs.shelfU));
function recallTodayBadge() {
  return (G.recalls || []).some(rs => rs.state === 'certified' && rs.certDay === G.day && !rs.falseCert && !rs.late && rs.shelfDay === rs.day && rs.shelfAt <= rs.shelfDue);
}

// ---- reports ----
function recallsTips() {
  const t = G.today, tips = [];
  if (t.recallBlocked) tips.push(`${plural(t.recallBlocked, 'customer')} brought recalled product to the register and got turned away. Every one of them picked it up off your shelf. Pull a recall off the shelf first, before anything else.`);
  if (t.recallLate) tips.push(`A recall wasn't off the shelf by its deadline. Class I has to be off the shelf within 2 hours of the notice, Class II within 4: drop what you're doing, or send a Scan/Price Clerk.`);
  if (t.recallOnShelf) tips.push(`${plural(t.recallOnShelf, 'unit')} of recalled product are still on the shelf at close.${(G.recalls || []).some(rs => rs.falseCert && rs.shelfU > 0) ? ' The recall was certified anyway: walk the shelf yourself before you sign, especially after a rookie pulled it.' : ''}`);
  if (t.recallCertLate) tips.push(`A recall wasn't certified by its due date. Certify on the office computer (Today) once the shelf, backstock and freight are pulled.`);
  if (t.recallsCertified && !t.recallFalse) tips.push(`Recall certified: ${money(t.recallCredit || 0)} credited. Shelf, backstock, freight, then the paperwork.`);
  return tips;
}
function recallsDayExtras() {
  const t = G.today;
  return { recallBlocked: t.recallBlocked || 0, recallLate: t.recallLate || 0, recallCertLate: t.recallCertLate || 0, recallFalse: t.recallFalse || 0, recallOnShelf: t.recallOnShelf || 0, recallsCertified: t.recallsCertified || 0 };
}
function recallsReviewNotes(days, note, praise) {
  const blocked = sum(days.map(d => d.recallBlocked || 0)), late = sum(days.map(d => d.recallLate || 0)), certLate = sum(days.map(d => d.recallCertLate || 0)), fals = sum(days.map(d => d.recallFalse || 0)), cert = sum(days.map(d => d.recallsCertified || 0));
  if (fals) note('Recall certification', 'A recall was certified while recalled product was still in the store.',
    'A certification is your signature that the product is gone. If a customer gets sick from something we said we pulled, that\'s on the store and on you.',
    'Before you certify, walk it: the shelf, the bird, every pallet and float. A rookie who pulled the shelf may have missed the back of it.', true);
  else if (late || certLate || blocked >= 5) note('Recalls', `${late ? 'A recall stayed on the shelf past its deadline. ' : ''}${certLate ? 'A recall wasn\'t certified on time. ' : ''}${blocked ? `${blocked} customers brought recalled product to the register.` : ''}`.trim(),
    'Recalls are about customer safety first. The register block is a backstop, not the plan.',
    'When the notice comes in, stop and pull the shelf first (2 hours for Class I), then backstock and freight, then certify. Keep a Scan/Price Clerk on the schedule: recalls are their first job.', late || certLate);
  else if (cert) praise.push(`Every recall this week was pulled and certified on time (${cert}).`);
}

// ---- office computer ----
function recallTodayHTML() {
  const list = (G.recalls || []).filter(rs => rs.state === 'open' || rs.certDay === G.day);
  if (!list.length) return '';
  let h = '<h3>🚨 Recalls</h3>';
  for (const rs of list) {
    const fr = recallFreight(rs), ok = x => `<span class="good">✓ ${x}</span>`, no = x => `<span class="bad">✗ ${x}</span>`;
    h += `<p><b class="bad">Class ${rs.cls}: ${rs.item}</b> (${DEPT[rs.dept].name}): ${rs.reason}. Notice ${fmtTime(rs.at)}, Day ${rs.day}.</p><table>
      <tr><td>Shelf (by ${fmtTime(rs.shelfDue)}${rs.day < G.day ? `, Day ${rs.day}` : ''})</td><td>${rs.shelfAt != null ? ok(`${rs.by.shelf}${rs.by.shelf === 'nothing on the shelf' ? '' : ' at ' + fmtTime(rs.shelfAt)}`) : no('not pulled yet')}</td></tr>
      <tr><td>Backstock (${DEPT[rs.dept].aisle} bird)</td><td>${rs.backAt != null ? ok(rs.by.back) : no('not pulled yet')}</td></tr>
      <tr><td>Freight (pallets and floats)</td><td>${fr.length ? no(`${plural(sum(fr.map(f => f.n)), 'case')} still on pallets or floats`) : ok('none found')}</td></tr>
      <tr><td>Pulled and held for scan-out</td><td><b>${rs.pulled}</b> units</td></tr></table>`;
    h += rs.state === 'open'
      ? `<div class="row"><button class="primary" onclick="certifyRecall(${rs.id});UI.render()">Certify the recall (scan out ${rs.pulled} units)</button> <span class="${G.day >= rs.certDue ? 'warn' : 'mute'}">Due by close, Day ${rs.certDue}</span></div>`
      : `<p class="good">✓ Certified at ${fmtTime(rs.certAt)}.</p>`;
  }
  return h;
}

// ---- drawing ----
function drawRecallMarks() {
  if (G.phase !== 'day') return;
  const a = 0.55 + 0.45 * Math.sin(performance.now() / 220);
  const mark = (x, y) => { ctx.globalAlpha = a; glowRect(ctx, x, y, 14, 12, '#ff3b30', 8); label(ctx, '!', x + 7, y + 6.5, { font: PX(9), color: '#fff' }); ctx.globalAlpha = 1; };
  for (const rs of openRecalls()) {
    const sg = MAPD.signs && MAPD.signs[rs.dept];
    if (sg && rs.shelfU > 0 && rs.shelfAt == null) mark(sg.x - 18, sg.y - 16);
    const b = birdOf(rs.dept);
    if (b && rs.backU > 0) mark(Math.round(b.x * T - 22), Math.round(b.y * T - 18));
    recallFreight(rs).forEach(f => mark(Math.round(f.cont.x * T + 8), Math.round(f.cont.y * T - 20)));
  }
}
