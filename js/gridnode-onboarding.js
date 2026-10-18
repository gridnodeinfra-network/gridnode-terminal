/* GRID//NODE — FIRST RUN onboarding (ONBOARDING REBORN).
 *
 * Replaces First Contact (scrapped by Pipe's order, 2026-10-13) per the
 * design contract in ~/workspace/gridnode-overnight/onboarding-reborn/
 * DESIGN.md: seven story screens (WELCOME / THE LOOP / THE MAP / FIRST
 * SHOT / PAYOFF / COMFORT / YOU'RE IN) plus THE VISUAL GUIDE (§2.7): a
 * spotlight layer that dims everything except the real control,
 * advances only on the user's real actions, re-targets inside the log
 * modal, yields to overlays the modal spawns, and degrades to a story
 * surface instead of ever pointing at nothing.
 *
 * Preserved skeleton (§1.2): legal gate + entry choice stay pre-entry;
 * the NODE KEY gate is never re-asked; the c2e85c1 GIS steering is
 * untouched; F3 whatsnew serialization holds both directions (this
 * engine defers while whatsnew is open/queued; whatsnew defers on the
 * compat alias + gn:firstcontact-done + the v2 terminal mirrors, so
 * gridnode-whatsnew.js needs zero edits); terminal state mirrors into
 * gn_onboarding_v2 / gn_onboarding_dismissed_v2; the gnFcDoseStart
 * draft stamp and the window.GN_FIRSTCONTACT alias keep
 * gridnode-native.js and VAULT replay (js/modules/08-lab.js) working
 * unchanged; telemetry gating untouched (no events added here).
 */
(function () {
  'use strict';

  var STATE_KEY = 'gn_onboarding_v3';
  var LEGACY_STATE_KEY = 'gn_onboarding_v2';
  var LEGACY_DISMISSED_KEY = 'gn_onboarding_dismissed_v2';
  var SESSION_KEY = 'gn_ob_session_v1';
  var PROGRESS_KEY = 'gn_onboarding_progress_v1';
  var METRICS_KEY = 'gn_onboarding_metrics_v1';
  var ENTRY_SEL = '#gnFirstShotMission button, .gn-wanda-actions button, .fab, .gn-empty-cta';
  var TOTAL = 6;

  /* Final copy (DESIGN Part 3) as in-code fallbacks; the i18n catalogs
   * are normative and GN_I18N.t() wins whenever it resolves. */
  var FALLBACK = {
    'ob.skip': 'Skip', 'ob.back': 'Back', 'ob.next': 'Next', 'ob.begin': 'Begin',
    'ob.progress': 'Step {n} of {total}', 'ob.dialogLabel': 'GRID//NODE intro',
    'ob.welcome.kicker': 'WELCOME TO GRID//NODE',
    'ob.welcome.title': 'Your protocol, on one calm timeline.',
    'ob.welcome.body': 'Every shot, phase, and result in one place. It starts right here, on this device.',
    'ob.welcome.cloudNote': 'You signed in with Google, so your grid syncs across your devices.',
    'ob.welcome.localNote': 'You are continuing on this device only. Your data stays here unless you connect an account later.',
    'ob.loop.kicker': 'HOW IT WORKS',
    'ob.loop.title': 'Three steps. That is the whole system.',
    'ob.loop.body': 'Each shot you log moves your curve. The curve shows where you are in your cycle.',
    'ob.loop.step1': 'Log your shot', 'ob.loop.step2': 'See your phase', 'ob.loop.step3': 'Plan your week',
    'ob.zones.kicker': 'THE MAP',
    'ob.zones.title': 'Five places. Each one does one thing.',
    'ob.zones.todayBody': 'Your status, streak, and next dose at a glance.',
    'ob.zones.historyBody': 'Every shot you have logged, in order.',
    'ob.zones.progressBody': 'Your phase wheel and your trends over time.',
    'ob.zones.labBody': 'Dose math: how much to draw, how to mix, what is in stock.',
    'ob.zones.vaultBody': 'Your data, your exports, your settings.',
    'ob.shot.kicker': 'YOUR FIRST SHOT',
    'ob.shot.title': "Let's log your first shot.",
    'ob.shot.body': 'It takes about 20 seconds. Use a real dose you already took. We stay with you the whole way.',
    'ob.shot.cta': 'Log my first shot', 'ob.shot.ctaAgain': 'Log a shot', 'ob.shot.later': "I'll do it later",
    'ob.guide.barLabel': 'First shot guide', 'ob.guide.stepLog': 'Tap this button to open the log.',
    'ob.guide.skip': 'Skip guide',
    'ob.guide.openFailed': 'That button is hiding right now. Open the log from here instead.',
    'ob.guide.openLog': 'Open the log',
    'ob.guide.stepMed': 'First, pick your medication.', 'ob.guide.stepDose': 'Now set your dose.',
    'ob.guide.stepContinue': 'Tap the big button below to keep going.',
    'ob.guide.stepSite': 'Pick where you injected.',
    'ob.guide.stepSave': 'Tap the big button below to save your shot.',
    'ob.guide.blocked': 'Almost there. Still needed: {fields}.',
    'ob.guide.field.med': 'medication', 'ob.guide.field.dose': 'dose', 'ob.guide.field.date': 'date',
    'ob.guide.field.time': 'time', 'ob.guide.field.loc': 'injection site',
    'ob.curve.kicker': 'YOUR CURVE',
    'ob.curve.title': 'First shot logged. Your timeline has started.',
    'ob.curve.titleAgain': 'Logged. Your timeline keeps growing.',
    'ob.curve.cloudBody': 'Your Phase Engine is already reading your cycle from your logged shots.',
    'ob.curve.localBody': 'Your shot is saved on this device. Connect Google in VAULT any time to sync and see your full curve.',
    'ob.curve.cta': 'See my grid', 'ob.curve.emptyTitle': 'Your curve is waiting.',
    'ob.curve.emptyBody': 'Whenever you are ready, the log button lives on TODAY. One shot starts your timeline.',
    'ob.comfort.kicker': 'MAKE IT YOURS', 'ob.comfort.title': 'Pick your light.',
    'ob.comfort.body': 'Theme and language apply to the whole app, right away. You can change them any time in VAULT.',
    'ob.comfort.darkName': 'Night', 'ob.comfort.lightName': 'Dusk', 'ob.comfort.done': 'Done',
    'ob.done.kicker': 'YOU ARE IN',
    'ob.done.title': 'Log the shot. Read the curve. Run your protocol.',
    'ob.done.body': 'That is all there is to it. Welcome to GRID//NODE.',
    'ob.done.cta': 'Enter GRID//NODE',
    'nodki.host.start': 'Start', 'nodki.host.beatOf': 'Beat {n} of {total}',
    'nodki.host.b0': "I'm NODKI, your grid operator.",
    'nodki.host.b1': 'First, your rhythm. This is the day your shot lands each week.',
    'nodki.host.beat1Cta': 'Set my shot day',
    'nodki.host.b1Guide': 'Pick the day your shot lands. Saving it moves us on.',
    'nodki.host.starterCta': 'Use a starter schedule',
    'nodki.host.b2': 'Now the real thing. Log a dose you already took. I will step out while you fill the form.',
    'nodki.host.b3': 'That curve is yours. It is drawn from the shot you just logged.',
    'nodki.host.b4': 'One last stop: the scanner. It maps where shots go.',
    'nodki.host.b4k': 'THE SCANNER', 'nodki.host.b4t': 'Meet the scanner.',
    'nodki.host.b4b': 'Tap one site on the body map. No camera, nothing is captured. Just the map.',
    'nodki.host.beat4Cta': 'Try the scanner',
    'nodki.host.b4Guide': 'Tap one site on the map. That is the whole cameo.',
    'nodki.host.later': 'Later',
    'nodki.host.b5': 'You run the grid now. Three controls are yours forever:',
    'nodki.host.b5a': "Replay this guide any time: VAULT, Operator's manual.",
    'nodki.host.b5b': 'Tips and facts: on, quiet, or pull-only, in VAULT.',
    'nodki.host.b5c': 'Me: if I ever get in the way, VAULT turns me off. It sticks.',
    'nodki.host.continuity': "Grid's live. I'll flag what's due, here.",
    'nodki.host.exitLine': "Guide's in the VAULT whenever you want it.",
    'nodki.host.resumeOffer': 'Your intro is still open. Pick it up where you left off, any time.',
    'nodki.host.resumeCta': 'RESUME',
    'nav.home': 'TODAY', 'nav.shots': 'HISTORY', 'nav.results': 'PROGRESS', 'nav.lab': 'LAB', 'nav.vault': 'VAULT',
    'lang.english': 'EN', 'lang.spanish': 'ES',
    'lang.switcherAria': 'Language selector'
  };

  function t(key, params) {
    var value = null;
    try { value = window.GN_I18N && window.GN_I18N.t ? window.GN_I18N.t(key) : null; } catch (err) { value = null; }
    if (!value || value === key) value = FALLBACK[key] || key;
    if (params) {
      Object.keys(params).forEach(function (name) {
        value = value.split('{' + name + '}').join(String(params[name]));
      });
    }
    return value;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* session-only run */ } }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  /* ---------------- state ---------------- */

  function readState() { return lsGet(STATE_KEY); }
  function isTerminal(state) { return state === 'complete' || state === 'skipped'; }
  var replayRestore = null; // pre-replay stored state while a replay runs
  function markState(value) {
    if (replayRestore !== null) return; // replay never rewrites stored state (§2.10)
    lsSet(STATE_KEY, value);
    if (value === 'complete') lsSet(LEGACY_STATE_KEY, 'complete');
    if (value === 'skipped') lsSet(LEGACY_DISMISSED_KEY, '1');
  }
  /* Spec A: progress persists across sessions (resume at the same
   * beat, never restart) and per-beat metrics stay on-device. */
  var runStartAt = 0;
  var beatEnterAt = 0;
  function readProgress() {
    try { return JSON.parse(lsGet(PROGRESS_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeProgress(beat, complete) {
    var p = readProgress() || { beats: {}, done: false };
    p.beats = p.beats || {};
    if (typeof beat === 'number' && beat >= 0) {
      p.beat = beat;
      p.beats[beat] = p.beats[beat] || {};
      p.beats[beat].seen = true;
      if (complete) p.beats[beat].complete = true;
    }
    if (complete && beat === TOTAL - 1) p.done = true;
    p.lastAt = Date.now();
    lsSet(PROGRESS_KEY, JSON.stringify(p));
  }
  function metricsUpdate(fn) {
    var m = null;
    try { m = JSON.parse(lsGet(METRICS_KEY) || 'null'); } catch (e) { /* fresh */ }
    if (!m || typeof m !== 'object') m = { beats: {} };
    m.beats = m.beats || {};
    fn(m);
    lsSet(METRICS_KEY, JSON.stringify(m));
  }
  function beatEnter(i) {
    beatEnterAt = Date.now();
    metricsUpdate(function (m) {
      var b = m.beats[i] = m.beats[i] || { enter: 0, complete: 0, skip: 0, timeMs: 0 };
      b.enter += 1;
    });
    writeProgress(i, false);
  }
  function beatExit(i, how) {
    if (i < 0) return;
    var dt = beatEnterAt ? Date.now() - beatEnterAt : 0;
    beatEnterAt = 0;
    metricsUpdate(function (m) {
      var b = m.beats[i] = m.beats[i] || { enter: 0, complete: 0, skip: 0, timeMs: 0 };
      b.timeMs += dt;
      if (how === 'complete') b.complete += 1;
      if (how === 'skip') b.skip += 1;
    });
    if (how === 'complete') writeProgress(i, true);
  }

  function shotCount() {
    var count = 0;
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var key = window.localStorage.key(i);
        if (!key || !/_shots$/.test(key)) continue;
        var parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
        if (Array.isArray(parsed)) count += parsed.length;
      }
    } catch (e) { /* storage unavailable: treat as zero */ }
    return count;
  }
  function hasAnyShot() { return shotCount() > 0; }
  function isCloudSession() {
    try {
      var s = JSON.parse(lsGet('gn_session_v2') || 'null');
      return !!(s && s.user && s.user.id && s.type !== 'local');
    } catch (e) { return false; }
  }
  function inApp() {
    var app = document.getElementById('app');
    if (!app || window.getComputedStyle(app).display === 'none') return false;
    var landing = document.getElementById('landing');
    return !landing || window.getComputedStyle(landing).display === 'none';
  }
  function logModalOpen() {
    var ov = document.getElementById('logOv');
    return !!ov && ov.classList.contains('active');
  }
  function stackBlocked() {
    if (document.getElementById('gnFirstShotCelebrate')) return true;
    if (logModalOpen()) return true;
    var wt = document.getElementById('wtOv');
    return !!wt && wt.classList.contains('active');
  }

  /* ---------------- run state ---------------- */

  var overlay = null;        // full-screen story surface (.gn-ob)
  var shown = [];            // stack of shown screen indices (§2.10)
  var current = -1;
  var payoffVariant = 'saved';   // 'saved' | 'empty' (§2.8)
  var shotDegraded = false;      // screen 3 degraded render (§2.7.7)
  var primarySpec = null;        // { label, act } for the footer primary
  var stackWatchTimer = null;

  function isActive() { return !!overlay || !!guide; }

  /* ---------------- visuals ---------------- */

  var ARC_D = [
    'M 174.4 42.9 A 118 118 0 0 1 277.1 145.6',
    'M 277.1 174.4 A 118 118 0 0 1 174.4 277.1',
    'M 145.6 277.1 A 118 118 0 0 1 42.9 174.4',
    'M 42.9 145.6 A 118 118 0 0 1 145.6 42.9'
  ];
  /* Compact wheel (the asset's wheel grammar; dial/orbit dropped so it
   * stays legible at 120-168 px): 'plain' | 'one-lit' | 'filled'. */
  function wheelSvg(variant) {
    var lit = variant !== 'plain';
    var arcs = ARC_D.map(function (d, i) {
      if (i === 0 && lit) {
        return '<g class="ob-enter" style="--ob-delay:60ms"><path d="' + d + '" style="stroke:var(--ob-wheel-lit)"/></g>';
      }
      var tint = ['var(--ob-accent)', 'var(--ob-violet)', 'var(--ob-amber)', 'var(--ob-green)'][i];
      return '<g class="ob-enter" style="--ob-delay:' + (60 + i * 90) + 'ms"><path d="' + d + '" stroke-opacity=".38" style="stroke:' + tint + '"/></g>';
    }).join('');
    var bead = lit ? '<circle class="ob-enter" style="--ob-delay:340ms;fill:var(--ob-wheel-lit);stroke:var(--surface-1)" cx="174.4" cy="42.9" r="6.5" stroke-width="3"/>' : '';
    var check = variant === 'filled'
      ? '<path class="gn-ob-check" d="M 233 77 L 241 86 L 256 68" fill="none" style="stroke:var(--surface-1)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
      : '';
    return '<svg class="ob-art gn-ob-wheel" viewBox="0 0 320 320" aria-hidden="true">' +
      '<g fill="none" stroke-width="24" stroke-linecap="round">' + arcs + '</g>' + bead +
      '<circle cx="160" cy="160" r="27" style="fill:var(--ob-accent)" opacity=".10"/>' +
      '<circle cx="160" cy="160" r="27" fill="none" style="stroke:var(--ob-accent-dim)" stroke-width="1.5"/>' +
      '<circle cx="160" cy="160" r="7" style="fill:var(--ob-accent)"/>' + check + '</svg>';
  }
  /* WELCOME hero: Agent 2's asset geometry, verbatim (assets/hero-wheel). */
  function heroSvg() {
    return '<svg class="ob-art ob-hero" viewBox="0 0 320 320" role="img" aria-label="A four-phase cycle wheel with the first phase lit">' +
      '<g class="ob-enter" style="--ob-delay:0ms"><g class="ob-hero-orbit-spin">' +
      '<circle cx="160" cy="160" r="148" fill="none" style="stroke:var(--ob-hairline)" stroke-width="1.5" stroke-dasharray="2 8" stroke-linecap="round"/>' +
      '<circle cx="160" cy="12" r="4.5" style="fill:var(--ob-accent)"/></g></g>' +
      '<g fill="none" stroke-width="24" stroke-linecap="round">' +
      '<g class="ob-hero-glow ob-enter" style="--ob-delay:60ms"><path d="' + ARC_D[0] + '" style="stroke:var(--ob-accent)"/></g>' +
      '<g class="ob-enter" style="--ob-delay:150ms">' +
      '<path style="stroke:var(--ob-violet)" stroke-opacity=".38" d="' + ARC_D[1] + '"/>' +
      '<path style="stroke:var(--ob-amber)" stroke-opacity=".38" d="' + ARC_D[2] + '"/>' +
      '<path style="stroke:var(--ob-green)" stroke-opacity=".38" d="' + ARC_D[3] + '"/></g></g>' +
      '<circle class="ob-enter" style="--ob-delay:340ms;fill:var(--ob-accent);stroke:var(--ob-surface)" cx="174.4" cy="42.9" r="6.5" stroke-width="3"/>' +
      '<g class="ob-enter" style="--ob-delay:380ms">' +
      '<circle cx="160" cy="160" r="74" fill="none" style="stroke:var(--ob-hairline)" stroke-width="1.5"/>' +
      '<g style="fill:var(--ob-faint)"><circle cx="160" cy="86" r="2.5"/><circle cx="234" cy="160" r="2.5"/><circle cx="160" cy="234" r="2.5"/><circle cx="86" cy="160" r="2.5"/></g>' +
      '<circle cx="160" cy="160" r="27" style="fill:var(--ob-accent)" opacity=".10"/>' +
      '<circle cx="160" cy="160" r="27" fill="none" style="stroke:var(--ob-accent-dim)" stroke-width="1.5"/>' +
      '<circle cx="160" cy="160" r="7" style="fill:var(--ob-accent)"/></g></svg>';
  }
  function langSegHtml() {
    var es = (document.documentElement.lang || 'en').indexOf('es') === 0;
    return '<div class="gn-ob-seg" role="group" aria-label="' + esc(t('lang.switcherAria')) + '">' +
      '<button type="button" class="gn-ob-seg-btn" data-ob-lang="en" aria-pressed="' + String(!es) + '">' + esc(t('lang.english')) + '</button>' +
      '<button type="button" class="gn-ob-seg-btn" data-ob-lang="es" aria-pressed="' + String(es) + '">' + esc(t('lang.spanish')) + '</button></div>';
  }
  function iconUse(id) { return '<svg class="gn-ob-ico" aria-hidden="true"><use href="#' + id + '"></use></svg>'; }
  function copyBlock(kickerKey, titleKey, bodyKey) {
    return '<p class="gn-ob-kicker">' + esc(t(kickerKey)) + '</p>' +
      '<h2 class="gn-ob-title" data-ob-title tabindex="-1">' + esc(t(titleKey)) + '</h2>' +
      (bodyKey ? '<p class="gn-ob-body">' + esc(t(bodyKey)) + '</p>' : '');
  }
  function themeCard(theme, nameKey, vars) {
    var active = false;
    try {
      active = window.GN_THEME && window.GN_THEME.get
        ? window.GN_THEME.get() === theme
        : (document.documentElement.dataset.theme === 'light') === (theme === 'light');
    } catch (e) { /* default */ }
    return '<button type="button" class="gn-ob-theme-card" data-ob-theme="' + theme + '" aria-pressed="' + String(active) + '">' +
      '<span class="gn-ob-pv" style="' + vars + '" aria-hidden="true">' +
      '<svg class="gn-ob-pv-wheel" viewBox="0 0 320 320"><g fill="none" stroke-width="24" stroke-linecap="round">' +
      '<path d="' + ARC_D[0] + '" style="stroke:var(--pv-accent)"/>' +
      '<path d="' + ARC_D[1] + '" style="stroke:var(--pv-sub)" stroke-opacity=".4"/>' +
      '<path d="' + ARC_D[2] + '" style="stroke:var(--pv-sub)" stroke-opacity=".4"/>' +
      '<path d="' + ARC_D[3] + '" style="stroke:var(--pv-sub)" stroke-opacity=".4"/></g>' +
      '<circle cx="160" cy="160" r="7" style="fill:var(--pv-accent)"/></svg>' +
      '<span class="gn-ob-pv-lines"><span style="background:var(--pv-text)"></span><span style="background:var(--pv-sub)"></span></span></span>' +
      '<span class="gn-ob-theme-name">' + esc(t(nameKey)) + '</span></button>';
  }

  /* ---------------- screen renderers ---------------- */

  /* Spec A (1.3.0): six hosted beats composed from the seven story
   * renderers. 0 cold open / 1 schedule (loop medallions + the real
   * profile control) / 2 first log (the playable beat) / 3 phase
   * payoff / 4 scanner cameo (comfort slot, rewritten) / 5 handoff
   * (done + map rows + the three forever-controls). */

  function mascotOff() { try { return window.localStorage.getItem('gn_nodki_v1') === 'off'; } catch (e) { return false; } }
  var HOST_IMG = {
    welcome: 'nodki-pose-welcome', tablet: 'nodki-pose-tablet', approve: 'nodki-pose-approve',
    celebrate: 'nodki-pose-celebrate', neutral: 'nodki-pose-neutral',
    focused: 'nodki-expr-focused', thinking: 'nodki-expr-thinking', default: 'nodki-expr-default'
  };
  /* The host layer: NODKI in a reserved in-flow slot, one whole line at
   * a time (no typing effect). With the mascot off the same panel runs
   * text-only: the character is a presentation layer, never a dependency. */
  function hostHtml(expr, lineKey) {
    var img = mascotOff() ? '' :
      '<img class="gn-ob-host-img" src="assets/mascot/' + HOST_IMG[expr] + '.webp" alt="" width="72" height="72" decoding="async">';
    return '<div class="gn-ob-host">' + img +
      '<div class="gn-ob-host-body"><p class="gn-ob-host-kicker">NODKI</p>' +
      '<p class="gn-ob-host-line" aria-live="polite">' + esc(t(lineKey)) + '</p></div></div>';
  }

  function renderWelcome() {
    primarySpec = { label: t('nodki.host.start'), act: function () { navTo(1); } };
    return '<div class="gn-ob-theme-host gn-theme-toggle-host"></div>' +
      hostHtml('welcome', 'nodki.host.b0') +
      '<div class="gn-ob-visual gn-ob-visual-hero"><figure class="ob-piece" style="margin:0">' + heroSvg() + '</figure></div>' +
      copyBlock('ob.welcome.kicker', 'ob.welcome.title', 'ob.welcome.body') +
      '<p class="gn-ob-note">' + esc(t(isCloudSession() ? 'ob.welcome.cloudNote' : 'ob.welcome.localNote')) + '</p>' +
      '<div class="gn-ob-langrow">' + langSegHtml() + '</div>' +
      '<div class="gn-ob-equalrow"><button type="button" class="gn-ob-eq gn-auth-primary" data-ob-start>' + esc(t('nodki.host.start')) + '</button>' +
      '<button type="button" class="gn-ob-eq" data-ob-skipeq>' + esc(t('ob.skip')) + '</button></div>';
  }
  function renderLoop() {
    primarySpec = { label: t('ob.next'), act: function () { navTo(2); } };
    var steps = [
      ['gn-protocol-event', 'ob.loop.step1'], ['gn-trend-signal', 'ob.loop.step2'], ['gn-command-grid', 'ob.loop.step3']
    ];
    var medallions = steps.map(function (s, i) {
      return (i ? '<span class="gn-ob-thread-seg" aria-hidden="true"></span>' : '') +
        '<div class="gn-ob-medallion ob-enter" style="--ob-delay:' + (i * 80) + 'ms">' + iconUse(s[0]) +
        '<span class="gn-ob-medallion-label">' + esc(t(s[1])) + '</span></div>';
    }).join('');
    return '<div class="gn-ob-visual"><div class="gn-ob-loop">' + medallions + '</div></div>' +
      copyBlock('ob.loop.kicker', 'ob.loop.title', 'ob.loop.body');
  }
  function zoneRowsHtml() {
    var zones = [
      ['gn-command-grid', 'nav.home', 'ob.zones.todayBody'],
      ['gn-protocol-event', 'nav.shots', 'ob.zones.historyBody'],
      ['gn-trend-signal', 'nav.results', 'ob.zones.progressBody'],
      ['gn-lab-vessel', 'nav.lab', 'ob.zones.labBody'],
      ['gn-vault-core', 'nav.vault', 'ob.zones.vaultBody']
    ];
    return zones.map(function (z, i) {
      var name = t(z[1]); var body = t(z[2]);
      return '<div class="gn-ob-zone ob-enter" style="--ob-delay:' + (i * 40) + 'ms" role="img" aria-label="' + esc(name + '. ' + body) + '">' +
        iconUse(z[0]) + '<span class="gn-ob-zone-text"><span class="gn-ob-zone-name">' + esc(name) + '</span>' +
        '<span class="gn-ob-zone-body">' + esc(body) + '</span></span></div>';
    }).join('');
  }
  function renderMap() {
    primarySpec = { label: t('ob.next'), act: function () { navTo(3); } };
    return '<p class="gn-ob-kicker">' + esc(t('ob.zones.kicker')) + '</p>' +
      '<h2 class="gn-ob-title" data-ob-title tabindex="-1">' + esc(t('ob.zones.title')) + '</h2>' +
      '<div class="gn-ob-zones">' + zoneRowsHtml() + '</div>';
  }
  function renderScheduleBeat() {
    var html = renderLoop(); // medallions + loop copy; primary overridden below
    primarySpec = { label: t('nodki.host.beat1Cta'), act: beginScheduleGuide };
    return hostHtml('focused', 'nodki.host.b1') + html;
  }
  function renderShot() {
    if (shotDegraded) {
      primarySpec = { label: t('ob.guide.openLog'), act: degradedOpenLog };
    } else {
      primarySpec = { label: t(hasAnyShot() ? 'ob.shot.ctaAgain' : 'ob.shot.cta'), act: beginGuide };
    }
    return hostHtml('tablet', 'nodki.host.b2') +
      '<div class="gn-ob-visual gn-ob-visual-wheel">' + wheelSvg('one-lit') + '</div>' +
      '<p class="gn-ob-kicker">' + esc(t('ob.shot.kicker')) + '</p>' +
      '<h2 class="gn-ob-title" data-ob-title tabindex="-1">' + esc(t('ob.shot.title')) + '</h2>' +
      '<p class="gn-ob-body">' + esc(t(shotDegraded ? 'ob.guide.openFailed' : 'ob.shot.body')) + '</p>' +
      '<button type="button" class="gn-ob-later" data-ob-later>' + esc(t('ob.shot.later')) + '</button>';
  }
  function renderPayoff() {
    primarySpec = { label: t('ob.curve.cta'), act: function () { navTo(4); } };
    if (payoffVariant === 'empty') {
      return hostHtml('thinking', 'nodki.host.b3') +
        '<div class="gn-ob-visual gn-ob-visual-wheel">' + wheelSvg('plain') + '</div>' +
        '<p class="gn-ob-kicker">' + esc(t('ob.curve.kicker')) + '</p>' +
        '<h2 class="gn-ob-title" data-ob-title tabindex="-1">' + esc(t('ob.curve.emptyTitle')) + '</h2>' +
        '<p class="gn-ob-body">' + esc(t('ob.curve.emptyBody')) + '</p>';
    }
    var titleKey = shotCount() > 1 ? 'ob.curve.titleAgain' : 'ob.curve.title';
    return hostHtml('thinking', 'nodki.host.b3') +
      '<div class="gn-ob-visual gn-ob-visual-wheel">' + wheelSvg('filled') + '</div>' +
      '<p class="gn-ob-kicker">' + esc(t('ob.curve.kicker')) + '</p>' +
      '<h2 class="gn-ob-title" data-ob-title tabindex="-1">' + esc(t(titleKey)) + '</h2>' +
      '<p class="gn-ob-body">' + esc(t(isCloudSession() ? 'ob.curve.cloudBody' : 'ob.curve.localBody')) + '</p>';
  }
  function renderComfort() {
    /* Beat 4 (Spec A): the scanner cameo briefing. The 1.1.0 theme
     * picker moved to VAULT (Preferences) in this restructure; the
     * renderer keeps its name and slot. */
    primarySpec = { label: t('nodki.host.beat4Cta'), act: beginScannerCameo };
    return hostHtml('focused', 'nodki.host.b4') +
      '<p class="gn-ob-kicker">' + esc(t('nodki.host.b4k')) + '</p>' +
      '<h2 class="gn-ob-title" data-ob-title tabindex="-1">' + esc(t('nodki.host.b4t')) + '</h2>' +
      '<p class="gn-ob-body">' + esc(t('nodki.host.b4b')) + '</p>' +
      '<button type="button" class="gn-ob-later" data-ob-later2>' + esc(t('nodki.host.later')) + '</button>';
  }
  function renderDone() {
    primarySpec = { label: t('ob.done.cta'), act: function () { dismiss(true); } };
    return hostHtml('welcome', 'nodki.host.b5') +
      '<div class="gn-ob-visual gn-ob-visual-wheel-sm">' + wheelSvg(payoffVariant === 'saved' || hasAnyShot() ? 'one-lit' : 'plain') + '</div>' +
      copyBlock('ob.done.kicker', 'ob.done.title', 'ob.done.body') +
      '<ul class="gn-ob-forever"><li>' + esc(t('nodki.host.b5a')) + '</li><li>' + esc(t('nodki.host.b5b')) + '</li><li>' + esc(t('nodki.host.b5c')) + '</li></ul>' +
      '<div class="gn-ob-zones">' + zoneRowsHtml() + '</div>';
  }

  var SCREENS = [renderWelcome, renderScheduleBeat, renderShot, renderPayoff, renderComfort, renderDone];

  /* ---------------- story surface ---------------- */

  function threadSvg(progress) {
    var pos = [];
    for (var i = 1; i <= TOTAL; i++) pos.push(14 + (i - 1) * (272 / (TOTAL - 1)));
    var fillTo = pos[0] + (pos[TOTAL - 1] - pos[0]) * progress;
    var nodes = pos.map(function (x, i) {
      return '<circle class="gn-ob-node' + (progress >= i / (TOTAL - 1) - 0.001 ? ' is-on' : '') + '" cx="' + x.toFixed(1) + '" cy="10" r="4"/>';
    }).join('');
    return '<svg class="gn-ob-thread" viewBox="0 0 300 20" aria-hidden="true">' +
      '<line class="gn-ob-track" x1="' + pos[0] + '" y1="10" x2="' + pos[TOTAL - 1] + '" y2="10"/>' +
      '<line class="gn-ob-fill" x1="' + pos[0] + '" y1="10" x2="' + fillTo.toFixed(1) + '" y2="10"/>' + nodes + '</svg>';
  }

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'gn-ob';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', t('ob.dialogLabel'));
    overlay.innerHTML =
      '<div class="gn-ob-top">' +
        '<span class="gn-ob-count" aria-hidden="true"></span>' +
        '<div class="gn-ob-progress" role="progressbar" aria-valuemin="1" aria-valuemax="' + TOTAL + '"></div>' +
        '<button type="button" class="gn-ob-skip">' + esc(t('ob.skip')) + '</button>' +
      '</div>' +
      '<div class="gn-ob-main" data-ob-main></div>' +
      '<div class="gn-ob-foot">' +
        '<button type="button" class="gn-ob-back">' + esc(t('ob.back')) + '</button>' +
        '<button type="button" class="gn-ob-primary gn-auth-primary" data-ob-primary></button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.gn-ob-skip').addEventListener('click', function () { dismiss(false); });
    overlay.querySelector('.gn-ob-back').addEventListener('click', goBack);
    overlay.querySelector('[data-ob-primary]').addEventListener('click', function () {
      if (primarySpec && primarySpec.act) primarySpec.act();
    });
    overlay.addEventListener('click', function (e) {
      var langBtn = e.target.closest('[data-ob-lang]');
      if (langBtn) {
        try { if (window.GN_I18N && window.GN_I18N.setLang) window.GN_I18N.setLang(langBtn.getAttribute('data-ob-lang')); } catch (err) { /* ignore */ }
        return;
      }
      var card = e.target.closest('[data-ob-theme]');
      if (card) {
        try { if (window.GN_THEME && window.GN_THEME.set) window.GN_THEME.set(card.getAttribute('data-ob-theme')); } catch (err) { /* ignore */ }
        refreshComfortCards();
        return;
      }
      if (e.target.closest('[data-ob-later]')) { payoffVariant = 'empty'; navTo(3); }
      if (e.target.closest('[data-ob-later2]')) { navTo(5); }
      if (e.target.closest('[data-ob-start]')) { navTo(1); }
      if (e.target.closest('[data-ob-skipeq]')) { dismiss(false); }
    });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(false); return; }
      if (e.key === 'Tab') trapTab(e);
    });
    startStackWatch();
  }

  function refreshComfortCards() {
    if (!overlay) return;
    overlay.querySelectorAll('[data-ob-theme]').forEach(function (card) {
      var active = false;
      try { active = window.GN_THEME && window.GN_THEME.get ? window.GN_THEME.get() === card.getAttribute('data-ob-theme') : false; } catch (e) { /* ignore */ }
      card.setAttribute('aria-pressed', String(active));
    });
  }

  function trapTab(e) {
    if (!overlay) return;
    var focusables = Array.prototype.slice.call(
      overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    if (!focusables.length) return;
    var first = focusables[0]; var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* §2.9.2: the story surface hides while the celebrate exists. The
   * MutationObserver reacts on insertion (no 250 ms lag window); the
   * interval is the backstop. */
  var stackObserver = null;
  function startStackWatch() {
    stopStackWatch();
    var apply = function () {
      if (overlay) overlay.style.visibility = document.getElementById('gnFirstShotCelebrate') ? 'hidden' : '';
    };
    stackWatchTimer = window.setInterval(apply, 250);
    try {
      stackObserver = new MutationObserver(apply);
      stackObserver.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* interval backstop still runs */ }
  }
  function stopStackWatch() {
    if (stackWatchTimer) { window.clearInterval(stackWatchTimer); stackWatchTimer = null; }
    if (stackObserver) { try { stackObserver.disconnect(); } catch (e) { /* ignore */ } stackObserver = null; }
  }

  function renderScreen(i, dir) {
    if (!overlay) buildOverlay();
    current = i;
    markState(String(i));
    beatEnter(i);
    /* Spec A: "Beat n of 5" with Beat 0 pre-filled (endowed progress:
     * the thread lights its first node at progress 0). */
    overlay.querySelector('.gn-ob-count').textContent = t('nodki.host.beatOf', { n: i, total: TOTAL - 1 });
    var bar = overlay.querySelector('.gn-ob-progress');
    bar.setAttribute('aria-valuenow', String(i + 1));
    bar.setAttribute('aria-label', t('ob.progress', { n: i + 1, total: TOTAL }));
    bar.innerHTML = threadSvg(i / (TOTAL - 1));
    overlay.querySelector('.gn-ob-skip').style.display = (i === 0 || i === TOTAL - 1) ? 'none' : '';
    overlay.querySelector('.gn-ob-foot').style.display = i === 0 ? 'none' : '';
    var showBack = shown.length > 1 && !(i === 3 && payoffVariant === 'saved');
    overlay.querySelector('.gn-ob-back').style.visibility = showBack ? 'visible' : 'hidden';
    var main = overlay.querySelector('[data-ob-main]');
    main.innerHTML = SCREENS[i]();
    if (i === 3) {
      /* Beat 3 advances on one scrub/tap on the real curve visual
       * (the footer primary remains the keyboard equivalent). */
      var vis = main.querySelector('.gn-ob-visual');
      if (vis) {
        vis.style.cursor = 'pointer';
        vis.addEventListener('pointerdown', function h() {
          vis.removeEventListener('pointerdown', h);
          navTo(4);
        });
      }
    }
    overlay.querySelector('[data-ob-primary]').textContent = primarySpec ? primarySpec.label : '';
    main.classList.remove('gn-ob-in-f', 'gn-ob-in-b');
    void main.offsetWidth;
    main.classList.add(dir === 'back' ? 'gn-ob-in-b' : 'gn-ob-in-f');
    var title = main.querySelector('[data-ob-title]');
    if (title) {
      title.id = 'gnObTitle';
      overlay.setAttribute('aria-labelledby', 'gnObTitle');
      try { title.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function navTo(i) {
    if (current >= 0 && i > current) beatExit(current, 'complete');
    if (shown[shown.length - 1] !== i) shown.push(i);
    renderScreen(i, 'fwd');
  }
  function goBack() {
    if (shown.length < 2) return;
    shown.pop();
    renderScreen(shown[shown.length - 1], 'back');
  }
  function hideOverlay() { if (overlay) overlay.classList.add('gn-ob-hidden'); }
  function showOverlay() { if (overlay) overlay.classList.remove('gn-ob-hidden'); }

  function startRun(startIndex) {
    payoffVariant = 'saved';
    shotDegraded = false;
    shown = [];
    runStartAt = Date.now();
    navTo(Math.max(0, Math.min(TOTAL - 1, startIndex | 0)));
  }

  function dismiss(complete, opts) {
    opts = opts || {};
    var wasRun = !!overlay || !!guide;
    var lastBeat = current;
    teardownGuide();
    stopStackWatch();
    if (overlay) { overlay.remove(); overlay = null; }
    shown = []; current = -1;
    if (wasRun && replayRestore === null) {
      /* Spec A: persist progress + the ambient quiet window; a clean
       * finish hands the dashboard card a continuity line, an exit
       * hands it the neutral VAULT line. No guilt either way. */
      if (lastBeat >= 0) beatExit(lastBeat, complete ? 'complete' : 'skip');
      if (complete) writeProgress(TOTAL - 1, true);
      lsSet('gn_nodki_ob_done_at', String(Date.now()));
      if (complete) ssSet('gn_nodki_continuity', '1');
      else ssSet('gn_nodki_guide_exit', '1');
    }
    if (!opts.keepStamp) clearDoseStamp();
    if (replayRestore !== null) {
      replayRestore = null; // stored state was never overwritten (markState guard)
    } else {
      markState(complete ? 'complete' : 'skipped');
    }
    document.dispatchEvent(new CustomEvent('gn:onboarding-done', { detail: { complete: !!complete } }));
    document.dispatchEvent(new CustomEvent('gn:firstcontact-done', { detail: { complete: !!complete } }));
    var heading = document.querySelector('#pageDash .page-title, #pageDash h1, #pageDash h2');
    if (heading) { heading.setAttribute('tabindex', '-1'); try { heading.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  /* ---------------- dose-start stamp (§1.2 F) ---------------- */

  var stampedDoseStart = false;
  function stampDoseStart() {
    try { document.body.dataset.gnFcDoseStart = String(Date.now()); stampedDoseStart = true; } catch (e) { /* ignore */ }
  }
  function clearDoseStamp() {
    if (!stampedDoseStart) return;
    try { delete document.body.dataset.gnFcDoseStart; } catch (e) { /* ignore */ }
    stampedDoseStart = false;
  }

  /* ---------------- THE VISUAL GUIDE (§2.7) ----------------
   * Spotlight layer: four scrim panes leave a hole over the real
   * control; a static ring marks it; a one-line callout sits clear of
   * the hole and of the modal action bar. Steps advance only on real
   * actions (probes + the app's own events); the guide observes with
   * capture-phase listeners and never intercepts the target's events. */

  var guide = null;

  var GUIDE_LINES = {
    G1: 'ob.guide.stepLog', G2a: 'ob.guide.stepMed', G2b: 'ob.guide.stepDose',
    G2c: 'ob.guide.stepContinue', G2d: 'ob.guide.stepSite', G2e: 'ob.guide.stepSave',
    S1: 'nodki.host.b1Guide', C1: 'nodki.host.b4Guide'
  };
  var YIELD_SEL = '#futureTimestampConfirm, #arsOv, #phasesOv, #gnDatePickerOverlay, #csvImportOverlay, #loadoutRemoveOverlay, #logOv .cp-dropdown.open';

  function isVisibleTarget(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.15) return false;
    var r = el.getBoundingClientRect();
    return r.width >= 8 && r.height >= 8;
  }
  function hasRect(el) {
    if (!el || !el.getBoundingClientRect) return false;
    if (window.getComputedStyle(el).display === 'none') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function resolveStepTarget(step) {
    var i, candidates;
    if (step === 'S1') {
      var sd = document.getElementById('cpShotDayProf');
      return hasRect(sd) ? sd : null;
    }
    if (step === 'C1') {
      var sc = document.querySelector('#shotsRegionScanner .site-scanner');
      return hasRect(sc) ? sc : null;
    }
    if (step === 'G1') {
      candidates = ENTRY_SEL.split(', ');
      for (i = 0; i < candidates.length; i++) {
        var el = document.querySelector(candidates[i]);
        if (isVisibleTarget(el)) return el;
      }
      return null;
    }
    if (step === 'G2a') {
      var v = document.getElementById('cpShotMedVal');
      var tr = v && v.closest ? v.closest('.cp-select-trigger') : null;
      return hasRect(tr) ? tr : null;
    }
    if (step === 'G2b') {
      var d = document.getElementById('sDose');
      var g = d && d.closest ? d.closest('.form-group') : null;
      return hasRect(g) ? g : null;
    }
    if (step === 'G2c' || step === 'G2e') {
      var fire = document.querySelector('#logOv .gn-shot-fire') || document.getElementById('gnShotHdrSave');
      return hasRect(fire) ? fire : null;
    }
    if (step === 'G2d') {
      var zp = document.getElementById('modalZonePicker');
      if (hasRect(zp)) return zp;
      var loc = document.getElementById('modalSelectedLocation');
      var grp = loc && loc.closest ? (loc.closest('.scanner-location-display') || loc.closest('.form-group')) : null;
      return hasRect(grp) ? grp : null;
    }
    return null;
  }

  /* completion probes (§2.7.2): the old coach's reactivity pair */
  function probeMed() {
    var v = document.getElementById('cpShotMedVal');
    if (!v) return false;
    var txt = (v.textContent || '').trim();
    return !!txt && !v.classList.contains('placeholder') && !/^(select|selecciona|choose|elige)/i.test(txt);
  }
  function probeDose() {
    var d = document.getElementById('sDose');
    return !!d && String(d.value || '').trim() !== '';
  }
  function probeSite() {
    try {
      var ms = (typeof moduleState !== 'undefined') ? moduleState : (window.GNModules && window.GNModules.moduleState);
      if (ms && typeof ms.selectedLocation !== 'undefined') return !!ms.selectedLocation;
    } catch (e) { /* fall through to the DOM probe */ }
    var loc = document.getElementById('modalSelectedLocation');
    if (!loc) return false;
    var txt = (loc.textContent || '').trim();
    return !!txt && !/no injection site|sin sitio|ningún sitio/i.test(txt);
  }
  function stepVisible(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    return el.classList.contains('gn-on') || el.offsetParent !== null;
  }
  function fieldValid(key) {
    if (key === 'med') return probeMed();
    if (key === 'dose') { var d = document.getElementById('sDose'); return !!d && Number(d.value) > 0; }
    if (key === 'date') { var dd = document.getElementById('sDate'); return dd ? String(dd.value || '').trim() !== '' : true; }
    if (key === 'time') { var tm = document.getElementById('sTime'); return tm ? String(tm.value || '').trim() !== '' : true; }
    if (key === 'loc') return probeSite();
    return true;
  }
  function fieldTarget(key) {
    if (key === 'med') return resolveStepTarget('G2a');
    if (key === 'dose') return resolveStepTarget('G2b');
    if (key === 'loc') return resolveStepTarget('G2d');
    var input = document.getElementById(key === 'date' ? 'sDate' : 'sTime');
    var grp = input && input.closest ? input.closest('.form-group') : null;
    return hasRect(grp) ? grp : null;
  }
  function spawnedOverlayOpen() {
    var els = document.querySelectorAll(YIELD_SEL);
    for (var i = 0; i < els.length; i++) if (isVisibleTarget(els[i])) return els[i];
    return null;
  }

  function buildGuideDom() {
    var rootEl = document.createElement('div');
    rootEl.className = 'gn-ob-guide';
    rootEl.setAttribute('role', 'region');
    rootEl.setAttribute('aria-label', t('ob.guide.barLabel'));
    rootEl.innerHTML =
      '<div class="gn-ob-scrim" data-pane="top" aria-hidden="true"></div>' +
      '<div class="gn-ob-scrim" data-pane="bottom" aria-hidden="true"></div>' +
      '<div class="gn-ob-scrim" data-pane="left" aria-hidden="true"></div>' +
      '<div class="gn-ob-scrim" data-pane="right" aria-hidden="true"></div>' +
      '<div class="gn-ob-ring" aria-hidden="true"></div>' +
      '<div class="gn-ob-callout"><p class="gn-ob-callout-line" aria-live="polite"></p>' +
      '<button type="button" class="gn-ob-callout-skip">' + esc(t('ob.guide.skip')) + '</button>' +
      '<button type="button" class="gn-ob-callout-starter" hidden>' + esc(t('nodki.host.starterCta')) + '</button></div>';
    document.body.appendChild(rootEl);
    rootEl.querySelector('.gn-ob-callout-skip').addEventListener('click', function () { skipGuide(); });
    rootEl.querySelector('.gn-ob-callout-starter').addEventListener('click', function () { starterSchedule(); });
    return rootEl;
  }

  function startGuide(step) {
    if (guide) { setGuideStep(step); return; }
    var rootEl = buildGuideDom();
    guide = {
      step: null, root: rootEl, target: null, tries: 0, tick: null, placeTimer: null,
      blocked: null, yielded: false, yieldSince: 0, closedAt: 0, tapped: false,
      torn: false, docked: false, scrolledStep: '',
      s1Picked: false, s1WasOpen: false, backouts: 0,
      panes: {
        top: rootEl.querySelector('[data-pane="top"]'), bottom: rootEl.querySelector('[data-pane="bottom"]'),
        left: rootEl.querySelector('[data-pane="left"]'), right: rootEl.querySelector('[data-pane="right"]')
      },
      ring: rootEl.querySelector('.gn-ob-ring'),
      callout: rootEl.querySelector('.gn-ob-callout'),
      calloutLine: rootEl.querySelector('.gn-ob-callout-line'),
      calloutSkip: rootEl.querySelector('.gn-ob-callout-skip'),
      starterBtn: rootEl.querySelector('.gn-ob-callout-starter')
    };
    guide.tick = window.setInterval(guideTick, 250);
    document.addEventListener('click', guideDocClick, true);
    document.addEventListener('keydown', guideDocKey, true);
    document.addEventListener('gn:shot-saved', guideSaved);
    document.addEventListener('gn:coach-save-blocked', guideBlockedEvent);
    window.addEventListener('resize', guidePlaceSoon);
    window.addEventListener('scroll', guidePlaceSoon, true);
    setGuideStep(step);
  }

  function teardownGuide() {
    if (!guide) return;
    var g = guide; guide = null; g.torn = true;
    if (g.tick) window.clearInterval(g.tick);
    if (g.placeTimer) window.clearTimeout(g.placeTimer);
    document.removeEventListener('click', guideDocClick, true);
    document.removeEventListener('keydown', guideDocKey, true);
    document.removeEventListener('gn:shot-saved', guideSaved);
    document.removeEventListener('gn:coach-save-blocked', guideBlockedEvent);
    window.removeEventListener('resize', guidePlaceSoon);
    window.removeEventListener('scroll', guidePlaceSoon, true);
    if (g.root) g.root.remove();
  }

  function setGuideStep(step) {
    if (!guide) return;
    guide.step = step;
    guide.tries = 0;
    guide.tapped = false;
    guide.blocked = null;
    guide.closedAt = 0;
    guide.s1Picked = false;
    guide.s1WasOpen = false;
    guide.backouts = 0;
    if (guide.starterBtn) guide.starterBtn.hidden = true;
    undockCallout();
    setCalloutLine(t(GUIDE_LINES[step]), false);
    guide.callout.classList.remove('gn-ob-callout-in');
    void guide.callout.offsetWidth;
    guide.callout.classList.add('gn-ob-callout-in');
    resolveGuideTarget();
  }

  function resolveGuideTarget() {
    if (!guide || guide.torn) return;
    var el = resolveStepTarget(guide.step);
    if (el) {
      guide.target = el;
      guide.tries = 0;
      if (guide.scrolledStep !== guide.step) {
        guide.scrolledStep = guide.step;
        var r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
        }
      }
      placeGuide();
      return;
    }
    guide.target = null;
    guide.tries += 1;
    /* §2.7.2/§2.7.7 budgets: G1 gets the old 6 x 500 ms retry budget
     * before degrading; an in-modal target gets one re-resolve before
     * the guide exits silently. Spec A steps (S1/C1) never dead-end:
     * S1 degrades forward to the log beat, C1 back to its briefing. */
    var limit = (guide.step === 'G1' || guide.step === 'S1' || guide.step === 'C1') ? 6 : 1;
    if (guide.tries > limit) {
      if (guide.step === 'G1') degradeGuide();
      else if (guide.step === 'S1') { teardownGuide(); showOverlay(); navTo(2); }
      else if (guide.step === 'C1') { teardownGuide(); showOverlay(); }
      else silentExitGuide();
      return;
    }
    placeGuide();
    window.setTimeout(function () { if (guide && !guide.torn) resolveGuideTarget(); }, 500);
  }

  function setPane(el, x, y, w, h) {
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.width = Math.max(0, w) + 'px'; el.style.height = Math.max(0, h) + 'px';
  }

  function placeGuide() {
    if (!guide || guide.torn) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var p = guide.panes;
    if (!guide.target) {
      setPane(p.top, 0, 0, vw, vh); setPane(p.bottom, 0, 0, 0, 0);
      setPane(p.left, 0, 0, 0, 0); setPane(p.right, 0, 0, 0, 0);
      guide.ring.style.display = 'none';
      if (!guide.docked) guide.callout.style.display = 'none';
      return;
    }
    var r = guide.target.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) { guide.target = null; resolveGuideTarget(); return; }
    var hole = {
      left: Math.max(0, r.left - 8), top: Math.max(0, r.top - 8),
      right: Math.min(vw, r.right + 8), bottom: Math.min(vh, r.bottom + 8)
    };
    hole.width = hole.right - hole.left; hole.height = hole.bottom - hole.top;
    setPane(p.top, 0, 0, vw, hole.top);
    setPane(p.bottom, 0, hole.bottom, vw, vh - hole.bottom);
    setPane(p.left, 0, hole.top, hole.left, hole.height);
    setPane(p.right, hole.right, hole.top, vw - hole.right, hole.height);
    var ring = guide.ring;
    ring.style.display = '';
    ring.style.left = (hole.left - 4) + 'px'; ring.style.top = (hole.top - 4) + 'px';
    ring.style.width = (hole.width + 8) + 'px'; ring.style.height = (hole.height + 8) + 'px';
    if (!guide.docked) placeCallout(hole, vw, vh);
  }

  function placeCallout(hole, vw, vh) {
    var c = guide.callout;
    c.style.display = '';
    var w = c.offsetWidth, h = c.offsetHeight;
    var forbidden = [{ left: hole.left - 4, top: hole.top - 4, right: hole.right + 4, bottom: hole.bottom + 4 }];
    if (guide.step !== 'G1') {
      var bar = document.querySelector('#logOv .gn-shot-actionbar');
      if (bar) {
        var br = bar.getBoundingClientRect();
        forbidden.push({ left: br.left - 12, top: br.top - 12, right: br.right + 12, bottom: br.bottom + 12 });
      }
    }
    function clear(x, y) {
      var rect = { left: x, top: y, right: x + w, bottom: y + h };
      return !forbidden.some(function (f) {
        return rect.left < f.right && rect.right > f.left && rect.top < f.bottom && rect.bottom > f.top;
      });
    }
    var x = hole.left;
    if (hole.left + hole.width / 2 > (vw * 2) / 3) x = hole.right - w;
    x = Math.max(16, Math.min(x, vw - w - 16));
    var belowY = hole.bottom + 12;
    if (belowY + h <= vh - 8 && clear(x, belowY)) { setCalloutPos(x, belowY); return; }
    var aboveY = hole.top - 12 - h;
    if (aboveY >= 8 && clear(x, aboveY)) { setCalloutPos(x, aboveY); return; }
    var y = (vh - hole.bottom >= hole.top)
      ? Math.min(belowY, vh - h - 8)
      : Math.max(8, hole.top - 12 - h);
    y = Math.max(8, Math.min(y, vh - h - 8));
    if (clear(x, y)) { setCalloutPos(x, y); return; }
    dockCallout();
  }
  function setCalloutPos(x, y) {
    guide.callout.style.left = x + 'px';
    guide.callout.style.top = y + 'px';
  }
  function dockCallout() {
    var c = guide.callout;
    if (guide.step !== 'G1') {
      var panel = document.querySelector('#logOv .modal');
      if (panel) {
        panel.insertBefore(c, panel.firstChild);
        c.classList.add('is-docked');
        c.style.left = ''; c.style.top = ''; c.style.display = '';
        guide.docked = true;
        return;
      }
    }
    c.classList.add('is-docked-app');
    var tb = document.querySelector('.topbar');
    c.style.top = ((tb ? tb.getBoundingClientRect().bottom : 56) + 8) + 'px';
    c.style.left = '16px';
    guide.docked = true;
  }
  function undockCallout() {
    if (!guide) return;
    var c = guide.callout;
    if (c.parentElement !== guide.root) guide.root.appendChild(c);
    c.classList.remove('is-docked', 'is-docked-app');
    guide.docked = false;
  }

  function setCalloutLine(text, blocked) {
    if (!guide) return;
    guide.calloutLine.textContent = text;
    guide.calloutLine.classList.toggle('is-blocked', !!blocked);
    placeGuide();
  }

  function guidePlaceSoon() {
    if (!guide || guide.torn) return;
    if (guide.placeTimer) window.clearTimeout(guide.placeTimer);
    guide.placeTimer = window.setTimeout(placeGuide, 120);
  }

  function guideDocClick(e) {
    if (!guide || guide.torn) return;
    if (guide.target && (e.target === guide.target || (guide.target.contains && guide.target.contains(e.target)))) {
      guide.tapped = true;
    }
    if (guide.step === 'S1' && e.target && e.target.closest && e.target.closest('#cpShotDayProf .cp-option')) {
      guide.s1Picked = true; // the option's own handler fires saveProfileMed: this click IS the save event
    }
    if (guide.step === 'C1' && e.target && e.target.closest && e.target.closest('#shotsRegionScanner .biotech-zones [data-site]')) {
      completeCameo();
    }
  }

  function guideDocKey(e) {
    if (!guide || guide.torn) return;
    if (e.key === 'Escape') {
      /* §2.7.1: captured and stopped so an in-modal Escape never also
       * closes the modal. */
      e.preventDefault(); e.stopPropagation();
      skipGuide();
      return;
    }
    if (e.key !== 'Tab') return;
    /* Two-stop constraint (§2.7.1) — but focus already inside the
     * target (typing a custom dose) tabs naturally within it. */
    if (guide.target && guide.target.contains && guide.target.contains(document.activeElement)) return;
    var stops = [guide.calloutSkip];
    if (guide.target && guide.target.matches && guide.target.matches('button, a[href], input, select, textarea, [tabindex]')) {
      stops.push(guide.target);
    }
    var idx = stops.indexOf(document.activeElement);
    if (idx === -1) { e.preventDefault(); stops[0].focus(); return; }
    if (e.shiftKey && idx === 0) { e.preventDefault(); stops[stops.length - 1].focus(); }
    else if (!e.shiftKey && idx === stops.length - 1) { e.preventDefault(); stops[0].focus(); }
  }

  function guideProbes() {
    if (!guide || guide.torn) return;
    if (guide.blocked) { blockedTick(); return; }
    if (guide.step === 'G2a' && probeMed()) setGuideStep('G2b');
    else if (guide.step === 'G2b' && probeDose()) setGuideStep('G2c');
    else if (guide.step === 'G2c' && stepVisible('gnShotStep2')) setGuideStep('G2d');
    else if (guide.step === 'G2d' && probeSite()) setGuideStep('G2e');
  }

  /* Spec A beat 1: the schedule step completes on the real save event
   * (an option pick fires saveProfileMed). Backing out twice without
   * picking surfaces the one-tap starter escape hatch. Never a dead end. */
  function s1DropdownOpen() {
    var drop = document.getElementById('cpShotDayProfDrop');
    if (!drop) return false;
    if (drop.classList.contains('open')) return true;
    return window.getComputedStyle(drop).display !== 'none' && drop.getBoundingClientRect().height > 0;
  }
  function s1Tick() {
    if (!guide || guide.torn) return;
    if (guide.s1Picked) {
      if (!s1DropdownOpen()) completeSchedule();
      return;
    }
    var open = s1DropdownOpen();
    if (guide.s1WasOpen && !open) {
      guide.backouts += 1;
      if (guide.backouts >= 2 && guide.starterBtn) guide.starterBtn.hidden = false;
    }
    guide.s1WasOpen = open;
  }
  function completeSchedule() {
    teardownGuide();
    showOverlay();
    navTo(2);
  }
  function applyStarterSchedule() {
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var idx = new Date().getDay();
    try {
      if (typeof window.selectOpt === 'function' && typeof window.saveProfileMed === 'function') {
        window.selectOpt('cpShotDayProf', String(idx), days[idx], window.saveProfileMed);
        return true;
      }
    } catch (e) { /* fall through: the beat still completes */ }
    return false;
  }
  function starterSchedule() {
    applyStarterSchedule();
    completeSchedule();
  }
  /* Spec A beat 4: one site tap on the real scanner completes the cameo. */
  function completeCameo() {
    if (!guide || guide.torn) return;
    teardownGuide();
    showOverlay();
    navTo(5);
  }

  function guideTick() {
    if (!guide || guide.torn) return;
    if (guide.step === 'S1') { s1Tick(); if (guide && !guide.torn) placeGuide(); return; }
    if (guide.step === 'C1') { placeGuide(); return; }
    /* §2.7.6 yield: an overlay the modal spawned hides the guide whole */
    var spawned = spawnedOverlayOpen();
    if (spawned) {
      if (!guide.yielded) {
        guide.yielded = true;
        guide.yieldSince = Date.now();
        guide.root.style.display = 'none';
      }
      var closedLong = !logModalOpen() && Date.now() - guide.yieldSince > 90000;
      if (!closedLong) return;
    } else if (guide.yielded) {
      guide.yielded = false;
      guide.root.style.display = '';
      if (logModalOpen()) { guideProbes(); placeGuide(); return; }
    }
    if (guide.step === 'G1') {
      if (guide.tapped && logModalOpen()) { setGuideStep('G2a'); return; }
    } else {
      if (!logModalOpen()) {
        if (!guide.closedAt) guide.closedAt = Date.now();
        if (Date.now() - guide.closedAt > 1200) { guide.closedAt = 0; retreatToG1(); }
        return;
      }
      guide.closedAt = 0;
      guideProbes();
      if (!guide || guide.torn) return;
    }
    placeGuide(); // watchdog recompute (§2.7.1)
  }

  /* §2.7.4: save-blocked surfacing */
  function guideBlockedEvent(e) {
    if (!guide || guide.torn) return;
    if (guide.step !== 'G2c' && guide.step !== 'G2e') return;
    var fields = (e.detail && e.detail.fields) || [];
    if (!fields.length) return;
    guide.blocked = { fields: fields.slice(), step: guide.step };
    var names = fields.map(function (f) { return t('ob.guide.field.' + f); }).join(', ');
    setCalloutLine(t('ob.guide.blocked', { fields: names }), true);
    for (var i = 0; i < fields.length; i++) {
      var ft = fieldTarget(fields[i]);
      if (ft && elementInVisibleStep(ft)) { guide.target = ft; break; }
    }
    placeGuide();
  }
  function elementInVisibleStep(el) {
    if (!el || !el.closest) return false;
    var section = el.closest('#gnShotStep1') || el.closest('#gnShotStep2');
    if (!section) return true; // e.g. the action bar lives outside the steps
    return stepVisible(section.id);
  }
  function blockedTick() {
    if (!guide.blocked) return;
    var ok = guide.blocked.fields.every(function (f) { return fieldValid(f); });
    if (!ok) return;
    var step = guide.blocked.step;
    guide.blocked = null;
    setCalloutLine(t(GUIDE_LINES[step]), false);
    guide.target = resolveStepTarget(step);
    placeGuide();
  }

  function guideSaved() {
    if (!guide || guide.torn || guide.step === 'G1') return;
    teardownGuide();
    payoffVariant = 'saved';
    metricsUpdate(function (m) {
      if (!m.firstLogAt) { m.firstLogAt = Date.now(); m.firstLogMs = runStartAt ? Date.now() - runStartAt : null; }
    });
    whenClear(function () { showOverlay(); navTo(3); });
  }

  /* §2.9 serialization: advance only once celebrate + modals are gone.
   * "Clear" must be SUSTAINED (500 ms): the celebrate is inserted by
   * the save flow just after the modal closes, and a single clear poll
   * in that gap would render the payoff underneath it. */
  function whenClear(cb) {
    var clearSince = 0;
    var iv = window.setInterval(function () {
      if (stackBlocked()) { clearSince = 0; return; }
      if (!clearSince) { clearSince = Date.now(); return; }
      if (Date.now() - clearSince >= 500) { window.clearInterval(iv); cb(); }
    }, 250);
  }

  function skipGuide() {
    if (!guide) return;
    if (guide.step === 'S1') { completeSchedule(); return; } // skipping the beat moves forward
    if (guide.step === 'C1') { completeCameo(); return; }
    if (guide.step === 'G1') {
      /* §2.7.5 G1: back to the story surface at the payoff-empty screen */
      teardownGuide();
      clearDoseStamp();
      payoffVariant = 'empty';
      showOverlay();
      navTo(3);
    } else {
      /* §2.7.5 G2: the guide exits; the modal stays exactly as left */
      dismiss(false, { keepStamp: true });
    }
  }

  function retreatToG1() {
    if (!guide) return;
    guide.root.style.display = '';
    guide.yielded = false;
    setGuideStep('G1');
  }

  /* §2.7.7: degrade to the story surface, never point at nothing */
  function degradeGuide() {
    teardownGuide();
    shotDegraded = true;
    showOverlay();
    renderScreen(2, 'fwd');
  }
  function silentExitGuide() {
    teardownGuide();
    markState('2');
  }

  function refreshGuideCopy() {
    if (!guide) return;
    guide.root.setAttribute('aria-label', t('ob.guide.barLabel'));
    guide.calloutSkip.textContent = t('ob.guide.skip');
    if (guide.starterBtn) guide.starterBtn.textContent = t('nodki.host.starterCta');
    if (guide.blocked) {
      var names = guide.blocked.fields.map(function (f) { return t('ob.guide.field.' + f); }).join(', ');
      setCalloutLine(t('ob.guide.blocked', { fields: names }), true);
    } else {
      setCalloutLine(t(GUIDE_LINES[guide.step]), false);
    }
  }

  /* ---------------- hand-offs (beats -> real surfaces) ---------------- */

  /* Beat 1: spotlight the real SHOT DAY control on the profile page.
   * Completion is the save event itself (see s1Tick). */
  function beginScheduleGuide() {
    markState('guide');
    hideOverlay();
    try {
      if (typeof window.showPage === 'function') {
        window.showPage('Profile', document.getElementById('navVault'));
      }
    } catch (e) { /* resolution below degrades forward */ }
    var sb = document.getElementById('scrollBody');
    if (sb) sb.scrollTop = 0;
    window.setTimeout(function () {
      var el = document.getElementById('cpShotDayProf');
      if (el) { try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ } }
      startGuide('S1');
    }, 450);
  }

  /* Beat 4: the scanner cameo on the real HISTORY scanner. No camera,
   * no capture: one site tap (or Skip / Later) completes it. */
  function beginScannerCameo() {
    markState('guide');
    hideOverlay();
    try {
      if (typeof window.showPage === 'function') {
        window.showPage('History', document.getElementById('navLog'));
      }
    } catch (e) { /* resolution below degrades back to the briefing */ }
    window.setTimeout(function () {
      var r = document.getElementById('shotsRegionScanner');
      if (r) { try { r.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ } }
      startGuide('C1');
    }, 450);
  }

  function beginGuide() {
    stampDoseStart();
    markState('guide');
    shotDegraded = false;
    try {
      if (typeof window.showPage === 'function') {
        window.showPage('Dash', document.getElementById('navDash'));
      }
    } catch (e) { /* guide resolution below degrades gracefully */ }
    var sb = document.getElementById('scrollBody');
    if (sb) sb.scrollTop = 0;
    hideOverlay();
    startGuide('G1');
  }

  function degradedOpenLog() {
    markState('guide');
    hideOverlay();
    try { if (typeof window.openLogModal === 'function') window.openLogModal(); } catch (e) { /* ignore */ }
    var tries = 0;
    var iv = window.setInterval(function () {
      tries += 1;
      if (logModalOpen()) { window.clearInterval(iv); startGuide('G2a'); }
      else if (tries > 20) window.clearInterval(iv);
    }, 250);
  }

  /* ---------------- F3 queue (whatsnew first, both directions) -----
   * The contract the shipped gridnode-whatsnew.js implements (and First
   * Contact ran against): a genuine first run is acknowledged silently
   * and whatsnew dispatches gn:whatsnew-resolved; a shown changelog
   * releases waiters on gn:whatsnew-dismissed; GN_WHATS_NEW
   * .shouldAutoShow() reports an auto-show still pending. This engine
   * loads before whatsnew in the deferred batch, so the listeners
   * below are registered before whatsnew can dispatch. */
  var whatsnewResolved = false;
  function markWhatsNewResolved() { whatsnewResolved = true; }
  document.addEventListener('gn:whatsnew-resolved', markWhatsNewResolved);
  document.addEventListener('gn:whatsnew-dismissed', markWhatsNewResolved);
  /* Reverse direction (§1.2 E): if whatsnew ever shows over the story
   * surface, the guide yields by dismissing (the old safety rule). */
  document.addEventListener('gn:whatsnew-shown', function () {
    if (overlay) dismiss(false);
  });

  function wnOverlayOpen() {
    var wn = document.getElementById('gnWhatsNewOverlay');
    if (!wn) return false;
    return wn.classList.contains('active') || window.getComputedStyle(wn).display !== 'none';
  }
  function wnPending() {
    try {
      return !!(window.GN_WHATS_NEW && window.GN_WHATS_NEW.shouldAutoShow && window.GN_WHATS_NEW.shouldAutoShow());
    } catch (e) { return false; }
  }
  function startWhenWhatsNewClears(begin) {
    var tries = 0;
    var check = function () {
      if (wnOverlayOpen() || wnPending() || !whatsnewResolved) {
        tries += 1;
        /* If whatsnew itself never loads there is nothing to serialize
         * with; proceed rather than stranding the guide forever. */
        if (tries > 40 && !window.GN_WHATS_NEW) { begin(); return; }
        window.setTimeout(check, 700);
        return;
      }
      begin();
    };
    check();
  }

  function resumeIndex(raw) {
    /* Spec A (1.3.0): progress persists across sessions — resume at the
     * same beat, never restart. The persisted progress store is the
     * authority; the v3 state string mirrors it. */
    var prog = readProgress();
    var pb = prog && typeof prog.beat === 'number' ? prog.beat : null;
    if (raw === 'guide') return pb !== null ? pb : 2; // never resume into a live spotlight
    var idx = parseInt(raw, 10);
    if (!isNaN(idx) && idx >= 0 && idx < TOTAL) return idx;
    if (pb !== null && pb >= 0 && pb < TOTAL) return pb;
    return 0;
  }

  function maybeAutoStart() {
    if (isActive()) return;
    var raw = readState();
    if (isTerminal(raw)) return;
    if (isTerminal(lsGet(LEGACY_STATE_KEY)) || lsGet(LEGACY_STATE_KEY) === 'complete') return;
    if (lsGet(LEGACY_DISMISSED_KEY) === '1') return;
    if (hasAnyShot()) {
      /* A run that already banked its first log resumes at its payoff
       * beats instead of dying silently; earlier beats stay gated. */
      var prog = readProgress();
      if (!(prog && !prog.done && typeof prog.beat === 'number' && prog.beat >= 3)) return;
    }
    if (!inApp()) return;
    startWhenWhatsNewClears(function () {
      if (isActive() || !inApp()) return;
      var resumeAt = resumeIndex(raw); // read the session flag BEFORE stamping it for this run
      ssSet(SESSION_KEY, '1');
      startRun(resumeAt);
    });
  }

  /* ---------------- public API ---------------- */

  function apiStart() {
    if (isActive() || !inApp()) return;
    startWhenWhatsNewClears(function () {
      if (isActive() || !inApp()) return;
      ssSet(SESSION_KEY, '1');
      startRun(0);
    });
  }
  function apiRestart() {
    if (isActive()) return; // replay while open: no-op (§2.10)
    var prior = readState();
    replayRestore = prior === null ? '__absent__' : prior;
    if (!inApp()) { replayRestore = null; return; }
    startWhenWhatsNewClears(function () {
      if (isActive() || !inApp()) { replayRestore = null; return; }
      ssSet(SESSION_KEY, '1');
      startRun(0);
    });
  }
  function apiResume() {
    if (isActive() || !inApp()) return;
    var raw = readState();
    if (isTerminal(raw)) return;
    startWhenWhatsNewClears(function () {
      if (isActive() || !inApp()) return;
      ssSet(SESSION_KEY, '1');
      startRun(resumeIndex(raw));
    });
  }
  function apiState() { return { raw: readState(), screen: current, active: isActive() }; }

  window.GN_ONBOARDING = Object.freeze({
    start: apiStart,
    restart: apiRestart,
    resume: apiResume,
    dismiss: function () { dismiss(false); },
    state: apiState,
    progress: function () { return readProgress(); },
    metrics: function () { try { return JSON.parse(lsGet(METRICS_KEY) || 'null'); } catch (e) { return null; } },
    screen: function () { return current; },
    active: isActive
  });
  /* Compat alias (§5.2): whatsnew + VAULT replay keep working untouched. */
  window.GN_FIRSTCONTACT = window.GN_ONBOARDING;

  /* ---------------- boot ---------------- */

  document.addEventListener('gn:langchange', function () {
    if (overlay && current >= 0) renderScreen(current, 'fwd');
    else if (guide) refreshGuideCopy();
  });

  var booted = false;
  var bootWatch = window.setInterval(function () {
    if (!booted && inApp()) {
      booted = true;
      maybeAutoStart();
    }
  }, 500);
  window.setTimeout(function () { window.clearInterval(bootWatch); }, 120000);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.setTimeout(maybeAutoStart, 800);
  } else {
    document.addEventListener('DOMContentLoaded', function () { window.setTimeout(maybeAutoStart, 800); });
  }
})();
