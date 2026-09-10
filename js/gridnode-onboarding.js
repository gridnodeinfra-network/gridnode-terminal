/* GRID//NODE — REAL interactive first-run onboarding (corrective pass 2026-08-03).
 * Spotlight tour over the LIVE UI: darkens + blocks the rest of the screen,
 * highlights one real control at a time, requires the correct interaction on
 * action steps (auto-advance), uses CONTINUE only for explanation steps, survives
 * navigation + refresh, resumes from the saved step, supports BACK/SKIP/
 * RESUME/RESTART/REPLAY, EN/ES, both themes, mobile widths 320-430.
 * State: localStorage 'gn_onboarding_v1' = 'complete' | step index number.
 * Never freezes the app: every step has a recovery timeout if the target is
 * temporarily missing; missing targets degrade to an explanation step.
 */
(function () {
  'use strict';

  var KEY = 'gn_onboarding_v1';
  var overlay = null;
  var cur = 0;
  var waiting = false;
  var retries = 0;
  var langCache = null;

  /* Step model:
   *   title/body : i18n keys (resolved via GN_I18N or copy table)
   *   sel        : CSS selector of the real control to spotlight (action steps)
   *   action     : 'tap' (require click on sel) | 'input' (require a value in sel) | null (explain only)
   *   advanceOn  : optional event the step listens for to auto-advance
   *   nav        : optional page name to switch to when the step activates (to survive navigation)
   */
  /* Flow polish (v0.15.2): step 1 spotlights the right control for the user's
   * state — REGISTER MY FIRST DOSE on a clean grid, otherwise the LOG SHOT
   * affordance (FAB) so returning users still get a meaningful pointer.
   * v0.15.35: visibility-aware. The FAB is display:none until private mode,
   * so targeting it blindly produced a zero-size spotlight hole (full-dark
   * screen, no visible control). Return a prioritized selector list and let
   * targetEl() pick the first actually-visible match.
   */
  function firstShotTarget() {
    // Visible dashboard LOG SHOT first, then the FAB, then the empty-state CTA.
    return '.gn-wanda-actions button, .fab, [data-onboard="empty-cta"]';
  }

  /* True only when the element is actually on screen with a real size.
   * Guards the spotlight against display:none / detached / zero-size targets.
   */
  function isVisibleTarget(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    var r = el.getBoundingClientRect();
    if (!r || r.width < 8 || r.height < 8) return false;
    var cs = null;
    try { cs = window.getComputedStyle(el); } catch (_) { return false; }
    if (!cs) return false;
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    var op = parseFloat(cs.opacity);
    if (!isNaN(op) && op < 0.15) return false;
    return true;
  }

  var STEPS = [
    { title: 'onb.welcome', body: 'onb.welcomeBody', selFn: firstShotTarget, action: 'tap', nav: 'Dash' },
    { title: 'onb.weight', body: 'onb.weightBody', sel: '[data-onboard="log-weight"], .gn-wanda-actions button:last-child', action: 'tap', nav: 'Dash' },
    { title: 'onb.theme', body: 'onb.themeBody', sel: '[data-theme-opt]', action: null },
    { title: 'onb.language', body: 'onb.languageBody', sel: '.gn-lang-globe', action: null },
    { title: 'onb.done', body: 'onb.doneBody', action: null }
  ];

  var COPY = {
    en: {
      'onb.systemOrientation': 'QUICK START',
      'onb.welcome': 'Log your first shot',
      'onb.welcomeBody': 'This red button starts your record. Tap it when you take a dose — then just fill in the date, time, and where you injected. That\'s everything you need.',
      'onb.shots': 'OPEN SHOTS',
      'onb.shotsBody': 'Tap the SHOTS tab in the bottom navigation. This is where every dose gets logged.',
      'onb.weight': 'Track your weight',
      'onb.weightBody': 'Optional but useful. The Phase Engine uses weight trend to estimate your cycle position. Tap LOG WEIGHT to add one.',
      'onb.theme': 'Switch theme',
      'onb.themeBody': 'NIGHT is dark. DUSK is light. Pick what\'s easier on your eyes — the whole app follows.',
      'onb.language': 'Cambia de idioma',
      'onb.languageBody': 'English and Spanish. Tap the globe and the whole app translates instantly.',
      'onb.done': 'You\'re ready',
      'onb.doneBody': 'You just learned the core loop: log a shot, watch the trend, adjust. Your record stays on this device unless you sign in with Google to sync across devices.',
      'onb.finish': 'LAB, VAULT, AND YOU\'RE READY',
      'onb.finishBody': 'LAB holds focused tools. VAULT holds your settings, exports, and data controls.'
    },
    es: {
      'onb.systemOrientation': 'INICIO RÁPIDO',
      'onb.welcome': 'Registra tu primera dosis',
      'onb.welcomeBody': 'Este botón rojo inicia tu registro. Tócalo cuando te apliques una dosis — luego solo completa la fecha, la hora y la zona de inyección. Eso es todo lo que necesitas.',
      'onb.shots': 'ABRE DOSIS (SHOTS)',
      'onb.shotsBody': 'Toca la pestaña DOSIS en la navegación inferior. Aquí se registra cada dosis.',
      'onb.weight': 'Registra tu peso',
      'onb.weightBody': 'Opcional pero útil. El Motor de Fases usa la tendencia de peso para estimar tu posición en el ciclo. Toca REGISTRAR PESO para agregarlo.',
      'onb.theme': 'Cambia el tema',
      'onb.themeBody': 'NIGHT es oscuro. DUSK es claro. Elige el que te resulte más cómodo — toda la app lo sigue.',
      'onb.language': 'Cambia el idioma',
      'onb.languageBody': 'Inglés y español. Toca el globo y toda la app se traduce al instante.',
      'onb.done': 'Ya estás listo',
      'onb.doneBody': 'Acabas de aprender el ciclo principal: registra una dosis, observa la tendencia, ajusta. Tu registro vive en este dispositivo a menos que inicies sesión con Google para sincronizar entre dispositivos.',
      'onb.finish': 'LAB, BÓVEDA Y LISTO',
      'onb.finishBody': 'LAB contiene herramientas enfocadas. BÓVEDA contiene tus ajustes, exportaciones y controles de datos.'
    }
  };

  function lang() {
    if (langCache === null) langCache = (document.documentElement && document.documentElement.lang === 'es') ? 'es' : 'en';
    return langCache;
  }
  function t(key, fallback) {
    var i18n = window.GN_I18N;
    if (i18n && typeof i18n.t === 'function') { var v = i18n.t(key); if (v && v !== key) return v; }
    var c = COPY[lang()] || COPY.en;
    return c[key] || fallback || key;
  }
  function state() { try { return localStorage.getItem(KEY) || '0'; } catch (_) { return '0'; } }
  function setState(v) { try { localStorage.setItem(KEY, String(v)); } catch (_) {} }
  function stepCount() { return STEPS.length; }
  function isEs() { return lang() === 'es'; }
  function btn(txt) { return isEs() ? txt : txt; }

  function targetEl(step) {
    var selector = typeof step.selFn === 'function' ? step.selFn() : step.sel;
    if (!selector) return null;
    // A step may list several candidate selectors: use the first one that
    // is actually visible. (Prevents spotlighting a display:none control,
    // which collapses the hole and dims the whole screen.)
    var parts = String(selector).split(',');
    for (var i = 0; i < parts.length; i++) {
      var el = null;
      try { el = document.querySelector(parts[i].trim()); } catch (_) { el = null; }
      if (el && isVisibleTarget(el)) return el;
    }
    return null;
  }

  function removeSpotlight() {
    document.querySelectorAll('.gn-onb-target').forEach(function (el) { el.classList.remove('gn-onb-target'); });
  }

  function holeRect(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    // Select steps: include the open dropdown list so its options stay clickable.
    var step = STEPS[cur];
    if (step && step.action === 'select') {
      var drop = document.querySelector('#cpShotMedDrop');
      if (drop) {
        var dr = drop.getBoundingClientRect();
        if (dr.height > 4 && getComputedStyle(drop).visibility !== 'hidden') {
          return {
            top: Math.min(r.top, dr.top), bottom: Math.max(r.bottom, dr.bottom),
            left: Math.min(r.left, dr.left), right: Math.max(r.right, dr.right)
          };
        }
      }
    }
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }

  function positionHole(el) {
    if (!el || !overlay) return;
    var box = holeRect(el);
    if (!box) return;
    var vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    // Safety net: a degenerate (zero-area) hole would dim the entire screen
    // with no visible target. Collapse the dims instead and let the card
    // act as a plain explainer.
    var holeW = Math.max(0, box.right - box.left), holeH = Math.max(0, box.bottom - box.top);
    if (holeW < 8 || holeH < 8) {
      overlay.querySelectorAll('.gn-onb-dim').forEach(function (dim) {
        dim.style.top = '0px'; dim.style.left = '0px';
        dim.style.width = '0px'; dim.style.height = '0px';
      });
      return;
    }
    var pad = 6;
    var dims = {
      t: { top: 0, left: 0, width: vw, height: Math.max(0, box.top - pad) },
      b: { top: box.bottom + pad, left: 0, width: vw, height: Math.max(0, vh - box.bottom - pad) },
      l: { top: box.top - pad, left: 0, width: Math.max(0, box.left - pad), height: box.bottom - box.top + pad * 2 },
      r: { top: box.top - pad, left: box.right + pad, width: Math.max(0, vw - box.right - pad), height: box.bottom - box.top + pad * 2 }
    };
    overlay.querySelectorAll('.gn-onb-dim').forEach(function (dim) {
      var k = dim.dataset.onbDim, cfg = dims[k];
      dim.style.top = cfg.top + 'px'; dim.style.left = cfg.left + 'px';
      dim.style.width = cfg.width + 'px'; dim.style.height = cfg.height + 'px';
    });
  }

  function positionCard(el) {
    if (!overlay) return;
    var card = overlay.querySelector('.gn-onb-card');
    if (!card) return;
    if (!el) { card.style.top = ''; card.style.left = ''; card.style.bottom = ''; card.style.right = ''; card.style.margin = ''; card.style.transform = ''; return; }
    var r = el.getBoundingClientRect();
    var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    card.style.left = '50%';
    card.style.right = 'auto';
    card.style.transform = 'translateX(-50%)';
    card.style.width = 'min(92vw, 400px)';
    var measured = card.offsetHeight || 250;
    var margin = 12;
    // Compute both placements and pick the one with the most room so the card
    // NEVER overlaps the spotlighted control.
    var spaceAbove = r.top - margin;
    var spaceBelow = vh - r.bottom - margin;
    var placeAbove = spaceAbove >= measured + 20;
    var placeBelow = spaceBelow >= measured + 20;
    var cardRect = null;
    if (placeAbove) {
      card.style.top = 'auto';
      card.style.bottom = (vh - r.top + margin) + 'px';
    } else if (placeBelow) {
      card.style.top = (r.bottom + margin) + 'px';
      card.style.bottom = 'auto';
    } else if (spaceAbove >= spaceBelow) {
      // not enough room anywhere: put it at the top, target still clickable via hole
      card.style.top = 'max(10px, calc(env(safe-area-inset-top) + 10px))';
      card.style.bottom = 'auto';
    } else {
      card.style.top = 'auto';
      card.style.bottom = 'max(10px, calc(env(safe-area-inset-bottom) + 10px))';
    }
    // Pointer arrow: sits on the card edge nearest the target and points at it.
    var arrow = overlay.querySelector('.gn-onb-arrow');
    if (arrow) {
      var cr = card.getBoundingClientRect();
      var cardCenterX = cr.left + cr.width / 2;
      var holeCenterX = r.left + r.width / 2;
      var placeBelowNow = card.style.top !== 'auto' && card.style.top !== '' && !String(card.style.top).startsWith('max');
      var placeAboveNow = card.style.bottom !== 'auto' && card.style.bottom !== '' && !String(card.style.bottom).startsWith('max');
      if (placeBelowNow) {
        // card below target → arrow on top edge, rotated up (points at hole)
        arrow.style.top = (cr.top - 7) + 'px';
        arrow.style.left = (cardCenterX + (holeCenterX - cardCenterX) * 0.4 - 7) + 'px';
        arrow.style.transform = 'rotate(45deg)';
      } else if (placeAboveNow) {
        // card above target → arrow on bottom edge, rotated down
        arrow.style.top = (cr.bottom - 7) + 'px';
        arrow.style.left = (cardCenterX + (holeCenterX - cardCenterX) * 0.4 - 7) + 'px';
        arrow.style.transform = 'rotate(225deg)';
      } else {
        arrow.style.top = '-99px';
        arrow.style.left = '-99px';
      }
    }
  }

  function safeAdvance() {
    if (waiting) return;
    waiting = true;
    setTimeout(function () {
      waiting = false;
      renderStep(cur + 1);
    }, 350);
  }

  function bindStep(step) {
    if (!step.sel && !step.selFn) return;
    var el = targetEl(step);
    if (!el) return;
    if (step.action === 'tap') {
      // Delegated listener on the document: the real control may be replaced
      // by the app's own re-render when clicked (e.g. renderScanner rebuilds
      // the zone picker), so binding to the element itself would be lost.
      var onTap = function (e) {
        if (!e.target || !e.target.closest) return;
        var tapSelector = typeof step.selFn === 'function' ? step.selFn() : step.sel;
        if (!tapSelector || !e.target.closest(tapSelector)) return;
        if (e.defaultPrevented) return;
        // Do NOT preventDefault/stopPropagation: the app's own handler must
        // run (e.g. selectScannerLocation / selectOpt) for the step to be real.
        // Advance on a microtask so the app state updates first.
        setTimeout(safeAdvance, 50);
        document.removeEventListener('click', onTap, true);
      };
      document.addEventListener('click', onTap, true);
      window.addEventListener('gn:onb-step-leave', function cleanup() {
        document.removeEventListener('click', onTap, true);
        window.removeEventListener('gn:onb-step-leave', cleanup);
      }, { once: true });
    } else if (step.action === 'select') {
      // Dropdown control: advance when a real option is selected inside it.
      var onPick = function (e) {
        if (!e.target || !e.target.closest) return;
        if (!e.target.closest('#cpShotMedDrop .cp-option, #cpShotMed .cp-option')) return;
        setTimeout(function () {
          var val = document.querySelector('#cpShotMedVal');
          var picked = val && val.textContent && val.textContent.trim() !== 'Select medication' && !/Select medication/i.test(val.textContent);
          if (picked) safeAdvance();
        }, 200);
      };
      document.addEventListener('click', onPick);
      // re-hole when the dropdown opens so options are clickable
      document.addEventListener('click', function onAnyClick() {
        if (overlay && STEPS[cur] && STEPS[cur].action === 'select') {
          setTimeout(function () { var t = targetEl(STEPS[cur]); if (t) { positionHole(t); positionCard(t); } }, 60);
        }
      });
      var onPickCleanup = function () { document.removeEventListener('click', onPick); };
      window.addEventListener('gn:onb-step-leave', onPickCleanup, { once: true });
    } else if (step.action === 'input') {
      var probe = function () {
        var v = el.value || '';
        if (v && v.trim().length > 0) {
          safeAdvance();
          el.removeEventListener('input', probe);
          el.removeEventListener('change', probe);
        }
      };
      el.addEventListener('input', probe);
      el.addEventListener('change', probe);
    }
  }

  function renderStep(i) {
    if (!overlay) return;
    if (i >= stepCount()) { finish(); return; }
    if (i < 0) i = 0;
    cur = i;
    var step = STEPS[i];
    document.dispatchEvent(new CustomEvent('gn:onb-step-leave'));
    removeSpotlight();

    // Navigation steps: switch to the target page so the control is actually visible.
    if (step.nav && typeof showPage === 'function' && step.action === 'tap') {
      // The previous action step may have opened a sheet via the app's own
      // handler (empty-CTA opens the SHOT modal; the FAB opens the drawer).
      // Close those sheets so the next spotlighted control is reachable —
      // otherwise the hole sits over a control buried under the modal.
      ['logOv', 'wtOv'].forEach(function (sheetId) {
        var sheet = document.getElementById(sheetId);
        if (sheet && sheet.classList.contains('active')) sheet.classList.remove('active');
      });
      try { showPage(step.nav, null); } catch (_) {}
    }

    // Give the page a beat to render, then spotlight.
    setTimeout(function () {
      if (step.prep === 'openLogModal' && window.GNModules && window.GNModules.openLogModal) {
        try { window.GNModules.openLogModal(); } catch (_) {}
        // Re-position the hole/card after the modal becomes visible (the
        // modal re-layout changes the save button's rect).
        setTimeout(function () {
          var t = document.querySelector('#logOv .btn-primary, #logOv .modal-btn.save, [onclick*="saveShot"]') ||
                  document.querySelector('.gn-stable-zone-btn') ||
                  document.querySelector('#sDose');
          if (t) { positionHole(t); positionCard(t); }
        }, 150);
        setTimeout(function () {
          var t = document.querySelector('#logOv .btn-primary, #logOv .modal-btn.save, [onclick*="saveShot"]');
          if (t) { positionHole(t); positionCard(t); }
        }, 450);
      }
      if (step.prep === 'openScanner') {
        // CRITICAL: mark the draft as pending BEFORE closing so the save-step
        // reopen preserves the user's entered medication/dose/etc. Without this,
        // openLogModal() resets the form from profile and can silently swap the
        // selected medication (release-blocking identity defect).
        if (window.GNModules && window.GNModules.moduleState) {
          try { window.GNModules.moduleState.pendingLocationDraft = true; } catch (_) {}
        }
        // Close the log modal and show the Log page ourselves (instant, no
        // smooth-scroll race with the modal-close re-render).
        var modalEl = document.getElementById('logOv');
        if (modalEl) modalEl.classList.remove('active');
        if (window.GNModules && window.GNModules.showPage) {
          try { window.GNModules.showPage('Log', null); } catch (_) {}
        }
        if (window.GNModules && window.GNModules.renderScanner) {
          try { window.GNModules.renderScanner(); } catch (_) {}
        }
        // Scroll the page so the zone picker is centered. The modal-close
        // re-render can reset .scroll-body, so re-apply until it sticks.
        var scrollerSel = '.scroll-body';
        setTimeout(function scrollToPicker(attempt) {
          var sc = document.querySelector(scrollerSel) ||
                   document.querySelector('#scrollBody') ||
                   document.querySelector('#app.screen.active') ||
                   document.documentElement;
          var picker = document.querySelector('.gn-stable-zone-picker');
          var zone = document.querySelector('.gn-stable-zone-btn');
          if (!picker || !sc) return;
          var zr = (zone || picker).getBoundingClientRect();
          var onScreen = zr.top >= 0 && zr.bottom <= (sc.clientHeight || window.innerHeight);
          if (!onScreen && attempt < 6) {
            sc.scrollTop = Math.max(0, (sc.scrollTop || 0) + zr.top - (sc.clientHeight / 2) + 40);
            setTimeout(function () { scrollToPicker(attempt + 1); }, 120);
          } else {
            // Scroll settled: re-measure hole + card with the FINAL rect so
            // neither covers the spotlighted control.
            var target = document.querySelector('.gn-stable-zone-btn') || zone || picker;
            if (target) { positionHole(target); positionCard(target); }
          }
        }(0), 180);
      }
      var hasTarget = Boolean(step.sel || step.selFn);
      var el = hasTarget ? targetEl(step) : null;
      if (hasTarget && !el) {
        // Target temporarily missing: wait up to 3s (6 x 500ms), else degrade to explain step.
        if (retries < 6) { retries++; setTimeout(function () { renderStep(i); }, 500); return; }
        retries = 0;
      } else {
        retries = 0;
      }
      if (el) {
        el.classList.add('gn-onb-target');
        // Bring the target fully into the viewport FIRST so the spotlight hole and
        // ring are always visible (v0.15.3: the CTA can sit above the fold in the
        // mission-card empty state — without this the hole lands off-screen and the
        // tour looks like a plain popup).
        try {
          var tRect = el.getBoundingClientRect();
          var tVh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
          var tVw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
          if (tRect.top < 96 || tRect.bottom > tVh - 96) {
            try { el.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (_) {
              try { window.scrollBy({ top: (tRect.top + tRect.height / 2) - tVh / 2, behavior: 'auto' }); } catch (_) {}
            }
          }
        } catch (_) {}
        try {
          var rect = el.getBoundingClientRect();
          var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
          var vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
          var onScreen = rect.top >= 4 && rect.bottom <= vh - 4 && rect.left >= 4 && rect.right <= vw - 4;
          if (!onScreen) {
            // 1) scrollIntoView with center alignment
            el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
            // 2) also scroll scrollable ancestors (modals like #logOv have their
            //    own overflow container that scrollIntoView may miss)
            var a = el.parentElement;
            while (a) {
              var csA = getComputedStyle(a);
              if ((csA.overflowY === 'auto' || csA.overflowY === 'scroll') && a.scrollHeight > a.clientHeight) {
                var r2 = el.getBoundingClientRect();
                var aRect = a.getBoundingClientRect();
                a.scrollTop += (r2.top - aRect.top) - a.clientHeight / 2 + r2.height / 2;
              }
              a = a.parentElement;
            }
            // 3) window fallback
            rect = el.getBoundingClientRect();
            if (rect.top < 0 || rect.bottom > vh) { try { window.scrollBy({ top: (rect.top + rect.height / 2) - vh / 2, behavior: 'auto' }); } catch (_) {} }
          }
        } catch (_) {}
        // Re-measure after layout settles (late nav render / scroll completion).
        setTimeout(function () { positionHole(el); positionCard(el); }, 120);
        setTimeout(function () { positionHole(el); positionCard(el); }, 420);
      } else {
        overlay.querySelectorAll('.gn-onb-dim').forEach(function (dim) { dim.style.top = '0px'; dim.style.left = '0px'; dim.style.width = '0px'; dim.style.height = '0px'; });
        positionCard(null);
      }
      var c = t(step.title, step.title);
      positionCard(el);
      overlay.querySelector('[data-onb-title]').textContent = c;
      overlay.querySelector('[data-onb-body]').textContent = t(step.body, step.body);
      overlay.querySelector('[data-onb-kicker]').textContent = t('onb.systemOrientation', 'QUICK START');
      overlay.querySelector('[data-onb-step]').textContent = (isEs() ? 'PASO ' : 'STEP ') + String(i + 1).padStart(2, '0') + ' / ' + String(stepCount()).padStart(2, '0');
      var pct = Math.round(((i + 1) / stepCount()) * 100);
      overlay.querySelector('[data-onb-progress]').innerHTML = '<span style="width:' + pct + '%"></span>';
      overlay.querySelector('[data-onb-back]').disabled = i === 0;
      var next = overlay.querySelector('[data-onb-next]');
      var action = step.action;
      next.style.display = action ? 'none' : '';
      next.textContent = isEs()
        ? (i === stepCount() - 1 ? 'FINALIZAR' : 'CONTINUAR')
        : (i === stepCount() - 1 ? 'FINISH' : 'CONTINUE');
      overlay.querySelector('.gn-onb-hint').style.display = action ? '' : 'none';
      overlay.querySelector('.gn-onb-hint').textContent = action ? (isEs() ? 'TOCA EL CONTROL DESTACADO PARA CONTINUAR' : 'TAP THE HIGHLIGHTED CONTROL TO CONTINUE') : '';
      setState(String(i));
      bindStep(step);
    }, 220);
  }

  function finish() {
    dismiss(true);
  }

  function onLangChange() {
    langCache = null;
    if (!overlay) return;
    // Re-render the visible step copy (title/body/hint/buttons) in the new language.
    var step = STEPS[cur];
    if (!step) return;
    overlay.querySelector('[data-onb-title]').textContent = t(step.title, step.title);
    overlay.querySelector('[data-onb-body]').textContent = t(step.body, step.body);
    var hint = overlay.querySelector('.gn-onb-hint');
    if (hint && hint.style.display !== 'none') {
      hint.textContent = step.action ? (isEs() ? 'TOCA EL CONTROL DESTACADO PARA CONTINUAR' : 'TAP THE HIGHLIGHTED CONTROL TO CONTINUE') : '';
    }
    var skip = overlay.querySelector('[data-onb-skip]');
    if (skip) skip.textContent = isEs() ? 'OMITIR' : 'SKIP';
    var back = overlay.querySelector('[data-onb-back]');
    if (back) back.textContent = isEs() ? 'ATRÁS' : 'BACK';
    var next = overlay.querySelector('[data-onb-next]');
    if (next && next.style.display !== 'none') {
      next.textContent = isEs()
        ? (cur === stepCount() - 1 ? 'FINALIZAR' : 'CONTINUAR')
        : (cur === stepCount() - 1 ? 'FINISH' : 'CONTINUE');
    }
  }

  function dismiss(complete) {
    if (!complete) { try { localStorage.setItem('gn_onboarding_dismissed_v1', '1'); } catch (_) {} }
    if (overlay) { overlay.remove(); overlay = null; }
    if (whatsnewSafety) document.removeEventListener('gn:whatsnew-shown', whatsnewSafety);
    removeSpotlight();
    document.removeEventListener('gn:langchange', onLangChange);
    document.removeEventListener('keydown', esc);
    window.removeEventListener('scroll', onViewportMove, { capture: true });
    window.removeEventListener('resize', onViewportMove);
    if (complete) setState('complete');
  }

  function esc(e) { if (e.key === 'Escape' && overlay) dismiss(false); }

  var moveTimer = null;
  function onViewportMove() {
    if (!overlay) return;
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(function () {
      // Only re-position the hole/card — NEVER re-render the step (re-render
      // re-runs prep scrolls, which re-fires scroll events: infinite loop).
      var step = STEPS[cur];
      if (!step || (!step.sel && !step.selFn)) return;
      var el = targetEl(step);
      if (el) { positionHole(el); positionCard(el); }
    }, 120);
  }

  function start(resume) {
    if (overlay) return;
    var startAt = 0;
    if (resume) {
      var s = parseInt(state(), 10);
      if (!isNaN(s) && s > 0 && s < stepCount()) startAt = s;
    }
    langCache = null;
    overlay = document.createElement('div');
    overlay.className = 'gn-onb-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'GRID//NODE orientation');
    whatsnewSafety = function () { if (overlay && document.getElementById('gnWhatsNewOverlay')) dismiss(false); };
    document.addEventListener('gn:whatsnew-shown', whatsnewSafety);
    // Four dim panes leave a hole over the spotlighted control so the real
    // control stays visible AND clickable (classic coach-mark pattern; the
    // container itself is pointer-events:none).
    overlay.innerHTML =
      '<div class="gn-onb-dim" data-onb-dim="t"></div>' +
      '<div class="gn-onb-dim" data-onb-dim="b"></div>' +
      '<div class="gn-onb-dim" data-onb-dim="l"></div>' +
      '<div class="gn-onb-dim" data-onb-dim="r"></div>' +
      '<div class="gn-onb-arrow" data-onb-arrow aria-hidden="true"></div>' +
      '<div class="gn-onb-card">' +
        '<div class="gn-onb-head">' +
          '<div class="gn-onb-kicker" data-onb-kicker></div>' +
          '<div class="gn-onb-step" data-onb-step></div>' +
        '</div>' +
        '<h2 class="gn-onb-title" data-onb-title></h2>' +
        '<p class="gn-onb-body" data-onb-body></p>' +
        '<p class="gn-onb-hint" style="display:none"></p>' +
        '<div class="gn-onb-progress" data-onb-progress aria-hidden="true"></div>' +
        '<div class="gn-onb-actions">' +
          '<button type="button" class="gn-onb-skip" data-onb-skip>' + (isEs() ? 'OMITIR' : 'SKIP') + '</button>' +
          '<button type="button" class="gn-onb-back" data-onb-back>' + (isEs() ? 'ATRÁS' : 'BACK') + '</button>' +
          '<button type="button" class="gn-onb-next" data-onb-next>' + (isEs() ? 'CONTINUAR' : 'CONTINUE') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('[data-onb-skip]').addEventListener('click', function () { dismiss(false); });
    overlay.querySelector('[data-onb-back]').addEventListener('click', function () { renderStep(cur - 1); });
    overlay.querySelector('[data-onb-next]').addEventListener('click', function () {
      var step = STEPS[cur];
      if (step && step.action) return; // action steps: NEXT hidden anyway
      safeAdvance();
    });
    // Block clicks outside the card (and outside the spotlighted control on action steps).
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) return; // allow nothing outside card; not even dismiss
      var step = STEPS[cur];
      if (step && step.action) {
        var el = targetEl(step);
        if (el && el.contains(e.target)) return; // handled by capture listener
        e.stopPropagation(); e.preventDefault();
      }
    });
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', onViewportMove, { passive: true, capture: true });
    window.addEventListener('resize', onViewportMove);
    document.addEventListener('gn:langchange', onLangChange);
    renderStep(startAt);
  }

  function injectReplay() {
    var hub = document.querySelector('#pageProfile .gn-profile-hub, #pageProfile [data-gn-profile-hub]');
    if (!hub || document.querySelector('[data-gn-tour-replay]')) return;
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'gn-vault-row gn-onb-replay';
    row.dataset.gnTourReplay = '';
    row.innerHTML = '<span class="gn-vault-row-ico" aria-hidden="true">◆</span><span data-i18n="onb.guidedTour">' + (isEs() ? 'TOUR GUIADO' : 'GUIDED TOUR') + '</span><span class="gn-vault-row-arrow" aria-hidden="true">›</span>';
    row.addEventListener('click', function () { start(true); });
    var anchor = hub.querySelector('[data-vault-action], .gn-vault-row');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(row, anchor);
    else hub.appendChild(row);
  }

  var whatsnewResolved = false;
  var whatsnewSafety = null;
  function markWhatsNewResolved() { whatsnewResolved = true; maybeAutoStart(); }
  function maybeAutoStart() {
    if (state() === 'complete') return;
    try { if (localStorage.getItem('gn_onboarding_dismissed_v1') === '1') return; } catch (_) {}
    if (document.querySelector('.gn-404-screen')) return;
    var landing = document.getElementById('landing');
    var app = document.getElementById('app');
    var inApp = app && getComputedStyle(app).display !== 'none' && (!landing || getComputedStyle(landing).display === 'none');
    if (!inApp) { window.setTimeout(maybeAutoStart, 1200); return; }
    // Sequencing: WHAT'S NEW decides first (shown→dismissed, or resolved=no-show).
    // The tour never starts while the WHAT'S NEW overlay is on screen, and never
    // overlaps it — either side waits for the other.
    var wn = document.getElementById('gnWhatsNewOverlay');
    if (wn && (wn.classList.contains('active') || getComputedStyle(wn).display !== 'none')) { window.setTimeout(maybeAutoStart, 700); return; }
    if (!whatsnewResolved) {
      // Give whatsnew.js's boot() its poll window to decide; re-check.
      window.setTimeout(function () { if (overlay) return; maybeAutoStart(); }, 900);
      return;
    }
    start(true);
  }
  document.addEventListener('gn:whatsnew-resolved', markWhatsNewResolved);
  document.addEventListener('gn:whatsnew-dismissed', markWhatsNewResolved);

  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        window.setTimeout(maybeAutoStart, 1600);
        new MutationObserver(injectReplay).observe(document.body, { childList: true, subtree: true });
      }, { once: true });
    } else {
      window.setTimeout(maybeAutoStart, 1600);
      new MutationObserver(injectReplay).observe(document.body, { childList: true, subtree: true });
    }
  }

  window.GN_ONBOARDING = Object.freeze({
    start: start,
    restart: function () { setState('0'); start(false); },
    state: state
  });

  boot();
})();
