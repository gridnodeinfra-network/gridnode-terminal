/* GRID//NODE i18n core
 * Loads translation catalogs and exposes window.GN_I18N for use across the app.
 * Load this BEFORE gridnode-bundle.js so the bundle can call GN_I18N.t() during boot.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'gn.lang';
  const SUPPORTED = ['en', 'es'];
  const DEFAULT_LANG = 'en';

  const catalogs = {};
  let currentLang = DEFAULT_LANG;
  let missingKeys = [];
  let debugMode = false;

  function detectInitialLang() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.includes(stored)) return stored;
    } catch (_) { /* localStorage may be unavailable in private mode */ }
    /* v0.15.32 — fallback 1: sessionStorage */
    try {
      const s = sessionStorage.getItem(STORAGE_KEY);
      if (s && SUPPORTED.includes(s)) return s;
    } catch (_) {}
    /* v0.15.32 — fallback 2: cookie (works in private mode on Android Chrome
       where localStorage is per-tab). */
    try {
      const m = document.cookie && document.cookie.match(new RegExp('(?:^|;\\s*)' + STORAGE_KEY + '=([^;]+)'));
      if (m) {
        const c = decodeURIComponent(m[1]);
        if (SUPPORTED.includes(c)) return c;
      }
    } catch (_) {}
    /* v0.15.32 — fallback 3: already-set <html lang>. Critical when the
       bundle wrote document.documentElement.lang = lang synchronously
       before catalog load completed (prevents an init race that reset to
       navigator.language). */
    try {
      const docLang = (document.documentElement?.lang || '').toLowerCase().split('-')[0];
      if (SUPPORTED.includes(docLang)) return docLang;
    } catch (_) {}
    const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase().split('-')[0];
    if (SUPPORTED.includes(navLang)) return navLang;
    return DEFAULT_LANG;
  }

  async function loadCatalog(lang) {
    if (catalogs[lang]) return catalogs[lang];
    try {
      const file = lang == 'es' ? 'es-419.json' : `${lang}.json`;
      const res = await fetch(`./i18n/${file}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      catalogs[lang] = data;
      return data;
    } catch (err) {
      console.warn('[i18n] failed to load catalog', lang, err);
      catalogs[lang] = {};
      return catalogs[lang];
    }
  }

  function interpolate(template, vars) {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      const v = vars[key];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  function t(key, vars) {
    if (!key) return '';
    const cat = catalogs[currentLang] || {};
    let value = cat[key];
    if (value === undefined) {
      const fallback = catalogs[DEFAULT_LANG] || {};
      value = fallback[key];
      if (value === undefined) {
        if (debugMode || !missingKeys.includes(key)) missingKeys.push(key);
        return key;
      }
    }
    if (typeof value === 'object') value = value[0] || '';
    return interpolate(value, vars);
  }

  function text(key, fallback, vars) {
    const value = t(key, vars);
    return value === key ? (fallback || key) : value;
  }

  function plural(key, count, vars) {
    const cat = catalogs[currentLang] || {};
    let entry = cat[key] ?? catalogs[DEFAULT_LANG]?.[key];
    if (entry === undefined) return key;
    let template;
    if (typeof entry === 'object') {
      const isOne = Math.abs(count) === 1;
      template = (isOne ? entry.one : entry.other) || entry.other || entry.one || key;
    } else {
      template = entry;
    }
    return interpolate(template, { ...(vars || {}), count });
  }

  function formatDate(date, opts) {
    const d = date instanceof Date ? date : new Date(date);
    const locale = currentLang === 'es' ? 'es-419' : 'en-US';
    return new Intl.DateTimeFormat(locale, opts || { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
  }

  function formatTime(date, opts) {
    const d = date instanceof Date ? date : new Date(date);
    const locale = currentLang === 'es' ? 'es-419' : 'en-US';
    return new Intl.DateTimeFormat(locale, opts || { hour: 'numeric', minute: '2-digit' }).format(d);
  }

  function formatNumber(num, opts) {
    const locale = currentLang === 'es' ? 'es-419' : 'en-US';
    return new Intl.NumberFormat(locale, opts || {}).format(num);
  }

  function applyTo(root) {
    const doc = root || document;
    doc.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    doc.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
    doc.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) el.setAttribute('aria-label', t(key));
    });
    doc.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });
    doc.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = t(key);
    });
    const html = doc.documentElement || document.documentElement;
    if (html) html.setAttribute('lang', currentLang);
    doc.querySelectorAll('[data-lang-choice]').forEach(button => {
      const selected = button.getAttribute('data-lang-choice') === currentLang;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.classList.toggle('active', selected);
    });
  }

  async function setLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
    await loadCatalog(lang);
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
    /* v0.15.32 — write to sessionStorage AND document.cookie for cross-reload
       reliability. On Android Chrome, localStorage in private/incognito
       tabs CAN be wiped (memory pressure, tab discard). Writing to multiple
       stores ensures the lang choice survives an OS-level reload. The
       detectInitialLang path reads them in priority order. */
    try { sessionStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
    try { document.cookie = `${STORAGE_KEY}=${encodeURIComponent(lang)};path=/;max-age=31536000;samesite=lax`; } catch (_) {}
    document.documentElement.setAttribute('lang', lang);
    document.body && document.body.setAttribute('data-lang', lang);
    applyTo(document);
    document.dispatchEvent(new CustomEvent('gn:langchange', { detail: { lang } }));
    if (debugMode && missingKeys.length) console.warn('[i18n] missing keys:', Array.from(new Set(missingKeys)));
  }

  function getLang() { return currentLang; }
  function getSupported() { return SUPPORTED.slice(); }
  function isReady() { return !!(catalogs[currentLang] && Object.keys(catalogs[currentLang]).length); }

  let initPromise = null;

  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      debugMode = window.GN_I18N_DEBUG === true;
      const initial = detectInitialLang();
      await Promise.all([loadCatalog(initial), loadCatalog(DEFAULT_LANG)]);
      currentLang = initial;
      document.documentElement.setAttribute('lang', currentLang);
      if (document.body) {
        document.body.setAttribute('data-lang', currentLang);
      }
      if (debugMode) console.info('[i18n] initialized', { lang: currentLang });
    })();
    return initPromise;
  }

  const ready = init();

  window.GN_I18N = { init, ready, setLang, getLang, getSupported, t, text, plural, applyTo, isReady, formatDate, formatTime, formatNumber, SUPPORTED, DEFAULT_LANG };
})();
