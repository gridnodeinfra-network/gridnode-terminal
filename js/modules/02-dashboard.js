export function computeTotalChange(weights = [], profile = {}, baseline = 'profile') {
  const ordered = [...weights]
    .filter(record => Number.isFinite(Number(record?.weight)) && Number(record.weight) > 0)
    .sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));
  const first = ordered[0] || null;
  const latest = ordered.at(-1) || null;
  const profileStart = Number(profile?.startWt);
  const hasProfileBaseline = Number.isFinite(profileStart) && profileStart > 0;
  const baselineWeight = baseline === 'profile' && hasProfileBaseline ? profileStart : Number(first?.weight) || null;
  const currentWeight = Number(latest?.weight) || baselineWeight;
  const change = baselineWeight && currentWeight ? currentWeight - baselineWeight : null;
  const spanDays = first && latest ? Math.max(0, (parseLocalDate(latest.date) - parseLocalDate(first.date)) / 86400000) : 0;
  const basis = baseline === 'profile' && hasProfileBaseline ? 'from profile start weight' : 'from first recorded weight';
  return {
    first,
    latest,
    baselineWeight,
    currentWeight,
    change,
    percentLost: change !== null && baselineWeight ? Math.abs(change) / baselineWeight * 100 : null,
    weeklyAverage: change !== null && spanDays >= 14 ? change / (spanDays / 7) : null,
    basis,
    spanDays
  };
}

function setTodayDefaults() {
  const now = new Date();
  const date = $('sDate');
  const time = $('sTime');
  const wtDate = $('wtDate');
  if (date && !date.value) setHumanDateInput(date, todayISO());
  if (time && !time.value) time.value = formatTime12(now);
  if (wtDate && !wtDate.value) setHumanDateInput(wtDate, todayISO(), true);
  moduleState.meridiem = now.getHours() >= 12 ? 'PM' : 'AM';
  updateMeridiemButtons();
  syncCustomPickers(document);
}

function hydrateProfileFields(profile) {
  const fields = {
    profDose: profile.dose, profHtFt: profile.htFt, profHtIn: profile.htIn,
    profAge: profile.age, profStartWt: profile.startWt, profGoalWt: profile.goalWt
  };
  Object.entries(fields).forEach(([id, value]) => { if ($(id) && value != null) $(id).value = value; });
  const medicationId = normalizeMedicationId(profile.med);
  if (medicationId) setSelect('cpMedProf', medicationId, medicationLabel(medicationId));
  if (profile.shotDay !== undefined && profile.shotDay !== '') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    setSelect('cpShotDayProf', String(profile.shotDay), days[Number(profile.shotDay)] || 'Select shot day');
  }
  if (profile.sex) setSelect('cpSexProf', profile.sex, profile.sex);
  calcAndShowBMI();
}

function profileSnapshot() {
  const profile = getProfile();
  profile.name = profile.name || window.CU?.defaultName || 'NODE_USER';
  profile.med = normalizeMedicationId(selectState.cpMedProf?.val || profile.med);
  profile.dose = $('profDose')?.value || profile.dose || '';
  profile.shotDay = selectState.cpShotDayProf?.val !== undefined ? Number(selectState.cpShotDayProf.val) : profile.shotDay;
  profile.htFt = $('profHtFt')?.value || profile.htFt || '';
  profile.htIn = $('profHtIn')?.value || profile.htIn || '';
  profile.age = $('profAge')?.value || profile.age || '';
  profile.sex = selectState.cpSexProf?.val || profile.sex || '';
  profile.startWt = $('profStartWt')?.value || profile.startWt || '';
  profile.goalWt = $('profGoalWt')?.value || profile.goalWt || '';
  return profile;
}

export function saveProfileMed() {
  const profile = profileSnapshot();
  const saved = S.set('profile', profile);
  setText('profMedTxt', normalizeMedicationId(profile.med) ? `// ${medicationLabel(profile.med).toUpperCase()}` : tx('profile.noMedicationSet', '// NO MEDICATION SET'));
  if (saved) queueCloudSync('profile', profile);
  showToast(saved ? tx('profile.protocolSaved', 'Profile protocol context saved.') : tx('profile.storageFull', 'Profile could not be saved — storage is full.'), !saved);
}

export function saveProfileMetrics() {
  const profile = profileSnapshot();
  if (S.set('profile', profile)) queueCloudSync('profile', profile);
  calcAndShowBMI();
}

export function calcAndShowBMI() {
  const profile = getProfile();
  const feet = Number($('profHtFt')?.value || profile.htFt);
  const inches = Number($('profHtIn')?.value || profile.htIn || 0);
  const current = latestWeight()?.weight || Number(profile.startWt);
  const totalInches = (feet * 12) + inches;
  if (!feet || !current || !totalInches) { setDisplay('profBMIDisplay', false); return null; }
  const bmi = (current / (totalInches ** 2) * 703).toFixed(1);
  setText('profBMIVal', bmi);
  setText('profBMICat', '');
  setDisplay('profBMIDisplay', true);
  return Number(bmi);
}

function setSelect(id, value, label) {
  selectState[id] = { val: value, label };
  const valueElement = $(`${id}Val`);
  if (valueElement) { valueElement.textContent = label; valueElement.classList.remove('placeholder'); }
  qa(`#${id}Drop .cp-option`).forEach(option => {
    const selected = option.textContent.trim() === String(label).trim();
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-selected', String(selected));
  });
}

export function toggleSelect(id) {
  const dropdown = $(`${id}Drop`);
  const trigger = dropdown?.previousElementSibling;
  if (!dropdown || !trigger) return;
  qa('.cp-dropdown.open').forEach(item => item.classList.remove('open'));
  qa('.cp-select-trigger.open').forEach(item => { item.classList.remove('open'); item.setAttribute('aria-expanded', 'false'); });
  const willOpen = !dropdown.classList.contains('open');
  dropdown.classList.toggle('open', willOpen);
  trigger.classList.toggle('open', willOpen);
  trigger.setAttribute('aria-expanded', String(willOpen));
}

export function selectOpt(id, value, label, callback) {
  setSelect(id, value, label);
  const dropdown = $(`${id}Drop`);
  dropdown?.classList.remove('open');
  dropdown?.previousElementSibling?.classList.remove('open');
  dropdown?.previousElementSibling?.setAttribute('aria-expanded', 'false');
  if (typeof callback === 'function') callback();
}

function renderDashboard() {
  ensureWandaDashboard();
  const shots = sortedShots();
  const weights = sortedWeights();
  const lastShot = shots.at(-1);
  const lastWeight = weights.at(-1);
  const profile = getProfile();
  const dashboard = document.getElementById('pageDash');
  const firstShotMission = document.getElementById('gnFirstShotMission');
  if (dashboard) dashboard.dataset.activation = shots.length ? 'active' : 'pending';
  if (firstShotMission) firstShotMission.hidden = shots.length > 0;
  // Batch B: empty state — ONE red CTA, cyan ghosts, tip card; wanda + FAB hidden.
  let hero = document.getElementById('gnEmptyHero');
  if (shots.length === 0) {
    if (!hero && dashboard) {
      const heroMarkup = '<section id="gnEmptyHero" class="gn-empty-hero" aria-label="' + safeText(tx('dashboard.emptyTitle', 'Get started')) + '">'
        + '<h2 data-i18n="dashboard.emptyTitle">' + tx('dashboard.emptyTitle', 'Empieza con tu primera dosis') + '</h2>'
        + '<p data-i18n="dashboard.emptyBody">' + tx('dashboard.emptyBody', 'Una dosis desbloquea el Motor de Fases, RESULTADOS y tu tablero completo.') + '</p>'
        + '<button class="btn-full btn-primary gn-empty-cta" type="button" onclick="openLogModal()" data-i18n="dashboard.emptyCta">' + tx('dashboard.emptyCta', 'REGISTRAR MI PRIMERA DOSIS') + '</button>'
        + '<div class="gn-empty-ghosts">'
        + '<button class="gn-empty-ghost" type="button" onclick="openWeightModal()" data-i18n="dashboard.emptyWeight">' + tx('dashboard.emptyWeight', 'Registrar peso') + '</button>'
        + '<button class="gn-empty-ghost" type="button" onclick="showPage(\'Log\',document.getElementById(\'navLog\'))" data-i18n="dashboard.emptyScan">' + tx('dashboard.emptyScan', 'Escanear zona') + '</button>'
        + '<button class="gn-empty-ghost" type="button" onclick="showPage(\'Lab\',document.getElementById(\'navLab\'))" data-i18n="dashboard.emptyLab">' + tx('dashboard.emptyLab', 'Ver LAB') + '</button>'
        + '</div>'
        + '<div class="gn-tip-card"><span class="gn-tip-kicker" data-i18n="dashboard.tipTitle">' + tx('dashboard.tipTitle', 'TIP') + '</span><p data-i18n="dashboard.tipBody">' + tx('dashboard.tipBody', 'Choose the medication and dose, then add the date, time, and application zone.') + '</p></div>'
        + '</section>';
      const wanda = document.getElementById('gnWandaDashboard');
      if (wanda) wanda.insertAdjacentHTML('beforebegin', heroMarkup);
      else dashboard.insertAdjacentHTML('afterbegin', heroMarkup);
      hero = document.getElementById('gnEmptyHero');
    }
    const wandaEl = document.getElementById('gnWandaDashboard');
    if (wandaEl) wandaEl.style.display = 'none';
    document.body.classList.add('gn-dashboard-empty');
  } else {
    if (hero) hero.remove();
    const wandaEl = document.getElementById('gnWandaDashboard');
    if (wandaEl) wandaEl.style.display = '';
    document.body.classList.remove('gn-dashboard-empty');
  }
  const weightMetrics = computeTotalChange(weights, profile, 'profile');
  setNumericText('stShots', shots.length);
  setText('stDose', lastShot?.dose ? `${lastShot.dose}mg` : '—');
  setText('stDoseDate', lastShot ? formatDate(lastShot.date, { month: 'short', day: 'numeric' }) : tx('runtime.noData', 'NO DATA'));
  const next = nextShotDate(lastShot, profile);
  setText('stNext', next ? formatDate(next, { month: 'short', day: 'numeric' }) : '—');
  setText('stNextSub', next ? tx('runtime.estimatedFromProfile', 'ESTIMATED FROM PROFILE') : tx('runtime.logShot', 'LOG SHOT'));
  const nextCard = $('nextShotStatCard');
  if (nextCard) nextCard.classList.remove('gn-next-today', 'gn-next-tomorrow', 'gn-next-overdue');
  if (next) {
    const deltaDays = Math.round((parseLocalDate(next).getTime() - parseLocalDate(todayISO()).getTime()) / 86400000);
    if (deltaDays === 0) { nextCard?.classList.add('gn-next-today'); setText('stNextSub', '// ' + tx('dashboard.today', 'TODAY')); }
    else if (deltaDays === 1) { nextCard?.classList.add('gn-next-tomorrow'); setText('stNextSub', tx('dashboard.tomorrow', 'TOMORROW')); }
    else if (deltaDays < 0) { nextCard?.classList.add('gn-next-overdue'); setText('stNextSub', '// ' + tx('dashboard.overdue', 'OVERDUE')); }
  }
  const todayShot = shots.find(record => record.date?.slice(0, 10) === todayISO());
  const todayWeight = weights.find(record => record.date?.slice(0, 10) === todayISO());
  setText('todayShot', todayShot ? tx('dashboard.loggedDose', '{dose}mg logged', { dose: todayShot.dose || '—' }) : tx('runtime.tapToLog', 'TAP TO LOG'));
  setText('todayWt', todayWeight ? Number(todayWeight.weight).toFixed(1) + ' lb' : tx('runtime.tapToLog', 'TAP TO LOG'));
  const currentWeight = weightMetrics.currentWeight || 0;
  const change = weightMetrics.change;
  const goalGap = Number(profile.goalWt) && currentWeight ? currentWeight - Number(profile.goalWt) : null;
  setText('s6TotalLabel', tx('dashboard.resultsTotal', 'TOTAL CHANGE'));
  setText('s6TotalBasis', weightMetrics.basis === 'from profile start weight' ? tx('dashboard.fromProfileStart', '(from profile start)') : tx('dashboard.fromFirstWeight', '(from first recorded weight)'));
  setText('s6Total', change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)} lb`);
  const dashboardBMI = calcBMIValue(currentWeight, profile);
  setText('s6BMI', dashboardBMI || '');
  setDisplay('s6BMICard', Boolean(dashboardBMI));
  setText('s6Wt', currentWeight ? `${currentWeight.toFixed(1)} lb` : '—');
  setText('s6Pct', weightMetrics.percentLost === null ? '—' : `${weightMetrics.percentLost.toFixed(1)}%`);
  setText('s6Avg', weightMetrics.weeklyAverage === null ? '—' : tx('dashboard.weeklyRate', '{value} lb/wk', { value: weightMetrics.weeklyAverage.toFixed(1) }));
  setText('s6Goal', goalGap === null ? '—' : `${Math.max(0, goalGap).toFixed(1)} lb`);
  const phase = renderPhase(lastShot, shots);
  renderProtocolCurve(shots, phase);
  refreshNodeHeader({ lastShot, next, phase, currentWeight: lastWeight?.weight });
  setText('streakText', shots.length ? tx(shots.length === 1 ? 'dashboard.shotsInLocalRecord_one' : 'dashboard.shotsInLocalRecord_other', '{count} SHOTS IN YOUR LOCAL RECORD', { count: shots.length }) : tx('dashboard.noShotCadence', 'NO SHOT CADENCE YET · LOG YOUR FIRST SHOT'));
  drawCanvasChart($('dashWtChart'), weights.map(item => Number(item.weight)), '#00d4ff');
  renderWandaDashboard({ shots, weights, lastShot, lastWeight, profile, next, phase, weightMetrics, goalGap });
}

function ensureWandaDashboard() {
  const header = document.getElementById('pageDash')?.querySelector('.page-hdr');
  if (!header || document.getElementById('gnWandaDashboard')) return;
  const markup = '<section id="gnWandaDashboard" aria-label="' + safeText(tx('dashboard.currentProtocolSignals', 'Current protocol signals')) + '">'
    + '<section class="gn-dashboard-mission" id="gnFirstShotMission" aria-labelledby="gnFirstShotMissionTitle"><span class="gn-dashboard-mission-kicker" data-i18n="dashboard.firstShotKicker">START HERE</span><h2 id="gnFirstShotMissionTitle" data-i18n="shots.activateYourGrid">LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID</h2><p data-i18n="shots.firstShotSub">One shot unlocks the Phase Engine, RESULTS, and your full dashboard.</p><button type="button" onclick="openLogModal()" data-i18n="shots.logYourFirst">LOG YOUR FIRST SHOT</button></section>'
    + '<div class="gn-wanda-grid">'
    + '<button class="gn-wanda-card" id="gnWandaNext" type="button" onclick="openLogModal()"><span class="gn-wanda-label" data-i18n="dashboard.nextShotLabel">NEXT SHOT</span><b class="gn-wanda-value" id="gnWandaNextValue">' + tx('runtime.logShot', 'LOG SHOT') + '</b><small class="gn-wanda-note" id="gnWandaNextNote" data-i18n="dashboard.logShotStartTimeline">Log a shot to start your timeline</small></button>'
    + '<button class="gn-wanda-card" id="gnWandaPhase" type="button" onclick="showPhasesModal()"><span class="gn-wanda-label" data-i18n="dashboard.currentPhase">CURRENT PHASE</span><b class="gn-wanda-value" id="gnWandaPhaseValue">' + tx('dashboard.startWithShot', 'START WITH A SHOT') + '</b><small class="gn-wanda-note" data-i18n="phase.educationalEstimate">EDUCATIONAL ESTIMATE</small></button>'
    + '<button class="gn-wanda-card info" id="gnWandaWeight" type="button" onclick="openWeightModal()"><span class="gn-wanda-label" data-i18n="dashboard.currentWeight">CURRENT WEIGHT</span><b class="gn-wanda-value" id="gnWandaWeightValue">' + tx('dashboard.logWeight', 'LOG WEIGHT') + '</b><small class="gn-wanda-note" data-i18n="dashboard.latestRecord">Latest record</small></button>'
    + '<button class="gn-wanda-card" id="gnWandaLevel" type="button" onclick="showPhasesModal()"><span class="gn-wanda-label" data-i18n="dashboard.relativeLevel">RELATIVE LEVEL</span><b class="gn-wanda-value" id="gnWandaLevelValue">' + tx('dashboard.startWithShot', 'START WITH A SHOT') + '</b><small class="gn-wanda-note" data-i18n="dashboard.estimatedNotMeasured">Estimated, not measured</small></button>'
    + '<button class="gn-wanda-card" id="gnWandaRate" type="button" onclick="showPage(\'Results\',document.getElementById(\'navRes\'))"><span class="gn-wanda-label" data-i18n="dashboard.weeklyRateLabel">WEEKLY RATE</span><b class="gn-wanda-value" id="gnWandaRateValue">' + tx('dashboard.keepLogging', 'KEEP LOGGING') + '</b><small class="gn-wanda-note" data-i18n="dashboard.keepLoggingBuilds">Keep logging — data builds over time</small></button>'
    + '<button class="gn-wanda-card info" id="gnWandaGoal" type="button" onclick="showPage(\'Profile\',document.getElementById(\'navPro\'))"><span class="gn-wanda-label" data-i18n="dashboard.toGoal">TO GOAL</span><b class="gn-wanda-value" id="gnWandaGoalValue">' + tx('dashboard.setGoal', 'SET GOAL') + '</b><small class="gn-wanda-note" data-i18n="dashboard.fromLatestWeight">From latest weight</small></button>'
    + '</div><div class="gn-wanda-actions"><button type="button" onclick="openLogModal()" data-i18n="runtime.logShot">LOG SHOT</button><button type="button" onclick="openWeightModal()" data-i18n="dashboard.logWeight">LOG WEIGHT</button></div><div class="gn-streak-card" id="gnStreakCard" hidden><b id="gnStreakValue"></b><span id="gnStreakCopy"></span></div></section>';
  header.insertAdjacentHTML('afterend', markup);
  window.GN_I18N?.applyTo?.(document.getElementById('gnWandaDashboard'));
  ['.stat-row', '.weight-quick', '.stats-6', '#dashAdherence', '#dashWtChart'].forEach(selector => {
    const element = document.getElementById('pageDash')?.querySelector(selector);
    if (element) element.closest('.chart-wrap')?.style.setProperty('display', 'none') || element.style.setProperty('display', 'none');
  });
  Array.from(document.querySelectorAll('#pageDash > .sec-hdr')).slice(0, 2).forEach(element => element.style.display = 'none');
}

function calculateShotStreak(shots = []) {
  const timestamps = shots.map(item => new Date(item.date).getTime()).filter(Number.isFinite).filter(value => value <= Date.now());
  if (!timestamps.length) return 0;
  const latest = Math.max(...timestamps);
  const buckets = new Set(timestamps.map(value => Math.floor((latest - value) / 604800000)));
  let streak = 0;
  while (buckets.has(streak)) streak += 1;
  return streak;
}

function renderShotStreak(shots, next) {
  const card = document.getElementById('gnStreakCard');
  if (!card) return;
  const weeks = calculateShotStreak(shots);
  if (weeks < 2) { card.hidden = true; return; }
  const due = next || new Date(Math.max(...shots.map(item => new Date(item.date).getTime()).filter(Number.isFinite)) + 604800000).toISOString();
  const date = formatDate(due, { month: 'short', day: 'numeric' });
  card.hidden = false;
  setText('gnStreakValue', tx(weeks === 1 ? 'dashboard.weeksInRow_one' : 'dashboard.weeksInRow_other', '{count} WEEKS IN A ROW ✓', { count: weeks }));
  setText('gnStreakCopy', tx('dashboard.streakCopy', 'Log your next shot by {date} to keep your streak alive.', { date }));
}

function renderWandaDashboard({ shots, lastShot, lastWeight, next, phase, weightMetrics, goalGap }) {
  window.GN_I18N?.applyTo?.(document.getElementById('gnWandaDashboard'));
  setText('gnWandaNextValue', next ? formatDate(next, { month: 'short', day: 'numeric' }) : tx('runtime.logShot', 'LOG SHOT'));
  let nextNote = tx('dashboard.logShotStartTimeline', 'Log a shot to start your timeline');
  const nextCard = document.getElementById('gnWandaNext');
  nextCard?.classList.remove('attention', 'empty');
  if (next) {
    const delta = Math.round((parseLocalDate(next).getTime() - parseLocalDate(todayISO()).getTime()) / 86400000);
    nextNote = delta < 0
      ? tx('dashboard.daysPastExpected', '{days}d past expected', { days: Math.abs(delta) })
      : delta === 0 ? tx('dashboard.expectedToday', 'Expected today')
        : delta === 1 ? tx('dashboard.expectedTomorrow', 'Expected tomorrow')
          : tx('dashboard.expectedInDays', 'Expected in {days}d', { days: delta });
    nextCard?.classList.toggle('attention', delta <= 0);
  } else nextCard?.classList.add('empty');
  setText('gnWandaNextNote', nextNote);
  const localizedName = localizedPhaseName(phase);
  setText('gnWandaPhaseValue', localizedName || tx('dashboard.startWithShot', 'START WITH A SHOT'));
  setText('gnWandaWeightValue', lastWeight ? Number(lastWeight.weight).toFixed(1) + ' lb' : tx('dashboard.logWeight', 'LOG WEIGHT'));
  setText('gnWandaLevelValue', localizedName || tx('dashboard.startWithShot', 'START WITH A SHOT'));
  setText('gnWandaRateValue', weightMetrics.weeklyAverage === null ? tx('dashboard.keepLogging', 'KEEP LOGGING') : tx('dashboard.weeklyRate', '{value} lb/wk', { value: weightMetrics.weeklyAverage.toFixed(1) }));
  setText('gnWandaGoalValue', goalGap === null ? tx('dashboard.setGoal', 'SET GOAL') : Math.max(0, goalGap).toFixed(1) + ' lb');
  document.getElementById('gnWandaPhase')?.classList.toggle('empty', !phase);
  document.getElementById('gnWandaWeight')?.classList.toggle('empty', !lastWeight);
  document.getElementById('gnWandaLevel')?.classList.toggle('empty', !phase);
  document.getElementById('gnWandaRate')?.classList.toggle('empty', weightMetrics.weeklyAverage === null);
  document.getElementById('gnWandaGoal')?.classList.toggle('empty', goalGap === null);
  renderShotStreak(shots, next);
}

function calcBMIValue(weight, profile) {
  const feet = Number(profile.htFt);
  const inches = Number(profile.htIn || 0);
  const total = feet * 12 + inches;
  return weight && total ? (weight / total ** 2 * 703).toFixed(1) : '';
}

function nextShotDate(shot, profile) {
  if (!shot) return null;
  const date = new Date(shot.date);
  if (Number.isNaN(date.getTime())) return null;
  const days = Number.isFinite(Number(profile.shotDay)) ? ((Number(profile.shotDay) - date.getDay() + 7) % 7 || 7) : 7;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function renderPhase(lastShot, shots) {
  if (!lastShot) {
    setText('phaseNameTxt', tx('dashboard.noShotsRecorded', 'NO SHOTS RECORDED'));
    setText('phaseNumTxt', tx('boot.initiateProtocol', 'INITIATE PROTOCOL — log first shot'));
    setText('phaseTimeSince', '—');
    setText('phaseCyclePosition', '—');
    setText('ringDays', '—');
    setText('ringPct', tx('phase.firstShotCta', 'TAP FAB // LOG FIRST SHOT'));
    setText('phaseContextText', tx('phase.logShotContext', 'Log a SHOT to see educational cycle context grounded in your own records.'));
    setText('phaseNext', tx('phase.initiateProtocol', '> INITIATE PROTOCOL — log first shot'));
    setText('pibBody', tx('phase.awaitingFirstRecord', 'Awaiting first logged SHOT — protocol initializes on first record.'));
    setText('pibSE', tx('phase.sideEffectsVary', 'Side effects vary by phase and medication.'));
    setText('pibPay', tx('phase.appetiteSymptoms', 'Track appetite, symptoms, energy, side effects, and notes as your protocol history develops.'));
    const emptyMarker = document.getElementById('phaseMarker');
    if (emptyMarker) emptyMarker.hidden = true;
    return null;
  }
  const elapsedDays = Math.max(0, (Date.now() - new Date(lastShot.date).getTime()) / 86400000);
  const cyclePosition = Math.min(elapsedDays / 7, 0.999);
  const phase = PHASES.find(item => cyclePosition >= item.start && cyclePosition < item.end) || PHASES.at(-1);
  const since = elapsedDays < 1 ? Math.floor(elapsedDays * 24) + 'h' : Math.floor(elapsedDays) + 'd ' + Math.floor((elapsedDays % 1) * 24) + 'h';
  const phaseName = localizedPhaseName(phase);
  setText('phaseNameTxt', phaseName);
  setText('phaseNumTxt', tx('phase.phaseN', 'PHASE {n} / {total}', { n: PHASES.indexOf(phase) + 1, total: PHASES.length }));
  setText('phaseSupportTxt', localizedPhaseSupport(phase));
  setText('phaseContextText', localizedPhaseContext(phase));
  setText('phaseTimeSince', since);
  setText('phaseCyclePosition', tx('phase.cyclePct', '{pct}% of 7-day reference cycle', { pct: Math.round(cyclePosition * 100) }));
  setText('ringDays', tx('phase.daysLeft', '{n}d', { n: Math.max(0, 7 - Math.floor(elapsedDays)) }));
  setText('ringPct', tx('phase.cyclePositionRing', '{pct}% CYCLE POSITION', { pct: Math.round(cyclePosition * 100) }));
  setText('phaseNext', tx(shots.length === 1 ? 'phase.activeRecords_one' : 'phase.activeRecords_other', '> {phase} // {n} ACTIVE SHOT RECORDS', { phase: phaseName, n: shots.length }));
  setText('pibBody', tx('phase.pibBody', '{phase} visibility is estimated from {since} since the most recent user-entered SHOT.', { phase: phaseName, since }));
  setText('pibSE', lastShot.se?.length ? tx('phase.recentObservations', 'Recent logged observations: {items}.', { items: lastShot.se.map(sideEffectLabel).join(', ') }) : tx('phase.noRecentObservations', 'No side effects were attached to the most recent SHOT record.'));
  setText('pibPay', tx('phase.appetiteSymptoms', 'Track appetite, symptoms, energy, side effects, and notes as your protocol history develops.'));
  const arc = document.getElementById('phaseArc');
  if (arc) { const circumference = 678.6; arc.style.strokeDashoffset = String(circumference * (1 - cyclePosition)); arc.style.stroke = phase.color; }
  const marker = document.getElementById('phaseMarker');
  if (marker) {
    const angle = (cyclePosition * Math.PI * 2) - (Math.PI / 2);
    marker.style.left = (50 + (Math.cos(angle) * 45)) + '%';
    marker.style.top = (50 + (Math.sin(angle) * 45)) + '%';
    marker.style.background = phase.color;
    marker.style.color = phase.color;
    marker.hidden = false;
  }
  const icon = document.getElementById('phaseIconBox');
  if (icon) icon.innerHTML = '<span class="gn-icon gn-icon-lg gn-icon-hud" style="color:' + phase.color + '"><svg><use href="#gn-phase-ring"></use></svg></span>';
  return phase;
}

export function showPhasesModal() {
  const content = $('allPhasesContent');
  if (content) content.innerHTML = PHASES.map((phase, index) => '<div class="gn-phase-row"><span class="gn-phase-index">0' + (index + 1) + '</span><div><b style="color:' + phase.color + '">' + localizedPhaseName(phase) + '</b><p>' + safeText(localizedPhaseSupport(phase)) + '</p></div></div>').join('');
  $('phasesOv')?.classList.add('active');
}
export function closePhases() { $('phasesOv')?.classList.remove('active'); }
