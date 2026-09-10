function rawCSVRows(text) {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseLine = line => { const cells = []; let value = '', quoted = false; for (let index = 0; index < line.length; index++) { const char = line[index]; if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { cells.push(value.trim()); value = ''; } else value += char; } cells.push(value.trim()); return cells; };
  return { headers: parseLine(lines[0]).map(value => value.trim()), rows: lines.slice(1).map(parseLine) };
}

function normalizedImportHeader(value) { return String(value || '').toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim(); }
function importColumn(headers, names) { return headers.findIndex(header => names.includes(normalizedImportHeader(header))); }
function importCell(headers, cells, names) { const index = importColumn(headers, names); return index < 0 ? '' : String(cells[index] || '').trim(); }
function parseImportedMedication(value) { const clean = String(value || '').replace(/[®™]/g, '').trim(); const match = clean.match(/^(.*?)(?:\s+([0-9]+(?:\.[0-9]+)?)\s*mg)?$/i); return { medication: (match?.[1] || '').trim(), dose_mg: match?.[2] ? Number(match[2]) : null }; }
function importSideEffects(headers, cells, excluded) { return headers.map((header, index) => ({ header, value: String(cells[index] || '').trim() })).filter(item => !excluded.has(normalizedImportHeader(item.header)) && item.value && !/^(no|none|false|0)$/i.test(item.value)).map(item => /^(yes|true)$/i.test(item.value) ? item.header : `${item.header}: ${item.value}`); }
function genericCSVFromRows(rows) { const headers = ['record_type', 'date', 'medication', 'dose_mg', 'location', 'weight_lb', 'side_effects', 'notes', 'archived']; return [headers, ...rows.map(row => [row.record_type, row.date, row.medication || '', row.dose_mg ?? '', row.location || '', row.weight_lb ?? '', (row.side_effects || []).join('|'), row.notes || '', 'false'])].map(row => row.map(csvCell).join(',')).join('\n'); }
function mergeImportRecords(existing, incoming) { const current = Array.isArray(existing) ? existing : []; const added = Array.isArray(incoming) ? incoming : []; const ids = new Set(current.map(record => record?.id || JSON.stringify(record))); return [...current, ...added.filter(record => { const id = record?.id || JSON.stringify(record); if (ids.has(id)) return false; ids.add(id); return true; })]; }

// GLAPP column names are inferred from the available reference structure until a real export sample is supplied.
export function prepareCSVImport(text) {
  const raw = rawCSVRows(text); const headers = raw.headers.map(normalizedImportHeader); const has = value => headers.includes(value);
  const isShotsy = has('shot') && has('site') && has('shot notes');
  const isGlapp = has('weight lbs') || has('injection site') || has('dose mg');
  const notImported = [];
  if (isShotsy) ['calories', 'protein', 'water', 'day notes'].forEach(name => { const at = headers.indexOf(name); if (at >= 0) notImported.push(raw.headers[at]); });
  if (!isShotsy && !isGlapp) return { format: 'Generic CSV', source: 'CSV Import', rows: parseCSV(text), notImported };
  const normalized = raw.rows.map(cells => {
    if (isShotsy) {
      const shotValue = importCell(raw.headers, cells, ['shot']); const parsed = parseImportedMedication(shotValue); const weightValue = importCell(raw.headers, cells, ['recorded weight lbs', 'weight lbs']);
      const dateValue = importCell(raw.headers, cells, ['date', 'shot date', 'recorded date', 'timestamp']); const timeValue = importCell(raw.headers, cells, ['time']);
      const painValue = Number(importCell(raw.headers, cells, ['pain level']));
      const excluded = new Set(['shot', 'site', 'shot notes', 'recorded weight lbs', 'weight lbs', 'date', 'shot date', 'recorded date', 'timestamp', 'time', 'pain level', 'calories', 'protein', 'water', 'day notes']);
      const sideEffects = importSideEffects(raw.headers, cells, excluded);
      if (Number.isFinite(painValue) && painValue > 0) sideEffects.unshift(`pain level ${painValue}/4`);
      return { record_type: shotValue ? 'shot' : 'weight', date: timeValue && dateValue ? `${dateValue}T${timeValue}` : dateValue, medication: parsed.medication, dose_mg: parsed.dose_mg, location: importCell(raw.headers, cells, ['site']), weight_lb: weightValue ? Number(weightValue) : null, side_effects: sideEffects, notes: importCell(raw.headers, cells, ['shot notes']) };
    }
    const date = importCell(raw.headers, cells, ['date', 'recorded date', 'timestamp']); const time = importCell(raw.headers, cells, ['time', 'recorded time']); const parsed = parseImportedMedication(importCell(raw.headers, cells, ['medication', 'shot'])); const sideEffects = importCell(raw.headers, cells, ['side effects', 'sideeffects']);
    const explicitDose = importCell(raw.headers, cells, ['dose mg', 'dose']); const dose = explicitDose ? Number(explicitDose) : parsed.dose_mg; const weight = Number(importCell(raw.headers, cells, ['weight lbs', 'weight', 'recorded weight lbs'])) || null;
    return { record_type: parsed.medication && Number.isFinite(dose) && dose > 0 ? 'shot' : 'weight', date: time && date ? `${date} ${time}` : date, medication: parsed.medication, dose_mg: dose, location: importCell(raw.headers, cells, ['injection site', 'site']), weight_lb: weight, side_effects: sideEffects ? sideEffects.split(/[|;]/).map(value => value.trim()).filter(Boolean) : [], notes: importCell(raw.headers, cells, ['notes', 'shot notes']) };
  });
  const format = isShotsy ? 'Shotsy Export' : 'GLAPP Export'; const source = isShotsy ? 'csv_import_shotsy' : 'csv_import_glapp';
  return { format, source, rows: parseCSV(genericCSVFromRows(normalized)).map(row => ({ ...row, source })), notImported };
}

export function handleCSVImportFile(event) {
  const file = event.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const prepared = prepareCSVImport(String(reader.result || ''));
    const classified = classifyCSVRows(prepared.rows, getAllShots(), getWeights());
    moduleState.pendingImport = classified.rows.map(item => ({ row: item.row, status: item.status, forced: false }));
    moduleState.pendingImportMeta = { fileName: file.name, format: prepared.format, source: prepared.source, recordState: 'review', skipped: [], notImported: prepared.notImported || [], ...classified.counts };
    const counts = classified.counts;
    setText('csvImportTitle', `${prepared.format.toUpperCase()} IMPORT PREVIEW`);
    setText('csvImportFormat', `DETECTED FORMAT // ${prepared.format}`);
    setText('csvImportSummary', `${counts.recognized} recognized · ${counts.duplicates} duplicates · ${counts.newRecords} new · ${counts.invalid} invalid. ${counts.invalid ? 'Invalid rows will not be saved.' : 'Review before saving.'}`);
    renderImportPreviewRows();
    const confirm = $('csvImportConfirmBtn');
    if (confirm) { confirm.disabled = counts.newRecords === 0; confirm.textContent = counts.newRecords ? `IMPORT ${counts.newRecords} NEW RECORD${counts.newRecords === 1 ? '' : 'S'}` : 'NO NEW RECORDS'; }
    $('csvImportOverlay')?.classList.add('active');
  };
  reader.onerror = () => actionFeedback(tx('backup.importNotOpened', 'IMPORT NOT OPENED'), tx('backup.csvCouldNotRead', 'THE SELECTED CSV COULD NOT BE READ'), true);
  reader.readAsText(file);
  event.target.value = '';
}
function ensureImportDialog() {
  if ($('gnImportOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="gn-import-overlay" id="gnImportOverlay" role="dialog" aria-modal="true" aria-labelledby="gnImportTitle"><div class="gn-import-panel"><div class="gn-import-title" id="gnImportTitle" data-i18n="import.title">IMPORT DATA</div><p data-i18n="import.copy">Choose a source. GRID//NODE will detect the file format and show a review before commit.</p><label><span data-i18n="import.fromApp">FROM ANOTHER APP</span><select id="gnImportSource"><option data-i18n="import.shotsy">Shotsy</option><option data-i18n="import.glapp">GLAPP</option><option data-i18n="import.genericCsv">Generic CSV</option></select></label><label class="gn-import-file"><span data-i18n="import.fromCsv">FROM CSV FILE</span><input type="file" id="gnUnifiedCsvInput" accept=".csv,text/csv"></label><label class="gn-import-file"><span data-i18n="import.fromShotsyJson">FROM SHOTSY JSON</span><input type="file" id="gnShotsyJsonInput" accept=".shotsyjson,.json,application/json"></label><label class="gn-import-file"><span data-i18n="import.fromBackup">FROM GRID//NODE BACKUP</span><input type="file" id="gnBackupInput" accept=".json,application/json"></label><button type="button" class="gn-import-close" onclick="closeImportDialog()" data-i18n="import.cancel">CANCEL</button></div></div>`);
    window.GN_I18N?.applyTo?.(document.getElementById('gnImportOverlay'));
  $('gnUnifiedCsvInput')?.addEventListener('change', handleUnifiedCsvSelection);
  $('gnShotsyJsonInput')?.addEventListener('change', handleShotsyJSONFile);
  $('gnBackupInput')?.addEventListener('change', handleBackupImportFile);
}
export function openImportDialog() { ensureImportDialog(); $('gnImportOverlay')?.classList.add('active'); }
export function closeImportDialog() { $('gnImportOverlay')?.classList.remove('active'); }
export function handleUnifiedCsvSelection(event) { closeImportDialog(); handleCSVImportFile(event); }
function validBackupDate(value) {
  const raw = String(value || '').trim();
  const calendar = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!calendar) return false;
  const [, year, month, day] = calendar.map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day, 12));
  return Number.isFinite(new Date(raw).getTime()) && normalized.getUTCFullYear() === year && normalized.getUTCMonth() === month - 1 && normalized.getUTCDate() === day;
}
function normalizeBackupPayload(input) {
  if (!input || input.app !== 'GRID//NODE' || !Array.isArray(input.shots) || !Array.isArray(input.weights)) throw new Error('BACKUP_FORMAT_NOT_RECOGNIZED');
  const shots = input.shots.map((record, index) => {
    if (!record || typeof record !== 'object') throw new Error(`BACKUP_SHOT_${index + 1}_INVALID`);
    const medication = normalizeMedicationId(record.medicationId || record.med);
    const dose = Number(record.dose);
    const optionalWeight = record.wt == null || record.wt === '' ? null : Number(record.wt);
    if (!validBackupDate(record.date) || !medication || !Number.isFinite(dose) || dose <= 0 || (optionalWeight !== null && (!Number.isFinite(optionalWeight) || optionalWeight <= 0))) throw new Error(`BACKUP_SHOT_${index + 1}_INVALID`);
    return normalizeShotRecord({ ...record, id: record.id || createId('shot'), med: medication, dose, ...(optionalWeight === null ? {} : { wt: optionalWeight }) });
  });
  const validShotIds = new Set([...getAllShots(), ...shots].map(record => String(record?.id || '')).filter(Boolean));
  const weights = input.weights.map((record, index) => {
    if (!record || typeof record !== 'object') throw new Error(`BACKUP_WEIGHT_${index + 1}_INVALID`);
    const weight = Number(record.weight);
    if (!validBackupDate(record.date) || !Number.isFinite(weight) || weight <= 0 || (record.shotId && !validShotIds.has(String(record.shotId)))) throw new Error(`BACKUP_WEIGHT_${index + 1}_INVALID`);
    return { ...record, id: record.id || createId('weight'), weight };
  });
  const profile = input.profile && typeof input.profile === 'object' && !Array.isArray(input.profile) ? { ...input.profile } : input.profile;
  if (profile?.med) {
    const medication = normalizeMedicationId(profile.med);
    if (!medication) throw new Error('BACKUP_PROFILE_MEDICATION_INVALID');
    profile.med = medication;
  }
  for (const key of ['heightIn', 'htFt', 'htIn', 'startWt', 'goalWt']) {
    if (profile?.[key] == null || profile[key] === '') continue;
    const value = Number(profile[key]);
    if (!Number.isFinite(value) || value < 0 || ((key === 'heightIn' || key === 'htFt' || key === 'startWt' || key === 'goalWt') && value === 0)) throw new Error(`BACKUP_PROFILE_${key.toUpperCase()}_INVALID`);
  }
  return { ...input, shots, weights, ...(profile ? { profile } : {}) };
}
export function handleBackupImportFile(event) {
  const file = event.target.files?.[0]; if (!file) return;
  moduleState.pendingBackup = null;
  closeImportDialog();
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = normalizeBackupPayload(JSON.parse(String(reader.result || '{}')));
      moduleState.pendingBackup = backup; moduleState.pendingImportMeta = { fileName: file.name, format: 'GRID//NODE Backup' };
      setText('csvImportTitle', tx('backup.previewTitle', 'GRID//NODE BACKUP PREVIEW')); setText('csvImportFormat', tx('backup.detectedFormat', 'DETECTED FORMAT // GRID//NODE BACKUP · {file}', { file: file.name })); setText('csvImportSummary', tx('backup.summary', '{shots} shots · {weights} weights · {measurements} measurements. Review before commit.', { shots: backup.shots.length, weights: backup.weights.length, measurements: (backup.measurements || []).length }));
      const confirm = $('csvImportConfirmBtn'); if (confirm) { confirm.disabled = false; confirm.textContent = tx('backup.restoreButton', 'RESTORE BACKUP'); confirm.setAttribute('onclick', 'confirmBackupImport()'); }
      $('csvImportOverlay')?.classList.add('active');
    } catch (error) { actionFeedback(tx('backup.notOpened', 'BACKUP NOT OPENED'), error.message === 'BACKUP_FORMAT_NOT_RECOGNIZED' ? tx('backup.notBackup', 'THIS FILE IS NOT A GRID//NODE BACKUP') : tx('backup.couldNotRead', 'THE SELECTED BACKUP COULD NOT BE READ'), true); }
  };
  reader.onerror = () => actionFeedback(tx('backup.notOpened', 'BACKUP NOT OPENED'), tx('backup.couldNotRead', 'THE SELECTED BACKUP COULD NOT BE READ'), true);
  reader.readAsText(file); event.target.value = '';
}
export function confirmBackupImport() {
  if (!moduleState.pendingBackup) return;
  let backup;
  try { backup = normalizeBackupPayload(moduleState.pendingBackup); }
  catch (_) {
    moduleState.pendingBackup = null;
    actionFeedback(tx('backup.notOpened', 'BACKUP NOT OPENED'), tx('backup.couldNotRead', 'THE SELECTED BACKUP COULD NOT BE READ'), true);
    return;
  }
  const ops = [];
  const merge = (key, incoming) => { if (Array.isArray(incoming)) ops.push({ key, value: mergeImportRecords(S.get(key, []), incoming) }); };
  merge('shots', backup.shots); merge('weights', backup.weights); merge('measurements', backup.measurements); merge('results', backup.results); merge('notes', backup.notes); merge('symptoms', backup.symptoms); merge('labs', backup.labs); merge('arsenal', backup.arsenal); merge('researchRecords', backup.researchRecords); merge('devices', backup.devices); merge('inventory', backup.inventory); merge('loadouts', backup.loadouts); merge('eventLedger', backup.eventLedger);
  if (backup.profile && typeof backup.profile === 'object') ops.push({ key: 'profile', value: { ...getProfile(), ...backup.profile } });
  if (backup.preferences && typeof backup.preferences === 'object') ops.push({ key: 'preferences', value: { ...S.get('preferences', {}), ...backup.preferences } });
  if (backup.settings && typeof backup.settings === 'object') ops.push({ key: 'settings', value: { ...S.get('settings', {}), ...backup.settings } });
  if (backup.selectedLocation) ops.push({ key: 'selectedLocation', value: backup.selectedLocation });
  if (!S.multiWrite(ops)) { actionFeedback(tx('backup.importRolledBack', 'IMPORT ROLLED BACK'), tx('backup.storageRejectedTransaction', 'LOCAL STORAGE DID NOT ACCEPT THE COMPLETE TRANSACTION'), true); return; }
  appendEventLedger({ type: 'IMPORT', label: 'GRID//NODE BACKUP RESTORED', source: 'GRID//NODE Backup', state: 'Needs Review' }); queueCloudSync('workspace'); const count = (backup.shots?.length || 0) + (backup.weights?.length || 0); cancelCSVImport(); refreshAll(); actionFeedback(tx('backup.restored', 'BACKUP RESTORED'), tx('backup.restoredDetail', '{count} RECORD{plural} REVIEWED // LOCAL HISTORY UPDATED', { count, plural: count === 1 ? '' : 'S' }));
}
export function cancelCSVImport() { moduleState.pendingImport = null; moduleState.pendingImportMeta = null; moduleState.pendingBackup = null; const rowsHost = $('csvImportRows'); if (rowsHost) rowsHost.innerHTML = ''; const confirm = $('csvImportConfirmBtn'); if (confirm) { confirm.setAttribute('onclick', 'confirmCSVImport()'); confirm.textContent = tx('backup.importButton', 'IMPORT TO SHOTS HISTORY'); } setText('csvImportTitle', tx('backup.csvPreviewTitle', 'CSV IMPORT PREVIEW')); setText('csvImportFormat', tx('backup.csvReviewCopy', 'Review detected user-entered protocol records before appending them to SHOTS HISTORY.')); $('csvImportOverlay')?.classList.remove('active'); }
export function confirmCSVImport() {
  const pending = moduleState.pendingImport || [];
  const forced = new Set(pending.map((item, index) => item && item.forced ? index : -1).filter(index => index >= 0));
  const rechecked = classifyCSVRows(pending.map(item => item.row || item), getAllShots(), getWeights());
  const additions = rechecked.rows.filter((item, index) => item.status === 'new' || forced.has(index)).map(item => item.row);
  if (!additions.length) { actionFeedback(tx('backup.noNewRecords', 'NO NEW RECORDS'), tx('backup.historyUnchanged', 'EXISTING HISTORY WAS NOT CHANGED')); cancelCSVImport(); return; }
  const meta = moduleState.pendingImportMeta || {};
  const recordState = meta.recordState === 'confirmed' ? 'confirmed' : 'review';
  const source = meta.source || 'csv';
  const beforeShots = getAllShots(), beforeWeights = getWeights();
  const shots = [...beforeShots], weights = [...beforeWeights];
  const importedAt = new Date().toISOString();
  const cloudQueue = [];
  const trackCloud = (kind, record) => { if (state.cloud) ensureCloudRecordId(record); cloudQueue.push({ kind, record }); return record; };
  additions.forEach(row => {
    const provenance = { importedAt, fileName: meta.fileName || 'CSV file' };
    if (row.record_type === 'weight') {
      if (!weights.some(weight => csvWeightKey(weight) === csvWeightKey(row))) weights.push(trackCloud('weight', { id: createId('weight'), date: row.date, weight: row.weight_lb, weightKg: row.weight_lb / 2.2046226218, unit: 'lb', notes: row.notes || null, source, state: recordState, createdAt: importedAt, modifiedAt: importedAt, importProvenance: provenance }));
    } else {
      const shotId = createId('shot');
      shots.push(trackCloud('shot', { id: shotId, date: row.date, med: normalizeMedicationId(row.medication), dose: row.dose_mg, site: row.location || '', wt: row.weight_lb || null, se: row.side_effects, notes: row.notes || null, archived: row.archived, createdAt: importedAt, modifiedAt: importedAt, source, state: recordState, importProvenance: provenance }));
      if (Number.isFinite(row.weight_lb) && row.weight_lb > 0 && !weights.some(weight => csvWeightKey(weight) === csvWeightKey(row))) weights.push(trackCloud('weight', { id: createId('weight'), shotId, date: row.date, weight: row.weight_lb, weightKg: row.weight_lb / 2.2046226218, unit: 'lb', notes: 'Logged with SHOT', source, state: recordState, createdAt: importedAt, modifiedAt: importedAt, importProvenance: provenance }));
    }
  });
  if (!S.multiWrite([{ key: 'shots', value: shots }, { key: 'weights', value: weights }])) {
    actionFeedback(tx('backup.importRolledBack', 'IMPORT ROLLED BACK'), tx('backup.storageRejectedTransaction', 'LOCAL STORAGE DID NOT ACCEPT THE COMPLETE TRANSACTION'), true);
    return;
  }
  if (recordState === 'confirmed') {
    appendEventLedger({ type: 'IMPORT', label: `${String(meta.format || 'IMPORT').toUpperCase()} SAVED`, source, state: 'Confirmed', recordCount: additions.length });
    cloudQueue.forEach(({ kind, record }) => queueCloudSync(kind, record));
  } else {
    appendEventLedger({ type: 'IMPORT', label: 'CSV IMPORT SAVED', source: source || 'CSV Import', state: 'Needs Review', recordCount: additions.length });
    queueCloudSync('workspace');
  }
  const count = additions.length; cancelCSVImport(); refreshAll(); actionFeedback(tx('backup.importSaved', 'IMPORT SAVED'), tx('backup.importSavedDetail', '{count} NEW RECORD{plural} // REVIEW STATE PRESERVED', { count, plural: count === 1 ? '' : 'S' }));
}
/* ── BRING YOUR HISTORY: Shotsy JSON import + shared preview ──
 * Shotsy JSON (.shotsyjson) is the primary import path: typed doses, unix
 * timestamps, kg weights. Everything is parsed client-side; the file never
 * leaves the device. Parsed rows feed the existing classifyCSVRows /
 * csvImportOverlay / confirmCSVImport pipeline with recordState 'confirmed'.
 */
const IMPORT_MAX_BYTES = 25 * 1024 * 1024;
const IMPORT_WARN_BYTES = 5 * 1024 * 1024;

function isShotsyJSONPayload(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.days));
}

function shotsyUnixToLocalISO(unixSeconds, timeZone) {
  const millis = Number(unixSeconds) * 1000;
  if (!Number.isFinite(millis)) return '';
  const at = new Date(millis);
  const pad = n => String(n).padStart(2, '0');
  try {
    const parts = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).forEach(part => { parts[part.type] = part.value; });
    if (!parts.year || !parts.month || !parts.day) throw new Error('BAD_PARTS');
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour || '12'}:${parts.minute || '00'}`;
  } catch (_) {
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
  }
}

export function parseShotsyJSON(text) {
  const skipped = [];
  const notImported = [];
  const rows = [];
  let payload;
  try { payload = JSON.parse(String(text || '')); }
  catch (_) { return { ok: false, error: 'NOT_JSON', rows, skipped, notImported }; }
  if (!isShotsyJSONPayload(payload)) return { ok: false, error: 'NOT_SHOTSY', rows, skipped, notImported };
  const timeZone = typeof payload._shotsyExportTimeZone === 'string' ? payload._shotsyExportTimeZone : '';
  let colorNoted = false;
  (payload.days || []).forEach((dayEntry, dayIndex) => {
    if (!dayEntry || typeof dayEntry !== 'object') { skipped.push({ reason: 'bad-day', detail: `#${dayIndex + 1}` }); return; }
    const dayKeys = Object.keys(dayEntry);
    if (!dayKeys.length) return;
    const day = dayEntry[dayKeys[0]];
    if (!day || typeof day !== 'object') { skipped.push({ reason: 'bad-day', detail: `#${dayIndex + 1}` }); return; }
    const localDate = typeof day._shotsyLocalDate === 'string' ? day._shotsyLocalDate : '';
    (Array.isArray(day.shots) ? day.shots : []).forEach(shot => {
      if (!shot || typeof shot !== 'object') { skipped.push({ reason: 'bad-shot', detail: localDate || `#${dayIndex + 1}` }); return; }
      const medName = String(shot.medicationName || '').trim();
      if (shot.taken === false) { skipped.push({ reason: 'untaken', detail: [medName, shot.dosageStrength, localDate].filter(value => value !== '' && value != null).join(' ') }); return; }
      const dose = Number(shot.dosageStrength);
      const extras = [];
      if (shot.deliveryMethod && shot.deliveryMethod !== 'injection') extras.push(`(${String(shot.deliveryMethod).trim()})`);
      const notes = [String(shot.notes || '').trim(), ...extras].filter(Boolean).join(' ');
      rows.push({
        record_type: 'shot',
        date: shotsyUnixToLocalISO(shot.timestamp, timeZone),
        medication: medName,
        dose_mg: Number.isFinite(dose) ? dose : null,
        location: String(shot.injectionSite || '').trim(),
        weight_lb: null,
        side_effects: Number(shot.painLevel) > 0 ? [`pain level ${shot.painLevel}/4`] : [],
        notes, archived: false
      });
      if (shot.dosageColor && !colorNoted) { colorNoted = true; notImported.push('dosage colors (display only)'); }
    });
    Object.keys(day).forEach(key => {
      if (key === 'shots' || key === '_shotsyLocalDate' || key.charAt(0) === '_') return;
      const metric = day[key];
      if (key.toLowerCase() === 'weight' && metric && typeof metric === 'object') {
        const kg = Number(metric.value);
        const isoDay = String(metric.date || '').slice(0, 10);
        if (Number.isFinite(kg) && kg > 0 && /^\d{4}-\d{2}-\d{2}$/.test(isoDay)) {
          rows.push({ record_type: 'weight', date: `${isoDay}T12:00`, medication: '', dose_mg: null, location: '', weight_lb: kg * 2.2046226218, side_effects: [], notes: '', archived: false });
        } else skipped.push({ reason: 'bad-weight', detail: localDate || key });
      } else if (metric != null && metric !== '') {
        notImported.push(`"${key}" metric`);
      }
    });
  });
  if (Array.isArray(payload.schedules) && payload.schedules.length) notImported.push(`${payload.schedules.length} dose schedules (planned doses)`);
  return { ok: true, rows, skipped, notImported: [...new Set(notImported)], meta: { timeZone, dayCount: payload.days.length } };
}

export function handleShotsyJSONFile(event) {
  const file = event.target.files?.[0]; if (!file) return;
  event.target.value = '';
  if (file.size > IMPORT_MAX_BYTES) { actionFeedback(tx('import.notOpened', 'IMPORT NOT OPENED'), tx('import.fileTooBig', 'THAT FILE IS TOO LARGE (25 MB MAX)'), true); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseShotsyJSON(String(reader.result || ''));
    if (!parsed.ok) {
      actionFeedback(tx('import.notOpened', 'IMPORT NOT OPENED'), parsed.error === 'NOT_JSON' ? tx('import.notJson', 'THAT FILE IS NOT VALID JSON') : tx('import.notShotsy', 'THIS IS NOT A SHOTSY EXPORT FILE'), true);
      return;
    }
    if (!parsed.rows.length) {
      actionFeedback(tx('import.notOpened', 'IMPORT NOT OPENED'), tx('import.noRows', 'NO SHOTS OR WEIGHTS FOUND IN THIS FILE'), true);
      return;
    }
    closeImportDialog();
    startImportPreview({
      fileName: file.name, format: 'Shotsy JSON', source: 'import-shotsy',
      rows: parsed.rows, skipped: parsed.skipped, notImported: parsed.notImported,
      recordState: 'confirmed', largeFile: file.size > IMPORT_WARN_BYTES
    });
  };
  reader.onerror = () => actionFeedback(tx('import.notOpened', 'IMPORT NOT OPENED'), tx('import.couldNotRead', 'THE SELECTED FILE COULD NOT BE READ'), true);
  reader.readAsText(file);
}

function startImportPreview({ fileName, format, source, rows, skipped = [], notImported = [], recordState = 'confirmed', largeFile = false }) {
  const classified = classifyCSVRows(rows, getAllShots(), getWeights());
  moduleState.pendingImport = classified.rows.map(item => ({ row: item.row, status: item.status, forced: false }));
  const counts = classified.counts;
  moduleState.pendingImportMeta = { fileName, format, source, recordState, skipped, notImported, ...counts };
  setText('csvImportTitle', tx('import.previewTitle', '{format} IMPORT PREVIEW', { format: String(format).toUpperCase() }));
  setText('csvImportFormat', tx('import.detectedFormat', 'DETECTED FORMAT // {format} · {file}', { format, file: fileName }) + (largeFile ? ` · ${tx('import.largeFile', 'LARGE FILE')}` : ''));
  const bits = [
    tx('import.countNew', '{n} new', { n: counts.newRecords }),
    tx('import.countDupes', '{n} duplicates', { n: counts.duplicates }),
    tx('import.countInvalid', '{n} invalid', { n: counts.invalid })
  ];
  if (skipped.length) bits.push(tx('import.countSkipped', '{n} skipped', { n: skipped.length }));
  setText('csvImportSummary', `${bits.join(' · ')}. ${tx('import.reviewCopy', 'Review before saving. Your file never leaves this device.')}`);
  renderImportPreviewRows();
  updateImportConfirmButton();
  $('csvImportOverlay')?.classList.add('active');
}

function importActionableCount() {
  return (moduleState.pendingImport || []).filter(item => item.status === 'new' || item.forced).length;
}

function updateImportConfirmButton() {
  const meta = moduleState.pendingImportMeta || {};
  const confirm = $('csvImportConfirmBtn');
  if (!confirm) return;
  const actionable = importActionableCount();
  confirm.disabled = actionable === 0;
  if (meta.recordState === 'confirmed') {
    confirm.textContent = actionable ? tx('import.confirmBtn', 'IMPORT {n} NEW RECORD{plural}', { n: actionable, plural: actionable === 1 ? '' : 'S' }) : tx('import.noNew', 'NO NEW RECORDS');
  } else {
    confirm.textContent = actionable ? `IMPORT ${actionable} NEW RECORD${actionable === 1 ? '' : 'S'}` : 'NO NEW RECORDS';
  }
}

export function toggleImportForce(index, checked) {
  const item = (moduleState.pendingImport || [])[Number(index)];
  if (!item || item.status !== 'duplicate') return;
  item.forced = Boolean(checked);
  updateImportConfirmButton();
}

function importRowSummary(row) {
  const date = String(row.date || '').slice(0, 16).replace('T', ' ') || '?';
  if (row.record_type === 'weight') {
    const w = Number(row.weight_lb);
    return `${date} · ${tx('import.weightLabel', 'weight')} ${Number.isFinite(w) ? w.toFixed(1) : '?'} lb`;
  }
  const dose = row.dose_mg != null && row.dose_mg !== '' ? ` ${row.dose_mg} mg` : '';
  return `${date} · ${row.medication || '?'}${dose}${row.location ? ` · ${row.location}` : ''}`;
}

function importSkipLabel(reason) {
  const labels = {
    untaken: tx('import.skipUntaken', 'Planned dose, not taken'),
    'bad-day': tx('import.skipBadDay', 'Unreadable day entry'),
    'bad-shot': tx('import.skipBadShot', 'Unreadable shot entry'),
    'bad-weight': tx('import.skipBadWeight', 'Unreadable weight entry')
  };
  return labels[reason] || reason;
}

function renderImportPreviewRows() {
  const host = $('csvImportRows');
  if (!host) return;
  const pending = moduleState.pendingImport || [];
  const meta = moduleState.pendingImportMeta || {};
  const groups = [
    { key: 'new', title: tx('import.groupNew', 'READY TO IMPORT'), badge: 'ok' },
    { key: 'duplicate', title: tx('import.groupDuplicates', 'ALREADY IN YOUR VAULT'), badge: 'dupe' },
    { key: 'invalid', title: tx('import.groupInvalid', 'CANNOT IMPORT'), badge: 'bad' }
  ];
  let html = '';
  groups.forEach(group => {
    const items = pending.map((item, index) => ({ ...item, index })).filter(item => item.status === group.key);
    if (!items.length) return;
    html += `<div class="csv-import-group"><div class="csv-import-group-title">${safeText(group.title)} · ${items.length}</div>`;
    items.forEach(item => {
      const force = item.status === 'duplicate'
        ? `<label class="csv-import-force"><input type="checkbox" ${item.forced ? 'checked' : ''} onchange="toggleImportForce(${item.index}, this.checked)"><span>${safeText(tx('import.forceInclude', 'Import anyway'))}</span></label>`
        : '';
      html += `<div class="csv-import-row"><span class="csv-import-badge ${group.badge}">${safeText(item.status === 'new' ? 'NEW' : item.status === 'duplicate' ? 'DUPE' : 'SKIP')}</span><span class="csv-import-row-main">${safeText(importRowSummary(item.row))}</span>${force}</div>`;
    });
    html += '</div>';
  });
  const skipped = meta.skipped || [];
  if (skipped.length) {
    html += `<div class="csv-import-group"><div class="csv-import-group-title">${safeText(tx('import.groupSkipped', 'SKIPPED'))} · ${skipped.length}</div>`;
    skipped.forEach(entry => { html += `<div class="csv-import-row"><span class="csv-import-badge bad">SKIP</span><span class="csv-import-row-main">${safeText(importSkipLabel(entry.reason))}${entry.detail ? ` · ${safeText(entry.detail)}` : ''}</span></div>`; });
    html += '</div>';
  }
  const notImported = meta.notImported || [];
  if (notImported.length) {
    html += `<div class="csv-import-group"><div class="csv-import-group-title">${safeText(tx('import.groupNotImported', 'NOT IMPORTED FROM THIS FILE'))}</div><div class="csv-import-notimported">${notImported.map(value => safeText(value)).join(' · ')}</div></div>`;
  }
  host.innerHTML = html;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean); if (lines.length < 2) return [];
  const parseLine = line => { const cells = []; let value = '', quoted = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { cells.push(value); value = ''; } else value += char; } cells.push(value); return cells; };
  const headers = parseLine(lines[0]).map(header => header.trim().toLowerCase());
  const aliases = { type: 'record_type', dose: 'dose_mg', weight: 'weight_lb', site: 'location', sideeffects: 'side_effects' };
  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseLine(line), raw = {};
    headers.forEach((header, index) => raw[aliases[header] || header] = (cells[index] || '').trim());
    return { rowIndex: rowIndex + 2, record_type: String(raw.record_type || '').toLowerCase(), date: normalizeImportDate(raw.date), medication: raw.medication || '', dose_mg: raw.dose_mg === '' ? null : Number(raw.dose_mg), location: raw.location || '', weight_lb: raw.weight_lb === '' ? null : Number(raw.weight_lb), side_effects: raw.side_effects ? raw.side_effects.split('|').map(value => value.trim()).filter(Boolean) : [], notes: raw.notes || '', archived: String(raw.archived).toLowerCase() === 'true' };
  });
}

function normalizeImportDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
    if (parsed.getFullYear() !== Number(year) || parsed.getMonth() !== Number(month) - 1 || parsed.getDate() !== Number(day)) return '';
    return `${raw}T12:00`;
  }
  return Number.isNaN(new Date(raw).getTime()) ? '' : raw;
}
function csvShotKey(record) { const medicationId = normalizeMedicationId(record.medication || record.med); return [record.date || '', medicationId, Number(record.dose_mg ?? record.dose).toFixed(4), record.location || record.site || ''].join('|').toLowerCase(); }
function csvWeightKey(record) { return [record.date || '', Number(record.weight_lb ?? record.weight).toFixed(4)].join('|').toLowerCase(); }
function classifyCSVRows(rows, shots, weights) {
  const shotKeys = new Set(shots.map(csvShotKey)), weightKeys = new Set(weights.map(csvWeightKey));
  const seenShots = new Set(), seenWeights = new Set();
  const classified = rows.map(row => {
    const validType = row.record_type === 'shot' || row.record_type === 'weight';
    const timestamp = new Date(row.date).getTime();
    const validDate = Boolean(row.date) && Number.isFinite(timestamp) && timestamp <= Date.now();
    const medicationId = normalizeMedicationId(row.medication);
    const validValue = row.record_type === 'shot' ? Number.isFinite(row.dose_mg) && row.dose_mg > 0 && Object.prototype.hasOwnProperty.call(MEDICATIONS, medicationId) : Number.isFinite(row.weight_lb) && row.weight_lb > 0;
    if (!validType || !validDate || !validValue) return { row, status: 'invalid' };
    const key = row.record_type === 'shot' ? csvShotKey(row) : csvWeightKey(row);
    const stored = row.record_type === 'shot' ? shotKeys : weightKeys;
    const seen = row.record_type === 'shot' ? seenShots : seenWeights;
    const duplicate = stored.has(key) || seen.has(key); seen.add(key);
    return { row, status: duplicate ? 'duplicate' : 'new' };
  });
  return { rows: classified, counts: { recognized: classified.filter(item => item.status !== 'invalid').length, duplicates: classified.filter(item => item.status === 'duplicate').length, newRecords: classified.filter(item => item.status === 'new').length, invalid: classified.filter(item => item.status === 'invalid').length } };
}

export function previewCSVImportForTesting(text, shots = [], weights = []) {
  return classifyCSVRows(parseCSV(text), shots, weights);
}

