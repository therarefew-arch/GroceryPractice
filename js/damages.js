'use strict';
// =====================================================================
//  Damages and reclaim.
//  - Crushed cases come in on the truck: you find them when you break the
//    pallet down. The good units keep going; the damaged ones land on the
//    floor and go to RECLAIM (the bin by the office door).
//  - Customers break things on the shelf, and a cleaned-up spill leaves the
//    broken product behind. Damaged product on the sales floor costs
//    satisfaction every hour until somebody takes it to reclaim.
//  - At reclaim, scan it out (E at the bin):
//      · truck damage scanned the SAME DAY is a damage claim on the invoice:
//        full cost back. After that, it's just reclaim.
//      · dry product gets 50% reclaim credit; cold product is thrown away.
//      · DSD vendor product isn't scanned: it waits in the bin for the
//        vendor, who credits it in full at check-in. Only if it's in the bin.
//  - Until it's scanned out, the system still counts damaged product as
//    sellable, so unworked reclaim is phantom on-hand (see counts.js).
// =====================================================================
const RECLAIM = { x: 33, y: 9 };
const RECLAIM_C = { x: RECLAIM.x + 0.5, y: RECLAIM.y + 0.5 };
const CRUSH_CHANCE = 0.02;        // per case on the warehouse truck
const SHELF_DAMAGE_CHANCE = 0.004; // per shopping stop
const DAMAGE_CARRY = 8;
const RECLAIM_OLD = 2;            // days in the bin before it smells and draws pests
const cost = d => DEPT[d].price * 0.6;

function setupReclaim() { MAPD.grid[RECLAIM.y][RECLAIM.x] = 'Y'; }
function ensureDamages() {
  G.damages = G.damages || [];
  G.player.damages = G.player.damages || [];
}
const floorDamages = () => (G.damages || []).filter(d => d.where === 'floor');
const salesFloorDamages = () => floorDamages().filter(d => d.y >= 10.5);
const binItems = () => (G.damages || []).filter(d => d.where === 'bin');
const binToScan = () => binItems().filter(d => !d.vendor);
const binHeld = () => binItems().filter(d => d.vendor);
const truckToClaim = () => (G.damages || []).concat(G.player.damages || []).filter(d => d.src === 'truck' && d.day === G.day);

function addDamage(dept, units, item, src, x, y, vendor) {
  const d = { id: nid(), dept, units, item, src, vendor: vendor || null, where: 'floor', x, y, at: G.time, day: G.day };
  G.damages.push(d);
  G.ohErr[dept] = (G.ohErr[dept] || 0) + units; // the system still thinks it's sellable
  G.today.dmgFound = (G.today.dmgFound || 0) + 1;
  return d;
}

// ---- where damages come from ----
// Some cases on the warehouse truck are crushed.
function truckDamage(cases) {
  cases.forEach(cs => { if (Math.random() < CRUSH_CHANCE) cs.dmg = randi(1, Math.max(1, Math.ceil(DEPT[cs.d].upc / 3))); });
}
// Breaking a pallet down: crushed cases show themselves.
function crushCheck(cases, pal, byPlayer) {
  cases.forEach(cs => {
    if (!cs.dmg) return;
    const n = Math.min(cs.dmg, caseUnits(cs) - 1); delete cs.dmg;
    if (n <= 0) return;
    cs.u = caseUnits(cs) - n;
    const at = pal || G.player;
    addDamage(cs.d, n, cs.item, 'truck', at.x + rand(-0.4, 0.4), at.y + rand(0.3, 0.6));
    if (byPlayer) {
      floater(G.player.x, G.player.y - 1.3, `Crushed case! ${n} damaged → reclaim`, '#ff9f6b');
      if (!RT.crushTipped) { RT.crushTipped = true; toast(`📦 A crushed case of ${cs.item}: ${n} damaged unit(s) went on the floor. Take them to RECLAIM (by the office door) and scan them today: today's truck damage is a damage claim, full cost back.`, 'warn'); }
    }
  });
}
// A customer knocks something off the shelf.
function shelfDamage(dept, cu) {
  if (G.stock[dept].shelf <= 0 || Math.random() >= SHELF_DAMAGE_CHANCE) return;
  G.stock[dept].shelf--;
  const t = pick(MAPD.access[dept]), it = wpick(DEPT[dept].items, i => i[1])[0];
  const vs = VENDORS.filter(v => v.dept === dept), vendor = vs.length && Math.random() < 0.5 ? pick(vs).name : null;
  addDamage(dept, 1, it, 'shelf', t.x + rand(0.25, 0.75), t.y + rand(0.25, 0.75), vendor);
}
// Cleaning a spill leaves the broken product to take to reclaim.
function spillDamage(s) {
  const vs = VENDORS.filter(v => v.dept === s.dept), vendor = vs.length && Math.random() < 0.4 ? pick(vs).name : null;
  if (G.stock[s.dept].shelf > 0) G.stock[s.dept].shelf--;
  addDamage(s.dept, 1, s.what, 'spill', s.x, s.y, vendor);
}

// ---- scanning reclaim ----
function scanDamage(d, crew) {
  if (!G.damages.includes(d) || d.vendor) return;
  G.damages = G.damages.filter(x => x !== d);
  const c = cost(d.dept) * d.units, t = G.today;
  const claim = d.src === 'truck' && d.day === G.day;
  const credit = claim ? c : DEPT[d.dept].cold ? 0 : c * 0.5;
  G.ohErr[d.dept] -= d.units; // now the system knows
  t.credits = (t.credits || 0) + credit; t.dmgLoss = (t.dmgLoss || 0) + (c - credit);
  t.dmgScanned = (t.dmgScanned || 0) + 1;
  if (claim) t.claims = (t.claims || 0) + 1;
  if (!crew) floater(G.player.x, G.player.y - 1, claim ? `Damage claim +${money(credit)}` : credit ? `Reclaim +${money(credit)}` : 'Thrown out', claim ? '#57f287' : credit ? '#9be3ff' : '#ff9f6b');
}
// DSD vendors credit their own damaged product, but only what's waiting in reclaim.
function vendorCredits(v) {
  const mine = binHeld().filter(d => d.vendor === v.name);
  const lost = (G.damages || []).filter(d => d.vendor === v.name && d.where !== 'bin').length;
  if (lost) G.today.vendorDmgMissed = (G.today.vendorDmgMissed || 0) + lost;
  if (!mine.length) return;
  const cr = sum(mine.map(d => cost(d.dept) * d.units));
  G.damages = G.damages.filter(d => !mine.includes(d));
  mine.forEach(d => { G.ohErr[d.dept] -= d.units; });
  G.today.credits = (G.today.credits || 0) + cr; G.today.vendorCredits = (G.today.vendorCredits || 0) + cr;
  toast(`💵 ${v.name} picked up ${plural(mine.length, 'damaged item')} from reclaim: +${money(cr)} credit.${lost ? ` ${lost} more of theirs wasn't in reclaim, so no credit for it.` : ''}`, 'good');
}

// ---- you ----
function playerPickDamage(d) {
  const p = G.player;
  if (p.damages.length >= DAMAGE_CARRY || !G.damages.includes(d)) return;
  G.damages = G.damages.filter(x => x !== d);
  p.damages.push(d); SFX.pick();
}
function playerBinDamages() {
  const p = G.player, n = p.damages.length;
  p.damages.forEach(d => { d.where = 'bin'; d.x = RECLAIM_C.x; d.y = RECLAIM_C.y; G.damages.push(d); });
  p.damages = []; addXP(n, p); SFX.drop();
}
function playerScanReclaim() {
  startWork(0.5, 'Scanning reclaim', () => {
    const d = binToScan()[0]; if (!d) return false;
    scanDamage(d, null); addXP(1);
    if (!binToScan().length) { toast(`Reclaim scanned out.${binHeld().length ? ` ${plural(binHeld().length, 'item')} stay in the bin for DSD vendors to credit.` : ''}`, 'good'); return false; }
    return true;
  }, true);
}
function damageInteraction(p) {
  const pushing = p.floatId || p.birdId || p.pallet;
  if (dist(RECLAIM_C, p) < 1.6 && !pushing) {
    if (p.damages.length) return { label: `Put ${plural(p.damages.length, 'damaged item')} in reclaim`, fn: playerBinDamages, at: RECLAIM_C };
    const n = binToScan().length, claim = binToScan().filter(d => d.src === 'truck' && d.day === G.day).length;
    if (n && !p.carry.length) return { label: `Scan out reclaim (${n} item${n === 1 ? '' : 's'}${claim ? `, ${claim} truck damage claim${claim === 1 ? '' : 's'} due today` : ''})`, fn: playerScanReclaim, at: RECLAIM_C };
    return { label: binHeld().length ? `Reclaim: ${plural(binHeld().length, 'item')} held for DSD vendors (${[...new Set(binHeld().map(d => d.vendor))].join(', ')})` : 'Reclaim bin is empty', fn: null };
  }
  if (p.carry.length || pushing || p.damages.length >= DAMAGE_CARRY) return null;
  const d = nearest(floorDamages(), p, 1.3);
  if (d) return { label: `Pick up damaged ${d.item} (${d.units} unit${d.units === 1 ? '' : 's'}${d.vendor ? `, ${d.vendor}` : d.src === 'truck' ? ', truck damage' : ''}) for reclaim`, fn: () => playerPickDamage(d), at: d, rep: true };
  return null;
}
// Clocking out: whatever you're holding goes in the bin.
function playerDropDamages() { if (G.player.damages && G.player.damages.length) playerBinDamages(); }

// ---- crew ----
// Pick up damaged product off the floor and take it to reclaim.
function planDamages(c, r) {
  if (RT.dmgClaim && RT.dmgClaim !== c.id) return null;
  const list = floorDamages().sort((a, b) => dist(r, a) - dist(r, b)).slice(0, 6);
  if (!list.length) return null;
  RT.dmgClaim = c.id;
  r.cleanups.push(() => { if (RT.dmgClaim === c.id) RT.dmgClaim = null; });
  r.damages = r.damages || [];
  r.intent = 'Taking damages to reclaim';
  const steps = [];
  list.forEach(d => steps.push(
    { go: () => (G.damages.includes(d) && d.where === 'floor' ? tilesAround(d, 1) : [{ x: Math.floor(r.x), y: Math.floor(r.y) }]) },
    { do: () => { if (G.damages.includes(d) && d.where === 'floor') { G.damages = G.damages.filter(x => x !== d); r.damages.push(d); } return true; } }));
  steps.push({ go: () => workTiles([RECLAIM]) }, { wait: 0.5, label: 'Putting damages in reclaim' }, { do: () => { binCrewDamages(r); return true; } });
  return steps;
}
function binCrewDamages(r) {
  (r.damages || []).forEach(d => { d.where = 'bin'; d.x = RECLAIM_C.x; d.y = RECLAIM_C.y; G.damages.push(d); });
  r.damages = [];
}
// Scan out the reclaim bin.
function planReclaim(c, r) {
  if ((RT.reclaimClaim && RT.reclaimClaim !== c.id) || !binToScan().length) return null;
  RT.reclaimClaim = c.id;
  r.cleanups.push(() => { if (RT.reclaimClaim === c.id) RT.reclaimClaim = null; });
  r.intent = 'Scanning out reclaim';
  let t = 0;
  return [{ go: () => workTiles([RECLAIM]) }, { loop: dt => {
    r.label = 'Scanning reclaim';
    const d = binToScan()[0];
    if (!d) { r.progress = 0; return true; }
    t += dt * sf(c); r.progress = t / 0.6;
    if (t >= 0.6) { t = 0; scanDamage(d, c); }
    return false;
  } }];
}
// Reclaim that can't wait: today's truck claims late in the day, or a full bin.
const reclaimDue = () => binToScan().length >= 8 || (G.time >= 1080 && binToScan().some(d => d.src === 'truck' && d.day === G.day));

// ---- time ----
function damagesHour() {
  if (G.phase !== 'day' || G.time < OPEN) return;
  const n = salesFloorDamages().length;
  if (n) G.sat = Math.max(0, G.sat - 0.15 * n);
}
function damagesEndDay() {
  // Today's truck damages that never got scanned lose the claim.
  const missed = truckToClaim();
  if (missed.length) { G.today.claimsMissed = missed.length; G.today.claimLost = sum(missed.map(d => cost(d.dept) * d.units * (DEPT[d.dept].cold ? 1 : 0.5))); }
}
const reclaimOld = () => binItems().filter(d => G.day - d.day >= RECLAIM_OLD);

// ---- reports ----
function damagesTips() {
  const t = G.today, tips = [];
  if (t.claimsMissed) tips.push(`${plural(t.claimsMissed, 'truck damage')} didn't get scanned at reclaim today, so the damage claims are gone (${money(t.claimLost || 0)} lost). Truck damage is a claim on that day's invoice: scan it the same day.`);
  if (floorDamages().length) tips.push(`${plural(floorDamages().length, 'damaged item')} were left on the floor at close. Broken product on the sales floor is a hazard and an eyesore; in the back it's lost credit.`);
  if (t.vendorDmgMissed) tips.push(`DSD vendors came in while ${t.vendorDmgMissed} of their damaged items weren't in reclaim, so they couldn't credit them. Get vendor damages to the bin before they show up.`);
  if (reclaimOld().length) tips.push(`${plural(reclaimOld().length, 'item')} have sat in reclaim ${RECLAIM_OLD}+ days. Old reclaim smells, draws pests and is still on the system as sellable until it's scanned out.`);
  if (t.credits >= 1) tips.push(`Damages: ${money(t.credits)} credited today (claims, reclaim and vendor credit), ${money(t.dmgLoss || 0)} written off.`);
  return tips;
}
function damagesDayExtras() {
  const t = G.today;
  return { dmgFound: t.dmgFound || 0, credits: Math.round(t.credits || 0), dmgLoss: Math.round(t.dmgLoss || 0), claimsMissed: t.claimsMissed || 0, claimLost: Math.round(t.claimLost || 0), vendorDmgMissed: t.vendorDmgMissed || 0 };
}
function damagesReviewNotes(days, note, praise) {
  const missed = sum(days.map(d => d.claimsMissed || 0)), lost = sum(days.map(d => d.claimLost || 0)), credits = sum(days.map(d => d.credits || 0)), vm = sum(days.map(d => d.vendorDmgMissed || 0));
  if (missed >= 3 || vm >= 3) note('Damages and reclaim', [missed >= 3 && `${missed} truck damages missed the same-day claim (${money(lost)} lost)`, vm >= 3 && `${vm} vendor damages weren't in reclaim when the vendor came`].filter(Boolean).join(', ') + '.',
    'Every damaged unit is cost we already paid. A claim or a vendor credit gets it back; a box sitting on the floor gets nothing, and the system keeps counting it as sellable.',
    'Pull damages to reclaim as you find them, scan truck damage the same day, and keep vendor damages in the bin for their next visit.');
  else if (days.length >= 3 && credits > 0) praise.push(`You recovered ${money(credits)} in damage credits this week.`);
}

// ---- drawing ----
function drawReclaim() {
  const x = RECLAIM.x * T, y = RECLAIM.y * T, n = binItems().length;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 4, y + 6, T - 4, T - 6);
  ctx.fillStyle = '#3a3f46'; ctx.fillRect(x + 2, y + 4, T - 6, T - 8);
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#1b1d20' : '#e0b030'; ctx.fillRect(x + 2 + i * (T - 6) / 5, y + 4, (T - 6) / 5, 3); }
  binItems().slice(0, 6).forEach((d, i) => { ctx.fillStyle = DEPT[d.dept].color; ctx.fillRect(x + 5 + (i % 3) * 7, y + 10 + ((i / 3) | 0) * 7, 6, 6); });
  label(ctx, 'RECLAIM', x + T / 2 - 2, y - 3, { font: PX(6), color: reclaimOld().length ? '#ff9f6b' : '#e0b030', outline: '#000' });
  if (n) label(ctx, String(n), x + T - 4, y + 6, { font: PX(8), outline: '#000', color: binToScan().some(d => d.src === 'truck' && d.day === G.day) ? '#57f287' : '#fff' });
}
function drawDamages() {
  const blink = (performance.now() / 450 | 0) % 2;
  floorDamages().forEach(d => {
    const x = Math.round(d.x * T - 5), y = Math.round(d.y * T - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 1, y + 1, 10, 8);
    ctx.fillStyle = '#9a6b3c'; ctx.fillRect(x, y, 10, 8);
    ctx.fillStyle = DEPT[d.dept].color; ctx.fillRect(x + 1, y + 1, 4, 3);
    ctx.strokeStyle = '#e5534b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 1, y + 7); ctx.lineTo(x + 5, y + 3); ctx.lineTo(x + 9, y + 6); ctx.stroke(); ctx.lineWidth = 1;
    if (blink && d.y >= 10.5) { ctx.strokeStyle = '#e5534b'; ctx.strokeRect(x - 1.5, y - 1.5, 13, 11); }
  });
}
// A gray tote of damages next to you.
function drawHeldDamages(p) {
  if (!p.damages || !p.damages.length) return;
  const x = Math.round(p.x * T - 20), y = Math.round(p.y * T - 2);
  ctx.fillStyle = '#5a6270'; ctx.fillRect(x, y, 11, 8);
  ctx.fillStyle = '#e5534b'; ctx.fillRect(x + 2, y + 2, 7, 1);
  label(ctx, String(p.damages.length), x - 3, y + 7, { font: PX(7), outline: '#000' });
}
