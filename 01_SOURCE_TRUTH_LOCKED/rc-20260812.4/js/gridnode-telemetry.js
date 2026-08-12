/* GRID//NODE // NEXUS TELEMETRY PILOT
 * Zero-dependency Canvas instruments. Reads the active workspace; never writes records.
 */
(() => {
  'use strict';

  const dayMs = 86400000;
  const kgPerLb = 0.45359237;
  const state = { range: 'all', frame: 0 };
  const $ = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const tr = (key, fallback) => window.GN_I18N?.text?.(key, fallback) || fallback;

  function locale() { return window.GN_I18N?.getLang?.() === 'es' ? 'es-419' : 'en-US'; }
  function validDate(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; }
  function dateLabel(value, detailed = false) {
    const date = validDate(value);
    return date ? date.toLocaleDateString(locale(), detailed ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }) : '—';
  }
  function records(key) {
    const value = window.GN?.S?.get?.(key, []);
    return Array.isArray(value) ? value : [];
  }
  function profile() { return window.GN?.S?.get?.('profile', {}) || {}; }

  function previewFixture() {
    const hostAllowed = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    const mode = hostAllowed ? new URLSearchParams(location.search).get('telemetry-preview') : '';
    if (!mode) return null;
    const full = {
      weights: [
        ['2026-04-18T08:20', 218], ['2026-04-25T08:10', 215.8], ['2026-05-02T08:35', 213.9],
        ['2026-05-09T08:05', 211.6], ['2026-05-16T08:40', 208.7], ['2026-06-13T08:15', 205.8],
        ['2026-06-20T08:25', 203.9], ['2026-07-04T08:18', 200.7], ['2026-07-18T08:32', 198.1],
        ['2026-07-28T08:12', 196.4]
      ].map(([date, weight], index) => ({ id: `preview-weight-${index}`, date, weight, unit: 'lb' })),
      shots: [
        ['2026-04-19T19:00', 'Semaglutide', .25], ['2026-04-26T19:05', 'Semaglutide', .25],
        ['2026-05-03T18:55', 'Semaglutide', .5], ['2026-05-10T19:02', 'Semaglutide', .5],
        ['2026-05-17T18:58', 'Semaglutide', .5], ['2026-06-14T19:07', 'Semaglutide', 1],
        ['2026-06-21T18:52', 'Semaglutide', 1], ['2026-07-05T19:04', 'Semaglutide', 1],
        ['2026-07-19T18:57', 'Semaglutide', 1], ['2026-07-28T19:01', 'Semaglutide', 1]
      ].map(([date, med, dose], index) => ({ id: `preview-shot-${index}`, date, med, dose, archived: false })),
      profile: { startWt: 218, goalWt: 185, weightUnit: 'lb' },
      mode
    };
    if (mode === 'empty') return { weights: [], shots: [], profile: {}, mode };
    if (mode === 'sparse') return { weights: full.weights.slice(0, 1), shots: full.shots.slice(0, 1), profile: full.profile, mode };
    return full;
  }

  function sourceData() {
    const fixture = previewFixture();
    const rawWeights = fixture ? fixture.weights : records('weights');
    const rawShots = fixture ? fixture.shots : records('shots');
    const userProfile = fixture ? fixture.profile : profile();
    const weights = rawWeights
      .filter(item => validDate(item?.date) && Number.isFinite(Number(item?.weight)) && Number(item.weight) > 0)
      .map(item => ({ ...item, time: new Date(item.date).getTime(), weight: Number(item.weight) }))
      .sort((a, b) => a.time - b.time);
    const shots = rawShots
      .filter(item => !item?.archived && validDate(item?.date) && Number.isFinite(Number(item?.dose)) && Number(item.dose) > 0)
      .map(item => ({ ...item, time: new Date(item.date).getTime(), dose: Number(item.dose), med: String(item.med || 'Custom') }))
      .sort((a, b) => a.time - b.time);
    const useKg = String(userProfile.weightUnit || '').toLowerCase().startsWith('kg');
    return { weights, shots, profile: userProfile, useKg, fixture: fixture?.mode || '' };
  }

  function rangeData(rows) {
    if (state.range === 'all' || rows.length < 2) return rows;
    const days = { '7d': 7, '30d': 30, '90d': 90, '6m': 183, '1y': 365 }[state.range] || Infinity;
    const cutoff = rows.at(-1).time - days * dayMs;
    return rows.filter(row => row.time >= cutoff);
  }

  function weightValue(value, useKg) { return useKg ? Number(value) * kgPerLb : Number(value); }
  function weightUnit(useKg) { return useKg ? 'kg' : 'lb'; }
  function formatWeight(value, useKg) { return `${weightValue(value, useKg).toFixed(1)} ${weightUnit(useKg)}`; }
  function token(host, name, fallback) { return getComputedStyle(host).getPropertyValue(name).trim() || fallback; }

  function instrumentMarkup(type, compact) {
    const titles = {
      weight: [tr('telemetry.bodyMassTitle', 'BODY MASS TRAJECTORY'), tr('telemetry.bodyMassSub', 'Exact recorded measurements · gaps remain visible')],
      dose: [tr('telemetry.doseTitle', 'PROTOCOL DOSE TIMELINE'), tr('telemetry.doseSub', 'Recorded administrations only · not dosing guidance')],
      target: [tr('telemetry.targetTitle', 'TARGET VECTOR'), tr('telemetry.targetSub', 'Start, current, and user-defined target')]
    };
    const [title, subtitle] = titles[type];
    const visual = type === 'target'
      ? '<div class="gn-target-vector" data-target-vector></div>'
      : `<div class="gn-telemetry-canvas-wrap" data-chart-type="${type}"><canvas tabindex="0" role="img"></canvas><div class="gn-chart-tooltip" role="status" aria-live="polite" hidden></div><div class="gn-chart-state" aria-live="polite"></div></div>`;
    return `<article class="gn-telemetry-instrument gn-telemetry-${type}${compact ? ' compact' : ''}" data-instrument="${type}">
      <header><span class="gn-instrument-code">${type === 'weight' ? 'BIO/01' : type === 'dose' ? 'PRT/02' : 'VEC/03'}</span><div><h3>${safe(title)}</h3><p>${safe(subtitle)}</p></div><i aria-hidden="true"></i></header>
      ${visual}
      <div class="gn-telemetry-summary" data-telemetry-summary></div>
      ${compact ? '' : '<details class="gn-telemetry-table"><summary></summary><div data-telemetry-table></div></details>'}
    </article>`;
  }

  function rangeControls() {
    return `<div class="gn-telemetry-ranges" role="group" aria-label="${safe(tr('telemetry.rangeLabel', 'Telemetry date range'))}">
      ${[['7d', 'range7d', '7D'], ['30d', 'range30d', '30D'], ['90d', 'range90d', '90D'], ['6m', 'range6m', '6M'], ['1y', 'range1y', '1Y'], ['all', 'rangeAll', 'ALL']].map(([value, key, fallback]) => `<button type="button" data-telemetry-range="${value}" class="${state.range === value ? 'active' : ''}" aria-pressed="${state.range === value}">${safe(tr(`telemetry.${key}`, fallback))}</button>`).join('')}
    </div>`;
  }

  function mount() {
    const dashboard = $('pageDash');
    if (dashboard && !$('gnTelemetryDashboard')) {
      const section = document.createElement('section');
      section.id = 'gnTelemetryDashboard';
      section.className = 'gn-telemetry-module gn-telemetry-dashboard';
      section.innerHTML = `<div class="gn-telemetry-heading"><div><span>// 04</span><h2>${safe(tr('telemetry.section', 'BIOLOGICAL TELEMETRY'))}</h2><p>${safe(tr('telemetry.sectionSub', 'User-entered records rendered as precision tracking instruments'))}</p></div></div><div class="gn-telemetry-grid">${instrumentMarkup('weight', true)}${instrumentMarkup('dose', true)}${instrumentMarkup('target', true)}</div>`;
      const anchor = dashboard.querySelector('.gn-wanda-actions') || dashboard.querySelector('.stat-row');
      if (anchor) anchor.insertAdjacentElement('afterend', section); else dashboard.prepend(section);
    }
    const results = $('pageResults');
    if (results && !$('gnTelemetrySignal')) {
      const section = document.createElement('section');
      section.id = 'gnTelemetrySignal';
      section.className = 'results-card gn-telemetry-module gn-telemetry-signal';
      section.innerHTML = `<div class="gn-telemetry-heading"><div><span>// SIGNAL 03</span><h2>${safe(tr('telemetry.section', 'BIOLOGICAL TELEMETRY'))}</h2><p>${safe(tr('telemetry.sectionSub', 'User-entered records rendered as precision tracking instruments'))}</p></div>${rangeControls()}</div><div class="gn-telemetry-detail-grid">${instrumentMarkup('weight', false)}${instrumentMarkup('dose', false)}${instrumentMarkup('target', false)}</div>`;
      const summary = results.querySelector('.results-card.summary');
      if (summary) summary.insertAdjacentElement('afterend', section); else results.querySelector('.results-ledger')?.prepend(section);
    }
    document.documentElement.classList.add('gn-telemetry-ready');
    document.querySelectorAll('.gn-telemetry-table summary').forEach(node => { node.textContent = tr('telemetry.accessibleData', 'ACCESSIBLE DATA TABLE'); });
    bindCanvases();
  }

  function prepareCanvas(canvas) {
    const wrap = canvas.closest('.gn-telemetry-canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(260, Math.round(rect.width || 320));
    const compact = canvas.closest('.compact');
    const height = compact ? 150 : 220;
    const ratio = Math.max(1, Math.min(3, devicePixelRatio || 1));
    canvas.style.height = `${height}px`;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, wrap, width, height, compact: Boolean(compact) };
  }

  function palette(wrap) {
    return {
      grid: token(wrap, '--chart-grid', 'rgba(142,165,173,.18)'),
      axis: token(wrap, '--chart-axis', '#8ea5ad'),
      label: token(wrap, '--chart-label', '#9fb3bd'),
      primary: token(wrap, '--chart-primary', '#00d4ff'),
      secondary: token(wrap, '--chart-secondary', '#ffd166'),
      comparison: token(wrap, '--chart-comparison', '#b66892'),
      target: token(wrap, '--chart-target', '#ffd166'),
      success: token(wrap, '--chart-success', '#00c979'),
      area: token(wrap, '--chart-area-primary', 'rgba(0,212,255,.1)'),
      crosshair: token(wrap, '--chart-crosshair', 'rgba(255,209,102,.68)')
    };
  }

  function showState(wrap, message, visible) {
    const stateNode = wrap.querySelector('.gn-chart-state');
    stateNode.textContent = message;
    stateNode.hidden = !visible;
    wrap.querySelector('canvas').hidden = visible;
  }

  function drawAxes(context, colors, frame, min, max, formatter) {
    context.save();
    context.font = '9px Share Tech Mono, monospace';
    context.textAlign = 'left';
    context.fillStyle = colors.axis;
    context.strokeStyle = colors.grid;
    context.lineWidth = 1;
    for (let row = 0; row <= 3; row += 1) {
      const y = frame.top + frame.height * row / 3;
      context.beginPath(); context.moveTo(frame.left, y); context.lineTo(frame.left + frame.width, y); context.stroke();
      context.fillText(formatter(max - (max - min) * row / 3), 4, y + 3);
    }
    context.restore();
  }

  function drawDateTicks(context, colors, frame, rows) {
    if (!rows.length) return;
    const markers = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
    const first = rows[0].time, span = Math.max(1, rows.at(-1).time - first);
    context.save(); context.font = '8px Share Tech Mono, monospace'; context.textAlign = 'center'; context.fillStyle = colors.label;
    markers.forEach(index => {
      const x = rows.length === 1 ? frame.left + frame.width / 2 : frame.left + (rows[index].time - first) / span * frame.width;
      context.fillText(dateLabel(rows[index].date), Math.min(frame.left + frame.width - 20, Math.max(frame.left + 20, x)), frame.top + frame.height + 20);
    });
    context.restore();
  }

  function gapThreshold(rows) {
    const gaps = rows.slice(1).map((row, index) => row.time - rows[index].time).filter(gap => gap > 0).sort((a, b) => a - b);
    if (!gaps.length) return 14 * dayMs;
    const median = gaps.length % 2 ? gaps[Math.floor(gaps.length / 2)] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
    return Math.max(14 * dayMs, median * 3);
  }

  function selectedIndex(canvas, rows) {
    const raw = Number(canvas.dataset.selectedIndex);
    return Number.isInteger(raw) && raw >= 0 && raw < rows.length ? raw : -1;
  }

  function drawWeight(canvas) {
    const { context, wrap, width, height, compact } = prepareCanvas(canvas);
    const source = sourceData(); const rows = rangeData(source.weights); const colors = palette(wrap);
    canvas.setAttribute('aria-label', tr('telemetry.bodyMassTitle', 'Body Mass Trajectory'));
    if (!rows.length) {
      const host = canvas.closest('.gn-telemetry-instrument');
      showState(wrap, tr('telemetry.emptyWeight', 'NO BODY MASS READINGS DETECTED'), true);
      host.querySelector('[data-telemetry-summary]').replaceChildren(qualityNode([]));
      updateWeightTable(host, [], source);
      canvas._gnRows = [];
      return;
    }
    showState(wrap, '', false);
    const frame = { left: compact ? 38 : 46, top: 18, width: width - (compact ? 48 : 60), height: height - 50 };
    const values = rows.map(row => weightValue(row.weight, source.useKg));
    const goalRaw = Number(source.profile.goalWt); const goal = Number.isFinite(goalRaw) && goalRaw > 0 ? weightValue(goalRaw, source.useKg) : null;
    const floor = Math.min(...values, goal ?? Infinity), ceiling = Math.max(...values, goal ?? -Infinity);
    const padding = Math.max(source.useKg ? .5 : 1, (ceiling - floor || 1) * .14), min = floor - padding, max = ceiling + padding;
    const firstTime = rows[0].time, timeSpan = Math.max(1, rows.at(-1).time - firstTime);
    const x = row => rows.length === 1 ? frame.left + frame.width / 2 : frame.left + (row.time - firstTime) / timeSpan * frame.width;
    const y = value => frame.top + (max - value) / (max - min || 1) * frame.height;
    drawAxes(context, colors, frame, min, max, value => value.toFixed(0));
    if (goal !== null) {
      context.save(); context.strokeStyle = colors.target; context.setLineDash([5, 5]); context.lineWidth = 1.2; context.beginPath(); context.moveTo(frame.left, y(goal)); context.lineTo(frame.left + frame.width, y(goal)); context.stroke(); context.restore();
    }
    const threshold = gapThreshold(rows); let segment = [];
    const drawSegment = points => {
      if (!points.length) return;
      context.save(); context.strokeStyle = colors.primary; context.lineWidth = 2; context.lineJoin = 'round'; context.lineCap = 'round';
      context.beginPath(); points.forEach((row, index) => { const px = x(row), py = y(weightValue(row.weight, source.useKg)); if (!index) context.moveTo(px, py); else context.lineTo(px, py); }); context.stroke(); context.restore();
    };
    rows.forEach((row, index) => { if (index && row.time - rows[index - 1].time > threshold) { drawSegment(segment); segment = []; } segment.push(row); }); drawSegment(segment);
    const points = rows.map((row, index) => ({ x: x(row), y: y(values[index]), row, value: values[index], index }));
    const selected = selectedIndex(canvas, rows); const emphasized = selected >= 0 ? selected : rows.length - 1;
    points.forEach((point, index) => { if (index !== emphasized && index !== 0) return; context.save(); context.fillStyle = colors.primary; context.beginPath(); context.arc(point.x, point.y, index === emphasized ? 4 : 2.5, 0, Math.PI * 2); context.fill(); context.restore(); });
    const bestIndex = values.reduce((best, value, index) => value < values[best] ? index : best, 0);
    if (bestIndex >= 0) {
      context.save(); context.strokeStyle = colors.success; context.lineWidth = 1.6; context.beginPath(); context.arc(points[bestIndex].x, points[bestIndex].y, 7, 0, Math.PI * 2); context.stroke(); context.restore();
    }
    if (goal !== null) {
      const goalHit = rows.findIndex(row => weightValue(row.weight, source.useKg) <= goal);
      if (goalHit >= 0) {
        const point = points[goalHit];
        context.save(); context.fillStyle = colors.target; context.strokeStyle = colors.target; context.lineWidth = 1;
        context.beginPath(); context.moveTo(point.x, point.y - 9); context.lineTo(point.x - 5, point.y - 16); context.lineTo(point.x + 5, point.y - 16); context.closePath(); context.fill(); context.restore();
      }
    }
    if (selected >= 0) drawCrosshair(context, colors, frame, points[selected]);
    drawDateTicks(context, colors, frame, rows);
    canvas._gnRows = rows; canvas._gnPoints = points; canvas._gnSource = source; canvas._gnDraw = () => drawWeight(canvas);
    updateWeightSummary(canvas.closest('.gn-telemetry-instrument'), rows, source);
    updateWeightTable(canvas.closest('.gn-telemetry-instrument'), rows, source);
  }

  function drawDose(canvas) {
    const { context, wrap, width, height, compact } = prepareCanvas(canvas);
    const source = sourceData(); const rows = rangeData(source.shots); const colors = palette(wrap);
    canvas.setAttribute('aria-label', tr('telemetry.doseTitle', 'Protocol Dose Timeline'));
    if (!rows.length) {
      const host = canvas.closest('.gn-telemetry-instrument');
      showState(wrap, tr('telemetry.emptyDose', 'NO ADMINISTRATION SIGNAL DETECTED'), true);
      host.querySelector('[data-telemetry-summary]').replaceChildren(qualityNode([]));
      updateDoseTable(host, []);
      canvas._gnRows = [];
      return;
    }
    showState(wrap, '', false);
    const frame = { left: compact ? 38 : 46, top: 18, width: width - (compact ? 48 : 60), height: height - 50 };
    const doses = rows.map(row => row.dose), floor = Math.min(...doses), ceiling = Math.max(...doses);
    const padding = Math.max(.1, (ceiling - floor || 1) * .2), min = Math.max(0, floor - padding), max = ceiling + padding;
    const firstTime = rows[0].time, timeSpan = Math.max(1, rows.at(-1).time - firstTime);
    const x = row => rows.length === 1 ? frame.left + frame.width / 2 : frame.left + (row.time - firstTime) / timeSpan * frame.width;
    const y = value => frame.top + (max - value) / (max - min || 1) * frame.height;
    drawAxes(context, colors, frame, min, max, value => value.toFixed(value < 1 ? 2 : 1));
    context.save(); context.strokeStyle = colors.secondary; context.lineWidth = 2; context.lineJoin = 'miter'; context.beginPath();
    rows.forEach((row, index) => { const px = x(row), py = y(row.dose); if (!index) context.moveTo(px, py); else { context.lineTo(px, y(rows[index - 1].dose)); context.lineTo(px, py); } }); context.stroke(); context.restore();
    const points = rows.map((row, index) => ({ x: x(row), y: y(row.dose), row, value: row.dose, index }));
    points.forEach((point, index) => {
      if (index && rows[index - 1].med !== point.row.med) { context.save(); context.strokeStyle = colors.comparison; context.setLineDash([2, 4]); context.beginPath(); context.moveTo(point.x, frame.top); context.lineTo(point.x, frame.top + frame.height); context.stroke(); context.restore(); }
      context.fillStyle = colors.secondary; context.beginPath(); context.arc(point.x, point.y, 2.8, 0, Math.PI * 2); context.fill();
    });
    const selected = selectedIndex(canvas, rows); if (selected >= 0) drawCrosshair(context, colors, frame, points[selected]);
    drawDateTicks(context, colors, frame, rows);
    canvas._gnRows = rows; canvas._gnPoints = points; canvas._gnSource = source; canvas._gnDraw = () => drawDose(canvas);
    updateDoseSummary(canvas.closest('.gn-telemetry-instrument'), rows);
    updateDoseTable(canvas.closest('.gn-telemetry-instrument'), rows);
  }

  function drawCrosshair(context, colors, frame, point) {
    context.save(); context.strokeStyle = colors.crosshair; context.lineWidth = 1; context.setLineDash([3, 3]);
    context.beginPath(); context.moveTo(point.x, frame.top); context.lineTo(point.x, frame.top + frame.height); context.stroke();
    context.beginPath(); context.moveTo(frame.left, point.y); context.lineTo(frame.left + frame.width, point.y); context.stroke(); context.restore();
  }

  function updateWeightSummary(host, rows, source) {
    const summary = host.querySelector('[data-telemetry-summary]'); if (!summary) return;
    const first = rows[0], current = rows.at(-1), delta = current.weight - first.weight;
    let trend = '';
    if (rows.length >= 2) {
      const goalRaw = Number(source.profile.goalWt);
      const towardGoal = Number.isFinite(goalRaw) && goalRaw > 0 ? (current.weight < first.weight) === (goalRaw < first.weight) : current.weight < first.weight;
      trend = ` · ${towardGoal ? tr('chart.trendDown', 'TOWARD GOAL') : tr('chart.trendUp', 'AWAY FROM GOAL')}`;
    }
    summary.replaceChildren(document.createTextNode(rows.length < 2 ? tr('telemetry.sparse', 'INSUFFICIENT DATA FOR DIRECTION') : `${formatWeight(current.weight, source.useKg)} · ${delta > 0 ? '+' : ''}${weightValue(delta, source.useKg).toFixed(1)} ${weightUnit(source.useKg)} · ${rows.length} ${tr('telemetry.readings', 'READINGS')}${trend}`), qualityNode(rows));
  }
  function updateDoseSummary(host, rows) {
    const summary = host.querySelector('[data-telemetry-summary]'); if (!summary) return;
    const meds = new Set(rows.map(row => row.med));
    summary.replaceChildren(document.createTextNode(rows.length < 2 ? tr('telemetry.sparse', 'INSUFFICIENT DATA FOR DIRECTION') : `${rows.at(-1).dose.toFixed(2).replace(/\.00$/, '')} mg · ${rows.length} ${tr('telemetry.recorded', 'RECORDED')} · ${meds.size} ${tr(meds.size === 1 ? 'telemetry.protocol' : 'telemetry.protocols', meds.size === 1 ? 'PROTOCOL' : 'PROTOCOLS')}`), qualityNode(rows));
  }

  function qualityNode(rows) {
    const node = document.createElement('span');
    node.className = 'gn-data-quality';
    node.textContent = tr(`telemetry.${!rows.length ? 'qualityNone' : rows.length < 2 ? 'qualityLimited' : 'qualityRecorded'}`, !rows.length ? 'DATA QUALITY: NO RECORDS' : rows.length < 2 ? 'DATA QUALITY: LIMITED' : 'DATA QUALITY: RECORDED');
    return node;
  }

  function renderTarget(host) {
    const source = sourceData(); const rows = source.weights; const targetNode = host.querySelector('[data-target-vector]'); const summary = host.querySelector('[data-telemetry-summary]');
    const startRaw = Number(source.profile.startWt) || Number(rows[0]?.weight); const currentRaw = Number(rows.at(-1)?.weight); const goalRaw = Number(source.profile.goalWt);
    if (![startRaw, currentRaw, goalRaw].every(value => Number.isFinite(value) && value > 0) || startRaw === goalRaw) {
      targetNode.innerHTML = `<div class="gn-target-empty">${safe(tr('telemetry.emptyTarget', 'SET A START AND TARGET WEIGHT TO ACTIVATE'))}</div>`;
      if (summary) summary.replaceChildren(document.createTextNode(tr('telemetry.sparse', 'INSUFFICIENT DATA FOR DIRECTION')), qualityNode([]));
      updateTargetTable(host, null, source); return;
    }
    const progressRaw = (startRaw - currentRaw) / (startRaw - goalRaw) * 100; const progress = Math.max(0, Math.min(100, progressRaw));
    targetNode.innerHTML = `<div class="gn-target-readouts"><span><small>${safe(tr('telemetry.start', 'START'))}</small><b>${safe(formatWeight(startRaw, source.useKg))}</b></span><span><small>${safe(tr('telemetry.current', 'CURRENT'))}</small><b>${safe(formatWeight(currentRaw, source.useKg))}</b></span><span><small>${safe(tr('telemetry.target', 'TARGET'))}</small><b>${safe(formatWeight(goalRaw, source.useKg))}</b></span></div><div class="gn-target-rail" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.toFixed(0)}" aria-label="${safe(tr('telemetry.progress', 'PROGRESS'))}"><i style="width:${progress.toFixed(2)}%"></i><em style="left:${progress.toFixed(2)}%"></em></div><div class="gn-target-percent"><b>${progress.toFixed(0)}%</b><span>${safe(tr('telemetry.progress', 'PROGRESS'))}</span></div>`;
    if (summary) summary.replaceChildren(document.createTextNode(`${formatWeight(Math.abs(currentRaw - goalRaw), source.useKg)} ${tr('telemetry.toTarget', 'TO TARGET')} · ${tr('telemetry.userDefinedGoal', 'USER-DEFINED GOAL')}`), qualityNode(rows));
    updateTargetTable(host, { startRaw, currentRaw, goalRaw, progress }, source);
  }

  function updateWeightTable(host, rows, source) {
    const node = host.querySelector('[data-telemetry-table]'); if (!node) return;
    node.innerHTML = tableMarkup([tr('telemetry.date', 'DATE'), tr('telemetry.value', 'VALUE')], rows.map(row => [dateLabel(row.date, true), formatWeight(row.weight, source.useKg)]));
  }
  function updateDoseTable(host, rows) {
    const node = host.querySelector('[data-telemetry-table]'); if (!node) return;
    node.innerHTML = tableMarkup([tr('telemetry.date', 'DATE'), tr('telemetry.medication', 'MEDICATION'), tr('telemetry.recordedDose', 'RECORDED DOSE')], rows.map(row => [dateLabel(row.date, true), row.med, `${row.dose.toFixed(2).replace(/\.00$/, '')} mg`]));
  }
  function updateTargetTable(host, values, source) {
    const node = host.querySelector('[data-telemetry-table]'); if (!node) return;
    node.innerHTML = values ? tableMarkup([tr('telemetry.value', 'VALUE'), weightUnit(source.useKg)], [[tr('telemetry.start', 'START'), formatWeight(values.startRaw, source.useKg)], [tr('telemetry.current', 'CURRENT'), formatWeight(values.currentRaw, source.useKg)], [tr('telemetry.target', 'TARGET'), formatWeight(values.goalRaw, source.useKg)], [tr('telemetry.progress', 'PROGRESS'), `${values.progress.toFixed(0)}%`]]) : `<p>${safe(tr('telemetry.emptyTarget', 'SET A START AND TARGET WEIGHT TO ACTIVATE'))}</p>`;
  }
  function tableMarkup(headers, rows) { return `<table><thead><tr>${headers.map(header => `<th scope="col">${safe(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${safe(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }

  function tooltipText(canvas, index) {
    const row = canvas._gnRows[index]; if (!row) return [];
    if (canvas.closest('[data-chart-type="weight"]')) {
      const source = canvas._gnSource; const previous = canvas._gnRows[index - 1]; const delta = previous ? weightValue(row.weight - previous.weight, source.useKg) : null;
      return [tr('telemetry.bodyMassReading', 'BODY MASS READING'), dateLabel(row.date, true), formatWeight(row.weight, source.useKg), delta === null ? '' : `${tr('telemetry.previousDelta', 'CHANGE FROM PREVIOUS')}: ${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${weightUnit(source.useKg)}`].filter(Boolean);
    }
    return [tr('telemetry.doseTitle', 'PROTOCOL DOSE TIMELINE'), dateLabel(row.date, true), row.med, `${tr('telemetry.recordedDose', 'RECORDED DOSE')}: ${row.dose.toFixed(2).replace(/\.00$/, '')} mg`];
  }

  function selectPoint(canvas, index, show = true) {
    if (!canvas._gnRows?.length) return;
    const next = Math.max(0, Math.min(canvas._gnRows.length - 1, index)); canvas.dataset.selectedIndex = String(next); canvas._gnDraw?.();
    const tooltip = canvas.closest('.gn-telemetry-canvas-wrap').querySelector('.gn-chart-tooltip'); const point = canvas._gnPoints[next];
    tooltip.replaceChildren(...tooltipText(canvas, next).map((line, lineIndex) => { const node = document.createElement(lineIndex === 0 ? 'b' : 'span'); node.textContent = line; return node; }));
    const maxLeft = Math.max(8, canvas.clientWidth - 190); tooltip.style.left = `${Math.max(8, Math.min(maxLeft, point.x - 78))}px`; tooltip.style.top = `${Math.max(8, point.y - 88)}px`; tooltip.hidden = !show;
  }

  function bindCanvases() {
    document.querySelectorAll('.gn-telemetry-canvas-wrap canvas').forEach(canvas => {
      if (canvas.dataset.telemetryBound) return; canvas.dataset.telemetryBound = 'true';
      canvas.addEventListener('pointermove', event => { if (!canvas._gnPoints?.length) return; const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left; const nearest = canvas._gnPoints.reduce((best, point, index) => Math.abs(point.x - x) < Math.abs(canvas._gnPoints[best].x - x) ? index : best, 0); selectPoint(canvas, nearest); });
      canvas.addEventListener('pointerleave', () => { const tooltip = canvas.closest('.gn-telemetry-canvas-wrap').querySelector('.gn-chart-tooltip'); tooltip.hidden = true; });
      canvas.addEventListener('focus', () => selectPoint(canvas, Number(canvas.dataset.selectedIndex) || Math.max(0, (canvas._gnRows?.length || 1) - 1)));
      canvas.addEventListener('blur', () => { canvas.closest('.gn-telemetry-canvas-wrap').querySelector('.gn-chart-tooltip').hidden = true; });
      canvas.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !canvas._gnRows?.length) return; event.preventDefault(); const current = selectedIndex(canvas, canvas._gnRows); const next = event.key === 'Home' ? 0 : event.key === 'End' ? canvas._gnRows.length - 1 : event.key === 'ArrowLeft' ? Math.max(0, (current < 0 ? canvas._gnRows.length : current) - 1) : Math.min(canvas._gnRows.length - 1, current + 1); selectPoint(canvas, next); });
    });
  }

  function renderAll() {
    mount();
    document.querySelectorAll('[data-chart-type="weight"] canvas').forEach(drawWeight);
    document.querySelectorAll('[data-chart-type="dose"] canvas').forEach(drawDose);
    document.querySelectorAll('.gn-telemetry-target').forEach(renderTarget);
    const fixture = sourceData().fixture;
    document.querySelectorAll('.gn-telemetry-module').forEach(module => {
      let badge = module.querySelector('.gn-telemetry-preview');
      if (fixture && !badge) { badge = document.createElement('div'); badge.className = 'gn-telemetry-preview'; module.prepend(badge); }
      if (badge) { badge.textContent = tr('telemetry.preview', 'DEVELOPMENT PREVIEW DATA · NOT SAVED'); badge.hidden = !fixture; }
    });
  }

  function scheduleRender() { cancelAnimationFrame(state.frame); state.frame = requestAnimationFrame(renderAll); }
  async function boot() {
    if (!window.GN?.S) { setTimeout(boot, 100); return; }
    await window.GN_I18N?.ready;
    mount(); renderAll();
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-telemetry-range]');
      if (button) {
        state.range = button.dataset.telemetryRange;
        document.querySelectorAll('[data-telemetry-range]').forEach(item => {
          const active = item.dataset.telemetryRange === state.range;
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        scheduleRender();
        return;
      }
      if (event.target.closest?.('button[onclick*="saveWt()"],button[onclick*="saveShot()"]')) setTimeout(scheduleRender, 80);
    });
    document.addEventListener('input', event => {
      if (['profStartWt', 'profGoalWt'].includes(event.target?.id)) scheduleRender();
    });
    document.addEventListener('gn:themechange', scheduleRender);
    document.addEventListener('gn:langchange', () => { document.querySelectorAll('#gnTelemetryDashboard,#gnTelemetrySignal').forEach(node => node.remove()); scheduleRender(); });
    window.addEventListener('storage', event => { if (event.key?.includes('_shots') || event.key?.includes('_weights') || event.key?.includes('_profile')) scheduleRender(); });
    window.addEventListener('resize', scheduleRender, { passive: true });
    window.GN_TELEMETRY = Object.freeze({ refresh: scheduleRender, snapshot: sourceData });
  }

  document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
