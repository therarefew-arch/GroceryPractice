'use strict';
// =====================================================================
//  Crew AI: movement, and the plans each associate runs (split out of game.js).
// =====================================================================
// =====================================================================
//  Movement helpers
// =====================================================================
function setPath(e, p) { e.path = [{ x: Math.floor(e.x), y: Math.floor(e.y) }].concat(p || []); }
function moveAlong(e, dt, speed) {
  let remain = speed * dt;
  while (remain > 0 && e.path.length) {
    const t = e.path[0], tx = t.x + 0.5, ty = t.y + 0.5;
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d > 0.001) { e.fx = dx / d; e.fy = dy / d; }
    if (d <= remain) { e.x = tx; e.y = ty; remain -= d; e.path.shift(); }
    else { e.x += dx / d * remain; e.y += dy / d * remain; remain = 0; }
  }
  return e.path.length === 0;
}

// =====================================================================
//  Crew AI — each crew member runs a "plan": a list of steps.
//  Steps: {go, track?} walk to tiles · {wait,label} · {do} · {loop}
// =====================================================================
function rt(c) {
  return RT.crew[c.id] || (RT.crew[c.id] = {
    x: MAPD.staffDoor.x + 0.5, y: MAPD.staffDoor.y + 0.5, fx: 0, fy: 1, inBuilding: false, plan: null, path: null,
    carry: [], floatId: null, pallet: null, cleanups: [], progress: 0, label: '', intent: '', gobacks: [], damages: [],
  });
}
const sf = c => (0.7 + 0.12 * c.skill) * (isStar(c) ? 1.15 : 1) * moraleSpeed(c) * orderSpeed(c);
function onShift(c) {
  if (c.calledOut || c.sentHome === G.day) return false;
  const sk = curShift(c); if (!sk) return false;
  const s = SHIFTS[sk];
  if (c.lateDay === G.day && G.time < s.start + c.lateMin) return false; // tardy (js/discipline.js)
  return G.time >= s.start && G.time < s.end;
}

function finishPlan(c, r) {
  r.cleanups.forEach(fn => fn());
  r.cleanups = [];
  dropCrewGobacks(r); binCrewDamages(r);
  if (r.floatId) {
    const f = floatById(r.floatId);
    if (f) { f.carriedBy = null; if (f.claimedBy === c.id) f.claimedBy = null; }
    r.floatId = null;
  }
  if (r.birdId) { const b = G.birds[r.birdId]; if (b && b.carriedBy === c.id) { b.carriedBy = null; b.leftAt = G.time; b.leftDay = G.day; } if (b && b.claimedBy === c.id) b.claimedBy = null; r.birdId = null; }
  if (r.carry.length) { r.carry.forEach(backCase); r.carry = []; }
  if (r.pallet && r.pallet.empty) { G.empties.push({ id: r.pallet.id, x: r.x, y: r.y }); r.pallet = null; }
  if (r.pallet) {
    if (G.phase === 'night') G.trailer.unshift(r.pallet); else placePallet(r.pallet, freeRecvSpot(r));
    r.pallet = null;
  }
  r.plan = null; r.path = null; r.progress = 0; r.label = ''; r.intent = ''; r.onBreak = false;
}

function runPlan(c, r, dt) {
  if (r.hold > 0) { r.hold -= dt; r.label = 'Being coached'; r.progress = 0; return; }
  const s = r.plan[0];
  if (!s) return finishPlan(c, r);
  if (s.go) {
    if (!r.path) {
      const tiles = s.go();
      if (!tiles || !tiles.length) return finishPlan(c, r);
      const p = pathToTiles(r, tiles);
      if (!p) return finishPlan(c, r);
      setPath(r, p);
      if (s.track) { const t = s.track(); s._tgt = t ? { x: t.x, y: t.y } : null; }
    }
    if (s.track) {
      const t = s.track();
      if (!t) return finishPlan(c, r);
      if (s._tgt && dist(t, s._tgt) > 1.5) { r.path = null; return; }
    }
    if (moveAlong(r, dt, 3.0 * sf(c) * (r.floatId || r.pallet ? 0.8 : 1))) { r.path = null; r.plan.shift(); }
  } else if (s.wait != null) {
    s._t = (s._t || 0) + dt * sf(c);
    r.label = s.label; r.progress = s._t / s.wait;
    if (s._t >= s.wait) { r.progress = 0; r.plan.shift(); }
  } else if (s.do) {
    const res = s.do();
    r.plan.shift();
    if (res === false) return finishPlan(c, r);
    if (Array.isArray(res)) r.plan.unshift(...res);
  } else if (s.loop) {
    if (s.loop(dt)) r.plan.shift();
  }
}

function goEnt(getter) {
  return {
    go: () => {
      const e = getter(); if (!e) return null;
      const ex = Math.floor(e.x), ey = Math.floor(e.y);
      const ring = tilesAround(e, 1).filter(t => !(t.x === ex && t.y === ey));
      return ring.length ? ring : tilesAround(e, 1);
    },
    track: getter,
  };
}

function takeCases(p, dept, n) {
  const out = [];
  for (let i = p.cases.length - 1; i >= 0 && out.length < n; i--) if (p.cases[i].d === dept) out.push(p.cases.splice(i, 1)[0]);
  crushCheck(out, p, false);
  cardboard(out.length);
  if (!p.cases.length) removeEmptyPallets();
  return out;
}

function planBreakdown(c, r, only) {
  let best = null;
  for (const p of G.pallets) {
    const counts = {};
    for (const cs of p.cases) counts[cs.d] = (counts[cs.d] || 0) + 1;
    for (const dept in counts) {
      if (only && !only.includes(dept)) continue;
      const f = floatOf(dept);
      if (!f || (f.carriedBy && f.carriedBy !== 'player') || f.claimedBy) continue;
      const room = FLOAT_CAP - f.cases.length - f.incoming;
      if (room <= 0) continue;
      const score = counts[dept] + (DEPT[dept].cold ? 60 : 0) - dist(r, p) * 0.5 + rand(0, 3);
      if (!best || score > best.score) best = { p, dept, f, score, n: Math.min(CARRY_CAP, counts[dept], room) };
    }
  }
  if (!best) return null;
  const { p, dept, f, n } = best;
  let reserved = n;
  f.incoming += n;
  r.cleanups.push(() => { f.incoming = Math.max(0, f.incoming - reserved); reserved = 0; });
  r.intent = `Breaking down ${DEPT[dept].name}`;
  return [
    goEnt(() => (G.pallets.includes(p) ? p : null)),
    { wait: 0.9, label: 'Breaking down' },
    { do: () => { const taken = takeCases(p, dept, n); if (!taken.length) return false; r.carry = taken; return true; } },
    goEnt(() => f),
    { wait: f.crooked ? 1.0 : 0.4, label: f.crooked ? 'Building float (crooked, slow)' : 'Building float' },
    { do: () => {
      if ((f.claimedBy && f.claimedBy !== c.id) || dist(r, f) > 2.5) return false;
      if (r.carry.length && rollMistake(c, 'sort', 0.22)) {
        const others = G.floats.filter(o => o !== f && !o.carriedBy);
        if (others.length) { const cs = r.carry.pop(); cs.mis = true; pick(others).cases.push(cs); }
      }
      f.cases.push(...r.carry); r.carry = [];
      f.incoming = Math.max(0, f.incoming - reserved); reserved = 0;
      return true;
    } },
  ];
}

function planFreight(c, r, only, readyMin) {
  const cands = G.floats.filter(f => f.cases.length && !f.carriedBy && !f.claimedBy && !(f.incoming > 0) && (!only || only.includes(f.dept)) &&
    (f.cases.length >= readyMin || palletCases(f.dept) === 0 || f.cases.length >= FLOAT_CAP - 3 || G.time >= 660));
  if (!cands.length) return null;
  const score = f => f.cases.length + (DEPT[f.dept].cold ? 30 : 0);
  const f = cands.sort((a, b) => score(b) - score(a))[0];
  const dept = f.dept;
  f.claimedBy = c.id;
  r.cleanups.push(() => { if (f.claimedBy === c.id) f.claimedBy = null; });
  r.intent = `Pushing ${DEPT[dept].name} freight`;
  let t = 0;
  return [
    goEnt(() => f),
    { do: () => { if (f.carriedBy) return false; f.carriedBy = c.id; r.floatId = f.id; return true; } },
    { go: () => MAPD.access[dept] },
    { loop: dt => {
      r.label = 'Working freight';
      if (!f.cases.length || !canStock(dept)) { r.progress = 0; return true; }
      t += dt * sf(c); r.progress = t;
      if (t >= 1) {
        t = 0; const cs = f.cases.pop();
        if (cs.mis) { backCase(cs); floater(r.x, r.y - 1, 'Mis-sort! To backstock', '#ff9f6b'); } else stockCase(cs);
      }
      return false;
    } },
    { do: () => { if (rollMistake(c, 'stock', 0.12)) dropTrash(r); return true; } },
    { do: () => (f.cases.length ? [goEnt(() => birdOf(dept)), { wait: 1.2, label: 'Backstocking overflow' }, { do: () => { floatToBack(f); return true; } }] : true) },
    { go: () => tilesAround({ x: f.homeX, y: f.homeY }, 1).filter(tl => !(tl.x === Math.floor(f.homeX) && tl.y === Math.floor(f.homeY))) },
    { do: () => { f.carriedBy = null; r.floatId = null; f.x = f.homeX; f.y = f.homeY; f.claimedBy = null; knockFloat(f, c); return true; } },
  ];
}

function planReplen(c, r, only, threshold) {
  const cands = DEPTS.filter(d => (!only || only.includes(d.id)) && G.stock[d.id].back > 0 && shelfPct(d.id) < threshold && !RT.replenClaim[d.id]);
  if (!cands.length) return null;
  const d = cands.sort((a, b) => shelfPct(a.id) - shelfPct(b.id))[0], dept = d.id;
  RT.replenClaim[dept] = c.id;
  r.cleanups.push(() => { if (RT.replenClaim[dept] === c.id) delete RT.replenClaim[dept]; });
  r.intent = `Filling holes in ${d.name}`;
  let t = 0;
  return [
    goEnt(() => birdOf(dept)),
    { wait: 1.0, label: 'Pulling backstock' },
    { do: () => {
      const s = G.stock[dept];
      let u = Math.min(s.back, d.capU - s.shelf, d.upc * 4);
      if (u <= 0) return false;
      s.back -= u;
      while (u > 0) { const k = Math.min(d.upc, u); r.carry.push({ d: dept, item: 'Backstock', u: k }); u -= k; }
      return true;
    } },
    { go: () => MAPD.access[dept] },
    { loop: dt => {
      r.label = 'Filling holes';
      if (!r.carry.length) { r.progress = 0; return true; }
      t += dt * sf(c); r.progress = t / 0.8;
      if (t >= 0.8) { t = 0; const cs = r.carry.pop(); stockCase(cs); }
      return false;
    } },
    { do: () => { if (rollMistake(c, 'stock', 0.08)) dropTrash(r); return true; } },
  ];
}

function planDSD(c, r) {
  const v = G.vendorsToday.find(x => x.state === 'waiting' && !x.claimedBy && RT.vendorNpcs[x.name]);
  if (!v) return null;
  v.claimedBy = c.id;
  r.cleanups.push(() => { if (v.claimedBy === c.id) v.claimedBy = null; });
  r.intent = `Checking in ${v.name}`;
  return [
    goEnt(() => (v.state === 'waiting' ? RT.vendorNpcs[v.name] : null)),
    { wait: 2.5, label: 'Checking in vendor' },
    { do: () => {
      if (v.state !== 'waiting') return false;
      if (v.cases > 1 && rollMistake(c, 'dsd', 0.3)) { const short = Math.min(2, v.cases - 1); v.cases -= short; G.today.shrink += short * DEPT[v.dept].upc * DEPT[v.dept].price * 0.6; G.ohErr[v.dept] += short * DEPT[v.dept].upc; }
      checkInVendor(v, false); return true;
    } },
  ];
}

function planPrice(c, r) {
  const open = G.tags.filter(t => !t.claimedBy && tagReady(t));
  if (!open.length) return null;
  const tc = t => ({ x: t.x + 0.5, y: t.y + 0.5 });
  const tag = open.sort((a, b) => dist(r, tc(a)) - dist(r, tc(b)))[0];
  tag.claimedBy = c.id;
  r.cleanups.push(() => { if (tag.claimedBy === c.id) tag.claimedBy = null; });
  r.intent = tag.kind === 'error' ? 'Fixing a scan error' : 'Hanging price tags';
  return [
    { go: () => tilesAround(tc(tag), 1) },
    { wait: 2.2, label: tag.kind === 'error' ? 'Fixing scan error' : 'Hanging tag' },
    { do: () => {
      if (!G.tags.includes(tag)) return false;
      if (tag.kind !== 'error' && rollMistake(c, 'price', 0.25)) { tag.kind = 'error'; return true; }
      fixTag(tag, false); return true;
    } },
  ];
}

// Face an aisle: pull every item to the front edge until it's 99% faced.
function planFace(c, r, dept) {
  RT.faceClaim = RT.faceClaim || {};
  if (faceOf(dept) >= 97 || RT.faceClaim[dept] || coolerBlocked(dept)) return null;
  RT.faceClaim[dept] = c.id;
  r.cleanups.push(() => { if (RT.faceClaim[dept] === c.id) delete RT.faceClaim[dept]; });
  r.intent = `Facing ${DEPT[dept].aisle}`;
  return [
    { go: () => MAPD.access[dept] },
    { loop: dt => {
      r.label = 'Facing shelves';
      G.face[dept] = Math.min(100, G.face[dept] + 7 * dt * sf(c));
      r.progress = G.face[dept] / 100;
      if (G.face[dept] >= 99 || coolerBlocked(dept)) { r.progress = 0; return true; }
      return false;
    } },
  ];
}

function planUnload(c, r) {
  if (G.phase !== 'night' || !G.trailer.length) return null;
  const dock = pick(MAPD.dockTiles);
  r.intent = 'Unloading the trailer';
  return [
    { go: () => [dock] },
    { wait: 1.6, label: 'Jacking pallet' },
    { do: () => { const p = G.trailer.shift(); if (!p) return false; r.pallet = p; return true; } },
    { go: () => {
      const s = freeRecvSpot(r); if (!s) return null;
      s.reserved = c.id; r.spot = s;
      r.cleanups.push(() => { if (s.reserved === c.id) s.reserved = null; });
      return [s];
    } },
    { wait: 0.6, label: 'Dropping pallet' },
    { do: () => { r.spot.reserved = null; placePallet(r.pallet, r.spot); r.pallet = null; return true; } },
  ];
}

function planIdle(c, r) {
  const t = pick(MAPD.backroomTiles);
  r.intent = '';
  return [{ go: () => [t] }, { wait: rand(2, 4), label: '' }];
}

function brain(c, r) {
  const role = ROLES[c.role];
  switch (c.role) {
    case 'breakdown': return (backroomUrgent() ? planBackroom(c, r) : null) || planBreakdown(c, r) || planDamages(c, r) || planBackroom(c, r) || planFreight(c, r, null, 30) || planReplen(c, r, null, 0.5);
    case 'freight': return planFreight(c, r, null, 20) || planBirdRunToday(c, r) || planReplen(c, r, null, 0.6) || planBreakdown(c, r);
    case 'replen': return planEndcapSwitch(c, r) || planBirdRunToday(c, r) || planEndcapFill(c, r) || planReplen(c, r, null, 0.75) || planFreight(c, r, null, 25);
    case 'dsd': return planDSD(c, r) || planReplen(c, r, null, 0.6);
    case 'price': return planRecall(c, r) || planPrice(c, r) || planOutTag(c, r) || planCount(c, r) || planReclaim(c, r) || planReplen(c, r, null, 0.5);
    case 'unloader': return planUnload(c, r) || (backroomUrgent() ? planBackroom(c, r) : null) || planBreakdown(c, r) || planDamages(c, r) || planBackroom(c, r) || planFreight(c, r, null, 20);
    default: {
      const D = [role.dept];
      return planRecall(c, r, D) || (G.time >= 300 ? planReset(c, r, D) : null) || (G.time >= 1080 ? planEndcapSwitch(c, r) : null) || planReplen(c, r, D, 0.85) || planFreight(c, r, D, 6) || planBreakdown(c, r, D) || planCount(c, r, D) ||
        (backCases(role.dept) >= 3 && shelfPct(role.dept) < 0.95 ? planBirdRun(c, r, role.dept) : null) || planFace(c, r, role.dept);
    }
  }
}

function updateCrew(dt, gm) {
  for (const c of G.crew) {
    const r = rt(c), on = onShift(c);
    ensureTrain(c); trainingTick(c);
    if (on && !r.onBreak) { const pay = c.wage * otRate(c, gm) * gm / 60; if (G.phase === 'night') G.nightLabor += pay; else G.today.labor += pay; }
    if (!r.inBuilding) {
      if (r.plan) finishPlan(c, r);
      if (on) { r.inBuilding = true; r.x = MAPD.staffDoor.x + 0.5; r.y = MAPD.staffDoor.y + 0.5; }
      continue;
    }
    if (r.plan && on && !r.onBreak && !(r.hold > 0) && r.intent !== 'Going on lunch break' && coverNeeded(c)) finishPlan(c, r);
    const shf = SHIFTS[curShift(c)], slen = shf ? shf.end - shf.start : 0;
    if (on && !r.plan && slen > 360 && c.breakDay !== G.day && G.phase === 'day' && G.time >= shf.start + slen / 2 - 30) {
      c.breakDay = G.day; r.intent = 'Going on lunch break';
      r.plan = [{ go: () => tilesAround({ x: 36.5, y: 7.5 }, 1) }, { loop: () => {
        if (!r.onBreak) { r.onBreak = true; r.breakEnd = G.time + BREAK_MIN; r.intent = 'On lunch break (unpaid)'; }
        r.label = 'On break';
        if (G.time >= r.breakEnd) { r.onBreak = false; return true; }
        return false;
      } }];
    }
    if (!r.plan) {
      if (!on) { r.intent = 'Clocking out'; r.plan = [{ go: () => [MAPD.staffDoor] }, { do: () => { r.inBuilding = false; return true; } }]; }
      else if (G.phase === 'day' && rollMistake(c, 'focus', 0.025)) { r.plan = [{ wait: 6, label: 'On their phone' }]; r.intent = 'On their phone 📱'; }
      else r.plan = orderPlan(c, r) || coverPlan(c, r) || recoveryPlan(c, r) || ((G.trash || []).length >= 3 ? planTrash(c, r) : null) || brain(c, r) || helpPlan(c, r) || planTrash(c, r) || planIdle(c, r);
    }
    runPlan(c, r, dt);
    if (r.floatId) { const f = floatById(r.floatId); if (f) { f.x = r.x + r.fx * 0.6; f.y = r.y + r.fy * 0.6; } }
    if (r.birdId) { const b = G.birds[r.birdId]; if (b && b.carriedBy === c.id) { b.x = r.x + r.fx * 0.6; b.y = r.y + r.fy * 0.6; } }
  }
}
