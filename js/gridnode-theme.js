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

  function currentLang() {
    try { return localStorage.getItem('gn.lang') || 'en'; } catch (_) { return 'en'; }
  }
  function syncLangControls() {
    const lang = currentLang();
    document.querySelectorAll('.gn-language-control [data-lang-choice]').forEach(button => {
      button.classList.toggle('active', button.dataset.langChoice === lang);
    });
    document.querySelectorAll('.gn-lang-wrap').forEach(wrap => { wrap.dataset.lang = lang; });
    document.querySelectorAll('.gn-lang-globe').forEach(globe => {
      globe.classList.toggle('active', false);
      globe.setAttribute('aria-expanded', 'false');
      const open = document.querySelector('.gn-lang-dropdown.open');
      if (open && !open.closest('.gn-lang-wrap')) open.classList.remove('open');
    });
  }
  function makeLangControl(context) {
    const wrap = document.createElement('div');
    wrap.className = 'gn-lang-wrap gn-lang-wrap-' + (context === 'topbar' ? 'topbar' : 'landing');
    wrap.dataset.lang = currentLang();
    // R2.2 (2026-08-08): 2077 kanji language icon — 電 (den/diàn, electricity).
    // One character, colored by the ACTIVE language (EN=cyan, ES=Mars Red),
    // glow blends into the topbar. Replaces the generic globe entirely.
    wrap.innerHTML =
      '<button type="button" class="gn-lang-globe" aria-label="Language" title="Language" aria-haspopup="true" aria-expanded="false"><svg class="gn-lang-kanji" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><text x="12" y="17.5" text-anchor="middle" font-family="Noto Sans JP, Hiragino Sans, Yu Gothic, PingFang SC, Microsoft YaHei, sans-serif" font-size="16" stroke="currentColor" stroke-width="2" fill="none">電</text></svg></button>' +
      '<div class="gn-lang-dropdown" role="menu"><button type="button" data-lang-choice="en" role="menuitem">English</button><button type="button" data-lang-choice="es" role="menuitem">Español</button></div>';
    const globe = wrap.querySelector('.gn-lang-globe');
    globe.addEventListener('click', event => {
      event.stopPropagation();
      const open = wrap.querySelector('.gn-lang-dropdown');
      const wasOpen = open.classList.contains('open');
      document.querySelectorAll('.gn-lang-dropdown.open').forEach(d => d.classList.remove('open'));
      if (!wasOpen) open.classList.add('open');
      globe.setAttribute('aria-expanded', String(!wasOpen));
    });
    wrap.querySelectorAll('[data-lang-choice]').forEach(button => {
      button.addEventListener('click', () => {
        const lang = button.dataset.langChoice;
        try { localStorage.setItem('gn.lang', lang); } catch (_) {}
        document.documentElement.lang = lang;
        document.dispatchEvent(new CustomEvent('gn:langchange', { detail: { lang } }));
        document.querySelectorAll('.gn-lang-dropdown.open').forEach(d => d.classList.remove('open'));
        globe.setAttribute('aria-expanded', 'false');
        syncLangControls();
      });
    });
    document.addEventListener('click', event => {
      if (!wrap.contains(event.target)) wrap.querySelector('.gn-lang-dropdown')?.classList.remove('open');
    });
    return wrap;
  }

  // Custom brand SVG icons (R2.1): NIGHT = tall LA-style tower with lit
  // windows (cyan + Mars accents); DUSK = flat city skyline (cyan). The
  // identities live in the aria labels; icons stay 16-20px, no glyphs/emoji.
  var THEME_NIGHT_SVG = '<svg class="gn-theme-svg gn-theme-svg-night" viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true"><rect x="9" y="3" width="6" height="18" rx="1" fill="currentColor" opacity=".55"/><rect x="7" y="14" width="2" height="7" fill="currentColor" opacity=".3"/><rect x="15" y="11" width="2" height="10" fill="currentColor" opacity=".3"/><rect x="11" y="5" width="2" height="2" fill="#FF3B3B"/><rect x="9" y="9" width="2" height="2" fill="#FF3B3B" opacity=".7"/><rect x="13" y="14" width="2" height="2" fill="currentColor" opacity=".85"/><path d="M2 21h20" stroke="currentColor" stroke-width="1.4" opacity=".5"/></svg>';
  var THEME_DUSK_SVG = '<svg class="gn-theme-svg gn-theme-svg-dusk" viewBox="0 0 24 24" width="18" height="17" fill="none" aria-hidden="true"><path d="M2 20h20M4 17V11h3v6M9 17V8h3v9M14 17V6h3v11M19 17V10h2v7" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="5" r="2" fill="currentColor" opacity=".8"/></svg>';
  function createToggle(context) {
    const group = document.createElement('div');
    group.className = 'gn-theme-toggle' + (context === 'topbar' ? ' gn-theme-toggle-topbar' : '');
    group.dataset.themeToggle = '';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', text('theme.aria', 'THEME'));
    group.innerHTML =
      '<button type="button" class="gn-theme-opt" data-theme-opt="dark" aria-label="' + text('theme.nightFull', 'BLADE RUNNER 2099 — NIGHT') + '" title="' + text('theme.switchToDark', 'BLADE RUNNER 2099 — NIGHT') + '">' + THEME_NIGHT_SVG + '</button>' +
      '<button type="button" class="gn-theme-opt" data-theme-opt="light" aria-label="' + text('theme.daylightFull', 'BLADE RUNNER 2049 — DUSK') + '" title="' + text('theme.switchToLight', 'BLADE RUNNER 2049 — DUSK') + '">' + THEME_DUSK_SVG + '</button>';
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
    // Landing language: globe mount (R2 — icon only, no EN/ES text).
    document.querySelectorAll('[data-landing-lang]').forEach(mount => {
      if (!mount.querySelector('.gn-lang-globe')) mount.appendChild(makeLangControl('landing'));
    });
    // Topbar: compact icon-only theme toggle + compact language control, both
    // BEFORE the avatar but sized so the avatar always stays visible/tappable.
    const topbar = document.querySelector('#app .topbar-actions');
    if (topbar) {
      if (!topbar.querySelector('[data-theme-toggle]')) topbar.prepend(createToggle('topbar'));
      if (!topbar.querySelector('.gn-lang-wrap')) {
        topbar.prepend(makeLangControl('topbar'));
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
