/* GRID//NODE — REAL interactive first-run onboarding (corrective pass 2026-08-03).
 * Spotlight tour over the LIVE UI: darkens + blocks the rest of the screen,
 * highlights one real control at a time, requires the correct interaction on
 * action steps (auto-advance), uses NEXT only for explanation steps, survives
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
  var STEPS = [
    { title: 'onb.welcome', body: 'onb.welcomeBody', action: null },
    { title: 'onb.shots', body: 'onb.shotsBody', sel: '#navLog', action: 'tap', nav: 'Log' },
    { title: 'onb.register', body: 'onb.registerBody', sel: '.fab', action: 'tap', nav: 'Log' },
    { title: 'onb.medication', body: 'onb.medicationBody', sel: '#cpShotMed', action: 'select', nav: 'Log' },
    { title: 'onb.dose', body: 'onb.doseBody', sel: '#sDose', action: 'input', nav: 'Log' },
    { title: 'onb.location', body: 'onb.locationBody', sel: '.gn-stable-zone-btn, #shotsRegionScanner', action: 'tap', nav: 'Log', prep: 'openScanner' },
    { title: 'onb.save', body: 'onb.saveBody', sel: '#logOv .btn-primary, #logOv .modal-btn.save, [onclick*="saveShot"]', action: 'tap', nav: 'Log', prep: 'openLogModal' },
    { title: 'onb.results', body: 'onb.resultsBody', sel: '#navRes', action: 'tap', nav: 'Results' },
    { title: 'onb.weight', body: 'onb.weightBody', sel: '#pageResults .results-card, #pageResults', action: null, nav: 'Results' },
    { title: 'onb.lab', body: 'onb.labBody', sel: '#navLab', action: 'tap', nav: 'Lab' },
    { title: 'onb.vault', body: 'onb.vaultBody', sel: '#topAva, #navPro', action: 'tap', nav: 'Profile' },
    { title: 'onb.done', body: 'onb.doneBody', action: null }
  ];

  var COPY = {
    en: {
      'onb.welcome': 'WELCOME TO GRID//NODE',
      'onb.welcomeBody': 'Your personal biotech command system. Every record stays on this device first — your body, your data, your grid.',
      'onb.shots': 'OPEN SHOTS',
      'onb.shotsBody': 'Tap the SHOTS tab in the bottom navigation. This is where every dose gets logged.',
      'onb.register': 'START REGISTERING A DOSE',
      'onb.registerBody': 'Tap the + button to open the dose log.',
      'onb.medication': 'SELECT THE MEDICATION',
      'onb.medicationBody': 'Choose the medication for this dose from the selector.',
      'onb.dose': 'ENTER OR CONFIRM THE DOSE',
      'onb.doseBody': 'Enter or confirm the dose amount in mg.',
      'onb.location': 'SELECT THE INJECTION LOCATION',
      'onb.locationBody': 'Pick the body location for this shot from the scanner zones.',
      'onb.save': 'SAVE THE SHOT',
      'onb.saveBody': 'Press SAVE SHOT to store the record. Nothing is saved until you do.',
      'onb.results': 'OPEN RESULTS',
      'onb.resultsBody': 'Open the SIGNAL page — your trends and progress live here.',
      'onb.weight': 'WEIGHT & PROGRESS',
      'onb.weightBody': 'Weight trends, progress signals, and timeline records are recorded on this screen.',
      'onb.lab': 'OPEN THE CALCULATOR / LAB',
      'onb.labBody': 'The LAB holds syringe draw, reconstitution, dose projection, and research tools.',
      'onb.vault': 'VAULT & YOUR DATA',
      'onb.vaultBody': 'Your profile holds the VAULT: local-first storage, export, backup, and sync status.',
      'onb.done': 'YOU\'RE READY',
      'onb.doneBody': 'That\'s the core loop. You can replay this tour any time from your profile, and everything stays on this device first.'
    },
    es: {
      'onb.welcome': 'BIENVENIDO A GRID//NODE',
      'onb.welcomeBody': 'Tu sistema de comando biotecnológico personal. Cada registro vive primero en este dispositivo: tu cuerpo, tus datos, tu grilla.',
      'onb.shots': 'ABRE DOSIS (SHOTS)',
      'onb.shotsBody': 'Toca la pestaña DOSIS en la navegación inferior. Aquí se registra cada dosis.',
      'onb.register': 'EMPIEZA A REGISTRAR UNA DOSIS',
      'onb.registerBody': 'Toca el botón + para abrir el registro de dosis.',
      'onb.medication': 'SELECCIONA EL MEDICAMENTO',
      'onb.medicationBody': 'Elige el medicamento para esta dosis en el selector.',
      'onb.dose': 'INGRESA O CONFIRMA LA DOSIS',
      'onb.doseBody': 'Ingresa o confirma la cantidad de dosis en mg.',
      'onb.location': 'SELECCIONA LA UBICACIÓN DE INYECCIÓN',
      'onb.locationBody': 'Elige la ubicación corporal para esta dosis en las zonas del escáner.',
      'onb.save': 'GUARDA LA DOSIS',
      'onb.saveBody': 'Pulsa GUARDAR DOSIS para almacenar el registro. Nada se guarda hasta que lo hagas.',
      'onb.results': 'ABRE RESULTADOS',
      'onb.resultsBody': 'Abre la página SEÑAL — aquí viven tus tendencias y tu progreso.',
      'onb.weight': 'PESO Y PROGRESO',
      'onb.weightBody': 'Las tendencias de peso, señales de progreso y registros de línea de tiempo se guardan en esta pantalla.',
      'onb.lab': 'ABRE LA CALCULADORA / LAB',
      'onb.labBody': 'El LAB contiene jeringa, reconstitución, proyección de dosis y herramientas de investigación.',
      'onb.vault': 'BÓVEDA Y TUS DATOS',
      'onb.vaultBody': 'Tu perfil contiene la BÓVEDA: almacenamiento local primero, exportación, respaldo y estado de sincronización.',
      'onb.done': 'YA ESTÁS LISTO',
      'onb.doneBody': 'Ese es el ciclo principal. Puedes repetir este tour cuando quieras desde tu perfil, y todo vive primero en este dispositivo.'
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
    if (!step.sel) return null;
    var el = null;
    try { el = document.querySelector(step.sel.split(',')[0]); } catch (_) { el = null; }
    return el;
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
    if (!step.sel) return;
    var el = targetEl(step);
    if (!el) return;
    if (step.action === 'tap') {
      // Delegated listener on the document: the real control may be replaced
      // by the app's own re-render when clicked (e.g. renderScanner rebuilds
      // the zone picker), so binding to the element itself would be lost.
      var onTap = function (e) {
        if (!e.target || !e.target.closest) return;
        if (!e.target.closest(step.sel)) return;
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
      var el = step.sel ? targetEl(step) : null;
      if (step.sel && !el) {
        // Target temporarily missing: wait up to 3s (6 x 500ms), else degrade to explain step.
        if (retries < 6) { retries++; setTimeout(function () { renderStep(i); }, 500); return; }
        retries = 0;
      } else {
        retries = 0;
      }
      if (el) {
        el.classList.add('gn-onb-target');
        // Bring the target fully into the viewport (some controls are fixed or
        // inside transformed containers; scroll window + element).
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
      overlay.querySelector('[data-onb-kicker]').textContent = '// SYSTEM ORIENTATION  ' + (i + 1) + ' / ' + stepCount();
      overlay.querySelector('[data-onb-dots]').innerHTML = Array.from({ length: stepCount() }, function (_, d) {
        return '<i class="' + (d === i ? 'active' : '') + (d < i ? ' done' : '') + '"></i>';
      }).join('');
      overlay.querySelector('[data-onb-back]').disabled = i === 0;
      var next = overlay.querySelector('[data-onb-next]');
      var action = step.action;
      next.style.display = action ? 'none' : '';
      overlay.querySelector('.gn-onb-hint').style.display = action ? '' : 'none';
      overlay.querySelector('.gn-onb-hint').textContent = action ? (isEs() ? 'TOCA EL CONTROL DESTACADO PARA CONTINUAR' : 'TAP THE HIGHLIGHTED CONTROL TO CONTINUE') : (isEs() ? 'PULSA SIGUIENTE' : 'PRESS NEXT');
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
      hint.textContent = step.action ? (isEs() ? 'TOCA EL CONTROL DESTACADO PARA CONTINUAR' : 'TAP THE HIGHLIGHTED CONTROL TO CONTINUE') : (isEs() ? 'PULSA SIGUIENTE' : 'PRESS NEXT');
    }
    var skip = overlay.querySelector('[data-onb-skip]');
    if (skip) skip.textContent = isEs() ? 'OMITIR' : 'SKIP';
    var back = overlay.querySelector('[data-onb-back]');
    if (back) back.textContent = isEs() ? 'ATRÁS' : 'BACK';
    var next = overlay.querySelector('[data-onb-next]');
    if (next && next.style.display !== 'none') next.textContent = isEs() ? 'SIGUIENTE' : 'NEXT';
  }

  function dismiss(complete) {
    if (overlay) { overlay.remove(); overlay = null; }
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
      if (!step || !step.sel) return;
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
    // Four dim panes leave a hole over the spotlighted control so the real
    // control stays visible AND clickable (classic coach-mark pattern; the
    // container itself is pointer-events:none).
    overlay.innerHTML =
      '<div class="gn-onb-dim" data-onb-dim="t"></div>' +
      '<div class="gn-onb-dim" data-onb-dim="b"></div>' +
      '<div class="gn-onb-dim" data-onb-dim="l"></div>' +
      '<div class="gn-onb-dim" data-onb-dim="r"></div>' +
      '<div class="gn-onb-card">' +
        '<div class="gn-onb-kicker" data-onb-kicker></div>' +
        '<h2 class="gn-onb-title" data-onb-title></h2>' +
        '<p class="gn-onb-body" data-onb-body></p>' +
        '<p class="gn-onb-hint" style="display:none"></p>' +
        '<div class="gn-onb-dots" data-onb-dots aria-hidden="true"></div>' +
        '<div class="gn-onb-actions">' +
          '<button type="button" class="gn-onb-skip" data-onb-skip>' + (isEs() ? 'OMITIR' : 'SKIP') + '</button>' +
          '<button type="button" class="gn-onb-back" data-onb-back>' + (isEs() ? 'ATRÁS' : 'BACK') + '</button>' +
          '<button type="button" class="gn-onb-next" data-onb-next>' + (isEs() ? 'SIGUIENTE' : 'NEXT') + '</button>' +
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
    row.innerHTML = '<span class="gn-vault-row-ico" aria-hidden="true">◆</span><span>' + (isEs() ? 'TOUR GUIADO' : 'GUIDED TOUR') + '</span><span class="gn-vault-row-arrow" aria-hidden="true">›</span>';
    row.addEventListener('click', function () { start(true); });
    var anchor = hub.querySelector('[data-vault-action], .gn-vault-row');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(row, anchor);
    else hub.appendChild(row);
  }

  function maybeAutoStart() {
    if (state() === 'complete') return;
    var landing = document.getElementById('landing');
    var app = document.getElementById('app');
    var inApp = app && getComputedStyle(app).display !== 'none' && (!landing || getComputedStyle(landing).display === 'none');
    if (!inApp) { window.setTimeout(maybeAutoStart, 1200); return; }
    start(true);
  }

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
