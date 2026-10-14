/* GRID//NODE chunk loader — code-split delivery (2026-10-12).
 *
 * Classic scripts share one global scope; this loader fetches the lazy
 * files/chunks on first need (or in the deferred post-boot batch) with the
 * same ?v= stamp as the core bundle, installs delegate-after-load stubs for
 * the global entry points of lazy chunks, and owns the live GNModules
 * registry merge (window.GNRegisterChunk). Loaded chunks are runtime-cached
 * by sw.js (cache-first, same-origin GET), so they work offline after the
 * first fetch with no SHELL entry.
 *
 * Boot timing (verified): this script is the LAST defer script, so it
 * executes after gridnode-bundle.js. Its stubs therefore install before
 * DOMContentLoaded. gridnode-app.js bridge() runs inside the app's async
 * DOMContentLoaded handler (after `await GN_I18N.ready`) and UNCONDITIONALLY
 * assigns window.<name> = modules.<name>; the bridge was patched to keep an
 * existing function when modules.<name> is undefined, so stubs installed
 * here survive bridge(), and GNRegisterChunk replaces a stub when the real
 * chunk registers.
 */
(function () {
  'use strict';

  /* ---- version stamp: reuse the bundle script tag's ?v= value ---- */
  var bundleTag = document.querySelector('script[src*="gridnode-bundle.js"]');
  var bundleSrc = bundleTag ? bundleTag.src : '';
  var stamp = '';
  var base = './js/';
  try {
    var m = /[?&]v=([^&]+)/.exec(bundleSrc || '');
    if (m) stamp = m[1];
    if (bundleSrc) base = bundleSrc.replace(/gridnode-bundle\.js.*$/, '');
  } catch (_) {}

  /* ---- manifest: key -> file in js/ ---- */
  var MANIFEST = {
    whatsnew: 'gridnode-whatsnew.js',
    onboarding: 'gridnode-onboarding.js',
    telemetry: 'gridnode-telemetry.js',
    motivation: 'gridnode-motivation.js',
    reminders: 'gridnode-reminders.js',
    templates: 'gridnode-phase-templates.js',
    sphere: 'gridnode-phase-sphere.js',
    viz: 'gridnode-peptide-viz.js',
    pk: 'gridnode-peptide-pk.js',
    labtests: 'gridnode-lab-tests.js',
    /* Stage 2 bundle chunks (built by scripts/build-bundle.sh). */
    history: 'gridnode-chunk-history.js',
    logshot: 'gridnode-chunk-logshot.js',
    progress: 'gridnode-chunk-progress.js',
    lab: 'gridnode-chunk-lab.js',
    vault: 'gridnode-chunk-vault.js',
    import: 'gridnode-chunk-import.js',
    ambience: 'gridnode-chunk-ambience.js'
  };

  var loadPromises = Object.create(null);   // key -> Promise (memoized; cleared on failure)
  var compositePromises = Object.create(null);
  var loaded = new Set();                    // keys whose script finished loading

  function GNLoadScript(key) {
    if (loaded.has(key)) return Promise.resolve();
    if (loadPromises[key]) return loadPromises[key];
    var file = MANIFEST[key];
    if (!file) return Promise.resolve(); // not split yet / unknown key: no-op
    var url = base + file + (stamp ? '?v=' + stamp : '');
    var promise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.onload = function () { loaded.add(key); resolve(); };
      script.onerror = function () {
        delete loadPromises[key]; // clear the memo so a retry can succeed
        reject(new Error('GN chunk load failed: ' + key));
      };
      document.head.appendChild(script);
    });
    loadPromises[key] = promise;
    return promise;
  }
  window.GNLoadScript = GNLoadScript;

  /* ---- composite loads (chunk-to-chunk hard edges, Analysis A §3) ---- */
  function loadComposite(key) {
    if (compositePromises[key]) return compositePromises[key];
    var promise;
    switch (key) {
      case 'history':
        promise = GNLoadScript('history');
        break;
      case 'logshot':
        /* 05 needs 04's selectScannerLocation at interaction time and 03 at
           save-refresh time: history chunk loads BEFORE the logshot chunk. */
        promise = loadComposite('history').then(function () { return GNLoadScript('logshot'); });
        break;
      case 'progress':
        /* templates awaited before sphere executes (sphere self-retries
           anyway); viz/pk ride along with the progress chunk. */
        promise = (async function () {
          await GNLoadScript('templates');
          await Promise.all([GNLoadScript('progress'), GNLoadScript('viz'), GNLoadScript('pk')]);
          await GNLoadScript('sphere');
        })();
        break;
      case 'lab':
        promise = Promise.all([GNLoadScript('lab'), GNLoadScript('labtests')]).then(function () {});
        break;
      case 'vault':
        /* 09 hard-depends on 08 helpers: lab chunk FIRST, then vault. */
        promise = (async function () {
          await GNLoadScript('lab');
          await GNLoadScript('vault');
        })();
        break;
      case 'import':
        promise = GNLoadScript('import');
        break;
      case 'ambience':
        promise = GNLoadScript('ambience');
        break;
      default:
        promise = GNLoadScript(key);
    }
    compositePromises[key] = promise;
    promise.catch(function () { delete compositePromises[key]; });
    return promise;
  }

  var PAGE_KEYS = { Dash: null, Log: 'history', Results: 'progress', Lab: 'lab', Profile: 'vault' };
  window.GNEnsurePage = function (name) {
    var key = PAGE_KEYS[name];
    if (!key) return Promise.resolve();
    return loadComposite(key);
  };

  window.GNChunks = {
    loaded: loaded,
    has: function (key) { return loaded.has(key); },
    ready: function (key) {
      return (key in PAGE_KEYS || key === 'logshot' || key === 'import' || key === 'ambience')
        ? loadComposite(key)
        : GNLoadScript(key);
    }
  };

  /* ---- chunk registration (called by each Stage 2 chunk's trailer) ---- */
  /* Names bridge() in gridnode-app.js copies onto window.* — source of
     truth for which chunk exports get back-filled onto window. */
  var BRIDGE_NAMES = new Set(('showScreen showPage refreshAll loadApp showPhasesModal closePhases ' +
    'openLogModal closeLog saveShot editShot handleShotFab gnShotStepNext gnShotStepBack gnShotPrimaryAction gnToggleShotAdvanced ' +
    'openArchiveConfirm cancelArchiveShot confirmArchiveShot restoreArchivedShot openPermanentDeleteConfirm cancelPermanentDeleteShot confirmPermanentDeleteShot ' +
    'openFutureTimestampConfirm closeFutureTimestampConfirm cancelFutureTimestampSave confirmFutureTimestampSave setScannerMode ' +
    'selectScannerLocation renderScanner openWeightModal closeWt saveWt setWeightUnit setRange setWtRange showLabSeg showYouSeg toggleSelect ' +
    'selectOpt saveProfileMed saveProfileMetrics calcAndShowBMI updatePills selPill gnMedRevealGroup gnSetShotMeridiem gnShotClockLiveFormat ' +
    'gnNormalizeShotClockField gnWeightDateInput gnWeightTimeInput gnOpenShotDatePicker gnCloseShotDatePicker gnDatePickerMove gnSelectPickerDate gnSetShotDateFromPicker ' +
    'gnSetShotDateValue gnSetShotTimeValue updateSyr updateRecon updateSupply exportCSV exportBackup exportInventory handleCSVImportFile cancelCSVImport confirmCSVImport prepareCSVImport ' +
    'openImportDialog closeImportDialog handleBackupImportFile confirmBackupImport handleShotsyJSONFile toggleImportForce parseShotsyJSON ' +
    'openDeleteLocalData closeDeleteLocalData updateDeleteLocalButton confirmDeleteLocalData openDeleteCloudAccount closeDeleteCloudAccount confirmDeleteCloudAccount ' +
    'saveMeasurements setMeasurementUnit updateDoseProjection saveCalculatorReference calPrev calNext calDayClick openArsenalMod closeArs saveArs ' +
    'requestLoadoutRemove cancelLoadoutRemove confirmLoadoutRemove refreshNodeHeader openLabTool closeLabTool dismissSystemUpdate openSystemUpdate setResultsView ' +
    'openPrivacyPolicy closePrivacyPolicy openDataOwnership openTermsOfService closeTermsOfService replayGuidedTour openMedicalDisclaimer').split(/\s+/));

  window.GNRegisterChunk = function (key, map) {
    try {
      if (!window.GNModules) window.GNModules = {};
      Object.assign(window.GNModules, map || {});
      Object.keys(map || {}).forEach(function (name) {
        if (!BRIDGE_NAMES.has(name)) return;
        var current = window[name];
        /* Replace the boot stub (or an absent/undefined bridge copy); never
           replace a live real function (e.g. native's wrapped saveShot). */
        if (typeof current !== 'function' || current.__gnStub) window[name] = map[name];
      });
      loaded.add(key);
      if (key === 'logshot') {
        /* Native's wireShotDraft wraps window.saveShot for draft-clearing;
           it ran at boot against the stub, so re-run it now that the real
           saveShot exists. bridgeReady also re-runs wireNavigationStack,
           which is internally guarded (navigationWired) — safe. */
        try { window.GN_NATIVE?.bridgeReady?.(); } catch (_) {}
      }
      if (key === 'progress') {
        /* 02-dashboard calls renderProtocolCurve under a typeof guard until
           the progress chunk lands; re-render TODAY now so the real curve
           paints without waiting for the next dashboard refresh. */
        try {
          var dash = document.getElementById('pageDash');
          if (dash && dash.classList.contains('active') && typeof window.renderDashboard === 'function') window.renderDashboard();
        } catch (_) {}
      }
      if (key === 'history') {
        /* 11-misc registers these installers on DOMContentLoaded/load, but
           in the split build the scanner chunk may land after both events. */
        try { if (typeof window.installScannerPointerHandlers === 'function') window.installScannerPointerHandlers(); } catch (_) {}
        try { if (typeof window.installScannerDebugMode === 'function') window.installScannerDebugMode(); } catch (_) {}
      }
    } catch (_) {}
  };

  /* ---- boot stubs: delegate-after-load for lazy entry points ----
     Installed ONLY when the current value is not already a function: in the
     unsplit build the real functions exist and no stub is installed. */
  function makeStub(name, compositeKey) {
    var stub = function () {
      var args = arguments;
      var self = this;
      return loadComposite(compositeKey).then(function () {
        var real = (window.GNModules && window.GNModules[name]) || window[name];
        if (typeof real === 'function' && real !== stub) return real.apply(self, args);
        return undefined;
      });
    };
    stub.__gnStub = true;
    return stub;
  }
  function installStub(name, compositeKey) {
    if (typeof window[name] === 'function') return;
    var stub = makeStub(name, compositeKey);
    window[name] = stub;
    try { if (window.GNModules && typeof window.GNModules[name] !== 'function') window.GNModules[name] = stub; } catch (_) {}
  }
  var STUB_GROUPS = {
    logshot: ['openLogModal', 'handleShotFab', 'closeLog', 'saveShot', 'editShot', 'gnShotStepNext', 'gnShotStepBack',
      'gnShotPrimaryAction', 'gnToggleShotAdvanced', 'openArchiveConfirm', 'cancelArchiveShot', 'confirmArchiveShot',
      'restoreArchivedShot', 'openPermanentDeleteConfirm', 'cancelPermanentDeleteShot', 'confirmPermanentDeleteShot',
      'openFutureTimestampConfirm', 'closeFutureTimestampConfirm', 'cancelFutureTimestampSave', 'confirmFutureTimestampSave'],
    progress: ['openWeightModal', 'closeWt', 'saveWt', 'setWeightUnit', 'setRange', 'setWtRange', 'setResultsView'],
    history: ['setScannerMode', 'selectScannerLocation', 'setShotHistoryView', 'setHistoryType'],
    lab: ['openLabTool', 'closeLabTool', 'exportInventory', 'updateSyr', 'updateRecon', 'updateSupply',
      'setMeasurementUnit', 'saveMeasurements', 'updateDoseProjection', 'saveCalculatorReference', 'replayGuidedTour'],
    vault: ['openPrivacyPolicy', 'openTermsOfService', 'openMedicalDisclaimer', 'closePrivacyPolicy', 'closeTermsOfService',
      'openDataOwnership', 'exportCSV', 'exportBackup', 'dismissSystemUpdate', 'openSystemUpdate',
      'openDeleteLocalData', 'closeDeleteLocalData', 'updateDeleteLocalButton', 'confirmDeleteLocalData',
      'openDeleteCloudAccount', 'closeDeleteCloudAccount', 'confirmDeleteCloudAccount'],
    import: ['openImportDialog', 'closeImportDialog', 'prepareCSVImport', 'handleCSVImportFile', 'cancelCSVImport',
      'confirmCSVImport', 'handleBackupImportFile', 'confirmBackupImport', 'handleShotsyJSONFile', 'toggleImportForce', 'parseShotsyJSON']
  };
  /* Non-export, non-bridge names that 11-misc's boot-wired delegated click
     handler calls by bare name (bare globals resolve through window, so a
     window stub covers them): research delete lives in 08, restore-edit and
     the custom-mode switch live in 05. */
  installStub('deleteResearchRecord', 'lab');
  installStub('restoreArchivedShotToEdit', 'logshot');
  installStub('researchEnterCustomMode', 'logshot');
  /* QA chunk-boundary audit (2026-10-14): 08-lab's research template calls
     researchBackToLibrary() from an inline onclick; it lives in 05 and had
     no stub, so the Back button was dead whenever the logshot chunk had
     not loaded yet. Same family as the three names above. */
  installStub('researchBackToLibrary', 'logshot');
  Object.keys(STUB_GROUPS).forEach(function (group) {
    STUB_GROUPS[group].forEach(function (name) { installStub(name, group); });
  });

  /* GN_AMBIENCE stub: only when the soundtrack chunk has not defined it.
     `enabled` is a boolean property on the real object (13-haptics reads it
     as a value), so the stub exposes a false-valued getter, not a function. */
  if (typeof window.GN_AMBIENCE === 'undefined') {
    var ambienceStub = {
      toggle: function () {
        return loadComposite('ambience').then(function () {
          if (window.GN_AMBIENCE && window.GN_AMBIENCE !== ambienceStub) window.GN_AMBIENCE.toggle();
        });
      }
    };
    Object.defineProperty(ambienceStub, 'enabled', { get: function () { return false; } });
    window.GN_AMBIENCE = ambienceStub;
    /* Left-on resume: if sound was left on, load the ambience chunk on the
       first gesture so its own boot-arm can start playback (Analysis A §1.9). */
    document.addEventListener('pointerdown', function () {
      var on = false;
      try { on = localStorage.getItem('gn_sound_v1') === '1'; } catch (_) {}
      if (on && !loaded.has('ambience')) loadComposite('ambience').catch(function () {});
    });
  }

  /* ---- page triggers for the separate-file lazies ----
     showPage dispatches gn:pagechange synchronously on every navigation
     (01-shell), which is the Stage 1 trigger for the PROGRESS/LAB files.
     Stage 2's showPage hook loads the bundle chunks through GNEnsurePage;
     these memoized loads simply no-op once a file is loaded. */
  document.addEventListener('gn:pagechange', function (event) {
    var name = event && event.detail && event.detail.name;
    if (name === 'Results') {
      GNLoadScript('templates').then(function () { return GNLoadScript('sphere'); }).catch(function () {});
      GNLoadScript('viz').catch(function () {});
      GNLoadScript('pk').catch(function () {});
    }
    if (name === 'Lab') GNLoadScript('labtests').catch(function () {});
  });

  /* ---- deferred batch: runs once #app is shown, on idle ----
     Order is contractual (Analysis A §2.1/§2.2):
     templates (parallel) -> onboarding -> whatsnew -> telemetry ->
     motivation -> reminders -> vault preload -> progress composite (last,
     so TODAY's protocol curve lands without blocking first paint). */
  var deferredStarted = false;
  function startDeferredBatch() {
    if (deferredStarted) return;
    deferredStarted = true;
    (async function () {
      /* (a) templates at showApp time, parallel and non-blocking; the
         fallback + gn:phase-state-ready re-render already exist in 00/02. */
      GNLoadScript('templates').catch(function () {});
      /* (b) onboarding — prioritized for first-run users;
         returning users (onboarding complete) still get it in this
         batch for REPLAY TOUR. */
      try { await GNLoadScript('onboarding'); } catch (_) {}
      /* Re-dispatch rule: if whatsnew somehow resolved before onboarding
         registered its listener, re-fire once so maybeAutoStart can't stall.
         VISUALS MAX 2 / F3: never re-fire while whatsnew is still pending
         (shouldAutoShow) — a bare resolved event would release the
         onboarding guide underneath the still-open changelog modal. */
      try { if (window.GN_WHATS_NEW && (typeof window.GN_WHATS_NEW.shouldAutoShow !== 'function' || !window.GN_WHATS_NEW.shouldAutoShow())) document.dispatchEvent(new CustomEvent('gn:whatsnew-resolved')); } catch (_) {}
      /* (c) whatsnew AFTER onboarding has loaded (or failed). */
      try { await GNLoadScript('whatsnew'); } catch (_) {}
      /* (d) telemetry, then re-dock via its refresh hook. */
      try {
        await GNLoadScript('telemetry');
        if (window.GN_TELEMETRY && typeof window.GN_TELEMETRY.refresh === 'function') window.GN_TELEMETRY.refresh();
      } catch (_) {}
      /* (e) motivation, reminders. */
      try { await GNLoadScript('motivation'); } catch (_) {}
      try { await GNLoadScript('reminders'); } catch (_) {}
      /* (f) vault chunk preload (no-op until Stage 2 adds the manifest key). */
      if (MANIFEST.vault) { try { await loadComposite('vault'); } catch (_) {} }
      /* Progress composite LAST: restores TODAY's protocol curve (02 calls
         renderProtocolCurve under a typeof guard until this lands, then the
         next renderDashboard paints the real curve). */
      if (MANIFEST.progress) { try { await loadComposite('progress'); } catch (_) {} }
    })();
  }
  function watchForApp() {
    var tries = 0;
    var timer = window.setInterval(function () {
      tries++;
      var app = document.getElementById('app');
      var visible = false;
      try { visible = !!app && getComputedStyle(app).display !== 'none'; } catch (_) {}
      if (visible || tries > 200) {
        window.clearInterval(timer);
        if (!visible) return;
        if (typeof requestIdleCallback === 'function') requestIdleCallback(startDeferredBatch, { timeout: 2000 });
        else window.setTimeout(startDeferredBatch, 400);
      }
    }, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchForApp, { once: true });
  else watchForApp();
})();
