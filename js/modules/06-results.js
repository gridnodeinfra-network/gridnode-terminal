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
    /* QA 2026-09-17: when the time field is left empty, store a date-only
     * value instead of fabricating a noon timestamp. */
    const wtTimeRaw = $('wtTime')?.value?.trim() || '';
    const record = { id: createId('weight'), date: wtTimeRaw ? `${date}T${wtTimeRaw}` : date, weight, weightKg: moduleState.weightUnit === 'kg' ? raw : raw / 2.2046226218, unit: moduleState.weightUnit, notes: $('wtNotes')?.value?.trim() || null, source: 'manual', state: 'confirmed', createdAt: now, modifiedAt: now };
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
  /* v0.15.40 P0: zero-data TRENDS collapses to the single "log to begin"
     state (see body.gn-results-empty CSS); any logged shot or weight
     reveals the data cards. */
  try { document.body.classList.toggle('gn-results-empty', shots.length === 0 && weights.length === 0); } catch (_) {}
  const first = weightMetrics.first;
  const change = weightMetrics.change;
  const spanDays = weightMetrics.spanDays;
  const directionReady = weights.length >= 3 && spanDays >= 7;
  setText('resShotCount', String(shots.length));
  const resW = $('resLatestWeight');
  if (resW) {
    if (latest) resW.textContent = `${latest.weight.toFixed(1)} lb`;
    else resW.innerHTML = `<button type="button" class="results-weight-cta" onclick="openWeightModal()">${tx('results.logWeightCta', 'LOG WEIGHT')}</button>`;
  }
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
  /* TRACK 3 premium pass: chart-first hero order + inviting empty CTAs. */
  try { ensureResultsHeroOrder(); ensureResultsEmptyCtas(); } catch (_) {}
  drawWeightTrendChart($('wtChart'), filterWeightsForChart(weights), shots, profile.goalWt);
  try { renderPhaseHeatmap(shots); } catch (_) {}
  drawTrendArrow($('wtChart'), filterWeightsForChart(weights), profile.goalWt);
  renderWeightRecords(weights);
  renderMeasurementTrend();
  renderTrendLists(shots);
  renderWeeklyReport(shots, weights);
  /* v0.15.42: calendar is a RESULTS subview (CHARTS | CALENDAR toggle). */
  setResultsView(moduleState.resultsView === 'calendar' ? 'calendar' : 'charts');
}

/* v0.15.42: RESULTS view toggle — CHARTS (default ledger) vs CALENDAR. */
export function setResultsView(view) {
  moduleState.resultsView = view === 'calendar' ? 'calendar' : 'charts';
  const showCal = moduleState.resultsView === 'calendar';
  setDisplay('resultsChartsView', !showCal);
  setDisplay('resultsCalView', showCal);
  qa('#pageResults .results-view-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.resultsView === moduleState.resultsView);
  });
  if (showCal) renderCalendar();
}

/* TRACK 3 premium pass: PROGRESS is chart-first. Canonical ledger order —
   weight chart hero, phase heatmap strip, then the text modules demoted
   below. Runs on every render so dynamically mounted sections (telemetry
   signal, measurement trend) always land in the right place. */
function ensureResultsHeroOrder() {
  const ledger = document.getElementById('resultsChartsView');
  if (!ledger) return;
  const weightCard = ledger.querySelector(':scope > .results-card.weight');
  if (weightCard) weightCard.classList.add('t3-chart-hero');
  /* The live weight chart lives in the telemetry signal section once the
     telemetry module mounts (it hides the legacy #weightTrendLive by
     design); the signal section is chart hero #2 in that case. */
  const telemetrySignal = document.getElementById('gnTelemetrySignal');
  if (telemetrySignal && telemetrySignal.parentElement === ledger) telemetrySignal.classList.add('t3-chart-hero');
  const summaryCard = ledger.querySelector(':scope > .results-card.summary');
  if (summaryCard) summaryCard.classList.add('t3-demote-summary');
  /* Zero-data state: the weekly report is the designed "log to begin" CTA
     block — it leads, expanded, above the empty instruments. */
  const isEmpty = document.body.classList.contains('gn-results-empty');
  const order = isEmpty ? [
    '#gnWeeklyReport',
    '#gnTelemetrySignal',
    '.results-card.weight',
    '#gnPhaseHeatmap',
    '.results-card.summary',
    '#measurementTrendCard',
    '.results-card.effects',
    '.results-card.continuity',
    '.gn-reference-pending',
    '.results-safety'
  ] : [
    '.results-card.weight',
    '#gnTelemetrySignal',
    '#gnPhaseHeatmap',
    '#gnWeeklyReport',
    '.results-card.summary',
    '#measurementTrendCard',
    '.results-card.effects',
    '.results-card.continuity',
    '.gn-reference-pending',
    '.results-safety'
  ];
  for (let i = order.length - 1; i >= 0; i--) {
    const el = order[i].charAt(0) === '#'
      ? document.getElementById(order[i].slice(1))
      : ledger.querySelector(':scope > ' + order[i]);
    if (el && el.parentElement === ledger) ledger.prepend(el);
  }
}

/* TRACK 3 premium pass: empty states guide toward action. Appends a CTA
   button once per empty block; re-runs safely after i18n re-renders. */
function ensureResultsEmptyCtas() {
  const addCta = (hostId, key, fallback, onClick, secondary) => {
    const host = document.getElementById(hostId);
    if (!host || host.querySelector('.t3-empty-cta')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 't3-empty-cta' + (secondary ? ' secondary' : '');
    btn.textContent = tx(key, fallback);
    btn.addEventListener('click', onClick);
    host.appendChild(btn);
  };
  /* A1 simplification: on an empty PROGRESS screen the weekly report already
     offers LOG SHOT + LOG WEIGHT, and the FAB + page header offer the same.
     This helper used to add up to seven more identical CTAs (LOG SHOT alone
     appeared on the summary, appetite, energy, and side-effect empties), so
     the screen read as a wall of duplicate buttons. Keep one CTA per distinct
     job: first weight, first shot, and measurements (a different action).
     Appetite/energy empties get no CTA at all — no flow in the app records
     appetite or energy directly, so a LOG SHOT button there promised a
     result it cannot produce. */
  addCta('weightTrendEmpty', 'results.weightTrendEmptyCta', 'LOG YOUR FIRST WEIGHT', () => openWeightModal());
  addCta('resultsSummaryEmpty', 'shots.emptyShotsCta', 'LOG YOUR FIRST SHOT', () => openLogModal());
  addCta('measurementTrendEmpty', 'results.measurementsEmptyCta', 'OPEN VAULT', () => showPage('Profile', document.getElementById('navVault')), true);
}
document.addEventListener('gn:langchange', () => { try { ensureResultsEmptyCtas(); } catch (_) {} });

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
    /* TRACK 3: weekly report is a collapsible <details> — open only in the
       zero-data "log to begin" state (it carries the CTAs), collapsed once
       data exists. Order is normalized by ensureResultsHeroOrder(). */
    const markup = '<details class="gn-weekly-report" id="gnWeeklyReport" open><summary class="gn-weekly-summary"><span class="gn-foundation-kicker" data-i18n="results.weeklyKicker">// WEEKLY NODE REPORT</span><h3 id="gnWeeklyTitle" data-i18n="results.moreDataNeeded">MORE DATA NEEDED</h3></summary><p id="gnWeeklyCopy" data-i18n="results.weeklyEmptyCopy">Log a shot or log your weight to begin building your SIGNAL.</p><div class="gn-weekly-signals" id="gnWeeklySignals"></div><div class="gn-weekly-actions" id="gnWeeklyActions"><button type="button" onclick="openLogModal()" data-i18n="runtime.logShot">LOG SHOT</button><button type="button" onclick="openWeightModal()" data-i18n="dashboard.logWeight">LOG WEIGHT</button></div></details><div class="gn-reference-pending"><strong data-i18n="results.referencePendingTitle">REFERENCE DATA NOT LOADED</strong><br><span data-i18n="results.referencePendingHtml">Clinical comparison remains off until a medication-specific, source-verified dataset and uncertainty model are available. Your SIGNAL uses your own logged history.</span></div>';
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
  const report = document.getElementById('gnWeeklyReport');
  if (shots.length === 0 && weights.length === 0) {
    setText('gnWeeklyTitle', tx('results.moreDataNeeded', 'MORE DATA NEEDED'));
    setText('gnWeeklyCopy', tx('results.weeklyEmptyCopy', 'Log a shot or log your weight to begin building your SIGNAL.'));
    const signals = document.getElementById('gnWeeklySignals');
    if (signals) signals.innerHTML = '';
    setDisplay('gnWeeklyActions', true);
    /* TRACK 3: zero-data state stays expanded — it is the inviting
       "log to begin" CTA block. */
    report.open = true;
    return;
  }
  /* TRACK 3: with data, the report collapses — chart-first, show don't tell. */
  report.open = false;
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

/* Phase Heatmap: calendar colored by estimated phase state */
function renderPhaseHeatmap(shots) {
  var container = document.getElementById('gnPhaseHeatmap');
  if (!container || typeof PHASES === 'undefined') return;
  try {
    if (!shots || !shots.length) { container.hidden = true; return; }
    container.hidden = false;
    var now = new Date(); now.setHours(0,0,0,0);
    var start = new Date(now); start.setDate(start.getDate() - 34); // 5 weeks
    var shotTimes = shots.map(function(s){ var d = new Date(s.date); d.setHours(0,0,0,0); return d.getTime(); });
    var html = '<div class="gn-heatmap-grid">';
    var weekdays = ['S','M','T','W','T','F','S'];
    html += weekdays.map(function(d){ return '<div class="gn-heatmap-dow">' + d + '</div>'; }).join('');
    // align start to Sunday
    var d = new Date(start); d.setDate(d.getDate() - d.getDay());
    for (var i = 0; i < 35; i++) {
      var t = d.getTime();
      var isShot = shotTimes.indexOf(t) >= 0;
      var cls = 'gn-heatmap-day', title = '';
      // find most recent shot before/on this day for phase estimate
      var refShot = null;
      for (var s = shots.length - 1; s >= 0; s--) {
        var st = new Date(shots[s].date).getTime();
        if (st <= t + 86400000) { refShot = shots[s]; break; }
      }
      if (refShot) {
        var elapsed = Math.max(0, (t - new Date(refShot.date).getTime()) / 86400000);
        var cp = Math.min(0.999, elapsed / 7);
        var ph = PHASES.find(function(p){ return cp >= p.start && cp < p.end; }) || PHASES[PHASES.length-1];
        var col = ph.color || '#888';
        cls += ' has-phase';
        title = 'Phase: ' + (ph.name || '');
        html += '<div class="' + cls + '" style="background:' + col + '44;border-color:' + col + '" title="' + title + '"' + (isShot ? ' data-shot="1"' : '') + '>' + (isShot ? '<i></i>' : '') + '</div>';
      } else {
        html += '<div class="' + cls + ' empty"></div>';
      }
      d.setDate(d.getDate() + 1);
    }
    html += '</div>';
    html += '<div class="gn-heatmap-legend"><span>PHASE MAP · 5 WEEKS</span><span><i class="dot"></i>SHOT DAY</span></div>';
    container.innerHTML = html;
  } catch (_) { container.hidden = true; }
}

/* Scrub-to-inspect on weight chart */
function initWeightScrub(canvas, weights) {
  if (!canvas || !weights || !weights.length || canvas.dataset.scrubInit) return;
  canvas.dataset.scrubInit = '1';
  var tip = document.createElement('div');
  tip.className = 'gn-chart-scrub-tip';
  tip.hidden = true;
  canvas.parentElement.style.position = 'relative';
  canvas.parentElement.appendChild(tip);
  function showTip(clientX) {
    var r = canvas.getBoundingClientRect();
    var frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    var idx = Math.round(frac * (weights.length - 1));
    var w = weights[idx];
    if (!w) return;
    tip.hidden = false;
    tip.textContent = Number(w.weight).toFixed(1) + ' · ' + new Date(w.date).toLocaleDateString();
    tip.style.left = (frac * 100) + '%';
  }
  canvas.addEventListener('pointerdown', function(e){ showTip(e.clientX); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', function(e){ if (e.buttons) showTip(e.clientX); });
  canvas.addEventListener('pointerup', function(){ tip.hidden = true; });
  canvas.addEventListener('pointerleave', function(){ tip.hidden = true; });
}

function drawWeightTrendChart(canvas, weights, shots, goal) {
  /* Chart grammar tokens — canvas-literal mirrors of TOKEN-CONTRACT --chart-*.
     Canvas cannot consume CSS var() per pixel, so these literals are pinned to
     the token values; CSS/DOM/SVG chart elements use var(--chart-*) directly. */
  const CHART = {
    ACTUAL: '#00d4ff',                 /* --chart-actual: recorded data */
    ESTIMATE_LINE: 'rgba(255,209,102,.6)',  /* --chart-estimate #ffd166 at .6: dashed estimate lines */
    PLAN_LINE: 'rgba(167,139,250,.55)'      /* --chart-plan #a78bfa at .55: dashed plan lines */
  };
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
  if (Number(goal) > 0) { const goalY = yFor(goal); context.save(); context.setLineDash([5, 4]); context.strokeStyle = CHART.PLAN_LINE; context.beginPath(); context.moveTo(left, goalY); context.lineTo(width - right, goalY); context.stroke(); context.restore(); }

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
  // Ribbon: smoothed trend corridor (±1 std band around moving average)
  try {
    var win = Math.max(2, Math.floor(values.length / 5));
    var smooth = values.map(function(_, i){
      var s = Math.max(0, i - win), e = Math.min(values.length, i + win + 1);
      var slice = values.slice(s, e);
      return slice.reduce(function(a,b){return a+b;},0) / slice.length;
    });
    var resid = values.map(function(v, i){ return Math.abs(v - smooth[i]); });
    var sigma = resid.reduce(function(a,b){return a+b;},0) / (resid.length || 1) || (span * 0.03);
    context.save();
    context.fillStyle = 'rgba(0,230,240,.10)';
    context.beginPath();
    smooth.forEach(function(v, i){ var x = xFor(i), y = yFor(v + sigma); i ? context.lineTo(x, y) : context.moveTo(x, y); });
    for (var ri = smooth.length - 1; ri >= 0; ri--) { context.lineTo(xFor(ri), yFor(smooth[ri] - sigma)); }
    context.closePath(); context.fill();
    // smoothed center path (dashed = trend estimate; grammar: dashed amber)
    context.setLineDash([6, 4]); context.strokeStyle = CHART.ESTIMATE_LINE; context.lineWidth = 1.5;
    context.beginPath();
    smooth.forEach(function(v, i){ var x = xFor(i), y = yFor(v); i ? context.lineTo(x, y) : context.moveTo(x, y); });
    context.stroke(); context.restore();
  } catch (_) {}

  context.shadowColor = 'rgba(0, 230, 240, 0.65)'; context.shadowBlur = 14; context.strokeStyle = 'rgba(0, 230, 240, 0.55)'; context.lineWidth = 4; context.beginPath();
  points.forEach((p, i) => { if (!i) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y); });
  context.stroke();
  context.shadowBlur = 7; context.strokeStyle = '#00E6F0'; context.lineWidth = 2; context.beginPath();
  points.forEach((p, i) => { if (!i) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y); });
  context.stroke(); context.shadowBlur = 0;

  context.fillStyle = '#00E6F0';
  points.forEach(p => { context.beginPath(); context.arc(p.x, p.y, 3, 0, Math.PI * 2); context.fill(); });
  try { initWeightScrub(canvas, weights); } catch (_) {}
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
    // Dose-change = recorded event → grammar cyan (--chart-actual) with white
    // inner ring so it stays the highest-attention node on the chart.
    context.fillStyle = changed ? CHART.ACTUAL : '#FF3B3B';
    context.beginPath(); context.arc(px, py, changed ? 6 : 4, 0, Math.PI * 2); context.fill();
    if (changed) {
      context.strokeStyle = '#ffffff'; context.lineWidth = 1.5;
      context.beginPath(); context.arc(px, py, 3.2, 0, Math.PI * 2); context.stroke();
      context.fillStyle = CHART.ACTUAL; context.font = '9px Share Tech Mono, monospace'; context.fillText(tx('results.chartDose', 'DOSE'), Math.min(width - 38, px + 5), Math.max(10, py - 7));
    }
    shotMarkers.push({ x: px, y: py, kind: changed ? 'dose' : 'shot', t: time });
    priorDose = dose;
  });
  // Shot event lane: ticks on the same time axis below the chart
  try {
    var laneY = height - 14;
    context.strokeStyle = 'rgba(127,127,127,.25)'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(left, laneY); context.lineTo(width - right, laneY); context.stroke();
    var t0 = start.getTime(), t1 = end.getTime(), tspan = (t1 - t0) || 1;
    (shots || []).forEach(function(shot){
      var st = parseLocalDate(shot.date).getTime();
      if (!Number.isFinite(st) || st < t0 || st > t1) return;
      var sx = left + ((st - t0) / tspan) * plotWidth;
      context.fillStyle = '#00d4ff'; context.shadowColor = '#00d4ff'; context.shadowBlur = 5;
      context.fillRect(sx - 1.5, laneY - 7, 3, 14);
      context.shadowBlur = 0;
    });
  } catch (_) {}
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
    { key: 'dose',   label: tx('results.legendDose', 'DOSE') },
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
  /* Chart grammar token — canvas-literal mirror of --chart-estimate
     (#ffd166), same pattern as the CHART constants in drawWeightTrendChart:
     a flat delta is an estimate-state reading, not a recorded direction. */
  const ESTIMATE = '#ffd166'; /* --chart-estimate */
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.fillStyle = delta < -0.05 ? '#00ff88' : delta > 0.05 ? '#FF5B5B' : ESTIMATE;
  context.font = '700 14px Share Tech Mono, monospace';
  context.textAlign = 'left';
  context.fillText(arrow, Math.min(width - 16, xFor(values.length - 1) + 7), yFor(values.at(-1)) + 5);
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
  /* Appetite/energy trend cards removed (full-pass residual): no code
     anywhere wrote into them, so they rendered a permanent empty state. */
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
    const liveLabel = localizedPhaseName(phase) || tx('results.active', 'ACTIVE');
    readout.replaceChildren(document.createTextNode(liveLabel ? liveLabel + ' ' : ''), detail);
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

