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
    $('btn-pc').onclick = e => { e.target.blur(); if (G && G.player.away) this.openComputer(); else toast('Walk to the computer in the OFFICE (top-right) and press E.', 'info'); };
    $('btn-home').onclick = e => { e.target.blur(); if (G && !G.player.away && (G.phase === 'day' || G.phase === 'night')) askGoHome(); };
    $('pc-close').onclick = () => this.closeComputer();
    window.addEventListener('resize', fit);
    window.addEventListener('keydown', e => {
      if (IVS.id != null) { if (e.key === 'Escape') ivsClose(); return; }
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
      // E / Space: tap to act, hold for More options (see holdRepeat and js/menu.js)
      if ((e.code === 'KeyE' || e.code === 'Space') && !isPaused()) { RT.eDownAt = performance.now(); RT.eMenuDone = false; }
      if (e.code === 'KeyQ' && !isPaused() && !G.player.work) {
        const it = getInteraction();
        if (it && it.alt && it.alt.fn) it.alt.fn();
      }
    });
    window.addEventListener('keyup', e => {
      RT.keys[e.code] = false;
      if ((e.code === 'KeyE' || e.code === 'Space') && RT.eDownAt) { const quick = !RT.eMenuDone; RT.eDownAt = 0; if (quick) doMainAction(); }
    });
    window.addEventListener('blur', () => { RT.keys = {}; });
    window.addEventListener('pagehide', () => { if (G && (G.phase === 'day' || G.phase === 'night')) save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G && (G.phase === 'day' || G.phase === 'night')) save(); });
    fit();
  },

  frame() {
    const p = G.player, el = $('prompt');
    if (p.work) { el.textContent = p.work.label + '…'; el.className = ''; }
    else {
      const it = isPaused() ? null : getInteraction();
      RT.curIt = it;
      RT.hl = it && it.fn && it.at ? it.at : null;
      const alt = it && it.alt && it.alt.fn ? `${TOUCH ? ' · Q: ' : '   [Q] '}${it.alt.label}` : '';
      if (it) { el.textContent = (it.fn ? (TOUCH ? '👆 ' : '[E] ') : '') + it.label + alt; el.className = it.bad ? 'bad' : ''; }
      else { el.textContent = this.hint(); el.className = 'hint'; }
    }
    if (p.work) { RT.hl = null; RT.curIt = null; }
    awayFrame();
    let hold = '';
    if (p.carry.length) hold = 'Holding: ' + p.carry.map(caseLabel).join(' · ');
    else if (p.floatId) { const f = floatById(p.floatId); if (f) hold = `Pushing ${DEPT[f.dept].aisle} ${DEPT[f.dept].name} float · ${plural(f.cases.length, 'case')}`; }
    else if (p.pallet) hold = `Pallet jack: ${plural(p.pallet.cases.length, 'case')}${p.pallet.cold ? ' (cold)' : ''}`;
    if (p.damages && p.damages.length) hold += (hold ? ' · ' : '') + `Damages for reclaim: ${p.damages.length}`;
    if (p.gobacks && p.gobacks.length) hold += (hold ? ' · ' : '') + `Go-backs: ${gbSummary(p.gobacks)}`;
    $('holding').textContent = hold;
    touchFrame();
    const now = performance.now();
    if (now - this.lastHud > 200) { this.lastHud = now; this.updateHUD(); }
  },

  hint() {
    if (RT.paused) return TOUCH ? 'Paused — tap ▶ to resume' : 'Paused — press P to resume';
    if (G.player.away) return 'Off the clock. Your next shift: ' + nextShiftText() + '.';
    if (G.phase === 'night') return G.trailer.length ? 'Night: pull pallets off the trailer at the dock doors (top-left), or press "End night".' : 'Trailer empty! Break down pallets or press "End night" to start tomorrow.';
    if (G.phase === 'day' && G.time < OPEN) return 'Doors open at 7:00 AM — get freight on the shelves.';
    if (G.vendorsToday.some(v => v.state === 'waiting')) return 'A DSD vendor is waiting at the back door (green DSD door).';
    if (recoveryNow() && (!facedAll(FACE_GOOD) || gobacksCart().length)) return `Recovery time: face every aisle (lowest ${DEPT[messiest()].aisle} ${Math.round(faceOf(messiest()))}%) and clear the go-back cart at the front end (${gobacksCart().length}).`;
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
    { const L = level(), a = xpForLevel(L), b = xpForLevel(L + 1); $('h-xp').style.width = (G.xp - a) / (b - a) * 100 + '%'; }
    $('h-bank').textContent = money(G.bank);
    document.querySelectorAll('[data-speed]').forEach(b => {
      const v = +b.dataset.speed;
      b.classList.toggle('on', v === 0 ? RT.paused : (!RT.paused && G.speed === v));
    });
    $('btn-endnight').classList.toggle('hidden', G.phase !== 'night');
    $('btn-home').classList.toggle('hidden', G.player.away || (G.phase !== 'day' && G.phase !== 'night'));
    const sk = mgrShift(G.day);
    $('btn-home').title = G.player.away ? '' : sk ? `Your shift: ${SHIFTS[sk].name}. Click to clock out and go home.` : 'Your day off. Click to go home.';
  },

  // ---------------- computer ----------------
  openComputer() { this.open = true; RT.keys = {}; $('computer').classList.remove('hidden'); this.render(); },
  closeComputer() { this.open = false; $('computer').classList.add('hidden'); },
  setTab(t) { this.tab = t; this.render(); },
  render() {
    const main = this['tab_' + this.tab]();
    const unread = G.emails.filter(m => !m.read).length;
    const tabs = [['today', '📋 Today'], ['dash', '📊 Reports'], ['mail', `📧 Email${unread ? ` (${unread})` : ''}`], ['crew', '👥 Crew'], ['sched', `🗓 Schedule${dowOf(G.day) === 'Thu' && G.sched && G.sched[weekOf(G.day) + 1] && !G.sched[weekOf(G.day) + 1].posted ? ' (!)' : ''}`], ['labor', `📑 Labor${forecastOpen() ? ' (!)' : ''}`], ['hire', '🤝 Hiring'], ['pnl', `📒 P&L${(G.pnl || []).length && !G.pnl[G.pnl.length - 1].plan ? ' (!)' : ''}`],
      ['display', '🏷️ Display Planner'], ['order', '📈 Forecast & Order'], ['counts', `🔢 Counts${countsToday().some(k => k.status === 'open') ? ` (${countsToday().filter(k => k.status === 'open').length})` : ''}`], ['sir', `🛒 Special Items${(G.sirs || []).some(s => s.status === 'open') ? ' (!)' : ''}`], ['layout', '🧱 Backroom Layout'], ['records', '🏆 Records'], ['help', '❓ Help & Settings']];
    $('pc-tabs').innerHTML = tabs.map(([k, l]) => `<button class="${this.tab === k ? 'on' : ''}" onclick="UI.setTab('${k}')">${l}</button>`).join('') +
      `<div style="flex:1"></div><div class="mute" style="font-size:12px;padding:6px">The clock is paused while you're logged in.</div>`;
    $('pc-main').innerHTML = main;
    stackWideTables($('pc-main'));
  },

  tab_sir() {
    const open = (G.sirs || []).filter(s => s.status === 'open');
    let h = `<h2>🛒 Special Item Requests</h2><p class="mute">Customers ask for items we don't carry. Each department has room for ${SKU_SLOTS} items, so to carry something new you deactivate one. Pick the slowest seller (lowest units in the last 7 days) unless the new item is a dud. Answer within 3 days: even a "no" beats silence.</p>`;
    if (!open.length) h += '<p class="mute">No open requests right now.</p>';
    for (const s of open) {
      const d = DEPT[s.dept];
      const rows = d.items.map(([n]) => [n, itemWeekUnits(n)]).sort((a, b) => a[1] - b[1]);
      h += `<div class="card" style="margin:10px 0"><b>${esc(s.item)}</b> · ${d.name} · requested ${dayLabel(s.day)} by ${esc(s.who.toLowerCase())} · <span class="warn">answer by Day ${s.day + 3}</span>
        <div>Vendor estimate: <b>${s.estWk} units/week</b> (estimates run ±25%)</div>
        <div style="margin-top:6px">Deactivate: <select id="sir-drop-${s.id}">${rows.map(([n, u], i) => `<option value="${esc(n)}">${esc(n)}: ${u} units last 7 days${i === 0 ? ' (slowest)' : ''}</option>`).join('')}</select>
        <button class="primary" onclick="approveSIR(${s.id}, document.getElementById('sir-drop-${s.id}').value); UI.render()">Approve & carry</button>
        <button onclick="declineSIR(${s.id}); UI.render()">Decline</button></div></div>`;
    }
    const past = (G.sirs || []).filter(s => s.status !== 'open').slice().reverse();
    if (past.length) h += '<h3>History</h3><table><tr><th>Item</th><th>Dept</th><th>Result</th><th class="n">Sold last 7 days</th><th>Dropped</th></tr>' + past.map(s => `<tr><td>${esc(s.item)}</td><td>${DEPT[s.dept].name}</td><td>${s.status === 'approved' ? '<span class="good">Carried</span>' : s.status === 'declined' ? 'Declined' : '<span class="bad">No answer</span>'}</td><td class="n">${s.status === 'approved' ? itemWeekUnits(s.item) : '—'}</td><td class="mute">${s.dropped ? esc(s.dropped) + ' (' + s.droppedWk + '/wk)' : ''}</td></tr>`).join('') + '</table>';
    return h;
  },
  tab_counts() {
    const L = countsToday();
    let h = `<h2>🔢 Cycle counts</h2><p class="mute">The system's on-hand is what came in on invoices minus what scanned at the register. Theft, mis-shipped cases and short deliveries never reach it, so it drifts, and the suggested order runs off it. Count a department: <b>E at its shelf</b>, then <b>E at its bird</b> in Backstock (either order). When both are counted the system takes your count. A Scan/Price Clerk works the list on their own; department clerks count their own department. You can also order anyone to count (click them on the floor).</p>`;
    h += '<h3>Today\'s count list</h3>';
    h += L.length ? '<table><tr><th>Department</th><th>Why</th><th>Shelf</th><th>Backstock</th><th>Result</th></tr>' + L.map(k => {
      const d = DEPT[k.dept], st = x => (x != null ? '<span class="good">✓</span>' : '○');
      const res = k.status === 'done' ? `System ${k.sys} → counted <b>${k.counted}</b> <span class="${k.variance < -d.upc ? 'bad' : k.variance > d.upc ? 'warn' : 'good'}">(${k.variance > 0 ? '+' : ''}${k.variance})</span> <span class="mute">by ${esc(k.by)}</span>` : k.status === 'missed' ? '<span class="bad">Missed</span>' : RT.countClaim && RT.countClaim[k.dept] ? `<span class="mute">${esc(crewName(RT.countClaim[k.dept]))} is counting</span>` : '<span class="warn">Open</span>';
      return `<tr><td><span class="dot" style="background:${d.color}"></span>${d.aisle} ${d.name}</td><td class="mute">${esc(k.why)}</td><td>${st(k.shelf)}</td><td>${st(k.back)}</td><td>${res}</td></tr>`;
    }).join('') + '</table>' : '<p class="mute">No counts today.</p>';
    if (G.phase === 'day') h += `<div style="margin:8px 0"><span class="mute">Add a count:</span> ${DEPTS.map(d => `<button ${countOpen(d.id) ? 'disabled' : ''} onclick="countAdd('${d.id}');UI.render()">${d.aisle}</button>`).join('')}</div>`;
    h += '<h3>On hand by department</h3><table><tr><th>Department</th><th class="n">System on hand</th><th>Last counted</th><th class="n">Last variance</th><th class="n">Empty-shelf flags</th></tr>';
    for (const d of DEPTS) {
      const lg = G.countLog[d.id], n = daysSinceCount(d.id), oh = sysOnHand(d.id), fl = G.ohFlag[d.id] || 0;
      h += `<tr><td><span class="dot" style="background:${d.color}"></span>${d.aisle} ${d.name}</td><td class="n">${oh} <span class="mute">(${(oh / d.upc).toFixed(1)} cs)</span></td>
        <td class="${n == null || n > 7 ? 'warn' : ''}">${n == null ? 'Not since you took over' : n === 0 ? 'Today' : n + ' day' + (n === 1 ? '' : 's') + ' ago'}</td>
        <td class="n">${lg ? `<span class="${Math.abs(lg.variance) > d.upc ? (lg.variance < 0 ? 'bad' : 'warn') : 'good'}">${lg.variance > 0 ? '+' : ''}${lg.variance}</span>` : '—'}</td><td class="n ${fl ? 'bad' : 'mute'}">${fl || '—'}</td></tr>`;
    }
    h += '</table><p class="mute">Empty-shelf flags: customers found the shelf <i>and</i> its bird empty while the system still showed at least a case. That\'s phantom inventory, and it goes to the top of tomorrow\'s list.</p>';
    const hist = (G.countHist || []).slice(-12).reverse();
    if (hist.length) {
      const wk = (G.countHist || []).filter(x => x.day > G.day - 7), ok = wk.filter(x => x.ok).length;
      h += `<h3>Recent counts</h3><p class="mute">Last 7 days: <b>${ok} of ${wk.length}</b> counts were within tolerance (±3% or 3 units) of the system. The rest were drift the system didn't know about.</p><table><tr><th>Day</th><th>Department</th><th class="n">System</th><th class="n">Counted</th><th class="n">Variance</th><th>By</th></tr>` +
        hist.map(x => `<tr><td class="mute">${dayLabel(x.day)}</td><td>${DEPT[x.dept].aisle} ${DEPT[x.dept].name}</td><td class="n">${x.sys}</td><td class="n">${x.counted}</td><td class="n ${x.ok ? 'good' : x.variance < 0 ? 'bad' : 'warn'}">${x.variance > 0 ? '+' : ''}${x.variance}</td><td class="mute">${esc(x.by)}</td></tr>`).join('') + '</table>';
    }
    return h;
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
    h += '</table>';
    h += weatherStripHTML(false);
    h += recallTodayHTML();
    h += resetTodayHTML();
    { const toScan = binToScan(), claim = toScan.filter(d => d.src === 'truck' && d.day === G.day).length, t = G.today;
      h += `<h3>Reclaim</h3><p>${floorDamages().length ? `<span class="warn">${plural(floorDamages().length, 'damaged item')} on the floor.</span> ` : ''}Bin: <b>${toScan.length}</b> to scan${claim ? ` (<span class="good">${claim} truck damage claim${claim === 1 ? '' : 's'}: scan today for full credit</span>)` : ''}, ${binHeld().length} held for DSD vendors. Credits today: <b>${money(t.credits || 0)}</b>, written off ${money(t.dmgLoss || 0)}.</p><p class="mute">The reclaim bin is in the backroom by the office door. Today's truck damage scanned today is a claim (full cost back); other dry damages get 50% reclaim credit; cold damages are thrown away; DSD vendors credit their own damages in full at check-in if they're in the bin.</p>`; }
    h += '<h3>Invoices (last night\'s trucks)</h3><div class="row">';
    const closed = G.today.invoicesClosed || [];
    for (const ty of lastNightTrucks()) {
      const ok = truckWorked(ty), done = closed.includes(ty);
      h += `<button ${done || !ok ? 'disabled' : ''} onclick="closeInvoice('${ty}');UI.render()">${done ? '✓ ' : ''}${ty}${!ok && !done ? ' (still being worked)' : ''}</button>`;
    }
    const dsdOk = dsdAllDone(), dsdDone = closed.includes('DSD');
    h += `<button ${dsdDone || !dsdOk ? 'disabled' : ''} onclick="closeInvoice('DSD');UI.render()">${dsdDone ? '✓ ' : ''}DSD vendors${!dsdOk && !dsdDone ? ' (vendors still due)' : ''}</button></div>`;
    h += cutsTodayHTML();
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
    let h = `<h2>Crew</h2><p class="mute">Change roles any time. "Usual shift" changes their shift for the rest of this week and next week (days off stay off); set day-by-day shifts in 🗓 Schedule. Crew slots: ${G.crew.length}/${maxCrew()} (${maxCrew() < MAX_CREW ? 'level up for more' : 'the most this store can hold'}). Team morale: <b style="color:${moodOf({ morale: teamMorale(), trait: 'quiet' }).col}">${Math.round(teamMorale())}%</b></p>`;
    h += `<table><tr><th>Name</th><th>Role</th><th>Usual shift</th><th>Skill</th><th>Rank</th><th>Training</th><th>Morale</th><th class="n">Coached</th><th class="n">Days</th><th class="n">Wage</th><th>Right now</th><th></th></tr>`;
    for (const c of G.crew) {
      const r = RT.crew[c.id];
      const status = c.calledOut ? (c.ncnsDay === G.day ? '<span class="bad">No-call no-show</span>' : '<span class="bad">Called out</span>') : isLate(c) ? '<span class="warn">Late, not here yet</span>' : !curShift(c) ? '<span class="mute">Off today</span>' : onShift(c) ? (r && r.inBuilding ? `<span class="good">${r.intent || 'On the clock'}</span>` : 'Clocking in') : '<span class="mute">Off the clock</span>';
      h += `<tr><td><span class="dot" style="background:${ROLES[c.role].color}"></span>${esc(c.name)}${discBadge(c)}<div class="mute" style="font-size:12px">${availText(c.avail)}</div></td>
        <td><select onchange="UI.setRole(${c.id},this.value)">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === c.role ? 'selected' : ''}>${v.name}</option>`).join('')}</select></td>
        <td><select onchange="UI.setShift(${c.id},this.value)">${Object.entries(SHIFTS).map(([k, v]) => `<option value="${k}" ${k === c.shift ? 'selected' : ''}>${v.name}</option>`).join('')}</select></td>
        <td>${stars(c.skill)}</td><td>${rankHTML(c)}</td><td>${trainMeter(c)}</td><td title="${TRAITS[ensureMorale(c).trait].desc}" style="white-space:nowrap">${moodOf(c).icon} ${Math.round(c.morale)}% <span class="mute">${TRAITS[c.trait].name}</span>${c.strikes ? ` <span class="warn">${c.strikes}✎</span>` : ''}</td><td class="n">${c.coached || 0}</td><td class="n">${c.days || 0}</td><td class="n">$${c.wage.toFixed(2)}/hr<div class="mute" style="font-size:11px">${reviewDue(c) ? '<span class="warn">review due</span>' : `review Day ${c.nextReview}`}</div></td><td>${status}${c.needsCoach ? ' <span class="bad">⚠ needs coaching</span>' : ''}${c.notice ? ` <span class="bad">🚪 gave notice (last day ${c.notice})</span>` : ''}${c.promoAsk ? ' <span class="warn">📈 asked to move up</span>' : ''}${c.sentHome === G.day ? ' <span class="mute">sent home</span>' : ''}</td>
        <td style="white-space:nowrap">${c.asm ? '<span class="good">🏅 Asst. Manager</span> ' : c.lead ? '<span class="good">◆ Lead</span> ' : canPromote(c) ? `<button onclick="UI.promote(${c.id})">Promote</button> ` : ''}${reviewDue(c) ? `<button class="${G.day - c.nextReview >= PERF_LATE ? 'danger' : 'primary'}" onclick="UI.review(${c.id})">📝 Review${G.day > c.nextReview ? ` (${G.day - c.nextReview}d late)` : ''}</button> ` : ''}<button onclick="showOrders(G.crew.find(x => x.id === ${c.id}))">📌 Orders</button> <button class="${discDue(c) ? 'primary' : ''}" onclick="UI.disc(${c.id})" title="Corrective action">✎</button> <button class="danger" onclick="UI.fire(${c.id})">Fire</button></td></tr>`;
    }
    h += '</table>';
    const tdy = G.crew.map(c => [c, curShift(c)]).filter(([c, k]) => k && !c.calledOut);
    const proj = sum(tdy.filter(([, k]) => k !== 'night').map(([c, k]) => paidMin(k) / 60 * c.wage));
    const projN = sum(tdy.filter(([, k]) => k === 'night').map(([c, k]) => paidMin(k) / 60 * c.wage));
    h += `<p>Scheduled day labor: <b>${money(proj)}</b> ≈ <b>${(proj / Math.max(1, G.today.goal) * 100).toFixed(1)}%</b> of today's sales goal. Night crew: <b>${money(projN)}</b> (charged to the next day). Target ≤ ${LABOR_TARGET}%.</p>`;
    h += `<h3>Training & coaching</h3><p class="mute">New hires make mistakes: wrong floats, cardboard left in aisles, wrong tags, short DSD deliveries, phone breaks. A red <b class="bad">!</b> appears over their head. Walk up and press <kbd>E</kbd> to coach them within 2 hours, or the mistake becomes a habit. Rookie → Trained → Pro → <b style="color:#ffd34d">★ Superstar</b> (85% trained, coached 8+ times, 3+ days on the job): 15% faster, no mistakes, and mentors rookies on their shift.</p>`;
    h += `<h3>Morale, conflicts & promotions</h3><p class="mute">Morale changes work speed (−15% when miserable, +5% when fired up) and call-outs. It goes up when you thank people (walk up and press <kbd>E</kbd>, once a day each), coach them, promote them and have good days. It goes down with shift changes, bad days, being ignored for 3+ days, unhandled arguments and unfair discipline. Below 20%, people give 3 days' notice: talk to them to turn it around. When an argument starts (orange <b style="color:#ff8c1a">!!</b>), walk over and press <kbd>E</kbd>: talk it out, split them up, write up, send home or let go. The right call depends on how serious it is and the person's write-up history. Pros and Superstars with 5+ days can be promoted to <b>◆ Lead</b> (+$${LEAD_RAISE.toFixed(2)}/hr, max ${MAX_LEADS}): leads work 5% faster, lift morale on their shift and calm arguments.</p>`;
    h += successorHTML();
    const ex = (G.exits || []).slice().reverse();
    if (ex.length) h += '<h3>Exit interviews</h3><table><tr><th>Name</th><th>Left</th><th>Why</th><th class="n">Days</th><th>What they said</th></tr>' + ex.map(e => `<tr><td>${esc(e.name)}</td><td>${dayLabel(e.day)}</td><td>${e.why === 'quit' ? '<span class="bad">Quit</span>' : e.why === 'promoted' ? '<span class="good">Promoted: own store</span>' : 'Let go'}</td><td class="n">${e.days}</td><td class="mute">${e.why === 'quit' ? esc(e.gripes.map(g => GRIPE_TEXT[g]).join(' ') || 'It just wasn\'t working out.') : '—'}</td></tr>`).join('') + '</table>';
    h += `<h3>Roles</h3><table>${Object.values(ROLES).map(r => `<tr><td style="white-space:nowrap"><span class="dot" style="background:${r.color}"></span><b>${r.name}</b></td><td class="mute">${r.desc}</td></tr>`).join('')}</table>`;
    return h;
  },
  order(id, kind, dept) { const c = G.crew.find(x => x.id === id); if (!c) return; if (kind) giveOrder(c, kind, dept); else clearOrder(c, 'was taken off'); this.hideModal(); if (this.open) this.render(); },
  promote(id) { const c = G.crew.find(x => x.id === id); if (c) { promoteCrew(c); c.leadDay = G.day; } this.render(); },
  devPick(id) { const c = G.crew.find(x => x.id === id); if (c) devPick(c); this.render(); },
  devTask(k) { devAssign(k); this.render(); },
  devStop() { devStop(); this.render(); },
  devLead() { devPromoteLead(); this.render(); },
  devAsm() { devPromoteAsm(); this.render(); },
  asmGo(yes) { if (yes) asmRecommend(); else asmNotYet(); this.render(); },
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
  setShift(id, sh) {
    const c = G.crew.find(x => x.id === id); if (!c || c.shift === sh) return;
    const w = weekOf(G.day);
    if ((c.days || 0) > 0 && schedFor(w).posted) bump(c, -4, 'schedule');
    c.shift = sh;
    [w, w + 1].forEach(wk => { const s = G.sched && G.sched[wk]; if (!s || !s.rows[id]) return; s.rows[id] = s.rows[id].map((v, i) => v === OFF || (wk === w && i < dowIdx(G.day)) ? v : sh); });
    const r = RT.crew[id]; if (r && r.plan) finishPlan(c, r); this.render();
  },
  tab_sched() {
    const cw = weekOf(G.day), w = this.schedWeek === cw + 1 ? cw + 1 : cw;
    const s = schedFor(w), ws = weekStart(w), ti = w === cw ? dowIdx(G.day) : -1;
    let h = `<h2>🗓 Schedule</h2><div class="row">${[cw, cw + 1].map(x => `<button class="${x === w ? 'primary' : ''}" onclick="UI.schedWeek=${x};UI.render()">Week ${x} (${x === cw ? 'this week' : 'next week'})</button>`).join(' ')}</div>`;
    h += `<p class="mute">Week ${w}: ${fmtMD(ws)} to ${fmtMD(ws + 6)} · ${s.posted ? `<span class="good">Posted${s.postedBy === 'auto' ? ' (auto-posted)' : ''}</span>. Changes now cost that person's morale.` : `<span class="warn">Not posted.</span> Post it by Thursday ${fmtTime(SCHED_CUTOFF)}; after that, every change costs morale.`} Paid hours = shift length minus a 1-hour unpaid lunch on shifts over 6 hours. Over 40 paid hours in a week is overtime (1.5x). <b>You</b> are on here too: you come in for your shifts, and the crew runs the store when you're off (store managers are salaried, so your shifts count in full).</p>`;
    h += ptoPanelHTML(w);
    const opt = (v, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v === OFF ? '— Off —' : SHIFTS[v].name}</option>`;
    h += `<div style="overflow-x:auto"><table style="font-size:15px"><tr><th>Name</th>${WEEKDAYS.map((d, i) => `<th${i === ti ? ' style="color:#fff3d6"' : ''}>${d} ${fmtMD(ws + i)}${i === ti ? ' ◀' : ''}</th>`).join('')}<th class="n">Hrs</th></tr>`;
    {
      const row = s.rows[MGR], hrs = mgrPaidMin(w) / 60, worked = ((G.mgrMin || {})[w] || 0) / 60;
      h += `<tr style="background:#2a220855"><td style="white-space:nowrap"><span class="dot" style="background:#ffd34d"></span><b>You</b><div class="mute" style="font-size:12px">Store Manager · GR-Mgr${w === cw ? ` · worked ${worked.toFixed(1)} h` : ''}</div></td>` +
        row.map((v, i) => `<td><select style="font-size:14px;max-width:118px${v === OFF ? ';color:#7a6a50' : ''}" ${i < ti ? 'disabled' : ''} onchange="UI.schedSet(${w},'mgr',${i},this.value)">${opt(OFF, v)}${Object.keys(SHIFTS).map(k => opt(k, v)).join('')}</select></td>`).join('') +
        `<td class="n"><b>${hrs.toFixed(0)}</b></td></tr>`;
    }
    for (const c of G.crew) {
      const row = s.rows[c.id], hrs = weekPaidMin(w, c) / 60;
      h += `<tr><td style="white-space:nowrap"><span class="dot" style="background:${ROLES[c.role].color}"></span>${esc(c.name)}<div class="mute" style="font-size:12px">${ROLES[c.role].name} · ${LD_ROWS.find(r => r.key === roleRow(c.role)).name}</div><div class="mute" style="font-size:12px">${availText(c.avail)}${c.availNext ? `<br><span class="warn">From wk ${c.availNext.from}: ${availText(c.availNext.row)}</span>` : ''}</div></td>` +
        row.map((v, i) => { const day = ws + i, p = ptoOf(c.id, day), av = c.availNext && w >= c.availNext.from ? c.availNext.row : c.avail, bad = v !== OFF && ((p && p.state === 'approved') || !shiftFits(av[i], v)), na = av[i] && av[i] !== 'any';
          return `<td${bad ? ' style="background:#6a1f1f" title="Won\'t come in: ' + (p && p.state === 'approved' ? 'approved day off' : 'outside their availability') + '"' : ''}><select style="font-size:14px;max-width:118px${v === OFF ? ';color:#7a6a50' : ''}" ${i < ti ? 'disabled' : ''} onchange="UI.schedSet(${w},${c.id},${i},this.value)">${opt(OFF, v)}${Object.keys(SHIFTS).map(k => opt(k, v)).join('')}</select>${p && p.state !== 'denied' ? `<div style="font-size:11px" class="${p.state === 'approved' ? 'good' : p.state === 'pending' ? 'warn' : 'bad'}">${p.state === 'approved' ? 'PTO' : p.state === 'pending' ? 'asked off' : 'asked off (no answer)'}</div>` : na ? `<div style="font-size:11px" class="mute">${AVAIL_WORD[av[i]]}</div>` : ''}</td>`; }).join('') +
        `<td class="n ${hrs > 40 ? 'bad' : ''}"><b>${hrs.toFixed(0)}</b>${hrs > 40 ? ' OT' : ''}</td></tr>`;
    }
    const sc = scheduledByRow(w), dd = WEEKDAYS.map((_, i) => dayDemand(ws + i));
    const schD = WEEKDAYS.map((_, i) => sum(LD_ROWS.map(r => sc[r.key][i]))), dmD = dd.map(d => sum(LD_ROWS.map(r => d[r.key])));
    const closers = WEEKDAYS.map((_, i) => G.crew.filter(c => s.rows[c.id] && s.rows[c.id][i] === 'close').length);
    h += `<tr><td><b>Scheduled hrs</b></td>${schD.map(x => `<td class="n">${x.toFixed(2)}</td>`).join('')}<td class="n"><b>${sum(schD).toFixed(2)}</b></td></tr>`;
    h += `<tr><td><b>Labor demand</b></td>${dmD.map(x => `<td class="n">${x.toFixed(2)}</td>`).join('')}<td class="n"><b>${sum(dmD).toFixed(2)}</b></td></tr>`;
    h += `<tr><td><b>Diff</b> <span class="mute">(sched − dmd)</span></td>${schD.map((x, i) => `<td class="n ${ldFlag(dmD[i], x) ? (x > dmD[i] ? 'warn' : 'bad') : 'good'}">${ldNum(x - dmD[i])}</td>`).join('')}<td class="n ${ldFlag(sum(dmD), sum(schD)) ? 'bad' : 'good'}"><b>${ldNum(sum(schD) - sum(dmD))}</b></td></tr>`;
    h += `<tr><td><b>Closers</b> <span class="mute">(rule: ${CLOSERS_REQUIRED})</span></td>${closers.map(n => `<td class="n ${n >= CLOSERS_REQUIRED ? 'good' : 'mute'}">${n}</td>`).join('')}<td></td></tr></table></div>`;
    h += '<div class="row" style="margin-top:10px">';
    if (!s.posted) h += `<button class="primary" onclick="UI.schedPost(${w})">Post week ${w} schedule</button> `;
    if (!s.posted && w > cw) h += `<button onclick="UI.schedCopy(${w})">Copy this week's schedule</button> <button onclick="UI.schedReset(${w})">Reset to usual shifts</button>`;
    h += `</div><p class="mute">Labor demand comes from the week's forecast (📑 Labor). It's earned by the work: truck cases, sales, DSD vendors, price tags and the ad flip. Red diff = short on hours, amber = over by more than 2 hours or 10%. Match each day, not just the week: a heavy truck day needs the hours that day.</p>`;
    return h;
  },
  schedSet(w, id, i, v) { setSched(w, id, i, v); this.render(); },
  schedPost(w) {
    const probs = schedProblems(w), pend = ptoPending().filter(p => weekOf(p.day) === w);
    if (!probs.length && !pend.length) { postSchedule(w); this.render(); return; }
    this.ask(`Post week ${w} with problems?`, [probs.length ? `${plural(probs.length, 'shift')} won't be worked: ${probs.slice(0, 4).map(x => `${x.c.name} on ${WEEKDAYS[x.i]} (${x.why})`).join('; ')}${probs.length > 4 ? '…' : ''}.` : '', pend.length ? `${plural(pend.length, 'time-off request')} for this week ${pend.length === 1 ? 'is' : 'are'} still unanswered; posting counts as a no.` : ''].filter(Boolean).join(' '), 'Post anyway', () => { postSchedule(w); this.render(); });
  },
  ptoAnswer(id, yes) { answerPto(id, yes); this.render(); },
  schedCopy(w) { const src = schedFor(w - 1), dst = schedFor(w); if (dst.posted) return; G.crew.forEach(c => { if (src.rows[c.id]) dst.rows[c.id] = src.rows[c.id].slice(); }); if (src.rows[MGR]) dst.rows[MGR] = src.rows[MGR].slice(); this.render(); },
  schedReset(w) { const dst = schedFor(w); if (dst.posted) return; G.crew.forEach((c, i) => { dst.rows[c.id] = defaultRow(c, i); }); dst.rows[MGR] = MGR_DEFAULT.slice(); this.render(); },
  tab_labor() {
    const cw = weekOf(G.day), nf = G.fc && G.fc[cw + 1];
    let h = '<h2>📑 Labor</h2>';
    if (nf && !nf.locked && forecastOpen()) {
      const ws = weekStart(cw + 1), sea = seasonOfWeek(cw + 1);
      const act = day => { const p = G.pastDays.find(x => x.day === day); return p ? money(p.sales) : '<span class="mute">—</span>'; };
      h += `<div class="card" style="margin:8px 0"><h3 style="margin-top:0">Forecast week ${cw + 1} (${fmtMD(ws)} to ${fmtMD(ws + 6)}) · <span class="warn">window closes ${fmtTime(FORECAST_CUTOFF)} today</span></h3>
        <p class="mute">The system forecast is last week's average times the day-of-week pattern. Adjust each day by percent for what the system can't see.${sea ? ` <b class="warn">Next week: ${sea.name}</b> (${esc(sea.tip)})` : ''}</p>
        <table><tr><th>Day</th><th class="n">Last week actual</th><th class="n">This week actual</th><th class="n">System</th><th class="n">Your adj %</th><th class="n">Your forecast</th></tr>`;
      for (let i = 0; i < 7; i++) {
        const d = ws + i;
        h += `<tr><td>${WEEKDAYS[i]} ${fmtMD(d)}</td><td class="n">${act(d - 14)}</td><td class="n">${act(d - 7)}</td><td class="n">${money(nf.sys[i])}</td><td class="n"><input type="number" step="1" min="-50" max="100" value="${nf.adj[i]}" onchange="UI.fcAdj(${i},this.value)"></td><td class="n"><b>${money(fcSales(nf, d))}</b></td></tr>`;
      }
      h += `<tr><td><b>Week</b></td><td></td><td></td><td class="n">${money(sum(nf.sys))}</td><td></td><td class="n"><b>${money(sum(WEEKDAYS.map((_, i) => fcSales(nf, ws + i))))}</b></td></tr></table>
        <div class="row" style="margin-top:8px"><button class="primary" onclick="UI.fcSubmit()">Submit forecast</button> <span class="mute">The report below updates as you adjust.</span></div></div>`;
    } else if (nf && nf.locked) h += `<p class="mute">Week ${cw + 1} forecast: <b>${nf.by === 'you' ? 'submitted by you' : 'system forecast (window missed)'}</b>. Next forecast: Monday by ${fmtTime(FORECAST_CUTOFF)}.</p>`;
    else h += `<p class="mute">Every Monday you forecast next week's sales (window closes ${fmtTime(FORECAST_CUTOFF)}). Your forecast earns next week's labor demand.</p>`;
    const weeks = Object.keys(G.fc || {}).map(Number).filter(x => x >= cw - 3 && x <= cw + 1).sort((a, b) => a - b);
    const w = weeks.includes(this.ldWeek) ? this.ldWeek : (nf ? cw + 1 : cw);
    h += `<div class="row">${weeks.map(x => `<button class="${x === w ? 'primary' : ''}" onclick="UI.ldWeek=${x};UI.render()">Week ${x}${x === cw ? ' (this week)' : x === cw + 1 ? ' (next week)' : ''}</button>`).join(' ')}</div>`;
    h += this.ldReportHTML(exceptionReport(w));
    h += `<h3>How demand is earned</h3><table style="font-size:15px">
      <tr><td>GR-HV-LV-DSD</td><td class="mute">Forecast dry truck cases (HV, LV, KeHe) ÷ ${STD.dryCPH} cases/hr. Counts Truck Breakdown, Freight Pusher, HBC Clerk and Night Unloader hours.</td></tr>
      <tr><td>GR-Dairy / GR-Frozen</td><td class="mute">Forecast cold truck cases ÷ ${STD.coldCPH} cases/hr, plus ${STD.dairyDaily} / ${STD.frozenDaily} hrs a day for code checks, rotation and holes.</td></tr>
      <tr><td>GR-HV-LV-DSD-RPLN</td><td class="mute">Forecast units sold ÷ ${STD.rplnUnitsPH} per hour (at least ${STD.rplnMin} hrs). Replenishment and closers.</td></tr>
      <tr><td>GR-DSD Receiving</td><td class="mute">${STD.dsdPerVendor} hr per scheduled DSD vendor.</td></tr>
      <tr><td>GR-Scan Price</td><td class="mute">${STD.tagHrs} hr per price change tag, + ${STD.adFlip} hrs Tuesday (ad flip) and ${STD.adVerify} hr Wednesday (ad verify).</td></tr>
      <tr><td>Weekly roles</td><td class="mute">Mgr, POG, FS Sampling, Misc and Train earn hours for the week only. Train = 4 hrs per new hire.</td></tr></table>`;
    return h;
  },
  fcAdj(i, v) { const f = G.fc[weekOf(G.day) + 1]; if (!f || f.locked) return; f.adj[i] = clamp(Math.round(+v || 0), -50, 100); this.render(); },
  fcSubmit() { lockForecast(weekOf(G.day) + 1, 'you'); this.render(); },
  ldReportHTML(r) {
    const ws = r.from, cell = (v, b) => `<td class="n">${b ? '<b>' : ''}${v}${b ? '</b>' : ''}</td>`;
    let h = `<div class="card" style="margin:10px 0;overflow-x:auto"><div style="font:700 12px var(--pix);color:var(--acc)">Labor Demand Exception</div>
      <div class="mute" style="font-size:14px">Location: GP-01 - Practice Store - ${fmtMDY(r.from)} to ${fmtMDY(r.to)} · Department: Grocery · Demand from: ${r.fc ? (r.fc.locked ? (r.fc.by === 'you' ? 'your forecast' : 'the system forecast') : 'your forecast (not submitted yet)') : 'system'}</div>
      <table style="font-size:12px;white-space:nowrap"><tr><th>Role</th>${WEEKDAYS.map((d, i) => `<th colspan="3" style="text-align:center">${d} ${fmtMD(ws + i)}</th>`).join('')}<th colspan="3" style="text-align:center">Total</th></tr>
      <tr><th></th>${'<th class="n">Dmd</th><th class="n">Sched</th><th class="n">Diff</th>'.repeat(8)}</tr>`;
    for (const row of r.rows) {
      const b = !!row.total;
      h += `<tr${b ? ' style="background:#ffb23812"' : ''}><td>${b ? '<b>' + row.name + '</b>' : row.name}</td>`;
      for (let i = 0; i < 7; i++) {
        if (row.weekly || row.weeklyTot) h += '<td></td><td></td><td></td>';
        else h += cell(row.dmd[i].toFixed(2), b) + cell(row.sch[i].toFixed(2), b) + cell(ldNum(row.sch[i] - row.dmd[i]), b);
      }
      const flag = ldFlag(row.tD, row.tS);
      h += cell(row.tD.toFixed(2), b) + cell(row.tS.toFixed(2), b) + `<td class="n ${flag ? (row.tS < row.tD ? 'bad' : 'warn') : ''}">${flag || b ? '<b>' : ''}${ldNum(row.tS - row.tD)}${flag || b ? '</b>' : ''}</td></tr>`;
    }
    return h + '</table><div class="mute" style="font-size:13px;margin-top:4px">Diff = Sched − Dmd. Bold weekly diff = exception (off by more than 2 hours or 10%). These roles only earn hours for the week: Mgr, POG, FS Sampling, Misc, Train.</div></div>';
  },
  fire(id) {
    const c = G.crew.find(x => x.id === id);
    this.ask(`Let ${c.name} go?`, `This can't be undone. Write-ups on file: ${c.strikes || 0}; discipline step: ${DISC_LEVELS[ensureDisc(c).disc.level]}. Firing without documentation hurts team morale. For attendance or performance, use ✎ Corrective action: HR approves a termination after a final warning.`, 'Let them go', () => {
      if (!G.crew.includes(c)) return;
      letGo(c, 'fired');
      toast(`${c.name} was let go.`);
      if (this.open) this.render();
    }, true);
  },

  tab_pnl() { return pnlTabHTML(); },
  pnlPlan(w, k) { pickPlan(w, k); this.render(); },
  tab_hire() {
    const full = G.crew.length >= maxCrew();
    const ivLeft = IV_PER_DAY - (G.today.interviews || 0);
    let h = `<h2>Hiring</h2><p class="mute">New applicants every morning. ${full ? '<span class="warn">All crew slots are full — let someone go or level up.</span>' : `Open slots: ${maxCrew() - G.crew.length}.`} A résumé only tells you so much: <b>interview</b> first (${IV_QUESTIONS} questions each, ${ivLeft} interview${ivLeft === 1 ? '' : 's'} left today). You can change a hire's role and shift later in Crew and 🗓 Schedule.</p><div class="cand">`;
    h += G.candidates.map(c => `<div class="card"${this.ivId === c.id ? ' style="outline:2px solid #ffd34d"' : ''}><div class="v" style="font-size:16px">${esc(c.name)}</div><div><span class="dot" style="background:${ROLES[c.role].color}"></span>${ROLES[c.role].name}</div>
      <div class="s" style="margin:4px 0">${ROLES[c.role].desc}</div><div><b>$${c.wage.toFixed(2)}/hr</b> · wants ${SHIFTS[c.shift].name}</div>${applicantNotes(c).map(x => `<div class="s">${x}</div>`).join('')}
      ${c.withdrew ? '<div class="bad" style="margin-top:8px">Withdrew their application</div>' : `<div class="row" style="margin-top:8px">${!c.iv ? `<button ${ivLeft <= 0 ? 'disabled' : ''} onclick="UI.interview(${c.id})">🗣 Interview</button> ` : c.iv.done ? '' : `<button onclick="UI.ivId=${c.id};ivsOpen(${c.id})">🗣 Continue</button> `}<button class="${c.iv ? 'primary' : ''}" ${full ? 'disabled' : ''} onclick="UI.hire(${c.id})">${c.iv ? 'Hire' : 'Hire on the spot'}</button></div>`}</div>`).join('') || '<p class="mute">No applicants left today. Check back tomorrow.</p>';
    h += '</div>';
    const k = G.candidates.find(x => x.id === this.ivId);
    if (k && k.iv) {
      h += `<div class="card" style="margin-top:12px"><h3>🗣 Interview: ${esc(k.name)} <span class="mute">(${ROLES[k.role].name})</span></h3>`;
      h += k.iv.qs.map(x => `${x.q ? `<div style="margin-top:6px"><b>You:</b> ${esc(x.q)}</div>` : ''}<div class="${x.bad ? 'bad' : ''}" style="margin-left:12px"><i>${x.q ? `${esc(k.name.split(' ')[0])}: ` : ''}${esc(x.a)}</i></div>`).join('');
      if (!k.iv.done && !k.withdrew) h += `<p class="mute" style="margin-top:8px">Questions left: ${IV_QUESTIONS - k.iv.qs.length}.</p><button class="primary" onclick="ivsOpen(${k.id})">🗣 Back to the interview</button>`;
      else h += `<p class="mute" style="margin-top:8px">Interview over. What you learned is on their card.</p>`;
      h += '</div>';
    }
    h += '<p class="mute">Skill sets walking and working speed (★1 ≈ 82%, ★5 ≈ 130%). Applicants ask for a wage that matches the skill their résumé claims. Keep questions about the job: never ask about age, kids or family, religion, or where someone is from.</p>';
    return h;
  },
  interview(id) { startInterview(id); const k = G.candidates.find(x => x.id === id); if (k && k.iv) { this.ivId = id; this.render(); ivsOpen(id); } else this.render(); },
  hire(id) {
    if (G.crew.length >= maxCrew()) return;
    const k = G.candidates.find(x => x.id === id);
    if (!k || k.withdrew) return;
    G.candidates = G.candidates.filter(x => x !== k);
    G.crew.push(ensureMorale(ensureTrain({ id: k.id, name: k.name, role: k.role, shift: k.shift, avail: k.trueAvail || k.avail || makeAvail(k.shift), trait: k.trait, rel: k.rel, skill: k.skill, wage: k.wage, calledOut: false }, k.exp != null ? k.exp : hireTrainingBase(k.skill))));
    applyHire(G.crew[G.crew.length - 1], k);
    ensurePerf();
    schedNewHire(G.crew[G.crew.length - 1]);
    toast(`Hired ${k.name} as ${ROLES[k.role].name} (${SHIFTS[k.shift].name}).`, 'good');
    this.render();
  },

  tab_display() {
    let h = `<h2>Display Planner</h2><p class="mute">Each stocked endcap lifts its department's sales +12% (max 2 per department), and some of that department's shoppers take product off it instead of the shelf. An endcap holds ${EC_CASES} cases, built from the department's backstock. Picking a display here only <b>plans</b> it: the flip happens on the floor, Tuesday from 6 PM until Wednesday noon. Two steps per endcap: <b>take down</b> the old display and put its product back on its bird in BACKSTOCK, then <b>pull</b> the new product off its bird and <b>build</b> the display. Ad departments sell about ${Math.round((AD_LIFT - 1) * 100)}% faster all week. Taking a display down (plan it Empty) can happen any day. ${ecWindow() ? '<span class="good">The switch window is open now.</span>' : '<span class="warn">Next switch window: Tuesday 6 PM.</span>'}</p>`;
    if (G.ad) h += `<div class="card" style="margin-bottom:12px"><b>📰 Ad week (since Day ${G.ad.from}):</b> District wants <b>${G.ad.depts.map(d => DEPT[d].name).join(' & ')}</b> on at least 2 endcaps each (selling +${Math.round((AD_LIFT - 1) * 100)}% this week).${G.nextAd ? ` Next ad (from Wednesday): <b>${G.nextAd.map(d => DEPT[d].name).join(' & ')}</b>.` : ''} Status: ${G.ad.depts.map(d => `<span class="${endcapCount(d) >= 2 ? 'good' : 'warn'}">${DEPT[d].name} ${endcapCount(d)}/2</span>`).join(' · ')}</div>`;
    h += `<table><tr><th>Endcap</th><th>On it now</th><th>Next set</th><th>Effect</th></tr>`;
    for (const e of MAPD.endcaps) {
      const gd = DEPT[SHELF_DEPT[e.gondola]], cur = G.endcaps[e.id];
      const nx = ecPlanned(e) ? (G.ecPlan[e.id] || '') : (cur || ''), st = ecStockOf(e.id);
      h += `<tr><td>${gd.aisle} (${gd.name}) — ${e.end} endcap</td><td>${cur ? `${DEPT[cur].name} <span class="${st <= 0 ? 'bad' : st < ecCap(cur) / 2 ? 'warn' : 'mute'}">${st}/${ecCap(cur)}</span>` : '<span class="mute">Empty</span>'}</td><td><select onchange="UI.setEndcap('${e.id}',this.value)"><option value="">— Empty —</option>${DEPTS.map(d => `<option value="${d.id}" ${nx === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}</select>${ecPlanned(e) ? ` <span class="warn">change planned</span>${nx ? ` <span class="mute">(${Math.min(ecCap(nx), G.stock[nx].back)} of ${ecCap(nx)} in backstock)</span>` : ''}` : ''}</td>
        <td>${cur && st > 0 ? `<span class="good">${DEPT[cur].name} +${Math.round((promoLift(cur) - 1) * 100)}% total</span>` : cur ? '<span class="bad">empty: no lift</span>' : '<span class="mute">—</span>'}</td></tr>`;
    }
    return h + '</table>';
  },
  setEndcap(id, v) { if ((v || null) === (G.endcaps[id] || null)) delete G.ecPlan[id]; else G.ecPlan[id] = v || ''; this.render(); },

  tab_order() {
    const editable = orderOpen();
    const td = nextTruckDay(G.phase === 'day' ? G.day : G.day + 1), cover = coverDays(td);
    const sug = suggestedOrder();
    const cur = (G.order && G.day === td) ? G.order : sug;
    let h = `<h2>Forecast & Order</h2>` + weatherStripHTML(true) + seasonBanner();
    h += `<p class="mute">Tonight's trucks: <b>${trucksOn(td).map(t => TRUCK_TYPES[t].name).join(', ')}</b>. Only departments on tonight's trucks can be ordered. The window closes at <b>${fmtTime(ORDER_CUTOFF)}</b>.</p>`;
    if (editable) h += `<p>Order for <b>tonight's trucks</b> (${WEEKDAY_NAMES[dowIdx(td)]}). Each department's order has to cover the days until its next truck (see Covers). ${G.orderSubmitted ? '<span class="good">✓ Submitted. You can still change and resubmit until the cutoff.</span>' : `<span class="warn">Not submitted yet. Due by ${fmtTime(ORDER_CUTOFF)}.</span>`}</p>`;
    else if (G.phase === 'day' && isTruckNight(G.day)) h += `<p class="warn">The order window closed at ${fmtTime(ORDER_CUTOFF)}. ${G.today.systemOrder ? 'The system order was sent.' : 'Your order is locked in.'}</p>`;
    else h += `<p class="mute">No order due today. Next truck: <b>${WEEKDAY_NAMES[dowIdx(td)]} night</b> (covers ${cover} day${cover > 1 ? 's' : ''}). Preview below.</p>`;
    h += cutsOrderPanel(td);
    h += `<table><tr><th>Department</th><th>Last 7 days (units)</th><th class="n">Avg/day</th><th class="n">Endcap lift</th><th class="n">Covers</th><th class="n">Forecast</th><th class="n" title="What the system thinks you have. Cycle counts keep it honest.">On hand (system)</th><th class="n">DSD/day</th><th class="n">Suggested</th><th class="n">Order (cs)</th></tr>`;
    let tot = 0;
    for (const d of DEPTS) {
      const h7 = G.history[d.id].slice(-7);
      const cv = coverDaysFor(d.id, td);
      let fc = 0; for (let k = 1; k <= cv; k++) fc += forecastFor(d.id, td + k);
      const oh = sysOnHand(d.id), val = cv ? (cur[d.id] || 0) : 0;
      const ds = daysSinceCount(d.id), ohWarn = G.ohFlag && G.ohFlag[d.id] ? ` <span class="bad" title="Customers found the shelf and its bird empty while the system showed stock">⚠ phantom?</span>` : ds == null || ds > 7 ? ` <span class="warn" title="${ds == null ? 'Not counted since you took over' : 'Last counted ' + ds + ' days ago'}">⚠</span>` : '';
      tot += val;
      h += `<tr><td><span class="dot" style="background:${d.color}"></span><span class="clickable" onclick="UI.drillTo('${d.id}')">${d.name}</span>${cv ? knownOuts(d.id).map(o => `<div class="${o.kind === 'alloc' ? 'warn' : 'bad'}" style="font-size:11px">🚫 ${o.item}: ${o.kind === 'alloc' ? `max ${o.cap} cs` : o.disc ? 'discontinued' : 'out'}</div>`).join('') : ''}</td><td>${spark(h7)}</td>
        <td class="n">${Math.round(avgDemand(d.id))}</td><td class="n">${promoLift(d.id) > 1 ? '+' + Math.round((promoLift(d.id) - 1) * 100) + '%' : '—'}</td>
        <td class="n">${cv ? cv + 'd' : '<span class="mute">not tonight</span>'}</td><td class="n">${Math.round(fc)} <span class="mute">(${(fc / d.upc).toFixed(1)} cs)</span></td><td class="n">${Math.round(oh)} <span class="mute">(${(oh / d.upc).toFixed(1)} cs)</span>${ohWarn}</td>
        <td class="n">${dsdUnits(d.id) ? Math.round(dsdUnits(d.id) / d.upc) + ' cs' : '—'}</td><td class="n"><b>${sug[d.id]}</b></td>
        <td class="n"><input type="number" min="0" max="400" value="${val}" ${editable && cv ? '' : 'disabled'} oninput="UI.setOrder('${d.id}',this.value)">${cv && knownOuts(d.id).length ? `<div class="mute" style="font-size:11px" id="ship-${d.id}">ships ≈ ${Math.round(val - expectedCut(d.id, val))}</div>` : ''}</td></tr>`;
    }
    h += `<tr><td colspan="9" class="n"><b>Total</b> <span class="mute">(≈ ${Math.max(1, Math.ceil(tot / PALLET_SIZE))} pallets)</span></td><td class="n"><b id="ord-total">${tot}</b> cs</td></tr></table>`;
    if (editable) h += `<div class="row" style="margin-top:10px;justify-content:flex-end"><button onclick="UI.fillSuggested()">Use suggested</button><button class="primary" onclick="UI.submitOrder()">Submit order</button></div>`;
    h += `<p class="mute">On hand is the <b>system's</b> number: invoices in, register scans out. Theft, mis-shipped cases and short DSD deliveries never reach it, so it drifts. ⚠ = not counted in a week (or never), <span class="bad">⚠ phantom?</span> = customers found the shelf and its bird empty while the system showed stock. Count those first (🔢 Counts), then order.</p><p class="mute">Suggested = forecast for the days this truck covers + 25% of the first day (safety stock) − (on hand − what still sells before the truck) − 80% of expected DSD, rounded up to cases. Daily forecast = 7-day average demand (sales + lost sales) × endcap lift × day-of-week factor (${WEEKDAYS.map(w => w + ' ' + DOW_FACTOR[w]).join(', ')}). Click a department for item detail.</p>`;
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
    const sh = $('ship-' + dept); if (sh) sh.textContent = `ships ≈ ${Math.round(G.order[dept] - expectedCut(dept, G.order[dept]))}`;
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

  tab_layout() {
    const sel = this.laySel, st = layoutStats(), df = DEFAULT_STATS || st;
    const cellCol = (ch, x, y) => {
      const f = fixtureAt(x, y);
      if (f === 'reload') return ['#6b4f33', 'R'];
      if (f === 'baler') return ['#5d646d', 'B'];
      if (f) return [DEPT[f].color, f];
      return ({ '#': ['#0b0d10', ''], D: ['#3a2b0a', '⇡'], r: ['#2e2614', ''], b: ['#2b3038', '▤'], o: ['#22303a', ''], C: ['#22303a', '⌨'], v: ['#1f3b4a', '⇡'], '=': ['#1b4b5a', '⇣'], '~': ['#000', ''] })[ch] || ['#191d22', ''];
    };
    let grid = '<div style="overflow-x:auto"><div style="display:grid;grid-template-columns:repeat(' + MW + ',20px);gap:1px;width:max-content;background:#000;padding:2px">';
    for (let y = 2; y <= 10; y++) for (let x = 0; x < MW; x++) {
      const ch = MAPD.grid[y][x], [bg, tx] = cellCol(ch, x, y), f = fixtureAt(x, y);
      const on = sel && f === sel;
      grid += `<div onclick="UI.layClick(${x},${y})" title="${f ? fixtureName(f) : ''}" style="width:20px;height:20px;background:${bg};font:9px var(--pix);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;${on ? 'outline:2px solid #ffd34d;outline-offset:-2px;' : ''}">${tx}</div>`;
    }
    grid += '</div></div>';
    const row = (name, a, b, why) => { const d = a - b, good = d < -0.4, bad = d > 0.4; return `<tr><td>${name}</td><td class="n"><b>${a.toFixed(1)}</b></td><td class="n mute">${b.toFixed(1)}</td><td class="n ${good ? 'good' : bad ? 'bad' : 'mute'}">${d > 0 ? '+' : ''}${d.toFixed(1)}</td><td class="mute">${why}</td></tr>`; };
    let h = `<h2>🧱 Backroom Layout</h2><p class="mute">The store can't change shape, but the backroom is yours to arrange. Click a fixture (a float spot, <b>R</b> reload staging or <b>B</b> the baler), then click open floor to move it. Fixtures can't go on receiving (amber), the dock, doorways or the backstock rack aisle, and there has to be a path around everything.</p>`;
    h += grid;
    h += `<div class="row" style="margin:8px 0">${sel ? `<b>Moving: ${fixtureName(sel)}</b> · click where it should go${sel === 'reload' ? ' (top-left corner)' : ''} ` : '<span class="mute">Nothing selected.</span> '}${sel === 'reload' ? `<button onclick="UI.layTurn()">Turn into a ${(G.layout || defaultLayout()).reload.shape === 'block' ? '8×1 row' : '4×2 block'}</button> ` : ''}${sel ? '<button onclick="UI.laySel=null;UI.render()">Cancel</button> ' : ''}<button class="danger" onclick="UI.layReset()">Reset to the original layout</button></div>`;
    h += `<h3>Walk distances (tiles)</h3><table><tr><th>Trip</th><th class="n">Now</th><th class="n">Original</th><th class="n">Change</th><th>Why it matters</th></tr>
      ${row('Receiving → float → shelf', st.freight, df.freight, 'Every case makes this trip. Weighted by how much each department sells.')}
      ${row('Receiving → baler', st.baler, df.baler, 'Cardboard comes off every pallet.')}
      ${row('Receiving → reload staging', st.reload, df.reload, 'Every empty pallet goes here.')}
      ${row('Dock → reload staging', st.dock, df.dock, 'Loading reloads onto the truck at night.')}</table>
      <p class="mute">Shorter trips mean a faster truck and less labor. A good backroom puts the busiest departments' floats closest to the door to their aisle, and keeps the baler and reload staging next to receiving.</p>`;
    return h;
  },
  layClick(x, y) {
    const f = fixtureAt(x, y);
    if (!this.laySel || (f && f !== this.laySel)) { if (f) this.laySel = f; else toast('Click a float spot, reload staging (R) or the baler (B) first.', 'info'); return this.render(); }
    if (f === this.laySel && this.laySel !== 'reload') { this.laySel = null; return this.render(); }
    const err = moveFixture(this.laySel, x, y);
    if (err) toast(err, 'warn'); else { toast(`Moved: ${fixtureName(this.laySel)}.`, 'good'); this.laySel = null; }
    this.render();
  },
  layTurn() {
    const r = (G.layout || defaultLayout()).reload;
    const err = moveFixture('reload', r.x, r.y, r.shape === 'block' ? 'row' : 'block');
    if (err) toast(err, 'warn');
    this.render();
  },
  layReset() { this.ask('Reset the backroom?', 'Every float spot, reload staging and the baler go back to where they started.', 'Reset', () => { resetLayout(); this.laySel = null; if (this.open) this.render(); }, true); },
  tab_help() {
    return `<h2>Help & Settings</h2>
      <h3>Controls</h3><p><kbd>WASD</kbd>/<kbd>Arrows</kbd> move · <kbd>Shift</kbd> run · <kbd>E</kbd>/<kbd>Space</kbd> interact (hold to repeat) · <kbd>Q</kbd> second action · <kbd>P</kbd> pause · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> speed 1×/2×/4× · <kbd>Esc</kbd> leave the computer</p>
      <h3>📖 How to play</h3>${guideHTML(-1)}
      <h3>The daily loop</h3><ol>
      <li><b>5:00 AM</b> — Last night's truck is in Receiving. Break pallets down onto department floats (blue spots). You carry up to 3 cases.</li>
      <li>Push a float to its aisle and work it onto the shelf. When the shelf is full, take the overflow to its aisle's <b>bird</b> in Backstock (top middle). Birds have wheels: push one out to its aisle and work it onto the shelf.</li>
      <li><b>7:00 AM</b> — Doors open. Every empty shelf is a lost sale and an unhappy customer.</li>
      <li>DSD vendors arrive at the green door and wait ${VENDOR_PATIENCE} minutes. Price tags: yellow = price change, red blinking = scan error.</li>
      <li>Cold (blue-outlined) pallets start spoiling at 9:00 AM if they're still in the back.</li>
      <li><b>Your shift</b> — You're on the schedule (the You row). Before and after your shift the crew runs the store on its own and time moves fast. Log in from home with 🖥️ while you're away.</li>
      <li><b>10:00 PM</b> — Closing report. At night, pull pallets off the trailer into Receiving (or let overtime do it for a fee).</li></ol>
      <h3>Practice settings</h3>
      <label><input type="checkbox" ${RT.settings.labels ? 'checked' : ''} onchange="UI.setLabels(this.checked)"> Easy mode: show the aisle on case labels. Off by default, so you have to know where every item lives.</label>
      <h3>Save</h3><p class="mute">The game auto-saves in this browser every couple of in-game hours and at the start and end of each day.</p>
      <button class="danger" onclick="UI.newGameConfirm()">Start a new store</button>`;
  },
  setLabels(on) { RT.settings.labels = on; try { localStorage.setItem('groceryPractice.labels', on ? 'on' : 'off'); } catch (e) { /* ignore */ } },

  // ---------------- modals ----------------
  showModal(html) { RT.modal = true; RT.keys = {}; $('modal-card').innerHTML = html; $('modal').classList.remove('hidden'); stackWideTables($('modal-card')); },
  hideModal() { RT.modal = false; $('modal').classList.add('hidden'); },

  showWelcome() {
    this.showModal(`<h2>🛒 Grocery Practice</h2>
      <p>You're running the store. Every night a truck comes in, and every morning that freight is waiting in <b>Receiving</b>. Get it sorted, worked to the shelf, and keep the store in stock without blowing the labor budget.</p>
      <h3>Your first morning</h3><ol>
      <li>Walk to a pallet in the yellow <b>Receiving</b> area and press <kbd>E</kbd> to grab cases (up to 3 at once). Hold <kbd>E</kbd> for more options, like Keep going.</li>
      <li>Sort each case onto its department's float (blue spots). Labels tell you the aisle.</li>
      <li>Push a float (<kbd>E</kbd>) to its aisle and press <kbd>E</kbd> at the shelf to work it.</li>
      <li>Visit the <b>office computer</b> (top-right) for reports, email, hiring, endcaps and tomorrow's order.</li></ol>
      <p><kbd>WASD</kbd>/<kbd>Arrows</kbd> move · <kbd>Shift</kbd> run · <kbd>E</kbd> interact · <kbd>Q</kbd> second action · <kbd>P</kbd> pause · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> speed</p>
      <p class="mute">You're on the schedule: you open today (5 AM to 2 PM). When your shift ends you can go home and the crew runs the rest of the day.</p>
      <p class="mute">Tip: Dairy & Frozen pallets (blue outline) spoil if they sit. Work cold first.</p>
      <div class="row" style="justify-content:flex-end"><button onclick="UI.howToPlay('UI.showWelcome()')">📖 How to play</button><button class="primary" onclick="UI.hideModal()">Clock in for Day 1 →</button></div>`);
  },
  // In-game yes/no box (the browser's confirm() pop-up is blocked in some embedded browsers).
  ask(title, body, yes, onYes, danger, no) {
    this._askYes = onYes;
    this.showModal(`<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="row" style="justify-content:flex-end;margin-top:12px"><button onclick="UI.hideModal()">${esc(no || 'Cancel')}</button><button class="${danger ? 'danger' : 'primary'}" onclick="UI.hideModal(); const f = UI._askYes; UI._askYes = null; if (f) f();">${esc(yes)}</button></div>`);
  },
  huddle() { this.showModal(huddleSheetHTML()); },
  dmWalk() { const w = dmWalk(true); if (w) this.showModal(dmResultHTML(w)); else this.hideModal(); },
  disc(id) { const c = G.crew.find(x => x.id === id); if (c) this.showModal(discSheetHTML(c)); },
  discSubmit(id) {
    const lv = +((document.querySelector('input[name="dc-lv"]:checked') || {}).value || 0);
    const docs = [...document.querySelectorAll('.dc-doc:checked')].map(x => x.value);
    const r = discDeliver(id, lv, docs);
    if (r) this.showModal(discResultHTML(r)); else this.hideModal();
  },
  repMeet() { const h = repPitchHTML(); if (h) this.showModal(h); },
  repPick(key) {
    const r = repAnswer(key);
    if (!r) { this.hideModal(); return; }
    this.showModal(`<h2>${r.good === 'best' ? '✅' : r.good === 'bad' ? '❌' : '➖'} ${esc(r.title)}</h2><p>${esc(r.why)}</p><div class="row" style="justify-content:flex-end;margin-top:12px">${r.more ? '<button class="primary" onclick="UI.repMeet()">Next thing they want</button>' : '<button class="primary" onclick="UI.hideModal()">Back to work</button>'}</div>`);
  },
  custReq(cu) {
    this._cu = cu;
    this.showModal(`<h2>🙋 A customer needs help</h2><p style="font-size:17px"><i>${esc(custPrompt(cu))}</i></p><div style="margin-top:10px">${shuffle(custChoices(cu)).map(([k, txt]) => `<button style="display:block;width:100%;text-align:left;margin:6px 0" onclick="UI.custPick('${k}')">${esc(txt)}</button>`).join('')}</div><div class="row" style="justify-content:flex-end;margin-top:8px"><button onclick="RT.custHelping = null; UI.hideModal()">Not now</button></div>`);
  },
  custPick(key) {
    const cu = this._cu; this._cu = null;
    const r = cu && cu.req ? custAnswer(cu, key) : null;
    if (!r) { this.hideModal(); return; }
    this.showModal(`<h2>${r.good === 'best' ? '✅' : r.good === 'bad' ? '❌' : '➖'} ${esc(r.title)}</h2><p>${esc(r.why)}</p><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="primary" onclick="UI.hideModal()">Back to work</button></div>`);
  },
  review(id) { const c = G.crew.find(x => x.id === id); if (c && reviewDue(c)) this.showModal(reviewSheetHTML(c)); },
  reviewSubmit(id) {
    const rates = {}; for (const k of Object.keys(PERF_CATS)) rates[k] = +document.getElementById('rv-' + k).value;
    const v = submitReview(id, rates, +document.getElementById('rv-raise').value);
    if (v) this.showModal(reviewResultHTML(v)); else this.hideModal();
  },
  newGameConfirm() {
    this.ask('Start a brand-new store?', 'Your saved progress will be erased. This can\'t be undone.', 'Start over', () => this.newGameNow(), true);
  },
  newGameNow() {
    clearSlot(SLOT);
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
    this.showModal(this.reviewHTML(r) + `<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="primary" onclick="UI.hideModal();${thenNight ? ' startNight();' : ''}">${thenNight ? (worksTonight() ? 'Got it. Clock in for tonight →' : 'Got it. Head home →') : 'Close'}</button></div>`);
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
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="primary" onclick="UI.afterSummary()">${G.pendingReview ? 'Read the DM\'s weekly review →' : worksTonight() ? 'Clock in for tonight\'s truck →' : 'Head home for the night →'}</button></div>`);
  },
};

function fit() {
  const hud = $('hud').offsetHeight, bar = $('bar').offsetHeight;
  const aw = window.innerWidth - 8, ah = window.innerHeight - hud - bar - 8;
  const s = Math.min(aw / canvas.width, ah / canvas.height);
  canvas.style.width = Math.floor(canvas.width * s) + 'px';
  canvas.style.height = Math.floor(canvas.height * s) + 'px';
}
