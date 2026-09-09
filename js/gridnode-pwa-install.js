/* GRID//NODE PWA install driver + native shortcut actions.
 *
 * Two things that make the PWA feel native, both previously dead:
 *  1. ?action= shortcuts from the manifest (Log Shot / Log Weight home
 *     screen shortcuts) now open their modals on launch.
 *  2. The install banner and iOS/Android hint cards in index.html finally
 *     get a driver: beforeinstallprompt on Android, manual Share-menu
 *     steps on iOS, manual menu steps on Android without a prompt event.
 *
 * Polite by design: never nags on the first visit, never re-prompts
 * within 14 days of a dismissal, never shows when already installed.
 */
(function () {
  'use strict';

  var VISITS_KEY = 'gn_pwa_visits_v1';
  var DISMISS_KEY = 'gn_pwa_dismissed_v1';
  var SNOOZE_MS = 14 * 86400000;
  var deferredPrompt = null;

  function $(id) { return document.getElementById(id); }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

  function isStandalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
             window.matchMedia('(display-mode: fullscreen)').matches ||
             window.navigator.standalone === true;
    } catch (_) { return false; }
  }
  var UA = (navigator.userAgent || '').toLowerCase();
  function isIOS() { return /iphone|ipad|ipod/.test(UA); }
  function isAndroid() { return /android/.test(UA); }

  function snoozed() {
    var t = Number(read(DISMISS_KEY) || 0);
    return t > 0 && Date.now() - t < SNOOZE_MS;
  }
  function hideAll() {
    ['gnPwaInstallBanner', 'gnPwaIosHint', 'gnPwaAndroidHint'].forEach(function (id) {
      var el = $(id); if (el) el.style.display = 'none';
    });
  }
  function dismiss() { write(DISMISS_KEY, String(Date.now())); hideAll(); }

  function eligible() {
    if (isStandalone() || snoozed()) return false;
    return Number(read(VISITS_KEY) || 0) >= 2;
  }

  /* 1. Manifest shortcut actions (?action=log-shot / log-weight). */
  function handleActionParam() {
    var action = null;
    try { action = new URLSearchParams(location.search).get('action'); } catch (_) {}
    if (action !== 'log-shot' && action !== 'log-weight') return;
    try { history.replaceState(null, '', location.pathname); } catch (_) {}
    var tries = 0;
    var timer = window.setInterval(function () {
      tries++;
      var mod = window.GNModules || {};
      var fn = action === 'log-shot' ? (mod.openLogModal || window.openLogModal)
                                     : (mod.openWeightModal || window.openWeightModal);
      if (typeof fn === 'function') {
        window.clearInterval(timer);
        try { fn(); } catch (_) {}
      } else if (tries > 20) window.clearInterval(timer);
    }, 500);
  }

  /* 2. Install prompt driver. */
  function wire() {
    var installBtn = $('gnPwaInstallBtn');
    if (installBtn) installBtn.addEventListener('click', function () {
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          if (deferredPrompt.userChoice) {
            deferredPrompt.userChoice.then(dismiss, dismiss);
          } else { dismiss(); }
        } catch (_) { dismiss(); }
        deferredPrompt = null;
      } else { dismiss(); }
    });
    var closeBtn = $('gnPwaInstallClose');
    if (closeBtn) closeBtn.addEventListener('click', dismiss);
    ['gnPwaIosInstall', 'gnPwaIosLater', 'gnPwaAndroidInstall', 'gnPwaAndroidLater'].forEach(function (id) {
      var b = $(id);
      if (b) b.addEventListener('click', dismiss);
    });
    window.addEventListener('beforeinstallprompt', function (e) {
      try { e.preventDefault(); } catch (_) {}
      deferredPrompt = e;
      if (eligible()) { var el = $('gnPwaInstallBanner'); if (el) el.style.display = 'flex'; }
    });
    window.addEventListener('appinstalled', dismiss);
  }

  function boot() {
    handleActionParam();
    wire();
    write(VISITS_KEY, String(Number(read(VISITS_KEY) || 0) + 1));
    if (!eligible()) return;
    if (isIOS()) { var ios = $('gnPwaIosHint'); if (ios) ios.style.display = 'flex'; return; }
    if (!isAndroid()) return;
    // Android: give beforeinstallprompt a moment; fall back to manual steps.
    window.setTimeout(function () {
      if (!eligible()) return;
      if (deferredPrompt) { var b = $('gnPwaInstallBanner'); if (b) b.style.display = 'flex'; }
      else { var c = $('gnPwaAndroidHint'); if (c) c.style.display = 'flex'; }
    }, 2500);
  }

  window.GN_PWA = Object.freeze({
    isStandalone: isStandalone,
    handleActionParam: handleActionParam
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
