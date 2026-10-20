/* GRID//NODE — NODKI ambient layer (Spec B, 1.3.0).
 * Tips (TIP) and facts (FIELD NOTE) from the finite library in
 * 15-nodki-library.js. One proactive surface only: the dashboard
 * companion card slot. Everything else is pull (tap his face / More),
 * empty states, or a static line on a genuine wait. Caps, cooldowns,
 * self-throttle, and kill metrics per Spec B; the shared proactive
 * budget (<=2/session, state narration outranks tips) is owned by
 * 14-nodki and spent through GN_NODKI.budget. No polling: triggers are
 * real events (dashboard arrival, completed app events, one resettable
 * idle timeout scoped to the dashboard, user taps). */
(function () {
  'use strict';
  var TIPS_KEY = 'gn_nodki_tips_v1';        // {enabled, freq: normal|quiet|pull}
  var SEEN_KEY = 'gn_nodki_tips_seen_v1';   // {id: {shown, last, dismissed, fast, ignored, acted, banned}}
  var METRICS_KEY = 'gn_nodki_metrics_v1'; // {events: [{t, fast}]} rolling, last 200
  var THROTTLE_KEY = 'gn_nodki_throttle_v1';// {until}
  var EVENTS_KEY = 'gn_nodki_events_v1';   // {firstExport, firstScanner, importDone} (persisted flags)
  var PENDING_KEY = 'gn_nodki_pending_v1';  // queued event line ids for next dashboard arrival
  var SESS_COUNT_KEY = 'gn_nodki_sessions_v1';
  var FIRST_KEY = 'gn_nodki_first_v1';
  var OFFER_KEY = 'gn_nodki_resume_offered_v1';
  var DAY = 864e5;

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) {} }
  function jGet(k, dflt) { try { var v = JSON.parse(lsGet(k) || 'null'); return v == null ? dflt : v; } catch (e) { return dflt; } }
  function jSet(k, v) { lsSet(k, JSON.stringify(v)); }
  function tx(key, vars, fallback) {
    try {
      if (window.GN_I18N && typeof window.GN_I18N.t === 'function') {
        var v = window.GN_I18N.t(key, vars || {});
        if (v && v !== key) return v;
      }
    } catch (e) {}
    var s = fallback || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }
  function lang() {
    try { return (document.documentElement.lang || 'en').indexOf('es') === 0 ? 'es' : 'en'; } catch (e) { return 'en'; }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------- settings ---------------- */
  function settings() {
    var s = jGet(TIPS_KEY, null);
    if (!s || typeof s !== 'object') s = { enabled: true, freq: 'normal' };
    if (typeof s.enabled !== 'boolean') s.enabled = true;
    if (['normal', 'quiet', 'pull'].indexOf(s.freq) < 0) s.freq = 'normal';
    return s;
  }
  function saveSettings(s) { jSet(TIPS_KEY, s); try { document.dispatchEvent(new CustomEvent('gn:nodki-tips-setting')); } catch (e) {} renderPanel(); }
  function mascotOn() { try { return window.GN_NODKI && window.GN_NODKI.enabled(); } catch (e) { return lsGet('gn_nodki_v1') !== 'off'; } }
  function tipsOn() { return settings().enabled; }
  function active() { return mascotOn() && tipsOn(); }

  /* ---------------- session / tenure ---------------- */
  (function sessionInit() {
    if (!ssGet('gn_nodki_sess_v1')) {
      ssSet('gn_nodki_sess_v1', '1');
      var n = parseInt(lsGet(SESS_COUNT_KEY) || '0', 10) || 0;
      lsSet(SESS_COUNT_KEY, String(n + 1));
    }
    if (!lsGet(FIRST_KEY)) lsSet(FIRST_KEY, String(Date.now()));
  })();
  function sessionCount() { return parseInt(lsGet(SESS_COUNT_KEY) || '1', 10) || 1; }
  function tenureDays() { var f = parseInt(lsGet(FIRST_KEY) || String(Date.now()), 10); return Math.floor((Date.now() - f) / DAY); }

  /* ---------------- user state predicates ---------------- */
  function shots() { try { return typeof window.getAllShots === 'function' ? window.getAllShots() || [] : []; } catch (e) { return []; } }
  function gapDays() {
    var all = shots(); if (!all.length) return 999;
    var sorted = all.slice().sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    var last = new Date(sorted[sorted.length - 1].date);
    var now = new Date();
    return Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(last.getFullYear(), last.getMonth(), last.getDate())) / DAY);
  }
  function isCloud() {
    try { var s = JSON.parse(lsGet('gn_session_v2') || 'null'); return !!(s && s.user && s.user.id && s.type !== 'local'); } catch (e) { return false; }
  }
  var PRED = {
    any: function () { return true; },
    firstrun: function () { return shots().length === 0; },
    hasShots: function () { return shots().length > 0; },
    fewShots: function () { var n = shots().length; return n >= 1 && n <= 9; },
    manyShots: function () { return shots().length >= 10; },
    due: function () { var g = gapDays(); return shots().length > 0 && g >= 1 && g < 3; },
    loggedToday: function () { return gapDays() === 0 && shots().length > 0; },
    returning: function () { var g = gapDays(); return shots().length > 0 && g >= 3; },
    stale7: function () { return gapDays() >= 7 && shots().length > 0; },
    localOnly: function () { return !isCloud(); }
  };
  function stateOk(line) {
    var req = line.requires || ['any'];
    for (var i = 0; i < req.length; i++) { var p = PRED[req[i]]; if (!p || !p()) return false; }
    return true;
  }

  /* ---------------- history / metrics / kill rules ---------------- */
  function seen() { return jGet(SEEN_KEY, {}); }
  function saveSeen(s) { jSet(SEEN_KEY, s); }
  function lineStats(id) { var s = seen(); return s[id] || { shown: 0, last: 0, dismissed: 0, fast: 0, ignored: 0, acted: false, banned: false }; }
  function metrics() { return jGet(METRICS_KEY, { events: [] }); }
  function logMetric(fast) {
    var m = metrics(); m.events.push({ t: Date.now(), fast: !!fast });
    if (m.events.length > 200) m.events = m.events.slice(-200);
    jSet(METRICS_KEY, m);
  }
  function globalFactor() {
    var m = metrics(); var cut = Date.now() - 7 * DAY;
    var ev = m.events.filter(function (e) { return e.t >= cut; });
    if (ev.length < 10) return 1;
    var fast = ev.filter(function (e) { return e.fast; }).length / ev.length;
    if (fast > 0.40) return 0;
    if (fast > 0.25) return 0.5;
    return 1;
  }
  function throttled() { var u = parseInt(lsGet(THROTTLE_KEY) || '0', 10); return u && Date.now() < u; }
  var fastStreak = 0; // consecutive sub-1s dismissals (this install, persisted via seen log below)
  function noteDismiss(id, dwellMs) {
    var s = seen(); var st = s[id] || { shown: 0, last: 0, dismissed: 0, fast: 0, ignored: 0, acted: false, banned: false };
    st.dismissed += 1;
    var fast = dwellMs < 1000;
    if (fast) st.fast += 1;
    s[id] = st; saveSeen(s);
    logMetric(fast);
    var m = metrics();
    var recent = m.events.slice(-2);
    if (recent.length === 2 && recent[0].fast && recent[1].fast) {
      lsSet(THROTTLE_KEY, String(Date.now() + 14 * DAY)); // silent self-throttle to pull-only
    }
  }
  function noteShow(id) {
    var s = seen(); var st = s[id] || { shown: 0, last: 0, dismissed: 0, fast: 0, ignored: 0, acted: false, banned: false };
    st.shown += 1; st.last = Date.now(); s[id] = st; saveSeen(s);
  }
  function noteIgnore(id) {
    var s = seen(); var st = s[id]; if (!st) return;
    st.ignored += 1; s[id] = st; saveSeen(s);
  }
  function benched(id) {
    var st = lineStats(id);
    if (st.banned) return true;
    if (st.shown >= 50 && st.fast / st.shown > 0.35) return true;  // fast-dismiss bench
    if (st.shown >= 20 && st.ignored / st.shown > 0.70) return true; // blindness retire (proxy denominator)
    return false;
  }

  /* ---------------- eligibility + picking ---------------- */
  function onboardingQuiet() {
    var doneAt = parseInt(lsGet('gn_nodki_ob_done_at') || '0', 10);
    return doneAt && (Date.now() - doneAt) < DAY; // none within 24h of onboarding end/skip
  }
  function shownLast7d() {
    var s = seen(); var cut = Date.now() - 7 * DAY; var n = 0;
    Object.keys(s).forEach(function (id) { if (s[id].last >= cut) n += 1; });
    return n;
  }
  function freqMode() {
    var s = settings();
    if (throttled()) return 'pull';
    if (globalFactor() === 0) return 'pull';
    return s.freq;
  }
  function proactiveAllowed(line, surface) {
    if (!active()) return false;
    if ((line.tenure || 0) > tenureDays()) return false;
    if (line.expires && Date.now() > Date.parse(line.expires)) return false;
    if (benched(line.id)) return false;
    if (surface !== 'pull') {
      /* Proactive-only gates. These two used to run for EVERY surface,
       * pull included, which silently deadened MORE FROM NODKI / the
       * face tap for exactly the users most likely to try it: anyone
       * in their first session or within 24h of finishing onboarding
       * (tap landed, handler ran, zero eligible lines, nothing moved).
       * Spec B: pull is user-initiated and uncapped — frequency gates
       * govern what NODKI volunteers, never what the user asks for.
       * Content eligibility above (tenure, expiry, bench, state) still
       * applies to pull: it decides WHICH lines exist for this user. */
      if (sessionCount() <= 1) return false;                  // none in the user's first session
      if (onboardingQuiet()) return false;                    // 24h post-onboarding quiet
      var mode = freqMode();
      if (mode === 'pull') return false;
      if (mode === 'quiet' && line.trigger.type !== 'state') return false;
      var cap = globalFactor() === 0.5 ? 1 : 3;
      if (shownLast7d() >= cap) return false;                 // <=3 per rolling 7 days
      if (!window.GN_NODKI || !window.GN_NODKI.budget || !window.GN_NODKI.budget.canAmbient()) return false;
      var st = lineStats(line.id);
      var nowMs = Date.now();
      if (line.once) {
        // once-ever until acted on, or 90 days pass (Spec B)
        if (st.acted) { if (st.last && nowMs - st.last < (line.cooldown || 30) * DAY) return false; }
        else if (st.shown > 0 && nowMs - st.last < 90 * DAY) return false;
      } else if (st.last && nowMs - st.last < (line.cooldown || 30) * DAY) return false;
      if (line.cat === 'fact' && st.last && nowMs - st.last < 90 * DAY) return false; // facts: no repeat in 90d
      // 48h per-category (kind) cooldown
      var s = seen(); var cut = Date.now() - 2 * DAY;
      var lib = window.GN_NODKI_LIBRARY;
      for (var id in s) {
        if (!Object.prototype.hasOwnProperty.call(s, id)) continue;
        var other = lib.byId(id);
        if (other && other.kind === line.kind && s[id].last >= cut && id !== line.id) return false;
      }
    }
    return true;
  }
  function pickLine(want) {
    var lib = window.GN_NODKI_LIBRARY; if (!lib) return null;
    var mode = freqMode();
    var cands = lib.lines.filter(function (l) {
      if (want.cat && l.cat !== want.cat) return false;
      if (want.eventKey) return l.trigger.type === 'event' && l.trigger.key === want.eventKey;
      if (want.pull) return l.surfaces.indexOf('pull') >= 0 && stateOk(l);
      if (l.trigger.type === 'event') return false;
      if (want.idle) return l.trigger.type === 'idle' && stateOk(l);
      return l.trigger.type === 'state' && stateOk(l);
    });
    cands = cands.filter(function (l) { return proactiveAllowed(l, want.pull ? 'pull' : 'card'); });
    if (!cands.length) return null;
    if (want.pull) {
      // Pull rotates: never repeat the line on screen when an approved
      // alternative exists; least-recently-shown first.
      var fresh = cands.filter(function (l) { return !currentShow || l.id !== currentShow.id; });
      if (fresh.length) cands = fresh;
      cands.sort(function (a, b) {
        var d = lineStats(a.id).last - lineStats(b.id).last;
        return d !== 0 ? d : b.priority - a.priority;
      });
      return cands[0];
    }
    // mix control: facts are the minority; among state candidates prefer
    // the requested cat, then priority, then least recently shown.
    cands.sort(function (a, b) {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return lineStats(a.id).last - lineStats(b.id).last;
    });
    return cands[0];
  }

  /* ---------------- showing ---------------- */
  var currentShow = null; // {id, at}
  function settleCurrent() {
    if (!currentShow) return;
    var dwell = Date.now() - currentShow.at;
    if (dwell < 800) noteIgnore(currentShow.id);
    currentShow = null;
  }
  function showLine(line, via) {
    if (!window.GN_NODKI || !window.GN_NODKI.showAmbient) return false;
    settleCurrent();
    var text = line[lang()] || line.en;
    var framed = false;
    if (line.cat === 'fact') {
      var s = seen();
      var anyFact = Object.keys(s).some(function (id) { var l = window.GN_NODKI_LIBRARY.byId(id); return l && l.cat === 'fact' && s[id].shown > 0; });
      if (!anyFact) { text = tx('nodki.factFrame', null, 'General information only — not medical advice.') + ' ' + text; framed = true; }
    }
    var ok = window.GN_NODKI.showAmbient({
      id: line.id,
      label: line.cat === 'fact' ? tx('nodki.factLabel', null, 'FIELD NOTE') : tx('nodki.tipLabel', null, 'TIP'),
      text: text,
      expr: line.expr, alts: line.alts || [],
      cta: line.cta ? tx('nodki.open', null, 'OPEN') : null,
      proactive: via !== 'pull'
    }, {
      onDismiss: function (dwellMs) { noteDismiss(line.id, dwellMs); currentShow = null; },
      onCta: function () {
        var s = seen(); var st = s[line.id] || { shown: 0, last: 0, dismissed: 0, fast: 0, ignored: 0, acted: false, banned: false };
        st.acted = true; s[line.id] = st; saveSeen(s);
        ctaGo(line.cta);
      }
    });
    if (ok) {
      noteShow(line.id);
      currentShow = { id: line.id, at: Date.now() };
      if (via !== 'pull' && window.GN_NODKI.budget) window.GN_NODKI.budget.spendAmbient();
      if (framed) { /* framing counts as the first fact's show; recorded above */ }
    }
    return ok;
  }
  function ctaGo(target) {
    try {
      var nav = { dash: 'navDash', history: 'navLog', results: 'navRes', lab: 'navLab', vault: 'navVault', profile: 'navVault', scanner: 'navLog' };
      var page = { dash: 'Dash', history: 'Log', results: 'Results', lab: 'Lab', vault: 'Profile', profile: 'Profile', scanner: 'Log' };
      if (target === 'log') {
        if (typeof window.handleShotFab === 'function') window.handleShotFab();
        else if (typeof window.openLogModal === 'function') window.openLogModal();
        return;
      }
      var el = document.getElementById(nav[target] || 'navDash');
      if (typeof window.showPage === 'function') window.showPage(page[target] || 'Dash', el);
      if (target === 'scanner') {
        window.setTimeout(function () {
          var r = document.getElementById('shotsRegionScanner');
          if (r) r.scrollIntoView({ block: 'center' });
        }, 480);
      }
    } catch (e) {}
  }

  /* ---------------- triggers ---------------- */
  var idleTimer = 0;
  function clearIdle() { if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = 0; } }
  function armIdle() {
    clearIdle();
    if (!active() || freqMode() === 'pull') return;
    idleTimer = window.setTimeout(function () {
      idleTimer = 0;
      if (!dashboardVisible()) return;
      var line = pickLine({ idle: true });
      if (!line) line = pickLine({ cat: null });
      if (line) showLine(line, 'idle');
    }, 20000);
  }
  function dashboardVisible() {
    var p = document.getElementById('pageDash');
    return !!p && p.offsetParent !== null;
  }
  function onDashboardArrival() {
    if (!active()) return;
    // completed-event lines outrank state/idle tips
    var pending = jGet(PENDING_KEY, []);
    if (pending.length) {
      var lib = window.GN_NODKI_LIBRARY;
      for (var i = 0; i < pending.length; i++) {
        var l = lib && lib.byId(pending[i]);
        if (l && proactiveAllowed(l, 'card')) {
          jSet(PENDING_KEY, pending.slice(i + 1));
          if (showLine(l, 'event')) return;
        }
      }
      jSet(PENDING_KEY, []);
    }
    var line = pickLine({});
    if (line) { showLine(line, 'state'); return; }
    armIdle();
  }
  function queueEvent(key) {
    var lib = window.GN_NODKI_LIBRARY; if (!lib) return;
    var line = null;
    lib.lines.forEach(function (l) { if (l.trigger.type === 'event' && l.trigger.key === key) line = l; });
    if (!line) return;
    var flags = jGet(EVENTS_KEY, {});
    if (key === 'firstExport' && flags.firstExport) return;
    if (key === 'firstScanner' && flags.firstScanner) return;
    flags[key] = true; jSet(EVENTS_KEY, flags);
    var pending = jGet(PENDING_KEY, []);
    if (pending.indexOf(line.id) < 0) { pending.push(line.id); jSet(PENDING_KEY, pending); }
  }

  /* pull: uncapped, user-initiated; rotates least-recently-shown */
  function pull() {
    if (!active()) return;
    var lib = window.GN_NODKI_LIBRARY; if (!lib) return;
    var fact = (pullCount % 3 === 2); // ~2:1 tips:facts across pulls too
    pullCount += 1;
    var line = pickLine({ pull: true, cat: fact ? 'fact' : 'tip' }) || pickLine({ pull: true });
    if (line) showLine(line, 'pull');
  }
  var pullCount = 0;

  /* ---------------- card override lines (continuity / exit / resume) -- */
  function cardOverride() {
    if (ssGet('gn_nodki_continuity') === '1') {
      ssSet('gn_nodki_continuity', '0');
      return { key: 'nodki.host.continuity', fallback: "Grid's live. I'll flag what's due, here.", expr: 'welcome', alts: ['default'], cta: null };
    }
    if (ssGet('gn_nodki_guide_exit') === '1') {
      ssSet('gn_nodki_guide_exit', '0');
      return { key: 'nodki.host.exitLine', fallback: "Guide's in the VAULT whenever you want it.", expr: 'default', alts: ['thinking'], cta: null };
    }
    // one resume re-offer: guide <50% complete, >=24h since last beat
    try {
      if (lsGet(OFFER_KEY) === '1') return null;
      var prog = jGet('gn_onboarding_progress_v1', null);
      if (!prog || prog.done || !prog.beats) return null;
      var total = 6; var doneCount = Object.keys(prog.beats).filter(function (b) { return prog.beats[b] && prog.beats[b].complete; }).length;
      if (doneCount / total >= 0.5) return null;
      if (!prog.lastAt || Date.now() - prog.lastAt < DAY) return null;
      lsSet(OFFER_KEY, '1');
      return { key: 'nodki.host.resumeOffer', fallback: 'Your intro is still open. Pick it up where you left off, any time.', expr: 'thinking', alts: ['default'], cta: 'resume' };
    } catch (e) { return null; }
  }

  /* ---------------- waits ---------------- */
  var waitTimer = 0;
  function waitLineEl() {
    var ov = document.getElementById('csvImportOverlay');
    if (!ov) return null;
    var el = ov.querySelector('.gn-nodki-wait-line');
    if (!el) {
      el = document.createElement('p');
      el.className = 'gn-nodki-wait-line';
      el.hidden = true;
      ov.appendChild(el);
    }
    return el;
  }
  var GN_NODKI_WAIT = {
    start: function (kind) {
      if (!active()) return;
      window.clearTimeout(waitTimer);
      waitTimer = window.setTimeout(function () {
        var ov = document.getElementById('csvImportOverlay');
        if (!ov || !ov.classList.contains('active')) return;
        var lib = window.GN_NODKI_LIBRARY; if (!lib) return;
        var w = lib.waits.filter(function (x) { return x.id === 'w-' + kind; })[0] || lib.waits[3];
        var el = waitLineEl(); if (!el) return;
        el.textContent = w[lang()] || w.en;
        el.hidden = false;
      }, 3000);
    },
    stop: function () {
      window.clearTimeout(waitTimer);
      var el = null;
      try { el = document.querySelector('.gn-nodki-wait-line'); } catch (e) {}
      if (el) el.hidden = true;
    }
  };
  window.GN_NODKI_WAIT = GN_NODKI_WAIT;

  /* ---------------- VAULT panel: settings + manual + archive -------- */
  function beatDone(n) {
    var prog = jGet('gn_onboarding_progress_v1', null);
    return !!(prog && prog.beats && prog.beats[n] && prog.beats[n].complete);
  }
  function renderPanel() {
    var host = document.getElementById('gnNodkiPanel');
    if (!host) return;
    var s = settings();
    var freqBtn = function (val, key, fb) {
      return '<button type="button" class="gn-nodki-freq-btn' + (s.freq === val ? ' is-on' : '') + '" data-gn-freq="' + val + '" aria-pressed="' + String(s.freq === val) + '">' + esc(tx(key, null, fb)) + '</button>';
    };
    var manual = [
      [0, 'nodki.manual.b0', 'Welcome from your operator'],
      [1, 'nodki.manual.b1', 'Set your shot day'],
      [2, 'nodki.manual.b2', 'Log your first shot'],
      [3, 'nodki.manual.b3', 'See your phase'],
      [4, 'nodki.manual.b4', 'Meet the scanner'],
      [5, 'nodki.manual.b5', 'The handoff: your controls']
    ].map(function (m) {
      var done = beatDone(m[0]);
      return '<div class="gn-vault-row gn-vault-row-static"><span class="gn-vault-row-txt"><b>' + esc(tx(m[1], null, m[2])) + '</b></span>' +
        '<span class="gn-nodki-manual-state">' + (done ? esc(tx('nodki.manual.done', null, 'DONE')) : esc(tx('nodki.manual.todo', null, 'OPEN'))) + '</span></div>';
    }).join('');
    var seenMap = seen();
    var ids = Object.keys(seenMap).filter(function (id) { return seenMap[id].shown > 0; });
    ids.sort(function (a, b) { return (seenMap[b].last || 0) - (seenMap[a].last || 0); });
    var lib = window.GN_NODKI_LIBRARY;
    var archive = '';
    if (!ids.length) {
      archive = '<p class="gn-nodki-archive-empty">' + esc(tx('nodki.archive.empty', null, 'Nothing yet. Lines you see will live here.')) + '</p>';
    } else {
      var anyFact = false;
      archive = ids.map(function (id) {
        var l = lib ? lib.byId(id) : null; if (!l) return '';
        if (l.cat === 'fact') anyFact = true;
        var d = seenMap[id].last ? new Date(seenMap[id].last) : null;
        var when = d ? d.toLocaleDateString(lang() === 'es' ? 'es' : 'en', { month: 'short', day: 'numeric' }) : '';
        return '<div class="gn-nodki-archive-row"><span class="gn-nodki-archive-tag">' + (l.cat === 'fact' ? esc(tx('nodki.factLabel', null, 'FIELD NOTE')) : esc(tx('nodki.tipLabel', null, 'TIP'))) + '</span>' +
          '<span class="gn-nodki-archive-txt">' + esc(l[lang()] || l.en) +
          (l.cat === 'fact' && l.source ? '<span class="gn-nodki-archive-src">' + esc(tx('nodki.archive.source', null, 'Source')) + ': ' + esc(l.source.label) + '</span>' : '') +
          '</span><span class="gn-nodki-archive-when">' + esc(when) + '</span>' +
          (seenMap[id].banned ? '' : '<button type="button" class="gn-nodki-archive-ban" data-gn-ban="' + esc(id) + '">' + esc(tx('nodki.archive.ban', null, "Don't show again")) + '</button>') +
          '</div>';
      }).join('');
      if (anyFact) archive += '<p class="gn-nodki-archive-foot">' + esc(tx('nodki.factFrame', null, 'General information only — not medical advice.')) + '</p>';
    }
    host.innerHTML =
      '<div class="gn-vault-row gn-vault-row-static"><span class="gn-vault-row-txt"><b data-i18n="nodki.tipsTitle">' + esc(tx('nodki.tipsTitle', null, 'Tips & facts')) + '</b><small>' + esc(tx('nodki.tipsHelp', null, 'Occasional notes from NODKI. Facts are general information.')) + '</small></span>' +
      '<button type="button" class="gn-nodki-toggle" data-gn-tips-toggle aria-pressed="' + String(s.enabled) + '">' + (s.enabled ? esc(tx('nodki.on', null, 'ON')) : esc(tx('nodki.off', null, 'OFF'))) + '</button></div>' +
      '<div class="gn-vault-row gn-vault-row-static"><span class="gn-vault-row-txt"><b>' + esc(tx('nodki.freqTitle', null, 'How often')) + '</b></span><span class="gn-nodki-freq">' +
      freqBtn('normal', 'nodki.freqNormal', 'NORMAL') + freqBtn('quiet', 'nodki.freqQuiet', 'QUIET') + freqBtn('pull', 'nodki.freqPull', 'PULL ONLY') + '</span></div>' +
      '<div class="gn-nodki-manual"><div class="gn-nodki-sub">' + esc(tx('nodki.manual.title', null, "OPERATOR'S MANUAL")) + '</div>' + manual +
      '<button type="button" class="gn-nodki-manual-replay" data-gn-replay>' + esc(tx('nodki.manual.replay', null, 'Replay the guide')) + '</button></div>' +
      '<div class="gn-nodki-archive"><div class="gn-nodki-sub">' + esc(tx('nodki.archive.title', null, "OPERATOR'S NOTES")) + '</div>' + archive + '</div>';
    host.querySelector('[data-gn-tips-toggle]').addEventListener('click', function () {
      var cur = settings(); cur.enabled = !cur.enabled; saveSettings(cur);
    });
    host.querySelectorAll('[data-gn-freq]').forEach(function (b) {
      b.addEventListener('click', function () { var cur = settings(); cur.freq = b.getAttribute('data-gn-freq'); saveSettings(cur); });
    });
    host.querySelectorAll('[data-gn-ban]').forEach(function (b) {
      b.addEventListener('click', function () {
        var sm = seen(); var id = b.getAttribute('data-gn-ban');
        if (sm[id]) { sm[id].banned = true; saveSeen(sm); }
        renderPanel();
      });
    });
    var rp = host.querySelector('[data-gn-replay]');
    if (rp) rp.addEventListener('click', function () {
      try { if (window.GN_ONBOARDING && window.GN_ONBOARDING.restart) window.GN_ONBOARDING.restart(); } catch (e) {}
    });
  }

  /* ---------------- wiring ---------------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest('#navDash')) { window.setTimeout(onDashboardArrival, 460); armIdleSoon(); }
    else if (t.closest('.nav-item')) { settleCurrent(); clearIdle(); }
    if (t.closest('#navVault')) { window.setTimeout(renderPanel, 420); }
    if (t.closest('#shotsRegionScanner .biotech-zones [data-site]')) queueEvent('firstScanner');
    var oc = t.closest('[onclick]');
    if (oc && /export(CSV|Backup)/.test(oc.getAttribute('onclick') || '')) queueEvent('firstExport');
  }, true);
  function armIdleSoon() { /* idle arms after arrival render decisions */ window.setTimeout(function () { if (dashboardVisible() && !currentShow) armIdle(); }, 600); }
  ['pointerdown', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, function () { if (idleTimer) armIdle(); }, { passive: true });
  });
  document.addEventListener('gn:nodki-setting', function () { renderPanel(); });
  document.addEventListener('gn:langchange', function () { renderPanel(); });
  // VAULT renders its HTML dynamically (first on the profile page's
  // first show). Render the panel whenever it appears empty; settings
  // changes and VAULT arrivals re-render it explicitly.
  try {
    var mo = new MutationObserver(function () {
      var host = document.getElementById('gnNodkiPanel');
      if (host && !host.innerHTML) renderPanel();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { renderPanel(); });
  else renderPanel();

  window.GN_NODKI_AMBIENT = {
    settings: settings,
    pull: pull,
    cardOverride: cardOverride,
    queueEvent: queueEvent,
    renderPanel: renderPanel,
    onDashboardArrival: onDashboardArrival,
    state: { active: active, freqMode: freqMode, factor: globalFactor }
  };
})();
