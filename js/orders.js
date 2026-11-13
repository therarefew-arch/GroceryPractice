'use strict';
// =====================================================================
//  Crew orders: click (or tap) an associate and tell them exactly what
//  to do, even outside their job. They drop what they're doing, work the
//  order until it's done (or about 2 hours pass), then go back to their
//  normal job.
//  - Outside their job class they work 15% slower (Leads and Superstars
//    don't slow down) and make more mistakes in areas they aren't trained in.
//  - More than 4 orders to the same person in a day starts to feel like
//    micromanaging and costs a little morale.
// =====================================================================
const ORDER_MIN = 120, ORDER_OOC_SPEED = 0.85, MICRO_FREE = 4;
GRIPE_TEXT.micro = 'I got pulled off my work every five minutes. I never got to finish anything.';

// What each job normally does (orders outside this list are "out of class").
const ROLE_KINDS = {
  breakdown: ['truck', 'breakdown', 'freight', 'backroom', 'reclaim', 'trash'],
  freight: ['truck', 'freight', 'fill', 'bird', 'trash'],
  replen: ['fill', 'bird', 'face', 'gobacks', 'trash'],
  dsd: ['dsd', 'fill'],
  price: ['price', 'count', 'reclaim', 'fill'],
  unloader: ['unload', 'truck', 'breakdown', 'backroom', 'reclaim'],
};
const ORDERS = {
  truck: { name: 'Work the truck', desc: 'Break down pallets and push floats, whatever is next' },
  breakdown: { name: 'Break down pallets', desc: 'Sort cases onto the floats' },
  unload: { name: 'Unload the trailer', desc: 'Pull pallets into receiving (night only)' },
  freight: { name: 'Get freight out', dept: true, desc: 'Break down and work this department\'s freight to the shelf' },
  fill: { name: 'Fill holes', dept: true, desc: 'Fill the shelf from backstock, then from that department\'s freight' },
  bird: { name: 'Run the bird', dept: true, desc: 'Push this aisle\'s backstock bird out, work it onto the shelf, bring it back' },
  face: { name: 'Face the aisle', dept: true, desc: 'Pull product forward so the shelf looks full' },
  reclaim: { name: 'Work reclaim', desc: 'Take damaged product to the reclaim bin and scan it out' },
  count: { name: 'Cycle count', dept: true, desc: 'Count the shelf and the backstock so the system on-hand is right' },
  gobacks: { name: 'Work go-backs', desc: 'Clear the go-back cart and any strays, cold first, back to their own shelves' },
  dsd: { name: 'Watch the back door', desc: 'Check in DSD vendors as they arrive' },
  price: { name: 'Hang price tags', desc: 'Hang tags and fix scan errors' },
  trash: { name: 'Pick up cardboard', desc: 'Clear cardboard off the floor' },
  backroom: { name: 'Backroom upkeep', desc: 'Stack empties, bale, sweep' },
};
function inClass(c, kind, dept) {
  const rd = ROLES[c.role].dept;
  if (rd) return ['freight', 'fill', 'bird', 'face', 'count'].includes(kind) ? dept === rd : kind === 'truck';
  return (ROLE_KINDS[c.role] || []).includes(kind);
}
const orderLabel = o => ORDERS[o.kind].name + (o.dept ? ': ' + DEPT[o.dept].name : '');
const orderSpeed = c => (c.order && c.order.ooc && !c.lead && !isStar(c) ? ORDER_OOC_SPEED : 1);

function giveOrder(c, kind, dept) {
  if (!G.crew.includes(c)) return;
  const r = RT.crew[c.id];
  c.order = { kind, dept: dept || null, until: G.time + ORDER_MIN, ooc: !inClass(c, kind, dept), day: G.day };
  if (r && r.plan) finishPlan(c, r);
  if (r) r.hold = 0;
  c.ordersToday = c.ordersDay === G.day ? (c.ordersToday || 0) + 1 : 1; c.ordersDay = G.day;
  if (c.ordersToday > MICRO_FREE) bump(c, -2, 'micro');
  G.today.orders = (G.today.orders || 0) + 1;
  toast(`📌 ${c.name.split(' ')[0]}: ${orderLabel(c.order)}${c.order.ooc ? ' (outside their job)' : ''}`, 'info');
}
function clearOrder(c, why) {
  if (!c.order) return;
  const o = c.order; c.order = null;
  if (why) toast(`📌 ${c.name.split(' ')[0]} ${why}: ${orderLabel(o)}. Back to ${ROLES[c.role].name}.`, why === 'finished' ? 'good' : 'info');
}

// Called before the crew's normal brain. Returns a plan, or null to fall back.
function orderPlan(c, r) {
  const o = c.order; if (!o) return null;
  if (o.day !== G.day && G.phase === 'day') { clearOrder(c); return null; }
  if (G.time >= o.until) { clearOrder(c, 'ran out of time on'); return null; }
  const D = o.dept ? [o.dept] : null;
  let p = null;
  switch (o.kind) {
    case 'truck': p = planBreakdown(c, r) || planFreight(c, r, null, 1); break;
    case 'breakdown': p = planBreakdown(c, r); break;
    case 'unload': p = planUnload(c, r); break;
    case 'freight': p = planFreight(c, r, D, 1) || planBreakdown(c, r, D); break;
    case 'fill': p = shelfPct(o.dept) >= 0.98 ? null : (planReplen(c, r, D, 0.98) || planFreight(c, r, D, 1) || planBreakdown(c, r, D)); break;
    case 'face': p = planFace(c, r, o.dept); break;
    case 'bird': p = planBirdRun(c, r, o.dept); break;
    case 'gobacks': p = planGobacks(c, r); break;
    case 'reclaim': p = planDamages(c, r) || planReclaim(c, r); break;
    case 'count': if (!o.started) { countAdd(o.dept); o.started = true; } p = planCount(c, r, [o.dept]); break;
    case 'price': p = planPrice(c, r) || planOutTag(c, r); break;
    case 'trash': p = planTrash(c, r); break;
    case 'backroom': p = planBackroomForced(c, r); break;
    case 'dsd': p = planDSD(c, r) || (o.until - G.time > 1 ? waitAtBackDoor(c, r) : null); break;
  }
  if (!p) { clearOrder(c, o.kind === 'fill' && shelfPct(o.dept) < 0.9 ? 'ran out of product for' : 'finished'); return null; }
  r.intent = '📌 ' + (r.intent || orderLabel(o));
  return p;
}
function planTrash(c, r) {
  const free = (G.trash || []).filter(t => t.claimedBy == null || t.claimedBy === c.id);
  if (!free.length) return null;
  const t = free.sort((a, b) => dist(r, a) - dist(r, b))[0];
  t.claimedBy = c.id;
  r.cleanups.push(() => { if (t.claimedBy === c.id) t.claimedBy = null; });
  r.intent = 'Picking up cardboard';
  return [
    { go: () => tilesAround(t, 1) },
    { wait: 0.5, label: 'Picking up cardboard' },
    { do: () => { G.trash = G.trash.filter(x => x !== t); cardboard(1); return true; } },
  ];
}
function planBackroomForced(c, r) {
  const p = planBackroom(c, r); if (p) return p;
  if (G.baler >= BALE_SIZE * 0.5 && reloadFree() > 0) {
    r.intent = 'Making a bale';
    return [{ go: () => workTiles([BALER]) }, { wait: 3, label: 'Baling' }, { do: () => { makeBale(false); return true; } }];
  }
  if (G.dirt >= 10 && G.phase === 'day') {
    r.intent = 'Sweeping the backroom';
    return [{ go: () => [pick(MAPD.backroomTiles)] }, { wait: 4, label: 'Sweeping' }, { do: () => { sweep(false); return true; } }];
  }
  const f = G.floats.find(x => x.crooked && !x.carriedBy);
  if (f) {
    r.intent = 'Straightening floats';
    return [goEnt(() => f), { wait: 0.8, label: 'Straightening float' }, { do: () => { if (!f.carriedBy) { f.crooked = false; f.x = f.homeX; f.y = f.homeY; } return true; } }];
  }
  return null;
}
function waitAtBackDoor(c, r) {
  r.intent = 'Waiting for DSD vendors';
  return [{ go: () => tilesAround(MAPD.vendorSpot, 1) }, { wait: 3, label: 'Watching the back door' }];
}

// ---- the orders menu ----
function crewAtMouse() { const h = hoveredCrew(); return h ? h.c : null; }
function showOrders(c) {
  const r = RT.crew[c.id], first = c.name.split(' ')[0];
  const btn = (kind, dept, extra) => {
    const ooc = !inClass(c, kind, dept), cur = c.order && c.order.kind === kind && c.order.dept === (dept || null);
    const lab = dept ? `${DEPT[dept].name}` : ORDERS[kind].name;
    return `<button class="${cur ? 'primary' : ''}" style="margin:3px;${ooc ? 'border-style:dashed;' : ''}" onclick="UI.order(${c.id},'${kind}',${dept ? `'${dept}'` : 'null'})" title="${esc(ORDERS[kind].desc)}">${esc(lab)}${extra ? ` <span class="mute">${extra}</span>` : ''}</button>`;
  };
  const deptRow = (kind, extra) => `<div style="margin:6px 0"><b>${ORDERS[kind].name}</b> <span class="mute" style="font-size:14px">${ORDERS[kind].desc}</span><div>${DEPTS.map(d => btn(kind, d.id, extra(d.id))).join('')}</div></div>`;
  const trashN = (G.trash || []).length, waiting = G.vendorsToday.filter(v => v.state === 'waiting').length;
  let h = `<h2>📌 Orders: ${esc(c.name)}</h2>
    <p class="mute" style="margin-top:0">${ROLES[c.role].name}${c.lead ? ' · ◆ Lead' : ''}${isStar(c) ? ' · ★ Superstar' : ''} · Right now: <span class="good">${esc((r && (r.intent || r.label)) || (onShift(c) ? 'Looking for work' : 'Off the clock'))}</span></p>`;
  if (!onShift(c)) h += `<p class="warn">${esc(first)} isn't on the clock right now. Orders will start when their shift does (if it's today).</p>`;
  if (c.order) h += `<p>Current order: <b>${esc(orderLabel(c.order))}</b> until ${fmtTime(c.order.until)}${c.order.ooc ? ' <span class="warn">(outside their job)</span>' : ''} <button onclick="UI.order(${c.id},null)">Back to normal job</button></p>`;
  h += `<p class="mute" style="font-size:14px">Dashed buttons are outside ${esc(first)}'s job: ${c.lead || isStar(c) ? 'as a Lead/Superstar they work at full speed anyway' : '15% slower, and more mistakes where they\'re untrained'}. They drop what they're doing, work the order until it's done or about 2 hours pass, then go back to their job. ${(c.ordersDay === G.day ? c.ordersToday : 0) >= MICRO_FREE ? '<span class="warn">You\'ve given them a lot of orders today: more will start to cost morale.</span>' : ''}</p>`;
  h += `<div style="margin:6px 0"><b>Freight</b><div>${btn('truck')}${btn('breakdown', null, `${G.pallets.length} pallets`)}${G.phase === 'night' ? btn('unload', null, `${G.trailer.length} on trailer`) : ''}</div></div>`;
  h += deptRow('freight', d => { const n = palletCases(d) + (floatOf(d) ? floatOf(d).cases.length : 0); return n ? n + ' cs' : '—'; });
  h += deptRow('fill', d => `${Math.round(shelfPct(d) * 100)}%`);
  h += deptRow('bird', d => `${backCases(d)} cs`);
  h += deptRow('face', d => `${Math.round(faceOf(d))}%`);
  h += deptRow('count', d => { const k = countOpen(d), n = daysSinceCount(d); return k ? 'on list' : n == null ? 'never' : n + 'd ago'; });
  h += `<div style="margin:6px 0"><b>Other</b><div>${btn('dsd', null, waiting ? `${waiting} waiting` : '')}${btn('gobacks', null, `${(G.gobacks || []).length}`)}${btn('reclaim', null, `${floorDamages().length + binToScan().length}`)}${btn('price', null, `${G.tags.length + outTagJobs().length} tags`)}${btn('trash', null, `${trashN}`)}${btn('backroom', null, `dirt ${Math.round(G.dirt || 0)}%`)}</div></div>`;
  h += `<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="primary" onclick="UI.hideModal()">Done</button></div>`;
  UI.showModal(h);
}

// Click (or tap) an associate on the map to open their orders.
canvas.addEventListener('click', () => {
  if (!G || RT.modal || UI.open || (G.phase !== 'day' && G.phase !== 'night')) return;
  const c = crewAtMouse();
  if (c && G.player.away) { toast('You\'re off the clock. Come in to give orders.', 'info'); return; }
  if (c) showOrders(c);
});
