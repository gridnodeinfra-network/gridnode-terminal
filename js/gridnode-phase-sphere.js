/* GRID//NODE Phase Engine Reactor Core
 * Replaces the static phase sphere with a living reactor core.
 * Reads template from most recent logged shot's medication.
 * Phase clock: weekly/generic = since last shot; cycle = since first shot of template.
 * Read-only: never writes or syncs data.
 */
(function reactorCoreModule() {
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

  function buildTicks() {
    var g = $('reactorTicks');
    if (!g || g.childElementCount) return;
    for (var i = 0; i < 60; i++) {
      var line = document.createElementNS(SVGNS, 'line');
      var major = i % 5 === 0;
      var r1 = major ? 46.5 : 47.5, r2 = 49;
      var a = (i * 6 - 90) * Math.PI / 180;
      line.setAttribute('x1', (50 + r1 * Math.cos(a)).toFixed(2));
      line.setAttribute('y1', (50 + r1 * Math.sin(a)).toFixed(2));
      line.setAttribute('x2', (50 + r2 * Math.cos(a)).toFixed(2));
      line.setAttribute('y2', (50 + r2 * Math.sin(a)).toFixed(2));
      if (major) line.style.strokeWidth = '0.7';
      g.appendChild(line);
    }
  }

  function buildArcs(template) {
    var tpl = T();
    var g = $('reactorArcs');
    if (!g || !tpl) return;
    g.innerHTML = '';
    template.phases.forEach(function (phase, idx) {
      var path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', tpl.arcPath(phase, 0.42, 100));
      path.setAttribute('stroke', phase.color);
      path.setAttribute('class', 'gn-reactor-arc-todo');
      path.dataset.phaseIdx = idx;
      path.style.color = phase.color;
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
      grp.setAttribute('class', 'gn-reactor-node todo');
      grp.dataset.phaseIdx = idx;
      grp.setAttribute('tabindex', '0');
      grp.setAttribute('role', 'button');
      grp.setAttribute('aria-label', tpl.phaseName(phase));

      var cx = (pos.x * 100).toFixed(2), cy = (pos.y * 100).toFixed(2);
      // Position on the arc band radius (0.42 of viewBox)
      var ang = (pos.deg - 90) * Math.PI / 180;
      cx = (50 + 42 * Math.cos(ang)).toFixed(2);
      cy = (50 + 42 * Math.sin(ang)).toFixed(2);

      var halo1 = document.createElementNS(SVGNS, 'circle');
      halo1.setAttribute('cx', cx); halo1.setAttribute('cy', cy);
      halo1.setAttribute('r', '3.2'); halo1.setAttribute('class', 'halo h1');
      halo1.setAttribute('stroke', phase.color);
      var halo2 = halo1.cloneNode();
      halo2.setAttribute('class', 'halo h2');

      var hit = document.createElementNS(SVGNS, 'circle');
      hit.setAttribute('cx', cx); hit.setAttribute('cy', cy);
      hit.setAttribute('r', '7'); hit.setAttribute('fill', 'transparent');

      var dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
      dot.setAttribute('r', '2.8'); dot.setAttribute('class', 'dot');
      dot.setAttribute('fill', phase.color);
      dot.style.color = phase.color;

      grp.appendChild(halo1); grp.appendChild(halo2);
      grp.appendChild(hit); grp.appendChild(dot);
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
      panel.dataset.reactor = 'empty';
      state.wasEmpty = true;
      state.template = null;
      setText('reactorPhaseNum', tx('phase.noCycle', 'NO CYCLE'));
      setText('reactorPhaseName', tx('runtime.awaitingFirstShot', 'AWAITING FIRST SHOT'));
      setText('reactorCountdown', '--');
      var ignite = $('reactorIgnite');
      if (ignite) ignite.hidden = false;
      return;
    }

    var igniteBtn = $('reactorIgnite');
    if (igniteBtn) igniteBtn.hidden = true;
    panel.dataset.reactor = 'active';

    var templateChanged = !state.template || state.template.id !== s.template.id;
    var phaseChanged = state.started && state.phaseIndex !== s.phaseIndex && !state.wasEmpty;

    state.template = s.template;
    state.progress = s.progress;
    state.phaseIndex = s.phaseIndex;
    state.lastShot = s.last;
    state.cycleStart = s.cycleStart;

    if (templateChanged) {
      buildArcs(s.template);
      buildNodes(s.template);
      buildTimeline(s.template);
      setText('reactorTemplateChip', tpl.templateChip(s.template));
      // Reset preview when template changes
      state.previewIndex = -1;
    }

    updateArcs(s);
    updateSweep(s);
    updateCenter(s);
    updateTiming(s);
    updateGuidance(s);

    if (state.wasEmpty) {
      // Ignition: first shot logged
      igniteSequence(s);
      state.wasEmpty = false;
    } else if (phaseChanged) {
      phaseShiftSequence(s);
    }

    state.started = true;
  }

  function updateArcs(s) {
    var tpl = T();
    var arcs = $('reactorArcs');
    if (!arcs) return;
    var paths = arcs.children;
    for (var i = 0; i < paths.length; i++) {
      var cls = 'gn-reactor-arc-todo';
      if (i < s.phaseIndex) cls = 'gn-reactor-arc-done';
      else if (i === s.phaseIndex) cls = 'gn-reactor-arc-active';
      // In preview mode, highlight the previewed phase
      if (state.previewIndex >= 0) {
        cls = i === state.previewIndex ? 'gn-reactor-arc-active' : 'gn-reactor-arc-todo';
      }
      paths[i].setAttribute('class', cls);
    }
    var nodes = $('reactorNodes');
    if (nodes) {
      var groups = nodes.children;
      for (var j = 0; j < groups.length; j++) {
        var ncls = 'gn-reactor-node todo';
        if (j < s.phaseIndex) ncls = 'gn-reactor-node done';
        else if (j === s.phaseIndex) ncls = 'gn-reactor-node active';
        if (state.previewIndex >= 0) {
          ncls = j === state.previewIndex ? 'gn-reactor-node active' : 'gn-reactor-node todo';
        }
        groups[j].setAttribute('class', ncls);
      }
    }
  }

  function updateSweep(s) {
    var tpl = T();
    var sweep = $('reactorSweep');
    if (!sweep || !tpl) return;
    var pt = tpl.progressPoint(s.progress);
    var ang = (pt.deg - 90) * Math.PI / 180;
    sweep.setAttribute('cx', (50 + 42 * Math.cos(ang)).toFixed(2));
    sweep.setAttribute('cy', (50 + 42 * Math.sin(ang)).toFixed(2));
    sweep.style.fill = s.phase.color;
  }

  function updateCenter(s) {
    var tpl = T();
    var effIdx = state.previewIndex >= 0 ? state.previewIndex : s.phaseIndex;
    var phase = s.template.phases[effIdx];
    setText('reactorPhaseNum', tx('phase.phaseN', 'PHASE {n} / {total}', {
      n: effIdx + 1, total: s.template.phases.length
    }));
    var nameEl = $('reactorPhaseName');
    var name = tpl.phaseName(phase);
    if (nameEl) {
      if (nameEl.textContent !== name) nameEl.textContent = name;
      nameEl.style.color = phase.color;
      nameEl.style.textShadow = '0 0 18px ' + phase.color + '55';
    }

    // Countdown: weekly/generic = until next shot; cycle = remaining in cycle
    var cycleMs = s.template.cycleDays * 86400000;
    var remaining = s.cycleStart + cycleMs - Date.now();
    setText('reactorCountdown', fmtCountdown(remaining));
    setText('reactorCountdownLabel', s.template.type === 'cycle'
      ? tx('phase.remainingInCycle', 'REMAINING IN CYCLE')
      : tx('phase.untilNextShot', 'UNTIL NEXT SHOT'));

    var fill = $('reactorProgressFill');
    if (fill) {
      fill.style.width = Math.round(s.progress * 100) + '%';
      fill.style.background = phase.color;
    }
    // Color bleed on the sphere wrap
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
    var previewLabel = state.previewIndex >= 0
      ? tx('phase.previewLabel', 'PREVIEW · {phase}', { phase: tpl.phaseName(phase) })
      : tpl.phaseName(phase);
    if (head && head.textContent !== previewLabel) head.textContent = previewLabel;

    var list = $('reactorList');
    if (list) {
      var html = lines.map(function (line) {
        var isFlag = /^RED FLAG/i.test(line) || /contact your provider/i.test(line);
        return '<li class="' + (isFlag ? 'flag' : '') + '">' + escapeHtml(line) + '</li>';
      }).join('');
      if (list.dataset.sig !== effIdx + ':' + state.tab + ':' + html.length) {
        list.innerHTML = html;
        list.dataset.sig = effIdx + ':' + state.tab + ':' + html.length;
        var panel = $('reactorPanel');
        if (panel) {
          panel.classList.remove('swap');
          void panel.offsetWidth;
          panel.classList.add('swap');
        }
      }
    }

    var ret = $('reactorReturn');
    if (ret) ret.hidden = state.previewIndex < 0;

    // Tabs
    var tabs = document.querySelectorAll('.gn-reactor-tab');
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
      chip.className = 'gn-reactor-chip2';
      chip.setAttribute('role', 'listitem');
      chip.innerHTML = '<span class="n">' + (idx + 1) + '</span> ' + escapeHtml(tpl.phaseName(phase));
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

  function phaseShiftSequence(s) {
    var tpl = T();
    var banner = $('reactorBanner');
    if (banner) {
      banner.textContent = tx('phase.nowEntering', 'PHASE SHIFT · NOW ENTERING {phase}', {
        phase: tpl.phaseName(s.phase)
      });
      banner.hidden = false;
      clearTimeout(banner._t);
      banner._t = setTimeout(function () { banner.hidden = true; }, 4000);
    }
    updateTimelineStates();
  }

  function igniteSequence(s) {
    // Band draws itself: animate arc stroke-dashoffset from full to 0
    var arcs = $('reactorArcs');
    if (!arcs) return;
    var paths = arcs.children;
    for (var i = 0; i < paths.length; i++) {
      (function (p, idx) {
        try {
          var len = p.getTotalLength();
          p.style.strokeDasharray = len;
          p.style.strokeDashoffset = len;
          p.getBoundingClientRect();
          p.style.transition = 'stroke-dashoffset .8s ease ' + (idx * 0.12) + 's';
          p.style.strokeDashoffset = '0';
          setTimeout(function () {
            p.style.transition = '';
            p.style.strokeDasharray = '';
            p.style.strokeDashoffset = '';
          }, 800 + idx * 120 + 100);
        } catch (_) {}
      })(paths[i], i);
    }
  }

  /* ---------------- wiring ---------------- */

  function wireEvents() {
    // Tabs
    document.querySelectorAll('.gn-reactor-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.tab = t.dataset.rtab || 'now';
        var s = computeState();
        if (s && !s.empty) updateGuidance(s);
      });
    });

    // Return to live
    var ret = $('reactorReturn');
    if (ret) ret.addEventListener('click', exitPreview);

    // Template chip -> scroll timeline into view (opens all-phases view)
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

    // Re-render on shot save, language change, visibility
    document.addEventListener('gn:shot-saved', function () { setTimeout(render, 300); });
    document.addEventListener('gn:langchange', function () {
      state.template = null; // force rebuild for new language
      render();
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) render();
    });

    // Pause ambient animation offscreen
    var wrap = $('reactorSphereWrap');
    if (wrap && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          wrap.classList.toggle('gn-paused', !en.isIntersecting);
        });
      }).observe(wrap);
    }
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
    buildTicks();
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
