/* GRID//NODE stable classic delivery bundle. Source remains modular in gridnode-core.js, gridnode-modules.js, and gridnode-app.js. */

/* GRID//NODE stable core
 * State, local persistence, session handling, and optional Supabase sync.
 * No UI code belongs in this file.
 */

const APP_VERSION = '2.0.2-stable';

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
const WORKSPACE_KEYS = ['profile', 'shots', 'weights', 'results', 'notes', 'symptoms', 'labs', 'preferences', 'settings', 'arsenal', 'selectedLocation', 'cloudDeletes'];

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

const S = Object.freeze({
  get(key, fallback = null) {
    const candidates = [accountStorageKey(key), ...legacyStorageKeys(key)];
    for (const storageKey of candidates) {
      try {
        const value = jsonParse(localStorage.getItem(storageKey), undefined);
        if (value !== undefined && value !== null) return value;
      } catch (error) {
        console.warn('[GRID//NODE storage.read]', storageKey, error);
      }
    }
    return fallback;
  },
  set(key, value) {
    try {
      localStorage.setItem(accountStorageKey(key), JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('[GRID//NODE storage.write]', key, error);
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(accountStorageKey(key));
      return true;
    } catch (error) {
      console.warn('[GRID//NODE storage.remove]', key, error);
      return false;
    }
  },
  has(key) {
    try { return localStorage.getItem(accountStorageKey(key)) !== null; } catch { return false; }
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
  return {
    ...record,
    med: normalizeLegacyText(record.med),
    site: normalizeLegacyText(record.site),
    notes: normalizeLegacyText(record.notes)
  };
}

function getProfile() { return S.get('profile', {}); }
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

async function signOutCloud() {
  const client = state.cloudClient;
  if (!client) return;
  try { await withTimeout(client.auth.signOut(), 5000); } catch (error) { console.warn('[GRID//NODE cloud sign out]', error); }
}

function cloudShotPayload(record, userId) {
  const payload = {
    user_id: userId,
    date: record.date,
    compound: record.med || 'CUSTOM',
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
      if (index >= 0) { all[index] = record; S.set('shots', all); }
    }
    state.cloudStatus = 'CLOUD_SYNCED';
  } catch (error) {
    state.cloudStatus = 'LOCAL_BACKUP';
    console.warn('[GRID//NODE cloud shot sync]', error);
  }
}

async function syncWeight(record) {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return;
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
      if (index >= 0) { all[index] = record; S.set('weights', all); }
    }
    state.cloudStatus = 'CLOUD_SYNCED';
  } catch (error) {
    state.cloudStatus = 'LOCAL_BACKUP';
    console.warn('[GRID//NODE cloud weight sync]', error);
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
  return {
    user_id: userId,
    results_data: S.get('results', []),
    notes_data: S.get('notes', []),
    symptoms_data: S.get('symptoms', []),
    labs_data: S.get('labs', []),
    preferences,
    settings: S.get('settings', {}),
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
  S.set('cloudDeletes', remaining);
  state.cloudStatus = remaining.length ? 'LOCAL_BACKUP' : 'CLOUD_SYNCED';
  return remaining.length === 0;
}

async function deleteCloudShot(record) {
  if (!record?.cloudId) return true;
  const pending = S.get('cloudDeletes', []);
  if (!pending.some(item => item.table === 'shots' && item.id === record.cloudId)) pending.push({ table: 'shots', id: record.cloudId });
  S.set('cloudDeletes', pending);
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
    const mergedShots = mergeRecords(localShots, cloudShots, record => record.cloudId || record.id);
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
    const mergedWeights = mergeRecords(localWeights, cloudWeights, record => record.cloudId || record.id);
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
      const settings = { ...(remoteWorkspace.settings || {}), ...S.get('settings', {}) };
      S.set('preferences', preferences);
      S.set('settings', settings);
      if (!S.get('selectedLocation', '') && preferences.selectedLocation) S.set('selectedLocation', preferences.selectedLocation);
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
  const merged = [...localRecords];
  const identities = new Set(merged.map(identity));
  for (const record of remoteRecords) {
    if (!identities.has(identity(record))) merged.push(record);
  }
  return merged.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
}

function mergeJsonRecords(localRecords, remoteRecords) {
  const local = Array.isArray(localRecords) ? localRecords : [];
  const remote = Array.isArray(remoteRecords) ? remoteRecords : [];
  return mergeRecords(local, remote, record => record && typeof record === 'object' ? record.id || JSON.stringify(record) : String(record));
}

async function syncAllCloudData() {
  if (!state.cloud) return;
  await flushCloudDeletes();
  await Promise.all([
    ...getAllShots().map(record => syncShot(record)),
    ...getWeights().map(record => syncWeight(record)),
    syncProfile(getProfile()),
    syncWorkspace()
  ]);
}

function queueCloudSync(kind, record) {
  const work = kind === 'shot' ? syncShot(record) : kind === 'weight' ? syncWeight(record) : kind === 'profile' ? syncProfile(record) : syncWorkspace();
  work.catch(error => console.warn('[GRID//NODE cloud queue]', error));
}

function sessionLabel() {
  return state.session?.user?.email || (state.cloud ? 'CLOUD ACCOUNT' : 'LOCAL DEVICE SESSION');
}

function migrateLegacyLocalData() {
  if (state.accountKey !== 'local') return;
  for (const key of WORKSPACE_KEYS) {
    const current = localStorage.getItem(`gn_local_${key}`);
    if (current !== null) continue;
    const legacy = localStorage.getItem(`gn_0_${key}`);
    if (legacy !== null) localStorage.setItem(`gn_local_${key}`, legacy);
  }
}

function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', options);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mdy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

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
  pendingFutureShot: false,
  pendingLocationDraft: false,
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

function saveProfileMed() {
  const profile = profileSnapshot();
  S.set('profile', profile);
  setText('profMedTxt', profile.med ? `// ${profile.med.toUpperCase()}` : '// NO MEDICATION SET');
  queueCloudSync('profile', profile);
  showToast('Profile protocol context saved.');
}

function saveProfileMetrics() {
  const profile = profileSnapshot();
  S.set('profile', profile);
  calcAndShowBMI();
  queueCloudSync('profile', profile);
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
  setText('profBMICat', bmi < 18.5 ? 'UNDERWEIGHT' : bmi < 25 ? 'NORMAL' : bmi < 30 ? 'OVERWEIGHT' : 'OBESE');
  setDisplay('profBMIDisplay', true);
  return Number(bmi);
}

function setSelect(id, value, label) {
  selectState[id] = { val: value, label };
  const valueElement = $(`${id}Val`);
  if (valueElement) { valueElement.textContent = label; valueElement.classList.remove('placeholder'); }
}

function toggleSelect(id) {
  const dropdown = $(`${id}Drop`);
  const trigger = dropdown?.previousElementSibling;
  if (!dropdown || !trigger) return;
  qa('.cp-dropdown.open').forEach(item => item.classList.remove('open'));
  qa('.cp-select-trigger.open').forEach(item => item.classList.remove('open'));
  const willOpen = !dropdown.classList.contains('open');
  dropdown.classList.toggle('open', willOpen);
  trigger.classList.toggle('open', willOpen);
}

function selectOpt(id, value, label, callback) {
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

function showPhasesModal() {
  const content = $('allPhasesContent');
  if (content) content.innerHTML = PHASES.map((phase, index) => `<div class="gn-phase-row"><span class="gn-phase-index">0${index + 1}</span><div><b style="color:${phase.color}">${phase.name}</b><p>${safeText(phase.support)}</p></div></div>`).join('');
  $('phasesOv')?.classList.add('active');
}
function closePhases() { $('phasesOv')?.classList.remove('active'); }

function renderShots() {
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

function setShotHistoryView(view) {
  moduleState.shotHistoryView = view === 'archived' ? 'archived' : 'active';
  renderShots();
}

function setScannerMode(mode, button) {
  moduleState.scannerMode = ZONES[mode] ? mode : 'core';
  qa('.scanner-mode-btn').forEach(item => item.classList.toggle('active', item === button || item.dataset.mode === moduleState.scannerMode));
  const stage = document.querySelector('.asset-scan-stage');
  if (stage) { stage.classList.remove('mode-core', 'mode-lower', 'mode-upper'); stage.classList.add(`mode-${moduleState.scannerMode}`); }
  setText('scannerModeLabel', `${moduleState.scannerMode.toUpperCase()} TRACKABLE ZONES`);
  renderScanner();
}

function selectScannerLocation(label) {
  moduleState.selectedLocation = label;
  S.set('selectedLocation', label);
  queueCloudSync('workspace');
  renderScanner();
  showToast(`Location staged: ${label}`);
}

function renderScanner() {
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

function openLogModal(options = {}) {
  const modal = $('logOv');
  if (!modal) return;
  const preserveDraft = Boolean(options.preserve || moduleState.pendingLocationDraft);
  moduleState.pendingLocationDraft = false;
  if (!preserveDraft) {
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

function closeLog() {
  $('logOv')?.classList.remove('active');
  moduleState.pendingLocationDraft = false;
  moduleState.editingShotId = null;
}

function editShot(id) {
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
  S.set('shots', all);
  queueCloudSync('shot', record);
  refreshAll();
  showToast('SHOT record archived.');
}

function restoreArchivedShot(id) {
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

function openPermanentDeleteConfirm(id) { moduleState.pendingPermanentDeleteId = id; $('permanentDeleteConfirmOv')?.classList.add('active'); }
function cancelPermanentDeleteShot() { moduleState.pendingPermanentDeleteId = null; $('permanentDeleteConfirmOv')?.classList.remove('active'); }
async function confirmPermanentDeleteShot() {
  const id = moduleState.pendingPermanentDeleteId;
  cancelPermanentDeleteShot();
  const record = getAllShots().find(item => item.id === id);
  const next = getAllShots().filter(item => item.id !== id);
  S.set('shots', next);
  refreshAll();
  const cloudDeleted = await deleteCloudShot(record);
  showToast(cloudDeleted ? 'Archived record deleted.' : 'Deleted locally. Cloud deletion queued for retry.');
}

function saveShot(allowFuture = false) {
  const med = selectState.cpShotMed?.val;
  const dose = Number($('sDose')?.value);
  const date = normalizeDateInput($('sDate')?.value);
  const time = getShotTime24($('sTime')?.value);
  const site = moduleState.selectedLocation;
  if (!med || !dose || !date || !time || !site) { showToast('Add medication, dose, date, time, and a logged location.', true); return; }
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
    const linkedIndex = weights.findIndex(item => item.shotId === record.id || (
      existing && !item.shotId && item.notes === 'Logged with SHOT'
      && item.date === existing.date && Number(item.weight) === Number(existing.wt)
    ));
    const linkedWeight = linkedIndex >= 0 ? weights[linkedIndex] : null;
    const weightRecord = {
      ...(linkedWeight || {}), id: linkedWeight?.id || createId('weight'), shotId: record.id,
      date: record.date, weight: record.wt, notes: 'Logged with SHOT'
    };
    if (linkedIndex >= 0) weights[linkedIndex] = weightRecord; else weights.push(weightRecord);
    S.set('weights', weights); queueCloudSync('weight', weightRecord);
  }
  moduleState.pendingFutureShot = false;
  $('futureTimestampConfirm')?.classList.remove('active');
  closeLog();
  refreshAll();
  showToast(existing ? 'SHOT record updated.' : 'SHOT recorded.');
}

function openFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.add('active'); }
function closeFutureTimestampConfirm() { $('futureTimestampConfirm')?.classList.remove('active'); moduleState.pendingFutureShot = false; }
function cancelFutureTimestampSave() { closeFutureTimestampConfirm(); }
function confirmFutureTimestampSave() { $('futureTimestampConfirm')?.classList.remove('active'); saveShot(true); }

function handleShotFab() { openLogModal(); }
function goToScannerForLocationFromLog() {
  moduleState.pendingLocationDraft = true;
  $('logOv')?.classList.remove('active');
  showPage('Log', $('navLog'));
  document.querySelector('.gn-stable-zone-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Select a trackable zone, then open LOG SHOT again.');
}

function openWeightModal() {
  if ($('wtDate')) $('wtDate').value = todayISO();
  if ($('wtTime')) $('wtTime').value = formatTime24(new Date());
  $('wtOv')?.classList.add('active');
}
function closeWt() { $('wtOv')?.classList.remove('active'); }
function setWeightUnit(unit) {
  moduleState.weightUnit = unit === 'kg' ? 'kg' : 'lb';
  qa('[data-wt-unit]').forEach(button => button.classList.toggle('active', button.dataset.wtUnit === moduleState.weightUnit));
}
function saveWt() {
  const raw = Number($('wtVal')?.value);
  const date = normalizeDateInput($('wtDate')?.value) || todayISO();
  if (!raw || raw <= 0) { setText('wtError', 'ENTER A VALID WEIGHT VALUE'); setDisplay('wtError', true); return; }
  const weight = moduleState.weightUnit === 'kg' ? raw * 2.2046226218 : raw;
  const record = { id: createId('weight'), date: `${date}T${$('wtTime')?.value || '12:00'}`, weight, weightKg: moduleState.weightUnit === 'kg' ? raw : raw / 2.2046226218, unit: moduleState.weightUnit, notes: $('wtNotes')?.value?.trim() || null };
  const weights = getWeights(); weights.push(record); S.set('weights', weights); queueCloudSync('weight', record);
  closeWt();
  if ($('wtVal')) $('wtVal').value = '';
  if ($('wtNotes')) $('wtNotes').value = '';
  refreshAll(); showToast('Weight record saved.');
}

function renderResults() {
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

function renderLab() { updateSyr(); updateRecon(); updateSupply(); }
function updateSyr() {
  const dose = Number($('cDose')?.value), concentration = Number($('cConc')?.value);
  if (!dose || !concentration) { setText('syrUnits', '—'); setText('syrText', 'DRAW TO THE — UNIT LINE'); setText('syrML', '— mL'); setText('syrConcDisplay', '— mg/mL'); setText('syrResultLine', '—'); setText('syrVolResult', '— mL'); setText('syrFormula', 'Educational math only. Enter dose and concentration.'); setDisplay('syrTarget', false); return; }
  const volume = dose / concentration, units = volume * 100;
  setText('syrUnits', `${units.toFixed(1)}u`); setText('syrText', `DRAW TO THE ${units.toFixed(1)} UNIT LINE`); setText('syrML', `${volume.toFixed(3)} mL`); setText('syrConcDisplay', `${concentration} mg/mL`); setText('syrResultLine', `${dose} mg`); setText('syrVolResult', `${volume.toFixed(3)} mL`); setText('syrFormula', `${dose} mg ÷ ${concentration} mg/mL = ${volume.toFixed(3)} mL = ${units.toFixed(1)} U-100 units. Educational math only.`); setDisplay('syrTarget', true);
  const target = $('syrTarget'); if (target) target.style.left = `${Math.min(100, Math.max(0, units))}%`;
}
function updateRecon() {
  const vial = Number($('rVial')?.value), conc = Number($('rConc')?.value);
  const valid = vial > 0 && conc > 0;
  setDisplay('reconRes', valid);
  if (valid) { const volume = vial / conc; setText('reconOut', `Reference math: ${vial} mg ÷ ${conc} mg/mL = ${volume.toFixed(3)} mL total reference volume.`); setText('bacAmt', `${volume.toFixed(3)} mL`); }
}
function updateSupply() {
  const volume = Number($('sVol')?.value), conc = Number($('sConc')?.value), weekly = Number($('sDose2')?.value);
  const valid = volume > 0 && conc > 0 && weekly > 0;
  setDisplay('supRes', valid);
  if (valid) { const total = volume * conc; setText('supOut', `Reference total: ${total.toFixed(2)} mg · User-entered weekly amount: ${weekly.toFixed(2)} mg · Approximate record coverage: ${(total / weekly).toFixed(1)} weeks. Educational organization only.`); }
}

function renderProfile() {
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

function exportCSV() {
  const rows = [['record_type', 'date', 'medication', 'dose_mg', 'location', 'weight_lb', 'side_effects', 'notes', 'archived']];
  getAllShots().forEach(record => rows.push(['shot', record.date || '', record.med || '', record.dose || '', record.site || '', record.wt || '', (record.se || []).join('|'), record.notes || '', record.archived ? 'true' : 'false']));
  getWeights().forEach(record => rows.push(['weight', record.date || '', '', '', '', record.weight || '', '', record.notes || '', 'false']));
  downloadFile('gridnode-records.csv', rows.map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast('CSV export prepared.');
}

function csvCell(value) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

function exportBackup() {
  const backup = { app: 'GRID//NODE', version: APP_VERSION, exportedAt: new Date().toISOString(), profile: getProfile(), shots: getAllShots(), weights: getWeights(), results: S.get('results', []), notes: S.get('notes', []), symptoms: S.get('symptoms', []), labs: S.get('labs', []), preferences: S.get('preferences', {}), settings: S.get('settings', {}), arsenal: S.get('arsenal', []) };
  downloadFile('gridnode-backup.json', JSON.stringify(backup, null, 2), 'application/json');
  showToast('VAULT backup prepared.');
}

function handleCSVImportFile(event) {
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
function cancelCSVImport() { moduleState.pendingImport = null; $('csvImportOverlay')?.classList.remove('active'); }
function confirmCSVImport() {
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

function renderCalendar() {
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
function calPrev() { moduleState.calendarDate.setMonth(moduleState.calendarDate.getMonth() - 1); renderCalendar(); }
function calNext() { moduleState.calendarDate.setMonth(moduleState.calendarDate.getMonth() + 1); renderCalendar(); }
function calDayClick(day) { moduleState.selectedCalendarDay = day; renderCalendar(); }

function openArsenalMod(type = 'compound', editId = null) { moduleState.arsenalEditId = editId; $('arsTitle')?.replaceChildren(document.createTextNode(editId ? 'EDIT CONTEXT' : 'ADD CONTEXT')); $('arsOv')?.classList.add('active'); }
function closeArs() { $('arsOv')?.classList.remove('active'); moduleState.arsenalEditId = null; }
function saveArs() { const items = S.get('arsenal', []); const record = { id: moduleState.arsenalEditId || createId('context'), name: $('aName')?.value?.trim(), concentration: Number($('aConc')?.value) || null, volume: Number($('aVol')?.value) || null, quantity: Number($('aQty')?.value) || 1, reviewDate: $('aExpiry')?.value || '' }; if (!record.name) { showToast('Enter a context name.', true); return; } const index = items.findIndex(item => item.id === record.id); if (index >= 0) items[index] = record; else items.push(record); S.set('arsenal', items); queueCloudSync('workspace'); closeArs(); showToast('VAULT context saved.'); }
function requestLoadoutRemove(id) { moduleState.pendingArsenalId = id; $('loadoutRemoveOverlay')?.classList.add('active'); }
function cancelLoadoutRemove() { moduleState.pendingArsenalId = null; $('loadoutRemoveOverlay')?.classList.remove('active'); }
function confirmLoadoutRemove() { const next = S.get('arsenal', []).filter(item => item.id !== moduleState.pendingArsenalId); S.set('arsenal', next); queueCloudSync('workspace'); cancelLoadoutRemove(); showToast('Context removed.'); }

function toggleSound() { window.GN_SOUND_ON = window.GN_SOUND_ON === false; const button = $('sndBtn'); if (button) button.style.opacity = window.GN_SOUND_ON ? '1' : '.4'; }

function formatTime24(date) { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
function formatTime12(date) { const hour = date.getHours() % 12 || 12; return `${hour}:${String(date.getMinutes()).padStart(2, '0')}`; }
function getShotTime24(value) { const raw = String(value || '').trim().toUpperCase(); const suffix = moduleState.meridiem; const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/); if (!match) return ''; let hour = Number(match[1]), minute = Number(match[2] || '00'); if (suffix === 'PM' && hour < 12) hour += 12; if (suffix === 'AM' && hour === 12) hour = 0; return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : ''; }
function gnSetShotMeridiem(value) { moduleState.meridiem = value === 'PM' ? 'PM' : 'AM'; updateMeridiemButtons(); }
function updateMeridiemButtons() { $('sTimeAM')?.classList.toggle('active', moduleState.meridiem === 'AM'); $('sTimePM')?.classList.toggle('active', moduleState.meridiem === 'PM'); }
function gnShotClockLiveFormat(input) { if (!input) return; input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4).replace(/^(\d{1,2})(\d{2})$/, '$1:$2'); }
function gnNormalizeShotClockField(input) { if (!input) return; const parsed = getShotTime24(input.value); if (parsed) { const date = new Date(`2000-01-01T${parsed}`); input.value = formatTime12(date); } }
function gnWeightDateInput(input) { if (input) input.value = input.value.replace(/[^0-9\/-]/g, '').slice(0, 10); }
function gnWeightTimeInput(input) { if (input) input.value = input.value.replace(/[^0-9:]/g, '').slice(0, 5); }
function gnOpenShotDatePicker() { const input = $('sDate'); if (input) { input.removeAttribute('readonly'); input.type = 'date'; input.value = normalizeDateInput(input.value) || todayISO(); input.focus(); } }
function gnCloseShotDatePicker() { const input = $('sDate'); if (input) { input.type = 'text'; input.setAttribute('readonly', 'readonly'); } }
function gnDatePickerMove() {}
function gnSelectPickerDate(date) { if ($('sDate')) $('sDate').value = date; gnCloseShotDatePicker(); }
function gnSetShotDateFromPicker() { gnCloseShotDatePicker(); }
function gnSetShotDateValue(value) { if ($('sDate')) $('sDate').value = value; }
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
function updatePills() { const med = selectState.cpShotMed?.val; const dose = Number(getProfile().dose); const container = $('dosePills'); if (!container) return; const values = dose ? [dose] : [0.5, 1, 2.5, 5, 7.5, 10]; container.innerHTML = values.map(value => `<button type="button" class="dose-pill" data-dose="${value}">${value} mg</button>`).join(''); setText('profMedTxt', med ? `// ${med.toUpperCase()}` : '// NO MEDICATION SET'); }
function selPill(button, dose) { if ($('sDose')) $('sDose').value = dose; qa('.dose-pill').forEach(item => item.classList.toggle('active', item === button)); }

function initModules() {
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

window.GNModules=Object.freeze({selectState:selectState,moduleState:moduleState,showScreen:showScreen,showPage:showPage,refreshAll:refreshAll,loadApp:loadApp,saveProfileMed:saveProfileMed,saveProfileMetrics:saveProfileMetrics,calcAndShowBMI:calcAndShowBMI,toggleSelect:toggleSelect,selectOpt:selectOpt,showPhasesModal:showPhasesModal,closePhases:closePhases,renderShots:renderShots,setShotHistoryView:setShotHistoryView,setScannerMode:setScannerMode,selectScannerLocation:selectScannerLocation,renderScanner:renderScanner,openLogModal:openLogModal,closeLog:closeLog,editShot:editShot,openArchiveConfirm:openArchiveConfirm,cancelArchiveShot:cancelArchiveShot,confirmArchiveShot:confirmArchiveShot,restoreArchivedShot:restoreArchivedShot,openPermanentDeleteConfirm:openPermanentDeleteConfirm,cancelPermanentDeleteShot:cancelPermanentDeleteShot,confirmPermanentDeleteShot:confirmPermanentDeleteShot,saveShot:saveShot,openFutureTimestampConfirm:openFutureTimestampConfirm,closeFutureTimestampConfirm:closeFutureTimestampConfirm,cancelFutureTimestampSave:cancelFutureTimestampSave,confirmFutureTimestampSave:confirmFutureTimestampSave,handleShotFab:handleShotFab,goToScannerForLocationFromLog:goToScannerForLocationFromLog,openWeightModal:openWeightModal,closeWt:closeWt,setWeightUnit:setWeightUnit,saveWt:saveWt,renderResults:renderResults,setRange:setRange,setWtRange:setWtRange,showLabSeg:showLabSeg,showYouSeg:showYouSeg,renderLab:renderLab,updateSyr:updateSyr,updateRecon:updateRecon,updateSupply:updateSupply,renderProfile:renderProfile,exportCSV:exportCSV,exportBackup:exportBackup,handleCSVImportFile:handleCSVImportFile,cancelCSVImport:cancelCSVImport,confirmCSVImport:confirmCSVImport,renderCalendar:renderCalendar,calPrev:calPrev,calNext:calNext,calDayClick:calDayClick,openArsenalMod:openArsenalMod,closeArs:closeArs,saveArs:saveArs,requestLoadoutRemove:requestLoadoutRemove,cancelLoadoutRemove:cancelLoadoutRemove,confirmLoadoutRemove:confirmLoadoutRemove,toggleSound:toggleSound,formatTime24:formatTime24,formatTime12:formatTime12,gnSetShotMeridiem:gnSetShotMeridiem,gnShotClockLiveFormat:gnShotClockLiveFormat,gnNormalizeShotClockField:gnNormalizeShotClockField,gnWeightDateInput:gnWeightDateInput,gnWeightTimeInput:gnWeightTimeInput,gnOpenShotDatePicker:gnOpenShotDatePicker,gnCloseShotDatePicker:gnCloseShotDatePicker,gnDatePickerMove:gnDatePickerMove,gnSelectPickerDate:gnSelectPickerDate,gnSetShotDateFromPicker:gnSetShotDateFromPicker,gnSetShotDateValue:gnSetShotDateValue,gnSetShotTimeValue:gnSetShotTimeValue,gnMedRevealGroup:gnMedRevealGroup,updatePills:updatePills,selPill:selPill,initModules:initModules});

const modules=window.GNModules;

/* GRID//NODE stable app bootstrap
 * Auth UI, boot sequence, compatibility bridge for existing inline controls.
 */

let bootRunning = false;
let authMode = 'signin';
let passwordRecoveryActive = false;

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
    'exportCSV', 'exportBackup', 'handleCSVImportFile', 'cancelCSVImport', 'confirmCSVImport',
    'calPrev', 'calNext', 'calDayClick', 'openArsenalMod', 'closeArs', 'saveArs',
    'requestLoadoutRemove', 'cancelLoadoutRemove', 'confirmLoadoutRemove', 'toggleSound'
  ];
  names.forEach(name => { window[name] = modules[name]; });
  window.refreshAll = modules.refreshAll;
}

function injectStableStyles() {
  const style = document.createElement('style');
  style.id = 'gridnode-stable-runtime-styles';
  style.textContent = `
    .gn-stable-zone-picker{display:grid;gap:7px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,212,255,.12)}
    .gn-stable-zone-title{font:700 .58rem/1.2 var(--font-m,monospace);letter-spacing:2px;color:#00d4ff;margin-bottom:2px}
    .gn-stable-zone-btn{min-height:38px;padding:9px 10px;border:1px solid rgba(0,212,255,.2);background:rgba(0,212,255,.035);color:#9fc7d4;text-align:left;font:600 .68rem var(--font-m,monospace);letter-spacing:.5px;cursor:pointer;border-radius:3px}
    .gn-stable-zone-btn:hover,.gn-stable-zone-btn.selected{border-color:#00d4ff;background:rgba(0,212,255,.13);color:#fff;box-shadow:0 0 12px rgba(0,212,255,.12)}
    .gn-cloud-status{display:flex;align-items:center;gap:8px;margin:-10px 0 18px;padding:10px 12px;border:1px solid rgba(0,212,255,.16);background:rgba(0,212,255,.035);font:600 .6rem var(--font-m,monospace);letter-spacing:.8px;color:#8aa9b5}
    .gn-cloud-dot{width:7px;height:7px;border-radius:50%;background:#ffd700;box-shadow:0 0 8px currentColor;flex:0 0 auto}.gn-cloud-dot.cloud{background:#00ff88;color:#00ff88}.gn-cloud-dot.local{background:#ffd700;color:#ffd700}
    .gn-auth-card{width:min(100%,380px);padding:28px 22px;border:1px solid rgba(0,212,255,.24);border-top:2px solid #00d4ff;background:linear-gradient(180deg,rgba(14,14,22,.96),rgba(5,5,8,.98));box-shadow:0 16px 46px rgba(0,0,0,.45)}
    .gn-auth-kicker{font:700 .62rem var(--font-m,monospace);letter-spacing:3px;color:#00d4ff;text-align:center}.gn-auth-title{font:700 1.45rem var(--font-d,monospace);letter-spacing:3px;color:#fff;text-align:center;margin:10px 0 5px}.gn-auth-copy{font:.72rem/1.5 var(--font-m,monospace);color:#8295a0;text-align:center;margin:0 0 20px}
    .gn-auth-field{width:100%;box-sizing:border-box;margin:0 0 10px;padding:13px 12px;border:1px solid rgba(0,212,255,.2);background:#080810;color:#eeeef5;border-radius:3px;font:16px var(--font-m,monospace);outline:none}.gn-auth-field:focus{border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.1)}
    .gn-auth-primary,.gn-auth-secondary,.gn-auth-google{width:100%;min-height:46px;margin-top:8px;border-radius:3px;cursor:pointer;font:700 .68rem var(--font-d,monospace);letter-spacing:2px}.gn-auth-primary{border:0;background:linear-gradient(135deg,#ff3355,#c80036);color:#fff}.gn-auth-secondary{border:1px solid rgba(0,212,255,.35);background:transparent;color:#00d4ff}.gn-auth-google{border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);color:#00d4ff}.gn-auth-google:disabled{cursor:not-allowed;opacity:.55;border-color:rgba(130,149,160,.28);color:#8295a0;box-shadow:none}.gn-auth-links{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.gn-auth-link{padding:0;border:0;background:transparent;color:#8295a0;font:600 .58rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}.gn-auth-link:hover{color:#00d4ff}.gn-auth-message{min-height:22px;margin-top:14px;text-align:center;font:.62rem/1.4 var(--font-m,monospace);letter-spacing:.7px;color:#8295a0}.gn-auth-note{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);font:.56rem/1.5 var(--font-m,monospace);letter-spacing:.6px;color:#586d76;text-align:center}
    .gn-phase-row{display:flex;gap:12px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.07)}.gn-phase-index{font:700 .72rem var(--font-m,monospace);color:#ff3355}.gn-phase-row b{font:700 .72rem var(--font-d,monospace);letter-spacing:1px}.gn-phase-row p{margin:4px 0 0;color:#8295a0;font:.66rem/1.4 var(--font-m,monospace)}
    .gn-weight-record{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)}.gn-weight-record b{display:block;color:#00ff88;font:700 .78rem var(--font-d,monospace)}.gn-weight-record span,.gn-weight-record small{display:block;margin-top:3px;color:#8295a0;font:.6rem var(--font-m,monospace)}.gn-calendar-detail{padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07);font:.66rem var(--font-m,monospace);color:#9fc7d4}
    canvas{display:block;max-width:100%}
    @media(max-width:380px){.gn-auth-card{padding:24px 16px}.gn-stable-zone-btn{font-size:.62rem}}
  `;
  document.head.appendChild(style);
}

function authShell() {
  const login = $('login');
  if (!login) return;
  const recovering = authMode === 'recovery';
  login.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:0"><div class="gn-auth-card">
    <div class="gn-auth-kicker">// PERSONAL BIOTECH OPERATING SYSTEM //</div>
    <div class="gn-auth-title">${recovering ? 'RESET ACCESS' : 'JACK IN'}</div>
    <p class="gn-auth-copy">${recovering ? 'Enter a new password for this GRID//NODE cloud account.' : 'Use a cloud account when you want recovery across devices. Local session keeps your record on this device.'}</p>
    <form id="gnAuthForm" novalidate>
      <input class="gn-auth-field" id="gnAuthEmail" type="email" autocomplete="email" placeholder="EMAIL ADDRESS" aria-label="Email address"${recovering ? ' hidden' : ''}>
      <input class="gn-auth-field" id="gnAuthPassword" type="password" autocomplete="${recovering ? 'new-password' : 'current-password'}" placeholder="${recovering ? 'NEW PASSWORD' : 'PASSWORD'}" aria-label="${recovering ? 'New password' : 'Password'}">
      <button class="gn-auth-primary" id="gnAuthSubmit" type="submit">${recovering ? 'UPDATE PASSWORD' : 'SIGN IN TO CLOUD'}</button>
    </form>
    <div class="gn-auth-links"><button class="gn-auth-link" id="gnAuthModeToggle" type="button">${recovering ? 'BACK TO SIGN IN' : 'CREATE ACCOUNT'}</button>${recovering ? '' : '<button class="gn-auth-link" id="gnAuthReset" type="button">RESET PASSWORD</button>'}</div>
    ${recovering ? '' : '<button class="gn-auth-google" id="loginGoogleBtn" type="button">CONTINUE WITH GOOGLE</button><button class="gn-auth-secondary" id="gnLocalBtn" type="button">CONTINUE LOCALLY</button>'}
    <div class="gn-auth-message" id="loginMsg" role="status" aria-live="polite"></div>
    <div class="gn-auth-note">// VAULT POLICY: YOUR RECORD STAYS LOCAL UNTIL YOU CONNECT A CLOUD ACCOUNT // GRID//NODE DOES NOT PROVIDE MEDICAL ADVICE //</div>
  </div></div>`;
  $('gnAuthForm')?.addEventListener('submit', event => { event.preventDefault(); submitAuth(); });
  $('gnAuthModeToggle')?.addEventListener('click', toggleAuthMode);
  $('gnAuthReset')?.addEventListener('click', requestPasswordReset);
  $('loginGoogleBtn')?.addEventListener('click', handleGoogleSignIn);
  $('gnLocalBtn')?.addEventListener('click', enterLocalSession);
  updateAuthMode();
  refreshGoogleAuthState();
}

function updateAuthMode() {
  const submit = $('gnAuthSubmit'), toggle = $('gnAuthModeToggle');
  if (submit) submit.textContent = authMode === 'recovery' ? 'UPDATE PASSWORD' : authMode === 'signin' ? 'SIGN IN TO CLOUD' : 'CREATE CLOUD ACCOUNT';
  if (toggle) toggle.textContent = authMode === 'signin' ? 'CREATE ACCOUNT' : 'BACK TO SIGN IN';
}
function toggleAuthMode() { if (authMode === 'recovery') { passwordRecoveryActive = false; authMode = 'signin'; authShell(); return; } authMode = authMode === 'signin' ? 'signup' : 'signin'; updateAuthMode(); setAuthMessage('', false); }
function setAuthMessage(message, error = false) { const element = $('loginMsg'); if (element) { element.textContent = message; element.style.color = error ? '#ff5577' : '#8295a0'; } }

async function refreshGoogleAuthState() {
  const button = $('loginGoogleBtn');
  if (!button) return;
  button.disabled = true;
  button.textContent = 'CHECKING GOOGLE...';
  const enabled = await isCloudProviderEnabled('google');
  if (!button.isConnected) return;
  button.dataset.providerEnabled = enabled ? 'true' : 'false';
  button.disabled = !enabled;
  button.textContent = enabled ? 'CONTINUE WITH GOOGLE' : 'GOOGLE SIGN-IN SETUP PENDING';
  if (!enabled) setAuthMessage('// GOOGLE SIGN-IN IS NOT ENABLED YET — USE EMAIL OR CONTINUE LOCALLY', false);
}

async function requestPasswordReset() {
  const email = $('gnAuthEmail')?.value?.trim();
  if (!email || !email.includes('@')) { setAuthMessage('// ENTER YOUR ACCOUNT EMAIL FIRST', true); return; }
  const button = $('gnAuthReset'); if (button) button.disabled = true;
  try {
    await resetPasswordCloud(email);
    setAuthMessage('// RECOVERY LINK SENT — CHECK YOUR EMAIL', false);
  } catch (error) {
    setAuthMessage(error.message === 'CLOUD_UNAVAILABLE' ? '// CLOUD RECOVERY UNAVAILABLE — RETRY WHEN ONLINE' : `// RECOVERY ERROR: ${error.message || 'TRY AGAIN'}`, true);
  } finally { if (button) button.disabled = false; }
}

async function submitAuth() {
  const email = $('gnAuthEmail')?.value?.trim();
  const password = $('gnAuthPassword')?.value || '';
  if (authMode !== 'recovery' && (!email || !email.includes('@'))) { setAuthMessage('// ENTER A VALID EMAIL ADDRESS', true); return; }
  if (password.length < 8) { setAuthMessage('// PASSWORD MUST BE AT LEAST 8 CHARACTERS', true); return; }
  const submit = $('gnAuthSubmit'); if (submit) { submit.disabled = true; submit.textContent = 'CONNECTING...'; }
  try {
    if (authMode === 'recovery') {
      await updateCloudPassword(password);
      passwordRecoveryActive = false;
      const session = await getCloudSession();
      if (!session) throw new Error('RECOVERY_SESSION_EXPIRED');
      await completeCloudSession(session);
    } else if (authMode === 'signup') {
      const result = await signUpCloud(email, password);
      if (result?.session) { await completeCloudSession(result.session); } else { setAuthMessage('// ACCOUNT CREATED — CHECK YOUR EMAIL TO CONFIRM', false); }
    } else {
      const session = await signInCloud(email, password);
      if (!session) throw new Error('NO_SESSION');
      await completeCloudSession(session);
    }
  } catch (error) {
    setAuthMessage(error.message === 'CLOUD_UNAVAILABLE' ? '// CLOUD AUTH UNAVAILABLE — CONTINUE LOCALLY OR RETRY WHEN ONLINE' : `// AUTH ERROR: ${error.message || 'CHECK YOUR DETAILS'}`, true);
  } finally {
    if (submit) { submit.disabled = false; updateAuthMode(); }
  }
}

async function handleGoogleSignIn() {
  const button = $('loginGoogleBtn'); if (button) { button.disabled = true; button.textContent = 'CONNECTING...'; }
  setAuthMessage('// OPENING GOOGLE AUTHENTICATION...', false);
  try {
    await signInWithGoogle();
  } catch (error) {
    const disabled = error.message === 'GOOGLE_AUTH_DISABLED';
    setAuthMessage(disabled ? '// GOOGLE SIGN-IN IS NOT ENABLED YET — USE EMAIL OR CONTINUE LOCALLY' : error.message === 'CLOUD_UNAVAILABLE' ? '// GOOGLE AUTH UNAVAILABLE — CONTINUE LOCALLY OR RETRY WHEN ONLINE' : '// GOOGLE AUTH COULD NOT START — RETRY OR USE EMAIL', true);
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

function startGridNode() {
  if (bootRunning) return;
  bootRunning = true;
  modules.showScreen('boot');
  const term = $('bootTerm'), bar = $('bootBar'), pct = $('bootPct');
  if (term) term.innerHTML = '';
  if (bar) {
    bar.style.width = '100%';
    bar.querySelectorAll('.boot-prog-seg').forEach(segment => segment.classList.remove('on', 'lead'));
  }
  const messages = [
    ['> Initializing Personal Biotech OS', 'info', 'CORE HANDSHAKE'],
    ['> Preparing SHOTS', 'info', 'SHOTS ONLINE'],
    ['> Preparing Phase Engine', 'info', 'PHASE ENGINE ONLINE'],
    ['> Preparing RESULTS', 'info', 'RESULTS ONLINE'],
    ['> Preparing LAB + VAULT', 'info', 'LAB + VAULT ONLINE'],
    ['> Loading local records', 'warn', 'LOCAL RECORDS'],
    ['> Protocol workspace ready', 'ok', 'SYSTEM ONLINE']
  ];
  messages.forEach(([message, className, status], index) => setTimeout(() => {
    if (term) { const line = document.createElement('div'); line.className = `boot-line ${className}`; line.textContent = message; term.appendChild(line); term.scrollTop = term.scrollHeight; }
    const progress = Math.round((index + 1) / messages.length * 100);
    if (bar) {
      const activeSegments = Math.ceil(progress / 10);
      bar.querySelectorAll('.boot-prog-seg').forEach((segment, segmentIndex) => {
        segment.classList.toggle('on', segmentIndex < activeSegments);
        segment.classList.toggle('lead', segmentIndex === activeSegments - 1);
      });
    }
    if (pct) pct.textContent = `${String(progress).padStart(3, '0')}% // ${status}`;
  }, index * 180));
  setTimeout(() => { bootRunning = false; authShell(); modules.showScreen('login'); }, 1450);
}

function openSignOutModal() { $('signOutOverlay')?.style.setProperty('display', 'flex'); }
function closeSignOutModal() { $('signOutOverlay')?.style.setProperty('display', 'none'); }
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
  window.addEventListener('storage', event => { if (!event.key?.includes('_shots') && !event.key?.includes('_weights')) return; if (state.session) modules.refreshAll(); });
  window.addEventListener('error', event => console.warn('[GRID//NODE runtime]', event.error || event.message));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('/sw.js?v=20260718.6', { updateViaCache: 'none' })
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

document.addEventListener('DOMContentLoaded', async () => {
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

