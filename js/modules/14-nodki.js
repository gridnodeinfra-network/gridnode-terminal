/* GRID//NODE — NODKI companion (1.3.0).
 * A contextual, static-by-default voice for systems that already work.
 * Design law (Mission 13 + Specs A/B, 2026-10-17): narrate app state
 * only — never medical advice, never guilt, never interruption. The
 * card recomputes on real state changes (boot, navigation, a saved
 * record, a settings flip) and on user taps. Every line renders with
 * an expression from its approved pairing (15-nodki-library.js
 * PAIRING MAP); consecutive appearances on this surface never repeat
 * the same expression when an approved alternate exists (persisted in
 * gn_nodki_expr_v1). Proactive appearances share one session budget
 * (<=2: state narration + celebrations + ambient tips), owned here and
 * spent by 16-nodki-ambient through GN_NODKI.budget. The user can fire
 * him completely from the VAULT (gn_nodki_v1) and it sticks. */
(function () {
  'use strict';
  var KEY = 'gn_nodki_v1';
  var SEEN_KEY = 'gn_nodki_milestones_seen';
  var EXPR_KEY = 'gn_nodki_expr_v1';
  var BUDGET_KEY = 'gn_nodki_budget_v1';
  var MILESTONES = [7, 25, 50, 100, 200, 365, 500, 1000];
  var FALLBACK_ASSETS = {
    welcome: 'assets/mascot/nodki-pose-welcome.webp',
    neutral: 'assets/mascot/nodki-pose-neutral.webp',
    approve: 'assets/mascot/nodki-pose-approve.webp',
    celebrate: 'assets/mascot/nodki-pose-celebrate.webp',
    tablet: 'assets/mascot/nodki-pose-tablet.webp',
    analyze: 'assets/mascot/nodki-pose-analyze.webp',
    default: 'assets/mascot/nodki-expr-default.webp',
    happy: 'assets/mascot/nodki-expr-happy.webp',
    focused: 'assets/mascot/nodki-expr-focused.webp',
    cheeky: 'assets/mascot/nodki-expr-cheeky.webp',
    thinking: 'assets/mascot/nodki-expr-thinking.webp',
    concerned: 'assets/mascot/nodki-expr-concerned.webp'
  };
  var FALLBACK_STATE_EXPR = {
    firstRun: { expr: 'welcome', alts: [] },
    loggedToday: { expr: 'approve', alts: ['happy'] },
    returning: { expr: 'default', alts: ['neutral'] },
    dueToday: { expr: 'focused', alts: ['default'] },
    afterLog: { expr: 'celebrate', alts: ['happy'] },
    milestone: { expr: 'celebrate', alts: ['happy'] },
    tablet: { expr: 'tablet', alts: ['thinking'] }
  };
  var state = { expr: null, tipIdx: 0, revertTimer: 0, ctaMode: 'log', ambientCbs: null, ambientShownAt: 0 };

  function lib() { return window.GN_NODKI_LIBRARY || null; }
  function exprAssets() { var l = lib(); return (l && l.exprAssets) || FALLBACK_ASSETS; }
  function stateExpr(name) { var l = lib(); return (l && l.stateExpr && l.stateExpr[name]) || FALLBACK_STATE_EXPR[name] || { expr: 'default', alts: [] }; }

  function enabled() {
    try { return localStorage.getItem(KEY) !== 'off'; } catch (_) { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (_) {}
    try { document.dispatchEvent(new CustomEvent('gn:nodki-setting', { detail: { on: on } })); } catch (_) {}
    render();
  }
  function tx(key, vars, fallback) {
    try {
      if (window.GN_I18N && typeof window.GN_I18N.t === 'function') {
        var v = window.GN_I18N.t(key, vars || {});
        if (v && v !== key) return v;
      }
    } catch (_) {}
    var s = fallback || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', String(vars[k])); });
    return s;
  }
  function lang() {
    try { return (window.GN_I18N && (window.GN_I18N.lang || window.GN_I18N.language)) || document.documentElement.lang || 'en'; } catch (_) { return 'en'; }
  }
  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  }
  function shots() {
    try { return typeof window.getAllShots === 'function' ? window.getAllShots() || [] : []; } catch (_) { return []; }
  }
  function dayKey(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function dayName(iso) {
    try {
      var d = new Date(iso);
      return new Intl.DateTimeFormat(lang(), { weekday: 'short' }).format(d);
    } catch (_) { return ''; }
  }

  /* ---------------- shared proactive budget (Spec B) ---------------- */
  function budget() {
    try { return JSON.parse(sessionStorage.getItem(BUDGET_KEY) || 'null') || { count: 0, narrated: false, ambient: 0 }; }
    catch (_) { return { count: 0, narrated: false, ambient: 0 }; }
  }
  function saveBudget(b) { try { sessionStorage.setItem(BUDGET_KEY, JSON.stringify(b)); } catch (_) {} }
  var GN_BUDGET = {
    canProactive: function () { return budget().count < 2; },
    canAmbient: function () { var b = budget(); return b.count < 2 && b.ambient < 1; },
    spendNarration: function () { var b = budget(); if (!b.narrated) { b.narrated = true; b.count += 1; saveBudget(b); } },
    spendProactive: function () { var b = budget(); b.count += 1; saveBudget(b); },
    spendAmbient: function () { var b = budget(); b.count += 1; b.ambient += 1; saveBudget(b); }
  };

  /* ---------------- expression pairing + anti-repetition ------------ */
  function lastExpr(surface) {
    try { return (JSON.parse(localStorage.getItem(EXPR_KEY) || '{}') || {})[surface] || null; } catch (_) { return null; }
  }
  function saveExpr(surface, expr) {
    try {
      var m = JSON.parse(localStorage.getItem(EXPR_KEY) || '{}') || {};
      m[surface] = expr;
      localStorage.setItem(EXPR_KEY, JSON.stringify(m));
    } catch (_) {}
  }
  function pickExpr(primary, alts, surface) {
    var last = lastExpr(surface || 'card');
    var chosen = primary;
    if (last === primary && alts && alts.length) {
      for (var i = 0; i < alts.length; i++) { if (alts[i] !== last) { chosen = alts[i]; break; } }
    }
    saveExpr(surface || 'card', chosen);
    return chosen;
  }

  function computeState() {
    var all = shots();
    if (!all.length) return { name: 'firstRun', key: 'nodki.firstRun', vars: {}, cta: true };
    var sorted = all.slice().sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    var last = sorted[sorted.length - 1];
    var lastD = new Date(last.date);
    var now = new Date();
    if (dayKey(lastD) === dayKey(now)) return { name: 'loggedToday', key: 'nodki.loggedToday', vars: {}, cta: false };
    var gapDays = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(lastD.getFullYear(), lastD.getMonth(), lastD.getDate())) / 864e5);
    if (gapDays >= 3) return { name: 'returning', key: 'nodki.returning', vars: { day: dayName(last.date) }, cta: false };
    return { name: 'dueToday', key: 'nodki.dueToday', vars: { day: dayName(last.date) }, cta: false };
  }
  function els() {
    return {
      card: document.getElementById('gnNodkiCard'),
      img: document.getElementById('gnNodkiImg'),
      line: document.getElementById('gnNodkiLine'),
      cta: document.getElementById('gnNodkiCta'),
      kicker: document.getElementById('gnNodkiKicker'),
      dismiss: document.getElementById('gnNodkiDismiss'),
      more: document.getElementById('gnNodkiMore')
    };
  }
  function applyExpr(expr) {
    var e = els(); var assets = exprAssets();
    if (e.img && assets[expr] && e.img.getAttribute('src') !== assets[expr]) {
      e.img.setAttribute('src', assets[expr]);
    }
    state.expr = expr;
  }
  function setKicker(text) { var e = els(); if (e.kicker) e.kicker.textContent = text; }
  function render() {
    var e = els(); if (!e.card) return;
    if (!enabled()) { e.card.hidden = true; return; }
    e.card.hidden = false;
    state.ctaMode = 'log'; state.ambientCbs = null;
    if (e.dismiss) e.dismiss.hidden = true;
    if (e.more) { var ambOn = false; try { ambOn = !!(window.GN_NODKI_AMBIENT && window.GN_NODKI_AMBIENT.state.active()); } catch (_) {} e.more.hidden = !ambOn; }
    setKicker(tx('nodki.kicker', null, 'NODKI // GRID OPERATOR'));
    // Spec A continuity / guide-exit / resume re-offer lines outrank
    // plain state narration (decided by the ambient module).
    var amb = window.GN_NODKI_AMBIENT;
    var ov = null;
    try { ov = amb && amb.cardOverride ? amb.cardOverride() : null; } catch (_) { ov = null; }
    GN_BUDGET.spendNarration();
    if (ov) {
      var pair = { expr: ov.expr, alts: ov.alts || [] };
      applyExpr(pickExpr(pair.expr, pair.alts, 'card'));
      if (e.line) e.line.textContent = tx(ov.key, ov.vars || {}, ov.fallback || '');
      if (e.cta) {
        if (ov.cta === 'resume') { state.ctaMode = 'resume'; e.cta.hidden = false; e.cta.textContent = tx('nodki.host.resumeCta', null, 'RESUME'); }
        else e.cta.hidden = true;
      }
      return;
    }
    var s = computeState();
    var p = stateExpr(s.name);
    applyExpr(pickExpr(p.expr, p.alts, 'card'));
    if (e.line) e.line.textContent = tx(s.key, s.vars, '');
    if (e.cta) { e.cta.hidden = !s.cta; if (s.cta) e.cta.textContent = tx('nodki.firstCta', null, 'LOG YOUR FIRST SHOT'); }
  }
  function flash(pairName, key, vars, ms) {
    var e = els(); if (!e.card || !enabled()) return;
    if (!GN_BUDGET.canProactive()) { render(); return; } // budget spent: narration outranks
    GN_BUDGET.spendProactive();
    var p = stateExpr(pairName);
    applyExpr(pickExpr(p.expr, p.alts, 'card'));
    setKicker(tx('nodki.kicker', null, 'NODKI // GRID OPERATOR'));
    if (e.dismiss) e.dismiss.hidden = true;
    state.ctaMode = 'log'; state.ambientCbs = null;
    if (e.line) e.line.textContent = tx(key, vars, '');
    if (e.cta) e.cta.hidden = true;
    if (!reducedMotion() && e.card) {
      e.card.classList.remove('gn-nodki-pop');
      void e.card.offsetWidth;
      e.card.classList.add('gn-nodki-pop');
    }
    try { window.GN_HAPTICS && window.GN_HAPTICS.fire(pairName === 'milestone' || pairName === 'afterLog' ? 'confirm' : 'tick'); } catch (_) {}
    clearTimeout(state.revertTimer);
    state.revertTimer = setTimeout(render, ms || 5200);
  }
  /* Ambient surface API: 16-nodki-ambient renders library lines here.
   * Returns false when the surface is unavailable (mascot off). */
  function showAmbient(spec, cbs) {
    var e = els(); if (!e.card || !enabled()) return false;
    e.card.hidden = false;
    clearTimeout(state.revertTimer);
    applyExpr(pickExpr(spec.expr, spec.alts || [], 'card'));
    setKicker(spec.label || tx('nodki.kicker', null, 'NODKI // GRID OPERATOR'));
    if (e.line) e.line.textContent = spec.text || '';
    state.ambientCbs = cbs || null;
    state.ambientShownAt = Date.now();
    state.ctaMode = 'ambient';
    if (e.dismiss) e.dismiss.hidden = false;
    if (e.cta) {
      if (spec.cta) { e.cta.hidden = false; e.cta.textContent = spec.cta; }
      else e.cta.hidden = true;
    }
    return true;
  }
  function dismissAmbient() {
    var cbs = state.ambientCbs;
    var dwell = Date.now() - (state.ambientShownAt || Date.now());
    state.ambientCbs = null;
    if (cbs && cbs.onDismiss) { try { cbs.onDismiss(dwell); } catch (_) {} }
    render();
  }

  function milestoneCrossed(prev, now) {
    var seen = [];
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (_) {}
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (prev < m && now >= m && seen.indexOf(m) < 0) {
        seen.push(m);
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (_) {}
        return m;
      }
    }
    return 0;
  }
  document.addEventListener('gn:shot-saved', function (ev) {
    if (!enabled()) return;
    var now = shots().length;
    var prev = Math.max(0, now - 1);
    var m = milestoneCrossed(prev, now);
    if (m) { flash('milestone', 'nodki.milestone', { n: m }, 7000); return; }
    var rec = (ev && ev.detail && ev.detail.record) || {};
    if (rec.site) flash('afterLog', 'nodki.afterLog', { site: rec.site }, 5200);
    else flash('afterLog', 'nodki.afterLogPlain', {}, 5200);
  });
  document.addEventListener('gn:nodki-setting', render);
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest('#navDash')) setTimeout(render, 420);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  window.GN_NODKI = {
    enabled: enabled, setEnabled: setEnabled, render: render,
    budget: GN_BUDGET, pickExpr: pickExpr, showAmbient: showAmbient,
    dismissAmbient: dismissAmbient, stateExpr: stateExpr
  };
  window.gnNodkiTap = function () {
    if (!enabled()) return;
    var amb = window.GN_NODKI_AMBIENT;
    if (amb && amb.pull) { amb.pull(); return; }
    var tips = ['nodki.tip1', 'nodki.tip2', 'nodki.tip3', 'nodki.tip4'];
    var key = tips[state.tipIdx % tips.length]; state.tipIdx += 1;
    flash('tablet', key, {}, 6000);
  };
  window.gnNodkiCta = function () {
    if (state.ctaMode === 'resume') {
      try { if (window.GN_ONBOARDING && window.GN_ONBOARDING.resume) window.GN_ONBOARDING.resume(); } catch (_) {}
      return;
    }
    if (state.ctaMode === 'ambient' && state.ambientCbs && state.ambientCbs.onCta) {
      var cbs = state.ambientCbs; state.ambientCbs = null;
      try { cbs.onCta(); } catch (_) {}
      setTimeout(render, 350);
      return;
    }
    try { if (typeof window.handleShotFab === 'function') window.handleShotFab(); } catch (_) {}
  };
  window.gnNodkiDismiss = function () { dismissAmbient(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
  setTimeout(render, 1600); // after boot hydration settles; a render is idempotent and cheap
})();
