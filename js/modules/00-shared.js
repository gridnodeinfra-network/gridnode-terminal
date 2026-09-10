/* GRID//NODE stable product modules
 * SHOTS, Phase Engine, RESULTS, LAB, NODE, VAULT, and navigation.
 */

import {
  APP_VERSION, GOOGLE_OAUTH_CLIENT_ID, CLOUD_CONFIG, state, SESSION_KEY, LOCAL_CLOUD_OWNER_KEY, LEGACY_ACCOUNT_KEYS, WORKSPACE_KEYS, jsonParse, notify, subscribe, safeText, createId, accountStorageKey, legacyStorageKeys, STORAGE_TRANSACTION_SUFFIX, transactionStorageKey, readStorageTransaction, recoverPendingStorageTransaction, logicalStorageValue, S, normalizeLegacyText, normalizeShotRecord, getProfile as coreGetProfile, getProfileForEvidence as coreGetProfileForEvidence, getShots, getAllShots, getWeights, readAccountValue, captureWorkspace, workspaceHasData, localWorkspaceMigrationAllowed, markLocalWorkspaceMigrated, restoreWorkspace, localSession, restoreLocalSession, activateSession, clearSession, withTimeout, cloudLoadPromise, cloudClientPromise, loadCloudLibrary, getCloudClient, getCloudSession, signInCloud, signUpCloud, resetPasswordCloud, updateCloudPassword, isCloudProviderEnabled, signInWithGoogle, signInWithGoogleIdToken, signOutCloud, cloudShotPayload, cloudWeightPayload, ensureCloudRecordId, planPermanentShotDelete, normalizeMedicationId, normalizeSideEffectId, parseLinkedShotCloudId, syncShot, syncWeight, syncProfile, workspacePayload, syncWorkspace, flushCloudDeletes, deleteCloudShot, hydrateCloudData, mergeRecords, mergeJsonRecords, syncPassFailed, syncInFlight, syncAllCloudData, queueCloudSync, enqueueSync, sessionLabel, deleteCloudAccount, migrateLegacyLocalData, repairStorageShapes, parseLocalDate, formatDate, formatDateTime, normalizeDateInput, todayISO, formatEditableDate, parseEditableDate, setHumanDateInput, readHumanDateInput, downloadFile
} from './gridnode-core.js';

export const getProfile = coreGetProfile;
export const getProfileForEvidence = coreGetProfileForEvidence;

const $ = id => document.getElementById(id);
const tx = (key, fallback, vars) => window.GN_I18N?.text?.(key, fallback, vars) || fallback;
const PHASE_I18N = Object.freeze({
  ONSET: { name: 'results.onset', support: 'phase.supportOnset', context: 'phase.contextOnset' },
  ACTIVE: { name: 'results.active', support: 'phase.supportActive', context: 'phase.contextActive' },
  'PEAK WINDOW': { name: 'results.peakWindow', support: 'phase.supportPeak', context: 'phase.contextPeak' },
  RESPONSE: { name: 'results.response', support: 'phase.supportResponse', context: 'phase.contextResponse' },
  DECAY: { name: 'results.decay', support: 'phase.supportDecay', context: 'phase.contextDecay' },
  BASELINE: { name: 'results.baseline', support: 'phase.supportBaseline', context: 'phase.contextBaseline' }
});
function localizedPhaseName(phase) {
  if (!phase) return '';
  const key = PHASE_I18N[phase.name]?.name;
  return key ? tx(key, phase.name) : phase.name;
}
function localizedPhaseSupport(phase) {
  if (!phase) return '';
  const key = PHASE_I18N[phase.name]?.support;
  return key ? tx(key, phase.support) : phase.support;
}
function localizedPhaseContext(phase) {
  if (!phase) return '';
  const key = PHASE_I18N[phase.name]?.context;
  return key ? tx(key, phase.context) : phase.context;
}
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
  shotFilters: { medication: '', site: '', range: 'all', query: '' },
  pendingFutureShot: false,
  pendingLocationDraft: false,
  shotDraft: null,
  pendingImport: null,
  pendingImportMeta: null,
  pendingBackup: null,
  meridiem: new Date().getHours() >= 12 ? 'PM' : 'AM',
  weightUnit: 'lb',
  weightRange: 'all',
  medRange: '1m',
  calendarDate: new Date(),
  selectedCalendarDay: null,
  shotPickerMonth: new Date(),
  shotPickerSelected: null,
  shotPickerOriginal: null,
  arsenalEditId: null,
  pendingArsenalId: null,
  inventoryEditId: null,
  researchEditId: null,
  deviceEditId: null,
  labTool: null,
  labOriginalSlots: new Map()
};

const ZONES = Object.freeze({
  core: [
    'Upper Left', 'Upper Right',
    'Middle Left', 'Middle Right',
    'Lower Left', 'Lower Right'
  ],
  lower: [
    'Left Thigh Upper', 'Right Thigh Upper',
    'Left Thigh Lower', 'Right Thigh Lower',
    'Left Thigh Outer', 'Right Thigh Outer'
  ],
  upper: [
    'Left Back Upper Arm Upper', 'Left Back Upper Arm Lower',
    'Right Back Upper Arm Upper', 'Right Back Upper Arm Lower'
  ]
});

const ZONE_IDS = Object.freeze({
  'Upper Left': 'zone.coreUpperLeft',
  'Upper Right': 'zone.coreUpperRight',
  'Middle Left': 'zone.coreMiddleLeft',
  'Middle Right': 'zone.coreMiddleRight',
  'Lower Left': 'zone.coreLowerLeft',
  'Lower Right': 'zone.coreLowerRight',
  'Left Thigh Upper': 'zone.legUpperLeft',
  'Right Thigh Upper': 'zone.legUpperRight',
  'Left Thigh Lower': 'zone.legLowerLeft',
  'Right Thigh Lower': 'zone.legLowerRight',
  'Left Thigh Outer': 'zone.legOuterLeft',
  'Right Thigh Outer': 'zone.legOuterRight',
  'Left Back Upper Arm Upper': 'zone.armUpperLeft',
  'Left Back Upper Arm Lower': 'zone.armLowerLeft',
  'Right Back Upper Arm Upper': 'zone.armUpperRight',
  'Right Back Upper Arm Lower': 'zone.armLowerRight'
});
const LEGACY_ZONE_IDS = Object.freeze({
  'Left Abdomen — Upper': 'zone.coreUpperLeft',
  'Right Abdomen — Upper': 'zone.coreUpperRight',
  'Left Abdomen — Lower': 'zone.coreLowerLeft',
  'Right Abdomen — Lower': 'zone.coreLowerRight'
});
const zoneLabel = function (stored) {
  if (!stored) return '';
  const legacyKey = LEGACY_ZONE_IDS[stored];
  if (legacyKey && String(document.documentElement.lang || 'en').toLowerCase().startsWith('en')) return stored;
  const key = ZONE_IDS[stored] || legacyKey;
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

function deviceStatusLabel(status) {
  const canonical = String(status || 'READY').toUpperCase();
  return tx(`vault.status${canonical.replace(/\s+/g, '')}`, canonical);
}

const DEVICE_TYPE_KEYS = Object.freeze({
  REUSABLE: 'vault.deviceTypeReusable',
  DISPOSABLE: 'vault.deviceTypeDisposable',
  AUTOINJECTOR: 'vault.deviceTypeAutoinjector',
  OTHER: 'vault.deviceTypeOther'
});
function normalizeDeviceType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['reusable', 'reusable pen', 'pluma reutilizable'].includes(normalized)) return 'REUSABLE';
  if (['disposable', 'disposable pen', 'pluma desechable'].includes(normalized)) return 'DISPOSABLE';
  if (['autoinjector', 'autoinyector'].includes(normalized)) return 'AUTOINJECTOR';
  return Object.prototype.hasOwnProperty.call(DEVICE_TYPE_KEYS, String(value || '').toUpperCase()) ? String(value).toUpperCase() : 'OTHER';
}
function deviceTypeLabel(type) {
  const canonical = normalizeDeviceType(type);
  const fallback = { REUSABLE: 'Reusable pen', DISPOSABLE: 'Disposable pen', AUTOINJECTOR: 'Autoinjector', OTHER: 'Other device' }[canonical];
  return tx(DEVICE_TYPE_KEYS[canonical], fallback);
}

function researchStateLabel(state) {
  const canonical = String(state || 'TRACKING').toUpperCase();
  const keys = { TRACKING: 'research.tracking', COMPLETED: 'research.completed', ARCHIVED: 'research.archived', 'RESEARCH NOTE ONLY': 'research.noteOnly' };
  return tx(keys[canonical] || 'research.tracking', canonical);
}

const RESEARCH_CATEGORY_KEYS = Object.freeze({
  'RECOVERY & REPAIR': 'lab.recoveryRepair',
  'METABOLIC & BODY COMPOSITION': 'lab.metabolic',
  'CELLULAR & MITOCHONDRIAL': 'lab.cellular',
  'IMMUNE & NEUROLOGICAL': 'lab.immune'
});
function normalizeResearchCategory(value) {
  const raw = String(value || '').trim();
  if (Object.values(RESEARCH_CATEGORY_KEYS).includes(raw)) return raw;
  const match = Object.entries(RESEARCH_CATEGORY_KEYS).find(([label, key]) => raw === label || raw === tx(key, label));
  return match?.[1] || raw || 'lab.customResearch';
}
function researchCategoryLabel(value) {
  const canonical = normalizeResearchCategory(value);
  const fallback = Object.entries(RESEARCH_CATEGORY_KEYS).find(([, key]) => key === canonical)?.[0] || tx('lab.customResearch', 'CUSTOM RESEARCH');
  return canonical.startsWith('lab.') ? tx(canonical, fallback) : canonical;
}

const INVENTORY_TYPE_KEYS = Object.freeze({
  VIAL: 'lab.typeVial',
  CARTRIDGE: 'lab.typeCartridge',
  DISPOSABLE_PEN: 'lab.typeDisposable',
  BOX_PACKAGE: 'lab.typeBox',
  SUPPLY: 'lab.typeSupply',
  CUSTOM: 'lab.typeCustom'
});
function normalizeInventoryType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const aliases = {
    vial: 'VIAL', frasco: 'VIAL',
    cartridge: 'CARTRIDGE', cartucho: 'CARTRIDGE',
    'disposable pen': 'DISPOSABLE_PEN', 'pluma desechable': 'DISPOSABLE_PEN',
    'box or package': 'BOX_PACKAGE', 'caja o paquete': 'BOX_PACKAGE',
    'general supply item': 'SUPPLY', 'artículo de suministro general': 'SUPPLY',
    'custom item': 'CUSTOM', 'artículo personalizado': 'CUSTOM'
  };
  const canonical = String(value || '').toUpperCase();
  return Object.prototype.hasOwnProperty.call(INVENTORY_TYPE_KEYS, canonical) ? canonical : aliases[normalized] || 'CUSTOM';
}
function inventoryTypeLabel(type) {
  const canonical = normalizeInventoryType(type);
  const fallback = { VIAL: 'Vial', CARTRIDGE: 'Cartridge', DISPOSABLE_PEN: 'Disposable pen', BOX_PACKAGE: 'Box or package', SUPPLY: 'General supply item', CUSTOM: 'Custom item' }[canonical];
  return tx(INVENTORY_TYPE_KEYS[canonical], fallback);
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


function medicationLabel(value) {
  const id = normalizeMedicationId(value);
  return id ? MEDICATIONS[id] : tx('shots.invalidMedication', 'Unknown medication');
}

window.GN_MEDICATION_IDENTITY = Object.freeze({
  ids: Object.freeze(Object.keys(MEDICATIONS)),
  normalize: normalizeMedicationId,
  label: medicationLabel
});

const SIDE_EFFECT_KEYS = Object.freeze({
  nausea: 'shot.nausea', fatigue: 'shot.fatigue', headache: 'shot.headache',
  diarrhea: 'shot.diarrhea', constipation: 'shot.constipation', vomiting: 'shot.vomiting',
  insomnia: 'shot.insomnia', bloating: 'shot.bloating', reflux: 'shot.reflux', dizziness: 'shot.dizziness'
});
function sideEffectLabel(value) {
  const canonical = normalizeSideEffectId(value);
  return SIDE_EFFECT_KEYS[canonical] ? tx(SIDE_EFFECT_KEYS[canonical], canonical) : canonical;
}

const PHASES = [
  { name: 'ONSET', support: 'Early cycle after the latest logged SHOT. New observations begin shaping this signal.', context: 'Early cycle after the latest logged SHOT. Your own appetite, energy, symptoms, and notes may begin shaping this signal.', color: '#00d4ff', start: 0, end: 0.08 },
  { name: 'ACTIVE', support: 'Estimated active-cycle window. Compare this point with your own earlier logged cycles.', context: 'Estimated active-cycle window. Compare this point with your own earlier logged observations.', color: '#00ff88', start: 0.08, end: 0.28 },
  { name: 'PEAK WINDOW', support: 'Estimated highest relative level in this cycle. This is not a laboratory measurement.', context: 'Estimated highest relative level in this cycle. Individual response varies; this is not a laboratory measurement.', color: '#ffd700', start: 0.28, end: 0.52 },
  { name: 'RESPONSE', support: 'A middle-cycle estimate built from timing and user-entered history.', context: 'A middle-cycle estimate built from timing and user-entered history.', color: '#ff8c00', start: 0.52, end: 0.76 },
  { name: 'DECAY', support: 'Estimated level is declining toward the next expected event. Individual response varies.', context: 'Estimated level is declining toward the next expected event. Watch your own logged patterns; individual response varies.', color: '#FF5B5B', start: 0.76, end: 0.94 },
  { name: 'BASELINE', support: 'Late-cycle estimate before the next expected event. Keep logging your own patterns.', context: 'Late-cycle estimate before the next expected event. Keep logging your own patterns.', color: '#9898b0', start: 0.94, end: 1 }
];

const RESEARCH_LIBRARY = Object.freeze([
  { category: 'RECOVERY & REPAIR', names: ['BPC-157', 'TB-500', 'Thymosin Beta-4', 'GHK-Cu', 'KPV'], context: 'RESEARCH-FOCUSED RECORDS · REGULATORY STATUS IS NOT VERIFIED HERE.' },
  { category: 'METABOLIC & BODY COMPOSITION', names: ['CJC-1295', 'Ipamorelin', 'Sermorelin', 'Tesamorelin', 'MOTS-c'], context: 'MIXED CONTEXT · SOME ENTRIES MAY HAVE SPECIFIC FDA-APPROVED INDICATIONS; OTHERS ARE RESEARCH-FOCUSED. VERIFY EACH ENTRY INDEPENDENTLY.' },
  { category: 'CELLULAR & MITOCHONDRIAL', names: ['SS-31', 'Elamipretide'], context: 'RESEARCH-FOCUSED RECORDS · REGULATORY STATUS IS NOT VERIFIED HERE.' },
  { category: 'IMMUNE & NEUROLOGICAL', names: ['Thymosin Alpha-1', 'Semax', 'Selank', 'Epitalon'], context: 'RESEARCH-FOCUSED RECORDS · REGULATORY STATUS IS NOT VERIFIED HERE.' }
]);

const DEVICE_STATUSES = Object.freeze(['READY', 'EMPTY', 'NEEDS CHECKING', 'FAILED', 'RETIRED', 'LOST']);
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
function deviceLabel(id) { return S.get('devices', []).find(device => device.id === id)?.name || ''; }

function showToast(message, isError = false, undoCallback = null, detail = '') {
  const toast = $('toastEl');
  if (!toast) return;
  const prefix = isError ? '// SYSTEM CHECK — ' : 'NODE CONFIRMED — ';
  const displayMessage = /Shot (?:logged|updated)/.test(String(message))
    ? formatToastLocation(String(message))
    : String(message);
  if (undoCallback) {
    toast.innerHTML = '<div class="gn-toast-body"><span class="gn-toast-check" aria-hidden="true">✓</span><div class="gn-toast-main"><div class="gn-toast-title">' + safeText(displayMessage) + '</div>' + (detail ? '<div class="gn-toast-detail">' + safeText(detail) + '</div>' : '') + '</div><button type="button" class="gn-toast-undo">' + safeText(tx('toast.undo', 'UNDO')) + '</button></div><div class="gn-toast-bar" aria-hidden="true"></div>';
    toast.className = 'toast active undoable';
    clearTimeout(toast._timer);
    const doUndo = () => { clearTimeout(toast._timer); toast.classList.remove('active'); if (typeof undoCallback === 'function') undoCallback(); };
    const btn = toast.querySelector('.gn-toast-undo');
    if (btn) btn.addEventListener('click', doUndo);
    toast._timer = setTimeout(() => toast.classList.remove('active'), 5000);
    return;
  }
  toast.innerHTML = `<span class="gn-toast-message">${safeText(`${prefix}${displayMessage}`)}</span>`;
  toast.className = `toast active${isError ? ' err' : ''}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('active'), 2000);
}

function undoShot(id) {
  const all = getAllShots();
  const record = all.find(item => item.id === id);
  if (!record) return;
  const now = new Date().toISOString();
  record.archived = true;
  record.archivedAt = now;
  const weights = getWeights() || [];
  const linkedWeights = weights.filter(weight => weight.shotId === id);
  record.undoSnapshot = { linkedWeights: linkedWeights.map(weight => ({ ...weight })) };
  const ops = [{ key: 'shots', value: all }];
  if (linkedWeights.length) ops.push({ key: 'weights', value: weights.filter(weight => weight.shotId !== id) });
  let inventoryChanged = false;
  if (record.inventoryDeduction?.itemId && Number(record.inventoryDeduction.amount) > 0) {
    const inventory = S.get('inventory', []);
    const item = inventory.find(candidate => candidate.id === record.inventoryDeduction.itemId);
    if (item) {
      const reversed = { ...record.inventoryDeduction, reversedAt: now };
      item.quantity = Number(item.quantity || 0) + Number(record.inventoryDeduction.amount);
      item.modifiedAt = now;
      item.history = [...(item.history || []), { at: now, action: 'AUTO-DEDUCTION REVERSED FOR SHOT UNDO', source: 'System Generated', shotId: record.id }];
      record.inventoryDeductionReversed = reversed;
      delete record.inventoryDeduction;
      ops[0] = { key: 'shots', value: all };
      ops.push({ key: 'inventory', value: inventory });
      inventoryChanged = true;
    }
  }
  let queuedCloudDelete = false;
  const pending = S.get('cloudDeletes', []);
  linkedWeights.forEach(weight => {
    if (weight.cloudId && !pending.some(item => item.table === 'weights' && item.id === weight.cloudId)) {
      pending.push({ table: 'weights', id: weight.cloudId });
      queuedCloudDelete = true;
    }
  });
  if (queuedCloudDelete) ops.push({ key: 'cloudDeletes', value: pending });
  if (!S.multiWrite(ops)) { showToast(tx('shots.undoStorageError', 'Could not undo — storage unavailable.'), true); return; }
  if (queuedCloudDelete) flushCloudDeletes();
  queueCloudSync('shot', record);
  if (inventoryChanged) queueCloudSync('workspace');
  refreshAll();
  showToast(tx('shots.undone', 'SHOT undone.'));
}

function undoWeight(id) {
  const all = getWeights();
  const record = all.find(item => item.id === id);
  if (!record) return;
  const ops = [{ key: 'weights', value: all.filter(item => item.id !== id) }];
  let queuedCloudDelete = false;
  if (record.cloudId) {
    const pending = S.get('cloudDeletes', []);
    if (!pending.some(item => item.table === 'weights' && item.id === record.cloudId)) pending.push({ table: 'weights', id: record.cloudId });
    ops.push({ key: 'cloudDeletes', value: pending });
    queuedCloudDelete = true;
  }
  if (!S.multiWrite(ops)) { showToast(tx('weight.undoStorageError', 'Could not undo — storage unavailable.'), true); return; }
  if (queuedCloudDelete) flushCloudDeletes();
  refreshAll();
  showToast(tx('weight.undone', 'WEIGHT ENTRY undone.'));
}

function formatToastLocation(site) {
  const text = String(site || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const compact = text.replace(/\bLeft\b/g, 'L.').replace(/\bRight\b/g, 'R.').replace(/\s*[—–-]\s*/g, ' · ');
  if (compact.length <= 42) return compact;
  const words = compact.split(' ');
  let result = '';
  for (const word of words) {
    const candidate = result ? `${result} ${word}` : word;
    if (candidate.length > 39) break;
    result = candidate;
  }
  return result || compact.slice(0, 39);
}

function celebrateMilestone(type, value) {
  const container = $('app') || document.body;
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let index = 0; index < 20; index += 1) {
      const particle = document.createElement('div');
      particle.className = 'gn-celebrate-particle';
      particle.style.setProperty('--x', `${Math.random() * 100}%`);
      particle.style.setProperty('--delay', `${Math.random() * 0.3}s`);
      particle.style.setProperty('--drift', `${(Math.random() - 0.5) * 100}px`);
      particle.style.setProperty('--size', `${4 + Math.random() * 8}px`);
      container.appendChild(particle);
      setTimeout(() => particle.remove(), 2500);
    }
  }
  showToast(type === 'goal' ? 'GOAL REACHED' : `${value} LBS DOWN`);
}

function weightMilestone(previousWeight, nextWeight, profile) {
  const start = Number(profile?.startWt);
  if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(nextWeight)) return null;
  const previousLoss = Number.isFinite(Number(previousWeight)) ? start - Number(previousWeight) : 0;
  const nextLoss = start - nextWeight;
  const goal = Number(profile?.goalWt);
  if (goal > 0 && nextWeight <= goal && (!Number.isFinite(Number(previousWeight)) || Number(previousWeight) > goal)) return { type: 'goal', value: null };
  const previousStep = Math.floor(Math.max(0, previousLoss) / 5);
  const nextStep = Math.floor(Math.max(0, nextLoss) / 5);
  if (nextStep > previousStep && nextStep > 0) return { type: 'weight', value: nextStep * 5 };
  return null;
}

const EVENT_LABEL_TOKENS = Object.freeze({
  'SHOT UPDATED': 'shot.updated', 'SHOT EVENT CONFIRMED': 'shot.confirmed',
  'INVENTORY UPDATED': 'inventory.updated', 'INVENTORY ITEM SAVED': 'inventory.saved',
  'INVENTORY ARCHIVED': 'inventory.archived', 'INVENTORY RESTORED': 'inventory.restored',
  'CALCULATOR REFERENCE SAVED': 'reference.saved',
  'RESEARCH RECORD UPDATED': 'research.updated', 'RESEARCH RECORD CAPTURED': 'research.captured',
  'RESEARCH RECORD ARCHIVED': 'research.archived', 'RESEARCH RECORD RESTORED': 'research.restored',
  'DEVICE IDENTITY UPDATED': 'device.updated', 'DEVICE IDENTITY REGISTERED': 'device.registered',
  'DEVICE RETIRED': 'device.retired', 'DEVICE RESTORED': 'device.restored',
  'GRID//NODE BACKUP RESTORED': 'backup.restored', 'CSV IMPORT SAVED': 'csv.saved',
  'RESULTS UPDATED': 'results.updated'
});
const EVENT_LABEL_KEYS = Object.freeze({
  'shot.updated': ['ledger.shotUpdated', 'SHOT UPDATED'], 'shot.confirmed': ['ledger.shotConfirmed', 'SHOT EVENT CONFIRMED'],
  'inventory.updated': ['ledger.inventoryUpdated', 'INVENTORY UPDATED'], 'inventory.saved': ['ledger.inventorySaved', 'INVENTORY ITEM SAVED'],
  'inventory.archived': ['ledger.inventoryArchived', 'INVENTORY ARCHIVED'], 'inventory.restored': ['ledger.inventoryRestored', 'INVENTORY RESTORED'],
  'reference.saved': ['ledger.referenceSaved', 'CALCULATOR REFERENCE SAVED'],
  'research.updated': ['ledger.researchUpdated', 'RESEARCH RECORD UPDATED'], 'research.captured': ['ledger.researchCaptured', 'RESEARCH RECORD CAPTURED'],
  'research.archived': ['ledger.researchArchived', 'RESEARCH RECORD ARCHIVED'], 'research.restored': ['ledger.researchRestored', 'RESEARCH RECORD RESTORED'],
  'device.updated': ['ledger.deviceUpdated', 'DEVICE IDENTITY UPDATED'], 'device.registered': ['ledger.deviceRegistered', 'DEVICE IDENTITY REGISTERED'],
  'device.retired': ['ledger.deviceRetired', 'DEVICE RETIRED'], 'device.restored': ['ledger.deviceRestored', 'DEVICE RESTORED'],
  'backup.restored': ['ledger.backupRestored', 'GRID//NODE BACKUP RESTORED'], 'csv.saved': ['ledger.csvSaved', 'CSV IMPORT SAVED'],
  'results.updated': ['ledger.resultsUpdated', 'RESULTS UPDATED']
});
const EVENT_SOURCE_TOKENS = Object.freeze({
  manual: 'manual', 'manual entry': 'manual', import: 'import', 'device reported': 'device', device: 'device',
  'system generated': 'system', system: 'system', 'grid//node backup': 'backup', backup: 'backup',
  'csv import': 'csv', csv_import_shotsy: 'csv', csv_import_glapp: 'csv'
});
const EVENT_STATE_TOKENS = Object.freeze({
  confirmed: 'confirmed', 'user confirmed': 'confirmed', review: 'review', 'needs review': 'review', corrected: 'corrected'
});

function eventLabelToken(value) {
  const raw = String(value || '').trim();
  return EVENT_LABEL_KEYS[raw] ? raw : EVENT_LABEL_TOKENS[raw.toUpperCase()] || 'event.generic';
}
function eventSourceToken(value) { return EVENT_SOURCE_TOKENS[String(value || 'manual').trim().toLowerCase()] || 'manual'; }
function eventStateToken(value) { return EVENT_STATE_TOKENS[String(value || 'confirmed').trim().toLowerCase()] || 'confirmed'; }
function eventLabelText(value) { const token = eventLabelToken(value); const entry = EVENT_LABEL_KEYS[token]; return entry ? tx(entry[0], entry[1]) : tx('ledger.eventGeneric', 'EVENT'); }
function eventSourceText(value) {
  const token = eventSourceToken(value);
  const entry = { manual: ['ledger.sourceManual', 'Manual Entry'], import: ['ledger.sourceImport', 'Import'], device: ['ledger.sourceDevice', 'Device Reported'], system: ['ledger.sourceSystem', 'System Generated'], backup: ['ledger.sourceBackup', 'GRID//NODE Backup'], csv: ['ledger.sourceCsv', 'CSV Import'] }[token];
  return tx(entry[0], entry[1]);
}
function eventStateText(value) {
  const token = eventStateToken(value);
  const entry = { confirmed: ['ledger.stateConfirmed', 'User Confirmed'], review: ['ledger.stateReview', 'Needs Review'], corrected: ['ledger.stateCorrected', 'Corrected'] }[token];
  return tx(entry[0], entry[1]);
}

function actionFeedback(title, detail, isError = false) {
  const toast = $('toastEl');
  if (!toast) return;
  const prefix = isError ? tx('toast.systemCheck', 'SYSTEM CHECK') : tx('toast.nodeConfirmed', 'NODE CONFIRMED');
  toast.innerHTML = `<span class="gn-toast-message">${safeText(`// ${prefix} — ${title}${detail ? ` · ${detail}` : ''}`)}</span>`;
  toast.className = `toast active${isError ? ' err' : ''}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('active'), 2000);
  /* v0.15.32 — premium vibration feedback. actionFeedback is only called
     from user-initiated success/error paths (Save / Scanner lock) and
     those paths already show a visible toast. Bypass the focus gate
     entirely via gnHaptics.fire() so the haptic actually lands even when
     focus is inside a form input. The focus gate is preserved for
     ambient calls (tap / mode / select) which fire from typing. */
  try {
    const live = window.gnHaptics || (typeof gnHaptics !== 'undefined' ? gnHaptics : null);
    if (live) { if (isError) live.fire([4, 30, 4, 30, 4]); else live.fire([8, 30, 12]); }
  } catch (_) {}
}

function nodeSyncLabel() {
  if (state.cloudStatus === 'CLOUD_SYNCED') return tx('runtime.cloudSynced', 'CLOUD SYNCED');
  if (state.cloudStatus === 'CLOUD_CONNECTED') return tx('runtime.syncing', 'SYNCING');
  if (state.cloudStatus === 'LOCAL_BACKUP') return tx('runtime.localBackup', 'LOCAL BACKUP');
  return tx('runtime.localMode', 'LOCAL MODE');
}

function nodeDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tx('runtime.notAvailable', 'NOT AVAILABLE');
  const locale = document.documentElement?.lang?.startsWith('es') ? 'es-419' : 'en-US';
  return [date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }), date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })].join(' · ');
}

function nodePhaseDay(lastShot) {
  if (!lastShot) return tx('runtime.awaitingFirstShot', 'AWAITING FIRST SHOT');
  const elapsedDays = Math.max(0, (Date.now() - new Date(lastShot.date).getTime()) / 86400000);
  if (!Number.isFinite(elapsedDays)) return tx('runtime.awaitingVerifiedTiming', 'AWAITING VERIFIED TIMING');
  const day = Math.floor(elapsedDays) + 1;
  return elapsedDays < 1
    ? tx('runtime.dayRecentEvent', 'DAY {day} · {event}', { day, event: tx('runtime.recentEvent', 'RECENT EVENT') })
    : tx('runtime.daySinceShot', 'DAY {day} · {days}d since SHOT', { day, days: Math.floor(elapsedDays) });
}

export function refreshNodeHeader({ phase } = {}) {
  const sync = nodeSyncLabel();
  const phaseLabel = localizedPhaseName(phase) || tx('runtime.awaitingFirstShot', 'AWAITING FIRST SHOT');
  setText('nodeHeaderPhase', phaseLabel);
  setText('nodeHeaderState', sync);
}

function appendEventLedger(event) {
  const ledger = S.get('eventLedger', []);
  ledger.push({
    id: createId('event'), createdAt: new Date().toISOString(), ...event,
    label: eventLabelToken(event.label || event.type),
    source: eventSourceToken(event.source),
    state: eventStateToken(event.state)
  });
  S.set('eventLedger', ledger.slice(-250));
  queueCloudSync('workspace');
}

function setPrivateShell(active) {
  document.body?.classList.toggle('gn-private-active', active);
  qa('.bottom-nav, .fab').forEach(control => {
    control.setAttribute('aria-hidden', active ? 'false' : 'true');
    if ('inert' in control) control.inert = !active;
  });
}

