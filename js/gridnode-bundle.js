/* GRID//NODE stable classic delivery bundle. Source remains modular in gridnode-core.js, gridnode-modules.js, and gridnode-app.js. */

/* GRID//NODE stable core
 * State, local persistence, session handling, and optional Supabase sync.
 * No UI code belongs in this file.
 */

const APP_VERSION = (typeof window !== 'undefined' && window.GN_VERSION && window.GN_VERSION.semver) || '0.9.0';

const GOOGLE_OAUTH_CLIENT_ID = '305099332421-u752btn6p8cbaq8opapvdkfau9gnd9a3.apps.googleusercontent.com';

const CLOUD_CONFIG = Object.freeze({
  url: 'https://quwbmhxgteyykujydvii.supabase.co',
  anonKey: 'sb_publishable_rWPuL8wGfe2zok4cYNENng_L6n2Qttu'
});

const state = {
  session: null,
  accountKey: 'local',
  cloud: false,
  cloudClient: null,
  cloudStatus: 'LOCAL_ONLY',
  listeners: new Set()
};

const SESSION_KEY = 'gn_session_v2';
const LOCAL_CLOUD_OWNER_KEY = 'gn_local_cloud_owner_v1';
const LEGACY_ACCOUNT_KEYS = ['0', 'local'];
const WORKSPACE_KEYS = ['profile', 'shots', 'weights', 'measurements', 'results', 'notes', 'symptoms', 'labs', 'preferences', 'settings', 'arsenal', 'researchRecords', 'devices', 'inventory', 'loadouts', 'eventLedger', 'importQueue', 'selectedLocation', 'cloudDeletes'];

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

function activateSession(session, cloud = false) {
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
  notify();
  return state;
}

function clearSession() {
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

async function resetPasswordCloud(email) {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { error } = await withTimeout(client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`
  }), 8000);
  if (error) throw error;
  return true;
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
  const payload = {
    user_id: userId,
    date: record.date,
    compound: normalizeMedicationId(record.med),
    dose_mg: Number(record.dose) || 0,
    site: record.site || null,
    notes: record.notes || null,
    side_effects: Array.isArray(record.se) ? record.se : [],
    archived: Boolean(record.archived)
  };
  if (record.cloudId) payload.id = record.cloudId;
  return payload;
}

function cloudWeightPayload(record, userId) {
  const payload = {
    user_id: userId,
    date: record.date,
    weight_kg: Number(record.weightKg || (Number(record.weight) / 2.2046226218)) || 0,
    notes: record.notes || null
  };
  if (record.cloudId) payload.id = record.cloudId;
  return payload;
}

async function syncShot(record) {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return;
  if (!normalizeMedicationId(record?.med)) { console.warn('[GRID//NODE cloud shot sync] invalid medication identity; sync skipped'); return; }
  if (!record?.id || syncInFlight.has(`shot:${record.id}`)) return;
  syncInFlight.add(`shot:${record.id}`);
  try {
    const query = record.cloudId
      ? state.cloudClient.from('shots').upsert(cloudShotPayload(record, state.session.user.id)).select().single()
      : state.cloudClient.from('shots').insert(cloudShotPayload(record, state.session.user.id)).select().single();
    const { data, error } = await withTimeout(query, 8000);
    if (error) throw error;
    if (data?.id && !record.cloudId) {
      record.cloudId = data.id;
      const all = getAllShots();
      const index = all.findIndex(item => item.id === record.id);
      if (index >= 0) { all[index] = record; if (!S.set('shots', all)) console.warn('[GRID//NODE cloud shot sync] failed to persist cloudId'); }
    }
    state.cloudStatus = 'CLOUD_SYNCED';
  } catch (error) {
    state.cloudStatus = 'LOCAL_BACKUP';
    syncPassFailed = true;
    enqueueSync('shot', record);
    console.warn('[GRID//NODE cloud shot sync]', error);
  } finally {
    syncInFlight.delete(`shot:${record.id}`);
  }
}

async function syncWeight(record) {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return;
  if (!record?.id || syncInFlight.has(`weight:${record.id}`)) return;
  syncInFlight.add(`weight:${record.id}`);
  try {
    const query = record.cloudId
      ? state.cloudClient.from('weights').upsert(cloudWeightPayload(record, state.session.user.id)).select().single()
      : state.cloudClient.from('weights').insert(cloudWeightPayload(record, state.session.user.id)).select().single();
    const { data, error } = await withTimeout(query, 8000);
    if (error) throw error;
    if (data?.id && !record.cloudId) {
      record.cloudId = data.id;
      const all = getWeights();
      const index = all.findIndex(item => item.id === record.id);
      if (index >= 0) { all[index] = record; if (!S.set('weights', all)) console.warn('[GRID//NODE cloud weight sync] failed to persist cloudId'); }
    }
    state.cloudStatus = 'CLOUD_SYNCED';
  } catch (error) {
    state.cloudStatus = 'LOCAL_BACKUP';
    syncPassFailed = true;
    enqueueSync('weight', record);
    console.warn('[GRID//NODE cloud weight sync]', error);
  } finally {
    syncInFlight.delete(`weight:${record.id}`);
  }
}

async function syncProfile(profile) {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return;
  try {
    const { error } = await withTimeout(state.cloudClient.from('profiles').upsert({
      id: state.session.user.id,
      display_name: profile.name || 'NODE_USER',
      weight_unit: profile.weightUnit || 'lbs',
      height_unit: 'ft/in',
      dose_mg: Number(profile.dose) || null,
      profile_data: profile || {},
      updated_at: new Date().toISOString()
    }), 8000);
    if (error) throw error;
    state.cloudStatus = 'CLOUD_SYNCED';
  } catch (error) {
    state.cloudStatus = 'LOCAL_BACKUP';
    console.warn('[GRID//NODE cloud profile sync]', error);
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
      importQueue: S.get('importQueue', [])
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

async function syncWorkspace() {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return;
  try {
    const { error } = await withTimeout(state.cloudClient.from('workspaces').upsert(workspacePayload(state.session.user.id)), 8000);
    if (error) throw error;
    state.cloudStatus = 'CLOUD_SYNCED';
  } catch (error) {
    state.cloudStatus = 'LOCAL_BACKUP';
    console.warn('[GRID//NODE cloud workspace sync]', error);
  }
}

async function flushCloudDeletes() {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return false;
  const pending = S.get('cloudDeletes', []);
  if (!pending.length) return true;
  const remaining = [];
  for (const item of pending) {
    try {
      const { error } = await withTimeout(state.cloudClient.from(item.table).delete().eq('id', item.id).eq('user_id', state.session.user.id), 8000);
      if (error) throw error;
    } catch (error) {
      remaining.push(item);
      console.warn('[GRID//NODE cloud delete]', error);
    }
  }
  if (remaining.length !== pending.length) {
    if (!S.set('cloudDeletes', remaining)) {
      state.cloudStatus = 'LOCAL_BACKUP';
      console.warn('[GRID//NODE cloud delete] could not persist queue; retaining all pending tombstones');
      return false;
    }
  }
  state.cloudStatus = remaining.length ? 'LOCAL_BACKUP' : 'CLOUD_SYNCED';
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
  try {
    const userId = state.session.user.id;
    await flushCloudDeletes();
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
      createdAt: item.created_at || item.date
    }));
    const pendingDeleteIds = new Set(S.get('cloudDeletes', []).map(item => item.id));
    const mergedShots = mergeRecords(localShots, cloudShots.filter(item => !(item.cloudId && pendingDeleteIds.has(item.cloudId))), record => record.cloudId || record.id);
    if (mergedShots.length) S.set('shots', mergedShots);

    const localWeights = getWeights();
    const cloudWeights = (weightsResult.data || []).map(item => ({
      id: `cloud_${item.id}`,
      cloudId: item.id,
      date: item.date,
      weight: Number(item.weight_kg) * 2.2046226218,
      weightKg: Number(item.weight_kg),
      notes: item.notes || null
    }));
    const mergedWeights = mergeRecords(localWeights, cloudWeights.filter(item => !(item.cloudId && pendingDeleteIds.has(item.cloudId))), record => record.cloudId || record.id);
    if (mergedWeights.length) S.set('weights', mergedWeights);

    const remoteProfile = profileResult.data;
    if (remoteProfile) {
      const profile = getProfile();
      const cloudProfile = remoteProfile.profile_data && typeof remoteProfile.profile_data === 'object' ? remoteProfile.profile_data : {};
      const mergedProfile = { ...cloudProfile, ...profile };
      mergedProfile.name = mergedProfile.name || remoteProfile.display_name || '';
      if (remoteProfile.dose_mg && !mergedProfile.dose) mergedProfile.dose = remoteProfile.dose_mg;
      S.set('profile', mergedProfile);
    }

    const remoteWorkspace = workspaceResult.data;
    if (remoteWorkspace) {
      S.set('results', mergeJsonRecords(S.get('results', []), remoteWorkspace.results_data || []));
      S.set('notes', mergeJsonRecords(S.get('notes', []), remoteWorkspace.notes_data || []));
      S.set('symptoms', mergeJsonRecords(S.get('symptoms', []), remoteWorkspace.symptoms_data || []));
      S.set('labs', mergeJsonRecords(S.get('labs', []), remoteWorkspace.labs_data || []));
      S.set('arsenal', mergeJsonRecords(S.get('arsenal', []), remoteWorkspace.arsenal || []));
      const preferences = { ...(remoteWorkspace.preferences || {}), ...S.get('preferences', {}) };
      const remoteSettings = remoteWorkspace.settings || {};
      const localSettings = S.get('settings', {});
      const remoteFoundation = remoteSettings._gridnodeFoundation || {};
      const localFoundation = localSettings._gridnodeFoundation || {};
      const settings = { ...remoteSettings, ...localSettings, _gridnodeFoundation: { ...remoteFoundation, ...localFoundation } };
      S.set('preferences', preferences);
      S.set('settings', settings);
      if (!S.get('selectedLocation', '') && preferences.selectedLocation) S.set('selectedLocation', preferences.selectedLocation);
      S.set('researchRecords', mergeJsonRecords(S.get('researchRecords', []), remoteFoundation.researchRecords || []));
      S.set('devices', mergeJsonRecords(S.get('devices', []), remoteFoundation.devices || []));
      S.set('measurements', mergeJsonRecords(S.get('measurements', []), remoteFoundation.measurements || []));
      S.set('inventory', mergeJsonRecords(S.get('inventory', []), remoteFoundation.inventory || []));
      S.set('loadouts', mergeJsonRecords(S.get('loadouts', []), remoteFoundation.loadouts || []));
      S.set('eventLedger', mergeJsonRecords(S.get('eventLedger', []), remoteFoundation.eventLedger || []));
      S.set('importQueue', mergeJsonRecords(S.get('importQueue', []), remoteFoundation.importQueue || []));
    }
    state.cloudStatus = 'CLOUD_SYNCED';
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
    state.cloudStatus = 'LOCAL_BACKUP';
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
  syncPassFailed = false;
  await flushCloudDeletes();
  await Promise.all([
    ...getAllShots().map(record => syncShot(record)),
    ...getWeights().map(record => syncWeight(record)),
    syncProfile(getProfile()),
    syncWorkspace()
  ]);
  if (!syncPassFailed) {
    const queue = S.get('syncQueue', []);
    if (queue.length) S.set('syncQueue', []);
  }
}

function queueCloudSync(kind, record) {
  const work = kind === 'shot' ? syncShot(record) : kind === 'weight' ? syncWeight(record) : kind === 'profile' ? syncProfile(record) : syncWorkspace();
  work.catch(error => console.warn('[GRID//NODE cloud queue]', error));
}

function enqueueSync(kind, record) {
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
    const response = await withTimeout(fetch('/api/delete-account', {
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
const qa = selector => Array.from(document.querySelectorAll(selector));

const selectState = {};
window.selectState = selectState;

const moduleState = {
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

function normalizeMedicationId(value) {
  const raw = String(value || '').trim();
  if (Object.prototype.hasOwnProperty.call(MEDICATIONS, raw)) return raw;
  return MEDICATION_ALIASES[raw.toLowerCase()] || '';
}

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
function normalizeSideEffectId(value) {
  const raw = String(value || '').trim();
  const canonical = raw.toLowerCase();
  return SIDE_EFFECT_KEYS[canonical] ? canonical : raw;
}
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

function refreshNodeHeader({ phase } = {}) {
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
  document.body.classList.toggle('gn-fab-hidden-context', ['Lab', 'Profile', 'Cal'].includes(name));
  qa('.page').forEach(item => item.classList.remove('active'));
  page.classList.add('active');
  qa('.nav-item').forEach(item => {
    item.classList.remove('active');
    item.removeAttribute('aria-current');
  });
  const nav = navElement || document.getElementById({ Dash: 'navDash', Log: 'navLog', Results: 'navRes', Lab: 'navLab', Profile: 'navPro', Cal: 'navCal' }[name]);
  if (nav) {
    nav.classList.add('active');
    nav.setAttribute('aria-current', 'page');
  }
  $('scrollBody')?.scrollTo({ top: 0, behavior: 'auto' });
  if (name === 'Log') renderShots();
  if (name === 'Results') renderResults();
  if (name === 'Lab') renderLab();
  if (name === 'Profile') renderProfile();
  if (name === 'Cal') renderCalendar();
  document.dispatchEvent(new CustomEvent('gn:pagechange', { detail: { name, previousPage } }));
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.page.active')?.id === 'pageProfile') { closeProfileHub(); } });
document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target && typeof e.target.matches === 'function' && e.target.matches('.cp-group-minimized')) { e.preventDefault(); e.target.click(); } });
document.addEventListener('keydown', function (e) { if (e.key !== 'Escape') return; var disc = document.getElementById('shotDiscardConfirmOv'); if (disc && (disc.classList.contains('active') || getComputedStyle(disc).display !== 'none')) { cancelShotDiscard(); return; } if (document.querySelector('#futureTimestampConfirm.active')) return; if (document.querySelector('#logOv.active')) { closeLog(); } if (document.querySelector('#wtOv.active')) { closeWt(); } });

function refreshAll() {
  renderProfile();
  renderDashboard();
  renderShots();
  renderResults();
  renderScanner();
  renderLab();
  renderCalendar();
}

function loadApp() {
  const profile = getProfile();
  moduleState.selectedLocation = normalizeLegacyText(S.get('selectedLocation', moduleState.selectedLocation || ''));
  syncIdentityAvatars();
  setText('dashSub', tx('dashboard.nodeOnline', '// {name} // NODE ONLINE', { name: window.CU?.defaultName || profile.name || 'NODE_USER' }));
  setText('profSub', `// ${window.CU?.defaultName || profile.name || 'NODE_USER'} //`);
  setText('profNameTxt', window.CU?.defaultName || profile.name || tx('profile.anonFallback', 'NODE_USER'));
  setText('profEmail', sessionLabel());
  setText('profMedTxt', normalizeMedicationId(profile.med) ? `// ${medicationLabel(profile.med).toUpperCase()}` : tx('profile.noMedicationSet', '// NO MEDICATION SET'));
  hydrateProfileFields(profile);
  setTodayDefaults();
  refreshAll();
}

function setText(id, value) { const element = $(id); if (element) element.textContent = value; }
function setDisplay(id, visible) { const element = $(id); if (element) element.style.display = visible ? '' : 'none'; }

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
  const weights = sortedWeights();
  const lastShot = shots.at(-1);
  const lastWeight = weights.at(-1);
  const profile = getProfile();
  const dashboard = document.getElementById('pageDash');
  const firstShotMission = document.getElementById('gnFirstShotMission');
  if (dashboard) dashboard.dataset.activation = shots.length ? 'active' : 'pending';
  if (firstShotMission) firstShotMission.hidden = shots.length > 0;
  // Batch B: empty state — ONE red CTA, cyan ghosts, tip card; wanda + FAB hidden.
  let hero = document.getElementById('gnEmptyHero');
  if (shots.length === 0) {
    if (!hero && dashboard) {
      const heroMarkup = '<section id="gnEmptyHero" class="gn-empty-hero" aria-label="' + safeText(tx('dashboard.emptyTitle', 'Get started')) + '">'
        + '<h2 data-i18n="dashboard.emptyTitle">' + tx('dashboard.emptyTitle', 'Empieza con tu primera dosis') + '</h2>'
        + '<p data-i18n="dashboard.emptyBody">' + tx('dashboard.emptyBody', 'Una dosis desbloquea el Motor de Fases, RESULTADOS y tu tablero completo.') + '</p>'
        + '<button class="btn-full btn-primary gn-empty-cta" type="button" data-onboard="empty-cta" onclick="openLogModal()" data-i18n="dashboard.emptyCta">' + tx('dashboard.emptyCta', 'REGISTRAR MI PRIMERA DOSIS') + '</button>'
        + '<div class="gn-empty-ghosts">'
        + '<button class="gn-empty-ghost" type="button" data-onboard="log-weight" onclick="openWeightModal()" data-i18n="dashboard.emptyWeight">' + tx('dashboard.emptyWeight', 'Registrar peso') + '</button>'
        + '<button class="gn-empty-ghost" type="button" onclick="showPage(\'Log\',document.getElementById(\'navLog\'))" data-i18n="dashboard.emptyScan">' + tx('dashboard.emptyScan', 'Escanear zona') + '</button>'
        + '<button class="gn-empty-ghost" type="button" onclick="showPage(\'Lab\',document.getElementById(\'navLab\'))" data-i18n="dashboard.emptyLab">' + tx('dashboard.emptyLab', 'Ver LAB') + '</button>'
        + '</div>'
        + '<div class="gn-tip-card"><span class="gn-tip-kicker" data-i18n="dashboard.tipTitle">' + tx('dashboard.tipTitle', 'TIP') + '</span><p data-i18n="dashboard.tipBody">' + tx('dashboard.tipBody', 'Choose the medication and dose, then add the date, time, and application zone.') + '</p></div>'
        + '</section>';
      const wanda = document.getElementById('gnWandaDashboard');
      if (wanda) wanda.insertAdjacentHTML('beforebegin', heroMarkup);
      else dashboard.insertAdjacentHTML('afterbegin', heroMarkup);
      hero = document.getElementById('gnEmptyHero');
    }
    const wandaEl = document.getElementById('gnWandaDashboard');
    if (wandaEl) wandaEl.style.display = 'none';
    document.body.classList.add('gn-dashboard-empty');
  } else {
    if (hero) hero.remove();
    const wandaEl = document.getElementById('gnWandaDashboard');
    if (wandaEl) wandaEl.style.display = '';
    document.body.classList.remove('gn-dashboard-empty');
  }
  const weightMetrics = computeTotalChange(weights, profile, 'profile');
  setNumericText('stShots', shots.length);
  setText('stDose', lastShot?.dose ? `${lastShot.dose}mg` : '—');
  setText('stDoseDate', lastShot ? formatDate(lastShot.date, { month: 'short', day: 'numeric' }) : tx('runtime.noData', 'NO DATA'));
  const next = nextShotDate(lastShot, profile);
  setText('stNext', next ? formatDate(next, { month: 'short', day: 'numeric' }) : '—');
  setText('stNextSub', next ? tx('runtime.estimatedFromProfile', 'ESTIMATED FROM PROFILE') : tx('runtime.logShot', 'LOG SHOT'));
  const nextCard = $('nextShotStatCard');
  if (nextCard) nextCard.classList.remove('gn-next-today', 'gn-next-tomorrow', 'gn-next-overdue');
  if (next) {
    const deltaDays = Math.round((parseLocalDate(next).getTime() - parseLocalDate(todayISO()).getTime()) / 86400000);
    if (deltaDays === 0) { nextCard?.classList.add('gn-next-today'); setText('stNextSub', '// ' + tx('dashboard.today', 'TODAY')); }
    else if (deltaDays === 1) { nextCard?.classList.add('gn-next-tomorrow'); setText('stNextSub', tx('dashboard.tomorrow', 'TOMORROW')); }
    else if (deltaDays < 0) { nextCard?.classList.add('gn-next-overdue'); setText('stNextSub', '// ' + tx('dashboard.overdue', 'OVERDUE')); }
  }
  const todayShot = shots.find(record => record.date?.slice(0, 10) === todayISO());
  const todayWeight = weights.find(record => record.date?.slice(0, 10) === todayISO());
  setText('todayShot', todayShot ? tx('dashboard.loggedDose', '{dose}mg logged', { dose: todayShot.dose || '—' }) : tx('runtime.tapToLog', 'TAP TO LOG'));
  setText('todayWt', todayWeight ? Number(todayWeight.weight).toFixed(1) + ' lb' : tx('runtime.tapToLog', 'TAP TO LOG'));
  const currentWeight = weightMetrics.currentWeight || 0;
  const change = weightMetrics.change;
  const goalGap = Number(profile.goalWt) && currentWeight ? currentWeight - Number(profile.goalWt) : null;
  setText('s6TotalLabel', tx('dashboard.resultsTotal', 'TOTAL CHANGE'));
  setText('s6TotalBasis', weightMetrics.basis === 'from profile start weight' ? tx('dashboard.fromProfileStart', '(from profile start)') : tx('dashboard.fromFirstWeight', '(from first recorded weight)'));
  setText('s6Total', change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)} lb`);
  const dashboardBMI = calcBMIValue(currentWeight, profile);
  setText('s6BMI', dashboardBMI || '');
  setDisplay('s6BMICard', Boolean(dashboardBMI));
  setText('s6Wt', currentWeight ? `${currentWeight.toFixed(1)} lb` : '—');
  setText('s6Pct', weightMetrics.percentLost === null ? '—' : `${weightMetrics.percentLost.toFixed(1)}%`);
  setText('s6Avg', weightMetrics.weeklyAverage === null ? '—' : tx('dashboard.weeklyRate', '{value} lb/wk', { value: weightMetrics.weeklyAverage.toFixed(1) }));
  setText('s6Goal', goalGap === null ? '—' : `${Math.max(0, goalGap).toFixed(1)} lb`);
  const phase = renderPhase(lastShot, shots);
  renderProtocolCurve(shots, phase);
  refreshNodeHeader({ lastShot, next, phase, currentWeight: lastWeight?.weight });
  setText('streakText', shots.length ? tx(shots.length === 1 ? 'dashboard.shotsInLocalRecord_one' : 'dashboard.shotsInLocalRecord_other', '{count} SHOTS IN YOUR LOCAL RECORD', { count: shots.length }) : tx('dashboard.noShotCadence', 'NO SHOT CADENCE YET · LOG YOUR FIRST SHOT'));
  drawCanvasChart($('dashWtChart'), weights.map(item => Number(item.weight)), '#00d4ff');
  renderWandaDashboard({ shots, weights, lastShot, lastWeight, profile, next, phase, weightMetrics, goalGap });
}

function ensureWandaDashboard() {
  const header = document.getElementById('pageDash')?.querySelector('.page-hdr');
  if (!header || document.getElementById('gnWandaDashboard')) return;
  const markup = '<section id="gnWandaDashboard" aria-label="' + safeText(tx('dashboard.currentProtocolSignals', 'Current protocol signals')) + '">'
    + '<section class="gn-dashboard-mission" id="gnFirstShotMission" aria-labelledby="gnFirstShotMissionTitle"><span class="gn-dashboard-mission-kicker" data-i18n="dashboard.firstShotKicker">START HERE</span><h2 id="gnFirstShotMissionTitle" data-i18n="shots.activateYourGrid">LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID</h2><p data-i18n="shots.firstShotSub">One shot unlocks the Phase Engine, RESULTS, and your full dashboard.</p><button type="button" data-onboard="empty-cta" onclick="openLogModal()" data-i18n="shots.logYourFirst">LOG YOUR FIRST SHOT</button></section>'
    + '<div class="gn-wanda-grid">'
    + '<button class="gn-wanda-card" id="gnWandaNext" type="button" onclick="openLogModal()"><span class="gn-wanda-label" data-i18n="dashboard.nextShotLabel">NEXT SHOT</span><b class="gn-wanda-value" id="gnWandaNextValue">' + tx('runtime.logShot', 'LOG SHOT') + '</b><small class="gn-wanda-note" id="gnWandaNextNote" data-i18n="dashboard.logShotStartTimeline">Log a shot to start your timeline</small></button>'
    + '<button class="gn-wanda-card" id="gnWandaPhase" type="button" onclick="showPhasesModal()"><span class="gn-wanda-label" data-i18n="dashboard.currentPhase">CURRENT PHASE</span><b class="gn-wanda-value" id="gnWandaPhaseValue">' + tx('dashboard.startWithShot', 'START WITH A SHOT') + '</b><small class="gn-wanda-note" data-i18n="phase.educationalEstimate">EDUCATIONAL ESTIMATE</small></button>'
    + '<button class="gn-wanda-card info" id="gnWandaWeight" type="button" onclick="openWeightModal()"><span class="gn-wanda-label" data-i18n="dashboard.currentWeight">CURRENT WEIGHT</span><b class="gn-wanda-value" id="gnWandaWeightValue">' + tx('dashboard.logWeight', 'LOG WEIGHT') + '</b><small class="gn-wanda-note" data-i18n="dashboard.latestRecord">Latest record</small></button>'
    + '<button class="gn-wanda-card" id="gnWandaLevel" type="button" onclick="showPhasesModal()"><span class="gn-wanda-label" data-i18n="dashboard.relativeLevel">RELATIVE LEVEL</span><b class="gn-wanda-value" id="gnWandaLevelValue">' + tx('dashboard.startWithShot', 'START WITH A SHOT') + '</b><small class="gn-wanda-note" data-i18n="dashboard.estimatedNotMeasured">Estimated, not measured</small></button>'
    + '<button class="gn-wanda-card" id="gnWandaRate" type="button" onclick="showPage(\'Results\',document.getElementById(\'navRes\'))"><span class="gn-wanda-label" data-i18n="dashboard.weeklyRateLabel">WEEKLY RATE</span><b class="gn-wanda-value" id="gnWandaRateValue">' + tx('dashboard.keepLogging', 'KEEP LOGGING') + '</b><small class="gn-wanda-note" data-i18n="dashboard.keepLoggingBuilds">Keep logging — data builds over time</small></button>'
    + '<button class="gn-wanda-card info" id="gnWandaGoal" type="button" onclick="showPage(\'Profile\',document.getElementById(\'navPro\'))"><span class="gn-wanda-label" data-i18n="dashboard.toGoal">TO GOAL</span><b class="gn-wanda-value" id="gnWandaGoalValue">' + tx('dashboard.setGoal', 'SET GOAL') + '</b><small class="gn-wanda-note" data-i18n="dashboard.fromLatestWeight">From latest weight</small></button>'
    + '</div><div class="gn-wanda-actions"><button type="button" onclick="openLogModal()" data-i18n="runtime.logShot">LOG SHOT</button><button type="button" onclick="openWeightModal()" data-i18n="dashboard.logWeight">LOG WEIGHT</button></div><div class="gn-streak-card" id="gnStreakCard" hidden><b id="gnStreakValue"></b><span id="gnStreakCopy"></span></div></section>';
  header.insertAdjacentHTML('afterend', markup);
  window.GN_I18N?.applyTo?.(document.getElementById('gnWandaDashboard'));
  ['.stat-row', '.weight-quick', '.stats-6', '#dashAdherence', '#dashWtChart'].forEach(selector => {
    const element = document.getElementById('pageDash')?.querySelector(selector);
    if (element) element.closest('.chart-wrap')?.style.setProperty('display', 'none') || element.style.setProperty('display', 'none');
  });
  Array.from(document.querySelectorAll('#pageDash > .sec-hdr')).slice(0, 2).forEach(element => element.style.display = 'none');
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
  setText('gnWandaNextValue', next ? formatDate(next, { month: 'short', day: 'numeric' }) : tx('runtime.logShot', 'LOG SHOT'));
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
  setText('gnWandaPhaseValue', localizedName || tx('dashboard.startWithShot', 'START WITH A SHOT'));
  setText('gnWandaWeightValue', lastWeight ? Number(lastWeight.weight).toFixed(1) + ' lb' : tx('dashboard.logWeight', 'LOG WEIGHT'));
  setText('gnWandaLevelValue', localizedName || tx('dashboard.startWithShot', 'START WITH A SHOT'));
  setText('gnWandaRateValue', weightMetrics.weeklyAverage === null ? tx('dashboard.keepLogging', 'KEEP LOGGING') : tx('dashboard.weeklyRate', '{value} lb/wk', { value: weightMetrics.weeklyAverage.toFixed(1) }));
  setText('gnWandaGoalValue', goalGap === null ? tx('dashboard.setGoal', 'SET GOAL') : Math.max(0, goalGap).toFixed(1) + ' lb');
  document.getElementById('gnWandaPhase')?.classList.toggle('empty', !phase);
  document.getElementById('gnWandaWeight')?.classList.toggle('empty', !lastWeight);
  document.getElementById('gnWandaLevel')?.classList.toggle('empty', !phase);
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
    return null;
  }
  const elapsedDays = Math.max(0, (Date.now() - new Date(lastShot.date).getTime()) / 86400000);
  const cyclePosition = Math.min(elapsedDays / 7, 0.999);
  const phase = PHASES.find(item => cyclePosition >= item.start && cyclePosition < item.end) || PHASES.at(-1);
  const since = elapsedDays < 1 ? Math.round(elapsedDays * 24) + 'h' : Math.floor(elapsedDays) + 'd ' + Math.floor((elapsedDays % 1) * 24) + 'h';
  const phaseName = localizedPhaseName(phase);
  setText('phaseNameTxt', phaseName);
  setText('phaseNumTxt', tx('phase.phaseN', 'PHASE {n} / {total}', { n: PHASES.indexOf(phase) + 1, total: PHASES.length }));
  setText('phaseSupportTxt', localizedPhaseSupport(phase));
  setText('phaseContextText', localizedPhaseContext(phase));
  setText('phaseTimeSince', since);
  setText('phaseCyclePosition', tx('phase.cyclePct', '{pct}% of 7-day reference cycle', { pct: Math.round(cyclePosition * 100) }));
  setText('ringDays', tx('phase.daysLeft', '{n}d', { n: Math.max(0, 7 - Math.floor(elapsedDays)) }));
  setText('ringPct', tx('phase.cyclePositionRing', '{pct}% CYCLE POSITION', { pct: Math.round(cyclePosition * 100) }));
  setText('phaseNext', tx(shots.length === 1 ? 'phase.activeRecords_one' : 'phase.activeRecords_other', '> {phase} // {n} ACTIVE SHOT RECORDS', { phase: phaseName, n: shots.length }));
  setText('pibBody', tx('phase.pibBody', '{phase} visibility is estimated from {since} since the most recent user-entered SHOT.', { phase: phaseName, since }));
  setText('pibSE', lastShot.se?.length ? tx('phase.recentObservations', 'Recent logged observations: {items}.', { items: lastShot.se.map(sideEffectLabel).join(', ') }) : tx('phase.noRecentObservations', 'No side effects were attached to the most recent SHOT record.'));
  setText('pibPay', tx('phase.appetiteSymptoms', 'Track appetite, symptoms, energy, side effects, and notes as your protocol history develops.'));
  const arc = document.getElementById('phaseArc');
  if (arc) { const circumference = 678.6; arc.style.strokeDashoffset = String(circumference * (1 - cyclePosition)); arc.style.stroke = phase.color; }
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
  return phase;
}

function showPhasesModal() {
  const content = $('allPhasesContent');
  if (content) content.innerHTML = PHASES.map((phase, index) => '<div class="gn-phase-row"><span class="gn-phase-index">0' + (index + 1) + '</span><div><b style="color:' + phase.color + '">' + localizedPhaseName(phase) + '</b><p>' + safeText(localizedPhaseSupport(phase)) + '</p></div></div>').join('');
  $('phasesOv')?.classList.add('active');
}
function closePhases() { $('phasesOv')?.classList.remove('active'); }

function ensureShotHistoryFilters() {
  const controls = $('shotHistoryControls');
  if (!controls || $('gnShotFilters')) return;
  controls.insertAdjacentHTML('afterend', `<details class="gn-shot-filters" id="gnShotFilters"><summary><span data-i18n="shots.filterHistory">FILTER SHOT HISTORY</span> <span class="gn-filter-count" id="gnShotFilterCount"></span></summary><div class="gn-shot-filter-grid"><label><span data-i18n="shot.medication">MEDICATION</span><select id="gnShotFilterMedication"><option value="" data-i18n="shots.allMedications">ALL MEDICATIONS</option></select></label><label><span data-i18n="shot.location">LOCATION</span><select id="gnShotFilterSite"><option value="" data-i18n="shots.allLocations">ALL LOCATIONS</option></select></label><label><span data-i18n="shots.dateRange">DATE RANGE</span><select id="gnShotFilterRange"><option value="all" data-i18n="shots.allTime">ALL TIME</option><option value="today" data-i18n="shots.today">TODAY</option><option value="week" data-i18n="shots.thisWeek">THIS WEEK</option><option value="month" data-i18n="shots.thisMonth">THIS MONTH</option></select></label><label><span data-i18n="shots.notesSearch">NOTES SEARCH</span><input id="gnShotFilterQuery" type="search" placeholder="Search notes" data-i18n-placeholder="shots.searchNotes"></label></div><button type="button" class="gn-shot-filter-clear" id="gnShotFilterClear" hidden data-i18n="shots.clearAllFilters">CLEAR ALL FILTERS</button></details>`);
  window.GN_I18N?.applyTo?.($('gnShotFilters'));
  $('gnShotFilters')?.addEventListener('input', event => {
    const id = event.target.id;
    if (id === 'gnShotFilterMedication') moduleState.shotFilters.medication = event.target.value;
    if (id === 'gnShotFilterSite') moduleState.shotFilters.site = event.target.value;
    if (id === 'gnShotFilterRange') moduleState.shotFilters.range = event.target.value;
    if (id === 'gnShotFilterQuery') moduleState.shotFilters.query = event.target.value;
    renderShots();
  });
  $('gnShotFilterClear')?.addEventListener('click', () => { moduleState.shotFilters = { medication: '', site: '', range: 'all', query: '' }; renderShots(); });
}

function filterShots(records) {
  const filters = moduleState.shotFilters;
  const query = filters.query.trim().toLowerCase();
  let cutoff = null;
  if (filters.range === 'today') {
    const d = new Date(); d.setHours(0,0,0,0); cutoff = d.getTime();
  } else if (filters.range === 'week') {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 6); cutoff = d.getTime();
  } else if (filters.range === 'month') {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 29); cutoff = d.getTime();
  }
  return records.filter(record => {
    if (filters.medication && normalizeMedicationId(record.med) !== filters.medication) return false;
    if (filters.site && (record.site || '') !== filters.site) return false;
    if (cutoff && new Date(record.date).getTime() < cutoff) return false;
    if (query && !String(record.notes || '').toLowerCase().includes(query)) return false;
    return true;
  });
}

function renderShotFilterOptions(records) {
  const filters = moduleState.shotFilters;
  const med = $('gnShotFilterMedication');
  const site = $('gnShotFilterSite');
  if (med) { const values = [...new Set(records.map(record => normalizeMedicationId(record.med)).filter(Boolean))].sort(); med.innerHTML = `<option value="">${tx('shots.allMedications', 'ALL MEDICATIONS')}</option>` + values.map(value => `<option value="${safeText(value)}">${safeText(medicationLabel(value))}</option>`).join(''); med.value = filters.medication; }
  if (site) { const values = [...new Set(records.map(record => record.site).filter(Boolean))].sort(); site.innerHTML = `<option value="">${tx('shots.allLocations', 'ALL LOCATIONS')}</option>` + values.map(value => `<option value="${safeText(value)}">${safeText(value)}</option>`).join(''); site.value = filters.site; }
  const query = $('gnShotFilterQuery'); if (query && query.value !== filters.query) query.value = filters.query;
  const range = $('gnShotFilterRange'); if (range) range.value = filters.range;
  const count = Object.values(filters).filter(value => value && value !== 'all').length;
  setText('gnShotFilterCount', count ? tx(count === 1 ? 'shots.filterActive_one' : 'shots.filterActive_other', '{count} FILTERS ACTIVE', { count }) : '');
  const clear = $('gnShotFilterClear'); if (clear) clear.hidden = !count;
}

function renderShots() {
  renderScanner();
  ensureShotHistoryFilters();
  const list = $('logList');
  if (!list) return;
  const all = getAllShots();
  const visible = filterShots(all.filter(record => moduleState.shotHistoryView === 'archived' ? record.archived : !record.archived).sort((a, b) => new Date(b.date) - new Date(a.date)));
  renderShotFilterOptions(all);
  installCustomPickers(document);
  document.addEventListener('gn:langchange', () => {
    const shotDate = $('sDate');
    const weightDate = $('wtDate');
    if (shotDate?.dataset.isoDate) setHumanDateInput(shotDate, shotDate.dataset.isoDate);
    if (weightDate?.dataset.isoDate) setHumanDateInput(weightDate, weightDate.dataset.isoDate, true);
    window.requestAnimationFrame(() => {
      installCustomPickers(document);
      syncCustomPickers(document);
      qa('.gn-custom-date').forEach(renderCustomDatePopover);
      renderScanner();
    });
  });
  syncCustomPickers($('gnShotFilters') || document);
  setText('shotHistoryHelper', moduleState.shotHistoryView === 'archived' ? tx('shots.archivedRetained', 'Archived records remain stored for review and can be restored.') : tx('shots.activeRecordsRetained', 'Active SHOT records are retained in your local VAULT.'));
  qa('[data-shot-history-view]').forEach(button => button.classList.toggle('active', button.dataset.shotHistoryView === moduleState.shotHistoryView));
  if (!visible.length) {
    const activeFilters = Object.values(moduleState.shotFilters).some(value => value && value !== 'all');
    list.innerHTML = `<div class="empty${activeFilters ? '' : ' gn-first-run-card'}"><span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-protocol-event"></use></svg></span></span><b class="gn-first-run-title">${activeFilters ? tx('shots.noFilterMatch', 'NO SHOTS MATCH THESE FILTERS.') : moduleState.shotHistoryView === 'archived' ? tx('shots.noArchivedShots', 'NO ARCHIVED SHOTS') : tx('shots.activateYourGrid', 'LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID')}</b>${activeFilters ? '<br><button class="btn-full btn-secondary empty-cta" type="button" id="gnShotFilterEmptyClear">' + tx('shots.clearFilters', 'CLEAR FILTERS') + '</button>' : '<span class="gn-first-run-sub">' + tx('shots.firstShotSub', 'One shot unlocks the Phase Engine, RESULTS, and your full dashboard.') + '</span><br><button class="btn-full btn-primary empty-cta" type="button" data-empty-shot>' + tx('shots.logYourFirst', 'LOG YOUR FIRST SHOT') + '</button>'}</div>`;
    $('gnShotFilterEmptyClear')?.addEventListener('click', () => { moduleState.shotFilters = { medication: '', site: '', range: 'all', query: '' }; renderShots(); });
    return;
  }
  list.innerHTML = visible.map(record => {
    const archived = Boolean(record.archived);
    return `<article class="log-entry ${archived ? 'archived' : ''}">
      <div class="log-main"><div><div class="log-date">${archived ? tx('shots.archivedPrefix', 'ARCHIVED') + ' ' : ''}${safeText(formatDateTime(record.date))}</div><div class="log-med">${safeText(medicationLabel(record.med))}</div></div>
      <div class="log-dose">${safeText(record.dose || '—')}mg</div></div>
      <div class="log-chips">${record.site ? `<span class="log-chip lc-site">${safeText(zoneLabel(record.site))}</span>` : ''}${record.deviceId ? `<span class="log-chip lc-site">${tx('shot.deviceUsed', 'DEVICE')}: ${safeText(deviceLabel(record.deviceId) || tx('runtime.notAvailable', 'NOT AVAILABLE'))}</span>` : ''}${record.wt ? `<span class="log-chip lc-wt">${safeText(record.wt)}lb</span>` : ''}${record.se?.length ? `<span class="log-chip lc-se">${safeText(record.se.map(sideEffectLabel).join(', '))}</span>` : ''}</div>
      ${record.notes ? `<div class="log-notes">${safeText(record.notes)}</div>` : ''}
      <div class="log-actions">${archived ? `<button type="button" class="log-action-btn" data-shot-action="restore-edit" data-shot-id="${safeText(record.id)}">${tx('shots.restoreToEdit', 'RESTORE TO EDIT')}</button>` : `<button type="button" class="log-action-btn" data-shot-action="edit" data-shot-id="${safeText(record.id)}">${tx('shots.edit', 'EDIT')}</button><button type="button" class="log-action-btn del" data-shot-action="archive" data-shot-id="${safeText(record.id)}">${tx('shots.archive', 'ARCHIVE')}</button>`}</div>
      ${archived ? `<div class="shot-history-helper">${tx('shots.archivedRestoreNote', 'Restore the record before editing.')}</div>` : ''}
    </article>`;
  }).join('');
}

function setShotHistoryView(view) {
  moduleState.shotHistoryView = view === 'archived' ? 'archived' : 'active';
  renderShots();
}


/* GN_SCANNER_AUDIO_CONTROLLER_V1_START */
const GN_SCANNER_AUDIO_STORAGE_KEY = 'gn_scanner_audio_v1';
const GN_SCANNER_AUDIO_MASTER_GAIN = 0.6;
const GN_SCANNER_AUDIO_CONTACT_THROTTLE_MS = 45;
const gnScannerAudioGesture = (() => {
  const token = Symbol('GNScannerAudioGesture');
  return Object.freeze({
    fromEvent(event) { return event?.isTrusted === true ? token : null; },
    accepts(candidate) { return candidate === token; }
  });
})();
let gnScannerAudioEnabled = false;
let gnScannerAudioContext = null;
let gnScannerAudioMaster = null;
let gnScannerAudioLastContactAt = -Infinity;
const gnScannerAudioVoices = new Set();

function gnScannerAudioStoredPreference() {
  try { return localStorage.getItem(GN_SCANNER_AUDIO_STORAGE_KEY) === '1'; } catch (_) { return false; }
}

function gnScannerAudioRenderSwitch() {
  const control = $('gnScannerAudioSwitch');
  if (!control) return;
  control.setAttribute('aria-checked', gnScannerAudioEnabled ? 'true' : 'false');
  const label = tx('shots.scannerAudio', 'SCANNER AUDIO');
  const state = tx(gnScannerAudioEnabled ? 'shots.soundOn' : 'shots.soundOff', gnScannerAudioEnabled ? 'ON' : 'OFF');
  control.innerHTML = `${label} // <span data-scanner-sound-state>${state}</span>`;
}

function gnScannerAudioContextForGesture(gestureToken = null) {
  if (!gnScannerAudioEnabled || !gnScannerAudioGesture.accepts(gestureToken)) return null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!gnScannerAudioContext) {
      gnScannerAudioContext = new AudioContextClass();
      gnScannerAudioMaster = gnScannerAudioContext.createGain();
      gnScannerAudioMaster.gain.setValueAtTime(GN_SCANNER_AUDIO_MASTER_GAIN, gnScannerAudioContext.currentTime);
      gnScannerAudioMaster.connect(gnScannerAudioContext.destination);
    }
    if (gnScannerAudioContext.state === 'suspended') {
      Promise.resolve(gnScannerAudioContext.resume()).catch(() => {});
    }
    return gnScannerAudioContext;
  } catch (_) { return null; }
}

function gnScannerAudioDisconnectVoice(voice) {
  try { voice.oscillator.disconnect(); } catch (_) {}
  try { voice.filter.disconnect(); } catch (_) {}
  try { voice.gain.disconnect(); } catch (_) {}
  gnScannerAudioVoices.delete(voice);
}

function gnScannerAudioStopVoices() {
  const stopTime = gnScannerAudioContext?.currentTime || 0;
  for (const voice of Array.from(gnScannerAudioVoices)) {
    try {
      voice.gain.gain.cancelScheduledValues(stopTime);
      voice.gain.gain.setValueAtTime(0, stopTime);
    } catch (_) {}
    try { voice.oscillator.stop(stopTime); } catch (_) {}
    gnScannerAudioDisconnectVoice(voice);
  }
  gnScannerAudioVoices.clear();
}

function gnScannerAudioTone(durationSeconds, frequency, peak, offsetSeconds = 0) {
  const context = gnScannerAudioContext;
  if (!context || !gnScannerAudioMaster) return;
  let voice = null;
  try {
    const start = context.currentTime + offsetSeconds;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    voice = { oscillator, filter, gain };
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(frequency * 2, 2200), start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(Math.min(peak, GN_SCANNER_AUDIO_MASTER_GAIN), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSeconds);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(gnScannerAudioMaster);
    oscillator.onended = () => gnScannerAudioDisconnectVoice(voice);
    oscillator.start(start);
    oscillator.stop(start + durationSeconds + 0.02);
    gnScannerAudioVoices.add(voice);
  } catch (_) {
    if (voice) gnScannerAudioDisconnectVoice(voice);
  }
}

function gnScannerAudioPlayContact(gestureToken) {
  if (!gnScannerAudioEnabled) return;
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (now - gnScannerAudioLastContactAt < GN_SCANNER_AUDIO_CONTACT_THROTTLE_MS) return;
  gnScannerAudioLastContactAt = now;
  const context = gnScannerAudioContextForGesture(gestureToken);
  if (!context) return;
  // 24ms high-frequency tap (sine, 920Hz, fast decay)
  gnScannerAudioTone(0.024, 920, 0.5);
}

function gnScannerAudioPlayLock(gestureToken) {
  if (!gnScannerAudioEnabled) return;
  const context = gnScannerAudioContextForGesture(gestureToken);
  if (!context) return;
  // 110ms descending confirmation tone (sine, 320->96Hz, slow decay)
  gnScannerAudioTone(0.11, 320, 0.45, 0);
  gnScannerAudioTone(0.11, 96, 0.45, 0.11);
}

function gnScannerAudioToggle() {
  gnScannerAudioEnabled = !gnScannerAudioEnabled;
  try { localStorage.setItem(GN_SCANNER_AUDIO_STORAGE_KEY, gnScannerAudioEnabled ? '1' : '0'); } catch (_) {}
  gnScannerAudioRenderSwitch();
  return gnScannerAudioEnabled;
}

window.GNScannerAudio = Object.freeze({
  isEnabled: () => gnScannerAudioEnabled,
  setEnabled: (value) => {
    gnScannerAudioEnabled = Boolean(value);
    try { localStorage.setItem(GN_SCANNER_AUDIO_STORAGE_KEY, gnScannerAudioEnabled ? '1' : '0'); } catch (_) {}
    gnScannerAudioRenderSwitch();
    return gnScannerAudioEnabled;
  },
  toggle: () => gnScannerAudioToggle(),
  playContact: gnScannerAudioPlayContact,
  playLock: gnScannerAudioPlayLock,
  syncControl: () => gnScannerAudioRenderSwitch()
});

function initScannerAudioControl() {
  gnScannerAudioEnabled = gnScannerAudioStoredPreference();
  gnScannerAudioRenderSwitch();
}

initScannerAudioControl();
/* GN_SCANNER_AUDIO_CONTROLLER_V1_END */

/* v0.15.19 SKIN TONE REMOVED - synthetic biotech scanner, single body per mode */
function scannerSkinTone() { return null; }

/* v0.15.19 SKIN TONE REMOVED - synthetic biotech scanner, single body per mode */
function setScannerSkinTone(tone, button) {
  /* no-op: skin-tone selector is dead in v0.15.19 */
  try { localStorage.removeItem('gn_scanner_skin_tone'); } catch (e) {}
}

/* v0.15.19 INTENSITY REMOVED - single body per mode, no 9-state map */
function scannerIntensityForMode(mode) { return null; }

function setScannerMode(mode, button) {
  moduleState.scannerMode = ZONES[mode] ? mode : 'core';
  /* v0.15.19 - drive .biotech-stage SVG architecture */
  qa('.scanner-mode-btn').forEach(item => {
    const active = item === button || item.dataset.mode === moduleState.scannerMode;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', active ? 'true' : 'false');
    item.setAttribute('aria-selected', active ? 'true' : 'false');
    item.setAttribute('tabindex', active ? '0' : '-1');
  });
  clearScannerTransientState();
  /* toggle .biotech-stage visibility - one stage per mode */
  qa('.biotech-stage').forEach(stage => {
    const isActive = stage.dataset.view === moduleState.scannerMode;
    stage.hidden = !isActive;
    stage.classList.toggle('active', isActive);
    if (isActive) {
      /* re-trigger scanline sweep on stage entry */
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
    /* v0.15.19 - GRID//NODE biotech microcopy */
    const help = {
      core: tx('shots.coreHint', 'ZONE//CORE - Tap a quadrant around the navel. Center excluded.'),
      lower: tx('shots.legsHint', 'ZONE//LEGS - Tap the upper or lower front-thigh zone.'),
      upper: tx('shots.armsHint', 'ZONE//ARMS - Tap a triceps zone above the elbow. Rear view.')
    };
    helper.textContent = help[moduleState.scannerMode] || help.core;
  }
  installScannerPointerHandlers();
  renderScanner();
}


function selectScannerLocation(label, options = {}) {
  const { source = 'programmatic', feedback = source !== 'programmatic', gestureToken = null } = options;
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
  /* v0.15.19 - drive SVG .zone-path rects; add .zone-acquiring pulse */
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
  if (feedback) {
    try { window.GNScannerAudio?.playLock?.(gestureToken); } catch (_) {}
    if (navigator.vibrate) try { navigator.vibrate([4, 12, 6]); } catch (_) {}
  }
  if ($('logOv')?.classList.contains('active')) {
    setText('modalSelectedLocation', zoneLabel(label));
  }
}

const scannerPointerStates = new WeakMap();

function renderScanner() {
  try {
    if (!localStorage.getItem('gn_scanner_hint_shown')) {
      setTimeout(() => {
        if (localStorage.getItem('gn_scanner_hint_shown')) return;
        /* v0.15.19 - hint targets the first zone-path in the active stage */
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
  /* v0.15.19 - drive .zone-path SVG rects in the active .biotech-stage */
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
  /* v0.15.19 - no skin-tone asset sync. Single body per mode. Image already set in HTML. */
}


/* v0.15.19 SCANNER POINTER + HIT-TEST ENGINE */
function pointerToSvgPoint(svg, clientX, clientY) {
  const point = (typeof DOMPoint === "function") ? new DOMPoint(clientX, clientY) : { x: clientX, y: clientY, matrixTransform: function(m) { return { x: clientX * m.a + m.e, y: clientY * m.d + m.f }; } };
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  return point.matrixTransform(ctm.inverse());
}

function hitTestScannerZone(svg, clientX, clientY) {
  const sp = pointerToSvgPoint(svg, clientX, clientY);
  if (!sp) return null;
  /* Try native path.isPointInFill first */
  const hitPaths = svg.querySelectorAll(".zone-hit");
  for (let i = 0; i < hitPaths.length; i++) {
    const p = hitPaths[i];
    if (typeof p.isPointInFill === "function") {
      try { if (p.isPointInFill(sp)) return p; } catch (e) {}
    }
  }
  /* Fallback: nearest zone by distance (should never trigger on real devices) */
  return null;
}

function installScannerPointerHandlers() {
  if (window.__gnScannerPointerInstalled) return;
  window.__gnScannerPointerInstalled = true;
  const TAP_THRESHOLD = 10; /* px */
  qa("#shotsRegionScanner .biotech-stage").forEach(stage => {
    const svg = stage.querySelector(".biotech-zones");
    if (!svg || svg.__gnPointerBound) return;
    svg.__gnPointerBound = true;
    const clearPointerState = (releaseCapture = true) => {
      const state = scannerPointerStates.get(svg);
      if (!state) return;
      if (state.candidate) state.candidate.classList.remove('pressed');
      if (releaseCapture && state.pointerId !== null) {
        try { svg.releasePointerCapture(state.pointerId); } catch (_) {}
      }
      scannerPointerStates.delete(svg);
    };
    svg.addEventListener("pointerdown", (e) => {
      if (stage.hidden) return;
      clearPointerState();
      const candidate = hitTestScannerZone(svg, e.clientX, e.clientY);
      const state = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        candidate,
        cancelled: !candidate
      };
      scannerPointerStates.set(svg, state);
      if (candidate) {
        try { window.GNScannerAudio?.playContact?.(gnScannerAudioGesture.fromEvent(e)); } catch (_) {}
        try { svg.setPointerCapture(e.pointerId); } catch (_) {}
        candidate.classList.add("pressed");
      }
    }, { passive: true });
    svg.addEventListener("pointermove", (e) => {
      const state = scannerPointerStates.get(svg);
      if (!state || state.pointerId !== e.pointerId) return;
      const dx = e.clientX - state.startX, dy = e.clientY - state.startY;
      if (Math.hypot(dx, dy) > TAP_THRESHOLD) {
        state.cancelled = true;
        if (state.candidate) state.candidate.classList.remove("pressed");
      }
    }, { passive: true });
    function endPointer(e) {
      const state = scannerPointerStates.get(svg);
      if (!state || state.pointerId !== e.pointerId) return;
      const endpoint = hitTestScannerZone(svg, e.clientX, e.clientY);
      const candidate = state.candidate;
      const validTap = !state.cancelled && candidate && endpoint === candidate;
      const site = validTap ? candidate.getAttribute("data-site") : '';
      clearPointerState();
      if (site) selectScannerLocation(site, { source: 'pointer', gestureToken: gnScannerAudioGesture.fromEvent(e) });
    }
    svg.addEventListener("pointerup", endPointer, { passive: true });
    svg.addEventListener("pointercancel", () => clearPointerState(), { passive: true });
    svg.addEventListener("lostpointercapture", () => clearPointerState(false), { passive: true });
    /* Keyboard a11y */
    qa("#shotsRegionScanner .zone-path").forEach(zp => {
      if (zp.__gnKeyBound) return;
      zp.__gnKeyBound = true;
      zp.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          const site = zp.getAttribute("data-site");
          if (site) {
            selectScannerLocation(site, { source: 'keyboard', gestureToken: gnScannerAudioGesture.fromEvent(e) });
          }
        }
      });
    });
  });
}

function clearScannerTransientState() {
  qa('#shotsRegionScanner .zone-path.pressed, #shotsRegionScanner .zone-path.zone-acquiring')
    .forEach(path => path.classList.remove('pressed', 'zone-acquiring'));
}

/* v0.15.19 SCANNER DEBUG MODE - ?scannerDebug=1 */
function installScannerDebugMode() {
  if (!/[?&]scannerDebug=1\b/.test(location.search)) return;
  qa("#shotsRegionScanner .zone-path").forEach(zp => {
    zp.classList.add("debug-on");
  });
  document.addEventListener("pointermove", (e) => {
    const svg = (e.target && e.target.closest && e.target.closest(".biotech-zones")) || null;
    if (!svg) return;
    const sp = pointerToSvgPoint(svg, e.clientX, e.clientY);
    if (!sp) return;
    let zoneId = "none", matches = 0;
    qa(svg, ".zone-hit").forEach(p => {
      if (typeof p.isPointInFill === "function") {
        try { if (p.isPointInFill(sp)) { matches++; zoneId = p.getAttribute("data-site") || zoneId; } } catch (err) {}
      }
    });
    let dbg = document.getElementById("__gnScannerDebug");
    if (!dbg) {
      dbg = document.createElement("pre");
      dbg.id = "__gnScannerDebug";
      dbg.style.cssText = "position:fixed;bottom:80px;left:8px;z-index:99999;background:rgba(0,0,0,0.85);color:#06BBE3;font:11px monospace;padding:6px 8px;border:1px solid #06BBE3;border-radius:4px;pointer-events:none;white-space:pre;";
      document.body.appendChild(dbg);
    }
    dbg.textContent = "SCREEN " + Math.round(e.clientX) + "," + Math.round(e.clientY) + "\nSVG " + Math.round(sp.x) + "," + Math.round(sp.y) + "\nZONE " + zoneId + "\nMATCHES " + matches;
  }, { passive: true });
}

function openLogModal(options = {}) {
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

function closeLog(force = false) {
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

function editShot(id) {
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

function openPermanentDeleteConfirm(id) { moduleState.pendingPermanentDeleteId = id; $('permanentDeleteConfirmOv')?.classList.add('active'); }
function cancelPermanentDeleteShot() { moduleState.pendingPermanentDeleteId = null; $('permanentDeleteConfirmOv')?.classList.remove('active'); }
async function confirmPermanentDeleteShot() {
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
      source: existing?.source || 'manual', state: existing?.state || 'confirmed'
    };
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
    if (!S.multiWrite(ops)) {
      showToast(tx('shots.storageFull', 'SHOT could not be saved — storage is full.'), true);
      return;
    }
    // Cloud sync ONLY after the local batch committed atomically.
    queueCloudSync('shot', record);
    if (changed) queueCloudSync('workspace');
    if (weightRecord) queueCloudSync('weight', weightRecord);
    if (queuedCloudDelete) flushCloudDeletes();
    appendEventLedger({ type: 'SHOT', recordId: record.id, date: record.date, label: existing ? 'SHOT UPDATED' : 'SHOT EVENT CONFIRMED' });
    moduleState.pendingFutureShot = false;
    $('futureTimestampConfirm')?.classList.remove('active');
    closeLog(true);
    refreshAll();
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

function openFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.add('active'); }
function closeFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.remove('active'); moduleState.pendingFutureShot = false; }
function cancelFutureTimestampSave() { closeFutureTimestampConfirm(); }
function confirmFutureTimestampSave() { $('futureTimestampConfirm')?.classList.remove('active'); saveShot(true); }

function handleShotFab() { quickLogShot(); }

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

function goToScannerForLocationFromLog() {
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

function openWeightModal() {
  const wtOvEl = $('wtOv');
  if (wtOvEl && !wtOvEl.querySelector('.gn-drawer-handle')) wtOvEl.insertAdjacentHTML('afterbegin', '<div class="gn-drawer-handle" aria-hidden="true"></div>');
  setHumanDateInput($('wtDate'), todayISO(), true);
  if ($('wtTime')) $('wtTime').value = formatTime24(new Date());
  syncCustomPickers(document);
  window.GN_I18N?.applyTo?.(document.getElementById('wtOv'));
  $('wtOv')?.classList.add('active');
}
function closeWt() { $('wtOv')?.classList.remove('active'); }
function setWeightUnit(unit) {
  moduleState.weightUnit = unit === 'kg' ? 'kg' : 'lb';
  qa('[data-wt-unit]').forEach(button => button.classList.toggle('active', button.dataset.wtUnit === moduleState.weightUnit));
}
function saveWt() {
  if (moduleState.savingWt) return;
  moduleState.savingWt = true;
  try {
    const raw = Number($('wtVal')?.value);
    const date = readHumanDateInput($('wtDate'), true) || todayISO();
    if (!Number.isFinite(raw) || raw <= 0) { setText('wtError', tx('weight.invalid', 'ENTER A VALID WEIGHT VALUE')); setDisplay('wtError', true); return; }
    const dateTime = new Date(`${date}T${$('wtTime')?.value || '12:00'}`);
    if (Number.isNaN(dateTime.getTime()) || dateTime > new Date()) { setText('wtError', tx('weight.futureNotAllowed', 'FUTURE DATE NOT ALLOWED')); setDisplay('wtError', true); return; }
    const weight = moduleState.weightUnit === 'kg' ? raw * 2.2046226218 : raw;
    const previousWeight = sortedWeights().at(-1)?.weight;
    const milestone = weightMilestone(previousWeight, weight, getProfile());
    const record = { id: createId('weight'), date: `${date}T${$('wtTime')?.value || '12:00'}`, weight, weightKg: moduleState.weightUnit === 'kg' ? raw : raw / 2.2046226218, unit: moduleState.weightUnit, notes: $('wtNotes')?.value?.trim() || null, source: 'manual', state: 'confirmed' };
    const weights = getWeights(); weights.push(record);
    if (!S.set('weights', weights)) { setText('wtError', tx('weight.storageUnavailable', 'STORAGE UNAVAILABLE — WEIGHT NOT SAVED')); setDisplay('wtError', true); return; }
    queueCloudSync('weight', record);
    appendEventLedger({ type: 'WEIGHT', recordId: record.id, date: record.date, label: 'RESULTS UPDATED' });
    closeWt();
    if ($('wtVal')) $('wtVal').value = '';
    if ($('wtNotes')) $('wtNotes').value = '';
    refreshAll();
    if (milestone) celebrateMilestone(milestone.type, milestone.value);
    showToast(tx('toast.weightLogged', 'Peso registrado'), false, () => undoWeight(record.id), `${raw} ${moduleState.weightUnit === 'kg' ? 'kg' : 'lb'}`);
  } finally {
    moduleState.savingWt = false;
  }
}

function renderResults() {
  ensureResultsEnhancements();
  window.GN_I18N?.applyTo?.(document.getElementById('pageResults'));
  const shots = sortedShots();
  const weights = sortedWeights();
  const profile = getProfile();
  const weightMetrics = computeTotalChange(weights, profile, 'profile');
  const latest = weightMetrics.latest;
  const first = weightMetrics.first;
  const change = weightMetrics.change;
  const spanDays = weightMetrics.spanDays;
  const directionReady = weights.length >= 3 && spanDays >= 7;
  setText('resLatestWeight', latest ? `${latest.weight.toFixed(1)} lb` : '—');
  setText('resShotCount', String(shots.length));
  setText('resLatestAppetite', tx('results.logObservations', 'LOG OBSERVATIONS'));
  setText('resLatestEnergy', tx('results.logObservations', 'LOG OBSERVATIONS'));
  setText('resContinuityEvents', String(shots.length));
  setText('resContinuityRecent', latestShot() ? formatDate(latestShot().date, { month: 'short', day: 'numeric' }) : '—');
  setText('resContinuityActive', String(shots.length));
  setText('r6TotalLabel', tx('dashboard.resultsTotal', 'TOTAL CHANGE'));
  setText('r6TotalBasis', weightMetrics.basis === 'from profile start weight' ? tx('dashboard.fromProfileStart', '(from profile start)') : tx('dashboard.fromFirstWeight', '(from first recorded weight)'));
  setText('r6Total', change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)} lb`);
  const resultsBMI = calcBMIValue(latest?.weight, profile);
  setText('r6BMI', resultsBMI || '');
  setDisplay('r6BMICard', Boolean(resultsBMI));
  setText('r6Wt', latest ? `${latest.weight.toFixed(1)} lb` : '—');
  setText('r6Pct', weightMetrics.percentLost === null ? '—' : `${weightMetrics.percentLost.toFixed(1)}%`);
  setText('r6Avg', weightMetrics.weeklyAverage === null ? '—' : tx('dashboard.weeklyRate', '{value} lb/wk', { value: weightMetrics.weeklyAverage.toFixed(1) }));
  setText('r6Goal', profile.goalWt && latest ? `${Math.max(0, latest.weight - Number(profile.goalWt)).toFixed(1)} lb` : '—');
  const wtChartValue = $('wtChartVal');
  if (wtChartValue) wtChartValue.innerHTML = latest ? Number(latest.weight).toFixed(1) + '<span>' + tx('results.lbsCurrent', 'lbs current') + '</span>' : '—';
  const direction = $('resWeightDirection');
  if (direction) { direction.textContent = directionReady ? tx(change < 0 ? 'results.trendDownAcross' : change > 0 ? 'results.trendUpAcross' : 'results.trendStableAcross', 'Trend direction: Stable across logged measurements') : tx('results.trendInsufficient', 'Trend direction: Insufficient Data'); direction.className = 'results-direction ' + (!directionReady ? 'insufficient' : change <= 0 ? 'good' : 'warn'); }
  setDisplay('weightTrendEmpty', !weights.length); setDisplay('weightTrendLive', Boolean(weights.length));
  setDisplay('resultsSummaryEmpty', !weights.length && !shots.length);
  drawWeightTrendChart($('wtChart'), filterWeightsForChart(weights), shots, profile.goalWt);
  drawTrendArrow($('wtChart'), filterWeightsForChart(weights), profile.goalWt);
  renderWeightRecords(weights);
  renderMeasurementTrend();
  renderPhaseSource(latestShot());
  renderTrendLists(shots);
  renderWeeklyReport(shots, weights);
}

function renderWeightRecords(weights) {
  const list = $('weightRecordsList');
  if (!list) return;
  setDisplay('weightRecordsEmpty', !weights.length);
  list.innerHTML = [...weights].reverse().filter(record => record && Number.isFinite(Number(record.weight))).map(record => `<div class="gn-weight-record"><div><b>${Number(record.weight).toFixed(1)} lb</b><span>${safeText(formatDateTime(record.date))}</span>${record.notes ? `<small>${safeText(record.notes)}</small>` : ''}</div></div>`).join('');
}

function filterWeightsForChart(weights) {
  const range = moduleState.weightRange;
  if (range === 'all') return weights;
  const days = range === '1m' ? 30 : range === '3m' ? 90 : 180;
  const cutoff = Date.now() - days * 86400000;
  return weights.filter(record => new Date(record.date).getTime() >= cutoff);
}

function ensureResultsEnhancements() {
  const ledger = document.getElementById('pageResults')?.querySelector('.results-ledger');
  if (ledger && !document.getElementById('gnWeeklyReport')) {
    const markup = '<section class="gn-weekly-report" id="gnWeeklyReport"><div class="gn-foundation-kicker" data-i18n="results.weeklyKicker">// WEEKLY NODE REPORT</div><h3 id="gnWeeklyTitle" data-i18n="results.moreDataNeeded">MORE DATA NEEDED</h3><p id="gnWeeklyCopy" data-i18n="results.weeklyEmptyCopy">Log a shot or log your weight to begin building your SIGNAL.</p><div class="gn-weekly-signals" id="gnWeeklySignals"></div><div class="gn-weekly-actions" id="gnWeeklyActions"><button type="button" onclick="openLogModal()" data-i18n="runtime.logShot">LOG SHOT</button><button type="button" onclick="openWeightModal()" data-i18n="dashboard.logWeight">LOG WEIGHT</button></div></section><div class="gn-reference-pending"><strong data-i18n="results.referencePendingTitle">REFERENCE DATA NOT LOADED</strong><br><span data-i18n="results.referencePendingHtml">Clinical comparison remains off until a medication-specific, source-verified dataset and uncertainty model are available. Your SIGNAL uses your own logged history.</span></div>';
    ledger.insertAdjacentHTML('afterbegin', markup);
  }
  const weightCard = document.getElementById('weightRecordsPanel')?.closest('.results-card');
  if (weightCard && !document.getElementById('measurementTrendCard')) {
    const markup = '<section class="results-card" id="measurementTrendCard"><div class="results-card-title"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-biometric-gauge"></use></svg></span><span data-i18n="results.measurementsTitle">MEASUREMENTS</span></div><div class="results-card-sub" data-i18n="results.measurementsSub">Latest user-entered body measurements</div><div id="measurementTrendList" class="gn-measurement-trend-list"></div><div id="measurementTrendEmpty" class="results-empty" data-i18n="results.noMeasurements">No measurements logged yet.</div></section>';
    weightCard.insertAdjacentHTML('afterend', markup);
  }
  const chart = document.getElementById('wtChart');
  if (chart && !document.getElementById('weightTrendChartSummary')) chart.parentElement?.insertAdjacentHTML('afterend', '<div class="results-copy" id="weightTrendChartSummary" data-i18n="results.weightTrendEmptyHtml">Log weight to build your trend.</div>');
}

function renderWeeklyReport(shots, weights) {
  if (!document.getElementById('gnWeeklyReport')) return;
  if (shots.length < 2) {
    setText('gnWeeklyTitle', tx('results.moreDataNeeded', 'MORE DATA NEEDED'));
    setText('gnWeeklyCopy', tx('results.weeklyEmptyCopy', 'Log a shot or log your weight to begin building your SIGNAL.'));
    const signals = document.getElementById('gnWeeklySignals');
    if (signals) signals.innerHTML = '';
    setDisplay('gnWeeklyActions', true);
    return;
  }
  const cutoff = Date.now() - 7 * 86400000;
  const weekShots = shots.filter(item => new Date(item.date).getTime() >= cutoff);
  const weekWeights = weights.filter(item => new Date(item.date).getTime() >= cutoff);
  const observations = weekShots.flatMap(item => item.se || []);
  const change = weekWeights.length > 1 ? Number(weekWeights.at(-1).weight) - Number(weekWeights[0].weight) : null;
  setText('gnWeeklyTitle', tx('results.last7Days', 'YOUR LAST 7 DAYS'));
  setText('gnWeeklyCopy', tx('results.weeklyCopy', 'This report summarizes only your logged timeline. Gaps remain visible and no clinical comparison is inferred.'));
  const signals = document.getElementById('gnWeeklySignals');
  if (signals) signals.innerHTML = '<span>' + tx('results.shotEvents', 'SHOT EVENTS') + '<b>' + weekShots.length + '</b></span><span>' + tx('results.weightChange', 'WEIGHT CHANGE') + '<b>' + (change === null ? tx('results.notEnoughData', 'NOT ENOUGH DATA') : (change > 0 ? '+' : '') + change.toFixed(1) + ' lb') + '</b></span><span>' + tx('results.observations', 'OBSERVATIONS') + '<b>' + (observations.length || tx('results.noneLogged', 'NONE LOGGED')) + '</b></span>';
  setDisplay('gnWeeklyActions', false);
}

function renderMeasurementTrend() {
  const list = $('measurementTrendList');
  const records = S.get('measurements', []);
  if (!list) return;
  const latest = new Map();
  records.forEach(record => { const current = latest.get(record.type); if (!current || new Date(record.date) > new Date(current.date)) latest.set(record.type, record); });
  const rows = [...latest.values()].sort((a, b) => a.type.localeCompare(b.type));
  setDisplay('measurementTrendEmpty', !rows.length);
  list.innerHTML = rows.filter(record => Number.isFinite(Number(record.value))).map(record => `<div class="gn-measurement-trend-row"><b>${safeText(record.type)}</b><span>${Number(record.value).toFixed(1)} ${safeText(record.unit)}</span></div>`).join('');
}

function drawWeightTrendChart(canvas, weights, shots, goal) {
  const summary = $('weightTrendChartSummary');
  if (!canvas) return null;
  const width = Math.max(280, canvas.clientWidth || 320), height = Math.max(200, canvas.clientHeight || 220), scale = window.devicePixelRatio || 1;
  canvas.width = width * scale; canvas.height = height * scale;
  const context = canvas.getContext('2d'); if (!context) return null;
  context.setTransform(scale, 0, 0, scale, 0, 0); context.clearRect(0, 0, width, height);
  if (!weights.length) {
    if (summary) summary.textContent = tx('dashboard.logWeight', 'LOG WEIGHT');
    // Overnight polish (2026-08-09): RESULTS chart empty state — quiet
    // grid + message instead of a dead blank canvas.
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    context.strokeStyle = light ? 'rgba(20,60,70,.1)' : 'rgba(255,255,255,.08)';
    context.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = (height / 4) * i; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    context.fillStyle = light ? 'rgba(46,66,75,.75)' : 'rgba(158,178,190,.78)';
    context.font = `700 ${Math.max(12, Math.round(width * .034))}px "Share Tech Mono", monospace`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(tx('dashboard.noRecordsYet', 'NO RECORDS YET · LOG YOUR FIRST WEIGHT'), width / 2, height / 2);
    const overlay = document.getElementById(canvas.id + 'Overlay');
    if (overlay) overlay.innerHTML = '';
    renderWeightChartLegend(canvas, null);
    return null;
  }

  const left = 42, right = 12, top = 16, bottom = 30, plotWidth = width - left - right, plotHeight = height - top - bottom;
  const values = weights.map(item => Number(item.weight));
  const minValue = Math.min(...values, Number(goal) || Infinity), maxValue = Math.max(...values, Number(goal) || -Infinity);
  const padding = Math.max(1, (maxValue - minValue || 1) * .14), min = minValue - padding, max = maxValue + padding, span = max - min || 1;
  const xFor = index => weights.length === 1 ? left + plotWidth / 2 : left + (index / (weights.length - 1)) * plotWidth;
  const yFor = value => top + (max - Number(value)) / span * plotHeight;
  context.font = '10px Share Tech Mono, monospace'; context.fillStyle = '#8295a0'; context.strokeStyle = 'rgba(255,255,255,.10)'; context.lineWidth = 1;
  for (let index = 0; index <= 3; index++) { const y = top + plotHeight * index / 3; context.beginPath(); context.moveTo(left, y); context.lineTo(width - right, y); context.stroke(); context.fillText(`${(max - (span * index / 3)).toFixed(1)}`, 4, y + 3); }
  if (Number(goal) > 0) { const goalY = yFor(goal); context.save(); context.setLineDash([5, 4]); context.strokeStyle = 'rgba(255,215,0,.55)'; context.beginPath(); context.moveTo(left, goalY); context.lineTo(width - right, goalY); context.stroke(); context.restore(); }

  // Premium REFINEMENT (2026-08-10): cyan area gradient under the curve, then a
  // boosted glow halo on the line itself. Halo is drawn twice — once wider, once
  // tight — so the cyan reads as luminous at hi-DPI without bleeding into the grid.
  const points = values.map((value, index) => ({ x: xFor(index), y: yFor(value), index, value }));
  const areaGrad = context.createLinearGradient(0, top, 0, top + plotHeight);
  areaGrad.addColorStop(0, 'rgba(0, 230, 240, 0.42)');
  areaGrad.addColorStop(0.55, 'rgba(0, 230, 240, 0.16)');
  areaGrad.addColorStop(1, 'rgba(0, 230, 240, 0)');
  context.fillStyle = areaGrad;
  context.beginPath();
  context.moveTo(points[0].x, top + plotHeight);
  points.forEach(p => context.lineTo(p.x, p.y));
  context.lineTo(points.at(-1).x, top + plotHeight);
  context.closePath();
  context.fill();

  context.shadowColor = 'rgba(0, 230, 240, 0.65)'; context.shadowBlur = 14; context.strokeStyle = 'rgba(0, 230, 240, 0.55)'; context.lineWidth = 4; context.beginPath();
  points.forEach((p, i) => { if (!i) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y); });
  context.stroke();
  context.shadowBlur = 7; context.strokeStyle = '#00E6F0'; context.lineWidth = 2; context.beginPath();
  points.forEach((p, i) => { if (!i) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y); });
  context.stroke(); context.shadowBlur = 0;

  context.fillStyle = '#00E6F0';
  points.forEach(p => { context.beginPath(); context.arc(p.x, p.y, 3, 0, Math.PI * 2); context.fill(); });
  const start = parseLocalDate(weights[0].date), end = parseLocalDate(weights.at(-1).date); context.fillStyle = '#8295a0'; context.fillText(formatDate(start, { month: 'short', day: 'numeric' }), left, height - 8); context.textAlign = 'right'; context.fillText(formatDate(end, { month: 'short', day: 'numeric' }), width - right, height - 8); context.textAlign = 'left';
  let priorDose = null;
  const shotMarkers = [];
  shots.forEach(shot => {
    const time = parseLocalDate(shot.date).getTime();
    const dose = Number(shot.dose) || priorDose;
    if (!Number.isFinite(time) || time < start.getTime() || time > end.getTime()) { priorDose = dose; return; }
    const nearest = points.reduce((best, item, index) => Math.abs(parseLocalDate(weights[index].date).getTime() - time) < Math.abs(parseLocalDate(weights[best.index].date).getTime() - time) ? item : best, points[0]).index;
    const changed = priorDose !== null && dose !== priorDose;
    const px = xFor(nearest), py = yFor(values[nearest]);
    context.fillStyle = changed ? '#ffd700' : '#FF3B3B';
    context.beginPath(); context.arc(px, py, changed ? 6 : 4, 0, Math.PI * 2); context.fill();
    if (changed) { context.fillStyle = '#ffd700'; context.font = '9px Share Tech Mono, monospace'; context.fillText(tx('results.chartDose', 'DOSE'), Math.min(width - 38, px + 5), Math.max(10, py - 7)); }
    shotMarkers.push({ x: px, y: py, kind: changed ? 'dose' : 'shot', t: time });
    priorDose = dose;
  });
  const profileStart = Number(getProfile().startWt) || values[0];
  const milestoneMarkers = [];
  [5, 10, 15, 20].forEach(percent => {
    const target = profileStart * (1 - percent / 100);
    const firstIndex = values.findIndex(value => value <= target);
    if (firstIndex < 0) return;
    const mx = xFor(firstIndex), my = yFor(values[firstIndex]);
    context.fillStyle = '#00ff88'; context.beginPath(); context.arc(mx, my, 5, 0, Math.PI * 2); context.fill();
    milestoneMarkers.push({ x: mx, y: my, percent });
  });
  if (summary) { const summaryText = weights.length === 1 ? tx('results.oneWeightPoint', 'One data point logged. Keep tracking to see your trend.') : Number(goal) > 0 ? tx('results.showingWeightRecordsWithGoal', 'Showing {count} weight records · goal {goal} lb', { count: weights.length, goal: Number(goal).toFixed(1) }) : tx('results.showingWeightRecords', 'Showing {count} weight records', { count: weights.length }); summary.textContent = summaryText; }

  const geometry = { width, height, left, right, top, bottom, plotWidth, plotHeight, min, max, span, points, goalY: Number(goal) > 0 ? yFor(goal) : null, startTime: start.getTime(), endTime: end.getTime(), shotMarkers, milestoneMarkers };
  renderWeightChartOverlay(canvas, geometry, { compact: false });
  renderWeightChartLegend(canvas, geometry);
  return geometry;
}

/* Premium REFINEMENT (2026-08-10): SVG overlay painted on top of the canvas.
   Provides the phase band behind the curve, an animated cyan trace flowing along
   the line as a 'live signal', and a pulsing dot at the latest datapoint. All
   animations honour prefers-reduced-motion via CSS. */
function renderWeightChartOverlay(canvas, geometry, options = {}) {
  if (!canvas) return;
  const overlay = document.getElementById(canvas.id + 'Overlay');
  if (!overlay) return;
  if (!geometry) { overlay.innerHTML = ''; overlay.removeAttribute('viewBox'); return; }
  const compact = options.compact === true;
  const { width, height, left, right, top, bottom, plotWidth, plotHeight, points, goalY, startTime, endTime, shotMarkers } = geometry;
  const ns = 'http://www.w3.org/2000/svg';
  overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
  overlay.setAttribute('preserveAspectRatio', 'none');
  overlay.innerHTML = '';

  // Phase band: emit the 7-day reference cycle coloured by phase, anchored to
  // the most-recent shot and clipped strictly to the visible curve area. Each
  // phase becomes a coloured rect that sits behind the cyan line, giving the
  // user a visual sense of which medication phase their current weight sits in.
  if (!compact && startTime && endTime) {
    const lastShot = latestShot();
    if (lastShot) {
      const lastShotTime = parseLocalDate(lastShot.date).getTime();
      const cycleMs = 7 * 86400000;
      const cycleStart = lastShotTime - Math.floor((lastShotTime - startTime) / cycleMs) * cycleMs;
      const totalSpan = endTime - startTime;
      if (totalSpan > 0) {
        const xFromTime = t => left + ((t - startTime) / totalSpan) * plotWidth;
        PHASES.forEach(phase => {
          // Phase rects are clipped to [startTime, endTime] — the data window —
          // so the band never extends into the empty area past the curve.
          const visStart = Math.max(cycleStart + phase.start * cycleMs, startTime);
          const visEnd = Math.min(cycleStart + phase.end * cycleMs, endTime);
          if (visEnd <= visStart) return;
          const x1 = xFromTime(visStart);
          const x2 = xFromTime(visEnd);
          const rect = document.createElementNS(ns, 'rect');
          rect.setAttribute('class', 'gn-phase-band');
          rect.setAttribute('x', x1);
          rect.setAttribute('y', top);
          rect.setAttribute('width', Math.max(1, x2 - x1));
          rect.setAttribute('height', plotHeight);
          rect.setAttribute('fill', phase.color);
          overlay.appendChild(rect);
        });
      }
    }
  }

  // Animated live trace — a soft cyan path that mirrors the curve line.
  // Drawn as a continuous (non-dashed) stroke with reduced opacity so the static
  // canvas line stays crisp while the overlay adds motion. The trace is offset
  // by a moving dashed highlight to give the sense of flow.
  if (points.length >= 2) {
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    // Soft halo path
    const halo = document.createElementNS(ns, 'path');
    halo.setAttribute('d', d);
    halo.setAttribute('fill', 'none');
    halo.setAttribute('stroke', '#00E6F0');
    halo.setAttribute('stroke-width', '6');
    halo.setAttribute('stroke-linecap', 'round');
    halo.setAttribute('stroke-linejoin', 'round');
    halo.setAttribute('opacity', '0.35');
    overlay.appendChild(halo);
    // Animated dash on top
    const trace = document.createElementNS(ns, 'path');
    trace.setAttribute('d', d);
    trace.setAttribute('fill', 'none');
    trace.setAttribute('stroke', '#7FF7FF');
    trace.setAttribute('stroke-width', '2.5');
    trace.setAttribute('stroke-linecap', 'round');
    trace.setAttribute('stroke-linejoin', 'round');
    trace.setAttribute('class', 'gn-live-trace');
    overlay.appendChild(trace);
  }

  // Pulse at the latest datapoint — the 'live signal' indicator.
  const last = points.at(-1);
  if (last && !compact) {
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('class', 'gn-pulse-ring');
    ring.setAttribute('cx', last.x);
    ring.setAttribute('cy', last.y);
    ring.setAttribute('r', 5);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#00E6F0');
    ring.setAttribute('stroke-width', '1.5');
    ring.setAttribute('opacity', '0.85');
    overlay.appendChild(ring);

    const core = document.createElementNS(ns, 'circle');
    core.setAttribute('class', 'gn-pulse-core');
    core.setAttribute('cx', last.x);
    core.setAttribute('cy', last.y);
    core.setAttribute('r', 4);
    core.setAttribute('fill', '#00E6F0');
    overlay.appendChild(core);
  }
}

/* Premium REFINEMENT (2026-08-10): clean inline legend below the chart. Replaces
   the dense sentence-form summary copy that mixed metric counts and a key in one
   line. The full summary still lives in #weightTrendChartSummary for screen readers. */
function renderWeightChartLegend(canvas, geometry) {
  const legend = document.getElementById(canvas.id + 'Legend');
  if (!legend) return;
  if (!geometry) { legend.innerHTML = ''; return; }
  const items = [
    { key: 'cyan',   label: tx('results.legendWeight', 'WEIGHT') },
    { key: 'red',    label: tx('results.legendShot', 'SHOT') },
    { key: 'yellow', label: tx('results.legendDose', 'DOSE') },
    { key: 'green',  label: tx('results.legendMilestone', 'MILESTONE') },
    { key: 'goal',   label: tx('results.legendGoal', 'GOAL') }
  ];
  legend.innerHTML = items.map(item => `<span><i class="sw-${item.key}"></i>${safeText(item.label)}</span>`).join('');
}

function drawTrendArrow(canvas, weights, goal) {
  if (!canvas || weights.length < 2) return;
  const width = Math.max(280, canvas.clientWidth || 320), height = Math.max(200, canvas.clientHeight || 220), scale = window.devicePixelRatio || 1;
  const context = canvas.getContext('2d'); if (!context) return;
  const left = 42, right = 12, top = 16, bottom = 30, plotWidth = width - left - right, plotHeight = height - top - bottom;
  const values = weights.map(item => Number(item.weight));
  const minValue = Math.min(...values, Number(goal) || Infinity), maxValue = Math.max(...values, Number(goal) || -Infinity);
  const padding = Math.max(1, (maxValue - minValue || 1) * .14), min = minValue - padding, max = maxValue + padding, span = max - min || 1;
  const xFor = index => left + (index / (values.length - 1)) * plotWidth;
  const yFor = value => top + (max - Number(value)) / span * plotHeight;
  const delta = values.at(-1) - values.at(-2);
  const arrow = delta < -0.05 ? '▼' : delta > 0.05 ? '▲' : '►';
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.fillStyle = delta < -0.05 ? '#00ff88' : delta > 0.05 ? '#FF5B5B' : '#ffd700';
  context.font = '700 14px Share Tech Mono, monospace';
  context.textAlign = 'left';
  context.fillText(arrow, Math.min(width - 16, xFor(values.length - 1) + 7), yFor(values.at(-1)) + 5);
}

function renderPhaseSource(shot) {
  setDisplay('phaseEngineSourceEmpty', !shot); setDisplay('phaseEngineSourceReadout', Boolean(shot));
  const readout = document.getElementById('phaseEngineSourceReadout');
  if (!readout || !shot) return;
  const elapsed = Math.max(0, (Date.now() - new Date(shot.date).getTime()) / 86400000);
  readout.innerHTML = '<div><span>' + tx('runtime.lastShot', 'LAST SHOT') + '</span><b>' + safeText(formatDateTime(shot.date)) + '</b></div><div><span>' + tx('runtime.medication', 'MEDICATION') + '</span><b>' + safeText(medicationLabel(shot.med)) + '</b></div><div><span>' + tx('runtime.timeSince', 'TIME SINCE') + '</span><b>' + Math.floor(elapsed) + 'd</b></div><div><span>' + tx('runtime.dataSource', 'DATA SOURCE') + '</span><b>' + tx('runtime.userHistory', 'USER-ENTERED HISTORY') + '</b></div>';
}

function renderTrendLists(shots) {
  const effects = shots.flatMap(item => item.se || []);
  setDisplay('sideEffectTrendEmpty', !effects.length); setDisplay('sideEffectTrendLive', Boolean(effects.length));
  const sideEffectTrend = document.getElementById('sideEffectTrendLive');
  if (sideEffectTrend) {
    sideEffectTrend.innerHTML = effects.length
      ? effects.slice(-6).reverse().map(effect => '<div class="results-list-row"><b>' + safeText(sideEffectLabel(effect)) + '</b><span>' + tx('runtime.loggedObservation', 'logged observation') + '</span></div>').join('')
      : '';
  }
  setDisplay('appetiteTrendEmpty', true); setDisplay('energyTrendEmpty', true);
}

function drawCanvasChart(canvas, values, color) {
  if (!canvas) return;
  const width = Math.max(280, canvas.clientWidth || 320);
  const height = Math.max(110, canvas.clientHeight || 150);
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale; canvas.height = height * scale;
  const context = canvas.getContext('2d'); if (!context) return;
  context.scale(scale, scale); context.clearRect(0, 0, width, height);
  if (!values.length) {
    // Overnight polish (2026-08-09): empty charts were a dead blank zone —
    // draw a faint grid + a quiet "no records yet" line, theme-aware.
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    context.strokeStyle = light ? 'rgba(20,60,70,.1)' : 'rgba(255,255,255,.08)';
    context.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = (height / 4) * i; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    context.fillStyle = light ? 'rgba(46,66,75,.75)' : 'rgba(158,178,190,.78)';
    context.font = `700 ${Math.max(12, Math.round(width * .034))}px "Share Tech Mono", monospace`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(tx('dashboard.noRecordsYet', 'NO RECORDS YET · LOG YOUR FIRST WEIGHT'), width / 2, height / 2);
    return;
  }
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  context.strokeStyle = 'rgba(255,255,255,.09)'; context.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const y = (height / 4) * i; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  context.strokeStyle = color; context.shadowColor = color; context.shadowBlur = 8; context.lineWidth = 2; context.beginPath();
  values.forEach((value, index) => { const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 16) + 8; const y = height - 18 - ((value - min) / span) * (height - 36); if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); });
  context.stroke(); context.shadowBlur = 0;
}

function renderProtocolCurve(shots, phase) {
  const canvas = $('medChart');
  const readout = $('medLvlVal');
  if (!shots.length) {
    if (readout) {
      const detail = document.createElement('span');
      detail.textContent = tx('results.logToBegin', 'log a shot to begin');
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
    window.GN_PEPTIDE_VIZ.render({ canvas, readout, shots, medId, medLabel: medicationLabel(medId), labelMap, range: moduleState.medRange, now: Date.now(), phaseName: localizedPhaseName(phase) || phase?.name || 'ACTIVE' });
    return;
  }

  if (readout) {
    const detail = document.createElement('span');
    detail.textContent = tx('results.relativeCycleModel', 'relative cycle model · not a measured level');
    readout.replaceChildren(document.createTextNode(localizedPhaseName(phase) || tx('results.active', 'ACTIVE')), detail);
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

function setRange(button, range) { moduleState.medRange = range; qa('#pageDash .time-tab').forEach(item => item.classList.toggle('active', item === button)); renderDashboard(); }
function setWtRange(button, range) { moduleState.weightRange = range; qa('#pageResults .time-tab').forEach(item => item.classList.toggle('active', item === button)); renderResults(); }

function showLabSeg(segment, button) {
  qa('[data-labseg-block]').forEach(block => block.style.display = block.dataset.labsegBlock === segment ? 'block' : 'none');
  qa('#labSegTabs .time-tab').forEach(item => item.classList.toggle('active', item === button || item.dataset.labseg === segment));
  renderLab();
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
  const popover = document.createElement('div');
  popover.className = 'gn-custom-date-popover';
  popover.innerHTML = '<div class="gn-custom-date-head"><button type="button" data-gn-date-prev aria-label="' + tx('date.prevMonth', 'Previous month') + '">‹</button><strong data-gn-date-label></strong><button type="button" data-gn-date-next aria-label="' + tx('date.nextMonth', 'Next month') + '">›</button></div><div class="gn-custom-date-grid" data-gn-date-grid></div><div class="gn-custom-date-foot"><button type="button" data-gn-date-today data-i18n="date.useToday">' + tx('date.useToday', 'USE TODAY') + '</button><button type="button" data-gn-date-close data-i18n="date.close">' + tx('date.close', 'CLOSE') + '</button></div>';
  input.type = 'text';
  input.readOnly = true;
  input.hidden = true;
  input.setAttribute('aria-hidden', 'true');
  input.dataset.gnDateWired = 'true';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(trigger, popover, input);
  window.GN_I18N?.applyTo?.(popover);
  trigger.addEventListener('click', () => {
    const open = !wrapper.classList.contains('open');
    closeCustomPickers(wrapper);
    wrapper.classList.toggle('open', open);
    if (open) { wrapper._month = input.value ? new Date(`${input.value}T00:00:00`) : new Date(); wrapper._month = new Date(wrapper._month.getFullYear(), wrapper._month.getMonth(), 1); renderCustomDatePopover(wrapper); }
  });
  popover.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.gnDatePrev) wrapper._month.setMonth(wrapper._month.getMonth() - 1);
    else if (target.dataset.gnDateNext) wrapper._month.setMonth(wrapper._month.getMonth() + 1);
    else if (target.dataset.gnDateToday) { input.value = todayISO(); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); wrapper._month = new Date(); wrapper._month = new Date(wrapper._month.getFullYear(), wrapper._month.getMonth(), 1); syncCustomDate(input); }
    else if (target.dataset.gnDateValue) { input.value = target.dataset.gnDateValue; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); syncCustomDate(input); wrapper.classList.remove('open'); }
    else if (target.dataset.gnDateClose) wrapper.classList.remove('open');
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

function ensureLabFoundations() {
  const page = $('pageLab');
  if (!page || page.querySelector('[data-gn-lab-foundation]')) return;
  const header = page.querySelector('.page-hdr');
  if (!header) return;
  header.insertAdjacentHTML('afterend', `<section class="gn-foundation-panel" data-gn-lab-foundation aria-labelledby="gnLabFoundationTitle">
    <div class="gn-foundation-head"><div><div class="gn-foundation-kicker" data-i18n="lab.organizedSystems">// ORGANIZED SYSTEMS</div><h2 id="gnLabFoundationTitle">LAB <span data-i18n="lab.expansionLayer">EXPANSION LAYER</span></h2></div><span class="gn-foundation-signal" data-i18n="lab.localRecords">LOCAL RECORDS</span></div>
    <div class="gn-lab-breadcrumb">LAB <b>›</b> <span data-i18n="lab.chooseSystemPhrase">CHOOSE A SYSTEM</span></div>
    <div class="gn-foundation-grid">
      <button type="button" class="gn-foundation-tile" data-lab-focus="calculators"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-g"><svg><use href="#gn-biometric-gauge"></use></svg></span></span><b data-i18n="lab.calculators">CALCULATORS</b><small data-i18n="lab.calculatorsHelp">Focused educational tools</small></button>
      <button type="button" class="gn-foundation-tile active" data-lab-focus="research"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-lab-vessel"></use></svg></span></span><b data-i18n="lab.researchPeptides">RESEARCH PEPTIDES</b><small data-i18n="lab.researchPeptidesHelp">Personal record tracking</small></button>
      <button type="button" class="gn-foundation-tile" data-lab-focus="inventory"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-g"><svg><use href="#gn-inventory-core"></use></svg></span></span><b data-i18n="lab.inventory">INVENTORY</b><small data-i18n="lab.inventoryHelp">Supply records + deduction</small></button>
      <button type="button" class="gn-foundation-tile" data-lab-focus="devices"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-y"><svg><use href="#gn-vault-core"></use></svg></span></span><b data-i18n="lab.deviceVault">DEVICE VAULT</b><small data-i18n="lab.deviceVaultHelp">Identity, lifecycle, status</small></button>
      <button type="button" class="gn-foundation-tile" data-lab-focus="ledger"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-r"><svg><use href="#gn-timeline-node"></use></svg></span></span><b data-i18n="lab.eventLedger">EVENT LEDGER</b><small data-i18n="lab.eventLedgerHelp">Source-aware history</small></button>
    </div>
    <details class="gn-foundation-section" open id="gnResearchSection"><summary><span data-i18n="lab.researchPeptides">RESEARCH PEPTIDES</span><em data-i18n="research.organize">ORGANIZE · OBSERVE · REVIEW</em></summary>
      <div class="gn-research-notice gn-research-notice-compact"><button type="button" class="gn-research-info-toggle" aria-expanded="false" aria-controls="gnResearchNoticeBody" data-i18n-aria-label="research.noticeToggleAria"><span aria-hidden="true">?</span></button><strong data-i18n="research.noticeTitle">USER-ENTERED RESEARCH RECORDS</strong><span class="gn-research-notice-body" id="gnResearchNoticeBody" hidden data-i18n="research.noticeBody">Some compounds above have FDA-approved indications in specific clinical contexts. This organizer does not distinguish regulated from research use. All records are user-entered. Verify independently.</span></div>
      <div class="gn-research-library">${RESEARCH_LIBRARY.map(({ category, names, context }) => { const catKey = RESEARCH_CATEGORY_KEYS[category]; const ctxKey = context === 'RESEARCH-FOCUSED RECORDS · REGULATORY STATUS IS NOT VERIFIED HERE.' ? 'lab.researchKicker' : 'lab.mixedResearchContext'; return `<div class="gn-research-group"><span>${safeText(catKey ? tx(catKey, category) : category)}</span><small class="gn-research-context">${safeText(tx(ctxKey, context))}</small><div>${names.map(name => `<button type="button" data-research-name="${safeText(name)}" data-research-category="${safeText(catKey)}">${safeText(name)}</button>`).join('')}</div></div>`; }).join('')}<div class="gn-research-group gn-research-custom-group"><span data-i18n="lab.customEntry">CUSTOM ENTRY</span><small class="gn-research-context" data-i18n="lab.customEntryHelp">USER-ENTERED RECORD · REGULATORY STATUS IS NOT VERIFIED HERE.</small><div><button type="button" class="gn-research-custom-link" data-research-name="" data-research-category="lab.customResearch" data-i18n="research.customEntryLink">¿Necesitas un compuesto personalizado? → Crear entrada personalizada</button></div></div>
      <div class="gn-custom-warning" id="gnCustomWarning" data-i18n="research.customWarning">⚠ CUSTOM ENTRIES ARE NOT VERIFIED AGAINST THE LIBRARY. Verify the name and category independently.</div></div>
      <div class="gn-research-disclaimer" data-i18n="research.noticeBody">Some compounds above have FDA-approved indications in specific clinical contexts. This organizer does not distinguish regulated from research use. All records are user-entered. Verify independently.</div>
      <div class="gn-research-mode" id="gnResearchMode" data-mode="pick" style="display:none">
        <div class="gn-research-mode-chips"><span class="gn-research-chip" id="gnModeLibraryChip" data-i18n="research.modeLibrarySelected">BIBLIOTECA · SELECCIONADA</span><span class="gn-research-chip" id="gnModeCategoryChip" data-i18n="research.modeCategoryAssigned">CATEGORÍA · ASIGNADA</span></div>
        <div class="gn-research-mode-custom"><span class="gn-research-mode-title" data-i18n="research.modeCustomTitle">CREAR ENTRADA PERSONALIZADA</span><button type="button" class="gn-research-back" id="gnModeBack" onclick="researchBackToLibrary()" data-i18n="research.backToLibrary">← Volver a la biblioteca</button></div>
      </div>
      <form class="gn-record-form" id="gnResearchForm"><div class="gn-form-grid"><label><span data-i18n="research.recordName">RECORD NAME</span> <em data-research-badge class="gn-research-preset-badge"></em><input id="gnResearchName" required placeholder="Select a library entry or type a custom name" data-i18n-placeholder="research.recordNamePlaceholder"></label><label><span data-i18n="research.category">CATEGORY</span><input id="gnResearchCategory" placeholder="Research category" data-i18n-placeholder="research.categoryPlaceholder"></label><label><span data-i18n="research.date">DATE</span><input id="gnResearchDate" type="date"></label></div><div class="gn-form-grid"><label><span data-i18n="research.status">STATUS</span><select id="gnResearchState"><option value="TRACKING" data-i18n="research.tracking">TRACKING</option><option value="COMPLETED" data-i18n="research.completed">COMPLETED</option><option value="ARCHIVED" data-i18n="research.archived">ARCHIVED</option><option value="RESEARCH NOTE ONLY" data-i18n="research.noteOnly">RESEARCH NOTE ONLY</option></select></label></div><div class="gn-advanced-fields"><button type="button" class="gn-advanced-toggle" aria-expanded="false" aria-controls="gnAdvancedFields" data-i18n="research.advanced">ADVANCED</button><div class="gn-advanced-body" id="gnAdvancedFields" hidden><div class="gn-form-grid"><label><span data-i18n="research.source">SOURCE</span><input id="gnResearchSource" placeholder="User-entered source or note" data-i18n-placeholder="research.sourcePlaceholder"></label></div><label><span data-i18n="research.observations">OBSERVATIONS / NOTES</span><textarea id="gnResearchNotes" rows="3" placeholder="User-entered observations only" data-i18n-placeholder="research.observationsPlaceholder"></textarea></label></div></div><button class="btn-full btn-primary" type="submit" id="gnResearchSave" data-i18n="research.save">SAVE RESEARCH RECORD</button></form>
      <div class="gn-record-list" id="gnResearchList"></div>
    </details>
    <details class="gn-foundation-section" id="gnLedgerSection"><summary><span data-i18n="lab.ledgerTitle">SOURCE-AWARE EVENT LEDGER</span><em data-i18n="lab.noSilentRewrites">NO SILENT REWRITES</em></summary><div class="gn-ledger-copy" data-i18n="lab.ledgerCopy">Every important record keeps its origin and review state. Manual Entry, Import, Device Reported, and System Generated events remain distinguishable.</div><div class="gn-ledger-list" id="gnLedgerList"></div></details>
    <details class="gn-foundation-section" id="gnSupplySection"><summary><span data-i18n="lab.savedInventory">SAVED INVENTORY</span><em data-i18n="lab.separateCalculators">SEPARATE FROM CALCULATORS</em></summary><div class="gn-ledger-copy"><strong data-i18n="lab.calculatorEstimate">CALCULATOR / REFERENCE ESTIMATE</strong> <span data-i18n="lab.inventoryBoundary">remains educational math. Saved Inventory is user-entered supply records and does not verify product, storage, potency, or safety.</span></div><form class="gn-record-form" id="gnInventoryForm"><div class="gn-form-grid"><label><span data-i18n="lab.itemName">ITEM NAME</span><input id="gnInventoryName" required placeholder="e.g. cartridge A" data-i18n-placeholder="lab.itemNamePlaceholder"></label><label><span data-i18n="lab.itemType">ITEM TYPE</span><select id="gnInventoryType"><option value="VIAL" data-i18n="lab.typeVial">Vial</option><option value="CARTRIDGE" data-i18n="lab.typeCartridge">Cartridge</option><option value="DISPOSABLE_PEN" data-i18n="lab.typeDisposable">Disposable pen</option><option value="BOX_PACKAGE" data-i18n="lab.typeBox">Box or package</option><option value="SUPPLY" data-i18n="lab.typeSupply">General supply item</option><option value="CUSTOM" data-i18n="lab.typeCustom">Custom item</option></select></label><label><span data-i18n="lab.quantity">QUANTITY</span><input id="gnInventoryQuantity" type="number" min="0" step="any" placeholder="0"></label></div><div class="gn-form-grid"><label><span data-i18n="lab.units">UNITS</span><input id="gnInventoryUnits" placeholder="items, mL, boxes" data-i18n-placeholder="lab.unitsPlaceholder"></label><label><span data-i18n="lab.expiration">EXPIRATION / BUD</span><input id="gnInventoryExpiry" type="date"></label><label><span data-i18n="lab.storageLocation">STORAGE LOCATION</span><input id="gnInventoryLocation" placeholder="User-entered location" data-i18n-placeholder="lab.storagePlaceholder"></label></div><label><span data-i18n="lab.notes">NOTES</span><textarea id="gnInventoryNotes" rows="2" placeholder="User-entered supply notes" data-i18n-placeholder="lab.supplyNotesPlaceholder"></textarea></label><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-full btn-secondary" type="submit" style="flex:1 1 180px" id="gnInventorySave" data-i18n="lab.saveInventory">SAVE INVENTORY ITEM</button><button class="btn-full btn-secondary" type="button" id="gnInventoryExport" style="flex:0 1 170px" data-i18n="lab.exportInventory">EXPORT INVENTORY</button></div></form><div class="gn-record-list" id="gnInventoryList"></div></details>
  </section>`);
  $('gnResearchForm')?.addEventListener('submit', event => { event.preventDefault(); saveResearchRecord(); });
  // B12 (2026-08-08): compact research notice — "?" toggles the body.
  document.querySelectorAll('.gn-research-info-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const body = document.getElementById(toggle.getAttribute('aria-controls'));
      const open = !body.hidden;
      body.hidden = open;
      toggle.setAttribute('aria-expanded', String(!open));
    });
  });
  // B12 rev (2026-08-08): Advanced fields (FUENTE + OBSERVACIONES) collapse.
  // Button + hidden div, not <details> — Chromium breaks details content
  // layout when styled, so we drive it explicitly.
  document.querySelectorAll('.gn-advanced-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const body = document.getElementById(toggle.getAttribute('aria-controls'));
      const open = !body.hidden;
      body.hidden = open;
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.classList.toggle('open', !open);
    });
  });
  $('gnResearchList')?.addEventListener('click', handleResearchAction);
  const inventoryNotesLabel = $('gnInventoryNotes')?.closest('label');
  inventoryNotesLabel?.insertAdjacentHTML('beforebegin', `<div class="gn-form-grid"><label><span data-i18n="lab.concentration">CONCENTRATION</span><input id="gnInventoryConcentration" placeholder="User-entered label" data-i18n-placeholder="lab.userLabelPlaceholder"></label><label><span data-i18n="lab.volume">VOLUME</span><input id="gnInventoryVolume" placeholder="User-entered volume" data-i18n-placeholder="lab.userVolumePlaceholder"></label><label><span data-i18n="lab.acquiredDate">ACQUIRED DATE</span><input id="gnInventoryAcquired" type="date"></label></div><div class="gn-form-grid"><label><span data-i18n="research.source">SOURCE</span><input id="gnInventorySource" placeholder="User-entered source" data-i18n-placeholder="lab.userSourcePlaceholder"></label><label><span data-i18n="lab.linkedMedication">LINKED MEDICATION</span><input id="gnInventoryMedication" placeholder="e.g. Zepbound" data-i18n-placeholder="lab.medicationPlaceholder"></label><label style="display:flex;align-items:center;gap:8px;grid-template-columns:auto 1fr"><input id="gnInventoryAutoDeduct" type="checkbox" style="width:auto"><span data-i18n="lab.autoDeduct">AUTO-DEDUCT SHOTS</span> <small data-i18n="lab.autoDeductHelp">Requires quantity unit mg and a matching medication.</small></label></div>`);
  installCustomPickers(page);
  $('gnInventoryForm')?.addEventListener('submit', event => { event.preventDefault(); saveInventoryRecord(); });
  $('gnInventoryExport')?.addEventListener('click', exportInventory);
  $('gnInventoryList')?.addEventListener('click', handleInventoryAction);
  page.classList.add('gn-lab-launchpad-mode');
  const overlay = document.createElement('section');
  overlay.className = 'gn-lab-tool-overlay';
  overlay.id = 'gnLabToolOverlay';
  overlay.hidden = true;
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-labelledby', 'gnLabToolTitle');
  overlay.innerHTML = `<div class="gn-lab-tool-shell"><header class="gn-lab-tool-head"><button type="button" class="gn-lab-back" data-lab-back data-i18n="lab.back">${tx('lab.back', '← BACK TO LAB')}</button><div><div class="gn-foundation-kicker" data-i18n="lab.kicker">// LAB SYSTEM</div><h2 id="gnLabToolTitle">${tx('lab.chooseSystem', 'LAB > CHOOSE A SYSTEM')}</h2></div><span class="gn-foundation-signal" data-i18n="lab.localRecords">LOCAL RECORDS</span></header><div id="gnLabToolHost" class="gn-lab-tool-host"></div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-lab-back]')?.addEventListener('click', closeLabTool);
  qa('[data-lab-focus]').forEach(tile => tile.addEventListener('click', () => openLabTool(tile.dataset.labFocus)));
  renderLabFoundations();
}

function labSlot(node) {
  if (!node || moduleState.labOriginalSlots.has(node)) return;
  moduleState.labOriginalSlots.set(node, { parent: node.parentNode, next: node.nextSibling });
}

function restoreLabNodes() {
  [...moduleState.labOriginalSlots.entries()].reverse().forEach(([node, slot]) => {
    if (!slot.parent) return;
    if (slot.next?.parentNode === slot.parent) slot.parent.insertBefore(node, slot.next);
    else slot.parent.appendChild(node);
  });
  moduleState.labOriginalSlots.clear();
}

function openLabTool(tool) {
  ensureLabFoundations();
  ensureDoseProjection();
  ensureCalculatorInventoryActions();
  if (tool === 'devices') ensureProfileHub();
  const overlay = $('gnLabToolOverlay'), host = $('gnLabToolHost'), page = $('pageLab');
  if (!overlay || !host || !page) return;
  moduleState.labToolLauncher = document.activeElement?.closest?.('[data-lab-focus]') || document.querySelector(`[data-lab-focus="${tool}"]`);
  const toolNodes = {
    calculators: ['labSegTabs', 'labSeg-draw', 'labSeg-recon', 'labSeg-supply', 'gnDoseProjection'].map($),
    research: [$('gnResearchSection')],
    inventory: [$('gnSupplySection')],
    devices: [document.querySelector('.gn-device-vault')],
    ledger: [$('gnLedgerSection')]
  }[tool]?.filter(Boolean) || [];
  if (!toolNodes.length) return;
  restoreLabNodes();
  toolNodes.forEach(labSlot);
  // LAB focus: subdue the directory while the tool content is moved.
  page.classList.add('gn-tool-focus');
  toolNodes.forEach(node => host.appendChild(node));
  [$('gnResearchSection'), $('gnLedgerSection'), $('gnSupplySection')].forEach(section => { if (section) section.open = section.id === (tool === 'research' ? 'gnResearchSection' : tool === 'inventory' ? 'gnSupplySection' : 'gnLedgerSection'); });
  const titles = { calculators: tx('lab.calculators', 'CALCULATORS'), research: tx('lab.researchPeptides', 'RESEARCH PEPTIDES'), inventory: tx('lab.inventory', 'INVENTORY'), devices: tx('lab.deviceVault', 'DEVICE VAULT'), ledger: tx('lab.eventLedger', 'EVENT LEDGER') };
  setText('gnLabToolTitle', titles[tool] || 'LAB SYSTEM');
  qa('[data-lab-focus]').forEach(tile => tile.classList.toggle('active', tile.dataset.labFocus === tool));
  page.classList.add('gn-lab-tool-open');
  overlay.hidden = false;
  overlay.classList.add('active');
  document.body.classList.add('gn-lab-tool-open');
  if (tool === 'calculators') showLabSeg('draw', document.querySelector('[data-labseg="draw"]'));
  renderLabFoundations();
  if (tool === 'devices') renderDeviceVault();
  // Focus scroll position: the overlay is the scroll container. For a newly
  // opened tool, reset scrollTop to 0 after layout — the shell's layout already
  // places the first content block below the sticky header (gap >= 12px).
  // scrollIntoView is deliberately avoided here: it scrolls the container down
  // and lands the content behind the sticky header. (CSS scroll-padding-top on
  // .gn-lab-tool-overlay keeps later anchor jumps clear of the header.)
  requestAnimationFrame(function () {
    overlay.scrollTop = 0;
  });
  overlay.querySelector('[data-lab-back]')?.focus({ preventScroll: true });
}

function closeLabTool() {
  // Close the focused LAB tool view fully: hide the overlay, restore the DOM
  // nodes to their original slots, and release the focused-view state.
  const overlay = $('gnLabToolOverlay');
  const page = $('pageLab');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.hidden = true;
  }
  try { restoreLabNodes(); } catch (_) {}
  if (page) page.classList.remove('gn-tool-focus', 'gn-lab-tool-open');
  document.body?.classList.remove('gn-lab-tool-open');
  const launcher = moduleState.labToolLauncher;
  moduleState.labToolLauncher = null;
  if (launcher?.isConnected) window.setTimeout(() => launcher.focus({ preventScroll: true }), 0);
}

window.addEventListener('popstate', function (event) {
  // Browser Back while the LAB tool overlay is open -> close the tool view.
  const overlay = $('gnLabToolOverlay');
  // A nested picker/popover returning to the LAB layer must not also dismiss
  // the focused tool. The native shell owns that inner history entry first.
  if (overlay && event.state?.gnLayer === overlay.id) return;
  if (overlay && overlay.classList.contains('active')) {
    overlay.classList.remove('active');
    overlay.hidden = true;
    try { restoreLabNodes(); } catch (_) {}
    const page = $('pageLab');
    if (page) page.classList.remove('gn-tool-focus', 'gn-lab-tool-open');
    document.body?.classList.remove('gn-lab-tool-open');
    const launcher = moduleState.labToolLauncher;
    moduleState.labToolLauncher = null;
    if (launcher?.isConnected) window.setTimeout(() => launcher.focus({ preventScroll: true }), 0);
  }
});

function renderLabFoundations() {
  const list = $('gnResearchList');
  if (list) {
    const records = S.get('researchRecords', []);
    const localizedRecords = records.map(record => ({
      ...record,
      category: researchCategoryLabel(record.category),
      source: ['manual', 'Manual Entry', ''].includes(record.source || '') ? eventSourceText('manual') : record.source
    }));
    const active = localizedRecords.filter(record => !record.archived);
    const archived = localizedRecords.filter(record => record.archived);
    list.innerHTML = records.length ? `${active.slice().reverse().map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(record.category || tx('lab.customResearch', 'CUSTOM RESEARCH'))} · ${safeText(formatDate(record.date || record.createdAt))} · ${safeText(record.source || tx('research.manualEntry', 'Manual Entry'))}</small></div><span class="gn-record-state">${safeText(researchStateLabel(record.state))}</span><div style="display:flex;gap:4px"><button type="button" class="gn-record-delete" data-research-edit="${safeText(record.id)}" aria-label="${tx('lab.editResearch', 'Edit research record')}">✎</button><button type="button" class="gn-record-delete" data-research-archive="${safeText(record.id)}" aria-label="${tx('lab.archiveResearch', 'Archive research record')}">×</button></div></article>`).join('')}${archived.length ? `<div class="gn-ledger-copy" style="margin-top:10px">${tx("research.archivedHeading", "ARCHIVED RECORDS · Restore the record before editing.")}</div>${archived.slice().reverse().map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(record.category || tx('lab.customResearch', 'CUSTOM RESEARCH'))} · ${tx('research.archivedPrefix', 'Archived')} ${safeText(formatDate(record.modifiedAt || record.createdAt))}</small></div><span class="gn-record-state">${tx("research.archivedState", "ARCHIVED")}</span><button type="button" class="gn-record-delete gn-restore-edit" data-research-restore="${safeText(record.id)}" aria-label="${tx('lab.restoreResearch', 'Restore research record to edit')}">${tx("research.restoreToEdit", "RESTORE TO EDIT")}</button></article>`).join('')}` : ''}` : `<div class="gn-empty-state"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-lab-vessel"></use></svg></span><b>${tx("research.emptyTitle", "NO RESEARCH RECORDS YET")}</b><span>${tx("research.emptyBody", "Choose a library entry or create a custom record when you have something to preserve.")}</span></div>`;
  }
  const ledger = $('gnLedgerList');
  if (ledger) {
    const events = S.get('eventLedger', []).slice(-8).reverse();
    ledger.innerHTML = events.length ? events.map(event => `<div class="gn-ledger-row"><span class="gn-ledger-dot"></span><div><b>${safeText(eventLabelText(event.label || event.type))}</b><small>${safeText(formatDateTime(event.date || event.createdAt))}</small></div><em>${safeText(eventSourceText(event.source))} · ${safeText(eventStateText(event.state))}</em></div>`).join('') : `<div class="gn-empty-state"><b>${tx('lab.ledgerReady', 'LEDGER READY')}</b><span>${tx('lab.ledgerEmpty', 'New SHOTS and RESULTS events will appear here with their origin.')}</span></div>`;
  }
  renderInventory();
  syncCustomPickers($('pageLab') || document);
}

function renderInventory() {
  const list = $('gnInventoryList');
  if (!list) return;
  const records = S.get('inventory', []);
  const visible = records.filter(record => !record.archived);
  const archived = records.filter(record => record.archived);
  list.innerHTML = records.length ? `${visible.map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(inventoryTypeLabel(record.type))} · ${safeText(record.quantity ?? '—')} ${safeText(record.units || '')} · ${safeText(record.location || tx('lab.locationNotEntered', 'LOCATION NOT ENTERED'))}</small></div><span class="gn-record-state">${safeText(record.status === 'ARCHIVED' ? tx('research.archivedState', 'ARCHIVED') : tx('lab.active', 'ACTIVE'))}</span><div style="display:flex;gap:4px"><button type="button" class="gn-record-delete" data-inventory-edit="${safeText(record.id)}" aria-label="Edit inventory item" data-i18n-aria-label="lab.editInventoryAria">✎</button><button type="button" class="gn-record-delete" data-inventory-archive="${safeText(record.id)}" aria-label="Archive inventory item" data-i18n-aria-label="lab.archiveInventoryAria">×</button></div></article>`).join('')}${archived.length ? `<div class="gn-ledger-copy" style="margin-top:10px">${tx('research.archivedHeading', 'ARCHIVED RECORDS · Restore the record before editing.')}</div>${archived.map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(inventoryTypeLabel(record.type))} · ${tx('research.archivedPrefix', 'Archived')} ${safeText(formatDate(record.modifiedAt || record.createdAt))}</small></div><span class="gn-record-state">${tx('research.archivedState', 'ARCHIVED')}</span><button type="button" class="gn-record-delete gn-restore-edit" data-inventory-restore="${safeText(record.id)}" aria-label="Restore inventory item to edit" data-i18n-aria-label="lab.restoreInventoryAria">${tx('research.restoreToEdit', 'RESTORE TO EDIT')}</button></article>`).join('')}` : ''}` : `<div class="gn-empty-state"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-archive-core"></use></svg></span><b>${tx('lab.inventoryReady', 'SAVED INVENTORY READY')}</b><span>${tx('lab.inventoryEmpty', 'Record supplies separately from educational calculators when you want a persistent list.')}</span></div>`;
}

function saveInventoryRecord() {
  const name = $('gnInventoryName')?.value?.trim();
  if (!name) { actionFeedback(tx('inventory.notSaved', 'INVENTORY NOT SAVED'), tx('inventory.addName', 'ADD AN ITEM NAME BEFORE COMMITTING'), true); return; }
  const records = S.get('inventory', []);
  const now = new Date().toISOString();
  const id = moduleState.inventoryEditId || createId('inventory');
  const existing = records.find(record => record.id === id);
  const history = [...(existing?.history || []), { at: now, action: existing ? 'UPDATED' : 'CREATED', source: 'manual' }];
  const record = { id, name, type: normalizeInventoryType($('gnInventoryType')?.value), quantity: Number($('gnInventoryQuantity')?.value) || 0, units: $('gnInventoryUnits')?.value?.trim() || '', medication: $('gnInventoryMedication')?.value?.trim() || '', autoDeduct: Boolean($('gnInventoryAutoDeduct')?.checked), concentration: $('gnInventoryConcentration')?.value?.trim() || '', volume: $('gnInventoryVolume')?.value?.trim() || '', acquired: $('gnInventoryAcquired')?.value || '', expires: $('gnInventoryExpiry')?.value || '', inventorySource: $('gnInventorySource')?.value?.trim() || '', location: $('gnInventoryLocation')?.value?.trim() || '', notes: $('gnInventoryNotes')?.value?.trim() || '', status: existing?.status || 'ACTIVE', archived: existing?.archived || false, source: existing?.source || 'manual', state: existing?.state || 'confirmed', history, createdAt: existing?.createdAt || now, modifiedAt: now };
  const index = records.findIndex(item => item.id === id);
  if (index >= 0) records[index] = record; else records.push(record);
  S.set('inventory', records); appendEventLedger({ type: 'INVENTORY', recordId: record.id, label: existing ? 'INVENTORY UPDATED' : 'INVENTORY ITEM SAVED' }); queueCloudSync('workspace');
  moduleState.inventoryEditId = null; $('gnInventoryForm')?.reset(); setText('gnInventorySave', 'SAVE INVENTORY ITEM'); renderInventory(); actionFeedback(existing ? tx('inventory.updated', 'INVENTORY UPDATED') : tx('inventory.saved', 'INVENTORY SAVED'), tx('inventory.timelineUpdated', 'SAVED INVENTORY // TIMELINE UPDATED'));
}

function handleInventoryAction(event) {
  const button = event.target.closest('button[data-inventory-edit],button[data-inventory-archive],button[data-inventory-restore]');
  if (!button) return;
  const id = button.dataset.inventoryEdit || button.dataset.inventoryArchive || button.dataset.inventoryRestore;
  const records = S.get('inventory', []);
  const record = records.find(item => item.id === id);
  if (!record) return;
  if (button.dataset.inventoryEdit) {
    moduleState.inventoryEditId = id;
    $('gnInventoryName').value = record.name || ''; $('gnInventoryType').value = normalizeInventoryType(record.type); $('gnInventoryQuantity').value = record.quantity || ''; $('gnInventoryUnits').value = record.units || ''; $('gnInventoryMedication').value = record.medication || ''; $('gnInventoryAutoDeduct').checked = Boolean(record.autoDeduct); $('gnInventoryConcentration').value = record.concentration || ''; $('gnInventoryVolume').value = record.volume || ''; $('gnInventoryAcquired').value = record.acquired || ''; $('gnInventoryExpiry').value = record.expires || ''; $('gnInventorySource').value = record.inventorySource || ''; $('gnInventoryLocation').value = record.location || ''; $('gnInventoryNotes').value = record.notes || ''; setText('gnInventorySave', tx('lab.updateInventory', 'UPDATE INVENTORY ITEM')); syncCustomPicker($('gnInventoryType')); syncCustomDate($('gnInventoryAcquired')); syncCustomDate($('gnInventoryExpiry')); $('gnInventoryForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
  }
  if (button.dataset.inventoryArchive) { record.archived = true; record.status = 'ARCHIVED'; record.modifiedAt = new Date().toISOString(); record.history = [...(record.history || []), { at: record.modifiedAt, action: 'ARCHIVED', source: 'manual' }]; actionFeedback(tx('inventory.archived', 'INVENTORY ARCHIVED'), tx('inventory.historyPreserved', 'HISTORY PRESERVED // RECORD REMAINS RECOVERABLE')); }
  else { record.archived = false; record.status = 'ACTIVE'; record.modifiedAt = new Date().toISOString(); record.history = [...(record.history || []), { at: record.modifiedAt, action: 'RESTORED', source: 'manual' }]; actionFeedback(tx('inventory.restored', 'INVENTORY RESTORED'), tx('inventory.timelineUpdated', 'SAVED INVENTORY // TIMELINE UPDATED')); }
  S.set('inventory', records); appendEventLedger({ type: 'INVENTORY', recordId: record.id, label: record.archived ? 'INVENTORY ARCHIVED' : 'INVENTORY RESTORED' }); queueCloudSync('workspace'); renderInventory();
}

function exportInventory() {
  downloadFile('gridnode-inventory.json', JSON.stringify({ app: 'GRID//NODE', exportedAt: new Date().toISOString(), inventory: S.get('inventory', []) }, null, 2), 'application/json');
  actionFeedback(tx('inventory.exportReady', 'INVENTORY EXPORT READY'), tx('inventory.recordsPrepared', 'USER-CONTROLLED RECORDS PREPARED'));
}

function saveResearchRecord() {
  const name = $('gnResearchName')?.value?.trim();
  if (!name) { actionFeedback(tx('research.notSaved', 'RESEARCH RECORD NOT SAVED'), tx('research.addName', 'ADD A NAME BEFORE COMMITTING'), true); return; }
  const records = S.get('researchRecords', []), now = new Date().toISOString(), id = moduleState.researchEditId || createId('research'), existing = records.find(item => item.id === id);
  const categoryInput = $('gnResearchCategory');
  const shotDate = $('gnResearchDate')?.value?.trim();
  if (!shotDate) { actionFeedback(tx('research.notSaved', 'RESEARCH RECORD NOT SAVED'), tx('research.addDate', 'SELECT A DATE BEFORE COMMITTING'), true); return; }
  const record = { id, name, category: normalizeResearchCategory(categoryInput?.dataset.categoryId || categoryInput?.value), date: shotDate, notes: $('gnResearchNotes')?.value?.trim() || '', source: $('gnResearchSource')?.value?.trim() || existing?.source || 'manual', state: $('gnResearchState')?.value || existing?.state || 'TRACKING', archived: existing?.archived || false, createdAt: existing?.createdAt || now, modifiedAt: now };
  const index = records.findIndex(item => item.id === id);
  if (index >= 0) records[index] = record; else records.push(record);
  S.set('researchRecords', records); appendEventLedger({ type: 'RESEARCH', recordId: record.id, date: record.date, label: existing ? 'RESEARCH RECORD UPDATED' : 'RESEARCH RECORD CAPTURED' });
  queueCloudSync('workspace'); moduleState.researchEditId = null; $('gnResearchForm')?.reset(); if ($('gnResearchName')) { $('gnResearchName').readOnly = false; $('gnResearchName').removeAttribute('data-research-locked'); $('gnResearchName')?.setAttribute('placeholder', tx('research.recordNamePlaceholder', 'Select a library entry or type a custom name')); } const sb = $('gnResearchForm')?.querySelector('[data-research-badge]'); if (sb) sb.textContent = ''; setText('gnResearchSave', tx('research.save', 'SAVE RESEARCH RECORD')); const sr = $('gnResearchSave'); if (sr) sr.textContent = tx('research.save', 'SAVE RESEARCH RECORD'); const rm = $('gnResearchMode'); if (rm) { rm.style.display = 'none'; rm.dataset.mode = 'pick'; } const rcat = $('gnResearchCategory'); if (rcat) { rcat.readOnly = false; rcat.removeAttribute('data-category-locked'); } renderLabFoundations(); actionFeedback(existing ? tx('research.updated', 'RESEARCH RECORD UPDATED') : tx('research.captured', 'RESEARCH RECORD CAPTURED'), tx('research.timelineSignal', 'TIMELINE UPDATED // USER-ENTERED ONLY'));
}

function handleResearchAction(event) {
  const button = event.target.closest('button[data-research-edit],button[data-research-archive],button[data-research-restore]');
  if (!button) return;
  const id = button.dataset.researchEdit || button.dataset.researchArchive || button.dataset.researchRestore;
  const records = S.get('researchRecords', []), record = records.find(item => item.id === id);
  if (!record) return;
  if (button.dataset.researchEdit) {
    moduleState.researchEditId = id; $('gnResearchName').value = record.name || ''; const isLibraryName = Boolean(record.name) && RESEARCH_LIBRARY.some(g => g.names.includes(record.name)); if (isLibraryName) { const em = $('gnResearchMode'); if (em) { em.style.display = ''; em.dataset.mode = 'library'; } const emc = $('gnModeLibraryChip'); if (emc) { emc.style.display = ''; emc.textContent = tx('research.modeLibrarySelected', 'BIBLIOTECA · SELECCIONADA') + ' ' + tx('research.lockGlyph', '🔒'); } const ecc = $('gnModeCategoryChip'); if (ecc) { ecc.style.display = ''; ecc.textContent = tx('research.modeCategoryAssigned', 'CATEGORÍA · ASIGNADA') + ' ' + tx('research.lockGlyph', '🔒'); } const ecb = $('gnModeBack'); if (ecb) ecb.style.display = 'none'; const ect = document.querySelector('.gn-research-mode-custom .gn-research-mode-title'); if (ect) ect.style.display = 'none'; const ecw = $('gnCustomWarning'); if (ecw) ecw.style.display = 'none'; } else { researchEnterCustomMode(); const ec2 = $('gnResearchMode'); if (ec2) ec2.style.display = ''; } $('gnResearchName').readOnly = isLibraryName; if (isLibraryName) $('gnResearchName').setAttribute('data-research-locked', '1'); else $('gnResearchName').removeAttribute('data-research-locked'); const editBadgeHost = $('gnResearchForm')?.querySelector('[data-research-badge]'); if (editBadgeHost) editBadgeHost.textContent = isLibraryName ? tx('research.presetBadge', 'PRESET') : ''; $('gnResearchName')?.setAttribute('placeholder', isLibraryName ? tx('research.presetLockedPlaceholder', 'Library entry — name is locked') : tx('research.recordNamePlaceholder', 'Select a library entry or type a custom name')); $('gnResearchCategory').dataset.categoryId = normalizeResearchCategory(record.category); $('gnResearchCategory').value = researchCategoryLabel(record.category); $('gnResearchDate').value = record.date || ''; $('gnResearchState').value = record.state || 'TRACKING'; $('gnResearchSource').value = (record.source && record.source !== 'manual') ? record.source : ''; $('gnResearchNotes').value = record.notes || ''; setText('gnResearchSave', tx('research.update', 'UPDATE RESEARCH RECORD')); syncCustomPicker($('gnResearchState')); syncCustomDate($('gnResearchDate')); $('gnResearchForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
  }
  record.archived = Boolean(button.dataset.researchArchive); record.state = record.archived ? 'ARCHIVED' : (record.state === 'ARCHIVED' ? 'TRACKING' : record.state); record.modifiedAt = new Date().toISOString(); S.set('researchRecords', records); appendEventLedger({ type: 'RESEARCH', recordId: record.id, label: record.archived ? 'RESEARCH RECORD ARCHIVED' : 'RESEARCH RECORD RESTORED' }); queueCloudSync('workspace'); renderLabFoundations(); actionFeedback(record.archived ? tx('research.archived', 'RESEARCH RECORD ARCHIVED') : tx('research.restored', 'RESEARCH RECORD RESTORED'), tx('inventory.historyPreserved', 'HISTORY PRESERVED // TIMELINE UPDATED'));
}

function deleteResearchRecord(id) {
  S.set('researchRecords', S.get('researchRecords', []).filter(record => record.id !== id)); queueCloudSync('workspace'); renderLabFoundations(); actionFeedback(tx('research.removed', 'RESEARCH RECORD REMOVED'), tx('research.localUpdated', 'LOCAL RECORD UPDATED'));
}

function closeProfileHub() {
  const prev = localStorage.getItem('gn_last_active_page_v1') || 'Dash';
  showPage(prev === 'Profile' ? 'Dash' : prev, document.getElementById('navPro'));
}

function toggleProfileHub() {
  const active = document.querySelector('.page.active')?.id;
  if (active === 'pageProfile') { closeProfileHub(); return; }
  showPage('Profile', document.getElementById('navPro'));
}

function ensureProfileHub() {
  const page = $('pageProfile');
  if (!page || page.querySelector('[data-gn-profile-hub]')) return;
  const avatar = $('profAvaWrap');
  const hero = avatar?.closest('[style*="background:#0e0e16"]');
  if (!hero) return;
  hero.insertAdjacentHTML('afterend', `<section class="gn-profile-hub" data-gn-profile-hub aria-labelledby="gnProfileHubTitle">
    <div class="gn-foundation-head"><div><div class="gn-foundation-kicker" data-i18n="vault.kicker">// NODE PROFILE HUB</div><h2 id="gnProfileHubTitle" data-i18n="vault.hubTitle">YOUR NODE</h2></div><span class="gn-foundation-actions"><span class="gn-foundation-signal" id="gnProfileSync">LOCAL MODE</span><button type="button" class="gn-hub-close" id="gnHubClose" onclick="closeProfileHub()" aria-label="CERRAR" data-i18n-aria-label="vault.closeHub">✕</button></span></div>
    <div class="gn-profile-sections">
      <section class="gn-profile-section"><div class="gn-profile-section-label" data-i18n="vault.node">// YOUR NODE</div><div class="gn-profile-row"><span><b data-i18n="vault.medicationLabel">Medication</b><small id="gnProfileMedication">Not entered</small></span><span class="gn-profile-chevron">›</span></div><div class="gn-profile-row"><span><b data-i18n="vault.bodyMetrics">Body Metrics</b><small id="gnProfileBody">Not entered</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row" onclick="openSystemUpdate()"><span><b data-i18n="vault.whatsNew">What's New</b><small data-gn-whatsnew-version></small></span><span class="gn-profile-chevron">›</span></button></section>
      <section class="gn-profile-section"><div class="gn-profile-section-label" data-i18n="vault.yourData">// YOUR DATA</div><button type="button" class="gn-profile-row" onclick="exportCSV()"><span><b data-i18n="vault.exportCsv">Export CSV</b><small data-i18n="vault.exportCsvHelp">Download readable records</small></span><span class="gn-profile-chevron">›</span></button><button type="button" class="gn-profile-row" onclick="exportBackup()"><span><b data-i18n="vault.exportBackup">Export Backup</b><small data-i18n="vault.exportBackupHelp">Save a complete local copy</small></span><span class="gn-profile-chevron">›</span></button><div class="gn-profile-row"><span><b data-i18n="vault.dataOwnership">Data Ownership</b><small data-i18n="vault.dataOwnershipHelp">Export or delete anytime</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row gn-profile-danger-row" onclick="openDeleteLocalData()"><span><b data-i18n="vault.deleteAllData">Delete All Local Data</b><small data-i18n="vault.deleteAllDataHelp">Remove this device record</small></span><span class="gn-profile-chevron">›</span></button></section>
      <section class="gn-profile-section"><div class="gn-profile-section-label" data-i18n="vault.tools">// TOOLS</div><button type="button" class="gn-profile-row" onclick="document.querySelector('.gn-device-vault')?.scrollIntoView({behavior:'smooth',block:'start'})"><span><b data-i18n="vault.deviceVaultLink">Device Vault</b><small data-i18n="vault.deviceVaultLinkHelp">Private identity registry</small></span><span class="gn-profile-chevron">›</span></button><div class="gn-profile-row"><span><b data-i18n="vault.connectedAccount">Connected Account</b><small id="gnProfileAccount">Local device session</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row gn-profile-danger-row" onclick="openDeleteCloudAccount()"><span><b data-i18n="vault.deleteCloudAccount">Delete Cloud Account</b><small data-i18n="vault.deleteCloudAccountHelp">Requires server deletion control</small></span><span class="gn-profile-chevron">›</span></button><div class="gn-profile-row"><span><b data-i18n="vault.appVersion">App Version</b><small id="gnProfileVersion">0.12.0</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row" onclick="window.location.reload()"><span><b data-i18n="vault.reloadApp">Reload App</b><small data-i18n="vault.reloadAppHelp">Refresh the current build</small></span><span class="gn-profile-chevron">›</span></button></section>
    </div>
    <button type="button" class="gn-profile-signout" onclick="openSignOutModal()"><span><b data-i18n="vault.signOut">SIGN OUT</b><small data-i18n="vault.localOnlyFooter">Your data stays on this device.</small></span><span class="gn-profile-chevron">›</span></button>
    <div class="gn-device-vault"><div class="gn-device-vault-head"><div><div class="gn-foundation-kicker" data-i18n="vault.deviceVaultKicker">// DEVICE VAULT</div><h3 data-i18n="vault.deviceVaultSubhead">PHYSICAL OBJECT IDENTITY</h3></div><span class="gn-record-state" data-i18n="vault.deviceVaultPrivate">PRIVATE REGISTRY</span></div><p class="gn-ledger-copy" data-i18n="vault.deviceVaultPhilosophy">The device is not the cartridge. The cartridge is not the dose. The dose is not the plan. Device identity, inventory, SHOT events, and LOADOUT remain separate records.</p><form class="gn-record-form" id="gnDeviceForm"><div class="gn-form-grid"><label><span data-i18n="vault.deviceName">DEVICE NAME</span><input id="gnDeviceName" required placeholder="e.g. Home pen A" data-i18n-placeholder="vault.deviceNamePlaceholder"></label><label><span data-i18n="vault.deviceType">DEVICE TYPE</span><select id="gnDeviceType"><option value="REUSABLE" data-i18n="vault.deviceTypeReusable">Reusable pen</option><option value="DISPOSABLE" data-i18n="vault.deviceTypeDisposable">Disposable pen</option><option value="AUTOINJECTOR" data-i18n="vault.deviceTypeAutoinjector">Autoinjector</option><option value="OTHER" data-i18n="vault.deviceTypeOther">Other device</option></select></label><label><span data-i18n="vault.deviceStatus">STATUS</span><select id="gnDeviceStatus">${DEVICE_STATUSES.map(status => { const key = 'vault.status' + status.replace(/\s+/g, ''); return `<option value="${status}" data-i18n="${key}">${tx(key, status)}</option>`; }).join('')}</select></label></div><label><span data-i18n="vault.deviceLabelNotes">LABEL / NOTES</span><textarea id="gnDeviceNotes" rows="2" placeholder="User-entered identity notes" data-i18n-placeholder="vault.deviceNotesPlaceholder"></textarea></label><button class="btn-full btn-secondary" type="submit" data-i18n="vault.deviceRegister">REGISTER DEVICE IDENTITY</button></form><div class="gn-device-list" id="gnDeviceList"></div></div>
  </section>`);
  installCustomPickers(hero.parentElement || page);
  window.GN_I18N?.applyTo?.(page);
  const updateVersion = hero.parentElement?.querySelector('[data-system-update-version]');
  if (updateVersion) updateVersion.textContent = APP_VERSION;
  const updateCopy = hero.parentElement?.querySelector('#gnSystemUpdateCard p');
  if (updateCopy) updateCopy.textContent = tx('vault.systemUpdateNotes', `${APP_VERSION} — LAB tools now open in focused views, the Phase Engine adds neutral cycle context, and the LIVE NODE status is compact on mobile and desktop.`).replace(/^v[^ ]+/, APP_VERSION);
  const whatsNewVersion = document.querySelector('[data-gn-whatsnew-version]') || hero.parentElement?.querySelector('.gn-profile-section:first-of-type button small');
  if (whatsNewVersion) whatsNewVersion.textContent = `v${APP_VERSION}`;
  const deviceVault = hero.parentElement?.querySelector('.gn-device-vault');
  const deviceKicker = deviceVault?.querySelector('.gn-foundation-kicker');
  const deviceSignal = deviceVault?.querySelector('.gn-record-state');
  if (deviceKicker) deviceKicker.textContent = tx('vault.deviceVaultKicker', '// DEVICE VAULT');
  if (deviceSignal) deviceSignal.textContent = tx('vault.deviceVaultPrivate', 'PRIVATE REGISTRY');
  $('gnSystemUpdateDismiss')?.addEventListener('click', dismissSystemUpdate);
  document.querySelector('[data-system-update-open]')?.addEventListener('click', openSystemUpdate);
  $('gnDeviceForm')?.addEventListener('submit', event => { event.preventDefault(); saveDeviceRecord(); });
  $('gnDeviceList')?.addEventListener('click', handleDeviceAction);
  renderDeviceVault();
  ensurePasskeySection();
}

function renderDeviceVault() {
  const list = $('gnDeviceList');
  if (!list) return;
  const devices = S.get('devices', []);
  const active = devices.filter(device => !device.archived), archived = devices.filter(device => device.archived);
  list.innerHTML = devices.length ? `${active.slice().reverse().map(device => `<article class="gn-record-row"><div><b>${safeText(device.name)}</b><small>${safeText(deviceTypeLabel(device.type))} · ${tx('vault.privateId', 'PRIVATE ID')} ${safeText(device.qrIdentity || tx('vault.devicePending', 'PENDING'))}</small></div><span class="gn-record-state">${safeText(deviceStatusLabel(device.status))}</span><div style="display:flex;gap:4px"><button type="button" class="gn-record-delete" data-device-edit="${safeText(device.id)}" aria-label="${tx('vault.editDevice', 'Edit device')}">✎</button><button type="button" class="gn-record-delete" data-device-retire="${safeText(device.id)}" aria-label="${tx('vault.retireDevice', 'Retire device')}">×</button></div></article>`).join('')}${archived.length ? `<div class="gn-ledger-copy" style="margin-top:10px">${tx('vault.deviceArchived', 'RETIRED / ARCHIVED DEVICES')}</div>${archived.slice().reverse().map(device => `<article class="gn-record-row"><div><b>${safeText(device.name)}</b><small>${safeText(deviceTypeLabel(device.type))} · ${tx('vault.privateIdentityPreserved', 'Private identity preserved')}</small></div><span class="gn-record-state">${safeText(deviceStatusLabel(device.status || 'RETIRED'))}</span><button type="button" class="gn-record-delete" data-device-restore="${safeText(device.id)}" aria-label="${tx('vault.restoreDevice', 'Restore device')}">↺</button></article>`).join('')}` : ''}` : `<div class="gn-empty-state"><span class="gn-icon gn-icon-md gn-accent-y"><svg><use href="#gn-vault-core"></use></svg></span><b>${tx('vault.deviceReadyEmpty', 'DEVICE VAULT READY')}</b><span>${tx('vault.deviceReadyEmptyHelp', 'Register a physical object when you want its identity and lifecycle preserved.')}</span></div>`;
}

function saveDeviceRecord() {
  const name = $('gnDeviceName')?.value?.trim();
  if (!name) { actionFeedback(tx('device.notRegistered', 'DEVICE NOT REGISTERED'), tx('device.addName', 'ADD A DEVICE NAME BEFORE COMMITTING'), true); return; }
  const devices = S.get('devices', []), now = new Date().toISOString(), id = moduleState.deviceEditId || createId('device'), existing = devices.find(item => item.id === id);
  const device = { ...(existing || {}), id, name, type: normalizeDeviceType($('gnDeviceType')?.value), status: $('gnDeviceStatus')?.value || 'NEEDS CHECKING', notes: $('gnDeviceNotes')?.value?.trim() || '', qrIdentity: existing?.qrIdentity || `GN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, source: existing?.source || 'manual', state: existing?.state || 'confirmed', archived: existing?.archived || false, createdAt: existing?.createdAt || now, modifiedAt: now };
  const index = devices.findIndex(item => item.id === id); if (index >= 0) devices[index] = device; else devices.push(device);
  S.set('devices', devices); appendEventLedger({ type: 'DEVICE', recordId: device.id, label: existing ? 'DEVICE IDENTITY UPDATED' : 'DEVICE IDENTITY REGISTERED' }); queueCloudSync('workspace'); moduleState.deviceEditId = null; $('gnDeviceForm')?.reset(); renderDeviceVault(); actionFeedback(existing ? 'DEVICE IDENTITY UPDATED' : 'DEVICE IDENTITY REGISTERED', 'DEVICE VAULT UPDATED // HISTORY PRESERVED');
}

function handleDeviceAction(event) {
  const button = event.target.closest('button[data-device-edit],button[data-device-retire],button[data-device-restore]');
  if (!button) return;
  const id = button.dataset.deviceEdit || button.dataset.deviceRetire || button.dataset.deviceRestore;
  const devices = S.get('devices', []), device = devices.find(item => item.id === id);
  if (!device) return;
  if (button.dataset.deviceEdit) { moduleState.deviceEditId = id; $('gnDeviceName').value = device.name || ''; $('gnDeviceType').value = normalizeDeviceType(device.type); $('gnDeviceStatus').value = device.status || 'NEEDS CHECKING'; $('gnDeviceNotes').value = device.notes || ''; const submit = document.querySelector('#gnDeviceForm button[type="submit"]'); if (submit) submit.textContent = tx('vault.updateDevice', 'UPDATE DEVICE IDENTITY'); syncCustomPicker($('gnDeviceType')); syncCustomPicker($('gnDeviceStatus')); $('gnDeviceForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  device.archived = Boolean(button.dataset.deviceRetire); device.status = device.archived ? 'RETIRED' : 'READY'; device.modifiedAt = new Date().toISOString(); S.set('devices', devices); appendEventLedger({ type: 'DEVICE', recordId: id, label: device.archived ? 'DEVICE RETIRED' : 'DEVICE RESTORED' }); queueCloudSync('workspace'); renderDeviceVault(); actionFeedback(device.archived ? 'DEVICE RETIRED' : 'DEVICE RESTORED', 'HARDWARE HISTORY PRESERVED // TIMELINE UPDATED');
}

function ensureDoseProjection() {
  const page = $('pageLab');
  if (!page || $('gnDoseProjection')) return;
  page.insertAdjacentHTML('beforeend', `<section class="gn-dose-projection" id="gnDoseProjection" aria-labelledby="gnDoseProjectionTitle"><div class="gn-foundation-kicker" data-i18n="vault.educationalRefKicker">// EDUCATIONAL REFERENCE</div><h2 id="gnDoseProjectionTitle" data-i18n="vault.educationalRefTitle">DOSE PROJECTION</h2><p class="gn-dose-copy" data-i18n="vault.educationalRefCopy">Map a user-entered dose progression as a text timeline. This stores no protocol and makes no recommendation.</p><div class="gn-dose-grid"><label><span data-i18n="vault.currentDose">CURRENT DOSE (mg)</span><input id="gnDoseCurrent" type="number" min="0" step="0.1" inputmode="decimal" oninput="updateDoseProjection()"></label><label><span data-i18n="vault.stepIncrease">STEP INCREASE (mg)</span><input id="gnDoseStep" type="number" min="0" step="0.1" inputmode="decimal" oninput="updateDoseProjection()"></label><label><span data-i18n="vault.stepInterval">STEP INTERVAL (weeks)</span><input id="gnDoseInterval" type="number" min="1" step="1" inputmode="numeric" oninput="updateDoseProjection()"></label><label><span data-i18n="vault.targetDose">TARGET DOSE (mg)</span><input id="gnDoseTarget" type="number" min="0" step="0.1" inputmode="decimal" oninput="updateDoseProjection()"></label></div><div class="gn-dose-output" id="gnDoseOutput" data-i18n="vault.educationalRefAllValues">Enter all four values to view a text reference timeline.</div><div class="gn-dose-disclaimer"><strong data-i18n="vault.educationalRefOnly">EDUCATIONAL REFERENCE ONLY.</strong> <span data-i18n="vault.educationalRefDisclaimer">This is not a dosing recommendation. Titration schedules vary by individual protocol. Verify with prescribing guidance.</span></div></section>`);
  const profile = getProfile();
  if ($('gnDoseCurrent') && profile.dose) $('gnDoseCurrent').value = profile.dose;
  if ($('gnDoseInterval')) $('gnDoseInterval').value = 4;
}

function updateDoseProjection() {
  const output = $('gnDoseOutput');
  if (!output) return;
  const current = Number($('gnDoseCurrent')?.value), step = Number($('gnDoseStep')?.value), interval = Number($('gnDoseInterval')?.value), target = Number($('gnDoseTarget')?.value);
  if (![current, step, interval, target].every(value => Number.isFinite(value)) || current < 0 || step <= 0 || interval < 1 || !Number.isInteger(interval) || target < current) {
    output.textContent = tx('vault.educationalRefInvalid', 'Enter a current dose, positive step, interval, and target at or above the current dose.');
    return;
  }
  const stepCount = Math.ceil((target - current) / step);
  if (stepCount > 99) {
    output.textContent = tx('vault.educationalRefTooManySteps', 'This range creates too many steps to display. Increase the step or lower the target.');
    return;
  }
  const segments = [];
  let dose = current, startWeek = 1, guard = 0;
  while (guard++ < 100) {
    const endWeek = dose < target ? startWeek + interval - 1 : null;
    segments.push(`${endWeek ? `WEEK ${startWeek}-${endWeek}` : `WEEK ${startWeek}+`}: ${dose.toFixed(1)} mg`);
    if (dose >= target) break;
    dose = Math.min(target, dose + step);
    startWeek += interval;
  }
  output.textContent = segments.join('  →  ');
}

function ensureCalculatorInventoryActions() {
  [['labSeg-draw', 'draw'], ['labSeg-recon', 'recon'], ['labSeg-supply', 'supply']].forEach(([id, type]) => {
    const segment = $(id);
    if (!segment || segment.querySelector('[data-save-calculator]')) return;
    segment.insertAdjacentHTML('beforeend', `<button type="button" class="btn-full btn-secondary" data-save-calculator="${type}" onclick="saveCalculatorReference('${type}')" data-i18n="vault.saveReference">SAVE REFERENCE TO INVENTORY</button>`);
  });
}

function saveCalculatorReference(type) {
  const snapshots = {
    draw: { name: 'Draw calculator reference', notes: $('syrFormula')?.textContent || '' },
    recon: { name: 'Mix calculator reference', notes: $('reconOut')?.textContent || '' },
    supply: { name: 'Supply calculator reference', notes: $('supOut')?.textContent || '' }
  };
  const snapshot = snapshots[type];
  const output = { draw: $('syrFormula'), recon: $('reconOut'), supply: $('supOut') }[type];
  if (!snapshot?.notes || output?.dataset.valid !== 'true') { actionFeedback(tx('lab.referenceNotSaved', 'REFERENCE NOT SAVED'), tx('lab.enterValidFirst', 'ENTER VALID CALCULATOR VALUES FIRST'), true); return; }
  const records = S.get('inventory', []), now = new Date().toISOString();
  records.push({ id: createId('inventory'), name: snapshot.name, type: 'Calculator reference', quantity: 0, units: '', medication: '', autoDeduct: false, notes: snapshot.notes, status: 'REFERENCE', archived: false, source: 'System Generated', state: 'User Confirmed', history: [{ at: now, action: 'CALCULATOR REFERENCE SAVED', source: 'System Generated' }], createdAt: now, modifiedAt: now });
  S.set('inventory', records); appendEventLedger({ type: 'INVENTORY', recordId: records.at(-1).id, label: 'CALCULATOR REFERENCE SAVED' }); queueCloudSync('workspace'); renderInventory(); actionFeedback(tx('lab.referenceSaved', 'REFERENCE SAVED'), tx('lab.referenceSavedDetail', 'INVENTORY UPDATED // EDUCATIONAL MATH ONLY'));
}

function renderLab() { ensureLabFoundations(); ensureDoseProjection(); ensureCalculatorInventoryActions(); updateSyr(); updateRecon(); updateSupply(); updateDoseProjection(); renderLabFoundations(); window.GN_I18N?.applyTo?.(document.getElementById('pageLab')); }
function positiveNumberField(id, label, maximum) {
  const raw = String($(id)?.value ?? '').trim();
  if (!raw) return { valid: false, message: tx('lab.requiredField', 'ENTER VALID VALUES · {label} IS REQUIRED', { label }) };
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > maximum) return { valid: false, message: tx('lab.invalidField', 'INVALID INPUT · CHECK {label}', { label }) };
  return { valid: true, value };
}
function updateSyr() {
  setText('syrUnits', '—'); setText('syrText', tx('lab.enterValidValues', 'ENTER VALID VALUES')); setText('syrML', '— mL'); setText('syrConcDisplay', '— mg/mL'); setText('syrResultLine', '—'); setText('syrVolResult', '— mL'); setDisplay('syrTarget', false);
  $('syrFormula')?.setAttribute('data-valid', 'false');
  const doseField = positiveNumberField('cDose', tx('lab.userAmount', 'USER-ENTERED AMOUNT'), 1000), concentrationField = positiveNumberField('cConc', tx('lab.concentration', 'CONCENTRATION'), 10000);
  if (!doseField.valid || !concentrationField.valid) { setText('syrFormula', !doseField.valid ? doseField.message : concentrationField.message); return; }
  const dose = doseField.value, concentration = concentrationField.value;
  const volume = dose / concentration, units = volume * 100;
  if (!Number.isFinite(volume) || !Number.isFinite(units) || volume > 1000 || units > 100000) { setText('syrFormula', tx('lab.outOfRange', 'INVALID INPUT · CALCULATED RESULT IS OUTSIDE THE SUPPORTED RANGE')); return; }
  setText('syrUnits', `${units.toFixed(1)}u`); setText('syrText', tx('lab.drawToUnit', 'DRAW TO THE {units} UNIT LINE', { units: units.toFixed(1) })); setText('syrML', `${volume.toFixed(3)} mL`); setText('syrConcDisplay', `${concentration} mg/mL`); setText('syrResultLine', `${dose} mg`); setText('syrVolResult', `${volume.toFixed(3)} mL`); setText('syrFormula', `${dose} mg ÷ ${concentration} mg/mL = ${volume.toFixed(3)} mL = ${units.toFixed(1)} U-100 units. ${tx('lab.educationalMathOnly', 'Educational math only.')}`); $('syrFormula')?.setAttribute('data-valid', 'true'); setDisplay('syrTarget', true);
  const target = $('syrTarget'); if (target) target.style.left = `${Math.min(100, Math.max(0, units))}%`;
}
function updateRecon() {
  setDisplay('reconRes', true); setText('bacAmt', '— mL');
  $('reconOut')?.setAttribute('data-valid', 'false');
  const vialField = positiveNumberField('rVial', tx('lab.totalAmount', 'TOTAL AMOUNT'), 10000), concField = positiveNumberField('rConc', tx('lab.targetConcentration', 'TARGET CONCENTRATION'), 10000);
  if (!vialField.valid || !concField.valid) { setText('reconOut', !vialField.valid ? vialField.message : concField.message); return; }
  const volume = vialField.value / concField.value;
  if (!Number.isFinite(volume) || volume > 10000) { setText('reconOut', tx('lab.outOfRange', 'INVALID INPUT · CALCULATED RESULT IS OUTSIDE THE SUPPORTED RANGE')); return; }
  setText('reconOut', `Reference math: ${vialField.value} mg ÷ ${concField.value} mg/mL = ${volume.toFixed(3)} mL total reference volume.`); $('reconOut')?.setAttribute('data-valid', 'true'); setText('bacAmt', `${volume.toFixed(3)} mL`);
}
function updateSupply() {
  setDisplay('supRes', true);
  $('supOut')?.setAttribute('data-valid', 'false');
  const volumeField = positiveNumberField('sVol', tx('lab.volume', 'VOLUME'), 10000), concField = positiveNumberField('sConc', tx('lab.concentration', 'CONCENTRATION'), 10000), weeklyField = positiveNumberField('sDose2', tx('lab.weeklyAmount', 'WEEKLY AMOUNT'), 1000);
  const invalid = [volumeField, concField, weeklyField].find(field => !field.valid);
  if (invalid) { setText('supOut', invalid.message); return; }
  const total = volumeField.value * concField.value, coverage = total / weeklyField.value;
  if (!Number.isFinite(total) || !Number.isFinite(coverage) || coverage > 100000) { setText('supOut', tx('lab.outOfRange', 'INVALID INPUT · CALCULATED RESULT IS OUTSIDE THE SUPPORTED RANGE')); return; }
  setText('supOut', tx('lab.referenceTotal', 'Reference total: {total} mg · User-entered weekly amount: {weekly} mg · Approximate record coverage: {coverage} weeks. Educational record keeping only.', { total: total.toFixed(2), weekly: weeklyField.value.toFixed(2), coverage: coverage.toFixed(1) })); $('supOut')?.setAttribute('data-valid', 'true');
}

const MEASUREMENT_TYPES = [
  ['waist', 'WAIST CIRCUMFERENCE', 'vault.waist'],
  ['hip', 'HIP CIRCUMFERENCE', 'vault.hip'],
  ['chest', 'CHEST CIRCUMFERENCE', 'vault.chest'],
  ['left_arm', 'LEFT ARM CIRCUMFERENCE', 'vault.leftArm'],
  ['right_arm', 'RIGHT ARM CIRCUMFERENCE', 'vault.rightArm'],
  ['left_thigh', 'LEFT THIGH CIRCUMFERENCE', 'vault.leftThigh'],
  ['right_thigh', 'RIGHT THIGH CIRCUMFERENCE', 'vault.rightThigh']
];

function measurementUnit() {
  return S.get('preferences', {}).measurementUnit === 'cm' ? 'cm' : 'in';
}

function convertMeasurement(value, from, to) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (from === to) return numeric;
  return from === 'in' && to === 'cm' ? numeric * 2.54 : numeric / 2.54;
}

function latestMeasurement(type) {
  return S.get('measurements', []).filter(record => record.type === type).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))[0] || null;
}

function ensureProfileMeasurements() {
  const page = $('pageProfile');
  if (!page || $('gnMeasurementsCard')) return;
  const bodyInput = $('profHtFt');
  const bodyCard = bodyInput?.closest('div[style*="background:#0e0e16"]');
  if (!bodyCard) return;
  bodyCard.insertAdjacentHTML('afterend', `<section class="gn-measurements-card" id="gnMeasurementsCard" aria-labelledby="gnMeasurementsTitle">
    <div class="gn-foundation-kicker" data-i18n="vault.measurementsKicker">// BODY METRICS</div>
    <h3 id="gnMeasurementsTitle" data-i18n="vault.measurementsTitle">WEIGHT + MEASUREMENTS</h3>
    <p class="gn-measurements-copy" data-i18n="vault.measurementsCopy">Use this profile section as the single entry point for weight and user-entered body measurements.</p>
    <button type="button" class="btn-full btn-primary" onclick="openWeightModal()" style="margin-bottom:10px" data-i18n="dashboard.logWeight">LOG WEIGHT</button>
    <form id="gnMeasurementsForm" class="gn-measurements-form">
      <div class="gn-measurements-tools"><label><span data-i18n="vault.measurementUnit">UNIT</span><select id="gnMeasurementUnit" onchange="setMeasurementUnit(this.value)"><option value="in" data-i18n="vault.inches">INCHES</option><option value="cm" data-i18n="vault.centimeters">CENTIMETERS</option></select></label><label><span data-i18n="vault.measurementDate">DATE</span><input id="gnMeasurementDate" type="date"></label></div>
      <div class="gn-measurements-grid">${MEASUREMENT_TYPES.map(([type, label, key]) => `<label><span><b data-i18n="${key}">${label}</b><small id="gnMeasurementLatest_${type}" data-i18n="vault.noRecord">NO RECORD</small></span><input type="number" min="0" step="0.1" inputmode="decimal" data-measurement-type="${type}" aria-label="${tx(key, label)}"></label>`).join('')}</div>
      <button type="submit" class="btn-full btn-secondary" data-i18n="vault.saveMeasurements">SAVE MEASUREMENTS</button>
    </form>
    <div class="gn-measurements-empty" id="gnMeasurementsEmpty">No measurements logged yet.</div>
  </section>`);
  window.GN_I18N?.applyTo?.($('gnMeasurementsCard'));
  $('gnMeasurementsForm')?.addEventListener('submit', event => { event.preventDefault(); saveMeasurements(); });
  installCustomPickers(page);
}

function renderMeasurements() {
  const card = $('gnMeasurementsCard');
  if (!card) return;
  const unit = measurementUnit();
  const unitSelect = $('gnMeasurementUnit');
  if (unitSelect) unitSelect.value = unit;
  syncCustomPickers(card);
  const dateInput = $('gnMeasurementDate');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();
  const records = S.get('measurements', []);
  MEASUREMENT_TYPES.forEach(([type]) => {
    const latest = latestMeasurement(type);
    const converted = latest ? convertMeasurement(latest.value, latest.unit || 'in', unit) : null;
    const latestText = latest && converted !== null ? `${converted.toFixed(1)} ${unit} · ${formatDate(latest.date || latest.createdAt)}` : tx('vault.noRecord', 'NO RECORD');
    setText(`gnMeasurementLatest_${type}`, latestText);
    const field = card.querySelector(`[data-measurement-type="${type}"]`);
    if (field && document.activeElement !== field) field.value = converted === null ? '' : converted.toFixed(1);
  });
  setDisplay('gnMeasurementsEmpty', !records.length);
}

function setMeasurementUnit(unit) {
  const preferences = S.get('preferences', {});
  preferences.measurementUnit = unit === 'cm' ? 'cm' : 'in';
  S.set('preferences', preferences);
  renderMeasurements();
}

function saveMeasurements() {
  const unit = measurementUnit();
  const date = $('gnMeasurementDate')?.value || todayISO();
  const records = S.get('measurements', []);
  let saved = 0;
  MEASUREMENT_TYPES.forEach(([type]) => {
    const field = document.querySelector(`[data-measurement-type="${type}"]`);
    const value = Number(field?.value);
    if (!field?.value || !Number.isFinite(value) || value <= 0) return;
    records.push({ id: createId('measurement'), type, value, unit, date, createdAt: new Date().toISOString() });
    saved += 1;
  });
  if (!saved) { actionFeedback(tx('vault.noMeasurementsSaved', 'NO MEASUREMENTS SAVED'), tx('vault.enterPositiveValue', 'ENTER AT LEAST ONE POSITIVE VALUE'), true); return; }
  S.set('measurements', records);
  const preferences = S.get('preferences', {}); preferences.measurementUnit = unit; S.set('preferences', preferences);
  queueCloudSync('workspace');
  renderMeasurements();
  renderResults();
  actionFeedback(tx('vault.measurementsSaved', 'MEASUREMENTS SAVED'), tx('vault.measurementsSavedDetail', '{count} USER-ENTERED VALUE{plural} // TIMELINE UPDATED', { count: saved, plural: saved === 1 ? '' : 'S' }));
}

function ensureDestructiveDialogs() {
  if ($('gnDeleteLocalOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="gn-delete-overlay" id="gnDeleteLocalOverlay" role="dialog" aria-modal="true" aria-labelledby="gnDeleteLocalTitle"><div class="gn-delete-panel"><div class="gn-delete-kicker" data-i18n="deleteLocal.kicker">// VAULT CONTROL</div><h2 id="gnDeleteLocalTitle" data-i18n="deleteLocal.title">DELETE ALL LOCAL DATA?</h2><p data-i18n="deleteLocal.body">This removes all shots, weights, peptides, devices, and settings from this device. Cloud records will be restored on next sign-in. This action cannot be undone.</p><label><span data-i18n="deleteLocal.typeConfirm">TYPE DELETE TO CONFIRM</span><input id="gnDeleteLocalInput" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" oninput="updateDeleteLocalButton(this.value)"></label><div class="gn-delete-actions"><button type="button" class="btn-full btn-secondary" onclick="closeDeleteLocalData()" data-i18n="deleteLocal.cancel">CANCEL</button><button type="button" class="btn-full gn-delete-confirm" id="gnDeleteLocalConfirm" disabled onclick="confirmDeleteLocalData()" data-i18n="deleteLocal.confirm">DELETE LOCAL DATA</button></div></div></div><div class="gn-delete-overlay" id="gnDeleteCloudOverlay" role="dialog" aria-modal="true" aria-labelledby="gnDeleteCloudTitle"><div class="gn-delete-panel"><div class="gn-delete-kicker" data-i18n="deleteCloud.kicker">// CLOUD ACCOUNT CONTROL</div><h2 id="gnDeleteCloudTitle" data-i18n="deleteCloud.title">DELETE CLOUD ACCOUNT?</h2><p data-i18n="deleteCloud.body">This permanently removes all synced records from cloud storage. Local data on this device is not affected. You will be signed out.</p><p class="gn-delete-note" data-i18n="deleteCloud.note">A secure server request verifies the signed-in account before deletion. The browser never receives the server key.</p><div class="gn-delete-actions"><button type="button" class="btn-full btn-secondary" onclick="closeDeleteCloudAccount()" data-i18n="deleteCloud.cancel">CANCEL</button><button type="button" class="btn-full gn-delete-confirm" onclick="confirmDeleteCloudAccount()" data-i18n="deleteCloud.confirm">DELETE CLOUD ACCOUNT</button></div></div></div>`);
    window.GN_I18N?.applyTo?.(document.getElementById('gnDeleteLocalOverlay'));
    window.GN_I18N?.applyTo?.(document.getElementById('gnDeleteCloudOverlay'));
}

function clearLocalGridNodeData() {
  Object.keys(localStorage).filter(key => key.startsWith('gn_')).forEach(key => localStorage.removeItem(key));
}

function openDeleteLocalData() { ensureDestructiveDialogs(); const input = $('gnDeleteLocalInput'); if (input) input.value = ''; $('gnDeleteLocalConfirm')?.setAttribute('disabled', ''); $('gnDeleteLocalOverlay')?.classList.add('active'); setTimeout(() => input?.focus(), 0); }
function closeDeleteLocalData() { $('gnDeleteLocalOverlay')?.classList.remove('active'); }
function updateDeleteLocalButton(value) { const confirm = $('gnDeleteLocalConfirm'); if (confirm) confirm.disabled = String(value || '').trim().toUpperCase() !== 'DELETE'; }
async function confirmDeleteLocalData() {
  if (String($('gnDeleteLocalInput')?.value || '').trim().toUpperCase() !== 'DELETE') return;
  await signOutCloud();
  clearLocalGridNodeData();
  clearSession();
  window.location.reload();
}
function openDeleteCloudAccount() { ensureDestructiveDialogs(); $('gnDeleteCloudOverlay')?.classList.add('active'); }
function closeDeleteCloudAccount() { $('gnDeleteCloudOverlay')?.classList.remove('active'); }
async function confirmDeleteCloudAccount() {
  const result = await deleteCloudAccount();
  closeDeleteCloudAccount();
  if (!result?.ok) { actionFeedback(tx('auth.accountNotDeleted', 'CLOUD ACCOUNT NOT DELETED'), tx('auth.deletionFailed', 'ACCOUNT DELETION FAILED // LOCAL DATA UNCHANGED'), true); return; }
  clearLocalGridNodeData();
  await signOutCloud();
  clearSession();
  window.location.reload();
}

function renderProfile() {
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
}

function dismissSystemUpdate() {
  const settings = S.get('settings', {});
  settings.systemUpdateDismissed = APP_VERSION;
  S.set('settings', settings);
  const card = $('gnSystemUpdateCard');
  if (card) card.hidden = true;
}

function openSystemUpdate() {
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

function exportCSV() {
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

function exportBackup() {
  const backup = { app: 'GRID//NODE', version: APP_VERSION, exportedAt: new Date().toISOString(), profile: getProfile(), shots: getAllShots(), weights: getWeights(), measurements: S.get('measurements', []), results: S.get('results', []), notes: S.get('notes', []), symptoms: S.get('symptoms', []), labs: S.get('labs', []), preferences: S.get('preferences', {}), settings: S.get('settings', {}), arsenal: S.get('arsenal', []), researchRecords: S.get('researchRecords', []), devices: S.get('devices', []), inventory: S.get('inventory', []), loadouts: S.get('loadouts', []), eventLedger: S.get('eventLedger', []), selectedLocation: S.get('selectedLocation', ''), importQueue: S.get('importQueue', []), cloudDeletes: S.get('cloudDeletes', []), workspaces: S.get('workspaces', {}) };
  downloadFile('gridnode-backup.json', JSON.stringify(backup, null, 2), 'application/json');
  showToast(tx('vault.backupReady', 'VAULT backup prepared.'));
}

function rawCSVRows(text) {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseLine = line => { const cells = []; let value = '', quoted = false; for (let index = 0; index < line.length; index++) { const char = line[index]; if (char === '"' && line[index + 1] === '"') { value += '"'; index++; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { cells.push(value.trim()); value = ''; } else value += char; } cells.push(value.trim()); return cells; };
  return { headers: parseLine(lines[0]).map(value => value.trim()), rows: lines.slice(1).map(parseLine) };
}

function normalizedImportHeader(value) { return String(value || '').toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim(); }
function importColumn(headers, names) { return headers.findIndex(header => names.includes(normalizedImportHeader(header))); }
function importCell(headers, cells, names) { const index = importColumn(headers, names); return index < 0 ? '' : String(cells[index] || '').trim(); }
function parseImportedMedication(value) { const match = String(value || '').trim().match(/^(.*?)(?:\s+([0-9]+(?:\.[0-9]+)?)\s*mg)?$/i); return { medication: (match?.[1] || '').trim(), dose_mg: match?.[2] ? Number(match[2]) : null }; }
function importSideEffects(headers, cells, excluded) { return headers.map((header, index) => ({ header, value: String(cells[index] || '').trim() })).filter(item => !excluded.has(normalizedImportHeader(item.header)) && item.value && !/^(no|none|false|0)$/i.test(item.value)).map(item => /^(yes|true)$/i.test(item.value) ? item.header : `${item.header}: ${item.value}`); }
function genericCSVFromRows(rows) { const headers = ['record_type', 'date', 'medication', 'dose_mg', 'location', 'weight_lb', 'side_effects', 'notes', 'archived']; return [headers, ...rows.map(row => [row.record_type, row.date, row.medication || '', row.dose_mg ?? '', row.location || '', row.weight_lb ?? '', (row.side_effects || []).join('|'), row.notes || '', 'false'])].map(row => row.map(csvCell).join(',')).join('\n'); }
function mergeImportRecords(existing, incoming) { const current = Array.isArray(existing) ? existing : []; const added = Array.isArray(incoming) ? incoming : []; const ids = new Set(current.map(record => record?.id || JSON.stringify(record))); return [...current, ...added.filter(record => { const id = record?.id || JSON.stringify(record); if (ids.has(id)) return false; ids.add(id); return true; })]; }

// GLAPP column names are inferred from the available reference structure until a real export sample is supplied.
function prepareCSVImport(text) {
  const raw = rawCSVRows(text); const headers = raw.headers.map(normalizedImportHeader); const has = value => headers.includes(value);
  const isShotsy = has('shot') && has('site') && has('shot notes');
  const isGlapp = has('weight lbs') || has('injection site') || has('dose mg');
  if (!isShotsy && !isGlapp) return { format: 'Generic CSV', source: 'CSV Import', rows: parseCSV(text) };
  const normalized = raw.rows.map(cells => {
    if (isShotsy) {
      const shotValue = importCell(raw.headers, cells, ['shot']); const parsed = parseImportedMedication(shotValue); const weightValue = importCell(raw.headers, cells, ['recorded weight lbs', 'weight lbs']);
      const excluded = new Set(['shot', 'site', 'shot notes', 'recorded weight lbs', 'weight lbs', 'date', 'shot date', 'recorded date']);
      return { record_type: shotValue ? 'shot' : 'weight', date: importCell(raw.headers, cells, ['date', 'shot date', 'recorded date', 'timestamp']), medication: parsed.medication, dose_mg: parsed.dose_mg, location: importCell(raw.headers, cells, ['site']), weight_lb: weightValue ? Number(weightValue) : null, side_effects: importSideEffects(raw.headers, cells, excluded), notes: importCell(raw.headers, cells, ['shot notes']) };
    }
    const date = importCell(raw.headers, cells, ['date', 'recorded date', 'timestamp']); const time = importCell(raw.headers, cells, ['time', 'recorded time']); const parsed = parseImportedMedication(importCell(raw.headers, cells, ['medication', 'shot'])); const sideEffects = importCell(raw.headers, cells, ['side effects', 'sideeffects']);
    const explicitDose = importCell(raw.headers, cells, ['dose mg', 'dose']); const dose = explicitDose ? Number(explicitDose) : parsed.dose_mg; const weight = Number(importCell(raw.headers, cells, ['weight lbs', 'weight', 'recorded weight lbs'])) || null;
    return { record_type: parsed.medication && Number.isFinite(dose) && dose > 0 ? 'shot' : 'weight', date: time && date ? `${date} ${time}` : date, medication: parsed.medication, dose_mg: dose, location: importCell(raw.headers, cells, ['injection site', 'site']), weight_lb: weight, side_effects: sideEffects ? sideEffects.split(/[|;]/).map(value => value.trim()).filter(Boolean) : [], notes: importCell(raw.headers, cells, ['notes', 'shot notes']) };
  });
  const format = isShotsy ? 'Shotsy Export' : 'GLAPP Export'; const source = isShotsy ? 'csv_import_shotsy' : 'csv_import_glapp';
  return { format, source, rows: parseCSV(genericCSVFromRows(normalized)).map(row => ({ ...row, source })) };
}

function handleCSVImportFile(event) {
  const file = event.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const prepared = prepareCSVImport(String(reader.result || ''));
    const classified = classifyCSVRows(prepared.rows, getAllShots(), getWeights());
    moduleState.pendingImport = classified.rows;
    moduleState.pendingImportMeta = { fileName: file.name, format: prepared.format, source: prepared.source, ...classified.counts };
    const counts = classified.counts;
    setText('csvImportTitle', `${prepared.format.toUpperCase()} IMPORT PREVIEW`);
    setText('csvImportFormat', `DETECTED FORMAT // ${prepared.format}`);
    setText('csvImportSummary', `${counts.recognized} recognized · ${counts.duplicates} duplicates · ${counts.newRecords} new · ${counts.invalid} invalid. ${counts.invalid ? 'Invalid rows will not be saved.' : 'Review before saving.'}`);
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
  document.body.insertAdjacentHTML('beforeend', `<div class="gn-import-overlay" id="gnImportOverlay" role="dialog" aria-modal="true" aria-labelledby="gnImportTitle"><div class="gn-import-panel"><div class="gn-import-title" id="gnImportTitle" data-i18n="import.title">IMPORT DATA</div><p data-i18n="import.copy">Choose a source. GRID//NODE will detect the file format and show a review before commit.</p><label><span data-i18n="import.fromApp">FROM ANOTHER APP</span><select id="gnImportSource"><option data-i18n="import.shotsy">Shotsy</option><option data-i18n="import.glapp">GLAPP</option><option data-i18n="import.genericCsv">Generic CSV</option></select></label><label class="gn-import-file"><span data-i18n="import.fromCsv">FROM CSV FILE</span><input type="file" id="gnUnifiedCsvInput" accept=".csv,text/csv"></label><label class="gn-import-file"><span data-i18n="import.fromBackup">FROM GRID//NODE BACKUP</span><input type="file" id="gnBackupInput" accept=".json,application/json"></label><button type="button" class="gn-import-close" onclick="closeImportDialog()" data-i18n="import.cancel">CANCEL</button></div></div>`);
    window.GN_I18N?.applyTo?.(document.getElementById('gnImportOverlay'));
  $('gnUnifiedCsvInput')?.addEventListener('change', handleUnifiedCsvSelection);
  $('gnBackupInput')?.addEventListener('change', handleBackupImportFile);
}
function openImportDialog() { ensureImportDialog(); $('gnImportOverlay')?.classList.add('active'); }
function closeImportDialog() { $('gnImportOverlay')?.classList.remove('active'); }
function handleUnifiedCsvSelection(event) { closeImportDialog(); handleCSVImportFile(event); }
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
function handleBackupImportFile(event) {
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
function confirmBackupImport() {
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
function cancelCSVImport() { moduleState.pendingImport = null; moduleState.pendingImportMeta = null; moduleState.pendingBackup = null; const confirm = $('csvImportConfirmBtn'); if (confirm) { confirm.setAttribute('onclick', 'confirmCSVImport()'); confirm.textContent = tx('backup.importButton', 'IMPORT TO SHOTS HISTORY'); } setText('csvImportTitle', tx('backup.csvPreviewTitle', 'CSV IMPORT PREVIEW')); setText('csvImportFormat', tx('backup.csvReviewCopy', 'Review detected user-entered protocol records before appending them to SHOTS HISTORY.')); $('csvImportOverlay')?.classList.remove('active'); }
function confirmCSVImport() {
  const pending = moduleState.pendingImport || [];
  const rechecked = classifyCSVRows(pending.map(item => item.row || item), getAllShots(), getWeights());
  const additions = rechecked.rows.filter(item => item.status === 'new').map(item => item.row);
  if (!additions.length) { actionFeedback(tx('backup.noNewRecords', 'NO NEW RECORDS'), tx('backup.historyUnchanged', 'EXISTING HISTORY WAS NOT CHANGED')); cancelCSVImport(); return; }
  const beforeShots = getAllShots(), beforeWeights = getWeights();
  const shots = [...beforeShots], weights = [...beforeWeights];
  const importedAt = new Date().toISOString();
  additions.forEach(row => {
    const provenance = { importedAt, fileName: moduleState.pendingImportMeta?.fileName || 'CSV file' };
    if (row.record_type === 'weight') {
      if (!weights.some(weight => csvWeightKey(weight) === csvWeightKey(row))) weights.push({ id: createId('weight'), date: row.date, weight: row.weight_lb, notes: row.notes || null, source: moduleState.pendingImportMeta?.source || 'csv', state: 'review', importProvenance: provenance });
    } else {
      const shotId = createId('shot');
      shots.push({ id: shotId, date: row.date, med: normalizeMedicationId(row.medication), dose: row.dose_mg, site: row.location || '', wt: row.weight_lb || null, se: row.side_effects, notes: row.notes || null, archived: row.archived, createdAt: importedAt, source: moduleState.pendingImportMeta?.source || 'csv', state: 'review', importProvenance: provenance });
      if (Number.isFinite(row.weight_lb) && row.weight_lb > 0 && !weights.some(weight => csvWeightKey(weight) === csvWeightKey(row))) weights.push({ id: createId('weight'), shotId, date: row.date, weight: row.weight_lb, notes: 'Logged with SHOT', source: moduleState.pendingImportMeta?.source || 'csv', state: 'review', importProvenance: provenance });
    }
  });
  if (!S.multiWrite([{ key: 'shots', value: shots }, { key: 'weights', value: weights }])) {
    actionFeedback(tx('backup.importRolledBack', 'IMPORT ROLLED BACK'), tx('backup.storageRejectedTransaction', 'LOCAL STORAGE DID NOT ACCEPT THE COMPLETE TRANSACTION'), true);
    return;
  }
  appendEventLedger({ type: 'IMPORT', label: 'CSV IMPORT SAVED', source: moduleState.pendingImportMeta?.source || 'CSV Import', state: 'Needs Review', recordCount: additions.length });
  queueCloudSync('workspace');
  const count = additions.length; cancelCSVImport(); refreshAll(); actionFeedback(tx('backup.importSaved', 'IMPORT SAVED'), tx('backup.importSavedDetail', '{count} NEW RECORD{plural} // REVIEW STATE PRESERVED', { count, plural: count === 1 ? '' : 'S' }));
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean); if (lines.length < 2) return [];
  const parseLine = line => { const cells = []; let value = '', quoted = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i++; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { cells.push(value); value = ''; } else value += char; } cells.push(value); return cells; };
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

function previewCSVImportForTesting(text, shots = [], weights = []) {
  return classifyCSVRows(parseCSV(text), shots, weights);
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
function updateMeridiemButtons() { $('sTimeAM')?.classList.toggle('active', moduleState.meridiem === 'AM'); $('sTimePM')?.classList.toggle('active', moduleState.meridiem === 'PM'); }
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
function gnSelectPickerDate(date) { moduleState.shotPickerSelected = normalizeDateInput(date) || todayISO(); setHumanDateInput($('sDate'), moduleState.shotPickerSelected); renderShotDatePicker(); }
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
function updatePills() { const med = normalizeMedicationId(selectState.cpShotMed?.val); const dose = Number(getProfile().dose); const container = $('dosePills'); if (!container) return; const values = dose ? [dose] : [0.5, 1, 2.5, 5, 7.5, 10]; container.innerHTML = values.map(value => `<button type="button" class="dose-pill" data-dose="${value}">${value} mg</button>`).join(''); setText('profMedTxt', med ? `// ${medicationLabel(med).toUpperCase()}` : tx('profile.noMedicationSet', '// NO MEDICATION SET')); }
function selPill(button, dose) { if ($('sDose')) $('sDose').value = dose; qa('.dose-pill').forEach(item => item.classList.toggle('active', item === button)); }

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
  initScannerAudioControl();
  document.addEventListener('click', event => {
    const zone = event.target.closest('[data-stable-zone]');
    if (zone) selectScannerLocation(zone.dataset.stableZone, { source: 'fallback', gestureToken: gnScannerAudioGesture.fromEvent(event) });
    const historyButton = event.target.closest('[data-shot-history-view]');
    if (historyButton) setShotHistoryView(historyButton.dataset.shotHistoryView);
    const shotAction = event.target.closest('[data-shot-action]');
    if (shotAction) { const action = shotAction.dataset.shotAction, id = shotAction.dataset.shotId; if (action === 'edit') editShot(id); if (action === 'archive') openArchiveConfirm(id); if (action === 'restore') restoreArchivedShot(id); if (action === 'restore-edit') restoreArchivedShotToEdit(id); }
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
  document.querySelector('.gn-shot-advanced-trigger')?.addEventListener('click', event => { const button = event.currentTarget, body = $(button.dataset.collapseTarget); const open = body?.classList.toggle('gn-hidden') === false; button.setAttribute('aria-expanded', String(open)); });
  setTodayDefaults();
  renderScanner();
}


/* v0.15.19 - install pointer handlers on first user interaction with scanner */
document.addEventListener("DOMContentLoaded", () => { installScannerPointerHandlers(); installScannerDebugMode(); });
window.addEventListener("load", () => { installScannerPointerHandlers(); installScannerDebugMode(); });

window.GNModules=Object.freeze({selectState:selectState,moduleState:moduleState,refreshNodeHeader:refreshNodeHeader,showScreen:showScreen,showPage:showPage,refreshAll:refreshAll,getProfile:getProfile,getProfileForEvidence:getProfileForEvidence,loadApp:loadApp,computeTotalChange:computeTotalChange,saveProfileMed:saveProfileMed,saveProfileMetrics:saveProfileMetrics,calcAndShowBMI:calcAndShowBMI,toggleSelect:toggleSelect,selectOpt:selectOpt,showPhasesModal:showPhasesModal,closePhases:closePhases,renderShots:renderShots,setShotHistoryView:setShotHistoryView,setScannerMode:setScannerMode,setScannerSkinTone:setScannerSkinTone,scannerSkinTone:scannerSkinTone,selectScannerLocation:selectScannerLocation,renderScanner:renderScanner,openLogModal:openLogModal,closeLog:closeLog,editShot:editShot,openArchiveConfirm:openArchiveConfirm,cancelArchiveShot:cancelArchiveShot,confirmArchiveShot:confirmArchiveShot,restoreArchivedShot:restoreArchivedShot,openPermanentDeleteConfirm:openPermanentDeleteConfirm,cancelPermanentDeleteShot:cancelPermanentDeleteShot,confirmPermanentDeleteShot:confirmPermanentDeleteShot,saveShot:saveShot,openFutureTimestampConfirm:openFutureTimestampConfirm,closeFutureTimestampConfirm:closeFutureTimestampConfirm,cancelFutureTimestampSave:cancelFutureTimestampSave,confirmFutureTimestampSave:confirmFutureTimestampSave,handleShotFab:handleShotFab,goToScannerForLocationFromLog:goToScannerForLocationFromLog,openWeightModal:openWeightModal,closeWt:closeWt,setWeightUnit:setWeightUnit,saveWt:saveWt,renderResults:renderResults,setRange:setRange,setWtRange:setWtRange,showLabSeg:showLabSeg,showYouSeg:showYouSeg,openLabTool:openLabTool,closeLabTool:closeLabTool,exportInventory:exportInventory,updateDoseProjection:updateDoseProjection,saveCalculatorReference:saveCalculatorReference,renderLab:renderLab,updateSyr:updateSyr,updateRecon:updateRecon,updateSupply:updateSupply,setMeasurementUnit:setMeasurementUnit,saveMeasurements:saveMeasurements,openDeleteLocalData:openDeleteLocalData,closeDeleteLocalData:closeDeleteLocalData,updateDeleteLocalButton:updateDeleteLocalButton,confirmDeleteLocalData:confirmDeleteLocalData,openDeleteCloudAccount:openDeleteCloudAccount,closeDeleteCloudAccount:closeDeleteCloudAccount,confirmDeleteCloudAccount:confirmDeleteCloudAccount,renderProfile:renderProfile,dismissSystemUpdate:dismissSystemUpdate,openSystemUpdate:openSystemUpdate,exportCSV:exportCSV,exportBackup:exportBackup,prepareCSVImport:prepareCSVImport,handleCSVImportFile:handleCSVImportFile,openImportDialog:openImportDialog,closeImportDialog:closeImportDialog,handleUnifiedCsvSelection:handleUnifiedCsvSelection,handleBackupImportFile:handleBackupImportFile,confirmBackupImport:confirmBackupImport,cancelCSVImport:cancelCSVImport,confirmCSVImport:confirmCSVImport,previewCSVImportForTesting:previewCSVImportForTesting,renderCalendar:renderCalendar,calPrev:calPrev,calNext:calNext,calDayClick:calDayClick,openArsenalMod:openArsenalMod,closeArs:closeArs,saveArs:saveArs,requestLoadoutRemove:requestLoadoutRemove,cancelLoadoutRemove:cancelLoadoutRemove,confirmLoadoutRemove:confirmLoadoutRemove,formatTime24:formatTime24,formatTime12:formatTime12,gnSetShotMeridiem:gnSetShotMeridiem,gnShotClockLiveFormat:gnShotClockLiveFormat,gnNormalizeShotClockField:gnNormalizeShotClockField,gnWeightDateInput:gnWeightDateInput,gnWeightTimeInput:gnWeightTimeInput,gnOpenShotDatePicker:gnOpenShotDatePicker,gnCloseShotDatePicker:gnCloseShotDatePicker,gnDatePickerMove:gnDatePickerMove,gnSelectPickerDate:gnSelectPickerDate,gnSetShotDateFromPicker:gnSetShotDateFromPicker,gnSetShotDateValue:gnSetShotDateValue,gnSetShotTimeValue:gnSetShotTimeValue,gnMedRevealGroup:gnMedRevealGroup,updatePills:updatePills,selPill:selPill,initModules:initModules});

const modules=window.GNModules;

/* GRID//NODE stable app bootstrap
 * Auth UI, boot sequence, compatibility bridge for existing inline controls.
 */

let bootRunning = false;
let authMode = 'signin';
let passwordRecoveryActive = false;
let googleIdentityPromise = null;
let googleIdentityInitialized = false;

function bridge() {
  const names = [
    'showScreen', 'showPage', 'refreshAll', 'loadApp', 'showPhasesModal', 'closePhases',
    'openLogModal', 'closeLog', 'saveShot', 'editShot', 'handleShotFab',
    'openArchiveConfirm', 'cancelArchiveShot', 'confirmArchiveShot', 'restoreArchivedShot',
    'openPermanentDeleteConfirm', 'cancelPermanentDeleteShot', 'confirmPermanentDeleteShot',
    'openFutureTimestampConfirm', 'closeFutureTimestampConfirm', 'cancelFutureTimestampSave',
    'confirmFutureTimestampSave', 'goToScannerForLocationFromLog', 'setScannerMode',
    'selectScannerLocation', 'renderScanner', 'openWeightModal', 'closeWt', 'saveWt',
    'setWeightUnit', 'setRange', 'setWtRange', 'showLabSeg', 'showYouSeg', 'toggleSelect',
    'selectOpt', 'saveProfileMed', 'saveProfileMetrics', 'calcAndShowBMI', 'updatePills',
    'selPill', 'gnMedRevealGroup', 'gnSetShotMeridiem', 'gnShotClockLiveFormat',
    'gnNormalizeShotClockField', 'gnWeightDateInput', 'gnWeightTimeInput', 'gnOpenShotDatePicker',
    'gnCloseShotDatePicker', 'gnDatePickerMove', 'gnSelectPickerDate', 'gnSetShotDateFromPicker',
    'gnSetShotDateValue', 'gnSetShotTimeValue', 'updateSyr', 'updateRecon', 'updateSupply',
    'exportCSV', 'exportBackup', 'exportInventory', 'handleCSVImportFile', 'cancelCSVImport', 'confirmCSVImport', 'prepareCSVImport',
    'openImportDialog', 'closeImportDialog', 'handleBackupImportFile', 'confirmBackupImport',
    'openDeleteLocalData', 'closeDeleteLocalData', 'updateDeleteLocalButton', 'confirmDeleteLocalData',
    'openDeleteCloudAccount', 'closeDeleteCloudAccount', 'confirmDeleteCloudAccount',
    'saveMeasurements', 'setMeasurementUnit', 'updateDoseProjection', 'saveCalculatorReference',
    'calPrev', 'calNext', 'calDayClick', 'openArsenalMod', 'closeArs', 'saveArs',
    'requestLoadoutRemove', 'cancelLoadoutRemove', 'confirmLoadoutRemove',
    'refreshNodeHeader', 'openLabTool', 'closeLabTool',
    'dismissSystemUpdate', 'openSystemUpdate'
  ];
  names.forEach(name => { window[name] = modules[name]; });
  window.refreshAll = modules.refreshAll;
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
    .gn-auth-kicker{font:700 .62rem var(--font-m,monospace);letter-spacing:3px;color:#00d4ff;text-align:center}.gn-auth-title{font:800 1.35rem var(--font-d,monospace);letter-spacing:3px;color:#fff;text-align:center;margin:14px 0 6px}.gn-auth-copy{font:.78rem/1.55 var(--font-m,monospace);color:#9fc7d4;text-align:center;margin:0 auto 22px;max-width:38ch}
    .gn-auth-field{width:100%;box-sizing:border-box;margin:0 0 10px;padding:13px 12px;border:1px solid rgba(0,212,255,.2);background:#080810;color:#eeeef5;border-radius:3px;font:16px var(--font-m,monospace);outline:none}.gn-auth-field:focus{border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.1)}
    .gn-auth-primary,.gn-auth-passkey,.gn-auth-google{width:100%;min-height:52px;margin-top:10px;border-radius:3px;cursor:pointer;font:700 .72rem var(--font-d,monospace);letter-spacing:2px}.gn-auth-primary{border:0;background:linear-gradient(135deg,#FF3B3B,#D12424);color:#fff}.gn-auth-passkey{display:flex;align-items:center;justify-content:center;gap:10px;border:0;background:linear-gradient(135deg,#FF3B3B,#D12424);color:#fff}.gn-auth-passkey .gn-passkey-icon{font-size:1rem}.gn-auth-google{border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);color:#00d4ff}.gn-auth-google:disabled{cursor:not-allowed;opacity:.55;border-color:rgba(130,149,160,.28);color:#8295a0;box-shadow:none}.gn-auth-primary-label{margin-top:4px;color:#00d4ff;font:700 .52rem var(--font-m,monospace);letter-spacing:2px;text-align:left}.gn-google-button-shell{width:100%;min-height:54px;margin-top:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:0;border-radius:3px}.gn-google-button-shell.loading{pointer-events:none;opacity:.55}.gn-google-button-shell>div{max-width:100%}.gn-auth-divider{display:flex;align-items:center;gap:12px;margin:18px 0 4px;color:#8295a0;font:600 .6rem var(--font-m,monospace);letter-spacing:2px;text-transform:uppercase}.gn-auth-divider::before,.gn-auth-divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.12)}.gn-auth-local{display:block;width:100%;min-height:44px;margin-top:10px;padding:8px 12px;border:0;background:transparent;color:#8295a0;font:600 .62rem var(--font-m,monospace);letter-spacing:1.4px;cursor:pointer;text-align:center}.gn-auth-local:hover{color:#00d4ff}.gn-auth-privacy{display:grid;gap:4px;margin-top:12px;padding:10px 11px;border-left:2px solid #00d4ff;background:rgba(0,212,255,.045);color:#9fc7d4;font:.58rem/1.45 var(--font-m,monospace)}.gn-auth-privacy strong{color:#e8fcff;letter-spacing:1px}.gn-auth-options{margin-top:16px;border-top:1px solid rgba(255,255,255,.07);padding-top:12px}.gn-auth-options summary{cursor:pointer;color:#8295a0;font:700 .56rem var(--font-m,monospace);letter-spacing:1.4px;list-style:none}.gn-auth-options summary::-webkit-details-marker{display:none}.gn-auth-options[open] summary{color:#00d4ff;margin-bottom:10px}.gn-auth-links{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.gn-auth-link{padding:0;border:0;background:transparent;color:#8295a0;font:600 .58rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}.gn-auth-link:hover{color:#00d4ff}.gn-auth-message{min-height:22px;margin-top:14px;text-align:center;font:.62rem/1.4 var(--font-m,monospace);letter-spacing:.7px;color:#8295a0}.gn-auth-note{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);font:.56rem/1.5 var(--font-m,monospace);letter-spacing:.6px;color:#586d76;text-align:center}.gn-auth-policy-link{margin-top:16px;text-align:center}.gn-auth-policy-link button{padding:6px 10px;border:0;background:transparent;color:#586d76;font:600 .56rem var(--font-m,monospace);letter-spacing:1.2px;cursor:pointer}.gn-auth-policy-link button:hover{color:#00d4ff}
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
    canvas{display:block;max-width:100%}
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
    .gn-custom-picker,.gn-custom-date{position:relative;width:100%;min-width:0}.gn-custom-picker-trigger,.gn-custom-date-trigger{width:100%;min-height:40px;padding:10px;text-align:left;border:1px solid rgba(0,212,255,.18);background:#0e0e16;color:#eeeef5;font:16px var(--font-m,monospace);border-radius:2px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gn-custom-picker-trigger::after,.gn-custom-date-trigger::after{content:'⌄';float:right;color:#00d4ff;margin-left:8px}.gn-custom-picker-trigger:focus-visible,.gn-custom-date-trigger:focus-visible{outline:none;border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.12)}.gn-custom-picker-menu,.gn-custom-date-popover{display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:640;padding:4px;background:#0e0e16;border:1px solid rgba(0,212,255,.28);border-radius:6px;box-shadow:0 16px 42px rgba(0,0,0,.72),0 0 18px rgba(0,212,255,.1)}.gn-custom-picker.open .gn-custom-picker-menu,.gn-custom-date.open .gn-custom-date-popover{display:grid}.gn-custom-picker-option{min-height:38px;padding:9px 10px;border:0;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;color:#9898b0;text-align:left;font:600 .68rem var(--font-m,monospace);cursor:pointer}.gn-custom-picker-option:last-child{border-bottom:0}.gn-custom-picker-option:hover,.gn-custom-picker-option[aria-selected=true]{color:#00d4ff;background:rgba(0,212,255,.08);box-shadow:0 0 10px rgba(0,212,255,.18)}.gn-custom-date-popover{width:min(330px,calc(100vw - 38px));right:auto;padding:10px}.gn-custom-date-head{display:grid;grid-template-columns:34px 1fr 34px;align-items:center;gap:8px;margin-bottom:9px}.gn-custom-date-head button,.gn-custom-date-foot button{min-height:32px;border:1px solid rgba(0,212,255,.24);background:rgba(0,212,255,.06);color:#00d4ff;font:700 .6rem var(--font-d,monospace);cursor:pointer}.gn-custom-date-head strong{color:#eeeef5;text-align:center;font:700 .68rem var(--font-m,monospace);letter-spacing:1px}.gn-custom-date-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.gn-custom-date-dow{padding:3px 0;color:#8295a0;text-align:center;font:600 .48rem var(--font-m,monospace)}.gn-custom-date-blank{min-height:32px}.gn-custom-date-day{min-height:32px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);color:#9898b0;font:600 .62rem var(--font-m,monospace);cursor:pointer}.gn-custom-date-day:hover,.gn-custom-date-day.selected{border-color:#00d4ff;color:#00d4ff;background:rgba(0,212,255,.12);box-shadow:0 0 10px rgba(0,212,255,.18)}.gn-custom-date-foot{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.gn-custom-date-foot button:last-child{color:#9898b0;border-color:rgba(255,255,255,.14);background:transparent}
    .toast{max-width:90vw!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}.toast .gn-toast-message{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .phase-ring-svg-wrap .phase-segment-ring,.landing-phase-visual .phase-segment-ring{position:absolute;border-radius:50%;background:conic-gradient(from -90deg,#00d4ff 0deg 72deg,#2f7bff 72deg 144deg,#ffd700 144deg 216deg,#FF5B5B 216deg 288deg,#9898b0 288deg 360deg);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));pointer-events:none;z-index:0;opacity:.72}
    .phase-ring-svg-wrap .phase-segment-ring{inset:-4px}.phase-ring-svg-wrap .ring-svg{z-index:1}.phase-ring-svg-wrap .phase-nodes{z-index:3}.phase-ring-svg-wrap .ring-center{z-index:4}.phase-marker{position:absolute;width:10px;height:10px;border-radius:50%;transform:translate(-50%,-50%);z-index:5;box-shadow:0 0 6px currentColor,0 0 12px currentColor;opacity:.9;pointer-events:none}.phase-marker[hidden]{display:none!important}@keyframes gnPhaseBreathe{0%,100%{box-shadow:0 0 6px currentColor,0 0 12px currentColor;opacity:.9}50%{box-shadow:0 0 12px currentColor,0 0 24px currentColor;opacity:1}}
    .gn-phase-marker{animation:gnPhaseBreathe 3s ease-in-out infinite}
    .page{transition:opacity .15s ease,visibility .15s ease}.page:not(.active){opacity:0;visibility:hidden;pointer-events:none}.page.active{opacity:1;visibility:visible}
    .gn-streak-card{display:grid;gap:5px;margin:0 0 14px;padding:12px;border:1px solid rgba(0,212,255,.3);border-left:2px solid #00d4ff;background:linear-gradient(135deg,rgba(0,212,255,.08),rgba(0,0,0,.24));color:#eef6f8}.gn-streak-card[hidden]{display:none}.gn-streak-card b{color:#00d4ff;font:800 .7rem var(--font-d,monospace);letter-spacing:1.7px}.gn-streak-card span{color:#9fc7d4;font:.62rem/1.45 var(--font-m,monospace)}
    .gn-celebrate-particle{position:fixed;left:var(--x);bottom:40%;width:var(--size);height:var(--size);border-radius:50%;background:#00d4ff;box-shadow:0 0 8px #00d4ff;animation:gnCelebrate 2.2s ease-out forwards;animation-delay:var(--delay);pointer-events:none;z-index:9999}@keyframes gnCelebrate{0%{transform:translateY(0) translateX(0) scale(1);opacity:1}100%{transform:translateY(-80px) translateX(var(--drift)) scale(0);opacity:0}}
    .landing-phase-visual{position:absolute;right:-14%;bottom:12%;width:min(420px,44vw);aspect-ratio:1;opacity:.35;pointer-events:none;z-index:0;filter:drop-shadow(0 0 20px rgba(0,212,255,.16));animation:gnLandingRingRotate 8s linear infinite}.landing-phase-visual .phase-segment-ring{inset:0;opacity:.95}.landing-phase-core{position:absolute;inset:31%;display:grid;place-items:center;align-content:center;gap:8px;border:1px solid rgba(0,212,255,.28);border-radius:50%;color:#9fefff;text-align:center;background:rgba(5,5,8,.28)}.landing-phase-core span{font:700 .52rem var(--font-m,monospace);letter-spacing:2px}.landing-phase-core b{font:800 2.2rem var(--font-d,monospace);color:#eef6f8}@keyframes gnLandingRingRotate{to{transform:rotate(360deg)}}.landing-hero>:not(.landing-phase-visual){position:relative;z-index:1}
    @media(max-width:767px){.landing-phase-visual{display:none}}
    @media(prefers-reduced-motion:reduce){.gn-phase-marker,.landing-phase-visual,.gn-celebrate-particle{animation:none!important}.page{transition:none!important}}
  `;
  document.head.appendChild(style);
}

function authShell() {
  const login = $('login');
  if (!login) return;
  const recovering = authMode === 'recovery';
  login.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;gap:0;min-height:100%"><div class="gn-auth-card">
    <div class="gn-auth-kicker">// PERSONAL BIOTECH OPERATING SYSTEM //</div>
    <div class="gn-auth-title">${recovering ? 'RESET ACCESS' : 'GRID//NODE'}</div>
    <p class="gn-auth-copy">${recovering ? 'Enter a new password for this GRID//NODE cloud account.' : 'Sign in to sync your grid across devices.'}</p>
    ${recovering ? '' : '<div class="gn-google-button-shell" id="gnGoogleButtonMount" role="group" aria-label="Continue with Google"></div><button class="gn-auth-passkey" id="gnPasskeyBtn" type="button" data-i18n-aria-label="auth.passkeyAria"><span class="gn-passkey-icon" aria-hidden="true">⌘</span><span data-i18n="auth.continueWithPasskey">CONTINUE WITH PASSKEY</span></button><div class="gn-auth-divider" aria-hidden="true"><span>or</span></div><button class="gn-auth-local" id="gnLocalBtn" type="button">CONTINUE ON THIS DEVICE ONLY</button>'}
    <form id="gnAuthForm" novalidate>
      <input class="gn-auth-field" id="gnAuthEmail" type="email" autocomplete="email" placeholder="EMAIL ADDRESS" aria-label="Email address"${recovering ? ' hidden' : ''}>
      <input class="gn-auth-field" id="gnAuthPassword" type="password" autocomplete="${recovering ? 'new-password' : 'current-password'}" placeholder="${recovering ? 'NEW PASSWORD' : 'PASSWORD'}" aria-label="${recovering ? 'New password' : 'Password'}">
      <button class="gn-auth-primary" id="gnAuthSubmit" type="submit">${recovering ? 'UPDATE PASSWORD' : 'SIGN IN TO CLOUD'}</button>
    </form>
    <div class="gn-auth-links"><button class="gn-auth-link" id="gnAuthModeToggle" type="button">${recovering ? 'BACK TO SIGN IN' : 'CREATE ACCOUNT'}</button>${recovering ? '' : '<button class="gn-auth-link" id="gnAuthReset" type="button">RESET PASSWORD</button>'}</div>
    <div class="gn-auth-message" id="loginMsg" role="status" aria-live="polite"></div>
    ${recovering ? '' : '<div class="gn-auth-policy-link"><button type="button" id="gnVaultPolicyLink" data-i18n="landing.yourDataYourRules">YOUR DATA, YOUR RULES</button></div>'}
  </div></div>`;
  login.querySelector('.gn-auth-card')?.insertAdjacentHTML('afterbegin', '<div class="gn-auth-lang-kanji" role="group" data-i18n-aria-label="lang.switcherAria"><button type="button" class="gn-lang-globe" data-lang-choice="es" aria-label="Español" title="Cambiar a Español"><svg class="gn-lang-kanji" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><text x="12" y="17.5" text-anchor="middle" font-family="Noto Sans JP, Hiragino Sans, Yu Gothic, PingFang SC, Microsoft YaHei, sans-serif" font-size="17" stroke="currentColor" stroke-width="2" fill="none">電</text></svg></button></div>');
  $('gnVaultPolicyLink')?.addEventListener('click', showVaultPolicy);
  applyAuthTranslations(recovering);
  $('gnAuthForm')?.addEventListener('submit', event => { event.preventDefault(); submitAuth(); });
  $('gnAuthModeToggle')?.addEventListener('click', toggleAuthMode);
  $('gnAuthReset')?.addEventListener('click', requestPasswordReset);
  $('gnLocalBtn')?.addEventListener('click', enterLocalSession);
  updateAuthMode();
  renderGoogleIdentityButton();
  wirePasskeyAuth();
}


function showVaultPolicy() {
  document.getElementById('gnVaultPolicyOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'gnVaultPolicyOverlay';
  overlay.className = 'gn-auth-policy-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = '<div class="gn-auth-policy-modal"><div class="gn-auth-kicker">// GRID//NODE //</div><h2>' + tx('landing.yourDataYourRules', 'YOUR DATA, YOUR RULES') + '</h2><p>' + tx('landing.vaultPolicy', '// VAULT POLICY: YOUR RECORD STAYS LOCAL UNTIL YOU CONNECT A CLOUD ACCOUNT // GRID//NODE DOES NOT PROVIDE MEDICAL ADVICE //') + '</p><button type="button" class="gn-auth-primary" id="gnVaultPolicyClose">' + tx('whatsnew.gotIt', 'GOT IT') + '</button></div>';
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); };
  overlay.querySelector('#gnVaultPolicyClose').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
}

function applyAuthTranslations(recovering) {
  const login = $('login');
  const title = login?.querySelector('.gn-auth-title');
  const copy = login?.querySelector('.gn-auth-copy');
  const note = login?.querySelector('.gn-auth-note');
  if (title) title.setAttribute('data-i18n', recovering ? 'auth.resetAccess' : 'auth.enterGrid');
  if (copy) copy.setAttribute('data-i18n', recovering ? 'auth.enterNewPassword' : 'auth.signInSyncLine');
  if (note) note.setAttribute('data-i18n', 'landing.vaultPolicy');
  const kicker = login?.querySelector('.gn-auth-kicker');
  if (kicker) kicker.setAttribute('data-i18n', 'auth.kicker');
  const divider = login?.querySelector('.gn-auth-divider span');
  if (divider) divider.setAttribute('data-i18n', 'auth.or');
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
  const local = $('gnLocalBtn');
  if (local) local.setAttribute('data-i18n', 'auth.continueDeviceOnly');
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

function renderGoogleFallback(host, message) {
  if (!host?.isConnected) return;
  const fallback = document.createElement('button');
  fallback.type = 'button';
  fallback.className = 'gn-auth-google';
  fallback.disabled = true;
  fallback.textContent = message;
  host.replaceChildren(fallback);
}

async function renderGoogleIdentityButton() {
  const host = $('gnGoogleButtonMount');
  if (!host) return;
  renderGoogleFallback(host, 'CHECKING GOOGLE...');
  const enabled = await isCloudProviderEnabled('google');
  if (!host.isConnected) return;
  if (!enabled) {
    renderGoogleFallback(host, 'GOOGLE SIGN-IN SETUP PENDING');
    setAuthMessage(tx('auth.googleNotEnabled', '// GOOGLE SIGN-IN IS NOT ENABLED YET — USE EMAIL OR CONTINUE LOCALLY'), false);
    return;
  }
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
      width: Math.min(336, Math.max(260, host.clientWidth || 336))
    });
  } catch (error) {
    console.warn('[GRID//NODE Google identity]', error);
    renderGoogleFallback(host, 'GOOGLE SIGN-IN UNAVAILABLE');
    setAuthMessage(tx('auth.googleCouldNotLoad', '// GOOGLE SIGN-IN COULD NOT LOAD — USE EMAIL OR CONTINUE LOCALLY'), true);
  }
}

async function handleGoogleCredential(response) {
  const host = $('gnGoogleButtonMount');
  host?.classList.add('loading');
  setAuthMessage(tx('auth.verifyingGoogle', '// VERIFYING GOOGLE IDENTITY...'), false);
  try {
    const session = await signInWithGoogleIdToken(response?.credential);
    if (!session) throw new Error('NO_SESSION');
    await completeCloudSession(session);
    maybeOfferPasskeyRegistration();
  } catch (error) {
    setAuthMessage(tx('auth.googleCouldNotComplete', '// GOOGLE SIGN-IN COULD NOT COMPLETE — RETRY OR USE EMAIL'), true);
    host?.classList.remove('loading');
  }
}

async function requestPasswordReset() {
  const email = $('gnAuthEmail')?.value?.trim();
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
  const email = $('gnAuthEmail')?.value?.trim();
  const password = $('gnAuthPassword')?.value || '';
  if (authMode !== 'recovery' && (!email || !email.includes('@'))) { setAuthMessage(tx('auth.validEmail', '// ENTER A VALID EMAIL ADDRESS'), true); return; }
  if (password.length < 8) { setAuthMessage(tx('auth.passwordMin', '// PASSWORD MUST BE AT LEAST 8 CHARACTERS'), true); return; }
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
      if (result?.session) { await completeCloudSession(result.session); maybeOfferPasskeyRegistration(); } else { setAuthMessage(tx('auth.accountCreated', '// ACCOUNT CREATED — CHECK YOUR EMAIL TO CONFIRM'), false); }
    } else {
      const session = await signInCloud(email, password);
      if (!session) throw new Error('NO_SESSION');
      await completeCloudSession(session);
    }
  } catch (error) {
    setAuthMessage(error.message === 'CLOUD_UNAVAILABLE' ? tx('auth.cloudUnavailable', '// CLOUD AUTH UNAVAILABLE — CONTINUE LOCALLY OR RETRY WHEN ONLINE') : `// AUTH ERROR: ${error.message || 'CHECK YOUR DETAILS'}`, true);
  } finally {
    if (submit) { submit.disabled = false; updateAuthMode(); }
  }
}

async function handleGoogleSignIn() {
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
  migrateLegacyLocalData();
  const targetUserId = session?.user?.id ? String(session.user.id) : '';
  const mayMigrateLocal = state.accountKey === 'local' && localWorkspaceMigrationAllowed(targetUserId);
  const localWorkspace = mayMigrateLocal ? captureWorkspace('local') : null;
  activateSession(session, true);
  const accountWorkspace = captureWorkspace(state.accountKey);
  showApp();
  const hydration = await hydrateCloudData();
  if (hydration.ok && localWorkspace && workspaceHasData(localWorkspace) && !workspaceHasData(accountWorkspace)) {
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
  await syncAllCloudData();
  if (hydration.ok && localWorkspace && workspaceHasData(localWorkspace) && state.cloudStatus === 'CLOUD_SYNCED') {
    markLocalWorkspaceMigrated(targetUserId);
  }
  showApp();
}

function showApp() {
  modules.showScreen('app');
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
      button.addEventListener('click', () => setAuthMessage('// ' + tx('auth.passkeyNotSupportedMsg', 'YOUR DEVICE DOES NOT SUPPORT PASSKEYS. USE GOOGLE SIGN-IN INSTEAD.'), true));
      return;
    }
    const emailInput = $('gnAuthEmail');
    if (emailInput) emailInput.autocomplete = 'username webauthn';
    button.addEventListener('click', async () => {
      const email = $('gnAuthEmail')?.value?.trim();
      if (!email) {
        setAuthMessage('// ' + tx('auth.passkeyEmailFirst', 'ENTER YOUR EMAIL ADDRESS FIRST, THEN CONTINUE WITH PASSKEY.'), true);
        $('gnAuthEmail')?.focus();
        return;
      }
      button.disabled = true;
      setAuthMessage('// ' + tx('auth.connecting', 'CONNECTING...'), false);
      try {
        const session = await signInWithPasskey(email);
        if (session) {
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
    if (!hub) return;
    hub.insertAdjacentHTML('beforeend', `<section class="gn-passkeys-card" id="gnPasskeysCard" aria-labelledby="gnPasskeysTitle">
      <div class="gn-foundation-kicker" data-i18n="auth.passkeysKicker">// PASSKEYS</div>
      <h3 id="gnPasskeysTitle" data-i18n="auth.passkeysTitle">MANAGE PASSKEYS</h3>
      <p class="gn-measurements-copy" data-i18n="auth.passkeysCopy">Sign in with your fingerprint, face, or security key.</p>
      <ul class="gn-passkeys-list" data-gn-passkeys-list></ul>
      <button type="button" class="btn-full btn-primary" id="gnRegisterPasskeyBtn" data-i18n="auth.registerNewPasskey">+ REGISTER A NEW PASSKEY</button>
    </section>`);
    $('gnRegisterPasskeyBtn')?.addEventListener('click', async () => {
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
      <button class="gn-passkey-revoke" type="button" data-revoke="${safeText(passkey.id)}">${safeText(tx('vault.signOut', 'SIGN OUT'))}</button>
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
          if (event.target === overlay || event.target.closest('[data-passkey-upsell-later]')) { overlay.classList.remove('active'); return; }
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
  const kickerStates = [
    tx('boot.statusInitializing', 'INITIALIZING'),
    tx('boot.statusCalibrating', 'CALIBRATING'),
    tx('boot.statusSyncing', 'SYNCING'),
    tx('boot.statusOnline', 'ONLINE')
  ];
  // kicker phase per line index (7 lines -> 4 phases)
  const kickerAt = [0, 0, 1, 1, 2, 2, 3];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const typeCharMs = reduced ? 0 : 14;

  const setKicker = phase => {
    const k = document.querySelector('.boot-deck-kicker b');
    if (k) k.textContent = kickerStates[phase] || kickerStates[0];
  };
  const typeLine = (line, text) => new Promise(resolve => {
    if (reduced || !term) { line.textContent = text; resolve(); return; }
    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'boot-cursor';
    line.appendChild(cursor);
    const tick = () => {
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
    if (i < messages.length - 1) {
      line.classList.remove('boot-typing');
      tag.textContent = '[ OK ] ' + status;
      if (!reduced) await new Promise(r => window.setTimeout(r, 240));
    }
  }
  // completion: kicker ONLINE + cyan->Mars Red pulse on the emblem
  setKicker(3);
  const emblem = document.querySelector('.gn-b2b-symbol');
  if (emblem && !reduced) {
    emblem.classList.add('boot-complete-pulse');
    await new Promise(r => window.setTimeout(r, 750));
    emblem.classList.remove('boot-complete-pulse');
  }
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
    passwordRecoveryActive = true;
    authMode = 'recovery';
    authShell();
    modules.showScreen('login');
  });
}

function wireGlobalEvents() {
  $('signOutOverlay')?.addEventListener('click', event => { if (event.target.id === 'signOutOverlay') closeSignOutModal(); });
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-lang-choice]');
    if (!button) return;
    event.preventDefault();
    const lang = button.getAttribute('data-lang-choice');
    if (lang) window.GN_I18N?.setLang(lang);
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
    .register('/sw.js?v=20260812.5', { updateViaCache: 'none' })
    .then(registration => registration.update())
    .catch(() => {});
}

window.GN = {
  version: APP_VERSION,
  state,
  S,
  async syncNow() { await getCloudClient(); await hydrateCloudData(); await syncAllCloudData(); modules.refreshAll(); },
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
  window.openSignOutModal = openSignOutModal;
  window.closeSignOutModal = closeSignOutModal;
  window.confirmSignOut = confirmSignOut;
  wireGlobalEvents();
  registerServiceWorker();
  await wireCloudAuthEvents();
  await restoreSession();
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
