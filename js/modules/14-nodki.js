/* GRID//NODE — NODKI companion (v1.3.0 prototype).
 * A contextual, static-by-default voice for systems that already work.
 * Design law (research synthesis, 2026-10-17): narrate app state only —
 * never medical advice, never guilt, never interruption. No timers, no
 * polling, no proactive appearances: the card recomputes on real state
 * changes (boot, navigation, a saved record, a settings flip) and on
 * user taps. Animation is one-shot transform/opacity, disabled under
 * prefers-reduced-motion. The user can fire him completely from the
 * VAULT (gn_nodki_v1) and the setting is sticky. */
(function () {
  'use strict';
  var KEY = 'gn_nodki_v1';
  var SEEN_KEY = 'gn_nodki_milestones_seen';
  var MILESTONES = [7, 25, 50, 100, 200, 365, 500, 1000];
  var POSES = {
    welcome: 'assets/mascot/nodki-pose-welcome.webp',
    neutral: 'assets/mascot/nodki-pose-neutral.webp',
    approve: 'assets/mascot/nodki-pose-approve.webp',
    celebrate: 'assets/mascot/nodki-pose-celebrate.webp',
    tablet: 'assets/mascot/nodki-pose-tablet.webp'
  };
  var state = { pose: null, tipIdx: 0, revertTimer: 0 };

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
  function computeState() {
    var all = shots();
    if (!all.length) return { pose: 'welcome', key: 'nodki.firstRun', vars: {}, cta: true };
    var sorted = all.slice().sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    var last = sorted[sorted.length - 1];
    var lastD = new Date(last.date);
    var now = new Date();
    if (dayKey(lastD) === dayKey(now)) return { pose: 'approve', key: 'nodki.loggedToday', vars: {}, cta: false };
    var gapDays = Math.floor((dayKey(now) - dayKey(lastD)) / 1); // calendar-day difference via key math below
    gapDays = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(lastD.getFullYear(), lastD.getMonth(), lastD.getDate())) / 864e5);
    if (gapDays >= 3) return { pose: 'neutral', key: 'nodki.returning', vars: { day: dayName(last.date) }, cta: false };
    return { pose: 'neutral', key: 'nodki.dueToday', vars: { day: dayName(last.date) }, cta: false };
  }
  function els() {
    return {
      card: document.getElementById('gnNodkiCard'),
      img: document.getElementById('gnNodkiImg'),
      line: document.getElementById('gnNodkiLine'),
      cta: document.getElementById('gnNodkiCta')
    };
  }
  function applyPose(pose) {
    var e = els(); if (!e.img || state.pose === pose) { if (e.img) state.pose = pose; }
    if (e.img && POSES[pose] && e.img.getAttribute('src') !== POSES[pose]) {
      e.img.setAttribute('src', POSES[pose]);
    }
    state.pose = pose;
  }
  function render() {
    var e = els(); if (!e.card) return;
    if (!enabled()) { e.card.hidden = true; return; }
    e.card.hidden = false;
    var s = computeState();
    applyPose(s.pose);
    if (e.line) e.line.textContent = tx(s.key, s.vars, '');
    if (e.cta) e.cta.hidden = !s.cta;
  }
  function flash(pose, key, vars, ms) {
    var e = els(); if (!e.card || !enabled()) return;
    applyPose(pose);
    if (e.line) e.line.textContent = tx(key, vars, '');
    if (e.cta) e.cta.hidden = true;
    if (!reducedMotion() && e.card) {
      e.card.classList.remove('gn-nodki-pop');
      void e.card.offsetWidth;
      e.card.classList.add('gn-nodki-pop');
    }
    try { window.GN_HAPTICS && window.GN_HAPTICS.fire(pose === 'celebrate' ? 'confirm' : 'tick'); } catch (_) {}
    clearTimeout(state.revertTimer);
    state.revertTimer = setTimeout(render, ms || 5200);
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
    if (m) { flash('celebrate', 'nodki.milestone', { n: m }, 7000); return; }
    var rec = (ev && ev.detail && ev.detail.record) || {};
    if (rec.site) flash('celebrate', 'nodki.afterLog', { site: rec.site }, 5200);
    else flash('celebrate', 'nodki.afterLogPlain', {}, 5200);
  });
  document.addEventListener('gn:nodki-setting', render);
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest('#navDash')) setTimeout(render, 420);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  window.GN_NODKI = { enabled: enabled, setEnabled: setEnabled, render: render };
  window.gnNodkiTap = function () {
    if (!enabled()) return;
    var tips = ['nodki.tip1', 'nodki.tip2', 'nodki.tip3', 'nodki.tip4'];
    var key = tips[state.tipIdx % tips.length]; state.tipIdx += 1;
    flash(state.pose === 'celebrate' ? 'celebrate' : 'tablet', key, {}, 6000);
  };
  window.gnNodkiCta = function () {
    try { if (typeof window.handleShotFab === 'function') window.handleShotFab(); } catch (_) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
  setTimeout(render, 1600); // after boot hydration settles; a render is idempotent and cheap
})();
