/* GRID//NODE Phase Engine — refined hero
 * Calm, premium phase display. Template-matched ring, quiet center readout,
 * Now/Watch/Do guidance, phase preview, countdown. Restraint by design:
 * no spinning bezels, no sonar pings, no scanlines, no flash animations.
 * Reads template from most recent logged shot's medication.
 * Phase clock: weekly/generic = since last shot; cycle = since first shot of template.
 * Read-only: never writes or syncs data.
 */
(function phaseHeroModule() {
  'use strict';

  var T = function () { return window.GNPhaseTemplates || null; };
  var $ = function (id) { return document.getElementById(id); };
  var tx = function (key, fallback, vars) {
    try {
      if (window.GN_I18N && window.GN_I18N.text) return window.GN_I18N.text(key, fallback, vars) || fallback;
    } catch (_) {}
    return fallback;
  };
  var setText = function (id, value) {
    var node = $(id);
    if (node && node.textContent !== value) node.textContent = value;
  };

  var state = {
    template: null,
    progress: 0,
    phaseIndex: -1,
    previewIndex: -1,
    tab: 'now',
    lastShot: null,
    cycleStart: null,
    started: false,
    wasEmpty: true
  };

  var SVGNS = 'http://www.w3.org/2000/svg';
  var ARC_R = 0.42; // arc band radius, 0..1 box units

  /* ---------------- data ---------------- */

  function activeShots() {
    var now = Date.now();
    var records = [];
    try { records = window.GN && window.GN.S ? window.GN.S.get('shots', []) : []; } catch (_) {}
    return (Array.isArray(records) ? records : [])
      .filter(function (r) {
        var t = new Date(r && r.date).getTime();
        return r && !r.archived && Number.isFinite(t) && t <= now;
      })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  }

  function medIdOf(record) {
    try {
      if (window.GNModules && window.GNModules.normalizeMedicationId) {
        return window.GNModules.normalizeMedicationId(record && record.med) || '';
      }
    } catch (_) {}
    return String((record && record.med) || '');
  }

  function computeState() {
    var tpl = T();
    if (!tpl) return null;
    var shots = activeShots();
    if (!shots.length) return { empty: true };

    var last = shots[shots.length - 1];
    var template = tpl.templateForMed(medIdOf(last));

    // Cycle start depends on template type
    var cycleStart;
    if (template.type === 'cycle') {
      // First shot logged with a med matching this template
      var matching = shots.filter(function (s) {
        return tpl.templateForMed(medIdOf(s)).id === template.id;
      });
      cycleStart = new Date((matching[0] || last).date).getTime();
    } else {
      cycleStart = new Date(last.date).getTime();
    }

    var elapsedDays = Math.max(0, (Date.now() - cycleStart) / 86400000);
    var progress = tpl.clamp01(elapsedDays / template.cycleDays);
    var active = tpl.activePhase(template, progress);

    return {
      empty: false,
      shots: shots,
      last: last,
      template: template,
      cycleStart: cycleStart,
      elapsedDays: elapsedDays,
      progress: progress,
      phaseIndex: active.index,
      phase: active.phase
    };
  }

  /* ---------------- SVG build ---------------- */

  function buildArcs(template) {
    var tpl = T();
    var g = $('reactorArcs');
    if (!g || !tpl) return;
    g.innerHTML = '';
    template.phases.forEach(function (phase, idx) {
      var path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', tpl.arcPath(phase, ARC_R, 100));
      path.setAttribute('stroke', phase.color);
      path.setAttribute('stroke-width', '5.5');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('fill', 'none');
      path.setAttribute('class', 'gn-parc todo');
      path.dataset.phaseIdx = idx;
      g.appendChild(path);
    });
  }

  function buildNodes(template) {
    var tpl = T();
    var g = $('reactorNodes');
    if (!g || !tpl) return;
    g.innerHTML = '';
    template.phases.forEach(function (phase, idx) {
      var pos = tpl.phaseNode(phase);
      var grp = document.createElementNS(SVGNS, 'g');
      grp.setAttribute('class', 'gn-pnode todo');
      grp.dataset.phaseIdx = idx;
      grp.setAttribute('tabindex', '0');
      grp.setAttribute('role', 'button');
      grp.setAttribute('aria-label', tpl.phaseName(phase));

      var ang = (pos.deg - 90) * Math.PI / 180;
      var cx = (50 + ARC_R * 100 * Math.cos(ang)).toFixed(2);
      var cy = (50 + ARC_R * 100 * Math.sin(ang)).toFixed(2);

      // Generous invisible hit area (>=44px touch target at 280px render)
      var hit = document.createElementNS(SVGNS, 'circle');
      hit.setAttribute('cx', cx); hit.setAttribute('cy', cy);
      hit.setAttribute('r', '8'); hit.setAttribute('fill', 'transparent');

      var dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
      dot.setAttribute('r', '2.6'); dot.setAttribute('class', 'dot');
      dot.setAttribute('fill', phase.color);

      grp.appendChild(hit);
      grp.appendChild(dot);
      grp.addEventListener('click', function () { enterPreview(idx); });
      grp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterPreview(idx); }
      });
      g.appendChild(grp);
    });
  }

  /* ---------------- render ---------------- */

  function fmtCountdown(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '--';
    var totalH = Math.floor(ms / 3600000);
    var d = Math.floor(totalH / 24), h = totalH % 24;
    if (d > 0) return d + 'd ' + h + 'h';
    var m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  function fmtSince(days) {
    if (days < 1) {
      var h = Math.max(0, Math.floor(days * 24));
      return tx('phase.sinceHours', '{h}h', { h: h });
    }
    var d = Math.floor(days);
    var hh = Math.floor((days - d) * 24);
    return tx('phase.sinceDays', '{d}d {h}h', { d: d, h: hh });
  }

  function render() {
    var tpl = T();
    if (!tpl) return;
    var panel = $('phaseSpherePanel');
    if (!panel || !window.GN || !window.GN.S) return;

    var s = computeState();
    if (!s || s.empty) {
      panel.dataset.phase = 'empty';
      state.wasEmpty = true;
      state.template = null;
      state.previewIndex = -1;
      setText('reactorMetaLine', tx('phase.noCycle', 'NO CYCLE'));
      setText('reactorPhaseName', tx('runtime.awaitingFirstShot', 'AWAITING FIRST SHOT'));
      setText('reactorCountdown', '--');
      setText('reactorCountdownLabel', tx('phase.untilNextShot', 'UNTIL NEXT SHOT'));
      var ignite = $('reactorIgnite');
      if (ignite) {
        ignite.hidden = false;
        ignite.textContent = tx('phase.logFirstShot', 'LOG FIRST SHOT');
      }
      var arcs = $('reactorArcs');
      if (arcs) arcs.innerHTML = '';
      var nodes = $('reactorNodes');
      if (nodes) nodes.innerHTML = '';
      var tl = $('reactorTimeline');
      if (tl) tl.innerHTML = '';
      return;
    }

    var igniteBtn = $('reactorIgnite');
    if (igniteBtn) igniteBtn.hidden = true;
    panel.dataset.phase = 'active';

    var templateChanged = !state.template || state.template.id !== s.template.id;

    state.template = s.template;
    state.progress = s.progress;
    state.phaseIndex = s.phaseIndex;
    state.lastShot = s.last;
    state.cycleStart = s.cycleStart;

    if (templateChanged) {
      buildArcs(s.template);
      buildNodes(s.template);
      buildTimeline(s.template);
      // NOTE: #reactorTemplateChip carries no data-i18n; JS owns its text so
      // applyTo() can never clobber it back to a stale default.
      setText('reactorTemplateChip', tpl.templateChip(s.template));
      state.previewIndex = -1;
    }

    updateArcs(s);
    updateCenter(s);
    updateTiming(s);
    updateGuidance(s);
    updateTimelineStates();

    if (state.wasEmpty) state.wasEmpty = false;
    state.started = true;
  }

  function updateArcs(s) {
    var arcs = $('reactorArcs');
    if (arcs) {
      var paths = arcs.children;
      for (var i = 0; i < paths.length; i++) {
        var cls = 'gn-parc todo';
        if (i < s.phaseIndex) cls = 'gn-parc done';
        else if (i === s.phaseIndex) cls = 'gn-parc active';
        if (state.previewIndex >= 0) {
          cls = i === state.previewIndex ? 'gn-parc active' : 'gn-parc todo';
        }
        paths[i].setAttribute('class', cls);
      }
    }
    var nodes = $('reactorNodes');
    if (nodes) {
      var groups = nodes.children;
      for (var j = 0; j < groups.length; j++) {
        var ncls = 'gn-pnode todo';
        if (j < s.phaseIndex) ncls = 'gn-pnode done';
        else if (j === s.phaseIndex) ncls = 'gn-pnode active';
        if (state.previewIndex >= 0) {
          ncls = j === state.previewIndex ? 'gn-pnode active' : 'gn-pnode todo';
        }
        groups[j].setAttribute('class', ncls);
      }
    }
  }

  function updateCenter(s) {
    var tpl = T();
    var effIdx = state.previewIndex >= 0 ? state.previewIndex : s.phaseIndex;
    var phase = s.template.phases[effIdx];

    // Quiet metadata line: PHASE 3 / 6 · PEAK EFFECT
    var meta = tx('phase.phaseN', 'PHASE {n} / {total}', {
      n: effIdx + 1, total: s.template.phases.length
    }) + ' · ' + tpl.phaseName(phase);
    if (state.previewIndex >= 0) {
      meta = tx('phase.previewLabel', 'PREVIEW · {phase}', { phase: tpl.phaseName(phase) });
    }
    setText('reactorMetaLine', meta);

    var nameEl = $('reactorPhaseName');
    if (nameEl) {
      var name = tpl.phaseName(phase);
      if (nameEl.textContent !== name) nameEl.textContent = name;
    }

    // Countdown: weekly/generic = until next shot; cycle = remaining in cycle
    var cycleMs = s.template.cycleDays * 86400000;
    var remaining = s.cycleStart + cycleMs - Date.now();
    setText('reactorCountdown', fmtCountdown(remaining));
    setText('reactorCountdownLabel', s.template.type === 'cycle'
      ? tx('phase.remainingInCycle', 'REMAINING IN CYCLE')
      : tx('phase.untilNextShot', 'UNTIL NEXT SHOT'));

    // Soft color wash on the hero for the active phase — subtle, static
    var wrap = $('reactorSphereWrap');
    if (wrap) wrap.style.setProperty('--phase-color', phase.color);
  }

  function updateTiming(s) {
    setText('reactorTimeSince', fmtSince(s.elapsedDays));
    setText('reactorCyclePos', Math.round(s.progress * 100) + '%');
    var cycleMs = s.template.cycleDays * 86400000;
    setText('reactorNextShot', fmtCountdown(s.cycleStart + cycleMs - Date.now()));
  }

  function updateGuidance(s) {
    var tpl = T();
    var effIdx = state.previewIndex >= 0 ? state.previewIndex : s.phaseIndex;
    var phase = s.template.phases[effIdx];
    var lines = tpl.phaseLines(phase, state.tab);

    var head = $('reactorPanelHead');
    var headText = state.previewIndex >= 0
      ? tx('phase.previewLabel', 'PREVIEW · {phase}', { phase: tpl.phaseName(phase) })
      : tpl.phaseName(phase);
    if (head && head.textContent !== headText) head.textContent = headText;

    var list = $('reactorList');
    if (list) {
      var html = lines.map(function (line) {
        var isFlag = /^RED FLAG/i.test(line) || /contact your provider/i.test(line);
        return '<li class="' + (isFlag ? 'flag' : '') + '">' + escapeHtml(line) + '</li>';
      }).join('');
      if (list.dataset.sig !== effIdx + ':' + state.tab + ':' + html.length) {
        list.innerHTML = html;
        list.dataset.sig = effIdx + ':' + state.tab + ':' + html.length;
      }
    }

    var ret = $('reactorReturn');
    if (ret) {
      ret.hidden = state.previewIndex < 0;
      if (!ret.hidden) ret.textContent = tx('phase.returnToLive', 'RETURN TO LIVE');
    }

    // Tabs
    var tabs = document.querySelectorAll('.gn-phase-tab');
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.dataset.rtab === state.tab);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildTimeline(template) {
    var tpl = T();
    var tl = $('reactorTimeline');
    if (!tl || !tpl) return;
    tl.innerHTML = '';
    template.phases.forEach(function (phase, idx) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gn-phase-chip';
      chip.setAttribute('role', 'listitem');
      chip.innerHTML = '<span class="n">' + (idx + 1) + '</span><span>' + escapeHtml(tpl.phaseName(phase)) + '</span>';
      chip.addEventListener('click', function () { enterPreview(idx); });
      tl.appendChild(chip);
    });
    updateTimelineStates();
  }

  function updateTimelineStates() {
    var tl = $('reactorTimeline');
    if (!tl) return;
    var chips = tl.children;
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('done', i < state.phaseIndex);
      var isLive = state.previewIndex >= 0 ? i === state.previewIndex : i === state.phaseIndex;
      chips[i].classList.toggle('live', isLive);
    }
  }

  /* ---------------- interactions ---------------- */

  function enterPreview(idx) {
    if (!state.template) return;
    state.previewIndex = (state.previewIndex === idx) ? -1 : idx;
    var s = computeState();
    if (s && !s.empty) {
      updateArcs(s);
      updateCenter(s);
      updateGuidance(s);
      updateTimelineStates();
    }
  }

  function exitPreview() {
    if (state.previewIndex < 0) return;
    state.previewIndex = -1;
    var s = computeState();
    if (s && !s.empty) {
      updateArcs(s);
      updateCenter(s);
      updateGuidance(s);
      updateTimelineStates();
    }
  }

  function stepPhase(dir) {
    if (!state.template) return;
    var n = state.template.phases.length;
    var cur = state.previewIndex >= 0 ? state.previewIndex : state.phaseIndex;
    var next = (cur + dir + n) % n;
    state.previewIndex = next;
    var s = computeState();
    if (s && !s.empty) {
      updateArcs(s);
      updateCenter(s);
      updateGuidance(s);
      updateTimelineStates();
    }
  }

  /* ---------------- wiring ---------------- */

  function wireEvents() {
    // Tabs
    document.querySelectorAll('.gn-phase-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.tab = t.dataset.rtab || 'now';
        var s = computeState();
        if (s && !s.empty) updateGuidance(s);
      });
    });

    // Return to live
    var ret = $('reactorReturn');
    if (ret) ret.addEventListener('click', exitPreview);

    // Template chip -> scroll timeline into view
    var chip = $('reactorTemplateChip');
    if (chip) chip.addEventListener('click', function () {
      var tl = $('reactorTimeline');
      if (tl) tl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Why disclosure
    var whyBtn = $('reactorWhyBtn');
    var whyBody = $('reactorWhyBody');
    if (whyBtn && whyBody) {
      whyBtn.addEventListener('click', function () {
        var open = whyBody.hidden;
        whyBody.hidden = !open;
        whyBtn.setAttribute('aria-expanded', String(open));
      });
    }

    // Swipe on guidance panel to step through phases
    var panel = $('reactorPanel');
    if (panel) {
      var startX = 0;
      panel.addEventListener('touchstart', function (e) {
        startX = e.touches[0].clientX;
      }, { passive: true });
      panel.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 48) stepPhase(dx < 0 ? 1 : -1);
      }, { passive: true });
    }

    // Ignite -> open log shot sheet
    var ignite = $('reactorIgnite');
    if (ignite) ignite.addEventListener('click', function () {
      try { if (window.openLogShot) window.openLogShot(); } catch (_) {}
    });

    // Re-render on shot save, language change, visibility
    document.addEventListener('gn:shot-saved', function () { setTimeout(render, 300); });
    document.addEventListener('gn:langchange', function () {
      state.template = null; // force rebuild for new language
      render();
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) render();
    });
  }

  function tick() {
    // Countdown + phase check once per minute
    render();
  }

  function start() {
    var tpl = T();
    if (!tpl || !window.GN || !window.GN.S || !$('phaseSpherePanel')) {
      window.setTimeout(start, 150);
      return;
    }
    wireEvents();
    render();
    window.setInterval(tick, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
