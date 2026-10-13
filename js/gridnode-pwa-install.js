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

  /* 1. Manifest shortcut actions (?action=log-shot / log-weight).
   *
   * Queued intent (2026-10-12 fix): the modal must never fire over the
   * landing / login screens. Entry completion has exactly one funnel in
   * gridnode-app.js: showApp(), reached by enterLocalSession(),
   * completeCloudSession() (Google / email / passkey) and restoreSession()
   * (returning local or cloud user). showApp() calls
   * modules.showScreen('app'), and showScreen() (01-shell.js) is the only
   * place that activates a .screen: it removes .active from every screen,
   * sets the target's display to flex, then adds .active on the next frame.
   * So "#app.screen is .active and rendered" is a universal, storage-free
   * entry-complete signal: it holds for local AND cloud entry (cloud
   * sessions never write the local gn_session_v2 key, so a storage check
   * would miss Google users), and it is false on landing, boot and login.
   *
   * Returning users: entry may not have happened yet when this runs at
   * DOMContentLoaded (restoreSession is async), so "already entered" is
   * not required up front; the queue below fires the moment #app activates,
   * with no user interaction, exactly as the old immediate dispatch did.
   * Fresh users: the action is held until they finish entry, however long
   * that takes. If they never enter, nothing ever fires. */
  function entryComplete() {
    var app = $('app');
    if (!app || !app.classList.contains('active')) return false;
    try { return window.getComputedStyle(app).display !== 'none'; }
    catch (_) { return app.style.display !== 'none'; }
  }

  function handleActionParam() {
    var action = null;
    try { action = new URLSearchParams(location.search).get('action'); } catch (_) {}
    if (action !== 'log-shot' && action !== 'log-weight') return;
    try { history.replaceState(null, '', location.pathname); } catch (_) {}

    var fired = false;
    var observer = null;
    var timer = null;

    function cleanup() {
      if (timer !== null) { window.clearInterval(timer); timer = null; }
      if (observer) { try { observer.disconnect(); } catch (_) {} observer = null; }
    }

    function tryFire() {
      if (fired) return;
      /* Hard gate, re-checked at fire time: never over landing/login,
       * not even if entry completed and the user signed back out while
       * the lazy modal function was still loading. */
      if (!entryComplete()) return;
      var mod = window.GNModules || {};
      var fn = action === 'log-shot' ? (mod.openLogModal || window.openLogModal)
                                     : (mod.openWeightModal || window.openWeightModal);
      if (typeof fn !== 'function') return; // poll/observer keep waiting
      fired = true;
      cleanup();
      try { fn(); } catch (_) {}
    }

    /* Primary signal: MutationObserver on #app. showScreen() mutates
     * #app's class (and inline display) on every screen switch, so entry
     * is observed the frame it happens, with no polling latency. */
    var appEl = $('app');
    if (appEl && typeof window.MutationObserver === 'function') {
      observer = new window.MutationObserver(tryFire);
      try { observer.observe(appEl, { attributes: true, attributeFilter: ['class', 'style'] }); }
      catch (_) { observer = null; }
    }

    /* Backstop + function-availability poll (the pre-fix 500 ms poll,
     * kept as a component): covers a missed observer delivery and the
     * post-code-split lazy stubs, which only exist once the chunk loader
     * has run. Unlike the old poll it has no 20-try expiry: a queued
     * intent has to outlive a fresh user reading the landing and clearing
     * the legal gate. It stops on fire; if entry never completes it only
     * ever re-checks a class list, and its lifetime is the page's. */
    timer = window.setInterval(tryFire, 500);

    /* Returning user whose entry already completed before this ran. */
    tryFire();
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
