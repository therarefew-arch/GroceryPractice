'use strict';
// =====================================================================
//  Store music: futuristic ambient in-store radio.
//  Generated live with WebAudio like the sound effects (no audio files):
//  warm synth pads on smooth jazz-style chords, a soft electric pluck
//  arpeggio with echo, a round bass, glassy chimes and brushed hi-hats.
//  It's generative, so it never repeats exactly. Day tracks are brighter;
//  overnight it's slower and darker. Tracks change every few minutes.
//  🎵 in the top bar turns the music on or off (🔊 mutes everything).
// =====================================================================
const MUSIC = { on: true, vol: 0.5, started: false, track: null, step: 0, next: 0, barsLeft: 0, timer: 0, out: null, rev: null, del: null };
try { MUSIC.on = localStorage.getItem('groceryPractice.music') !== '0'; } catch (e) { /* ignore */ }

const ch = (root, ...iv) => ({ root, notes: iv.map(i => root + i) });
// Each track: tempo, bars per chord, how busy the pluck, chimes and hats are, and the chords.
const MUSIC_TRACKS = [
  { name: 'Aisle Seven, After Hours', night: false, bpm: 78, per: 2, arp: 0.55, mel: 0.35, hats: 0.5, bright: 1.15,
    prog: [ch(50, 12, 16, 19, 23, 26), ch(47, 12, 15, 19, 22, 26), ch(43, 16, 19, 23, 24, 26), ch(45, 12, 17, 19, 22, 26)] },
  { name: 'Fluorescent Dawn', night: false, bpm: 72, per: 2, arp: 0.45, mel: 0.4, hats: 0.35, bright: 1.0,
    prog: [ch(51, 12, 16, 19, 23), ch(48, 12, 15, 19, 22, 26), ch(44, 16, 19, 23, 24, 26), ch(46, 12, 17, 19, 22, 26)] },
  { name: 'Price Check Nebula', night: false, bpm: 88, per: 1, arp: 0.7, mel: 0.25, hats: 0.65, bright: 1.25,
    prog: [ch(45, 12, 15, 19, 22, 26), ch(50, 12, 16, 19, 22, 26), ch(41, 16, 19, 23, 24, 28), ch(40, 12, 15, 19, 22, 26)] },
  { name: 'Endcap Horizon', night: false, bpm: 80, per: 2, arp: 0.5, mel: 0.3, hats: 0.45, bright: 1.1,
    prog: [ch(48, 12, 16, 19, 23, 26), ch(45, 12, 15, 19, 22, 26), ch(50, 12, 15, 19, 22, 26), ch(43, 12, 17, 19, 22, 26)] },
  { name: 'Cold Chain Lullaby', night: true, bpm: 62, per: 2, arp: 0.3, mel: 0.3, hats: 0, bright: 0.8,
    prog: [ch(41, 12, 16, 19, 23, 26), ch(50, 12, 15, 19, 22, 26), ch(46, 12, 16, 18, 23), ch(48, 12, 16, 19, 21, 26)] },
  { name: 'Backroom Stars', night: true, bpm: 58, per: 2, arp: 0.25, mel: 0.4, hats: 0, bright: 0.75,
    prog: [ch(52, 12, 16, 19, 23), ch(49, 12, 15, 19, 22, 26), ch(45, 16, 19, 23, 24, 26), ch(47, 12, 17, 19, 22)] },
];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function musicStart() {
  const ac = FX.ac; if (!ac || MUSIC.started) return;
  MUSIC.started = true;
  MUSIC.out = ac.createGain(); MUSIC.out.gain.value = 0; MUSIC.out.connect(ac.destination);
  // reverb: a generated 3-second hall
  const len = ac.sampleRate * 3, ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  MUSIC.rev = ac.createConvolver(); MUSIC.rev.buffer = ir;
  const rg = ac.createGain(); rg.gain.value = 0.45; MUSIC.rev.connect(rg); rg.connect(MUSIC.out);
  // echo: filtered feedback delay
  MUSIC.del = ac.createDelay(2); const fb = ac.createGain(), lp = ac.createBiquadFilter();
  fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 2400;
  MUSIC.del.connect(lp); lp.connect(fb); fb.connect(MUSIC.del); lp.connect(MUSIC.out); lp.connect(MUSIC.rev);
  MUSIC.next = ac.currentTime + 0.2;
  MUSIC.timer = setInterval(musicTick, 90);
}
function musicWanted() { return MUSIC.on && !FX.muted && !document.hidden; }
function musicPick(night) {
  const pool = MUSIC_TRACKS.filter(t => t.night === night && t !== MUSIC.track);
  MUSIC.track = pick(pool.length ? pool : MUSIC_TRACKS);
  MUSIC.step = 0; MUSIC.barsLeft = 48 + randi(0, 16);
  const ac = FX.ac; if (MUSIC.del) MUSIC.del.delayTime.setValueAtTime(60 / MUSIC.track.bpm * 0.75, ac.currentTime);
  if (G && musicWanted() && MUSIC.toasts !== false) toast(`♪ Now playing: ${MUSIC.track.name}`, 'music');
}
function musicTick() {
  const ac = FX.ac; if (!ac || !MUSIC.out) return;
  const on = musicWanted();
  MUSIC.out.gain.setTargetAtTime(on ? MUSIC.vol * 1.1 : 0, ac.currentTime, 0.6);
  if (!on) { MUSIC.next = ac.currentTime + 0.2; return; }
  const night = !!(G && G.phase === 'night');
  if (!MUSIC.track) musicPick(night);
  while (MUSIC.next < ac.currentTime + 0.3) {
    const T16 = 60 / MUSIC.track.bpm / 4;
    if (MUSIC.step % 16 === 0) {
      // between bars: change tracks when it's time, or when day turns to night
      const chordStart = MUSIC.step % (16 * MUSIC.track.per) === 0;
      if (chordStart && (MUSIC.barsLeft <= 0 || MUSIC.track.night !== night)) musicPick(night);
      MUSIC.barsLeft--;
    }
    musicStep(MUSIC.track, MUSIC.step, MUSIC.next);
    MUSIC.step++; MUSIC.next += T16;
  }
}

function musicStep(tr, step, t) {
  const s = step % 16, bar = Math.floor(step / 16);
  const ci = Math.floor(bar / tr.per) % tr.prog.length, c = tr.prog[ci];
  const beat = 60 / tr.bpm, chordLen = beat * 4 * tr.per;
  if (s === 0 && bar % tr.per === 0) musicPad(c, t, chordLen, tr.bright, bar);
  // bass: root on the one, a softer fifth or root later in the bar
  if (s === 0) musicBass(c.root - 12 + (c.root < 46 ? 12 : 0), t, beat * 2, 0.16);
  if (s === 10 && !tr.night && Math.random() < 0.6) musicBass(c.root - 12 + (c.root < 46 ? 12 : 0) + (Math.random() < 0.5 ? 7 : 12), t, beat, 0.08);
  // pluck arpeggio on the eighths
  if (s % 2 === 0 && Math.random() < tr.arp) {
    const pat = [0, 2, 1, 3, 2, 4, 3, 1], n = c.notes[pat[(s / 2) % pat.length] % c.notes.length] + 12;
    musicPluck(n, t, beat * 0.9, 0.05 * tr.bright);
  }
  // glassy chimes up high
  if (s % 8 === 4 && Math.random() < tr.mel) musicBell(pick(c.notes) + 24, t, beat * 3);
  // brushed hats on the off-beats
  if (tr.hats && s % 4 === 2 && Math.random() < tr.hats + 0.3) musicHat(t, s === 14 ? 0.03 : 0.018);
}

function musicPad(c, t, len, bright, bar) {
  const ac = FX.ac, f = ac.createBiquadFilter(), g = ac.createGain();
  f.type = 'lowpass'; f.Q.value = 0.8;
  const cut = (700 + 500 * (0.5 + 0.5 * Math.sin(bar / 3))) * bright; // slow sweep across the song
  f.frequency.setValueAtTime(cut * 0.6, t); f.frequency.linearRampToValueAtTime(cut, t + len * 0.5); f.frequency.linearRampToValueAtTime(cut * 0.7, t + len + 2);
  const v = 0.05 / Math.sqrt(c.notes.length);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 1.4);
  g.gain.setValueAtTime(v, t + len - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + len + 2.2);
  f.connect(g); g.connect(MUSIC.out); g.connect(MUSIC.rev);
  for (const n of c.notes) for (const det of [-8, 8]) {
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det + (Math.random() * 4 - 2);
    o.connect(f); o.start(t); o.stop(t + len + 2.4);
  }
}
function musicBass(n, t, len, v) {
  const ac = FX.ac, o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.value = mtof(n);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g); g.connect(MUSIC.out); o.start(t); o.stop(t + len + 0.05);
}
function musicPluck(n, t, len, v) {
  const ac = FX.ac, o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  o.type = 'triangle'; o.frequency.value = mtof(n);
  o2.type = 'sine'; o2.frequency.value = mtof(n) * 2; // electric-piano shimmer
  f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(600, t + len);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(f); o2.connect(f); f.connect(g); g.connect(MUSIC.out); g.connect(MUSIC.del); g.connect(MUSIC.rev);
  o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
}
function musicBell(n, t, len) {
  // two sines a little out of tune with each other: a glassy, synthetic chime
  const ac = FX.ac, g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  g.connect(MUSIC.del); g.connect(MUSIC.rev); g.connect(MUSIC.out);
  for (const [mul, vol] of [[1, 1], [2.76, 0.25]]) {
    const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = mtof(n) * mul; og.gain.value = vol;
    o.connect(og); og.connect(g); o.start(t); o.stop(t + len + 0.05);
  }
}
let MUSIC_NOISE = null;
function musicHat(t, v) {
  const ac = FX.ac;
  if (!MUSIC_NOISE) { const b = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; MUSIC_NOISE = b; }
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = MUSIC_NOISE; f.type = 'highpass'; f.frequency.value = 7000;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  src.connect(f); f.connect(g); g.connect(MUSIC.out); src.start(t); src.stop(t + 0.1);
}

function toggleMusic() {
  MUSIC.on = !MUSIC.on;
  try { localStorage.setItem('groceryPractice.music', MUSIC.on ? '1' : '0'); } catch (e) { /* ignore */ }
  musicButton();
  if (MUSIC.on) { sfxInit(); if (MUSIC.track && !FX.muted && MUSIC.toasts !== false) toast(`♪ Now playing: ${MUSIC.track.name}`, 'music'); }
}
function musicButton() {
  const b = document.getElementById('btn-music'); if (!b) return;
  b.classList.toggle('off', !MUSIC.on); b.title = MUSIC.on ? 'Music on (click to turn off)' : 'Music off (click to turn on)';
}
// A suspended phone tab shouldn't keep playing; pick back up when it returns.
document.addEventListener('visibilitychange', () => {
  const ac = FX.ac; if (!ac) return;
  if (document.hidden) ac.suspend(); else ac.resume();
});
document.addEventListener('DOMContentLoaded', musicButton);
SFX.music = () => {}; // the now-playing toast stays quiet
musicButton();
