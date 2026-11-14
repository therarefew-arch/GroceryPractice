'use strict';
// =====================================================================
//  Training & coaching.
//  Crew make realistic mistakes; how often depends on their training in
//  that area. A red "!" means they need coaching: walk up and press E.
//  Coached, long-tenured crew grow into Superstars (faster, no mistakes,
//  and they mentor rookies on their shift).
// =====================================================================
const TRAIN_AREAS = {
  sort: { name: 'Sorting', mistake: 'Put a case on the wrong float',
    tip: 'Read the item and its aisle on every case before it goes on a float.' },
  stock: { name: 'Clean aisles', mistake: 'Left cardboard in the aisle',
    tip: 'Break down empty boxes and take them to the back. Never leave them on the floor.' },
  price: { name: 'Price integrity', mistake: 'Hung a tag on the wrong item',
    tip: 'Match the UPC on the tag to the item, not just the description.' },
  dsd: { name: 'DSD receiving', mistake: 'Signed for a short delivery',
    tip: 'Count every case against the invoice before you sign.' },
  count: { name: 'Counting', mistake: 'Miscounted a cycle count',
    tip: 'Count every facing all the way to the back, then the backstock. If the number looks wrong, count it again before you post it.' },
  focus: { name: 'Focus', mistake: 'Took a phone break on the clock',
    tip: 'Phones stay in the breakroom. Breaks are on the schedule.' },
};
const COACH_WINDOW = 120; // game minutes before a coaching moment is lost
const RANKS = [
  { key: 'star', name: 'Superstar', color: '#ffd34d', icon: '★' },
  { key: 'pro', name: 'Pro', color: '#57f287', icon: '◆' },
  { key: 'trained', name: 'Trained', color: '#42d7ff', icon: '●' },
  { key: 'rookie', name: 'Rookie', color: '#ff9f6b', icon: '○' },
];

function ensureTrain(c, base) {
  if (!c.train) {
    const b = base != null ? base : 30;
    c.train = {};
    for (const k in TRAIN_AREAS) c.train[k] = clamp(Math.round(b + rand(-4, 4)), 0, 100);
  }
  // a training area added after they were hired starts near their average
  const known = Object.values(c.train).filter(v => v != null), avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 30;
  for (const k in TRAIN_AREAS) if (c.train[k] == null) c.train[k] = clamp(Math.round(avg - 5), 0, 100);
  if (c.coached == null) c.coached = 0;
  if (c.days == null) c.days = 0;
  if (c.mistakes == null) c.mistakes = 0;
  return c;
}
// New hires: a little know-how from past jobs (more skill, more experience).
function hireTrainingBase(skill) { return Math.round((skill - 1) * 5 + rand(0, 6)); }

function trainAvg(c) { ensureTrain(c); const v = Object.values(c.train); return v.reduce((a, b) => a + b, 0) / v.length; }
function crewRank(c) {
  const a = trainAvg(c);
  if (a >= 85 && c.coached >= 8 && c.days >= 3) return RANKS[0];
  if (a >= 65) return RANKS[1];
  if (a >= 35) return RANKS[2];
  return RANKS[3];
}
const isStar = c => crewRank(c).key === 'star';

// Roll for a mistake in `area`. Returns true if the worker messed up.
function rollMistake(c, area, base) {
  ensureTrain(c);
  if (isStar(c)) return false;
  const p = base * huddleMistakeMult(area) * stdMistakeMult(c, area) * (1 - c.train[area] / 100);
  if (Math.random() >= p) return false;
  c.mistakes++;
  if (G.today) G.today.crewMistakes = (G.today.crewMistakes || 0) + 1;
  const first = !c.needsCoach;
  c.needsCoach = { area, at: G.time, day: G.day };
  discMistake(c, area);
  const r = RT.crew[c.id];
  if (r) floater(r.x, r.y - 1.2, '!', '#ff5a4e');
  if (first) toast(`⚠ ${c.name}: ${TRAIN_AREAS[area].mistake}. Walk over and press E to coach.`, 'warn');
  return true;
}

// Called every crew update tick: lost coaching moments turn into habits.
function trainingTick(c) {
  const n = c.needsCoach;
  if (!n) return;
  const age = (G.day - n.day) * 1440 + (G.time - n.at);
  if (age > COACH_WINDOW) {
    c.needsCoach = null;
    c.train[n.area] = Math.max(0, c.train[n.area] - 3);
    toast(`Missed a coaching moment with ${c.name}. Uncoached mistakes become habits.`, 'bad');
  }
}

function crewNear(p, r) {
  let best = null, bd = r;
  for (const c of G.crew) {
    const rr = RT.crew[c.id];
    if (!rr || !rr.inBuilding) continue;
    const d = dist(rr, p);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function coachCrew(c) {
  const n = c.needsCoach;
  if (!n) return;
  const before = crewRank(c), area = TRAIN_AREAS[n.area];
  const gain = 22;
  c.train[n.area] = Math.min(100, c.train[n.area] + gain);
  for (const k in c.train) if (k !== n.area) c.train[k] = Math.min(100, c.train[k] + 3);
  c.coached++;
  c.needsCoach = null;
  if (G.today) G.today.coached = (G.today.coached || 0) + 1;
  const r = RT.crew[c.id];
  if (r) floater(r.x, r.y - 1.3, `+${gain} ${area.name}`, '#57f287');
  addXP(10, G.player);
  toast(`🎓 Coached ${c.name}: "${area.tip}"`, 'good');
  const after = crewRank(c);
  if (after !== before) {
    if (after.key === 'star') {
      toast(`🌟 ${c.name} is now a SUPERSTAR! Faster, no mistakes, and mentors rookies on their shift.`, 'gold');
      if (r) confetti(r.x, r.y, 80);
      mail('District Manager', `${c.name} is a superstar`, `Great coaching. ${c.name} has been coached ${c.coached} times over ${c.days} days and now runs at the top of the crew.\nSuperstars work 15% faster, don't make mistakes, and help train rookies on their shift.`);
    } else if (RANKS.indexOf(after) < RANKS.indexOf(before)) toast(`${c.name} moved up to ${after.name}.`, 'good');
  }
}

// Hourly: superstars mentor the least-trained area of rookies on their shift.
function mentorHour() {
  const stars = G.crew.filter(c => isStar(c) && onShift(c));
  if (!stars.length) return;
  for (const c of G.crew) {
    if (isStar(c) || !onShift(c)) continue;
    const low = Object.entries(c.train).sort((a, b) => a[1] - b[1])[0][0];
    c.train[low] = Math.min(100, c.train[low] + 1.5 * stars.length);
  }
}

// End of day: everyone who worked gains tenure and a little experience.
function tenureDay() {
  for (const c of G.crew) {
    ensureTrain(c);
    if (c.calledOut) continue;
    c.days++;
    for (const k in c.train) c.train[k] = Math.min(100, c.train[k] + 1);
  }
}

// ---- Trash (cardboard left in aisles) ------------------------------------
function dropTrash(r) {
  G.trash = G.trash || [];
  if (G.trash.length > 12) return;
  G.trash.push({ id: nid(), x: r.x + rand(-0.2, 0.2), y: r.y + rand(-0.2, 0.2) });
}
function trashHour() {
  if (!G.trash || !G.trash.length || G.time < OPEN) return;
  G.sat = Math.max(0, G.sat - Math.min(2, 0.25 * G.trash.length));
}
function pickUpTrash(tr) {
  G.trash = G.trash.filter(t => t !== tr);
  addXP(2, G.player);
  SFX.drop();
}
function drawTrash() {
  for (const t of (G.trash || [])) {
    const x = Math.round(t.x * T - 7), y = Math.round(t.y * T - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 2, y + 2, 14, 9);
    ctx.fillStyle = '#b8874f'; ctx.fillRect(x, y, 14, 9);
    ctx.fillStyle = '#d9a86a'; ctx.fillRect(x, y, 14, 2);
    ctx.fillStyle = '#7a5530'; ctx.fillRect(x + 6, y, 2, 9);
  }
}

// ---- Office computer helpers ----------------------------------------------
function rankHTML(c) { const r = crewRank(c); return `<span style="color:${r.color}">${r.icon} ${r.name}</span>`; }
function trainMeter(c) {
  const a = trainAvg(c), col = a >= 85 ? '#ffd34d' : a >= 50 ? '#57f287' : '#ff9f6b';
  const tip = Object.entries(TRAIN_AREAS).map(([k, v]) => `${v.name}: ${Math.round(c.train[k])}%`).join('\n');
  return `<div class="row" title="${tip}"><div class="meter"><div style="width:${a}%;background:${col};color:${col}"></div></div><span>${Math.round(a)}%</span></div>`;
}

// "!" bubble above a worker who needs coaching.
function drawCoachBubble(r, top) {
  const a = 0.6 + 0.4 * Math.sin(performance.now() / 160);
  const x = Math.round(r.x * T), y = Math.round(top - 26);
  ctx.save(); ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 10 * a;
  ctx.fillStyle = '#ff3b30'; ctx.fillRect(x - 6, y - 7, 12, 13); ctx.fillRect(x - 2, y + 6, 4, 3);
  ctx.restore();
  label(ctx, '!', x, y, { font: PX(10), color: '#fff' });
}
