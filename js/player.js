'use strict';
// =====================================================================
//  The player: moving, what E does where you stand, and your own work (split out of game.js).
// =====================================================================
// =====================================================================
//  Player
// =====================================================================
function blockedAt(x, y, rad) {
  for (const [ox, oy] of [[-rad, -rad], [rad, -rad], [-rad, rad], [rad, rad]]) if (!walkable(Math.floor(x + ox), Math.floor(y + oy))) return true;
  return false;
}
function updatePlayer(dt) {
  const p = G.player, k = RT.keys;
  let dx = ((k.ArrowRight || k.KeyD || k.PadRight || k.TouchRight) ? 1 : 0) - ((k.ArrowLeft || k.KeyA || k.PadLeft || k.TouchLeft) ? 1 : 0);
  let dy = ((k.ArrowDown || k.KeyS || k.PadDown || k.TouchDown) ? 1 : 0) - ((k.ArrowUp || k.KeyW || k.PadUp || k.TouchUp) ? 1 : 0);
  let mag = 1;
  // Analog stick (phone joystick or gamepad): any direction, push further to go faster.
  const joy = [RT.touchJoy, RT.padJoy].find(j => j && Math.hypot(j.x, j.y) > 0.2), jm = joy ? Math.hypot(joy.x, joy.y) : 0;
  if (jm > 0.2) { dx = joy.x; dy = joy.y; mag = Math.min(1, jm * 1.3); }
  if (dx || dy) {
    p.work = null;
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    p.fx = dx; p.fy = dy;
    let sp = (k.ShiftLeft || k.ShiftRight || k.PadRun || k.TouchRun) ? 6.5 : 4.2;
    if (p.floatId || p.pallet || p.birdId) sp *= 0.75;
    movePlayer(p, dx * sp * mag * dt, dy * sp * mag * dt);
  }
  if (p.work) {
    p.work.t += dt;
    if (p.work.t >= p.work.dur) {
      const w = p.work, cont = w.done();
      if (w.repeat && cont) w.t = 0; else if (p.work === w) p.work = null;
    }
  }
  // Whatever you're pushing trails smoothly in front of you.
  const follow = e => { const a = Math.min(1, dt * 18); e.x += (p.x + p.fx * 0.7 - e.x) * a; e.y += (p.y + p.fy * 0.7 - e.y) * a; };
  if (p.floatId) { const f = floatById(p.floatId); if (f) follow(f); else p.floatId = null; }
  if (p.birdId) { const b = G.birds && G.birds[p.birdId]; if (b && b.carriedBy === 'player') follow(b); else p.birdId = null; }
}
// Move with wall sliding. If a wall corner catches you while you walk straight,
// ease around it toward whichever side is open.
function movePlayer(p, mx, my) {
  const R = 0.3;
  const side = free => { for (const o of [0.12, 0.24, 0.36, 0.48]) { const a = free(o), b = free(-o); if (a !== b) return a ? 1 : -1; if (a) return 0; } return 0; };
  if (mx) {
    if (!blockedAt(p.x + mx, p.y, R)) p.x += mx;
    else if (!my) { const s = side(o => !blockedAt(p.x + mx, p.y + o, R)); if (s && !blockedAt(p.x, p.y + s * Math.abs(mx), R)) p.y += s * Math.abs(mx); }
  }
  if (my) {
    if (!blockedAt(p.x, p.y + my, R)) p.y += my;
    else if (!mx) { const s = side(o => !blockedAt(p.x + o, p.y + my, R)); if (s && !blockedAt(p.x + s * Math.abs(my), p.y, R)) p.x += s * Math.abs(my); }
  }
}
// Hold E (or the E button) to keep doing repeatable things: picking cases, sorting, stocking.
// Hold E / Space for the More options menu (js/menu.js). "Keep going" from that
// menu (or holding the gamepad A button) repeats the action until you move.
function holdRepeat(dt) {
  const k = RT.keys, p = G.player;
  if (p.away) { RT.autoRep = false; RT.holdT = 0; return; }
  if ((k.KeyE || k.Space) && RT.eDownAt && !RT.eMenuDone && performance.now() - RT.eDownAt > HOLD_MS) { RT.eMenuDone = true; openActionMenu(); return; }
  const j = RT.touchJoy, moving = k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight || k.PadUp || k.PadDown || k.PadLeft || k.PadRight || (j && Math.abs(j.x) + Math.abs(j.y) > 0.25);
  if (RT.autoRep && moving) RT.autoRep = false;
  if (!(k.PadA || RT.autoRep) || p.work) { RT.holdT = 0; return; }
  RT.holdT = (RT.holdT || 0) + dt;
  if (RT.holdT < 0.32) return;
  RT.holdT = 0.16;
  const it = getInteraction();
  if (it && it.fn && it.rep) it.fn();
  else RT.autoRep = false;
}

function nearestTile(p, test, r) {
  let best = null, bd = r;
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    if (y < 0 || y >= MH || x < 0 || x >= MW) continue;
    const ch = MAPD.grid[y][x];
    if (!test(ch)) continue;
    const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
    if (d <= bd) { bd = d; best = { x, y, ch }; }
  }
  return best;
}
// Closest thing within r. Things in front of you win ties over things behind you.
function nearest(list, p, r, filter) {
  let best = null, bs = Infinity;
  for (const e of list) {
    if (filter && !filter(e)) continue;
    const d = dist(e, p); if (d > r) continue;
    const face = p.fx != null && d > 0.01 ? ((e.x - p.x) * p.fx + (e.y - p.y) * p.fy) / d : 0;
    const s = d - 0.45 * face;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
const tileC = t => (t ? { x: t.x + 0.5, y: t.y + 0.5 } : null);
const inRecv = p => p.x >= 1 && p.x < 9 && p.y >= 4 && p.y < 9;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const caseLabel = c => (RT.settings.labels && c.item !== 'Backstock' ? `${c.item} [${DEPT[c.d].aisle}]` : c.item === 'Backstock' ? `Backstock ${DEPT[c.d].name}` : c.item);
function startWork(dur, label, done, repeat) { G.player.work = { t: 0, dur, label, done, repeat: !!repeat }; }

// Context-sensitive [E] action for wherever the player is standing.
// Returns { label, fn, at, rep, alt }: `at` is what gets the highlight, `rep` means
// holding E repeats it, `alt` is the second action on [Q].
function getInteraction() {
  const p = G.player;
  if (G.phase !== 'day' && G.phase !== 'night') return null;
  if (p.away) return null;
  if (p.pallet && p.pallet.empty) return backroomInteraction(p);
  const pushing = p.floatId || p.birdId;
  const shelf = nearestTile(p, ch => !!SHELF_DEPT[ch], pushing ? 1.75 : 1.3);
  const shelfDept = shelf ? SHELF_DEPT[shelf.ch] : null;
  const bird = nearest(birdList(), p, 1.45, b => !b.carriedBy);

  if (p.ecLoad) return ecLoadInteraction(p);
  if (p.pallet) {
    if (inRecv(p)) return { label: 'Drop pallet in Receiving', fn: playerDropPallet };
    return { label: 'Bring the pallet to the yellow RECEIVING area', fn: null };
  }
  if (p.floatId) {
    const f = floatById(p.floatId), n = f.cases.length, d = DEPT[f.dept];
    if (shelfDept === f.dept && n) return { label: `Work ${plural(n, 'case')} onto ${d.name}`, fn: () => playerWorkFloat(f), at: tileC(shelf) };
    if (shelfDept && shelfDept !== f.dept && n) return { label: `✗ This is ${DEPT[shelfDept].name} — your float is ${d.name} (${d.aisle})`, fn: null, bad: true };
    const own = nearest(birdList(), p, 1.7, b => b.dept === f.dept && !b.carriedBy);
    if (own && n) return { label: `Backstock ${plural(n, 'overflow case')} on the ${d.aisle} bird`, fn: () => { floatToBack(f); toast(`Overflow from the ${d.name} float went on its bird.`); }, at: own };
    if (Math.hypot(p.x - f.homeX, p.y - f.homeY) < 1.6) return { label: 'Park float at its home spot', fn: () => releaseFloat(true), at: { x: f.homeX, y: f.homeY } };
    return { label: 'Let go of the float', fn: () => releaseFloat(false) };
  }
  if (p.birdId) {
    const b = G.birds[p.birdId], d = DEPT[b.dept], n = backCases(b.dept);
    if (shelfDept === b.dept && n) return canStock(b.dept) ? { label: `Work backstock onto ${d.name} (${plural(n, 'case')} on the bird)`, fn: () => playerWorkBird(b), at: tileC(shelf) } : { label: `${d.name} shelf is full`, fn: null };
    if (shelfDept && shelfDept !== b.dept) return { label: `✗ This is ${DEPT[shelfDept].name}: your bird is ${d.name} (${d.aisle})`, fn: null, bad: true };
    if (Math.hypot(p.x - b.homeX, p.y - b.homeY) < 1.6) return { label: 'Park the bird at its spot in BACKSTOCK', fn: () => releaseBird(true), at: { x: b.homeX, y: b.homeY } };
    return { label: `Let go of the ${d.aisle} bird${n ? '' : ' (empty)'}`, fn: () => releaseBird(false) };
  }
  const cf = !p.work && conflictInteraction(p);
  if (cf) return cf;
  const ev = !p.work && eventsInteraction(p, shelfDept, true);
  if (ev) return ev;
  const coachee = G.crew.find(c => c.needsCoach && RT.crew[c.id] && RT.crew[c.id].inBuilding && dist(RT.crew[c.id], p) < 1.5);
  if (coachee && !p.work) return { label: `Coach ${coachee.name}: ${TRAIN_AREAS[coachee.needsCoach.area].mistake}`, fn: () => { const rr = RT.crew[coachee.id]; if (rr) rr.hold = 2.5; startWork(2.5, 'Coaching', () => coachCrew(coachee)); }, at: RT.crew[coachee.id] };
  const dvi = !p.work && devInteraction(p);
  if (dvi) { const s2 = standardsInteraction(p); return s2 ? { ...dvi, alt: s2 } : dvi; }
  const trash = nearest(G.trash || [], p, 1.3);
  if (trash) return { label: 'Pick up the cardboard', fn: () => pickUpTrash(trash), at: trash, rep: true };
  if (p.gobacks && p.gobacks.length) { const gi = gobackInteraction(p, shelfDept, shelf); if (gi) return gi; }
  else if (!p.carry.length) { const gp = gobackPickup(p); if (gp) return gp; }
  const dmi = damageInteraction(p); if (dmi) return dmi;
  const pal = nearest(G.pallets, p, 1.35);
  const fl = nearest(G.floats, p, 1.4, f => !f.carriedBy);
  if (p.carry.length) {
    if (fl) { const m = p.carry.filter(c => c.d === fl.dept).length; if (m) return { label: `Sort ${plural(m, 'case')} onto the ${DEPT[fl.dept].name} float`, fn: () => playerSort(fl), at: fl, rep: true }; }
    if (shelfDept) { const m = p.carry.filter(c => c.d === shelfDept).length; if (m) return { label: `Stock ${plural(m, 'case')} on the shelf`, fn: () => playerStockCarry(shelfDept), at: tileC(shelf), rep: true }; }
    if (bird) { const m = p.carry.filter(c => c.d === bird.dept).length; if (m) return { label: `Put ${plural(m, 'case')} on the ${DEPT[bird.dept].aisle} bird`, fn: () => playerCarryToBird(bird), at: bird, rep: true }; }
    if (pal && p.carry.length < CARRY_CAP) return { label: `Pick up more (${pal.cases.length} on pallet)`, fn: () => playerPick(pal), at: pal, rep: true };
    if (fl) return { label: `✗ None of your cases go on the ${DEPT[fl.dept].name} float`, fn: () => wrongFloat(fl), bad: true };
    if (bird) return { label: `✗ None of your cases go on the ${DEPT[bird.dept].aisle} bird (${DEPT[bird.dept].name})`, fn: null, bad: true };
    return null;
  }
  const pc = nearestTile(p, ch => ch === 'C', 1.6);
  if (pc) return { label: 'Use the computer (reports, email, hiring, ordering…)', fn: () => UI.openComputer(), at: tileC(pc) };
  const vend = G.vendorsToday.find(v => v.state === 'waiting' && RT.vendorNpcs[v.name] && dist(RT.vendorNpcs[v.name], p) < 1.6);
  if (vend) return { label: `Check in ${vend.name} (${vend.cases} cs ${DEPT[vend.dept].name})`, fn: () => startWork(2, 'Checking in vendor', () => { if (vend.state === 'waiting') checkInVendor(vend, true); }), at: RT.vendorNpcs[vend.name] };
  if (G.phase === 'night' && G.trailer.length && p.y < 4.4 && p.x > 1.5 && p.x < 6.5) {
    return { label: `Pull a pallet off the trailer (${G.trailer.length} left)`, fn: () => startWork(1, 'Jacking pallet', () => { const pl = G.trailer.shift(); if (pl) G.player.pallet = pl; }) };
  }
  const br = !p.work && backroomInteraction(p);
  if (br) return br;
  const tag = nearest(G.tags.filter(tagReady).map(t => ({ x: t.x + 0.5, y: t.y + 0.5, t })), p, 1.5);
  const rci = !p.work && recallInteraction(p, shelfDept, shelf, bird, pal, fl);
  if (rci) return rci;
  const cri = !p.work && !pushing && custInteraction(p);
  if (cri) return cri;
  const dwi = !p.work && !pushing && dmInteraction(p);
  if (dwi) return dwi;
  const rpi = !p.work && !pushing && repInteraction(p);
  if (rpi) return rpi;
  const mti = !p.work && !pushing && matInteraction(p);
  if (mti) return mti;
  const eci = !p.work && !pushing && endcapInteraction(p);
  if (eci) return eci;
  const hdi = !p.work && !pushing && huddleInteraction(p);
  if (hdi) return hdi;
  const oti = !p.work && outTagInteraction(p);
  if (tag) {
    const t = tag.t, pt = { label: t.kind === 'error' ? 'Fix scan error (shelf price ≠ register)' : 'Hang price change tag', fn: () => startWork(1.5, t.kind === 'error' ? 'Fixing scan error' : 'Hanging tag', () => { if (G.tags.includes(t)) fixTag(t, true); }), at: tag };
    if (!oti) return pt;
    return dist(oti.at, p) < dist(tag, p) ? { ...oti, alt: pt } : { ...pt, alt: oti };
  }
  if (oti) return oti;
  if (pal) { const top = pal.cases[pal.cases.length - 1], same = top ? pal.cases.filter(c => c.d === top.d).length : 0; return { label: `Pick up ${same > 1 ? Math.min(same, CARRY_CAP) + ' cases' : 'a case'} (${pal.cases.length} on pallet)`, fn: () => playerPick(pal), at: pal, rep: true }; }
  if (fl) {
    if (fl.claimedBy) return { label: `${crewName(fl.claimedBy)} is about to push this float`, fn: null };
    return { label: `Push the ${DEPT[fl.dept].name} float (${plural(fl.cases.length, 'case')})`, fn: () => grabFloat(fl), at: fl };
  }
  const epi = !p.work && ecPullInteraction(p, bird);
  if (epi) return epi.fn ? { ...epi, alt: { label: 'Push the bird', fn: () => grabBird(bird) } } : epi;
  if (bird) {
    const n = backCases(bird.dept), d = DEPT[bird.dept];
    const push = { label: `Push the ${d.aisle} bird (${plural(n, 'case')})`, fn: () => grabBird(bird), at: bird };
    const pull = n ? { label: `Carry ${Math.min(n, CARRY_CAP)} cs`, fn: () => playerPullBack(bird.dept), at: bird } : null;
    const cb = !p.work && countBackAction(bird);
    if (cb) return { ...cb, alt: { label: 'Push the bird', fn: push.fn } };
    if (shelfDept === bird.dept && n && canStock(bird.dept)) return { label: `Work backstock onto ${d.name} (${plural(n, 'case')} on the bird)`, fn: () => playerWorkBird(bird), at: bird, alt: { label: 'Push the bird', fn: push.fn } };
    return { ...push, alt: pull };
  }
  const ev2 = !p.work && eventsInteraction(p, shelfDept, false);
  if (ev2) return ev2;
  const cs = !p.work && shelfDept && countShelfAction(shelfDept, shelf);
  if (cs) { const fi = faceInteraction(shelfDept, shelf); return fi ? { ...cs, alt: fi } : cs; }
  const rsi = !p.work && shelfDept && resetInteraction(shelfDept, shelf);
  if (rsi) { const fi = faceInteraction(shelfDept, shelf); return fi ? { ...rsi, alt: fi } : rsi; }
  const mi = !p.work && moraleInteraction(p);
  const fi = !p.work && faceInteraction(shelfDept, shelf);
  if (fi) return mi ? { ...fi, alt: mi } : fi;
  const sw = !p.work && !mi && backroomInteraction(p, true);
  if (sw) return sw;
  const sti = !p.work && standardsInteraction(p);
  if (mi) return sti ? { ...mi, alt: sti } : mi;
  if (sti) return sti;
  const door = { x: MAPD.staffDoor.x + 0.5, y: MAPD.staffDoor.y + 0.5 };
  if (dist(door, p) < 1.2) return { label: 'Clock out and go home', fn: () => askGoHome(), at: door };
  if (shelfDept) return { label: `${DEPT[shelfDept].aisle} · ${DEPT[shelfDept].name}: shelf ${Math.round(shelfPct(shelfDept) * 100)}% full · ${Math.round(faceOf(shelfDept))}% faced${p.gobacks && p.gobacks.length ? ` · none of your go-backs go here (${gbSummary(p.gobacks)})` : ''}`, fn: null };
  return null;
}

// One press grabs as many cases as you can carry, as long as they're for the same department.
function playerPick(pal) {
  const p = G.player, room = CARRY_CAP - p.carry.length;
  if (room <= 0 || !pal.cases.length) return;
  const first = pal.cases.pop(), got = [first];
  for (let i = pal.cases.length - 1; i >= 0 && got.length < room; i--) if (pal.cases[i].d === first.d) got.push(pal.cases.splice(i, 1)[0]);
  crushCheck(got, pal, true);
  p.carry.push(...got);
  cardboard(got.length);
  if (!pal.cases.length) removeEmptyPallets();
  floater(p.x, p.y - 0.9, caseLabel(first) + (got.length > 1 ? ` +${got.length - 1}` : ''), DEPT[first.d].color);
  SFX.pick();
}
function playerSort(f) {
  const p = G.player, m = p.carry.filter(c => c.d === f.dept);
  p.carry = p.carry.filter(c => c.d !== f.dept);
  f.cases.push(...m);
  G.today.youSorted += m.length;
  addXP(m.length, f);
  SFX.stock(m.length); comboHit(m.length, G.player);
}
function wrongFloat(fl) {
  G.today.missorts++;
  const where = G.player.carry.map(c => `${c.item} → ${DEPT[c.d].aisle} ${DEPT[c.d].name}`).join(', ');
  toast(`Wrong float! That's ${DEPT[fl.dept].name}. ${RT.settings.labels ? where : 'Check the item and think about which aisle it lives in.'}`, 'warn');
}
function playerStockCarry(dept) {
  const p = G.player;
  if (!canStock(dept)) { toast(`${DEPT[dept].name} shelf is full — put these in backstock.`, 'warn'); return; }
  const m = p.carry.filter(c => c.d === dept);
  p.carry = p.carry.filter(c => c.d !== dept);
  m.forEach(stockCase);
  G.today.youStocked += m.length;
  addXP(m.length, p);
  SFX.stock(m.length); comboHit(m.length, p);
}
function playerCarryToBack() { const p = G.player; p.carry.forEach(backCase); p.carry = []; }
function playerCarryToBird(b) {
  const p = G.player, m = p.carry.filter(c => c.d === b.dept);
  m.forEach(backCase);
  p.carry = p.carry.filter(c => c.d !== b.dept);
  SFX.drop();
}
function playerPullBack(dept) {
  const p = G.player, d = DEPT[dept], s = G.stock[dept];
  let u = Math.min(s.back, d.upc * CARRY_CAP);
  s.back -= u;
  while (u > 0) { const k = Math.min(d.upc, u); p.carry.push({ d: dept, item: 'Backstock', u: k }); u -= k; }
}
function grabFloat(f) { f.carriedBy = 'player'; G.player.floatId = f.id; }
function releaseFloat(home) {
  const f = floatById(G.player.floatId);
  if (f) { f.carriedBy = null; if (home) { f.x = f.homeX; f.y = f.homeY; } }
  G.player.floatId = null;
}
function playerWorkFloat(f) {
  startWork(0.45, 'Working freight', () => {
    if (!canStock(f.dept)) { toast(`${DEPT[f.dept].name} shelf is full — take the overflow to backstock.`, 'warn'); return false; }
    const c = f.cases.pop();
    if (!c) return false;
    stockCase(c);
    G.today.youStocked++;
    addXP(1);
    if (!f.cases.length) { toast(`Float worked! +5 XP`, 'good'); addXP(5, G.player); return false; }
    return true;
  }, true);
}
function playerDropPallet() {
  const p = G.player, s = freeRecvSpot(p);
  if (s && Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y) < 3) placePallet(p.pallet, s);
  else { p.pallet.x = p.x; p.pallet.y = p.y; G.pallets.push(p.pallet); }
  p.pallet = null;
  G.nightPallets++;
  addXP(5, p);
}
