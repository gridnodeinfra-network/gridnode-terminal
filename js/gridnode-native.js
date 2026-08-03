/* GRID//NODE native-feel layer (Phases 3-4).
 * Keyboard ergonomics, native input upgrades, focus management, haptics.
 * Loaded as a satellite after the bundle; requires no bundle edits.
 */
(function () {
  'use strict';

  const V = '20260802.11';
  const OVERLAY_SELECTOR = '#logOv, #wtOv, #signOutOverlay, #archiveConfirmOv, #permanentDeleteConfirmOv, #futureTimestampConfirm, #csvImportOverlay';

  // 1. Styles — injected once so the static shell never needs editing for css.
  function injectCss() {
    if (document.getElementById('gnNativeCss')) return;
    const link = document.createElement('link');
    link.id = 'gnNativeCss';
    link.rel = 'stylesheet';
    link.href = './css/gridnode-native.css?v=' + V;
    document.head.appendChild(link);
  }

  // 2. Keyboard ergonomics — when the on-screen keyboard shrinks the visual
  //    viewport, cap the open sheet and keep the active field visible.
  const KEYBOARD_RATIO = 0.82;
  let keyboardVisible = false;

  function scrollActiveInputIntoView() {
    const active = document.activeElement;
    if (!active || !/INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
    const overlay = active.closest && active.closest(OVERLAY_SELECTOR);
    if (!overlay) return;
    const vv = window.visualViewport;
    const top = vv ? vv.offsetTop : 0;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const rect = active.getBoundingClientRect();
    if (rect.bottom > bottom - 8 || rect.top < top + 8) {
      active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function syncKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    const visible = vv.height < window.innerHeight * KEYBOARD_RATIO;
    if (visible === keyboardVisible) return;
    keyboardVisible = visible;
    document.documentElement.classList.toggle('gn-keyboard-open', visible);
    if (visible) window.setTimeout(scrollActiveInputIntoView, 60);
  }

  function watchKeyboard() {
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncKeyboard);
      window.visualViewport.addEventListener('scroll', syncKeyboard);
    } else {
      window.addEventListener('resize', syncKeyboard);
    }
    document.addEventListener('focusin', (event) => {
      const el = event.target;
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) {
        window.setTimeout(scrollActiveInputIntoView, 250);
      }
    });
  }

  // 3. Native input upgrades — the bundle creates the weight modal inputs
  //    lazily; once they exist, swap the time field to the native time picker
  //    (value format HH:MM is already what the app reads back).
  function upgradeNativeInputs() {
    const wtTime = document.getElementById('wtTime');
    if (wtTime && wtTime.type !== 'time') {
      wtTime.type = 'time';
      wtTime.inputMode = 'none';
    }
  }

  // 4. Modal hygiene — Escape closes, Tab stays inside the open overlay.
  function wireOverlay(overlay) {
    if (!overlay || overlay.dataset.gnNativeBound) return;
    overlay.dataset.gnNativeBound = 'true';
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const close = overlay.querySelector('[data-dismiss], .modal-close, [data-modal-close]');
        if (close) { close.click(); return; }
        overlay.classList.remove('active');
        return;
      }
      if (event.key !== 'Tab') return;
      if (!overlay.classList.contains('active')) return;
      const focusables = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  // 5. Page-switch focus — after a nav tap, move focus to the new page's
  //    heading so keyboard users are never left with stale focus.
  function wirePageFocus() {
    const heading = (page) => page && (page.querySelector('h1, h2, [data-page-title]'));
    document.addEventListener('click', (event) => {
      const nav = event.target && event.target.closest ? event.target.closest('.nav-item, [data-nav]') : null;
      if (!nav) return;
      const page = document.querySelector('.page.active');
      const target = heading(page);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
  }

  // 6. Haptics — light taps on navigation and saves; never under reduced motion.
  function haptic(pattern) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (_) { /* unsupported */ }
  }

  function wireHaptics() {
    document.addEventListener('click', (event) => {
      const el = event.target && event.target.closest ? event.target.closest('.nav-item, .fab') : null;
      if (!el) return;
      haptic(el.classList.contains('nav-item') ? 4 : 8);
    });
    document.addEventListener('click', (event) => {
      const t = event.target;
      if (!t || !t.closest) return;
      if (t.closest('[onclick*="saveShot"], [onclick*="saveWt"], [onclick*="confirmArchive"]')) {
        haptic([12, 40, 16]);
      }
    });
  }

  // 6. Poll for lazily-created overlays and inputs (cheap, idempotent).
  function pollUpgrades() {
    upgradeNativeInputs();
    document.querySelectorAll(OVERLAY_SELECTOR).forEach(wireOverlay);
  }

  function boot() {
    injectCss();
    watchKeyboard();
    wirePageFocus();
    wireHaptics();
    pollUpgrades();
    window.setInterval(pollUpgrades, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
