export function openWeightModal() {
  const wtOvEl = $('wtOv');
  if (wtOvEl && !wtOvEl.querySelector('.gn-drawer-handle')) wtOvEl.insertAdjacentHTML('afterbegin', '<div class="gn-drawer-handle" aria-hidden="true"></div>');
  setHumanDateInput($('wtDate'), todayISO(), true);
  if ($('wtTime')) $('wtTime').value = formatTime24(new Date());
  syncCustomPickers(document);
  window.GN_I18N?.applyTo?.(document.getElementById('wtOv'));
  $('wtOv')?.classList.add('active');
}
export function closeWt() { $('wtOv')?.classList.remove('active'); }
export function setWeightUnit(unit) {
  moduleState.weightUnit = unit === 'kg' ? 'kg' : 'lb';
  qa('[data-wt-unit]').forEach(button => button.classList.toggle('active', button.dataset.wtUnit === moduleState.weightUnit));
}
export function saveWt() {
  if (moduleState.savingWt) return;
  moduleState.savingWt = true;
  try {
    const raw = Number($('wtVal')?.value);
    const date = readHumanDateInput($('wtDate'), true) || todayISO();
    if (!Number.isFinite(raw) || raw <= 0) { setText('wtError', tx('weight.invalid', 'ENTER A VALID WEIGHT VALUE')); setDisplay('wtError', true); return; }
    const dateTime = new Date(`${date}T${$('wtTime')?.value || '12:00'}`);
    if (Number.isNaN(dateTime.getTime()) || dateTime > new Date()) { setText('wtError', tx('weight.futureNotAllowed', 'FUTURE DATE NOT ALLOWED')); setDisplay('wtError', true); return; }
    const weight = moduleState.weightUnit === 'kg' ? raw * 2.2046226218 : raw;
    const previousWeight = sortedWeights().at(-1)?.weight;
    const milestone = weightMilestone(previousWeight, weight, getProfile());
    const now = new Date().toISOString();
    const record = { id: createId('weight'), date: `${date}T${$('wtTime')?.value || '12:00'}`, weight, weightKg: moduleState.weightUnit === 'kg' ? raw : raw / 2.2046226218, unit: moduleState.weightUnit, notes: $('wtNotes')?.value?.trim() || null, source: 'manual', state: 'confirmed', createdAt: now, modifiedAt: now };
    if (state.cloud) ensureCloudRecordId(record);
    const weights = getWeights(); weights.push(record);
    if (!S.set('weights', weights)) { setText('wtError', tx('weight.storageUnavailable', 'STORAGE UNAVAILABLE — WEIGHT NOT SAVED')); setDisplay('wtError', true); return; }
    queueCloudSync('weight', record);
    appendEventLedger({ type: 'WEIGHT', recordId: record.id, date: record.date, label: 'RESULTS UPDATED' });
    closeWt();
    if ($('wtVal')) $('wtVal').value = '';
    if ($('wtNotes')) $('wtNotes').value = '';
    refreshAll();
    if (milestone) celebrateMilestone(milestone.type, milestone.value);
    showToast(tx('toast.weightLogged', 'Peso registrado'), false, () => undoWeight(record.id), `${raw} ${moduleState.weightUnit === 'kg' ? 'kg' : 'lb'}`);
  } finally {
    moduleState.savingWt = false;
  }
}

export function renderResults() {
  ensureResultsEnhancements();
  window.GN_I18N?.applyTo?.(document.getElementById('pageResults'));
  const shots = sortedShots();
  const weights = sortedWeights();
  const profile = getProfile();
  const weightMetrics = computeTotalChange(weights, profile, 'profile');
  const latest = weightMetrics.latest;
  const first = weightMetrics.first;
  const change = weightMetrics.change;
  const spanDays = weightMetrics.spanDays;
  const directionReady = weights.length >= 3 && spanDays >= 7;
  setText('resLatestWeight', latest ? `${latest.weight.toFixed(1)} lb` : '—');
  setText('resShotCount', String(shots.length));
  setText('resLatestAppetite', tx('results.logObservations', 'LOG OBSERVATIONS'));
  setText('resLatestEnergy', tx('results.logObservations', 'LOG OBSERVATIONS'));
  setText('resContinuityEvents', String(shots.length));
  setText('resContinuityRecent', latestShot() ? formatDate(latestShot().date, { month: 'short', day: 'numeric' }) : '—');
  setText('resContinuityActive', String(shots.length));
  setText('r6TotalLabel', tx('dashboard.resultsTotal', 'TOTAL CHANGE'));
  setText('r6TotalBasis', weightMetrics.basis === 'from profile start weight' ? tx('dashboard.fromProfileStart', '(from profile start)') : tx('dashboard.fromFirstWeight', '(from first recorded weight)'));
  setText('r6Total', change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)} lb`);
  const resultsBMI = calcBMIValue(latest?.weight, profile);
  setText('r6BMI', resultsBMI || '');
  setDisplay('r6BMICard', Boolean(resultsBMI));
  setText('r6Wt', latest ? `${latest.weight.toFixed(1)} lb` : '—');
  setText('r6Pct', weightMetrics.percentLost === null ? '—' : `${weightMetrics.percentLost.toFixed(1)}%`);
  setText('r6Avg', weightMetrics.weeklyAverage === null ? '—' : tx('dashboard.weeklyRate', '{value} lb/wk', { value: weightMetrics.weeklyAverage.toFixed(1) }));
  setText('r6Goal', profile.goalWt && latest ? `${Math.max(0, latest.weight - Number(profile.goalWt)).toFixed(1)} lb` : '—');
  const wtChartValue = $('wtChartVal');
  if (wtChartValue) wtChartValue.innerHTML = latest ? Number(latest.weight).toFixed(1) + '<span>' + tx('results.lbsCurrent', 'lbs current') + '</span>' : '—';
  const direction = $('resWeightDirection');
  if (direction) { direction.textContent = directionReady ? tx(change < 0 ? 'results.trendDownAcross' : change > 0 ? 'results.trendUpAcross' : 'results.trendStableAcross', 'Trend direction: Stable across logged measurements') : tx('results.trendInsufficient', 'Trend direction: Insufficient Data'); direction.className = 'results-direction ' + (!directionReady ? 'insufficient' : change <= 0 ? 'good' : 'warn'); }
  setDisplay('weightTrendEmpty', !weights.length); setDisplay('weightTrendLive', Boolean(weights.length));
  setDisplay('resultsSummaryEmpty', !weights.length && !shots.length);
  drawWeightTrendChart($('wtChart'), filterWeightsForChart(weights), shots, profile.goalWt);
  drawTrendArrow($('wtChart'), filterWeightsForChart(weights), profile.goalWt);
  renderWeightRecords(weights);
  renderMeasurementTrend();
  renderPhaseSource(latestShot());
  renderTrendLists(shots);
  renderWeeklyReport(shots, weights);
}

function renderWeightRecords(weights) {
  const list = $('weightRecordsList');
  if (!list) return;
  setDisplay('weightRecordsEmpty', !weights.length);
  list.innerHTML = [...weights].reverse().filter(record => record && Number.isFinite(Number(record.weight))).map(record => `<div class="gn-weight-record"><div><b>${Number(record.weight).toFixed(1)} lb</b><span>${safeText(formatDateTime(record.date))}</span>${record.notes ? `<small>${safeText(record.source === 'shot' || record.notes === 'Logged with SHOT' ? tx('results.loggedWithShot', 'Logged with SHOT') : record.notes)}</small>` : ''}</div></div>`).join('');
}

function filterWeightsForChart(weights) {
  const range = moduleState.weightRange;
  if (range === 'all') return weights;
  const days = range === '1m' ? 30 : range === '3m' ? 90 : 180;
  const cutoff = Date.now() - days * 86400000;
  return weights.filter(record => new Date(record.date).getTime() >= cutoff);
}

function ensureResultsEnhancements() {
  const ledger = document.getElementById('pageResults')?.querySelector('.results-ledger');
  if (ledger && !document.getElementById('gnWeeklyReport')) {
    const markup = '<section class="gn-weekly-report" id="gnWeeklyReport"><div class="gn-foundation-kicker" data-i18n="results.weeklyKicker">// WEEKLY NODE REPORT</div><h3 id="gnWeeklyTitle" data-i18n="results.moreDataNeeded">MORE DATA NEEDED</h3><p id="gnWeeklyCopy" data-i18n="results.weeklyEmptyCopy">Log a shot or log your weight to begin building your SIGNAL.</p><div class="gn-weekly-signals" id="gnWeeklySignals"></div><div class="gn-weekly-actions" id="gnWeeklyActions"><button type="button" onclick="openLogModal()" data-i18n="runtime.logShot">LOG SHOT</button><button type="button" onclick="openWeightModal()" data-i18n="dashboard.logWeight">LOG WEIGHT</button></div></section><div class="gn-reference-pending"><strong data-i18n="results.referencePendingTitle">REFERENCE DATA NOT LOADED</strong><br><span data-i18n="results.referencePendingHtml">Clinical comparison remains off until a medication-specific, source-verified dataset and uncertainty model are available. Your SIGNAL uses your own logged history.</span></div>';
    ledger.insertAdjacentHTML('afterbegin', markup);
  }
  const weightCard = document.getElementById('weightRecordsPanel')?.closest('.results-card');
  if (weightCard && !document.getElementById('measurementTrendCard')) {
    const markup = '<section class="results-card" id="measurementTrendCard"><div class="results-card-title"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-biometric-gauge"></use></svg></span><span data-i18n="results.measurementsTitle">MEASUREMENTS</span></div><div class="results-card-sub" data-i18n="results.measurementsSub">Latest user-entered body measurements</div><div id="measurementTrendList" class="gn-measurement-trend-list"></div><div id="measurementTrendEmpty" class="results-empty" data-i18n="results.noMeasurements">No measurements logged yet.</div></section>';
    weightCard.insertAdjacentHTML('afterend', markup);
  }
  const chart = document.getElementById('wtChart');
  if (chart && !document.getElementById('weightTrendChartSummary')) chart.parentElement?.insertAdjacentHTML('afterend', '<div class="results-copy" id="weightTrendChartSummary" data-i18n="results.weightTrendEmptyHtml">Log weight to build your trend.</div>');
}

function renderWeeklyReport(shots, weights) {
  if (!document.getElementById('gnWeeklyReport')) return;
  if (shots.length < 2) {
    setText('gnWeeklyTitle', tx('results.moreDataNeeded', 'MORE DATA NEEDED'));
    setText('gnWeeklyCopy', tx('results.weeklyEmptyCopy', 'Log a shot or log your weight to begin building your SIGNAL.'));
    const signals = document.getElementById('gnWeeklySignals');
    if (signals) signals.innerHTML = '';
    setDisplay('gnWeeklyActions', true);
    return;
  }
  const cutoff = Date.now() - 7 * 86400000;
  const weekShots = shots.filter(item => new Date(item.date).getTime() >= cutoff);
  const weekWeights = weights.filter(item => new Date(item.date).getTime() >= cutoff);
  const observations = weekShots.flatMap(item => item.se || []);
  const change = weekWeights.length > 1 ? Number(weekWeights.at(-1).weight) - Number(weekWeights[0].weight) : null;
  setText('gnWeeklyTitle', tx('results.last7Days', 'YOUR LAST 7 DAYS'));
  setText('gnWeeklyCopy', tx('results.weeklyCopy', 'This report summarizes only your logged timeline. Gaps remain visible and no clinical comparison is inferred.'));
  const signals = document.getElementById('gnWeeklySignals');
  if (signals) signals.innerHTML = '<span>' + tx('results.shotEvents', 'SHOT EVENTS') + '<b>' + weekShots.length + '</b></span><span>' + tx('results.weightChange', 'WEIGHT CHANGE') + '<b>' + (change === null ? tx('results.notEnoughData', 'NOT ENOUGH DATA') : (change > 0 ? '+' : '') + change.toFixed(1) + ' lb') + '</b></span><span>' + tx('results.observations', 'OBSERVATIONS') + '<b>' + (observations.length || tx('results.noneLogged', 'NONE LOGGED')) + '</b></span>';
  setDisplay('gnWeeklyActions', false);
}

function renderMeasurementTrend() {
  const list = $('measurementTrendList');
  const records = S.get('measurements', []);
  if (!list) return;
  const latest = new Map();
  records.forEach(record => { const current = latest.get(record.type); if (!current || new Date(record.date) > new Date(current.date)) latest.set(record.type, record); });
  const rows = [...latest.values()].sort((a, b) => a.type.localeCompare(b.type));
  setDisplay('measurementTrendEmpty', !rows.length);
  list.innerHTML = rows.filter(record => Number.isFinite(Number(record.value))).map(record => `<div class="gn-measurement-trend-row"><b>${safeText(record.type)}</b><span>${Number(record.value).toFixed(1)} ${safeText(record.unit)}</span></div>`).join('');
}

function drawWeightTrendChart(canvas, weights, shots, goal) {
  const summary = $('weightTrendChartSummary');
  if (!canvas) return null;
  const width = Math.max(280, canvas.clientWidth || 320), height = Math.max(200, canvas.clientHeight || 220), scale = window.devicePixelRatio || 1;
  canvas.width = width * scale; canvas.height = height * scale;
  const context = canvas.getContext('2d'); if (!context) return null;
  context.setTransform(scale, 0, 0, scale, 0, 0); context.clearRect(0, 0, width, height);
  if (!weights.length) {
    if (summary) summary.textContent = tx('dashboard.logWeight', 'LOG WEIGHT');
    // Overnight polish (2026-08-09): RESULTS chart empty state — quiet
    // grid + message instead of a dead blank canvas.
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    context.strokeStyle = light ? 'rgba(20,60,70,.1)' : 'rgba(255,255,255,.08)';
    context.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = (height / 4) * i; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    context.fillStyle = light ? 'rgba(46,66,75,.75)' : 'rgba(158,178,190,.78)';
    context.font = `700 ${Math.max(12, Math.round(width * .034))}px "Share Tech Mono", monospace`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(tx('dashboard.noRecordsYet', 'NO RECORDS YET · LOG YOUR FIRST WEIGHT'), width / 2, height / 2);
    const overlay = document.getElementById(canvas.id + 'Overlay');
    if (overlay) overlay.innerHTML = '';
    renderWeightChartLegend(canvas, null);
    return null;
  }

  const left = 42, right = 12, top = 16, bottom = 30, plotWidth = width - left - right, plotHeight = height - top - bottom;
  const values = weights.map(item => Number(item.weight));
  const minValue = Math.min(...values, Number(goal) || Infinity), maxValue = Math.max(...values, Number(goal) || -Infinity);
  const padding = Math.max(1, (maxValue - minValue || 1) * .14), min = minValue - padding, max = maxValue + padding, span = max - min || 1;
  const xFor = index => weights.length === 1 ? left + plotWidth / 2 : left + (index / (weights.length - 1)) * plotWidth;
  const yFor = value => top + (max - Number(value)) / span * plotHeight;
  context.font = '10px Share Tech Mono, monospace'; context.fillStyle = '#8295a0'; context.strokeStyle = 'rgba(255,255,255,.10)'; context.lineWidth = 1;
  for (let index = 0; index <= 3; index++) { const y = top + plotHeight * index / 3; context.beginPath(); context.moveTo(left, y); context.lineTo(width - right, y); context.stroke(); context.fillText(`${(max - (span * index / 3)).toFixed(1)}`, 4, y + 3); }
  if (Number(goal) > 0) { const goalY = yFor(goal); context.save(); context.setLineDash([5, 4]); context.strokeStyle = 'rgba(255,215,0,.55)'; context.beginPath(); context.moveTo(left, goalY); context.lineTo(width - right, goalY); context.stroke(); context.restore(); }

  // Premium REFINEMENT (2026-08-10): cyan area gradient under the curve, then a
  // boosted glow halo on the line itself. Halo is drawn twice — once wider, once
  // tight — so the cyan reads as luminous at hi-DPI without bleeding into the grid.
  const points = values.map((value, index) => ({ x: xFor(index), y: yFor(value), index, value }));
  const areaGrad = context.createLinearGradient(0, top, 0, top + plotHeight);
  areaGrad.addColorStop(0, 'rgba(0, 230, 240, 0.42)');
  areaGrad.addColorStop(0.55, 'rgba(0, 230, 240, 0.16)');
  areaGrad.addColorStop(1, 'rgba(0, 230, 240, 0)');
  context.fillStyle = areaGrad;
  context.beginPath();
  context.moveTo(points[0].x, top + plotHeight);
  points.forEach(p => context.lineTo(p.x, p.y));
  context.lineTo(points.at(-1).x, top + plotHeight);
  context.closePath();
  context.fill();

  context.shadowColor = 'rgba(0, 230, 240, 0.65)'; context.shadowBlur = 14; context.strokeStyle = 'rgba(0, 230, 240, 0.55)'; context.lineWidth = 4; context.beginPath();
  points.forEach((p, i) => { if (!i) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y); });
  context.stroke();
  context.shadowBlur = 7; context.strokeStyle = '#00E6F0'; context.lineWidth = 2; context.beginPath();
  points.forEach((p, i) => { if (!i) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y); });
  context.stroke(); context.shadowBlur = 0;

  context.fillStyle = '#00E6F0';
  points.forEach(p => { context.beginPath(); context.arc(p.x, p.y, 3, 0, Math.PI * 2); context.fill(); });
  const start = parseLocalDate(weights[0].date), end = parseLocalDate(weights.at(-1).date); context.fillStyle = '#8295a0'; context.fillText(formatDate(start, { month: 'short', day: 'numeric' }), left, height - 8); context.textAlign = 'right'; context.fillText(formatDate(end, { month: 'short', day: 'numeric' }), width - right, height - 8); context.textAlign = 'left';
  let priorDose = null;
  const shotMarkers = [];
  shots.forEach(shot => {
    const time = parseLocalDate(shot.date).getTime();
    const dose = Number(shot.dose) || priorDose;
    if (!Number.isFinite(time) || time < start.getTime() || time > end.getTime()) { priorDose = dose; return; }
    const nearest = points.reduce((best, item, index) => Math.abs(parseLocalDate(weights[index].date).getTime() - time) < Math.abs(parseLocalDate(weights[best.index].date).getTime() - time) ? item : best, points[0]).index;
    const changed = priorDose !== null && dose !== priorDose;
    const px = xFor(nearest), py = yFor(values[nearest]);
    context.fillStyle = changed ? '#ffd700' : '#FF3B3B';
    context.beginPath(); context.arc(px, py, changed ? 6 : 4, 0, Math.PI * 2); context.fill();
    if (changed) { context.fillStyle = '#ffd700'; context.font = '9px Share Tech Mono, monospace'; context.fillText(tx('results.chartDose', 'DOSE'), Math.min(width - 38, px + 5), Math.max(10, py - 7)); }
    shotMarkers.push({ x: px, y: py, kind: changed ? 'dose' : 'shot', t: time });
    priorDose = dose;
  });
  const profileStart = Number(getProfile().startWt) || values[0];
  const milestoneMarkers = [];
  [5, 10, 15, 20].forEach(percent => {
    const target = profileStart * (1 - percent / 100);
    const firstIndex = values.findIndex(value => value <= target);
    if (firstIndex < 0) return;
    const mx = xFor(firstIndex), my = yFor(values[firstIndex]);
    context.fillStyle = '#00ff88'; context.beginPath(); context.arc(mx, my, 5, 0, Math.PI * 2); context.fill();
    milestoneMarkers.push({ x: mx, y: my, percent });
  });
  if (summary) { const summaryText = weights.length === 1 ? tx('results.oneWeightPoint', 'One data point logged. Keep tracking to see your trend.') : Number(goal) > 0 ? tx('results.showingWeightRecordsWithGoal', 'Showing {count} weight records · goal {goal} lb', { count: weights.length, goal: Number(goal).toFixed(1) }) : tx('results.showingWeightRecords', 'Showing {count} weight records', { count: weights.length }); summary.textContent = summaryText; }

  const geometry = { width, height, left, right, top, bottom, plotWidth, plotHeight, min, max, span, points, goalY: Number(goal) > 0 ? yFor(goal) : null, startTime: start.getTime(), endTime: end.getTime(), shotMarkers, milestoneMarkers };
  renderWeightChartOverlay(canvas, geometry, { compact: false });
  renderWeightChartLegend(canvas, geometry);
  return geometry;
}

/* Premium REFINEMENT (2026-08-10): SVG overlay painted on top of the canvas.
   Provides the phase band behind the curve, an animated cyan trace flowing along
   the line as a 'live signal', and a pulsing dot at the latest datapoint. All
   animations honour prefers-reduced-motion via CSS. */
function renderWeightChartOverlay(canvas, geometry, options = {}) {
  if (!canvas) return;
  const overlay = document.getElementById(canvas.id + 'Overlay');
  if (!overlay) return;
  if (!geometry) { overlay.innerHTML = ''; overlay.removeAttribute('viewBox'); return; }
  const compact = options.compact === true;
  const { width, height, left, right, top, bottom, plotWidth, plotHeight, points, goalY, startTime, endTime, shotMarkers } = geometry;
  const ns = 'http://www.w3.org/2000/svg';
  overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
  overlay.setAttribute('preserveAspectRatio', 'none');
  overlay.innerHTML = '';

  // Phase band: emit the 7-day reference cycle coloured by phase, anchored to
  // the most-recent shot and clipped strictly to the visible curve area. Each
  // phase becomes a coloured rect that sits behind the cyan line, giving the
  // user a visual sense of which medication phase their current weight sits in.
  if (!compact && startTime && endTime) {
    const lastShot = latestShot();
    if (lastShot) {
      const lastShotTime = parseLocalDate(lastShot.date).getTime();
      const cycleMs = 7 * 86400000;
      const cycleStart = lastShotTime - Math.floor((lastShotTime - startTime) / cycleMs) * cycleMs;
      const totalSpan = endTime - startTime;
      if (totalSpan > 0) {
        const xFromTime = t => left + ((t - startTime) / totalSpan) * plotWidth;
        PHASES.forEach(phase => {
          // Phase rects are clipped to [startTime, endTime] — the data window —
          // so the band never extends into the empty area past the curve.
          const visStart = Math.max(cycleStart + phase.start * cycleMs, startTime);
          const visEnd = Math.min(cycleStart + phase.end * cycleMs, endTime);
          if (visEnd <= visStart) return;
          const x1 = xFromTime(visStart);
          const x2 = xFromTime(visEnd);
          const rect = document.createElementNS(ns, 'rect');
          rect.setAttribute('class', 'gn-phase-band');
          rect.setAttribute('x', x1);
          rect.setAttribute('y', top);
          rect.setAttribute('width', Math.max(1, x2 - x1));
          rect.setAttribute('height', plotHeight);
          rect.setAttribute('fill', phase.color);
          overlay.appendChild(rect);
        });
      }
    }
  }

  // Animated live trace — a soft cyan path that mirrors the curve line.
  // Drawn as a continuous (non-dashed) stroke with reduced opacity so the static
  // canvas line stays crisp while the overlay adds motion. The trace is offset
  // by a moving dashed highlight to give the sense of flow.
  if (points.length >= 2) {
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    // Soft halo path
    const halo = document.createElementNS(ns, 'path');
    halo.setAttribute('d', d);
    halo.setAttribute('fill', 'none');
    halo.setAttribute('stroke', '#00E6F0');
    halo.setAttribute('stroke-width', '6');
    halo.setAttribute('stroke-linecap', 'round');
    halo.setAttribute('stroke-linejoin', 'round');
    halo.setAttribute('opacity', '0.35');
    overlay.appendChild(halo);
    // Animated dash on top
    const trace = document.createElementNS(ns, 'path');
    trace.setAttribute('d', d);
    trace.setAttribute('fill', 'none');
    trace.setAttribute('stroke', '#7FF7FF');
    trace.setAttribute('stroke-width', '2.5');
    trace.setAttribute('stroke-linecap', 'round');
    trace.setAttribute('stroke-linejoin', 'round');
    trace.setAttribute('class', 'gn-live-trace');
    overlay.appendChild(trace);
  }

  // Pulse at the latest datapoint — the 'live signal' indicator.
  const last = points.at(-1);
  if (last && !compact) {
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('class', 'gn-pulse-ring');
    ring.setAttribute('cx', last.x);
    ring.setAttribute('cy', last.y);
    ring.setAttribute('r', 5);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#00E6F0');
    ring.setAttribute('stroke-width', '1.5');
    ring.setAttribute('opacity', '0.85');
    overlay.appendChild(ring);

    const core = document.createElementNS(ns, 'circle');
    core.setAttribute('class', 'gn-pulse-core');
    core.setAttribute('cx', last.x);
    core.setAttribute('cy', last.y);
    core.setAttribute('r', 4);
    core.setAttribute('fill', '#00E6F0');
    overlay.appendChild(core);
  }
}

/* Premium REFINEMENT (2026-08-10): clean inline legend below the chart. Replaces
   the dense sentence-form summary copy that mixed metric counts and a key in one
   line. The full summary still lives in #weightTrendChartSummary for screen readers. */
function renderWeightChartLegend(canvas, geometry) {
  const legend = document.getElementById(canvas.id + 'Legend');
  if (!legend) return;
  if (!geometry) { legend.innerHTML = ''; return; }
  const items = [
    { key: 'cyan',   label: tx('results.legendWeight', 'WEIGHT') },
    { key: 'red',    label: tx('results.legendShot', 'SHOT') },
    { key: 'yellow', label: tx('results.legendDose', 'DOSE') },
    { key: 'green',  label: tx('results.legendMilestone', 'MILESTONE') },
    { key: 'goal',   label: tx('results.legendGoal', 'GOAL') }
  ];
  legend.innerHTML = items.map(item => `<span><i class="sw-${item.key}"></i>${safeText(item.label)}</span>`).join('');
}

function drawTrendArrow(canvas, weights, goal) {
  if (!canvas || weights.length < 2) return;
  const width = Math.max(280, canvas.clientWidth || 320), height = Math.max(200, canvas.clientHeight || 220), scale = window.devicePixelRatio || 1;
  const context = canvas.getContext('2d'); if (!context) return;
  const left = 42, right = 12, top = 16, bottom = 30, plotWidth = width - left - right, plotHeight = height - top - bottom;
  const values = weights.map(item => Number(item.weight));
  const minValue = Math.min(...values, Number(goal) || Infinity), maxValue = Math.max(...values, Number(goal) || -Infinity);
  const padding = Math.max(1, (maxValue - minValue || 1) * .14), min = minValue - padding, max = maxValue + padding, span = max - min || 1;
  const xFor = index => left + (index / (values.length - 1)) * plotWidth;
  const yFor = value => top + (max - Number(value)) / span * plotHeight;
  const delta = values.at(-1) - values.at(-2);
  const arrow = delta < -0.05 ? '▼' : delta > 0.05 ? '▲' : '►';
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.fillStyle = delta < -0.05 ? '#00ff88' : delta > 0.05 ? '#FF5B5B' : '#ffd700';
  context.font = '700 14px Share Tech Mono, monospace';
  context.textAlign = 'left';
  context.fillText(arrow, Math.min(width - 16, xFor(values.length - 1) + 7), yFor(values.at(-1)) + 5);
}

function renderPhaseSource(shot) {
  setDisplay('phaseEngineSourceEmpty', !shot); setDisplay('phaseEngineSourceReadout', Boolean(shot));
  const readout = document.getElementById('phaseEngineSourceReadout');
  if (!readout || !shot) return;
  const elapsed = Math.max(0, (Date.now() - new Date(shot.date).getTime()) / 86400000);
  readout.innerHTML = '<div><span>' + tx('runtime.lastShot', 'LAST SHOT') + '</span><b>' + safeText(formatDateTime(shot.date)) + '</b></div><div><span>' + tx('runtime.medication', 'MEDICATION') + '</span><b>' + safeText(medicationLabel(shot.med)) + '</b></div><div><span>' + tx('runtime.timeSince', 'TIME SINCE') + '</span><b>' + Math.floor(elapsed) + 'd</b></div><div><span>' + tx('runtime.dataSource', 'DATA SOURCE') + '</span><b>' + tx('runtime.userHistory', 'USER-ENTERED HISTORY') + '</b></div>';
}

function renderTrendLists(shots) {
  const effects = shots.flatMap(item => item.se || []);
  setDisplay('sideEffectTrendEmpty', !effects.length); setDisplay('sideEffectTrendLive', Boolean(effects.length));
  const sideEffectTrend = document.getElementById('sideEffectTrendLive');
  if (sideEffectTrend) {
    sideEffectTrend.innerHTML = effects.length
      ? effects.slice(-6).reverse().map(effect => '<div class="results-list-row"><b>' + safeText(sideEffectLabel(effect)) + '</b><span>' + tx('runtime.loggedObservation', 'logged observation') + '</span></div>').join('')
      : '';
  }
  setDisplay('appetiteTrendEmpty', true); setDisplay('energyTrendEmpty', true);
}

function drawCanvasChart(canvas, values, color) {
  if (!canvas) return;
  const width = Math.max(280, canvas.clientWidth || 320);
  const height = Math.max(110, canvas.clientHeight || 150);
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale; canvas.height = height * scale;
  const context = canvas.getContext('2d'); if (!context) return;
  context.scale(scale, scale); context.clearRect(0, 0, width, height);
  if (!values.length) {
    // Overnight polish (2026-08-09): empty charts were a dead blank zone —
    // draw a faint grid + a quiet "no records yet" line, theme-aware.
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    context.strokeStyle = light ? 'rgba(20,60,70,.1)' : 'rgba(255,255,255,.08)';
    context.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = (height / 4) * i; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    context.fillStyle = light ? 'rgba(46,66,75,.75)' : 'rgba(158,178,190,.78)';
    context.font = `700 ${Math.max(12, Math.round(width * .034))}px "Share Tech Mono", monospace`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(tx('dashboard.noRecordsYet', 'NO RECORDS YET · LOG YOUR FIRST WEIGHT'), width / 2, height / 2);
    return;
  }
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  context.strokeStyle = 'rgba(255,255,255,.09)'; context.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const y = (height / 4) * i; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  context.strokeStyle = color; context.shadowColor = color; context.shadowBlur = 8; context.lineWidth = 2; context.beginPath();
  values.forEach((value, index) => { const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 16) + 8; const y = height - 18 - ((value - min) / span) * (height - 36); if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); });
  context.stroke(); context.shadowBlur = 0;
}

function renderProtocolCurve(shots, phase) {
  const canvas = $('medChart');
  const readout = $('medLvlVal');
  if (!shots.length) {
    if (readout) {
      const detail = document.createElement('span');
      detail.textContent = tx('results.logToBegin', 'log a shot to begin');
      readout.replaceChildren(document.createTextNode('—'), detail);
    }
    const context = canvas?.getContext('2d');
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  /* Peptide evidence layer (2026-08-10): vivid, evidence-aware renderer.
     Delegates to gridnode-peptide-viz.js when present; synthetic fallback below
     stays intact for environments without the layer. */
  if (window.GN_PEPTIDE_VIZ && typeof window.GN_PEPTIDE_VIZ.render === 'function') {
    const medId = normalizeMedicationId(shots.at(-1)?.med);
    const labelMap = {};
    shots.forEach(shot => { const id = normalizeMedicationId(shot.med); if (id && !labelMap[id]) labelMap[id] = medicationLabel(id); });
    window.GN_PEPTIDE_VIZ.render({ canvas, readout, shots, medId, medLabel: medicationLabel(medId), labelMap, range: moduleState.medRange, now: Date.now(), phaseName: localizedPhaseName(phase) || phase?.name || 'ACTIVE' });
    return;
  }

  if (readout) {
    const detail = document.createElement('span');
    detail.textContent = tx('results.relativeCycleModel', 'relative cycle model · not a measured level');
    readout.replaceChildren(document.createTextNode(localizedPhaseName(phase) || tx('results.active', 'ACTIVE')), detail);
  }

  const now = Date.now();
  const rangeDays = { '2w': 14, '1m': 30, '3m': 90 }[moduleState.medRange]
    || Math.max(30, Math.ceil((now - new Date(shots[0].date).getTime()) / 86400000));
  const start = now - rangeDays * 86400000;
  const end = now + 7 * 86400000;
  const pointCount = 96;
  const values = Array.from({ length: pointCount }, (_, index) => {
    const pointTime = start + ((end - start) * index / (pointCount - 1));
    return shots.reduce((total, shot) => {
      const elapsed = (pointTime - new Date(shot.date).getTime()) / 86400000;
      if (!Number.isFinite(elapsed) || elapsed < 0) return total;
      const relative = elapsed <= 0.75
        ? Math.max(0.04, elapsed / 0.75)
        : Math.exp(-0.28 * (elapsed - 0.75));
      return total + relative;
    }, 0);
  });
  drawCanvasChart(canvas, values, phase?.color || '#00d4ff');
}

export function setRange(button, range) { moduleState.medRange = range; qa('#pageDash .time-tab').forEach(item => item.classList.toggle('active', item === button)); renderDashboard(); }
export function setWtRange(button, range) { moduleState.weightRange = range; qa('#pageResults .time-tab').forEach(item => item.classList.toggle('active', item === button)); renderResults(); }

