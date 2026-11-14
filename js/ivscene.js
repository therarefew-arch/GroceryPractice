'use strict';
// =====================================================================
//  Interview scene.
//  An interview pauses the game and opens a sit-down scene in the office:
//  the applicant across the desk (drawn in the store's pixel style), a
//  dialogue box, and your questions as buttons. Watch their face and body
//  language: excited, nervous, lying, positive, negative. A résumé that
//  oversells shows on their face when you ask about their last job.
// =====================================================================
const IVS_W = 192, IVS_H = 108;
const IVS_SHIRTS = ['#3b5b8c', '#8c3b3b', '#3b7d5b', '#6b4a8c', '#8c7a3b', '#2f3f4f', '#a05a2c', '#3a7f86'];
const IVS_MOODS = {
  neutral: { name: 'Calm', color: '#9fc8e6', body: ['Waits for your question.', 'Sits with hands folded on the desk.'] },
  excited: { name: 'Excited', color: '#ffd34d', body: ['Leans forward, eyes bright.', 'Talks fast and can\'t stop smiling.', 'Practically bouncing in the chair.'] },
  nervous: { name: 'Nervous', color: '#c9a7ff', body: ['Fidgets with their hands.', 'Voice wavers a little.', 'Swallows hard before answering.'] },
  lying: { name: 'Something\'s off', color: '#ff9f43', body: ['Glances away right before answering.', 'The smile doesn\'t reach the eyes.', 'Answers a little too fast, then rubs their neck.'] },
  positive: { name: 'Confident', color: '#57f287', body: ['Steady eye contact, relaxed shoulders.', 'Nods and sits up straight.', 'Answers easily, like it\'s nothing.'] },
  negative: { name: 'Defensive', color: '#ff5a4e', body: ['Arms crossed, jaw tight.', 'Rolls their eyes a little.', 'Leans back and frowns.'] },
  upset: { name: 'Uncomfortable', color: '#ff5a4e', body: ['Goes stiff and quiet.', 'Looks at the door.'] },
};

// How the applicant looks while giving each answer (the "tell").
function ivMood(k, key) {
  const Q = IV_Q[key];
  if (!Q || Q.illegal) return 'upset';
  switch (key) {
    case 'lastJob':
      if (k.claim > k.skill && k.years > 0) return 'lying';      // the résumé oversold it
      if (k.years === 0) return k.trait === 'social' ? 'excited' : 'nervous';
      return k.skill >= 4 ? 'excited' : k.skill === 3 ? 'positive' : 'nervous';
    case 'leave': return k.rel === 'poor' ? 'negative' : k.rel === 'good' ? 'positive' : 'neutral';
    case 'avail': return k.lied ? 'nervous' : 'positive';
    case 'conflict': return { easygoing: 'positive', hothead: 'negative', perfectionist: 'neutral', social: 'excited', quiet: 'nervous' }[k.trait] || 'neutral';
    case 'customer': return k.skill >= 3 && k.trait !== 'hothead' ? 'positive' : k.trait === 'hothead' ? 'negative' : 'nervous';
  }
  return 'neutral';
}
function ivGreetMood(k) { return { social: 'excited', quiet: 'nervous', hothead: 'neutral' }[k.trait] || 'positive'; }

const IVS = { id: null, raf: 0, t0: 0, mood: 'neutral', text: '', shown: 0, asked: '', body: '', talkUntil: 0, gone: false, lastTs: 0 };

function ivsLook(k) {
  const s = hash(k.name);
  return { skin: SKIN[s % SKIN.length], hair: HAIR[(s >> 2) % HAIR.length], style: (s >> 5) % 5, shirt: IVS_SHIRTS[(s >> 8) % IVS_SHIRTS.length], seed: s };
}

// ---- open / close ----
function ivsOpen(id) {
  const k = (G.candidates || []).find(x => x.id === id); if (!k || !k.iv) return;
  IVS.id = id; IVS.gone = !!k.withdrew; IVS.goneAt = 0; IVS.prevModal = RT.modal; RT.modal = true; RT.keys = {};
  let el = $('ivscene');
  if (!el) { el = document.createElement('div'); el.id = 'ivscene'; document.body.appendChild(el); }
  el.classList.remove('hidden');
  const last = k.iv.qs[k.iv.qs.length - 1];
  if (!last) ivsSay(k, `Hi, I'm ${k.name}. Thanks for having me in. I applied for ${ROLES[k.role].name}.`, ivGreetMood(k), '');
  else ivsSay(k, last.a, last.bad ? 'upset' : ivMood(k, last.key), last.q, true);
  ivsBuild(); ivsDraw(performance.now());
  cancelAnimationFrame(IVS.raf); IVS.t0 = performance.now(); IVS.raf = requestAnimationFrame(ivsTick);
}
function ivsClose() {
  cancelAnimationFrame(IVS.raf); IVS.raf = 0;
  const el = $('ivscene'); if (el) el.classList.add('hidden');
  RT.modal = !!IVS.prevModal; IVS.id = null;
  UI.render();
}
function ivsSay(k, text, mood, asked, instant) {
  IVS.text = text; IVS.mood = mood; IVS.asked = asked || '';
  IVS.body = pick(IVS_MOODS[mood].body);
  IVS.shown = instant ? text.length : 0;
  IVS.talkUntil = instant ? 0 : performance.now() + text.length * 28;
}

// ---- the HTML around the canvas ----
function ivsBuild() {
  const k = G.candidates.find(x => x.id === IVS.id); if (!k) return ivsClose();
  const left = IV_QUESTIONS - k.iv.qs.length, full = G.crew.length >= maxCrew();
  const M = IVS_MOODS[IVS.mood];
  let choices;
  if (k.withdrew) choices = `<button class="primary" onclick="ivsClose()">Back to Hiring</button>`;
  else if (k.iv.done) choices = `<button class="primary" ${full ? 'disabled title="All crew slots are full"' : ''} onclick="ivsHire()">Hire · $${k.wage.toFixed(2)}/hr</button><button onclick="ivsClose()">Thank them and finish</button>`;
  else choices = IV_ORDER.filter(q => !k.iv.qs.some(x => x.key === q)).map(q => `<button onclick="ivsAsk('${q}')">${esc(IV_Q[q].q)}</button>`).join('');
  $('ivscene').innerHTML = `<div class="ivs-card">
    <div class="ivs-top"><span>🗣 Interview · ${esc(ROLES[k.role].name)} · wants ${esc(SHIFTS[k.shift].name)}</span><span>${k.iv.done || k.withdrew ? 'Interview over' : `Questions left: <b>${left}</b>`}</span><button class="ivs-x" onclick="ivsClose()" title="Step out (you can come back)">✕</button></div>
    <div class="ivs-stage"><canvas id="ivs-cv"></canvas></div>
    <div class="ivs-box" onclick="IVS.shown = IVS.text.length">
      <div class="ivs-name">${esc(k.name)}</div><div class="ivs-mood" style="color:${M.color};border-color:${M.color}">${esc(M.name)}</div>
      ${IVS.asked ? `<div class="ivs-asked">You: ${esc(IVS.asked)}</div>` : ''}
      <div class="ivs-text" id="ivs-text"></div>
      <div class="ivs-body" style="color:${M.color}">» ${esc(IVS.body)}</div>
    </div>
    <div class="ivs-choices">${choices}</div>
    ${!k.iv.done && !k.withdrew ? '<div class="ivs-hint">Keep it about the job. Watch how they answer, not just what they say.</div>' : ''}
  </div>`;
  ivsText();
}
function ivsText() {
  const el = $('ivs-text'); if (!el) return;
  el.textContent = IVS.text.slice(0, Math.floor(IVS.shown));
}
function ivsAsk(key) {
  const k = G.candidates.find(x => x.id === IVS.id); if (!k || k.iv.done) return;
  askQuestion(k.id, key);
  const last = k.iv.qs[k.iv.qs.length - 1];
  if (k.withdrew) {
    // they answered uncomfortably, then left
    const ans = k.iv.qs[k.iv.qs.length - 2];
    ivsSay(k, `${ans ? ans.a + ' ' : ''}...I think I'm going to go. Thanks for your time.`, 'upset', ans ? ans.q : '');
    IVS.gone = true; IVS.goneAt = performance.now() + IVS.text.length * 28 + 600;
  } else ivsSay(k, last.a, last.bad ? 'upset' : ivMood(k, key), last.q);
  ivsBuild(); ivsDraw(performance.now()); save();
}
function ivsHire() { const id = IVS.id; ivsClose(); UI.hire(id); }

// ---- the pixel scene ----
function ivsTick(now) {
  IVS.raf = requestAnimationFrame(ivsTick);
  const dt = IVS.lastTs ? Math.min(0.05, (now - IVS.lastTs) / 1000) : 0.016; IVS.lastTs = now;
  if (IVS.shown < IVS.text.length) { IVS.shown = Math.min(IVS.text.length, IVS.shown + dt * 36); ivsText(); }
  ivsDraw(now);
}

// The scene is drawn to a 192x108 buffer. On a narrow (portrait) screen the
// visible canvas crops in on the applicant so their face is big enough to read.
function ivsDraw(now) {
  const cv = $('ivs-cv'); if (!cv) return;
  const k = G.candidates.find(x => x.id === IVS.id);
  if (!IVS.buf) { IVS.buf = document.createElement('canvas'); IVS.buf.width = IVS_W; IVS.buf.height = IVS_H; }
  drawIvScene(IVS.buf.getContext('2d'), k, now);
  const crop = cv.parentElement.clientWidth < 600 ? [40, 12, 112, 84] : [0, 0, IVS_W, IVS_H];
  if (cv.width !== crop[2] || cv.height !== crop[3]) { cv.width = crop[2]; cv.height = crop[3]; cv.style.aspectRatio = crop[2] + ' / ' + crop[3]; }
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(IVS.buf, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]);
}
// Typing runs on a timer too, so the text never stalls.
setInterval(() => { if (IVS.id != null && IVS.shown < IVS.text.length && !IVS.raf) { IVS.shown = IVS.text.length; ivsText(); } }, 4000);

function drawIvScene(g, k, now) {
  const t = (now - IVS.t0) / 1000;
  g.imageSmoothingEnabled = false;
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  // --- back wall: steel panels like the backroom, cyan light strip ---
  R(0, 0, IVS_W, IVS_H, '#20252c');
  for (let x = 0; x < IVS_W; x += 32) { R(x, 0, 1, 80, '#14181d'); R(x + 1, 0, 1, 80, 'rgba(255,255,255,0.05)'); }
  R(0, 40, IVS_W, 1, '#14181d');
  R(0, 6, IVS_W, 2, PAL.cyan); g.save(); g.shadowColor = PAL.cyan; g.shadowBlur = 8; R(0, 6, IVS_W, 2, PAL.cyan); g.restore();
  R(0, 8, IVS_W, 1, PAL.cyanDim);
  // cork board with schedules and a planogram
  R(10, 16, 44, 30, '#5a4220'); R(12, 18, 40, 26, '#7a5a2e');
  [[14, 20, '#ffe6b8'], [27, 21, '#9fc8e6'], [40, 19, '#ffe6b8'], [16, 32, '#ffd34d'], [32, 31, '#ffe6b8']].forEach(([x, y, c]) => { R(x, y, 10, 11, c); R(x + 1, y + 3, 8, 1, 'rgba(0,0,0,0.25)'); R(x + 1, y + 6, 6, 1, 'rgba(0,0,0,0.25)'); R(x + 4, y, 2, 2, '#ff5a4e'); });
  // wall clock showing store time
  const cx = 136, cy = 24;
  g.fillStyle = '#14223a'; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
  g.strokeStyle = PAL.plateEdge; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.stroke();
  const mins = G.time % 720, ha = (mins / 720) * Math.PI * 2 - Math.PI / 2, ma = ((G.time % 60) / 60) * Math.PI * 2 - Math.PI / 2;
  g.strokeStyle = '#ffe6b8'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ha) * 5, cy + Math.sin(ha) * 5); g.stroke();
  g.strokeStyle = PAL.cyan; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ma) * 8, cy + Math.sin(ma) * 8); g.stroke();
  // filing cabinet right
  R(140, 44, 30, 44, '#3a404a'); R(140, 44, 30, 1, '#7c8592');
  for (const y of [50, 64, 78]) { R(143, y, 24, 11, '#2c3139'); R(151, y + 4, 8, 2, '#7c8592'); }

  if (k && !(IVS.gone && now > (IVS.goneAt || 0))) drawApplicant(g, R, k, now, t);
  else { // empty chair
    R(80, 52, 32, 36, '#1a1d22'); R(82, 54, 28, 32, '#262b33');
  }

  // --- desk in front: dark top, amber glow edge, the résumé and a mug ---
  R(0, 86, IVS_W, 22, '#1a150e'); R(0, 86, IVS_W, 1, '#ffb238');
  g.save(); g.shadowColor = '#ffb238'; g.shadowBlur = 6; R(0, 86, IVS_W, 1, '#ffb238'); g.restore();
  R(0, 87, IVS_W, 2, '#2a2214');
  R(40, 90, 22, 14, '#ffe6b8'); for (let i = 0; i < 5; i++) R(43, 93 + i * 2, i === 0 ? 10 : 16, 1, 'rgba(0,0,0,0.35)');
  R(140, 90, 9, 10, '#d8d8d8'); R(149, 92, 2, 5, '#d8d8d8'); R(141, 90, 7, 2, '#5a3a22');
  // scanlines like the store view
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < IVS_H; y += 3) g.fillRect(0, y, IVS_W, 1);
}

// S is the scene state (mood, talkUntil); S.vest draws a store vest instead of the visitor sticker (js/talkscene.js)
function drawApplicant(g, R, k, now, t, S = IVS) {
  const L = ivsLook(k), mood = S.mood;
  const breathe = Math.sin(t * 2.2) > 0.6 ? 1 : 0;
  const lean = mood === 'excited' ? 2 : mood === 'negative' || mood === 'upset' ? -1 : 0; // forward = lower and bigger
  const bx = 96, by = 22 + lean + breathe;
  const fid = mood === 'nervous' || mood === 'lying' ? Math.round(Math.sin(t * 9)) : 0;
  // chair back
  if (!S.vest) { R(76, 48, 40, 40, '#14181d'); R(78, 50, 36, 36, '#1d2127'); }
  // shoulders + shirt
  const sh = L.shirt;
  R(bx - 20, by + 36, 40, 30, sh); R(bx - 22, by + 40, 44, 26, sh);
  R(bx - 20, by + 36, 40, 1, 'rgba(255,255,255,0.2)');
  R(bx - 22, by + 40, 3, 26, 'rgba(0,0,0,0.25)'); R(bx + 19, by + 40, 3, 26, 'rgba(0,0,0,0.25)');
  // collar + neck
  R(bx - 5, by + 30, 10, 7, L.skin); R(bx - 5, by + 30, 10, 2, 'rgba(0,0,0,0.25)');
  R(bx - 7, by + 35, 4, 3, 'rgba(255,255,255,0.35)'); R(bx + 3, by + 35, 4, 3, 'rgba(255,255,255,0.35)');
  // arms: crossed when defensive, hands on the desk otherwise
  if (mood === 'negative') {
    R(bx - 18, by + 50, 36, 7, sh); R(bx - 18, by + 50, 36, 1, 'rgba(255,255,255,0.2)'); R(bx - 18, by + 56, 36, 1, 'rgba(0,0,0,0.3)');
    R(bx - 14, by + 51, 5, 5, L.skin); R(bx + 9, by + 51, 5, 5, L.skin);
  } else {
    const hy = 82 + (mood === 'excited' ? -1 : 0);
    R(bx - 16 + fid, hy, 9, 5, L.skin); R(bx + 7 - fid, hy, 9, 5, L.skin);
    R(bx - 16 + fid, hy + 4, 9, 1, 'rgba(0,0,0,0.25)'); R(bx + 7 - fid, hy + 4, 9, 1, 'rgba(0,0,0,0.25)');
  }
  // head
  const hx = bx - 12, hy = by;
  if (L.style === 1) R(hx - 2, hy + 4, 28, 34, L.hair); // long hair behind
  R(hx + 1, hy, 22, 31, L.skin); R(hx, hy + 2, 24, 26, L.skin); R(hx + 2, hy + 31, 20, 1, L.skin);
  R(hx + 20, hy + 4, 3, 24, 'rgba(0,0,0,0.12)'); // jaw shade
  R(hx - 2, hy + 12, 2, 6, L.skin); R(hx + 24, hy + 12, 2, 6, L.skin); // ears
  // hair styles
  const H = L.hair;
  if (L.style === 0) { R(hx, hy - 2, 24, 7, H); R(hx - 1, hy + 2, 3, 8, H); R(hx + 22, hy + 2, 3, 8, H); }
  if (L.style === 1) { R(hx - 1, hy - 2, 26, 8, H); R(hx - 2, hy + 4, 4, 22, H); R(hx + 22, hy + 4, 4, 22, H); }
  if (L.style === 2) { R(hx, hy - 1, 24, 6, H); R(hx + 7, hy - 8, 10, 8, H); R(hx - 1, hy + 2, 3, 6, H); R(hx + 22, hy + 2, 3, 6, H); }
  if (L.style === 3) { R(hx + 1, hy - 1, 22, 4, H); g.globalAlpha = 0.5; R(hx, hy + 3, 3, 6, H); R(hx + 21, hy + 3, 3, 6, H); g.globalAlpha = 1; }
  if (L.style === 4) { for (let i = 0; i < 7; i++) R(hx - 2 + i * 4, hy - 4 + (i % 2) * 2, 5, 6, H); R(hx - 2, hy + 1, 28, 5, H); R(hx - 3, hy + 4, 4, 10, H); R(hx + 23, hy + 4, 4, 10, H); }
  R(hx, hy - 2, 24, 1, 'rgba(255,255,255,0.12)');

  // eyes
  const ey = hy + 14, exL = hx + 5, exR = hx + 14;
  const blink = (t % 3.4) < 0.12 || mood === 'upset' && (t % 1.6) < 0.1;
  let look = 0, lookY = 0;
  if (mood === 'lying') look = Math.sin(t * 1.3) > 0.2 ? 2 : (Math.sin(t * 1.3) < -0.6 ? -1 : 0);
  if (mood === 'nervous') lookY = Math.sin(t * 0.9) > 0.3 ? 1 : 0;
  if (mood === 'upset') look = 2;
  if (blink) { R(exL, ey + 2, 5, 1, '#111'); R(exR, ey + 2, 5, 1, '#111'); }
  else {
    R(exL, ey, 5, 4, '#f4f4f4'); R(exR, ey, 5, 4, '#f4f4f4');
    const px = 2 + look, py = 1 + lookY;
    R(exL + clamp(px - 1, 0, 3), ey + py, 2, 3 - lookY, '#1a1410'); R(exR + clamp(px - 1, 0, 3), ey + py, 2, 3 - lookY, '#1a1410');
    if (mood === 'excited') { R(exL + 1, ey, 1, 1, '#fff'); R(exR + 1, ey, 1, 1, '#fff'); }
    if (mood === 'negative') { R(exL, ey, 5, 1, L.skin); R(exR, ey, 5, 1, L.skin); } // narrowed
  }
  // brows
  const BR = '#2b1d14' === H ? '#1a120c' : H;
  const brow = (x, y0, y1) => { R(x, ey - 3 + y0, 2, 1, BR); R(x + 2, ey - 3 + Math.round((y0 + y1) / 2), 1, 1, BR); R(x + 3, ey - 3 + y1, 2, 1, BR); };
  ({
    neutral: () => { brow(exL, 0, 0); brow(exR, 0, 0); },
    positive: () => { brow(exL, 0, -1); brow(exR, -1, 0); },
    excited: () => { brow(exL, -2, -2); brow(exR, -2, -2); },
    nervous: () => { brow(exL, 0, -2); brow(exR, -2, 0); },
    lying: () => { brow(exL, 0, 0); brow(exR, -2, -1); },
    negative: () => { brow(exL, -1, 1); brow(exR, 1, -1); },
    upset: () => { brow(exL, 0, -2); brow(exR, -2, 0); },
  })[mood]();
  // nose
  R(hx + 11, ey + 5, 2, 4, 'rgba(0,0,0,0.15)'); R(hx + 11, ey + 8, 3, 1, 'rgba(0,0,0,0.2)');
  // mouth
  const my = hy + 24, mx = hx + 8, M = '#5a1f1f';
  const talking = performance.now() < S.talkUntil && Math.floor(t * 10) % 2 === 0;
  if (talking && mood !== 'negative') { R(mx + 1, my - 1, 6, 3, M); R(mx + 2, my - 1, 4, 1, '#f4f4f4'); }
  else ({
    neutral: () => R(mx + 1, my, 6, 1, M),
    positive: () => { R(mx + 1, my, 6, 1, M); R(mx, my - 1, 1, 1, M); R(mx + 7, my - 1, 1, 1, M); },
    excited: () => { R(mx, my - 1, 8, 3, M); R(mx + 1, my - 1, 6, 1, '#f4f4f4'); R(mx - 1, my - 2, 1, 1, M); R(mx + 8, my - 2, 1, 1, M); },
    nervous: () => { R(mx + 1, my, 2, 1, M); R(mx + 3, my - 1, 2, 1, M); R(mx + 5, my, 2, 1, M); },
    lying: () => { R(mx + 1, my, 5, 1, M); R(mx + 6, my - 1, 2, 1, M); },
    negative: () => { R(mx + 1, my - 1, 6, 1, M); R(mx, my, 1, 1, M); R(mx + 7, my, 1, 1, M); },
    upset: () => { R(mx + 3, my - 1, 2, 2, M); },
  })[mood]();
  // extras
  if (mood === 'excited') { g.globalAlpha = 0.45; R(hx + 2, ey + 6, 4, 2, '#ff6b8a'); R(hx + 18, ey + 6, 4, 2, '#ff6b8a'); g.globalAlpha = 1; }
  if (mood === 'nervous' || mood === 'lying' || mood === 'upset') {
    const d = (t * 6) % 10;
    R(hx + 22, hy + 6 + d, 2, 3, '#7fe3ff'); R(hx + 22, hy + 6 + d, 1, 1, '#fff');
  }
  if (mood === 'lying') { // hand to the neck
    R(bx + 6, by + 28, 8, 6, L.skin); R(bx + 6, by + 33, 8, 1, 'rgba(0,0,0,0.25)');
  }
  if (mood === 'upset') { g.globalAlpha = 0.18; R(hx, hy, 24, 31, '#9fc8e6'); g.globalAlpha = 1; }
  if (S.vest) { // store vest and name tag
    R(bx - 22, by + 38, 13, 28, S.vest); R(bx + 9, by + 38, 13, 28, S.vest);
    R(bx - 22, by + 38, 13, 1, 'rgba(255,255,255,0.3)'); R(bx + 9, by + 38, 13, 1, 'rgba(255,255,255,0.3)');
    R(bx + 11, by + 44, 9, 5, '#f4f4f4'); R(bx + 12, by + 46, 7, 1, 'rgba(0,0,0,0.45)');
  } else { // applicant badge (visitor sticker)
    R(bx - 18, by + 44, 12, 7, '#ffe6b8'); R(bx - 18, by + 44, 12, 2, '#ff5a4e'); R(bx - 16, by + 48, 8, 1, 'rgba(0,0,0,0.4)');
  }
}
