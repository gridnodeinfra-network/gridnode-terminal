export function openLogModal(options = {}) {
  const modal = $('logOv');
  if (!modal) return;
  let draftDeviceId = '';
  if (!modal.querySelector('[data-gn-shot-step="timing"]')) {
    modal.querySelector('.gn-shot-datetime-group')?.insertAdjacentHTML('afterbegin', '<div class="gn-log-step" data-gn-shot-step="timing">' + tx('shot.timing', '01 // TIMING') + '</div>');
    $('cpShotMed')?.closest('.form-group')?.insertAdjacentHTML('afterbegin', '<div class="gn-log-step" data-gn-shot-step="protocol">' + tx('shot.protocol', '02 // PROTOCOL') + '</div>');
    $('modalSelectedLocation')?.closest('.form-group')?.insertAdjacentHTML('afterbegin', '<div class="gn-log-step" data-gn-shot-step="location">' + tx('shot.location', '03 // LOCATION') + '</div>');
  }
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
    document.querySelector('#logOv .modal-title')?.replaceChildren(document.createTextNode(tx('shot.logShot', 'LOG SHOT')));
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
  renderShotDevicePicker(draftDeviceId);
  if (!modal.querySelector('.gn-drawer-handle')) modal.insertAdjacentHTML('afterbegin', '<div class="gn-drawer-handle" aria-hidden="true"></div>');
  modal.classList.add('active');
}

function renderShotDevicePicker(selectedId = '') {
  const picker = $('shotDeviceId');
  if (!picker) return;
  const devices = S.get('devices', []).filter(device => !device.archived);
  picker.innerHTML = `<option value="">${tx('shot.unknownDevice', 'Unknown / Not applicable')}</option>${devices.map(device => `<option value="${safeText(device.id)}">${safeText(device.name)} · ${safeText(deviceStatusLabel(device.status))}</option>`).join('')}`;
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
  $('logOv')?.classList.remove('active');
  moduleState.pendingLocationDraft = false;
  moduleState.shotDraft = null;
  moduleState.editingShotId = null;
}

export function closeLog(force = false) {
  const dirty = isShotFormDirty();
  if (dirty && !force) {
    const ov = $('shotDiscardConfirmOv');
    if (ov) { ov.style.display = 'flex'; requestAnimationFrame(() => ov.classList.add('active')); }
    return;
  }
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
  const recordDate = new Date(record.date);
  const safeRecordDate = Number.isNaN(recordDate.getTime()) ? new Date() : recordDate;
  setHumanDateInput($('sDate'), record.date?.slice(0, 10) || todayISO());
  if ($('sTime')) $('sTime').value = formatTime12(safeRecordDate);
  moduleState.meridiem = safeRecordDate.getHours() >= 12 ? 'PM' : 'AM';
  updateMeridiemButtons();
  const medicationId = normalizeMedicationId(record.med);
  setSelect('cpShotMed', medicationId, medicationLabel(medicationId));
  if ($('sDose')) $('sDose').value = record.dose || '';
  if ($('sWt')) $('sWt').value = record.wt || '';
  if ($('sNotes')) $('sNotes').value = record.notes || '';
  renderShotDevicePicker(record.deviceId || '');
  const recordSideEffects = (record.se || []).map(normalizeSideEffectId);
  qa('#logOv input[type="checkbox"]').forEach(input => { input.checked = recordSideEffects.includes(input.value); });
  document.querySelector('#logOv .modal-title')?.replaceChildren(document.createTextNode(tx('shot.editShot', 'EDIT SHOT')));
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
  record.modifiedAt = record.archivedAt;
  if (!S.set('shots', all)) { showToast(tx('shots.archiveStorageError', 'Could not archive — storage unavailable.'), true); return; }
  queueCloudSync('shot', record);
  refreshAll();
  showToast(tx('runtime.shotArchived', 'SHOT record archived.'));
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

export function openPermanentDeleteConfirm(id) { moduleState.pendingPermanentDeleteId = id; $('permanentDeleteConfirmOv')?.classList.add('active'); }
export function cancelPermanentDeleteShot() { moduleState.pendingPermanentDeleteId = null; $('permanentDeleteConfirmOv')?.classList.remove('active'); }
export async function confirmPermanentDeleteShot() {
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

export function saveShot(allowFuture = false) {
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
    // FAIL CLOSED: never persist a medication that isn't a known canonical key.
    // Ambiguous/invalid historical values must be corrected, never silently mapped.
    if (!Object.prototype.hasOwnProperty.call(MEDICATIONS, med)) {
      showToast(tx('shots.validMedicationRequired', 'Select a valid medication for this record.'), true);
      moduleState.savingShot = false;
      return;
    }
    const dateTime = new Date(`${date}T${time}`);
    if (!allowFuture && dateTime > new Date()) { moduleState.pendingFutureShot = true; $('futureTimestampConfirm')?.classList.add('active'); return; }
    const existing = moduleState.editingShotId ? getAllShots().find(item => item.id === moduleState.editingShotId) : null;
    const record = {
      ...(existing || {}), id: existing?.id || createId('shot'), date: `${date}T${time}`,
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
      weightRecord = {
        ...(linkedWeight || {}), id: linkedWeight?.id || createId('weight'), shotId: record.id,
        shotCloudId: record.cloudId || linkedWeight?.shotCloudId || null,
        date: record.date, weight: record.wt, notes: 'Logged with SHOT', source: 'shot',
        createdAt: linkedWeight?.createdAt || new Date().toISOString(), modifiedAt: record.modifiedAt
      };
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
    const shotSync = queueCloudSync('shot', record);
    if (changed) queueCloudSync('workspace');
    // Preserve the FK order once shot_id is available. The cloud functions
    // remain fail-safe and queued if the shot upsert itself cannot complete.
    if (weightRecord) shotSync.then(() => queueCloudSync('weight', weightRecord));
    if (queuedCloudDelete) flushCloudDeletes();
    appendEventLedger({ type: 'SHOT', recordId: record.id, date: record.date, label: existing ? 'SHOT UPDATED' : 'SHOT EVENT CONFIRMED' });
    moduleState.pendingFutureShot = false;
    $('futureTimestampConfirm')?.classList.remove('active');
    closeLog(true);
    refreshAll();
    try { document.dispatchEvent(new CustomEvent('gn:shot-saved', { detail: { record: record, isNew: !existing } })); } catch (_) {}
    const shotTimeLabel = formatTime12(new Date(record.date));
    const shotDetail = `${record.dose}mg ${medicationLabel(normalizeMedicationId(record.med))} · ${zoneLabel(record.site)}`;
    showToast(`${tx('toast.shotLogged', 'Dosis registrada')} · ${shotTimeLabel}`, false, () => undoShot(record.id), shotDetail);
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

export function openFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.add('active'); }
export function closeFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.remove('active'); moduleState.pendingFutureShot = false; }
export function cancelFutureTimestampSave() { closeFutureTimestampConfirm(); }
export function confirmFutureTimestampSave() { $('futureTimestampConfirm')?.classList.remove('active'); saveShot(true); }

export function handleShotFab() { quickLogShot(); }

function quickLogShot() {
  // B7 (v0.15.1): NEVER auto-log. Pre-fill the bottom-sheet drawer via the app's
  // own draft machinery (moduleState.shotDraft + openLogModal({preserve:true}))
  // and let the user review + confirm. saveShot() fires only on the explicit
  // SAVE tap, which already shows the undoable bottom toast and closes without
  // any view jump.
  const shots = getAllShots();
  const lastShot = shots.filter(s => !s.archived).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const profile = getProfile();
  const medId = lastShot?.med ? normalizeMedicationId(lastShot.med) : normalizeMedicationId(profile.med);
  if (!medId || !Object.prototype.hasOwnProperty.call(MEDICATIONS, medId)) { openLogModal(); return; }
  const dose = lastShot?.dose ?? profile.dose ?? '';
  const site = lastShot?.site || moduleState.selectedLocation;
  if (!(Number.isFinite(Number(dose)) && Number(dose) > 0) || !site) { openLogModal(); return; }
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
  showToast(tx('shots.selectZoneAgain', 'Select a trackable zone, then open LOG SHOT again.'));
}

