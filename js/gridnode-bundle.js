/* GRID//NODE stable classic delivery bundle. Source remains modular in gridnode-core.js, js/modules/*.js, and gridnode-app.js. Phase 1 refactor: gridnode-modules.js split into js/modules/, no functional change. */

/* GRID//NODE stable core
 * asset-store refresh 20260910: force new content hash after poisoned upload.
 * State, local persistence, session handling, and optional Supabase sync.
 * No UI code belongs in this file.
 */

const APP_VERSION = (typeof window !== 'undefined' && window.GN_VERSION && window.GN_VERSION.semver) || '0.15.43';

const GOOGLE_OAUTH_CLIENT_ID = '305099332421-u752btn6p8cbaq8opapvdkfau9gnd9a3.apps.googleusercontent.com';

const CLOUD_CONFIG = Object.freeze({
  url: 'https://quwbmhxgteyykujydvii.supabase.co',
  anonKey: 'sb_publishable_rWPuL8wGfe2zok4cYNENng_L6n2Qttu'
});

/* Dose upper bound at the cloud boundary: 1000 mg = 100x the largest preset
 * pill (10 mg); rejects absurd/imported values like 100000 mg.
 * Rejection, never clamping. */
const MAX_DOSE_MG = 1000;
function isDoseInRange(dose) { const value = Number(dose); return Number.isFinite(value) && value > 0 && value <= MAX_DOSE_MG; }

const state = {
  session: null,
  accountKey: 'local',
  cloud: false,
  cloudClient: null,
  cloudStatus: 'LOCAL_ONLY',
  sessionGeneration: 0,
  listeners: new Set()
};

/* Session stamp (data-integrity audit 2026-10-14, defect 3): every async
 * cloud operation captures { userId, accountKey, generation } at entry and
 * rechecks it after every await. Account-id equality alone cannot tell
 * A → sign out → A apart; the monotonically increasing generation can.
 * activateSession/clearSession bump the generation, so any continuation
 * from a dead session instance fails the check and must touch nothing:
 * no local writes, no queue mutations, no readiness or status changes. */
function sessionStamp() {
  return {
    userId: state.cloud && state.session?.user?.id ? String(state.session.user.id) : '',
    accountKey: state.accountKey,
    generation: state.sessionGeneration
  };
}

function sessionStampIntact(stamp) {
  if (!stamp) return false;
  if (state.accountKey !== stamp.accountKey) return false;
  if (state.sessionGeneration !== stamp.generation) return false;
  if (stamp.userId) return Boolean(state.cloud && state.session?.user?.id && String(state.session.user.id) === stamp.userId);
  return true;
}

/* Result of the most recent hydration attempt, stamped with the session
 * generation that ran it. cloudUploadsReady() requires a successful
 * hydration for the CURRENT generation — a stale 'ok' string left over
 * from a previous session can never authorize uploads on its own. */
let lastHydration = null;

function cloudUploadsReady() {
  if (!state.cloud) return false;
  if (typeof state.cloudHydration === 'string' && state.cloudHydration !== 'ok') return false;
  if (lastHydration) return lastHydration.ok && sessionStampIntact(lastHydration.stamp);
  return typeof state.cloudHydration !== 'string' || state.cloudHydration === 'ok';
}

const SESSION_KEY = 'gn_session_v2';
const LOCAL_CLOUD_OWNER_KEY = 'gn_local_cloud_owner_v1';
const LEGACY_ACCOUNT_KEYS = ['0', 'local'];
const WORKSPACE_KEYS = ['profile', 'shots', 'weights', 'measurements', 'results', 'notes', 'symptoms', 'labs', 'labTests', 'preferences', 'settings', 'arsenal', 'researchRecords', 'devices', 'inventory', 'loadouts', 'eventLedger', 'importQueue', 'selectedLocation', 'cloudDeletes'];

function jsonParse(raw, fallback) {
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function notify() {
  state.listeners.forEach(listener => {
    try { listener(state); } catch (error) { console.warn('[GRID//NODE state listener]', error); }
  });
}

function subscribe(listener) {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

function safeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createId(prefix = 'record') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function accountStorageKey(key) {
  return `gn_${state.accountKey}_${key}`;
}

function legacyStorageKeys(key) {
  if (state.accountKey !== 'local') return [];
  return LEGACY_ACCOUNT_KEYS
    .filter(accountKey => accountKey !== state.accountKey)
    .map(accountKey => `gn_${accountKey}_${key}`);
}

const STORAGE_TRANSACTION_SUFFIX = '__storage_tx_v1';

function transactionStorageKey() {
  return `gn_${state.accountKey}_${STORAGE_TRANSACTION_SUFFIX}`;
}

function readStorageTransaction() {
  try {
    const journal = jsonParse(localStorage.getItem(transactionStorageKey()), null);
    return journal && Array.isArray(journal.snapshot) ? journal : null;
  } catch (error) {
    console.warn('[GRID//NODE storage.transaction.read]', error);
    return null;
  }
}

function recoverPendingStorageTransaction() {
  const journal = readStorageTransaction();
  if (!journal) return { recovered: true, journal: null };
  let recovered = true;
  for (const entry of journal.snapshot) {
    try {
      if (entry.existed) localStorage.setItem(entry.storageKey, entry.prior);
      else localStorage.removeItem(entry.storageKey);
    } catch (error) {
      recovered = false;
      console.warn('[GRID//NODE storage.transaction.recover]', entry.storageKey, error);
    }
  }
  if (recovered) {
    try { localStorage.removeItem(transactionStorageKey()); }
    catch (error) {
      recovered = false;
      console.warn('[GRID//NODE storage.transaction.clear]', error);
    }
  }
  return { recovered, journal: recovered ? null : journal };
}

function logicalStorageValue(storageKey, journal) {
  const snapshot = journal?.snapshot?.find(entry => entry.storageKey === storageKey);
  if (snapshot) return snapshot.existed ? snapshot.prior : null;
  return localStorage.getItem(storageKey);
}

const S = Object.freeze({
  get(key, fallback = null) {
    const recovery = recoverPendingStorageTransaction();
    const candidates = [accountStorageKey(key), ...legacyStorageKeys(key)];
    for (const storageKey of candidates) {
      try {
        const value = jsonParse(logicalStorageValue(storageKey, recovery.journal), undefined);
        if (value !== undefined && value !== null) {
          if (Array.isArray(fallback)) return Array.isArray(value) ? value : fallback;
          if (fallback !== null && typeof fallback === 'object') return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
          return value;
        }
      } catch (error) {
        console.warn('[GRID//NODE storage.read]', storageKey, error);
      }
    }
    return fallback;
  },
  set(key, value) {
    if (!recoverPendingStorageTransaction().recovered) return false;
    try {
      localStorage.setItem(accountStorageKey(key), JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('[GRID//NODE storage.write]', key, error);
      return false;
    }
  },
  /* Write-ahead journal: the old values are durable before target keys change.
     Deleting the journal is the commit point. If a write, rollback, or page
     lifecycle fails, reads remain on the snapshot until recovery completes. */
  multiWrite(ops) {
    if (!Array.isArray(ops) || ops.length === 0) return true;
    if (!recoverPendingStorageTransaction().recovered) return false;
    const prepared = [];
    const seen = new Set();
    for (const op of ops) {
      if (!op || typeof op.key !== 'string' || seen.has(op.key)) return false;
      seen.add(op.key);
      let raw;
      try { raw = JSON.stringify(op.value); } catch (error) {
        console.warn('[GRID//NODE storage.multiWrite.serialize]', op.key, error);
        return false;
      }
      prepared.push({ storageKey: accountStorageKey(op.key), raw });
    }
    const snapshot = [];
    let journalWritten = false;
    try {
      for (const entry of prepared) {
        const prior = localStorage.getItem(entry.storageKey);
        snapshot.push({ storageKey: entry.storageKey, existed: prior !== null, prior });
      }
      localStorage.setItem(transactionStorageKey(), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), snapshot }));
      journalWritten = true;
      for (const entry of prepared) localStorage.setItem(entry.storageKey, entry.raw);
      localStorage.removeItem(transactionStorageKey());
      return true;
    } catch (error) {
      console.warn('[GRID//NODE storage.multiWrite]', error);
      if (journalWritten) recoverPendingStorageTransaction();
      return false;
    }
  },
  remove(key) {
    if (!recoverPendingStorageTransaction().recovered) return false;
    try {
      localStorage.removeItem(accountStorageKey(key));
      return true;
    } catch (error) {
      console.warn('[GRID//NODE storage.remove]', key, error);
      return false;
    }
  },
  has(key) {
    const recovery = recoverPendingStorageTransaction();
    try { return logicalStorageValue(accountStorageKey(key), recovery.journal) !== null; } catch { return false; }
  }
});

const MEDICATION_ALIASES = Object.freeze({
  zepbound: 'zepbound_tirzepatide',
  'zepbound (tirzepatide)': 'zepbound_tirzepatide',
  mounjaro: 'mounjaro_tirzepatide',
  'mounjaro (tirzepatide)': 'mounjaro_tirzepatide',
  tirzepatide: 'tirzepatide_compound',
  'tirzepatide compound': 'tirzepatide_compound',
  'tirzepatide (compound)': 'tirzepatide_compound',
  wegovy: 'wegovy_semaglutide',
  'wegovy (semaglutide)': 'wegovy_semaglutide',
  ozempic: 'ozempic_semaglutide',
  'ozempic (semaglutide)': 'ozempic_semaglutide',
  semaglutide: 'semaglutide_compound',
  'semaglutide compound': 'semaglutide_compound',
  'semaglutide (compound)': 'semaglutide_compound',
  retatrutide: 'retatrutide',
  custom: 'custom_compound',
  'custom compound': 'custom_compound',
  'bpc-157': 'bpc157',
  bpc157: 'bpc157',
  bpc: 'bpc157',
  bepecin: 'bpc157',
  'tb-500': 'tb500',
  tb500: 'tb500',
  tb: 'tb500',
  'thymosin beta-4': 'thymosin_beta4',
  'thymosin beta 4': 'thymosin_beta4',
  'thymosin b4': 'thymosin_beta4',
  tbeta4: 'thymosin_beta4',
  tb4: 'thymosin_beta4',
  'thymosin alpha-1': 'thymosin_alpha1',
  'thymosin alpha 1': 'thymosin_alpha1',
  thymalfasin: 'thymosin_alpha1',
  zadaxin: 'thymosin_alpha1',
  'cjc-1295': 'cjc1295_dac',
  'cjc1295': 'cjc1295_dac',
  'cjc-1295 dac': 'cjc1295_dac',
  'cjc1295 dac': 'cjc1295_dac',
  'cjc-1295 no dac': 'cjc1295_nodac',
  'cjc1295 no dac': 'cjc1295_nodac',
  'cjc-1295 without dac': 'cjc1295_nodac',
  'mod grf': 'cjc1295_nodac',
  'mod grf 1-29': 'cjc1295_nodac',
  'mod-grf': 'cjc1295_nodac',
  'modified grf 1-29': 'cjc1295_nodac',
  'grf 1-29': 'cjc1295_nodac',
  ipamorelin: 'ipamorelin',
  sermorelin: 'sermorelin',
  'grf(1-29)': 'sermorelin',
  tesamorelin: 'tesamorelin',
  egrifta: 'tesamorelin',
  semax: 'semax',
  selank: 'selank',
  'ghk-cu': 'ghk_cu_topical',
  'ghk cu': 'ghk_cu_topical',
  'copper tripeptide': 'ghk_cu_topical',
  'ghk-cu topical': 'ghk_cu_topical',
  'ghk-cu injectable': 'ghk_cu_injectable',
  'ghk-cu injection': 'ghk_cu_injectable',
  epitalon: 'epitalon',
  epithalon: 'epitalon',
  'mots-c': 'mots_c',
  'mots c': 'mots_c',
  mots: 'mots_c',
  kpv: 'kpv',
  elamipretide: 'elamipretide_ss31',
  'ss-31': 'elamipretide_ss31',
  ss31: 'elamipretide_ss31',
  bendavia: 'elamipretide_ss31',
  forzinity: 'elamipretide_ss31'
});

const CANONICAL_MEDICATION_IDS = Object.freeze([...new Set(Object.values(MEDICATION_ALIASES))]);

function normalizeMedicationId(value) {
  const raw = String(value || '').trim();
  if (CANONICAL_MEDICATION_IDS.includes(raw)) return raw;
  return MEDICATION_ALIASES[raw.toLowerCase()] || '';
}

const CANONICAL_SIDE_EFFECT_IDS = Object.freeze(['nausea', 'fatigue', 'headache', 'diarrhea', 'constipation', 'vomiting', 'insomnia', 'bloating', 'reflux', 'dizziness']);

function normalizeSideEffectId(value) {
  const raw = String(value || '').trim();
  const canonical = raw.toLowerCase();
  return CANONICAL_SIDE_EFFECT_IDS.includes(canonical) ? canonical : raw;
}

function normalizeLegacyText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\u00e2\u20ac\u201d/g, '\u2014')
    .replace(/\u00e2\u20ac\u201c/g, '\u2013')
    .replace(/\u00c2\u00b7/g, '\u00b7')
    .replace(/\u00e2\u2020\u2019/g, '\u2192');
}

function normalizeShotRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const legacyMedication = normalizeLegacyText(record.medicationId || record.med);
  const medicationId = normalizeMedicationId(legacyMedication);
  return {
    ...record,
    med: medicationId || legacyMedication,
    site: normalizeLegacyText(record.site),
    notes: normalizeLegacyText(record.notes),
    se: Array.isArray(record.se) ? record.se.map(normalizeSideEffectId).filter(Boolean) : [],
    ...(medicationId ? {} : { legacyMedication })
  };
}

function getProfile() { return S.get('profile', {}); }
function getProfileForEvidence() { return getProfile(); }
function getShots() { return S.get('shots', []).filter(record => !record.archived).map(normalizeShotRecord); }
function getAllShots() { return S.get('shots', []).map(normalizeShotRecord); }
function getWeights() { return S.get('weights', []); }

/* ── ASSAY: third-party lab test log (one record per tested batch) ── */
const LAB_TEST_METHODS = Object.freeze(['hplc', 'ms', 'hplc_ms', 'coa', 'other']);
const LAB_TEST_ENDOTOXIN = Object.freeze(['pass', 'fail', 'untested']);

function normalizeLabTest(record) {
  if (!record || typeof record !== 'object') return null;
  /* Blank stays unknown (audit 2026-10-14, defect 4): Number(null) and
   * Number('') are both 0, which fabricated measurements out of blanks.
   * Null/undefined/blank-string preserve as null; explicit 0 stays 0. */
  const num = value => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const method = LAB_TEST_METHODS.includes(record.method) ? record.method : null;
  const endotoxin = LAB_TEST_ENDOTOXIN.includes(record.endotoxin) ? record.endotoxin : 'untested';
  return {
    id: String(record.id || createId('labtest')),
    peptide: normalizeMedicationId(record.peptide) || String(record.peptide || ''),
    vendor: normalizeLegacyText(record.vendor),
    batch: normalizeLegacyText(record.batch),
    testDate: String(record.testDate || ''),
    lab: normalizeLegacyText(record.lab),
    method,
    purityPct: num(record.purityPct),
    labelClaimMg: num(record.labelClaimMg),
    measuredMg: num(record.measuredMg),
    endotoxin,
    notes: normalizeLegacyText(record.notes),
    archived: Boolean(record.archived),
    archivedAt: record.archivedAt || null,
    createdAt: record.createdAt || null,
    modifiedAt: record.modifiedAt || null
  };
}

function getLabTests() { return S.get('labTests', []).filter(record => !record.archived).map(normalizeLabTest).filter(Boolean); }
function getAllLabTests() { return S.get('labTests', []).map(normalizeLabTest).filter(Boolean); }
function setLabTests(list) { return S.set('labTests', Array.isArray(list) ? list : []); }

/* Derived variance: (measured − claim) / claim, as a fraction. Null when inputs are missing. */
function labTestVariance(record) {
  const m = record?.measuredMg;
  const c = record?.labelClaimMg;
  if (m == null || m === '' || c == null || c === '') return null;
  const measured = Number(m);
  const claim = Number(c);
  if (!Number.isFinite(measured) || !Number.isFinite(claim) || claim <= 0) return null;
  return (measured - claim) / claim;
}

/* Variance band: green within ±5%, amber within ±10%, red beyond. */
function labTestVarianceBand(fraction) {
  if (!Number.isFinite(fraction)) return null;
  const abs = Math.abs(fraction);
  if (abs <= 0.05) return 'green';
  if (abs <= 0.10) return 'amber';
  return 'red';
}

function readAccountValue(accountKey, key, fallback) {
  try { return jsonParse(localStorage.getItem(`gn_${accountKey}_${key}`), fallback); } catch { return fallback; }
}

function captureWorkspace(accountKey = state.accountKey) {
  return Object.fromEntries(WORKSPACE_KEYS.map(key => [key, readAccountValue(accountKey, key, key === 'profile' || key === 'preferences' || key === 'settings' ? {} : key === 'selectedLocation' ? '' : [])]));
}

function workspaceHasData(snapshot) {
  if (!snapshot) return false;
  return WORKSPACE_KEYS.some(key => {
    if (key === 'cloudDeletes') return false;
    const value = snapshot[key];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  });
}

function localWorkspaceMigrationAllowed(userId) {
  if (!userId) return false;
  try {
    const owner = localStorage.getItem(LOCAL_CLOUD_OWNER_KEY);
    return !owner || owner === String(userId);
  } catch { return false; }
}

function markLocalWorkspaceMigrated(userId) {
  if (!userId) return false;
  try {
    localStorage.setItem(LOCAL_CLOUD_OWNER_KEY, String(userId));
    return true;
  } catch { return false; }
}

/* Claim-before-migration (reliability audit 2026-10-14, item 4): the
 * ownership mark used to be written AFTER the local workspace had been
 * migrated and uploaded, and its failure was ignored — so when the write
 * failed, the mark stayed absent and the NEXT account to sign in was
 * still allowed to inherit the same local records. Claiming means the
 * write landed AND reads back as this user; anything else fails closed
 * and the caller must not move or upload the local records. */
function claimLocalWorkspaceOwner(userId) {
  if (!userId) return false;
  if (!markLocalWorkspaceMigrated(userId)) return false;
  try {
    return localStorage.getItem(LOCAL_CLOUD_OWNER_KEY) === String(userId);
  } catch { return false; }
}

function restoreWorkspace(snapshot, { onlyEmpty = true } = {}) {
  if (!snapshot) return;
  for (const key of WORKSPACE_KEYS) {
    if (key === 'cloudDeletes') continue;
    const value = snapshot[key];
    const hasValue = Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' ? Object.keys(value).length > 0 : Boolean(value);
    if (!hasValue || (onlyEmpty && S.has(key))) continue;
    S.set(key, value);
  }
}

function localSession() {
  return {
    type: 'local',
    user: { id: 'local', email: '', user_metadata: { full_name: 'NODE_USER' } },
    createdAt: new Date().toISOString()
  };
}

function restoreLocalSession() {
  try {
    return jsonParse(localStorage.getItem(SESSION_KEY), null);
  } catch { return null; }
}

/* Session-boundary bridges for the classic scripts (native shell, phase
 * templates), which cannot import this module. window.CU already mirrors
 * the account identity; GN_SESSION_EPOCH mirrors the generation so a
 * continuation or cache write from a dead session instance can be told
 * apart from the current one (A → sign out → A included). The native
 * shell owns the session shot draft: it is told to purge the draft when
 * the session ends and to drop a foreign draft when a new session starts
 * (reliability audit 2026-10-14, items 3 + 5d). */
function mirrorSessionEpoch() {
  try { window.GN_SESSION_EPOCH = state.sessionGeneration; } catch {}
}

function activateSession(session, cloud = false) {
  state.sessionGeneration += 1;
  mirrorSessionEpoch();
  syncPassFailed = false;
  state.session = session;
  state.cloud = Boolean(cloud && session?.user?.id);
  state.accountKey = state.cloud ? String(session.user.id) : 'local';
  state.cloudStatus = state.cloud ? 'CLOUD_CONNECTED' : 'LOCAL_ONLY';
  window.CU = {
    id: state.accountKey,
    cloudId: state.cloud ? state.accountKey : null,
    defaultName: session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'NODE_USER',
    email: session?.user?.email || '',
    avatarUrl: session?.user?.user_metadata?.avatar_url || null,
    pin: null
  };
  if (!state.cloud) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session || localSession())); } catch {}
  }
  /* A draft captured under a different account must not survive into
   * this session: the native shell drops it if its owner is foreign. */
  try { window.GN_NATIVE?.guardSessionDraft?.(); } catch {}
  /* v8.1: the rendered drawer form state gets the same boundary —
   * a new session must never inherit the previous session's form. */
  try { window.GN_NATIVE?.resetSessionShotForm?.(); } catch {}
  notify();
  return state;
}

function clearSession() {
  state.sessionGeneration += 1;
  mirrorSessionEpoch();
  /* Session exit clears the session shot draft with it (audit item 3):
   * an unsent draft is part of the session, not of the device. */
  try { window.GN_NATIVE?.purgeSessionDraft?.(); } catch {}
  /* v8.1: session exit also resets the rendered LOG SHOT form state
   * (drawer DOM + module state), which otherwise carries the exiting
   * account's med/dose/notes into the next account on the same tab. */
  try { window.GN_NATIVE?.resetSessionShotForm?.(); } catch {}
  syncPassFailed = false;
  state.session = null;
  state.cloud = false;
  state.accountKey = 'local';
  state.cloudStatus = 'LOCAL_ONLY';
  window.CU = null;
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  notify();
}

function withTimeout(promise, timeoutMs = 4500) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
  ]);
}

let cloudLoadPromise = null;
let cloudClientPromise = null;

function loadCloudLibrary() {
  if (window.supabase?.createClient) return Promise.resolve(window.supabase);
  if (cloudLoadPromise) return cloudLoadPromise;
  cloudLoadPromise = new Promise(resolve => {
    const script = document.createElement('script');
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.min.js';
  script.integrity = 'sha384-tD6X9wDfTRdKpuPoHFZrVW2RXjSYSWjLBPWXxpHprWWl9eaHlwl05aRjHsiKF97n';
  script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => finish(window.supabase || null);
    script.onerror = () => finish(null);
    document.head.appendChild(script);
    setTimeout(() => finish(window.supabase || null), 5000);
  });
  return cloudLoadPromise;
}

async function getCloudClient() {
  if (state.cloudClient) return state.cloudClient;
  if (!cloudClientPromise) {
    cloudClientPromise = loadCloudLibrary().then(library => {
      if (!library?.createClient) return null;
      state.cloudClient = library.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      return state.cloudClient;
    }).catch(error => {
      console.warn('[GRID//NODE cloud library]', error);
      return null;
    });
  }
  return cloudClientPromise;
}

async function getCloudSession() {
  const client = await getCloudClient();
  if (!client) return null;
  try {
    const result = await withTimeout(client.auth.getSession(), 4500);
    return result?.data?.session || null;
  } catch (error) {
    console.warn('[GRID//NODE cloud session]', error);
    return null;
  }
}

async function signInCloud(email, password) {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { data, error } = await withTimeout(client.auth.signInWithPassword({ email, password }), 8000);
  if (error) throw error;
  return data?.session || null;
}

async function signUpCloud(email, password) {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { data, error } = await withTimeout(client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin }
  }), 8000);
  if (error) throw error;
  return data || null;
}

async function resetPasswordCloud(email) {  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { error } = await withTimeout(client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`
  }), 8000);
  if (error) throw error;
  return true;
}

// Passwordless OTP entry (email code). createUser=false for returning users
// (never shows a fake code-sent screen for unknown emails), true for new-user
// account claim after NODE KEY validation.
async function sendSignInCode(email, createUser) {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { error } = await withTimeout(
    client.auth.signInWithOtp({ email, options: { shouldCreateUser: !!createUser } }),
    8000
  );
  if (error) throw error;
  return true;
}

async function verifySignInCode(email, token) {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { data, error } = await withTimeout(
    client.auth.verifyOtp({ email, token, type: 'email' }),
    8000
  );
  if (error) throw error;
  return data?.session || null;
}

async function updateCloudPassword(password) {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { data, error } = await withTimeout(client.auth.updateUser({ password }), 8000);
  if (error) throw error;
  return data?.user || null;
}

async function isCloudProviderEnabled(provider) {
  if (!provider || !(await getCloudClient())) return false;
  try {
    const response = await withTimeout(fetch(`${CLOUD_CONFIG.url}/auth/v1/settings`, {
      headers: { apikey: CLOUD_CONFIG.anonKey }
    }), 5000);
    if (!response.ok) return false;
    const settings = await response.json();
    return Boolean(settings?.external?.[provider]);
  } catch (error) {
    console.warn('[GRID//NODE provider availability]', error);
    return false;
  }
}

async function signInWithGoogle() {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  if (!(await isCloudProviderEnabled('google'))) throw new Error('GOOGLE_AUTH_DISABLED');
  const { error } = await withTimeout(client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href.split('#')[0] }
  }), 8000);
  if (error) throw error;
}

async function signInWithGoogleIdToken(token) {
  if (!token) throw new Error('GOOGLE_TOKEN_MISSING');
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  if (!(await isCloudProviderEnabled('google'))) throw new Error('GOOGLE_AUTH_DISABLED');
  const { data, error } = await withTimeout(client.auth.signInWithIdToken({
    provider: 'google',
    token
  }), 8000);
  if (error) throw error;
  return data?.session || null;
}

async function signOutCloud() {
  const client = state.cloudClient;
  if (!client) return;
  try { await withTimeout(client.auth.signOut(), 5000); } catch (error) { console.warn('[GRID//NODE cloud sign out]', error); }
}

function cloudShotPayload(record, userId) {
  if (!isDoseInRange(record?.dose)) throw new Error('DOSE_OUT_OF_RANGE');
  const payload = {
    user_id: userId,
    date: record.date,
    compound: normalizeMedicationId(record.med),
    dose_mg: Number(record.dose) || 0,
    site: record.site || null,
    notes: record.notes || null,
    side_effects: Array.isArray(record.se) ? record.se : [],
    archived: Boolean(record.archived),
    updated_at: record.modifiedAt || record.updatedAt || record.createdAt || record.date
  };
  if (record.cloudId) payload.id = record.cloudId;
  return payload;
}

function ensureCloudRecordId(record, createUuid = () => globalThis.crypto?.randomUUID?.()) {
  if (record?.cloudId) return record.cloudId;
  const cloudId = createUuid();
  if (!record || !cloudId) throw new Error('CLOUD_RECORD_ID_UNAVAILABLE');
  record.cloudId = cloudId;
  return cloudId;
}

/* Canonical weight (reliability audit 2026-10-14, item 1): a weight
 * record's canonical value is `weight`, ALWAYS stored in pounds (entry,
 * import, and hydration all maintain it so). `weightKg` is a derived
 * cache. The linked-shot edit path rebuilt the record from a spread and
 * updated `weight` without recomputing the cache, and the payload used
 * to prefer the cache — so an edit from 180 to 170 lb uploaded the old
 * 81.6 kg forever. The payload now derives kg from the canonical value;
 * the cache is only a fallback for legacy records that carry kg alone. */
const LB_PER_KG = 2.2046226218;

function canonicalWeightKg(record) {
  const pounds = Number(record?.weight);
  if (Number.isFinite(pounds)) return pounds / LB_PER_KG;
  const kg = Number(record?.weightKg);
  return Number.isFinite(kg) ? kg : 0;
}

/* Recompute the derived cache from the canonical value in place, for
 * mutation sites that rebuild a weight record from user input. */
function withCanonicalWeight(record) {
  if (record && Number.isFinite(Number(record.weight))) {
    record.weightKg = Number(record.weight) / LB_PER_KG;
  }
  return record;
}

function cloudWeightPayload(record, userId) {
  const payload = {
    user_id: userId,
    date: record.date,
    weight_kg: canonicalWeightKg(record),
    notes: record.shotCloudId ? `GRIDNODE_LINKED_SHOT:${record.shotCloudId}` : record.notes || null,
    updated_at: record.modifiedAt || record.updatedAt || record.createdAt || record.date
  };
  // The currently shared schema does not yet have shot_id. Only send the
  // column for linked records, where syncWeight can safely retry using the
  // notes marker until the additive migration is approved and applied.
  if (record.shotCloudId) payload.shot_id = record.shotCloudId;
  if (record.cloudId) payload.id = record.cloudId;
  return payload;
}

function parseLinkedShotCloudId(value) {
  const match = String(value || '').match(/^GRIDNODE_LINKED_SHOT:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match ? match[1] : null;
}

function planPermanentShotDelete(record, weights = [], cloudDeletes = []) {
  const linkedWeights = weights.filter(weight =>
    weight.shotId === record?.id || Boolean(record?.cloudId && weight.shotCloudId === record.cloudId)
  );
  const linkedIds = new Set(linkedWeights.map(weight => weight.id));
  const linkedCloudIds = new Set(linkedWeights.map(weight => weight.cloudId).filter(Boolean));
  const nextDeletes = cloudDeletes.map(item => ({ ...item }));
  const appendDelete = (table, id) => {
    if (id && !nextDeletes.some(item => item.table === table && item.id === id)) nextDeletes.push({ table, id });
  };
  appendDelete('shots', record?.cloudId);
  linkedCloudIds.forEach(id => appendDelete('weights', id));
  return {
    linkedWeights,
    remainingWeights: weights.filter(weight => !linkedIds.has(weight.id) && !(weight.cloudId && linkedCloudIds.has(weight.cloudId))),
    cloudDeletes: nextDeletes,
    inventoryReturn: record?.inventoryDeduction ? { ...record.inventoryDeduction } : null,
  };
}

/* ── Revision-aware sync (audit 2026-10-14, defects 2 + 3) ──────────────
 * Every sync intent bumps a per-record revision. An intent that arrives
 * while a request for the same record is in flight is marked dirty, not
 * silently dropped; when the in-flight request settles, the latest
 * persisted record is uploaded, so a response for an older revision can
 * never acknowledge a newer edit. A record deleted locally while its
 * upload was in flight gets its tombstone re-asserted and flushed AFTER
 * the upload settles, so the deletion dominates the late upload.
 * Every post-await effect (status, retry queue) is gated on the session
 * stamp captured at entry: a dead generation's continuation touches
 * nothing. */
const syncRevisions = new Map();
const syncDirty = new Set();

function noteSyncIntent(kind, id) {
  const key = `${kind}:${id}`;
  const rev = (syncRevisions.get(key) || 0) + 1;
  syncRevisions.set(key, rev);
  return rev;
}

/* Remove retry-queue entries a successful delivery has acknowledged.
 * Entries enqueued after the attempt started belong to newer intent and
 * are preserved. Singleton kinds (profile/workspace) match on kind. */
function dequeueSync(kind, id, throughTs = Date.now()) {
  const queue = S.get('syncQueue', []);
  if (!queue.length) return;
  const singleton = kind === 'profile' || kind === 'workspace';
  const next = queue.filter(item => !(item.kind === kind && (singleton || item.id === id) && (item.at || 0) <= throughTs));
  if (next.length !== queue.length) {
    S.set('syncQueue', next);
    if (!next.length) syncPassFailed = false;
  }
}

/* Status is derived, never asserted: CLOUD_SYNCED only when the current
 * session has no failed pass, no queued retries, and no pending deletes. */
function applyDerivedStatus(stamp) {
  if (stamp && !sessionStampIntact(stamp)) return;
  if (!state.cloud) { state.cloudStatus = 'LOCAL_ONLY'; return; }
  const queue = S.get('syncQueue', []);
  const deletes = S.get('cloudDeletes', []);
  state.cloudStatus = (syncPassFailed || queue.length > 0 || deletes.length > 0) ? 'LOCAL_BACKUP' : 'CLOUD_SYNCED';
}

function afterSyncSettle(kind, record, rev, stamp) {
  const key = `${kind}:${record.id}`;
  if (!sessionStampIntact(stamp)) { syncDirty.delete(key); return; }
  const table = kind === 'shot' ? 'shots' : 'weights';
  const latest = kind === 'shot'
    ? getAllShots().find(item => item.id === record.id)
    : getWeights().find(item => item.id === record.id);
  if (!latest) {
    /* Deleted locally while the upload was in flight. The tombstone the
     * delete flow queued may already have flushed against a row that did
     * not exist yet; re-assert it now the upload has landed so the delete
     * is ordered after the upload and the record stays deleted. */
    syncDirty.delete(key);
    if (record.cloudId) {
      const pending = S.get('cloudDeletes', []);
      if (!pending.some(item => item.table === table && item.id === record.cloudId)) {
        pending.push({ table, id: record.cloudId });
        S.set('cloudDeletes', pending);
      }
      flushCloudDeletes().catch(error => console.warn('[GRID//NODE cloud settle delete]', error));
    }
    return;
  }
  if (syncDirty.has(key) || (syncRevisions.get(key) || 0) > rev) {
    syncDirty.delete(key);
    const rerun = kind === 'shot' ? syncShot(latest) : syncWeight(latest);
    rerun.catch(error => console.warn('[GRID//NODE cloud settle resync]', error));
  }
}

function afterSingletonSettle(kind, stamp) {
  if (!sessionStampIntact(stamp)) { syncDirty.delete(kind); return; }
  if (!syncDirty.has(kind)) return;
  syncDirty.delete(kind);
  const rerun = kind === 'profile' ? syncProfile(getProfile()) : syncWorkspace();
  rerun.catch(error => console.warn('[GRID//NODE cloud settle resync]', error));
}

async function syncShot(record) {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return;
  if (!normalizeMedicationId(record?.med)) { console.warn('[GRID//NODE cloud shot sync] invalid medication identity; sync skipped'); return; }
  if (!record?.id) return;
  const key = `shot:${record.id}`;
  const rev = noteSyncIntent('shot', record.id);
  if (syncInFlight.has(key)) { syncDirty.add(key); return; }
  syncInFlight.add(key);
  const stamp = sessionStamp();
  const startedAt = Date.now();
  try {
    const assignedCloudId = !record.cloudId;
    ensureCloudRecordId(record);
    if (assignedCloudId) {
      const all = getAllShots();
      const index = all.findIndex(item => item.id === record.id);
      if (index < 0) throw new Error('CLOUD_RECORD_ID_PERSIST_FAILED');
      all[index] = record;
      if (!S.set('shots', all)) throw new Error('CLOUD_RECORD_ID_PERSIST_FAILED');
    }
    const payload = cloudShotPayload(record, stamp.userId);
    let { data, error } = await withTimeout(state.cloudClient.from('shots').upsert(payload).select().single(), 8000);
    if (error && /updated_at|PGRST204|42703/i.test(`${error.code || ''} ${error.message || ''}`)) {
      const compatiblePayload = { ...payload };
      delete compatiblePayload.updated_at;
      ({ data, error } = await withTimeout(state.cloudClient.from('shots').upsert(compatiblePayload).select().single(), 8000));
    }
    if (error) throw error;
    if (!sessionStampIntact(stamp)) return;
    if (data?.id) {
      record.cloudId = data.id;
      const all = getAllShots();
      const index = all.findIndex(item => item.id === record.id);
      if (index >= 0 && all[index].cloudId !== data.id) {
        all[index] = { ...all[index], cloudId: data.id };
        if (!S.set('shots', all)) console.warn('[GRID//NODE cloud shot sync] failed to persist cloudId');
      }
    }
    dequeueSync('shot', record.id, startedAt);
    applyDerivedStatus(stamp);
  } catch (error) {
    if (!sessionStampIntact(stamp)) {
      console.warn('[GRID//NODE cloud shot sync] stale session continuation dropped', error);
    } else if (error?.message === 'DOSE_OUT_OF_RANGE') {
      console.warn('[GRID//NODE cloud shot sync] dose out of range; sync permanently rejected', error);
    } else {
      syncPassFailed = true;
      enqueueSync('shot', record, stamp);
      console.warn('[GRID//NODE cloud shot sync]', error);
    }
    applyDerivedStatus(stamp);
  } finally {
    syncInFlight.delete(key);
    afterSyncSettle('shot', record, rev, stamp);
  }
}

async function syncWeight(record) {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return;
  if (!record?.id) return;
  const key = `weight:${record.id}`;
  const rev = noteSyncIntent('weight', record.id);
  if (syncInFlight.has(key)) { syncDirty.add(key); return; }
  syncInFlight.add(key);
  const stamp = sessionStamp();
  const startedAt = Date.now();
  try {
    const assignedCloudId = !record.cloudId;
    ensureCloudRecordId(record);
    if (assignedCloudId) {
      const all = getWeights();
      const index = all.findIndex(item => item.id === record.id);
      if (index < 0) throw new Error('CLOUD_RECORD_ID_PERSIST_FAILED');
      all[index] = record;
      if (!S.set('weights', all)) throw new Error('CLOUD_RECORD_ID_PERSIST_FAILED');
    }
    const payload = cloudWeightPayload(record, stamp.userId);
    let { data, error } = await withTimeout(state.cloudClient.from('weights').upsert(payload).select().single(), 8000);
    if (error && /shot_id|updated_at|PGRST204|42703/i.test(`${error.code || ''} ${error.message || ''}`)) {
      const compatiblePayload = { ...payload };
      delete compatiblePayload.shot_id;
      delete compatiblePayload.updated_at;
      ({ data, error } = await withTimeout(state.cloudClient.from('weights').upsert(compatiblePayload).select().single(), 8000));
    }
    if (error) throw error;
    if (!sessionStampIntact(stamp)) return;
    if (data?.id) {
      record.cloudId = data.id;
      const all = getWeights();
      const index = all.findIndex(item => item.id === record.id);
      if (index >= 0 && all[index].cloudId !== data.id) {
        all[index] = { ...all[index], cloudId: data.id };
        if (!S.set('weights', all)) console.warn('[GRID//NODE cloud weight sync] failed to persist cloudId');
      }
    }
    dequeueSync('weight', record.id, startedAt);
    applyDerivedStatus(stamp);
  } catch (error) {
    if (!sessionStampIntact(stamp)) {
      console.warn('[GRID//NODE cloud weight sync] stale session continuation dropped', error);
    } else {
      syncPassFailed = true;
      enqueueSync('weight', record, stamp);
      console.warn('[GRID//NODE cloud weight sync]', error);
    }
    applyDerivedStatus(stamp);
  } finally {
    syncInFlight.delete(key);
    afterSyncSettle('weight', record, rev, stamp);
  }
}

async function syncProfile(profile) {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return;
  noteSyncIntent('profile', 'profile');
  if (syncInFlight.has('profile')) { syncDirty.add('profile'); return; }
  syncInFlight.add('profile');
  const stamp = sessionStamp();
  const startedAt = Date.now();
  try {
    const { error } = await withTimeout(state.cloudClient.from('profiles').upsert({
      id: stamp.userId,
      display_name: profile.name || 'NODE_USER',
      weight_unit: profile.weightUnit || 'lbs',
      height_unit: 'ft/in',
      dose_mg: Number(profile.dose) || null,
      profile_data: profile || {},
      updated_at: new Date().toISOString()
    }), 8000);
    if (error) throw error;
    if (!sessionStampIntact(stamp)) return;
    dequeueSync('profile', 'profile', startedAt);
    applyDerivedStatus(stamp);
  } catch (error) {
    if (!sessionStampIntact(stamp)) {
      console.warn('[GRID//NODE cloud profile sync] stale session continuation dropped', error);
    } else {
      syncPassFailed = true;
      enqueueSync('profile', profile, stamp);
      console.warn('[GRID//NODE cloud profile sync]', error);
    }
    applyDerivedStatus(stamp);
  } finally {
    syncInFlight.delete('profile');
    afterSingletonSettle('profile', stamp);
  }
}

function workspacePayload(userId) {
  const preferences = { ...S.get('preferences', {}) };
  const selectedLocation = S.get('selectedLocation', '');
  if (selectedLocation) preferences.selectedLocation = selectedLocation;
  const settings = {
    ...S.get('settings', {}),
    _gridnodeFoundation: {
      researchRecords: S.get('researchRecords', []),
      devices: S.get('devices', []),
      measurements: S.get('measurements', []),
      inventory: S.get('inventory', []),
      loadouts: S.get('loadouts', []),
      eventLedger: S.get('eventLedger', []),
      importQueue: S.get('importQueue', []),
      labTests: S.get('labTests', [])
    }
  };
  return {
    user_id: userId,
    results_data: S.get('results', []),
    notes_data: S.get('notes', []),
    symptoms_data: S.get('symptoms', []),
    labs_data: S.get('labs', []),
    preferences,
    settings,
    arsenal: S.get('arsenal', []),
    updated_at: new Date().toISOString()
  };
}

/* Workspace write ordering (reliability audit 2026-10-14, item 5c):
 * workspace upserts carry no per-record revision the server can order
 * by, and the payload is a snapshot — so two writes whose transports
 * complete out of order leave the OLDER snapshot on the server. Two
 * ASSAY saves proved it: the newer write landed first, the older write
 * landed last and won. The v5 dirty-mark machinery re-issues a fresher
 * write after a settle, but a write abandoned by the 8 s timeout race
 * is still in flight at the transport and can land after its own
 * replacement. Workspace writes therefore run through a chain: a write
 * issues only after the previous write's transport has ACTUALLY
 * settled (bounded by a cap so a wedged transport cannot park the
 * chain forever). Completion order now equals intent order, and the
 * last write to land is always the newest snapshot. */
let workspaceChain = Promise.resolve();
const WORKSPACE_SETTLE_CAP_MS = 30000;

async function syncWorkspace() {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return;
  noteSyncIntent('workspace', 'workspace');
  if (syncInFlight.has('workspace')) { syncDirty.add('workspace'); return; }
  syncInFlight.add('workspace');
  const run = workspaceChain.then(() => syncWorkspacePass());
  workspaceChain = run.then(() => {}, () => {});
  return run;
}

async function syncWorkspacePass() {
  const stamp = sessionStamp();
  const startedAt = Date.now();
  let rawSettled = Promise.resolve();
  try {
    const query = state.cloudClient.from('workspaces').upsert(workspacePayload(stamp.userId));
    /* Execute the builder exactly once and share the promise: the
     * timeout race judges the result, the chain judges settlement. */
    const raw = new Promise((resolve, reject) => {
      try { query.then(resolve, reject); } catch (error) { reject(error); }
    });
    rawSettled = raw.then(() => {}, () => {});
    const { error } = await withTimeout(raw, 8000);
    if (error) throw error;
    if (!sessionStampIntact(stamp)) return;
    dequeueSync('workspace', 'workspace', startedAt);
    applyDerivedStatus(stamp);
  } catch (error) {
    if (!sessionStampIntact(stamp)) {
      console.warn('[GRID//NODE cloud workspace sync] stale session continuation dropped', error);
    } else {
      syncPassFailed = true;
      enqueueSync('workspace', null, stamp);
      console.warn('[GRID//NODE cloud workspace sync]', error);
    }
    applyDerivedStatus(stamp);
  } finally {
    /* The in-flight slot (and with it any dirty rerun carrying a fresher
     * snapshot) is released only when the transport has settled, so a
     * timed-out write can never land after its replacement. */
    await Promise.race([rawSettled, new Promise(resolve => setTimeout(resolve, WORKSPACE_SETTLE_CAP_MS))]);
    syncInFlight.delete('workspace');
    afterSingletonSettle('workspace', stamp);
  }
}

/* Delete flushes are serialized and acknowledge only the exact entries
 * they delivered (audit 2026-10-14, defect 3): the queue is re-read after
 * the pass, so tombstones appended during the flush — and tombstones
 * whose delete failed — survive; a snapshot taken at pass start can
 * never overwrite newer work. The whole pass is scoped to the session
 * stamp captured at entry: deletes use the captured user id, and a stale
 * generation's continuation writes nothing back. */
let flushDeletesPromise = null;
let flushDeletesAgain = false;

function flushCloudDeletes() {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return Promise.resolve(false);
  if (flushDeletesPromise) {
    flushDeletesAgain = true;
    return flushDeletesPromise;
  }
  flushDeletesPromise = (async () => {
    try {
      return await flushCloudDeletesPass();
    } finally {
      flushDeletesPromise = null;
      if (flushDeletesAgain) {
        flushDeletesAgain = false;
        flushCloudDeletes().catch(error => console.warn('[GRID//NODE cloud delete] reflush', error));
      }
    }
  })();
  return flushDeletesPromise;
}

async function flushCloudDeletesPass() {
  const stamp = sessionStamp();
  const userId = stamp.userId;
  const pending = S.get('cloudDeletes', []);
  if (!pending.length) { applyDerivedStatus(stamp); return true; }
  const delivered = new Set();
  for (const item of pending) {
    if (!sessionStampIntact(stamp)) return false;
    try {
      const { error } = await withTimeout(state.cloudClient.from(item.table).delete().eq('id', item.id).eq('user_id', userId), 8000);
      if (error) throw error;
      delivered.add(`${item.table}:${item.id}`);
    } catch (error) {
      console.warn('[GRID//NODE cloud delete]', error);
    }
  }
  if (!sessionStampIntact(stamp)) return false;
  const current = S.get('cloudDeletes', []);
  const remaining = current.filter(item => !delivered.has(`${item.table}:${item.id}`));
  if (remaining.length !== current.length) {
    if (!S.set('cloudDeletes', remaining)) {
      console.warn('[GRID//NODE cloud delete] could not persist queue; retaining all pending tombstones');
      applyDerivedStatus(stamp);
      return false;
    }
  }
  applyDerivedStatus(stamp);
  return remaining.length === 0;
}

async function deleteCloudShot(record) {
  if (!record?.cloudId) return true;
  const pending = S.get('cloudDeletes', []);
  if (!pending.some(item => item.table === 'shots' && item.id === record.cloudId)) pending.push({ table: 'shots', id: record.cloudId });
  if (!S.set('cloudDeletes', pending)) return false;
  return flushCloudDeletes();
}

async function hydrateCloudData() {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return { ok: false, reason: 'LOCAL_ONLY' };
  /* Session stamp incl. generation (defect 3): A → sign out → A must not
   * accept the old session's hydration results. */
  const stamp = sessionStamp();
  const sessionIntact = () => sessionStampIntact(stamp);
  try {
    const userId = stamp.userId;
    await flushCloudDeletes();
    if (!sessionIntact()) return { ok: false, reason: 'SESSION_CHANGED' };
    const [profileResult, shotsResult, weightsResult, workspaceResult] = await Promise.all([
      withTimeout(state.cloudClient.from('profiles').select('*').eq('id', userId).maybeSingle(), 8000),
      withTimeout(state.cloudClient.from('shots').select('*').eq('user_id', userId).order('date', { ascending: true }), 8000),
      withTimeout(state.cloudClient.from('weights').select('*').eq('user_id', userId).order('date', { ascending: true }), 8000),
      withTimeout(state.cloudClient.from('workspaces').select('*').eq('user_id', userId).maybeSingle(), 8000)
    ]);
    if (profileResult.error) throw profileResult.error;
    if (shotsResult.error) throw shotsResult.error;
    if (weightsResult.error) throw weightsResult.error;
    if (workspaceResult.error) throw workspaceResult.error;
    if (!sessionIntact()) return { ok: false, reason: 'SESSION_CHANGED' };

    const localShots = getAllShots();
    const cloudShots = (shotsResult.data || []).map(item => ({
      id: `cloud_${item.id}`,
      cloudId: item.id,
      date: item.date,
      med: item.compound || item.med || 'CUSTOM',
      dose: Number(item.dose_mg) || 0,
      site: item.site || '',
      notes: item.notes || null,
      se: Array.isArray(item.side_effects) ? item.side_effects : [],
      archived: Boolean(item.archived),
      createdAt: item.created_at || item.date,
      modifiedAt: item.updated_at || item.created_at || item.date
    }));
    /* Checked hydration persistence (defect 1): every merged value is
     * computed first, then committed as ONE journaled multiWrite. If any
     * write fails, the journal rolls the local snapshot back, hydration
     * reports failure, and uploads stay prohibited — read success alone
     * never marks hydration ready. */
    const ops = [];
    const pendingDeleteIds = new Set(S.get('cloudDeletes', []).map(item => item.id));
    const mergedShots = mergeRecords(localShots, cloudShots.filter(item => !(item.cloudId && pendingDeleteIds.has(item.cloudId))), record => record.cloudId || record.id);
    if (mergedShots.length) ops.push({ key: 'shots', value: mergedShots });

    const localWeights = getWeights();
    const cloudWeights = (weightsResult.data || []).map(item => {
      const shotCloudId = item.shot_id || parseLinkedShotCloudId(item.notes);
      return ({
      id: `cloud_${item.id}`,
      cloudId: item.id,
      shotId: shotCloudId ? `cloud_${shotCloudId}` : null,
      shotCloudId,
      date: item.date,
      weight: Number(item.weight_kg) * 2.2046226218,
      weightKg: Number(item.weight_kg),
      notes: shotCloudId ? 'Logged with SHOT' : item.notes || null,
      source: shotCloudId ? 'shot' : 'cloud',
      createdAt: item.created_at || item.date,
      modifiedAt: item.updated_at || item.created_at || item.date
    });
    });
    const mergedWeights = mergeRecords(localWeights, cloudWeights.filter(item => !(item.cloudId && pendingDeleteIds.has(item.cloudId))), record => record.cloudId || record.id);
    if (!sessionIntact()) return { ok: false, reason: 'SESSION_CHANGED' };
    if (mergedWeights.length) ops.push({ key: 'weights', value: mergedWeights });

    const remoteProfile = profileResult.data;
    if (remoteProfile) {
      const profile = getProfile();
      const cloudProfile = remoteProfile.profile_data && typeof remoteProfile.profile_data === 'object' ? remoteProfile.profile_data : {};
      const mergedProfile = { ...cloudProfile, ...profile };
      mergedProfile.name = mergedProfile.name || remoteProfile.display_name || '';
      if (remoteProfile.dose_mg && !mergedProfile.dose) mergedProfile.dose = remoteProfile.dose_mg;
      if (!sessionIntact()) return { ok: false, reason: 'SESSION_CHANGED' };
      ops.push({ key: 'profile', value: mergedProfile });
    }

    if (!sessionIntact()) return { ok: false, reason: 'SESSION_CHANGED' };
    const remoteWorkspace = workspaceResult.data;
    if (remoteWorkspace) {
      const preferences = { ...(remoteWorkspace.preferences || {}), ...S.get('preferences', {}) };
      const remoteSettings = remoteWorkspace.settings || {};
      const localSettings = S.get('settings', {});
      const remoteFoundation = remoteSettings._gridnodeFoundation || {};
      const localFoundation = localSettings._gridnodeFoundation || {};
      const settings = { ...remoteSettings, ...localSettings, _gridnodeFoundation: { ...remoteFoundation, ...localFoundation } };
      ops.push({ key: 'results', value: mergeJsonRecords(S.get('results', []), remoteWorkspace.results_data || []) });
      ops.push({ key: 'notes', value: mergeJsonRecords(S.get('notes', []), remoteWorkspace.notes_data || []) });
      ops.push({ key: 'symptoms', value: mergeJsonRecords(S.get('symptoms', []), remoteWorkspace.symptoms_data || []) });
      ops.push({ key: 'labs', value: mergeJsonRecords(S.get('labs', []), remoteWorkspace.labs_data || []) });
      ops.push({ key: 'arsenal', value: mergeJsonRecords(S.get('arsenal', []), remoteWorkspace.arsenal || []) });
      ops.push({ key: 'preferences', value: preferences });
      ops.push({ key: 'settings', value: settings });
      if (!S.get('selectedLocation', '') && preferences.selectedLocation) ops.push({ key: 'selectedLocation', value: preferences.selectedLocation });
      ops.push({ key: 'researchRecords', value: mergeJsonRecords(S.get('researchRecords', []), remoteFoundation.researchRecords || []) });
      ops.push({ key: 'devices', value: mergeJsonRecords(S.get('devices', []), remoteFoundation.devices || []) });
      ops.push({ key: 'measurements', value: mergeJsonRecords(S.get('measurements', []), remoteFoundation.measurements || []) });
      ops.push({ key: 'inventory', value: mergeJsonRecords(S.get('inventory', []), remoteFoundation.inventory || []) });
      ops.push({ key: 'loadouts', value: mergeJsonRecords(S.get('loadouts', []), remoteFoundation.loadouts || []) });
      ops.push({ key: 'eventLedger', value: mergeJsonRecords(S.get('eventLedger', []), remoteFoundation.eventLedger || []) });
      ops.push({ key: 'importQueue', value: mergeJsonRecords(S.get('importQueue', []), remoteFoundation.importQueue || []) });
      ops.push({ key: 'labTests', value: mergeJsonRecords(S.get('labTests', []), remoteFoundation.labTests || []) });
    }
    if (!sessionIntact()) return { ok: false, reason: 'SESSION_CHANGED' };
    if (ops.length && !S.multiWrite(ops)) {
      /* The journal preserved the pre-hydration local snapshot and the
       * remote result can be re-fetched on retry; nothing was uploaded
       * and nothing may be until a retry commits the full merge. */
      lastHydration = { stamp, ok: false };
      state.cloudStatus = 'LOCAL_BACKUP';
      console.warn('[GRID//NODE cloud hydrate] merged result could not be persisted; uploads remain blocked');
      return { ok: false, reason: 'HYDRATION_PERSIST_FAILED' };
    }
    lastHydration = { stamp, ok: true };
    applyDerivedStatus(stamp);
    return {
      ok: true,
      remote: {
        shots: shotsResult.data?.length || 0,
        weights: weightsResult.data?.length || 0,
        profile: Boolean(profileResult.data),
        workspace: Boolean(workspaceResult.data)
      }
    };
  } catch (error) {
    if (sessionIntact()) {
      lastHydration = { stamp, ok: false };
      state.cloudStatus = 'LOCAL_BACKUP';
    }
    console.warn('[GRID//NODE cloud hydrate]', error);
    return { ok: false, reason: error.message || 'CLOUD_READ_FAILED' };
  }
}

function mergeRecords(localRecords, remoteRecords, identity) {
  const localList = Array.isArray(localRecords) ? localRecords : [];
  const remoteList = Array.isArray(remoteRecords) ? remoteRecords : [];
  const byId = new Map();
  for (const record of localList) {
    let id;
    try { id = identity(record); } catch (error) { id = JSON.stringify(record); }
    byId.set(id, record);
  }
  for (const record of remoteList) {
    let id;
    try { id = identity(record); } catch (error) { id = JSON.stringify(record); }
    const local = byId.get(id);
    if (!local) { byId.set(id, record); continue; }
    const localTime = new Date(local.updatedAt || local.modifiedAt || local.createdAt || local.date || 0).getTime();
    const remoteTime = new Date(record.updatedAt || record.modifiedAt || record.createdAt || record.date || 0).getTime();
    const remoteNewer = !Number.isNaN(remoteTime) && (Number.isNaN(localTime) || remoteTime > localTime);
    if (remoteNewer) byId.set(id, record);
  }
  return [...byId.values()].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
}

function mergeJsonRecords(localRecords, remoteRecords) {
  const local = Array.isArray(localRecords) ? localRecords : [];
  const remote = Array.isArray(remoteRecords) ? remoteRecords : [];
  return mergeRecords(local, remote, record => record && typeof record === 'object' ? record.id || JSON.stringify(record) : String(record));
}

let syncPassFailed = false;
const syncInFlight = new Set();

async function syncAllCloudData() {
  if (!state.cloud) return;
  if (!cloudUploadsReady()) { state.cloudStatus = 'LOCAL_BACKUP'; return { ok: false, reason: 'HYDRATION_NOT_OK' }; }
  /* Stamp-captured (defect 3): if the session changes at any await, the
   * continuation must not rewrite the queue or the status of whatever
   * session is current by then. Sign-out during an awaited full sync can
   * no longer leave CLOUD_SYNCED behind in local mode. */
  const stamp = sessionStamp();
  syncPassFailed = false;
  const deletesOk = await flushCloudDeletes();
  if (!sessionStampIntact(stamp)) return { ok: false, reason: 'SESSION_CHANGED' };
  if (!deletesOk) syncPassFailed = true;
  await Promise.all([
    ...getAllShots().map(record => syncShot(record)),
    ...getWeights().map(record => syncWeight(record)),
    syncProfile(getProfile()),
    syncWorkspace()
  ]);
  if (!sessionStampIntact(stamp)) return { ok: false, reason: 'SESSION_CHANGED' };
  /* No blanket queue clear (defects 2 + 3): each sync acknowledges its
   * own entries on delivery. Here we only prune entries whose record no
   * longer exists locally (deleted records are owned by tombstones). */
  const liveShotIds = new Set(getAllShots().map(record => record.id));
  const liveWeightIds = new Set(getWeights().map(record => record.id));
  const queueNow = S.get('syncQueue', []);
  const remainingQueue = queueNow.filter(item =>
    (item.kind !== 'shot' || liveShotIds.has(item.id)) &&
    (item.kind !== 'weight' || liveWeightIds.has(item.id)));
  if (remainingQueue.length !== queueNow.length) S.set('syncQueue', remainingQueue);
  applyDerivedStatus(stamp);
  return { ok: !syncPassFailed && remainingQueue.length === 0 };
}

/* Reconnect recovery (reliability audit 2026-10-14, item 5a): the
 * native online handler used to only animate the status banner — a
 * queue parked by an offline failure stayed parked until some later
 * edit happened to queue the same record. Recovery is bounded (the
 * persisted queue plus pending deletes, nothing else), bound to the
 * account + session generation that asked for it, and obeys the same
 * hydration gate as every other upload path: mid-hydration, uploads
 * stay closed so remote state is never overwritten by stale local
 * state. Returns the outcome so the caller can show honest pending
 * state until the queue is acked. */
async function recoverPendingSync() {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) {
    return { ok: false, pending: 0, reason: 'no-cloud-session' };
  }
  const stamp = sessionStamp();
  const pendingCount = () => S.get('syncQueue', []).length;
  if (state.cloudHydration !== 'ok') {
    return { ok: false, pending: pendingCount(), reason: 'hydration-pending' };
  }
  /* Flush through the same per-record syncers a full sync uses — each
   * acknowledges its own queue entries on delivery, under the same
   * revision rules — but scoped to what is actually queued. */
  const entries = [...S.get('syncQueue', [])];
  const shotsById = new Map(getAllShots().map(record => [record.id, record]));
  const weightsById = new Map(getWeights().map(record => [record.id, record]));
  const jobs = [];
  for (const entry of entries) {
    if (entry.kind === 'shot') { const record = shotsById.get(entry.id); if (record) jobs.push(syncShot(record)); }
    else if (entry.kind === 'weight') { const record = weightsById.get(entry.id); if (record) jobs.push(syncWeight(record)); }
    else if (entry.kind === 'profile') jobs.push(syncProfile(getProfile()));
    else if (entry.kind === 'workspace') jobs.push(syncWorkspace());
  }
  await Promise.all(jobs);
  if (!sessionStampIntact(stamp)) {
    return { ok: false, pending: pendingCount(), reason: 'session-changed' };
  }
  await flushCloudDeletes();
  /* Prune entries whose record no longer exists locally — the same
   * rule syncAllCloudData applies; tombstones own deleted records. */
  const liveShotIds = new Set(getAllShots().map(record => record.id));
  const liveWeightIds = new Set(getWeights().map(record => record.id));
  const queueNow = S.get('syncQueue', []);
  const remainingQueue = queueNow.filter(item =>
    (item.kind !== 'shot' || liveShotIds.has(item.id)) &&
    (item.kind !== 'weight' || liveWeightIds.has(item.id)));
  if (remainingQueue.length !== queueNow.length) S.set('syncQueue', remainingQueue);
  applyDerivedStatus(stamp);
  return { ok: remainingQueue.length === 0, pending: remainingQueue.length, reason: 'flushed' };
}

function queueCloudSync(kind, record) {
  if (state.cloud && !cloudUploadsReady()) {
    enqueueSync(kind, record);
    state.cloudStatus = 'LOCAL_BACKUP';
    return Promise.resolve();
  }
  const work = kind === 'shot' ? syncShot(record) : kind === 'weight' ? syncWeight(record) : kind === 'profile' ? syncProfile(record) : syncWorkspace();
  work.catch(error => console.warn('[GRID//NODE cloud queue]', error));
  return work;
}

function enqueueSync(kind, record, stamp = null) {
  /* Queue mutations from a dead session generation are refused: the
   * read-modify-write would otherwise resurrect stale entries into (or
   * drop live entries of) the current session. */
  if (stamp && !sessionStampIntact(stamp)) return;
  const id = record?.id || record?.cloudId || kind;
  const queue = S.get('syncQueue', []);
  const entry = { kind, id, cloudId: record?.cloudId || null, at: Date.now() };
  const index = queue.findIndex(item => item.kind === kind && item.id === id);
  if (index >= 0) queue[index] = entry; else queue.push(entry);
  S.set('syncQueue', queue);
}

function sessionLabel() {
  return state.session?.user?.email || (state.cloud ? tx('vault.cloudAccount', 'CLOUD ACCOUNT') : tx('profile.localDeviceSession', 'LOCAL DEVICE SESSION'));
}

async function deleteCloudAccount() {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return { ok: false, reason: 'CLOUD_ONLY_ACTION' };
  let session = state.session;
  try {
    const current = await withTimeout(state.cloudClient.auth.getSession(), 5000);
    if (current.error) return { ok: false, reason: 'CLOUD_SESSION_READ_FAILED' };
    session = current.data?.session || session;
  } catch {
    return { ok: false, reason: 'CLOUD_SESSION_READ_FAILED' };
  }
  const accessToken = session?.access_token;
  if (!accessToken) return { ok: false, reason: 'CLOUD_SESSION_MISSING' };
  try {
    const response = await withTimeout(fetch(CLOUD_CONFIG.url + '/functions/v1/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    }), 10000);
    if (!response.ok) return { ok: false, reason: 'CLOUD_ACCOUNT_DELETE_FAILED' };
    const result = await response.json().catch(() => ({}));
    return result?.deleted === true ? { ok: true, deleted: true } : { ok: false, reason: 'CLOUD_ACCOUNT_DELETE_UNCONFIRMED' };
  } catch {
    return { ok: false, reason: 'CLOUD_ACCOUNT_DELETE_FAILED' };
  }
}

function migrateLegacyLocalData() {
  if (state.accountKey === 'local') {
    for (const key of WORKSPACE_KEYS) {
      const current = localStorage.getItem(`gn_local_${key}`);
      if (current !== null) continue;
      const legacy = localStorage.getItem(`gn_0_${key}`);
      if (legacy !== null) { try { localStorage.setItem(`gn_local_${key}`, legacy); } catch (error) { console.warn('[GRID//NODE storage.migrate]', key, error); } }
    }
  }
  repairStorageShapes();
}

function repairStorageShapes() {
  const arrayKeys = WORKSPACE_KEYS.filter(key => key !== 'profile' && key !== 'preferences' && key !== 'settings' && key !== 'selectedLocation');
  const objectKeys = ['profile', 'preferences', 'settings'];
  for (const key of arrayKeys) {
    const raw = localStorage.getItem(accountStorageKey(key));
    if (raw == null) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(parsed)) {
      try { localStorage.setItem('gn_backup_' + accountStorageKey(key), raw); } catch (error) { console.warn('[GRID//NODE storage repair backup]', key, error); }
      try { localStorage.setItem(accountStorageKey(key), '[]'); } catch (error) { console.warn('[GRID//NODE storage repair]', key, error); }
    }
  }
  for (const key of objectKeys) {
    const raw = localStorage.getItem(accountStorageKey(key));
    if (raw == null) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      try { localStorage.setItem('gn_backup_' + accountStorageKey(key), raw); } catch (error) { console.warn('[GRID//NODE storage repair backup]', key, error); }
      try { localStorage.setItem(accountStorageKey(key), '{}'); } catch (error) { console.warn('[GRID//NODE storage repair]', key, error); }
    }
  }
}

function parseLocalDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const raw = String(value || '').trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12, 0, 0, 0);
  return new Date(raw);
}

function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return '—';
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = document.documentElement?.lang?.startsWith('es') ? 'es-419' : 'en-US';
  return date.toLocaleDateString(locale, options);
}

function formatDateTime(value) {
  if (!value) return '—';
  const raw = String(value).trim();
  /* QA 2026-09-17: date-only records carry no meaningful time — render the
   * date alone instead of a fabricated local-noon timestamp. */
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDate(value);
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = document.documentElement?.lang?.startsWith('es') ? 'es-419' : 'en-US';
  return date.toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = parseLocalDate(raw);
    return Number.isNaN(parsed.getTime()) || todayISO(parsed) !== raw ? '' : raw;
  }
  const mdy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (mdy) {
    const candidate = `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
    const parsed = parseLocalDate(candidate);
    return Number.isNaN(parsed.getTime()) || todayISO(parsed) !== candidate ? '' : candidate;
  }
  const date = parseLocalDate(raw);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/* Date/time semantics (reliability audit 2026-10-14, item 6) — the
 * contract every save path now follows:
 * - A record with a time stores an explicit INSTANT: local wall time
 *   plus the UTC offset in force on THAT date (`2026-03-07T23:30:00-05:00`).
 * - A record without a time stores the bare calendar date, unchanged.
 * - A wall time that does not exist (the spring DST gap) is NOT a
 *   valid instant: stamping returns null and the caller must reject
 *   visibly. `new Date(y, m, d, h)` silently shifts gap times to a
 *   different wall time, so existence is proven by a round-trip check.
 * - Editing the DATE of a timed record recomputes the offset for the
 *   new date (the IANA zone is retained; the wall time is retained).
 *   An edit that changes nothing preserves the stored instant verbatim,
 *   offset and seconds included (handled by the save paths). */
function isRealCalendarDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function utcOffsetSuffix(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/* Stamp a local wall date + time as an explicit instant string, or
 * null when the wall time does not exist on that date (DST gap) or the
 * input is not a real calendar date/time. Seconds default to 00: new
 * entries have minute precision by design; preserved precision on
 * no-change edits is the save paths' job, not this helper's. */
function stampLocalInstant(dateISO, timeHHMM) {
  const dateParts = String(dateISO || '').split('-').map(Number);
  const timeParts = String(timeHHMM || '').split(':').map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2) return null;
  const [year, month, day] = dateParts;
  const [hour, minute] = timeParts;
  if (!isRealCalendarDate(year, month, day)) return null;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const instant = new Date(year, month - 1, day, hour, minute, 0);
  if (instant.getFullYear() !== year || instant.getMonth() !== month - 1 || instant.getDate() !== day
    || instant.getHours() !== hour || instant.getMinutes() !== minute) return null;
  const p2 = n => String(n).padStart(2, '0');
  return `${year}-${p2(month)}-${p2(day)}T${p2(hour)}:${p2(minute)}:00${utcOffsetSuffix(instant)}`;
}

function formatEditableDate(value) {
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
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
  const display = compact ? formatEditableDate(iso) : formatDate(iso, { month: 'short', day: 'numeric', year: 'numeric' });
  input.dataset.isoDate = iso;
  input.dataset.dateDisplay = display;
  input.value = display;
}

function readHumanDateInput(input, compact = false) {
  if (!input) return '';
  if (input.dataset.isoDate && input.dataset.dateDisplay === input.value) return input.dataset.isoDate;
  return compact ? parseEditableDate(input.value) : normalizeDateInput(input.value);
}

function downloadFile(filename, contents, type = 'application/octet-stream') {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* GRID//NODE stable product modules
 * SHOTS, Phase Engine, RESULTS, LAB, NODE, VAULT, and navigation.
 */

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
// Template-aware phase display name. The phase template structure now lives
// server-side (phase-state edge function); this resolves the template's phase
// names from a cache populated by GNPhaseTemplates.phaseState(). When the
// last shot's medication matches a template whose phase count equals the
// dashboard's fixed six-phase model (e.g. the GLP-1 weekly template), the
// dashboard card, header pill, and ALL PHASES list use the template's phase
// names so both surfaces agree ("PEAK EFFECT", not "PEAK WINDOW").
// Returns null when no template applies (or before the server state arrives;
// a background fetch warms the cache and re-renders via gn:phase-state-ready).
function templatePhaseName(lastShot, index) {
  try {
    const T = window.GNPhaseTemplates;
    if (!T || !lastShot || index < 0) return null;
    const med = normalizeMedicationId(lastShot.med) || '';
    let cached = null;
    try { cached = T.cachedState ? T.cachedState(med) : null; } catch (_) { cached = null; }
    if (!cached) {
      try {
        const shots = typeof sortedShots === 'function' ? sortedShots() : [];
        Promise.resolve(T.phaseState(med, shots, Date.now())).then(st => {
          if (st && !st.empty) {
            document.dispatchEvent(new CustomEvent('gn:phase-state-ready', { detail: { med } }));
          }
        }).catch(() => {});
      } catch (_) {}
      return null;
    }
    if (cached.empty) return null;
    const phases = cached.template && cached.template.phases;
    if (!Array.isArray(phases) || phases.length !== PHASES.length) return null;
    const tp = phases[index];
    return tp ? T.phaseName(tp) || null : null;
  } catch (_) { return null; }
}
const qa = selector => Array.from(document.querySelectorAll(selector));

const selectState = {};
window.selectState = selectState;

const moduleState = {
  scannerMode: 'core',
  selectedLocation: '',
  editingShotId: null,
  shotHistoryView: 'active',
  historyType: 'all',
  /* HISTORY render window (reliability audit item 7): how many records
   * the current history view materializes; grows by a page per
   * SHOW MORE tap and resets whenever the view's scope changes. */
  historyLimit: 50,
  historyLimitScope: '',
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
  { name: 'ONSET', support: 'Early in the cycle. Your first observations start shaping this signal.', context: 'Early in the cycle after your latest logged shot. Appetite, energy, symptoms, and notes begin shaping this signal.', color: '#4fb8d8', start: 0, end: 0.08 },
  { name: 'ACTIVE', support: 'Active window of the cycle. Compare with your own earlier cycles.', context: 'Active window of the cycle. Compare this point with your own earlier logged observations.', color: '#63b98b', start: 0.08, end: 0.28 },
  { name: 'PEAK WINDOW', support: 'Estimated highest relative level this cycle. Not a laboratory measurement.', context: 'Estimated highest relative level this cycle. Individual response varies; this is not a laboratory measurement.', color: '#e57f9e', start: 0.28, end: 0.52 },
  { name: 'RESPONSE', support: 'Mid-cycle estimate from your timing and logged history.', context: 'Mid-cycle estimate from your timing and logged history.', color: '#4aa89b', start: 0.52, end: 0.76 },
  { name: 'DECAY', support: 'Estimated level declining toward the next shot. Individual response varies.', context: 'Estimated level declining toward the next shot. Watch your own logged patterns; individual response varies.', color: '#c26674', start: 0.76, end: 0.94 },
  { name: 'BASELINE', support: 'Late-cycle estimate before the next shot. Keep logging your patterns.', context: 'Late-cycle estimate before the next shot. Keep logging your patterns.', color: '#9898b0', start: 0.94, end: 1 }
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
    installToastYield();
    return;
  }
  toast.innerHTML = `<span class="gn-toast-message">${safeText(`${prefix}${displayMessage}`)}</span>`;
  toast.className = `toast active${isError ? ' err' : ''}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('active'), 2000);
  installToastYield();
}

/* CLARITY PASS (QA toast-layering attribution, 2026-10-14): the shot-save
   toast (z-400, bottom-anchored) physically covered the weight modal's
   SAVE button (sheet z-200) for its full 5s life — it delayed, never
   trapped, but a toast must never cover a modal's primary action. Yield
   discipline, same family as the onboarding guide's non-overlap rule:
   (1) the toast body is pointer-events:none (CSS) so it can never block
   a tap — only its own buttons stay live; (2) while any modal overlay
   is active, syncToastYield docks the toast to the top of the screen,
   clear of the bottom sheets and their action bars. */
let gnToastYieldObserver = null;
function syncToastYield() {
  const toast = $('toastEl');
  if (!toast) return;
  const modalOpen = !!document.querySelector('.overlay.active, .gn-import-overlay.active, .gn-delete-overlay.active, .csv-import-overlay.active, .archive-confirm-overlay.active, .future-confirm-overlay.active, .gn-date-overlay.active, .gn-legal-modal.active');
  toast.classList.toggle('gn-toast-yield', modalOpen);
}
function installToastYield() {
  if (gnToastYieldObserver) { syncToastYield(); return; }
  try {
    gnToastYieldObserver = new MutationObserver(() => syncToastYield());
    gnToastYieldObserver.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  } catch (_) {}
  syncToastYield();
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

function refreshNodeHeader({ lastShot, phase } = {}) {
  const sync = nodeSyncLabel();
  const phaseIdx = phase ? PHASES.indexOf(phase) : -1;
  // Template-aware name so the header pill agrees with the dashboard card
  // and the RESULTS Phase Engine ("PEAK EFFECT", not "PEAK WINDOW").
  const phaseLabel = templatePhaseName(lastShot, phaseIdx) || localizedPhaseName(phase) || tx('runtime.awaitingFirstShot', 'AWAITING FIRST SHOT');
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

function showScreen(id) {
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

function showPage(name, navElement) {
  const previousPage = document.querySelector('.page.active')?.id || '';
  try { localStorage.setItem('gn_last_active_page_v1', previousPage.replace('page', '') || 'Dash'); } catch (e) {}
  const page = $(`page${name}`);
  if (!page) return;
  document.body.classList.toggle('gn-fab-hidden-context', ['Profile'].includes(name));
  qa('.page').forEach(item => item.classList.remove('active'));
  page.classList.add('active');
  qa('.nav-item').forEach(item => {
    item.classList.remove('active');
    item.removeAttribute('aria-current');
  });
  const nav = navElement || document.getElementById({ Dash: 'navDash', Log: 'navLog', Results: 'navRes', Lab: 'navLab', Profile: 'navVault' }[name]);
  if (nav) {
    nav.classList.add('active');
    nav.setAttribute('aria-current', 'page');
  }
  /* Code-split (2026-10-12): page renderers live in lazy chunks. When the
   * chunk is registered, render synchronously exactly as before. When it is
   * not, show the 11-ux-states loading pattern, load via GNEnsurePage, and
   * render on arrival only if this page is still the active one. */
  const rendererName = { Log: 'renderShots', Results: 'renderResults', Lab: 'renderLab', Profile: 'renderProfile' }[name];
  if (rendererName) {
    const renderer = window.GNModules && window.GNModules[rendererName];
    if (typeof renderer === 'function') renderer();
    else if (typeof window.GNEnsurePage === 'function') {
      showChunkLoading(page);
      window.GNEnsurePage(name).then(() => {
        hideChunkLoading(page);
        const fn = window.GNModules && window.GNModules[rendererName];
        if (page.classList.contains('active') && typeof fn === 'function') fn();
      }).catch(() => showChunkError(page, name));
    }
  }
  /* MOBILE-FIRST perf: scroll after render to avoid double full-document layout */
  $('scrollBody')?.scrollTo({ top: 0, behavior: 'auto' });
  document.dispatchEvent(new CustomEvent('gn:pagechange', { detail: { name, previousPage } }));
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.page.active')?.id === 'pageProfile') { if (typeof window.closeProfileHub === 'function') window.closeProfileHub(); } });
document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target && typeof e.target.matches === 'function' && e.target.matches('.cp-group-minimized')) { e.preventDefault(); e.target.click(); } });
/* TRACK 3 (2026-10-11): universal modal dismiss. This Escape handler is the
 * single registry for every modal/overlay surface — checked topmost-first so a
 * nested confirm closes before its parent. Two deliberate strict exceptions:
 * #futureTimestampConfirm (explicit choice required) and #gnLegalModal (boot
 * consent); everything else dismisses on Escape. The phase drill-down, peptide
 * evidence overlay, and first-shot celebrate keep their own local Escape
 * handlers; the assay modal closer is reached via window.GN_ASSAY. */
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (document.querySelector('#futureTimestampConfirm.active')) return;
  /* The native shell binds its own Escape keydown on overlay elements
   * (gridnode-native.js wireOverlayDismiss, same selector below): it clicks
   * the overlay's close/cancel control. When the keypress originated inside
   * such an overlay, that handler already ran during bubbling — skip the
   * document chain here to avoid double-handling (e.g. the native layer
   * dismisses the discard confirm, then closeLog() on the dirty sheet would
   * immediately re-open it). Overlays outside that selector (privacy, terms,
   * delete dialogs) and body-focus keypresses still use the chain. */
  var nativeLayer = e.target && e.target.closest ? e.target.closest('.overlay, .archive-confirm-overlay, .future-confirm-overlay, .gn-date-overlay, .csv-import-overlay, .gn-import-overlay, .gn-whatsnew-overlay, .gn-peptide-overlay, .gn-onb-overlay, .gn-lab-tool-overlay') : null;
  if (nativeLayer) return;
  var disc = document.getElementById('shotDiscardConfirmOv');
  if (disc && (disc.classList.contains('active') || getComputedStyle(disc).display !== 'none')) { if (typeof window.cancelShotDiscard === 'function') window.cancelShotDiscard(); return; }
  var chain = [
    ['#archiveConfirmOv', 'cancelArchiveShot'],
    ['#permanentDeleteConfirmOv', 'cancelPermanentDeleteShot'],
    ['#loadoutRemoveOverlay', 'cancelLoadoutRemove'],
    ['#gnDeleteLocalOverlay', 'closeDeleteLocalData'],
    ['#gnDeleteCloudOverlay', 'closeDeleteCloudAccount'],
    ['#arsOv', 'closeArs'],
    ['#phasesOv', 'closePhases'],
    ['#logOv', 'closeLog'],
    ['#wtOv', 'closeWt'],
    ['#signOutOverlay', 'closeSignOutModal'],
    ['#gnPrivacyOverlay', 'closePrivacyPolicy'],
    ['#gnTermsOverlay', 'closeTermsOfService'],
    ['#gnLabToolOverlay', 'closeLabTool']
  ];
  for (var i = 0; i < chain.length; i++) {
    if (document.querySelector(chain[i][0] + '.active')) {
      var fn = window[chain[i][1]];
      if (typeof fn === 'function') fn();
      return;
    }
  }
  if (document.querySelector('#gnAssayModalOv.active') && window.GN_ASSAY && typeof window.GN_ASSAY.closeAssayModal === 'function') {
    window.GN_ASSAY.closeAssayModal();
  }
});

/* TRACK 3 (2026-10-11): backdrop-tap-to-dismiss. A click that lands directly
 * on an overlay backdrop (event.target === the overlay element) dismisses it.
 * Skipped while a custom picker dropdown is open (the tap only closes the
 * picker), and for the two strict confirms (futureTimestampConfirm,
 * gnLegalModal) which require an explicit choice. Sign-out already had its own
 * backdrop listener (js/gridnode-app.js wireGlobalEvents); the drill-down and
 * assay modals have theirs too. */
document.addEventListener('click', function (e) {
  var target = e.target;
  if (!target || !target.id || !target.classList || !target.classList.contains('active')) return;
  var closer = {
    logOv: 'closeLog', wtOv: 'closeWt', arsOv: 'closeArs', phasesOv: 'closePhases',
    gnPrivacyOverlay: 'closePrivacyPolicy', gnTermsOverlay: 'closeTermsOfService',
    archiveConfirmOv: 'cancelArchiveShot', shotDiscardConfirmOv: 'cancelShotDiscard',
    permanentDeleteConfirmOv: 'cancelPermanentDeleteShot', loadoutRemoveOverlay: 'cancelLoadoutRemove',
    gnDeleteLocalOverlay: 'closeDeleteLocalData', gnDeleteCloudOverlay: 'closeDeleteCloudAccount'
  }[target.id];
  if (!closer) return;
  if (document.querySelector('.cp-dropdown.open, .gn-custom-picker.open, .gn-custom-date.open')) return;
  var fn = window[closer];
  if (typeof fn === 'function') fn();
});

function refreshAll() {
  /* Code-split: lazy page renderers are skipped until their chunk loads;
   * each page renders fresh on first navigation via the showPage hook. */
  if (typeof renderProfile === 'function') renderProfile();
  renderDashboard();
  if (typeof renderShots === 'function') renderShots();
  if (typeof renderResults === 'function') renderResults();
  if (typeof renderScanner === 'function') renderScanner();
  if (typeof renderLab === 'function') renderLab();
  renderCalendar();
}

/* Chunk loading state (css/native/11-ux-states.css patterns): skeleton card
 * inside a .gn-chunk-loading host + .gn-ux-syncing on the page; the error
 * state reuses .gn-ux-sync-error with a RETRY that re-runs the page load.
 * Page renderers write to their own containers and never touch this host;
 * it is removed before the renderer runs. */
function showChunkLoading(page) {
  hideChunkLoading(page);
  page.classList.add('gn-ux-syncing');
  const host = document.createElement('div');
  host.className = 'gn-chunk-loading';
  host.setAttribute('role', 'status');
  host.innerHTML = '<div class="gn-skeleton-card"><div class="gn-skeleton gn-skeleton-line mid"></div><div class="gn-skeleton gn-skeleton-line"></div><div class="gn-skeleton gn-skeleton-line short"></div></div>';
  page.prepend(host);
}
function hideChunkLoading(page) {
  page.classList.remove('gn-ux-syncing');
  page.querySelectorAll('.gn-chunk-loading').forEach(el => el.remove());
}
function showChunkError(page, name) {
  page.classList.remove('gn-ux-syncing');
  let host = page.querySelector('.gn-chunk-loading');
  if (!host) { host = document.createElement('div'); host.className = 'gn-chunk-loading'; page.prepend(host); }
  host.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'gn-ux-sync-error';
  const title = document.createElement('b');
  title.textContent = tx('runtime.chunkLoadFailedTitle', 'THIS SECTION COULD NOT LOAD');
  const copy = document.createElement('span');
  copy.textContent = tx('runtime.chunkLoadFailed', 'Check your connection and try again. Your data is safe on this device.');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = tx('runtime.retry', 'RETRY');
  retry.addEventListener('click', () => { if (typeof window.showPage === 'function') window.showPage(name); });
  box.append(title, copy, retry);
  host.append(box);
}

function loadApp() {
  const profile = getProfile();
  moduleState.selectedLocation = normalizeLegacyText(S.get('selectedLocation', moduleState.selectedLocation || ''));
  syncIdentityAvatars();
  /* v0.15.41 S16: zero-shot users (no name, no shots) get plain chrome
     instead of unexplained NODE jargon. Named or active users keep the
     NODE-flavored identity line. */
  renderDashSub();
  const displayName = window.CU?.defaultName || profile.name || '';
  let zeroShot = !displayName;
  try { zeroShot = zeroShot && !(typeof sortedShots === 'function' && sortedShots().length); } catch (_) {}
  setText('profSub', zeroShot ? '// PROFILE //' : `// ${displayName || 'NODE_USER'} //`);
  setText('profNameTxt', displayName || tx('profile.anonFallback', 'NODE_USER'));
  setText('profEmail', sessionLabel());
  setText('profMedTxt', normalizeMedicationId(profile.med) ? `// ${medicationLabel(profile.med).toUpperCase()}` : tx('profile.noMedicationSet', '// NO MEDICATION SET'));
  hydrateProfileFields(profile);
  setTodayDefaults();
  refreshAll();
}

function setText(id, value) { const element = $(id); if (element) element.textContent = value; }
function setDisplay(id, visible) { const element = $(id); if (element) element.style.display = visible ? '' : 'none'; }

/* Track 6 auth parity: dashSub zero-shot copy is mode-aware. Cloud-signed-in
   users with no name/shots see the cloud variant instead of the false
   local-only claim. Named or active users keep the NODE identity line. */
function renderDashSub() {
  const profile = getProfile();
  const displayName = window.CU?.defaultName || profile.name || '';
  let zeroShot = !displayName;
  try { zeroShot = zeroShot && !(typeof sortedShots === 'function' && sortedShots().length); } catch (_) {}
  if (!zeroShot) {
    setText('dashSub', tx('dashboard.nodeOnline', '// {name} // NODE ONLINE', { name: displayName || 'NODE_USER' }));
    return;
  }
  setText('dashSub', state.cloud
    ? tx('dashboard.zeroShotCloudSub', 'SYNCED TO YOUR CLOUD')
    : tx('dashboard.zeroShotSub', 'STORED ON THIS DEVICE'));
}
/* i18n applyTo() resets [data-i18n] elements on gn:langchange, which would
   restore the static local-only copy for cloud users; refreshAll() does not
   re-render dashSub, so re-apply the mode-aware copy here. */
document.addEventListener('gn:langchange', () => { try { renderDashSub(); } catch (_) {} });

// B15 (2026-08-08): number tickers. Stats count up/down over ~600ms with
// ease-out; changed numbers flash Mars Red (200ms fade). Only animates on
// actual value change; reduced-motion renders instantly. Tracks previous
// value per element id so repeated renders with the same value stay still.
const _tickerPrev = new Map();
function animateNumber(element, from, to, duration) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !Number.isFinite(from) || !Number.isFinite(to) || from === to) {
    element.textContent = String(to);
    return;
  }
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const value = Math.round(from + (to - from) * eased);
    element.textContent = String(value);
    if (t < 1) requestAnimationFrame(frame);
    else element.textContent = String(to);
  }
  requestAnimationFrame(frame);
}
function setNumericText(id, rawValue) {
  const element = $(id);
  if (!element) return;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) { element.textContent = String(rawValue ?? ''); return; }
  const prev = _tickerPrev.has(id) ? _tickerPrev.get(id) : value;
  _tickerPrev.set(id, value);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || prev === value) {
    element.textContent = String(value);
    return;
  }
  element.classList.remove('gn-ticker-flash');
  void element.offsetWidth;
  element.classList.add('gn-ticker-flash');
  animateNumber(element, prev, value, 600);
  setTimeout(() => element.classList.remove('gn-ticker-flash'), 260);
}

function syncIdentityAvatars() {
  const avatarUrl = window.CU?.avatarUrl || '/assets/brand/icons/pwa-192.png';
  ['topAvaIcon', 'profAvaIcon'].forEach(id => {
    const image = $(id);
    if (!image) return;
    image.src = avatarUrl;
    image.alt = avatarUrl === '/assets/brand/icons/pwa-192.png' ? 'GRID//NODE mark' : 'Google account profile photo';
  });
}

function computeTotalChange(weights = [], profile = {}, baseline = 'profile') {
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
function resetShotFormState() {
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

function saveProfileMed() {
  const profile = profileSnapshot();
  const saved = S.set('profile', profile);
  setText('profMedTxt', normalizeMedicationId(profile.med) ? `// ${medicationLabel(profile.med).toUpperCase()}` : tx('profile.noMedicationSet', '// NO MEDICATION SET'));
  if (saved) queueCloudSync('profile', profile);
  showToast(saved ? tx('profile.protocolSaved', 'Profile protocol context saved.') : tx('profile.storageFull', 'Profile could not be saved — storage is full.'), !saved);
}

function saveProfileMetrics() {
  const profile = profileSnapshot();
  if (S.set('profile', profile)) queueCloudSync('profile', profile);
  calcAndShowBMI();
}

function calcAndShowBMI() {
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

function toggleSelect(id) {
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

function selectOpt(id, value, label, callback) {
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

async function retryCloudHydration() {
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

function showPhasesModal() {
  const content = $('allPhasesContent');
  let lastShot = null;
  try { lastShot = sortedShots().at(-1) || null; } catch (_) {}
  if (content) content.innerHTML = PHASES.map((phase, index) => {
    const name = templatePhaseName(lastShot, index) || localizedPhaseName(phase);
    return '<div class="gn-phase-row"><span class="gn-phase-index">0' + (index + 1) + '</span><div><b style="color:' + phase.color + '">' + safeText(name) + '</b><p>' + safeText(localizedPhaseSupport(phase)) + '</p></div></div>';
  }).join('');
  $('phasesOv')?.classList.add('active');
}
function closePhases() { $('phasesOv')?.classList.remove('active'); }

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
function showLabSeg(segment, button) {
  qa('[data-labseg-block]').forEach(block => block.style.display = block.dataset.labsegBlock === segment ? 'block' : 'none');
  qa('#labSegTabs .time-tab').forEach(item => item.classList.toggle('active', item === button || item.dataset.labseg === segment));
  /* Code-split: renderLab lives in the lab chunk; the segment tabs only
   * exist on the LAB page (loaded via the showPage hook), but never throw
   * if a wrapped caller (lab-tests assay wrap) fires early. */
  if (typeof renderLab === 'function') renderLab();
  else if (typeof window.GNEnsurePage === 'function') window.GNEnsurePage('Lab');
}
function showYouSeg(segment, button) {
  qa('[data-youseg-block]').forEach(block => block.style.display = block.dataset.yousegBlock === segment ? 'block' : 'none');
  qa('#youSegTabs .time-tab').forEach(item => item.classList.toggle('active', item === button || item.dataset.youseg === segment));
}

function closeCustomPickers(except) {
  qa('.gn-custom-picker.open,.gn-custom-date.open').forEach(wrapper => {
    if (wrapper === except) return;
    wrapper.classList.remove('open');
    wrapper.querySelector('[aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
  });
}

function populateCustomPickerMenu(select, menu, wrapper, trigger) {
  menu.replaceChildren();
  Array.from(select.options).forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gn-custom-picker-option';
    button.dataset.gnPickerValue = option.value;
    button.setAttribute('role', 'option');
    button.disabled = option.disabled;
    button.textContent = option.dataset.i18n ? tx(option.dataset.i18n, option.textContent) : option.textContent;
    button.addEventListener('click', () => {
      select.value = option.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncCustomPicker(select);
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus({ preventScroll: true });
    });
    menu.appendChild(button);
  });
}

function syncCustomPicker(select) {
  const wrapper = select?.closest('.gn-custom-picker');
  const trigger = wrapper?.querySelector('[data-gn-picker-trigger]');
  const menu = wrapper?.querySelector('.gn-custom-picker-menu');
  const option = Array.from(select?.options || []).find(item => item.value === select.value) || select?.options?.[0];
  if (!wrapper || !trigger || !menu || !option) return;
  const sourceValues = Array.from(select.options).map(item => item.value);
  const renderedValues = Array.from(menu.querySelectorAll('[data-gn-picker-value]')).map(item => item.dataset.gnPickerValue);
  if (sourceValues.length !== renderedValues.length || sourceValues.some((value, index) => renderedValues[index] !== value)) {
    populateCustomPickerMenu(select, menu, wrapper, trigger);
  }
  trigger.textContent = option.textContent;
  wrapper.querySelectorAll('[data-gn-picker-value]').forEach(button => {
    const source = Array.from(select.options).find(item => item.value === button.dataset.gnPickerValue);
    if (source) button.textContent = source.textContent;
    button.setAttribute('aria-selected', String(button.dataset.gnPickerValue === select.value));
    button.disabled = Boolean(source?.disabled);
  });
}

function installCustomSelect(select) {
  if (!select || select.dataset.gnPickerWired) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'gn-custom-picker';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'gn-custom-picker-trigger';
  trigger.dataset.gnPickerTrigger = 'true';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.className = 'gn-custom-picker-menu';
  menu.setAttribute('role', 'listbox');
  select.hidden = true;
  select.setAttribute('aria-hidden', 'true');
  select.dataset.gnPickerWired = 'true';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(trigger, menu, select);
  populateCustomPickerMenu(select, menu, wrapper, trigger);
  trigger.addEventListener('click', () => {
    const open = !wrapper.classList.contains('open');
    closeCustomPickers(wrapper);
    wrapper.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      syncCustomPicker(select);
      window.requestAnimationFrame(() => (menu.querySelector('[aria-selected="true"]:not(:disabled)') || menu.querySelector('button:not(:disabled)'))?.focus());
    }
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Escape' && wrapper.classList.contains('open')) {
      event.preventDefault();
      event.stopPropagation();
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    closeCustomPickers(wrapper);
    wrapper.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    syncCustomPicker(select);
    const options = Array.from(menu.querySelectorAll('button:not(:disabled)'));
    (event.key === 'ArrowUp' ? options.at(-1) : options.find(item => item.getAttribute('aria-selected') === 'true') || options[0])?.focus();
  });
  menu.addEventListener('keydown', event => {
    const options = Array.from(menu.querySelectorAll('button:not(:disabled)'));
    const index = options.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); wrapper.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? Math.min(options.length - 1, index + 1) : Math.max(0, index - 1);
    options[next]?.focus();
  });
  select.addEventListener('change', () => syncCustomPicker(select));
  syncCustomPicker(select);
}

function renderCustomDatePopover(wrapper) {
  const month = wrapper._month;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const label = wrapper.querySelector('[data-gn-date-label]');
  const grid = wrapper.querySelector('[data-gn-date-grid]');
  if (!label || !grid) return;
  label.textContent = month.toLocaleDateString(document.documentElement.lang?.startsWith('es') ? 'es-419' : 'en-US', { month: 'long', year: 'numeric' });
  const first = new Date(year, monthIndex, 1).getDay();
  const total = new Date(year, monthIndex + 1, 0).getDate();
  const selected = wrapper.input.value || '';
  const dayLabels = document.documentElement.lang?.startsWith('es') ? ['D', 'L', 'M', 'X', 'J', 'V', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  grid.innerHTML = `${dayLabels.map(day => `<span class="gn-custom-date-dow">${day}</span>`).join('')}${Array.from({ length: first }, () => '<span class="gn-custom-date-blank"></span>').join('')}${Array.from({ length: total }, (_, index) => { const day = index + 1, value = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return `<button type="button" class="gn-custom-date-day${value === selected ? ' selected' : ''}" data-gn-date-value="${value}">${day}</button>`; }).join('')}`;
}

function syncCustomDate(input) {
  const wrapper = input?.closest('.gn-custom-date');
  const trigger = wrapper?.querySelector('[data-gn-date-trigger]');
  if (!wrapper || !trigger) return;
  trigger.textContent = input.value ? formatDate(input.value, { month: 'short', day: 'numeric', year: 'numeric' }) : tx('research.selectDate', 'SELECT DATE');
}

function installCustomDate(input) {
  if (!input || input.dataset.gnDateWired) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'gn-custom-date';
  wrapper.input = input;
  wrapper._month = input.value ? parseLocalDate(input.value) : new Date();
  wrapper._month = new Date(wrapper._month.getFullYear(), wrapper._month.getMonth(), 1);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'gn-custom-date-trigger';
  trigger.dataset.gnDateTrigger = 'true';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  const popover = document.createElement('div');
  popover.className = 'gn-custom-date-popover';
  popover.id = `${input.id || createId('date')}-popover`;
  popover.setAttribute('role', 'dialog');
  trigger.setAttribute('aria-controls', popover.id);
  popover.innerHTML = '<div class="gn-custom-date-head"><button type="button" data-gn-date-prev aria-label="' + tx('date.prevMonth', 'Previous month') + '">‹</button><strong data-gn-date-label></strong><button type="button" data-gn-date-next aria-label="' + tx('date.nextMonth', 'Next month') + '">›</button></div><div class="gn-custom-date-grid" data-gn-date-grid></div><div class="gn-custom-date-foot"><button type="button" data-gn-date-today data-i18n="date.useToday">' + tx('date.useToday', 'USE TODAY') + '</button><button type="button" data-gn-date-close data-i18n="date.close">' + tx('date.close', 'CLOSE') + '</button></div>';
  input.type = 'text';
  input.readOnly = true;
  input.hidden = true;
  input.setAttribute('aria-hidden', 'true');
  input.dataset.gnDateWired = 'true';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(trigger, popover, input);
  window.GN_I18N?.applyTo?.(popover);

  function closeDatePopover({ restoreFocus = false } = {}) {
    wrapper.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => {
    const open = !wrapper.classList.contains('open');
    closeCustomPickers(wrapper);
    wrapper.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) { wrapper._month = input.value ? new Date(`${input.value}T00:00:00`) : new Date(); wrapper._month = new Date(wrapper._month.getFullYear(), wrapper._month.getMonth(), 1); renderCustomDatePopover(wrapper); }
  });
  popover.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-gn-date-prev')) wrapper._month.setMonth(wrapper._month.getMonth() - 1);
    else if (target.hasAttribute('data-gn-date-next')) wrapper._month.setMonth(wrapper._month.getMonth() + 1);
    else if (target.hasAttribute('data-gn-date-today')) {
      input.value = todayISO();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      wrapper._month = new Date();
      wrapper._month = new Date(wrapper._month.getFullYear(), wrapper._month.getMonth(), 1);
      syncCustomDate(input);
      closeDatePopover({ restoreFocus: true });
    }
    else if (target.dataset.gnDateValue) {
      input.value = target.dataset.gnDateValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      syncCustomDate(input);
      closeDatePopover({ restoreFocus: true });
    }
    else if (target.hasAttribute('data-gn-date-close')) closeDatePopover({ restoreFocus: true });
    renderCustomDatePopover(wrapper);
  });
  input.addEventListener('change', () => syncCustomDate(input));
  syncCustomDate(input);
}

function syncCustomPickers(root = document) {
  root.querySelectorAll('.gn-custom-picker select').forEach(syncCustomPicker);
  root.querySelectorAll('.gn-custom-date input').forEach(syncCustomDate);
}

function installCustomPickers(root = document) {
  root.querySelectorAll('select:not([data-gn-picker-wired])').forEach(installCustomSelect);
  root.querySelectorAll('input[type="date"]:not([data-gn-date-wired])').forEach(installCustomDate);
  if (!document.body.dataset.gnPickerDismiss) {
    document.body.dataset.gnPickerDismiss = 'true';
    document.addEventListener('click', event => { if (!event.target.closest('.gn-custom-picker,.gn-custom-date')) closeCustomPickers(); });
  }
}

function renderCalendar() {
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
function calPrev() { moduleState.calendarDate.setMonth(moduleState.calendarDate.getMonth() - 1); renderCalendar(); }
function calNext() { moduleState.calendarDate.setMonth(moduleState.calendarDate.getMonth() + 1); renderCalendar(); }
function calDayClick(day) { moduleState.selectedCalendarDay = day; renderCalendar(); }

function openArsenalMod(type = 'compound', editId = null) { moduleState.arsenalEditId = editId; $('arsTitle')?.replaceChildren(document.createTextNode(editId ? tx('shots.editContext', 'EDIT CONTEXT') : tx('shots.addContext', 'ADD CONTEXT'))); $('arsOv')?.classList.add('active'); }
function closeArs() { $('arsOv')?.classList.remove('active'); moduleState.arsenalEditId = null; }
function saveArs() { const items = S.get('arsenal', []); const record = { id: moduleState.arsenalEditId || createId('context'), name: $('aName')?.value?.trim(), concentration: Number($('aConc')?.value) || null, volume: Number($('aVol')?.value) || null, quantity: Number($('aQty')?.value) || 1, reviewDate: $('aExpiry')?.value || '' }; if (!record.name) { showToast(tx('shots.contextNameRequired', 'Enter a context name.'), true); return; } const index = items.findIndex(item => item.id === record.id); if (index >= 0) items[index] = record; else items.push(record); S.set('arsenal', items); queueCloudSync('workspace'); closeArs(); showToast(tx('lab.saveContext', 'VAULT context saved.')); }
function requestLoadoutRemove(id) { moduleState.pendingArsenalId = id; $('loadoutRemoveOverlay')?.classList.add('active'); }
function cancelLoadoutRemove() { moduleState.pendingArsenalId = null; $('loadoutRemoveOverlay')?.classList.remove('active'); }
function confirmLoadoutRemove() { const next = S.get('arsenal', []).filter(item => item.id !== moduleState.pendingArsenalId); S.set('arsenal', next); queueCloudSync('workspace'); cancelLoadoutRemove(); showToast(tx('shots.contextRemoved', 'Context removed.')); }

function formatTime24(date) { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
function formatTime12(date) { const hour = date.getHours() % 12 || 12; return `${hour}:${String(date.getMinutes()).padStart(2, '0')}`; }
function getShotTime24(value) { const raw = String(value || '').trim().toUpperCase(); const suffix = moduleState.meridiem; const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/); if (!match) return ''; let hour = Number(match[1]), minute = Number(match[2] || '00'); if (suffix === 'PM' && hour < 12) hour += 12; if (suffix === 'AM' && hour === 12) hour = 0; return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : ''; }
function gnSetShotMeridiem(value) { moduleState.meridiem = value === 'PM' ? 'PM' : 'AM'; updateMeridiemButtons(); }
function updateMeridiemButtons() {
  const isAM = moduleState.meridiem === 'AM';
  const isPM = moduleState.meridiem === 'PM';
  const am = $('sTimeAM'), pm = $('sTimePM');
  am?.classList.toggle('active', isAM);
  pm?.classList.toggle('active', isPM);
  // v0.15.53: expose the state to assistive tech — the visual .active class
  // alone never reached the accessibility tree.
  am?.setAttribute('aria-pressed', String(isAM));
  pm?.setAttribute('aria-pressed', String(isPM));
}
function gnShotClockLiveFormat(input) { if (!input) return; input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4).replace(/^(\d{1,2})(\d{2})$/, '$1:$2'); }
function gnNormalizeShotClockField(input) { if (!input) return; const parsed = getShotTime24(input.value); if (parsed) { const date = new Date(`2000-01-01T${parsed}`); input.value = formatTime12(date); } }
function gnWeightDateInput(input) {
  if (!input) return;
  input.value = input.value.replace(/[^0-9\/-]/g, '').slice(0, 10);
  delete input.dataset.isoDate;
  delete input.dataset.dateDisplay;
}
function gnWeightTimeInput(input) { if (input) input.value = input.value.replace(/[^0-9:]/g, '').slice(0, 5); }
function renderShotDatePicker() {
  const month = moduleState.shotPickerMonth;
  const label = $('gnDatePickerMonth');
  const grid = $('gnDatePickerGrid');
  if (!label || !grid) return;
  label.textContent = month.toLocaleDateString(document.documentElement.lang?.startsWith('es') ? 'es-419' : 'en-US', { month: 'long', year: 'numeric' });
  const year = month.getFullYear(), monthIndex = month.getMonth(), first = new Date(year, monthIndex, 1).getDay(), total = new Date(year, monthIndex + 1, 0).getDate();
  const selected = moduleState.shotPickerSelected || '';
  const weekdays = document.documentElement.lang?.startsWith('es') ? ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'] : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  grid.innerHTML = `${weekdays.map(day => `<div class="gn-date-dow">${day}</div>`).join('')}${Array.from({ length: first }, () => '<button type="button" class="gn-date-day blank" tabindex="-1"></button>').join('')}${Array.from({ length: total }, (_, index) => { const day = index + 1, value = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return `<button type="button" class="gn-date-day${value === selected ? ' selected' : ''}" data-gn-picker-date="${value}"><span>${day}</span></button>`; }).join('')}`;
}
function gnOpenShotDatePicker() {
  const input = $('sDate');
  if (!input) return;
  const selected = readHumanDateInput(input) || todayISO();
  moduleState.shotPickerOriginal = { value: input.value, isoDate: input.dataset.isoDate || selected, dateDisplay: input.dataset.dateDisplay || input.value };
  moduleState.shotPickerSelected = selected;
  const parsed = parseLocalDate(selected);
  moduleState.shotPickerMonth = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  setHumanDateInput(input, selected);
  input.type = 'text'; input.setAttribute('readonly', 'readonly');
  renderShotDatePicker();
  $('gnDatePickerOverlay')?.classList.add('active');
}
function gnCloseShotDatePicker() { const input = $('sDate'); if (input && moduleState.shotPickerOriginal !== null) { input.value = moduleState.shotPickerOriginal.value; input.dataset.isoDate = moduleState.shotPickerOriginal.isoDate; input.dataset.dateDisplay = moduleState.shotPickerOriginal.dateDisplay; } moduleState.shotPickerOriginal = null; $('gnDatePickerOverlay')?.classList.remove('active'); if (input) { input.type = 'text'; input.setAttribute('readonly', 'readonly'); } }
function gnDatePickerMove(delta) { moduleState.shotPickerMonth.setMonth(moduleState.shotPickerMonth.getMonth() + Number(delta || 0)); renderShotDatePicker(); }
function gnSelectPickerDate(date) { moduleState.shotPickerSelected = normalizeDateInput(date) || todayISO(); renderShotDatePicker(); }
function gnSetShotDateFromPicker() { if (moduleState.shotPickerSelected) setHumanDateInput($('sDate'), moduleState.shotPickerSelected); moduleState.shotPickerOriginal = null; $('gnDatePickerOverlay')?.classList.remove('active'); }
function gnSetShotDateValue(value) { setHumanDateInput($('sDate'), value); }
function gnSetShotTimeValue(value) { if ($('sTime')) $('sTime').value = formatTime12(new Date(`2000-01-01T${value}`)); }
function gnMedRevealGroup(dropId, group) {
  const drop = $(dropId);
  if (!drop) return;
  qa('[data-gn-med-options]', drop).forEach(block => {
    const isActive = block.dataset.gnMedOptions === group;
    block.classList.toggle('gn-revealed', isActive);
    block.style.display = '';
  });
}
function updatePills() {
  const med = normalizeMedicationId(selectState.cpShotMed?.val);
  const container = $('dosePills'); if (!container) return;
  /* CLARITY PASS (P5): dose shortcuts come ONLY from the user's own logged
     doses for this medication, newest first — never from app presets. A
     preset row reads as a recommended amount, and this product does not
     recommend doses (release condition). No history -> no shortcuts, just
     the input. The profile's stored dose is not used either: it is a
     setting, not a logged entry. */
  const recent = [];
  if (med) {
    const mine = (typeof getAllShots === 'function' ? getAllShots() : [])
      .filter(s => s && !s.archived && normalizeMedicationId(s.med) === med)
      .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
    for (const s of mine) {
      const d = Number(s.dose);
      if (Number.isFinite(d) && d > 0 && !recent.includes(d) && recent.length < 4) recent.push(d);
    }
  }
  container.innerHTML = recent.length
    ? `<div class="dose-pills-caption">${safeText(tx('shot.yourRecentDoses', 'YOUR RECENT DOSES'))}</div>` + recent.map(value => `<button type="button" class="dose-pill" data-dose="${value}">${value} mg</button>`).join('')
    : '';
  container.style.display = recent.length ? '' : 'none';
  setText('profMedTxt', med ? `// ${medicationLabel(med).toUpperCase()}` : tx('profile.noMedicationSet', '// NO MEDICATION SET'));
}
function selPill(button, dose) {
  const el = $('sDose');
  if (el) {
    el.value = dose;
    /* v0.15.37: dose pills set the value programmatically, which fires no
       input/change. The native session draft (gridnode-native.js) only
       captures on input/change, so a pill-picked dose went stale there and
       restoreShotDraft() wiped it on the next modal reopen (e.g. the
       injection-zone round trip), unchecking the coach's dose step. */
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  qa('.dose-pill').forEach(item => item.classList.toggle('active', item === button));
}

function wireSelectOptions() {
  const callbacks = { saveProfileMed, saveProfileMetrics, updatePills };
  qa('.cp-option').forEach(option => {
    const inline = option.getAttribute('onclick') || '';
    const match = inline.match(/^selectOpt\('([^']*)','([^']*)','([^']*)'/);
    if (!match || option.dataset.gnSelectWired) return;
    const callbackName = /saveProfileMed/.test(inline) ? 'saveProfileMed' : /saveProfileMetrics/.test(inline) ? 'saveProfileMetrics' : /updatePills/.test(inline) ? 'updatePills' : '';
    option.dataset.gnSelectWired = 'true';
    option.removeAttribute('onclick');
    option.addEventListener('click', () => selectOpt(match[1], match[2], match[3], callbacks[callbackName] || null));
  });
}

function initModules() {
  /* v0.15.43: initScannerAudioControl was removed by the simplicity cut
     (single sound setting); its dangling call here threw a ReferenceError
     that aborted the whole delegated click listener below, silently
     breaking dose pills, shot actions, calendar days, etc. */
  document.addEventListener('click', event => {
    const zone = event.target.closest('[data-stable-zone]');
    if (zone) selectScannerLocation(zone.dataset.stableZone, { source: 'fallback' });
    const historyButton = event.target.closest('[data-shot-history-view]');
    if (historyButton) setShotHistoryView(historyButton.dataset.shotHistoryView);
    const historyTypeButton = event.target.closest('[data-history-type]');
    if (historyTypeButton) setHistoryType(historyTypeButton.dataset.historyType);
    const shotAction = event.target.closest('[data-shot-action]');
    if (shotAction) { const action = shotAction.dataset.shotAction, id = shotAction.dataset.shotId; if (action === 'edit') editShot(id); if (action === 'archive') openArchiveConfirm(id); if (action === 'restore') restoreArchivedShot(id); if (action === 'restore-edit') restoreArchivedShotToEdit(id); if (action === 'delete') openPermanentDeleteConfirm(id); }
    if (event.target.closest('[data-empty-shot]')) handleShotFab();
    const pickerDay = event.target.closest('[data-gn-picker-date]'); if (pickerDay) gnSelectPickerDate(pickerDay.dataset.gnPickerDate);
    const calendarDay = event.target.closest('[data-calendar-day]'); if (calendarDay) calDayClick(calendarDay.dataset.calendarDay);
    const dosePill = event.target.closest('.dose-pill'); if (dosePill) selPill(dosePill, Number(dosePill.dataset.dose));
    const researchPick = event.target.closest('[data-research-name]');
    if (researchPick) {
      const pickName = researchPick.dataset.researchName || '';
      const mode = $('gnResearchMode');
      if (pickName) {
        if (mode) { mode.style.display = ''; mode.dataset.mode = 'library'; }
        const mlc = $('gnModeLibraryChip'), mcc = $('gnModeCategoryChip'), mcb = $('gnModeBack');
        if (mlc) { mlc.style.display = ''; mlc.textContent = tx('research.modeLibrarySelected', 'BIBLIOTECA · SELECCIONADA') + ' ' + tx('research.lockGlyph', '🔒'); }
        if (mcc) { mcc.style.display = ''; mcc.textContent = tx('research.modeCategoryAssigned', 'CATEGORÍA · ASIGNADA') + ' ' + tx('research.lockGlyph', '🔒'); }
        if (mcb) mcb.style.display = 'none';
        const customTitle = document.querySelector('.gn-research-mode-custom .gn-research-mode-title');
        if (customTitle) customTitle.style.display = 'none';
        if ($('gnResearchName')) {
          $('gnResearchName').value = pickName;
          $('gnResearchName').readOnly = true;
          $('gnResearchName').setAttribute('data-research-locked', '1');
        }
        const category = $('gnResearchCategory');
        if (category) { category.dataset.categoryId = researchPick.dataset.researchCategory || 'lab.customResearch'; category.value = researchCategoryLabel(category.dataset.categoryId); category.readOnly = true; category.setAttribute('data-category-locked', '1'); }
        $('gnResearchName')?.setAttribute('placeholder', tx('research.presetLockedPlaceholder', 'Library entry — name is locked'));
        const badgeHost = $('gnResearchForm')?.querySelector('[data-research-badge]');
        if (badgeHost) badgeHost.textContent = tx('research.presetBadge', 'PRESET');
        const customSave = $('gnResearchSave');
        if (customSave) customSave.textContent = tx('research.save', 'SAVE RESEARCH RECORD');
        const cw = $('gnCustomWarning');
        if (cw) cw.style.display = 'none';
        // B12 rev (2026-08-08): after picking a peptide, bring the form
        // into view so NOMBRE + CATEGORÍA are visibly auto-filled —
        // the user can log in ≤3 taps + fill on a 360px screen.
        $('gnResearchForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        researchEnterCustomMode();
        $('gnResearchForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    const researchDelete = event.target.closest('[data-research-delete]'); if (researchDelete) deleteResearchRecord(researchDelete.dataset.researchDelete);
  });
  document.addEventListener('click', event => { if (!event.target.closest('.cp-select')) { qa('.cp-dropdown.open').forEach(item => item.classList.remove('open')); qa('.cp-select-trigger.open').forEach(item => item.classList.remove('open')); } });
  wireSelectOptions();
  installCustomPickers(document);
  $('gnResearchCategory')?.addEventListener('input', event => { delete event.currentTarget.dataset.categoryId; if ($('gnResearchName')) { $('gnResearchName').readOnly = false; $('gnResearchName').removeAttribute('data-research-locked'); const bH = $('gnResearchForm')?.querySelector('[data-research-badge]'); if (bH) bH.textContent = ''; $('gnResearchName')?.setAttribute('placeholder', tx('research.recordNamePlaceholder', 'Select a library entry or type a custom name')); } });
  const scrollBody = $('scrollBody');
  if (scrollBody && !scrollBody.dataset.gnSwipeWired) {
    let touchStartX = 0;
    let touchStartY = 0;
    scrollBody.dataset.gnSwipeWired = 'true';
    scrollBody.addEventListener('touchstart', event => {
      const point = event.touches[0];
      touchStartX = point?.clientX || 0;
      touchStartY = point?.clientY || 0;
    }, { passive: true });
    scrollBody.addEventListener('touchend', event => {
      const point = event.changedTouches[0];
      const dx = (point?.clientX || 0) - touchStartX;
      const dy = (point?.clientY || 0) - touchStartY;
      if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return;
      const pages = ['navDash', 'navLog', 'navRes', 'navLab'];
      const current = pages.findIndex(id => document.getElementById(id)?.classList.contains('active'));
      if (current < 0) return;
      if (dx > 0 && current > 0) document.getElementById(pages[current - 1])?.click();
      if (dx < 0 && current < pages.length - 1) document.getElementById(pages[current + 1])?.click();
    }, { passive: true });
  }
  /* TRACK 2: the // MORE DETAILS toggle moved to gnToggleShotAdvanced()
     (js/modules/05-log-shot.js), wired inline on the button. The old
     initModules one-liner double-toggled with it, so it is retired. */
  setTodayDefaults();
  /* Code-split: the scanner lives in the history chunk. This was the only
   * boot-time scanner render and #pageLog is hidden at boot, so deferring
   * it to the first Log navigation (showPage hook) loses nothing. */
  if (typeof renderScanner === 'function') renderScanner();
}


/* v0.15.19 - install pointer handlers on first user interaction with scanner */
/* Code-split: the installers live in the history chunk (04), which may not
 * be loaded at DOMContentLoaded/load. Guarded here; the chunk loader calls
 * them again when the history chunk registers. */
document.addEventListener("DOMContentLoaded", () => { if (typeof installScannerPointerHandlers === 'function') installScannerPointerHandlers(); if (typeof installScannerDebugMode === 'function') installScannerDebugMode(); });
window.addEventListener("load", () => { if (typeof installScannerPointerHandlers === 'function') installScannerPointerHandlers(); if (typeof installScannerDebugMode === 'function') installScannerDebugMode(); });

/* ── S2: TRUST GRAMMAR helpers ──────────────────────────────────────────
   Semantics are structural (solid/dashed/outlined), never color-only.
   trustBadge(kind) is the ONLY way to render a trust badge: the system owns
   color, border style, and label, so semantics can't drift into decoration.
   Copy rules: RECORDED = exact values allowed ("Logged"); ESTIMATE = "~",
   "Estimated"/"Modeled", never "your level is"; PLAN = "Planned"/"Scheduled",
   never "next dose" unless user-authored; STATUS = operational states. */
const TRUST_BADGE_LABELS = { recorded: 'RECORDED', estimate: 'ESTIMATE', plan: 'PLAN' };
function trustBadge(kind) {
  const key = String(kind || '').toLowerCase();
  if (!TRUST_BADGE_LABELS[key]) return '';
  const label = tx('trust.' + key, TRUST_BADGE_LABELS[key]);
  return `<span class="gn-trust-badge gn-trust-${key}">${safeText(label)}</span>`;
}
// Approximate language for estimates: rounds to nearest 5, prefixes "~".
// 62.73 -> "~65%", never false precision.
function approxPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return '~' + (Math.round(n / 5) * 5) + '%';
}
function approxNum(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const rounded = n >= 100 ? Math.round(n / 5) * 5 : Math.round(n * 10) / 10;
  return '~' + rounded + (unit ? ' ' + unit : '');
}
/* GRID//NODE — haptic wiring for HUD taps, dose-save (prototype).
 *
 * Thin adapter over the canonical window.gnHaptics module (js/modules/08-lab.js,
 * added 2026-09-06 in 6e1dcca "premium feel pass + opt-in tactile feedback").
 * v0.15.41 — VIBRATION REMOVED at founder direction (2026-09-12). The canonical
 * module is now a hard no-op for vibration, so every trigger wired below is
 * silently inert. This file is kept so the wiring (throttle, event listeners)
 * stays intact if vibration ever returns under a new directive; no vibration
 * fires from it today, regardless of stored preferences.
 * Original wiring notes (pre-removal):
 *   - light tick on HUD button taps (delegated, throttled)
 *   - double-tick when the SOUND switch turns on, single tick when off
 *   - success nudge on gn:shot-saved (dose-save has no actionFeedback path,
 *     so there is no double-fire with the existing confirm vibration)
 */

const GN_HAPTIC_TAP_THROTTLE_MS = 70;

let gnLastTapAt = 0;

function gnHap() {
  try { return window.gnHaptics || null; }
  catch (_) { return null; }
}

/* Light tick for HUD taps — the "premium" micro feedback. Throttled. */
function gnHapticTick() {
  const now = Date.now();
  if (now - gnLastTapAt < GN_HAPTIC_TAP_THROTTLE_MS) return;
  gnLastTapAt = now;
  const h = gnHap();
  if (h) { try { h.tap(); } catch (_) {} }
}

function gnHapticSetEnabled(on) {
  const h = gnHap();
  if (h) { try { h.setEnabled(!!on); } catch (_) {} }
}

window.GN_HAPTICS = {
  tick: gnHapticTick,
  success() { const h = gnHap(); if (h) { try { h.fire([10, 60, 20]); } catch (_) {} } },
  setEnabled: gnHapticSetEnabled,
  get enabled() { try { const h = gnHap(); return !!(h && h.enabled()); } catch (_) { return false; } },
  get supported() { try { const h = gnHap(); return !!(h && h.supported()); } catch (_) { return false; } },
};

/* Mirror the SFX tap delegation: same HUD controls. Button handlers run
 * before document-level bubbling listeners. */
document.addEventListener('click', (e) => {
  if (!e.isTrusted) return;
  const t = e.target && e.target.closest ? e.target : null;
  if (!t) return;
  const h = gnHap();
  if (!h) return;
  if (t.closest('.btn,.btn-primary,.btn-full,.sec-act,.time-tab,.topbar-btn,.scanner-mode-btn,.phase-sphere-action,.gn-peptide-expand')) gnHapticTick();
});

/* Dose-logged success nudge — listens, does not touch 05-log-shot.js. */
document.addEventListener('gn:shot-saved', () => {
  const h = gnHap();
  if (h) { try { h.fire([10, 60, 20]); } catch (_) {} }
});

window.GNModules={getProfile:getProfile,getProfileForEvidence:getProfileForEvidence,selectState:selectState,moduleState:moduleState,refreshNodeHeader:refreshNodeHeader,showScreen:showScreen,showPage:showPage,refreshAll:refreshAll,loadApp:loadApp,computeTotalChange:computeTotalChange,resetShotFormState:resetShotFormState,saveProfileMed:saveProfileMed,saveProfileMetrics:saveProfileMetrics,calcAndShowBMI:calcAndShowBMI,toggleSelect:toggleSelect,selectOpt:selectOpt,retryCloudHydration:retryCloudHydration,showPhasesModal:showPhasesModal,closePhases:closePhases,showLabSeg:showLabSeg,showYouSeg:showYouSeg,renderCalendar:renderCalendar,calPrev:calPrev,calNext:calNext,calDayClick:calDayClick,openArsenalMod:openArsenalMod,closeArs:closeArs,saveArs:saveArs,requestLoadoutRemove:requestLoadoutRemove,cancelLoadoutRemove:cancelLoadoutRemove,confirmLoadoutRemove:confirmLoadoutRemove,formatTime24:formatTime24,formatTime12:formatTime12,gnSetShotMeridiem:gnSetShotMeridiem,gnShotClockLiveFormat:gnShotClockLiveFormat,gnNormalizeShotClockField:gnNormalizeShotClockField,gnWeightDateInput:gnWeightDateInput,gnWeightTimeInput:gnWeightTimeInput,gnOpenShotDatePicker:gnOpenShotDatePicker,gnCloseShotDatePicker:gnCloseShotDatePicker,gnDatePickerMove:gnDatePickerMove,gnSelectPickerDate:gnSelectPickerDate,gnSetShotDateFromPicker:gnSetShotDateFromPicker,gnSetShotDateValue:gnSetShotDateValue,gnSetShotTimeValue:gnSetShotTimeValue,gnMedRevealGroup:gnMedRevealGroup,updatePills:updatePills,selPill:selPill,initModules:initModules,trustBadge:trustBadge,approxPct:approxPct,approxNum:approxNum};

const modules=window.GNModules;

/* GRID//NODE stable app bootstrap
 * Auth UI, boot sequence, compatibility bridge for existing inline controls.
 */

let bootRunning = false;
let authMode = 'signin';
let passwordRecoveryActive = false;
let googleIdentityPromise = null;
let googleIdentityInitialized = false;
/* QA WebKit hardening (2026-10-14): GIS popup failure surfacing state.
   With ux_mode 'popup', a failed popup (e.g. origin_mismatch on an
   unregistered origin in Safari/WebKit) or a popup closed without
   signing in never invokes the credential callback — the app showed
   nothing and the button read as dead. The watchdog below arms when
   focus moves into the GIS iframe (a real click/keyboard activation
   of the Google button) and, if focus returns with no credential
   delivered, surfaces auth.googleDidNotComplete once. The happy path
   is untouched: handleGoogleCredential disarms before anything else. */
let googlePopupWatchInstalled = false;
let googlePopupAttemptAt = 0;
let googleCredentialSeen = false;

function bridge() {
  const names = [
    'showScreen', 'showPage', 'refreshAll', 'loadApp', 'showPhasesModal', 'closePhases',
    'openLogModal', 'closeLog', 'saveShot', 'editShot', 'handleShotFab',
    'gnShotStepNext', 'gnShotStepBack', 'gnShotPrimaryAction', 'gnToggleShotAdvanced',
    'openArchiveConfirm', 'cancelArchiveShot', 'confirmArchiveShot', 'restoreArchivedShot',
    'openPermanentDeleteConfirm', 'cancelPermanentDeleteShot', 'confirmPermanentDeleteShot',
    'openFutureTimestampConfirm', 'closeFutureTimestampConfirm', 'cancelFutureTimestampSave',
    'confirmFutureTimestampSave', 'setScannerMode',
    'selectScannerLocation', 'renderScanner', 'openWeightModal', 'closeWt', 'saveWt',
    'setWeightUnit', 'setRange', 'setWtRange', 'showLabSeg', 'showYouSeg', 'toggleSelect',
    'selectOpt', 'saveProfileMed', 'saveProfileMetrics', 'calcAndShowBMI', 'updatePills',
    'selPill', 'gnMedRevealGroup', 'gnSetShotMeridiem', 'gnShotClockLiveFormat',
    'gnNormalizeShotClockField', 'gnWeightDateInput', 'gnWeightTimeInput', 'gnOpenShotDatePicker',
    'gnCloseShotDatePicker', 'gnDatePickerMove', 'gnSelectPickerDate', 'gnSetShotDateFromPicker',
    'gnSetShotDateValue', 'gnSetShotTimeValue', 'updateSyr', 'updateRecon', 'updateSupply',
    'exportCSV', 'exportBackup', 'exportInventory', 'handleCSVImportFile', 'cancelCSVImport', 'confirmCSVImport', 'prepareCSVImport',
    'openImportDialog', 'closeImportDialog', 'handleBackupImportFile', 'confirmBackupImport',
    'handleShotsyJSONFile', 'toggleImportForce', 'parseShotsyJSON',
    'openDeleteLocalData', 'closeDeleteLocalData', 'updateDeleteLocalButton', 'confirmDeleteLocalData',
    'openDeleteCloudAccount', 'closeDeleteCloudAccount', 'confirmDeleteCloudAccount',
    'saveMeasurements', 'setMeasurementUnit', 'updateDoseProjection', 'saveCalculatorReference',
    'calPrev', 'calNext', 'calDayClick', 'openArsenalMod', 'closeArs', 'saveArs',
    'requestLoadoutRemove', 'cancelLoadoutRemove', 'confirmLoadoutRemove',
    'refreshNodeHeader', 'openLabTool', 'closeLabTool',
    'dismissSystemUpdate', 'openSystemUpdate', 'setResultsView',
    'openPrivacyPolicy', 'closePrivacyPolicy', 'openDataOwnership', 'openTermsOfService', 'closeTermsOfService', 'replayGuidedTour'
  ];
  /* Code-split (2026-10-12): for names whose module ships as a lazy chunk,
   * modules[name] is undefined at bridge time. Do not clobber an existing
   * function (the chunk loader's delegate-after-load stub, or a chunk that
   * already registered) with undefined. */
  names.forEach(name => { if (typeof modules[name] !== 'undefined' || typeof window[name] !== 'function') window[name] = modules[name]; });
  window.refreshAll = modules.refreshAll;
  /* ASSAY storage bridge (audit 2026-10-08): window.GNModules was never
   * assigned, so the standalone lab-tests IIFE silently no-oped on save/load.
   * Expose the lab-test storage helpers here. Code-split: assign INTO the
   * bundle's live registry (window.GNModules === modules) instead of
   * replacing it, so chunk registrations land in the same object. */
  window.GNModules = Object.assign(window.GNModules || modules, modules, {
    getLabTests, getAllLabTests, setLabTests, queueCloudSync, recoverPendingSync
  });
  window.GN_NATIVE?.bridgeReady?.();
}

function injectStableStyles() {
  const style = document.createElement('style');
  style.id = 'gridnode-stable-runtime-styles';
  style.textContent = `
    .gn-research-context{display:block;margin:-2px 0 5px;color:#d6c297;font:500 .48rem/1.35 var(--font-m,monospace);letter-spacing:.45px}
    .gn-stable-zone-picker{display:grid;gap:7px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,212,255,.12)}
    .gn-stable-zone-title{font:700 .58rem/1.2 var(--font-m,monospace);letter-spacing:2px;color:#00d4ff;margin-bottom:2px}
    .gn-stable-zone-btn{min-height:38px;padding:9px 10px;border:1px solid rgba(0,212,255,.2);background:rgba(0,212,255,.035);color:#9fc7d4;text-align:left;font:600 .68rem var(--font-m,monospace);letter-spacing:.5px;cursor:pointer;border-radius:3px}
    .gn-stable-zone-btn:hover,.gn-stable-zone-btn.selected{border-color:#00d4ff;background:rgba(0,212,255,.13);color:#fff;box-shadow:0 0 12px rgba(0,212,255,.12)}
    .gn-cloud-status{display:flex;align-items:center;gap:8px;margin:-10px 0 18px;padding:10px 12px;border:1px solid rgba(0,212,255,.16);background:rgba(0,212,255,.035);font:600 .6rem var(--font-m,monospace);letter-spacing:.8px;color:#8aa9b5}
    .gn-cloud-dot{width:7px;height:7px;border-radius:50%;background:#ffd700;box-shadow:0 0 8px currentColor;flex:0 0 auto}.gn-cloud-dot.cloud{background:#00ff88;color:#00ff88}.gn-cloud-dot.local{background:#ffd700;color:#ffd700}
    .gn-auth-card{width:min(100%,480px);margin:0 auto;box-sizing:border-box;padding:32px 24px;border:1px solid rgba(0,212,255,.24);border-top:2px solid #00d4ff;background:linear-gradient(180deg,rgba(14,14,22,.96),rgba(5,5,8,.98));box-shadow:0 16px 46px rgba(0,0,0,.45)}
    .gn-auth-kicker{font:700 .62rem var(--font-m,monospace);letter-spacing:3px;color:#00d4ff;text-align:center}@media(max-width:480px){.gn-auth-kicker{margin-right:54px;font-size:.56rem;letter-spacing:1px}}.gn-auth-title{font:800 1.35rem var(--font-d,monospace);letter-spacing:3px;color:#fff;text-align:center;margin:14px 0 6px}.gn-auth-copy{font:.78rem/1.55 var(--font-m,monospace);color:#9fc7d4;text-align:center;margin:0 auto 22px;max-width:38ch}
    .gn-auth-field{width:100%;box-sizing:border-box;margin:0 0 10px;padding:13px 12px;border:1px solid rgba(0,212,255,.2);background:#080810;color:#eeeef5;border-radius:3px;font:16px var(--font-m,monospace);outline:none}.gn-auth-field:focus{border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.1)}
    .gn-auth-primary,.gn-auth-passkey,.gn-auth-google{width:100%;min-height:52px;margin-top:10px;border-radius:3px;cursor:pointer;font:700 .72rem var(--font-d,monospace);letter-spacing:2px}.gn-auth-primary{border:0;background:linear-gradient(135deg,#FF3B3B,#D12424);color:#fff}.gn-auth-passkey{display:flex;align-items:center;justify-content:center;gap:10px;border:0;background:linear-gradient(135deg,#FF3B3B,#D12424);color:#fff}.gn-auth-passkey .gn-passkey-icon{font-size:1rem}.gn-auth-google{border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);color:#00d4ff}.gn-auth-google:disabled{cursor:not-allowed;opacity:.55;border-color:rgba(130,149,160,.28);color:#8295a0;box-shadow:none}.gn-auth-primary-label{margin-top:4px;color:#00d4ff;font:700 .52rem var(--font-m,monospace);letter-spacing:2px;text-align:left}.gn-google-button-shell{width:100%;min-height:54px;margin-top:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:0;border-radius:3px}.gn-google-button-shell.loading{pointer-events:none;opacity:.55}.gn-google-button-shell>div{max-width:100%}.gn-auth-divider{display:flex;align-items:center;gap:12px;margin:18px 0 4px;color:#8295a0;font:600 .6rem var(--font-m,monospace);letter-spacing:2px;text-transform:uppercase}.gn-auth-divider::before,.gn-auth-divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.12)}.gn-auth-local{display:block;width:100%;min-height:44px;margin-top:10px;padding:8px 12px;border:0;background:transparent;color:#8295a0;font:600 .62rem var(--font-m,monospace);letter-spacing:1.4px;cursor:pointer;text-align:center}.gn-auth-local:hover{color:#00d4ff}.gn-auth-privacy{display:grid;gap:4px;margin-top:12px;padding:10px 11px;border-left:2px solid #00d4ff;background:rgba(0,212,255,.045);color:#9fc7d4;font:.58rem/1.45 var(--font-m,monospace)}.gn-auth-privacy strong{color:#e8fcff;letter-spacing:1px}.gn-auth-options{margin-top:16px;border-top:1px solid rgba(255,255,255,.07);padding-top:12px}.gn-auth-options summary{cursor:pointer;color:#8295a0;font:700 .56rem var(--font-m,monospace);letter-spacing:1.4px;list-style:none}.gn-auth-options summary::-webkit-details-marker{display:none}.gn-auth-options[open] summary{color:#00d4ff;margin-bottom:10px}.gn-auth-links{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.gn-auth-link{padding:0;border:0;background:transparent;color:#8295a0;font:600 .58rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}.gn-auth-link:hover{color:#00d4ff}.gn-auth-message{min-height:22px;margin-top:14px;text-align:center;font:.62rem/1.4 var(--font-m,monospace);letter-spacing:.7px;color:#8295a0}.gn-auth-note{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);font:.56rem/1.5 var(--font-m,monospace);letter-spacing:.6px;color:#586d76;text-align:center}.gn-auth-policy-link{margin-top:16px;text-align:center}.gn-auth-policy-link button{padding:6px 10px;border:0;background:transparent;color:#586d76;font:600 .56rem var(--font-m,monospace);letter-spacing:1.2px;cursor:pointer}.gn-auth-policy-link button:hover{color:#00d4ff}
    /* v0.15.55: calm entry flow — two choices, legal gate moved to a modal */
    .gn-auth-secondary{width:100%;min-height:52px;margin-top:16px;border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);color:#00d4ff;border-radius:3px;cursor:pointer;font:700 .72rem var(--font-d,monospace);letter-spacing:2px}
    .gn-auth-secondary:hover{border-color:#00d4ff;background:rgba(0,212,255,.09)}
    .gn-auth-secondary[aria-expanded="true"]{border-color:#00d4ff;color:#fff;background:rgba(0,212,255,.1)}
    .gn-legal-modal-title{margin:0 0 16px;color:#00d4ff;font:700 .66rem var(--font-d,monospace);letter-spacing:2px}
    .gn-legal-intro{margin:-8px 0 16px;color:var(--text-2,#b7c7d3);font:.68rem/1.55 var(--font-m,monospace)}
    .gn-entry-label{margin:16px 0 2px;color:var(--brand-cyan,#00d4ff);font:700 var(--kicker-size,.62rem) var(--font-m,monospace);letter-spacing:2px;text-align:center}
    .gn-entry-local{width:100%;min-height:56px;margin-top:14px;padding:10px 12px;border:1px solid var(--border-cyan,rgba(0,212,255,.4));background:rgba(0,212,255,.05);color:var(--brand-cyan,#00d4ff);border-radius:var(--radius-control,3px);cursor:pointer;font:700 .72rem var(--font-d,monospace);letter-spacing:1.6px}
    .gn-entry-local:hover{border-color:var(--brand-cyan,#00d4ff);background:rgba(0,212,255,.1)}
    .gn-entry-local .gn-quiet-sub{display:block;margin-top:4px;color:var(--text-2,#b7c7d3);font:500 .58rem var(--font-m,monospace);letter-spacing:.6px}
    .gn-entry-key{color:var(--text-1,#eef6f8)}
    #login>div[hidden]{display:none!important}
    .gn-legal-modal{position:fixed;inset:0;z-index:200;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(2,2,8,.82);backdrop-filter:blur(8px)}
    .gn-legal-modal.active{display:flex}
    .gn-legal-modal-card{width:min(100%,440px);max-height:88vh;overflow-y:auto;box-sizing:border-box;padding:24px 20px;border:1px solid rgba(0,212,255,.35);border-top:2px solid #00d4ff;background:#0a0a12;box-shadow:0 24px 60px rgba(0,0,0,.6)}
    .gn-legal-check{display:flex;gap:12px;align-items:flex-start;margin:0 0 14px;cursor:pointer;color:#9fc7d4;font:.66rem/1.55 var(--font-m,monospace)}
    .gn-legal-check input{flex:0 0 auto;width:20px;height:20px;margin:0;accent-color:#00d4ff;cursor:pointer}
    .gn-legal-link{padding:0;border:0;background:transparent;color:#00d4ff;font:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
    .gn-legal-link:hover{color:#fff}
    .gn-legal-under18{display:block;margin:0 0 0 auto;padding:8px 2px;border:0;background:transparent;color:#586d76;font:600 .58rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}
    .gn-legal-under18:hover{color:#FF5B5B}
    .gn-legal-modal-msg{min-height:20px;margin:2px 0 10px;text-align:center;font:.62rem/1.4 var(--font-m,monospace);letter-spacing:.7px;color:#8295a0}
    .gn-legal-modal-msg[data-tone="error"]{color:#FF5B5B}
    .gn-legal-modal-actions{display:grid;gap:8px;margin-top:4px}
    .gn-legal-modal-actions .gn-auth-primary{margin-top:0}
    .gn-legal-modal-cancel{padding:12px;border:0;background:transparent;color:#8295a0;font:600 .62rem var(--font-m,monospace);letter-spacing:2px;cursor:pointer}
    .gn-legal-modal-cancel:hover{color:#fff}
    .gn-phase-row{display:flex;gap:12px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.07)}.gn-phase-index{font:700 .72rem var(--font-m,monospace);color:#FF3B3B}.gn-phase-row b{font:700 .72rem var(--font-d,monospace);letter-spacing:1px}.gn-phase-row p{margin:4px 0 0;color:#8295a0;font:.66rem/1.4 var(--font-m,monospace)}
    .gn-weight-record{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)}.gn-weight-record b{display:block;color:#00ff88;font:700 .78rem var(--font-d,monospace)}.gn-weight-record span,.gn-weight-record small{display:block;margin-top:3px;color:#8295a0;font:.6rem var(--font-m,monospace)}.gn-calendar-detail{padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07);font:.66rem var(--font-m,monospace);color:#9fc7d4}
    .gn-toast-kicker{display:none}.gn-toast-message{display:block;font:600 .68rem var(--font-d,monospace);letter-spacing:.7px;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gn-wanda-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 14px}.gn-wanda-card{min-width:0;padding:12px;border:1px solid rgba(0,212,255,.17);border-left:2px solid #00d4ff;background:linear-gradient(135deg,rgba(0,212,255,.055),rgba(0,0,0,.24));color:#eef6f8;text-align:left;cursor:pointer}.gn-wanda-card:hover,.gn-wanda-card:focus-visible{border-color:#00d4ff;background:rgba(0,212,255,.1);outline:none}.gn-wanda-label{display:block;color:#8295a0;font:700 .5rem var(--font-m,monospace);letter-spacing:1.3px}.gn-wanda-value{display:block;margin-top:6px;overflow:hidden;text-overflow:ellipsis;color:#eef6f8;font:800 .9rem var(--font-d,monospace);letter-spacing:.6px;white-space:nowrap}.gn-wanda-note{display:block;margin-top:4px;color:#8295a0;font:.56rem/1.35 var(--font-m,monospace)}.gn-wanda-card.attention{border-color:#FF3B3B}.gn-wanda-card.attention .gn-wanda-value{color:#FF5B5B}.gn-wanda-card.empty .gn-wanda-value{color:#6f828c}.gn-wanda-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:-4px 0 16px}.gn-wanda-actions button{min-height:43px;border:1px solid rgba(0,212,255,.35);background:rgba(0,212,255,.045);color:#00d4ff;font:700 .62rem var(--font-d,monospace);letter-spacing:1.3px;cursor:pointer}.gn-wanda-actions button:first-child{border-color:rgba(255,59,59,.5);background:rgba(255,59,59,.06);color:#FF5B5B}
    .gn-weekly-report{margin:0 0 14px;padding:14px;border:1px solid rgba(0,212,255,.2);border-top:2px solid #00d4ff;background:linear-gradient(180deg,rgba(8,20,27,.92),rgba(6,8,13,.96))}.gn-weekly-report h3{margin:0;color:#eef6f8;font:800 .85rem var(--font-d,monospace);letter-spacing:1.8px}.gn-weekly-report p{margin:8px 0 0;color:#9fc7d4;font:.68rem/1.5 var(--font-m,monospace)}.gn-weekly-signals{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:11px}.gn-weekly-signals span{padding:8px;border:1px solid rgba(0,212,255,.12);color:#8295a0;font:.54rem/1.35 var(--font-m,monospace)}.gn-weekly-signals b{display:block;margin-top:3px;color:#00ff88;font-size:.68rem}
    .gn-log-step{margin:0 0 8px;color:#00d4ff;font:700 .53rem var(--font-m,monospace);letter-spacing:1.8px}.gn-shot-optional{margin-top:10px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px}.gn-shot-optional summary{cursor:pointer;color:#8295a0;font:700 .56rem var(--font-m,monospace);letter-spacing:1.2px}.cp-dropdown{max-height:40vh!important;overflow-y:auto!important}.toast{bottom:calc(84px + var(--safe-bottom))!important;left:auto!important;right:10px!important;width:min(330px,calc(100vw - 20px))!important;padding:9px 11px!important}.toast .gn-toast-kicker{font-size:.49rem}.toast .gn-toast-message{font-size:.64rem}
    .gn-lab-breadcrumb{margin:0 0 10px;color:#8295a0;font:600 .54rem var(--font-m,monospace);letter-spacing:1px}.gn-lab-breadcrumb b{color:#00d4ff}.gn-foundation-grid{grid-template-columns:repeat(2,1fr)!important}.gn-foundation-tile{min-height:86px}.gn-foundation-panel.gn-tool-focus .gn-foundation-section:not([open]){display:none}.gn-reference-pending{margin:0 0 14px;padding:11px;border-left:2px solid #8295a0;background:rgba(130,149,160,.055);color:#91a5ae;font:.6rem/1.45 var(--font-m,monospace)}
    @media(max-width:620px){.gn-wanda-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gn-weekly-signals{grid-template-columns:1fr}.scroll-body{padding-bottom:calc(66px + var(--safe-bottom))!important}.page-hdr{margin-bottom:12px!important}.card,.phase-card,.results-card{margin-bottom:10px!important}.bottom-nav{height:62px!important}.nav-lbl{font-size:.51rem!important;color:#8ea2b0!important}.nav-item.active .nav-lbl{color:#00d4ff!important}.nav-ico{opacity:.82}.nav-item.active .nav-ico{opacity:1}.gn-foundation-grid{grid-template-columns:1fr 1fr!important}}
    @media(max-width:340px){.gn-wanda-grid{grid-template-columns:1fr}.gn-wanda-card{padding:10px}.gn-foundation-grid{grid-template-columns:1fr!important}}
    @media(prefers-reduced-motion:reduce){.gn-next-overdue{animation:none!important}}
    .gn-foundation-panel,.gn-profile-hub{margin:0 0 18px;padding:15px;border:1px solid rgba(0,212,255,.2);border-top:2px solid #00d4ff;background:linear-gradient(180deg,rgba(12,18,25,.92),rgba(7,8,13,.96));box-shadow:0 10px 28px rgba(0,0,0,.22)}.gn-foundation-head,.gn-device-vault-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.gn-foundation-kicker{font:700 .53rem var(--font-m,monospace);letter-spacing:2px;color:#00d4ff;margin-bottom:5px}.gn-foundation-head h2,.gn-device-vault-head h3{margin:0;color:#eef6f8;font:700 1rem var(--font-d,monospace);letter-spacing:2px}.gn-foundation-head h2 span,.gn-device-vault-head h3{color:#ffb000}.gn-foundation-signal{font:600 .5rem var(--font-m,monospace);letter-spacing:1px;color:#00ff88;text-align:right}.gn-foundation-grid,.gn-hub-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:14px}.gn-hub-grid{grid-template-columns:repeat(2,1fr)}.gn-foundation-tile,.gn-hub-grid>div{min-width:0;padding:11px;border:1px solid rgba(0,212,255,.15);background:rgba(0,212,255,.025);text-align:left;color:#e9f5f7}.gn-foundation-tile{cursor:pointer}.gn-foundation-tile.active,.gn-foundation-tile:hover{border-color:#00d4ff;background:rgba(0,212,255,.1)}.gn-foundation-icon{display:block;margin-bottom:8px}.gn-foundation-tile b,.gn-hub-grid b{display:block;font:700 .6rem var(--font-d,monospace);letter-spacing:1px}.gn-foundation-tile small,.gn-hub-grid small{display:block;margin-top:4px;color:#8295a0;font:.57rem/1.35 var(--font-m,monospace)}.gn-foundation-section{border-top:1px solid rgba(255,255,255,.08);padding-top:12px;margin-top:12px}.gn-foundation-section summary{display:flex;justify-content:space-between;gap:10px;cursor:pointer;color:#eef6f8;font:700 .65rem var(--font-d,monospace);letter-spacing:1.5px}.gn-foundation-section summary em{font:500 .52rem var(--font-m,monospace);color:#8295a0;font-style:normal;letter-spacing:1px;text-align:right}.gn-research-notice{display:grid;gap:5px;margin:12px 0;padding:10px;border-left:3px solid #ffb000;background:rgba(255,176,0,.06);color:#d6c297;font:.59rem/1.45 var(--font-m,monospace)}.gn-research-notice strong{color:#ffd000;letter-spacing:1px}.gn-research-library{display:grid;gap:9px;margin:12px 0}.gn-research-group>span{display:block;margin-bottom:5px;color:#8295a0;font:600 .52rem var(--font-m,monospace);letter-spacing:1px}.gn-research-group>div{display:flex;flex-wrap:wrap;gap:5px}.gn-research-group button{padding:7px 8px;border:1px solid rgba(0,212,255,.2);background:rgba(0,212,255,.035);color:#a9dce8;font:600 .58rem var(--font-m,monospace);cursor:pointer}.gn-research-group button:hover{border-color:#00d4ff;color:#fff;background:rgba(0,212,255,.12)}.gn-record-form{display:grid;gap:9px;margin-top:12px}.gn-form-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.gn-record-form label{display:grid;gap:5px;color:#8295a0;font:600 .52rem var(--font-m,monospace);letter-spacing:1px}.gn-record-form input,.gn-record-form select,.gn-record-form textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid rgba(0,212,255,.18);background:#080810;color:#eef6f8;font:16px var(--font-m,monospace);outline:none;border-radius:2px;resize:vertical}.gn-record-form input:focus,.gn-record-form select:focus,.gn-record-form textarea:focus{border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.08)}.gn-record-list,.gn-device-list,.gn-ledger-list{display:grid;gap:0;margin-top:12px}.gn-record-row,.gn-ledger-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;padding:10px 0;border-top:1px solid rgba(255,255,255,.07)}.gn-record-row b,.gn-ledger-row b{display:block;color:#eef6f8;font:700 .62rem var(--font-d,monospace);letter-spacing:1px}.gn-record-row small,.gn-ledger-row small{display:block;margin-top:3px;color:#8295a0;font:.56rem var(--font-m,monospace)}.gn-record-state{color:#00ff88;font:600 .5rem var(--font-m,monospace);letter-spacing:.7px;white-space:nowrap}.gn-record-delete{border:0;background:transparent;color:#FF5B5B;font-size:1rem;cursor:pointer}.gn-empty-state{display:grid;justify-items:start;gap:5px;padding:16px 0;color:#8295a0;font:.6rem/1.4 var(--font-m,monospace)}.gn-empty-state b{color:#a9dce8;letter-spacing:1px}.gn-ledger-copy{margin:10px 0;color:#8295a0;font:.6rem/1.45 var(--font-m,monospace)}.gn-ledger-row{grid-template-columns:auto 1fr auto}.gn-ledger-dot{width:6px;height:6px;border-radius:50%;background:#00d4ff;box-shadow:0 0 8px #00d4ff}.gn-ledger-row em{font:500 .5rem var(--font-m,monospace);color:#8295a0;text-align:right;font-style:normal}.gn-device-vault{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
    .gn-profile-sections{display:grid;gap:12px;margin:4px 0 16px}.gn-profile-section{overflow:hidden;border:1px solid rgba(0,212,255,.16);background:rgba(0,0,0,.2)}.gn-profile-section-label{padding:10px 12px;color:#00d4ff;font:700 .55rem var(--font-m,monospace);letter-spacing:2px;border-bottom:1px solid rgba(0,212,255,.13)}.gn-profile-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:13px 12px;border:0;border-top:1px solid rgba(255,255,255,.07);background:transparent;color:#eef6f8;text-align:left;text-decoration:none;cursor:pointer}.gn-profile-section .gn-profile-row:first-of-type{border-top:0}.gn-profile-row:hover,.gn-profile-row:focus-visible{background:rgba(0,212,255,.07);outline:none}.gn-profile-row b{display:block;font:700 .62rem var(--font-d,monospace);letter-spacing:1px}.gn-profile-row small{display:block;margin-top:4px;color:#8295a0;font:.58rem/1.35 var(--font-m,monospace)}.gn-profile-chevron{color:#00d4ff;font:700 1.1rem var(--font-m,monospace);line-height:1}.gn-profile-signout{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;margin:0 0 16px;padding:14px 12px;border:1px solid rgba(255,59,59,.55);border-left:3px solid #FF3B3B;background:rgba(255,59,59,.045);color:#fff;text-align:left;cursor:pointer}.gn-profile-signout:hover,.gn-profile-signout:focus-visible{background:rgba(255,59,59,.1);outline:none}.gn-profile-signout b{display:block;color:#FF5B5B;font:700 .68rem var(--font-d,monospace);letter-spacing:1.5px}.gn-profile-signout small{display:block;margin-top:4px;color:#b58b96;font:.58rem var(--font-m,monospace)}.gn-profile-danger-row b{color:#FF5B5B}.gn-research-disclaimer{margin:12px 0 0;padding:10px;border-top:1px solid rgba(255,255,255,.08);color:#8295a0;font:.58rem/1.45 var(--font-m,monospace)}.landing-footer-honesty{margin:16px 0 0;color:#8295a0;font:.65rem/1.5 var(--font-m,monospace);letter-spacing:.4px}
    .gn-shot-filters{margin:10px 0 14px;border:1px solid rgba(0,212,255,.18);background:rgba(0,212,255,.025);padding:10px 12px}.gn-shot-filters summary{cursor:pointer;color:#9fc7d4;font:700 .6rem var(--font-m,monospace);letter-spacing:1.5px}.gn-shot-filter-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}.gn-shot-filter-grid label,.gn-measurements-tools label,.gn-dose-grid label{display:grid;gap:5px;color:#8295a0;font:600 .53rem var(--font-m,monospace);letter-spacing:1px}.gn-shot-filter-grid select,.gn-shot-filter-grid input,.gn-measurements-tools select,.gn-measurements-tools input,.gn-dose-grid input{box-sizing:border-box;width:100%;padding:9px 8px;border:1px solid rgba(0,212,255,.18);background:#080810;color:#eef6f8;font:16px var(--font-m,monospace);border-radius:2px}.gn-filter-count{color:#ffd700;margin-left:7px}.gn-shot-filter-clear{margin-top:10px;padding:8px 10px;border:1px solid rgba(255,215,0,.38);background:transparent;color:#ffd700;font:700 .55rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}.gn-next-today{border-color:#FF3B3B!important;box-shadow:0 0 18px rgba(255,59,59,.18)}.gn-next-tomorrow{border-color:#00d4ff!important}.gn-next-overdue{border-color:#FF3B3B!important;animation:gnShotOverdue 1.8s ease-in-out infinite}.gn-next-today .stat-sub,.gn-next-overdue .stat-sub{color:#FF5B5B!important}@keyframes gnShotOverdue{50%{box-shadow:0 0 20px rgba(255,59,59,.22)}}
    .gn-measurements-card,.gn-dose-projection{margin:0 0 20px;padding:16px;border:1px solid rgba(0,212,255,.2);border-top:2px solid #00d4ff;background:linear-gradient(180deg,rgba(12,18,25,.92),rgba(7,8,13,.96));box-shadow:0 10px 28px rgba(0,0,0,.2)}.gn-measurements-card h3,.gn-dose-projection h2{margin:0;color:#eef6f8;font:700 1rem var(--font-d,monospace);letter-spacing:2px}.gn-measurements-copy,.gn-dose-copy{margin:7px 0 14px;color:#8295a0;font:.62rem/1.45 var(--font-m,monospace)}.gn-measurements-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.gn-measurements-grid,.gn-dose-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.gn-measurements-grid>label{display:grid;gap:5px;padding:9px;border:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.2);color:#9fc7d4;font:600 .53rem var(--font-m,monospace);letter-spacing:.7px}.gn-measurements-grid>label span{display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap}.gn-measurements-grid small{color:#8295a0;font-weight:400;letter-spacing:0;text-align:right}.gn-measurements-grid input{box-sizing:border-box;width:100%;padding:9px 8px;border:1px solid rgba(0,212,255,.18);background:#080810;color:#eef6f8;font:16px var(--font-m,monospace)}.gn-measurements-empty{margin-top:10px;color:#8295a0;font:.6rem var(--font-m,monospace)}.gn-measurement-trend-list{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:10px}.gn-measurement-trend-row{display:flex;justify-content:space-between;gap:8px;padding:9px;border:1px solid rgba(0,212,255,.12);color:#9fc7d4;font:.58rem var(--font-m,monospace)}.gn-measurement-trend-row span{color:#00ff88}.gn-dose-grid{grid-template-columns:repeat(4,1fr)}.gn-dose-output{margin-top:12px;padding:12px;border-left:3px solid #00d4ff;background:rgba(0,212,255,.05);color:#e8fcff;font:.7rem/1.7 var(--font-m,monospace)}.gn-dose-disclaimer{margin-top:10px;padding:11px;border:1px solid rgba(255,215,0,.45);border-left:3px solid #ffd700;background:rgba(255,215,0,.06);color:#f1d982;font:.62rem/1.5 var(--font-m,monospace)}.gn-dose-disclaimer strong{color:#ffd700}.gn-import-overlay,.gn-delete-overlay{position:fixed;inset:0;z-index:180;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.78)}.gn-import-overlay.active,.gn-delete-overlay.active{display:flex}.gn-import-panel,.gn-delete-panel{width:min(100%,480px);max-height:90vh;overflow:auto;padding:18px;border:1px solid rgba(0,212,255,.36);border-top:2px solid #00d4ff;background:#080810;box-shadow:0 18px 50px rgba(0,0,0,.6)}.gn-import-panel p,.gn-delete-panel p{color:#9fc7d4;font:.65rem/1.5 var(--font-m,monospace)}.gn-import-panel>label{display:grid;gap:6px;margin-top:12px;color:#9fc7d4;font:600 .58rem var(--font-m,monospace);letter-spacing:1px}.gn-import-panel select,.gn-import-panel input{box-sizing:border-box;width:100%;padding:10px;background:#0e0e16;border:1px solid rgba(0,212,255,.2);color:#eef6f8;font:16px var(--font-m,monospace)}.gn-import-title,.gn-delete-kicker{color:#00d4ff;font:700 .64rem var(--font-m,monospace);letter-spacing:2px}.gn-import-close{width:100%;margin-top:14px;padding:11px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#9fc7d4;font:700 .6rem var(--font-m,monospace);letter-spacing:1px}.gn-delete-panel h2{margin:8px 0;color:#FF5B5B;font:700 1.05rem var(--font-d,monospace);letter-spacing:1.5px}.gn-delete-panel label{display:grid;gap:6px;color:#ffd700;font:700 .58rem var(--font-m,monospace);letter-spacing:1px}.gn-delete-panel input{padding:11px;background:#080810;border:1px solid rgba(255,59,59,.4);color:#fff;font:16px var(--font-m,monospace)}.gn-delete-note{color:#ffd982!important}.gn-delete-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.gn-delete-confirm{border-color:#FF3B3B!important;color:#FF5B5B!important}.gn-delete-confirm:disabled{cursor:not-allowed;opacity:.4}
    #boot .boot-command-deck{width:min(92vw,520px);padding:26px 22px;background:linear-gradient(180deg,rgba(10,16,23,.96),rgba(5,5,8,.98));border-color:rgba(0,212,255,.34);box-shadow:0 0 55px rgba(0,212,255,.11),inset 0 0 40px rgba(0,212,255,.025)}#boot .boot-terminal,#boot .boot-prog-wrap{max-width:100%}
    /* Passwordless auth redesign: three views (welcome / code / new-here) */
    .gn-auth-view-title{margin:14px 0 4px;color:#fff;font:800 1.05rem var(--font-d,monospace);letter-spacing:2.5px;text-align:center}
    .gn-auth-view-sub{margin:0 auto 20px;max-width:36ch;color:#9fc7d4;font:.72rem/1.55 var(--font-m,monospace);text-align:center}
    .gn-auth-view-sub b{color:#eef6f8;word-break:break-all}
    .gn-auth-quiet{display:block;width:100%;margin-top:14px;padding:10px;border:0;background:transparent;color:#8295a0;font:600 .62rem var(--font-m,monospace);letter-spacing:1.4px;cursor:pointer;text-align:center}
    .gn-auth-quiet:hover{color:#00d4ff}
    .gn-auth-quiet .gn-quiet-sub{display:block;margin-top:3px;font-size:.54rem;letter-spacing:.8px;color:#586d76}
    .gn-code-row{display:flex;gap:8px;justify-content:center;margin:6px 0 14px}
    .gn-code-box{width:44px;height:54px;box-sizing:border-box;text-align:center;border:1px solid rgba(0,212,255,.25);background:#080810;color:#fff;border-radius:3px;font:700 1.3rem var(--font-m,monospace);outline:none;caret-color:#00d4ff}
    .gn-code-box:focus{border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.12)}
    .gn-code-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:2px 0 12px;color:#8295a0;font:.6rem/1.4 var(--font-m,monospace);letter-spacing:.6px}
    .gn-code-meta b{color:#eef6f8}
    .gn-no-account{margin:14px 0;padding:12px;border:1px solid rgba(255,59,59,.55);border-left:3px solid #FF3B3B;background:rgba(255,59,59,.05)}
    .gn-no-account b{display:block;color:#FF5B5B;font:700 .68rem var(--font-d,monospace);letter-spacing:1.8px;margin-bottom:6px}
    .gn-no-account p{margin:0 0 10px;color:#c9a0a6;font:.62rem/1.5 var(--font-m,monospace)}
    .gn-no-account .gn-auth-links{margin-top:6px}
    .gn-no-account.gn-key-ok{border-color:rgba(0,255,136,.5);border-left-color:#00ff88;background:rgba(0,255,136,.05)}
    .gn-no-account.gn-key-ok b{color:#00ff88}
    .gn-no-account.gn-key-ok p{color:#9fc7d4}
    .gn-waitlist-form{display:grid;gap:8px;margin-top:10px}
    .gn-waitlist-consent{margin:0;color:#586d76;font:.56rem/1.5 var(--font-m,monospace)}
    .gn-auth-back{display:inline-block;margin:0 0 6px;padding:6px 2px;border:0;background:transparent;color:#8295a0;font:600 .6rem var(--font-m,monospace);letter-spacing:1.4px;cursor:pointer}
    .gn-auth-back:hover{color:#00d4ff}
    .gn-auth-message[data-tone="error"]{color:#FF5B5B}
    @media(max-width:380px){.gn-code-box{width:40px;height:50px}.gn-code-row{gap:6px}}
    canvas{display:block;max-width:100%}
    /* v0.15.42: RESULTS charts/calendar segmented toggle + calendar subview */
    .results-view-toggle{display:flex;gap:0;margin:12px 0 4px;border:1px solid rgba(0,212,255,.22);border-radius:6px;overflow:hidden}
    .results-view-btn{flex:1;padding:10px 8px;border:0;background:transparent;color:#8295a0;font:700 .6rem var(--font-d,monospace);letter-spacing:2px;cursor:pointer}
    .results-view-btn.active{background:rgba(0,212,255,.14);color:#00d4ff}
    .results-calendar-view{margin-top:6px}
    .results-calendar-view .results-copy{margin-top:10px}
    /* v0.15.42: landing single-CTA discipline — explore becomes a quiet text anchor */
    .landing-explore-link{display:block;margin:14px auto 0;padding:8px 12px;border:0;background:transparent;color:#8295a0;font:600 .62rem var(--font-m,monospace);letter-spacing:2px;cursor:pointer;text-align:center}
    .landing-explore-link:hover{color:#00d4ff}
    .landing-wedge{margin:14px 0 0;padding:11px 14px;border-left:2px solid #00d4ff;background:rgba(0,212,255,.06);color:#e8fcff;font:600 .72rem/1.5 var(--font-m,monospace);letter-spacing:.3px}
    .landing-wedge strong{color:#00d4ff}
    /* v0.15.42: privacy policy overlay */
    .gn-privacy-overlay{position:fixed;inset:0;z-index:970;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(2,2,8,.86);backdrop-filter:blur(10px)}
    .gn-privacy-overlay.active{display:flex}
    .gn-privacy-panel{width:min(100%,560px);max-height:86vh;overflow-y:auto;box-sizing:border-box;padding:22px;border:1px solid rgba(0,212,255,.4);border-top:2px solid #00d4ff;border-radius:12px;background:var(--panel,#0e0e16);color:var(--text,#eef6f8);box-shadow:0 28px 80px rgba(0,0,0,.65)}
    .gn-privacy-panel h2{margin:6px 0 4px;color:#fff;font:800 1.05rem var(--font-d,monospace);letter-spacing:2px}
    .gn-privacy-panel .gn-privacy-date{color:#8295a0;font:.58rem var(--font-m,monospace);letter-spacing:1px;margin-bottom:14px}
    .gn-privacy-panel h3{margin:16px 0 6px;color:#00d4ff;font:700 .68rem var(--font-d,monospace);letter-spacing:1.6px}
    .gn-privacy-panel p{margin:0 0 8px;color:#9fc7d4;font:.66rem/1.65 var(--font-m,monospace)}
    .gn-privacy-panel .gn-privacy-close{width:100%;margin-top:16px;min-height:48px;border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.07);color:#00d4ff;font:700 .68rem var(--font-d,monospace);letter-spacing:2px;border-radius:6px;cursor:pointer}
    /* QA 2026-09-17: Data Ownership focused destination — show only the
       export/delete-rights sections under the DATA OWNERSHIP title. */
    .gn-privacy-overlay.gn-ownership .gn-privacy-panel>h3:not(#gnPrivacyExportRights):not(#gnPrivacyDeleteRights),.gn-privacy-overlay.gn-ownership .gn-privacy-panel>h3:not(#gnPrivacyExportRights):not(#gnPrivacyDeleteRights)+p{display:none}
    /* v0.15.42: boot skip hint */
    .boot-skip-hint{margin-top:14px;text-align:center;color:#586d76;font:600 .56rem var(--font-m,monospace);letter-spacing:2.5px;animation:gnBootSkipPulse 1.6s ease-in-out infinite}
    @keyframes gnBootSkipPulse{50%{opacity:.45}}
    /* v0.15.42: auth choice plain-language hints */
    .gn-auth-hint{margin:6px 0 12px;max-width:320px;text-align:center;color:#8295a0;font:400 .62rem/1.6 var(--font-m,monospace);letter-spacing:.4px}
    @media(max-width:560px){.gn-foundation-grid{grid-template-columns:1fr}.gn-form-grid{grid-template-columns:1fr}.gn-foundation-head,.gn-device-vault-head{display:block}.gn-foundation-signal{display:block;margin-top:7px;text-align:left}.gn-record-row{grid-template-columns:1fr auto auto}.gn-ledger-row{grid-template-columns:auto 1fr}.gn-ledger-row em{grid-column:2;text-align:left}}
    .gn-hub-grid>button{font:inherit;cursor:pointer}.gn-hub-grid>button:hover,.gn-hub-grid>button:focus-visible{border-color:#00d4ff;background:rgba(0,212,255,.1)}
    @media(max-width:560px){.gn-shot-filter-grid,.gn-dose-grid{grid-template-columns:1fr 1fr}.gn-measurements-grid{grid-template-columns:1fr}.gn-measurement-trend-list{grid-template-columns:1fr}}
    .gn-auth-policy-overlay{position:fixed;inset:0;z-index:960;display:grid;place-items:center;padding:20px;background:rgba(2,2,8,.82);backdrop-filter:blur(10px)}.gn-auth-policy-modal{width:min(100%,440px);box-sizing:border-box;padding:22px;border:1px solid rgba(0,212,255,.4);border-top:2px solid #00d4ff;border-radius:12px;background:var(--panel,#0e0e16);color:var(--text,#eef6f8);box-shadow:0 28px 80px rgba(0,0,0,.65);max-height:80vh;overflow-y:auto}.gn-auth-policy-modal h2{margin:6px 0 10px;color:#fff;font:800 1rem var(--font-d,monospace);letter-spacing:1.6px}.gn-auth-policy-modal p{margin:0 0 16px;color:#9fc7d4;font:.62rem/1.6 var(--font-m,monospace);letter-spacing:.5px}.gn-auth-policy-modal .gn-auth-primary{min-height:46px}
    @media(max-width:380px){.gn-auth-card{padding:24px 16px}.gn-stable-zone-btn{font-size:.62rem}.gn-measurements-tools,.gn-dose-grid{grid-template-columns:1fr}.gn-delete-actions{grid-template-columns:1fr}}
    .gn-weekly-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.gn-weekly-actions button{min-height:40px;border:1px solid rgba(0,212,255,.35);background:rgba(0,212,255,.045);color:#00d4ff;font:700 .58rem var(--font-d,monospace);letter-spacing:1px;cursor:pointer}.gn-weekly-actions button:first-child{border-color:rgba(255,59,59,.5);color:#FF5B5B;background:rgba(255,59,59,.06)}
    .gn-foundation-panel > .gn-foundation-section{display:none!important}.gn-lab-tool-overlay{position:fixed;inset:0;z-index:220;display:none;overflow:auto;padding:calc(8px + var(--safe-top)) 10px calc(12px + var(--safe-bottom));background:rgba(0,0,0,.88)}.gn-lab-tool-overlay.active{display:block}.gn-lab-tool-shell{width:min(100%,720px);min-height:100%;box-sizing:border-box;margin:0 auto;padding:14px;border:1px solid rgba(0,212,255,.28);border-top:2px solid #00d4ff;background:#080b10;box-shadow:0 18px 60px rgba(0,0,0,.72)}.gn-lab-tool-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(0,212,255,.14)}.gn-lab-tool-head>div{flex:1}.gn-lab-tool-head h2{margin:0;color:#eef6f8;font:700 1rem var(--font-d,monospace);letter-spacing:2px}.gn-lab-back{min-height:36px;padding:8px 10px;border:1px solid rgba(0,212,255,.35);background:rgba(0,212,255,.04);color:#00d4ff;font:700 .58rem var(--font-d,monospace);letter-spacing:1px;cursor:pointer}.gn-lab-tool-host>.time-tabs,.gn-lab-tool-host>.gn-foundation-section,.gn-lab-tool-host>.gn-dose-projection,.gn-lab-tool-host>.gn-device-vault{margin-top:0}.gn-lab-tool-host>.gn-foundation-section{display:block!important}.gn-lab-tool-host>.gn-device-vault{border-top:0;padding-top:0}.phase-context-text{margin:12px 0;padding:11px 12px;border-left:2px solid #00d4ff;background:rgba(0,212,255,.045);color:#a9dce8;font:.68rem/1.5 var(--font-m,monospace)}
    .toast{position:fixed!important;bottom:calc(84px + var(--safe-bottom))!important;left:10px!important;right:10px!important;width:auto!important;box-sizing:border-box!important;z-index:1000!important;padding:8px 10px!important;border:0!important;border-bottom:1px solid #00d4ff!important;border-radius:0!important;background:#0a1016!important;box-shadow:0 8px 18px rgba(0,0,0,.4)!important;white-space:nowrap!important;overflow:hidden!important;animation:none!important}.toast.err{border-bottom-color:#FF3B3B!important}.toast .gn-toast-kicker{display:none!important}.toast .gn-toast-message{display:block!important;font-size:.68rem!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .nav-lbl{font-size:.55rem!important;color:#8a8aa0!important}.nav-item:not(.active) .nav-lbl{color:#8a8aa0!important}.nav-item.active .nav-lbl{color:#00d4ff!important}.nav-item.active::before{height:1px!important;box-shadow:0 0 7px #00d4ff!important}.landing-node-mark{opacity:.65!important}
    @media(max-width:620px){.scroll-body{padding-bottom:calc(84px + var(--safe-bottom))!important}.nav-lbl{font-size:.55rem!important;color:#8a8aa0!important}.gn-foundation-grid{grid-template-columns:1fr 1fr!important}}
    @media(max-width:340px){.gn-foundation-grid{grid-template-columns:1fr!important}}
    #pageLab.gn-lab-launchpad-mode > #labSegTabs,#pageLab.gn-lab-launchpad-mode > [data-labseg-block],#pageLab.gn-lab-launchpad-mode > #gnDoseProjection{display:none!important}
    @media(prefers-reduced-motion:reduce){.gn-lab-tool-overlay *{scroll-behavior:auto!important}.toast{animation:none!important}}
    html,body,#app{color-scheme:dark}
    .overlay,.modal,.cp-dropdown,.gn-lab-tool-overlay,.gn-lab-tool-shell,.gn-import-overlay,.gn-delete-overlay,.archive-confirm-overlay,.zone-picker-overlay{color-scheme:dark}
    .overlay,.modal,.cp-dropdown,.gn-lab-tool-shell,.gn-import-panel,.gn-delete-panel,.archive-confirm-panel{background:#0e0e16!important;color:#eeeef5!important;border-color:rgba(0,212,255,.12)!important;border-radius:6px}
    .cp-dropdown,.cp-option{background:#0e0e16!important;color:#eeeef5!important}.cp-option{border-bottom-color:rgba(255,255,255,.05)!important}.cp-option:hover,.cp-option.selected,.cp-option[aria-selected=true]{color:#00d4ff!important;box-shadow:0 0 10px rgba(0,212,255,.18)}
    select,input[type=date],input[type=time]{color-scheme:dark;background:#0e0e16!important;color:#eeeef5!important;border-color:rgba(0,212,255,.18)!important}select option{background:#0e0e16;color:#eeeef5}input[type=date]::-webkit-calendar-picker-indicator{filter:invert(78%) sepia(53%) saturate(1150%) hue-rotate(150deg);opacity:.9}
    .gn-custom-picker,.gn-custom-date{position:relative;width:100%;min-width:0}.gn-custom-picker-trigger,.gn-custom-date-trigger{width:100%;min-height:44px;padding:10px 14px 10px 12px;text-align:left;border:1px solid rgba(0,212,255,.55);background:linear-gradient(180deg,rgba(0,212,255,.07),rgba(0,0,0,.18));color:#eeeef5;font:600 16px var(--font-m,monospace);border-radius:4px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 0 0 rgba(0,212,255,0);transition:border-color .15s ease,background-color .15s ease,box-shadow .15s ease}.gn-custom-picker-trigger::after,.gn-custom-date-trigger::after{content:'⌄';float:right;color:#00d4ff;margin-left:8px}.gn-custom-picker-trigger:focus-visible,.gn-custom-date-trigger:focus-visible{outline:none;border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.12)}.gn-custom-picker-menu,.gn-custom-date-popover{display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:640;padding:4px;background:#0e0e16;border:1px solid rgba(0,212,255,.28);border-radius:6px;box-shadow:0 16px 42px rgba(0,0,0,.72),0 0 18px rgba(0,212,255,.1)}.gn-custom-picker.open .gn-custom-picker-menu,.gn-custom-date.open .gn-custom-date-popover{display:grid}.gn-custom-picker-option{min-height:38px;padding:9px 10px;border:0;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;color:#9898b0;text-align:left;font:600 .68rem var(--font-m,monospace);cursor:pointer}.gn-custom-picker-option:last-child{border-bottom:0}.gn-custom-picker-option:hover,.gn-custom-picker-option[aria-selected=true]{color:#00d4ff;background:rgba(0,212,255,.08);box-shadow:0 0 10px rgba(0,212,255,.18)}.gn-custom-date-popover{width:min(330px,calc(100vw - 38px));right:auto;padding:10px}.gn-custom-date-head{display:grid;grid-template-columns:34px 1fr 34px;align-items:center;gap:8px;margin-bottom:9px}.gn-custom-date-head button,.gn-custom-date-foot button{min-height:32px;border:1px solid rgba(0,212,255,.24);background:rgba(0,212,255,.06);color:#00d4ff;font:700 .6rem var(--font-d,monospace);cursor:pointer}.gn-custom-date-head strong{color:#eeeef5;text-align:center;font:700 .68rem var(--font-m,monospace);letter-spacing:1px}.gn-custom-date-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.gn-custom-date-dow{padding:3px 0;color:#8295a0;text-align:center;font:600 .48rem var(--font-m,monospace)}.gn-custom-date-blank{min-height:32px}.gn-custom-date-day{min-height:32px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);color:#9898b0;font:600 .62rem var(--font-m,monospace);cursor:pointer}.gn-custom-date-day:hover,.gn-custom-date-day.selected{border-color:#00d4ff;color:#00d4ff;background:rgba(0,212,255,.12);box-shadow:0 0 10px rgba(0,212,255,.18)}.gn-custom-date-foot{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.gn-custom-date-foot button:last-child{color:#9898b0;border-color:rgba(255,255,255,.14);background:transparent}
    .toast{max-width:90vw!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}.toast .gn-toast-message{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .phase-ring-svg-wrap .phase-segment-ring,.landing-phase-visual .phase-segment-ring{position:absolute;border-radius:50%;background:var(--gn-seg-ring,conic-gradient(from -90deg,rgba(128,140,150,.35) 0deg 360deg));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));pointer-events:none;z-index:0;opacity:.5}
    .landing-phase-visual .phase-segment-ring{background:conic-gradient(from -90deg,#4fb8d8 0deg 72deg,#63b98b 72deg 144deg,#e57f9e 144deg 216deg,#c26674 216deg 288deg,#9898b0 288deg 360deg)}
    .phase-ring-svg-wrap .phase-segment-ring{inset:-4px}.phase-ring-svg-wrap .ring-svg{z-index:1}.phase-ring-svg-wrap .phase-nodes{z-index:3}.phase-ring-svg-wrap .ring-center{z-index:4}.phase-marker{position:absolute;width:9px;height:9px;border-radius:50%;transform:translate(-50%,-50%);z-index:5;box-shadow:0 0 0 2px rgba(0,0,0,.45);opacity:.95;pointer-events:none}.phase-marker[hidden]{display:none!important}
    .gn-phase-marker{animation:none}
    .page{transition:opacity .15s ease,visibility .15s ease}.page:not(.active){opacity:0;visibility:hidden;pointer-events:none}.page.active{opacity:1;visibility:visible}
    .gn-streak-card{display:grid;gap:5px;margin:0 0 14px;padding:12px;border:1px solid rgba(0,212,255,.3);border-left:2px solid #00d4ff;background:linear-gradient(135deg,rgba(0,212,255,.08),rgba(0,0,0,.24));color:#eef6f8}.gn-streak-card[hidden]{display:none}.gn-streak-card b{color:#00d4ff;font:800 .7rem var(--font-d,monospace);letter-spacing:1.7px}.gn-streak-card span{color:#9fc7d4;font:.62rem/1.45 var(--font-m,monospace)}
    .gn-celebrate-particle{position:fixed;left:var(--x);bottom:40%;width:var(--size);height:var(--size);border-radius:50%;background:#00d4ff;box-shadow:0 0 8px #00d4ff;animation:gnCelebrate 2.2s ease-out forwards;animation-delay:var(--delay);pointer-events:none;z-index:9999}@keyframes gnCelebrate{0%{transform:translateY(0) translateX(0) scale(1);opacity:1}100%{transform:translateY(-80px) translateX(var(--drift)) scale(0);opacity:0}}
    .landing-phase-visual{position:absolute;right:-14%;bottom:12%;width:min(420px,44vw);aspect-ratio:1;opacity:.35;pointer-events:none;z-index:0;filter:drop-shadow(0 0 20px rgba(0,212,255,.16));animation:gnLandingRingRotate 8s linear infinite}.landing-phase-visual .phase-segment-ring{inset:0;opacity:.95}.landing-phase-core{position:absolute;inset:31%;display:grid;place-items:center;align-content:center;gap:8px;border:1px solid rgba(0,212,255,.28);border-radius:50%;color:#9fefff;text-align:center;background:rgba(5,5,8,.28)}.landing-phase-core span{font:700 .52rem var(--font-m,monospace);letter-spacing:2px}.landing-phase-core b{font:800 2.2rem var(--font-d,monospace);color:#eef6f8}@keyframes gnLandingRingRotate{to{transform:rotate(360deg)}}.landing-hero>:not(.landing-phase-visual){position:relative;z-index:1}
    .gn-history-more{display:grid;gap:8px;margin:14px 0 4px}.gn-history-count{color:#9fc7d4;font:600 .62rem var(--font-m,monospace);letter-spacing:1.6px;text-align:center}
    @media(max-width:767px){.landing-phase-visual{display:none}}
    @media(prefers-reduced-motion:reduce){.gn-phase-marker,.landing-phase-visual,.gn-celebrate-particle{animation:none!important}.page{transition:none!important}}
  `;
  document.head.appendChild(style);
}

/* Passwordless auth redesign — three-view state machine.
 * welcome: email code (primary), Google, quiet passkey, quiet device, new-here link, password fallback.
 * code: 6-digit OTP with expiry + resend countdown.
 * newhere: NODE KEY validate -> claim (OTP or Google) -> code; quiet No-NODE-KEY waitlist.
 * requestLegalAccept() keeps wrapping every entry path. Password recovery card unchanged. */
let gnAuthView = 'welcome';
let gnOtp = null; /* { email, sentAt, createUser } */
let gnOtpTimers = [];
let gnVerifying = false;
let gnConditionalAbort = null;
let gnKeyContinuation = null;
let gnKeySkipAction = null;
let gnWaitLastSubmit = 0;
let gnExpandPassword = false;
let gnPendingCreds = null;
let gnSkipKeyGateOnce = false;
const OTP_EXPIRY_S = 600;
const OTP_RESEND_S = 60;

/* F2 (VISUALS MAX 2): post-auth return state. The inline detector in
 * html/partials/01-head.html adds html.gn-auth-returning at first paint
 * when the URL carries an auth response (or the return marker is
 * fresh), so the landing shows an honest SIGNING YOU IN status
 * (css/native/11-ux-states.css) instead of dead air while
 * restoreSession exchanges the session and hydrates. Cleared exactly
 * once: into the app (showApp), back to the signed-out landing/login on
 * failure (the restore-settle check in the DOMContentLoaded handler),
 * or by the backstop below. */
let gnAuthReturnCleared = false;
let gnAuthReturnTimer = null;
function clearAuthReturnState() {
  if (gnAuthReturnCleared) return;
  gnAuthReturnCleared = true;
  if (gnAuthReturnTimer) { clearTimeout(gnAuthReturnTimer); gnAuthReturnTimer = null; }
  document.documentElement.classList.remove('gn-auth-returning');
  try { sessionStorage.removeItem('gn_auth_return_v1'); } catch (_) {}
  const el = document.getElementById('gnAuthReturn');
  if (el) el.hidden = true;
}
function armAuthReturnBackstop() {
  if (gnAuthReturnCleared || gnAuthReturnTimer) return;
  if (!document.documentElement.classList.contains('gn-auth-returning')) return;
  /* 6s from boot covers the 4.5s getSession timeout in getCloudSession
   * (gridnode-core) plus hydration headroom. If the exchange has not
   * resolved by then, the landing must not stay stuck behind a
   * signing-in status: fall back to the signed-out landing. */
  gnAuthReturnTimer = setTimeout(() => {
    clearAuthReturnState();
    if (!state.session) { authShell(); modules.showScreen('landing'); }
  }, 6000);
}

function authShell() {
  const login = $('login');
  if (!login) return;
  if (authMode === 'recovery') {
    /* Recovery mode: minimal card — email + new password, legal gate unchanged. */
    login.innerHTML = `
  <div class="gn-auth-card">
    <div class="gn-auth-kicker" data-i18n="auth.secureConnection">SECURE CONNECTION // TERMINAL READY</div>
    <h1 class="gn-auth-title">GRID//NODE</h1>
    <div class="gn-auth-copy" data-i18n="auth.recoveryCopy">Set a new password for your cloud account.</div>
    <div class="gn-legal-modal" id="gnLegalModal" hidden>
      <div class="gn-legal-modal-card" role="dialog" aria-modal="true" aria-labelledby="gnLegalModalTitle">
        <h2 class="gn-legal-modal-title" id="gnLegalModalTitle" data-i18n="legal.modalTitle">BEFORE YOU ENTER</h2>
      <p class="gn-legal-intro" data-i18n="legal.modalIntro">Two quick checks before you enter. Nothing is sent or synced until you agree.</p>
        <label class="gn-legal-check"><input type="checkbox" id="gnLegalModalTerms"><span data-i18n="legal.modalTerms">I am 18 or older and I accept the <button type="button" class="gn-legal-link" id="gnLegalModalTermsLink" data-i18n="footer.termsOfService">TERMS OF SERVICE</button> and <button type="button" class="gn-legal-link" id="gnLegalModalPrivacyLink" data-i18n="footer.privacyPolicy">PRIVACY POLICY</button>.</span></label>
        <label class="gn-legal-check"><input type="checkbox" id="gnLegalModalResearch"><span data-i18n="legal.modalResearch">I understand GRID//NODE is a personal tracking tool, not medical advice.</span></label>
        <button type="button" class="gn-legal-under18" id="gnLegalModalUnder18" data-i18n="legal.under18">I AM UNDER 18</button>
        <div class="gn-legal-modal-msg" id="gnLegalModalMsg" role="status" aria-live="polite"></div>
        <div class="gn-legal-modal-actions">
          <button type="button" class="gn-auth-primary" id="gnLegalModalAgree" data-i18n="legal.agreeContinue">AGREE AND CONTINUE</button>
          <button type="button" class="gn-legal-modal-cancel" id="gnLegalModalCancel" data-i18n="legal.cancel">CANCEL</button>
        </div>
      </div>
    </div>
    <form id="gnAuthForm" novalidate>
      <input class="gn-auth-field" id="gnAuthEmail" type="email" autocomplete="email" placeholder="EMAIL ADDRESS" aria-label="Email address" hidden>
      <input class="gn-auth-field" id="gnAuthPassword" type="password" autocomplete="new-password" placeholder="NEW PASSWORD" aria-label="New password">
      <button class="gn-auth-primary" id="gnAuthSubmit" type="submit">UPDATE PASSWORD</button>
    </form>
    <div class="gn-auth-links"><button class="gn-auth-link" id="gnAuthModeToggle" type="button">BACK TO SIGN IN</button></div>
    <div class="gn-auth-message" id="loginMsg" role="status" aria-live="polite"></div>
  </div>`;
    wireLegalModal();
    $('gnAuthForm')?.addEventListener('submit', submitAuth);
    $('gnAuthModeToggle')?.addEventListener('click', toggleAuthMode);
    login.querySelector('.gn-auth-card')?.insertAdjacentHTML('afterbegin', '<div class="gn-auth-lang-kanji" role="group" data-i18n-aria-label="lang.switcherAria"><button type="button" class="gn-lang-globe" data-lang-choice="es" aria-label="Español" title="Cambiar a Español"><svg class="gn-lang-kanji" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M4.5 5.2h15M7.2 5.2v2.4c0 1.1.5 2.1 1.4 2.8l2.4 1.7-2.4 1.7c-.9.7-1.4 1.7-1.4 2.8v2.6M16.8 5.2v2.4c0 1.1-.5 2.1-1.4 2.8l-2.4 1.7 2.4 1.7c.9.7 1.4 1.7 1.4 2.8v2.6M9.2 18.8h5.6M12 12.1v6.7" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>');
    applyAuthTranslations();
    window.GN_I18N?.applyTo?.(login);
    return;
  }
  authMode = 'signin';
  login.innerHTML = `
  <div class="gn-auth-card">
    <div class="gn-auth-kicker" data-i18n="auth.secureConnection">SECURE CONNECTION // TERMINAL READY</div>
    <h1 class="gn-auth-title">GRID//NODE</h1>
    <div id="gnAuthViewRoot"></div>
    <div class="gn-auth-message" id="loginMsg" role="status" aria-live="polite"></div>
  </div>
  <div class="gn-legal-modal" id="gnLegalModal" hidden>
    <div class="gn-legal-modal-card" role="dialog" aria-modal="true" aria-labelledby="gnLegalModalTitle">
      <h2 class="gn-legal-modal-title" id="gnLegalModalTitle" data-i18n="legal.modalTitle">BEFORE YOU ENTER</h2>
      <p class="gn-legal-intro" data-i18n="legal.modalIntro">Two quick checks before you enter. Nothing is sent or synced until you agree.</p>
      <label class="gn-legal-check"><input type="checkbox" id="gnLegalModalTerms"><span data-i18n="legal.modalTerms">I am 18 or older and I accept the <button type="button" class="gn-legal-link" id="gnLegalModalTermsLink" data-i18n="footer.termsOfService">TERMS OF SERVICE</button> and <button type="button" class="gn-legal-link" id="gnLegalModalPrivacyLink" data-i18n="footer.privacyPolicy">PRIVACY POLICY</button>.</span></label>
      <label class="gn-legal-check"><input type="checkbox" id="gnLegalModalResearch"><span data-i18n="legal.modalResearch">I understand GRID//NODE is a personal tracking tool, not medical advice.</span></label>
      <button type="button" class="gn-legal-under18" id="gnLegalModalUnder18" data-i18n="legal.under18">I AM UNDER 18</button>
      <div class="gn-legal-modal-msg" id="gnLegalModalMsg" role="status" aria-live="polite"></div>
      <div class="gn-legal-modal-actions">
        <button type="button" class="gn-auth-primary" id="gnLegalModalAgree" data-i18n="legal.agreeContinue">AGREE AND CONTINUE</button>
        <button type="button" class="gn-legal-modal-cancel" id="gnLegalModalCancel" data-i18n="legal.cancel">CANCEL</button>
      </div>
    </div>
  </div>`;
  wireLegalModal();
  $('gnVaultPolicyLink')?.addEventListener('click', openPrivacyPolicy);
  login.querySelector('.gn-auth-card')?.insertAdjacentHTML('afterbegin', '<div class="gn-auth-lang-kanji" role="group" data-i18n-aria-label="lang.switcherAria"><button type="button" class="gn-lang-globe" data-lang-choice="es" aria-label="Español" title="Cambiar a Español"><svg class="gn-lang-kanji" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M4.5 5.2h15M7.2 5.2v2.4c0 1.1.5 2.1 1.4 2.8l2.4 1.7-2.4 1.7c-.9.7-1.4 1.7-1.4 2.8v2.6M16.8 5.2v2.4c0 1.1-.5 2.1-1.4 2.8l-2.4 1.7 2.4 1.7c.9.7 1.4 1.7 1.4 2.8v2.6M9.2 18.8h5.6M12 12.1v6.7" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>');
  applyAuthTranslations();
  showAuthView(gnAuthView === 'code' && !gnOtp ? 'welcome' : gnAuthView);
  window.GN_I18N?.applyTo?.(login);
}

/* Legal modal wiring — stopPropagation so tapping a link inside the
 * checkbox label does not toggle the checkbox. */
function wireLegalModal() {
  const gnNoLabelToggle = e => e.stopPropagation();
  $('gnLegalModalTermsLink')?.addEventListener('click', e => { gnNoLabelToggle(e); openTermsOfService(); });
  $('gnLegalModalPrivacyLink')?.addEventListener('click', e => { gnNoLabelToggle(e); openPrivacyPolicy(); });
  $('gnLegalModalUnder18')?.addEventListener('click', () => setLegalModalMessage(tx('legal.under18Blocked', '// GRID//NODE IS 18+ ONLY. YOU MUST BE 18 OR OLDER TO USE THIS APP.'), true));
  $('gnLegalModalAgree')?.addEventListener('click', confirmLegalModal);
  $('gnLegalModalCancel')?.addEventListener('click', closeLegalModal);
}

function showAuthView(name, opts = {}) {
  abortConditionalMediation();
  clearOtpTimers();
  gnVerifying = false;
  gnAuthView = name;
  const root = $('gnAuthViewRoot');
  if (!root) return;
  if (name === 'code') root.innerHTML = renderCodeView();
  else if (name === 'newhere') root.innerHTML = renderNewHereView({ allowSkip: !!gnKeySkipAction });
  else root.innerHTML = renderWelcomeView();
  wireAuthView(name);
  window.GN_I18N?.applyTo?.(root);
  updateAuthMode();
}

function renderWelcomeView() {
  const expand = gnExpandPassword;
  gnExpandPassword = false;
  return `
  <h2 class="gn-auth-view-title" data-i18n="otp.chooseTitle">HOW DO YOU WANT TO ENTER?</h2>
  <p class="gn-auth-view-sub" data-i18n="otp.chooseSub">Three ways in. Pick one — you can switch later in VAULT.</p>
  <div id="gnOtpNoAccount"></div>
  <div class="gn-entry-label" id="gnGoogleLabel" data-i18n="otp.googleLabel">GOOGLE · SYNC ACROSS DEVICES</div>
  <div class="gn-google-button-shell" id="gnGoogleButtonMount" data-i18n-aria-label="auth.continueWithGoogle" aria-label="Continue with Google"></div>
  <div class="gn-auth-divider"><span data-i18n="otp.emailLabel">EMAIL CODE · RETURNING ACCOUNTS</span></div>
  <input class="gn-auth-field" id="gnOtpEmail" type="email" inputmode="email" autocomplete="email" data-i18n-ph="otp.emailPlaceholder" placeholder="name@email.com" data-i18n-aria-label="auth.emailAddress" aria-label="Email">
  <button class="gn-auth-primary gn-auth-primary-compact" id="gnSendCodeBtn" type="button"><span data-i18n="otp.sendCode">SEND ME A SIGN-IN CODE</span></button>
  <button class="gn-entry-local" id="gnDeviceBtn" type="button">
    <span data-i18n="otp.localTitle">CONTINUE ON THIS DEVICE</span>
    <span class="gn-quiet-sub" data-i18n="otp.localSub">Start now, no account. Your data stays on this device.</span>
  </button>
  <button class="gn-auth-quiet gn-entry-key" id="gnNewHereBtn" type="button">
    <span data-i18n="otp.newHereNodeKey">New to GRID//NODE? ENTER NODE KEY</span>
    <span class="gn-quiet-sub" data-i18n="otp.keySub">Invite-only beta — enter the key you were given.</span>
  </button>
  <div class="gn-auth-links" style="justify-content:center;margin-top:10px">
    <button class="gn-auth-link" id="gnMoreOptionsToggle" type="button" aria-expanded="false"><span data-i18n="otp.moreSignInOptions">More sign-in options</span></button>
  </div>
  <div id="gnMoreOptions" hidden>
    <button class="gn-auth-quiet" id="gnPasskeyBtn" type="button" style="display:none">
      <span data-i18n="otp.usePasskey">Use passkey</span>
    </button>
    <button class="gn-auth-quiet" id="gnPasswordToggle" type="button">
      <span data-i18n="otp.usePasswordInstead">Use password instead</span>
    </button>
  </div>
  <div id="gnPasswordBlock" ${expand ? '' : 'hidden'}>
    <form id="gnAuthForm" novalidate>
      <input class="gn-auth-field" id="gnAuthEmail" type="email" inputmode="email" autocomplete="email" data-i18n-ph="auth.emailPlaceholder" placeholder="EMAIL ADDRESS" data-i18n-aria-label="auth.emailAddress" aria-label="Email">
      <input class="gn-auth-field" id="gnAuthPassword" type="password" autocomplete="current-password" data-i18n-ph="auth.passwordPlaceholder" placeholder="PASSWORD" data-i18n-aria-label="auth.password" aria-label="Password">
      <button class="gn-auth-primary gn-auth-primary-compact" id="gnAuthSubmit" type="submit">SIGN IN TO CLOUD</button>
    </form>
    <div class="gn-auth-links">
      <button class="gn-auth-link" id="gnAuthModeToggle" type="button">CREATE ACCOUNT</button>
      <button class="gn-auth-link" id="gnAuthReset" type="button" data-i18n="auth.resetPassword">RESET PASSWORD</button>
    </div>
  </div>
  <div class="gn-auth-message" id="gnOtpMsg" role="status" aria-live="polite"></div>
  <div class="gn-auth-footlinks">
    <button class="gn-auth-link" type="button" onclick="openPrivacyPolicy()"><span data-i18n="auth.privacyData">Privacy &amp; data</span></button>
    <span class="gn-auth-footsep">·</span>
    <button class="gn-auth-link" type="button" onclick="openMedicalDisclaimer()"><span data-i18n="auth.medicalDisclaimer">Medical disclaimer</span></button>
  </div>`;
}

function renderCodeView() {
  const newUser = !!gnOtp?.createUser;
  const boxes = [0, 1, 2, 3, 4, 5].map(i =>
    `<input class="gn-code-box" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Digit ${i + 1}">`
  ).join('');
  return `
  <button class="gn-auth-back" id="gnCodeBack" type="button">&larr; <span data-i18n="otp.backToWelcome">Back</span></button>
  <h2 class="gn-auth-view-title" data-i18n="otp.checkEmail">CHECK YOUR EMAIL</h2>
  <p class="gn-auth-view-sub"><span data-i18n="otp.codeSentTo">We sent a 6-digit code to</span><br><b id="gnCodeEmail"></b></p>
  <div class="gn-code-row" id="gnCodeRow" role="group" aria-label="6-digit sign-in code">${boxes}</div>
  <button class="gn-auth-primary" id="gnVerifyBtn" type="button"><span data-i18n="${newUser ? 'otp.newUserVerify' : 'otp.verify'}">${newUser ? 'VERIFY AND CREATE MY ACCOUNT' : 'VERIFY'}</span></button>
  <div class="gn-code-meta">
    <span><span data-i18n="otp.codeExpiresIn">Code expires in</span> <b id="gnCodeExpiry">10:00</b></span>
    <span id="gnResendWrap"><span data-i18n="otp.resendIn">Resend code in</span> <b id="gnResendTimer">1:00</b></span>
    <button class="gn-auth-link" id="gnResendBtn" type="button" hidden><span data-i18n="otp.resendCode">RESEND CODE</span></button>
  </div>
  <div class="gn-auth-links" style="justify-content:center"><button class="gn-auth-link" id="gnChangeEmail" type="button"><span data-i18n="otp.changeEmail">Change email</span></button></div>
  <div class="gn-auth-message" id="gnOtpMsg" role="status" aria-live="polite"></div>`;
}

function renderNewHereView(opts = {}) {
  return `
  <button class="gn-auth-back" id="gnNewHereBack" type="button">&larr; <span data-i18n="otp.backToWelcome">Back</span></button>
  <h2 class="gn-auth-view-title" data-i18n="otp.newHereTitle">NEW HERE</h2>
  <p class="gn-auth-view-sub" data-i18n="otp.newHereSub">GRID//NODE is invite-only. Enter your NODE KEY to begin.</p>
  ${opts.allowSkip ? `<button class="gn-auth-secondary" id="gnKeySkipBtn" type="button"><span data-i18n="otp.alreadyHaveAccount">I already have an account</span></button>` : ''}
  <div id="gnKeyFormWrap">
    <input class="gn-auth-field" id="gnNewKeyInput" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" data-i18n-ph="nodekey.placeholder" placeholder="NODE-XXXXXX" data-i18n-aria-label="nodekey.enterKey" aria-label="NODE KEY" style="text-transform:uppercase;letter-spacing:1.5px">
    <div class="gn-auth-note" style="margin:2px 0 0;border:0;padding:0" data-i18n="otp.keyFormatHint">Keys look like NODE-XXXXXX.</div>
    <button class="gn-auth-primary" id="gnValidateKeyBtn" type="button"><span data-i18n="nodekey.validate">VALIDATE KEY</span></button>
    <div class="gn-auth-message" id="gnKeyMsg" role="status" aria-live="polite"></div>
  </div>
  <div id="gnClaimWrap" hidden>
    <div class="gn-no-account gn-key-ok" role="status">
      <b data-i18n="otp.keyAccepted">KEY ACCEPTED</b>
      <p data-i18n="otp.claimSub">Now claim your account with email or Google.</p>
    </div>
    <input class="gn-auth-field" id="gnClaimEmail" type="email" inputmode="email" autocomplete="email" data-i18n-ph="otp.emailPlaceholder" placeholder="name@email.com" data-i18n-aria-label="auth.emailAddress" aria-label="Email">
    <button class="gn-auth-primary" id="gnClaimSendBtn" type="button"><span data-i18n="otp.sendCode">SEND ME A SIGN-IN CODE</span></button>
    <div class="gn-auth-divider"><span data-i18n="otp.orContinueWithEmail">or</span></div>
    <div class="gn-google-button-shell" id="gnGoogleButtonMount" data-i18n-aria-label="auth.continueWithGoogle" aria-label="Continue with Google"></div>
    <div class="gn-auth-message" id="gnClaimMsg" role="status" aria-live="polite"></div>
  </div>
  <details class="gn-auth-options" id="gnNoKeyDetails">
    <summary><span data-i18n="otp.noKeyQ">No NODE KEY?</span></summary>
    <p class="gn-auth-note" style="text-align:left;border:0;padding:0" data-i18n="otp.askInviter">GRID//NODE is invite-only right now. Ask the person who told you about it for a key. Each one looks like NODE-XXXXXX.</p>
    <p class="gn-auth-note" style="text-align:left;border:0;padding:0" data-i18n="otp.waitlistOr">Or leave your email and we'll notify you when new keys open.</p>
    <form class="gn-waitlist-form" id="gnWaitlistForm" novalidate>
      <input class="gn-auth-field" id="gnWaitlistEmail" type="email" inputmode="email" autocomplete="email" data-i18n-ph="otp.emailPlaceholder" placeholder="name@email.com" data-i18n-aria-label="auth.emailAddress" aria-label="Email">
      <input type="text" id="gnWaitlistHp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
      <button class="gn-auth-secondary" id="gnWaitlistBtn" type="submit"><span data-i18n="otp.notifyMe">NOTIFY ME</span></button>
      <p class="gn-waitlist-consent" data-i18n="otp.waitlistConsent">One email when keys open. No marketing, no spam. Ask us to delete your data anytime at support@gridnode.network.</p>
      <div class="gn-auth-message" id="gnWaitlistMsg" role="status" aria-live="polite"></div>
    </form>
  </details>`;
}

function wireAuthView(name) {
  if (name === 'welcome') {
    $('gnSendCodeBtn')?.addEventListener('click', submitWelcomeEmail);
    $('gnOtpEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitWelcomeEmail(); } });
    $('gnDeviceBtn')?.addEventListener('click', () => { requestLegalAccept(enterLocalSession); });
    $('gnNewHereBtn')?.addEventListener('click', () => showAuthView('newhere'));
    $('gnMoreOptionsToggle')?.addEventListener('click', () => {
      const panel = $('gnMoreOptions');
      const toggle = $('gnMoreOptionsToggle');
      if (!panel || !toggle) return;
      const open = panel.hasAttribute('hidden');
      if (open) { panel.removeAttribute('hidden'); toggle.setAttribute('aria-expanded', 'true'); }
      else { panel.setAttribute('hidden', ''); toggle.setAttribute('aria-expanded', 'false'); }
    });
    $('gnPasswordToggle')?.addEventListener('click', () => {
      const block = $('gnPasswordBlock');
      if (!block) return;
      if (block.hasAttribute('hidden')) {
        const otpEmail = $('gnOtpEmail')?.value.trim();
        if (otpEmail && !$('gnAuthEmail')?.value) $('gnAuthEmail').value = otpEmail;
        block.removeAttribute('hidden');
      } else {
        block.setAttribute('hidden', '');
      }
    });
    $('gnAuthForm')?.addEventListener('submit', submitAuth);
    $('gnAuthModeToggle')?.addEventListener('click', toggleAuthMode);
    $('gnAuthReset')?.addEventListener('click', requestPasswordReset);
    wirePasskeyAuth();
    renderGoogleIdentityButton();
    armConditionalMediation();
  } else if (name === 'code') {
    const emailEl = $('gnCodeEmail');
    if (emailEl && gnOtp?.email) emailEl.textContent = gnOtp.email;
    wireCodeBoxes();
    startOtpTimers();
    $('gnVerifyBtn')?.addEventListener('click', verifyOtpCode);
    $('gnChangeEmail')?.addEventListener('click', () => { gnOtp = null; showAuthView('welcome'); });
    $('gnCodeBack')?.addEventListener('click', () => { gnOtp = null; showAuthView('welcome'); });
    $('gnResendBtn')?.addEventListener('click', resendOtpCode);
  } else if (name === 'newhere') {
    $('gnValidateKeyBtn')?.addEventListener('click', submitNewHereKey);
    $('gnNewKeyInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitNewHereKey(); } });
    $('gnNewHereBack')?.addEventListener('click', () => showAuthView('welcome'));
    $('gnKeySkipBtn')?.addEventListener('click', () => {
      const skip = gnKeySkipAction;
      gnKeySkipAction = null; gnKeyContinuation = null;
      if (skip) skip();
    });
    $('gnClaimSendBtn')?.addEventListener('click', submitClaimEmail);
    $('gnClaimEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitClaimEmail(); } });
    $('gnWaitlistForm')?.addEventListener('submit', submitWaitlist);
  }
}

function setViewMsg(id, key, fallback, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!key) { el.textContent = ''; el.removeAttribute('data-tone'); return; }
  el.textContent = tx(key, fallback);
  if (isError) el.setAttribute('data-tone', 'error'); else el.removeAttribute('data-tone');
}

/* ---------- OTP send / verify ---------- */

function submitWelcomeEmail() {
  const email = ($('gnOtpEmail')?.value || '').trim();
  if (!email || !email.includes('@')) {
    setViewMsg('gnOtpMsg', 'otp.enterEmailFirst', 'Enter your email address first.', true);
    $('gnOtpEmail')?.focus();
    return;
  }
  requestLegalAccept(async () => { await sendOtpCode(email, false); });
}

function submitClaimEmail() {
  const email = ($('gnClaimEmail')?.value || '').trim();
  if (!email || !email.includes('@')) {
    setViewMsg('gnClaimMsg', 'otp.enterEmailFirst', 'Enter your email address first.', true);
    $('gnClaimEmail')?.focus();
    return;
  }
  requestLegalAccept(async () => { await sendOtpCode(email, true); });
}

async function sendOtpCode(email, createUser) {
  const btn = $('gnSendCodeBtn') || $('gnClaimSendBtn');
  const label = btn?.querySelector('span');
  const orig = label?.textContent;
  if (label) label.textContent = tx('otp.sending', 'SENDING...');
  if (btn) btn.disabled = true;
  setViewMsg('gnOtpMsg', null);
  setViewMsg('gnClaimMsg', null);
  try {
    await sendSignInCode(email, createUser);
    /* Only reach the code view when Supabase actually accepted the send —
     * never show a fake code-sent screen for an unknown email. */
    gnOtp = { email, sentAt: Date.now(), createUser: !!createUser };
    showAuthView('code');
  } catch (err) {
    handleOtpSendError(err, email, !!createUser);
  } finally {
    if (label && orig) label.textContent = orig;
    if (btn) btn.disabled = false;
  }
}

function handleOtpSendError(err, email, createUser) {
  const blob = String(err?.message || err || '') + ' ' + String(err?.code || err?.error_code || '');
  const low = blob.toLowerCase();
  const status = err?.status;
  if (status === 429 || /too many requests|rate limit|ratelimit|retry after/i.test(low)) {
    setViewMsg('gnOtpMsg', 'otp.cooldown', 'Too many attempts. Wait a bit and try again.', true);
    setViewMsg('gnClaimMsg', 'otp.cooldown', 'Too many attempts. Wait a bit and try again.', true);
    return;
  }
  if (!createUser && /otp_disabled|signup_disabled|signups not allowed|user not found/i.test(low)) {
    renderNoAccountBox();
    return;
  }
  setViewMsg(createUser ? 'gnClaimMsg' : 'gnOtpMsg', 'otp.sendFailed', "Couldn't send the code. Try again.", true);
}

function renderNoAccountBox() {
  const host = $('gnOtpNoAccount');
  if (!host || host.dataset.done) return;
  host.dataset.done = '1';
  host.innerHTML = `
    <div class="gn-no-account" role="alert">
      <b data-i18n="otp.noAccountTitle">NO ACCOUNT FOUND</b>
      <p data-i18n="otp.noAccountBody">There is no GRID//NODE account for this email. Check it for typos, or continue with a NODE KEY invite.</p>
      <div class="gn-auth-links">
        <button class="gn-auth-link" id="gnDiffEmailBtn" type="button"><span data-i18n="otp.useDifferentEmail">USE A DIFFERENT EMAIL</span></button>
        <button class="gn-auth-link" id="gnHaveKeyBtn" type="button"><span data-i18n="otp.haveNodeKey">I HAVE A NODE KEY</span></button>
      </div>
    </div>`;
  window.GN_I18N?.applyTo?.(host);
  $('gnDiffEmailBtn')?.addEventListener('click', () => {
    delete host.dataset.done;
    host.innerHTML = '';
    const em = $('gnOtpEmail');
    em?.focus(); em?.select();
  });
  $('gnHaveKeyBtn')?.addEventListener('click', () => showAuthView('newhere'));
}

function wireCodeBoxes() {
  const boxes = [...document.querySelectorAll('.gn-code-box')];
  if (!boxes.length) return;
  const readCode = () => boxes.map(b => b.value).join('');
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(0, 1);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      if (readCode().length === 6) verifyOtpCode();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
      if (e.key === 'Enter' && readCode().length === 6) verifyOtpCode();
    });
    box.addEventListener('paste', e => {
      e.preventDefault();
      const digits = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      digits.split('').forEach((d, j) => { if (boxes[i + j]) boxes[i + j].value = d; });
      boxes[Math.min(i + digits.length, boxes.length - 1)]?.focus();
      if (readCode().length === 6) verifyOtpCode();
    });
  });
  boxes[0]?.focus();
}

async function verifyOtpCode() {
  if (gnVerifying || !gnOtp) return;
  const boxes = [...document.querySelectorAll('.gn-code-box')];
  const code = boxes.map(b => b.value).join('');
  if (code.length !== 6) {
    setViewMsg('gnOtpMsg', 'otp.wrongCode', "That code didn't work. Check it and try again.", true);
    return;
  }
  gnVerifying = true;
  const btn = $('gnVerifyBtn');
  const label = btn?.querySelector('span');
  const orig = label?.textContent;
  if (label) label.textContent = tx('otp.verifying', 'VERIFYING...');
  if (btn) btn.disabled = true;
  try {
    await verifySignInCode(gnOtp.email, code);
    abortConditionalMediation();
    trackLogin('otp');
    await completeCloudSession();
  } catch (err) {
    gnVerifying = false;
    if (label && orig) label.textContent = orig;
    if (btn) btn.disabled = false;
    const low = String(err?.message || err || '').toLowerCase();
    const expired = /expired/i.test(low) || (Date.now() - gnOtp.sentAt) > OTP_EXPIRY_S * 1000;
    setViewMsg('gnOtpMsg', expired ? 'otp.expiredCode' : 'otp.wrongCode',
      expired ? 'That code expired. Request a new one below.' : "That code didn't work. Check it and try again.", true);
    boxes.forEach(b => { b.value = ''; });
    boxes[0]?.focus();
  }
}

async function resendOtpCode() {
  if (!gnOtp) return;
  const btn = $('gnResendBtn');
  if (btn) btn.disabled = true;
  try {
    await sendSignInCode(gnOtp.email, gnOtp.createUser);
    gnOtp.sentAt = Date.now();
    document.querySelectorAll('.gn-code-box').forEach(b => { b.value = ''; });
    document.querySelector('.gn-code-box')?.focus();
    startOtpTimers();
    setViewMsg('gnOtpMsg', 'otp.codeSent', 'Code sent. Check your inbox.', false);
  } catch (err) {
    handleOtpSendError(err, gnOtp.email, gnOtp.createUser);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function clearOtpTimers() {
  gnOtpTimers.forEach(clearInterval);
  gnOtpTimers = [];
}

function fmtClock(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function startOtpTimers() {
  clearOtpTimers();
  if (!gnOtp) return;
  const tick = () => {
    if (!gnOtp) { clearOtpTimers(); return; }
    const elapsed = Math.floor((Date.now() - gnOtp.sentAt) / 1000);
    const expEl = $('gnCodeExpiry');
    if (expEl) expEl.textContent = fmtClock(OTP_EXPIRY_S - elapsed);
    const remain = OTP_RESEND_S - elapsed;
    const wrap = $('gnResendWrap'), btn = $('gnResendBtn');
    if (wrap && btn) {
      if (remain > 0) {
        wrap.hidden = false; btn.hidden = true;
        const t = $('gnResendTimer');
        if (t) t.textContent = fmtClock(remain);
      } else {
        wrap.hidden = true; btn.hidden = false;
      }
    }
    if (elapsed >= OTP_EXPIRY_S) {
      clearOtpTimers();
      setViewMsg('gnOtpMsg', 'otp.expiredCode', 'That code expired. Request a new one below.', true);
    }
  };
  tick();
  gnOtpTimers.push(setInterval(tick, 1000));
}

/* ---------- New-here: NODE KEY validate, claim, waitlist ---------- */

async function submitNewHereKey() {
  const input = $('gnNewKeyInput');
  const code = (input?.value || '').trim().toUpperCase();
  if (!code) {
    setViewMsg('gnKeyMsg', 'nodekey.enterKey', 'ENTER YOUR NODE KEY', true);
    input?.focus();
    return;
  }
  const btn = $('gnValidateKeyBtn');
  const label = btn?.querySelector('span');
  const orig = label?.textContent;
  if (label) label.textContent = tx('nodekey.validating', 'VALIDATING...');
  if (btn) btn.disabled = true;
  setViewMsg('gnKeyMsg', null);
  try {
    const data = await nodeKeyApi('validate', { code });
    if (data?.ok && data.grant) {
      setNodeKeyGrant(data.grant);
      if (gnKeyContinuation) {
        const cont = gnKeyContinuation;
        gnKeyContinuation = null; gnKeySkipAction = null;
        cont();
        return;
      }
      /* No pending continuation: reveal the claim UI (OTP or Google). */
      const formWrap = $('gnKeyFormWrap'), claim = $('gnClaimWrap');
      if (formWrap) formWrap.hidden = true;
      if (claim) {
        claim.hidden = false;
        window.GN_I18N?.applyTo?.(claim);
        /* Re-render the Google button into the claim mount. */
        googleIdentityInitialized = false;
        renderGoogleIdentityButton();
      }
    } else {
      const [key, fallback] = NODE_KEY_REASON_I18N[data?.reason] || NODE_KEY_REASON_I18N.INVALID;
      setViewMsg('gnKeyMsg', key, fallback, true);
    }
  } catch (error) {
    setViewMsg('gnKeyMsg', 'nodekey.checkFailed', 'COULD NOT CHECK THE KEY — TRY AGAIN', true);
  } finally {
    if (label && orig) label.textContent = orig;
    if (btn) btn.disabled = false;
  }
}

async function submitWaitlist(event) {
  if (event?.preventDefault) event.preventDefault();
  const email = ($('gnWaitlistEmail')?.value || '').trim().toLowerCase();
  const honeypot = ($('gnWaitlistHp')?.value || '').trim();
  /* Honeypot: bots get the same success message, nothing is stored. */
  if (honeypot) {
    setViewMsg('gnWaitlistMsg', 'otp.waitlistSuccess', "You're on the list. We'll email you once when new keys open. Nothing else, ever.", false);
    $('gnWaitlistForm')?.reset();
    return;
  }
  const now = Date.now();
  if (now - gnWaitLastSubmit < 30000) {
    setViewMsg('gnWaitlistMsg', 'otp.cooldown', 'Too many attempts. Wait a bit and try again.', true);
    return;
  }
  if (!email || !email.includes('@')) {
    const lang = window.GN_I18N?.getLang?.();
    setViewMsg('gnWaitlistMsg', null);
    const el = document.getElementById('gnWaitlistMsg');
    if (el) el.textContent = lang === 'es-419' ? 'Escribe un correo válido.' : 'Enter a valid email address.';
    return;
  }
  gnWaitLastSubmit = now;
  const btn = $('gnWaitlistBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${CLOUD_CONFIG.url}/rest/v1/waitlist`, {
      method: 'POST',
      headers: {
        apikey: CLOUD_CONFIG.anonKey,
        Authorization: 'Bearer ' + CLOUD_CONFIG.anonKey,
        'Content-Type': 'application/json',
        /* No resolution=ignore-duplicates: upsert needs SELECT which anon
         * must not have. Plain INSERT returns 409 on duplicate email,
         * which we treat as success below. */
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        email,
        source: 'auth-no-key',
        locale: window.GN_I18N?.getLang?.() === 'es-419' ? 'es' : 'en',
        consented_at: new Date().toISOString()
      })
    });
    /* 201 created, 200/409 duplicate — duplicates get the same success message. */
    if (res.status === 201 || res.status === 200 || res.status === 409) {
      setViewMsg('gnWaitlistMsg', 'otp.waitlistSuccess', "You're on the list. We'll email you once when new keys open. Nothing else, ever.", false);
      $('gnWaitlistForm')?.reset();
    } else {
      throw new Error('WAITLIST_' + res.status);
    }
  } catch (error) {
    setViewMsg('gnWaitlistMsg', 'otp.waitlistError', "Couldn't join the list. Try again.", true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------- Progressive passkey: conditional mediation ---------- */

function abortConditionalMediation() {
  try { gnConditionalAbort?.abort(); } catch (e) { /* silent */ }
  gnConditionalAbort = null;
}

function armConditionalMediation() {
  const emailInput = $('gnOtpEmail');
  if (!emailInput || emailInput.dataset.cmWired) return;
  emailInput.dataset.cmWired = '1';
  emailInput.setAttribute('autocomplete', 'username webauthn');
  emailInput.addEventListener('input', () => {
    const email = emailInput.value.trim();
    if (email.includes('@')) startConditionalGet(email);
    else abortConditionalMediation();
  });
}

/* Conditional mediation is progressive enhancement: current GRID//NODE
 * credentials are non-discoverable (no residentKey at registration), so this
 * degrades silently and never disturbs the OTP flow. Uses the same
 * authResp/challengeToken protocol as the explicit passkey flow. */
async function startConditionalGet(email) {
  abortConditionalMediation();
  try {
    if (!window.PublicKeyCredential || typeof window.PublicKeyCredential.isConditionalMediationAvailable !== 'function') return;
    if (!await window.PublicKeyCredential.isConditionalMediationAvailable()) return;
    const functionsUrl = `${CLOUD_CONFIG.url}/functions/v1`;
    const res = await fetch(`${functionsUrl}/webauthn-authenticate-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLOUD_CONFIG.anonKey },
      body: JSON.stringify({ email })
    });
    if (!res.ok) return; /* silent: OTP flow continues */
    const options = await res.json();
    if (!options?.challenge || !options?.challengeToken) return;
    const b64urlToBytes = (s) => {
      const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    };
    const publicKey = {
      challenge: b64urlToBytes(options.challenge),
      rpId: options.rpId,
      allowCredentials: (options.allowCredentials || []).map(c => ({ ...c, id: b64urlToBytes(c.id) })),
      userVerification: options.userVerification || 'preferred',
      timeout: options.timeout
    };
    gnConditionalAbort = new AbortController();
    const credential = await navigator.credentials.get({
      publicKey,
      mediation: 'conditional',
      signal: gnConditionalAbort.signal
    });
    if (credential) {
      const authResp = {
        id: credential.id,
        rawId: credential.id,
        type: credential.type,
        response: {
          authenticatorData: btoa(String.fromCharCode(...new Uint8Array(credential.response.authenticatorData))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
          clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
          signature: btoa(String.fromCharCode(...new Uint8Array(credential.response.signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
          userHandle: credential.response.userHandle ? btoa(String.fromCharCode(...new Uint8Array(credential.response.userHandle))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null
        }
      };
      await verifyPasskeyAssertion(authResp, options.challengeToken);
    }
  } catch (e) {
    /* Silent: NotAllowedError / AbortError / unsupported — OTP flow continues. */
  }
}

async function verifyPasskeyAssertion(authResp, challengeToken) {
  const functionsUrl = `${CLOUD_CONFIG.url}/functions/v1`;
  const verifyResponse = await fetch(`${functionsUrl}/webauthn-authenticate-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CLOUD_CONFIG.anonKey },
    body: JSON.stringify({ authResp, challengeToken })
  });
  if (!verifyResponse.ok) throw new Error('AUTH_VERIFY_FAILED');
  const { access_token, refresh_token } = await verifyResponse.json();
  if (!access_token || !refresh_token) throw new Error('AUTH_VERIFY_FAILED');
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { data, error } = await client.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  if (!data?.session?.user?.id) {
    setAuthMessage(tx('auth.passkeyFailed', 'PASSKEY SIGN-IN FAILED'), false);
    return false;
  }
  abortConditionalMediation();
  trackLogin('passkey');
  await completeCloudSession(data.session);
  return true;
}

/* Preview-only login instrumentation. */
function trackLogin(method) {
  try { window.GN_USAGE?.track?.('auth_success_' + method, { auth_method: method }); } catch (e) { /* silent */ }
}
function applyAuthTranslations(recovering) {
  const login = $('login');
  const title = login?.querySelector('.gn-auth-title');
  const copy = login?.querySelector('.gn-auth-copy');
  const note = login?.querySelector('.gn-auth-note');
  if (title) title.setAttribute('data-i18n', recovering ? 'auth.resetAccess' : 'auth.enterGrid');
  if (copy) copy.setAttribute('data-i18n', recovering ? 'auth.enterNewPassword' : 'auth.entryCopy');
  if (note) note.setAttribute('data-i18n', 'landing.vaultPolicy');
  const kicker = login?.querySelector('.gn-auth-kicker');
  if (kicker) kicker.setAttribute('data-i18n', 'auth.kicker');
  const policyLink = login?.querySelector('#gnVaultPolicyLink');
  if (policyLink) policyLink.setAttribute('data-i18n', 'landing.yourDataYourRules');
  const email = $('gnAuthEmail');
  if (email) {
    email.setAttribute('data-i18n-placeholder', 'auth.email');
    email.setAttribute('data-i18n-aria-label', 'auth.emailAddress');
  }
  const password = $('gnAuthPassword');
  if (password) {
    password.setAttribute('data-i18n-placeholder', recovering ? 'auth.newPassword' : 'auth.password');
    password.setAttribute('data-i18n-aria-label', recovering ? 'auth.enterNewPassword' : 'auth.password');
  }
  const submit = $('gnAuthSubmit');
  if (submit) submit.setAttribute('data-i18n', recovering ? 'auth.updatePassword' : 'auth.signIn');
  const toggle = $('gnAuthModeToggle');
  if (toggle) toggle.setAttribute('data-i18n', recovering ? 'auth.backToSignIn' : 'auth.createAccount');
  const reset = $('gnAuthReset');
  if (reset) reset.setAttribute('data-i18n', 'auth.resetAccess');
  const google = $('gnGoogleButtonMount');
  if (google) google.setAttribute('data-i18n-aria-label', 'auth.continueWithGoogle');
  window.GN_I18N?.applyTo?.(login);
}
function updateAuthMode() {
  const submit = $('gnAuthSubmit'), toggle = $('gnAuthModeToggle');
  if (submit) submit.textContent = authMode === 'recovery' ? tx('auth.updatePassword', 'UPDATE PASSWORD') : authMode === 'signin' ? tx('auth.signIn', 'SIGN IN TO CLOUD') : tx('auth.createCloudAccount', 'CREATE CLOUD ACCOUNT');
  if (toggle) toggle.textContent = authMode === 'signin' ? tx('auth.createAccount', 'CREATE ACCOUNT') : tx('auth.backToSignIn', 'BACK TO SIGN IN');
}
function toggleAuthMode() { if (authMode === 'recovery') { passwordRecoveryActive = false; authMode = 'signin'; authShell(); return; } authMode = authMode === 'signin' ? 'signup' : 'signin'; updateAuthMode(); setAuthMessage('', false); }
function setAuthMessage(message, error = false) {
  const element = $('loginMsg');
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = error ? 'error' : 'status';
  element.style.removeProperty('color');
}

/* v0.15.55: 18+ age gate + Terms/Privacy acceptance via modal. Triggered on
 * every explicit entry path (device, passkey, email cloud auth, Google).
 * Acceptance is stored under a gn_-prefixed key so Delete All Local Data
 * re-arms the gate. */
const LEGAL_ACCEPT_KEY = 'gn_legal_accept_v1';
function legalAccepted() { try { return !!localStorage.getItem(LEGAL_ACCEPT_KEY); } catch (err) { return false; } }
function markLegalAccepted() { try { localStorage.setItem(LEGAL_ACCEPT_KEY, JSON.stringify({ v: 1, at: new Date().toISOString() })); } catch (err) {} }
let gnLegalPending = null;
function requestLegalAccept(proceed) {
  if (legalAccepted()) { if (typeof proceed === 'function') proceed(); return; }
  gnLegalPending = typeof proceed === 'function' ? proceed : null;
  const modal = $('gnLegalModal');
  if (!modal) { const p = gnLegalPending; gnLegalPending = null; if (p) p(); return; }
  const terms = $('gnLegalModalTerms'), research = $('gnLegalModalResearch');
  if (terms) terms.checked = false;
  if (research) research.checked = false;
  setLegalModalMessage('', false);
  window.GN_I18N?.applyTo?.(modal);
  modal.hidden = false;
  modal.classList.add('active');
  try { terms?.focus(); } catch (err) {}
}
function closeLegalModal() { const m = $('gnLegalModal'); if (m) { m.classList.remove('active'); m.hidden = true; } gnLegalPending = null; }
function setLegalModalMessage(message, error = false) {
  const element = $('gnLegalModalMsg');
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = error ? 'error' : 'status';
}
function confirmLegalModal() {
  const terms = $('gnLegalModalTerms')?.checked;
  const research = $('gnLegalModalResearch')?.checked;
  if (terms && research) {
    markLegalAccepted();
    const pending = gnLegalPending; gnLegalPending = null;
    const m = $('gnLegalModal'); if (m) { m.classList.remove('active'); m.hidden = true; }
    setAuthMessage('', false);
    if (pending) pending();
    return;
  }
  const missing = [];
  if (!terms) missing.push(tx('legal.needTerms', 'terms agreement'));
  if (!research) missing.push(tx('legal.needResearch', 'research disclaimer'));
  setLegalModalMessage(tx('legal.gateIncomplete', '// PLEASE COMPLETE: ') + missing.join(' + '), true);
}

function loadGoogleIdentityLibrary() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (googleIdentityPromise) return googleIdentityPromise;
  googleIdentityPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gridnode-google-identity]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google), { once: true });
      existing.addEventListener('error', () => reject(new Error('GOOGLE_LIBRARY_UNAVAILABLE')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.gridnodeGoogleIdentity = 'true';
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('GOOGLE_LIBRARY_UNAVAILABLE'));
    document.head.appendChild(script);
  });
  return googleIdentityPromise;
}

/* v0.15.55: Google returns only when actually wired. While unwired the mount
 * stays hidden — no dead "SETUP PENDING" button. */
function renderGoogleFallback(host, message) {
  if (!host?.isConnected) return;
  host.style.display = 'none';
}

async function renderGoogleIdentityButton() {
  const host = $('gnGoogleButtonMount');
  if (!host) return;
  host.style.display = 'none';
  /* AGENT2 full-pass: the GOOGLE label above the mount must never dangle
   * without a button — it follows the mount's visibility exactly. */
  const gnGoogleLabel = $('gnGoogleLabel');
  if (gnGoogleLabel) gnGoogleLabel.style.display = 'none';
  const enabled = await isCloudProviderEnabled('google');
  if (!host.isConnected) return;
  if (!enabled) return;
  host.style.removeProperty('display');
  if (gnGoogleLabel) gnGoogleLabel.style.removeProperty('display');
  try {
    await loadGoogleIdentityLibrary();
    if (!host.isConnected || !window.google?.accounts?.id) throw new Error('GOOGLE_LIBRARY_UNAVAILABLE');
    host.replaceChildren();
    if (!googleIdentityInitialized) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
        context: 'signin',
        ux_mode: 'popup'
      });
      googleIdentityInitialized = true;
    }
    window.google.accounts.id.renderButton(host, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: Math.min(336, Math.max(260, host.clientWidth || 336)),
      locale: document.documentElement.lang === 'es' ? 'es' : 'en'
    });
    installGooglePopupWatch(host);
  } catch (error) {
    console.warn('[GRID//NODE Google identity]', error);
    /* F1 flow steering: GIS is the branded road, but when the GIS library
     * itself is unavailable (blocked or failed to load) the Supabase
     * redirect flow remains as the genuine fallback — a working sign-in
     * beats no sign-in. handleGoogleSignIn keeps its own NODE KEY
     * pre-gate, so the fallback never bypasses the beta gate. */
    if (!host.isConnected) return;
    host.style.removeProperty('display');
    const gnGoogleLabelErr = $('gnGoogleLabel');
    if (gnGoogleLabelErr) gnGoogleLabelErr.style.removeProperty('display');
    host.replaceChildren();
    const fallbackBtn = document.createElement('button');
    fallbackBtn.type = 'button';
    fallbackBtn.className = 'gn-auth-secondary gn-google-fallback-btn';
    fallbackBtn.textContent = tx('auth.continueWithGoogle', 'CONTINUE WITH GOOGLE');
    fallbackBtn.addEventListener('click', () => { handleGoogleSignIn(); });
    host.appendChild(fallbackBtn);
    setAuthMessage(tx('auth.googleCouldNotLoad', '// GOOGLE SIGN-IN COULD NOT LOAD — USE EMAIL OR CONTINUE LOCALLY'), true);
  }
}

function installGooglePopupWatch(host) {
  if (googlePopupWatchInstalled || !host) return;
  googlePopupWatchInstalled = true;
  window.addEventListener('blur', () => {
    /* Focus moving into the GIS iframe is the only reliable parent-side
       signal that the user actually activated the Google button (clicks
       inside the cross-origin iframe never reach parent listeners). */
    const frame = host.querySelector('iframe');
    if (frame && document.activeElement === frame) {
      googlePopupAttemptAt = Date.now();
      googleCredentialSeen = false;
    }
  });
  window.addEventListener('focus', () => {
    if (!googlePopupAttemptAt || googleCredentialSeen) return;
    if (Date.now() - googlePopupAttemptAt > 10 * 60 * 1000) { googlePopupAttemptAt = 0; return; }
    const attemptAt = googlePopupAttemptAt;
    /* Grace period: on success the credential callback lands within
       moments of the popup closing; only surface the note if it didn't. */
    setTimeout(() => {
      if (googleCredentialSeen || googlePopupAttemptAt !== attemptAt) return;
      googlePopupAttemptAt = 0;
      setAuthMessage(tx('auth.googleDidNotComplete', "// GOOGLE SIGN-IN DIDN'T COMPLETE — TRY AGAIN, USE AN EMAIL CODE, OR CONTINUE ON THIS DEVICE"), true);
    }, 1200);
  });
}

async function handleGoogleCredential(response) {
  googleCredentialSeen = true;
  googlePopupAttemptAt = 0;
  const host = $('gnGoogleButtonMount');
  if (!legalAccepted()) { requestLegalAccept(() => handleGoogleCredential(response)); return; }
  requireNodeKeyForGoogle(() => doGoogleCredential(response));
}

async function doGoogleCredential(response) {
  const host = $('gnGoogleButtonMount');
  host?.classList.add('loading');
  setAuthMessage(tx('auth.verifyingGoogle', '// VERIFYING GOOGLE IDENTITY...'), false);
  try {
    const session = await signInWithGoogleIdToken(response?.credential);
    if (!session) throw new Error('NO_SESSION');
    trackLogin('google');
    await completeCloudSession(session);
    maybeOfferPasskeyRegistration();
  } catch (error) {
    setAuthMessage(tx('auth.googleCouldNotComplete', '// GOOGLE SIGN-IN COULD NOT COMPLETE — RETRY OR USE EMAIL'), true);
    host?.classList.remove('loading');
  }
}

async function requestPasswordReset() {
  const email = $('gnAuthEmail')?.value?.trim() || $('gnOtpEmail')?.value?.trim();
  if (!email || !email.includes('@')) { setAuthMessage(tx('auth.enterEmailFirst', '// ENTER YOUR ACCOUNT EMAIL FIRST'), true); return; }
  const button = $('gnAuthReset'); if (button) button.disabled = true;
  try {
    await resetPasswordCloud(email);
    setAuthMessage(tx('auth.recoveryLinkSent', '// RECOVERY LINK SENT — CHECK YOUR EMAIL'), false);
  } catch (error) {
    setAuthMessage(error.message === 'CLOUD_UNAVAILABLE' ? tx('auth.recoveryUnavailable', '// CLOUD RECOVERY UNAVAILABLE — RETRY WHEN ONLINE') : `// RECOVERY ERROR: ${error.message || 'TRY AGAIN'}`, true);
  } finally { if (button) button.disabled = false; }
}

async function submitAuth() {
  if (!legalAccepted()) { requestLegalAccept(() => submitAuth()); return; }
  const email = $('gnAuthEmail')?.value?.trim();
  const password = $('gnAuthPassword')?.value || '';
  if (authMode !== 'recovery' && (!email || !email.includes('@'))) { setAuthMessage(tx('auth.validEmail', '// ENTER A VALID EMAIL ADDRESS'), true); return; }
  if (password.length < 8) { setAuthMessage(tx('auth.passwordMin', '// PASSWORD MUST BE AT LEAST 8 CHARACTERS'), true); return; }
  /* NODE KEY beta gate: new cloud accounts need a valid key first.
   * The newhere view replaces the login card, so stash the pending
   * credentials and restore them after the gate passes. */
  if (authMode === 'signup' && !getNodeKeyGrant() && !gnSkipKeyGateOnce) {
    gnPendingCreds = { email, password };
    requireNodeKeyForSignup(() => {
      gnAuthView = 'welcome';
      gnExpandPassword = true;
      authShell();
      const pc = gnPendingCreds; gnPendingCreds = null;
      if (pc?.email && $('gnAuthEmail')) $('gnAuthEmail').value = pc.email;
      if (pc?.password && $('gnAuthPassword')) $('gnAuthPassword').value = pc.password;
      submitAuth();
    });
    return;
  }
  gnSkipKeyGateOnce = false;
  const submit = $('gnAuthSubmit'); if (submit) { submit.disabled = true; submit.textContent = tx('auth.connecting', 'CONNECTING...'); }
  try {
    if (authMode === 'recovery') {
      await updateCloudPassword(password);
      passwordRecoveryActive = false;
      const session = await getCloudSession();
      if (!session) throw new Error('RECOVERY_SESSION_EXPIRED');
      await completeCloudSession(session);
    } else if (authMode === 'signup') {
      const result = await signUpCloud(email, password);
      if (result?.session) { trackLogin('password'); await completeCloudSession(result.session); maybeOfferPasskeyRegistration(); } else { setAuthMessage(tx('auth.accountCreated', '// ACCOUNT CREATED — CHECK YOUR EMAIL TO CONFIRM'), false); }
    } else {
      const session = await signInCloud(email, password);
      if (!session) throw new Error('NO_SESSION');
      trackLogin('password');
      await completeCloudSession(session);
    }
  } catch (error) {
    setAuthMessage(error.message === 'CLOUD_UNAVAILABLE' ? tx('auth.cloudUnavailable', '// CLOUD AUTH UNAVAILABLE — CONTINUE LOCALLY OR RETRY WHEN ONLINE') : `// AUTH ERROR: ${error.message || 'CHECK YOUR DETAILS'}`, true);
  } finally {
    if (submit) { submit.disabled = false; updateAuthMode(); }
  }
}

/* NODE KEY beta gate (v0.15.56+): new cloud accounts need a single-use key.
 * Existing accounts are grandfathered via the `status` action server-side. */

const NODE_KEY_FUNCTION_URL = `${CLOUD_CONFIG.url}/functions/v1/redeem-node-key`;
const NODE_KEY_GRANT_KEY = 'gn_nodekey_grant_v1';

function getNodeKeyGrant() {
  try { return localStorage.getItem(NODE_KEY_GRANT_KEY) || ''; } catch { return ''; }
}

function setNodeKeyGrant(token) {
  try {
    if (token) localStorage.setItem(NODE_KEY_GRANT_KEY, token);
    else localStorage.removeItem(NODE_KEY_GRANT_KEY);
  } catch { /* storage unavailable: gate still works, grant just isn't cached */ }
}

async function nodeKeyApi(action, payload = {}, accessToken = '') {
  const headers = { 'Content-Type': 'application/json', apikey: CLOUD_CONFIG.anonKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await withTimeout(fetch(NODE_KEY_FUNCTION_URL, {
    method: 'POST', headers, body: JSON.stringify({ action, ...payload }),
  }), 15000);
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok && res.status !== 400 && res.status !== 429) throw new Error('NODEKEY_UNREACHABLE');
  return body || { ok: false, reason: 'SERVER' };
}

/* NODE KEY front doors — redesigned around the newhere auth view.
 * openNodeKeyEntry: visible invite entry on the login screen.
 * openCloudConnect: way back for local-mode users who later receive a key,
 *   with an "I already have an account" skip back to the welcome view. */
function openNodeKeyEntry() {
  gnKeyContinuation = null;
  gnKeySkipAction = null;
  gnAuthView = 'newhere';
  modules.showScreen('login');
  authShell();
}

function openCloudConnect() {
  gnKeyContinuation = null;
  gnKeySkipAction = () => { gnKeySkipAction = null; showAuthView('welcome'); };
  gnAuthView = 'newhere';
  modules.showScreen('login');
  authShell();
}

/* Google pre-gate: stop orphan auth accounts at the source. On devices that
 * have never completed a Google sign-in (and hold no grant), the newhere view
 * appears BEFORE the OAuth dance, with a skip link for returning users.
 * The post-auth backstop (ensureNodeKeyClearance) remains the enforcer.
 *
 * Restored 2026-10-03: these definitions were lost in the auth redesign and
 * the dangling calls threw ReferenceError inside the GIS credential callback,
 * silently killing Google sign-in on devices without a node key grant. */
const GOOGLE_KNOWN_KEY = 'gn_google_known_v1';
function isGoogleKnownDevice() {
  try { return localStorage.getItem(GOOGLE_KNOWN_KEY) === '1'; } catch (err) { return false; }
}
function markGoogleKnownDevice() {
  try { localStorage.setItem(GOOGLE_KNOWN_KEY, '1'); } catch (err) { /* private mode */ }
}
function markGoogleKnownSession(session) {
  if (session?.user?.app_metadata?.provider === 'google') markGoogleKnownDevice();
}

/* F1 flow steering (2026-10-13): once a user clears the NODE KEY gate in
 * this page session (key validated, or the "already have an account" skip),
 * Google sign-in stays on the branded GIS road instead of being handed to
 * the Supabase redirect flow. The flag is session-scoped only — nothing is
 * persisted — and the fail-closed post-auth backstop
 * (ensureNodeKeyClearance) still enforces clearance for genuinely new
 * accounts, exactly as it did when the gate continuation used the
 * redirect flow. */
let gnGoogleGatePassed = false;

function returnToGoogleSignIn() {
  gnGoogleGatePassed = true;
  gnAuthView = 'welcome';
  authShell();
  modules.showScreen('login');
  setAuthMessage(tx('nodekey.googleReady', '// CLEARED — TAP CONTINUE WITH GOOGLE TO FINISH SIGNING IN'), false);
}

function requireNodeKeyForGoogle(proceed) {
  const passThrough = () => {
    const p = proceed;
    gnKeyContinuation = null;
    gnKeySkipAction = null;
    p();
  };
  if (getNodeKeyGrant() || isGoogleKnownDevice() || gnGoogleGatePassed) { passThrough(); return; }
  gnKeyContinuation = passThrough;
  gnKeySkipAction = passThrough;
  gnAuthView = 'newhere';
  modules.showScreen('login');
  authShell();
  setAuthMessage(tx('nodekey.googleGate', '// NEW GOOGLE ACCOUNTS NEED A NODE KEY — OR CONTINUE IF YOU ALREADY HAVE ONE'), false);
}

const NODE_KEY_REASON_I18N = {
  INVALID: ['nodekey.denied', 'KEY NOT RECOGNIZED — CHECK IT AND TRY AGAIN'],
  USED_UP: ['nodekey.used', '// ACCESS DENIED // KEY ALREADY USED'],
  REVOKED: ['nodekey.revoked', '// ACCESS DENIED // KEY REVOKED'],
  EXPIRED: ['nodekey.expired', '// ACCESS DENIED // KEY EXPIRED'],
  RATE_LIMITED: ['nodekey.rateLimited', '// TOO MANY ATTEMPTS — WAIT AND RETRY'],
};

/* Pre-gate for flows that always create a new account (email signup via the
 * password fallback). The newhere view replaces the login card, so pending
 * credentials are stashed and restored after the gate passes. */
function requireNodeKeyForSignup(continuation) {
  if (getNodeKeyGrant() || gnSkipKeyGateOnce) { continuation(); return; }
  gnKeyContinuation = () => {
    const cont = continuation;
    gnKeyContinuation = null;
    gnKeySkipAction = null;
    gnSkipKeyGateOnce = true;
    cont();
  };
  gnKeySkipAction = null;
  gnAuthView = 'newhere';
  modules.showScreen('login');
  authShell();
  setAuthMessage(tx('nodekey.signupNeedsKey', 'A NODE KEY IS REQUIRED TO CREATE A CLOUD ACCOUNT — VALIDATE YOURS FIRST'), false);
}

/* Backstop for flows where new-vs-returning is unknown until after auth
 * (Google OAuth / GIS popup). Returns true when cloud entry is cleared.
 *
 * FAIL-CLOSED (v0.15.57): the status check must positively clear the user.
 * Any network failure, non-OK response, or unexpected payload parks the
 * session at the login screen with a retry affordance instead of letting
 * the user in. The session is kept (not signed out): the check failed,
 * not the credentials. */
async function ensureNodeKeyClearance(session) {
  const accessToken = session?.access_token;
  if (!accessToken) return true;
  let status = null;
  try {
    status = await nodeKeyApi('status', {}, accessToken);
  } catch (error) {
    console.warn('[GRID//NODE NODE KEY] status check failed; failing closed', error);
    return parkForKeyRetry(session);
  }
  if (!status?.ok) {
    console.warn('[GRID//NODE NODE KEY] status check not OK; failing closed', status?.reason);
    return parkForKeyRetry(session);
  }
  const needsKey = status.needsKey === true;
  if (!needsKey) { markGoogleKnownSession(session); return true; }
  const pending = getNodeKeyGrant();
  if (pending) {
    try {
      const res = await nodeKeyApi('consume', { grant: pending }, accessToken);
      if (res?.ok) { setNodeKeyGrant(''); markGoogleKnownSession(session); return true; }
    } catch (error) {
      console.warn('[GRID//NODE NODE KEY] grant consume failed', error);
    }
    setNodeKeyGrant('');
  }
  /* New account, no usable grant: park it at the gate. After the key is
   * validated the newhere view reveals the claim UI, so the user signs in
   * again through OTP or Google and the clearance check consumes the grant. */
  try { await signOutCloud(); } catch { /* already out */ }
  clearSession();
  parkForKeyRetry();
  setAuthMessage(tx('nodekey.needed', '// A NODE KEY IS REQUIRED TO CREATE A CLOUD ACCOUNT'), false);
  return false;
}

/* Fail-closed parking: the key-status check could not be verified (network
 * down, edge function error) or the account needs a key. Park at the newhere
 * view so the user validates a key, then signs in again; the clearance check
 * consumes the grant on the next entry. The session is kept (not signed out):
 * the check failed, not the credentials. */
let gnKeyRetrySession = null;
function parkForKeyRetry(session) {
  gnKeyRetrySession = session || null;
  gnKeyContinuation = null;
  gnKeySkipAction = null;
  gnAuthView = 'newhere';
  authShell();
  modules.showScreen('login');
  setAuthMessage(tx('nodekey.verifyFailed', '// KEY VERIFICATION UNAVAILABLE — CHECK YOUR CONNECTION AND RETRY'), true);
  const msg = $('loginMsg');
  if (msg && !$('gnKeyRetryBtn')) {
    const btn = document.createElement('button');
    btn.id = 'gnKeyRetryBtn';
    btn.type = 'button';
    btn.className = 'gn-auth-primary';
    btn.style.marginTop = '12px';
    btn.textContent = tx('nodekey.retryVerify', 'RETRY VERIFICATION');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = tx('nodekey.verifying', 'VERIFYING...');
      const s = gnKeyRetrySession;
      gnKeyRetrySession = null;
      try { btn.remove(); } catch { /* gone */ }
      if (s) { await completeCloudSession(s); }
      else { parkForKeyRetry(null); }
    });
    msg.after(btn);
  }
  return false;
}

async function handleGoogleSignIn() {
  if (!legalAccepted()) { requestLegalAccept(() => handleGoogleSignIn()); return; }
  requireNodeKeyForGoogle(doGoogleSignIn);
}

async function doGoogleSignIn() {
  const button = $('loginGoogleBtn'); if (button) { button.disabled = true; button.textContent = tx('auth.connecting', 'CONNECTING...'); }
  setAuthMessage(tx('auth.openingGoogle', '// OPENING GOOGLE AUTHENTICATION...'), false);
  try {
    await signInWithGoogle();
    maybeOfferPasskeyRegistration();
  } catch (error) {
    const disabled = error.message === 'GOOGLE_AUTH_DISABLED';
    setAuthMessage(disabled ? tx('auth.googleNotEnabled', '// GOOGLE SIGN-IN IS NOT ENABLED YET — USE EMAIL OR CONTINUE LOCALLY') : error.message === 'CLOUD_UNAVAILABLE' ? tx('auth.googleUnavailable', '// GOOGLE AUTH UNAVAILABLE — CONTINUE LOCALLY OR RETRY WHEN ONLINE') : tx('auth.googleCouldNotStart', '// GOOGLE AUTH COULD NOT START — RETRY OR USE EMAIL'), true);
    if (button) { button.disabled = disabled; button.textContent = disabled ? 'GOOGLE SIGN-IN SETUP PENDING' : 'CONTINUE WITH GOOGLE'; }
  }
}

function enterLocalSession() {
  migrateLegacyLocalData();
  activateSession(restoreLocalSession() || localSession(), false);
  showApp();
}

async function completeCloudSession(session) {
  /* NODE KEY beta gate backstop: catches new accounts that skipped the
   * pre-gate (e.g. Google OAuth / GIS popup, where new-vs-returning is
   * only known after auth). Returns false when the session was parked. */
  if (!(await ensureNodeKeyClearance(session))) return false;
  migrateLegacyLocalData();
  const targetUserId = session?.user?.id ? String(session.user.id) : '';
  const mayMigrateLocal = state.accountKey === 'local' && localWorkspaceMigrationAllowed(targetUserId);
  const localWorkspace = mayMigrateLocal ? captureWorkspace('local') : null;
  activateSession(session, true);
  /* Session-generation guard (audit 2026-10-14, defect 3): if this login
   * was superseded while hydration was in flight (sign-out, account
   * switch — including back into the SAME account), this continuation
   * must not set readiness, migrate, or sync for the new session. */
  const sessionGen = sessionStamp();
  const accountWorkspace = captureWorkspace(state.accountKey);
  showApp();
  // S1: honest empty states. Track hydration so the dashboard can tell
  // "still syncing" / "sync failed" apart from "genuinely no data".
  state.cloudHydration = 'pending';
  let hydration = await hydrateCloudData();
  if (!sessionStampIntact(sessionGen)) return false;
  state.cloudHydration = hydration.ok ? 'ok' : 'failed';
  if (!hydration.ok) {
    // Claim 2a: one retry before deciding. Until hydration succeeds, local
    // records must NOT be uploaded — they may be stale and would upsert
    // over the (unread) cloud state.
    hydration = await hydrateCloudData();
    if (!sessionStampIntact(sessionGen)) return false;
    state.cloudHydration = hydration.ok ? 'ok' : 'failed';
    if (!hydration.ok && hydration.reason === 'HYDRATION_PERSIST_FAILED') {
      // Defect 1: the merged cloud state could not be durably saved on
      // this device. Surface it; uploads stay blocked until a retry
      // commits the merge (dashboard RETRY SYNC path).
      showToast(tx('sync.storageError', 'Storage full or blocked. Cloud data could not be saved on this device. Nothing was uploaded.'), true);
    }
  }
  /* Claim before migration (reliability audit 2026-10-14, item 4): the
   * local records may move into this account only after this account
   * provably owns them on this device. The mark used to be written
   * AFTER the upload, with its result ignored — when the write failed
   * (storage fault), the mark stayed absent and the NEXT account to
   * sign in inherited the same local records. Fail closed: no claim,
   * no migration, no upload of local records; the user sees why and
   * the claim is retried on the next sign-in. */
  let migrationClaimFailed = false;
  /* v8.1 (QA gate G3): the claim is attempted whenever unclaimed local
   * records remain — it is no longer gated on the account workspace
   * looking empty. Hydration persists the account's cloud profile into
   * the account namespace during a FAILED-claim sign-in, so on the
   * retry sign-in the account workspace "had data", the v8 gate skipped
   * the whole block, and the post-sync mark below still fired: the
   * promised retry never ran and the local records stayed stranded in
   * the local namespace. Fail-closed is preserved: localWorkspace was
   * captured only when localWorkspaceMigrationAllowed (owner absent or
   * this user), and nothing migrates or uploads before
   * claimLocalWorkspaceOwner's write verifies by read-back. The
   * migration body itself is unchanged and runs when this sign-in
   * claimed the records, or when the account workspace is still empty
   * (the original first-claim path, ownership already recorded). */
  let migrationClaimedThisSignIn = false;
  if (hydration.ok && localWorkspace && workspaceHasData(localWorkspace)) {
    let recordedOwner = null;
    try { recordedOwner = localStorage.getItem(LOCAL_CLOUD_OWNER_KEY); } catch {}
    if (recordedOwner !== String(targetUserId)) {
      if (claimLocalWorkspaceOwner(targetUserId)) migrationClaimedThisSignIn = true;
      else migrationClaimFailed = true;
    }
    if (!migrationClaimFailed && (migrationClaimedThisSignIn || !workspaceHasData(accountWorkspace))) {
      const remote = hydration.remote || {};
      const migration = { ...localWorkspace };
      if (remote.shots) migration.shots = [];
      if (remote.weights) migration.weights = [];
      if (remote.profile) migration.profile = {};
      if (remote.workspace) {
        migration.results = []; migration.notes = []; migration.symptoms = []; migration.labs = [];
        migration.preferences = {}; migration.settings = {}; migration.arsenal = []; migration.selectedLocation = '';
      }
      restoreWorkspace(migration, { onlyEmpty: true });
    }
  }
  if (hydration.ok) {
    await syncAllCloudData();
    if (!sessionStampIntact(sessionGen)) return false;
    if (!migrationClaimFailed && localWorkspace && workspaceHasData(localWorkspace) && state.cloudStatus === 'CLOUD_SYNCED') {
      markLocalWorkspaceMigrated(targetUserId);
    }
    if (migrationClaimFailed) {
      /* The account's own cloud data synced normally; only the local
       * device records stayed put, unmerged and unuploaded. */
      state.cloudStatus = 'LOCAL_BACKUP';
      showToast(tx('sync.ownerClaimError', "This device's records could not be claimed for your account because storage refused the ownership mark. Nothing from this device was merged or uploaded. Sign in again to retry."), true);
    }
  } else {
    // Hydration still failed after the retry: skip the upload entirely.
    // Records stay queued locally (core's sync gate backstops this) and
    // the retry path (retryCloudHydration) flushes them once hydration
    // succeeds.
    state.cloudStatus = 'LOCAL_BACKUP';
  }
  showApp();
  return true;
}

function showApp() {
  clearAuthReturnState(); /* F2: hydration entry reached — clear exactly once into the app */
  modules.showScreen('app');
  /* v0.15.42: explicit entry point — every session starts on HOME. */
  modules.showPage('Dash');
  modules.loadApp();
}


  /* ── PASSKEY (WebAuthn) — additive sign-in option ─────────────────── */
  let webAuthnLoadPromise = null;

  async function loadWebAuthnLibrary() {
    if (window.SimpleWebAuthnBrowser?.startRegistration) return window.SimpleWebAuthnBrowser;
    if (webAuthnLoadPromise) return webAuthnLoadPromise;
    webAuthnLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-gridnode-webauthn]');
      if (existing) { existing.addEventListener('load', () => resolve(window.SimpleWebAuthnBrowser), { once: true }); return; }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@10.0.0/dist/bundle/index.umd.min.js';
      script.integrity = 'sha384-SijkeUvZZs1bto8G/GPfjLDAg4FRZB5yGFAdMT5T7n3bMnkfFMEhE/h11ClJPNFR';
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.dataset.gridnodeWebauthn = 'true';
      script.onload = () => resolve(window.SimpleWebAuthnBrowser);
      script.onerror = () => reject(new Error('WEBAUTHN_LIBRARY_UNAVAILABLE'));
      document.head.appendChild(script);
    });
    return webAuthnLoadPromise;
  }

  async function isWebAuthnSupported() {
    if (!window.PublicKeyCredential) return false;
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
    try { return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch (_) { return false; }
  }

  function webauthnFunctionsUrl() {
    return `${CLOUD_CONFIG.url}/functions/v1`;
  }

  async function signInWithPasskey(email) {
    const client = await getCloudClient();
    if (!client) throw new Error('CLOUD_UNAVAILABLE');
    const { startAuthentication } = await loadWebAuthnLibrary();
    const functionsUrl = webauthnFunctionsUrl();
    const optionsResponse = await fetch(`${functionsUrl}/webauthn-authenticate-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': CLOUD_CONFIG.anonKey },
      body: JSON.stringify({ email: email || undefined }),
    });
    if (!optionsResponse.ok) {
      if (optionsResponse.status === 404) throw new Error('NO_PASSKEY_REGISTERED');
      throw new Error(`AUTH_OPTIONS_FAILED: ${await optionsResponse.text()}`);
    }
    const options = await optionsResponse.json();
    let authResponse;
    try {
      authResponse = await startAuthentication(options);
    } catch (error) {
      if (error.name === 'NotAllowedError') throw new Error('USER_CANCELLED');
      throw error;
    }
    const verifyResponse = await fetch(`${functionsUrl}/webauthn-authenticate-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': CLOUD_CONFIG.anonKey },
      body: JSON.stringify({ authResp: authResponse, challengeToken: options.challengeToken }),
    });
    if (!verifyResponse.ok) throw new Error('AUTH_VERIFY_FAILED');
    const { access_token, refresh_token } = await verifyResponse.json();
    const { data, error } = await client.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return data.session;
  }

  async function registerPasskey(deviceName) {
    const session = await getCloudSession();
    if (!session) throw new Error('NOT_AUTHENTICATED');
    const { startRegistration } = await loadWebAuthnLibrary();
    const functionsUrl = webauthnFunctionsUrl();
    const optionsResponse = await fetch(`${functionsUrl}/webauthn-register-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': CLOUD_CONFIG.anonKey },
      body: JSON.stringify({ userId: session.user.id, deviceName }),
    });
    if (!optionsResponse.ok) throw new Error(`REGISTER_OPTIONS_FAILED: ${await optionsResponse.text()}`);
    const options = await optionsResponse.json();
    let attestationResponse;
    try {
      attestationResponse = await startRegistration(options);
    } catch (error) {
      if (error.name === 'NotAllowedError') throw new Error('USER_CANCELLED');
      throw error;
    }
    const verifyResponse = await fetch(`${functionsUrl}/webauthn-register-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': CLOUD_CONFIG.anonKey },
      body: JSON.stringify({ attResp: attestationResponse, challengeToken: options.challengeToken, deviceName }),
    });
    if (!verifyResponse.ok) throw new Error(`REGISTER_VERIFY_FAILED: ${await verifyResponse.text()}`);
    return await verifyResponse.json();
  }

  async function listPasskeys() {
    const session = await getCloudSession();
    if (!session) return [];
    const response = await fetch(`${CLOUD_CONFIG.url}/rest/v1/webauthn_credentials?user_id=eq.${session.user.id}&select=id,device_name,aaguid,transports,last_used_at,created_at&order=created_at.desc`, {
      headers: { 'apikey': CLOUD_CONFIG.anonKey, 'Authorization': `Bearer ${session.access_token}` },
    });
    if (!response.ok) return [];
    return await response.json();
  }

  async function revokePasskey(id) {
    const session = await getCloudSession();
    if (!session) throw new Error('NOT_AUTHENTICATED');
    const response = await fetch(`${CLOUD_CONFIG.url}/rest/v1/rpc/revoke_webauthn_credential`, {
      method: 'POST',
      headers: { 'apikey': CLOUD_CONFIG.anonKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential_id: id }),
    });
    if (!response.ok) throw new Error('REVOKE_FAILED');
  }

  function guessDeviceName() {
    const userAgent = navigator.userAgent;
    if (/iPhone/.test(userAgent)) return 'iPhone';
    if (/iPad/.test(userAgent)) return 'iPad';
    if (/Mac OS/.test(userAgent)) return 'Mac';
    if (/Windows/.test(userAgent)) return 'Windows PC';
    if (/Android/.test(userAgent)) return 'Android';
    return 'Unknown device';
  }

  async function wirePasskeyAuth() {
    const button = $('gnPasskeyBtn');
    if (!button || button.dataset.gnPasskeyBound) return;
    button.dataset.gnPasskeyBound = 'true';
    if (!(await isWebAuthnSupported())) {
      // keep the button visible but show a clear unsupported message on click
      // v0.15.55: legal gate still comes first — no entry path skips it.
      button.style.display = '';
      button.addEventListener('click', () => {
        if (!legalAccepted()) { requestLegalAccept(() => { const b = $('gnPasskeyBtn'); if (b && !b.disabled) b.click(); }); return; }
        setAuthMessage('// ' + tx('auth.passkeyNotSupportedMsg', 'YOUR DEVICE DOES NOT SUPPORT PASSKEYS. USE GOOGLE SIGN-IN INSTEAD.'), true);
      });
      return;
    }
    button.style.display = '';
    const emailInput = $('gnOtpEmail');
    if (emailInput && !emailInput.dataset.pkWired) {
      emailInput.dataset.pkWired = '1';
      emailInput.autocomplete = 'email webauthn';
    }
    button.addEventListener('click', async () => {
      if (!legalAccepted()) { requestLegalAccept(() => { const b = $('gnPasskeyBtn'); if (b && !b.disabled) b.click(); }); return; }
      const email = $('gnOtpEmail')?.value?.trim();
      if (!email) {
        setAuthMessage('// ' + tx('auth.passkeyEmailFirst', 'ENTER YOUR EMAIL ADDRESS FIRST, THEN CONTINUE WITH PASSKEY.'), true);
        $('gnOtpEmail')?.focus();
        return;
      }
      abortConditionalMediation();
      button.disabled = true;
      setAuthMessage('// ' + tx('auth.connecting', 'CONNECTING...'), false);
      try {
        const session = await signInWithPasskey(email);
        if (session) {
          trackLogin('passkey');
          await completeCloudSession(session);
          setAuthMessage('// ' + tx('auth.passkeyWelcome', 'WELCOME BACK'), false);
        }
      } catch (error) {
        if (error.message === 'NO_PASSKEY_REGISTERED') setAuthMessage('// ' + tx('auth.noPasskeyFound', 'NO PASSKEY REGISTERED YET. SIGN IN WITH GOOGLE FIRST TO CREATE ONE.'), true);
        else if (error.message === 'USER_CANCELLED') setAuthMessage(tx('auth.passkeyCancelled', 'PASSKEY SIGN-IN WAS CANCELLED.'), false);
        else if (error.message === 'WEBAUTHN_LIBRARY_UNAVAILABLE') setAuthMessage('// ' + tx('auth.passkeyNotSupportedMsg', 'YOUR DEVICE DOES NOT SUPPORT PASSKEYS. USE GOOGLE SIGN-IN INSTEAD.'), true);
        else if (String(error.message || '').toLowerCase().includes('email required')) setAuthMessage('// ' + tx('auth.passkeyEmailFirst', 'ENTER YOUR EMAIL ADDRESS FIRST, THEN CONTINUE WITH PASSKEY.'), true);
        else setAuthMessage('// ' + tx('auth.passkeyError', 'PASSKEY SIGN-IN FAILED: {message}', { message: error.message }), true);
      } finally {
        button.disabled = false;
      }
    });
  }

  async function ensurePasskeySection() {
    const page = $('pageProfile');
    if (!page || $('gnPasskeysCard')) return;
    if (!state.cloud) return;
    const hub = page.querySelector('[data-gn-profile-hub]');
    const host = hub?.querySelector('[data-gn-vault-group="security"]') || hub?.querySelector('[data-gn-vault-group="account"]') || hub;
    if (!host) return;
    host.insertAdjacentHTML('beforeend', `<details class="gn-vault-card" id="gnPasskeysCard">
      <summary class="gn-vault-card-head">
        <span class="gn-vault-card-ico" aria-hidden="true"><svg><use href="#gn-vault-core"></use></svg></span>
        <span class="gn-vault-card-titles"><b id="gnPasskeysTitle" data-i18n="auth.passkeysTitle">MANAGE PASSKEYS</b><small class="gn-vault-card-sub" data-i18n="auth.passkeysCopy">Sign in with your fingerprint, face, or security key.</small></span>
        <span class="gn-vault-chev" aria-hidden="true">›</span>
      </summary>
      <div class="gn-vault-card-body">
        <ul class="gn-passkeys-list" data-gn-passkeys-list></ul>
        <button type="button" class="btn-full btn-primary" id="gnRegisterPasskeyBtn" data-i18n="auth.registerNewPasskey">+ REGISTER A NEW PASSKEY</button>
      </div>
    </details>`);
    $('gnRegisterPasskeyBtn')?.addEventListener('click', async () => {
      const btn = $('gnRegisterPasskeyBtn');
      // Guard against double-taps: a second concurrent ceremony would race
      // the first and can burn the single-use challenge.
      if (btn && btn.disabled) return;
      const inline = document.querySelector('#gnPasskeysCard .gn-inline-error');
      const clearInline = () => { const e = document.querySelector('#gnPasskeysCard .gn-inline-error'); if (e) e.remove(); };
      if (!(await isWebAuthnSupported())) {
        clearInline();
        const err = document.createElement('div');
        err.className = 'gn-inline-error';
        err.setAttribute('role', 'alert');
        err.textContent = tx('auth.passkeyNotSupported', 'YOUR BROWSER DOES NOT SUPPORT PASSKEYS');
        $('gnRegisterPasskeyBtn')?.insertAdjacentElement('afterend', err);
        return;
      }
      if (btn) btn.disabled = true;
      try {
        clearInline();
        await registerPasskey(guessDeviceName());
        showToast(tx('auth.passkeyRegistered', 'PASSKEY REGISTERED'));
        await renderPasskeyList();
      } catch (error) {
        if (error.message === 'USER_CANCELLED') { clearInline(); return; }
        clearInline();
        const err = document.createElement('div');
        err.className = 'gn-inline-error';
        err.setAttribute('role', 'alert');
        err.textContent = tx('auth.passkeyRegisterFailed', 'COULDN\'T REGISTER PASSKEY: {message}', { message: error.message });
        $('gnRegisterPasskeyBtn')?.insertAdjacentElement('afterend', err);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    await renderPasskeyList();
    window.GN_I18N?.applyTo?.(page);
  }

  async function renderPasskeyList() {
    const list = document.querySelector('[data-gn-passkeys-list]');
    if (!list) return;
    const passkeys = await listPasskeys();
    if (!passkeys.length) {
      list.innerHTML = `<li class="gn-passkeys-empty" data-i18n="auth.noPasskeys">NO PASSKEYS REGISTERED</li>`;
      return;
    }
    list.innerHTML = passkeys.map(passkey => `<li class="gn-passkey-row" data-id="${safeText(passkey.id)}">
      <div><b>${safeText(passkey.device_name || 'DEVICE')}</b><small>${safeText(tx('auth.lastUsed', 'LAST USED'))} ${safeText(formatDate(passkey.last_used_at || passkey.created_at))}</small></div>
      <button class="gn-passkey-revoke" type="button" data-revoke="${safeText(passkey.id)}">${safeText(tx('auth.revokePasskey', 'REVOKE'))}</button>
    </li>`).join('');
    list.querySelectorAll('[data-revoke]').forEach(button => button.addEventListener('click', async () => {
      const confirmBox = typeof confirmDialog === 'function' ? confirmDialog : (title, copy) => window.confirm(`${title}
${copy}`);
      if (!await confirmBox(tx('auth.revokePasskeyConfirm', 'REVOKE THIS PASSKEY?'), tx('auth.passkeysCopy', 'Sign in with your fingerprint, face, or security key.'))) return;
      try {
        await revokePasskey(button.dataset.revoke);
        showToast(tx('auth.passkeyRevoked', 'PASSKEY REVOKED'));
        await renderPasskeyList();
      } catch (error) {
        showToast(error.message, true);
      }
    }));
  }


  async function maybeOfferPasskeyRegistration() {
    try {
      if (!(await isWebAuthnSupported())) return;
      const passkeySession = await getCloudSession();
      if (!passkeySession) return;
      try {
        const dismissed = localStorage.getItem('gn_passkey_upsell_dismissed');
        if (dismissed && Date.now() - Number(dismissed) < 30 * 864e5) return;
      } catch (_) {}
      // Only offer registration once we know the CURRENT account has none.
      try {
        const passkeys = await listPasskeys();
        if (Array.isArray(passkeys) && passkeys.length > 0) return;
      } catch (_) { /* unknown state: the offer itself is safe */ }
      let overlay = document.getElementById('gnPasskeyUpsell');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'gnPasskeyUpsell';
        overlay.className = 'gn-passkey-upsell';
        overlay.innerHTML = `<div class="gn-passkey-upsell-card" role="dialog" aria-modal="true" aria-labelledby="gnPasskeyUpsellTitle">
          <div class="gn-whatsnew-kicker" data-i18n="auth.passkeysKicker">// PASSKEYS</div>
          <h3 id="gnPasskeyUpsellTitle" data-i18n="auth.registerPasskeyTitle">REGISTER A PASSKEY?</h3>
          <p data-i18n="auth.registerPasskeyCopy">Use your fingerprint, face, or security key to sign in faster next time.</p>
          <div class="gn-passkey-upsell-actions">
            <button type="button" class="btn-full btn-primary" data-passkey-upsell-register data-i18n="auth.registerNewPasskey">+ REGISTER A NEW PASSKEY</button>
            <button type="button" class="btn-full btn-secondary" data-passkey-upsell-later data-i18n="auth.later">LATER</button>
          </div>
        </div>`;
        overlay.addEventListener('click', async event => {
          if (event.target === overlay || event.target.closest('[data-passkey-upsell-later]')) { try { localStorage.setItem('gn_passkey_upsell_dismissed', String(Date.now())); } catch (_) {} overlay.classList.remove('active'); return; }
          if (event.target.closest('[data-passkey-upsell-register]')) {
            const button = overlay.querySelector('[data-passkey-upsell-register]');
            if (button) button.disabled = true;
            try {
              await registerPasskey(guessDeviceName());
              showToast(tx('auth.passkeyRegistered', 'PASSKEY REGISTERED'));
            } catch (error) {
              if (error.message !== 'USER_CANCELLED') showToast(error.message, true);
            } finally {
              overlay.classList.remove('active');
            }
          }
        });
        document.body.appendChild(overlay);
      }
      window.GN_I18N?.applyTo?.(overlay);
      overlay.classList.add('active');
    } catch (_) { /* auth or storage hiccup — never block the main flow */ }
  }

async function startGridNode() {
  if (bootRunning) return;
  bootRunning = true;
  if (window.GN_I18N?.ready) await window.GN_I18N.ready;
  modules.showScreen('boot');
  const term = $('bootTerm'), bar = $('bootBar'), pct = $('bootPct');
  if (term) term.innerHTML = '';
  if (bar) {
    bar.style.width = '100%';
    bar.querySelectorAll('.boot-prog-seg').forEach(segment => segment.classList.remove('on', 'lead'));
  }
  const messages = [
    [tx('boot.line1', '> Initializing Personal Biotech OS'), 'info', tx('boot.status1', 'CORE HANDSHAKE')],
    [tx('boot.line2', '> Preparing SHOTS'), 'info', tx('boot.status2', 'SHOTS ONLINE')],
    [tx('boot.line3', '> Preparing Phase Engine'), 'info', tx('boot.status3', 'PHASE ENGINE ONLINE')],
    [tx('boot.line4', '> Preparing RESULTS'), 'info', tx('boot.status4', 'RESULTS ONLINE')],
    [tx('boot.line5', '> Preparing LAB + VAULT'), 'info', tx('boot.status5', 'LAB + VAULT ONLINE')],
    [tx('boot.line6', '> Loading local records'), 'warn', tx('boot.status6', 'LOCAL RECORDS')],
    [tx('boot.line7', '> Protocol workspace ready'), 'ok', tx('boot.status7', 'SYSTEM ONLINE')]
  ];
  // Claim 6: the third kicker phase must not imply cloud sync for
  // local-only sessions. At boot time state.session is not yet a reliable
  // cloud signal (restoreSession resolves the Supabase session async),
  // and gn_session_v2 is written for LOCAL sessions only — so the durable
  // synchronous evidence of a stored cloud session is the Supabase JS
  // persisted auth token (sb-<ref>-auth-token, the same key pattern the
  // vault delete flow purges). state.cloud covers the already-activated
  // in-memory case.
  const hasStoredCloudSession = (() => {
    try {
      if (state.cloud && state.session?.user?.id) return true;
      return Object.keys(localStorage).some(key => /^sb-.*-auth-token$/.test(key) && Boolean(localStorage.getItem(key)));
    } catch (_) { return Boolean(state.cloud); }
  })();
  const kickerStates = [
    tx('boot.statusInitializing', 'INITIALIZING'),
    tx('boot.statusCalibrating', 'CALIBRATING'),
    hasStoredCloudSession ? tx('boot.statusSyncing', 'SYNCING') : tx('boot.statusLoading', 'LOADING'),
    tx('boot.statusOnline', 'ONLINE')
  ];
  // kicker phase per line index (7 lines -> 4 phases)
  const kickerAt = [0, 0, 1, 1, 2, 2, 3];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const typeCharMs = reduced ? 0 : 9; /* v0.15.45: snappier boot typing */
  /* v0.15.42: any tap during boot skips it immediately. */
  let bootSkipped = false;
  const bootEl = $('boot');
  const markBootSkipped = () => { bootSkipped = true; };
  if (bootEl) bootEl.addEventListener('pointerdown', markBootSkipped, { once: true });

  const setKicker = phase => {
    const k = document.querySelector('.boot-deck-kicker b');
    if (k) k.textContent = kickerStates[phase] || kickerStates[0];
  };
  const typeLine = (line, text) => new Promise(resolve => {
    if (bootSkipped || reduced || !term) { line.textContent = text; resolve(); return; }
    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'boot-cursor';
    line.appendChild(cursor);
    const tick = () => {
      if (bootSkipped) { line.textContent = text; resolve(); return; }
      if (i < text.length) {
        cursor.insertAdjacentText('beforebegin', text[i]);
        i++;
        term.scrollTop = term.scrollHeight;
        window.setTimeout(tick, typeCharMs);
      } else {
        resolve();
      }
    };
    tick();
  });

  for (let i = 0; i < messages.length; i++) {
    const [message, className, status] = messages[i];
    const line = document.createElement('div');
    line.className = `boot-line ${className} boot-typing`;
    const text = document.createElement('span');
    text.className = 'boot-line-text';
    const tag = document.createElement('span');
    tag.className = 'boot-line-tag';
    tag.textContent = '▶ ' + status;
    line.appendChild(text);
    line.appendChild(tag);
    if (term) { term.appendChild(line); term.scrollTop = term.scrollHeight; }
    setKicker(kickerAt[i]);
    const progress = Math.round((i + 1) / messages.length * 100);
    if (bar) {
      const activeSegments = Math.ceil(progress / 10);
      bar.querySelectorAll('.boot-prog-seg').forEach((segment, segmentIndex) => {
        segment.classList.toggle('on', segmentIndex < activeSegments);
        segment.classList.toggle('lead', segmentIndex === activeSegments - 1);
      });
    }
    if (pct) pct.textContent = `${String(progress).padStart(3, '0')}% // ${status}`;
    await typeLine(text, message);
    if (bootSkipped) break;
    if (i < messages.length - 1) {
      line.classList.remove('boot-typing');
      tag.textContent = '[ OK ] ' + status;
      if (!reduced) await new Promise(r => window.setTimeout(r, 50)); /* AGENT2 full-pass: snappier boot, tap-to-skip unchanged */
    }
  }
  // completion: kicker ONLINE + cyan->Mars Red pulse on the emblem
  setKicker(3);
  const emblem = document.querySelector('.gn-b2b-symbol');
  if (emblem && !reduced && !bootSkipped) {
    emblem.classList.add('boot-complete-pulse');
    await new Promise(r => window.setTimeout(r, 250)); /* AGENT2 full-pass: snappier boot, tap-to-skip unchanged */
    emblem.classList.remove('boot-complete-pulse');
  }
  if (bootEl) bootEl.removeEventListener('pointerdown', markBootSkipped);
  bootRunning = false;
  authShell();
  modules.showScreen('login');
}

function openSignOutModal() {
  const overlay = $('signOutOverlay');
  if (!overlay) return;
  overlay.style.setProperty('display', 'flex');
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
}
function closeSignOutModal() {
  const overlay = $('signOutOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.setProperty('display', 'none');
}
async function confirmSignOut() {
  closeSignOutModal();
  await signOutCloud();
  clearSession();
  // Claim 4: drop the server phase-state cache so a different account on
  // this device never renders the previous account's phase state.
  try { window.GNPhaseTemplates?.clearStateCache?.(); } catch (_) {}
  document.getElementById('gnPasskeysCard')?.remove();
  document.getElementById('gnPasskeyUpsell')?.remove();
  authShell();
  modules.showScreen('landing');
}

async function restoreSession() {
  if (passwordRecoveryActive) { authShell(); modules.showScreen('login'); return; }
  const local = restoreLocalSession();
  if (local) { migrateLegacyLocalData(); activateSession(local, false); showApp(); }
  else modules.showScreen('landing');
  const cloud = await getCloudSession();
  if (cloud && !passwordRecoveryActive) await completeCloudSession(cloud);
}

async function wireCloudAuthEvents() {
  const client = await getCloudClient();
  client?.auth?.onAuthStateChange((event) => {
    if (event !== 'PASSWORD_RECOVERY') return;
    clearAuthReturnState(); /* F2: recovery is a login flow, not a signing-in wait */
    passwordRecoveryActive = true;
    authMode = 'recovery';
    authShell();
    modules.showScreen('login');
  });
}

function wireGlobalEvents() {
  $('signOutOverlay')?.addEventListener('click', event => { if (event.target.id === 'signOutOverlay') closeSignOutModal(); });
  /* Google pre-gate interceptor: the GIS-rendered button's clicks are captured
   * by Google's SDK before our callback ever runs, so the callback wrapper
   * alone cannot pre-gate. Intercept in the capture phase (before the event
   * reaches the Google iframe) on unknown devices and run the NODE KEY gate
   * first. F1 steering: once the gate clears, returnToGoogleSignIn brings
   * the user back to this GIS button (branded road) instead of handing off
   * to the Supabase redirect flow; the session flag lets their next tap
   * pass straight through to GIS. Known devices and grant holders pass
   * through to GIS immediately. */
  document.addEventListener('click', event => {
    const mount = event.target?.closest?.('#gnGoogleButtonMount');
    if (!mount || mount.style.display === 'none') return;
    if (getNodeKeyGrant() || isGoogleKnownDevice() || gnGoogleGatePassed) return;
    event.stopPropagation();
    event.preventDefault();
    requireNodeKeyForGoogle(() => returnToGoogleSignIn());
  }, true);
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-lang-choice]');
    if (!button) return;
    event.preventDefault();
    const lang = button.getAttribute('data-lang-choice');
    if (!lang) return;
    /* v0.15.31 — write localStorage FIRST, before async catalog load.
       On Android Chrome WebView the i18n.setLang catalog fetch can race
       with a re-render that reads localStorage; persisting here eliminates
       any window where the toggle appears to revert. */
    try { localStorage.setItem('gn.lang', lang); } catch (_) {}
    try { document.documentElement.setAttribute('lang', lang); } catch (_) {}
    if (window.GN_I18N?.setLang) window.GN_I18N.setLang(lang);
  });
  document.addEventListener('gn:langchange', () => {
    if ($('login')?.classList.contains('active')) authShell();
    if (state.session) modules.refreshAll();
  });
  window.addEventListener('storage', event => { if (!event.key?.includes('_shots') && !event.key?.includes('_weights')) return; if (state.session) modules.refreshAll(); });
  window.addEventListener('error', event => console.warn('[GRID//NODE runtime]', event.error || event.message));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.GN_SW?.register) { window.GN_SW.register(); return; }
  navigator.serviceWorker
    .register('/sw.js?v=20260907.1', { updateViaCache: 'none' })
    .then(registration => registration.update())
    .catch(() => {});
}

window.GN = {
  version: APP_VERSION,
  state,
  S,
  async syncNow() {
    await getCloudClient();
    if (!state.cloud) { modules.refreshAll(); return; }
    /* Defect 3 (audit 2026-10-14): syncNow owns its hydration result for
     * the CURRENT session generation. A failed fresh hydration blocks the
     * upload even if an earlier session left cloudHydration at 'ok'. */
    const stamp = sessionStamp();
    state.cloudHydration = 'pending';
    const hydration = await hydrateCloudData();
    if (!sessionStampIntact(stamp)) return;
    state.cloudHydration = hydration.ok ? 'ok' : 'failed';
    if (hydration.ok) await syncAllCloudData();
    modules.refreshAll();
  },
  signOut: confirmSignOut,
  localMode: enterLocalSession
};

function isKnownRoute() {
  var p = window.location.pathname.replace(/\/+$/, '');
  return p === '' || p === '/' || p === '/index.html';
}

function showNotFound() {
  document.querySelectorAll('.screen').forEach(function (s) { s.style.display = 'none'; });
  if (document.querySelector('.gn-404-screen')) return;
  var el = document.createElement('div');
  el.className = 'gn-404-screen';
  el.setAttribute('role', 'alert');
  try { var t = localStorage.getItem('gn_theme_v1'); if (t === 'light' && document.documentElement && !document.documentElement.getAttribute('data-theme')) document.documentElement.setAttribute('data-theme', 'light'); } catch (_) {}
  var wantEs = false;
  try { wantEs = (localStorage.getItem('gn.lang') === 'es'); } catch (_) {}
  if (!wantEs && document.documentElement) wantEs = document.documentElement.lang === 'es';
  el.innerHTML = '<div class="gn-404-kicker">// 404 — NODE NOT FOUND</div>'
    + '<div class="gn-404-title">' + (wantEs ? 'Página no encontrada' : 'Page not found') + '</div>'
    + '<div class="gn-404-body">' + (wantEs ? 'La ruta que buscas no existe en la grilla. Vuelve al inicio.' : 'The route you are looking for does not exist on the grid. Return to the start.') + '</div>'
    + '<button type="button" class="gn-404-btn" onclick="location.href=\'/\'">' + (wantEs ? 'VOLVER AL INICIO' : 'BACK TO START') + '</button>';
  document.body.appendChild(el);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!isKnownRoute()) { showNotFound(); return; }
  if (window.GN_I18N?.ready) {
    await window.GN_I18N.ready;
    window.GN_I18N.applyTo(document);
  }
  bridge();
  injectStableStyles();
  modules.initModules();
  window.startGridNode = startGridNode;
  window.handleGoogleSignIn = handleGoogleSignIn;
  /* F1 steering: the static #loginGoogleBtn in index.html routes here so
   * it lands on the GIS welcome view instead of firing the Supabase
   * redirect flow directly. authShell replaces the static login markup
   * in every live flow; this keeps the pre-shell button on the same road. */
  window.openGoogleSignIn = () => { gnAuthView = 'welcome'; authShell(); modules.showScreen('login'); };
  window.openSignOutModal = openSignOutModal;
  window.closeSignOutModal = closeSignOutModal;
  window.confirmSignOut = confirmSignOut;
  wireGlobalEvents();
  armAuthReturnBackstop();
  /* TRACK D perf: SW registration is not on the first-paint/first-entry
     path. Defer it to window load (idle callback as backstop) so boot
     longtasks and network contention stay focused on the entry flow.
     Registration itself is unchanged. */
  const deferSwRegister = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => registerServiceWorker(), { timeout: 3000 });
    else registerServiceWorker();
  };
  if (document.readyState === 'complete') deferSwRegister();
  else window.addEventListener('load', deferSwRegister, { once: true });
  await wireCloudAuthEvents();
  await restoreSession();
  /* F2: session restore has settled. If we did not land in the app, the
   * post-auth return state (if any) ends here — a failed or parked
   * exchange falls back to the normal signed-out landing/login instead
   * of a stuck signing-in status. (restoreSession shows the landing as
   * an intermediate step while the exchange is still in flight, so the
   * clear belongs at this settle point, not on landing navigation.) */
  if (!document.getElementById('app')?.classList.contains('active')) clearAuthReturnState();
  // Load the cloud library in the background so the local-first boot is immediate.
  loadCloudLibrary().catch(() => null);
});

function syncPreviewLang() {
  var img = document.getElementById("landingPreviewShot");
  if (!img) return;
  var es = (window.GN_I18N && typeof window.GN_I18N.t === "function" && (document.documentElement.lang === "es" || (window.GN_I18N.getLang && window.GN_I18N.getLang() === "es")));
  img.src = es ? (img.getAttribute("data-preview-src-es") || img.src) : (img.getAttribute("data-preview-src-en") || img.src);
}
document.addEventListener("gn:langchange", syncPreviewLang);
document.addEventListener("DOMContentLoaded", function () { setTimeout(syncPreviewLang, 1200); });
