const GN_SCANNER_AUDIO_STORAGE_KEY = 'gn_scanner_audio_v1';
const GN_SCANNER_AUDIO_MASTER_GAIN = 0.6;
const GN_SCANNER_AUDIO_CONTACT_THROTTLE_MS = 45;
const gnScannerAudioGesture = (() => {
  const token = Symbol('GNScannerAudioGesture');
  return Object.freeze({
    fromEvent(event) { return event?.isTrusted === true ? token : null; },
    accepts(candidate) { return candidate === token; }
  });
})();
let gnScannerAudioEnabled = false;
let gnScannerAudioContext = null;
let gnScannerAudioMaster = null;
let gnScannerAudioLastContactAt = -Infinity;
const gnScannerAudioVoices = new Set();

function gnScannerAudioStoredPreference() {
  try { return localStorage.getItem(GN_SCANNER_AUDIO_STORAGE_KEY) === '1'; } catch (_) { return false; }
}

function gnScannerAudioRenderSwitch() {
  const control = $('gnScannerAudioSwitch');
  if (!control) return;
  control.setAttribute('aria-checked', gnScannerAudioEnabled ? 'true' : 'false');
  const label = tx('shots.scannerAudio', 'SCANNER AUDIO');
  const state = tx(gnScannerAudioEnabled ? 'shots.soundOn' : 'shots.soundOff', gnScannerAudioEnabled ? 'ON' : 'OFF');
  control.setAttribute('aria-label', label);
  const stateLabel = control.querySelector('[data-scanner-sound-state]');
  if (stateLabel) stateLabel.textContent = state;
}

function gnScannerAudioContextForGesture(gestureToken = null) {
  if (!gnScannerAudioEnabled || !gnScannerAudioGesture.accepts(gestureToken)) return null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!gnScannerAudioContext) {
      gnScannerAudioContext = new AudioContextClass();
      gnScannerAudioMaster = gnScannerAudioContext.createGain();
      gnScannerAudioMaster.gain.setValueAtTime(GN_SCANNER_AUDIO_MASTER_GAIN, gnScannerAudioContext.currentTime);
      gnScannerAudioMaster.connect(gnScannerAudioContext.destination);
    }
    if (gnScannerAudioContext.state === 'suspended') {
      Promise.resolve(gnScannerAudioContext.resume()).catch(() => {});
    }
    return gnScannerAudioContext;
  } catch (_) { return null; }
}

function gnScannerAudioDisconnectVoice(voice) {
  try { voice.oscillator.disconnect(); } catch (_) {}
  try { voice.filter.disconnect(); } catch (_) {}
  try { voice.gain.disconnect(); } catch (_) {}
  gnScannerAudioVoices.delete(voice);
}

function gnScannerAudioStopVoices() {
  const stopTime = gnScannerAudioContext?.currentTime || 0;
  for (const voice of Array.from(gnScannerAudioVoices)) {
    try {
      voice.gain.gain.cancelScheduledValues(stopTime);
      voice.gain.gain.setValueAtTime(0, stopTime);
    } catch (_) {}
    try { voice.oscillator.stop(stopTime); } catch (_) {}
    gnScannerAudioDisconnectVoice(voice);
  }
  gnScannerAudioVoices.clear();
}

function gnScannerAudioTone(durationSeconds, frequency, peak, offsetSeconds = 0) {
  const context = gnScannerAudioContext;
  if (!context || !gnScannerAudioMaster) return;
  let voice = null;
  try {
    const start = context.currentTime + offsetSeconds;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    voice = { oscillator, filter, gain };
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(frequency * 2, 2200), start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(Math.min(peak, GN_SCANNER_AUDIO_MASTER_GAIN), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSeconds);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(gnScannerAudioMaster);
    oscillator.onended = () => gnScannerAudioDisconnectVoice(voice);
    oscillator.start(start);
    oscillator.stop(start + durationSeconds + 0.02);
    gnScannerAudioVoices.add(voice);
  } catch (_) {
    if (voice) gnScannerAudioDisconnectVoice(voice);
  }
}

function gnScannerAudioPlayContact(gestureToken) {
  if (!gnScannerAudioEnabled) return;
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (now - gnScannerAudioLastContactAt < GN_SCANNER_AUDIO_CONTACT_THROTTLE_MS) return;
  gnScannerAudioLastContactAt = now;
  const context = gnScannerAudioContextForGesture(gestureToken);
  if (!context) return;
  // 24ms high-frequency tap (sine, 920Hz, fast decay)
  gnScannerAudioTone(0.024, 920, 0.5);
}

function gnScannerAudioPlayLock(gestureToken) {
  if (!gnScannerAudioEnabled) return;
  const context = gnScannerAudioContextForGesture(gestureToken);
  if (!context) return;
  // 110ms descending confirmation tone (sine, 320->96Hz, slow decay)
  gnScannerAudioTone(0.11, 320, 0.45, 0);
  gnScannerAudioTone(0.11, 96, 0.45, 0.11);
}

function gnScannerAudioToggle() {
  gnScannerAudioEnabled = !gnScannerAudioEnabled;
  try { localStorage.setItem(GN_SCANNER_AUDIO_STORAGE_KEY, gnScannerAudioEnabled ? '1' : '0'); } catch (_) {}
  gnScannerAudioRenderSwitch();
  return gnScannerAudioEnabled;
}

window.GNScannerAudio = Object.freeze({
  isEnabled: () => gnScannerAudioEnabled,
  setEnabled: (value) => {
    gnScannerAudioEnabled = Boolean(value);
    try { localStorage.setItem(GN_SCANNER_AUDIO_STORAGE_KEY, gnScannerAudioEnabled ? '1' : '0'); } catch (_) {}
    gnScannerAudioRenderSwitch();
    return gnScannerAudioEnabled;
  },
  toggle: () => gnScannerAudioToggle(),
  playContact: gnScannerAudioPlayContact,
  playLock: gnScannerAudioPlayLock,
  syncControl: () => gnScannerAudioRenderSwitch()
});

function initScannerAudioControl() {
  gnScannerAudioEnabled = gnScannerAudioStoredPreference();
  gnScannerAudioRenderSwitch();
}

initScannerAudioControl();
/* GN_SCANNER_AUDIO_CONTROLLER_V1_END */

/* v0.15.19 SKIN TONE REMOVED - synthetic biotech scanner, single body per mode */
export function scannerSkinTone() { return null; }

/* v0.15.19 SKIN TONE REMOVED - synthetic biotech scanner, single body per mode */
export function setScannerSkinTone(tone, button) {
  /* no-op: skin-tone selector is dead in v0.15.19 */
  try { localStorage.removeItem('gn_scanner_skin_tone'); } catch (e) {}
}

/* v0.15.19 INTENSITY REMOVED - single body per mode, no 9-state map */
function scannerIntensityForMode(mode) { return null; }

export function setScannerMode(mode, button) {
  moduleState.scannerMode = ZONES[mode] ? mode : 'core';
  /* v0.15.19 - drive .biotech-stage SVG architecture */
  qa('.scanner-mode-btn').forEach(item => {
    const active = item === button || item.dataset.mode === moduleState.scannerMode;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', active ? 'true' : 'false');
    item.setAttribute('aria-selected', active ? 'true' : 'false');
    item.setAttribute('tabindex', active ? '0' : '-1');
  });
  clearScannerTransientState();
  /* toggle .biotech-stage visibility - one stage per mode */
  qa('.biotech-stage').forEach(stage => {
    const isActive = stage.dataset.view === moduleState.scannerMode;
    stage.hidden = !isActive;
    stage.classList.toggle('active', isActive);
    if (isActive) {
      /* re-trigger scanline sweep on stage entry */
      const scan = stage.querySelector('.biotech-scanline');
      if (scan) {
        scan.classList.remove('sweep');
        void scan.offsetWidth;
        scan.classList.add('sweep');
      }
    }
  });
  /* navel keep-out legend is CORE-only: hide it on LEGS and ARMS views */
  qa('.scanner-keepout-legend').forEach(legend => {
    legend.hidden = moduleState.scannerMode !== 'core';
  });
  setText('scannerModeLabel', tx('shots.trackableZones', 'TRACKABLE {zone} ZONES', { zone: scannerModeLabel(moduleState.scannerMode) }));
  const helper = document.querySelector('#shotsRegionScanner .asset-helper');
  if (helper) {
    /* v0.15.19 - GRID//NODE biotech microcopy */
    const help = {
      core: tx('shots.coreHint', 'ZONE//CORE - Tap a quadrant around the navel. Center excluded.'),
      lower: tx('shots.legsHint', 'ZONE//LEGS - Tap the upper or lower front-thigh zone.'),
      upper: tx('shots.armsHint', 'ZONE//ARMS - Tap a triceps zone above the elbow. Rear view.')
    };
    helper.textContent = help[moduleState.scannerMode] || help.core;
  }
  installScannerPointerHandlers();
  renderScanner();
}


export function selectScannerLocation(label, options = {}) {
  const { source = 'programmatic', feedback = source !== 'programmatic', gestureToken = null } = options;
  try {
    localStorage.setItem('gn_scanner_hint_shown', '1');
    const cap = document.querySelector('.gn-zone-hint-caption');
    if (cap) cap.remove();
    document.querySelectorAll('.gn-zone-hint').forEach(el => el.classList.remove('gn-zone-hint'));
  } catch (e) {}
  moduleState.selectedLocation = label;
  S.set('selectedLocation', label);
  queueCloudSync('workspace');
  renderScanner();
  const panel = document.querySelector('#shotsRegionScanner .scanner-selected-panel');
  if (panel) {
    panel.classList.add('gn-zone-confirmed');
    clearTimeout(panel._confirmTimer);
    panel._confirmTimer = setTimeout(() => panel.classList.remove('gn-zone-confirmed'), 900);
    let lock = panel.querySelector('.gn-location-lock');
    if (!lock) {
      lock = document.createElement('div');
      lock.className = 'gn-location-lock';
      lock.setAttribute('role', 'status');
      lock.setAttribute('aria-live', 'polite');
      panel.insertBefore(lock, panel.firstChild);
    }
    lock.innerHTML = `<small>${tx('shots.locationLocked', 'LOCATION//LOCKED')}</small><span>${safeText(zoneLabel(label))}</span>`;
    lock.classList.add('is-on');
  }
  /* v0.15.19 - drive SVG .zone-path rects; add .zone-acquiring pulse */
  qa('#shotsRegionScanner .zone-path').forEach(path => {
    const on = path.getAttribute('data-site') === label;
    path.classList.toggle('selected', on);
    path.classList.toggle('selected-active', on);
    if (on) {
      path.classList.remove('zone-acquiring');
      void path.getBoundingClientRect();
      path.classList.add('zone-acquiring');
      setTimeout(() => path.classList.remove('zone-acquiring'), 480);
    }
  });
  if (feedback) {
    try { window.GNScannerAudio?.playLock?.(gestureToken); } catch (_) {}
    try { gnHaptics.lock(); } catch (_) {}
  }
  if ($('logOv')?.classList.contains('active')) {
    setText('modalSelectedLocation', zoneLabel(label));
  }
}

const scannerPointerStates = new WeakMap();

export function renderScanner() {
  try {
    if (!localStorage.getItem('gn_scanner_hint_shown')) {
      setTimeout(() => {
        if (localStorage.getItem('gn_scanner_hint_shown')) return;
        /* v0.15.19 - hint targets the first zone-path in the active stage */
        const zone = document.querySelector('#shotsRegionScanner .biotech-stage:not([hidden]) .zone-path');
        if (zone && !zone.classList.contains('gn-zone-hint')) {
          zone.classList.add('gn-zone-hint');
          const cap = document.createElement('div');
          cap.className = 'gn-zone-hint-caption';
          cap.textContent = tx('scanner.tapZoneHint', 'TAP A ZONE');
          zone.parentElement?.parentElement?.insertBefore(cap, zone.parentElement);
        }
      }, 700);
    }
  } catch (e) {}

  const panel = document.querySelector('#shotsRegionScanner .scanner-selected-panel');
  if (!panel) return;
  const scanner = document.querySelector('#shotsRegionScanner .site-scanner');
  scanner?.setAttribute('aria-label', tx('shots.scannerAria', 'GRID//NODE user-entered location scanner'));
  qa('#shotsRegionScanner .biotech-stage').forEach(stage => {
    const mode = stage.dataset.view || 'core';
    const modeLabel = scannerModeLabel(mode);
    stage.setAttribute('aria-label', tx('shots.scannerPanelAria', '{mode} location scanner', { mode: modeLabel }));
    stage.querySelector('.biotech-zones')?.setAttribute('aria-label', tx('shots.scannerZonesAria', '{mode} tracking zones', { mode: modeLabel }));
    qa('.zone-path', stage).forEach(path => path.setAttribute('aria-label', zoneLabel(path.getAttribute('data-site'))));
  });
  let picker = panel.querySelector('.gn-stable-zone-picker');
  if (!picker) { picker = document.createElement('div'); picker.className = 'gn-stable-zone-picker'; panel.appendChild(picker); }
  picker.innerHTML = `<div class="gn-stable-zone-title">${tx('shots.trackableZones', 'TRACKABLE {zone} ZONES', { zone: scannerModeLabel(moduleState.scannerMode) })}</div>${ZONES[moduleState.scannerMode].map(label => `<button type="button" class="gn-stable-zone-btn ${label === moduleState.selectedLocation ? 'selected' : ''}" data-stable-zone="${safeText(label)}" data-zone-key="${safeText(ZONE_IDS[label] || '')}" aria-pressed="${label === moduleState.selectedLocation ? 'true' : 'false'}">${safeText(zoneLabel(label))}</button>`).join('')}`;
  setText('scannerSelectedDisplay', zoneLabel(moduleState.selectedLocation) || tx('shots.noLocationSelected', 'No location selected'));
  const recent = sortedShots().slice(-6).reverse().map(item => item.site).filter(Boolean);
  const uniqRecent = [...new Set(recent)];
  const lastSite = uniqRecent[0] || '';
  setText('scannerHistoryDisplay', uniqRecent.length ? uniqRecent.slice(0, 4).map(zoneLabel).join(' · ') : tx('shots.noLoggedLocationYet', 'No logged location yet'));
  const lock = panel.querySelector('.gn-location-lock');
  if (lock && moduleState.selectedLocation) {
    lock.innerHTML = `<small>${tx('shots.locationLocked', 'LOCATION//LOCKED')}</small><span>${safeText(zoneLabel(moduleState.selectedLocation))}</span>`;
    lock.classList.add('is-on');
  } else if (lock) {
    lock.classList.remove('is-on');
  }
  /* v0.15.19 - drive .zone-path SVG rects in the active .biotech-stage */
  qa('#shotsRegionScanner .biotech-stage:not([hidden]) .zone-path').forEach(path => {
    const site = path.getAttribute('data-site');
    const isSel = site === moduleState.selectedLocation;
    path.classList.toggle('selected', isSel);
    path.classList.toggle('selected-active', isSel);
    path.classList.toggle('last', Boolean(lastSite && site === lastSite && site !== moduleState.selectedLocation));
    path.classList.toggle('recent', Boolean(site && uniqRecent.includes(site) && site !== lastSite && site !== moduleState.selectedLocation));
    path.classList.toggle('is-dim', Boolean(moduleState.selectedLocation && !isSel));
    path.setAttribute('aria-pressed', isSel ? 'true' : 'false');
  });
  /* v0.15.19 - no skin-tone asset sync. Single body per mode. Image already set in HTML. */
}


/* v0.15.19 SCANNER POINTER + HIT-TEST ENGINE */
function pointerToSvgPoint(svg, clientX, clientY) {
  const point = (typeof DOMPoint === "function") ? new DOMPoint(clientX, clientY) : { x: clientX, y: clientY, matrixTransform: function(m) { return { x: clientX * m.a + m.e, y: clientY * m.d + m.f }; } };
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  return point.matrixTransform(ctm.inverse());
}

function hitTestScannerZone(svg, clientX, clientY) {
  const sp = pointerToSvgPoint(svg, clientX, clientY);
  if (!sp) return null;
  /* Try native path.isPointInFill first */
  const hitPaths = svg.querySelectorAll(".zone-hit");
  for (let i = 0; i < hitPaths.length; i++) {
    const p = hitPaths[i];
    if (typeof p.isPointInFill === "function") {
      try { if (p.isPointInFill(sp)) return p; } catch (e) {}
    }
  }
  /* Fallback: nearest zone by distance (should never trigger on real devices) */
  return null;
}

function installScannerPointerHandlers() {
  if (window.__gnScannerPointerInstalled) return;
  window.__gnScannerPointerInstalled = true;
  const TAP_THRESHOLD = 10; /* px */
  qa("#shotsRegionScanner .biotech-stage").forEach(stage => {
    const svg = stage.querySelector(".biotech-zones");
    if (!svg || svg.__gnPointerBound) return;
    svg.__gnPointerBound = true;
    const clearPointerState = (releaseCapture = true) => {
      const state = scannerPointerStates.get(svg);
      if (!state) return;
      if (state.candidate) state.candidate.classList.remove('pressed');
      if (releaseCapture && state.pointerId !== null) {
        try { svg.releasePointerCapture(state.pointerId); } catch (_) {}
      }
      scannerPointerStates.delete(svg);
    };
    svg.addEventListener("pointerdown", (e) => {
      if (stage.hidden) return;
      clearPointerState();
      const candidate = hitTestScannerZone(svg, e.clientX, e.clientY);
      const state = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        candidate,
        cancelled: !candidate
      };
      scannerPointerStates.set(svg, state);
      if (candidate) {
        try { window.GNScannerAudio?.playContact?.(gnScannerAudioGesture.fromEvent(e)); } catch (_) {}
        try { svg.setPointerCapture(e.pointerId); } catch (_) {}
        candidate.classList.add("pressed");
      }
    }, { passive: true });
    svg.addEventListener("pointermove", (e) => {
      const state = scannerPointerStates.get(svg);
      if (!state || state.pointerId !== e.pointerId) return;
      const dx = e.clientX - state.startX, dy = e.clientY - state.startY;
      if (Math.hypot(dx, dy) > TAP_THRESHOLD) {
        state.cancelled = true;
        if (state.candidate) state.candidate.classList.remove("pressed");
      }
    }, { passive: true });
    function endPointer(e) {
      const state = scannerPointerStates.get(svg);
      if (!state || state.pointerId !== e.pointerId) return;
      const endpoint = hitTestScannerZone(svg, e.clientX, e.clientY);
      const candidate = state.candidate;
      const validTap = !state.cancelled && candidate && endpoint === candidate;
      const site = validTap ? candidate.getAttribute("data-site") : '';
      clearPointerState();
      if (site) selectScannerLocation(site, { source: 'pointer', gestureToken: gnScannerAudioGesture.fromEvent(e) });
    }
    svg.addEventListener("pointerup", endPointer, { passive: true });
    svg.addEventListener("pointercancel", () => clearPointerState(), { passive: true });
    svg.addEventListener("lostpointercapture", () => clearPointerState(false), { passive: true });
    /* Keyboard a11y */
    qa("#shotsRegionScanner .zone-path").forEach(zp => {
      if (zp.__gnKeyBound) return;
      zp.__gnKeyBound = true;
      zp.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          const site = zp.getAttribute("data-site");
          if (site) {
            selectScannerLocation(site, { source: 'keyboard', gestureToken: gnScannerAudioGesture.fromEvent(e) });
          }
        }
      });
    });
  });
}

function clearScannerTransientState() {
  qa('#shotsRegionScanner .zone-path.pressed, #shotsRegionScanner .zone-path.zone-acquiring')
    .forEach(path => path.classList.remove('pressed', 'zone-acquiring'));
}

/* v0.15.19 SCANNER DEBUG MODE - ?scannerDebug=1 */
function installScannerDebugMode() {
  if (!/[?&]scannerDebug=1\b/.test(location.search)) return;
  qa("#shotsRegionScanner .zone-path").forEach(zp => {
    zp.classList.add("debug-on");
  });
  document.addEventListener("pointermove", (e) => {
    const svg = (e.target && e.target.closest && e.target.closest(".biotech-zones")) || null;
    if (!svg) return;
    const sp = pointerToSvgPoint(svg, e.clientX, e.clientY);
    if (!sp) return;
    let zoneId = "none", matches = 0;
    qa(svg, ".zone-hit").forEach(p => {
      if (typeof p.isPointInFill === "function") {
        try { if (p.isPointInFill(sp)) { matches++; zoneId = p.getAttribute("data-site") || zoneId; } } catch (err) {}
      }
    });
    let dbg = document.getElementById("__gnScannerDebug");
    if (!dbg) {
      dbg = document.createElement("pre");
      dbg.id = "__gnScannerDebug";
      dbg.style.cssText = "position:fixed;bottom:80px;left:8px;z-index:99999;background:rgba(0,0,0,0.85);color:#06BBE3;font:11px monospace;padding:6px 8px;border:1px solid #06BBE3;border-radius:4px;pointer-events:none;white-space:pre;";
      document.body.appendChild(dbg);
    }
    dbg.textContent = "SCREEN " + Math.round(e.clientX) + "," + Math.round(e.clientY) + "\nSVG " + Math.round(sp.x) + "," + Math.round(sp.y) + "\nZONE " + zoneId + "\nMATCHES " + matches;
  }, { passive: true });
}

