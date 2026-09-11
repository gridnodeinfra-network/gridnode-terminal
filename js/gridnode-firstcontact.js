/* GRID//NODE — FIRST CONTACT onboarding (built from zero 2026-09-10).
 * Replaces the deleted v1 spotlight tour. A 6-beat boot sequence that teaches
 * the product loop with one REAL first log and the Phase Engine payoff:
 *   0 SIGNAL        the why (fullscreen)
 *   1 THE GRID      mental model: SHOTS / RESULTS / LAB / VAULT (fullscreen)
 *   2 FIRST DOSE    real action: spotlight the log button, then coach INSIDE
 *                   the log modal until an actual save (gn:shot-saved event)
 *   3 THE CURVE     the payoff, on RESULTS / Phase Engine
 *   4 MAKE IT YOURS theme + language comfort card
 *   5 ONLINE        clean exit
 * State: localStorage 'gn_onboarding_v2' = 'complete' | beat index (0-5).
 * Migration: v1 complete/dismissed users are never re-prompted.
 * Every beat skippable, resumes from the saved beat, replay from VAULT.
 * EN/ES, both themes, reduced-motion respected, mobile widths 320-430.
 */
(function () {
  'use strict';

  var KEY = 'gn_onboarding_v2';
  var DISMISSED = 'gn_onboarding_dismissed_v2';
  var V1KEY = 'gn_onboarding_v1';
  var V1DIS = 'gn_onboarding_dismissed_v1';
  var BEATS = 6;

  var overlay = null;      // .gn-fc-overlay: screens + spotlights
  var coach = null;        // .gn-fc-coach: inside-modal coach card
  var cur = 0;             // current beat 0..5
  var dosePhase = 'spot';  // beat 2 sub-state: 'spot' | 'modal'
  var skippedDose = false;
  var retries = 0;
  var langCache = null;
  var coachTimer = null;
  var modalWatch = null;
  var savedTimer = null;
  var moveTimer = null;
  var locPickHandler = null; // watches #logLocationAction taps during modal phase
  var blockedFields = []; // field keys from the last gn:coach-save-blocked event
  var pickingLocation = false;
  var pickTimer = null;
  var coachInputHandler = null; // immediate coachTick on modal input/click (no 600ms wait)

  /* ------------------------------------------------------------------ */
  /* Copy (EN + ES). t() prefers the live GN_I18N catalog, falls back here. */
  /* ------------------------------------------------------------------ */
  var COPY = {
    en: {
      'fc.signal.kicker': 'FIRST CONTACT',
      'fc.signal.title': 'Built for your actual protocol.',
      'fc.signal.body': 'Most trackers only know pharma GLPs. GRID//NODE is built for the real stack: compounded, grey market, research. Your data stays on this device.',
      'fc.signal.cta': 'Show me',
      'fc.grid.kicker': 'THE GRID',
      'fc.grid.title': 'Four zones. One loop.',
      'fc.grid.cta': 'Start the loop',
      'fc.grid.shots': 'SHOTS',
      'fc.grid.shotsBody': 'Your dose log. The loop starts here.',
      'fc.grid.results': 'RESULTS',
      'fc.grid.resultsBody': 'Your curve. The Phase Engine reads your cycle.',
      'fc.grid.lab': 'LAB',
      'fc.grid.labBody': 'Biotech tools. Draw, mix, stock, assay.',
      'fc.grid.vault': 'VAULT',
      'fc.grid.vaultBody': 'Your data. Local-first. Exports and settings.',
      'fc.dose.kicker': 'FIRST DOSE',
      'fc.dose.title': 'This is the whole app in one tap.',
      'fc.dose.body': 'Tap the highlighted button and log a real dose. It takes about 20 seconds.',
      'fc.dose.hint': 'TAP THE HIGHLIGHTED CONTROL TO CONTINUE',
      'fc.dose.later': "I'll log later",
      'fc.dose.openLog': 'Open the log',
      'fc.coach.kicker': 'FIRST DOSE',
      'fc.coach.title': 'Log it for real.',
      'fc.coach.stepMed': 'Pick your peptide',
      'fc.coach.stepDose': 'Set your dose',
      'fc.coach.stepLoc': 'Choose the site',
      'fc.coach.then': 'Then hit SAVE.',
      'fc.coach.saved': "Logged. That's the habit. Everything else builds on this.",
      'fc.coach.blocked': 'Could not save yet. Check: {fields}.',
      'fc.coach.field.med': 'medication',
      'fc.coach.field.dose': 'dose',
      'fc.coach.field.date': 'date',
      'fc.coach.field.time': 'time',
      'fc.coach.field.loc': 'injection site',
      'fc.curve.kicker': 'THE CURVE',
      'fc.curve.title': 'There it is. Your dose, on your curve.',
      'fc.curve.body': 'The Phase Engine reads where you are in your cycle from every logged dose, so you run your protocol with eyes open.',
      'fc.curve.emptyTitle': 'Your curve is waiting.',
      'fc.curve.emptyBody': 'Log your first dose and the Phase Engine starts reading your cycle.',
      'fc.curve.logCta': 'Log your first dose',
      'fc.curve.cta': 'Continue',
      'fc.comfort.kicker': 'MAKE IT YOURS',
      'fc.comfort.title': 'Set your comfort.',
      'fc.comfort.body': 'Pick a theme and a language. The whole app follows.',
      'fc.comfort.night': 'NIGHT',
      'fc.comfort.dusk': 'DUSK',
      'fc.comfort.done': 'Done',
      'fc.online.kicker': 'SYSTEM ONLINE',
      'fc.online.title': 'Log the dose. Read the curve. Run your protocol.',
      'fc.online.body': 'Welcome to GRID//NODE.',
      'fc.online.cta': 'Enter GRID//NODE',
      'fc.skip': 'Skip tour',
      'fc.back': 'Back',
      'fc.replay': 'GUIDED TOUR'
    },
    es: {
      'fc.signal.kicker': 'PRIMER CONTACTO',
      'fc.signal.title': 'Hecho para tu protocolo real.',
      'fc.signal.body': 'La mayoría de apps solo conocen los GLP farmacéuticos. GRID//NODE está hecho para el stack real: compuesto, grey market, investigación. Tus datos se quedan en este dispositivo.',
      'fc.signal.cta': 'Muéstrame',
      'fc.grid.kicker': 'EL GRID',
      'fc.grid.title': 'Cuatro zonas. Un ciclo.',
      'fc.grid.cta': 'Empezar el ciclo',
      'fc.grid.shots': 'SHOTS',
      'fc.grid.shotsBody': 'Tu registro de dosis. El ciclo empieza aquí.',
      'fc.grid.results': 'RESULTS',
      'fc.grid.resultsBody': 'Tu curva. El Motor de Fases lee tu ciclo.',
      'fc.grid.lab': 'LAB',
      'fc.grid.labBody': 'Herramientas biotech. Dibuja, mezcla, inventario, análisis.',
      'fc.grid.vault': 'VAULT',
      'fc.grid.vaultBody': 'Tus datos. Local primero. Exportar y ajustes.',
      'fc.dose.kicker': 'PRIMERA DOSIS',
      'fc.dose.title': 'Toda la app en un toque.',
      'fc.dose.body': 'Toca el botón resaltado y registra una dosis real. Toma unos 20 segundos.',
      'fc.dose.hint': 'TOCA EL CONTROL RESALTADO PARA CONTINUAR',
      'fc.dose.later': 'Lo registro después',
      'fc.dose.openLog': 'Abrir el registro',
      'fc.coach.kicker': 'PRIMERA DOSIS',
      'fc.coach.title': 'Regístrala de verdad.',
      'fc.coach.stepMed': 'Elige tu péptido',
      'fc.coach.stepDose': 'Pon tu dosis',
      'fc.coach.stepLoc': 'Elige la zona',
      'fc.coach.then': 'Luego pulsa GUARDAR.',
      'fc.coach.saved': 'Registrado. Ese es el hábito. Todo lo demás se construye sobre esto.',
      'fc.coach.blocked': 'No se pudo guardar todavía. Revisa: {fields}.',
      'fc.coach.field.med': 'medicamento',
      'fc.coach.field.dose': 'dosis',
      'fc.coach.field.date': 'fecha',
      'fc.coach.field.time': 'hora',
      'fc.coach.field.loc': 'zona de inyección',
      'fc.curve.kicker': 'LA CURVA',
      'fc.curve.title': 'Ahí está. Tu dosis, en tu curva.',
      'fc.curve.body': 'El Motor de Fases lee en qué punto de tu ciclo estás con cada dosis registrada, para que lleves tu protocolo con los ojos abiertos.',
      'fc.curve.emptyTitle': 'Tu curva te espera.',
      'fc.curve.emptyBody': 'Registra tu primera dosis y el Motor de Fases empezará a leer tu ciclo.',
      'fc.curve.logCta': 'Registrar mi primera dosis',
      'fc.curve.cta': 'Continuar',
      'fc.comfort.kicker': 'A TU MANERA',
      'fc.comfort.title': 'Ajusta tu comodidad.',
      'fc.comfort.body': 'Elige tema e idioma. Toda la app te sigue.',
      'fc.comfort.night': 'NIGHT',
      'fc.comfort.dusk': 'DUSK',
      'fc.comfort.done': 'Listo',
      'fc.online.kicker': 'SISTEMA EN LÍNEA',
      'fc.online.title': 'Registra la dosis. Lee la curva. Lleva tu protocolo.',
      'fc.online.body': 'Bienvenido a GRID//NODE.',
      'fc.online.cta': 'Entrar a GRID//NODE',
      'fc.skip': 'Omitir tour',
      'fc.back': 'Atrás',
      'fc.replay': 'TOUR GUIADO'
    }
  };

  function lang() {
    if (langCache === null) langCache = (document.documentElement && document.documentElement.lang === 'es') ? 'es' : 'en';
    return langCache;
  }
  function isEs() { return lang() === 'es'; }
  function t(key, fallback) {
    var i18n = window.GN_I18N;
    if (i18n && typeof i18n.t === 'function') { var v = i18n.t(key); if (v && v !== key) return v; }
    var c = COPY[lang()] || COPY.en;
    return c[key] || fallback || key;
  }
  function state() { try { return localStorage.getItem(KEY) || '0'; } catch (_) { return '0'; } }
  function setState(v) { try { localStorage.setItem(KEY, String(v)); } catch (_) {} }

  /* ------------------------------------------------------------------ */
  /* Targets */
  /* ------------------------------------------------------------------ */
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
  // First VISIBLE match wins: the FAB is display:none until private mode,
  // so targeting it blindly collapses the spotlight hole.
  function visibleEl(selector) {
    var parts = String(selector).split(',');
    for (var i = 0; i < parts.length; i++) {
      var el = null;
      try { el = document.querySelector(parts[i].trim()); } catch (_) { el = null; }
      if (el && isVisibleTarget(el)) return el;
    }
    return null;
  }
  function doseTargetSel() {
    return '#gnFirstShotMission button, .gn-wanda-actions button, .fab';
  }
  function curveTarget() {
    return visibleEl('#phaseEngineSourceReadout, #phaseEngineSourceEmpty');
  }
  function removeSpotlight() {
    document.querySelectorAll('.gn-fc-target').forEach(function (el) { el.classList.remove('gn-fc-target'); });
    document.querySelectorAll('.gn-fc-pulse').forEach(function (el) { el.classList.remove('gn-fc-pulse'); });
  }
  function scrollTargetIntoView(el) {
    try {
      var r = el.getBoundingClientRect();
      var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      if (r.top < 96 || r.bottom > vh - 96) el.scrollIntoView({ block: 'center', behavior: 'auto' });
    } catch (_) {}
  }

  /* ------------------------------------------------------------------ */
  /* Spotlight geometry: 4 dim panes leave a hole over the target; the   */
  /* card anchors to whichever side has room and never covers the target. */
  /* ------------------------------------------------------------------ */
  function positionHole(el) {
    if (!el || !overlay) return;
    var r = el.getBoundingClientRect();
    var vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    var holeW = Math.max(0, r.right - r.left), holeH = Math.max(0, r.bottom - r.top);
    var dims = overlay.querySelectorAll('.gn-fc-dim');
    if (holeW < 8 || holeH < 8) {
      dims.forEach(function (dim) { dim.style.top = '0px'; dim.style.left = '0px'; dim.style.width = '0px'; dim.style.height = '0px'; });
      return;
    }
    var pad = 6;
    var cfg = {
      t: { top: 0, left: 0, width: vw, height: Math.max(0, r.top - pad) },
      b: { top: r.bottom + pad, left: 0, width: vw, height: Math.max(0, vh - r.bottom - pad) },
      l: { top: r.top - pad, left: 0, width: Math.max(0, r.left - pad), height: r.bottom - r.top + pad * 2 },
      r: { top: r.top - pad, left: r.right + pad, width: Math.max(0, vw - r.right - pad), height: r.bottom - r.top + pad * 2 }
    };
    dims.forEach(function (dim) {
      var c = cfg[dim.dataset.fcDim];
      if (!c) return;
      dim.style.top = c.top + 'px'; dim.style.left = c.left + 'px';
      dim.style.width = c.width + 'px'; dim.style.height = c.height + 'px';
    });
  }
  function positionCard(el) {
    if (!overlay) return;
    var card = overlay.querySelector('.gn-fc-card');
    if (!card) return;
    card.style.left = '50%'; card.style.right = 'auto';
    card.style.transform = 'translateX(-50%)';
    card.style.width = 'min(92vw, 400px)';
    if (!el) {
      card.style.top = ''; card.style.bottom = ''; card.style.margin = '';
      var arrow = overlay.querySelector('.gn-fc-arrow');
      if (arrow) { arrow.style.top = '-99px'; arrow.style.left = '-99px'; }
      return;
    }
    var r = el.getBoundingClientRect();
    var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    var measured = card.offsetHeight || 250;
    var margin = 12;
    var spaceAbove = r.top - margin, spaceBelow = vh - r.bottom - margin;
    if (spaceAbove >= measured + 20) {
      card.style.top = 'auto'; card.style.bottom = (vh - r.top + margin) + 'px';
    } else if (spaceBelow >= measured + 20) {
      card.style.top = (r.bottom + margin) + 'px'; card.style.bottom = 'auto';
    } else if (spaceAbove >= spaceBelow) {
      card.style.top = 'max(10px, calc(env(safe-area-inset-top) + 10px))'; card.style.bottom = 'auto';
    } else {
      card.style.top = 'auto'; card.style.bottom = 'max(10px, calc(env(safe-area-inset-bottom) + 10px))';
    }
    var arrowEl = overlay.querySelector('.gn-fc-arrow');
    if (arrowEl) {
      var cr = card.getBoundingClientRect();
      var cardCenterX = cr.left + cr.width / 2;
      var holeCenterX = r.left + r.width / 2;
      var below = card.style.top !== 'auto' && card.style.top !== '' && String(card.style.top).indexOf('max') !== 0;
      var above = card.style.bottom !== 'auto' && card.style.bottom !== '' && String(card.style.bottom).indexOf('max') !== 0;
      if (below) {
        arrowEl.style.top = (cr.top - 7) + 'px';
        arrowEl.style.left = (cardCenterX + (holeCenterX - cardCenterX) * 0.4 - 7) + 'px';
        arrowEl.style.transform = 'rotate(45deg)';
      } else if (above) {
        arrowEl.style.top = (cr.bottom - 7) + 'px';
        arrowEl.style.left = (cardCenterX + (holeCenterX - cardCenterX) * 0.4 - 7) + 'px';
        arrowEl.style.transform = 'rotate(225deg)';
      } else {
        arrowEl.style.top = '-99px'; arrowEl.style.left = '-99px';
      }
    }
  }
  function setMode(mode) {
    if (!overlay) return;
    overlay.classList.toggle('mode-screen', mode === 'screen');
    overlay.classList.toggle('mode-spot', mode === 'spot');
    if (mode === 'screen') {
      // Fullscreen beats have no spotlight target: park the gold arrow
      // off-screen. It is absolutely positioned with auto top/left, so
      // without this it sits at the flex-centered static position, i.e.
      // dead center of the screen (stray yellow square on beats 0/1/4/5).
      var arrow = overlay.querySelector('.gn-fc-arrow');
      if (arrow) { arrow.style.top = '-99px'; arrow.style.left = '-99px'; arrow.style.transform = ''; }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Overlay shell */
  /* ------------------------------------------------------------------ */
  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'gn-fc-overlay mode-screen';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'GRID//NODE first contact');
    overlay.innerHTML =
      '<div class="gn-fc-veil"></div>' +
      '<div class="gn-fc-dim" data-fc-dim="t"></div>' +
      '<div class="gn-fc-dim" data-fc-dim="b"></div>' +
      '<div class="gn-fc-dim" data-fc-dim="l"></div>' +
      '<div class="gn-fc-dim" data-fc-dim="r"></div>' +
      '<div class="gn-fc-arrow" aria-hidden="true"></div>' +
      '<div class="gn-fc-card" data-fc-card></div>';
    document.body.appendChild(overlay);
    // Block everything except the spotlighted control on spot beats.
    overlay.addEventListener('click', function (e) {
      if (cur !== 2 || dosePhase !== 'spot') return;
      var el = visibleEl(doseTargetSel());
      if (el && e.target && e.target.closest && el.contains(e.target)) return;
      e.stopPropagation(); e.preventDefault();
    });
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', onViewportMove, { passive: true, capture: true });
    window.addEventListener('resize', onViewportMove);
    document.addEventListener('gn:langchange', onLangChange);
  }
  function esc(e) { if (e.key === 'Escape' && overlay) dismiss(false); }
  function onViewportMove() {
    if (!overlay || overlay.style.display === 'none') return;
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(function () {
      // Re-position only; never re-render (re-render re-runs scrolls: loop).
      var el = cur === 2 ? visibleEl(doseTargetSel()) : cur === 3 ? curveTarget() : null;
      if (el) { positionHole(el); positionCard(el); }
    }, 120);
  }
  function onLangChange() {
    langCache = null;
    if (!overlay && !coach) return;
    if (coach) renderCoachCopy();
    else renderBeat(cur);
  }
  function cardHead(kickerKey) {
    return '<div class="gn-fc-head"><div class="gn-fc-kicker">' + t(kickerKey, '') + '</div>' +
      '<div class="gn-fc-step">' + String(cur + 1).padStart(2, '0') + ' / ' + String(BEATS).padStart(2, '0') + '</div></div>';
  }
  function cardFoot(opts) {
    opts = opts || {};
    var html = '<div class="gn-fc-actions">';
    html += '<button type="button" class="gn-fc-skip" data-fc-skip>' + t('fc.skip', 'Skip tour') + '</button>';
    if (opts.back !== false) html += '<button type="button" class="gn-fc-back" data-fc-back>' + t('fc.back', 'Back') + '</button>';
    if (opts.cta) html += '<button type="button" class="gn-fc-next" data-fc-next>' + opts.cta + '</button>';
    html += '</div>';
    return html;
  }
  function wireCard(next) {
    var card = overlay.querySelector('[data-fc-card]');
    var skip = card.querySelector('[data-fc-skip]');
    if (skip) skip.addEventListener('click', function () { dismiss(true); });
    var back = card.querySelector('[data-fc-back]');
    if (back) back.addEventListener('click', function () { renderBeat(cur - 1); });
    var nxt = card.querySelector('[data-fc-next]');
    if (nxt && next) nxt.addEventListener('click', next);
    var extra = card.querySelector('[data-fc-extra]');
    if (extra) extra.addEventListener('click', function () {
      dosePhase = 'spot'; skippedDose = false;
      try {
        if (typeof window.showPage === 'function') window.showPage('Dash', document.getElementById('navDash'));
      } catch (_) {}
      setTimeout(function () { renderBeat(2); }, 300);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Beat 0 — SIGNAL (fullscreen) */
  /* ------------------------------------------------------------------ */
  function renderSignal() {
    setMode('screen');
    var card = overlay.querySelector('[data-fc-card]');
    card.className = 'gn-fc-card gn-fc-hero';
    card.innerHTML =
      cardHead('fc.signal.kicker') +
      '<h2 class="gn-fc-title">' + t('fc.signal.title', '') + '</h2>' +
      '<p class="gn-fc-body">' + t('fc.signal.body', '') + '</p>' +
      cardFoot({ back: false, cta: t('fc.signal.cta', 'Show me') });
    wireCard(function () { renderBeat(1); });
  }

  /* ------------------------------------------------------------------ */
  /* Beat 1 — THE GRID (fullscreen, 4 zone rows) */
  /* ------------------------------------------------------------------ */
  function renderGrid() {
    setMode('screen');
    var zones = ['shots', 'results', 'lab', 'vault'];
    var rows = zones.map(function (z) {
      return '<div class="gn-fc-zone"><b>' + t('fc.grid.' + z, z.toUpperCase()) + '</b><span>' + t('fc.grid.' + z + 'Body', '') + '</span></div>';
    }).join('');
    var card = overlay.querySelector('[data-fc-card]');
    card.className = 'gn-fc-card gn-fc-hero';
    card.innerHTML =
      cardHead('fc.grid.kicker') +
      '<h2 class="gn-fc-title">' + t('fc.grid.title', '') + '</h2>' +
      '<div class="gn-fc-zones">' + rows + '</div>' +
      cardFoot({ cta: t('fc.grid.cta', 'Start the loop') });
    wireCard(function () { renderBeat(2); });
  }

  /* ------------------------------------------------------------------ */
  /* Beat 2 — FIRST DOSE. Phase A: spotlight the log button. The tap is  */
  /* real (never prevented): the app opens #logOv, then Phase B coaches  */
  /* INSIDE the modal until gn:shot-saved fires.                         */
  /* ------------------------------------------------------------------ */
  function renderDose() {
    if (dosePhase === 'modal') { enterModalPhase(); return; }
    setMode('spot');
    overlay.style.display = '';
    var el = visibleEl(doseTargetSel());
    if (!el) {
      if (retries < 6) { retries++; setTimeout(function () { renderBeat(2); }, 500); return; }
      retries = 0;
      renderDoseFallback();
      return;
    }
    retries = 0;
    removeSpotlight();
    el.classList.add('gn-fc-target');
    scrollTargetIntoView(el);
    var card = overlay.querySelector('[data-fc-card]');
    card.className = 'gn-fc-card';
    card.innerHTML =
      cardHead('fc.dose.kicker') +
      '<h2 class="gn-fc-title">' + t('fc.dose.title', '') + '</h2>' +
      '<p class="gn-fc-body">' + t('fc.dose.body', '') + '</p>' +
      '<p class="gn-fc-hint">' + t('fc.dose.hint', '') + '</p>' +
      '<div class="gn-fc-actions">' +
        '<button type="button" class="gn-fc-skip" data-fc-skip>' + t('fc.skip', 'Skip tour') + '</button>' +
        '<button type="button" class="gn-fc-back" data-fc-back>' + t('fc.back', 'Back') + '</button>' +
        '<button type="button" class="gn-fc-ghost" data-fc-later>' + t('fc.dose.later', "I'll log later") + '</button>' +
      '</div>';
    var skip = card.querySelector('[data-fc-skip]');
    if (skip) skip.addEventListener('click', function () { dismiss(true); });
    var back = card.querySelector('[data-fc-back]');
    if (back) back.addEventListener('click', function () { renderBeat(1); });
    card.querySelector('[data-fc-later]').addEventListener('click', function () {
      skippedDose = true;
      renderBeat(3);
    });
    setTimeout(function () { positionHole(el); positionCard(el); }, 60);
    setTimeout(function () { positionHole(el); positionCard(el); }, 350);
    bindDoseTap();
    setState('2');
  }
  function renderDoseFallback() {
    // Target never appeared: degrade to a plain screen with a direct opener.
    setMode('screen');
    removeSpotlight();
    var card = overlay.querySelector('[data-fc-card]');
    card.className = 'gn-fc-card gn-fc-hero';
    card.innerHTML =
      cardHead('fc.dose.kicker') +
      '<h2 class="gn-fc-title">' + t('fc.dose.title', '') + '</h2>' +
      '<p class="gn-fc-body">' + t('fc.dose.body', '') + '</p>' +
      '<div class="gn-fc-actions">' +
        '<button type="button" class="gn-fc-skip" data-fc-skip>' + t('fc.skip', 'Skip tour') + '</button>' +
        '<button type="button" class="gn-fc-back" data-fc-back>' + t('fc.back', 'Back') + '</button>' +
        '<button type="button" class="gn-fc-ghost" data-fc-later>' + t('fc.dose.later', "I'll log later") + '</button>' +
        '<button type="button" class="gn-fc-next" data-fc-next>' + t('fc.dose.openLog', 'Open the log') + '</button>' +
      '</div>';
    wireCard(function () {
      try { if (typeof window.openLogModal === 'function') window.openLogModal(); } catch (_) {}
      setTimeout(enterModalPhase, 450);
    });
    // The fallback must never trap the user: same "log later" escape as the
    // spotlight card, so Open-the-log can never loop back on itself.
    var later = card.querySelector('[data-fc-later]');
    if (later) later.addEventListener('click', function () {
      skippedDose = true;
      renderBeat(3);
    });
  }
  var doseTapHandler = null;
  function bindDoseTap() {
    var sel = doseTargetSel();
    if (doseTapHandler) document.removeEventListener('click', doseTapHandler, true);
    doseTapHandler = function (e) {
      if (!e.target || !e.target.closest) return;
      if (e.defaultPrevented) return;
      if (!e.target.closest(sel)) return;
      // Never preventDefault: the app's own handler must open the modal.
      document.removeEventListener('click', doseTapHandler, true);
      doseTapHandler = null;
      setTimeout(function () {
        var modal = document.getElementById('logOv');
        if (modal && modal.classList.contains('active')) enterModalPhase();
        else renderBeat(2); // modal did not open; re-spot
      }, 450);
    };
    document.addEventListener('click', doseTapHandler, true);
  }

  /* Phase B: coach card lives ABOVE the modal (z 9500); the overlay hides. */
  function enterModalPhase() {
    dosePhase = 'modal';
    removeSpotlight();
    // Idempotent: re-entry (e.g. language change mid-coach) must not stack
    // listeners or observers.
    document.removeEventListener('gn:shot-saved', onShotSaved);
    if (modalWatch) { modalWatch.disconnect(); modalWatch = null; }
    if (overlay) overlay.style.display = 'none';
    if (coach) coach.remove();
    coach = document.createElement('div');
    coach.className = 'gn-fc-coach';
    coach.setAttribute('role', 'dialog');
    coach.setAttribute('aria-label', t('fc.coach.kicker', 'FIRST DOSE'));
    document.body.appendChild(coach);
    renderCoachCopy();
    // QA 2026-09-10: the 600ms poll alone made fast pill-tap -> save feel
    // unresponsive (dose step never visibly checked). Tick immediately on
    // any interaction inside the log modal.
    var logOvEl = document.getElementById('logOv');
    if (logOvEl) {
      logOvEl.classList.add('gn-fc-coaching');
      if (coachInputHandler) {
        logOvEl.removeEventListener('input', coachInputHandler);
        logOvEl.removeEventListener('click', coachInputHandler);
      }
      coachInputHandler = function () { coachTick(); };
      logOvEl.addEventListener('input', coachInputHandler);
      logOvEl.addEventListener('click', coachInputHandler);
    }
    document.addEventListener('gn:shot-saved', onShotSaved);
    // Save-blocked feedback: saveShot's error toast paints under the coach
    // sheet, so surface the failing fields inside the coach itself.
    document.removeEventListener('gn:coach-save-blocked', onCoachSaveBlocked);
    document.addEventListener('gn:coach-save-blocked', onCoachSaveBlocked);
    blockedFields = [];
    try { document.body.classList.add('gn-fc-coaching'); } catch (_) {}
    // Modal closed without saving -> back to the spotlight, with a grace
    // window for an accidental close. SELECT LOGGED LOCATION also closes
    // the modal, but the user must then pick a zone AND manually reopen
    // LOG SHOT: that round trip always exceeds the grace window, so while
    // a location pick is in flight the retreat waits for the reopen (or a
    // long safety timeout) instead of yanking the user back to beat 2.
    var modal = document.getElementById('logOv');
    var closeTimer = null;
    if (locPickHandler) document.removeEventListener('click', locPickHandler, true);
    pickingLocation = false;
    locPickHandler = function (e) {
      if (e.target && e.target.closest && e.target.closest('#logLocationAction')) pickingLocation = true;
    };
    document.addEventListener('click', locPickHandler, true);
    if (modal && window.MutationObserver) {
      modalWatch = new MutationObserver(function () {
        if (modal.classList.contains('active')) {
          if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
          if (pickTimer) { clearTimeout(pickTimer); pickTimer = null; }
          pickingLocation = false;
          renderCoachCopy();
          return;
        }
        if (closeTimer || pickTimer || !coach || coach.dataset.saved) return;
        if (pickingLocation) {
          // Location round trip in flight: the reopen above cancels this.
          // Abandoning the pick still retreats eventually.
          pickTimer = setTimeout(function () {
            pickTimer = null; pickingLocation = false;
            var m = document.getElementById('logOv');
            if (m && !m.classList.contains('active') && coach && !coach.dataset.saved) {
              dosePhase = 'spot';
              exitModalPhase();
              renderBeat(2);
            }
          }, 90000);
          return;
        }
        closeTimer = setTimeout(function () {
          closeTimer = null;
          var m = document.getElementById('logOv');
          if (m && !m.classList.contains('active')) {
            dosePhase = 'spot';
            exitModalPhase();
            renderBeat(2);
          }
        }, 1200);
      });
      modalWatch.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
    coachTick();
    coachTimer = setInterval(coachTick, 600);
    setState('2');
  }
  function renderCoachCopy() {
    if (!coach || coach.dataset.saved) return;
    coach.innerHTML =
      '<div class="gn-fc-coach-kicker">' + t('fc.coach.kicker', '') + '</div>' +
      '<div class="gn-fc-coach-title">' + t('fc.coach.title', '') + '</div>' +
      '<ul class="gn-fc-steps">' +
        '<li data-fc-step="med"><i aria-hidden="true"></i><span>' + t('fc.coach.stepMed', '') + '</span></li>' +
        '<li data-fc-step="dose"><i aria-hidden="true"></i><span>' + t('fc.coach.stepDose', '') + '</span></li>' +
        '<li data-fc-step="loc"><i aria-hidden="true"></i><span>' + t('fc.coach.stepLoc', '') + '</span></li>' +
      '</ul>' +
      '<div class="gn-fc-coach-then">' + t('fc.coach.then', '') + '</div>' +
      '<div class="gn-fc-coach-err" data-fc-coach-err hidden></div>' +
      '<button type="button" class="gn-fc-coach-skip" data-fc-coach-skip>' + t('fc.dose.later', "I'll log later") + '</button>';
    coach.querySelector('[data-fc-coach-skip]').addEventListener('click', function () {
      skippedDose = true;
      exitModalPhase();
      try {
        var m = document.getElementById('logOv');
        if (m) m.classList.remove('active');
      } catch (_) {}
      renderBeat(3);
    });
    coachTick();
  }
  function coachReadiness() {
    var medEl = document.getElementById('cpShotMedVal');
    var medTxt = medEl ? (medEl.textContent || '').trim() : '';
    var med = Boolean(medTxt) && !medEl.classList.contains('placeholder') && !/select|seleccion/i.test(medTxt);
    var doseEl = document.getElementById('sDose');
    var dose = Boolean(doseEl && String(doseEl.value || '').trim().length);
    var locEl = document.getElementById('modalSelectedLocation');
    var locTxt = locEl ? (locEl.textContent || '').trim() : '';
    var loc = Boolean(locTxt) && !/no location|sin ubic/i.test(locTxt);
    return { med: med, dose: dose, loc: loc };
  }
  function coachTick() {
    if (!coach || coach.dataset.saved) return;
    var r = coachReadiness();
    ['med', 'dose', 'loc'].forEach(function (k) {
      var li = coach.querySelector('[data-fc-step="' + k + '"]');
      if (li) li.classList.toggle('done', Boolean(r[k]));
    });
    var ready = r.med && r.dose && r.loc;
    document.querySelectorAll('#logOv [onclick*="saveShot"]').forEach(function (b) {
      b.classList.toggle('gn-fc-pulse', ready);
    });
    refreshCoachError();
  }
  /* Save-blocked feedback: mirrors saveShot's strict validation for one field
   * key, so the coach error clears itself the moment the user fixes the field.
   * (The coach's own 3 step checkmarks stay as guidance; saveShot additionally
   * requires date and time, which the coach does not coach.) */
  function coachFieldValid(key) {
    try {
      if (key === 'med') {
        var raw = (window.selectState && window.selectState.cpShotMed && window.selectState.cpShotMed.val) || '';
        var norm = (typeof normalizeMedicationId === 'function') ? normalizeMedicationId(raw) : raw;
        return Boolean(norm) && (typeof MEDICATIONS !== 'undefined') &&
          Object.prototype.hasOwnProperty.call(MEDICATIONS, norm);
      }
      if (key === 'dose') {
        var doseEl = document.getElementById('sDose');
        var dose = doseEl ? Number(String(doseEl.value || '').trim()) : NaN;
        return Number.isFinite(dose) && dose > 0;
      }
      if (key === 'date') {
        var dateEl = document.getElementById('sDate');
        var date = (typeof readHumanDateInput === 'function') ? readHumanDateInput(dateEl) : (dateEl ? dateEl.value : '');
        return Boolean(date);
      }
      if (key === 'time') {
        var timeEl = document.getElementById('sTime');
        var timeVal = timeEl ? String(timeEl.value || '').trim() : '';
        if (!timeVal) return false;
        if (typeof getShotTime24 === 'function') return Boolean(getShotTime24(timeVal));
        return true;
      }
      if (key === 'loc') {
        var ms = (typeof moduleState !== 'undefined') ? moduleState : null;
        return Boolean(ms && ms.selectedLocation);
      }
    } catch (_) { /* never break the coach for a validation probe */ }
    return false;
  }
  function onCoachSaveBlocked(e) {
    if (!coach || coach.dataset.saved) return;
    var fields = (e && e.detail && Array.isArray(e.detail.fields)) ? e.detail.fields : [];
    blockedFields = fields.filter(function (k) { return typeof k === 'string' && k; });
    refreshCoachError(true);
  }
  function refreshCoachError(force) {
    if (!coach || coach.dataset.saved) return;
    var errEl = coach.querySelector('[data-fc-coach-err]');
    if (!errEl) return;
    if (blockedFields && blockedFields.length) {
      var stillBad = blockedFields.filter(function (k) { return !coachFieldValid(k); });
      if (!stillBad.length && !force) { blockedFields = []; errEl.hidden = true; errEl.textContent = ''; return; }
      var names = (stillBad.length ? stillBad : blockedFields).map(function (k) { return t('fc.coach.field.' + k, k); });
      errEl.textContent = t('fc.coach.blocked', 'Could not save yet. Check: {fields}.').replace('{fields}', names.join(', '));
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
      errEl.textContent = '';
    }
  }
  function onShotSaved() {
    document.removeEventListener('gn:shot-saved', onShotSaved);
    document.removeEventListener('gn:coach-save-blocked', onCoachSaveBlocked);
    blockedFields = [];
    skippedDose = false;
    if (coachTimer) { clearInterval(coachTimer); coachTimer = null; }
    if (modalWatch) { modalWatch.disconnect(); modalWatch = null; }
    removeSpotlight();
    if (coach) {
      coach.dataset.saved = '1';
      coach.innerHTML =
        '<div class="gn-fc-coach-kicker">' + t('fc.coach.kicker', '') + '</div>' +
        '<div class="gn-fc-coach-saved">' + t('fc.coach.saved', '') + '</div>';
    }
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(function () {
      exitModalPhase();
      renderBeat(3);
    }, 1500);
  }
  function exitModalPhase() {
    if (coachTimer) { clearInterval(coachTimer); coachTimer = null; }
    if (modalWatch) { modalWatch.disconnect(); modalWatch = null; }
    if (locPickHandler) { document.removeEventListener('click', locPickHandler, true); locPickHandler = null; }
    if (pickTimer) { clearTimeout(pickTimer); pickTimer = null; }
    var logOvEl = document.getElementById('logOv');
    if (logOvEl) {
      logOvEl.classList.remove('gn-fc-coaching');
      if (coachInputHandler) {
        logOvEl.removeEventListener('input', coachInputHandler);
        logOvEl.removeEventListener('click', coachInputHandler);
      }
    }
    coachInputHandler = null;
    pickingLocation = false;
    document.removeEventListener('gn:shot-saved', onShotSaved);
    document.removeEventListener('gn:coach-save-blocked', onCoachSaveBlocked);
    blockedFields = [];
    try { document.body.classList.remove('gn-fc-coaching'); } catch (_) {}
    if (coach) { coach.remove(); coach = null; }
    removeSpotlight();
  }

  /* ------------------------------------------------------------------ */
  /* Beat 3 — THE CURVE. Auto-navigate to RESULTS; spotlight the Phase   */
  /* Engine readout (or its empty state on the skip path).               */
  /* ------------------------------------------------------------------ */
  function renderCurve() {
    exitModalPhase();
    dosePhase = 'spot';
    if (overlay) overlay.style.display = '';
    setMode('spot');
    try {
      if (typeof window.showPage === 'function') window.showPage('Results', document.getElementById('navRes'));
    } catch (_) {}
    setTimeout(function () {
      var el = curveTarget();
      removeSpotlight();
      var card = overlay.querySelector('[data-fc-card]');
      card.className = 'gn-fc-card';
      var titleKey = skippedDose ? 'fc.curve.emptyTitle' : 'fc.curve.title';
      var bodyKey = skippedDose ? 'fc.curve.emptyBody' : 'fc.curve.body';
      card.innerHTML =
        cardHead('fc.curve.kicker') +
        '<h2 class="gn-fc-title">' + t(titleKey, '') + '</h2>' +
        '<p class="gn-fc-body">' + t(bodyKey, '') + '</p>' +
        (skippedDose ? '<button type="button" class="gn-fc-ghost" data-fc-extra>' + t('fc.curve.logCta', 'Log your first dose') + '</button>' : '') +
        cardFoot({ cta: t('fc.curve.cta', 'Continue') });
      wireCard(function () { renderBeat(4); });
      if (el) {
        el.classList.add('gn-fc-target');
        scrollTargetIntoView(el);
        setTimeout(function () { positionHole(el); positionCard(el); }, 60);
        setTimeout(function () { positionHole(el); positionCard(el); }, 350);
      } else {
        overlay.querySelectorAll('.gn-fc-dim').forEach(function (dim) {
          dim.style.top = '0px'; dim.style.left = '0px'; dim.style.width = '0px'; dim.style.height = '0px';
        });
        positionCard(null);
      }
      setState('3');
    }, 350);
  }

  /* ------------------------------------------------------------------ */
  /* Beat 4 — MAKE IT YOURS. Compact comfort card: theme + language,     */
  /* wired straight into the app's own controls. Pick or skip, then Done. */
  /* ------------------------------------------------------------------ */
  function renderComfort() {
    setMode('screen');
    if (overlay) overlay.style.display = '';
    removeSpotlight();
    var theme = (window.GN_THEME && window.GN_THEME.get && window.GN_THEME.get()) || 'dark';
    var card = overlay.querySelector('[data-fc-card]');
    card.className = 'gn-fc-card gn-fc-compact';
    card.innerHTML =
      cardHead('fc.comfort.kicker') +
      '<h2 class="gn-fc-title">' + t('fc.comfort.title', '') + '</h2>' +
      '<p class="gn-fc-body">' + t('fc.comfort.body', '') + '</p>' +
      '<div class="gn-fc-seg" role="group" aria-label="theme">' +
        '<button type="button" class="' + (theme !== 'light' ? 'active' : '') + '" data-fc-theme="dark">' + t('fc.comfort.night', 'NIGHT') + '</button>' +
        '<button type="button" class="' + (theme === 'light' ? 'active' : '') + '" data-fc-theme="light">' + t('fc.comfort.dusk', 'DUSK') + '</button>' +
      '</div>' +
      '<div class="gn-fc-seg" role="group" aria-label="language">' +
        '<button type="button" class="' + (!isEs() ? 'active' : '') + '" data-fc-lang="en">EN</button>' +
        '<button type="button" class="' + (isEs() ? 'active' : '') + '" data-fc-lang="es">ES</button>' +
      '</div>' +
      cardFoot({ cta: t('fc.comfort.done', 'Done') });
    card.querySelectorAll('[data-fc-theme]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { if (window.GN_THEME && window.GN_THEME.set) window.GN_THEME.set(b.dataset.fcTheme); } catch (_) {}
        card.querySelectorAll('[data-fc-theme]').forEach(function (x) { x.classList.toggle('active', x === b); });
      });
    });
    card.querySelectorAll('[data-fc-lang]').forEach(function (b) {
      b.addEventListener('click', function () {
        var next = b.dataset.fcLang;
        // v0.15.31 pattern: persist first so the control state can't race
        // the async catalog load, then reflect the choice immediately like
        // the theme buttons above do.
        try { localStorage.setItem('gn.lang', next); } catch (_) {}
        try { if (window.GN_I18N && window.GN_I18N.setLang) window.GN_I18N.setLang(next); } catch (_) {}
        card.querySelectorAll('[data-fc-lang]').forEach(function (x) { x.classList.toggle('active', x === b); });
        langCache = null;
      });
    });
    wireCard(function () { renderBeat(5); });
    setState('4');
  }

  /* ------------------------------------------------------------------ */
  /* Beat 5 — ONLINE. Clean exit; the loop restated as a mantra.        */
  /* ------------------------------------------------------------------ */
  function renderOnline() {
    setMode('screen');
    removeSpotlight();
    var card = overlay.querySelector('[data-fc-card]');
    card.className = 'gn-fc-card gn-fc-hero';
    card.innerHTML =
      cardHead('fc.online.kicker') +
      '<h2 class="gn-fc-title">' + t('fc.online.title', '') + '</h2>' +
      '<p class="gn-fc-body">' + t('fc.online.body', '') + '</p>' +
      cardFoot({ back: false, cta: t('fc.online.cta', 'Enter GRID//NODE') });
    wireCard(function () { finish(); });
    setState('5');
  }

  /* ------------------------------------------------------------------ */
  /* Flow control */
  /* ------------------------------------------------------------------ */
  function renderBeat(i) {
    if (!overlay) return;
    if (i >= BEATS) { finish(); return; }
    if (i < 0) i = 0;
    cur = i;
    setState(String(i));
    removeSpotlight();
    if (i === 0) renderSignal();
    else if (i === 1) renderGrid();
    else if (i === 2) {
      /* v0.15.38: stamp when the FIRST DOSE beat starts. The native
         session-draft restore (gridnode-native.js) uses this to tell a
         stale pre-coach draft — which resurrects old values and fake-checks
         the coach steps (dose showed checked before the user touched
         anything) — from values the user entered during this beat. */
      try { if (!document.body.dataset.gnFcDoseStart) document.body.dataset.gnFcDoseStart = String(Date.now()); } catch (_) {}
      renderDose();
    }
    else if (i === 3) renderCurve();
    else if (i === 4) renderComfort();
    else if (i === 5) renderOnline();
  }
  function finish() {
    try {
      if (typeof window.showPage === 'function') window.showPage('Dash', document.getElementById('navDash'));
    } catch (_) {}
    dismiss(true);
  }
  function dismiss(complete) {
    if (!complete) { try { localStorage.setItem(DISMISSED, '1'); } catch (_) {} }
    exitModalPhase();
    /* v0.15.38: clear the FIRST DOSE beat stamp (see renderBeat). */
    try { delete document.body.dataset.gnFcDoseStart; } catch (_) {}
    if (doseTapHandler) { document.removeEventListener('click', doseTapHandler, true); doseTapHandler = null; }
    if (savedTimer) { clearTimeout(savedTimer); savedTimer = null; }
    if (overlay) { overlay.remove(); overlay = null; }
    if (whatsnewSafety) document.removeEventListener('gn:whatsnew-shown', whatsnewSafety);
    removeSpotlight();
    document.removeEventListener('gn:langchange', onLangChange);
    document.removeEventListener('keydown', esc);
    window.removeEventListener('scroll', onViewportMove, { capture: true });
    window.removeEventListener('resize', onViewportMove);
    if (complete) setState('complete');
    try { document.dispatchEvent(new CustomEvent('gn:firstcontact-done', { detail: { complete: !!complete } })); } catch (_) {}
  }

  /* ------------------------------------------------------------------ */
  /* Boot, auto-start, replay */
  /* ------------------------------------------------------------------ */
  function start(resume) {
    if (overlay || coach) return;
    var startAt = 0;
    if (resume) {
      var s = parseInt(state(), 10);
      if (!isNaN(s) && s >= 0 && s < BEATS) startAt = s;
    } else {
      dosePhase = 'spot'; skippedDose = false;
    }
    langCache = null;
    buildOverlay();
    whatsnewSafety = function () { if (overlay && document.getElementById('gnWhatsNewOverlay')) dismiss(false); };
    document.addEventListener('gn:whatsnew-shown', whatsnewSafety);
    renderBeat(startAt);
  }
  function injectReplay() {
    if (document.querySelector('[data-gn-fc-replay]')) return;
    // Anchor: the "Reload App" utility row in the profile // APP section.
    var anchor = document.querySelector('#pageProfile .gn-utility-row[onclick*="reload"]');
    if (!anchor || !anchor.parentNode) return;
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'gn-utility-row';
    row.setAttribute('data-gn-fc-replay', '');
    row.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<span class="gn-icon gn-icon-sm gn-utility-icon" aria-hidden="true">◆</span>' +
        '<span style="font-family:\'Rajdhani\',sans-serif;font-size:1rem;color:#eeeef5">' + t('fc.replay', 'GUIDED TOUR') + '</span>' +
      '</div>' +
      '<span class="gn-utility-chevron" aria-hidden="true">›</span>';
    row.addEventListener('click', function () { dosePhase = 'spot'; skippedDose = false; start(false); });
    anchor.parentNode.insertBefore(row, anchor.nextSibling);
  }
  var whatsnewResolved = false;
  var whatsnewSafety = null;
  function markWhatsNewResolved() { whatsnewResolved = true; maybeAutoStart(); }
  function maybeAutoStart() {
    if (state() === 'complete') return;
    try { if (localStorage.getItem(DISMISSED) === '1') return; } catch (_) {}
    if (document.querySelector('.gn-404-screen')) return;
    var landing = document.getElementById('landing');
    var app = document.getElementById('app');
    var inApp = app && getComputedStyle(app).display !== 'none' && (!landing || getComputedStyle(landing).display === 'none');
    if (!inApp) { window.setTimeout(maybeAutoStart, 1200); return; }
    var wn = document.getElementById('gnWhatsNewOverlay');
    if (wn && (wn.classList.contains('active') || getComputedStyle(wn).display !== 'none')) { window.setTimeout(maybeAutoStart, 700); return; }
    if (!whatsnewResolved) {
      window.setTimeout(function () { if (overlay) return; maybeAutoStart(); }, 900);
      return;
    }
    start(true);
  }
  function migrate() {
    try {
      if (localStorage.getItem(KEY)) return;
      var v1 = localStorage.getItem(V1KEY);
      var v1d = localStorage.getItem(V1DIS);
      if (v1 === 'complete' || v1d === '1') localStorage.setItem(KEY, 'complete');
    } catch (_) {}
  }
  function boot() {
    migrate();
    document.addEventListener('gn:whatsnew-resolved', markWhatsNewResolved);
    document.addEventListener('gn:whatsnew-dismissed', markWhatsNewResolved);
    var kick = function () {
      window.setTimeout(maybeAutoStart, 1600);
      if (window.MutationObserver) new MutationObserver(injectReplay).observe(document.body, { childList: true, subtree: true });
      else injectReplay();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kick, { once: true });
    else kick();
  }

  window.GN_FIRSTCONTACT = Object.freeze({
    start: start,
    restart: function () { dosePhase = 'spot'; skippedDose = false; setState('0'); start(false); },
    state: state,
    beat: function () { return cur; },
    active: function () { return Boolean(overlay || coach); }
  });

  boot();
})();

/* 20260910 content-type repair: hash bump only, no functional change. */
