/* GRID//NODE stable product modules
 * SHOTS, Phase Engine, RESULTS, LAB, NODE, VAULT, and navigation.
 */

import {
  APP_VERSION, S, state, getProfile, getShots, getAllShots, getWeights, normalizeLegacyText,
  createId, safeText, formatDate, formatDateTime, normalizeDateInput,
  todayISO, downloadFile, queueCloudSync, sessionLabel
} from './gridnode-core.js';

const $ = id => document.getElementById(id);
const qa = selector => Array.from(document.querySelectorAll(selector));

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

const MEDICATIONS = Object.freeze({
  Zepbound: 'Zepbound (Tirzepatide)',
  Mounjaro: 'Mounjaro (Tirzepatide)',
  Tirzepatide: 'Tirzepatide (Compound)',
  Wegovy: 'Wegovy (Semaglutide)',
  Ozempic: 'Ozempic (Semaglutide)',
  Semaglutide: 'Semaglutide (Compound)',
  Retatrutide: 'Retatrutide',
  Custom: 'Custom Compound'
});

const PHASES = [
  { name: 'ONSET', support: 'Early cycle visibility from the most recent logged SHOT.', color: '#00d4ff', start: 0, end: 0.08 },
  { name: 'ACTIVE', support: 'Estimated active-cycle window from user-entered timing.', color: '#00ff88', start: 0.08, end: 0.28 },
  { name: 'PEAK WINDOW', support: 'Estimated cycle peak window. This is not a lab measurement.', color: '#ffd700', start: 0.28, end: 0.52 },
  { name: 'RESPONSE', support: 'Estimated response window from the logged cycle.', color: '#ff8c00', start: 0.52, end: 0.76 },
  { name: 'DECAY', support: 'Estimated downward protocol curve toward the next cycle.', color: '#ff5577', start: 0.76, end: 0.94 },
  { name: 'BASELINE', support: 'Late-cycle visibility before another logged event.', color: '#9898b0', start: 0.94, end: 1 }
];

function activeShots() { return getAllShots().filter(record => !record.archived); }
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
  const page = $(`page${name}`);
  if (!page) return;
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
}

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
  setText('profMedTxt', profile.med ? `// ${profile.med.toUpperCase()}` : '// NO MEDICATION SET');
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
  if (date && !date.value) date.value = todayISO();
  if (time && !time.value) time.value = formatTime12(now);
  if (wtDate && !wtDate.value) wtDate.value = todayISO();
  moduleState.meridiem = now.getHours() >= 12 ? 'PM' : 'AM';
  updateMeridiemButtons();
}

function hydrateProfileFields(profile) {
  const fields = {
    profDose: profile.dose, profHtFt: profile.htFt, profHtIn: profile.htIn,
    profAge: profile.age, profStartWt: profile.startWt, profGoalWt: profile.goalWt
  };
  Object.entries(fields).forEach(([id, value]) => { if ($(id) && value != null) $(id).value = value; });
  if (profile.med) setSelect('cpMedProf', profile.med, MEDICATIONS[profile.med] || profile.med);
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
  profile.med = selectState.cpMedProf?.val || profile.med || '';
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
  setText('profMedTxt', profile.med ? `// ${profile.med.toUpperCase()}` : '// NO MEDICATION SET');
  queueCloudSync('profile', profile);
  showToast('Profile protocol context saved.');
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
}

export function toggleSelect(id) {
  const dropdown = $(`${id}Drop`);
  const trigger = dropdown?.previousElementSibling;
  if (!dropdown || !trigger) return;
  qa('.cp-dropdown.open').forEach(item => item.classList.remove('open'));
  qa('.cp-select-trigger.open').forEach(item => item.classList.remove('open'));
  const willOpen = !dropdown.classList.contains('open');
  dropdown.classList.toggle('open', willOpen);
  trigger.classList.toggle('open', willOpen);
}

export function selectOpt(id, value, label, callback) {
  setSelect(id, value, label);
  const dropdown = $(`${id}Drop`);
  dropdown?.classList.remove('open');
  dropdown?.previousElementSibling?.classList.remove('open');
  if (typeof callback === 'function') callback();
}

function renderDashboard() {
  const shots = sortedShots();
  const weights = sortedWeights();
  const lastShot = shots.at(-1);
  const lastWeight = weights.at(-1);
  const profile = getProfile();
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
  const cyclePosition = Math.min((elapsedDays % 7) / 7, 0.999);
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
    list.innerHTML = `<div class="empty"><span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-protocol-event"></use></svg></span></span>${moduleState.shotHistoryView === 'archived' ? 'NO ARCHIVED SHOTS' : 'NO SHOTS LOGGED YET'}<br><button class="btn-full btn-primary empty-cta" type="button" data-empty-shot>LOG YOUR FIRST SHOT</button></div>`;
    return;
  }
  list.innerHTML = visible.map(record => {
    const archived = Boolean(record.archived);
    return `<article class="log-entry ${archived ? 'archived' : ''}">
      <div class="log-main"><div><div class="log-date">${archived ? 'ARCHIVED ' : ''}${safeText(formatDateTime(record.date))}</div><div class="log-med">${safeText(MEDICATIONS[record.med] || record.med || 'CUSTOM')}</div></div>
      <div class="log-dose">${safeText(record.dose || '—')}mg</div></div>
      <div class="log-chips">${record.site ? `<span class="log-chip lc-site">${safeText(record.site)}</span>` : ''}${record.wt ? `<span class="log-chip lc-wt">${safeText(record.wt)}lb</span>` : ''}${record.se?.length ? `<span class="log-chip lc-se">${safeText(record.se.join(', '))}</span>` : ''}</div>
      ${record.notes ? `<div class="log-notes">${safeText(record.notes)}</div>` : ''}
      <div class="log-actions"><button type="button" class="log-action-btn" data-shot-action="edit" data-shot-id="${safeText(record.id)}" ${archived ? 'disabled' : ''}>EDIT</button><button type="button" class="log-action-btn ${archived ? '' : 'del'}" data-shot-action="${archived ? 'restore' : 'archive'}" data-shot-id="${safeText(record.id)}">${archived ? 'RESTORE' : 'ARCHIVE'}</button></div>
    </article>`;
  }).join('');
}

export function setShotHistoryView(view) {
  moduleState.shotHistoryView = view === 'archived' ? 'archived' : 'active';
  renderShots();
}

export function setScannerMode(mode, button) {
  moduleState.scannerMode = ZONES[mode] ? mode : 'core';
  qa('.scanner-mode-btn').forEach(item => item.classList.toggle('active', item === button || item.dataset.mode === moduleState.scannerMode));
  const stage = document.querySelector('.asset-scan-stage');
  if (stage) { stage.classList.remove('mode-core', 'mode-lower', 'mode-upper'); stage.classList.add(`mode-${moduleState.scannerMode}`); }
  setText('scannerModeLabel', `${moduleState.scannerMode.toUpperCase()} TRACKABLE ZONES`);
  renderScanner();
}

export function selectScannerLocation(label) {
  moduleState.selectedLocation = label;
  S.set('selectedLocation', label);
  renderScanner();
  showToast(`Location staged: ${label}`);
}

export function renderScanner() {
  const panel = document.querySelector('#shotsRegionScanner .scanner-selected-panel');
  if (!panel) return;
  let picker = panel.querySelector('.gn-stable-zone-picker');
  if (!picker) { picker = document.createElement('div'); picker.className = 'gn-stable-zone-picker'; panel.appendChild(picker); }
  picker.innerHTML = `<div class="gn-stable-zone-title">TRACKABLE ${moduleState.scannerMode.toUpperCase()} ZONES</div>${ZONES[moduleState.scannerMode].map(label => `<button type="button" class="gn-stable-zone-btn ${label === moduleState.selectedLocation ? 'selected' : ''}" data-stable-zone="${safeText(label)}">${safeText(label)}</button>`).join('')}`;
  setText('scannerSelectedDisplay', moduleState.selectedLocation || 'No location selected');
  const recent = sortedShots().slice(-4).reverse().map(item => item.site).filter(Boolean);
  setText('scannerHistoryDisplay', recent.length ? recent.join(' · ') : 'No logged location yet');
  qa('.zone-overlay').forEach(button => {
    const visible = button.dataset.mode === moduleState.scannerMode;
    button.style.pointerEvents = visible ? 'auto' : 'none';
    button.classList.toggle('selected', button.dataset.site === moduleState.selectedLocation);
  });
}

export function openLogModal(options = {}) {
  const modal = $('logOv');
  if (!modal) return;
  if (!options.preserve) {
    moduleState.editingShotId = null;
    document.querySelector('#logOv .modal-title')?.replaceChildren(document.createTextNode('LOG SHOT'));
    setTodayDefaults();
    const profile = getProfile();
    if (profile.med) setSelect('cpShotMed', profile.med, MEDICATIONS[profile.med] || profile.med);
    if (profile.dose && $('sDose')) $('sDose').value = profile.dose;
    if ($('sWt')) $('sWt').value = '';
    if ($('sNotes')) $('sNotes').value = '';
    qa('#logOv input[type="checkbox"]').forEach(input => { input.checked = false; });
  }
  setText('modalSelectedLocation', moduleState.selectedLocation || 'No location selected');
  setText('logLocationAction', moduleState.selectedLocation ? 'CHANGE LOGGED LOCATION' : 'SELECT LOGGED LOCATION');
  modal.classList.add('active');
}

export function closeLog() {
  $('logOv')?.classList.remove('active');
  moduleState.editingShotId = null;
}

export function editShot(id) {
  const record = getAllShots().find(item => item.id === id && !item.archived);
  if (!record) return;
  moduleState.editingShotId = id;
  setText('modalSelectedLocation', record.site || 'No location selected');
  moduleState.selectedLocation = record.site || moduleState.selectedLocation;
  if ($('sDate')) $('sDate').value = record.date?.slice(0, 10) || todayISO();
  if ($('sTime')) $('sTime').value = formatTime12(new Date(record.date));
  moduleState.meridiem = new Date(record.date).getHours() >= 12 ? 'PM' : 'AM';
  updateMeridiemButtons();
  setSelect('cpShotMed', record.med, MEDICATIONS[record.med] || record.med);
  if ($('sDose')) $('sDose').value = record.dose || '';
  if ($('sWt')) $('sWt').value = record.wt || '';
  if ($('sNotes')) $('sNotes').value = record.notes || '';
  qa('#logOv input[type="checkbox"]').forEach(input => { input.checked = record.se?.includes(input.value); });
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
  S.set('shots', all);
  queueCloudSync('shot', record);
  refreshAll();
  showToast('SHOT record archived.');
}

export function restoreArchivedShot(id) {
  const all = getAllShots();
  const record = all.find(item => item.id === id);
  if (!record) return;
  record.archived = false;
  record.archivedAt = null;
  S.set('shots', all);
  queueCloudSync('shot', record);
  moduleState.shotHistoryView = 'active';
  refreshAll();
  showToast('SHOT record restored.');
}

export function openPermanentDeleteConfirm(id) { moduleState.pendingPermanentDeleteId = id; $('permanentDeleteConfirmOv')?.classList.add('active'); }
export function cancelPermanentDeleteShot() { moduleState.pendingPermanentDeleteId = null; $('permanentDeleteConfirmOv')?.classList.remove('active'); }
export function confirmPermanentDeleteShot() {
  const id = moduleState.pendingPermanentDeleteId;
  cancelPermanentDeleteShot();
  const next = getAllShots().filter(item => item.id !== id);
  S.set('shots', next);
  refreshAll();
  showToast('Archived record deleted.');
}

export function saveShot(allowFuture = false) {
  const med = selectState.cpShotMed?.val;
  const dose = Number($('sDose')?.value);
  const date = normalizeDateInput($('sDate')?.value);
  const time = getShotTime24($('sTime')?.value);
  const site = moduleState.selectedLocation;
  if (!med || !dose || !date || !time || !site) { showToast('Required SHOT information is missing.', true); return; }
  const dateTime = new Date(`${date}T${time}`);
  if (!allowFuture && dateTime > new Date()) { moduleState.pendingFutureShot = true; $('futureTimestampConfirm')?.classList.add('active'); return; }
  const existing = moduleState.editingShotId ? getAllShots().find(item => item.id === moduleState.editingShotId) : null;
  const record = {
    ...(existing || {}), id: existing?.id || createId('shot'), date: `${date}T${time}`,
    med, dose, site, wt: Number($('sWt')?.value) || null,
    notes: $('sNotes')?.value?.trim() || null,
    se: qa('#logOv input[type="checkbox"]:checked').map(input => input.value),
    archived: false, archivedAt: null, createdAt: existing?.createdAt || new Date().toISOString()
  };
  const all = getAllShots();
  const index = all.findIndex(item => item.id === record.id);
  if (index >= 0) all[index] = record; else all.push(record);
  S.set('shots', all);
  queueCloudSync('shot', record);
  if (record.wt) {
    const weights = getWeights();
    const weightRecord = { id: createId('weight'), date: record.date, weight: record.wt, notes: 'Logged with SHOT' };
    weights.push(weightRecord); S.set('weights', weights); queueCloudSync('weight', weightRecord);
  }
  moduleState.pendingFutureShot = false;
  $('futureTimestampConfirm')?.classList.remove('active');
  closeLog();
  refreshAll();
  showToast(existing ? 'SHOT record updated.' : 'SHOT recorded.');
}

export function openFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.add('active'); }
export function closeFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.remove('active'); moduleState.pendingFutureShot = false; }
export function cancelFutureTimestampSave() { closeFutureTimestampConfirm(); }
export function confirmFutureTimestampSave() { $('futureTimestampConfirm')?.classList.remove('active'); saveShot(true); }

export function handleShotFab() { openLogModal(); }
export function goToScannerForLocationFromLog() {
  closeLog();
  showPage('Log', $('navLog'));
  document.querySelector('.gn-stable-zone-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Select a trackable zone, then open LOG SHOT again.');
}

export function openWeightModal() {
  if ($('wtDate')) $('wtDate').value = todayISO();
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
  const date = normalizeDateInput($('wtDate')?.value) || todayISO();
  if (!raw || raw <= 0) { setText('wtError', 'ENTER A VALID WEIGHT VALUE'); setDisplay('wtError', true); return; }
  const weight = moduleState.weightUnit === 'kg' ? raw * 2.2046226218 : raw;
  const record = { id: createId('weight'), date: `${date}T${$('wtTime')?.value || '12:00'}`, weight, weightKg: moduleState.weightUnit === 'kg' ? raw : raw / 2.2046226218, unit: moduleState.weightUnit, notes: $('wtNotes')?.value?.trim() || null };
  const weights = getWeights(); weights.push(record); S.set('weights', weights); queueCloudSync('weight', record);
  closeWt();
  if ($('wtVal')) $('wtVal').value = '';
  if ($('wtNotes')) $('wtNotes').value = '';
  refreshAll(); showToast('WEIGHT RECORD SAVED.');
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
  readout.innerHTML = `<div><span>LAST SHOT</span><b>${safeText(formatDateTime(shot.date))}</b></div><div><span>MEDICATION</span><b>${safeText(MEDICATIONS[shot.med] || shot.med || 'CUSTOM')}</b></div><div><span>TIME SINCE</span><b>${Math.floor(elapsed)}d</b></div><div><span>DATA SOURCE</span><b>USER-ENTERED HISTORY</b></div>`;
}

function renderTrendLists(shots) {
  const effects = shots.flatMap(item => item.se || []);
  setDisplay('sideEffectTrendEmpty', !effects.length); setDisplay('sideEffectTrendLive', Boolean(effects.length));
  setText('sideEffectTrendLive', effects.length ? effects.slice(-6).reverse().map(effect => `<div class="results-list-row"><b>${safeText(effect)}</b><span>logged observation</span></div>`).join('') : '');
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
  setText('profMedTxt', profile.med ? `// ${profile.med.toUpperCase()}` : '// NO MEDICATION SET');
  hydrateProfileFields(profile);
  let status = document.querySelector('.gn-cloud-status');
  const hero = $('profAvaWrap')?.closest('[style*="background:#0e0e16"]');
  if (!status && hero) { status = document.createElement('div'); status.className = 'gn-cloud-status'; hero.parentElement.insertBefore(status, hero.nextSibling); }
  if (status) status.innerHTML = `<span class="gn-cloud-dot ${state.cloud ? 'cloud' : 'local'}"></span><span>VAULT: ${safeText(state.cloudStatus)} · ${state.cloud ? 'Cloud account connected' : 'Data stays on this device until you connect an account'}</span>`;
}

export function exportCSV() {
  const rows = [['record_type', 'date', 'medication', 'dose_mg', 'location', 'weight_lb', 'side_effects', 'notes', 'archived']];
  getAllShots().forEach(record => rows.push(['shot', record.date || '', record.med || '', record.dose || '', record.site || '', record.wt || '', (record.se || []).join('|'), record.notes || '', record.archived ? 'true' : 'false']));
  getWeights().forEach(record => rows.push(['weight', record.date || '', '', '', '', record.weight || '', '', record.notes || '', 'false']));
  downloadFile('gridnode-records.csv', rows.map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast('CSV export prepared.');
}

function csvCell(value) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

export function exportBackup() {
  const backup = { app: 'GRID//NODE', version: APP_VERSION, exportedAt: new Date().toISOString(), profile: getProfile(), shots: getAllShots(), weights: getWeights(), settings: S.get('settings', {}), arsenal: S.get('arsenal', []) };
  downloadFile('gridnode-backup.json', JSON.stringify(backup, null, 2), 'application/json');
  showToast('VAULT backup prepared.');
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
  rows.forEach(row => { if (row.type === 'weight' || (!row.medication && row.weight)) weights.push({ id: createId('weight'), date: row.date || `${todayISO()}T12:00`, weight: Number(row.weight) || 0, notes: row.notes || null }); else shots.push({ id: createId('shot'), date: row.date || new Date().toISOString(), med: row.medication || 'Custom', dose: Number(row.dose) || 0, site: row.location || '', wt: Number(row.weight) || null, se: row.sideEffects || [], notes: row.notes || null, archived: row.archived === 'true', createdAt: new Date().toISOString() }); });
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
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  setText('calTitle', `${months[month]} ${year}`);
  const first = new Date(year, month, 1).getDay(), total = new Date(year, month + 1, 0).getDate();
  const shots = new Set(sortedShots().map(item => item.date?.slice(0, 10))), weights = new Set(sortedWeights().map(item => item.date?.slice(0, 10)));
  grid.innerHTML = `${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => `<div class="cal-day-head">${day}</div>`).join('')}${Array.from({ length: first }, () => '<div class="cal-day empty-day"></div>').join('')}${Array.from({ length: total }, (_, index) => { const day = index + 1, key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return `<button type="button" class="cal-day ${moduleState.selectedCalendarDay === key ? 'selected' : ''}" data-calendar-day="${key}"><span>${day}</span>${shots.has(key) ? '<i class="cal-mark shot"></i>' : ''}${weights.has(key) ? '<i class="cal-mark weight"></i>' : ''}</button>`; }).join('')}`;
  const selected = moduleState.selectedCalendarDay;
  if (selected) { const records = [...getAllShots().filter(item => item.date?.slice(0, 10) === selected), ...getWeights().filter(item => item.date?.slice(0, 10) === selected)]; $('calDetail').innerHTML = records.length ? records.map(item => `<div class="gn-calendar-detail">${safeText(item.med || 'WEIGHT')} · ${safeText(formatDateTime(item.date))}</div>`).join('') : '<div class="gn-calendar-detail">No records on this day.</div>'; }
}
export function calPrev() { moduleState.calendarDate.setMonth(moduleState.calendarDate.getMonth() - 1); renderCalendar(); }
export function calNext() { moduleState.calendarDate.setMonth(moduleState.calendarDate.getMonth() + 1); renderCalendar(); }
export function calDayClick(day) { moduleState.selectedCalendarDay = day; renderCalendar(); }

export function openArsenalMod(type = 'compound', editId = null) { moduleState.arsenalEditId = editId; $('arsTitle')?.replaceChildren(document.createTextNode(editId ? 'EDIT CONTEXT' : 'ADD CONTEXT')); $('arsOv')?.classList.add('active'); }
export function closeArs() { $('arsOv')?.classList.remove('active'); moduleState.arsenalEditId = null; }
export function saveArs() { const items = S.get('arsenal', []); const record = { id: moduleState.arsenalEditId || createId('context'), name: $('aName')?.value?.trim(), concentration: Number($('aConc')?.value) || null, volume: Number($('aVol')?.value) || null, quantity: Number($('aQty')?.value) || 1, reviewDate: $('aExpiry')?.value || '' }; if (!record.name) { showToast('Enter a context name.', true); return; } const index = items.findIndex(item => item.id === record.id); if (index >= 0) items[index] = record; else items.push(record); S.set('arsenal', items); closeArs(); showToast('VAULT context saved.'); }
export function requestLoadoutRemove(id) { moduleState.pendingArsenalId = id; $('loadoutRemoveOverlay')?.classList.add('active'); }
export function cancelLoadoutRemove() { moduleState.pendingArsenalId = null; $('loadoutRemoveOverlay')?.classList.remove('active'); }
export function confirmLoadoutRemove() { const next = S.get('arsenal', []).filter(item => item.id !== moduleState.pendingArsenalId); S.set('arsenal', next); cancelLoadoutRemove(); showToast('Context removed.'); }

export function toggleSound() { window.GN_SOUND_ON = window.GN_SOUND_ON === false; const button = $('sndBtn'); if (button) button.style.opacity = window.GN_SOUND_ON ? '1' : '.4'; }

export function formatTime24(date) { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
export function formatTime12(date) { const hour = date.getHours() % 12 || 12; return `${hour}:${String(date.getMinutes()).padStart(2, '0')}`; }
function getShotTime24(value) { const raw = String(value || '').trim().toUpperCase(); const suffix = moduleState.meridiem; const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/); if (!match) return ''; let hour = Number(match[1]), minute = Number(match[2] || '00'); if (suffix === 'PM' && hour < 12) hour += 12; if (suffix === 'AM' && hour === 12) hour = 0; return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : ''; }
export function gnSetShotMeridiem(value) { moduleState.meridiem = value === 'PM' ? 'PM' : 'AM'; updateMeridiemButtons(); }
function updateMeridiemButtons() { $('sTimeAM')?.classList.toggle('active', moduleState.meridiem === 'AM'); $('sTimePM')?.classList.toggle('active', moduleState.meridiem === 'PM'); }
export function gnShotClockLiveFormat(input) { if (!input) return; input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4).replace(/^(\d{1,2})(\d{2})$/, '$1:$2'); }
export function gnNormalizeShotClockField(input) { if (!input) return; const parsed = getShotTime24(input.value); if (parsed) { const date = new Date(`2000-01-01T${parsed}`); input.value = formatTime12(date); } }
export function gnWeightDateInput(input) { if (input) input.value = input.value.replace(/[^0-9\/-]/g, '').slice(0, 10); }
export function gnWeightTimeInput(input) { if (input) input.value = input.value.replace(/[^0-9:]/g, '').slice(0, 5); }
export function gnOpenShotDatePicker() { const input = $('sDate'); if (input) { input.removeAttribute('readonly'); input.type = 'date'; input.value = normalizeDateInput(input.value) || todayISO(); input.focus(); } }
export function gnCloseShotDatePicker() { const input = $('sDate'); if (input) { input.type = 'text'; input.setAttribute('readonly', 'readonly'); } }
export function gnDatePickerMove() {}
export function gnSelectPickerDate(date) { if ($('sDate')) $('sDate').value = date; gnCloseShotDatePicker(); }
export function gnSetShotDateFromPicker() { gnCloseShotDatePicker(); }
export function gnSetShotDateValue(value) { if ($('sDate')) $('sDate').value = value; }
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
export function updatePills() { const med = selectState.cpShotMed?.val; const dose = Number(getProfile().dose); const container = $('dosePills'); if (!container) return; const values = dose ? [dose] : [0.5, 1, 2.5, 5, 7.5, 10]; container.innerHTML = values.map(value => `<button type="button" class="dose-pill" data-dose="${value}">${value} mg</button>`).join(''); setText('profMedTxt', med ? `// ${med.toUpperCase()}` : '// NO MEDICATION SET'); }
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
  });
  document.addEventListener('click', event => { if (!event.target.closest('.cp-select')) { qa('.cp-dropdown.open').forEach(item => item.classList.remove('open')); qa('.cp-select-trigger.open').forEach(item => item.classList.remove('open')); } });
  document.querySelector('.gn-shot-advanced-trigger')?.addEventListener('click', event => { const button = event.currentTarget, body = $(button.dataset.collapseTarget); const open = body?.classList.toggle('gn-hidden') === false; button.setAttribute('aria-expanded', String(open)); });
  setTodayDefaults();
  renderScanner();
}
