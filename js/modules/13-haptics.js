/* GRID//NODE — haptic wiring for HUD taps, sound toggle, dose-save (prototype).
 *
 * Thin adapter over the canonical window.gnHaptics module (js/modules/08-lab.js,
 * added 2026-09-06 in 6e1dcca "premium feel pass + opt-in tactile feedback").
 * That module owns the single storage key (gn_haptics_v1, 'on'/'off'), the
 * user-facing toggle (NODE/Profile -> Tools -> Tactile Feedback), and the
 * guards (prefers-reduced-motion, focus-inside-field suppression, gesture
 * window). This file only wires NEW trigger sites to it:
 *   - light tick on HUD button taps (delegated, throttled)
 *   - double-tick when the SOUND switch turns on, single tick when off
 *   - success nudge on gn:shot-saved (dose-save has no actionFeedback path,
 *     so there is no double-fire with the existing confirm vibration)
 * Direct confirmations (toggle, dose-save) use fire() to bypass the focus
 * gate, matching actionFeedback's established behavior.
 */

const GN_HAPTIC_TAP_THROTTLE_MS = 70;

let gnLastTapAt = 0;

function gnHap() {
  try { return window.gnHaptics || null; }
  catch (_) { return null; }
}

/* Light tick for HUD taps — the "premium" micro feedback. Throttled. */
function gnHapticTick() {
  const now = Date.now();
  if (now - gnLastTapAt < GN_HAPTIC_TAP_THROTTLE_MS) return;
  gnLastTapAt = now;
  const h = gnHap();
  if (h) { try { h.tap(); } catch (_) {} }
}

function gnHapticSetEnabled(on) {
  const h = gnHap();
  if (h) { try { h.setEnabled(!!on); } catch (_) {} }
}

window.GN_HAPTICS = {
  tick: gnHapticTick,
  success() { const h = gnHap(); if (h) { try { h.fire([10, 60, 20]); } catch (_) {} } },
  setEnabled: gnHapticSetEnabled,
  get enabled() { try { const h = gnHap(); return !!(h && h.enabled()); } catch (_) { return false; } },
  get supported() { try { const h = gnHap(); return !!(h && h.supported()); } catch (_) { return false; } },
};

/* Mirror the SFX tap delegation: same HUD controls, minus the sound toggle
 * (it gets its own on/off pattern below). Button handlers run before
 * document-level bubbling listeners, so the toggle state read here is fresh. */
document.addEventListener('click', (e) => {
  if (!e.isTrusted) return;
  const t = e.target && e.target.closest ? e.target : null;
  if (!t) return;
  const h = gnHap();
  if (!h) return;
  if (t.closest('#gnSoundToggle')) {
    let on = false;
    try { on = !!(window.GN_AMBIENCE && window.GN_AMBIENCE.enabled); } catch (_) {}
    try { h.fire(on ? [12, 40, 12] : [16]); } catch (_) {}
    return;
  }
  if (t.closest('.btn,.btn-primary,.btn-full,.sec-act,.time-tab,.topbar-btn,.scanner-mode-btn,.phase-sphere-action,.gn-peptide-expand')) gnHapticTick();
});

/* Dose-logged success nudge — listens, does not touch 05-log-shot.js. */
document.addEventListener('gn:shot-saved', () => {
  const h = gnHap();
  if (h) { try { h.fire([10, 60, 20]); } catch (_) {} }
});
