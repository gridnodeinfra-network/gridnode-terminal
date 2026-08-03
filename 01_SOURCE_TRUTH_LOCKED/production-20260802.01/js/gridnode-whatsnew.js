/* GRID//NODE — SYSTEM UPDATE (What's New)
 * Premium, categorized release notes. One authoritative user-facing version:
 * window.GN_VERSION. Update VERSION + NOTES per release (keep in sync with
 * scripts/bump-version.sh marker).
 *
 * - shows once per release (localStorage gn_whatsnew_seen_<release>)
 * - never blocks first-time landing-page discovery (waits for the app shell)
 * - reopenable via window.GN_WHATS_NEW.show()
 * - fully themed (NIGHT GRID / DAY OPS) and localized (EN / ES)
 */
(function () {
  'use strict';

  var VERSION = (typeof window !== 'undefined' && window.GN_VERSION) || {
    semver: '0.9.1',
    release: '20260802.10',
    title: 'MOBILE POLISH PHASE TWO',
    date: '2026-08-02'
  };

  // Categories: NEW / IMPROVED / FIXED / ACCESSIBILITY / MOBILE / SECURITY
  var NOTES = {
    '20260802.9': {
      title: 'PREMIUM MOBILE REFINEMENT',
      date: '2026-08-02',
      en: {
        NEW: [
          'GRID//NODE v0.9.0 — formal versioning begins here',
          'Red-lava action system: deeper, dimensional primary buttons',
          'Passkey prompts now only appear when you have no passkey yet'
        ],
        IMPROVED: [
          'Readable typography across the app — bigger labels, calmer contrast',
          'Day Ops light theme refined for premium readability',
          'Phase Curve charts reserve space for labels — no more overlap'
        ],
        FIXED: [
          'Passkey prompt no longer repeats for accounts that already have one',
          'Mobile header never overlaps the GRID//NODE brand'
        ],
        MOBILE: [
          'Header layout tested from 320px to 430px',
          'Chart and controls no longer collide on Android'
        ],
        ACCESSIBILITY: [
          'Larger text roles for adults of every age',
          'Clearer focus and contrast in both themes'
        ]
      },
      es: {
        NEW: [
          'GRID//NODE v0.9.0 — el versionado formal comienza aquí',
          'Sistema de acción lava roja: botones primarios más profundos y dimensionales',
          'Las invitaciones de passkey solo aparecen si aún no tienes una'
        ],
        IMPROVED: [
          'Tipografía legible en toda la app — etiquetas más grandes, contraste más calmado',
          'Tema claro Day Ops refinado para una lectura premium',
          'Las gráficas de fases reservan espacio para etiquetas — sin superposiciones'
        ],
        FIXED: [
          'La invitación de passkey ya no se repite en cuentas que ya tienen una',
          'El encabezado móvil ya no se superpone con la marca GRID//NODE'
        ],
        MOBILE: [
          'Diseño del encabezado probado de 320px a 430px',
          'Las gráficas y controles ya no chocan en Android'
        ],
        ACCESSIBILITY: [
          'Roles de texto más grandes para adultos de todas las edades',
          'Enfoque y contraste más claros en ambos temas'
        ]
      }
    }
  };

  function lang() {
    return (document.documentElement && document.documentElement.lang === 'es') ? 'es' : 'en';
  }

  function tx(key, fallback) {
    return (window.GN_I18N && window.GN_I18N.text) ? window.GN_I18N.text(key, fallback) : fallback;
  }

  function categoryLabels() {
    return {
      NEW: tx('whatsnew.catNew', 'NEW'),
      IMPROVED: tx('whatsnew.catImproved', 'IMPROVED'),
      FIXED: tx('whatsnew.catFixed', 'FIXED'),
      ACCESSIBILITY: tx('whatsnew.catA11y', 'ACCESSIBILITY'),
      MOBILE: tx('whatsnew.catMobile', 'MOBILE'),
      SECURITY: tx('whatsnew.catSecurity', 'SECURITY')
    };
  }

  function buildNotes(release) {
    var data = (NOTES[release] || {})[lang()] || {};
    var order = ['NEW', 'IMPROVED', 'FIXED', 'ACCESSIBILITY', 'MOBILE', 'SECURITY'];
    var out = [];
    order.forEach(function (cat) {
      var items = data[cat];
      if (!items || !items.length) return;
      var labels = categoryLabels();
      out.push('<section class="gn-wn-cat" data-cat="' + cat.toLowerCase() + '"><span class="gn-wn-cat-tag">' + (labels[cat] || cat) + '</span><ul>' +
        items.map(function (item) { return '<li>' + item + '</li>'; }).join('') + '</ul></section>');
    });
    return out.join('');
  }

  function show(opts) {
    opts = opts || {};
    var release = opts.release || VERSION.release;
    var key = 'gn_whatsnew_seen_premium_' + release;
    if (!opts.force) {
      try { if (localStorage.getItem(key)) return; } catch (_) { /* storage unavailable */ }
    }
    var data = (NOTES[release] || {})[lang()] || {};
    if (!Object.keys(data).length) return;
    if (document.getElementById('gnWhatsNewOverlay')) document.getElementById('gnWhatsNewOverlay').remove();

    var overlay = document.createElement('div');
    overlay.id = 'gnWhatsNewOverlay';
    overlay.className = 'gn-whatsnew-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', tx('whatsnew.title', 'WHAT\'S NEW'));
    var versionLabel = (opts.version && opts.version.semver) ? opts.version.semver : VERSION.semver;
    var title = (data.title || VERSION.title);
    var date = (data.date || VERSION.date);
    overlay.innerHTML =
      '<div class="gn-whatsnew-card">' +
        '<div class="gn-whatsnew-kicker">// ' + tx('whatsnew.systemUpdate', 'SYSTEM UPDATE') + '</div>' +
        '<div class="gn-whatsnew-version">GRID//NODE v' + versionLabel + '</div>' +
        '<div class="gn-whatsnew-title">' + title + '</div>' +
        '<div class="gn-whatsnew-date">' + date + ' \u00b7 ' + release + '</div>' +
        '<div class="gn-whatsnew-body">' + buildNotes(release) + '</div>' +
        '<button type="button" class="gn-whatsnew-close">' + tx('whatsnew.gotIt', 'GOT IT') + '</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.classList.add('active');

    function dismiss() {
      overlay.classList.remove('active');
      overlay.remove();
      try { localStorage.setItem(key, '1'); } catch (_) { /* storage unavailable */ }
    }
    overlay.querySelector('.gn-whatsnew-close').addEventListener('click', dismiss);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) dismiss();
    });
  }

  function boot() {
    // Never block first-time landing discovery: only auto-show once the app
    // shell is visible, and give the page a beat to settle.
    function tryAutoShow() {
      var landing = document.getElementById('landing');
      var app = document.getElementById('app');
      var inApp = app && getComputedStyle(app).display !== 'none' && (!landing || getComputedStyle(landing).display === 'none');
      if (!inApp) { window.setTimeout(tryAutoShow, 1200); return; }
      show();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window.setTimeout(tryAutoShow, 1000); }, { once: true });
    else window.setTimeout(tryAutoShow, 1000);
  }

  // The legacy bundle modal is superseded by this sheet: suppress it up
  // front (before showApp can display it) for the current APP_VERSION.
  try { localStorage.setItem('gn_whatsnew_seen', VERSION.semver); } catch (_) { /* storage unavailable */ }

  // GN_VERSION is owned by js/gridnode-version.js (single source).
  window.GN_WHATS_NEW = Object.freeze({ show: show });

  boot();
})();
