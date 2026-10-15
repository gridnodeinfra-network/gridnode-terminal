/* GRID//NODE — tactile engine. v1.1.4 (2026-10-15), built from scratch at
 * founder direction ("premium vibrations, iOS + Android; clean the old
 * code out and redesign it"). It replaces the entire September stack:
 * the gnHaptics module with its focus gates and 250ms gesture window,
 * the capture-phase click tagger, the 13-haptics.js adapter with its
 * delegated HUD-tap listener, the settings-row probe, and every
 * scattered direct call — all deleted. One engine, one API:
 *
 *   window.GN_HAPTICS.fire('confirm')
 *
 * Nothing else in the codebase may touch navigator.vibrate.
 *
 * ANDROID — navigator.vibrate(pattern), called SYNCHRONOUSLY inside the
 * caller's own user-gesture handler. No promises, no timers, no focus
 * gates, no tagger indirection between the tap and the motor: that
 * indirection chain (and a year of the motor being no-oped out) is why
 * the old system felt dead on real devices.
 *
 * iPHONE — Safari has no Vibration API. The engine uses the platform's
 * switch-input Taptic response: toggling an <input type="checkbox"
 * switch> makes iOS emit a genuine haptic tick. The input is created
 * lazily on first use, parked off-screen and fully transparent, and is
 * only ever toggled from inside fire(). A pattern becomes that pattern's
 * pulse count at the pattern's own timings. Where the platform does not
 * respond (older iOS, desktop browsers), the result is silence — never
 * an error, never a visible artifact.
 *
 * PATTERN LANGUAGE — premium is restraint. Seven short signatures, each
 * under a quarter second, each mapped to a meaning, fired only from the
 * semantic action handlers (never from renders, timers, network events,
 * or a delegated "something was tapped" listener):
 *
 *   tick       [8]                  selection: range / segment / scanner-mode taps
 *   toggle     [12]                 theme + setting flips: one firmer click
 *   confirm    [10, 60, 20]         save success: a soft two-beat
 *   lock       [10, 50, 16]         scanner site lock: a latch closing
 *   warn       [30, 60, 30]         a destructive confirm just opened
 *   error      [40, 60, 40, 60, 40] failure: three heavy beats
 *   milestone  [12, 50, 12, 50, 24] goal / celebration: a rising triple
 *
 * SETTING — the user's tactile preference is preserved verbatim:
 * localStorage 'gn_haptics_v1' = 'on' | 'off' (default on), the same key
 * and the same VAULT row the old system used, so an existing user's
 * choice carries over untouched. Off means off — checked on every fire.
 * prefers-reduced-motion suppresses every non-essential pattern; 'warn'
 * and 'error' still land, because they are information, not decoration.
 */

const GN_TACTILE_PATTERNS = Object.freeze({
  tick: [8],
  toggle: [12],
  confirm: [10, 60, 20],
  lock: [10, 50, 16],
  warn: [30, 60, 30],
  error: [40, 60, 40, 60, 40],
  milestone: [12, 50, 12, 50, 24]
});

const GN_TACTILE_ESSENTIAL = Object.freeze({ warn: true, error: true });

(function gnTactileEngine() {
  'use strict';

  const KEY = 'gn_haptics_v1';

  let enabled = (() => {
    try { return localStorage.getItem(KEY) !== 'off'; } catch (_) { return true; }
  })();

  const hasVibrate = () => {
    try { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; }
    catch (_) { return false; }
  };

  const isIOS = () => {
    try {
      const ua = navigator.userAgent || '';
      if (/iPhone|iPad|iPod/.test(ua)) return true;
      /* iPadOS reports as desktop Safari; touch points give it away. */
      return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
    } catch (_) { return false; }
  };

  const platform = () => (hasVibrate() ? 'vibrate' : (isIOS() ? 'ios-taptic' : 'none'));
  const supported = () => platform() !== 'none';

  const reducedMotion = () => {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (_) { return false; }
  };

  /* ── iOS Taptic via switch input ─────────────────────────────────── */
  let iosSwitch = null;
  const ensureIosSwitch = () => {
    if (iosSwitch && iosSwitch.isConnected) return iosSwitch;
    try {
      if (typeof document === 'undefined' || !document.body) return null;
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.setAttribute('switch', '');
      el.setAttribute('aria-hidden', 'true');
      el.tabIndex = -1;
      el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(el);
      iosSwitch = el;
      return el;
    } catch (_) { return null; }
  };
  const iosTick = () => { const el = ensureIosSwitch(); if (el) { try { el.click(); } catch (_) {} } };

  /* ── the one door ────────────────────────────────────────────────── */
  const fire = (name) => {
    try {
      const pattern = GN_TACTILE_PATTERNS[name];
      if (!pattern) return false;
      if (!enabled) return false;
      if (reducedMotion() && !GN_TACTILE_ESSENTIAL[name]) return false;
      const path = platform();
      if (path === 'vibrate') {
        navigator.vibrate(pattern.slice());
        return true;
      }
      if (path === 'ios-taptic') {
        const pulses = Math.ceil(pattern.length / 2);
        iosTick();
        for (let i = 1; i < pulses; i += 1) {
          const at = pattern.slice(0, i * 2).reduce((sum, ms) => sum + ms, 0);
          setTimeout(iosTick, at);
        }
        return true;
      }
      return false;
    } catch (_) { return false; }
  };

  const setEnabled = (next) => {
    enabled = !!next;
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (_) {}
  };

  try {
    window.GN_HAPTICS = Object.freeze({
      fire,
      enabled: () => enabled,
      setEnabled,
      supported,
      platform,
      patterns: GN_TACTILE_PATTERNS
    });
  } catch (_) {}
})();
