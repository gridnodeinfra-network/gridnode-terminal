function ensureDestructiveDialogs() {
  if ($('gnDeleteLocalOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="gn-delete-overlay" id="gnDeleteLocalOverlay" role="dialog" aria-modal="true" aria-labelledby="gnDeleteLocalTitle"><div class="gn-delete-panel"><div class="gn-delete-kicker" data-i18n="deleteLocal.kicker">// VAULT CONTROL</div><h2 id="gnDeleteLocalTitle" data-i18n="deleteLocal.title">DELETE ALL LOCAL DATA?</h2><p data-i18n="deleteLocal.body">This removes all shots, weights, peptides, devices, and settings from this device. Cloud records will be restored on next sign-in. This action cannot be undone.</p><label><span data-i18n="deleteLocal.typeConfirm">TYPE DELETE TO CONFIRM</span><input id="gnDeleteLocalInput" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" oninput="updateDeleteLocalButton(this.value)"></label><div class="gn-delete-actions"><button type="button" class="btn-full btn-secondary" onclick="closeDeleteLocalData()" data-i18n="deleteLocal.cancel">CANCEL</button><button type="button" class="btn-full gn-delete-confirm" id="gnDeleteLocalConfirm" disabled onclick="confirmDeleteLocalData()" data-i18n="deleteLocal.confirm">DELETE LOCAL DATA</button></div></div></div><div class="gn-delete-overlay" id="gnDeleteCloudOverlay" role="dialog" aria-modal="true" aria-labelledby="gnDeleteCloudTitle"><div class="gn-delete-panel"><div class="gn-delete-kicker" data-i18n="deleteCloud.kicker">// CLOUD ACCOUNT CONTROL</div><h2 id="gnDeleteCloudTitle" data-i18n="deleteCloud.title">DELETE CLOUD ACCOUNT?</h2><p data-i18n="deleteCloud.body">This permanently removes all synced records from cloud storage. Local data on this device is not affected. You will be signed out.</p><p class="gn-delete-note" data-i18n="deleteCloud.note">A secure server request verifies the signed-in account before deletion. The browser never receives the server key.</p><div class="gn-delete-actions"><button type="button" class="btn-full btn-secondary" onclick="closeDeleteCloudAccount()" data-i18n="deleteCloud.cancel">CANCEL</button><button type="button" class="btn-full gn-delete-confirm" onclick="confirmDeleteCloudAccount()" data-i18n="deleteCloud.confirm">DELETE CLOUD ACCOUNT</button></div></div></div>`);
    window.GN_I18N?.applyTo?.(document.getElementById('gnDeleteLocalOverlay'));
    window.GN_I18N?.applyTo?.(document.getElementById('gnDeleteCloudOverlay'));
}

function clearLocalGridNodeData() {
  Object.keys(localStorage).filter(key => key.startsWith('gn_')).forEach(key => localStorage.removeItem(key));
}

export function openDeleteLocalData() { ensureDestructiveDialogs(); const input = $('gnDeleteLocalInput'); if (input) input.value = ''; $('gnDeleteLocalConfirm')?.setAttribute('disabled', ''); $('gnDeleteLocalOverlay')?.classList.add('active'); setTimeout(() => input?.focus(), 0); }
export function closeDeleteLocalData() { $('gnDeleteLocalOverlay')?.classList.remove('active'); }
export function updateDeleteLocalButton(value) { const confirm = $('gnDeleteLocalConfirm'); if (confirm) confirm.disabled = String(value || '').trim().toUpperCase() !== 'DELETE'; }
export async function confirmDeleteLocalData() {
  if (String($('gnDeleteLocalInput')?.value || '').trim().toUpperCase() !== 'DELETE') return;
  await signOutCloud();
  clearLocalGridNodeData();
  clearSession();
  window.location.reload();
}
export function openDeleteCloudAccount() { ensureDestructiveDialogs(); $('gnDeleteCloudOverlay')?.classList.add('active'); }
export function closeDeleteCloudAccount() { $('gnDeleteCloudOverlay')?.classList.remove('active'); }
export async function confirmDeleteCloudAccount() {
  const result = await deleteCloudAccount();
  closeDeleteCloudAccount();
  if (!result?.ok) { actionFeedback(tx('auth.accountNotDeleted', 'CLOUD ACCOUNT NOT DELETED'), tx('auth.deletionFailed', 'ACCOUNT DELETION FAILED // LOCAL DATA UNCHANGED'), true); return; }
  clearLocalGridNodeData();
  await signOutCloud();
  clearSession();
  window.location.reload();
}

export function renderProfile() {
  ensureProfileHub();
  ensureProfileMeasurements();
  ensureDestructiveDialogs();
  syncIdentityAvatars();
  const legacyProfile = $('pageProfile')?.querySelector('[data-gn-legacy-profile]');
  if (legacyProfile) legacyProfile.hidden = true;
  const updateCard = $('gnSystemUpdateCard');
  if (updateCard) updateCard.hidden = S.get('settings', {}).systemUpdateDismissed === APP_VERSION;
  const profile = getProfile();
  setText('profNameTxt', window.CU?.defaultName || profile.name || tx('profile.anonFallback', 'NODE_USER'));
  setText('profEmail', sessionLabel());
  setText('profMedTxt', normalizeMedicationId(profile.med) ? `// ${medicationLabel(profile.med).toUpperCase()}` : tx('profile.noMedicationSet', '// NO MEDICATION SET'));
  const currentWeight = latestWeight()?.weight;
  const height = profile.htFt ? `${profile.htFt}'${profile.htIn || 0}"` : tx('profile.heightNotEntered', 'Height not entered');
  setText('gnProfileMedication', normalizeMedicationId(profile.med) ? `${medicationLabel(profile.med)}${profile.dose ? ` · ${profile.dose}mg` : ''}` : tx('vault.notEntered', 'Not entered'));
  setText('gnProfileBody', `${height}${currentWeight ? ` · ${Number(currentWeight).toFixed(1)} lb` : ''}`);
  setText('gnProfileVersion', APP_VERSION);
  setText('gnProfileAccount', state.cloud ? `${state.session?.user?.app_metadata?.provider === 'google' ? tx('profile.signedInWithGoogle', 'Signed in with Google') : tx('vault.cloudConnected', 'Cloud account connected')} · ${state.session?.user?.email || sessionLabel()}` : tx('profile.localDeviceSession', 'Local device session'));
  setText('gnProfileSync', nodeSyncLabel());
  hydrateProfileFields(profile);
  syncCustomPickers($('pageProfile') || document);
  renderMeasurements();
  let status = document.querySelector('.gn-cloud-status');
  const hero = $('profAvaWrap')?.closest('[style*="background:#0e0e16"]');
  if (!status && hero) { status = document.createElement('div'); status.className = 'gn-cloud-status'; hero.parentElement.insertBefore(status, hero.nextSibling); }
  if (status) status.innerHTML = `<span class="gn-cloud-dot ${state.cloud ? 'cloud' : 'local'}"></span><span>${tx('vault.vaultLabel', 'VAULT')}: ${safeText(nodeSyncLabel())} · ${state.cloud ? tx('vault.cloudConnected', 'Cloud account connected') : tx('vault.cloudLocal', 'Data stays on this device until you connect an account')}</span>`;
  renderDeviceVault();
  ensurePasskeySection();
  renderGnHapticsState();
}

export function dismissSystemUpdate() {
  const settings = S.get('settings', {});
  settings.systemUpdateDismissed = APP_VERSION;
  S.set('settings', settings);
  const card = $('gnSystemUpdateCard');
  if (card) card.hidden = true;
}

export function openSystemUpdate() {
  if (window.GN_WHATS_NEW?.history) { window.GN_WHATS_NEW.history(); return; }
  const card = $('gnSystemUpdateCard');
  if (!card) return;
  card.hidden = false;
  const settings = S.get('settings', {});
  if (settings.systemUpdateDismissed === APP_VERSION) {
    delete settings.systemUpdateDismissed;
    S.set('settings', settings);
  }
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function exportCSV() {
  const rows = [['record_type', 'date', 'medication', 'dose_mg', 'location', 'weight_lb', 'side_effects', 'notes', 'archived', 'measurement_type', 'measurement_value', 'measurement_unit']];
  getAllShots().forEach(record => rows.push(['shot', record.date || '', medicationLabel(record.med), record.dose || '', record.site || '', record.wt || '', (record.se || []).map(sideEffectLabel).join('|'), record.notes || '', record.archived ? 'true' : 'false', '', '', '']));
  getWeights().forEach(record => rows.push(['weight', record.date || '', '', '', '', record.weight || '', '', record.notes || '', 'false', '', '', '']));
  S.get('measurements', []).forEach(record => rows.push(['measurement', record.date || '', '', '', '', '', '', '', 'false', record.type || '', record.value || '', record.unit || 'in']));
  downloadFile('gridnode-records.csv', rows.map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast(tx('vault.csvExportReady', 'CSV export prepared.'));
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportBackup() {
  const backup = { app: 'GRID//NODE', version: APP_VERSION, exportedAt: new Date().toISOString(), profile: getProfile(), shots: getAllShots(), weights: getWeights(), measurements: S.get('measurements', []), results: S.get('results', []), notes: S.get('notes', []), symptoms: S.get('symptoms', []), labs: S.get('labs', []), preferences: S.get('preferences', {}), settings: S.get('settings', {}), arsenal: S.get('arsenal', []), researchRecords: S.get('researchRecords', []), devices: S.get('devices', []), inventory: S.get('inventory', []), loadouts: S.get('loadouts', []), eventLedger: S.get('eventLedger', []), selectedLocation: S.get('selectedLocation', ''), importQueue: S.get('importQueue', []), cloudDeletes: S.get('cloudDeletes', []), workspaces: S.get('workspaces', {}) };
  downloadFile('gridnode-backup.json', JSON.stringify(backup, null, 2), 'application/json');
  showToast(tx('vault.backupReady', 'VAULT backup prepared.'));
}

