/* GRID//NODE stable core
 * asset-store refresh 20260910: force new content hash after poisoned upload.
 * State, local persistence, session handling, and optional Supabase sync.
 * No UI code belongs in this file.
 */

export const APP_VERSION = (typeof window !== 'undefined' && window.GN_VERSION && window.GN_VERSION.semver) || '0.15.43';

export const GOOGLE_OAUTH_CLIENT_ID = '305099332421-u752btn6p8cbaq8opapvdkfau9gnd9a3.apps.googleusercontent.com';

export const CLOUD_CONFIG = Object.freeze({
  url: 'https://quwbmhxgteyykujydvii.supabase.co',
  anonKey: 'sb_publishable_rWPuL8wGfe2zok4cYNENng_L6n2Qttu'
});

/* Dose upper bound at the cloud boundary: 1000 mg = 100x the largest preset
 * pill (10 mg); rejects absurd/imported values like 100000 mg.
 * Rejection, never clamping. */
export const MAX_DOSE_MG = 1000;
export function isDoseInRange(dose) { const value = Number(dose); return Number.isFinite(value) && value > 0 && value <= MAX_DOSE_MG; }

export const state = {
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
export function sessionStamp() {
  return {
    userId: state.cloud && state.session?.user?.id ? String(state.session.user.id) : '',
    accountKey: state.accountKey,
    generation: state.sessionGeneration
  };
}

export function sessionStampIntact(stamp) {
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

export function cloudUploadsReady() {
  if (!state.cloud) return false;
  if (typeof state.cloudHydration === 'string' && state.cloudHydration !== 'ok') return false;
  if (lastHydration) return lastHydration.ok && sessionStampIntact(lastHydration.stamp);
  return typeof state.cloudHydration !== 'string' || state.cloudHydration === 'ok';
}

export const SESSION_KEY = 'gn_session_v2';
export const LOCAL_CLOUD_OWNER_KEY = 'gn_local_cloud_owner_v1';
export const LEGACY_ACCOUNT_KEYS = ['0', 'local'];
export const WORKSPACE_KEYS = ['profile', 'shots', 'weights', 'measurements', 'results', 'notes', 'symptoms', 'labs', 'labTests', 'preferences', 'settings', 'arsenal', 'researchRecords', 'devices', 'inventory', 'loadouts', 'eventLedger', 'importQueue', 'selectedLocation', 'cloudDeletes'];

export function jsonParse(raw, fallback) {
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function notify() {
  state.listeners.forEach(listener => {
    try { listener(state); } catch (error) { console.warn('[GRID//NODE state listener]', error); }
  });
}

export function subscribe(listener) {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function safeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function createId(prefix = 'record') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function accountStorageKey(key) {
  return `gn_${state.accountKey}_${key}`;
}

export function legacyStorageKeys(key) {
  if (state.accountKey !== 'local') return [];
  return LEGACY_ACCOUNT_KEYS
    .filter(accountKey => accountKey !== state.accountKey)
    .map(accountKey => `gn_${accountKey}_${key}`);
}

export const STORAGE_TRANSACTION_SUFFIX = '__storage_tx_v1';

export function transactionStorageKey() {
  return `gn_${state.accountKey}_${STORAGE_TRANSACTION_SUFFIX}`;
}

export function readStorageTransaction() {
  try {
    const journal = jsonParse(localStorage.getItem(transactionStorageKey()), null);
    return journal && Array.isArray(journal.snapshot) ? journal : null;
  } catch (error) {
    console.warn('[GRID//NODE storage.transaction.read]', error);
    return null;
  }
}

export function recoverPendingStorageTransaction() {
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

export function logicalStorageValue(storageKey, journal) {
  const snapshot = journal?.snapshot?.find(entry => entry.storageKey === storageKey);
  if (snapshot) return snapshot.existed ? snapshot.prior : null;
  return localStorage.getItem(storageKey);
}

export const S = Object.freeze({
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

export const MEDICATION_ALIASES = Object.freeze({
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

export const CANONICAL_MEDICATION_IDS = Object.freeze([...new Set(Object.values(MEDICATION_ALIASES))]);

export function normalizeMedicationId(value) {
  const raw = String(value || '').trim();
  if (CANONICAL_MEDICATION_IDS.includes(raw)) return raw;
  return MEDICATION_ALIASES[raw.toLowerCase()] || '';
}

export const CANONICAL_SIDE_EFFECT_IDS = Object.freeze(['nausea', 'fatigue', 'headache', 'diarrhea', 'constipation', 'vomiting', 'insomnia', 'bloating', 'reflux', 'dizziness']);

export function normalizeSideEffectId(value) {
  const raw = String(value || '').trim();
  const canonical = raw.toLowerCase();
  return CANONICAL_SIDE_EFFECT_IDS.includes(canonical) ? canonical : raw;
}

export function normalizeLegacyText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\u00e2\u20ac\u201d/g, '\u2014')
    .replace(/\u00e2\u20ac\u201c/g, '\u2013')
    .replace(/\u00c2\u00b7/g, '\u00b7')
    .replace(/\u00e2\u2020\u2019/g, '\u2192');
}

export function normalizeShotRecord(record) {
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

export function getProfile() { return S.get('profile', {}); }
export function getProfileForEvidence() { return getProfile(); }
export function getShots() { return S.get('shots', []).filter(record => !record.archived).map(normalizeShotRecord); }
export function getAllShots() { return S.get('shots', []).map(normalizeShotRecord); }
export function getWeights() { return S.get('weights', []); }

/* ── ASSAY: third-party lab test log (one record per tested batch) ── */
export const LAB_TEST_METHODS = Object.freeze(['hplc', 'ms', 'hplc_ms', 'coa', 'other']);
export const LAB_TEST_ENDOTOXIN = Object.freeze(['pass', 'fail', 'untested']);

export function normalizeLabTest(record) {
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

export function getLabTests() { return S.get('labTests', []).filter(record => !record.archived).map(normalizeLabTest).filter(Boolean); }
export function getAllLabTests() { return S.get('labTests', []).map(normalizeLabTest).filter(Boolean); }
export function setLabTests(list) { return S.set('labTests', Array.isArray(list) ? list : []); }

/* Derived variance: (measured − claim) / claim, as a fraction. Null when inputs are missing. */
export function labTestVariance(record) {
  const m = record?.measuredMg;
  const c = record?.labelClaimMg;
  if (m == null || m === '' || c == null || c === '') return null;
  const measured = Number(m);
  const claim = Number(c);
  if (!Number.isFinite(measured) || !Number.isFinite(claim) || claim <= 0) return null;
  return (measured - claim) / claim;
}

/* Variance band: green within ±5%, amber within ±10%, red beyond. */
export function labTestVarianceBand(fraction) {
  if (!Number.isFinite(fraction)) return null;
  const abs = Math.abs(fraction);
  if (abs <= 0.05) return 'green';
  if (abs <= 0.10) return 'amber';
  return 'red';
}

export function readAccountValue(accountKey, key, fallback) {
  try { return jsonParse(localStorage.getItem(`gn_${accountKey}_${key}`), fallback); } catch { return fallback; }
}

export function captureWorkspace(accountKey = state.accountKey) {
  return Object.fromEntries(WORKSPACE_KEYS.map(key => [key, readAccountValue(accountKey, key, key === 'profile' || key === 'preferences' || key === 'settings' ? {} : key === 'selectedLocation' ? '' : [])]));
}

export function workspaceHasData(snapshot) {
  if (!snapshot) return false;
  return WORKSPACE_KEYS.some(key => {
    if (key === 'cloudDeletes') return false;
    const value = snapshot[key];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  });
}

export function localWorkspaceMigrationAllowed(userId) {
  if (!userId) return false;
  try {
    const owner = localStorage.getItem(LOCAL_CLOUD_OWNER_KEY);
    return !owner || owner === String(userId);
  } catch { return false; }
}

export function markLocalWorkspaceMigrated(userId) {
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
export function claimLocalWorkspaceOwner(userId) {
  if (!userId) return false;
  if (!markLocalWorkspaceMigrated(userId)) return false;
  try {
    return localStorage.getItem(LOCAL_CLOUD_OWNER_KEY) === String(userId);
  } catch { return false; }
}

export function restoreWorkspace(snapshot, { onlyEmpty = true } = {}) {
  if (!snapshot) return;
  for (const key of WORKSPACE_KEYS) {
    if (key === 'cloudDeletes') continue;
    const value = snapshot[key];
    const hasValue = Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' ? Object.keys(value).length > 0 : Boolean(value);
    if (!hasValue || (onlyEmpty && S.has(key))) continue;
    S.set(key, value);
  }
}

export function localSession() {
  return {
    type: 'local',
    user: { id: 'local', email: '', user_metadata: { full_name: 'NODE_USER' } },
    createdAt: new Date().toISOString()
  };
}

export function restoreLocalSession() {
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

export function activateSession(session, cloud = false) {
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
  notify();
  return state;
}

export function clearSession() {
  state.sessionGeneration += 1;
  mirrorSessionEpoch();
  /* Session exit clears the session shot draft with it (audit item 3):
   * an unsent draft is part of the session, not of the device. */
  try { window.GN_NATIVE?.purgeSessionDraft?.(); } catch {}
  syncPassFailed = false;
  state.session = null;
  state.cloud = false;
  state.accountKey = 'local';
  state.cloudStatus = 'LOCAL_ONLY';
  window.CU = null;
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  notify();
}

export function withTimeout(promise, timeoutMs = 4500) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
  ]);
}

export let cloudLoadPromise = null;
export let cloudClientPromise = null;

export function loadCloudLibrary() {
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

export async function getCloudClient() {
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

export async function getCloudSession() {
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

export async function signInCloud(email, password) {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { data, error } = await withTimeout(client.auth.signInWithPassword({ email, password }), 8000);
  if (error) throw error;
  return data?.session || null;
}

export async function signUpCloud(email, password) {
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

export async function resetPasswordCloud(email) {  const client = await getCloudClient();
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
export async function sendSignInCode(email, createUser) {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { error } = await withTimeout(
    client.auth.signInWithOtp({ email, options: { shouldCreateUser: !!createUser } }),
    8000
  );
  if (error) throw error;
  return true;
}

export async function verifySignInCode(email, token) {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { data, error } = await withTimeout(
    client.auth.verifyOtp({ email, token, type: 'email' }),
    8000
  );
  if (error) throw error;
  return data?.session || null;
}

export async function updateCloudPassword(password) {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { data, error } = await withTimeout(client.auth.updateUser({ password }), 8000);
  if (error) throw error;
  return data?.user || null;
}

export async function isCloudProviderEnabled(provider) {
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

export async function signInWithGoogle() {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  if (!(await isCloudProviderEnabled('google'))) throw new Error('GOOGLE_AUTH_DISABLED');
  const { error } = await withTimeout(client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href.split('#')[0] }
  }), 8000);
  if (error) throw error;
}

export async function signInWithGoogleIdToken(token) {
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

export async function signOutCloud() {
  const client = state.cloudClient;
  if (!client) return;
  try { await withTimeout(client.auth.signOut(), 5000); } catch (error) { console.warn('[GRID//NODE cloud sign out]', error); }
}

export function cloudShotPayload(record, userId) {
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

export function ensureCloudRecordId(record, createUuid = () => globalThis.crypto?.randomUUID?.()) {
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
export const LB_PER_KG = 2.2046226218;

export function canonicalWeightKg(record) {
  const pounds = Number(record?.weight);
  if (Number.isFinite(pounds)) return pounds / LB_PER_KG;
  const kg = Number(record?.weightKg);
  return Number.isFinite(kg) ? kg : 0;
}

/* Recompute the derived cache from the canonical value in place, for
 * mutation sites that rebuild a weight record from user input. */
export function withCanonicalWeight(record) {
  if (record && Number.isFinite(Number(record.weight))) {
    record.weightKg = Number(record.weight) / LB_PER_KG;
  }
  return record;
}

export function cloudWeightPayload(record, userId) {
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

export function parseLinkedShotCloudId(value) {
  const match = String(value || '').match(/^GRIDNODE_LINKED_SHOT:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match ? match[1] : null;
}

export function planPermanentShotDelete(record, weights = [], cloudDeletes = []) {
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
export function dequeueSync(kind, id, throughTs = Date.now()) {
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

export async function syncShot(record) {
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

export async function syncWeight(record) {
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

export async function syncProfile(profile) {
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

export function workspacePayload(userId) {
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

export async function syncWorkspace() {
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

export function flushCloudDeletes() {
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

export async function deleteCloudShot(record) {
  if (!record?.cloudId) return true;
  const pending = S.get('cloudDeletes', []);
  if (!pending.some(item => item.table === 'shots' && item.id === record.cloudId)) pending.push({ table: 'shots', id: record.cloudId });
  if (!S.set('cloudDeletes', pending)) return false;
  return flushCloudDeletes();
}

export async function hydrateCloudData() {
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

export function mergeRecords(localRecords, remoteRecords, identity) {
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

export function mergeJsonRecords(localRecords, remoteRecords) {
  const local = Array.isArray(localRecords) ? localRecords : [];
  const remote = Array.isArray(remoteRecords) ? remoteRecords : [];
  return mergeRecords(local, remote, record => record && typeof record === 'object' ? record.id || JSON.stringify(record) : String(record));
}

export let syncPassFailed = false;
export const syncInFlight = new Set();

export async function syncAllCloudData() {
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
export async function recoverPendingSync() {
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

export function queueCloudSync(kind, record) {
  if (state.cloud && !cloudUploadsReady()) {
    enqueueSync(kind, record);
    state.cloudStatus = 'LOCAL_BACKUP';
    return Promise.resolve();
  }
  const work = kind === 'shot' ? syncShot(record) : kind === 'weight' ? syncWeight(record) : kind === 'profile' ? syncProfile(record) : syncWorkspace();
  work.catch(error => console.warn('[GRID//NODE cloud queue]', error));
  return work;
}

export function enqueueSync(kind, record, stamp = null) {
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

export function sessionLabel() {
  return state.session?.user?.email || (state.cloud ? tx('vault.cloudAccount', 'CLOUD ACCOUNT') : tx('profile.localDeviceSession', 'LOCAL DEVICE SESSION'));
}

export async function deleteCloudAccount() {
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

export function migrateLegacyLocalData() {
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

export function repairStorageShapes() {
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

export function parseLocalDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const raw = String(value || '').trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12, 0, 0, 0);
  return new Date(raw);
}

export function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return '—';
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = document.documentElement?.lang?.startsWith('es') ? 'es-419' : 'en-US';
  return date.toLocaleDateString(locale, options);
}

export function formatDateTime(value) {
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

export function normalizeDateInput(value) {
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

export function todayISO(date = new Date()) {
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
export function isRealCalendarDate(year, month, day) {
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
export function stampLocalInstant(dateISO, timeHHMM) {
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

export function formatEditableDate(value) {
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return document.documentElement?.lang?.startsWith('es') ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

export function parseEditableDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return normalizeDateInput(raw);
  const parts = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!parts) return '';
  const spanish = document.documentElement?.lang?.startsWith('es');
  const month = spanish ? parts[2] : parts[1];
  const day = spanish ? parts[1] : parts[2];
  return normalizeDateInput(`${parts[3]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
}

export function setHumanDateInput(input, value, compact = false) {
  if (!input) return;
  const iso = normalizeDateInput(value) || todayISO();
  const display = compact ? formatEditableDate(iso) : formatDate(iso, { month: 'short', day: 'numeric', year: 'numeric' });
  input.dataset.isoDate = iso;
  input.dataset.dateDisplay = display;
  input.value = display;
}

export function readHumanDateInput(input, compact = false) {
  if (!input) return '';
  if (input.dataset.isoDate && input.dataset.dateDisplay === input.value) return input.dataset.isoDate;
  return compact ? parseEditableDate(input.value) : normalizeDateInput(input.value);
}

export function downloadFile(filename, contents, type = 'application/octet-stream') {
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
