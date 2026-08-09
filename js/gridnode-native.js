/* GRID//NODE native mobile-web shell.
 * Stable visual viewport, keyboard ergonomics, app-history discipline,
 * draft continuity, lifecycle status, and safe service-worker activation.
 */
(function () {
  'use strict';

  const V = '20260808.22';
  const SHOT_DRAFT_KEY = 'gn_shot_draft_session_v1';
  const PAGE_KEY = 'gn_active_page_session_v1';
  const OVERLAY_SELECTOR = '#logOv, #wtOv, #signOutOverlay, #archiveConfirmOv, #permanentDeleteConfirmOv, #futureTimestampConfirm, #csvImportOverlay, #gnWhatsNewOverlay, .gn-onb-overlay, .gn-lab-tool-overlay';
  const PAGE_NAMES = { pageDash: 'Dash', pageLog: 'Log', pageResults: 'Results', pageLab: 'Lab', pageProfile: 'Profile', pageCal: 'Cal' };
  let keyboardVisible = false;
  let handlingPop = false;
  let consumeInternalHistoryPop = false;
  let navigationWired = false;
  let shotDraftEventsWired = false;

  function isSpanish() { return document.documentElement.lang === 'es'; }
  function copy(en, es) { return isSpanish() ? es : en; }

  function injectCss() {
    if (document.getElementById('gnNativeCss')) return;
    const link = document.createElement('link');
    link.id = 'gnNativeCss';
    link.rel = 'stylesheet';
    link.href = './css/gridnode-native.css?v=' + V;
    document.head.appendChild(link);
  }

  function syncViewport() {
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--gn-viewport-height', Math.round(height) + 'px');
    document.documentElement.style.setProperty('--gn-viewport-top', Math.round(vv ? vv.offsetTop : 0) + 'px');
  }

  function scrollActiveInputIntoView() {
    const active = document.activeElement;
    if (!active || !/INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
    const vv = window.visualViewport;
    const top = vv ? vv.offsetTop : 0;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const rect = active.getBoundingClientRect();
    if (rect.bottom > bottom - 12 || rect.top < top + 12) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function syncKeyboard() {
    syncViewport();
    const vv = window.visualViewport;
    const visible = Boolean(vv && vv.height < window.innerHeight * .82);
    if (visible === keyboardVisible) return;
    keyboardVisible = visible;
    document.documentElement.classList.toggle('gn-keyboard-open', visible);
    if (visible) window.setTimeout(scrollActiveInputIntoView, 60);
  }

  function watchViewportAndKeyboard() {
    syncViewport();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncKeyboard, { passive: true });
      window.visualViewport.addEventListener('scroll', syncKeyboard, { passive: true });
    }
    window.addEventListener('resize', syncKeyboard, { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(syncViewport, 120), { passive: true });
    document.addEventListener('focusin', (event) => {
      if (/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || '')) window.setTimeout(scrollActiveInputIntoView, 220);
    });
  }

  function runtimeBanner() {
    let banner = document.getElementById('gnRuntimeBanner');
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'gnRuntimeBanner';
    banner.className = 'gn-runtime-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = '<span class="gn-runtime-dot" aria-hidden="true"></span><span class="gn-runtime-copy"></span><button type="button" class="gn-runtime-action"></button>';
    document.body.prepend(banner);
    return banner;
  }

  function showStatus(kind, message, action) {
    const banner = runtimeBanner();
    banner.dataset.kind = kind;
    banner.querySelector('.gn-runtime-copy').textContent = message;
    const button = banner.querySelector('.gn-runtime-action');
    button.hidden = !action;
    button.textContent = action?.label || '';
    button.onclick = action?.run || null;
    banner.classList.add('active');
    if (kind === 'synced') window.setTimeout(() => banner.dataset.kind === 'synced' && banner.classList.remove('active'), 1800);
  }

  function wireConnectivity() {
    let reconnectTimer = 0;
    const offline = () => {
      clearTimeout(reconnectTimer);
      document.documentElement.classList.add('gn-offline');
      showStatus('offline', copy('OFFLINE · LOCAL DATA ACTIVE', 'SIN CONEXIÓN · DATOS LOCALES ACTIVOS'));
    };
    const online = () => {
      document.documentElement.classList.remove('gn-offline');
      showStatus('reconnecting', copy('RECONNECTING…', 'RECONECTANDO…'));
      reconnectTimer = window.setTimeout(() => showStatus('synced', copy('CONNECTION RESTORED', 'CONEXIÓN RESTAURADA')), 650);
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    navigator.onLine ? document.documentElement.classList.remove('gn-offline') : offline();
  }

  function captureShotDraft() {
    const modal = document.getElementById('logOv');
    if (!modal) return null;
    const selectState = window.GNModules?.selectState || {};
    const medState = selectState.cpShotMed;
    const medLabel = document.getElementById('cpShotMedVal')?.textContent?.trim() || '';
    const draft = {
      med: typeof medState === 'object' ? (medState?.val || '') : (medState || ''), medLabel,
      dose: document.getElementById('sDose')?.value || '',
      date: document.getElementById('sDate')?.value || '',
      time: document.getElementById('sTime')?.value || '',
      wt: document.getElementById('sWt')?.value || '',
      notes: document.getElementById('sNotes')?.value || '',
      sideEffects: Array.from(modal.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value),
      savedAt: Date.now()
    };
    try { sessionStorage.setItem(SHOT_DRAFT_KEY, JSON.stringify(draft)); } catch (_) {}
    return draft;
  }

  function restoreShotDraft() {
    if (window.GNModules?.moduleState?.editingShotId) return;
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem(SHOT_DRAFT_KEY) || 'null'); } catch (_) { return; }
    if (!draft || Date.now() - Number(draft.savedAt || 0) > 24 * 60 * 60 * 1000) return;
    const values = { sDose: draft.dose, sDate: draft.date, sTime: draft.time, sWt: draft.wt, sNotes: draft.notes };
    Object.keys(values).forEach(id => { const input = document.getElementById(id); if (input && values[id] != null) input.value = values[id]; });
    if (draft.med && window.GNModules?.selectState) {
      window.GNModules.selectState.cpShotMed = { val: draft.med, label: draft.medLabel || draft.med };
      const value = document.getElementById('cpShotMedVal');
      if (value) { value.textContent = draft.medLabel || draft.med; value.classList.remove('placeholder'); }
    }
    document.querySelectorAll('#logOv input[type="checkbox"]').forEach(input => { input.checked = (draft.sideEffects || []).includes(input.value); });
  }

  function wireShotDraft() {
    if (!shotDraftEventsWired) {
      shotDraftEventsWired = true;
      document.addEventListener('input', event => { if (event.target?.closest?.('#logOv')) captureShotDraft(); }, { passive: true });
      document.addEventListener('change', event => { if (event.target?.closest?.('#logOv')) captureShotDraft(); }, { passive: true });
    }
    const originalSave = window.saveShot;
    if (typeof originalSave === 'function' && !originalSave.gnNativeWrapped) {
      const wrapped = function () {
        const result = originalSave.apply(this, arguments);
        Promise.resolve(result).finally(() => {
          window.setTimeout(() => {
            if (!document.getElementById('logOv')?.classList.contains('active') && !document.getElementById('futureTimestampConfirm')?.classList.contains('active')) {
              try { sessionStorage.removeItem(SHOT_DRAFT_KEY); } catch (_) {}
            }
          }, 0);
        });
        return result;
      };
      wrapped.gnNativeWrapped = true;
      window.saveShot = wrapped;
    }
  }

  function currentPageName() {
    const page = document.querySelector('.page.active');
    return page ? PAGE_NAMES[page.id] || 'Dash' : 'Dash';
  }

  function appIsActive() { return document.getElementById('app')?.classList.contains('active'); }

  function wireNavigationStack() {
    if (navigationWired) return true;
    navigationWired = true;
    let suppressPush = false;
    document.addEventListener('gn:pagechange', event => {
      const name = event.detail?.name;
      const previous = event.detail?.previousPage || '';
      if (appIsActive() && name) {
        try { sessionStorage.setItem(PAGE_KEY, name); } catch (_) {}
        if (!suppressPush && previous !== 'page' + name && history.state?.gnPage !== name) history.pushState({ gnApp: true, gnPage: name }, '');
      }
    });

    function initializeAppHistory() {
      if (!appIsActive()) return;
      const stored = (() => { try { return sessionStorage.getItem(PAGE_KEY); } catch (_) { return null; } })();
      const target = PAGE_NAMES['page' + stored] ? stored : currentPageName();
      /* A reload must never resurrect a stale modal/popover marker. */
      history.replaceState({ gnApp: true, gnPage: target }, '');
      if (target !== currentPageName() && typeof window.showPage === 'function') { suppressPush = true; window.showPage(target); suppressPush = false; }
    }

    const app = document.getElementById('app');
    if (app) new MutationObserver(initializeAppHistory).observe(app, { attributes: true, attributeFilter: ['class', 'style'] });
    initializeAppHistory();

    window.addEventListener('popstate', event => {
      handlingPop = true;
      if (consumeInternalHistoryPop) {
        consumeInternalHistoryPop = false;
        window.setTimeout(() => { handlingPop = false; }, 0);
        return;
      }
      const openDrop = Array.from(document.querySelectorAll('.cp-dropdown.open, .gn-select-menu.open, .gn-custom-picker.open, .gn-custom-date.open')).at(-1);
      if (openDrop) {
        openDrop.classList.remove('open');
        window.setTimeout(() => { handlingPop = false; }, 0);
        return;
      }
      const openOverlay = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).filter(node => node.classList.contains('active') || getComputedStyle(node).display === 'flex').at(-1);
      if (openOverlay) {
        // A nested picker/popover just returned to this layer. Keep the parent
        // sheet/tool open; Back must consume one stack level at a time.
        if (event.state?.gnLayer === openOverlay.id) {
          window.setTimeout(() => { handlingPop = false; }, 0);
          return;
        }
        if (openOverlay.id === 'logOv') captureShotDraft();
        openOverlay.classList.remove('active');
        if (openOverlay.id === 'signOutOverlay') openOverlay.style.display = 'none';
      } else if (event.state?.gnPage && appIsActive()) {
        suppressPush = true;
        if (typeof window.showPage === 'function') window.showPage(event.state.gnPage);
        suppressPush = false;
      }
      window.setTimeout(() => { handlingPop = false; }, 0);
    });
    return true;
  }

  function wirePopoverHistory() {
    const selector = '.cp-dropdown,.gn-select-menu,.gn-custom-picker,.gn-custom-date';
    const isOpen = node => node.classList.contains('open');
    const observer = new MutationObserver(records => records.forEach(record => {
      const popover = record.target;
      if (!popover.matches?.(selector)) return;
      const id = popover.id || popover.querySelector('select')?.id || 'popover';
      if (isOpen(popover) && !popover.dataset.gnHistoryOpen) {
        popover.dataset.gnHistoryOpen = 'true';
        if (!handlingPop && history.state?.gnLayer !== 'popover:' + id) history.pushState({ ...(history.state || {}), gnLayer: 'popover:' + id }, '');
      } else if (!isOpen(popover) && popover.dataset.gnHistoryOpen) {
        delete popover.dataset.gnHistoryOpen;
        if (!handlingPop && history.state?.gnLayer === 'popover:' + id) {
          consumeInternalHistoryPop = true;
          history.back();
        }
      }
    }));
    const bind = node => {
      if (!node || node.dataset.gnPopoverHistoryBound) return;
      node.dataset.gnPopoverHistoryBound = 'true';
      observer.observe(node, { attributes: true, attributeFilter: ['class'] });
    };
    document.querySelectorAll(selector).forEach(bind);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return;
      if (node.matches?.(selector)) bind(node);
      node.querySelectorAll?.(selector).forEach(bind);
    }))).observe(document.body, { childList: true, subtree: true });
  }

  function wireLayerHistory() {
    const observer = new MutationObserver(records => records.forEach(record => {
      const layer = record.target;
      // The onboarding tour overlay is only present in the DOM while open
      // (dismiss() removes it), so presence === active. Without this it gets
      // aria-hidden="true" forever — a visible dialog invisible to AT.
      const active = layer.classList.contains('active') || (layer.id === 'signOutOverlay' && layer.style.display === 'flex') || layer.classList.contains('gn-onb-overlay');
      layer.setAttribute('aria-hidden', String(!active));
      const id = layer.id || 'layer';
      if (active && !layer.dataset.gnHistoryOpen) {
        layer.dataset.gnHistoryOpen = 'true';
        if (id === 'logOv') window.setTimeout(restoreShotDraft, 0);
        if (!handlingPop && history.state?.gnLayer !== id) history.pushState({ ...(history.state || {}), gnLayer: id }, '');
      } else if (!active && layer.dataset.gnHistoryOpen) {
        delete layer.dataset.gnHistoryOpen;
        if (!handlingPop && history.state?.gnLayer === id) {
          consumeInternalHistoryPop = true;
          history.back();
        }
      }
    }));
    const bind = layer => {
      if (!layer || layer.dataset.gnHistoryBound) return;
      layer.dataset.gnHistoryBound = 'true';
      observer.observe(layer, { attributes: true, attributeFilter: ['class', 'style'] });
      const active = layer.classList.contains('active') || (layer.id === 'signOutOverlay' && layer.style.display === 'flex') || layer.classList.contains('gn-onb-overlay');
      layer.setAttribute('aria-hidden', String(!active));
      if (active) {
        layer.dataset.gnHistoryOpen = 'true';
        if (!handlingPop && history.state?.gnLayer !== (layer.id || 'layer')) history.pushState({ ...(history.state || {}), gnLayer: layer.id || 'layer' }, '');
      }
    };
    document.querySelectorAll(OVERLAY_SELECTOR).forEach(bind);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return;
      if (node.matches?.(OVERLAY_SELECTOR)) bind(node);
      node.querySelectorAll?.(OVERLAY_SELECTOR).forEach(bind);
    }))).observe(document.body, { childList: true, subtree: true });
  }

  function upgradeDropdownSemantics() {
    document.querySelectorAll('.cp-select-trigger').forEach(trigger => {
      const drop = trigger.nextElementSibling?.classList.contains('cp-dropdown') ? trigger.nextElementSibling : trigger.parentElement?.querySelector('.cp-dropdown');
      if (!drop) return;
      if (!drop.id) drop.id = 'gnDrop' + Math.random().toString(36).slice(2, 9);
      trigger.setAttribute('role', 'button'); trigger.setAttribute('tabindex', '0'); trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-controls', drop.id); trigger.setAttribute('aria-expanded', String(drop.classList.contains('open')));
      drop.setAttribute('role', 'listbox');
      drop.querySelectorAll('.cp-option').forEach(option => { option.setAttribute('role', 'option'); option.setAttribute('tabindex', '-1'); });
      if (trigger.dataset.gnSelectBound) return;
      trigger.dataset.gnSelectBound = 'true';
      trigger.addEventListener('keydown', event => {
        if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Escape') { drop.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); return; }
        if (!drop.classList.contains('open')) trigger.click();
        trigger.setAttribute('aria-expanded', 'true');
        const options = drop.querySelectorAll('.cp-option');
        options[event.key === 'ArrowUp' ? options.length - 1 : 0]?.focus();
      });
      drop.addEventListener('keydown', event => {
        const options = Array.from(drop.querySelectorAll('.cp-option'));
        const index = options.indexOf(document.activeElement);
        if (event.key === 'Escape') { event.preventDefault(); drop.classList.remove('open'); trigger.focus(); }
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); document.activeElement?.click?.(); trigger.focus(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus(); }
      });
    });
  }

  function wireOverlayFocus() {
    document.querySelectorAll(OVERLAY_SELECTOR + ', .gn-lab-tool-overlay').forEach(overlay => {
      if (overlay.dataset.gnNativeBound) return;
      overlay.dataset.gnNativeBound = 'true';
      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          // A nested control gets first refusal. Its Escape handler marks the
          // event handled so the parent sheet/tool remains on screen.
          if (event.defaultPrevented) return;
          overlay.querySelector('[data-dismiss],.modal-close,[data-modal-close],[data-lab-back],.modal-btn.close')?.click();
          return;
        }
        if (event.key !== 'Tab' || !overlay.classList.contains('active')) return;
        const focusables = Array.from(overlay.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled);
        if (!focusables.length) return;
        if (event.shiftKey && document.activeElement === focusables[0]) { event.preventDefault(); focusables.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === focusables.at(-1)) { event.preventDefault(); focusables[0].focus(); }
      });
    });
  }

  function wireTouchFeedback() {
    // B14 (2026-08-08): 15ms haptic on pointerdown + 100ms punch animation
    // on the four bottom-nav tabs. Reduced-motion kills both; iOS falls back
    // to the visual punch only.
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.addEventListener('pointerdown', event => {
      const control = event.target?.closest?.('.nav-item,.fab,[onclick*="saveShot"],[onclick*="saveWt"]');
      if (!control) return;
      if (!reduced() && navigator.vibrate) {
        try { navigator.vibrate(control.classList.contains('nav-item') ? 15 : 8); } catch (_) {}
      }
      if (!reduced()) {
        control.classList.remove('gn-punch');
        // Force reflow so a rapid repeat re-triggers the animation.
        void control.offsetWidth;
        control.classList.add('gn-punch');
      }
    });
  }

  const swManager = {
    registration: null,
    applying: false,
    announced: null,
    async register() {
      if (!('serviceWorker' in navigator)) return null;
      try {
        const registration = await navigator.serviceWorker.register('/sw.js?v=' + V, { updateViaCache: 'none' });
        this.registration = registration;
        const ready = worker => {
          if (!worker || !navigator.serviceWorker.controller) return;
          // The same waiting worker can be announced twice on one load: once
          // via registration.waiting (already-waiting from a prior visit) and
          // once via updatefound->installed during the register-time update
          // check. Announce each worker once.
          if (this.announced === worker) return;
          // Post-apply cooldown (2026-08-09): right after an UPDATE tap the
          // new shell's register-time check can immediately find ANOTHER
          // freshly-deployed release and re-announce — three rapid deploys in
          // one day read as "the same banner looping." Suppress re-announce
          // for 2 minutes after an apply; the newer worker keeps waiting and
          // is announced on the next visit.
          try {
            const lastApply = Number(localStorage.getItem('gn_last_apply_v1') || 0);
            if (Date.now() - lastApply < 120000) {
              this.announced = worker;
              return;
            }
          } catch (_) {}
          this.announced = worker;
          // Release number comes from the SW script URL (?v=20260808.22) —
          // free, and it turns the banner into a truthful statement.
          const rel = (worker.scriptURL || '').match(/v=([0-9.]+)/);
          const releaseTag = rel ? ' · ' + rel[1] : '';
          showStatus('update', copy('UPDATE AVAILABLE · APPLY WHEN READY', 'ACTUALIZACIÓN DISPONIBLE · APLICA CUANDO ESTÉS LISTO') + releaseTag, { label: copy('UPDATE', 'ACTUALIZAR'), run: () => this.apply() });
        };
        if (registration.waiting) ready(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => { if (worker.state === 'installed') ready(worker); });
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!this.applying) return;
          this.applying = false;
          if (this._applyWatchdog) { clearTimeout(this._applyWatchdog); this._applyWatchdog = 0; }
          location.reload();
        });
        registration.update().catch(() => null);
        return registration;
      } catch (_) { return null; }
    },
    apply() {
      const worker = this.registration?.waiting;
      if (!worker) { this.registration?.update(); return; }
      captureShotDraft();
      try { sessionStorage.setItem(PAGE_KEY, currentPageName()); } catch (_) {}
      this.applying = true;
      // Cooldown marker (2026-08-09): suppresses re-announcing another
      // freshly-arrived release for 2 minutes after this apply.
      try { localStorage.setItem('gn_last_apply_v1', String(Date.now())); } catch (_) {}
      showStatus('reconnecting', copy('APPLYING UPDATE…', 'APLICANDO ACTUALIZACIÓN…'));
      worker.postMessage({ type: 'SKIP_WAITING' });
      // Watchdog (2026-08-08): the SKIP_WAITING -> controllerchange handshake
      // can stall (old shell + new worker mid-install, throttled page, lost
      // message). Never hang the banner forever: after 4s, re-check for a
      // fresh update, then force a reload so the next load completes the
      // handshake cleanly. Recovery beats a permanent "APPLYING UPDATE…".
      this._applyWatchdog = window.setTimeout(() => {
        if (!this.applying) return;
        this.registration?.update().catch(() => null);
        window.setTimeout(() => {
          if (!this.applying) return;
          this.applying = false;
          location.reload();
        }, 1500);
      }, 4000);
    }
  };
  window.GN_SW = swManager;
  window.GN_NATIVE = Object.freeze({
    bridgeReady() { wireShotDraft(); wireNavigationStack(); },
    captureShotDraft,
    currentPage: currentPageName
  });

  function wireLifecycle() {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    document.documentElement.classList.toggle('gn-standalone', standalone);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') { captureShotDraft(); return; }
      syncViewport();
      swManager.registration?.update().catch(() => null);
      document.dispatchEvent(new CustomEvent('gn:resume'));
    });
    window.addEventListener('pageshow', event => { syncViewport(); if (event.persisted) document.dispatchEvent(new CustomEvent('gn:resume')); });
  }

  function pollUpgrades() {
    const wtTime = document.getElementById('wtTime');
    if (wtTime && wtTime.type !== 'time') { wtTime.type = 'time'; wtTime.inputMode = 'none'; }
    upgradeDropdownSemantics();
    wireOverlayFocus();
    wireShotDraft();
    wireNavigationStack();
  }

  function boot() {
    injectCss();
    watchViewportAndKeyboard();
    wireConnectivity();
    wireShotDraft();
    wireNavigationStack();
    wireLayerHistory();
    wirePopoverHistory();
    wireTouchFeedback();
    wireLifecycle();
    pollUpgrades();
    window.setTimeout(pollUpgrades, 100);
    window.setTimeout(pollUpgrades, 350);
    window.setInterval(pollUpgrades, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
