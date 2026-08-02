(() => {
  'use strict';

  const STORAGE_KEY = 'gn_theme_v1';
  const LIGHT = 'light';
  const DARK = 'dark';
  const root = document.documentElement;

  function readPreference() {
    try { return localStorage.getItem(STORAGE_KEY) === LIGHT ? LIGHT : DARK; }
    catch (_) { return DARK; }
  }

  function text(key, fallback) {
    return window.GN_I18N?.text?.(key, fallback) || fallback;
  }

  function updateChrome(theme) {
    const light = theme === LIGHT;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = light ? '#e8e4da' : '#050508';
    root.style.colorScheme = light ? 'light' : 'dark';
  }

  function syncLangControls() {
    let lang = 'en';
    try { lang = localStorage.getItem('gn.lang') || 'en'; } catch (_) { /* storage unavailable */ }
    document.querySelectorAll('.gn-language-control [data-lang-choice]').forEach(button => {
      button.classList.toggle('active', button.dataset.langChoice === lang);
    });
  }

  // Icon-only insignias: ☾ (night) and ☀ (dusk). The theme identities live in
  // the aria labels so the control stays compact and never overlaps chrome.
  function createToggle(context) {
    const group = document.createElement('div');
    group.className = 'gn-theme-toggle' + (context === 'topbar' ? ' gn-theme-toggle-topbar' : '');
    group.dataset.themeToggle = '';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', text('theme.aria', 'THEME'));
    group.innerHTML =
      '<button type="button" class="gn-theme-opt" data-theme-opt="dark" aria-label="' + text('theme.nightFull', 'BLADE RUNNER 2099 — NIGHT') + '" title="' + text('theme.switchToDark', 'BLADE RUNNER 2099 — NIGHT') + '"><span class="gn-theme-opt-icon" aria-hidden="true">☾</span></button>' +
      '<button type="button" class="gn-theme-opt" data-theme-opt="light" aria-label="' + text('theme.daylightFull', 'BLADE RUNNER 2049 — DUSK') + '" title="' + text('theme.switchToLight', 'BLADE RUNNER 2049 — DUSK') + '"><span class="gn-theme-opt-icon" aria-hidden="true">☀</span></button>';
    return group;
  }

  function updateControls() {
    const light = root.dataset.theme === LIGHT;
    const current = light ? LIGHT : DARK;
    document.querySelectorAll('[data-theme-toggle]').forEach(group => {
      group.querySelectorAll('[data-theme-opt]').forEach(opt => {
        const active = opt.dataset.themeOpt === current;
        opt.classList.toggle('active', active);
        opt.setAttribute('aria-pressed', String(active));
      });
    });
  }

  function applyTheme(theme, persist = false) {
    const next = theme === LIGHT ? LIGHT : DARK;
    if (next === LIGHT) root.dataset.theme = LIGHT;
    else delete root.dataset.theme;
    updateChrome(next);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch (_) { /* storage unavailable */ }
    }
    updateControls();
    document.dispatchEvent(new CustomEvent('gn:themechange', { detail: { theme: next } }));
    return next;
  }

  function mountControls() {
    // Landing/auth: static .gn-theme-toggle-host elements get the control.
    document.querySelectorAll('.gn-theme-toggle-host').forEach(host => {
      if (!host.querySelector('[data-theme-toggle]')) host.appendChild(createToggle(host.classList.contains('gn-theme-toggle-host-topbar') ? 'topbar' : 'landing'));
    });
    // Topbar: compact icon-only theme toggle + compact language control, both
    // BEFORE the avatar but sized so the avatar always stays visible/tappable.
    const topbar = document.querySelector('#app .topbar-actions');
    if (topbar) {
      if (!topbar.querySelector('[data-theme-toggle]')) topbar.prepend(createToggle('topbar'));
      if (!topbar.querySelector('.gn-topbar-language-control')) {
        const langControl = document.createElement('div');
        langControl.className = 'gn-language-control gn-topbar-language-control';
        langControl.setAttribute('role', 'group');
        langControl.setAttribute('aria-label', 'EN | ES');
        langControl.innerHTML = '<button type="button" data-lang-choice="en" aria-label="English">EN</button><button type="button" data-lang-choice="es" aria-label="Español">ES</button>';
        topbar.prepend(langControl);
      }
    }
    updateControls();
    syncLangControls();
  }

  const initialTheme = readPreference();
  if (initialTheme === LIGHT) root.dataset.theme = LIGHT;
  updateChrome(initialTheme);

  document.addEventListener('click', event => {
    const opt = event.target.closest?.('[data-theme-opt]');
    if (!opt) return;
    const next = opt.dataset.themeOpt === LIGHT ? LIGHT : DARK;
    applyTheme(next, true);
  });
  document.addEventListener('gn:langchange', () => queueMicrotask(() => { updateControls(); syncLangControls(); }));
  document.addEventListener('DOMContentLoaded', mountControls, { once: true });

  new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.addedNodes.length)) mountControls();
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.GN_THEME = Object.freeze({
    get: () => root.dataset.theme === LIGHT ? LIGHT : DARK,
    set: theme => applyTheme(theme, true),
    toggle: () => applyTheme(root.dataset.theme === LIGHT ? DARK : LIGHT, true)
  });
})();
