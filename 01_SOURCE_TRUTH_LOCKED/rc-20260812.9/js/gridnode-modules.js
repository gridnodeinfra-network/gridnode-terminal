/* GRID//NODE stable product modules
 * SHOTS, Phase Engine, RESULTS, LAB, NODE, VAULT, and navigation.
 */

import {
  APP_VERSION, S, state, getProfile, getShots, getAllShots, getWeights, normalizeLegacyText,
  normalizeMedicationId, normalizeSideEffectId, createId, safeText, formatDate, formatDateTime, normalizeDateInput,
  todayISO, downloadFile, queueCloudSync, flushCloudDeletes, sessionLabel
} from './gridnode-core.js';

const $ = id => document.getElementById(id);
const qa = selector => Array.from(document.querySelectorAll(selector));
const tx = (key, fallback, vars) => window.GN_I18N?.text?.(key, fallback, vars) || fallback;

export function getProfileForEvidence() { return getProfile(); }

export const selectState = {};
window.selectState = selectState;

export const moduleState = {
  scannerMode: 'core',
  selectedLocation: '',
  editingShotId: null,
  shotHistoryView: 'active',
  pendingArchiveId: null,
  pendingPermanentDeleteId: null,
  pendingFutureShot: false,
  pendingLocationDraft: false,
  shotDraft: null,
  pendingImport: null,
  meridiem: new Date().getHours() >= 12 ? 'PM' : 'AM',
  weightUnit: 'lb',
  weightRange: 'all',
  medRange: '1m',
  calendarDate: new Date(),
  selectedCalendarDay: null,
  arsenalEditId: null,
  pendingArsenalId: null
};

const ZONES = Object.freeze({
  core: [
    'Right Abdomen — Upper', 'Right Abdomen — Lower',
    'Left Abdomen — Upper', 'Left Abdomen — Lower'
  ],
  lower: [
    'Right Thigh — Upper', 'Right Thigh — Lower',
    'Left Thigh — Upper', 'Left Thigh — Lower'
  ],
  upper: [
    'Left Back Upper Arm — Upper', 'Left Back Upper Arm — Lower',
    'Right Back Upper Arm — Upper', 'Right Back Upper Arm — Lower'
  ]
});

const ZONE_IDS = Object.freeze({
  'Right Abdomen — Upper': 'zone.rightAbdomenUpper',
  'Right Abdomen — Lower': 'zone.rightAbdomenLower',
  'Left Abdomen — Upper': 'zone.leftAbdomenUpper',
  'Left Abdomen — Lower': 'zone.leftAbdomenLower',
  'Right Thigh — Upper': 'zone.rightThighUpper',
  'Right Thigh — Lower': 'zone.rightThighLower',
  'Left Thigh — Upper': 'zone.leftThighUpper',
  'Left Thigh — Lower': 'zone.leftThighLower',
  'Left Back Upper Arm — Upper': 'zone.leftBackUpperArmUpper',
  'Left Back Upper Arm — Lower': 'zone.leftBackUpperArmLower',
  'Right Back Upper Arm — Upper': 'zone.rightBackUpperArmUpper',
  'Right Back Upper Arm — Lower': 'zone.rightBackUpperArmLower'
});
const zoneLabel = function (stored) {
  if (!stored) return '';
  const key = ZONE_IDS[stored];
  if (key) { const t = tx(key, stored); if (t && t !== key) return t; }
  return stored;
};
function scannerModeLabel(mode) {
  /* v0.15.19 - UI rename: LOWER->LEGS, UPPER->ARMS. Data model stable. */
  const labels = {
    core: ['shots.modeCore', 'CORE'],
    lower: ['shots.modeLegs', 'LEGS'],
    upper: ['shots.modeArms', 'ARMS']
  };
  const [key, fallback] = labels[mode] || labels.core;
  return tx(key, fallback);
}
function formatEditableDate(value) {
  const iso = normalizeDateInput(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return document.documentElement?.lang?.startsWith('es') ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}
function parseEditableDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return normalizeDateInput(raw);
  const parts = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!parts) return '';
  const spanish = document.documentElement?.lang?.startsWith('es');
  const month = spanish ? parts[2] : parts[1];
  const day = spanish ? parts[1] : parts[2];
  return normalizeDateInput(`${parts[3]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
}
function setHumanDateInput(input, value, compact = false) {
  if (!input) return;
  const iso = normalizeDateInput(value) || todayISO();
  const display = compact ? formatEditableDate(iso) : formatDate(iso);
  input.dataset.isoDate = iso;
  input.dataset.dateDisplay = display;
  input.value = display;
}
function readHumanDateInput(input, compact = false) {
  if (!input) return '';
  if (input.dataset.isoDate && input.dataset.dateDisplay === input.value) return input.dataset.isoDate;
  return compact ? parseEditableDate(input.value) : normalizeDateInput(input.value);
}

const MEDICATIONS = Object.freeze({
  zepbound_tirzepatide: 'Zepbound (Tirzepatide)',
  mounjaro_tirzepatide: 'Mounjaro (Tirzepatide)',
  tirzepatide_compound: 'Tirzepatide (Compound)',
  wegovy_semaglutide: 'Wegovy (Semaglutide)',
  ozempic_semaglutide: 'Ozempic (Semaglutide)',
  semaglutide_compound: 'Semaglutide (Compound)',
  retatrutide: 'Retatrutide',
  custom_compound: 'Custom Compound',
  bpc157: 'BPC-157',
  tb500: 'TB-500',
  thymosin_beta4: 'Thymosin β-4 (Full)',
  thymosin_alpha1: 'Thymosin α-1',
  cjc1295_dac: 'CJC-1295 (DAC)',
  cjc1295_nodac: 'Mod GRF 1-29 (CJC no-DAC)',
  ipamorelin: 'Ipamorelin',
  sermorelin: 'Sermorelin',
  tesamorelin: 'Tesamorelin',
  semax: 'Semax',
  selank: 'Selank',
  ghk_cu_topical: 'GHK-Cu (Topical)',
  ghk_cu_injectable: 'GHK-Cu (Injectable)',
  epitalon: 'Epitalon',
  mots_c: 'MOTS-c',
  kpv: 'KPV',
  elamipretide_ss31: 'Elamipretide / SS-31'
});
function medicationLabel(value) { const id = normalizeMedicationId(value); return id ? MEDICATIONS[id] : tx('shots.invalidMedication', 'Unknown medication'); }
const SIDE_EFFECT_KEYS = Object.freeze({ nausea: 'shot.nausea', fatigue: 'shot.fatigue', headache: 'shot.headache', diarrhea: 'shot.diarrhea', constipation: 'shot.constipation', vomiting: 'shot.vomiting', insomnia: 'shot.insomnia', bloating: 'shot.bloating', reflux: 'shot.reflux', dizziness: 'shot.dizziness' });
function sideEffectLabel(value) { const id = normalizeSideEffectId(value); return SIDE_EFFECT_KEYS[id] ? tx(SIDE_EFFECT_KEYS[id], id) : id; }

const PHASES = [
  { name: 'ONSET', support: 'Early cycle visibility from the most recent logged SHOT.', color: '#00d4ff', start: 0, end: 0.08 },
  { name: 'ACTIVE', support: 'Estimated active-cycle window from user-entered timing.', color: '#00ff88', start: 0.08, end: 0.28 },
  { name: 'PEAK WINDOW', support: 'Estimated cycle peak window. This is not a lab measurement.', color: '#ffd700', start: 0.28, end: 0.52 },
  { name: 'RESPONSE', support: 'Estimated response window from the logged cycle.', color: '#ff8c00', start: 0.52, end: 0.76 },
  { name: 'DECAY', support: 'Estimated downward protocol curve toward the next cycle.', color: '#ff5577', start: 0.76, end: 0.94 },
  { name: 'BASELINE', support: 'Late-cycle visibility before another logged event.', color: '#9898b0', start: 0.94, end: 1 }
];

function activeShots() {
  const now = Date.now();
  return getAllShots().filter(record => {
    const timestamp = new Date(record.date).getTime();
    return !record.archived && Number.isFinite(timestamp) && timestamp <= now;
  });
}
function sortedShots() { return activeShots().sort((a, b) => new Date(a.date) - new Date(b.date)); }
function sortedWeights() { return [...getWeights()].sort((a, b) => new Date(a.date) - new Date(b.date)); }
function latestShot() { return sortedShots().at(-1) || null; }
function latestWeight() { return sortedWeights().at(-1) || null; }

function showToast(message, isError = false) {
  const toast = $('toastEl');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast active${isError ? ' err' : ''}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('active'), 2800);
}

function setPrivateShell(active) {
  document.body?.classList.toggle('gn-private-active', active);
  qa('.bottom-nav, .fab').forEach(control => {
    control.setAttribute('aria-hidden', active ? 'false' : 'true');
    if ('inert' in control) control.inert = !active;
  });
}

export function showScreen(id) {
  setPrivateShell(id === 'app');
  qa('.screen').forEach(screen => {
    screen.classList.remove('active');
    screen.style.display = 'none';
  });
  const screen = $(id);
  if (!screen) return;
  screen.style.display = id === 'app' ? 'flex' : 'flex';
  requestAnimationFrame(() => screen.classList.add('active'));
}

export function showPage(name, navElement) {
  const previousPage = document.querySelector('.page.active')?.id || '';
  const page = $(`page${name}`);
  if (!page) return;
  document.body.classList.toggle('gn-fab-hidden-context', ['Lab', 'Profile', 'Cal'].includes(name));
  qa('.page').forEach(item => item.classList.remove('active'));
  page.classList.add('active');
  qa('.nav-item').forEach(item => item.classList.remove('active'));
  const nav = navElement || document.getElementById({ Dash: 'navDash', Log: 'navLog', Results: 'navRes', Lab: 'navLab', Profile: 'navPro', Cal: 'navCal' }[name]);
  if (nav) nav.classList.add('active');
  $('scrollBody')?.scrollTo({ top: 0, behavior: 'auto' });
  if (name === 'Log') renderShots();
  if (name === 'Results') renderResults();
  if (name === 'Lab') renderLab();
  if (name === 'Profile') renderProfile();
  if (name === 'Cal') renderCalendar();
  document.dispatchEvent(new CustomEvent('gn:pagechange', { detail: { name, previousPage } }));
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.page.active')?.id === 'pageProfile') { closeProfileHub(); } });

export function refreshAll() {
  renderProfile();
  renderDashboard();
  renderShots();
  renderResults();
  renderScanner();
  renderLab();
  renderCalendar();
}

export function loadApp() {
  const profile = getProfile();
  moduleState.selectedLocation = normalizeLegacyText(S.get('selectedLocation', moduleState.selectedLocation || ''));
  setText('dashSub', `// ${window.CU?.defaultName || profile.name || 'NODE_USER'} // NODE_ACTIVE`);
  setText('profSub', `// ${window.CU?.defaultName || profile.name || 'NODE_USER'} //`);
  setText('profNameTxt', window.CU?.defaultName || profile.name || 'NODE_USER');
  setText('profEmail', sessionLabel());
  setText('profMedTxt', normalizeMedicationId(profile.med) ? `// ${medicationLabel(profile.med).toUpperCase()}` : '// NO MEDICATION SET');
  hydrateProfileFields(profile);
  setTodayDefaults();
  refreshAll();
}

function setText(id, value) { const element = $(id); if (element) element.textContent = value; }
function setDisplay(id, visible) { const element = $(id); if (element) element.style.display = visible ? '' : 'none'; }

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
  S.set('profile', profile);
  setText('profMedTxt', normalizeMedicationId(profile.med) ? `// ${medicationLabel(profile.med).toUpperCase()}` : '// NO MEDICATION SET');
  queueCloudSync('profile', profile);
  showToast(tx('profile.protocolSaved', 'Profile protocol context saved.'));
}

export function saveProfileMetrics() {
  const profile = profileSnapshot();
  S.set('profile', profile);
  calcAndShowBMI();
  queueCloudSync('profile', profile);
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
  setText('profBMICat', bmi < 18.5 ? 'UNDERWEIGHT' : bmi < 25 ? 'NORMAL' : bmi < 30 ? 'OVERWEIGHT' : 'OBESE');
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
  const shots = sortedShots();
  const weights = sortedWeights();
  const lastShot = shots.at(-1);
  const lastWeight = weights.at(-1);
  const profile = getProfile();
  const dashboard = $('pageDash');
  let firstShotMission = $('gnFirstShotMission');
  if (!firstShotMission && dashboard?.querySelector('.page-hdr')) {
    dashboard.querySelector('.page-hdr').insertAdjacentHTML('afterend', `<section class="gn-dashboard-mission" id="gnFirstShotMission" aria-labelledby="gnFirstShotMissionTitle"><span class="gn-dashboard-mission-kicker">START HERE</span><h2 id="gnFirstShotMissionTitle">LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID</h2><p>One shot unlocks the Phase Engine, RESULTS, and your full dashboard.</p><button type="button" onclick="openLogModal()">LOG YOUR FIRST SHOT</button></section>`);
    firstShotMission = $('gnFirstShotMission');
  }
  if (dashboard) dashboard.dataset.activation = shots.length ? 'active' : 'pending';
  if (firstShotMission) firstShotMission.hidden = shots.length > 0;
  setText('stShots', shots.length);
  setText('stDose', lastShot?.dose ? `${lastShot.dose}mg` : '—');
  setText('stDoseDate', lastShot ? formatDate(lastShot.date, { month: 'short', day: 'numeric' }) : 'NO DATA');
  const next = nextShotDate(lastShot, profile);
  setText('stNext', next ? formatDate(next, { month: 'short', day: 'numeric' }) : '—');
  setText('stNextSub', next ? 'ESTIMATED FROM PROFILE' : 'LOG SHOT');
  const todayShot = shots.find(record => record.date?.slice(0, 10) === todayISO());
  const todayWeight = weights.find(record => record.date?.slice(0, 10) === todayISO());
  setText('todayShot', todayShot ? `${todayShot.dose || '—'}mg logged` : 'TAP TO LOG');
  setText('todayWt', todayWeight ? `${Number(todayWeight.weight).toFixed(1)} lb` : 'TAP TO LOG');
  const startWeight = Number(profile.startWt) || Number(weights[0]?.weight) || 0;
  const currentWeight = Number(lastWeight?.weight) || startWeight;
  const change = startWeight && currentWeight ? currentWeight - startWeight : null;
  const percent = startWeight && change !== null ? (Math.abs(change) / startWeight * 100) : null;
  const goalGap = Number(profile.goalWt) && currentWeight ? currentWeight - Number(profile.goalWt) : null;
  const weeklyAverage = weights.length > 1 ? ((Number(weights.at(-1).weight) - Number(weights[0].weight)) / Math.max(1, (new Date(weights.at(-1).date) - new Date(weights[0].date)) / 604800000)).toFixed(1) : null;
  setText('s6Total', change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)} lb`);
  setText('s6BMI', calcBMIValue(currentWeight, profile) || '—');
  setText('s6Wt', currentWeight ? `${currentWeight.toFixed(1)} lb` : '—');
  setText('s6Pct', percent === null ? '—' : `${percent.toFixed(1)}%`);
  setText('s6Avg', weeklyAverage === null ? '—' : `${weeklyAverage} lb/wk`);
  setText('s6Goal', goalGap === null ? '—' : `${Math.max(0, goalGap).toFixed(1)} lb`);
  const phase = renderPhase(lastShot, shots);
  renderProtocolCurve(shots, phase);
  setText('tk1', lastShot ? formatDate(lastShot.date, { month: 'short', day: 'numeric' }) : '—');
  setText('tk1b', lastShot ? formatDate(lastShot.date, { month: 'short', day: 'numeric' }) : '—');
  setText('tk2', next ? formatDate(next, { month: 'short', day: 'numeric' }) : '—');
  setText('tk2b', next ? formatDate(next, { month: 'short', day: 'numeric' }) : '—');
  setText('tk3', phase?.name || 'NO DATA');
  setText('tk3b', phase?.name || 'NO DATA');
  setText('tk4', currentWeight ? `${currentWeight.toFixed(1)} lb` : '—');
  setText('tk4b', currentWeight ? `${currentWeight.toFixed(1)} lb` : '—');
  setText('tk5', calcBMIValue(currentWeight, profile) || '—');
  setText('streakText', shots.length ? `${shots.length} SHOT${shots.length === 1 ? '' : 'S'} IN YOUR LOCAL RECORD` : 'NO SHOTS LOGGED');
  drawCanvasChart($('dashWtChart'), weights.map(item => Number(item.weight)), '#00d4ff');
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
    setText('phaseNameTxt', 'NO PROTOCOL DATA');
    setText('phaseNumTxt', 'INITIATE PROTOCOL — log first shot');
    setText('phaseTimeSince', '—');
    setText('phaseCyclePosition', '—');
    setText('ringDays', '—');
    setText('ringPct', 'TAP FAB // LOG FIRST SHOT');
    setText('phaseNext', '> INITIATE PROTOCOL — log first shot');
    setText('pibBody', 'Awaiting first logged SHOT — protocol initializes on first record.');
    return null;
  }
  const elapsedDays = Math.max(0, (Date.now() - new Date(lastShot.date).getTime()) / 86400000);
  const cyclePosition = Math.min(elapsedDays / 7, 0.999);
  const phase = PHASES.find(item => cyclePosition >= item.start && cyclePosition < item.end) || PHASES.at(-1);
  const since = elapsedDays < 1 ? `${Math.round(elapsedDays * 24)}h` : `${Math.floor(elapsedDays)}d ${Math.floor((elapsedDays % 1) * 24)}h`;
  setText('phaseNameTxt', phase.name);
  setText('phaseNumTxt', `PHASE ${PHASES.indexOf(phase) + 1} / ${PHASES.length}`);
  setText('phaseSupportTxt', phase.support);
  setText('phaseTimeSince', since);
  setText('phaseCyclePosition', `${Math.round(cyclePosition * 100)}% of 7-day reference cycle`);
  setText('ringDays', `${Math.max(0, 7 - Math.floor(elapsedDays))}d`);
  setText('ringPct', `${Math.round(cyclePosition * 100)}% CYCLE POSITION`);
  setText('phaseNext', `> ${phase.name} // ${shots.length} ACTIVE SHOT RECORD${shots.length === 1 ? '' : 'S'}`);
  setText('pibBody', `${phase.name} visibility is estimated from ${since} since the most recent user-entered SHOT.`);
  setText('pibSE', lastShot.se?.length ? `Recent logged observations: ${lastShot.se.join(', ')}.` : 'No side effects were attached to the most recent SHOT record.');
  setText('pibPay', 'Track appetite, symptoms, energy, side effects, and notes as your protocol history develops.');
  const arc = $('phaseArc');
  if (arc) { const circumference = 678.6; arc.style.strokeDashoffset = String(circumference * (1 - cyclePosition)); arc.style.stroke = phase.color; }
  const icon = $('phaseIconBox');
  if (icon) icon.innerHTML = `<span class="gn-icon gn-icon-lg gn-icon-hud" style="color:${phase.color}"><svg><use href="#gn-phase-ring"></use></svg></span>`;
  return phase;
}

export function showPhasesModal() {
  const content = $('allPhasesContent');
  if (content) content.innerHTML = PHASES.map((phase, index) => `<div class="gn-phase-row"><span class="gn-phase-index">0${index + 1}</span><div><b style="color:${phase.color}">${phase.name}</b><p>${safeText(phase.support)}</p></div></div>`).join('');
  $('phasesOv')?.classList.add('active');
}
export function closePhases() { $('phasesOv')?.classList.remove('active'); }

export function renderShots() {
  renderScanner();
  const list = $('logList');
  if (!list) return;
  const all = getAllShots();
  const visible = all.filter(record => moduleState.shotHistoryView === 'archived' ? record.archived : !record.archived).sort((a, b) => new Date(b.date) - new Date(a.date));
  setText('shotHistoryHelper', moduleState.shotHistoryView === 'archived' ? 'Archived records remain stored for review and can be restored.' : 'Active SHOT records are retained in your local VAULT.');
  qa('[data-shot-history-view]').forEach(button => button.classList.toggle('active', button.dataset.shotHistoryView === moduleState.shotHistoryView));
  if (!visible.length) {
    list.innerHTML = `<div class="empty gn-first-run-card"><span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-protocol-event"></use></svg></span></span><b class="gn-first-run-title">${moduleState.shotHistoryView === 'archived' ? 'NO ARCHIVED SHOTS' : tx('shots.activateYourGrid', 'LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID')}</b><span class="gn-first-run-sub">${tx('shots.firstShotSub', 'One shot unlocks the Phase Engine, RESULTS, and your full dashboard.')}</span><br><button class="btn-full btn-primary empty-cta" type="button" data-empty-shot>${tx('shots.logYourFirst', 'LOG YOUR FIRST SHOT')}</button></div>`;
    return;
  }
  list.innerHTML = visible.map(record => {
    const archived = Boolean(record.archived);
    return `<article class="log-entry ${archived ? 'archived' : ''}">
      <div class="log-main"><div><div class="log-date">${archived ? 'ARCHIVED ' : ''}${safeText(formatDateTime(record.date))}</div><div class="log-med">${safeText(medicationLabel(record.med))}</div></div>
      <div class="log-dose">${safeText(record.dose || '—')}mg</div></div>
      <div class="log-chips">${record.site ? `<span class="log-chip lc-site">${safeText(zoneLabel(record.site))}</span>` : ''}${record.wt ? `<span class="log-chip lc-wt">${safeText(record.wt)}lb</span>` : ''}${record.se?.length ? `<span class="log-chip lc-se">${safeText(record.se.map(sideEffectLabel).join(', '))}</span>` : ''}</div>
      ${record.notes ? `<div class="log-notes">${safeText(record.notes)}</div>` : ''}
      <div class="log-actions"><button type="button" class="log-action-btn" data-shot-action="edit" data-shot-id="${safeText(record.id)}" ${archived ? 'disabled' : ''}>EDIT</button><button type="button" class="log-action-btn ${archived ? '' : 'del'}" data-shot-action="${archived ? 'restore' : 'archive'}" data-shot-id="${safeText(record.id)}">${archived ? 'RESTORE' : 'ARCHIVE'}</button></div>
    </article>`;
  }).join('');
}

export function setShotHistoryView(view) {
  moduleState.shotHistoryView = view === 'archived' ? 'archived' : 'active';
  renderShots();
}


/* === v0.15.16 SCANNER UX POLISH: haptic only (audio removed — cartoonish) === */

/* v0.15.19 SKIN TONE REMOVED - synthetic biotech scanner, single body per mode */
function scannerSkinTone() { return null; }

/* v0.15.19 SKIN TONE REMOVED - synthetic biotech scanner, single body per mode */
function setScannerSkinTone(tone, button) {
  /* no-op: skin-tone selector is dead in v0.15.19 */
  try { localStorage.removeItem('gn_scanner_skin_tone'); } catch (e) {}
}

/* v0.15.19 INTENSITY REMOVED - single body per mode, no 9-state map */
function scannerIntensityForMode(mode) { return null; }

export function setScannerMode(mode, button) {
  moduleState.scannerMode = ZONES[mode] ? mode : 'core';
  /* v0.15.19 - drive .biotech-stage SVG architecture */
  qa('.scanner-mode-btn').forEach(item => {
    const active = item === button || item.dataset.mode === moduleState.scannerMode;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  qa('.biotech-stage').forEach(stage => {
    const isActive = stage.dataset.view === moduleState.scannerMode;
    stage.hidden = !isActive;
    stage.classList.toggle('active', isActive);
    if (isActive) {
      const scan = stage.querySelector('.biotech-scanline');
      if (scan) {
        scan.classList.remove('sweep');
        void scan.offsetWidth;
        scan.classList.add('sweep');
      }
    }
  });
  setText('scannerModeLabel', tx('shots.trackableZones', 'TRACKABLE {zone} ZONES', { zone: scannerModeLabel(moduleState.scannerMode) }));
  const helper = document.querySelector('#shotsRegionScanner .asset-helper');
  if (helper) {
    const help = {
      core: tx('shots.coreHint', 'ZONE//CORE - Tap a quadrant around the navel. Center excluded.'),
      lower: tx('shots.legsHint', 'ZONE//LEGS - Tap the upper or lower front-thigh zone.'),
      upper: tx('shots.armsHint', 'ZONE//ARMS - Tap a triceps zone above the elbow. Rear view.')
    };
    helper.textContent = help[moduleState.scannerMode] || help.core;
  }
  if (typeof installScannerPointerHandlers === 'function') installScannerPointerHandlers();
  renderScanner();
}

export function selectScannerLocation(label) {
  try {
    localStorage.setItem('gn_scanner_hint_shown', '1');
    const cap = document.querySelector('.gn-zone-hint-caption');
    if (cap) cap.remove();
    document.querySelectorAll('.gn-zone-hint').forEach(el => el.classList.remove('gn-zone-hint'));
  } catch (e) {}
  moduleState.selectedLocation = label;
  S.set('selectedLocation', label);
  queueCloudSync('workspace');
  renderScanner();
  const panel = document.querySelector('#shotsRegionScanner .scanner-selected-panel');
  if (panel) {
    panel.classList.add('gn-zone-confirmed');
    clearTimeout(panel._confirmTimer);
    panel._confirmTimer = setTimeout(() => panel.classList.remove('gn-zone-confirmed'), 900);
    let lock = panel.querySelector('.gn-location-lock');
    if (!lock) {
      lock = document.createElement('div');
      lock.className = 'gn-location-lock';
      lock.setAttribute('role', 'status');
      lock.setAttribute('aria-live', 'polite');
      panel.insertBefore(lock, panel.firstChild);
    }
    lock.innerHTML = `<small>${tx('shots.locationLocked', 'LOCATION//LOCKED')}</small><span>${safeText(zoneLabel(label))}</span>`;
    lock.classList.add('is-on');
  }
  qa('#shotsRegionScanner .zone-path').forEach(path => {
    const on = path.getAttribute('data-site') === label;
    path.classList.toggle('selected', on);
    path.classList.toggle('selected-active', on);
    if (on) {
      path.classList.remove('zone-acquiring');
      void path.getBoundingClientRect();
      path.classList.add('zone-acquiring');
      setTimeout(() => path.classList.remove('zone-acquiring'), 480);
    }
  });
  if (navigator.vibrate) navigator.vibrate([4, 10, 4]);
  showToast(tx('shots.locationLocked', 'LOCATION//LOCKED') + ' · ' + zoneLabel(label));
  if ($('logOv')?.classList.contains('active')) {
    setText('modalSelectedLocation', zoneLabel(label));
  }
}

export function renderScanner() {
  try {
    if (!localStorage.getItem('gn_scanner_hint_shown')) {
      setTimeout(() => {
        if (localStorage.getItem('gn_scanner_hint_shown')) return;
        const zone = document.querySelector('#shotsRegionScanner .biotech-stage:not([hidden]) .zone-path');
        if (zone && !zone.classList.contains('gn-zone-hint')) {
          zone.classList.add('gn-zone-hint');
          const cap = document.createElement('div');
          cap.className = 'gn-zone-hint-caption';
          cap.textContent = tx('scanner.tapZoneHint', 'TAP A ZONE');
          zone.parentElement?.parentElement?.insertBefore(cap, zone.parentElement);
        }
      }, 700);
    }
  } catch (e) {}

  const panel = document.querySelector('#shotsRegionScanner .scanner-selected-panel');
  if (!panel) return;
  let picker = panel.querySelector('.gn-stable-zone-picker');
  if (!picker) { picker = document.createElement('div'); picker.className = 'gn-stable-zone-picker'; panel.appendChild(picker); }
  picker.innerHTML = `<div class="gn-stable-zone-title">${tx('shots.trackableZones', 'TRACKABLE {zone} ZONES', { zone: scannerModeLabel(moduleState.scannerMode) })}</div>${ZONES[moduleState.scannerMode].map(label => `<button type="button" class="gn-stable-zone-btn ${label === moduleState.selectedLocation ? 'selected' : ''}" data-stable-zone="${safeText(label)}" data-zone-key="${safeText(ZONE_IDS[label] || '')}" aria-pressed="${label === moduleState.selectedLocation ? 'true' : 'false'}">${safeText(zoneLabel(label))}</button>`).join('')}`;
  setText('scannerSelectedDisplay', zoneLabel(moduleState.selectedLocation) || tx('shots.noLocationSelected', 'No location selected'));
  const recent = sortedShots().slice(-6).reverse().map(item => item.site).filter(Boolean);
  const uniqRecent = [...new Set(recent)];
  const lastSite = uniqRecent[0] || '';
  setText('scannerHistoryDisplay', uniqRecent.length ? uniqRecent.slice(0, 4).map(zoneLabel).join(' · ') : tx('shots.noLoggedLocationYet', 'No logged location yet'));
  const lock = panel.querySelector('.gn-location-lock');
  if (lock && moduleState.selectedLocation) {
    lock.innerHTML = `<small>${tx('shots.locationLocked', 'LOCATION//LOCKED')}</small><span>${safeText(zoneLabel(moduleState.selectedLocation))}</span>`;
    lock.classList.add('is-on');
  } else if (lock) {
    lock.classList.remove('is-on');
  }
  qa('#shotsRegionScanner .biotech-stage:not([hidden]) .zone-path').forEach(path => {
    const site = path.getAttribute('data-site');
    const isSel = site === moduleState.selectedLocation;
    path.classList.toggle('selected', isSel);
    path.classList.toggle('selected-active', isSel);
    path.classList.toggle('last', Boolean(lastSite && site === lastSite && site !== moduleState.selectedLocation));
    path.classList.toggle('recent', Boolean(site && uniqRecent.includes(site) && site !== lastSite && site !== moduleState.selectedLocation));
    path.classList.toggle('is-dim', Boolean(moduleState.selectedLocation && !isSel));
    path.setAttribute('aria-pressed', isSel ? 'true' : 'false');
  });
}

export function openLogModal(options = {}) {
  const modal = $('logOv');
  if (!modal) return;
  let draftDeviceId = '';
  const preserveDraft = Boolean(options.preserve || moduleState.pendingLocationDraft || moduleState.shotDraft);
  moduleState.pendingLocationDraft = false;
  if (preserveDraft && moduleState.shotDraft) {
    // Restore the full unsaved draft (canonical med key + every entered field).
    const d = moduleState.shotDraft;
    const draftMedicationId = normalizeMedicationId(d.med);
    if (draftMedicationId) setSelect('cpShotMed', draftMedicationId, medicationLabel(draftMedicationId));
    if ($('sDose')) $('sDose').value = d.dose || '';
    setHumanDateInput($('sDate'), d.date || todayISO());
    if ($('sTime')) $('sTime').value = d.time || '';
    if (d.meridiem) moduleState.meridiem = d.meridiem;
    if ($('sWt')) $('sWt').value = d.wt || '';
    if ($('sNotes')) $('sNotes').value = d.notes || '';
    draftDeviceId = d.deviceId || '';
    if (Array.isArray(d.se)) {
      const draftSideEffects = d.se.map(normalizeSideEffectId);
      qa('#logOv input[type="checkbox"]').forEach(input => { input.checked = draftSideEffects.includes(input.value); });
    }
    moduleState.shotDraft = null; // consumed once
  }
  if (!preserveDraft) {
    moduleState.editingShotId = null;
    document.querySelector('#logOv .modal-title')?.replaceChildren(document.createTextNode('LOG SHOT'));
    setTodayDefaults();
    const profile = getProfile();
    const profileMedicationId = normalizeMedicationId(profile.med);
    if (profileMedicationId) setSelect('cpShotMed', profileMedicationId, medicationLabel(profileMedicationId));
    if (profile.dose && $('sDose')) $('sDose').value = profile.dose;
    if ($('sWt')) $('sWt').value = '';
    if ($('sNotes')) $('sNotes').value = '';
    qa('#logOv input[type="checkbox"]').forEach(input => { input.checked = false; });
  }
  setText('modalSelectedLocation', zoneLabel(moduleState.selectedLocation) || tx('shots.noLocationSelected', 'No location selected'));
  setText('logLocationAction', moduleState.selectedLocation ? tx('shots.changeLoggedLocation', 'CHANGE LOGGED LOCATION') : tx('shots.selectLoggedLocation', 'SELECT LOGGED LOCATION'));
  const devicePicker = $('shotDeviceId');
  if (devicePicker) devicePicker.value = draftDeviceId;
  modal.classList.add('active');
}

export function closeLog() {
  $('logOv')?.classList.remove('active');
  moduleState.pendingLocationDraft = false;
  moduleState.shotDraft = null;
  moduleState.editingShotId = null;
}

export function editShot(id) {
  const record = getAllShots().find(item => item.id === id && !item.archived);
  if (!record) return;
  // Never let a pending location-detour draft hijack an EDIT session.
  moduleState.shotDraft = null;
  moduleState.editingShotId = id;
  setText('modalSelectedLocation', zoneLabel(record.site) || tx('shots.noLocationSelected', 'No location selected'));
  moduleState.selectedLocation = record.site || moduleState.selectedLocation;
  setHumanDateInput($('sDate'), record.date?.slice(0, 10) || todayISO());
  if ($('sTime')) $('sTime').value = formatTime12(new Date(record.date));
  moduleState.meridiem = new Date(record.date).getHours() >= 12 ? 'PM' : 'AM';
  updateMeridiemButtons();
  const medicationId = normalizeMedicationId(record.med);
  setSelect('cpShotMed', medicationId, medicationLabel(medicationId));
  if ($('sDose')) $('sDose').value = record.dose || '';
  if ($('sWt')) $('sWt').value = record.wt || '';
  if ($('sNotes')) $('sNotes').value = record.notes || '';
  const recordSideEffects = (record.se || []).map(normalizeSideEffectId);
  qa('#logOv input[type="checkbox"]').forEach(input => { input.checked = recordSideEffects.includes(input.value); });
  document.querySelector('#logOv .modal-title')?.replaceChildren(document.createTextNode('EDIT SHOT'));
  openLogModal({ preserve: true });
}

export function openArchiveConfirm(id) { moduleState.pendingArchiveId = id; $('archiveConfirmOv')?.classList.add('active'); }
export function cancelArchiveShot() { moduleState.pendingArchiveId = null; $('archiveConfirmOv')?.classList.remove('active'); }
export function confirmArchiveShot() {
  const id = moduleState.pendingArchiveId;
  cancelArchiveShot();
  const all = getAllShots();
  const record = all.find(item => item.id === id);
  if (!record) return;
  record.archived = true;
  record.archivedAt = new Date().toISOString();
  if (!S.set('shots', all)) { showToast(tx('shots.archiveStorageError', 'Could not archive — storage unavailable.'), true); return; }
  queueCloudSync('shot', record);
  refreshAll();
  showToast(tx('shots.archived', 'SHOT record archived.'));
}

export function restoreArchivedShot(id) {
  const all = getAllShots();
  const record = all.find(item => item.id === id);
  if (!record) return false;
  const now = new Date().toISOString();
  const restoredWeights = Array.isArray(record.undoSnapshot?.linkedWeights) ? record.undoSnapshot.linkedWeights.map(weight => ({ ...weight })) : [];
  const ops = [];
  let inventoryChanged = false;
  if (record.inventoryDeductionReversed?.itemId && Number(record.inventoryDeductionReversed.amount) > 0) {
    const reversed = record.inventoryDeductionReversed;
    const inventory = S.get('inventory', []);
    const item = inventory.find(candidate => candidate.id === reversed.itemId);
    const amount = Number(reversed.amount);
    if (!item || Number(item.quantity) < amount) {
      showToast(tx('shots.restoreInventoryUnavailable', 'Could not restore — linked inventory is unavailable.'), true);
      return false;
    }
    item.quantity = Number(item.quantity) - amount;
    item.modifiedAt = now;
    item.history = [...(item.history || []), { at: now, action: 'AUTO-DEDUCTION REAPPLIED FOR SHOT RESTORE', source: 'System Generated', shotId: record.id }];
    record.inventoryDeduction = { itemId: reversed.itemId, amount, unit: reversed.unit || 'mg' };
    delete record.inventoryDeductionReversed;
    ops.push({ key: 'inventory', value: inventory });
    inventoryChanged = true;
  }
  if (restoredWeights.length) {
    const restoredIds = new Set(restoredWeights.map(weight => weight.id));
    const restoredCloudIds = new Set(restoredWeights.map(weight => weight.cloudId).filter(Boolean));
    const weights = getWeights().filter(weight => !restoredIds.has(weight.id) && !(weight.cloudId && restoredCloudIds.has(weight.cloudId)));
    weights.push(...restoredWeights);
    ops.push({ key: 'weights', value: weights });
    const pending = S.get('cloudDeletes', []);
    const nextPending = pending.filter(item => !(item.table === 'weights' && restoredCloudIds.has(item.id)));
    if (nextPending.length !== pending.length) ops.push({ key: 'cloudDeletes', value: nextPending });
  }
  record.archived = false;
  record.archivedAt = null;
  delete record.undoSnapshot;
  ops.unshift({ key: 'shots', value: all });
  if (!S.multiWrite(ops)) { showToast(tx('shots.restoreStorageError', 'Could not restore — storage unavailable.'), true); return false; }
  queueCloudSync('shot', record);
  restoredWeights.forEach(weight => queueCloudSync('weight', weight));
  if (inventoryChanged) queueCloudSync('workspace');
  moduleState.shotHistoryView = 'active';
  refreshAll();
  showToast(tx('shots.restored', 'SHOT record restored.'));
  return true;
}

export function openPermanentDeleteConfirm(id) { moduleState.pendingPermanentDeleteId = id; $('permanentDeleteConfirmOv')?.classList.add('active'); }
export function cancelPermanentDeleteShot() { moduleState.pendingPermanentDeleteId = null; $('permanentDeleteConfirmOv')?.classList.remove('active'); }
export async function confirmPermanentDeleteShot() {
  const id = moduleState.pendingPermanentDeleteId;
  cancelPermanentDeleteShot();
  const record = getAllShots().find(item => item.id === id);
  const next = getAllShots().filter(item => item.id !== id);
  const ops = [{ key: 'shots', value: next }];
  let queuedCloudDelete = false;
  if (record?.cloudId) {
    const pending = S.get('cloudDeletes', []);
    if (!pending.some(item => item.table === 'shots' && item.id === record.cloudId)) pending.push({ table: 'shots', id: record.cloudId });
    ops.push({ key: 'cloudDeletes', value: pending });
    queuedCloudDelete = true;
  }
  if (!S.multiWrite(ops)) { showToast(tx('shots.deleteStorageUnavailable', 'Could not delete — storage unavailable.'), true); return; }
  refreshAll();
  const cloudDeleted = queuedCloudDelete ? await flushCloudDeletes() : true;
  showToast(cloudDeleted ? tx('shots.deletedCloud', 'Archived record deleted.') : tx('shots.deletedLocalQueued', 'Deleted locally. Cloud deletion queued for retry.'));
}

export function saveShot(allowFuture = false) {
  const med = normalizeMedicationId(selectState.cpShotMed?.val);
  const dose = Number($('sDose')?.value);
  const weightRaw = String($('sWt')?.value || '').trim();
  const weight = weightRaw ? Number(weightRaw) : null;
  const date = readHumanDateInput($('sDate'));
  const time = getShotTime24($('sTime')?.value);
  const site = moduleState.selectedLocation;
  qa('#logOv [aria-invalid="true"]').forEach(field => field.removeAttribute('aria-invalid'));
  const invalidFields = [];
  if (!med) invalidFields.push($('cpShotMed'));
  if (!(Number.isFinite(dose) && dose > 0)) invalidFields.push($('sDose'));
  if (!date) invalidFields.push($('sDate'));
  if (!time) invalidFields.push($('sTime'));
  if (!site) invalidFields.push($('logLocationAction'));
  if (invalidFields.length) {
    invalidFields.filter(Boolean).forEach(field => field.setAttribute('aria-invalid', 'true'));
    invalidFields.find(Boolean)?.focus?.();
    showToast(tx('shots.requiredFields', 'Add medication, dose, date, time, and a logged location.'), true);
    return;
  }
  if (weightRaw && !(Number.isFinite(weight) && weight > 0)) {
    $('sWt')?.setAttribute('aria-invalid', 'true');
    $('sWt')?.focus();
    showToast(tx('shots.validWeightRequired', 'Optional weight must be greater than zero.'), true);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(MEDICATIONS, med)) { showToast(tx('shots.validMedicationRequired', 'Select a valid medication for this record.'), true); return; }
  const dateTime = new Date(`${date}T${time}`);
  if (!allowFuture && dateTime > new Date()) { moduleState.pendingFutureShot = true; $('futureTimestampConfirm')?.classList.add('active'); return; }
  const existing = moduleState.editingShotId ? getAllShots().find(item => item.id === moduleState.editingShotId) : null;
  const record = {
    ...(existing || {}), id: existing?.id || createId('shot'), date: `${date}T${time}`,
    med, dose, site, wt: weight,
    notes: $('sNotes')?.value?.trim() || null,
    se: qa('#logOv input[type="checkbox"]:checked').map(input => normalizeSideEffectId(input.value)),
    archived: false, archivedAt: null, createdAt: existing?.createdAt || new Date().toISOString()
  };
  const all = getAllShots();
  const index = all.findIndex(item => item.id === record.id);
  // B4: pure prep (no writes), then one atomic multiWrite batch.
  const { inventory, changed } = prepareInventoryForShot(record, existing);
  if (index >= 0) all[index] = record; else all.push(record);
  const ops = [{ key: 'shots', value: all }];
  if (changed) ops.push({ key: 'inventory', value: inventory });
  let weightRecord = null;
  let removedLinkedWeight = null;
  const weights = getWeights();
  const linkedIndex = weights.findIndex(item => item.shotId === record.id || (
    existing && !item.shotId && item.notes === 'Logged with SHOT'
    && item.date === existing.date && Number(item.weight) === Number(existing.wt)
  ));
  if (record.wt !== null) {
    const linkedWeight = linkedIndex >= 0 ? weights[linkedIndex] : null;
    weightRecord = {
      ...(linkedWeight || {}), id: linkedWeight?.id || createId('weight'), shotId: record.id,
      date: record.date, weight: record.wt, notes: 'Logged with SHOT'
    };
    if (linkedIndex >= 0) weights[linkedIndex] = weightRecord; else weights.push(weightRecord);
    ops.push({ key: 'weights', value: weights });
  } else if (linkedIndex >= 0) {
    removedLinkedWeight = weights[linkedIndex];
    weights.splice(linkedIndex, 1);
    ops.push({ key: 'weights', value: weights });
  }
  let queuedCloudDelete = false;
  if (removedLinkedWeight?.cloudId) {
    const pending = S.get('cloudDeletes', []);
    if (!pending.some(item => item.table === 'weights' && item.id === removedLinkedWeight.cloudId)) pending.push({ table: 'weights', id: removedLinkedWeight.cloudId });
    ops.push({ key: 'cloudDeletes', value: pending });
    queuedCloudDelete = true;
  }
  if (!S.multiWrite(ops)) { showToast(tx('shots.storageFull', 'SHOT could not be saved — storage is full.'), true); return; }
  queueCloudSync('shot', record);
  if (changed) queueCloudSync('workspace');
  if (weightRecord) queueCloudSync('weight', weightRecord);
  if (queuedCloudDelete) flushCloudDeletes();
  moduleState.pendingFutureShot = false;
  $('futureTimestampConfirm')?.classList.remove('active');
  closeLog();
  refreshAll();
  showToast(existing ? 'SHOT UPDATED' : 'SHOT RECORDED');
}

function prepareInventoryForShot(record, existing) {
  // Pure prep (B4): computes the next inventory state WITHOUT writing storage.
  const inventory = S.get('inventory', []);
  let changed = false;
  const matchingItem = () => inventory.find(candidate => {
    const medicationId = normalizeMedicationId(candidate.medication || candidate.name);
    return !candidate.archived && candidate.autoDeduct && String(candidate.units || '').toLowerCase() === 'mg' && medicationId === record.med;
  });
  const prior = existing?.inventoryDeduction;
  const unchangedItem = matchingItem();
  if (prior?.itemId && Number(prior.amount) > 0 && unchangedItem?.id === prior.itemId && Number(prior.amount) === Number(record.dose)) {
    record.inventoryDeduction = { ...prior };
    return { inventory, changed: false };
  }
  if (prior?.itemId && Number(prior.amount) > 0) {
    const previousItem = inventory.find(item => item.id === prior.itemId);
    if (previousItem) {
      const now = new Date().toISOString();
      previousItem.quantity = Number(previousItem.quantity || 0) + Number(prior.amount);
      previousItem.modifiedAt = now;
      previousItem.history = [...(previousItem.history || []), { at: now, action: 'AUTO-DEDUCTION REVERSED FOR SHOT EDIT', source: 'System Generated', shotId: record.id }];
      changed = true;
    }
  }
  delete record.inventoryDeduction;
  const item = matchingItem();
  if (item && Number(item.quantity) >= Number(record.dose)) {
    item.quantity = Number(item.quantity) - Number(record.dose);
    item.modifiedAt = new Date().toISOString();
    item.history = [...(item.history || []), { at: item.modifiedAt, action: `AUTO-DEDUCTED ${record.dose} mg FOR SHOT`, source: 'System Generated', shotId: record.id }];
    record.inventoryDeduction = { itemId: item.id, amount: Number(record.dose), unit: 'mg' };
    changed = true;
  }
  return { inventory, changed };
}

export function openFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.add('active'); }
export function closeFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.remove('active'); moduleState.pendingFutureShot = false; }
export function cancelFutureTimestampSave() { closeFutureTimestampConfirm(); }
export function confirmFutureTimestampSave() { $('futureTimestampConfirm')?.classList.remove('active'); saveShot(true); }

export function handleShotFab() {
  // B7 (v0.15.1): quick action opens the pre-filled bottom-sheet drawer for
  // review — no auto-log. Uses the app's draft machinery so pre-fill survives.
  const shots = getAllShots();
  const lastShot = shots.filter(s => !s.archived).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const profile = getProfile();
  const medId = lastShot?.med ? normalizeMedicationId(lastShot.med) : normalizeMedicationId(profile.med);
  const dose = lastShot?.dose ?? profile.dose ?? '';
  const site = lastShot?.site || moduleState.selectedLocation;
  if (!medId || !Object.prototype.hasOwnProperty.call(MEDICATIONS, medId) || !(Number.isFinite(Number(dose)) && Number(dose) > 0) || !site) { openLogModal(); return; }
  const now = new Date();
  moduleState.editingShotId = null;
  moduleState.selectedLocation = site;
  try { sessionStorage.removeItem('gn_shot_draft_session_v1'); } catch (_) {}
  moduleState.shotDraft = {
    med: medId,
    dose: String(dose),
    date: todayISO(),
    time: formatTime12(now),
    meridiem: now.getHours() >= 12 ? 'PM' : 'AM',
    wt: '', notes: '', se: [], deviceId: ''
  };
  openLogModal({ preserve: true });
}
}
export function goToScannerForLocationFromLog() {
  moduleState.pendingLocationDraft = true;
  // Snapshot the ENTIRE unsaved draft so reopening restores every field.
  moduleState.shotDraft = {
    med: selectState.cpShotMed?.val || null,
    dose: $('sDose')?.value || '',
    date: readHumanDateInput($('sDate')) || todayISO(),
    time: $('sTime')?.value || '',
    meridiem: moduleState.meridiem || null,
    wt: $('sWt')?.value || '',
    notes: $('sNotes')?.value || '',
    deviceId: $('shotDeviceId')?.value || '',
    se: qa('#logOv input[type="checkbox"]:checked').map(input => input.value)
  };
  $('logOv')?.classList.remove('active');
  showPage('Log', $('navLog'));
  document.querySelector('.gn-stable-zone-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast(tx('shots.selectZone', 'Select a trackable zone, then open LOG SHOT again.'));
}

export function openWeightModal() {
  setHumanDateInput($('wtDate'), todayISO(), true);
  if ($('wtTime')) $('wtTime').value = formatTime24(new Date());
  $('wtOv')?.classList.add('active');
}
export function closeWt() { $('wtOv')?.classList.remove('active'); }
export function setWeightUnit(unit) {
  moduleState.weightUnit = unit === 'kg' ? 'kg' : 'lb';
  qa('[data-wt-unit]').forEach(button => button.classList.toggle('active', button.dataset.wtUnit === moduleState.weightUnit));
}
export function saveWt() {
  const raw = Number($('wtVal')?.value);
  const date = readHumanDateInput($('wtDate'), true) || todayISO();
  if (!raw || raw <= 0) { setText('wtError', 'ENTER A VALID WEIGHT VALUE'); setDisplay('wtError', true); return; }
  const weight = moduleState.weightUnit === 'kg' ? raw * 2.2046226218 : raw;
  const record = { id: createId('weight'), date: `${date}T${$('wtTime')?.value || '12:00'}`, weight, weightKg: moduleState.weightUnit === 'kg' ? raw : raw / 2.2046226218, unit: moduleState.weightUnit, notes: $('wtNotes')?.value?.trim() || null };
  const weights = getWeights(); weights.push(record); S.set('weights', weights); queueCloudSync('weight', record);
  closeWt();
  if ($('wtVal')) $('wtVal').value = '';
  if ($('wtNotes')) $('wtNotes').value = '';
  refreshAll(); showToast(tx('weight.recorded', 'WEIGHT RECORDED'));
}

export function renderResults() {
  const shots = sortedShots();
  const weights = sortedWeights();
  const profile = getProfile();
  const latest = weights.at(-1);
  const first = weights[0];
  const change = latest && first ? latest.weight - first.weight : null;
  const percent = change !== null && first.weight ? Math.abs(change) / first.weight * 100 : null;
  setText('resLatestWeight', latest ? `${latest.weight.toFixed(1)} lb` : '—');
  setText('resShotCount', String(shots.length));
  setText('resLatestAppetite', 'Foundation Ready');
  setText('resLatestEnergy', 'Foundation Ready');
  setText('resContinuityEvents', String(shots.length));
  setText('resContinuityRecent', latestShot() ? formatDate(latestShot().date, { month: 'short', day: 'numeric' }) : '—');
  setText('resContinuityActive', String(shots.length));
  setText('r6Total', change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)} lb`);
  setText('r6BMI', calcBMIValue(latest?.weight, profile) || '—');
  setText('r6Wt', latest ? `${latest.weight.toFixed(1)} lb` : '—');
  setText('r6Pct', percent === null ? '—' : `${percent.toFixed(1)}%`);
  const weekly = weights.length > 1 ? ((latest.weight - first.weight) / Math.max(1, (new Date(latest.date) - new Date(first.date)) / 604800000)).toFixed(1) : null;
  setText('r6Avg', weekly === null ? '—' : `${weekly} lb/wk`);
  setText('r6Goal', profile.goalWt && latest ? `${Math.max(0, latest.weight - Number(profile.goalWt)).toFixed(1)} lb` : '—');
  const wtChartValue = $('wtChartVal');
  if (wtChartValue) wtChartValue.innerHTML = latest ? `${latest.weight.toFixed(1)}<span>lbs current</span>` : '—';
  const direction = $('resWeightDirection');
  if (direction) { direction.textContent = change === null ? 'Trend direction: Insufficient Data' : `Trend direction: ${change < 0 ? 'Downward' : change > 0 ? 'Upward' : 'Stable'} from logged records`; direction.className = `results-direction ${change == null ? 'insufficient' : change <= 0 ? 'good' : 'warn'}`; }
  setDisplay('weightTrendEmpty', !weights.length); setDisplay('weightTrendLive', Boolean(weights.length));
  setDisplay('resultsSummaryEmpty', !weights.length && !shots.length);
  drawCanvasChart($('wtChart'), weights.map(item => Number(item.weight)), '#00ff88');
  renderWeightRecords(weights);
  renderPhaseSource(latestShot());
  renderTrendLists(shots);
}

function renderWeightRecords(weights) {
  const list = $('weightRecordsList');
  if (!list) return;
  setDisplay('weightRecordsEmpty', !weights.length);
  list.innerHTML = [...weights].reverse().map(record => `<div class="gn-weight-record"><div><b>${record.weight.toFixed(1)} lb</b><span>${safeText(formatDateTime(record.date))}</span>${record.notes ? `<small>${safeText(record.notes)}</small>` : ''}</div></div>`).join('');
}

function renderPhaseSource(shot) {
  setDisplay('phaseEngineSourceEmpty', !shot); setDisplay('phaseEngineSourceReadout', Boolean(shot));
  const readout = $('phaseEngineSourceReadout');
  if (!readout || !shot) return;
  const elapsed = Math.max(0, (Date.now() - new Date(shot.date).getTime()) / 86400000);
  readout.innerHTML = `<div><span>LAST SHOT</span><b>${safeText(formatDateTime(shot.date))}</b></div><div><span>MEDICATION</span><b>${safeText(medicationLabel(shot.med))}</b></div><div><span>TIME SINCE</span><b>${Math.floor(elapsed)}d</b></div><div><span>DATA SOURCE</span><b>USER-ENTERED HISTORY</b></div>`;
}

function renderTrendLists(shots) {
  const effects = shots.flatMap(item => item.se || []);
  setDisplay('sideEffectTrendEmpty', !effects.length); setDisplay('sideEffectTrendLive', Boolean(effects.length));
  const sideEffectTrend = $('sideEffectTrendLive');
  if (sideEffectTrend) {
    sideEffectTrend.innerHTML = effects.length
      ? effects.slice(-6).reverse().map(effect => `<div class="results-list-row"><b>${safeText(effect)}</b><span>logged observation</span></div>`).join('')
      : '';
  }
  setDisplay('appetiteTrendEmpty', true); setDisplay('energyTrendEmpty', true);
}

function drawCanvasChart(canvas, values, color) {
  if (!canvas || !values.length) return;
  const width = Math.max(280, canvas.clientWidth || 320);
  const height = Math.max(110, canvas.clientHeight || 150);
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale; canvas.height = height * scale;
  const context = canvas.getContext('2d'); if (!context) return;
  context.scale(scale, scale); context.clearRect(0, 0, width, height);
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  context.strokeStyle = 'rgba(255,255,255,.09)'; context.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const y = (height / 4) * i; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  context.strokeStyle = color; context.shadowColor = color; context.shadowBlur = 8; context.lineWidth = 2; context.beginPath();
  values.forEach((value, index) => { const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 16) + 8; const y = height - 12 - ((value - min) / span) * (height - 28); if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); });
  context.stroke(); context.shadowBlur = 0;
}

function renderProtocolCurve(shots, phase) {
  const canvas = $('medChart');
  const readout = $('medLvlVal');
  if (!shots.length) {
    if (readout) {
      const detail = document.createElement('span');
      detail.textContent = 'log a shot to begin';
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
    window.GN_PEPTIDE_VIZ.render({ canvas, readout, shots, medId, medLabel: medicationLabel(medId), labelMap, range: moduleState.medRange, now: Date.now(), phaseName: phase?.name || 'ACTIVE' });
    return;
  }

  if (readout) {
    const detail = document.createElement('span');
    detail.textContent = 'relative cycle model · not a measured level';
    readout.replaceChildren(document.createTextNode(phase?.name || 'ACTIVE'), detail);
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

export function showLabSeg(segment, button) {
  qa('[data-labseg-block]').forEach(block => block.style.display = block.dataset.labsegBlock === segment ? 'block' : 'none');
  qa('#labSegTabs .time-tab').forEach(item => item.classList.toggle('active', item === button || item.dataset.labseg === segment));
  renderLab();
}
export function showYouSeg(segment, button) {
  qa('[data-youseg-block]').forEach(block => block.style.display = block.dataset.yousegBlock === segment ? 'block' : 'none');
  qa('#youSegTabs .time-tab').forEach(item => item.classList.toggle('active', item === button || item.dataset.youseg === segment));
}

export function renderLab() { updateSyr(); updateRecon(); updateSupply(); }
export function updateSyr() {
  const dose = Number($('cDose')?.value), concentration = Number($('cConc')?.value);
  if (!dose || !concentration) { setText('syrUnits', '—'); setText('syrText', 'DRAW TO THE — UNIT LINE'); setText('syrML', '— mL'); setText('syrConcDisplay', '— mg/mL'); setText('syrResultLine', '—'); setText('syrVolResult', '— mL'); setText('syrFormula', 'Educational math only. Enter dose and concentration.'); setDisplay('syrTarget', false); return; }
  const volume = dose / concentration, units = volume * 100;
  setText('syrUnits', `${units.toFixed(1)}u`); setText('syrText', `DRAW TO THE ${units.toFixed(1)} UNIT LINE`); setText('syrML', `${volume.toFixed(3)} mL`); setText('syrConcDisplay', `${concentration} mg/mL`); setText('syrResultLine', `${dose} mg`); setText('syrVolResult', `${volume.toFixed(3)} mL`); setText('syrFormula', `${dose} mg ÷ ${concentration} mg/mL = ${volume.toFixed(3)} mL = ${units.toFixed(1)} U-100 units. Educational math only.`); setDisplay('syrTarget', true);
  const target = $('syrTarget'); if (target) target.style.left = `${Math.min(100, Math.max(0, units))}%`;
}
export function updateRecon() {
  const vial = Number($('rVial')?.value), conc = Number($('rConc')?.value);
  const valid = vial > 0 && conc > 0;
  setDisplay('reconRes', valid);
  if (valid) { const volume = vial / conc; setText('reconOut', `Reference math: ${vial} mg ÷ ${conc} mg/mL = ${volume.toFixed(3)} mL total reference volume.`); setText('bacAmt', `${volume.toFixed(3)} mL`); }
}
export function updateSupply() {
  const volume = Number($('sVol')?.value), conc = Number($('sConc')?.value), weekly = Number($('sDose2')?.value);
  const valid = volume > 0 && conc > 0 && weekly > 0;
  setDisplay('supRes', valid);
  if (valid) { const total = volume * conc; setText('supOut', `Reference total: ${total.toFixed(2)} mg · User-entered weekly amount: ${weekly.toFixed(2)} mg · Approximate record coverage: ${(total / weekly).toFixed(1)} weeks. Educational organization only.`); }
}

export function renderProfile() {
  const profile = getProfile();
  setText('profNameTxt', window.CU?.defaultName || profile.name || 'NODE_USER');
  setText('profEmail', sessionLabel());
  setText('profMedTxt', normalizeMedicationId(profile.med) ? `// ${medicationLabel(profile.med).toUpperCase()}` : '// NO MEDICATION SET');
  hydrateProfileFields(profile);
  let status = document.querySelector('.gn-cloud-status');
  const hero = $('profAvaWrap')?.closest('[style*="background:#0e0e16"]');
  if (!status && hero) { status = document.createElement('div'); status.className = 'gn-cloud-status'; hero.parentElement.insertBefore(status, hero.nextSibling); }
  if (status) status.innerHTML = `<span class="gn-cloud-dot ${state.cloud ? 'cloud' : 'local'}"></span><span>VAULT: ${safeText(state.cloudStatus)} · ${state.cloud ? 'Cloud account connected' : 'Data stays on this device until you connect an account'}</span>`;
}

export function exportCSV() {
  const rows = [['record_type', 'date', 'medication', 'dose_mg', 'location', 'weight_lb', 'side_effects', 'notes', 'archived']];
  getAllShots().forEach(record => rows.push(['shot', record.date || '', medicationLabel(record.med), record.dose || '', record.site || '', record.wt || '', (record.se || []).join('|'), record.notes || '', record.archived ? 'true' : 'false']));
  getWeights().forEach(record => rows.push(['weight', record.date || '', '', '', '', record.weight || '', '', record.notes || '', 'false']));
  downloadFile('gridnode-records.csv', rows.map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast(tx('vault.csvExportReady', 'CSV export prepared.'));
}

function csvCell(value) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

export function exportBackup() {
  const backup = { app: 'GRID//NODE', version: APP_VERSION, exportedAt: new Date().toISOString(), profile: getProfile(), shots: getAllShots(), weights: getWeights(), results: S.get('results', []), notes: S.get('notes', []), symptoms: S.get('symptoms', []), labs: S.get('labs', []), preferences: S.get('preferences', {}), settings: S.get('settings', {}), arsenal: S.get('arsenal', []) };
  downloadFile('gridnode-backup.json', JSON.stringify(backup, null, 2), 'application/json');
  showToast(tx('vault.backupReady', 'VAULT backup prepared.'));
}

export function handleCSVImportFile(event) {
  const file = event.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    moduleState.pendingImport = parseCSV(String(reader.result || ''));
    setText('csvImportSummary', `${moduleState.pendingImport.length} record${moduleState.pendingImport.length === 1 ? '' : 's'} ready for review.`);
    $('csvImportOverlay')?.classList.add('active');
  };
  reader.readAsText(file);
  event.target.value = '';
}
export function cancelCSVImport() { moduleState.pendingImport = null; $('csvImportOverlay')?.classList.remove('active'); }
export function confirmCSVImport() {
  const rows = moduleState.pendingImport || [];
  const shots = getAllShots(), weights = getWeights();
  rows.forEach(row => { if (row.type === 'weight' || (!row.medication && row.weight)) weights.push({ id: createId('weight'), date: row.date || `${todayISO()}T12:00`, weight: Number(row.weight) || 0, notes: row.notes || null }); else { const medicationId = normalizeMedicationId(row.medication); if (!medicationId) return; shots.push({ id: createId('shot'), date: row.date || new Date().toISOString(), med: medicationId, dose: Number(row.dose) || 0, site: row.location || '', wt: Number(row.weight) || null, se: row.sideEffects || [], notes: row.notes || null, archived: row.archived === 'true', createdAt: new Date().toISOString() }); } });
  S.set('shots', shots); S.set('weights', weights); cancelCSVImport(); refreshAll(); showToast(`${rows.length} record${rows.length === 1 ? '' : 's'} imported.`);
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean); if (lines.length < 2) return [];
  const parseLine = line => { const cells = []; let value = '', quoted = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i++; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { cells.push(value); value = ''; } else value += char; } cells.push(value); return cells; };
  const headers = parseLine(lines[0]).map(header => header.trim().toLowerCase());
  return lines.slice(1).map(line => { const cells = parseLine(line); const row = {}; headers.forEach((header, index) => row[header] = cells[index] || ''); row.sideEffects = row.side_effects ? row.side_effects.split('|').filter(Boolean) : []; return row; }).filter(row => row.date || row.weight || row.medication);
}

export function renderCalendar() {
  const grid = $('calGrid'); if (!grid) return;
  const date = moduleState.calendarDate, year = date.getFullYear(), month = date.getMonth();
  const locale = document.documentElement?.lang?.startsWith('es') ? 'es-419' : 'en-US';
  const monthLabel = new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' }).toLocaleUpperCase(locale);
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Date(2026, 7, 2 + index).toLocaleDateString(locale, { weekday: 'short' }).replace('.', '').toLocaleUpperCase(locale));
  setText('calTitle', monthLabel);
  const first = new Date(year, month, 1).getDay(), total = new Date(year, month + 1, 0).getDate();
  const shots = new Set(sortedShots().map(item => item.date?.slice(0, 10))), weights = new Set(sortedWeights().map(item => item.date?.slice(0, 10)));
  grid.innerHTML = `${weekdayLabels.map(day => `<div class="cal-day-head">${day}</div>`).join('')}${Array.from({ length: first }, () => '<div class="cal-day empty-day"></div>').join('')}${Array.from({ length: total }, (_, index) => { const day = index + 1, key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return `<button type="button" class="cal-day ${moduleState.selectedCalendarDay === key ? 'selected' : ''}" data-calendar-day="${key}"><span>${day}</span>${shots.has(key) ? '<i class="cal-mark shot"></i>' : ''}${weights.has(key) ? '<i class="cal-mark weight"></i>' : ''}</button>`; }).join('')}`;
  const selected = moduleState.selectedCalendarDay;
  if (selected) { const records = [...getAllShots().filter(item => item.date?.slice(0, 10) === selected), ...getWeights().filter(item => item.date?.slice(0, 10) === selected)]; $('calDetail').innerHTML = records.length ? records.map(item => `<div class="gn-calendar-detail">${safeText(item.med ? medicationLabel(item.med) : tx('results.weight', 'WEIGHT'))} · ${safeText(formatDateTime(item.date))}</div>`).join('') : `<div class="gn-calendar-detail">${tx('calendar.noRecords', 'No records on this day.')}</div>`; }
}
export function calPrev() { moduleState.calendarDate.setMonth(moduleState.calendarDate.getMonth() - 1); renderCalendar(); }
export function calNext() { moduleState.calendarDate.setMonth(moduleState.calendarDate.getMonth() + 1); renderCalendar(); }
export function calDayClick(day) { moduleState.selectedCalendarDay = day; renderCalendar(); }

export function openArsenalMod(type = 'compound', editId = null) { moduleState.arsenalEditId = editId; $('arsTitle')?.replaceChildren(document.createTextNode(editId ? tx('shots.editContext', 'EDIT CONTEXT') : tx('shots.addContext', 'ADD CONTEXT'))); $('arsOv')?.classList.add('active'); }
export function closeArs() { $('arsOv')?.classList.remove('active'); moduleState.arsenalEditId = null; }
export function saveArs() { const items = S.get('arsenal', []); const record = { id: moduleState.arsenalEditId || createId('context'), name: $('aName')?.value?.trim(), concentration: Number($('aConc')?.value) || null, volume: Number($('aVol')?.value) || null, quantity: Number($('aQty')?.value) || 1, reviewDate: $('aExpiry')?.value || '' }; if (!record.name) { showToast(tx('shots.contextNameRequired', 'Enter a context name.'), true); return; } const index = items.findIndex(item => item.id === record.id); if (index >= 0) items[index] = record; else items.push(record); S.set('arsenal', items); queueCloudSync('workspace'); closeArs(); showToast(tx('lab.saveContext', 'VAULT context saved.')); }
export function requestLoadoutRemove(id) { moduleState.pendingArsenalId = id; $('loadoutRemoveOverlay')?.classList.add('active'); }
export function cancelLoadoutRemove() { moduleState.pendingArsenalId = null; $('loadoutRemoveOverlay')?.classList.remove('active'); }
export function confirmLoadoutRemove() { const next = S.get('arsenal', []).filter(item => item.id !== moduleState.pendingArsenalId); S.set('arsenal', next); queueCloudSync('workspace'); cancelLoadoutRemove(); showToast(tx('shots.contextRemoved', 'Context removed.')); }

export function toggleSound() { window.GN_SOUND_ON = window.GN_SOUND_ON === false; const button = $('sndBtn'); if (button) button.style.opacity = window.GN_SOUND_ON ? '1' : '.4'; }

export function formatTime24(date) { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
export function formatTime12(date) { const hour = date.getHours() % 12 || 12; return `${hour}:${String(date.getMinutes()).padStart(2, '0')}`; }
function getShotTime24(value) { const raw = String(value || '').trim().toUpperCase(); const suffix = moduleState.meridiem; const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/); if (!match) return ''; let hour = Number(match[1]), minute = Number(match[2] || '00'); if (suffix === 'PM' && hour < 12) hour += 12; if (suffix === 'AM' && hour === 12) hour = 0; return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : ''; }
export function gnSetShotMeridiem(value) { moduleState.meridiem = value === 'PM' ? 'PM' : 'AM'; updateMeridiemButtons(); }
function updateMeridiemButtons() { $('sTimeAM')?.classList.toggle('active', moduleState.meridiem === 'AM'); $('sTimePM')?.classList.toggle('active', moduleState.meridiem === 'PM'); }
export function gnShotClockLiveFormat(input) { if (!input) return; input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4).replace(/^(\d{1,2})(\d{2})$/, '$1:$2'); }
export function gnNormalizeShotClockField(input) { if (!input) return; const parsed = getShotTime24(input.value); if (parsed) { const date = new Date(`2000-01-01T${parsed}`); input.value = formatTime12(date); } }
export function gnWeightDateInput(input) { if (input) { input.value = input.value.replace(/[^0-9\/-]/g, '').slice(0, 10); delete input.dataset.isoDate; delete input.dataset.dateDisplay; } }
export function gnWeightTimeInput(input) { if (input) input.value = input.value.replace(/[^0-9:]/g, '').slice(0, 5); }
export function gnOpenShotDatePicker() { const input = $('sDate'); if (input) { input.removeAttribute('readonly'); input.type = 'date'; input.value = readHumanDateInput(input) || todayISO(); input.focus(); } }
export function gnCloseShotDatePicker() { const input = $('sDate'); if (input) { const value = normalizeDateInput(input.value) || input.dataset.isoDate || todayISO(); input.type = 'text'; input.setAttribute('readonly', 'readonly'); setHumanDateInput(input, value); } }
export function gnDatePickerMove() {}
export function gnSelectPickerDate(date) { setHumanDateInput($('sDate'), date); gnCloseShotDatePicker(); }
export function gnSetShotDateFromPicker() { gnCloseShotDatePicker(); }
export function gnSetShotDateValue(value) { setHumanDateInput($('sDate'), value); }
export function gnSetShotTimeValue(value) { if ($('sTime')) $('sTime').value = formatTime12(new Date(`2000-01-01T${value}`)); }
export function gnMedRevealGroup(dropId, group) {
  const drop = $(dropId);
  if (!drop) return;
  qa('[data-gn-med-options]', drop).forEach(block => {
    const isActive = block.dataset.gnMedOptions === group;
    block.classList.toggle('gn-revealed', isActive);
    block.style.display = '';
  });
}
export function updatePills() { const med = normalizeMedicationId(selectState.cpShotMed?.val); const dose = Number(getProfile().dose); const container = $('dosePills'); if (!container) return; const values = dose ? [dose] : [0.5, 1, 2.5, 5, 7.5, 10]; container.innerHTML = values.map(value => `<button type="button" class="dose-pill" data-dose="${value}">${value} mg</button>`).join(''); setText('profMedTxt', med ? `// ${medicationLabel(med).toUpperCase()}` : '// NO MEDICATION SET'); }
export function selPill(button, dose) { if ($('sDose')) $('sDose').value = dose; qa('.dose-pill').forEach(item => item.classList.toggle('active', item === button)); }

export function initModules() {
  document.addEventListener('click', event => {
    const zone = event.target.closest('[data-stable-zone]');
    if (zone) selectScannerLocation(zone.dataset.stableZone);
    const overlay = event.target.closest('.zone-overlay');
    if (overlay?.dataset.site) selectScannerLocation(overlay.dataset.site);
    const historyButton = event.target.closest('[data-shot-history-view]');
    if (historyButton) setShotHistoryView(historyButton.dataset.shotHistoryView);
    const shotAction = event.target.closest('[data-shot-action]');
    if (shotAction) { const action = shotAction.dataset.shotAction, id = shotAction.dataset.shotId; if (action === 'edit') editShot(id); if (action === 'archive') openArchiveConfirm(id); if (action === 'restore') restoreArchivedShot(id); }
    if (event.target.closest('[data-empty-shot]')) handleShotFab();
    const calendarDay = event.target.closest('[data-calendar-day]'); if (calendarDay) calDayClick(calendarDay.dataset.calendarDay);
    const dosePill = event.target.closest('.dose-pill'); if (dosePill) selPill(dosePill, Number(dosePill.dataset.dose));
    if (event.target.closest('[role="switch"], [role="checkbox"], .switch, .toggle, [data-toggle], [data-switch]')) { /* v0.15.16: audio removed */ }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.cp-select')) { qa('.cp-dropdown.open').forEach(item => item.classList.remove('open')); qa('.cp-select-trigger.open').forEach(item => item.classList.remove('open')); } });
  document.querySelector('.gn-shot-advanced-trigger')?.addEventListener('click', event => { const button = event.currentTarget, body = $(button.dataset.collapseTarget); const open = body?.classList.toggle('gn-hidden') === false; button.setAttribute('aria-expanded', String(open)); });
  setTodayDefaults();
  renderScanner();
}
