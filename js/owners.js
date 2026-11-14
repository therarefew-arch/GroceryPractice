'use strict';
// =====================================================================
//  Aisle owners: one associate is responsible for each aisle.
//  - Assign owners in Crew & Schedule (🏷 Aisle owners). Up to 2 aisles
//    each. A small tag with their initials hangs by the aisle sign.
//  - On shift, an owner keeps their own aisle up between their other work:
//    fills its holes from backstock and faces it. They face their own
//    aisle faster (it's theirs). Truck crew stick to the truck until it's
//    done unless their aisle is in real trouble.
//  - Every aisle gets an hourly score while the store is open: half how
//    full the shelf is, half how well it's faced. The owner's name goes
//    next to it in the end-of-day report and the weekly review.
//  - Accountability: when an owned aisle is slipping, walk it with them
//    (walk up, E). For the rest of today and tomorrow they hold it to a
//    higher bar. Thank an owner whose aisle looks great: pride sticks.
// =====================================================================
const OWN_MAX = 2, OWN_SPEED = 1.2;
function ensureOwners() {
  G.owners = G.owners || {}; G.aisleHist = G.aisleHist || {};
  for (const d in G.owners) if (!G.crew.some(c => c.id === G.owners[d])) delete G.owners[d];
}
const ownerOf = d => (G.owners && G.owners[d] != null ? G.crew.find(c => c.id === G.owners[d]) || null : null);
const ownsOf = c => DEPTS.filter(d => G.owners && G.owners[d.id] === c.id).map(d => d.id);
const aisleScore = d => Math.round(100 * (0.5 * Math.min(1, shelfPct(d) / 0.95) + 0.5 * faceOf(d) / 100));
const aisleToday = d => { const a = G.today && G.today.aisle && G.today.aisle[d]; return a && a.n ? Math.round(a.sum / a.n) : null; };
const aisleWeek = d => { const h = (G.aisleHist && G.aisleHist[d]) || []; return h.length ? Math.round(sum(h) / h.length) : null; };
const ownFocus = c => (c.ownFocusUntil || 0) >= G.day;
const initials = n => n.split(' ').map(w => w[0]).join('').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();

function setOwner(dept, id) {
  ensureOwners();
  const c = G.crew.find(x => x.id === id), was = ownerOf(dept);
  if (!c) { delete G.owners[dept]; if (was) bump(was, -3); return; }
  if (ownsOf(c).length >= OWN_MAX && G.owners[dept] !== c.id) { toast(`${c.name} already owns ${OWN_MAX} aisles. More than that and nothing is really theirs.`, 'warn'); return; }
  G.owners[dept] = c.id;
  if (was && was !== c) bump(was, -6);
  bump(c, 5);
  toast(`🏷 ${c.name} owns ${DEPT[dept].aisle} (${DEPT[dept].name}) now.${was && was !== c ? ` ${was.name} isn't happy to lose it.` : ''}`, 'good');
}

// ---- the crew looking after their aisle ----
function ownerPlan(c, r) {
  if (G.phase !== 'day' || !G.owners) return null;
  const own = ownsOf(c); if (!own.length) return null;
  const truckBusy = ['breakdown', 'freight', 'unloader'].includes(c.role) && truckRemaining() > 0 && G.time < 720;
  const bar = ownFocus(c) ? 1.1 : 1;
  for (const d of own.sort((a, b) => aisleScore(a) - aisleScore(b))) {
    const critical = shelfPct(d) < 0.5 || faceOf(d) < 70;
    if (truckBusy && !critical) continue;
    const p = (shelfPct(d) < 0.8 * bar && G.stock[d].back > 0 ? planReplen(c, r, [d], Math.min(0.97, 0.85 * bar)) : null) ||
      (faceOf(d) < Math.min(95, 85 * bar) ? planFace(c, r, d) : null);
    if (p) { r.intent += ' (their aisle)'; return p; }
  }
  return null;
}
const ownSpeed = (c, d) => (G.owners && G.owners[d] === c.id ? OWN_SPEED : 1);

// ---- you: accountability and pride ----
function ownerInteraction(p) {
  if (!G.owners) return null;
  const c = crewNear(p, 1.6);
  if (!c || !onShift(c) || c.ownWalkDay === G.day) return null;
  const d = ownsOf(c).filter(x => aisleScore(x) < 75 || (aisleToday(x) || 100) < 70).sort((a, b) => aisleScore(a) - aisleScore(b))[0];
  if (!d) return null;
  return { label: `🏷 Walk ${DEPT[d].aisle} with ${c.name} (their aisle: ${aisleScore(d)}%)`, fn: () => startWork(4, 'Walking the aisle', () => ownerWalk(c, d)) };
}
function ownerWalk(c, d) {
  c.ownWalkDay = G.day; c.ownFocusUntil = G.day + 1;
  G.face[d] = Math.min(100, faceOf(d) + 8);
  bump(c, c.morale < 40 ? -2 : 1);
  const r = RT.crew[c.id]; if (r) { r.hold = 2; finishPlan(c, r); }
  addXP(4, G.player);
  toast(c.morale < 40
    ? `🏷 You walked ${DEPT[d].aisle} with ${c.name}. They got defensive: morale is low, so it felt like blame. They'll still hold it to a higher bar today and tomorrow.`
    : `🏷 You walked ${DEPT[d].aisle} with ${c.name} and agreed on what "right" looks like. They'll hold it to a higher bar today and tomorrow.`, c.morale < 40 ? 'warn' : 'good');
}
// thanking an owner whose aisle looks great (js/morale.js praiseCrew)
function ownerPraise(c) {
  const d = ownsOf(c).find(x => aisleScore(x) >= 90);
  if (d) { bump(c, 4); toast(`🏷 You told ${c.name} their ${DEPT[d].aisle} looks great. Pride in an aisle is what ownership is for.`, 'good'); }
}

// ---- time ----
function ownersHour(h) {
  if (G.phase !== 'day' || h * 60 <= OPEN || h * 60 > CLOSE) return;
  ensureOwners();
  G.today.aisle = G.today.aisle || {};
  DEPTS.forEach(d => { const a = G.today.aisle[d.id] = G.today.aisle[d.id] || { sum: 0, n: 0 }; a.sum += aisleScore(d.id); a.n++; });
}
function ownersDay() {
  ensureOwners();
  const tips = [], owned = [], free = [];
  DEPTS.forEach(d => {
    const s = aisleToday(d.id); if (s == null) return;
    const h = G.aisleHist[d.id] = (G.aisleHist[d.id] || []).concat([s]).slice(-7);
    const o = ownerOf(d.id);
    (o ? owned : free).push(s);
    if (o && s >= 88) bump(o, 2);
  });
  G.today.ownedAvg = owned.length ? Math.round(sum(owned) / owned.length) : null;
  G.today.freeAvg = free.length ? Math.round(sum(free) / free.length) : null;
  const worst = DEPTS.filter(d => ownerOf(d.id) && aisleToday(d.id) != null).sort((a, b) => aisleToday(a.id) - aisleToday(b.id))[0];
  if (worst && aisleToday(worst.id) < 70) tips.push(`${worst.aisle} averaged ${aisleToday(worst.id)}% today, and it's ${ownerOf(worst.id).name}'s aisle. Ownership only works if you hold people to it: walk the aisle with them (E near them) and agree on what "right" looks like.`);
  if (owned.length && free.length && G.today.ownedAvg - G.today.freeAvg >= 8) tips.push(`Owned aisles averaged ${G.today.ownedAvg}% today; aisles nobody owns averaged ${G.today.freeAvg}%. Give every aisle an owner (Crew & Schedule).`);
  if (!owned.length && G.day >= 10 && G.crew.length >= 4) tips.push('No aisle has an owner. When everyone is responsible for every aisle, nobody is. Give each aisle an owner in Crew & Schedule.');
  return tips;
}
function ownersDayExtras() { return { ownedAvg: G.today.ownedAvg, freeAvg: G.today.freeAvg }; }
function ownersReviewNotes(days, note, praise) {
  ensureOwners();
  const best = DEPTS.filter(d => ownerOf(d.id) && aisleWeek(d.id) != null).sort((a, b) => aisleWeek(b.id) - aisleWeek(a.id))[0];
  if (best && aisleWeek(best.id) >= 85) praise.push(`Aisle of the week: ${best.aisle}, owned by ${ownerOf(best.id).name} (${aisleWeek(best.id)}%).`);
  const n = DEPTS.filter(d => ownerOf(d.id)).length;
  if (!n && G.day >= 14) note('Aisle ownership', 'No aisle has an owner.', 'When everyone is responsible for every aisle, nobody is. Problems sit until a manager finds them.', 'Give every aisle an owner in Crew & Schedule, walk the weak ones with their owners, and thank the owners of the good ones.');
}

// ---- screens and drawing ----
function ownersHTML() {
  ensureOwners();
  let h = `<h3>🏷 Aisle owners</h3><p class="mute">Give every aisle an owner (up to ${OWN_MAX} each). On shift, owners keep their own aisle full and faced between their other work, and they face it faster. Score = half how full the shelf is, half how well it's faced. When one slips, walk it with the owner (walk up, <kbd>E</kbd>); when one looks great, thank them.</p>
    <table><tr><th>Aisle</th><th>Owner</th><th class="n">Now</th><th class="n">Today</th><th class="n">7 days</th></tr>`;
  for (const d of DEPTS) {
    const o = ownerOf(d.id), now = aisleScore(d.id), td = aisleToday(d.id), wk = aisleWeek(d.id);
    const cls = v => (v == null ? 'mute' : v >= 85 ? 'good' : v >= 70 ? '' : 'bad');
    h += `<tr><td><span class="dot" style="background:${d.color}"></span>${d.aisle} · ${d.name}</td>
      <td><select onchange="UI.setOwner('${d.id}', this.value)"><option value="">— nobody —</option>${G.crew.map(c => `<option value="${c.id}" ${o === c ? 'selected' : ''}>${esc(c.name)}${ownsOf(c).length && o !== c ? ` (${ownsOf(c).map(x => DEPT[x].aisle.replace('Aisle ', 'A')).join(', ')})` : ''}</option>`).join('')}</select></td>
      <td class="n ${cls(now)}">${now}%</td><td class="n ${cls(td)}">${td == null ? '—' : td + '%'}</td><td class="n ${cls(wk)}">${wk == null ? '—' : wk + '%'}</td></tr>`;
  }
  return h + '</table>';
}
UI.setOwner = function (dept, v) { setOwner(dept, v === '' ? null : +v); this.render(); };
// a little tag with the owner's initials by each aisle sign
function drawOwnerTags() {
  if (!MAPD.signs || !G.owners) return;
  for (const d in MAPD.signs) {
    const o = ownerOf(d); if (!o) continue;
    const s = MAPD.signs[d], t = initials(o.name), x = s.x - 14, y = s.y - 29;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, 13, 12);
    ctx.fillStyle = ROLES[o.role].color; ctx.fillRect(x, y, 11, 10);
    label(ctx, t, x + 6, y + 6, { font: PX(6, false), color: '#fff', outline: '#000' });
  }
}
