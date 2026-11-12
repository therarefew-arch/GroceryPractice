'use strict';
// =====================================================================
//  HUD, office computer, and modal screens.
// =====================================================================
const $ = id => document.getElementById(id);
const stars = n => `<span style="color:#ffd34d">${'★'.repeat(n)}</span><span class="mute">${'★'.repeat(5 - n)}</span>`;
const meter = (pct, color) => `<div class="row" style="gap:6px;flex-wrap:nowrap"><div class="meter"><div style="width:${clamp(pct, 0, 100)}%;background:${color}"></div></div><span class="mute">${Math.round(pct)}%</span></div>`;
const spark = arr => { const mx = Math.max(1, ...arr); return `<span class="spark">${arr.map(v => `<i style="height:${Math.max(2, v / mx * 22)}px" title="${v}"></i>`).join('')}</span>`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function setSpeed(v) { G.speed = v; RT.paused = false; }

const UI = {
  open: false, tab: 'today', mailId: null, drill: null, lastHud: 0,

  init() {
    document.querySelectorAll('[data-speed]').forEach(b => {
      b.onclick = () => { const v = +b.dataset.speed; if (v === 0) RT.paused = !RT.paused; else setSpeed(v); b.blur(); };
    });
    $('btn-endnight').onclick = e => { e.target.blur(); confirmEndNight(); };
    $('btn-pc').onclick = e => { e.target.blur(); toast('Walk to the computer in the OFFICE (top-right) and press E.', 'info'); };
    $('pc-close').onclick = () => this.closeComputer();
    window.addEventListener('resize', fit);
    window.addEventListener('keydown', e => {
      if (this.open) { if (e.key === 'Escape') this.closeComputer(); return; }
      if (RT.modal || !G) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      RT.keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === 'KeyP') RT.paused = !RT.paused;
      if (e.code === 'KeyM') toggleMute();
      if (e.code === 'Equal' || e.code === 'NumpadAdd') setZoom(CAM.target * 1.25);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') setZoom(CAM.target / 1.25);
      if (e.code === 'KeyZ') setZoom(CAM.target > 1 ? 1 : 2.2);
      if (e.code === 'Digit1') setSpeed(1);
      if (e.code === 'Digit2') setSpeed(2);
      if (e.code === 'Digit3') setSpeed(4);
      if ((e.code === 'KeyE' || e.code === 'Space') && !isPaused() && !G.player.work) {
        const it = getInteraction();
        if (it && it.fn) it.fn();
      }
    });
    window.addEventListener('keyup', e => { RT.keys[e.code] = false; });
    window.addEventListener('blur', () => { RT.keys = {}; });
    fit();
  },

  frame() {
    const p = G.player, el = $('prompt');
    if (p.work) { el.textContent = p.work.label + '…'; el.className = ''; }
    else {
      const it = isPaused() ? null : getInteraction();
      if (it) { el.textContent = (it.fn ? '[E] ' : '') + it.label; el.className = it.bad ? 'bad' : ''; }
      else { el.textContent = this.hint(); el.className = 'hint'; }
    }
    let hold = '';
    if (p.carry.length) hold = 'Holding: ' + p.carry.map(caseLabel).join(' · ');
    else if (p.floatId) { const f = floatById(p.floatId); if (f) hold = `Pushing ${DEPT[f.dept].aisle} ${DEPT[f.dept].name} float · ${plural(f.cases.length, 'case')}`; }
    else if (p.pallet) hold = `Pallet jack: ${plural(p.pallet.cases.length, 'case')}${p.pallet.cold ? ' (cold)' : ''}`;
    $('holding').textContent = hold;
    const now = performance.now();
    if (now - this.lastHud > 200) { this.lastHud = now; this.updateHUD(); }
  },

  hint() {
    if (RT.paused) return 'Paused — press P to resume';
    if (G.phase === 'night') return G.trailer.length ? 'Night: pull pallets off the trailer at the dock doors (top-left), or press "End night".' : 'Trailer empty! Break down pallets or press "End night" to start tomorrow.';
    if (G.phase === 'day' && G.time < OPEN) return 'Doors open at 7:00 AM — get freight on the shelves.';
    if (G.vendorsToday.some(v => v.state === 'waiting')) return 'A DSD vendor is waiting at the back door (green DSD door).';
    return '';
  },

  updateHUD() {
    const t = G.today;
    $('h-day').textContent = dayLabel(G.day);
    const lp0 = listProgress(); $('h-list').textContent = `${lp0.done}/${lp0.total}`;
    $('h-time').textContent = fmtTime(G.time);
    $('h-phase').textContent = G.phase === 'night' ? 'Night truck' : G.phase === 'summary' ? 'Closed' : G.time < OPEN ? 'Pre-open' : 'Store open';
    $('h-sales').textContent = money(t.sales);
    $('h-goal').textContent = ' / ' + money(t.goal);
    $('h-sat').textContent = Math.round(G.sat);
    const lp = t.sales > 0 ? t.labor / t.sales * 100 : 0;
    $('h-labor').textContent = t.sales > 0 ? lp.toFixed(1) + '%' : '—';
    $('h-labor').className = lp > 15 ? 'bad' : lp > LABOR_TARGET ? 'warn' : '';
    $('h-truck').textContent = G.phase === 'night' ? `${G.trailer.length} plt` : (t.truckDoneAt ? '✓ done' : truckRemaining() + ' cs');
    const unread = G.emails.filter(m => !m.read).length;
    $('h-mail').textContent = unread;
    $('h-mail').className = unread ? 'warn' : '';
    $('h-title').textContent = `Lv ${level()} · ${title()}`;
    $('h-xp').style.width = (G.xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100 + '%';
    $('h-bank').textContent = money(G.bank);
    document.querySelectorAll('[data-speed]').forEach(b => {
      const v = +b.dataset.speed;
      b.classList.toggle('on', v === 0 ? RT.paused : (!RT.paused && G.speed === v));
    });
    $('btn-endnight').classList.toggle('hidden', G.phase !== 'night');
  },

  // ---------------- computer ----------------
  openComputer() { this.open = true; RT.keys = {}; $('computer').classList.remove('hidden'); this.render(); },
  closeComputer() { this.open = false; $('computer').classList.add('hidden'); },
  setTab(t) { this.tab = t; this.render(); },
  render() {
    const main = this['tab_' + this.tab]();
    const unread = G.emails.filter(m => !m.read).length;
    const tabs = [['today', '📋 Today'], ['dash', '📊 Reports'], ['mail', `📧 Email${unread ? ` (${unread})` : ''}`], ['crew', '👥 Crew & Schedule'], ['hire', '🤝 Hiring'],
      ['display', '🏷️ Display Planner'], ['order', '📈 Forecast & Order'], ['records', '🏆 Records'], ['help', '❓ Help & Settings']];
    $('pc-tabs').innerHTML = tabs.map(([k, l]) => `<button class="${this.tab === k ? 'on' : ''}" onclick="UI.setTab('${k}')">${l}</button>`).join('') +
      `<div style="flex:1"></div><div class="mute" style="font-size:12px;padding:6px">The clock is paused while you're logged in.</div>`;
    $('pc-main').innerHTML = main;
  },

  tab_records() {
    const rec = G.records || {};
    let h = '<h2>🏆 Records board</h2><p class="mute">Your personal bests. Beat one and you\'ll hear about it.</p><table><tr><th>Record</th><th class="n">Best</th><th>Set on</th></tr>';
    for (const k in RECORDS) { const r = rec[k]; h += `<tr><td>${RECORDS[k].name}</td><td class="n"><b>${r ? RECORDS[k].fmt(r.v) : '—'}</b></td><td class="mute">${r ? dayLabel(r.day) : 'not set yet'}</td></tr>`; }
    h += '</table><h3>District Manager reviews</h3>';
    const rv = (G.reviews || []).slice().reverse();
    h += rv.length ? '<table><tr><th>Week</th><th>Grade</th><th class="n">Sales</th><th class="n">Labor</th><th class="n">In-stock</th><th></th></tr>' + rv.map((r, i) => `<tr><td>Week ${r.week}</td><td><b>${r.grade}</b> <span class="mute">(${Math.round(r.score)})</span></td><td class="n">${money(r.sales)}</td><td class="n">${r.laborPct.toFixed(1)}%</td><td class="n">${(r.inStock * 100).toFixed(1)}%</td><td><button onclick="UI.showWeekReview(G.reviews[${G.reviews.length - 1 - i}])">Read</button></td></tr>`).join('') + '</table>'
      : '<p class="mute">Your first review comes after Friday\'s close (weeks run Saturday to Friday).</p>';
    return h;
  },
  tab_today() {
    const L = G.list || [], p = listProgress();
    let h = `<h2>Today's list · ${WEEKDAY_NAMES[dowIdx(G.day)]}</h2><p class="mute">${p.done} of ${p.total} done. Tasks check themselves off when the work is done. +${TASK_XP} XP each, +${LIST_BONUS_XP} XP for the whole list.</p><table>`;
    h += L.map(t => `<tr><td style="width:28px">${t.status === 'done' ? '<span class="good">✓</span>' : t.status === 'missed' ? '<span class="bad">✗</span>' : '○'}</td><td><b class="${t.status === 'missed' ? 'bad' : ''}">${esc(t.label)}</b><div class="mute">${esc(t.sub)}</div></td><td class="n mute">${t.mode === 'by' ? 'by' : 'at'} ${fmtTime(t.due)}</td></tr>`).join('');
    h += '</table><h3>Invoices (last night\'s trucks)</h3><div class="row">';
    const closed = G.today.invoicesClosed || [];
    for (const ty of lastNightTrucks()) {
      const ok = truckWorked(ty), done = closed.includes(ty);
      h += `<button ${done || !ok ? 'disabled' : ''} onclick="closeInvoice('${ty}');UI.render()">${done ? '✓ ' : ''}${ty}${!ok && !done ? ' (still being worked)' : ''}</button>`;
    }
    const dsdOk = dsdAllDone(), dsdDone = closed.includes('DSD');
    h += `<button ${dsdDone || !dsdOk ? 'disabled' : ''} onclick="closeInvoice('DSD');UI.render()">${dsdDone ? '✓ ' : ''}DSD vendors${!dsdOk && !dsdDone ? ' (vendors still due)' : ''}</button></div>`;
    const canOOS = G.time >= 1260 && G.today.oosLogged == null;
    h += `<h3>Out-of-stock count</h3><p>${G.today.oosLogged != null ? `Logged tonight: <b>${G.today.oosLogged}</b> (goal ${OOS_GOAL})` : `Walk-count of empty facings, logged after 9 PM once bills are closed. Right now: <b>${oosCount()}</b>.`}</p>`;
    if (canOOS) h += '<button class="primary" onclick="logOOS();UI.render()">Log tonight\'s count</button>';
    const hist = (G.oosLog || []).slice(-14);
    if (hist.length) h += `<p class="mute">Last ${hist.length} counts: ${spark(hist.map(x => x.n))}</p>`;
    return h;
  },

  tab_dash() {
    const t = G.today;
    const laborPct = t.sales > 0 ? t.labor / t.sales * 100 : 0;
    const inStock = t.requests ? (1 - t.misses / t.requests) * 100 : 100;
    const pal = sum(G.pallets.map(p => p.cases.length)), onFl = sum(G.floats.map(f => f.cases.length));
    const card = (k, v, s, cls) => `<div class="card"><div class="k">${k}</div><div class="v ${cls || ''}">${v}</div><div class="s">${s || ''}</div></div>`;
    let h = `<h2>Store Report — ${G.phase === 'night' ? `Night after Day ${G.day}` : `${dayLabel(G.day)}, ${fmtTime(G.time)}`}</h2><div class="cards">`;
    h += card('Sales today', money(t.sales), `Goal ${money(t.goal)} (${Math.round(t.sales / Math.max(1, t.goal) * 100)}%)`);
    h += card('Customers', t.customers, `${t.requests} shelf visits`);
    h += card('In-stock', inStock.toFixed(1) + '%', `${t.misses} empty-shelf walkaways`, inStock >= 97 ? 'good' : inStock >= 92 ? 'warn' : 'bad');
    h += card('Labor %', t.sales > 0 ? laborPct.toFixed(1) + '%' : '—', `${money(t.labor)} · target ≤ ${LABOR_TARGET}%`, laborPct <= LABOR_TARGET ? 'good' : laborPct <= 15 ? 'warn' : 'bad');
    h += card('Satisfaction', Math.round(G.sat), 'out of 100', G.sat >= 75 ? 'good' : G.sat >= 55 ? 'warn' : 'bad');
    h += card('Shrink', money(t.shrink + t.scanLoss), `${t.spoiled} spoiled cs · ${money(t.scanLoss)} scan loss`, t.shrink + t.scanLoss > 0 ? 'warn' : '');
    h += card('Truck', t.truckDoneAt ? 'Done ' + fmtTime(t.truckDoneAt) : truckRemaining() + ' cs left', `${pal} on pallets · ${onFl} on floats`, t.truckDoneAt ? 'good' : '');
    h += card('Price tags', G.tags.length + ' open', `${t.tagsFixed} fixed today`, G.tags.length ? 'warn' : 'good');
    h += '</div>';
    h += `<h3>Departments</h3><table><tr><th>Department</th><th>Shelf</th><th class="n">Backstock</th><th class="n">On float</th><th class="n">On pallets</th><th class="n">Sold (units)</th><th class="n">Lost (units)</th><th class="n">Endcaps</th></tr>`;
    for (const d of DEPTS) {
      const pct = shelfPct(d.id) * 100;
      h += `<tr><td><span class="dot" style="background:${d.color}"></span>${d.aisle} · ${d.name}</td><td>${meter(pct, pct < 25 ? '#e5534b' : pct < 50 ? '#f0b429' : '#3cc47c')}</td>
        <td class="n">${(G.stock[d.id].back / d.upc).toFixed(1)} cs</td><td class="n">${floatOf(d.id).cases.length}</td><td class="n">${palletCases(d.id)}</td>
        <td class="n">${t.units[d.id] || 0}</td><td class="n ${t.lost[d.id] ? 'bad' : ''}">${t.lost[d.id] || 0}</td><td class="n">${endcapCount(d.id)}</td></tr>`;
    }
    h += '</table>';
    const vs = v => ({ pending: '<span class="mute">Scheduled</span>', waiting: '<span class="warn">At back door — check in!</span>', stocking: 'Stocking', done: '<span class="good">Delivered</span>', left: '<span class="bad">Left (missed)</span>' }[v.state]);
    h += `<h3>DSD vendors today</h3><table><tr><th>Time</th><th>Vendor</th><th>Department</th><th class="n">Cases</th><th>Status</th></tr>` +
      G.vendorsToday.map(v => `<tr><td>${fmtTime(v.time)}</td><td>${v.name}</td><td>${DEPT[v.dept].name}</td><td class="n">${v.cases}</td><td>${vs(v)}</td></tr>`).join('') + '</table>';
    if (G.pastDays.length) {
      h += `<h3>Recent days</h3><table><tr><th>Day</th><th>Grade</th><th class="n">Sales</th><th class="n">Goal</th><th class="n">Labor %</th><th class="n">In-stock</th><th>Truck done</th></tr>` +
        G.pastDays.slice(-7).reverse().map(d => `<tr><td>${d.day}</td><td><b>${d.grade}</b> <span class="mute">(${d.score})</span></td><td class="n">${money(d.sales)}</td><td class="n">${money(d.goal)}</td><td class="n">${d.laborPct.toFixed(1)}%</td><td class="n">${(d.inStock * 100).toFixed(1)}%</td><td>${d.truckDoneAt ? fmtTime(d.truckDoneAt) : '—'}</td></tr>`).join('') + '</table>';
    }
    const earned = Object.entries(G.badges);
    if (earned.length) h += `<h3>Badges</h3><div>${earned.map(([k, n]) => `<span class="badge" title="${BADGES[k].desc}">🏅 ${BADGES[k].name} ×${n}</span>`).join('')}</div>`;
    return h;
  },

  tab_mail() {
    if (!G.emails.length) return '<h2>Email</h2><p class="mute">Inbox empty.</p>';
    let sel = G.emails.find(m => m.id === this.mailId) || G.emails[0];
    sel.read = true; this.mailId = sel.id;
    const list = G.emails.map(m => `<div class="mail-item ${m.read ? '' : 'unread'} ${m.id === sel.id ? 'sel' : ''}" onclick="UI.openMail(${m.id})"><b>${esc(m.subject)}</b><div class="mute" style="font-size:12px">${esc(m.from)} · Day ${m.day}, ${fmtTime(m.time)}</div></div>`).join('');
    return `<div class="mail"><div class="mail-list">${list}</div><div class="mail-body"><h2>${esc(sel.subject)}</h2><div class="mute" style="margin-bottom:10px">From: ${esc(sel.from)} · Day ${sel.day}, ${fmtTime(sel.time)}</div>${esc(sel.body)}</div></div>`;
  },
  openMail(id) { this.mailId = id; this.render(); },

  tab_crew() {
    const hours = sh => (SHIFTS[sh].end - SHIFTS[sh].start) / 60;
    let h = `<h2>Crew & Schedule</h2><p class="mute">Change roles and shifts any time — it takes effect right away. Crew slots: ${G.crew.length}/${maxCrew()} (level up for more). Team morale: <b style="color:${moodOf({ morale: teamMorale(), trait: 'quiet' }).col}">${Math.round(teamMorale())}%</b></p>`;
    h += `<table><tr><th>Name</th><th>Role</th><th>Shift</th><th>Skill</th><th>Rank</th><th>Training</th><th>Morale</th><th class="n">Coached</th><th class="n">Days</th><th class="n">Wage</th><th>Right now</th><th></th></tr>`;
    for (const c of G.crew) {
      const r = RT.crew[c.id];
      const status = c.calledOut ? '<span class="bad">Called out</span>' : onShift(c) ? (r && r.inBuilding ? `<span class="good">${r.intent || 'On the clock'}</span>` : 'Clocking in') : '<span class="mute">Off the clock</span>';
      h += `<tr><td><span class="dot" style="background:${ROLES[c.role].color}"></span>${esc(c.name)}</td>
        <td><select onchange="UI.setRole(${c.id},this.value)">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === c.role ? 'selected' : ''}>${v.name}</option>`).join('')}</select></td>
        <td><select onchange="UI.setShift(${c.id},this.value)">${Object.entries(SHIFTS).map(([k, v]) => `<option value="${k}" ${k === c.shift ? 'selected' : ''}>${v.name}</option>`).join('')}</select></td>
        <td>${stars(c.skill)}</td><td>${rankHTML(c)}</td><td>${trainMeter(c)}</td><td title="${TRAITS[ensureMorale(c).trait].desc}" style="white-space:nowrap">${moodOf(c).icon} ${Math.round(c.morale)}% <span class="mute">${TRAITS[c.trait].name}</span>${c.strikes ? ` <span class="warn">${c.strikes}✎</span>` : ''}</td><td class="n">${c.coached || 0}</td><td class="n">${c.days || 0}</td><td class="n">$${c.wage.toFixed(2)}/hr</td><td>${status}${c.needsCoach ? ' <span class="bad">⚠ needs coaching</span>' : ''}${c.notice ? ` <span class="bad">🚪 gave notice (last day ${c.notice})</span>` : ''}${c.promoAsk ? ' <span class="warn">📈 asked to move up</span>' : ''}${c.sentHome === G.day ? ' <span class="mute">sent home</span>' : ''}</td>
        <td style="white-space:nowrap">${c.lead ? '<span class="good">◆ Lead</span> ' : canPromote(c) ? `<button onclick="UI.promote(${c.id})">Promote</button> ` : ''}<button class="danger" onclick="UI.fire(${c.id})">Fire</button></td></tr>`;
    }
    h += '</table>';
    const proj = sum(G.crew.filter(c => !c.calledOut && c.shift !== 'night').map(c => hours(c.shift) * c.wage));
    const projN = sum(G.crew.filter(c => c.shift === 'night').map(c => hours(c.shift) * c.wage));
    h += `<p>Scheduled day labor: <b>${money(proj)}</b> ≈ <b>${(proj / Math.max(1, G.today.goal) * 100).toFixed(1)}%</b> of today's sales goal. Night crew: <b>${money(projN)}</b> (charged to the next day). Target ≤ ${LABOR_TARGET}%.</p>`;
    h += `<h3>Training & coaching</h3><p class="mute">New hires make mistakes: wrong floats, cardboard left in aisles, wrong tags, short DSD deliveries, phone breaks. A red <b class="bad">!</b> appears over their head. Walk up and press <kbd>E</kbd> to coach them within 2 hours, or the mistake becomes a habit. Rookie → Trained → Pro → <b style="color:#ffd34d">★ Superstar</b> (85% trained, coached 8+ times, 3+ days on the job): 15% faster, no mistakes, and mentors rookies on their shift.</p>`;
    h += `<h3>Morale, conflicts & promotions</h3><p class="mute">Morale changes work speed (−15% when miserable, +5% when fired up) and call-outs. It goes up when you thank people (walk up and press <kbd>E</kbd>, once a day each), coach them, promote them and have good days. It goes down with shift changes, bad days, being ignored for 3+ days, unhandled arguments and unfair discipline. Below 20%, people give 3 days' notice: talk to them to turn it around. When an argument starts (orange <b style="color:#ff8c1a">!!</b>), walk over and press <kbd>E</kbd>: talk it out, split them up, write up, send home or let go. The right call depends on how serious it is and the person's write-up history. Pros and Superstars with 5+ days can be promoted to <b>◆ Lead</b> (+$${LEAD_RAISE.toFixed(2)}/hr, max ${MAX_LEADS}): leads work 5% faster, lift morale on their shift and calm arguments.</p>`;
    const ex = (G.exits || []).slice().reverse();
    if (ex.length) h += '<h3>Exit interviews</h3><table><tr><th>Name</th><th>Left</th><th>Why</th><th class="n">Days</th><th>What they said</th></tr>' + ex.map(e => `<tr><td>${esc(e.name)}</td><td>${dayLabel(e.day)}</td><td>${e.why === 'quit' ? '<span class="bad">Quit</span>' : 'Let go'}</td><td class="n">${e.days}</td><td class="mute">${e.why === 'quit' ? esc(e.gripes.map(g => GRIPE_TEXT[g]).join(' ') || 'It just wasn\'t working out.') : '—'}</td></tr>`).join('') + '</table>';
    h += `<h3>Roles</h3><table>${Object.values(ROLES).map(r => `<tr><td style="white-space:nowrap"><span class="dot" style="background:${r.color}"></span><b>${r.name}</b></td><td class="mute">${r.desc}</td></tr>`).join('')}</table>`;
    return h;
  },
  promote(id) { const c = G.crew.find(x => x.id === id); if (c) promoteCrew(c); this.render(); },
  showConflict() {
    const k = G.conflict; if (!k) return;
    const [a, b] = conflictCrew();
    const btn = (ch, l, d) => `<button style="display:block;width:100%;text-align:left;margin:6px 0;padding:8px" onclick="UI.pickConflict('${ch}')"><b>${l}</b><div class="mute" style="font-size:12px">${d}</div></button>`;
    this.showModal(`<h2>⚡ ${SEV_NAME[k.sev]} conflict</h2><p>${esc(k.text)}</p>
      <p class="mute">${esc(a.name)}: ${TRAITS[a.trait].name}, morale ${Math.round(a.morale)}%, write-ups on file: <b>${a.strikes}</b> · ${esc(b.name)}: ${TRAITS[b.trait].name}, morale ${Math.round(b.morale)}%</p>
      ${btn('talk', 'Pull them aside and talk it out', 'Hear both sides and agree on a fix.')}
      ${btn('split', 'Split them up', 'Send them to different areas for the rest of the shift.')}
      ${btn('writeup', 'Write up ' + esc(a.name), 'A documented warning on file.')}
      ${btn('home', 'Send ' + esc(a.name) + ' home for the day', 'Unpaid for the rest of the shift.')}
      ${btn('fire', 'Let ' + esc(a.name) + ' go', 'Termination. Can\'t be undone.')}
      <div class="row" style="justify-content:flex-end"><button onclick="UI.hideModal()">Walk away (for now)</button></div>`);
  },
  pickConflict(ch) {
    const r = resolveConflict(ch); if (!r) return this.hideModal();
    this.showModal(`<h2>${r.good ? '✅' : '⚠'} ${esc(r.verdict)}</h2><p><span class="mute">Why:</span> ${esc(r.why)}</p><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="primary" onclick="UI.hideModal()">Back to work</button></div>`);
    toast(r.good ? '🤝 Conflict handled well.' : '⚠ Conflict handled, but not well. Read the why.', r.good ? 'good' : 'warn');
  },
  setRole(id, role) { const c = G.crew.find(x => x.id === id); c.role = role; const r = RT.crew[id]; if (r && r.plan) finishPlan(c, r); this.render(); },
  setShift(id, sh) { const c = G.crew.find(x => x.id === id); if (c.shift !== sh && (c.days || 0) > 0) bump(c, -4, 'schedule'); c.shift = sh; const r = RT.crew[id]; if (r && r.plan) finishPlan(c, r); this.render(); },
  fire(id) {
    const c = G.crew.find(x => x.id === id);
    if (!confirm(`Let ${c.name} go? This can't be undone.\nWrite-ups on file: ${c.strikes || 0}. Firing without documentation hurts team morale.`)) return;
    letGo(c, 'fired');
    toast(`${c.name} was let go.`);
    this.render();
  },

  tab_hire() {
    const full = G.crew.length >= maxCrew();
    let h = `<h2>Hiring</h2><p class="mute">New applicants every morning. ${full ? '<span class="warn">All crew slots are full — let someone go or level up.</span>' : `Open slots: ${maxCrew() - G.crew.length}.`} You can change a hire's role and shift later in Crew & Schedule.</p><div class="cand">`;
    h += G.candidates.map(c => `<div class="card"><div class="v" style="font-size:16px">${esc(c.name)}</div><div><span class="dot" style="background:${ROLES[c.role].color}"></span>${ROLES[c.role].name}</div>
      <div class="s" style="margin:4px 0">${ROLES[c.role].desc}</div><div>${stars(c.skill)} · <b>$${c.wage.toFixed(2)}/hr</b></div><div class="s">Training: ${c.exp != null ? c.exp : 0}% · new hires need coaching</div><div class="s">Wants: ${SHIFTS[c.shift].name}</div>
      <button class="primary" ${full ? 'disabled' : ''} onclick="UI.hire(${c.id})" style="margin-top:8px">Hire</button></div>`).join('') || '<p class="mute">No applicants left today. Check back tomorrow.</p>';
    h += '</div><p class="mute">Skill sets walking and working speed (★1 ≈ 82%, ★5 ≈ 130%). More skill costs more per hour.</p>';
    return h;
  },
  hire(id) {
    if (G.crew.length >= maxCrew()) return;
    const k = G.candidates.find(x => x.id === id);
    G.candidates = G.candidates.filter(x => x !== k);
    G.crew.push(ensureMorale(ensureTrain({ id: k.id, name: k.name, role: k.role, shift: k.shift, skill: k.skill, wage: k.wage, calledOut: false }, k.exp != null ? k.exp : hireTrainingBase(k.skill))));
    toast(`Hired ${k.name} as ${ROLES[k.role].name} (${SHIFTS[k.shift].name}).`, 'good');
    this.render();
  },

  tab_display() {
    let h = `<h2>Display Planner</h2><p class="mute">Each endcap lifts its department's sales +12% (max 2 per department). The lift only pays if the shelf stays in stock — and tomorrow's forecast includes it.</p>`;
    if (G.ad) h += `<div class="card" style="margin-bottom:12px"><b>📰 Ad week (since Day ${G.ad.from}):</b> District wants <b>${G.ad.depts.map(d => DEPT[d].name).join(' & ')}</b> on at least 2 endcaps each. Status: ${G.ad.depts.map(d => `<span class="${endcapCount(d) >= 2 ? 'good' : 'warn'}">${DEPT[d].name} ${endcapCount(d)}/2</span>`).join(' · ')}</div>`;
    h += `<table><tr><th>Endcap</th><th>Display</th><th>Effect</th></tr>`;
    for (const e of MAPD.endcaps) {
      const gd = DEPT[SHELF_DEPT[e.gondola]], cur = G.endcaps[e.id];
      h += `<tr><td>${gd.aisle} (${gd.name}) — ${e.end} endcap</td><td><select onchange="UI.setEndcap('${e.id}',this.value)"><option value="">— Empty —</option>${DEPTS.map(d => `<option value="${d.id}" ${cur === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}</select></td>
        <td>${cur ? `<span class="good">${DEPT[cur].name} +${Math.round((promoLift(cur) - 1) * 100)}% total</span>` : '<span class="mute">—</span>'}</td></tr>`;
    }
    return h + '</table>';
  },
  setEndcap(id, v) { G.endcaps[id] = v || null; this.render(); },

  tab_order() {
    const editable = orderOpen();
    const td = nextTruckDay(G.phase === 'day' ? G.day : G.day + 1), cover = coverDays(td);
    const sug = suggestedOrder();
    const cur = (G.order && G.day === td) ? G.order : sug;
    let h = `<h2>Forecast & Order</h2>`;
    h += `<p class="mute">Tonight's trucks: <b>${trucksOn(td).map(t => TRUCK_TYPES[t].name).join(', ')}</b>. Only departments on tonight's trucks can be ordered. The window closes at <b>${fmtTime(ORDER_CUTOFF)}</b>.</p>`;
    if (editable) h += `<p>Order for <b>tonight's trucks</b> (${WEEKDAY_NAMES[dowIdx(td)]}). Each department's order has to cover the days until its next truck (see Covers). ${G.orderSubmitted ? '<span class="good">✓ Submitted. You can still change and resubmit until the cutoff.</span>' : `<span class="warn">Not submitted yet. Due by ${fmtTime(ORDER_CUTOFF)}.</span>`}</p>`;
    else if (G.phase === 'day' && isTruckNight(G.day)) h += `<p class="warn">The order window closed at ${fmtTime(ORDER_CUTOFF)}. ${G.today.systemOrder ? 'The system order was sent.' : 'Your order is locked in.'}</p>`;
    else h += `<p class="mute">No order due today. Next truck: <b>${WEEKDAY_NAMES[dowIdx(td)]} night</b> (covers ${cover} day${cover > 1 ? 's' : ''}). Preview below.</p>`;
    h += `<table><tr><th>Department</th><th>Last 7 days (units)</th><th class="n">Avg/day</th><th class="n">Endcap lift</th><th class="n">Covers</th><th class="n">Forecast</th><th class="n">On hand</th><th class="n">DSD/day</th><th class="n">Suggested</th><th class="n">Order (cs)</th></tr>`;
    let tot = 0;
    for (const d of DEPTS) {
      const h7 = G.history[d.id].slice(-7);
      const cv = coverDaysFor(d.id, td);
      let fc = 0; for (let k = 1; k <= cv; k++) fc += forecastFor(d.id, td + k);
      const oh = onHandUnits(d.id), val = cv ? (cur[d.id] || 0) : 0;
      tot += val;
      h += `<tr><td><span class="dot" style="background:${d.color}"></span><span class="clickable" onclick="UI.drillTo('${d.id}')">${d.name}</span></td><td>${spark(h7)}</td>
        <td class="n">${Math.round(avgDemand(d.id))}</td><td class="n">${promoLift(d.id) > 1 ? '+' + Math.round((promoLift(d.id) - 1) * 100) + '%' : '—'}</td>
        <td class="n">${cv ? cv + 'd' : '<span class="mute">not tonight</span>'}</td><td class="n">${Math.round(fc)} <span class="mute">(${(fc / d.upc).toFixed(1)} cs)</span></td><td class="n">${Math.round(oh)} <span class="mute">(${(oh / d.upc).toFixed(1)} cs)</span></td>
        <td class="n">${dsdUnits(d.id) ? Math.round(dsdUnits(d.id) / d.upc) + ' cs' : '—'}</td><td class="n"><b>${sug[d.id]}</b></td>
        <td class="n"><input type="number" min="0" max="400" value="${val}" ${editable && cv ? '' : 'disabled'} oninput="UI.setOrder('${d.id}',this.value)"></td></tr>`;
    }
    h += `<tr><td colspan="9" class="n"><b>Total</b> <span class="mute">(≈ ${Math.max(1, Math.ceil(tot / PALLET_SIZE))} pallets)</span></td><td class="n"><b id="ord-total">${tot}</b> cs</td></tr></table>`;
    if (editable) h += `<div class="row" style="margin-top:10px;justify-content:flex-end"><button onclick="UI.fillSuggested()">Use suggested</button><button class="primary" onclick="UI.submitOrder()">Submit order</button></div>`;
    h += `<p class="mute">Suggested = forecast for the days this truck covers + 25% of the first day (safety stock) − (on hand − what still sells before the truck) − 80% of expected DSD, rounded up to cases. Daily forecast = 7-day average demand (sales + lost sales) × endcap lift × day-of-week factor (${WEEKDAYS.map(w => w + ' ' + DOW_FACTOR[w]).join(', ')}). Click a department for item detail.</p>`;
    if (this.drill) {
      const d = DEPT[this.drill];
      const rows = d.items.map(([n]) => {
        const hh = G.itemHistory[n].slice(-7), avg = sum(hh) / hh.length;
        const recent = sum(hh.slice(-3)) / 3, older = sum(hh.slice(0, 4)) / 4;
        return { n, hh, avg, trend: older ? recent / older - 1 : 0 };
      });
      const totAvg = sum(rows.map(r => r.avg)) || 1;
      h += `<h3>Item forecast — ${d.name}</h3><table><tr><th>Item</th><th>Last 7 days</th><th class="n">Avg/day</th><th class="n">Share</th><th class="n">Trend</th><th class="n">Forecast (truck)</th><th class="n">≈ Cases</th></tr>` +
        rows.sort((a, b) => b.avg - a.avg).map(r => {
          let dfc = 0; for (let k = 1; k <= cover; k++) dfc += forecastFor(d.id, td + k);
          const share = r.avg / totAvg, fc = dfc * share;
          const tr = Math.round(r.trend * 100);
          return `<tr><td>${r.n}</td><td>${spark(r.hh)}</td><td class="n">${r.avg.toFixed(1)}</td><td class="n">${(share * 100).toFixed(0)}%</td>
            <td class="n ${tr > 8 ? 'good' : tr < -8 ? 'bad' : 'mute'}">${tr > 0 ? '▲' : tr < 0 ? '▼' : ''}${Math.abs(tr)}%</td><td class="n">${fc.toFixed(1)}</td><td class="n">${(fc / d.upc).toFixed(1)}</td></tr>`;
        }).join('') + '</table>';
    }
    return h;
  },
  setOrder(dept, v) {
    if (!G.order) G.order = suggestedOrder();
    G.order[dept] = Math.max(0, Math.floor(+v || 0));
    const el = $('ord-total'); if (el) el.textContent = sum(Object.values(G.order));
  },
  fillSuggested() { G.order = suggestedOrder(); this.render(); },
  submitOrder() {
    if (!orderOpen()) { toast('The order window is closed.', 'bad'); return; }
    if (!G.order) G.order = suggestedOrder();
    if (!G.orderSubmitted) addXP(15);
    G.orderSubmitted = true;
    toast(`Order transmitted: ${sum(Object.values(G.order))} cases for tonight's truck.`, 'good');
    this.render();
  },
  drillTo(d) { this.drill = this.drill === d ? null : d; this.render(); },

  tab_help() {
    return `<h2>Help & Settings</h2>
      <h3>Controls</h3><p><kbd>WASD</kbd>/<kbd>Arrows</kbd> move · <kbd>Shift</kbd> run · <kbd>E</kbd>/<kbd>Space</kbd> interact · <kbd>P</kbd> pause · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> speed 1×/2×/4× · <kbd>Esc</kbd> leave the computer</p>
      <h3>The daily loop</h3><ol>
      <li><b>5:00 AM</b> — Last night's truck is in Receiving. Break pallets down onto department floats (blue spots). You carry up to 3 cases.</li>
      <li>Push a float to its aisle and work it onto the shelf. When the shelf is full, take the overflow to Backstock (racks, top middle).</li>
      <li><b>7:00 AM</b> — Doors open. Every empty shelf is a lost sale and an unhappy customer.</li>
      <li>DSD vendors arrive at the green door and wait ${VENDOR_PATIENCE} minutes. Price tags: yellow = price change, red blinking = scan error.</li>
      <li>Cold (blue-outlined) pallets start spoiling at 9:00 AM if they're still in the back.</li>
      <li><b>10:00 PM</b> — Closing report. At night, pull pallets off the trailer into Receiving (or let overtime do it for a fee).</li></ol>
      <h3>Practice settings</h3>
      <label><input type="checkbox" ${RT.settings.labels ? 'checked' : ''} onchange="UI.setLabels(this.checked)"> Easy mode: show the aisle on case labels. Off by default, so you have to know where every item lives.</label>
      <h3>Save</h3><p class="mute">The game auto-saves in this browser every couple of in-game hours and at the start and end of each day.</p>
      <button class="danger" onclick="UI.newGameConfirm()">Start a new store</button>`;
  },
  setLabels(on) { RT.settings.labels = on; try { localStorage.setItem('groceryPractice.labels', on ? 'on' : 'off'); } catch (e) { /* ignore */ } },

  // ---------------- modals ----------------
  showModal(html) { RT.modal = true; RT.keys = {}; $('modal-card').innerHTML = html; $('modal').classList.remove('hidden'); },
  hideModal() { RT.modal = false; $('modal').classList.add('hidden'); },

  showWelcome() {
    this.showModal(`<h2>🛒 Grocery Practice</h2>
      <p>You're running the store. Every night a truck comes in, and every morning that freight is waiting in <b>Receiving</b>. Get it sorted, worked to the shelf, and keep the store in stock without blowing the labor budget.</p>
      <h3>Your first morning</h3><ol>
      <li>Walk to a pallet in the yellow <b>Receiving</b> area and press <kbd>E</kbd> to grab cases (up to 3).</li>
      <li>Sort each case onto its department's float (blue spots). Labels tell you the aisle.</li>
      <li>Push a float (<kbd>E</kbd>) to its aisle and press <kbd>E</kbd> at the shelf to work it.</li>
      <li>Visit the <b>office computer</b> (top-right) for reports, email, hiring, endcaps and tomorrow's order.</li></ol>
      <p><kbd>WASD</kbd>/<kbd>Arrows</kbd> move · <kbd>Shift</kbd> run · <kbd>E</kbd> interact · <kbd>P</kbd> pause · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> speed</p>
      <p class="mute">Tip: Dairy & Frozen pallets (blue outline) spoil if they sit. Work cold first.</p>
      <div class="row" style="justify-content:flex-end"><button class="primary" onclick="UI.hideModal()">Clock in for Day 1 →</button></div>`);
  },
  showContinue() {
    this.showModal(`<h2>Welcome back</h2><p>${dayLabel(G.day)} · Level ${level()} ${title()} · Career bonus ${money(G.bank)}</p>
      <div class="row" style="justify-content:flex-end"><button class="danger" onclick="UI.newGameConfirm()">Start over</button><button class="primary" onclick="UI.hideModal(); if (G.phase === 'summary') UI.showSummary(G.lastResult);">Continue</button></div>`);
  },
  newGameConfirm() {
    if (!confirm('Start a brand-new store? Your saved progress will be erased.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    this.closeComputer();
    newGame();
    this.showWelcome();
  },
  afterSummary() {
    this.hideModal();
    if (G.pendingReview) { const r = G.pendingReview; G.pendingReview = null; save(); this.showWeekReview(r, true); }
    else startNight();
  },
  reviewHTML(r) {
    const color = { A: '#3cc47c', B: '#7bd389', C: '#f0b429', D: '#f08a29', F: '#e5534b' }[r.grade];
    const notes = r.notes.map(n => `<div class="card" style="margin:8px 0;padding:8px 10px"><b>■ ${esc(n.title)}</b>
      <p style="margin:4px 0"><span class="mute">What I saw:</span> ${esc(n.saw)}</p>
      <p style="margin:4px 0"><span class="mute">Why it matters:</span> ${esc(n.why)}</p>
      <p style="margin:4px 0"><span class="mute">Do this next week:</span> <b>${esc(n.fix)}</b></p></div>`).join('');
    return `<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><h2>Week ${r.week} Review: District Manager</h2>
      <div class="mute">${r.days} day${r.days > 1 ? 's' : ''} · Sales ${money(r.sales)} of ${money(r.goal)} · Labor ${r.laborPct.toFixed(1)}% · In-stock ${(r.inStock * 100).toFixed(1)}%${r.oosAvg != null ? ' · Avg OOS ' + Math.round(r.oosAvg) : ''}</div></div>
      <div style="text-align:center"><div class="grade" style="color:${color}">${r.grade}</div><div class="mute">${Math.round(r.score)} avg</div></div></div>
      <p><i>"${esc(r.open)}"</i></p>${notes}
      ${r.also && r.also.length ? '<p class="mute">Also on my list: ' + esc(r.also.join(', ')) + '. Fix the ones above first.</p>' : ''}
      ${r.praise.length ? '<h3>What went right</h3><ul>' + r.praise.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>' : ''}
      <p>${esc(r.close)}</p>
      <p class="mute">Best day: ${r.best.dow} (Day ${r.best.day}, ${r.best.grade}) · Worst day: ${r.worst.dow} (Day ${r.worst.day}, ${r.worst.grade})</p>`;
  },
  showWeekReview(r, thenNight) {
    this.showModal(this.reviewHTML(r) + `<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="primary" onclick="UI.hideModal();${thenNight ? ' startNight();' : ''}">${thenNight ? 'Got it. Clock in for tonight →' : 'Close'}</button></div>`);
  },
  showSummary(res) {
    const color = { A: '#3cc47c', B: '#7bd389', C: '#f0b429', D: '#f08a29', F: '#e5534b' }[res.grade];
    const parts = res.parts.map(p => `<tr><td>${p.name}</td><td class="mute">${p.detail}</td><td class="n"><b>${Math.round(p.pts)}</b> / ${p.max}</td></tr>`).join('');
    this.showModal(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><h2>Day ${res.day} — Closing Report</h2><div class="mute">Doors locked at 11:00 PM</div></div>
      <div style="text-align:center"><div class="grade" style="color:${color}">${res.grade}</div><div class="mute">${Math.round(res.score)} / 100</div></div></div>
      <table>${parts}</table>
      <h3>Rewards</h3><p>+${res.xp + res.earnedToday} XP today (${res.earnedToday} from your own work) · Manager bonus +${money(res.bonus)} → career bank ${money(G.bank)}</p>
      <div>${res.badges.map(b => `<span class="badge" title="${BADGES[b].desc}">🏅 ${BADGES[b].name}</span>`).join('') || '<span class="mute">No badges today.</span>'}</div>
      <h3>Coach's notes</h3><ul>${res.tips.map(t => `<li>${t}</li>`).join('')}</ul>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="primary" onclick="UI.afterSummary()">${G.pendingReview ? 'Read the DM\'s weekly review →' : 'Clock in for tonight\'s truck →'}</button></div>`);
  },
};

function fit() {
  const hud = $('hud').offsetHeight, bar = $('bar').offsetHeight;
  const aw = window.innerWidth - 8, ah = window.innerHeight - hud - bar - 8;
  const s = Math.min(aw / canvas.width, ah / canvas.height);
  canvas.style.width = Math.floor(canvas.width * s) + 'px';
  canvas.style.height = Math.floor(canvas.height * s) + 'px';
}
