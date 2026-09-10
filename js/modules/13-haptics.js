/* GRID//NODE — premium tactile feedback (prototype).
 *
 * iPhone-style haptics via navigator.vibrate (Android only; iOS Safari does
 * not expose the API, where this is a silent no-op). Premium feel comes from
 * short, crisp patterns: a light tick on taps, a soft double-tick when the
 * SOUND switch turns on, a single tick when it turns off, and a gentle
 * success nudge when a dose is saved. Long buzzes feel cheap, so the longest
 * single pulse here is 20ms.
 *
 * On by default (like system haptics on a real phone), independent of the
 * SOUND switch. Preference gn_haptics_v1; no UI toggle in the prototype to
 * keep the topbar clean.
 *
 * Conventions follow js/modules/12-ambience.js: defensive try/catch
 * everywhere, delegated click handling, throttling, listens to the existing
 * gn:shot-saved event without touching dose-save code.
 */

const GN_HAPTICS_STORAGE_KEY = 'gn_haptics_v1';
const GN_HAPTIC_TAP_THROTTLE_MS = 70;

let gnHapticsOn = true;
try { gnHapticsOn = localStorage.getItem(GN_HAPTICS_STORAGE_KEY) !== '0'; } catch (_) { /* private mode */ }

let gnLastTapAt = 0;

function gnHapticSupported() {
  try { return gnHapticsOn && 'vibrate' in navigator && typeof navigator.vibrate === 'function'; }
  catch (_) { return false; }
}

/* Fire a pattern. Must be called from a user gesture on some browsers;
 * all call sites below are inside click handlers or trusted events. */
function gnBuzz(pattern) {
  if (!gnHapticSupported()) return false;
  try { return navigator.vibrate(pattern); } catch (_) { return false; }
}

/* Light tick for HUD taps — the "premium" micro feedback. Throttled. */
function gnHapticTick() {
  const now = Date.now();
  if (now - gnLastTapAt < GN_HAPTIC_TAP_THROTTLE_MS) return;
  gnLastTapAt = now;
  gnBuzz(8);
}

/* Sound toggle feedback: double-tick on, single soft tick off. */
function gnHapticToggle(on) {
  gnBuzz(on ? [12, 40, 12] : [16]);
}

/* Dose-saved success nudge. */
function gnHapticSuccess() {
  gnBuzz([10, 60, 20]);
}

function gnHapticSetEnabled(on) {
  gnHapticsOn = !!on;
  try { localStorage.setItem(GN_HAPTICS_STORAGE_KEY, gnHapticsOn ? '1' : '0'); } catch (_) {}
}

window.GN_HAPTICS = {
  tick: gnHapticTick,
  success: gnHapticSuccess,
  setEnabled: gnHapticSetEnabled,
  get enabled() { return gnHapticsOn; },
  get supported() { return gnHapticSupported(); },
};

/* Mirror the SFX tap delegation: same HUD controls, minus the sound toggle
 * (it gets its own on/off pattern below). Button handlers run before
 * document-level bubbling listeners, so the toggle state read here is fresh. */
document.addEventListener('click', (e) => {
  if (!e.isTrusted) return;
  const t = e.target && e.target.closest ? e.target : null;
  if (!t) return;
  if (t.closest('#gnSoundToggle')) {
    try {
      const on = !!(window.GN_AMBIENCE && window.GN_AMBIENCE.enabled);
      gnHapticToggle(on);
    } catch (_) {}
    return;
  }
  if (t.closest('.btn,.btn-primary,.btn-full,.sec-act,.time-tab,.topbar-btn,.scanner-mode-btn,.phase-sphere-action,.gn-peptide-expand')) gnHapticTick();
});

/* Dose-logged success nudge — listens, does not touch 05-log-shot.js. */
document.addEventListener('gn:shot-saved', () => { gnHapticSuccess(); });
