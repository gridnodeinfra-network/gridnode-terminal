/* GRID//NODE — Interactive first-run onboarding.
 * Spotlight tour over the real UI: 10 steps, NEXT/BACK/SKIP, progress dots,
 * resume-after-skip, replay from the profile hub. Mobile-first, EN/ES,
 * reduced-motion safe. NEVER injects sample data; the guided task logs a real
 * (or cancelled) SHOT entry.
 */
(function () {
  'use strict';

  var KEY = 'gn_onboarding_v1';
  var STEPS = null;

  var COPY = {
    en: [
      { title: 'WELCOME TO GRID//NODE', body: 'Your personal biotech command system. Every record stays on this device first — your body, your data, your grid.' },
      { title: 'LANGUAGE & THEME', body: 'Switch between English and Spanish, and between the NIGHT GRID and DAY OPS themes, any time from the top bar.' },
      { title: 'SHOTS', body: 'Log your protocol doses with medication, dose, date, time, and a body location from the holographic scanner.' },
      { title: 'PHASE ENGINE', body: 'The phase sphere estimates your 7-day reference cycle from your shot history. Educational — not medical advice.' },
      { title: 'RESULTS', body: 'Weight trends, progress signals, and timeline records — your changes over time, in one place.' },
      { title: 'LAB', body: 'Research peptides, syringe draw, reconstitution, dose projection, and inventory — all calculators, no guesswork.' },
      { title: 'NODE', body: 'Your profile hub: body metrics, passkeys, device vault, export/backup, and sign out.' },
      { title: 'VAULT', body: 'Device vault and backups keep your data safe. Export CSV or a full backup any time.' },
      { title: 'YOUR FIRST SHOT', body: 'Tap the + button and log one real SHOT — or cancel to try later. Nothing is saved until you press SAVE SHOT.' },
      { title: 'YOU ARE IN', body: 'That\u2019s the core loop. Skip and resume any time, or replay this tour from your profile.' }
    ],
    es: [
      { title: 'BIENVENIDO A GRID//NODE', body: 'Tu sistema de comando biotecnol\u00f3gico personal. Cada registro vive primero en este dispositivo: tu cuerpo, tus datos, tu grilla.' },
      { title: 'IDIOMA Y TEMA', body: 'Cambia entre ingl\u00e9s y espa\u00f1ol, y entre los temas NIGHT GRID y DAY OPS, cuando quieras desde la barra superior.' },
      { title: 'DOSIS (SHOTS)', body: 'Registra tus dosis con medicamento, dosis, fecha, hora y una ubicaci\u00f3n corporal desde el esc\u00e1ner hologr\u00e1fico.' },
      { title: 'MOTOR DE FASES', body: 'La esfera de fases estima tu ciclo de referencia de 7 d\u00edas desde tu historial. Educativo — no es consejo m\u00e9dico.' },
      { title: 'RESULTADOS', body: 'Tendencias de peso, se\u00f1ales de progreso y l\u00ednea de tiempo: tus cambios a lo largo del tiempo, en un solo lugar.' },
      { title: 'LAB', body: 'P\u00e9ptidos de investigaci\u00f3n, jeringa, reconstituci\u00f3n, proyecci\u00f3n de dosis e inventario — pura calculadora, sin conjeturas.' },
      { title: 'NODE', body: 'Tu centro de perfil: m\u00e9tricas corporales, passkeys, b\u00f3veda de dispositivos, exportaci\u00f3n/respaldo y cerrar sesi\u00f3n.' },
      { title: 'VAULT', body: 'La b\u00f3veda de dispositivos y los respaldos protegen tus datos. Exporta CSV o un respaldo completo cuando quieras.' },
      { title: 'TU PRIMERA DOSIS', body: 'Toca el bot\u00f3n + y registra una DOSIS real — o cancela para intentarlo luego. Nada se guarda hasta que pulses GUARDAR DOSIS.' },
      { title: 'YA EST\u00c1S DENTRO', body: 'Ese es el ciclo principal. Omite y retoma cuando quieras, o repite este tour desde tu perfil.' }
    ]
  };

  var TARGETS = [
    null,
    '.gn-theme-toggle',
    '#navLog',
    '#phaseCard',
    '#navRes',
    '#navLab',
    '#topAva',
    null,
    '.fab',
    null
  ];

  function lang() { return (document.documentElement && document.documentElement.lang === 'es') ? 'es' : 'en'; }
  function copy(i) { return (COPY[lang()] || COPY.en)[i] || { title: '', body: '' }; }
  function getState() { try { return localStorage.getItem(KEY) || '0'; } catch (_) { return '0'; } }
  function setState(v) { try { localStorage.setItem(KEY, String(v)); } catch (_) {} }

  var overlay = null;

  function stepCount() { return COPY.en.length; }

  function renderStep(i) {
    if (!overlay) return;
    var c = copy(i);
    var target = TARGETS[i];
    document.querySelectorAll('.gn-onb-target').forEach(function (el) { el.classList.remove('gn-onb-target'); });
    var targetEl = target ? document.querySelector(target) : null;
    if (targetEl) {
      targetEl.classList.add('gn-onb-target');
      targetEl.scrollIntoView({ block: 'center', behavior: (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth') });
    }
    overlay.querySelector('[data-onb-kicker]').textContent = '// SYSTEM ORIENTATION  ' + (i + 1) + ' / ' + stepCount();
    overlay.querySelector('[data-onb-title]').textContent = c.title;
    overlay.querySelector('[data-onb-body]').textContent = c.body;
    overlay.querySelector('[data-onb-dots]').innerHTML = Array.from({ length: stepCount() }, function (_, d) {
      return '<i class="' + (d === i ? 'active' : '') + (d < i ? ' done' : '') + '"></i>';
    }).join('');
    overlay.querySelector('[data-onb-back]').disabled = i === 0;
    var next = overlay.querySelector('[data-onb-next]');
    next.textContent = i === stepCount() - 1 ? (lang() === 'es' ? 'TERMINAR' : 'FINISH') : (lang() === 'es' ? 'SIGUIENTE' : 'NEXT');
    setState(String(i));
  }

  function dismiss(complete) {
    if (overlay) { overlay.remove(); overlay = null; }
    document.querySelectorAll('.gn-onb-target').forEach(function (el) { el.classList.remove('gn-onb-target'); });
    if (complete) setState('complete');
  }

  function start(resume) {
    if (overlay) return;
    var startAt = 0;
    if (resume) {
      var s = parseInt(getState(), 10);
      if (!isNaN(s) && s > 0 && s < stepCount()) startAt = s;
    }
    overlay = document.createElement('div');
    overlay.className = 'gn-onb-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'GRID//NODE orientation');
    overlay.innerHTML =
      '<div class="gn-onb-card">' +
        '<div class="gn-onb-kicker" data-onb-kicker></div>' +
        '<h2 class="gn-onb-title" data-onb-title></h2>' +
        '<p class="gn-onb-body" data-onb-body></p>' +
        '<div class="gn-onb-dots" data-onb-dots aria-hidden="true"></div>' +
        '<div class="gn-onb-actions">' +
          '<button type="button" class="gn-onb-skip" data-onb-skip>' + (lang() === 'es' ? 'OMITIR' : 'SKIP') + '</button>' +
          '<button type="button" class="gn-onb-back" data-onb-back>' + (lang() === 'es' ? 'ATRÁS' : 'BACK') + '</button>' +
          '<button type="button" class="gn-onb-next" data-onb-next>' + (lang() === 'es' ? 'SIGUIENTE' : 'NEXT') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('[data-onb-skip]').addEventListener('click', function () { dismiss(false); });
    overlay.querySelector('[data-onb-back]').addEventListener('click', function () {
      var cur = parseInt(overlay.querySelector('[data-onb-kicker]').textContent.match(/\d+ \//)[0], 10);
      renderStep(Math.max(0, cur - 2));
    });
    overlay.querySelector('[data-onb-next]').addEventListener('click', function () {
      var cur = parseInt(overlay.querySelector('[data-onb-kicker]').textContent.match(/\d+ \//)[0], 10);
      if (cur >= stepCount()) { dismiss(true); return; }
      renderStep(cur);
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay) dismiss(false); }, { once: true });
    renderStep(startAt);
  }

  function injectReplay() {
    var hub = document.querySelector('#pageProfile .gn-profile-hub, #pageProfile [data-gn-profile-hub]');
    if (!hub || document.querySelector('[data-gn-tour-replay]')) return;
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'gn-vault-row gn-onb-replay';
    row.dataset.gnTourReplay = '';
    row.innerHTML = '<span class="gn-vault-row-ico" aria-hidden="true">◆</span><span>' + (lang() === 'es' ? 'TOUR GUIADO' : 'GUIDED TOUR') + '</span><span class="gn-vault-row-arrow" aria-hidden="true">›</span>';
    row.addEventListener('click', function () { start(true); });
    var anchor = hub.querySelector('[data-vault-action], .gn-vault-row');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(row, anchor);
    else hub.appendChild(row);
  }

  function maybeAutoStart() {
    if (getState() === 'complete') return;
    var landing = document.getElementById('landing');
    var app = document.getElementById('app');
    var inApp = app && getComputedStyle(app).display !== 'none' && (!landing || getComputedStyle(landing).display === 'none');
    if (!inApp) { window.setTimeout(maybeAutoStart, 1200); return; }
    start(false);
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

  window.GN_ONBOARDING = Object.freeze({ start: start, state: getState });

  boot();
})();
