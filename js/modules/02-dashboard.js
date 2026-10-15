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

/* v8.1 session boundary (QA gate G2b): the LOG SHOT drawer is persistent
 * DOM and moduleState outlives any single session, and no sign-out path
 * used to clear them — on a same-tab logout → login the next account's
 * drawer opened pre-filled with the previous account's med, dose and
 * notes, even though the session-storage draft was correctly purged.
 * Core calls this via GN_NATIVE.resetSessionShotForm() from
 * clearSession() (session end) and activateSession() (session start),
 * so a drawer opened under a new owner is pristine. FORM STATE ONLY:
 * the stored session draft is owner-guarded separately, and the same
 * owner's draft still restores on the next open. Every field the draft
 * contract touches is reset: med selection, dose, date, time/meridiem,
 * weight, notes, side-effect checkboxes, device, location, edit and
 * quick-confirm state. */
export function resetShotFormState() {
  moduleState.shotDraft = null;
  moduleState.pendingLocationDraft = false;
  moduleState.editingShotId = null;
  moduleState.quickConfirmShot = null;
  moduleState.selectedLocation = '';
  delete selectState.cpShotMed;
  const modal = $('logOv');
  if (modal) {
    delete modal.dataset.gnModuleDraft;
    modal.classList.remove('gn-quick-mode');
    $('gnQuickConfirm')?.classList.add('gn-hidden');
    const medValue = $('cpShotMedVal');
    if (medValue) { medValue.textContent = tx('shot.selectMedication', 'Select medication'); medValue.classList.add('placeholder'); }
    qa('#cpShotMedDrop .cp-option').forEach(option => { option.classList.remove('selected'); option.setAttribute('aria-selected', 'false'); });
    if ($('sDose')) $('sDose').value = '';
    if ($('sWt')) $('sWt').value = '';
    if ($('sNotes')) $('sNotes').value = '';
    if ($('sTime')) $('sTime').value = '';
    const date = $('sDate');
    if (date) { date.value = ''; delete date.dataset.isoDate; delete date.dataset.dateDisplay; }
    qa('#logOv input[type="checkbox"]').forEach(input => { input.checked = false; });
    if ($('shotDeviceId')) $('shotDeviceId').value = '';
    setText('modalSelectedLocation', tx('shot.noInjectionSite', 'No injection site selected'));
    syncCustomPickers(modal);
  }
  const now = new Date();
  moduleState.meridiem = now.getHours() >= 12 ? 'PM' : 'AM';
  updateMeridiemButtons();
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
  /* CLARITY PASS (P3): while the workspace is empty the wanda placeholder
     grid + duplicate action row hide — the mission's three actions are the
     whole invitation. They return with the first shot. */
  const wandaSection = document.getElementById('gnWandaDashboard');
  if (wandaSection) wandaSection.classList.toggle('gn-wanda-empty', shots.length === 0);
  const weights = sortedWeights();
  const lastShot = shots.at(-1);
  const lastWeight = weights.at(-1);
  const profile = getProfile();
  const dashboard = document.getElementById('pageDash');
  const firstShotMission = document.getElementById('gnFirstShotMission');
  if (dashboard) dashboard.dataset.activation = shots.length ? 'active' : 'pending';
  // S1: honest empty states. A cloud user whose records simply haven't arrived
  // yet must never see the first-run CTA. Modes: first-shot (genuinely no data),
  // syncing (hydration pending), sync-failed (transient cloud failure + retry).
  /* CLARITY PASS (P1): mode truth comes from state.cloud — the flag only
     activateSession(session, true) sets. session.user.id also exists for
     LOCAL sessions ('local') and state.cloudClient is created at boot on
     any network, so the old (id && client) test showed local users the
     cloud SYNCING panel forever (cloudHydration is never set in local). */
  const cloudUser = Boolean(state.cloud && state.session?.user?.id);
  let missionMode = 'first-shot';
  if (shots.length === 0 && cloudUser && state.cloudHydration !== 'ok') {
    missionMode = state.cloudHydration === 'failed' ? 'sync-failed' : 'syncing';
  }
  renderFirstShotMission(missionMode);
  /* TRACK C: one loading pattern — while cloud hydration is pending the
     page carries .gn-ux-syncing (11-ux-states.css): the mission shows
     skeleton bars and the not-yet-real metric values are dimmed, so a
     syncing user never reads placeholder zeros as their data. */
  if (dashboard) dashboard.classList.toggle('gn-ux-syncing', missionMode === 'syncing');
  if (firstShotMission) firstShotMission.hidden = shots.length > 0;
  // TRACK4 journey: the telemetry module mounts before the wanda dashboard
  // exists, so its prepend fallback lands above the page header and buries the
  // first-shot mission + quick actions below the fold. Re-dock it after the
  // wanda actions row (its intended anchor) whenever it sits above the wanda
  // dashboard. Idempotent: only moves when mispositioned.
  try {
    const wanda = document.getElementById('gnWandaDashboard');
    const telemetry = document.getElementById('gnTelemetryDashboard');
    const actions = wanda ? wanda.querySelector('.gn-wanda-actions') : null;
    if (wanda && telemetry && actions && (telemetry.compareDocumentPosition(wanda) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      actions.insertAdjacentElement('afterend', telemetry);
    }
  } catch (_) {}
  // Zero-shot state: the gnFirstShotMission CTA stays visible as the hero;
  // activation-state CSS dims the not-yet-live metrics behind it.
  // (v0.15.45: removed the old wandaEl display:none that hid the mission too.)
  if (shots.length === 0) {
    document.body.classList.add('gn-dashboard-empty');
  } else {
    document.body.classList.remove('gn-dashboard-empty');
  }
  const weightMetrics = computeTotalChange(weights, profile, 'profile');
  const next = nextShotDate(lastShot, profile);
  const currentWeight = weightMetrics.currentWeight || 0;
  const goalGap = Number(profile.goalWt) && currentWeight ? currentWeight - Number(profile.goalWt) : null;
  renderTodayLastShot(lastShot);
  renderTodayWeight(lastWeight);
  GNOrbit.lastShot = lastShot || null;
  GNOrbit.shots = shots || [];
  try {
    var sc = (shots || []).length;
    if (GNLastShotCount && sc > GNLastShotCount) {
      var pc = document.getElementById('phaseCard');
      if (pc) { pc.classList.remove('gn-shot-pulse'); void pc.offsetWidth; pc.classList.add('gn-shot-pulse'); }
    }
    GNLastShotCount = sc;
  } catch (_) {}
  renderPhaseStrip(lastShot, shots);
  renderDeltaCards(shots, weights, lastShot, lastWeight);
  try { initDrilldown(); } catch (_) {}
  const phase = renderPhase(lastShot, shots);
  /* Code-split: renderProtocolCurve lives in the progress chunk (06).
   * Extraction was rejected: its closure (renderProtocolCurve +
   * drawCanvasChart) is small but drawCanvasChart is referenced by
   * source-grep contract tests and order.json surgery risks more than it
   * saves. Guard + the loader's deferred progress load (LAST in the batch)
   * paints the real curve seconds after first paint; the chunk register
   * hook re-renders TODAY when the progress chunk lands. */
  if (typeof renderProtocolCurve === 'function') renderProtocolCurve(shots, phase);
  refreshNodeHeader({ lastShot, next, phase, currentWeight: lastWeight?.weight });
  renderWandaDashboard({ shots, weights, lastShot, lastWeight, profile, next, phase, weightMetrics, goalGap });
}

function ensureWandaDashboard() {
  const header = document.getElementById('pageDash')?.querySelector('.page-hdr');
  if (!header || document.getElementById('gnWandaDashboard')) return;
  const markup = '<section id="gnWandaDashboard" aria-label="' + safeText(tx('dashboard.currentProtocolSignals', 'Current protocol signals')) + '">'
    + '<section class="gn-dashboard-mission" id="gnFirstShotMission" aria-labelledby="gnFirstShotMissionTitle"><span class="gn-dashboard-mission-kicker" data-i18n="dashboard.firstShotKicker">START HERE</span><h2 id="gnFirstShotMissionTitle" data-i18n="shots.activateYourGrid">LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID</h2><p data-i18n="shots.firstShotSub">One shot unlocks the Phase Engine, RESULTS, and your full dashboard.</p><div class="gn-mission-actions"><button type="button" class="gn-mission-primary" onclick="openLogModal()" data-i18n="runtime.logShot">LOG SHOT</button><button type="button" class="gn-mission-secondary" onclick="openWeightModal()" data-i18n="dashboard.logWeight">LOG WEIGHT</button><button type="button" class="gn-mission-secondary" onclick="showPage(\'Log\',document.getElementById(\'navLog\'))" data-i18n="dashboard.viewHistory">VIEW HISTORY</button></div></section>'
    + '<div class="gn-wanda-grid">'
    /* A1 simplification: card values are DATA, not commands. Empty states used
       to read LOG SHOT / LOG WEIGHT / SET GOAL — the same commands already on
       the action row below, the header button, and the FAB — so the grid looked
       like 4 more buttons to choose between. Cards stay tappable (same targets);
       only their empty value text now says what is missing. */
    + '<button class="gn-wanda-card" id="gnWandaNext" type="button" onclick="openLogModal()"><span class="gn-wanda-label" data-i18n="dashboard.nextShotLabel">NEXT SHOT</span><b class="gn-wanda-value" id="gnWandaNextValue">' + tx('dashboard.noShotYet', 'NO SHOT YET') + '</b><small class="gn-wanda-note" id="gnWandaNextNote" data-i18n="dashboard.logShotStartTimeline">Log a shot to start your timeline</small></button>'

    + '<button class="gn-wanda-card info" id="gnWandaWeight" type="button" onclick="openWeightModal()"><span class="gn-wanda-label" data-i18n="dashboard.currentWeight">CURRENT WEIGHT</span><b class="gn-wanda-value" id="gnWandaWeightValue">' + tx('dashboard.notLoggedYet', 'NOT LOGGED') + '</b><small class="gn-wanda-note" data-i18n="dashboard.latestRecord">Latest record</small></button>'

    + '<button class="gn-wanda-card" id="gnWandaRate" type="button" onclick="showPage(\'Results\',document.getElementById(\'navRes\'))"><span class="gn-wanda-label" data-i18n="dashboard.weeklyRateLabel">WEEKLY RATE</span><b class="gn-wanda-value" id="gnWandaRateValue">—</b><small class="gn-wanda-note" data-i18n="dashboard.keepLoggingBuilds">Keep logging — data builds over time</small></button>'
    + '<button class="gn-wanda-card info" id="gnWandaGoal" type="button" onclick="showPage(\'Profile\',document.getElementById(\'navVault\'))"><span class="gn-wanda-label" data-i18n="dashboard.toGoal">TO GOAL</span><b class="gn-wanda-value" id="gnWandaGoalValue">' + tx('dashboard.goalNotSet', 'NO GOAL SET') + '</b><small class="gn-wanda-note" data-i18n="dashboard.fromLatestWeight">From latest weight</small></button>'
    + '</div><div class="gn-wanda-actions"><button type="button" onclick="openLogModal()" data-i18n="runtime.logShot">LOG SHOT</button><button type="button" onclick="openWeightModal()" data-i18n="dashboard.logWeight">LOG WEIGHT</button></div><div class="gn-streak-card" id="gnStreakCard" hidden><b id="gnStreakValue"></b><span id="gnStreakCopy"></span></div></section>';
  header.insertAdjacentHTML('afterend', markup);
  window.GN_I18N?.applyTo?.(document.getElementById('gnWandaDashboard'));
}

// S1: honest empty states. Swaps the zero-shot hero between first-run,
// still-syncing, and sync-failed (with retry) so a transient cloud failure
// never makes an experienced user look brand new.
function renderFirstShotMission(mode) {
  const mission = document.getElementById('gnFirstShotMission');
  if (!mission) return;
  mission.dataset.mode = mode;
  if (mode === 'syncing') {
    /* CLARITY PASS (P3): cloud sync status is a status line, never a
       dominating panel — one kicker, one plain line, one skeleton bar. */
    mission.innerHTML = '<span class="gn-dashboard-mission-kicker">' + safeText(tx('dashboard.syncingKicker', 'SYNCING')) + '</span>'
      + '<h2 id="gnFirstShotMissionTitle" class="gn-mission-sync-title">' + safeText(tx('dashboard.syncingLineTitle', 'YOUR RECORDS ARE ON THE WAY')) + '</h2>'
      + '<div class="gn-skeleton gn-skeleton-line mid" aria-hidden="true"></div>';
  } else if (mode === 'sync-failed') {
    mission.innerHTML = '<span class="gn-dashboard-mission-kicker">' + safeText(tx('dashboard.syncFailedKicker', 'CONNECTION ISSUE')) + '</span>'
      + '<h2 id="gnFirstShotMissionTitle">' + safeText(tx('dashboard.syncFailedTitle', "COULDN'T REACH YOUR DATA")) + '</h2>'
      + '<p>' + safeText(tx('dashboard.syncFailedSub', 'Your cloud records didn\u2019t load. Your data is safe \u2014 check your connection and try again.')) + '</p>'
      + '<button type="button" onclick="retryCloudHydration()">' + safeText(tx('dashboard.retrySync', 'RETRY SYNC')) + '</button>';
  } else {
    /* CLARITY PASS (P3): the empty dashboard is three clear starting
       actions — Log shot (primary), Log weight, View history. No teaching,
       no placeholder cards: the wanda grid/actions hide while empty
       (gn-wanda-empty, set in renderDashboard). */
    mission.innerHTML = '<span class="gn-dashboard-mission-kicker" data-i18n="dashboard.firstShotKicker">START HERE</span><h2 id="gnFirstShotMissionTitle" data-i18n="shots.activateYourGrid">LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID</h2><p data-i18n="shots.firstShotSub">One shot unlocks the Phase Engine, RESULTS, and your full dashboard.</p><div class="gn-mission-actions"><button type="button" class="gn-mission-primary" onclick="openLogModal()" data-i18n="runtime.logShot">LOG SHOT</button><button type="button" class="gn-mission-secondary" onclick="openWeightModal()" data-i18n="dashboard.logWeight">LOG WEIGHT</button><button type="button" class="gn-mission-secondary" onclick="showPage(\'Log\',document.getElementById(\'navLog\'))" data-i18n="dashboard.viewHistory">VIEW HISTORY</button></div>';
  }
  window.GN_I18N?.applyTo?.(mission);
}

export async function retryCloudHydration() {
  if (!state.cloud || !state.session?.user?.id || !state.cloudClient) return;
  /* Session-generation guard (audit 2026-10-14, defect 3): a retry that
   * resolves after sign-out or an account switch must not stamp its
   * readiness or status onto the new session. */
  const stamp = sessionStamp();
  state.cloudHydration = 'pending';
  renderDashboard();
  try {
    const hydration = await hydrateCloudData();
    if (!sessionStampIntact(stamp)) return;
    state.cloudHydration = hydration.ok ? 'ok' : 'failed';
  } catch (_) {
    if (!sessionStampIntact(stamp)) return;
    state.cloudHydration = 'failed';
  }
  // Claim 2a companion: hydration now succeeded, so flush the records
  // that stayed queued locally while sync was blocked.
  if (state.cloudHydration === 'ok') await syncAllCloudData();
  if (typeof refreshAll === 'function') refreshAll();
  else renderDashboard();
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
  setText('gnWandaNextValue', next ? formatDate(next, { month: 'short', day: 'numeric' }) : tx('dashboard.noShotYet', 'NO SHOT YET'));
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

  setText('gnWandaWeightValue', lastWeight ? Number(lastWeight.weight).toFixed(1) + ' lb' : tx('dashboard.notLoggedYet', 'NOT LOGGED'));

  setText('gnWandaRateValue', weightMetrics.weeklyAverage === null ? '—' : tx('dashboard.weeklyRate', '{value} lb/wk', { value: weightMetrics.weeklyAverage.toFixed(1) }));
  setText('gnWandaGoalValue', goalGap === null ? tx('dashboard.goalNotSet', 'NO GOAL SET') : Math.max(0, goalGap).toFixed(1) + ' lb');

  document.getElementById('gnWandaWeight')?.classList.toggle('empty', !lastWeight);

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

/* S6 Phase A: TODAY weight snapshot */
function renderTodayWeight(lastWeight) {
  var el = document.getElementById('gnTodayWeight');
  if (!el) return;
  if (!lastWeight || lastWeight.weight == null) { el.hidden = true; return; }
  el.hidden = false;
  var val = document.getElementById('gnTodayWeightVal');
  if (val) {
    try {
      var w = Number(lastWeight.weight);
      var unit = lastWeight.unit === 'kg' ? 'kg' : 'lb';
      val.textContent = w.toFixed(1) + ' ' + unit;
    } catch (_) { val.textContent = '—'; }
  }
  /* A1 simplification: page name is 'Results' (nav label PROGRESS). The old
     'Progress' name matched no page, so this tap was a silent dead end. */
  el.onclick = function() { if (window.GNModules && window.GNModules.showPage) window.GNModules.showPage('Results', document.getElementById('navRes')); };
}

/* S6 Phase A: TODAY priority stack — compact last-shot card */
function renderTodayLastShot(lastShot) {
  var card = document.getElementById('gnTodayLastShot');
  if (!card) return;
  if (!lastShot) { card.hidden = true; return; }
  card.hidden = false;
  var main = document.getElementById('gnTodayLastShotMain');
  var sub = document.getElementById('gnTodayLastShotSub');
  try {
    var medLabel = (window.GN_MEDICATION_IDENTITY && window.GN_MEDICATION_IDENTITY.label) ? window.GN_MEDICATION_IDENTITY.label(lastShot.med) : String(lastShot.med || '');
    var doseStr = lastShot.dose != null ? String(lastShot.dose) + ' mg' : '';
    if (main) main.textContent = (medLabel + ' ' + doseStr).trim() || '—';
    var dateStr = '';
    try {
      var d = new Date(lastShot.date);
      if (!Number.isNaN(d.getTime())) dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    } catch (_) {}
    var siteStr = lastShot.site ? String(lastShot.site) : '';
    if (sub) sub.textContent = [dateStr, siteStr].filter(Boolean).join(' · ') || '—';
  } catch (_) {}
}


/* Visual instruments: Delta Cards */
function renderDeltaCards(shots, weights, lastShot, lastWeight) {
  var row = document.getElementById('gnDeltaRow');
  if (!row) return;
  var showW = weights && weights.length >= 2;
  var showS = shots && shots.length >= 1;
  if (!showW && !showS) { row.hidden = true; return; }
  row.hidden = false;
  try {
    var wCard = document.getElementById('gnDeltaWeight');
    if (wCard) {
      wCard.style.display = showW ? '' : 'none';
      if (showW) {
        var sorted = weights.slice().sort(function(a,b){ return new Date(b.date||b.createdAt||0) - new Date(a.date||a.createdAt||0); });
        var cur = Number(sorted[0].weight), prev = Number(sorted[1].weight);
        var delta = cur - prev;
        var arrow = document.getElementById('gnDeltaWeightArrow');
        var val = document.getElementById('gnDeltaWeightVal');
        if (arrow) { arrow.textContent = delta > 0.05 ? '↗' : (delta < -0.05 ? '↘' : '→'); arrow.style.color = delta > 0.05 ? '#c26674' : (delta < -0.05 ? '#63b98b' : 'inherit'); }
        if (val) val.textContent = (delta >= 0 ? '+' : '') + delta.toFixed(1);
        var spark = document.getElementById('gnDeltaWeightSpark');
        if (spark) {
          var pts = sorted.slice(0, 12).reverse().map(function(w){ return Number(w.weight); }).filter(Number.isFinite);
          if (pts.length >= 2) {
            var mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), rg = (mx - mn) || 1;
            var pl = pts.map(function(v, i){ var x = (i / (pts.length - 1) * 100).toFixed(1); var y = (26 - ((v - mn) / rg) * 24).toFixed(1); return x + ',' + y; }).join(' ');
            spark.innerHTML = '<polyline points="' + pl + '"/>';
          }
        }
        wCard.onclick = function(){ if (window.GNModules && window.GNModules.showPage) window.GNModules.showPage('Results', document.getElementById('navRes')); };
      }
    }
    var sCard = document.getElementById('gnDeltaShot');
    if (sCard) {
      sCard.style.display = showS ? '' : 'none';
      if (showS && lastShot) {
        var elapsed = Math.max(0, (Date.now() - new Date(lastShot.date).getTime()) / 86400000);
        var val2 = document.getElementById('gnDeltaShotVal');
        if (val2) val2.textContent = elapsed < 1 ? Math.floor(elapsed * 24) + 'h since' : Math.floor(elapsed) + 'd ' + Math.floor((elapsed % 1) * 24) + 'h since';
        var avg = 7;
        if (shots.length >= 2) {
          var st = shots.slice().sort(function(a,b){ return new Date(a.date) - new Date(b.date); });
          var gaps = [];
          for (var i = 1; i < st.length; i++) { var g = (new Date(st[i].date) - new Date(st[i-1].date)) / 86400000; if (g > 0 && g < 60) gaps.push(g); }
          if (gaps.length) avg = gaps.reduce(function(a,b){return a+b;},0) / gaps.length;
        }
        var fill = document.getElementById('gnDeltaShotFill');
        var ghost = document.getElementById('gnDeltaShotGhost');
        var pct = Math.min(100, (elapsed / Math.max(avg, 0.5)) * 100);
        if (fill) fill.style.width = pct + '%';
        if (ghost) ghost.style.left = '100%';
        /* A1: page name is 'Log' (nav label HISTORY); 'History' matched no page. */
        sCard.onclick = function(){ if (window.GNModules && window.GNModules.showPage) window.GNModules.showPage('Log', document.getElementById('navLog')); };
      }
    }
  } catch (_) {}
}

/* Visual drill-down + motion */
function initDrilldown() {
  var center = document.getElementById('ringCenter');
  var overlay = document.getElementById('gnDrilldown');
  var body = document.getElementById('gnDrilldownBody');
  var close = document.getElementById('gnDrilldownClose');
  if (!center || !overlay || center.dataset.drillInit) return;
  center.dataset.drillInit = '1';
  function openDd(e){
    if (e) e.stopPropagation();
    var wrap = document.getElementById('ringWrap');
    if (!wrap || !body) return;
    body.innerHTML = '';
    var clone = wrap.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(function(el){ el.removeAttribute('id'); });
    body.appendChild(clone);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  center.addEventListener('click', openDd);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var ov = document.getElementById('gnDrilldown');
      if (ov && !ov.hidden) { ov.hidden = true; document.body.style.overflow = ''; }
    }
  });
  function closeDd(){ overlay.hidden = true; document.body.style.overflow = ''; if (body) body.innerHTML = ''; }
  if (close) close.addEventListener('click', closeDd);
  /* MOBILE-FIRST: close on browser back (popstate), consistent with log sheet */
  window.addEventListener('popstate', function(){
    var ov = document.getElementById('gnDrilldown');
    if (ov && !ov.hidden) { ov.hidden = true; document.body.style.overflow = ''; var b = document.getElementById('gnDrilldownBody'); if (b) b.innerHTML = ''; }
  });
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeDd(); });
}

/* Dose Orbit prototype (2026-10-08): tappable/scrubbable phase ring + Live Phase Strip.
   Visual grammar: solid/glow = recorded, dashed/amber = estimate. */
var GNOrbit = { lastShot: null, shots: [], inspecting: false, liveCycle: 0 };
var GNLastShotCount = 0;

function orbitAngleToCycle(clientX, clientY) {
  var wrap = document.getElementById('ringWrap');
  if (!wrap) return 0;
  var r = wrap.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  var angle = Math.atan2(clientY - cy, clientX - cx); // -PI..PI, 0 = east
  var deg = (angle * 180 / Math.PI + 90 + 360) % 360; // 0 = north, clockwise
  return Math.min(0.999, Math.max(0, deg / 360));
}

function orbitInspect(cyclePos) {
  if (!GNOrbit.lastShot || typeof PHASES === 'undefined') return;
  GNOrbit.inspecting = true;
  var phase = PHASES.find(function(item) { return cyclePos >= item.start && cyclePos < item.end; }) || PHASES[PHASES.length - 1];
  var phaseIdx = PHASES.indexOf(phase);
  var approxCycle = Math.round(cyclePos * 20) * 5;
  var daysIn = (cyclePos * 7).toFixed(1);
  try {
    var nameEl = document.getElementById('phaseNameTxt');
    var tplName = (typeof templatePhaseName === 'function') ? templatePhaseName(GNOrbit.lastShot, phaseIdx) : null;
    if (nameEl) nameEl.textContent = (tplName || ((typeof localizedPhaseName === 'function') ? localizedPhaseName(phase) : phase.name)) + ' ~';
    var numEl = document.getElementById('phaseNumTxt');
    if (numEl) numEl.textContent = '~' + approxCycle + '% · ~' + daysIn + 'd in';
    var pctEl = document.getElementById('ringPct');
    if (pctEl) pctEl.textContent = '~' + approxCycle + '% CYCLE · INSPECT';
  } catch (_) {}
  var marker = document.getElementById('orbitInspectMarker');
  if (marker) {
    var angle = (cyclePos * Math.PI * 2) - (Math.PI / 2);
    marker.style.left = (50 + (Math.cos(angle) * 45)) + '%';
    marker.style.top = (50 + (Math.sin(angle) * 45)) + '%';
    marker.style.borderColor = phase.color || '#e57f9e';
    marker.hidden = false;
  }
  var stripInspect = document.getElementById('gnPhaseStripInspect');
  if (stripInspect) { stripInspect.style.left = (cyclePos * 100) + '%'; stripInspect.hidden = false; }
  var wrap = document.getElementById('ringWrap');
  if (wrap) wrap.classList.add('gn-orbit-active');
}

function orbitReset() {
  if (!GNOrbit.inspecting) return;
  GNOrbit.inspecting = false;
  var marker = document.getElementById('orbitInspectMarker');
  if (marker) marker.hidden = true;
  var stripInspect = document.getElementById('gnPhaseStripInspect');
  if (stripInspect) stripInspect.hidden = true;
  var wrap = document.getElementById('ringWrap');
  if (wrap) wrap.classList.remove('gn-orbit-active');
  if (GNOrbit.lastShot && typeof renderPhase === 'function') renderPhase(GNOrbit.lastShot, GNOrbit.shots);
}

function orbitStripToCycle(clientX) {
  var track = document.getElementById('gnPhaseStripTrack');
  if (!track) return 0;
  var r = track.getBoundingClientRect();
  return Math.min(0.999, Math.max(0, (clientX - r.left) / r.width));
}

function initDoseOrbit() {
  var wrap = document.getElementById('ringWrap');
  if (!wrap || wrap.dataset.orbitInit) return;
  wrap.dataset.orbitInit = '1';
  /* MOBILE-FIRST: allow horizontal orbit drag without the page stealing vertical scroll.
     pan-y lets vertical scroll pass through; horizontal movement stays with the ring. */
  try { wrap.style.touchAction = 'pan-y'; } catch (_) {}
  var dragging = false;
  var onMove = function(e) {
    if (!dragging || !GNOrbit.lastShot) return;
    var t = e.touches ? e.touches[0] : e;
    orbitInspect(orbitAngleToCycle(t.clientX, t.clientY));
    if (e.cancelable) e.preventDefault();
  };
  wrap.addEventListener('pointerdown', function(e) {
    if (!GNOrbit.lastShot) return;
    // Don't hijack taps on the center (drill-down target)
    var center = document.getElementById('ringCenter');
    if (center && (center === e.target || center.contains(e.target))) return;
    dragging = true;
    try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
    orbitInspect(orbitAngleToCycle(e.clientX, e.clientY));
  });
  wrap.addEventListener('pointermove', onMove);
  var endDrag = function() { if (dragging) { dragging = false; setTimeout(orbitReset, 1200); } };
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);
  wrap.addEventListener('pointerleave', function() { if (dragging) { dragging = false; orbitReset(); } });

  var track = document.getElementById('gnPhaseStripTrack');
  if (track && !track.dataset.orbitInit) {
    track.dataset.orbitInit = '1';
    var sDragging = false;
    track.addEventListener('pointerdown', function(e) {
      if (!GNOrbit.lastShot) return;
      sDragging = true;
      track.setPointerCapture && track.setPointerCapture(e.pointerId);
      orbitInspect(orbitStripToCycle(e.clientX));
    });
    track.addEventListener('pointermove', function(e) {
      if (!sDragging || !GNOrbit.lastShot) return;
      orbitInspect(orbitStripToCycle(e.clientX));
      if (e.cancelable) e.preventDefault();
    });
    var sEnd = function() { if (sDragging) { sDragging = false; setTimeout(orbitReset, 1200); } };
    track.addEventListener('pointerup', sEnd);
    track.addEventListener('pointercancel', sEnd);
  }
}

function renderPhaseStrip(lastShot, shots) {
  var strip = document.getElementById('gnPhaseStrip');
  if (!strip || typeof PHASES === 'undefined') return;
  if (!lastShot) { strip.hidden = true; return; }
  strip.hidden = false;
  try {
    var zones = document.getElementById('gnPhaseStripZones');
    if (zones) {
      zones.innerHTML = PHASES.map(function(p) {
        var w = Math.max(0, (p.end - p.start) * 100);
        return '<div style="width:' + w + '%;background:' + (p.color || '#888') + '22;border-right:1px solid ' + (p.color || '#888') + '55"></div>';
      }).join('');
    }
    var shotsEl = document.getElementById('gnPhaseStripShots');
    if (shotsEl) {
      var now = Date.now();
      var lastTime = new Date(lastShot.date).getTime();
      shotsEl.innerHTML = (shots || []).slice(-12).map(function(s) {
        var t = new Date(s.date).getTime();
        if (Number.isNaN(t)) return '';
        var cyclePos = (lastTime - t) / 604800000; // 0 = last shot (right edge = now side)
        var x = Math.max(0, Math.min(1, 1 - cyclePos)) * 100;
        return '<div class="gn-phase-strip-shot" style="left:' + x + '%"></div>';
      }).join('');
    }
    var nowEl = document.getElementById('gnPhaseStripNow');
    if (nowEl) {
      var elapsed = Math.max(0, (Date.now() - new Date(lastShot.date).getTime()) / 86400000);
      var liveCycle = Math.min(0.999, elapsed / 7);
      GNOrbit.liveCycle = liveCycle;
      nowEl.style.left = (liveCycle * 100) + '%';
    }
  } catch (_) {}
  initDoseOrbit();
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
    const segWrap0 = document.getElementById('ringWrap');
    if (segWrap0) segWrap0.style.removeProperty('--gn-seg-ring');
    const nodes0 = document.getElementById('phaseNodes');
    if (nodes0) { nodes0.innerHTML = ''; delete nodes0.dataset.sig; }
    const ticks0 = document.getElementById('tickMarks');
    if (ticks0) { ticks0.innerHTML = ''; delete ticks0.dataset.sig; }
    // S2: nothing to estimate yet — clear any trust treatment from a prior render.
    document.getElementById('phaseCard')?.removeAttribute('data-trust');
    document.getElementById('phaseCard')?.querySelector('.gn-trust-badge')?.remove();
    document.getElementById('ringWrap')?.classList.remove('gn-phase-ring-estimate');
    return null;
  }
  const elapsedDays = Math.max(0, (Date.now() - new Date(lastShot.date).getTime()) / 86400000);
  const cyclePosition = Math.min(elapsedDays / 7, 0.999);
  const phase = PHASES.find(item => cyclePosition >= item.start && cyclePosition < item.end) || PHASES.at(-1);
  const since = elapsedDays < 1 ? Math.floor(elapsedDays * 24) + 'h' : Math.floor(elapsedDays) + 'd ' + Math.floor((elapsedDays % 1) * 24) + 'h';
  const phaseIdx = PHASES.indexOf(phase);
  // Template-aware name: matches the RESULTS Phase Engine ("PEAK EFFECT")
  // when a six-phase template applies to the last shot's medication.
  const phaseName = templatePhaseName(lastShot, phaseIdx) || localizedPhaseName(phase);
  setText('phaseNameTxt', phaseName);
  setText('phaseNumTxt', tx('phase.phaseN', 'PHASE {n} / {total}', { n: PHASES.indexOf(phase) + 1, total: PHASES.length }));
  setText('phaseSupportTxt', localizedPhaseSupport(phase));
  setText('phaseContextText', localizedPhaseContext(phase));
  setText('phaseTimeSince', since);
  // S2 trust grammar: cycle position is a MODEL ESTIMATE. Approximate language
  // (~65%, rounded to nearest 5) — never false precision like 62.73%.
  const approxCycle = Math.round(cyclePosition * 20) * 5;
  setText('phaseCyclePosition', tx('phase.cyclePct', '~{pct} of 7-day reference cycle', { pct: approxCycle }));
  const remainMs = Math.max(0, 604800000 - (Date.now() - new Date(lastShot.date).getTime()));
  const remainD = Math.floor(remainMs / 86400000);
  const remainH = Math.floor((remainMs % 86400000) / 3600000);
  // Same granularity as the RESULTS engine ("4d 23h"), not rounded days.
  setText('ringDays', remainH > 0
    ? tx('phase.daysLeftHours', '{d}d {h}h', { d: remainD, h: remainH })
    : tx('phase.daysLeft', '{n}d', { n: remainD }));
  setText('ringPct', tx('phase.cyclePositionRing', '~{pct}% CYCLE POSITION', { pct: approxCycle }));
  setText('phaseNext', tx(shots.length === 1 ? 'phase.activeRecords_one' : 'phase.activeRecords_other', '> {phase} // {n} ACTIVE SHOT RECORDS', { phase: phaseName, n: shots.length }));
  setText('pibBody', tx('phase.pibBody', '{phase} visibility is estimated from {since} since the most recent user-entered SHOT.', { phase: phaseName, since }));
  setText('pibSE', lastShot.se?.length ? tx('phase.recentObservations', 'Recent logged observations: {items}.', { items: lastShot.se.map(sideEffectLabel).join(', ') }) : tx('phase.noRecentObservations', 'No side effects were attached to the most recent SHOT record.'));
  setText('pibPay', tx('phase.appetiteSymptoms', 'Track appetite, symptoms, energy, side effects, and notes as your protocol history develops.'));
  const arc = document.getElementById('phaseArc');
  if (arc) { const circumference = 678.6; arc.style.strokeDashoffset = String(circumference * (1 - cyclePosition)); arc.style.stroke = phase.color; }
  // Dead-gradient repair: #phaseArc references url(#arcGrad) but the inline
  // stroke above overrides it every render, so the stops never painted.
  // Wire the stops to the current phase color each render (sheen via
  // stop-opacity) so the gradient defs carry live data.
  const stop1 = document.getElementById('arcStop1');
  const stop2 = document.getElementById('arcStop2');
  if (stop1) { stop1.setAttribute('stop-color', phase.color); stop1.setAttribute('stop-opacity', '1'); }
  if (stop2) { stop2.setAttribute('stop-color', phase.color); stop2.setAttribute('stop-opacity', '0.55'); }
  // Segment ring truth: generate the conic from the real PHASES fractions
  // + colors (8/20/24/24/18/6%). The old static injection in
  // gridnode-app.js drew 5 equal 72deg segments that contradicted the 6
  // phases; it now only provides a neutral fallback via --gn-seg-ring.
  const segRingWrap = document.getElementById('ringWrap');
  if (segRingWrap) {
    const stops = PHASES.map(p => p.color + ' ' + (p.start * 360).toFixed(1) + 'deg ' + (p.end * 360).toFixed(1) + 'deg').join(',');
    segRingWrap.style.setProperty('--gn-seg-ring', 'conic-gradient(from -90deg,' + stops + ')');
  }
  // Populate the formerly dead #phaseNodes / #tickMarks scaffolding with
  // boundary ticks at the true cumulative phase fractions. Marker math
  // matches the position marker below (45% radius, angle 0 = top).
  const nodesHost = document.getElementById('phaseNodes');
  if (nodesHost) {
    const nsig = PHASES.map(p => p.start + '-' + p.end + ':' + p.color).join('|');
    if (nodesHost.dataset.sig !== nsig) {
      nodesHost.dataset.sig = nsig;
      nodesHost.innerHTML = PHASES.slice(1).map(p => {
        const a = (p.start * Math.PI * 2) - (Math.PI / 2);
        const x = (50 + (Math.cos(a) * 45)).toFixed(2), y = (50 + (Math.sin(a) * 45)).toFixed(2);
        return '<span class="p-tick" style="left:' + x + '%;top:' + y + '%;border-color:' + p.color + ';background:' + p.color + '"></span>';
      }).join('');
    }
  }
  const ticks = document.getElementById('tickMarks');
  if (ticks) {
    const tsig = PHASES.map(p => p.start + ':' + p.color).join('|');
    if (ticks.dataset.sig !== tsig) {
      ticks.dataset.sig = tsig;
      ticks.innerHTML = PHASES.slice(1).map(p => {
        const a = (p.start * Math.PI * 2) - (Math.PI / 2);
        const x1 = (140 + (Math.cos(a) * 100)).toFixed(1), y1 = (140 + (Math.sin(a) * 100)).toFixed(1);
        const x2 = (140 + (Math.cos(a) * 116)).toFixed(1), y2 = (140 + (Math.sin(a) * 116)).toFixed(1);
        return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + p.color + '" stroke-width="2" opacity="0.55"/>';
      }).join('');
    }
  }
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
  // S2 trust grammar: the phase hero is an ESTIMATED MODEL. The badge lives in
  // the visual hierarchy (not as footnote), the ring gets the amber dashed halo,
  // and the module declares data-trust so children inherit the semantics.
  const phaseCard = document.getElementById('phaseCard');
  if (phaseCard) {
    phaseCard.setAttribute('data-trust', 'estimate');
    const tag = phaseCard.querySelector('.phase-tag');
    if (tag && !tag.querySelector('.gn-trust-badge')) {
      tag.insertAdjacentHTML('afterend', trustBadge('estimate'));
    }
  }
  document.getElementById('ringWrap')?.classList.add('gn-phase-ring-estimate');
  return phase;
}

export function showPhasesModal() {
  const content = $('allPhasesContent');
  let lastShot = null;
  try { lastShot = sortedShots().at(-1) || null; } catch (_) {}
  if (content) content.innerHTML = PHASES.map((phase, index) => {
    const name = templatePhaseName(lastShot, index) || localizedPhaseName(phase);
    return '<div class="gn-phase-row"><span class="gn-phase-index">0' + (index + 1) + '</span><div><b style="color:' + phase.color + '">' + safeText(name) + '</b><p>' + safeText(localizedPhaseSupport(phase)) + '</p></div></div>';
  }).join('');
  $('phasesOv')?.classList.add('active');
}
export function closePhases() { $('phasesOv')?.classList.remove('active'); }

// Once the server-side phase template arrives (warmed by templatePhaseName),
// re-resolve the template-aware phase names on the dashboard card and header
// pill so the first paint's generic fallback corrects itself.
if (typeof document !== 'undefined' && !window.__gnPhaseStateListener) {
  window.__gnPhaseStateListener = true;
  document.addEventListener('gn:phase-state-ready', () => {
    try {
      const shots = sortedShots();
      const lastShot = shots.at(-1);
      if (!lastShot) return;
      const dash = document.getElementById('pageDash');
      if (dash && dash.hidden) return;
      const phase = renderPhase(lastShot, shots);
      refreshNodeHeader({ lastShot, phase });
    } catch (_) { /* keep the generic fallback names */ }
  });
}

// ── TRACK4 journey: first-shot achievement ──────────────────────────────
// The empty → first-data transition should feel like an achievement with a
// clear next step, not a silent dashboard refresh. One-time overlay after the
// very first shot is saved: celebrates, then points at the next action (log
// weight). Dismisses via X (top-right), Escape, or either button.
const GN_FIRST_SHOT_CELEBRATED_KEY = 'gn_first_shot_celebrated_v1';

function gnFirstShotCelebrated() {
  try { return localStorage.getItem(GN_FIRST_SHOT_CELEBRATED_KEY) === '1'; } catch (_) { return false; }
}

function closeFirstShotCelebrate() {
  const overlay = document.getElementById('gnFirstShotCelebrate');
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => overlay.remove(), 260);
}

function showFirstShotCelebrate() {
  if (document.getElementById('gnFirstShotCelebrate')) return;
  const overlay = document.createElement('div');
  overlay.id = 'gnFirstShotCelebrate';
  overlay.className = 'gn-fsc-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'gnFscTitle');
  overlay.innerHTML =
    '<div class="gn-fsc-card">'
    + '<button type="button" class="gn-fsc-x" aria-label="' + safeText(tx('modal.close', 'Close')) + '"><span aria-hidden="true">×</span></button>'
    + '<div class="gn-fsc-kicker">' + safeText(tx('journey.firstShotKicker', 'GRID ACTIVATED')) + '</div>'
    + '<h2 id="gnFscTitle">' + safeText(tx('journey.firstShotTitle', 'FIRST SHOT LOGGED')) + '</h2>'
    + '<p>' + safeText(tx('journey.firstShotBody', 'Your Phase Engine is live and your timeline has started. One quick step builds your SIGNAL.')) + '</p>'
    + '<div class="gn-fsc-next"><span class="gn-fsc-next-label">' + safeText(tx('journey.nextUp', 'NEXT UP')) + '</span>'
    + '<button type="button" class="gn-fsc-primary" id="gnFscWeight">' + safeText(tx('dashboard.logWeight', 'LOG WEIGHT')) + '</button></div>'
    + '<button type="button" class="gn-fsc-secondary" id="gnFscExplore">' + safeText(tx('journey.exploreGrid', 'EXPLORE THE GRID')) + '</button>'
    + '</div>';
  document.body.appendChild(overlay);
  window.GN_I18N?.applyTo?.(overlay);
  overlay.querySelector('.gn-fsc-x').addEventListener('click', closeFirstShotCelebrate);
  overlay.querySelector('#gnFscExplore').addEventListener('click', closeFirstShotCelebrate);
  overlay.querySelector('#gnFscWeight').addEventListener('click', () => {
    closeFirstShotCelebrate();
    try { openWeightModal(); } catch (_) {}
  });
  const onKey = (event) => {
    if (event.key === 'Escape') { closeFirstShotCelebrate(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('active')));
  window.setTimeout(() => { try { overlay.querySelector('#gnFscWeight').focus({ preventScroll: true }); } catch (_) {} }, 60);
}

if (typeof document !== 'undefined' && !window.__gnFirstShotCelebrateListener) {
  window.__gnFirstShotCelebrateListener = true;
  document.addEventListener('gn:shot-saved', (event) => {
    try {
      if (!event?.detail?.isNew || gnFirstShotCelebrated()) return;
      const total = (typeof getAllShots === 'function' ? getAllShots() : []).filter(s => !s.archived).length;
      if (total !== 1) return;
      try { localStorage.setItem(GN_FIRST_SHOT_CELEBRATED_KEY, '1'); } catch (_) {}
      // Let the save toast land first; the achievement follows it.
      window.setTimeout(showFirstShotCelebrate, 650);
    } catch (_) {}
  });
}
