function openLogModal(options = {}) {
  const modal = $('logOv');
  if (!modal) return;
  delete modal.dataset.gnModuleDraft;
  let draftDeviceId = '';
  /* TRACK 2 (2-step redesign): the old 01//02//03//04 console section headers
     injected here are retired. The partial now carries a stepper + two step
     sections; progress is communicated by gnSetShotStep/syncShotStepLabels. */
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
    /* v0.15.37: mark that the module draft restored every field, so the
       native session restore (gridnode-native.js, setTimeout 0 on layer
       open) skips instead of clobbering with its older snapshot. */
    modal.dataset.gnModuleDraft = '1';
  }
  if (!preserveDraft) {
    moduleState.editingShotId = null;
    setTodayDefaults();
    const profile = getProfile();
    const profileMedicationId = normalizeMedicationId(profile.med);
    if (profileMedicationId) setSelect('cpShotMed', profileMedicationId, medicationLabel(profileMedicationId));
    if (profile.dose && $('sDose')) $('sDose').value = profile.dose;
    if ($('sWt')) $('sWt').value = '';
    if ($('sNotes')) $('sNotes').value = '';
    qa('#logOv input[type="checkbox"]').forEach(input => { input.checked = false; });
  }
  /* A1 simplification (recognition over memorization): if no site is staged
     yet — neither from the scanner nor a draft/edit (both set selectedLocation
     before this point) — pre-stage the most recent shot's site. Step 2 then
     opens with a site already picked; the user can change it in the same
     picker, or just tap LOG SHOT. Saves the mode-tab + zone taps on the
     common repeat shot. No site is ever invented: with no prior shot the
     picker still starts empty and saveShot() still requires a site. */
  if (!moduleState.selectedLocation) {
    try {
      const lastSite = getAllShots().filter(item => !item.archived && item.site)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.site;
      if (lastSite) moduleState.selectedLocation = lastSite;
    } catch (_) {}
  }
  setText('modalSelectedLocation', zoneLabel(moduleState.selectedLocation) || tx('shot.noInjectionSite', 'No injection site selected'));
  installModalZonePicker();
  renderModalZonePicker();
  renderShotDevicePicker(draftDeviceId);
  installShotSummaryWatcher();
  gnRenderShotSummary();
  if (!modal.querySelector('.gn-drawer-handle')) modal.insertAdjacentHTML('afterbegin', '<div class="gn-drawer-handle" aria-hidden="true"></div>');
  // v0.15.53: AM/PM must never open unselected. Belt and suspenders — default
  // from the current time when the state is somehow blank, then always sync
  // the buttons so the visual state can never disagree with moduleState.
  if (moduleState.meridiem !== 'AM' && moduleState.meridiem !== 'PM') {
    moduleState.meridiem = new Date().getHours() >= 12 ? 'PM' : 'AM';
  }
  updateMeridiemButtons();
  /* CLARITY PASS (P5): refresh the recent-dose shortcuts for the med now
     selected (profile med or restored draft) on every open — setSelect is
     programmatic and never fires the picker's updatePills callback, so
     without this the shortcuts only appeared after re-picking the med. */
  try { if (typeof updatePills === 'function') updatePills(); } catch (_) {}
  cancelLogClose();
  closeQuickConfirm(); // S1: full console never inherits quick-repeat mode.
  gnSetShotStep(1, { instant: true }); // TRACK 2: every open starts on step 1.
  modal.classList.add('active');
  syncLogModalLabels();
}

/* QA 2026-09-17: the modal title and submit button are JS-managed (no
 * data-i18n) so edit mode can show EDIT SHOT / SAVE SHOT while log mode
 * shows LOG SHOT, in the current language. Re-synced on open and on
 * language change so i18n re-application can never clobber the mode. */
function syncLogModalLabels() {
  const editing = Boolean(moduleState.editingShotId);
  document.querySelector('#logOv .modal-title')?.replaceChildren(document.createTextNode(tx(editing ? 'shot.editShot' : 'shot.logShot', editing ? 'EDIT SHOT' : 'LOG SHOT')));
  /* TRACK 2: the primary action is step-aware. Step 1 advances (CONTINUE);
     step 2 commits (LOG SHOT / SAVE SHOT in edit mode). */
  const fireLabel = gnShotStep() === 1
    ? tx('shot.continue', 'CONTINUE')
    : tx(editing ? 'shot.saveShot' : 'shot.logShot', editing ? 'SAVE SHOT' : 'LOG SHOT');
  document.querySelector('#logOv .gn-shot-fire')?.replaceChildren(document.createTextNode(fireLabel));
  const hdrSave = $('gnShotHdrSave');
  if (hdrSave) hdrSave.setAttribute('aria-label', gnShotStep() === 1 ? tx('shot.continue', 'CONTINUE') : tx('modal.saveShot', 'Save shot'));
}
document.addEventListener('gn:langchange', () => { if ($('logOv')?.classList.contains('active')) { syncLogModalLabels(); syncShotStepLabels(); } });

/* TRACK 2 — 2-step progressive disclosure.
 * Step 1: medication + dose + date/time (the essentials).
 * Step 2: injection site + device + weight + side effects + notes (details).
 * Only visibility changes: every field keeps its ID, so all validation,
 * drafts, the summary watcher, and saveShot() work exactly as before. */
function gnShotStep() { return moduleState.shotStep === 2 ? 2 : 1; }

function gnSetShotStep(step, options = {}) {
  const modal = $('logOv');
  const next = step === 2 ? 2 : 1;
  const prev = gnShotStep();
  moduleState.shotStep = next;
  if (modal) {
    modal.classList.toggle('gn-on-step-1', next === 1);
    modal.classList.toggle('gn-on-step-2', next === 2);
    modal.querySelectorAll('.gn-shot-step').forEach(section => {
      section.classList.toggle('gn-on', Number(section.getAttribute('data-gn-step')) === next);
    });
    modal.querySelectorAll('.gn-shot-dot').forEach(dot => {
      dot.classList.toggle('gn-on', Number(dot.getAttribute('data-gn-dot')) <= next);
    });
    if (!options.instant && next !== prev) {
      const dir = next > prev ? 'gn-stepping-fwd' : 'gn-stepping-back';
      modal.classList.add(dir);
      window.setTimeout(() => modal.classList.remove(dir), 340);
    }
    const scroller = modal.querySelector('.gn-shot-scroll');
    if (scroller) scroller.scrollTop = 0;
  }
  syncShotStepLabels();
  syncLogModalLabels();
}

function syncShotStepLabels() {
  const step = gnShotStep();
  const nameEl = $('gnShotStepName');
  const label = tx(step === 2 ? 'shot.step2Label' : 'shot.step1Label', step === 2 ? 'STEP 2 OF 2 · DETAILS' : 'STEP 1 OF 2 · ESSENTIALS');
  if (nameEl) nameEl.textContent = label;
  $('gnShotStep1')?.setAttribute('aria-label', tx('shot.step1Label', 'STEP 1 OF 2 · ESSENTIALS'));
  $('gnShotStep2')?.setAttribute('aria-label', tx('shot.step2Label', 'STEP 2 OF 2 · DETAILS'));
}

function gnValidateStep1() {
  /* Mirrors saveShot()'s essential-field checks (medication, dose, date, time)
     so the Continue gate can never disagree with the final commit validation. */
  qa('#logOv [aria-invalid="true"]').forEach(field => field.removeAttribute('aria-invalid'));
  const med = normalizeMedicationId(selectState.cpShotMed?.val);
  const dose = Number($('sDose')?.value);
  const date = readHumanDateInput($('sDate'));
  const time = getShotTime24($('sTime')?.value);
  const invalidFields = [];
  if (!med) invalidFields.push($('cpShotMed'));
  if (!isDoseInRange(dose)) invalidFields.push($('sDose'));
  if (!date) invalidFields.push($('sDate'));
  if (!time) invalidFields.push($('sTime'));
  return { ok: invalidFields.length === 0, invalidFields, time };
}

function gnShotStepNext() {
  const check = gnValidateStep1();
  if (!check.ok) {
    /* TRACK C: same inline field errors as the final SAVE gate — the
       message sits under the field that needs fixing, not only in a
       toast. (Helpers are declared with saveShot below; hoisted.) */
    clearShotFieldErrors();
    check.invalidFields.filter(Boolean).forEach(field => field.setAttribute('aria-invalid', 'true'));
    check.invalidFields.filter(Boolean).forEach(field => {
      if (field.id === 'cpShotMed') shotFieldError(field, 'gnShotErrMed', tx('shots.medRequiredPlain', 'Pick your medication from the list.'));
      else if (field.id === 'sDose') shotFieldError(field, 'gnShotErrDose', Number.isFinite(Number($('sDose')?.value)) && Number($('sDose')?.value) > MAX_DOSE_MG ? tx('shots.doseTooLargePlain', 'Enter a dose of 1000 mg or less.') : tx('shots.doseRequiredPlain', 'Enter a dose greater than zero.'));
      else if (field.id === 'sDate') shotFieldError(field.closest('.form-group') || field, 'gnShotErrDate', tx('shots.dateRequiredPlain', 'Pick the date of this shot.'));
      else if (field.id === 'sTime') shotFieldError(field.closest('.form-group') || field, 'gnShotErrTime', tx('shots.timeRequired', 'Set the shot time and pick AM or PM.'));
    });
    const firstInvalid = check.invalidFields.find(Boolean);
    if (firstInvalid) {
      if (firstInvalid.id === 'cpShotMed') firstInvalid.querySelector('.cp-select-trigger')?.focus?.();
      else firstInvalid.focus?.();
      firstInvalid.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }
    // v0.15.53: never fail silently — name the time problem explicitly.
    const msg = !check.time
      ? tx('shots.timeRequired', 'Set the shot time and pick AM or PM.')
      : tx('shot.step1Required', 'Add medication, dose, date, and time to continue.');
    showToast(msg, true);
    notifyCoachSaveBlocked(check.invalidFields);
    return;
  }
  clearShotFieldErrors();
  gnSetShotStep(2);
}

function gnShotStepBack() { gnSetShotStep(1); }

/* Primary action for the sticky action bar + header check button.
 * Step 1 advances (with validation); step 2 commits via saveShot(). */
function gnShotPrimaryAction() {
  if (gnShotStep() === 1) gnShotStepNext();
  else saveShot();
}

/* The // MORE DETAILS collapsible never had a working toggle in source
 * (dead button); wire it here so step 2's optional block actually opens. */
function gnToggleShotAdvanced() {
  const body = $('gnShotAdvanced');
  if (!body) return;
  const hidden = body.classList.toggle('gn-hidden');
  document.querySelector('#logOv .gn-shot-advanced-trigger')?.setAttribute('aria-expanded', hidden ? 'false' : 'true');
}

/* v0.15.44 — SHOT CONSOLE live summary bar. Reads the same sources of truth
 * the form commits (selectState.cpShotMed, #sDose, moduleState.selectedLocation)
 * and mirrors them into the sticky action bar, so the user always sees the
 * exact shot they are about to fire. Installed once; refreshed on any
 * interaction inside #logOv. */
function gnShotSummaryParts() {
  const medVal = (typeof selectState !== 'undefined' && selectState.cpShotMed && selectState.cpShotMed.val) || '';
  const med = medVal ? medicationLabel(normalizeMedicationId(medVal)) : tx('shot.selectMedication', 'Select medication');
  const doseRaw = ($('sDose') && $('sDose').value || '').trim();
  const dose = doseRaw ? (doseRaw + ' mg') : '—';
  const site = moduleState.selectedLocation
    ? (zoneLabel(moduleState.selectedLocation) || '—')
    : tx('shot.noInjectionSite', 'No injection site selected');
  return { med, dose, site };
}
function gnRenderShotSummary() {
  const p = gnShotSummaryParts();
  setText('gnShotSummaryMed', p.med);
  setText('gnShotSummaryDose', p.dose);
  setText('gnShotSummarySite', p.site);
}
function installShotSummaryWatcher() {
  const ov = $('logOv');
  if (!ov || ov.dataset.gnShotSummaryOn) return;
  ov.dataset.gnShotSummaryOn = '1';
  ov.addEventListener('click', () => { window.setTimeout(gnRenderShotSummary, 0); });
  ov.addEventListener('input', () => { gnRenderShotSummary(); });
}

/* v0.15.41 — inline injection-site picker for the LOG SHOT modal. The first-shot
 * flow never leaves the form: mode tabs (CORE/LEGS/ARMS) + the scanner's zone
 * vocabulary, rendered compactly in-modal. Selecting a zone commits through
 * the same selectScannerLocation path the scanner page uses, so the coach,
 * validation, and persistence all see one source of truth. */
const MODAL_ZONE_MODES = [
  { id: 'core', en: 'CORE', es: 'CENTRO' },
  { id: 'lower', en: 'LEGS', es: 'PIERNAS' },
  { id: 'upper', en: 'ARMS', es: 'BRAZOS' }
];
function modalZoneMode() {
  if (moduleState.modalZoneMode && ZONES[moduleState.modalZoneMode]) return moduleState.modalZoneMode;
  return ZONES[moduleState.scannerMode] ? moduleState.scannerMode : 'core';
}
function renderModalZonePicker() {
  const modesEl = $('modalZoneModes'), grid = $('modalZonePicker');
  if (!modesEl || !grid) return;
  const mode = modalZoneMode();
  const isEs = document.documentElement && document.documentElement.lang === 'es';
  modesEl.innerHTML = MODAL_ZONE_MODES.map(m =>
    `<button type="button" class="time-tab${m.id === mode ? ' active' : ''}" data-modal-zone-mode="${m.id}" aria-pressed="${m.id === mode}">${isEs ? m.es : m.en}</button>`
  ).join('');
  grid.innerHTML = ZONES[mode].map(label =>
    `<button type="button" class="gn-stable-zone-btn${label === moduleState.selectedLocation ? ' selected' : ''}" data-modal-zone="${safeText(label)}" aria-pressed="${label === moduleState.selectedLocation}">${safeText(zoneLabel(label))}</button>`
  ).join('');
}
function installModalZonePicker() {
  if (installModalZonePicker.done) return;
  installModalZonePicker.done = true;
  document.addEventListener('click', (e) => {
    const modeBtn = e.target && e.target.closest ? e.target.closest('[data-modal-zone-mode]') : null;
    if (modeBtn) {
      moduleState.modalZoneMode = modeBtn.getAttribute('data-modal-zone-mode');
      renderModalZonePicker();
      return;
    }
    const zoneBtn = e.target && e.target.closest ? e.target.closest('[data-modal-zone]') : null;
    if (zoneBtn && $('logOv') && $('logOv').classList.contains('active')) {
      const label = zoneBtn.getAttribute('data-modal-zone');
      try { selectScannerLocation(label, { source: 'modal' }); }
      catch (_) { moduleState.selectedLocation = label; }
      setText('modalSelectedLocation', zoneLabel(moduleState.selectedLocation) || tx('shot.noInjectionSite', 'No injection site selected'));
      renderModalZonePicker();
    }
  });
}

function renderShotDevicePicker(selectedId = '') {
  const picker = $('shotDeviceId');
  if (!picker) return;
  const devices = S.get('devices', []).filter(device => !device.archived);
  picker.innerHTML = `<option value="" data-i18n="shot.unknownDevice">${tx('shot.unknownDevice', 'Unknown / Not applicable')}</option>${devices.map(device => `<option value="${safeText(device.id)}">${safeText(device.name)} · ${safeText(deviceStatusLabel(device.status))}</option>`).join('')}`;
  picker.value = selectedId || '';
}

function isShotFormDirty() {
  const editingId = moduleState.editingShotId;
  if (editingId) {
    const original = getAllShots().find(item => item.id === editingId);
    if (!original) return false;
    const medNow = selectState.cpShotMed?.val || '';
    const doseNow = $('sDose')?.value?.trim() || '';
    const dateNow = readHumanDateInput($('sDate')) || '';
    const timeNow = $('sTime')?.value?.trim() || '';
    const notesNow = $('sNotes')?.value?.trim() || '';
    const wtNow = $('sWt')?.value?.trim() || '';
    if (medNow && medNow !== normalizeMedicationId(original.med)) return true;
    if (doseNow && Number(doseNow) !== Number(original.dose)) return true;
    if (dateNow && dateNow !== String(original.date || '').slice(0, 10)) return true;
    if (timeNow && timeNow !== formatTime12(new Date(original.date))) return true;
    if (notesNow !== (original.notes || '')) return true;
    if (wtNow && Number(wtNow) !== Number(original.wt)) return true;
    const seNow = qa('#logOv input[type="checkbox"]:checked').map(input => input.value).sort().join(',');
    const seOrig = (original.se || []).map(normalizeSideEffectId).sort().join(',');
    if (seNow !== seOrig) return true;
    return false;
  }
  const hasNotes = Boolean($('sNotes')?.value?.trim());
  const hasWt = Number($('sWt')?.value) > 0;
  const hasSe = qa('#logOv input[type="checkbox"]:checked').length > 0;
  if (hasNotes || hasWt || hasSe) return true;
  const hasMed = Boolean(selectState.cpShotMed?.val);
  const hasDose = Number($('sDose')?.value) > 0;
  if (!hasMed && !hasDose) return false;
  const profile = getProfile();
  const profileMed = normalizeMedicationId(profile.med);
  const prefilledFromProfile = Boolean(profileMed) && hasMed && (Number($('sDose')?.value) === Number(profile.dose) || !profile.dose);
  if (prefilledFromProfile) return false;
  return true;
}

function cancelShotDiscard() { $('shotDiscardConfirmOv')?.classList.remove('active'); if ($('shotDiscardConfirmOv')) $('shotDiscardConfirmOv').style.display = 'none'; }

function confirmShotDiscard() {
  $('shotDiscardConfirmOv')?.classList.remove('active');
  if ($('shotDiscardConfirmOv')) $('shotDiscardConfirmOv').style.display = 'none';
  closeLog(true);
}

let logCloseTimer = 0;

function closeLog(force = false) {
  const dirty = isShotFormDirty();
  if (dirty && !force) {
    const ov = $('shotDiscardConfirmOv');
    if (ov) { ov.style.display = 'flex'; requestAnimationFrame(() => ov.classList.add('active')); }
    return;
  }
  const ov = $('logOv');
  moduleState.pendingLocationDraft = false;
  moduleState.shotDraft = null;
  moduleState.editingShotId = null;
  closeQuickConfirm(); // S1: always leave quick-repeat mode on close.
  if (!ov || !ov.classList.contains('active') || ov.classList.contains('gn-closing')) return;
  // Slide the sheet back down instead of vanishing instantly.
  ov.classList.add('gn-closing');
  window.clearTimeout(logCloseTimer);
  logCloseTimer = window.setTimeout(() => {
    ov.classList.remove('active', 'gn-closing');
    logCloseTimer = 0;
  }, 230);
}

// Cancel a pending close (e.g. sheet re-opened mid-animation).
function cancelLogClose() {
  const ov = $('logOv');
  if (logCloseTimer) { window.clearTimeout(logCloseTimer); logCloseTimer = 0; }
  ov?.classList.remove('gn-closing');
}

function editShot(id) {
  const record = getAllShots().find(item => item.id === id && !item.archived);
  if (!record) return;
  // Never let a pending location-detour draft hijack an EDIT session.
  moduleState.shotDraft = null;
  moduleState.editingShotId = id;
  setText('modalSelectedLocation', zoneLabel(record.site) || tx('shot.noInjectionSite', 'No injection site selected'));
  moduleState.selectedLocation = record.site || moduleState.selectedLocation;
  /* Timezone-safe edit loading (audit 2026-10-08): parse date/time components
   * directly from the ISO string instead of via Date (which converts to the
   * browser's timezone, causing -24h shifts when editing across timezones).
   * Preserves the original recorded wall-clock time. */
  var dateStr = String(record.date || '');
  var dtm = dateStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  var editDatePart = dtm ? dtm[1] : todayISO();
  var editHour24 = dtm ? Number(dtm[2]) : 12;
  var editMin = dtm ? dtm[3] : '00';
  var editHour12 = editHour24 % 12 || 12;
  var editMeridiem = editHour24 >= 12 ? 'PM' : 'AM';
  setHumanDateInput($('sDate'), editDatePart);
  if ($('sTime')) $('sTime').value = editHour12 + ':' + editMin;
  moduleState.meridiem = editMeridiem;
  updateMeridiemButtons();
  const medicationId = normalizeMedicationId(record.med);
  setSelect('cpShotMed', medicationId, medicationLabel(medicationId));
  if ($('sDose')) $('sDose').value = record.dose || '';
  if ($('sWt')) $('sWt').value = record.wt || '';
  if ($('sNotes')) $('sNotes').value = record.notes || '';
  renderShotDevicePicker(record.deviceId || '');
  const recordSideEffects = (record.se || []).map(normalizeSideEffectId);
  qa('#logOv input[type="checkbox"]').forEach(input => { input.checked = recordSideEffects.includes(input.value); });
  openLogModal({ preserve: true });
}

function openArchiveConfirm(id) { moduleState.pendingArchiveId = id; $('archiveConfirmOv')?.classList.add('active'); }
function cancelArchiveShot() { moduleState.pendingArchiveId = null; $('archiveConfirmOv')?.classList.remove('active'); }
function confirmArchiveShot() {
  const id = moduleState.pendingArchiveId;
  cancelArchiveShot();
  const all = getAllShots();
  const record = all.find(item => item.id === id);
  if (!record) return;
  record.archived = true;
  record.archivedAt = new Date().toISOString();
  record.modifiedAt = record.archivedAt;
  if (!S.set('shots', all)) { showToast(tx('shots.archiveStorageError', 'Could not archive — storage unavailable.'), true); return; }
  queueCloudSync('shot', record);
  refreshAll();
  showToast(tx('runtime.shotArchived', 'SHOT record archived.'));
}

function restoreArchivedShot(id) {
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
  record.modifiedAt = now;
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

function restoreArchivedShotToEdit(id) {
  if (!restoreArchivedShot(id)) return;
  moduleState.shotHistoryView = 'active';
  renderShots();
  editShot(id);
}

function openPermanentDeleteConfirm(id) { moduleState.pendingPermanentDeleteId = id; $('permanentDeleteConfirmOv')?.classList.add('active'); /* v1.1.4 — destructive-action warning signature as the confirm opens. */ try { window.GN_HAPTICS?.fire('warn'); } catch (_) {} }
function cancelPermanentDeleteShot() { moduleState.pendingPermanentDeleteId = null; $('permanentDeleteConfirmOv')?.classList.remove('active'); }
async function confirmPermanentDeleteShot() {
  const id = moduleState.pendingPermanentDeleteId;
  cancelPermanentDeleteShot();
  const record = getAllShots().find(item => item.id === id);
  if (!record) return;
  const next = getAllShots().filter(item => item.id !== id);
  const plan = planPermanentShotDelete(record, getWeights(), S.get('cloudDeletes', []));
  const ops = [
    { key: 'shots', value: next },
    { key: 'weights', value: plan.remainingWeights },
    { key: 'cloudDeletes', value: plan.cloudDeletes },
  ];
  if (plan.inventoryReturn?.itemId && Number(plan.inventoryReturn.amount) > 0) {
    const inventory = S.get('inventory', []);
    const item = inventory.find(candidate => candidate.id === plan.inventoryReturn.itemId);
    if (item) {
      const at = new Date().toISOString();
      item.quantity = Number(item.quantity || 0) + Number(plan.inventoryReturn.amount);
      item.modifiedAt = at;
      item.history = [...(item.history || []), { at, action: 'AUTO-DEDUCTION REVERSED FOR SHOT DELETE', source: 'System Generated', shotId: record.id }];
      ops.push({ key: 'inventory', value: inventory });
    }
  }
  if (!S.multiWrite(ops)) { showToast(tx('shots.deleteStorageUnavailable', 'Could not delete — storage unavailable.'), true); return; }
  appendEventLedger({ type: 'SHOT', recordId: record.id, date: record.date, label: 'SHOT DELETED' });
  refreshAll();
  const cloudDeleted = plan.cloudDeletes.length ? await flushCloudDeletes() : true;
  showToast(cloudDeleted ? tx('shots.deletedCloud', 'Archived record deleted.') : tx('shots.deletedLocalQueued', 'Deleted locally. Cloud deletion queued for retry.'));
}

/* ONBOARDING (FIRST RUN): while the visual guide (.gn-ob-guide) is
 * spotlighting inside the modal, save-validation errors must surface
 * in the guide's callout. The global error toast (z-index 1000) and
 * the future-timestamp confirm (z-index 540) both paint where the user
 * may miss them, so this maps the failing fields to stable keys and
 * lets the visual guide explain. */
function notifyCoachSaveBlocked(invalidFields) {
  try {
    if (!document.querySelector('.gn-ob-guide')) return;
    const keys = [];
    (invalidFields || []).filter(Boolean).forEach(field => {
      const id = field.id || '';
      if (id === 'cpShotMed') keys.push('med');
      else if (id === 'sDose') keys.push('dose');
      else if (id === 'sDate') keys.push('date');
      else if (id === 'sTime') keys.push('time');
      else if (id === 'logLocationAction') keys.push('loc');
    });
    document.dispatchEvent(new CustomEvent('gn:coach-save-blocked', { detail: { fields: keys } }));
  } catch (_) { /* never break the save path for guide telemetry */ }
}

/* TRACK C: inline field errors for the shot console. Until now a failed
   SAVE only fired a toast: nothing at the field said what to fix, and
   focus() on the non-focusable medication picker silently did nothing.
   The message now lives directly under its field in plain language; the
   toast stays as the summary (the coach path still reads it). Errors
   clear as the user fixes each field. */
function shotFieldError(anchor, id, message) {
  if (!anchor) return;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'gn-field-error';
    el.setAttribute('role', 'alert');
    anchor.insertAdjacentElement('afterend', el);
  }
  el.textContent = message;
}
function clearShotFieldErrors() {
  qa('#logOv .gn-field-error').forEach(el => el.remove());
}
/* TRACK C: post-action momentum. The undoable save toast gains ONE
   next-step action (VIEW) beside UNDO, so a saved shot leads somewhere
   instead of just expiring. First-shot saves keep the GRID ACTIVATED
   celebration as their surface; this only decorates the toast. */
function addToastNextStep(label, onClick) {
  const toast = $('toastEl');
  if (!toast || !toast.classList.contains('undoable') || toast.querySelector('.gn-toast-view')) return;
  const body = toast.querySelector('.gn-toast-body');
  const undo = toast.querySelector('.gn-toast-undo');
  if (!body || !undo) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gn-toast-view';
  btn.textContent = label;
  btn.addEventListener('click', () => { clearTimeout(toast._timer); toast.classList.remove('active'); onClick(); });
  body.insertBefore(btn, undo);
}
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t || !t.closest || !t.closest('#logOv')) return;
  if (t.id === 'sDose') { $('gnShotErrDose')?.remove(); t.removeAttribute('aria-invalid'); }
  if (t.id === 'sWt') { $('gnShotErrWt')?.remove(); t.removeAttribute('aria-invalid'); }
  if (t.id === 'sTime') $('gnShotErrTime')?.remove();
});
document.addEventListener('click', (e) => {
  if (!e.target || !e.target.closest || !e.target.closest('#logOv')) return;
  if (e.target.closest('#cpShotMed')) { $('gnShotErrMed')?.remove(); $('cpShotMed')?.removeAttribute('aria-invalid'); }
  if (e.target.closest('#modalZonePicker')) { $('gnShotErrSite')?.remove(); $('logLocationAction')?.removeAttribute('aria-invalid'); }
});

function saveShot(allowFuture = false) {
  if (moduleState.savingShot) return;
  moduleState.savingShot = true;
  try {
    const med = normalizeMedicationId(selectState.cpShotMed?.val);
    const dose = Number($('sDose')?.value);
    const weightRaw = String($('sWt')?.value || '').trim();
    const weight = weightRaw ? Number(weightRaw) : null;
    const date = readHumanDateInput($('sDate'));
    const time = getShotTime24($('sTime')?.value);
    const site = moduleState.selectedLocation;
    qa('#logOv [aria-invalid="true"]').forEach(field => field.removeAttribute('aria-invalid'));
    clearShotFieldErrors();
    const invalidFields = [];
    if (!med) invalidFields.push($('cpShotMed'));
    if (!isDoseInRange(dose)) invalidFields.push($('sDose'));
    if (!date) invalidFields.push($('sDate'));
    if (!time) invalidFields.push($('sTime'));
    if (!site) invalidFields.push($('logLocationAction'));
    if (invalidFields.length) {
      invalidFields.filter(Boolean).forEach(field => field.setAttribute('aria-invalid', 'true'));
      if (!med) shotFieldError($('cpShotMed'), 'gnShotErrMed', tx('shots.medRequiredPlain', 'Pick your medication from the list.'));
      if (!isDoseInRange(dose)) shotFieldError($('sDose'), 'gnShotErrDose', Number.isFinite(dose) && dose > MAX_DOSE_MG ? tx('shots.doseTooLargePlain', 'Enter a dose of 1000 mg or less.') : tx('shots.doseRequiredPlain', 'Enter a dose greater than zero.'));
      if (!date) shotFieldError($('sDate')?.closest('.form-group') || $('sDate'), 'gnShotErrDate', tx('shots.dateRequiredPlain', 'Pick the date of this shot.'));
      if (!time) shotFieldError($('sTime')?.closest('.form-group') || $('sTime'), 'gnShotErrTime', tx('shots.timeRequired', 'Set the shot time and pick AM or PM.'));
      if (!site) shotFieldError($('logLocationAction')?.closest('.form-group') || $('logLocationAction'), 'gnShotErrSite', tx('shot.siteRequired', 'Pick an injection site to log the shot.'));
      const firstInvalid = invalidFields.find(Boolean);
      if (firstInvalid) {
        if (firstInvalid.id === 'cpShotMed') firstInvalid.querySelector('.cp-select-trigger')?.focus?.();
        else firstInvalid.focus?.();
        firstInvalid.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      }
      // v0.15.53: never fail silently — name the time problem explicitly so the
      // user knows to pick AM/PM instead of tapping SAVE again in confusion.
      // TRACK 2: on step 2 the essentials are already validated at Continue, so
      // a lone missing site gets a targeted message (+ scrolls the picker into
      // view) instead of the generic required-fields toast.
      const realFields = invalidFields.filter(Boolean);
      const onlySiteMissing = realFields.length === 0 && !site;
      const msg = !time
        ? tx('shots.timeRequired', 'Set the shot time and pick AM or PM.')
        : onlySiteMissing
          ? tx('shot.siteRequired', 'Pick an injection site to log the shot.')
          : tx('shots.requiredFields', 'Add medication, dose, date, time, and a logged location.');
      showToast(msg, true);
      if (onlySiteMissing) $('modalSelectedLocation')?.closest('.form-group')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      notifyCoachSaveBlocked(invalidFields);
      return;
    }
    if (weightRaw && !(Number.isFinite(weight) && weight > 0)) {
      $('sWt')?.setAttribute('aria-invalid', 'true');
      shotFieldError($('sWt'), 'gnShotErrWt', tx('shots.validWeightPlain', 'Weight must be a number greater than zero, or left blank.'));
      $('sWt')?.focus();
      showToast(tx('shots.validWeightRequired', 'Optional weight must be greater than zero.'), true);
      return;
    }
    // FAIL CLOSED: never persist a medication that isn't a known canonical key.
    // Ambiguous/invalid historical values must be corrected, never silently mapped.
    if (!Object.prototype.hasOwnProperty.call(MEDICATIONS, med)) {
      showToast(tx('shots.validMedicationRequired', 'Select a valid medication for this record.'), true);
      moduleState.savingShot = false;
      notifyCoachSaveBlocked([$('cpShotMed')]);
      return;
    }
    const existing = moduleState.editingShotId ? getAllShots().find(item => item.id === moduleState.editingShotId) : null;
    /* Date/time semantics (reliability audit 2026-10-14, item 6; the
     * 2026-10-08 offset work is the base this extends):
     * - An edit that leaves date + wall time untouched preserves the
     *   stored instant VERBATIM: its explicit offset AND its seconds
     *   (saving 23:59:45 unchanged used to store 23:59:00).
     * - Any real change re-stamps via stampLocalInstant: the wall time
     *   is kept and the offset is recomputed for the (possibly new)
     *   date in the device's IANA zone. The old code kept the ORIGINAL
     *   record's offset on date edits, so moving a shot across a DST
     *   boundary shifted its displayed hour by one.
     * - A wall time that does not exist on the chosen date (the
     *   spring DST gap) is rejected visibly below, never silently
     *   shifted to a different hour. */
    const existingWall = existing?.date ? String(existing.date).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/) : null;
    const unchangedInstant = !!(existingWall && existingWall[1] === date && `${existingWall[2]}:${existingWall[3]}` === time);
    const stampedDate = unchangedInstant ? String(existing.date) : stampLocalInstant(date, time);
    if (!stampedDate) {
      $('sTime')?.setAttribute('aria-invalid', 'true');
      shotFieldError($('sTime')?.closest('.form-group') || $('sTime'), 'gnShotErrTime', tx('shots.nonexistentTimePlain', 'That time does not exist on this date. The clock skips it for daylight saving. Pick a time outside the skipped hour.'));
      $('sTime')?.focus();
      showToast(tx('shots.nonexistentTimePlain', 'That time does not exist on this date. The clock skips it for daylight saving. Pick a time outside the skipped hour.'), true);
      return;
    }
    const dateTime = new Date(stampedDate);
    if (!allowFuture && dateTime > new Date()) { moduleState.pendingFutureShot = true; $('futureTimestampConfirm')?.classList.add('active'); return; }
    const record = {
      ...(existing || {}), id: existing?.id || createId('shot'), date: stampedDate,
      med, dose, site, deviceId: $('shotDeviceId')?.value || null, wt: weight,
      notes: $('sNotes')?.value?.trim() || null,
      se: qa('#logOv input[type="checkbox"]:checked').map(input => normalizeSideEffectId(input.value)),
      archived: false, archivedAt: null, createdAt: existing?.createdAt || new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      source: existing?.source || 'manual', state: existing?.state || 'confirmed'
    };
    if (state.cloud) ensureCloudRecordId(record);
    const all = getAllShots();
    const index = all.findIndex(item => item.id === record.id);
    // B4: compute the next inventory state WITHOUT writing (pure prep).
    const { inventory, changed } = prepareInventoryForShot(record, existing);
    if (index >= 0) all[index] = record; else all.push(record);
    // B4: single atomic batch — SHOT record + inventory + linked weight.
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
      /* Canonical weight (item 1): the spread used to carry the OLD
       * record's cached weightKg while `weight` took the new value,
       * and the cloud payload trusted the cache. Recompute the derived
       * kg from the canonical pounds value on every rebuild. */
      weightRecord = withCanonicalWeight({
        ...(linkedWeight || {}), id: linkedWeight?.id || createId('weight'), shotId: record.id,
        shotCloudId: record.cloudId || linkedWeight?.shotCloudId || null,
        date: record.date, weight: record.wt, notes: 'Logged with SHOT', source: 'shot',
        createdAt: linkedWeight?.createdAt || new Date().toISOString(), modifiedAt: record.modifiedAt
      });
      if (state.cloud) ensureCloudRecordId(weightRecord);
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
    if (!S.multiWrite(ops)) {
      showToast(tx('shots.storageFull', 'SHOT could not be saved — storage is full.'), true);
      return;
    }
    // Cloud sync ONLY after the local batch committed atomically.
    queueCloudSync('shot', record);
    if (changed) queueCloudSync('workspace');
    /* Item 1: the linked weight is queued directly, on par with a
     * standalone weight edit. It used to ride on the shot sync's
     * promise, which never fires when the shot sync is parked (local
     * mode, hydration pending, offline) — the edit then reached local
     * state and the workspace blob but never the weights table, and
     * later syncs had no weight entry to deliver. Ordering is safe:
     * the weight payload links shot_cloud_id only when the shot's
     * cloud id already exists, and the restore path re-queues weights
     * for shots skipped during hydration, so the link lands on the
     * next pass at the latest. */
    if (weightRecord) queueCloudSync('weight', weightRecord);
    if (queuedCloudDelete) flushCloudDeletes();
    appendEventLedger({ type: 'SHOT', recordId: record.id, date: record.date, label: existing ? 'SHOT UPDATED' : 'SHOT EVENT CONFIRMED' });
    moduleState.pendingFutureShot = false;
    $('futureTimestampConfirm')?.classList.remove('active');
    closeLog(true);
    refreshAll();
    try { document.dispatchEvent(new CustomEvent('gn:shot-saved', { detail: { record: record, isNew: !existing } })); } catch (_) {}
    /* v1.1.4 — save signature from the tactile engine, fired directly in
       the save path (the old build listened for gn:shot-saved through an
       adapter layered over a no-op; the engine is called, not overheard). */
    try { window.GN_HAPTICS?.fire('confirm'); } catch (_) {}
    const shotTimeLabel = formatTime12(new Date(record.date));
    const shotDetail = `${record.dose} mg ${medicationLabel(normalizeMedicationId(record.med))} · ${zoneLabel(record.site)}`;
    showToast(`${tx('toast.shotLogged', 'Dosis registrada')} · ${shotTimeLabel}`, false, () => undoShot(record.id), shotDetail);
    addToastNextStep(tx('toast.viewProgress', 'VIEW PROGRESS'), () => showPage('Results', document.getElementById('navRes')));
    return record;
  } finally {
    moduleState.savingShot = false;
  }
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

function openFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.add('active'); }
function closeFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.remove('active'); moduleState.pendingFutureShot = false; }
function cancelFutureTimestampSave() { closeFutureTimestampConfirm(); }
function confirmFutureTimestampSave() { $('futureTimestampConfirm')?.classList.remove('active'); saveShot(true); }

function handleShotFab() { quickLogShot(); }

function quickLogShot() {
  // S1 (v0.15.54): five-second repeat. A complete last shot opens the compact
  // QUICK REPEAT confirm (two taps to log); anything less falls through to the
  // full console with the best available prefill (last shot -> protocol).
  // B7 (v0.15.1): NEVER auto-log. saveShot() fires only on an explicit tap,
  // which already shows the undoable bottom toast.
  const shots = getAllShots();
  const lastShot = shots.filter(s => !s.archived).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const lastMedId = lastShot?.med ? normalizeMedicationId(lastShot.med) : null;
  const lastComplete = Boolean(lastShot)
    && lastMedId && Object.prototype.hasOwnProperty.call(MEDICATIONS, lastMedId)
    && isDoseInRange(lastShot.dose)
    && lastShot.site;
  if (lastComplete) { openQuickConfirm(lastShot, lastMedId); return; }

  const profile = getProfile();
  const medId = lastMedId || normalizeMedicationId(profile.med);
  if (!medId || !Object.prototype.hasOwnProperty.call(MEDICATIONS, medId)) { openLogModal(); return; }
  const dose = lastShot?.dose ?? profile.dose ?? '';
  const site = lastShot?.site || moduleState.selectedLocation;
  if (!isDoseInRange(dose) || !site) { openLogModal(); return; }
  const now = new Date();
  moduleState.editingShotId = null;
  moduleState.selectedLocation = site;
  // Clear the native sessionStorage draft so its restoreShotDraft() (wired to the
  // drawer-open event) does not wipe our pre-fill with stale/empty values.
  try { sessionStorage.removeItem('gn_shot_draft_session_v1'); } catch (_) {}
  // Draft is consumed once by openLogModal's preserveDraft branch (restores every field).
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

// S1 — QUICK REPEAT confirm sheet. Shows med/dose/site from the last shot with
// the current time; LOG SHOT commits via the standard saveShot() path,
// CHANGE DETAILS falls through to the full console pre-filled.
function openQuickConfirm(lastShot, medId) {
  moduleState.quickConfirmShot = lastShot;
  const resolvedMedId = medId || normalizeMedicationId(lastShot.med);
  const summary = $('gnQuickConfirmSummary');
  if (summary) {
    const chips = [
      medicationLabel(resolvedMedId),
      `${lastShot.dose} mg`,
      (typeof zoneLabel === 'function' && zoneLabel(lastShot.site)) || lastShot.site
    ];
    summary.innerHTML = chips.map(() => '<span class="gn-quick-confirm-chip"></span>').join('');
    Array.from(summary.children).forEach((el, i) => { el.textContent = chips[i]; });
  }
  const timeEl = $('gnQuickConfirmTime');
  if (timeEl) timeEl.textContent = `NOW \u2014 ${formatTime12(new Date())}`;
  const ov = $('logOv');
  if (!ov) { openLogModal(); return; }
  ov.classList.add('gn-quick-mode');
  $('gnQuickConfirm')?.classList.remove('gn-hidden');
  try { sessionStorage.removeItem('gn_shot_draft_session_v1'); } catch (_) {}
  cancelLogClose();
  ov.classList.add('active');
  syncLogModalLabels();
}

function closeQuickConfirm() {
  const ov = $('logOv');
  if (ov) ov.classList.remove('gn-quick-mode');
  $('gnQuickConfirm')?.classList.add('gn-hidden');
  moduleState.quickConfirmShot = null;
}

// Quick-confirm LOG SHOT: populate the form fields from the last shot + now,
// then run the standard saveShot() path (validation, inventory, cloud sync,
// linked weight, undo toast). No duplicated commit logic.
function confirmQuickShot() {
  const last = moduleState.quickConfirmShot;
  if (!last) { openLogModal(); return; }
  const now = new Date();
  const medId = normalizeMedicationId(last.med);
  moduleState.shotDraft = {
    med: medId,
    dose: last.dose,
    date: todayISO(),
    time: formatTime12(now),
    meridiem: now.getHours() >= 12 ? 'PM' : 'AM',
    wt: '',
    notes: '',
    se: [],
    deviceId: ''
  };
  moduleState.editingShotId = null;
  moduleState.selectedLocation = last.site;
  setSelect('cpShotMed', medId, medicationLabel(medId));
  if ($('sDose')) $('sDose').value = last.dose;
  if ($('sDate')) setHumanDateInput($('sDate'), todayISO());
  if ($('sTime')) $('sTime').value = formatTime12(now);
  moduleState.meridiem = moduleState.shotDraft.meridiem;
  if (typeof updateMeridiemButtons === 'function') updateMeridiemButtons();
  if ($('sWt')) $('sWt').value = '';
  if ($('sNotes')) $('sNotes').value = '';
  qa('#logOv input[type="checkbox"]').forEach(input => { input.checked = false; });
  if (typeof renderShotDevicePicker === 'function') renderShotDevicePicker('');
  try { sessionStorage.removeItem('gn_shot_draft_session_v1'); } catch (_) {}
  closeQuickConfirm();
  saveShot();
}

// Quick-confirm CHANGE DETAILS: full console with the last-shot prefill.
function quickConfirmDetails() {
  const last = moduleState.quickConfirmShot;
  closeQuickConfirm();
  if (!last) { openLogModal(); return; }
  const now = new Date();
  moduleState.editingShotId = null;
  moduleState.selectedLocation = last.site;
  try { sessionStorage.removeItem('gn_shot_draft_session_v1'); } catch (_) {}
  moduleState.shotDraft = {
    med: normalizeMedicationId(last.med),
    dose: String(last.dose),
    date: todayISO(),
    time: formatTime12(now),
    meridiem: now.getHours() >= 12 ? 'PM' : 'AM',
    wt: '', notes: '', se: [], deviceId: ''
  };
  openLogModal({ preserve: true });
}
function researchEnterCustomMode() {
  const mode = $('gnResearchMode');
  if (mode) { mode.style.display = ''; mode.dataset.mode = 'custom'; }
  const mlc = $('gnModeLibraryChip'), mcc = $('gnModeCategoryChip');
  if (mlc) mlc.style.display = 'none';
  if (mcc) mcc.style.display = 'none';
  const mcb = $('gnModeBack');
  if (mcb) mcb.style.display = '';
  const customTitle = document.querySelector('.gn-research-mode-custom .gn-research-mode-title');
  if (customTitle) customTitle.style.display = '';
  if ($('gnResearchName')) { $('gnResearchName').value = ''; $('gnResearchName').readOnly = false; $('gnResearchName').removeAttribute('data-research-locked'); }
  $('gnResearchName')?.setAttribute('placeholder', tx('research.recordNamePlaceholder', 'Select a library entry or type a custom name'));
  const category = $('gnResearchCategory');
  if (category) { category.readOnly = false; category.removeAttribute('data-category-locked'); category.dataset.categoryId = 'lab.customResearch'; category.value = tx('research.customCategoryDefault', 'Personalizada'); }
  const badgeHost = $('gnResearchForm')?.querySelector('[data-research-badge]');
  if (badgeHost) badgeHost.textContent = '';
  const customSave = $('gnResearchSave');
  if (customSave) customSave.textContent = tx('research.customSave', 'GUARDAR ENTRADA PERSONALIZADA');
  const cw = $('gnCustomWarning');
  if (cw) cw.style.display = '';
  if (!window.matchMedia || window.matchMedia('(pointer: fine)').matches) $('gnResearchName')?.focus();
}

function researchBackToLibrary() {
  const mode = $('gnResearchMode');
  if (mode) { mode.style.display = 'none'; mode.dataset.mode = 'pick'; }
  if ($('gnResearchName')) { $('gnResearchName').value = ''; $('gnResearchName').readOnly = false; $('gnResearchName').removeAttribute('data-research-locked'); }
  const category = $('gnResearchCategory');
  if (category) { category.readOnly = false; category.removeAttribute('data-category-locked'); category.dataset.categoryId = ''; category.value = ''; }
  $('gnResearchName')?.setAttribute('placeholder', tx('research.recordNamePlaceholder', 'Select a library entry or type a custom name'));
  const badgeHost = $('gnResearchForm')?.querySelector('[data-research-badge]');
  if (badgeHost) badgeHost.textContent = '';
  const customSave = $('gnResearchSave');
  if (customSave) customSave.textContent = tx('research.save', 'SAVE RESEARCH RECORD');
  const cw = $('gnCustomWarning');
  if (cw) cw.style.display = 'none';
}
;(function(){var m={openLogModal:openLogModal,gnSetShotStep:gnSetShotStep,gnShotStepNext:gnShotStepNext,gnShotStepBack:gnShotStepBack,gnShotPrimaryAction:gnShotPrimaryAction,gnToggleShotAdvanced:gnToggleShotAdvanced,closeLog:closeLog,cancelLogClose:cancelLogClose,editShot:editShot,openArchiveConfirm:openArchiveConfirm,cancelArchiveShot:cancelArchiveShot,confirmArchiveShot:confirmArchiveShot,restoreArchivedShot:restoreArchivedShot,openPermanentDeleteConfirm:openPermanentDeleteConfirm,cancelPermanentDeleteShot:cancelPermanentDeleteShot,confirmPermanentDeleteShot:confirmPermanentDeleteShot,saveShot:saveShot,openFutureTimestampConfirm:openFutureTimestampConfirm,closeFutureTimestampConfirm:closeFutureTimestampConfirm,cancelFutureTimestampSave:cancelFutureTimestampSave,confirmFutureTimestampSave:confirmFutureTimestampSave,handleShotFab:handleShotFab,openQuickConfirm:openQuickConfirm,confirmQuickShot:confirmQuickShot,quickConfirmDetails:quickConfirmDetails};if(window.GNRegisterChunk){window.GNRegisterChunk('logshot',m);}else if(window.GNModules){Object.assign(window.GNModules,m);}})();
