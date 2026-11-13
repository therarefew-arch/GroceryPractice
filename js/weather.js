'use strict';
// =====================================================================
//  Weather.
//  Every day has weather, and you see a 3-day forecast (Today tab, the
//  order screen, the huddle). The forecast is usually right for tomorrow
//  and less sure after that.
//  - Snow, ice and storms keep shoppers home that day, but the day BEFORE
//    a storm everyone stocks up: water, milk and eggs, bread and canned
//    goods, paper. The suggested order doesn't know about weather: order
//    up for it yourself.
//  - Heat sells water, drinks and frozen.
//  - Rain and snow get tracked in at the front door: put the entrance mat
//    and wet-floor signs out (E at the front door) or customers walk into
//    a mess all day.
//  - Snow and ice: more call-outs (bad roads) and some DSD vendors don't
//    make it.
// =====================================================================
const WX = {
  clear: { name: 'Clear', icon: '☀️', traffic: 1 },
  rain: { name: 'Rain', icon: '🌧', traffic: 0.92, wet: true },
  storm: { name: 'Thunderstorms', icon: '⛈', traffic: 0.8, wet: true, big: true, lift: { A2: 1.1 } },
  snow: { name: 'Snow and ice', icon: '❄️', traffic: 0.65, wet: true, big: true, roads: true },
  cold: { name: 'Bitter cold', icon: '🥶', traffic: 0.9, lift: { A1: 1.15, A3: 1.1 } },
  heat: { name: 'Heat wave', icon: '🔥', traffic: 0.95, lift: { A2: 1.35, FRZ: 1.25, DAI: 1.05 } },
};
// The day before a big storm: everyone stocks up.
const PRESTORM = { A2: 1.3, DAI: 1.35, A1: 1.2, A4: 1.25, A3: 1.1 };
const PRESTORM_TRAFFIC = 1.15;

function wxSeasonWeights(day) {
  const m = dateOf(day).m;
  if (m >= 11 || m <= 3) return { clear: 52, rain: 13, cold: 17, snow: 13, storm: 5 };
  if (m >= 6 && m <= 8) return { clear: 50, rain: 15, storm: 15, heat: 20 };
  return { clear: 55, rain: 25, storm: 10, cold: m <= 5 ? 10 : 0, heat: m >= 9 ? 10 : 0 };
}
const wxRoll = day => wpick(Object.entries(wxSeasonWeights(day)).filter(e => e[1] > 0), e => e[1])[0];
// The real weather for a day (made once, the first time anyone looks).
function wxDay(day) {
  G.wx = G.wx || {};
  if (!G.wx[day]) {
    const kind = wxRoll(day);
    // what the forecast said: tomorrow is usually right, further out less so
    const miss = acc => (Math.random() < acc ? kind : wxRoll(day));
    G.wx[day] = { kind, far: miss(0.6), near: miss(0.82) };
  }
  return G.wx[day];
}
const wxKind = day => wxDay(day).kind;
// What the forecast shows for a day, seen from today.
const wxForecast = day => (day <= G.day ? wxKind(day) : day === G.day + 1 ? wxDay(day).near : wxDay(day).far);
const wxPrestorm = day => !!WX[wxDay(day + 1).near].big && !WX[wxKind(day)].big; // people react to the forecast
function wxTraffic(day) { return WX[wxKind(day)].traffic * (wxPrestorm(day) ? PRESTORM_TRAFFIC : 1); }
function wxLift(dept, day) { return ((WX[wxKind(day)].lift || {})[dept] || 1) * (wxPrestorm(day) ? PRESTORM[dept] || 1 : 1); }
const wxWet = () => G.phase === 'day' && !!WX[wxKind(G.day)].wet;

// ---- days ----
function weatherStartDay() {
  const w = WX[wxKind(G.day)], t = G.today;
  t.wx = wxKind(G.day);
  if (w.roads) {
    for (const c of G.crew) if (curShift(c) && !c.calledOut && Math.random() < 0.15) { c.calledOut = true; mail(c.name, 'Can\'t make it in', `The roads are terrible and I can't get my car out. I'm so sorry. I can't make my ${SHIFTS[curShift(c)].name} shift.\n— ${c.name}`); t.wxCallouts = (t.wxCallouts || 0) + 1; }
  }
  if (w.big) {
    const before = G.vendorsToday.length;
    G.vendorsToday = G.vendorsToday.filter(() => Math.random() > 0.4);
    const n = before - G.vendorsToday.length;
    if (n) mail('DSD vendors', `${plural(n, 'delivery')} canceled for weather`, `${plural(n, 'DSD vendor')} won't make it today because of the ${w.name.toLowerCase()}. They'll be back on their next scheduled day.`);
  }
  // a heads-up two days before a big one
  const in2 = wxDay(G.day + 2);
  if (WX[in2.far].big) mail('Weather alert', `${WX[in2.far].icon} ${WX[in2.far].name} in the forecast for ${dowOf(G.day + 2)}`, `The forecast shows ${WX[in2.far].name.toLowerCase()} on ${dowOf(G.day + 2)} ${fmtMD(G.day + 2)}.\nThe day before a storm, customers stock up: water, milk and eggs, bread, canned goods, paper. The suggested order doesn't include weather; order up on the truck that lands before it.\nThe day of the storm, traffic drops, and expect call-outs if the roads are bad.`);
  if (w.wet) toast(`${w.icon} ${w.name} today. Put the entrance mat and wet-floor signs out (E at the front door).`, 'warn');
}
function weatherHour(h) {
  const t = G.today;
  if (!wxWet() || h * 60 <= OPEN || h * 60 > CLOSE) return;
  if (!t.matOut) { G.sat = Math.max(0, G.sat - 0.5); t.wetHrs = (t.wetHrs || 0) + 1; }
}

// ---- you ----
function matInteraction(p) {
  if (!wxWet() || G.today.matOut) return null;
  const door = nearest(MAPD.frontDoor.map(d => ({ x: d.x + 0.5, y: d.y - 0.5 })), p, 2.2);
  if (!door) return null;
  return { label: '🧽 Put out the entrance mat and wet-floor signs', at: door, fn: () => startWork(1.5, 'Setting out the mat', () => { G.today.matOut = G.time; addXP(4, G.player); toast('Mat down, wet-floor signs up. Nobody tracks a mess through the store.', 'good'); }) };
}

// ---- drawing: puddles or the mat at the front door ----
function drawWeatherDoor() {
  if (!wxWet()) return;
  const ds = MAPD.frontDoor, x0 = ds[0].x * T, y = (ds[0].y - 1) * T, w = ds.length * T;
  if (G.today.matOut) {
    ctx.fillStyle = '#2b2f3a'; ctx.fillRect(x0 + 2, y + 6, w - 4, T - 10);
    ctx.fillStyle = '#ffd34d'; ctx.fillRect(x0 - 8, y + 4, 6, 12); ctx.fillRect(x0 + w + 2, y + 4, 6, 12);
  } else {
    ctx.fillStyle = 'rgba(120,180,240,0.55)';
    for (let i = 0; i < 6; i++) ctx.fillRect(x0 + ((i * 37) % (w - 14)), y + 4 + ((i * 13) % (T - 10)), 14, 6);
  }
}

// ---- screens ----
function weatherStripHTML(note) {
  const days = [0, 1, 2, 3].map(k => G.day + k);
  return `<div class="card" style="margin-bottom:10px"><b>Weather</b> ${days.map((d, k) => { const w = WX[wxForecast(d)]; return `<span style="margin-left:10px">${k ? dowOf(d) : 'Today'}: ${w.icon} ${w.name}${k && wxPrestorm(d) ? ' <span class="warn">(stock-up day)</span>' : ''}</span>`; }).join('')}${note ? `<div class="mute" style="margin-top:4px">The forecast is usually right for tomorrow, less sure after that. The suggested order doesn't include weather: the day before a storm sells water, milk, eggs, bread, canned goods and paper; storm days are slow; heat sells drinks and frozen.</div>` : ''}</div>`;
}

// ---- reports ----
function weatherTips() {
  const t = G.today, tips = [];
  if (t.wetHrs) tips.push(`It was ${WX[t.wx].name.toLowerCase()} and the entrance mat wasn't out for ${plural(t.wetHrs, 'hour')}. Customers tracked water through the store. Put it out first thing (E at the front door).`);
  if (wxPrestorm(G.day)) tips.push('Today was a stock-up day before the storm. Check the outs: water, milk, eggs, bread and paper should have been ordered heavy.');
  return tips;
}
function weatherDayExtras() {
  const t = G.today;
  return { wx: t.wx || null, wetHrs: t.wetHrs || 0, prestorm: wxPrestorm(G.day) ? 1 : 0 };
}
function weatherReviewNotes(days, note, praise) {
  const wet = sum(days.map(d => d.wetHrs || 0));
  const pre = days.filter(d => d.prestorm);
  if (wet >= 3) note('Weather', `The entrance mat wasn't out for ${wet} hours of wet weather this week.`,
    'Water tracked through the store makes it look dirty and slippery.',
    'On any rain or snow day, the mat and wet-floor signs go out before the doors open.');
  const preBad = pre.filter(d => d.inStock < 0.93);
  if (preBad.length) note('Weather', `On ${plural(preBad.length, 'stock-up day')} before a storm, in-stock fell to ${(Math.min(...preBad.map(d => d.inStock)) * 100).toFixed(1)}%.`,
    'The day before a storm is one of the busiest of the season. Outs that day are sales that go to the store down the street.',
    'Watch the forecast in the Order tab. Order heavy on water, milk, eggs, bread, canned and paper on the truck that lands before it.');
  else if (pre.length) praise.push('You were stocked for the rush before the storm.');
}
