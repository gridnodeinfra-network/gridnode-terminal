/* GRID//NODE — generative ambient pads + subtle UI sound effects (prototype).
 *
 * Opt-in only: no AudioContext is created and nothing plays until the user
 * flips the SOUND switch in the topbar. All audio is procedural Web Audio
 * (no audio files, offline-safe, no licensing).
 *
 * Conventions follow js/modules/04-scanner.js: gesture-gated AudioContext,
 * localStorage preference, tx() i18n, defensive try/catch everywhere.
 */

const GN_SOUND_STORAGE_KEY = 'gn_sound_v1';
const GN_AMB_CHORD_MS = 18000;
const GN_SFX_BLIP_THROTTLE_MS = 70;

let gnSoundOn = false;
try { gnSoundOn = localStorage.getItem(GN_SOUND_STORAGE_KEY) === '1'; } catch (_) { /* private mode */ }

let gnAC = null;          // AudioContext — created on user gesture only
let gnMaster = null;      // -> compressor -> destination
let gnAmbBus = null;      // ambience bus (pads + air + sub)
let gnSfxBus = null;      // one-shot effects bus
let gnChordFilter = null; // shared lowpass for pad voices
let gnChordTimer = 0;
let gnChordIdx = -1;
let gnVoices = [];        // active voices, released on chord change / stop
let gnAirStarted = false;
let gnBootArmed = false;
let gnLastBlipAt = 0;

const gnMtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* Warm, pleasant loop: Dm9 -> Bbmaj9 -> Fmaj9 -> Cadd9. Slow-blooming
 * triangle/sine stacks, nothing percussive, nothing minor-key tense. */
const GN_AMB_CHORDS = [
  [50, 53, 57, 64], // Dm9
  [46, 50, 53, 60], // Bbmaj9
  [41, 45, 48, 55], // Fmaj9
  [48, 52, 55, 62], // Cadd9
];

function gnSoundEnsureCtx() {
  if (gnAC) {
    if (gnAC.state === 'suspended') { try { gnAC.resume().catch(() => {}); } catch (_) {} }
    return gnAC;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    gnAC = new AC();
    const comp = gnAC.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(gnAC.destination);
    gnMaster = gnAC.createGain();
    gnMaster.gain.value = 0.9;
    gnMaster.connect(comp);
    gnAmbBus = gnAC.createGain();
    gnAmbBus.gain.value = 0.0001;
    gnAmbBus.connect(gnMaster);
    gnSfxBus = gnAC.createGain();
    gnSfxBus.gain.value = 0.5;
    gnSfxBus.connect(gnMaster);
    // Gentle space: short feedback delay on the ambience bus.
    const dly = gnAC.createDelay(1.0);
    dly.delayTime.value = 0.42;
    const fb = gnAC.createGain();
    fb.gain.value = 0.32;
    const wet = gnAC.createGain();
    wet.gain.value = 0.22;
    gnAmbBus.connect(dly);
    dly.connect(fb);
    fb.connect(dly);
    dly.connect(wet);
    wet.connect(gnMaster);
    return gnAC;
  } catch (_) {
    gnAC = null;
    return null;
  }
}

function gnAmbReleaseVoices() {
  if (!gnAC) { gnVoices = []; return; }
  const t = gnAC.currentTime;
  const old = gnVoices;
  gnVoices = [];
  for (const v of old) {
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
      v.gain.gain.linearRampToValueAtTime(0.0001, t + 7);
      for (const o of v.oscs) { try { o.stop(t + 7.5); } catch (_) {} }
    } catch (_) { /* already stopped */ }
  }
}

function gnAmbPlayChord(midis) {
  const ac = gnAC;
  if (!ac) return;
  gnAmbReleaseVoices();
  const t = ac.currentTime;
  if (!gnChordFilter) {
    gnChordFilter = ac.createBiquadFilter();
    gnChordFilter.type = 'lowpass';
    gnChordFilter.frequency.value = 750;
    gnChordFilter.Q.value = 0.4;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoAmt = ac.createGain();
    lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt);
    lfoAmt.connect(gnChordFilter.frequency);
    try { lfo.start(); } catch (_) {}
    gnChordFilter.connect(gnAmbBus);
  }
  for (const m of midis) {
    const f = gnMtof(m);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.055, t + 5.5); // slow bloom
    const o1 = ac.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = f;
    const o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f;
    o2.detune.value = 6;
    o1.connect(g);
    o2.connect(g);
    g.connect(gnChordFilter);
    try { o1.start(t); o2.start(t); } catch (_) {}
    gnVoices.push({ gain: g, oscs: [o1, o2] });
  }
  // Soft sub root, one octave below the chord root.
  const sub = ac.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = gnMtof(midis[0] - 12);
  const sg = ac.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.linearRampToValueAtTime(0.05, t + 6);
  sub.connect(sg);
  sg.connect(gnAmbBus);
  try { sub.start(t); } catch (_) {}
  gnVoices.push({ gain: sg, oscs: [sub] });
}

function gnAmbStartAir() {
  if (gnAirStarted || !gnAC) return;
  try {
    const len = 2 * gnAC.sampleRate;
    const buf = gnAC.createBuffer(1, len, gnAC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = gnAC.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = gnAC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 0.35;
    const g = gnAC.createGain();
    g.gain.value = 0.012;
    const lfo = gnAC.createOscillator();
    lfo.frequency.value = 0.07;
    const la = gnAC.createGain();
    la.gain.value = 0.006;
    lfo.connect(la);
    la.connect(g.gain);
    src.connect(bp);
    bp.connect(g);
    g.connect(gnAmbBus);
    src.start();
    lfo.start();
    gnAirStarted = true;
  } catch (_) { /* air is decorative */ }
}

function gnAmbNext() {
  if (!gnSoundOn || !gnAC) return;
  gnChordIdx = (gnChordIdx + 1) % GN_AMB_CHORDS.length;
  try { gnAmbPlayChord(GN_AMB_CHORDS[gnChordIdx]); } catch (_) {}
  clearTimeout(gnChordTimer);
  gnChordTimer = setTimeout(gnAmbNext, GN_AMB_CHORD_MS);
}

function gnSoundStart() {
  const ac = gnSoundEnsureCtx();
  if (!ac) return false;
  try {
    gnAmbStartAir();
    const t = ac.currentTime;
    gnAmbBus.gain.cancelScheduledValues(t);
    gnAmbBus.gain.setValueAtTime(Math.max(0.0001, gnAmbBus.gain.value), t);
    gnAmbBus.gain.linearRampToValueAtTime(0.5, t + 3);
    gnChordIdx = -1;
    gnAmbNext();
    return true;
  } catch (_) {
    return false;
  }
}

function gnSoundStop() {
  clearTimeout(gnChordTimer);
  gnAmbReleaseVoices();
  if (gnAC) {
    const t = gnAC.currentTime;
    try {
      gnAmbBus.gain.cancelScheduledValues(t);
      gnAmbBus.gain.setValueAtTime(Math.max(0.0001, gnAmbBus.gain.value), t);
      gnAmbBus.gain.linearRampToValueAtTime(0.0001, t + 2.2);
    } catch (_) {}
    const ac = gnAC;
    setTimeout(() => { try { ac.suspend(); } catch (_) {} }, 2400);
  }
}

/* ---------- one-shot effects ---------- */

function gnSfxReady() {
  return gnSoundOn && gnAC && gnAC.state === 'running';
}

function gnSfxTone(freq, type, peak, decay, when = 0) {
  const t = gnAC.currentTime + when;
  const o = gnAC.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = gnAC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g);
  g.connect(gnSfxBus);
  try { o.start(t); o.stop(t + decay + 0.1); } catch (_) {}
}

function gnSfxBlip() {
  if (!gnSfxReady()) return;
  const now = Date.now();
  if (now - gnLastBlipAt < GN_SFX_BLIP_THROTTLE_MS) return;
  gnLastBlipAt = now;
  try { gnSfxTone(740, 'sine', 0.06, 0.09); } catch (_) {}
}

function gnSfxChime() {
  if (!gnSfxReady()) return;
  try {
    gnSfxTone(880, 'triangle', 0.08, 1.1, 0);      // A5
    gnSfxTone(1318.5, 'triangle', 0.07, 1.2, 0.16); // E6
  } catch (_) {}
}

function gnSfxToggleClick() {
  if (!gnSfxReady()) return;
  try { gnSfxTone(520, 'sine', 0.06, 0.07); } catch (_) {}
}

/* ---------- public surface ---------- */

function gnSoundRender() {
  const btn = document.getElementById('gnSoundToggle');
  if (!btn) return;
  btn.setAttribute('aria-checked', gnSoundOn ? 'true' : 'false');
  const state = tx(gnSoundOn ? 'shots.soundOn' : 'shots.soundOff', gnSoundOn ? 'ON' : 'OFF');
  btn.setAttribute('aria-label', tx('sound.toggle', 'AMBIENT SOUND') + ' — ' + state);
}

function gnSoundToggle() {
  gnSoundOn = !gnSoundOn;
  try { localStorage.setItem(GN_SOUND_STORAGE_KEY, gnSoundOn ? '1' : '0'); } catch (_) {}
  gnSoundRender();
  if (gnSoundOn) {
    if (gnSoundStart()) gnSfxToggleClick();
    else { gnSoundOn = false; gnSoundRender(); }
  } else {
    gnSoundStop();
  }
}

function gnSoundArmBoot() {
  // Browsers require a user gesture before audio. If the user left SOUND on,
  // honor it on their first tap/keypress instead of staying mysteriously silent.
  if (gnBootArmed || !gnSoundOn) return;
  gnBootArmed = true;
  const boot = () => { if (gnSoundOn) gnSoundStart(); };
  window.addEventListener('pointerdown', boot, { once: true });
  window.addEventListener('keydown', boot, { once: true });
}

window.GN_AMBIENCE = {
  toggle: gnSoundToggle,
  blip: gnSfxBlip,
  chime: gnSfxChime,
  get enabled() { return gnSoundOn; },
};

/* Dose-logged success shimmer — the module listens, no edits to 05-log-shot.js. */
document.addEventListener('gn:shot-saved', () => { gnSfxChime(); });

/* Subtle tap blips on HUD controls. The sound toggle has its own click. */
document.addEventListener('click', (e) => {
  if (!gnSoundOn || !e.isTrusted) return;
  if (e.target.closest('#gnSoundToggle')) return;
  if (e.target.closest('.btn,.btn-primary,.btn-full,.sec-act,.time-tab,.topbar-btn,.scanner-mode-btn,.phase-sphere-action,.gn-peptide-expand')) gnSfxBlip();
});

/* Quiet down when the app backgrounds; resume on return if still enabled. */
document.addEventListener('visibilitychange', () => {
  if (!gnAC) return;
  try {
    if (document.hidden) gnAC.suspend().catch(() => {});
    else if (gnSoundOn) gnAC.resume().catch(() => {});
  } catch (_) {}
});

gnSoundRender();
gnSoundArmBoot();
