'use strict';
// =====================================================================
//  The district manager's store walk.
//  Every couple of weeks the DM emails that they're coming (sometimes
//  just that morning: "I'm in the area"). They wait at the front of the
//  store for you, then walk it: entrance and floors, in-stock, facing,
//  price tags, endcaps, out-of-stock tags, go-backs and damages, and the
//  backroom. Every miss becomes a follow-up item with a deadline, and the
//  DM checks back. Walk with them: a DM who walks your store alone
//  notices you weren't there.
// =====================================================================
const DM_WAIT = 15;                   // minutes the DM waits at the front
const DM_SPOT = { x: 20, y: 22 };     // just inside the front door
const DM_ROUTE = [{ x: 20, y: 21 }, { x: 3, y: 21 }, { x: 3, y: 11 }, { x: 37, y: 11 }, { x: 19, y: 11 }, { x: 20, y: 7 }, { x: 31, y: 8 }, { x: 12, y: 8 }, { x: 19, y: 11 }, { x: 19, y: 23 }];
const DM_FIX_BY = 2;                  // follow-ups due this many days later, by noon
const DM_FIX_TIME = 720;
function ensureDm() { G.dm = G.dm || { next: 9 + randi(0, 3), walks: [] }; }
const dmToday = () => (G.dm && G.dm.walks.find(w => w.day === G.day)) || null;
const dmLast = () => (G.dm && G.dm.walks.length ? G.dm.walks[G.dm.walks.length - 1] : null);

// What the DM looks at. Each check returns null (fine) or what they saw.
const DM_CHECKS = [
  { key: 'front', name: 'Entrance and floors', fix: 'Floors clean, trash and cardboard picked up, mat out on wet days.',
    see: () => { const tr = (G.trash || []).length, wet = wxWet() && !G.today.matOut, sp = (G.spills || []).length; return tr || wet || sp ? [tr && plural(tr, 'piece') + ' of trash on the floor', sp && plural(sp, 'spill'), wet && 'no mat at the wet entrance'].filter(Boolean).join(', ') : null; } },
  { key: 'instock', name: 'In-stock', fix: 'Every department 60%+ on the shelf.',
    see: () => { const low = DEPTS.filter(d => shelfPct(d.id) < 0.6); return low.length ? `Low shelves: ${low.map(d => `${d.name} ${Math.round(shelfPct(d.id) * 100)}%`).join(', ')}` : null; } },
  { key: 'facing', name: 'Facing', fix: `Every aisle faced ${FACE_GOOD}%+.`,
    see: () => { const m = DEPTS.filter(d => faceOf(d.id) < FACE_GOOD); return m.length ? `Messy: ${m.map(d => `${d.aisle} ${Math.round(faceOf(d.id))}%`).join(', ')}` : null; } },
  { key: 'tags', name: 'Price tags', fix: 'No scan errors, and price changes hung the day they come.',
    see: () => { const e = G.tags.filter(t => t.kind === 'error').length, c = G.tags.filter(t => t.kind === 'change').length; return e || c > 3 ? [e && plural(e, 'scan error'), c > 3 && `${c} price changes not hung`].filter(Boolean).join(', ') : null; } },
  { key: 'endcaps', name: 'Endcaps and the ad', fix: 'Ad product on 2 endcaps each, and every endcap at least half full.',
    see: () => { const low = MAPD.endcaps.filter(e => G.endcaps[e.id] && (ecStockOf(e.id) <= 0 || ecLow(e))).length, ad = G.ad ? G.ad.depts.filter(d => endcapCount(d) < 2) : []; return low || ad.length ? [low && plural(low, 'endcap') + ' empty or low', ad.length && `the ad (${ad.map(d => DEPT[d].name).join(', ')}) isn't on 2 endcaps`].filter(Boolean).join(', ') : null; } },
  { key: 'outs', name: 'Out-of-stock tags', fix: 'Every warehouse-out hole tagged, old tags pulled.',
    see: () => { const n = outTagJobs().length; return n ? plural(n, 'hole') + ' without the right tag' : null; } },
  { key: 'gobacks', name: 'Go-backs and damages', fix: 'Go-backs worked, damages in reclaim, reclaim scanned out.',
    see: () => { const g = (G.gobacks || []).length, d = floorDamages().length + binToScan().length; return g > 4 || d ? [g > 4 && `${g} go-backs waiting`, d && plural(d, 'damaged item') + ' not processed'].filter(Boolean).join(', ') : null; } },
  { key: 'backroom', name: 'Backroom', fix: 'No birds on the floor, empties stacked, floats straight, swept.',
    see: () => { const b = backroomCheck(); const s = [b.birds.length && `birds out in ${b.birds.map(d => DEPT[d].aisle).join(', ')}`, b.empties > 3 && `${b.empties} empty pallets`, b.crooked > 2 && `${b.crooked} crooked floats`, b.dirt > 40 && 'it needs sweeping'].filter(Boolean); return s.length ? s.join(', ') : null; } },
];
const dmCheck = k => DM_CHECKS.find(c => c.key === k);

// ---- days ----
function dmStartDay() {
  ensureDm();
  const t = G.today;
  // follow-ups the DM is checking today get the checklist (TASK_CHECK.dmfix)
  // schedule the next walk: announced 2 days ahead, or a same-day drop-in
  if (G.day >= G.dm.next - 2 && !G.dm.walks.some(w => w.day >= G.day)) {
    const surprise = Math.random() < 0.25, day = surprise ? G.day : G.day + 2, sk = mgrShift(day);
    if (sk) {
      const s = SHIFTS[sk], lo = Math.max(s.start + 60, 9 * 60), hi = Math.min(s.end - 120, 14 * 60);
      if (hi > lo) {
        const time = Math.round((lo + Math.random() * (hi - lo)) / 30) * 30;
        G.dm.walks.push({ id: nid(), day, time, state: 'set', surprise });
        mail('District Manager', surprise ? `I'm in the area: stopping by at ${fmtTime(time)}` : `Store walk ${dowOf(day)} at ${fmtTime(time)}`, surprise
          ? `I'm in your area today and I'll stop by around ${fmtTime(time)} to walk the store. Meet me at the front.`
          : `I'll be in ${dowOf(day)} ${fmtMD(day)} around ${fmtTime(time)} to walk the store with you. Meet me at the front.\nI'll look at the entrance and floors, in-stock, facing, price tags, endcaps and the ad, out-of-stock tags, go-backs and damages, and the backroom.`);
        G.dm.next = day + 10 + randi(0, 6);
      }
    } else G.dm.next = G.day + 3; // you're off that day: try again soon
  }
}
// The DM shows up and waits at the front; then walks (with you or without you).
function updateDm(dt) {
  const w = dmToday(); if (!w) return;
  if (w.state === 'set' && G.time >= w.time && G.time < CLOSE - 90) {
    w.state = 'waiting'; w.arrived = G.time;
    toast('👔 The district manager is at the front of the store.', 'warn');
  }
  let n = RT.dmNpc;
  if ((w.state === 'waiting' || w.state === 'walking') && !n) {
    n = RT.dmNpc = { x: MAPD.frontDoor[1].x + 0.5, y: MAPD.frontDoor[1].y - 0.5, fx: 0, fy: -1, path: null, leg: 0, w };
    if (w.state === 'waiting') setPath(n, pathToTiles(n, [DM_SPOT]) || []);
  }
  if (w.state === 'waiting' && G.time - w.arrived > DM_WAIT) dmWalk(false);
  if (!n) return;
  if (n.path) { if (moveAlong(n, dt, 2.2)) n.path = null; return; }
  if (w.state === 'walking') {
    if (n.leg >= DM_ROUTE.length) { RT.dmNpc = null; w.state = 'done'; return; }
    setPath(n, pathToTiles(n, [DM_ROUTE[n.leg++]]) || []);
  }
}
// Grade the store as it stands now.
function dmWalk(withYou) {
  const w = dmToday(); if (!w || w.state !== 'waiting') return null;
  w.state = 'walking'; w.with = withYou; w.at = G.time;
  w.items = DM_CHECKS.map(c => ({ key: c.key, saw: c.see() }));
  const pass = w.items.filter(i => !i.saw).length;
  w.score = Math.max(0, Math.round(pass / DM_CHECKS.length * 100) - (withYou ? 0 : 10));
  w.fixes = w.items.filter(i => i.saw).map(i => ({ key: i.key, due: G.day + DM_FIX_BY, done: null }));
  G.today.dmScore = w.score; G.today.dmAlone = withYou ? 0 : 1;
  addXP(Math.max(0, Math.round(w.score / 4)) + (withYou ? 5 : 0), G.player);
  const body = `${withYou ? 'Thanks for walking the store with me.' : 'I waited at the front but couldn\'t find you, so I walked the store on my own. Next time, meet me: I want to hear your plan, not just see the store.'}\nScore: ${w.score}%.\n\n` +
    w.items.map(i => `${i.saw ? '✗' : '✓'} ${dmCheck(i.key).name}${i.saw ? `: ${i.saw}` : ''}`).join('\n') +
    (w.fixes.length ? `\n\nFollow-ups, fixed by noon ${dowOf(G.day + DM_FIX_BY)} ${fmtMD(G.day + DM_FIX_BY)}. I'll check:\n` + w.fixes.map(f => `• ${dmCheck(f.key).name}: ${dmCheck(f.key).fix}`).join('\n') : '\n\nNo follow-ups. Great job, keep it this way.');
  mail('District Manager', `Store walk: ${w.score}%`, body);
  if (!withYou) toast('The district manager walked the store without you.', 'bad');
  return w;
}
// Noon on the due day: the DM checks the follow-ups.
function dmHour(h) {
  if (h * 60 !== DM_FIX_TIME) return;
  for (const w of (G.dm ? G.dm.walks : [])) {
    const due = (w.fixes || []).filter(f => f.due === G.day && f.done == null);
    if (!due.length) continue;
    due.forEach(f => { f.done = !dmCheck(f.key).see(); });
    const miss = due.filter(f => !f.done);
    G.today.dmFixMissed = (G.today.dmFixMissed || 0) + miss.length; G.today.dmFixDone = (G.today.dmFixDone || 0) + due.length - miss.length;
    if (!miss.length) { addXP(15, G.player); mail('District Manager', 'Follow-ups done', 'I checked the follow-ups from my walk: all fixed. That\'s what I like to see.'); }
    else { G.sat = Math.max(0, G.sat - Math.min(4, miss.length)); mail('District Manager', 'Follow-ups not done', `I checked the follow-ups from my walk. Still not fixed:\n${miss.map(f => `• ${dmCheck(f.key).name}: ${dmCheck(f.key).see()}`).join('\n')}\nWhen I give you a follow-up, it gets done by the date. If you can't, call me before the deadline, not after.`); }
  }
}

// ---- you ----
function dmInteraction(p) {
  const w = dmToday(), n = RT.dmNpc;
  if (!w || w.state !== 'waiting' || !n || dist(n, p) > 2) return null;
  return { label: '👔 Walk the store with the district manager', at: n, fn: () => UI.dmWalk() };
}
function dmResultHTML(w) {
  return `<h2>👔 Store walk: ${w.score}%</h2><p class="mute">The district manager walked the store with you. Every miss is a follow-up, due by noon ${dowOf(G.day + DM_FIX_BY)}.</p><table>` +
    w.items.map(i => `<tr><td>${i.saw ? '<span class="bad">✗</span>' : '<span class="good">✓</span>'} <b>${dmCheck(i.key).name}</b></td><td>${i.saw ? esc(i.saw) + `<div class="mute">Fix: ${esc(dmCheck(i.key).fix)}</div>` : '<span class="mute">Looks good</span>'}</td></tr>`).join('') +
    `</table><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="primary" onclick="UI.hideModal()">Back to work</button></div>`;
}

// ---- drawing ----
function drawDm() {
  const n = RT.dmNpc; if (!n) return;
  const top = pixelPerson(n, '#20242c', { seed: 77 });
  nameplate(ctx, 'DM', n.x * T, top - 16, { font: PX(8), h: 12, edge: '#ffd34d' });
  if (n.w.state === 'waiting') {
    const left = 1 - (G.time - n.w.arrived) / DM_WAIT, bx = Math.round(n.x * T - 14), by = Math.round(top - 7);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, 30, 6);
    ctx.fillStyle = left > 0.5 ? '#ffd34d' : left > 0.25 ? '#f0b429' : '#e5534b'; ctx.fillRect(bx, by, 28 * clamp(left, 0, 1), 4);
  }
}

// ---- checklist & reports ----
function dmTasks(add) {
  const w = dmToday();
  if (w && w.state !== 'done' && w.state !== 'walking') add('dm-' + w.id, 'dmwalk', `District manager store walk (${fmtTime(w.time)})`, 'Meet the DM at the front (E). Get the store right before they come', w.time + DM_WAIT, 'by', { id: w.id });
  for (const x of (G.dm ? G.dm.walks : [])) for (const f of (x.fixes || []).filter(f => f.due === G.day && f.done == null))
    add('dmfix-' + x.id + f.key, 'dmfix', `DM follow-up: ${dmCheck(f.key).name}`, dmCheck(f.key).fix, DM_FIX_TIME, 'at', { key: f.key });
}
function dmTips() {
  const t = G.today, tips = [];
  if (t.dmAlone) tips.push('The district manager walked the store without you. When the DM is coming, be at the front at that time.');
  if (t.dmFixMissed) tips.push(`${plural(t.dmFixMissed, 'DM follow-up')} wasn't fixed by the deadline.`);
  return tips;
}
function dmDayExtras() {
  const t = G.today;
  return { dmScore: t.dmScore != null ? t.dmScore : null, dmAlone: t.dmAlone || 0, dmFixDone: t.dmFixDone || 0, dmFixMissed: t.dmFixMissed || 0 };
}
function dmReviewNotes(days, note, praise) {
  const s = k => sum(days.map(d => d[k] || 0)), walk = days.find(d => d.dmScore != null);
  if (s('dmFixMissed')) note('District manager', `${plural(s('dmFixMissed'), 'follow-up')} from the DM's store walk wasn't done by the deadline.`,
    'A DM follow-up is a promise. Missing one tells your boss the store can\'t be counted on.',
    'Put each follow-up on the huddle and assign it. If you can\'t make the date, call the DM before the deadline.');
  if (s('dmAlone')) note('District manager', 'The DM walked your store without you.',
    'The walk is your time to explain your plan and ask for help. Without you, all they see is the problems.',
    'Visits are emailed ahead (sometimes the same morning) and show on the checklist. Be at the front at that time.');
  if (walk && walk.dmScore >= 85 && !s('dmAlone')) praise.push(`The DM's store walk scored ${walk.dmScore}%.`);
  else if (walk && walk.dmScore < 60) note('District manager', `The DM's store walk scored ${walk.dmScore}%.`,
    'The DM sees the store the way customers do, on a normal day.',
    'The store should be walk-ready every day by mid-morning, not just when the DM is coming.');
}
