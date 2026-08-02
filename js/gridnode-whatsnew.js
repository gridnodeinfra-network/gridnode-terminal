/* GRID//NODE What's New — per-release release notes shown once per version.
 * Priority feature: every release tells the customer what changed.
 * Update MARKER + NOTES for each release (keep in sync with bump-version.sh marker).
 */
(function () {
  'use strict';

  var MARKER = '20260802.8';

  var NOTES = {
    '20260802.8': {
      en: [
        'Fixed: the What\u2019s New screen now closes properly on first visit'
      ],
      es: [
        'Corregido: la pantalla de Novedades ahora se cierra correctamente en la primera visita'
      ]
    },
    '20260802.7': {
      en: [
        'Fixed: charts and live stats now keep updating reliably'
      ],
      es: [
        'Corregido: las gráficas y estadísticas en vivo ahora se actualizan de forma confiable'
      ]
    },
    '20260802.6': {
      en: [
        'Fixed: theme controls and the profile menu now load consistently for everyone',
        'Release 20260802.6 refreshes cached app files'
      ],
      es: [
        'Corregido: los controles de tema y el menú de perfil ahora cargan de forma consistente para todos',
        'La versión 20260802.6 refresca los archivos de la app en caché'
      ]
    },
    '20260802.5': {
      en: [
        'Fixed: the full user menu is back — profile, Device Vault, tools, and sign out',
        'Theme colors no longer break any screen or menu'
      ],
      es: [
        'Corregido: el menú completo del usuario está de vuelta — perfil, bóveda de dispositivos, herramientas y cerrar sesión',
        'Los colores del tema ya no rompen ninguna pantalla ni menú'
      ]
    },
    '20260802.4': {
      en: [
        'What\u2019s New: every update now tells you what changed',
        'Theme toggles are compact icons \u2014 no more overlap',
        'Device Vault and profile menu restored',
        'Sign-in shows the same city as a cloudy grey day',
        'SHOTS scanner now follows the light theme',
        'LAB peptide display is bigger and easier to read'
      ],
      es: [
        'Novedades: cada actualización ahora te dice qué cambió',
        'Los interruptores de tema son iconos compactos — sin superposiciones',
        'Bóveda de dispositivos y menú de perfil restaurados',
        'La pantalla de inicio muestra la misma ciudad en un día gris nublado',
        'El escáner de DOSIS ahora sigue el tema claro',
        'La pantalla de péptidos en LAB es más grande y legible'
      ]
    }
  };

  function lang() {
    return (document.documentElement && document.documentElement.lang === 'es') ? 'es' : 'en';
  }

  function tx(key, fallback) {
    return (window.GN_I18N && window.GN_I18N.text) ? window.GN_I18N.text(key, fallback) : fallback;
  }

  function show() {
    var key = 'gn_whatsnew_seen_' + MARKER;
    try { if (localStorage.getItem(key)) return; } catch (_) { /* storage unavailable */ }
    var notes = (NOTES[MARKER] || {})[lang()] || [];
    if (!notes.length) return;

    var overlay = document.createElement('div');
    overlay.id = 'gnWhatsNewOverlay';
    overlay.className = 'gn-whatsnew-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', tx('whatsnew.title', 'WHAT\'S NEW'));
    var version = MARKER.replace('.', ' \u00b7 ');
    overlay.innerHTML =
      '<div class="gn-whatsnew-card">' +
        '<div class="gn-whatsnew-kicker">// ' + tx('whatsnew.title', 'WHAT\'S NEW') + '</div>' +
        '<div class="gn-whatsnew-version">RELEASE ' + version + '</div>' +
        '<ul class="gn-whatsnew-list">' + notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' +
        '<button type="button" class="gn-whatsnew-close">' + tx('whatsnew.gotIt', 'GOT IT') + '</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.classList.add('active');

    function dismiss() {
      overlay.classList.remove('active');
      overlay.remove();
      try { localStorage.setItem(key, '1'); } catch (_) { /* storage unavailable */ }
      // Suppress the legacy bundle whatsnew modal (bundle APP_VERSION 2.1.7)
      // so first-time users see one release note, not two.
      try { localStorage.setItem('gn_whatsnew_seen', '2.1.7'); } catch (_) { /* storage unavailable */ }
    }
    overlay.querySelector('.gn-whatsnew-close').addEventListener('click', dismiss);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) dismiss();
    });
  }

  function boot() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once: true });
    else show();
  }

  boot();
})();
