/* GRID//NODE stable classic delivery bundle. Source remains modular in gridnode-core.js, gridnode-modules.js, and gridnode-app.js. */

/* GRID//NODE stable core
 * State, local persistence, session handling, and optional Supabase sync.
 * No UI code belongs in this file.
 */

const APP_VERSION = '2.1.7';

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
  if (state.accountKey !== 'local') return;
  for (const key of WORKSPACE_KEYS) {
    const current = localStorage.getItem(`gn_local_${key}`);
    if (current !== null) continue;
    const legacy = localStorage.getItem(`gn_0_${key}`);
    if (legacy !== null) localStorage.setItem(`gn_local_${key}`, legacy);
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
  return date.toLocaleDateString('en-US', options);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mdy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  const date = parseLocalDate(raw);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  { name: 'ONSET', support: 'Early cycle after the latest logged SHOT. New observations begin shaping this signal.', context: 'Early cycle after the latest logged SHOT. Your own appetite, energy, symptoms, and notes may begin shaping this signal.', color: '#00d4ff', start: 0, end: 0.08 },
  { name: 'ACTIVE', support: 'Estimated active-cycle window. Compare this point with your own earlier logged cycles.', context: 'Estimated active-cycle window. Compare this point with your own earlier logged observations.', color: '#00ff88', start: 0.08, end: 0.28 },
  { name: 'PEAK WINDOW', support: 'Estimated highest relative level in this cycle. This is not a laboratory measurement.', context: 'Estimated highest relative level in this cycle. Individual response varies; this is not a laboratory measurement.', color: '#ffd700', start: 0.28, end: 0.52 },
  { name: 'RESPONSE', support: 'A middle-cycle estimate built from timing and user-entered history.', context: 'A middle-cycle estimate built from timing and user-entered history.', color: '#ff8c00', start: 0.52, end: 0.76 },
  { name: 'DECAY', support: 'Estimated level is declining toward the next expected event. Individual response varies.', context: 'Estimated level is declining toward the next expected event. Watch your own logged patterns; individual response varies.', color: '#ff5577', start: 0.76, end: 0.94 },
  { name: 'BASELINE', support: 'Late-cycle estimate before the next expected event. Keep logging your own patterns.', context: 'Late-cycle estimate before the next expected event. Keep logging your own patterns.', color: '#9898b0', start: 0.94, end: 1 }
];

const RESEARCH_LIBRARY = Object.freeze([
  { category: 'RECOVERY & REPAIR', names: ['BPC-157', 'TB-500', 'Thymosin Beta-4', 'GHK-Cu', 'KPV'], context: 'RESEARCH-FOCUSED RECORDS · REGULATORY STATUS IS NOT VERIFIED HERE.' },
  { category: 'METABOLIC & BODY COMPOSITION', names: ['CJC-1295', 'Ipamorelin', 'Sermorelin', 'Tesamorelin', 'MOTS-c'], context: 'MIXED CONTEXT · SOME ENTRIES MAY HAVE SPECIFIC FDA-APPROVED INDICATIONS; OTHERS ARE RESEARCH-FOCUSED. VERIFY EACH ENTRY INDEPENDENTLY.' },
  { category: 'CELLULAR & MITOCHONDRIAL', names: ['SS-31', 'Elamipretide'], context: 'RESEARCH-FOCUSED RECORDS · REGULATORY STATUS IS NOT VERIFIED HERE.' },
  { category: 'IMMUNE & NEUROLOGICAL', names: ['Thymosin Alpha-1', 'Semax', 'Selank', 'Epitalon'], context: 'RESEARCH-FOCUSED RECORDS · REGULATORY STATUS IS NOT VERIFIED HERE.' }
]);

const DEVICE_STATUSES = Object.freeze(['READY', 'EMPTY', 'NEEDS CHECKING', 'FAILED', 'RETIRED', 'LOST']);
const EVENT_SOURCES = Object.freeze(['Manual Entry', 'Import', 'Device Reported', 'System Generated']);
const EVENT_STATES = Object.freeze(['User Confirmed', 'Needs Review', 'Corrected']);

function activeShots() { return getAllShots().filter(record => !record.archived); }
function sortedShots() { return activeShots().sort((a, b) => new Date(a.date) - new Date(b.date)); }
function sortedWeights() { return [...getWeights()].sort((a, b) => new Date(a.date) - new Date(b.date)); }
function latestShot() { return sortedShots().at(-1) || null; }
function latestWeight() { return sortedWeights().at(-1) || null; }
function deviceLabel(id) { return S.get('devices', []).find(device => device.id === id)?.name || ''; }

function showToast(message, isError = false) {
  const toast = $('toastEl');
  if (!toast) return;
  const prefix = isError ? '// SYSTEM CHECK — ' : 'NODE CONFIRMED — ';
  const displayMessage = /Shot (?:logged|updated)/.test(String(message))
    ? formatToastLocation(String(message))
    : String(message);
  toast.innerHTML = `<span class="gn-toast-message">${safeText(`${prefix}${displayMessage}`)}</span>`;
  toast.className = `toast active${isError ? ' err' : ''}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('active'), 2000);
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

function actionFeedback(title, detail, isError = false) {
  const toast = $('toastEl');
  if (!toast) return;
  toast.innerHTML = `<span class="gn-toast-message">${safeText(`${isError ? '// SYSTEM CHECK — ' : 'NODE CONFIRMED — '}${title}${detail ? ` · ${detail}` : ''}`)}</span>`;
  toast.className = `toast active${isError ? ' err' : ''}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('active'), 2000);
}

function nodeSyncLabel() {
  if (state.cloudStatus === 'CLOUD_SYNCED') return 'CLOUD SYNCED';
  if (state.cloudStatus === 'CLOUD_CONNECTED') return 'SYNCING';
  if (state.cloudStatus === 'LOCAL_BACKUP') return 'LOCAL BACKUP';
  return 'LOCAL MODE';
}

function nodeDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'NOT AVAILABLE';
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function nodePhaseDay(lastShot) {
  if (!lastShot) return 'Awaiting first SHOT';
  const elapsedDays = Math.max(0, (Date.now() - new Date(lastShot.date).getTime()) / 86400000);
  if (!Number.isFinite(elapsedDays)) return 'Awaiting verified timing';
  return `DAY ${Math.floor(elapsedDays) + 1} · ${elapsedDays < 1 ? 'RECENT EVENT' : `${Math.floor(elapsedDays)}d since SHOT`}`;
}

function refreshNodeHeader({ phase } = {}) {
  const sync = nodeSyncLabel();
  const phaseLabel = phase?.name || 'AWAITING FIRST SHOT';
  setText('nodeHeaderPhase', phaseLabel);
  setText('nodeHeaderState', sync);
}

function appendEventLedger(event) {
  const ledger = S.get('eventLedger', []);
  ledger.push({ id: createId('event'), createdAt: new Date().toISOString(), source: 'Manual Entry', state: 'User Confirmed', ...event });
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
  syncIdentityAvatars();
  setText('dashSub', `// ${window.CU?.defaultName || profile.name || 'NODE_USER'} // NODE ONLINE`);
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

function syncIdentityAvatars() {
  const avatarUrl = window.CU?.avatarUrl || '/assets/gridnode-icon.svg';
  ['topAvaIcon', 'profAvaIcon'].forEach(id => {
    const image = $(id);
    if (!image) return;
    image.src = avatarUrl;
    image.alt = avatarUrl === '/assets/gridnode-icon.svg' ? 'GRID//NODE NODE mark' : 'Google account profile photo';
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
  if (date && !date.value) date.value = todayISO();
  if (time && !time.value) time.value = formatTime12(now);
  if (wtDate && !wtDate.value) wtDate.value = todayISO();
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
  setText('profBMICat', '');
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
  ensureWandaDashboard();
  const shots = sortedShots();
  const weights = sortedWeights();
  const lastShot = shots.at(-1);
  const lastWeight = weights.at(-1);
  const profile = getProfile();
  const weightMetrics = computeTotalChange(weights, profile, 'profile');
  setText('stShots', shots.length);
  setText('stDose', lastShot?.dose ? `${lastShot.dose}mg` : '—');
  setText('stDoseDate', lastShot ? formatDate(lastShot.date, { month: 'short', day: 'numeric' }) : 'NO DATA');
  const next = nextShotDate(lastShot, profile);
  setText('stNext', next ? formatDate(next, { month: 'short', day: 'numeric' }) : '—');
  setText('stNextSub', next ? 'ESTIMATED FROM PROFILE' : 'LOG A SHOT');
  const nextCard = $('nextShotStatCard');
  if (nextCard) nextCard.classList.remove('gn-next-today', 'gn-next-tomorrow', 'gn-next-overdue');
  if (next) {
    const deltaDays = Math.round((parseLocalDate(next).getTime() - parseLocalDate(todayISO()).getTime()) / 86400000);
    if (deltaDays === 0) { nextCard?.classList.add('gn-next-today'); setText('stNextSub', '// TODAY'); }
    else if (deltaDays === 1) { nextCard?.classList.add('gn-next-tomorrow'); setText('stNextSub', 'TOMORROW'); }
    else if (deltaDays < 0) { nextCard?.classList.add('gn-next-overdue'); setText('stNextSub', '// OVERDUE'); }
  }
  const todayShot = shots.find(record => record.date?.slice(0, 10) === todayISO());
  const todayWeight = weights.find(record => record.date?.slice(0, 10) === todayISO());
  setText('todayShot', todayShot ? `${todayShot.dose || '—'}mg logged` : 'TAP TO LOG');
  setText('todayWt', todayWeight ? `${Number(todayWeight.weight).toFixed(1)} lb` : 'TAP TO LOG');
  const currentWeight = weightMetrics.currentWeight || 0;
  const change = weightMetrics.change;
  const goalGap = Number(profile.goalWt) && currentWeight ? currentWeight - Number(profile.goalWt) : null;
  setText('s6TotalLabel', 'TOTAL CHANGE');
  setText('s6TotalBasis', weightMetrics.basis === 'from profile start weight' ? '(from profile start)' : '(from first recorded weight)');
  setText('s6Total', change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)} lb`);
  const dashboardBMI = calcBMIValue(currentWeight, profile);
  setText('s6BMI', dashboardBMI || '');
  setDisplay('s6BMICard', Boolean(dashboardBMI));
  setText('s6Wt', currentWeight ? `${currentWeight.toFixed(1)} lb` : '—');
  setText('s6Pct', weightMetrics.percentLost === null ? '—' : `${weightMetrics.percentLost.toFixed(1)}%`);
  setText('s6Avg', weightMetrics.weeklyAverage === null ? '—' : `${weightMetrics.weeklyAverage.toFixed(1)} lb/wk`);
  setText('s6Goal', goalGap === null ? '—' : `${Math.max(0, goalGap).toFixed(1)} lb`);
  const phase = renderPhase(lastShot, shots);
  renderProtocolCurve(shots, phase);
  refreshNodeHeader({ lastShot, next, phase, currentWeight: lastWeight?.weight });
  setText('streakText', shots.length ? `${shots.length} SHOT${shots.length === 1 ? '' : 'S'} IN YOUR LOCAL RECORD` : 'NO SHOT CADENCE YET · LOG YOUR FIRST SHOT');
  drawCanvasChart($('dashWtChart'), weights.map(item => Number(item.weight)), '#00d4ff');
  renderWandaDashboard({ shots, weights, lastShot, lastWeight, profile, next, phase, weightMetrics, goalGap });
}

function ensureWandaDashboard() {
  const header = $('pageDash')?.querySelector('.page-hdr');
  if (!header || $('gnWandaDashboard')) return;
  header.insertAdjacentHTML('afterend', `<section id="gnWandaDashboard" aria-label="Current protocol signals"><div class="gn-wanda-grid">
    <button class="gn-wanda-card" id="gnWandaNext" type="button" onclick="openLogModal()"><span class="gn-wanda-label">NEXT SHOT</span><b class="gn-wanda-value" id="gnWandaNextValue">LOG A SHOT</b><small class="gn-wanda-note" id="gnWandaNextNote">Log a shot to start your timeline</small></button>
    <button class="gn-wanda-card" id="gnWandaPhase" type="button" onclick="showPhasesModal()"><span class="gn-wanda-label">CURRENT PHASE</span><b class="gn-wanda-value" id="gnWandaPhaseValue">START WITH A SHOT</b><small class="gn-wanda-note">Educational estimate</small></button>
    <button class="gn-wanda-card" id="gnWandaWeight" type="button" onclick="openWeightModal()"><span class="gn-wanda-label">CURRENT WEIGHT</span><b class="gn-wanda-value" id="gnWandaWeightValue">LOG A WEIGHT</b><small class="gn-wanda-note">Latest record</small></button>
    <button class="gn-wanda-card" id="gnWandaLevel" type="button" onclick="showPhasesModal()"><span class="gn-wanda-label">RELATIVE LEVEL</span><b class="gn-wanda-value" id="gnWandaLevelValue">START WITH A SHOT</b><small class="gn-wanda-note">Estimated, not measured</small></button>
    <button class="gn-wanda-card" id="gnWandaRate" type="button" onclick="showPage('Results',document.getElementById('navRes'))"><span class="gn-wanda-label">WEEKLY RATE</span><b class="gn-wanda-value" id="gnWandaRateValue">KEEP LOGGING</b><small class="gn-wanda-note">Keep logging - data builds over time</small></button>
    <button class="gn-wanda-card" id="gnWandaGoal" type="button" onclick="showPage('Profile',document.getElementById('navPro'))"><span class="gn-wanda-label">TO GOAL</span><b class="gn-wanda-value" id="gnWandaGoalValue">SET GOAL</b><small class="gn-wanda-note">From latest weight</small></button>
  </div><div class="gn-wanda-actions"><button type="button" onclick="openLogModal()">LOG SHOT</button><button type="button" onclick="openWeightModal()">LOG WEIGHT</button></div><div class="gn-streak-card" id="gnStreakCard" hidden><b id="gnStreakValue"></b><span id="gnStreakCopy"></span></div></section>`);
  ['.stat-row', '.weight-quick', '.stats-6', '#dashAdherence', '#dashWtChart'].forEach(selector => {
    const element = $('pageDash')?.querySelector(selector);
    if (element) element.closest('.chart-wrap')?.style.setProperty('display', 'none') || element.style.setProperty('display', 'none');
  });
  qa('#pageDash > .sec-hdr').slice(0, 2).forEach(element => element.style.display = 'none');
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
  const card = $('gnStreakCard');
  if (!card) return;
  const weeks = calculateShotStreak(shots);
  if (weeks < 2) { card.hidden = true; return; }
  const due = next || new Date(Math.max(...shots.map(item => new Date(item.date).getTime()).filter(Number.isFinite)) + 604800000).toISOString();
  card.hidden = false;
  setText('gnStreakValue', `${weeks} WEEK${weeks === 1 ? '' : 'S'} IN A ROW ✓`);
  setText('gnStreakCopy', `Log your next shot by ${formatDate(due, { month: 'short', day: 'numeric' })} to keep your streak alive.`);
}

function renderWandaDashboard({ shots, lastShot, lastWeight, next, phase, weightMetrics, goalGap }) {
  setText('gnWandaNextValue', next ? formatDate(next, { month: 'short', day: 'numeric' }) : 'LOG A SHOT');
  let nextNote = 'Log a shot to start your timeline';
  const nextCard = $('gnWandaNext');
  nextCard?.classList.remove('attention', 'empty');
  if (next) {
    const delta = Math.round((parseLocalDate(next).getTime() - parseLocalDate(todayISO()).getTime()) / 86400000);
    nextNote = delta < 0 ? `${Math.abs(delta)}d past expected` : delta === 0 ? 'Expected today' : delta === 1 ? 'Expected tomorrow' : `Expected in ${delta}d`;
    nextCard?.classList.toggle('attention', delta <= 0);
  } else nextCard?.classList.add('empty');
  setText('gnWandaNextNote', nextNote);
  setText('gnWandaPhaseValue', phase?.name || 'START WITH A SHOT');
  setText('gnWandaWeightValue', lastWeight ? `${Number(lastWeight.weight).toFixed(1)} lb` : 'LOG A WEIGHT');
  setText('gnWandaLevelValue', phase?.name || 'START WITH A SHOT');
  setText('gnWandaRateValue', weightMetrics.weeklyAverage === null ? 'KEEP LOGGING' : `${weightMetrics.weeklyAverage.toFixed(1)} lb/wk`);
  setText('gnWandaGoalValue', goalGap === null ? 'SET GOAL' : `${Math.max(0, goalGap).toFixed(1)} lb`);
  $('gnWandaPhase')?.classList.toggle('empty', !phase);
  $('gnWandaWeight')?.classList.toggle('empty', !lastWeight);
  $('gnWandaLevel')?.classList.toggle('empty', !phase);
  $('gnWandaRate')?.classList.toggle('empty', weightMetrics.weeklyAverage === null);
  $('gnWandaGoal')?.classList.toggle('empty', goalGap === null);
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
    setText('phaseNameTxt', 'YOUR GRID IS EMPTY');
    setText('phaseNumTxt', 'INITIATE PROTOCOL — log first shot');
    setText('phaseTimeSince', '—');
    setText('phaseCyclePosition', '—');
    setText('ringDays', '—');
    setText('ringPct', 'TAP FAB // LOG FIRST SHOT');
    setText('phaseContextText', 'Log a SHOT to see educational cycle context grounded in your own records.');
    setText('phaseNext', '> INITIATE PROTOCOL — log first shot');
    setText('pibBody', 'Awaiting first logged SHOT — protocol initializes on first record.');
    const emptyMarker = $('phaseMarker');
    if (emptyMarker) emptyMarker.hidden = true;
    return null;
  }
  const elapsedDays = Math.max(0, (Date.now() - new Date(lastShot.date).getTime()) / 86400000);
  const cyclePosition = Math.min((elapsedDays % 7) / 7, 0.999);
  const phase = PHASES.find(item => cyclePosition >= item.start && cyclePosition < item.end) || PHASES.at(-1);
  const since = elapsedDays < 1 ? `${Math.round(elapsedDays * 24)}h` : `${Math.floor(elapsedDays)}d ${Math.floor((elapsedDays % 1) * 24)}h`;
  setText('phaseNameTxt', phase.name);
  setText('phaseNumTxt', `PHASE ${PHASES.indexOf(phase) + 1} / ${PHASES.length}`);
  setText('phaseSupportTxt', phase.support);
  setText('phaseContextText', phase.context);
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
  const marker = $('phaseMarker');
  if (marker) {
    const angle = (cyclePosition * Math.PI * 2) - (Math.PI / 2);
    marker.style.left = `${50 + (Math.cos(angle) * 45)}%`;
    marker.style.top = `${50 + (Math.sin(angle) * 45)}%`;
    marker.style.background = phase.color;
    marker.style.color = phase.color;
    marker.hidden = false;
  }
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

function ensureShotHistoryFilters() {
  const controls = $('shotHistoryControls');
  if (!controls || $('gnShotFilters')) return;
  controls.insertAdjacentHTML('afterend', `<details class="gn-shot-filters" id="gnShotFilters"><summary>FILTER SHOT HISTORY <span class="gn-filter-count" id="gnShotFilterCount"></span></summary><div class="gn-shot-filter-grid"><label>MEDICATION<select id="gnShotFilterMedication"><option value="">ALL MEDICATIONS</option></select></label><label>LOCATION<select id="gnShotFilterSite"><option value="">ALL LOCATIONS</option></select></label><label>DATE RANGE<select id="gnShotFilterRange"><option value="all">ALL TIME</option><option value="30">LAST 30 DAYS</option><option value="90">LAST 90 DAYS</option><option value="year">THIS YEAR</option></select></label><label>NOTES SEARCH<input id="gnShotFilterQuery" type="search" placeholder="Search notes"></label></div><button type="button" class="gn-shot-filter-clear" id="gnShotFilterClear" hidden>CLEAR ALL FILTERS</button></details>`);
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
  const cutoff = filters.range === '30' || filters.range === '90' ? Date.now() - Number(filters.range) * 86400000 : filters.range === 'year' ? new Date(new Date().getFullYear(), 0, 1).getTime() : null;
  return records.filter(record => {
    if (filters.medication && (record.med || 'Custom') !== filters.medication) return false;
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
  if (med) { const values = [...new Set(records.map(record => record.med || 'Custom'))].sort(); med.innerHTML = '<option value="">ALL MEDICATIONS</option>' + values.map(value => `<option value="${safeText(value)}">${safeText(MEDICATIONS[value] || value)}</option>`).join(''); med.value = filters.medication; }
  if (site) { const values = [...new Set(records.map(record => record.site).filter(Boolean))].sort(); site.innerHTML = '<option value="">ALL LOCATIONS</option>' + values.map(value => `<option value="${safeText(value)}">${safeText(value)}</option>`).join(''); site.value = filters.site; }
  const query = $('gnShotFilterQuery'); if (query && query.value !== filters.query) query.value = filters.query;
  const range = $('gnShotFilterRange'); if (range) range.value = filters.range;
  const count = Object.values(filters).filter(value => value && value !== 'all').length;
  setText('gnShotFilterCount', count ? `${count} FILTER${count === 1 ? '' : 'S'} ACTIVE` : '');
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
  syncCustomPickers($('gnShotFilters') || document);
  setText('shotHistoryHelper', moduleState.shotHistoryView === 'archived' ? 'Archived records remain stored for review and can be restored.' : 'Active SHOT records are retained in your local VAULT.');
  qa('[data-shot-history-view]').forEach(button => button.classList.toggle('active', button.dataset.shotHistoryView === moduleState.shotHistoryView));
  if (!visible.length) {
    const activeFilters = Object.values(moduleState.shotFilters).some(value => value && value !== 'all');
    list.innerHTML = `<div class="empty"><span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-protocol-event"></use></svg></span></span>${activeFilters ? 'NO SHOTS MATCH THESE FILTERS.' : moduleState.shotHistoryView === 'archived' ? 'NO ARCHIVED SHOTS' : 'NO SHOTS LOGGED YET'}${activeFilters ? '<br><button class="btn-full btn-secondary empty-cta" type="button" id="gnShotFilterEmptyClear">CLEAR FILTERS</button>' : '<br><button class="btn-full btn-primary empty-cta" type="button" data-empty-shot>LOG YOUR FIRST SHOT</button>'}</div>`;
    $('gnShotFilterEmptyClear')?.addEventListener('click', () => { moduleState.shotFilters = { medication: '', site: '', range: 'all', query: '' }; renderShots(); });
    return;
  }
  list.innerHTML = visible.map(record => {
    const archived = Boolean(record.archived);
    return `<article class="log-entry ${archived ? 'archived' : ''}">
      <div class="log-main"><div><div class="log-date">${archived ? 'ARCHIVED ' : ''}${safeText(formatDateTime(record.date))}</div><div class="log-med">${safeText(MEDICATIONS[record.med] || record.med || 'CUSTOM')}</div></div>
      <div class="log-dose">${safeText(record.dose || '—')}mg</div></div>
      <div class="log-chips">${record.site ? `<span class="log-chip lc-site">${safeText(record.site)}</span>` : ''}${record.deviceId ? `<span class="log-chip lc-site">DEVICE: ${safeText(deviceLabel(record.deviceId) || 'UNKNOWN')}</span>` : ''}${record.wt ? `<span class="log-chip lc-wt">${safeText(record.wt)}lb</span>` : ''}${record.se?.length ? `<span class="log-chip lc-se">${safeText(record.se.join(', '))}</span>` : ''}</div>
      ${record.notes ? `<div class="log-notes">${safeText(record.notes)}</div>` : ''}
      <div class="log-actions">${archived ? `<button type="button" class="log-action-btn" data-shot-action="restore-edit" data-shot-id="${safeText(record.id)}">RESTORE TO EDIT</button>` : `<button type="button" class="log-action-btn" data-shot-action="edit" data-shot-id="${safeText(record.id)}">EDIT</button><button type="button" class="log-action-btn del" data-shot-action="archive" data-shot-id="${safeText(record.id)}">ARCHIVE</button>`}</div>
      ${archived ? '<div class="shot-history-helper">Restore the record before editing.</div>' : ''}
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
  const asset = $('scannerBodyAsset');
  if (asset) {
    const frontAsset = asset.dataset.front || asset.getAttribute('src');
    if (frontAsset) asset.dataset.front = frontAsset;
    asset.src = moduleState.scannerMode === 'upper' ? (asset.dataset.back || '/assets/scanner-body-rear.jpg') : frontAsset;
  }
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
  if (!modal.querySelector('[data-gn-shot-step="timing"]')) {
    modal.querySelector('.gn-shot-datetime-group')?.insertAdjacentHTML('afterbegin', '<div class="gn-log-step" data-gn-shot-step="timing">01 // TIMING</div>');
    $('cpShotMed')?.closest('.form-group')?.insertAdjacentHTML('afterbegin', '<div class="gn-log-step" data-gn-shot-step="protocol">02 // PROTOCOL</div>');
    $('modalSelectedLocation')?.closest('.form-group')?.insertAdjacentHTML('afterbegin', '<div class="gn-log-step" data-gn-shot-step="location">03 // LOCATION</div>');
  }
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
  renderShotDevicePicker();
  modal.classList.add('active');
}

function renderShotDevicePicker(selectedId = '') {
  const picker = $('shotDeviceId');
  if (!picker) return;
  const devices = S.get('devices', []).filter(device => !device.archived);
  picker.innerHTML = `<option value="">Unknown / Not applicable</option>${devices.map(device => `<option value="${safeText(device.id)}">${safeText(device.name)} · ${safeText(device.status || 'READY')}</option>`).join('')}`;
  picker.value = selectedId || '';
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
  renderShotDevicePicker(record.deviceId || '');
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

function restoreArchivedShotToEdit(id) {
  restoreArchivedShot(id);
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
    med, dose, site, deviceId: $('shotDeviceId')?.value || null, wt: Number($('sWt')?.value) || null,
    notes: $('sNotes')?.value?.trim() || null,
    se: qa('#logOv input[type="checkbox"]:checked').map(input => input.value),
    archived: false, archivedAt: null, createdAt: existing?.createdAt || new Date().toISOString(),
    source: existing?.source || 'Manual Entry', state: existing?.state || 'User Confirmed'
  };
  const all = getAllShots();
  const index = all.findIndex(item => item.id === record.id);
  reconcileInventoryForShot(record, existing);
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
  appendEventLedger({ type: 'SHOT', recordId: record.id, date: record.date, label: existing ? 'SHOT UPDATED' : 'SHOT EVENT CONFIRMED' });
  moduleState.pendingFutureShot = false;
  $('futureTimestampConfirm')?.classList.remove('active');
  closeLog();
  refreshAll();
  showToast(`${existing ? 'Shot updated' : 'Shot logged'} · ${site} ✓`);
}

function reconcileInventoryForShot(record, existing) {
  const inventory = S.get('inventory', []);
  let changed = false;
  if (existing?.inventoryDeduction?.itemId && Number(existing.inventoryDeduction.amount) > 0) {
    const previousItem = inventory.find(item => item.id === existing.inventoryDeduction.itemId);
    if (previousItem) { previousItem.quantity = Number(previousItem.quantity || 0) + Number(existing.inventoryDeduction.amount); changed = true; }
  }
  delete record.inventoryDeduction;
  const medKey = String(record.med || '').toLowerCase();
  const item = inventory.find(candidate => !candidate.archived && candidate.autoDeduct && String(candidate.units || '').toLowerCase() === 'mg' && String(candidate.medication || candidate.name || '').toLowerCase().includes(medKey));
  if (item && Number(item.quantity) >= Number(record.dose)) {
    item.quantity = Number(item.quantity) - Number(record.dose);
    item.modifiedAt = new Date().toISOString();
    item.history = [...(item.history || []), { at: item.modifiedAt, action: `AUTO-DEDUCTED ${record.dose} mg FOR SHOT`, source: 'System Generated', shotId: record.id }];
    record.inventoryDeduction = { itemId: item.id, amount: Number(record.dose), unit: 'mg' };
    changed = true;
  }
  if (changed) { S.set('inventory', inventory); queueCloudSync('workspace'); }
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
  syncCustomPickers(document);
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
  const previousWeight = sortedWeights().at(-1)?.weight;
  const milestone = weightMilestone(previousWeight, weight, getProfile());
  const record = { id: createId('weight'), date: `${date}T${$('wtTime')?.value || '12:00'}`, weight, weightKg: moduleState.weightUnit === 'kg' ? raw : raw / 2.2046226218, unit: moduleState.weightUnit, notes: $('wtNotes')?.value?.trim() || null, source: 'Manual Entry', state: 'User Confirmed' };
  const weights = getWeights(); weights.push(record); S.set('weights', weights); queueCloudSync('weight', record);
  appendEventLedger({ type: 'WEIGHT', recordId: record.id, date: record.date, label: 'RESULTS UPDATED' });
  closeWt();
  if ($('wtVal')) $('wtVal').value = '';
  if ($('wtNotes')) $('wtNotes').value = '';
  refreshAll();
  if (milestone) celebrateMilestone(milestone.type, milestone.value);
  else actionFeedback('RESULTS UPDATED', 'NEW DATA POINT CAPTURED // PROGRESS TIMELINE EXPANDED');
}

function renderResults() {
  ensureResultsEnhancements();
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
  setText('resLatestAppetite', 'LOG OBSERVATIONS');
  setText('resLatestEnergy', 'LOG OBSERVATIONS');
  setText('resContinuityEvents', String(shots.length));
  setText('resContinuityRecent', latestShot() ? formatDate(latestShot().date, { month: 'short', day: 'numeric' }) : '—');
  setText('resContinuityActive', String(shots.length));
  setText('r6TotalLabel', 'TOTAL CHANGE');
  setText('r6TotalBasis', weightMetrics.basis === 'from profile start weight' ? '(from profile start)' : '(from first recorded weight)');
  setText('r6Total', change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)} lb`);
  const resultsBMI = calcBMIValue(latest?.weight, profile);
  setText('r6BMI', resultsBMI || '');
  setDisplay('r6BMICard', Boolean(resultsBMI));
  setText('r6Wt', latest ? `${latest.weight.toFixed(1)} lb` : '—');
  setText('r6Pct', weightMetrics.percentLost === null ? '—' : `${weightMetrics.percentLost.toFixed(1)}%`);
  setText('r6Avg', weightMetrics.weeklyAverage === null ? '—' : `${weightMetrics.weeklyAverage.toFixed(1)} lb/wk`);
  setText('r6Goal', profile.goalWt && latest ? `${Math.max(0, latest.weight - Number(profile.goalWt)).toFixed(1)} lb` : '—');
  const wtChartValue = $('wtChartVal');
  if (wtChartValue) wtChartValue.innerHTML = latest ? `${latest.weight.toFixed(1)}<span>lbs current</span>` : '—';
  const direction = $('resWeightDirection');
  if (direction) { direction.textContent = directionReady ? `Trend direction: ${change < 0 ? 'Downward' : change > 0 ? 'Upward' : 'Stable'} across logged measurements` : 'Trend direction: INSUFFICIENT DATA'; direction.className = `results-direction ${!directionReady ? 'insufficient' : change <= 0 ? 'good' : 'warn'}`; }
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
  list.innerHTML = [...weights].reverse().map(record => `<div class="gn-weight-record"><div><b>${record.weight.toFixed(1)} lb</b><span>${safeText(formatDateTime(record.date))}</span>${record.notes ? `<small>${safeText(record.notes)}</small>` : ''}</div></div>`).join('');
}

function filterWeightsForChart(weights) {
  const range = moduleState.weightRange;
  if (range === 'all') return weights;
  const days = range === '1m' ? 30 : range === '3m' ? 90 : 180;
  const cutoff = Date.now() - days * 86400000;
  return weights.filter(record => new Date(record.date).getTime() >= cutoff);
}

function ensureResultsEnhancements() {
  const ledger = $('pageResults')?.querySelector('.results-ledger');
  if (ledger && !$('gnWeeklyReport')) ledger.insertAdjacentHTML('afterbegin', `<section class="gn-weekly-report" id="gnWeeklyReport"><div class="gn-foundation-kicker">// WEEKLY NODE REPORT</div><h3 id="gnWeeklyTitle">MORE HISTORY NEEDED</h3><p id="gnWeeklyCopy">Log a shot or log your weight to begin building your SIGNAL.</p><div class="gn-weekly-signals" id="gnWeeklySignals"></div><div class="gn-weekly-actions" id="gnWeeklyActions"><button type="button" onclick="handleShotFab()">LOG SHOT</button><button type="button" onclick="openWeightModal()">LOG WEIGHT</button></div></section><div class="gn-reference-pending"><strong>REFERENCE DATA NOT LOADED</strong><br>Clinical comparison remains off until a medication-specific, source-verified dataset and uncertainty model are available. Your SIGNAL uses your own logged history.</div>`);
  const weightCard = $('weightRecordsPanel')?.closest('.results-card');
  if (weightCard && !$('measurementTrendCard')) weightCard.insertAdjacentHTML('afterend', `<section class="results-card" id="measurementTrendCard"><div class="results-card-title"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-biometric-gauge"></use></svg></span>MEASUREMENTS</div><div class="results-card-sub">Latest user-entered body measurements</div><div id="measurementTrendList" class="gn-measurement-trend-list"></div><div id="measurementTrendEmpty" class="results-empty">No measurements logged yet.</div></section>`);
  const chart = $('wtChart');
  if (chart && !$('weightTrendChartSummary')) chart.parentElement?.insertAdjacentHTML('afterend', '<div class="results-copy" id="weightTrendChartSummary">Log weight to build your trend.</div>');
}

function renderWeeklyReport(shots, weights) {
  if (!$('gnWeeklyReport')) return;
  if (shots.length < 2) {
    setText('gnWeeklyTitle', 'MORE HISTORY NEEDED');
    setText('gnWeeklyCopy', 'Log a shot or log your weight to begin building your SIGNAL.');
    if ($('gnWeeklySignals')) $('gnWeeklySignals').innerHTML = '';
    setDisplay('gnWeeklyActions', true);
    return;
  }
  const cutoff = Date.now() - 7 * 86400000;
  const weekShots = shots.filter(item => new Date(item.date).getTime() >= cutoff);
  const weekWeights = weights.filter(item => new Date(item.date).getTime() >= cutoff);
  const observations = weekShots.flatMap(item => item.se || []);
  const change = weekWeights.length > 1 ? Number(weekWeights.at(-1).weight) - Number(weekWeights[0].weight) : null;
  setText('gnWeeklyTitle', 'YOUR LAST 7 DAYS');
  setText('gnWeeklyCopy', 'This report summarizes only your logged timeline. Gaps remain visible and no clinical comparison is inferred.');
  if ($('gnWeeklySignals')) $('gnWeeklySignals').innerHTML = `<span>SHOT EVENTS<b>${weekShots.length}</b></span><span>WEIGHT CHANGE<b>${change === null ? 'NOT ENOUGH DATA' : `${change > 0 ? '+' : ''}${change.toFixed(1)} lb`}</b></span><span>OBSERVATIONS<b>${observations.length || 'NONE LOGGED'}</b></span>`;
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
  list.innerHTML = rows.map(record => `<div class="gn-measurement-trend-row"><b>${safeText(record.type)}</b><span>${Number(record.value).toFixed(1)} ${safeText(record.unit)}</span></div>`).join('');
}

function drawWeightTrendChart(canvas, weights, shots, goal) {
  const summary = $('weightTrendChartSummary');
  if (!canvas) return;
  const width = Math.max(280, canvas.clientWidth || 320), height = Math.max(200, canvas.clientHeight || 220), scale = window.devicePixelRatio || 1;
  canvas.width = width * scale; canvas.height = height * scale;
  const context = canvas.getContext('2d'); if (!context) return;
  context.setTransform(scale, 0, 0, scale, 0, 0); context.clearRect(0, 0, width, height);
  if (!weights.length) { if (summary) summary.textContent = 'Log weight to build your trend.'; return; }
  const left = 42, right = 12, top = 16, bottom = 30, plotWidth = width - left - right, plotHeight = height - top - bottom;
  const values = weights.map(item => Number(item.weight));
  const minValue = Math.min(...values, Number(goal) || Infinity), maxValue = Math.max(...values, Number(goal) || -Infinity);
  const padding = Math.max(1, (maxValue - minValue || 1) * .14), min = minValue - padding, max = maxValue + padding, span = max - min || 1;
  const xFor = index => weights.length === 1 ? left + plotWidth / 2 : left + (index / (weights.length - 1)) * plotWidth;
  const yFor = value => top + (max - Number(value)) / span * plotHeight;
  context.font = '10px Share Tech Mono, monospace'; context.fillStyle = '#8295a0'; context.strokeStyle = 'rgba(255,255,255,.10)'; context.lineWidth = 1;
  for (let index = 0; index <= 3; index++) { const y = top + plotHeight * index / 3; context.beginPath(); context.moveTo(left, y); context.lineTo(width - right, y); context.stroke(); context.fillText(`${(max - (span * index / 3)).toFixed(1)}`, 4, y + 3); }
  if (Number(goal) > 0) { const goalY = yFor(goal); context.save(); context.setLineDash([5, 4]); context.strokeStyle = 'rgba(255,215,0,.55)'; context.beginPath(); context.moveTo(left, goalY); context.lineTo(width - right, goalY); context.stroke(); context.restore(); }
  context.strokeStyle = '#00E6F0'; context.shadowColor = '#00E6F0'; context.shadowBlur = 7; context.lineWidth = 2; context.beginPath();
  values.forEach((value, index) => { const x = xFor(index), y = yFor(value); if (!index) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke(); context.shadowBlur = 0;
  context.fillStyle = '#00E6F0'; values.forEach((value, index) => { context.beginPath(); context.arc(xFor(index), yFor(value), 3, 0, Math.PI * 2); context.fill(); });
  const start = parseLocalDate(weights[0].date), end = parseLocalDate(weights.at(-1).date); context.fillStyle = '#8295a0'; context.fillText(formatDate(start, { month: 'short', day: 'numeric' }), left, height - 8); context.textAlign = 'right'; context.fillText(formatDate(end, { month: 'short', day: 'numeric' }), width - right, height - 8); context.textAlign = 'left';
  let priorDose = null;
  shots.forEach(shot => {
    const time = parseLocalDate(shot.date).getTime();
    const dose = Number(shot.dose) || priorDose;
    if (!Number.isFinite(time) || time < start.getTime() || time > end.getTime()) { priorDose = dose; return; }
    const nearest = weights.reduce((best, item, index) => Math.abs(parseLocalDate(item.date).getTime() - time) < Math.abs(parseLocalDate(weights[best].date).getTime() - time) ? index : best, 0);
    const changed = priorDose !== null && dose !== priorDose;
    context.fillStyle = changed ? '#ffd700' : '#ff3355';
    context.beginPath(); context.arc(xFor(nearest), yFor(values[nearest]), changed ? 6 : 4, 0, Math.PI * 2); context.fill();
    if (changed) { context.fillStyle = '#ffd700'; context.font = '9px Share Tech Mono, monospace'; context.fillText('DOSE', Math.min(width - 38, xFor(nearest) + 5), Math.max(10, yFor(values[nearest]) - 7)); }
    priorDose = dose;
  });
  const profileStart = Number(getProfile().startWt) || values[0];
  [5, 10, 15, 20].forEach(percent => {
    const target = profileStart * (1 - percent / 100);
    const firstIndex = values.findIndex(value => value <= target);
    if (firstIndex < 0) return;
    context.fillStyle = '#00ff88'; context.beginPath(); context.arc(xFor(firstIndex), yFor(values[firstIndex]), 5, 0, Math.PI * 2); context.fill();
  });
  if (summary) summary.textContent = weights.length === 1 ? 'One data point logged. Keep tracking to see your trend.' : `Showing ${weights.length} weight records${Number(goal) > 0 ? ` · goal ${Number(goal).toFixed(1)} lb` : ''}. Red = SHOT, yellow = dose change, green = personal milestone.`;
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
  context.fillStyle = delta < -0.05 ? '#00ff88' : delta > 0.05 ? '#ff5577' : '#ffd700';
  context.font = '700 14px Share Tech Mono, monospace';
  context.textAlign = 'left';
  context.fillText(arrow, Math.min(width - 16, xFor(values.length - 1) + 7), yFor(values.at(-1)) + 5);
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

function closeCustomPickers(except) {
  qa('.gn-custom-picker.open,.gn-custom-date.open').forEach(wrapper => { if (wrapper !== except) wrapper.classList.remove('open'); });
}

function syncCustomPicker(select) {
  const wrapper = select?.closest('.gn-custom-picker');
  const trigger = wrapper?.querySelector('[data-gn-picker-trigger]');
  const option = Array.from(select?.options || []).find(item => item.value === select.value) || select?.options?.[0];
  if (!wrapper || !trigger || !option) return;
  trigger.textContent = option.textContent;
  wrapper.querySelectorAll('[data-gn-picker-value]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.gnPickerValue === select.value)));
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
  Array.from(select.options).forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gn-custom-picker-option';
    button.dataset.gnPickerValue = option.value;
    button.setAttribute('role', 'option');
    button.textContent = option.textContent;
    button.addEventListener('click', () => {
      select.value = option.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncCustomPicker(select);
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    });
    menu.appendChild(button);
  });
  select.hidden = true;
  select.setAttribute('aria-hidden', 'true');
  select.dataset.gnPickerWired = 'true';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(trigger, menu, select);
  trigger.addEventListener('click', () => {
    const open = !wrapper.classList.contains('open');
    closeCustomPickers(wrapper);
    wrapper.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) syncCustomPicker(select);
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
  label.textContent = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const first = new Date(year, monthIndex, 1).getDay();
  const total = new Date(year, monthIndex + 1, 0).getDate();
  const selected = wrapper.input.value || '';
  grid.innerHTML = `${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => `<span class="gn-custom-date-dow">${day}</span>`).join('')}${Array.from({ length: first }, () => '<span class="gn-custom-date-blank"></span>').join('')}${Array.from({ length: total }, (_, index) => { const day = index + 1, value = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return `<button type="button" class="gn-custom-date-day${value === selected ? ' selected' : ''}" data-gn-date-value="${value}">${day}</button>`; }).join('')}`;
}

function syncCustomDate(input) {
  const wrapper = input?.closest('.gn-custom-date');
  const trigger = wrapper?.querySelector('[data-gn-date-trigger]');
  if (!wrapper || !trigger) return;
  trigger.textContent = input.value ? formatDate(input.value, { month: 'short', day: 'numeric', year: 'numeric' }) : 'SELECT DATE';
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
  popover.innerHTML = '<div class="gn-custom-date-head"><button type="button" data-gn-date-prev aria-label="Previous month">‹</button><strong data-gn-date-label></strong><button type="button" data-gn-date-next aria-label="Next month">›</button></div><div class="gn-custom-date-grid" data-gn-date-grid></div><div class="gn-custom-date-foot"><button type="button" data-gn-date-today>USE TODAY</button><button type="button" data-gn-date-close>CLOSE</button></div>';
  input.type = 'text';
  input.readOnly = true;
  input.hidden = true;
  input.setAttribute('aria-hidden', 'true');
  input.dataset.gnDateWired = 'true';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(trigger, popover, input);
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
    <div class="gn-foundation-head"><div><div class="gn-foundation-kicker">// ORGANIZED SYSTEMS</div><h2 id="gnLabFoundationTitle">LAB <span>EXPANSION LAYER</span></h2></div><span class="gn-foundation-signal">LOCAL RECORDS</span></div>
    <div class="gn-lab-breadcrumb">LAB <b>›</b> CHOOSE A SYSTEM</div>
    <div class="gn-foundation-grid">
      <button type="button" class="gn-foundation-tile" data-lab-focus="calculators"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-g"><svg><use href="#gn-biometric-gauge"></use></svg></span></span><b>CALCULATORS</b><small>Focused educational tools</small></button>
      <button type="button" class="gn-foundation-tile active" data-lab-focus="research"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-lab-vessel"></use></svg></span></span><b>RESEARCH PEPTIDES</b><small>Personal record tracking</small></button>
      <button type="button" class="gn-foundation-tile" data-lab-focus="inventory"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-g"><svg><use href="#gn-inventory-core"></use></svg></span></span><b>INVENTORY</b><small>Supply records + deduction</small></button>
      <button type="button" class="gn-foundation-tile" data-lab-focus="devices"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-y"><svg><use href="#gn-vault-core"></use></svg></span></span><b>DEVICE VAULT</b><small>Identity, lifecycle, status</small></button>
      <button type="button" class="gn-foundation-tile" data-lab-focus="ledger"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-r"><svg><use href="#gn-timeline-node"></use></svg></span></span><b>EVENT LEDGER</b><small>Source-aware history</small></button>
    </div>
    <details class="gn-foundation-section" open id="gnResearchSection"><summary><span>RESEARCH PEPTIDES</span><em>ORGANIZE · OBSERVE · REVIEW</em></summary>
      <div class="gn-research-notice"><strong>USER-ENTERED RESEARCH RECORDS</strong><span>Some compounds above have FDA-approved indications in specific clinical contexts. This organizer does not distinguish regulated from research use. All records are user-entered. Verify independently.</span></div>
      <div class="gn-research-library">${RESEARCH_LIBRARY.map(({ category, names, context }) => `<div class="gn-research-group"><span>${safeText(category)}</span><small class="gn-research-context">${safeText(context)}</small><div>${names.map(name => `<button type="button" data-research-name="${safeText(name)}" data-research-category="${safeText(category)}">${safeText(name)}</button>`).join('')}</div></div>`).join('')}<div class="gn-research-group"><span>CUSTOM ENTRY</span><small class="gn-research-context">USER-ENTERED RECORD · REGULATORY STATUS IS NOT VERIFIED HERE.</small><div><button type="button" data-research-name="" data-research-category="Custom Research">CUSTOM ENTRY</button></div></div></div>
      <div class="gn-research-disclaimer">Some compounds above have FDA-approved indications in specific clinical contexts. This organizer does not distinguish regulated from research use. All records are user-entered. Verify independently.</div>
      <form class="gn-record-form" id="gnResearchForm"><div class="gn-form-grid"><label>RECORD NAME<input id="gnResearchName" required placeholder="Select a library entry or type a custom name"></label><label>CATEGORY<input id="gnResearchCategory" placeholder="Research category"></label><label>DATE<input id="gnResearchDate" type="date"></label></div><div class="gn-form-grid"><label>STATUS<select id="gnResearchState"><option>TRACKING</option><option>COMPLETED</option><option>ARCHIVED</option><option>RESEARCH NOTE ONLY</option></select></label><label>SOURCE<input id="gnResearchSource" placeholder="User-entered source or note"></label></div><label>OBSERVATIONS / NOTES<textarea id="gnResearchNotes" rows="3" placeholder="User-entered observations only"></textarea></label><button class="btn-full btn-primary" type="submit" id="gnResearchSave">SAVE RESEARCH RECORD</button></form>
      <div class="gn-record-list" id="gnResearchList"></div>
    </details>
    <details class="gn-foundation-section" id="gnLedgerSection"><summary><span>SOURCE-AWARE EVENT LEDGER</span><em>NO SILENT REWRITES</em></summary><div class="gn-ledger-copy">Every important record keeps its origin and review state. Manual Entry, Import, Device Reported, and System Generated events remain distinguishable.</div><div class="gn-ledger-list" id="gnLedgerList"></div></details>
    <details class="gn-foundation-section" id="gnSupplySection"><summary><span>SAVED INVENTORY</span><em>SEPARATE FROM CALCULATORS</em></summary><div class="gn-ledger-copy"><strong>CALCULATOR / REFERENCE ESTIMATE</strong> remains educational math. Saved Inventory is user-entered supply records and does not verify product, storage, potency, or safety.</div><form class="gn-record-form" id="gnInventoryForm"><div class="gn-form-grid"><label>ITEM NAME<input id="gnInventoryName" required placeholder="e.g. cartridge A"></label><label>ITEM TYPE<select id="gnInventoryType"><option>Vial</option><option>Cartridge</option><option>Disposable pen</option><option>Box or package</option><option>General supply item</option><option>Custom item</option></select></label><label>QUANTITY<input id="gnInventoryQuantity" type="number" min="0" step="any" placeholder="0"></label></div><div class="gn-form-grid"><label>UNITS<input id="gnInventoryUnits" placeholder="items, mL, boxes"></label><label>EXPIRATION / BUD<input id="gnInventoryExpiry" type="date"></label><label>STORAGE LOCATION<input id="gnInventoryLocation" placeholder="User-entered location"></label></div><label>NOTES<textarea id="gnInventoryNotes" rows="2" placeholder="User-entered supply notes"></textarea></label><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-full btn-secondary" type="submit" style="flex:1 1 180px" id="gnInventorySave">SAVE INVENTORY ITEM</button><button class="btn-full btn-secondary" type="button" id="gnInventoryExport" style="flex:0 1 170px">EXPORT INVENTORY</button></div></form><div class="gn-record-list" id="gnInventoryList"></div></details>
  </section>`);
  $('gnResearchForm')?.addEventListener('submit', event => { event.preventDefault(); saveResearchRecord(); });
  $('gnResearchList')?.addEventListener('click', handleResearchAction);
  const inventoryNotesLabel = $('gnInventoryNotes')?.closest('label');
  inventoryNotesLabel?.insertAdjacentHTML('beforebegin', `<div class="gn-form-grid"><label>CONCENTRATION<input id="gnInventoryConcentration" placeholder="User-entered label"></label><label>VOLUME<input id="gnInventoryVolume" placeholder="User-entered volume"></label><label>ACQUIRED DATE<input id="gnInventoryAcquired" type="date"></label></div><div class="gn-form-grid"><label>SOURCE<input id="gnInventorySource" placeholder="User-entered source"></label><label>LINKED MEDICATION<input id="gnInventoryMedication" placeholder="e.g. Zepbound"></label><label style="display:flex;align-items:center;gap:8px;grid-template-columns:auto 1fr"><input id="gnInventoryAutoDeduct" type="checkbox" style="width:auto"> AUTO-DEDUCT SHOTS <small>Requires quantity unit mg and a matching medication.</small></label></div>`);
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
  overlay.innerHTML = `<div class="gn-lab-tool-shell"><header class="gn-lab-tool-head"><button type="button" class="gn-lab-back" data-lab-back>← BACK TO LAB</button><div><div class="gn-foundation-kicker">// LAB SYSTEM</div><h2 id="gnLabToolTitle">FOCUSED TOOL</h2></div><span class="gn-foundation-signal">LOCAL RECORDS</span></header><div id="gnLabToolHost" class="gn-lab-tool-host"></div></div>`;
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
  toolNodes.forEach(node => host.appendChild(node));
  [$('gnResearchSection'), $('gnLedgerSection'), $('gnSupplySection')].forEach(section => { if (section) section.open = section.id === (tool === 'research' ? 'gnResearchSection' : tool === 'inventory' ? 'gnSupplySection' : 'gnLedgerSection'); });
  const titles = { calculators: 'CALCULATORS', research: 'RESEARCH PEPTIDES', inventory: 'INVENTORY', devices: 'DEVICE VAULT', ledger: 'EVENT LEDGER' };
  setText('gnLabToolTitle', titles[tool] || 'LAB SYSTEM');
  qa('[data-lab-focus]').forEach(tile => tile.classList.toggle('active', tile.dataset.labFocus === tool));
  page.classList.add('gn-lab-tool-open');
  overlay.hidden = false;
  overlay.classList.add('active');
  document.body.classList.add('gn-lab-tool-open');
  if (tool === 'calculators') showLabSeg('draw', document.querySelector('[data-labseg="draw"]'));
  renderLabFoundations();
  if (tool === 'devices') renderDeviceVault();
  overlay.querySelector('[data-lab-back]')?.focus({ preventScroll: true });
}

function closeLabTool() {
  const overlay = $('gnLabToolOverlay'), page = $('pageLab');
  if (!overlay) return;
  restoreLabNodes();
  overlay.classList.remove('active');
  overlay.hidden = true;
  page?.classList.remove('gn-lab-tool-open');
  document.body.classList.remove('gn-lab-tool-open');
  qa('[data-lab-focus]').forEach(tile => tile.classList.remove('active'));
  renderLabFoundations();
}

function renderLabFoundations() {
  const list = $('gnResearchList');
  if (list) {
    const records = S.get('researchRecords', []);
    const active = records.filter(record => !record.archived);
    const archived = records.filter(record => record.archived);
    list.innerHTML = records.length ? `${active.slice().reverse().map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(record.category || 'CUSTOM RESEARCH')} · ${safeText(formatDate(record.date || record.createdAt))} · ${safeText(record.source || 'Manual Entry')}</small></div><span class="gn-record-state">${safeText(record.state || 'TRACKING')}</span><div style="display:flex;gap:4px"><button type="button" class="gn-record-delete" data-research-edit="${safeText(record.id)}" aria-label="Edit research record">✎</button><button type="button" class="gn-record-delete" data-research-archive="${safeText(record.id)}" aria-label="Archive research record">×</button></div></article>`).join('')}${archived.length ? `<div class="gn-ledger-copy" style="margin-top:10px">ARCHIVED RECORDS · Restore the record before editing.</div>${archived.slice().reverse().map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(record.category || 'CUSTOM RESEARCH')} · Archived ${safeText(formatDate(record.modifiedAt || record.createdAt))}</small></div><span class="gn-record-state">ARCHIVED</span><button type="button" class="gn-record-delete gn-restore-edit" data-research-restore="${safeText(record.id)}" aria-label="Restore research record to edit">RESTORE TO EDIT</button></article>`).join('')}` : ''}` : '<div class="gn-empty-state"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-lab-vessel"></use></svg></span><b>NO RESEARCH RECORDS YET</b><span>Choose a library entry or create a custom record when you have something to preserve.</span></div>';
  }
  const ledger = $('gnLedgerList');
  if (ledger) {
    const events = S.get('eventLedger', []).slice(-8).reverse();
    ledger.innerHTML = events.length ? events.map(event => `<div class="gn-ledger-row"><span class="gn-ledger-dot"></span><div><b>${safeText(event.label || event.type || 'EVENT')}</b><small>${safeText(formatDateTime(event.date || event.createdAt))}</small></div><em>${safeText(event.source || 'Manual Entry')} · ${safeText(event.state || 'User Confirmed')}</em></div>`).join('') : '<div class="gn-empty-state"><b>LEDGER READY</b><span>New SHOTS and RESULTS events will appear here with their origin.</span></div>';
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
  list.innerHTML = records.length ? `${visible.map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(record.type)} · ${safeText(record.quantity ?? '—')} ${safeText(record.units || '')} · ${safeText(record.location || 'LOCATION NOT ENTERED')}</small></div><span class="gn-record-state">${safeText(record.status || 'ACTIVE')}</span><div style="display:flex;gap:4px"><button type="button" class="gn-record-delete" data-inventory-edit="${safeText(record.id)}" aria-label="Edit inventory item">✎</button><button type="button" class="gn-record-delete" data-inventory-archive="${safeText(record.id)}" aria-label="Archive inventory item">×</button></div></article>`).join('')}${archived.length ? `<div class="gn-ledger-copy" style="margin-top:10px">ARCHIVED RECORDS · Restore the record before editing.</div>${archived.map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(record.type)} · Archived ${safeText(formatDate(record.modifiedAt || record.createdAt))}</small></div><span class="gn-record-state">ARCHIVED</span><button type="button" class="gn-record-delete gn-restore-edit" data-inventory-restore="${safeText(record.id)}" aria-label="Restore inventory item to edit">RESTORE TO EDIT</button></article>`).join('')}` : ''}` : '<div class="gn-empty-state"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-archive-core"></use></svg></span><b>SAVED INVENTORY READY</b><span>Record supplies separately from educational calculators when you want a persistent list.</span></div>';
}

function saveInventoryRecord() {
  const name = $('gnInventoryName')?.value?.trim();
  if (!name) { actionFeedback('INVENTORY NOT SAVED', 'ADD AN ITEM NAME BEFORE COMMITTING', true); return; }
  const records = S.get('inventory', []);
  const now = new Date().toISOString();
  const id = moduleState.inventoryEditId || createId('inventory');
  const existing = records.find(record => record.id === id);
  const history = [...(existing?.history || []), { at: now, action: existing ? 'UPDATED' : 'CREATED', source: 'Manual Entry' }];
  const record = { id, name, type: $('gnInventoryType')?.value || 'Custom item', quantity: Number($('gnInventoryQuantity')?.value) || 0, units: $('gnInventoryUnits')?.value?.trim() || '', medication: $('gnInventoryMedication')?.value?.trim() || '', autoDeduct: Boolean($('gnInventoryAutoDeduct')?.checked), concentration: $('gnInventoryConcentration')?.value?.trim() || '', volume: $('gnInventoryVolume')?.value?.trim() || '', acquired: $('gnInventoryAcquired')?.value || '', expires: $('gnInventoryExpiry')?.value || '', inventorySource: $('gnInventorySource')?.value?.trim() || '', location: $('gnInventoryLocation')?.value?.trim() || '', notes: $('gnInventoryNotes')?.value?.trim() || '', status: existing?.status || 'ACTIVE', archived: existing?.archived || false, source: existing?.source || 'Manual Entry', state: existing?.state || 'User Confirmed', history, createdAt: existing?.createdAt || now, modifiedAt: now };
  const index = records.findIndex(item => item.id === id);
  if (index >= 0) records[index] = record; else records.push(record);
  S.set('inventory', records); appendEventLedger({ type: 'INVENTORY', recordId: record.id, label: existing ? 'INVENTORY UPDATED' : 'INVENTORY ITEM SAVED' }); queueCloudSync('workspace');
  moduleState.inventoryEditId = null; $('gnInventoryForm')?.reset(); setText('gnInventorySave', 'SAVE INVENTORY ITEM'); renderInventory(); actionFeedback(existing ? 'INVENTORY UPDATED' : 'INVENTORY SAVED', 'SAVED INVENTORY // TIMELINE UPDATED');
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
    $('gnInventoryName').value = record.name || ''; $('gnInventoryType').value = record.type || 'Custom item'; $('gnInventoryQuantity').value = record.quantity || ''; $('gnInventoryUnits').value = record.units || ''; $('gnInventoryMedication').value = record.medication || ''; $('gnInventoryAutoDeduct').checked = Boolean(record.autoDeduct); $('gnInventoryConcentration').value = record.concentration || ''; $('gnInventoryVolume').value = record.volume || ''; $('gnInventoryAcquired').value = record.acquired || ''; $('gnInventoryExpiry').value = record.expires || ''; $('gnInventorySource').value = record.inventorySource || ''; $('gnInventoryLocation').value = record.location || ''; $('gnInventoryNotes').value = record.notes || ''; setText('gnInventorySave', 'UPDATE INVENTORY ITEM'); $('gnInventoryForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
  }
  if (button.dataset.inventoryArchive) { record.archived = true; record.status = 'ARCHIVED'; record.modifiedAt = new Date().toISOString(); record.history = [...(record.history || []), { at: record.modifiedAt, action: 'ARCHIVED', source: 'Manual Entry' }]; actionFeedback('INVENTORY ARCHIVED', 'HISTORY PRESERVED // RECORD REMAINS RECOVERABLE'); }
  else { record.archived = false; record.status = 'ACTIVE'; record.modifiedAt = new Date().toISOString(); record.history = [...(record.history || []), { at: record.modifiedAt, action: 'RESTORED', source: 'Manual Entry' }]; actionFeedback('INVENTORY RESTORED', 'SAVED INVENTORY // TIMELINE UPDATED'); }
  S.set('inventory', records); appendEventLedger({ type: 'INVENTORY', recordId: record.id, label: record.archived ? 'INVENTORY ARCHIVED' : 'INVENTORY RESTORED' }); queueCloudSync('workspace'); renderInventory();
}

function exportInventory() {
  downloadFile('gridnode-inventory.json', JSON.stringify({ app: 'GRID//NODE', exportedAt: new Date().toISOString(), inventory: S.get('inventory', []) }, null, 2), 'application/json');
  actionFeedback('INVENTORY EXPORT READY', 'USER-CONTROLLED RECORDS PREPARED');
}

function saveResearchRecord() {
  const name = $('gnResearchName')?.value?.trim();
  if (!name) { actionFeedback('RESEARCH RECORD NOT SAVED', 'ADD A NAME BEFORE COMMITTING', true); return; }
  const records = S.get('researchRecords', []), now = new Date().toISOString(), id = moduleState.researchEditId || createId('research'), existing = records.find(item => item.id === id);
  const record = { id, name, category: $('gnResearchCategory')?.value?.trim() || 'Custom Research', date: $('gnResearchDate')?.value || todayISO(), notes: $('gnResearchNotes')?.value?.trim() || '', source: $('gnResearchSource')?.value?.trim() || existing?.source || 'Manual Entry', state: $('gnResearchState')?.value || existing?.state || 'TRACKING', archived: existing?.archived || false, createdAt: existing?.createdAt || now, modifiedAt: now };
  const index = records.findIndex(item => item.id === id);
  if (index >= 0) records[index] = record; else records.push(record);
  S.set('researchRecords', records); appendEventLedger({ type: 'RESEARCH', recordId: record.id, date: record.date, label: existing ? 'RESEARCH RECORD UPDATED' : 'RESEARCH RECORD CAPTURED' });
  queueCloudSync('workspace'); moduleState.researchEditId = null; $('gnResearchForm')?.reset(); setText('gnResearchSave', 'SAVE RESEARCH RECORD'); renderLabFoundations(); actionFeedback(existing ? 'RESEARCH RECORD UPDATED' : 'RESEARCH RECORD CAPTURED', 'TIMELINE UPDATED // USER-ENTERED ONLY');
}

function handleResearchAction(event) {
  const button = event.target.closest('button[data-research-edit],button[data-research-archive],button[data-research-restore]');
  if (!button) return;
  const id = button.dataset.researchEdit || button.dataset.researchArchive || button.dataset.researchRestore;
  const records = S.get('researchRecords', []), record = records.find(item => item.id === id);
  if (!record) return;
  if (button.dataset.researchEdit) {
    moduleState.researchEditId = id; $('gnResearchName').value = record.name || ''; $('gnResearchCategory').value = record.category || ''; $('gnResearchDate').value = record.date || ''; $('gnResearchState').value = record.state || 'TRACKING'; $('gnResearchSource').value = record.source || ''; $('gnResearchNotes').value = record.notes || ''; setText('gnResearchSave', 'UPDATE RESEARCH RECORD'); $('gnResearchForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
  }
  record.archived = Boolean(button.dataset.researchArchive); record.state = record.archived ? 'ARCHIVED' : (record.state === 'ARCHIVED' ? 'TRACKING' : record.state); record.modifiedAt = new Date().toISOString(); S.set('researchRecords', records); appendEventLedger({ type: 'RESEARCH', recordId: record.id, label: record.archived ? 'RESEARCH RECORD ARCHIVED' : 'RESEARCH RECORD RESTORED' }); queueCloudSync('workspace'); renderLabFoundations(); actionFeedback(record.archived ? 'RESEARCH RECORD ARCHIVED' : 'RESEARCH RECORD RESTORED', 'HISTORY PRESERVED // TIMELINE UPDATED');
}

function deleteResearchRecord(id) {
  S.set('researchRecords', S.get('researchRecords', []).filter(record => record.id !== id)); queueCloudSync('workspace'); renderLabFoundations(); actionFeedback('RESEARCH RECORD REMOVED', 'LOCAL RECORD UPDATED');
}

function ensureProfileHub() {
  const page = $('pageProfile');
  if (!page || page.querySelector('[data-gn-profile-hub]')) return;
  const avatar = $('profAvaWrap');
  const hero = avatar?.closest('[style*="background:#0e0e16"]');
  if (!hero) return;
  hero.insertAdjacentHTML('afterend', `<section class="gn-profile-hub" data-gn-profile-hub aria-labelledby="gnProfileHubTitle">
    <div class="gn-foundation-head"><div><div class="gn-foundation-kicker">// NODE PROFILE HUB</div><h2 id="gnProfileHubTitle">YOUR <span>NODE</span></h2></div><span class="gn-foundation-signal" id="gnProfileSync">LOCAL MODE</span></div>
    <div class="gn-profile-sections">
      <section class="gn-profile-section"><div class="gn-profile-section-label">// YOUR NODE</div><div class="gn-profile-row"><span><b>Medication</b><small id="gnProfileMedication">Not entered</small></span><span class="gn-profile-chevron">›</span></div><div class="gn-profile-row"><span><b>Body Metrics</b><small id="gnProfileBody">Not entered</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row" onclick="openSystemUpdate()"><span><b>What's New</b><small>v2.1.7</small></span><span class="gn-profile-chevron">›</span></button></section>
      <section class="gn-profile-section"><div class="gn-profile-section-label">// YOUR DATA</div><button type="button" class="gn-profile-row" onclick="exportCSV()"><span><b>Export CSV</b><small>Download readable records</small></span><span class="gn-profile-chevron">›</span></button><button type="button" class="gn-profile-row" onclick="exportBackup()"><span><b>Export Backup</b><small>Save a complete local copy</small></span><span class="gn-profile-chevron">›</span></button><div class="gn-profile-row"><span><b>Data Ownership</b><small>Export or delete anytime</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row gn-profile-danger-row" onclick="openDeleteLocalData()"><span><b>Delete All Local Data</b><small>Remove this device record</small></span><span class="gn-profile-chevron">›</span></button></section>
      <section class="gn-profile-section"><div class="gn-profile-section-label">// TOOLS</div><button type="button" class="gn-profile-row" onclick="document.querySelector('.gn-device-vault')?.scrollIntoView({behavior:'smooth',block:'start'})"><span><b>Device Vault</b><small>Private identity registry</small></span><span class="gn-profile-chevron">›</span></button><div class="gn-profile-row"><span><b>Connected Account</b><small id="gnProfileAccount">Local device session</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row gn-profile-danger-row" onclick="openDeleteCloudAccount()"><span><b>Delete Cloud Account</b><small>Requires server deletion control</small></span><span class="gn-profile-chevron">›</span></button><div class="gn-profile-row"><span><b>App Version</b><small id="gnProfileVersion">v2.1.7</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row" onclick="window.location.reload()"><span><b>Reload App</b><small>Refresh the current build</small></span><span class="gn-profile-chevron">›</span></button></section>
    </div>
    <button type="button" class="gn-profile-signout" onclick="openSignOutModal()"><span><b>SIGN OUT</b><small>Your data stays on this device.</small></span><span class="gn-profile-chevron">›</span></button>
    <div class="system-update-card" id="gnSystemUpdateCard"><div class="system-update-head"><strong>SYSTEM UPDATE // v2.1.7</strong><button type="button" id="gnSystemUpdateDismiss">DISMISS</button></div><p>v2.1.7 — First-run orientation, SIGNAL, a focused dashboard, weekly record summaries, LAB launch controls, and inventory deduction are now connected.</p><ul><li>Phase language stays educational and grounded in user-entered history.</li><li>Weight charts distinguish SHOTS, dose changes, and personal milestones.</li><li>Clinical comparison remains off until reference data is verified.</li></ul></div>
    <div class="gn-device-vault"><div class="gn-device-vault-head"><div><div class="gn-foundation-kicker">// DEVICE VAULT</div><h3>PHYSICAL OBJECT IDENTITY</h3></div><span class="gn-record-state">PRIVATE REGISTRY</span></div><p class="gn-ledger-copy">The device is not the cartridge. The cartridge is not the dose. The dose is not the plan. Device identity, inventory, SHOT events, and LOADOUT remain separate records.</p><form class="gn-record-form" id="gnDeviceForm"><div class="gn-form-grid"><label>DEVICE NAME<input id="gnDeviceName" required placeholder="e.g. Home pen A"></label><label>DEVICE TYPE<select id="gnDeviceType"><option>Reusable pen</option><option>Disposable pen</option><option>Autoinjector</option><option>Other device</option></select></label><label>STATUS<select id="gnDeviceStatus">${DEVICE_STATUSES.map(status => `<option>${status}</option>`).join('')}</select></label></div><label>LABEL / NOTES<textarea id="gnDeviceNotes" rows="2" placeholder="User-entered identity notes"></textarea></label><button class="btn-full btn-secondary" type="submit">REGISTER DEVICE IDENTITY</button></form><div class="gn-device-list" id="gnDeviceList"></div></div>
  </section>`);
  installCustomPickers(hero.parentElement || page);
  const updateTitle = hero.parentElement?.querySelector('.system-update-head strong');
  if (updateTitle) updateTitle.textContent = `WHAT'S NEW // ${APP_VERSION}`;
  const updateCopy = hero.parentElement?.querySelector('#gnSystemUpdateCard p');
  if (updateCopy) updateCopy.textContent = `${APP_VERSION} — LAB tools now open in focused views, the Phase Engine adds neutral cycle context, and the LIVE NODE status is compact on mobile and desktop.`;
  const whatsNewVersion = hero.parentElement?.querySelector('.gn-profile-section:first-of-type button small');
  if (whatsNewVersion) whatsNewVersion.textContent = `v${APP_VERSION}`;
  const deviceVault = hero.parentElement?.querySelector('.gn-device-vault');
  const deviceKicker = deviceVault?.querySelector('.gn-foundation-kicker');
  const deviceSignal = deviceVault?.querySelector('.gn-record-state');
  if (deviceKicker) deviceKicker.textContent = '// DEVICE VAULT';
  if (deviceSignal) deviceSignal.textContent = 'PRIVATE REGISTRY';
  $('gnSystemUpdateDismiss')?.addEventListener('click', dismissSystemUpdate);
  document.querySelector('[data-system-update-open]')?.addEventListener('click', openSystemUpdate);
  $('gnDeviceForm')?.addEventListener('submit', event => { event.preventDefault(); saveDeviceRecord(); });
  $('gnDeviceList')?.addEventListener('click', handleDeviceAction);
  renderDeviceVault();
}

function renderDeviceVault() {
  const list = $('gnDeviceList');
  if (!list) return;
  const devices = S.get('devices', []);
  const active = devices.filter(device => !device.archived), archived = devices.filter(device => device.archived);
  list.innerHTML = devices.length ? `${active.slice().reverse().map(device => `<article class="gn-record-row"><div><b>${safeText(device.name)}</b><small>${safeText(device.type)} · PRIVATE ID ${safeText(device.qrIdentity || 'PENDING')}</small></div><span class="gn-record-state">${safeText(device.status)}</span><div style="display:flex;gap:4px"><button type="button" class="gn-record-delete" data-device-edit="${safeText(device.id)}" aria-label="Edit device">✎</button><button type="button" class="gn-record-delete" data-device-retire="${safeText(device.id)}" aria-label="Retire device">×</button></div></article>`).join('')}${archived.length ? `<div class="gn-ledger-copy" style="margin-top:10px">RETIRED / ARCHIVED DEVICES</div>${archived.slice().reverse().map(device => `<article class="gn-record-row"><div><b>${safeText(device.name)}</b><small>${safeText(device.type)} · Private identity preserved</small></div><span class="gn-record-state">${safeText(device.status || 'RETIRED')}</span><button type="button" class="gn-record-delete" data-device-restore="${safeText(device.id)}" aria-label="Restore device">↺</button></article>`).join('')}` : ''}` : '<div class="gn-empty-state"><span class="gn-icon gn-icon-md gn-accent-y"><svg><use href="#gn-vault-core"></use></svg></span><b>DEVICE VAULT READY</b><span>Register a physical object when you want its identity and lifecycle preserved.</span></div>';
}

function saveDeviceRecord() {
  const name = $('gnDeviceName')?.value?.trim();
  if (!name) { actionFeedback('DEVICE NOT REGISTERED', 'ADD A DEVICE NAME BEFORE COMMITTING', true); return; }
  const devices = S.get('devices', []), now = new Date().toISOString(), id = moduleState.deviceEditId || createId('device'), existing = devices.find(item => item.id === id);
  const device = { ...(existing || {}), id, name, type: $('gnDeviceType')?.value || 'Other device', status: $('gnDeviceStatus')?.value || 'NEEDS CHECKING', notes: $('gnDeviceNotes')?.value?.trim() || '', qrIdentity: existing?.qrIdentity || `GN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, source: existing?.source || 'Manual Entry', state: existing?.state || 'User Confirmed', archived: existing?.archived || false, createdAt: existing?.createdAt || now, modifiedAt: now };
  const index = devices.findIndex(item => item.id === id); if (index >= 0) devices[index] = device; else devices.push(device);
  S.set('devices', devices); appendEventLedger({ type: 'DEVICE', recordId: device.id, label: existing ? 'DEVICE IDENTITY UPDATED' : 'DEVICE IDENTITY REGISTERED' }); queueCloudSync('workspace'); moduleState.deviceEditId = null; $('gnDeviceForm')?.reset(); renderDeviceVault(); actionFeedback(existing ? 'DEVICE IDENTITY UPDATED' : 'DEVICE IDENTITY REGISTERED', 'DEVICE VAULT UPDATED // HISTORY PRESERVED');
}

function handleDeviceAction(event) {
  const button = event.target.closest('button[data-device-edit],button[data-device-retire],button[data-device-restore]');
  if (!button) return;
  const id = button.dataset.deviceEdit || button.dataset.deviceRetire || button.dataset.deviceRestore;
  const devices = S.get('devices', []), device = devices.find(item => item.id === id);
  if (!device) return;
  if (button.dataset.deviceEdit) { moduleState.deviceEditId = id; $('gnDeviceName').value = device.name || ''; $('gnDeviceType').value = device.type || 'Other device'; $('gnDeviceStatus').value = device.status || 'NEEDS CHECKING'; $('gnDeviceNotes').value = device.notes || ''; const submit = document.querySelector('#gnDeviceForm button[type="submit"]'); if (submit) submit.textContent = 'UPDATE DEVICE IDENTITY'; $('gnDeviceForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  device.archived = Boolean(button.dataset.deviceRetire); device.status = device.archived ? 'RETIRED' : 'READY'; device.modifiedAt = new Date().toISOString(); S.set('devices', devices); appendEventLedger({ type: 'DEVICE', recordId: id, label: device.archived ? 'DEVICE RETIRED' : 'DEVICE RESTORED' }); queueCloudSync('workspace'); renderDeviceVault(); actionFeedback(device.archived ? 'DEVICE RETIRED' : 'DEVICE RESTORED', 'HARDWARE HISTORY PRESERVED // TIMELINE UPDATED');
}

function ensureDoseProjection() {
  const page = $('pageLab');
  if (!page || $('gnDoseProjection')) return;
  page.insertAdjacentHTML('beforeend', `<section class="gn-dose-projection" id="gnDoseProjection" aria-labelledby="gnDoseProjectionTitle"><div class="gn-foundation-kicker">// EDUCATIONAL REFERENCE</div><h2 id="gnDoseProjectionTitle">DOSE PROJECTION</h2><p class="gn-dose-copy">Map a user-entered dose progression as a text timeline. This stores no protocol and makes no recommendation.</p><div class="gn-dose-grid"><label>CURRENT DOSE (mg)<input id="gnDoseCurrent" type="number" min="0" step="0.1" inputmode="decimal" oninput="updateDoseProjection()"></label><label>STEP INCREASE (mg)<input id="gnDoseStep" type="number" min="0" step="0.1" inputmode="decimal" oninput="updateDoseProjection()"></label><label>STEP INTERVAL (weeks)<input id="gnDoseInterval" type="number" min="1" step="1" inputmode="numeric" oninput="updateDoseProjection()"></label><label>TARGET DOSE (mg)<input id="gnDoseTarget" type="number" min="0" step="0.1" inputmode="decimal" oninput="updateDoseProjection()"></label></div><div class="gn-dose-output" id="gnDoseOutput">Enter all four values to view a text reference timeline.</div><div class="gn-dose-disclaimer"><strong>EDUCATIONAL REFERENCE ONLY.</strong> This is not a dosing recommendation. Titration schedules vary by individual protocol. Verify with prescribing guidance.</div></section>`);
  const profile = getProfile();
  if ($('gnDoseCurrent') && profile.dose) $('gnDoseCurrent').value = profile.dose;
  if ($('gnDoseInterval')) $('gnDoseInterval').value = 4;
}

function updateDoseProjection() {
  const output = $('gnDoseOutput');
  if (!output) return;
  const current = Number($('gnDoseCurrent')?.value), step = Number($('gnDoseStep')?.value), interval = Number($('gnDoseInterval')?.value), target = Number($('gnDoseTarget')?.value);
  if (![current, step, interval, target].every(value => Number.isFinite(value)) || current < 0 || step <= 0 || interval < 1 || target < current) {
    output.textContent = 'Enter a current dose, positive step, interval, and target at or above the current dose.';
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
    segment.insertAdjacentHTML('beforeend', `<button type="button" class="btn-full btn-secondary" data-save-calculator="${type}" onclick="saveCalculatorReference('${type}')">SAVE REFERENCE TO INVENTORY</button>`);
  });
}

function saveCalculatorReference(type) {
  const snapshots = {
    draw: { name: 'Draw calculator reference', notes: $('syrFormula')?.textContent || '' },
    recon: { name: 'Mix calculator reference', notes: $('reconOut')?.textContent || '' },
    supply: { name: 'Supply calculator reference', notes: $('supOut')?.textContent || '' }
  };
  const snapshot = snapshots[type];
  if (!snapshot?.notes || /ENTER VALID|INVALID INPUT|—/.test(snapshot.notes)) { actionFeedback('REFERENCE NOT SAVED', 'ENTER VALID CALCULATOR VALUES FIRST', true); return; }
  const records = S.get('inventory', []), now = new Date().toISOString();
  records.push({ id: createId('inventory'), name: snapshot.name, type: 'Calculator reference', quantity: 0, units: '', medication: '', autoDeduct: false, notes: snapshot.notes, status: 'REFERENCE', archived: false, source: 'System Generated', state: 'User Confirmed', history: [{ at: now, action: 'CALCULATOR REFERENCE SAVED', source: 'System Generated' }], createdAt: now, modifiedAt: now });
  S.set('inventory', records); appendEventLedger({ type: 'INVENTORY', recordId: records.at(-1).id, label: 'CALCULATOR REFERENCE SAVED' }); queueCloudSync('workspace'); renderInventory(); actionFeedback('REFERENCE SAVED', 'INVENTORY UPDATED // EDUCATIONAL MATH ONLY');
}

function renderLab() { ensureLabFoundations(); ensureDoseProjection(); ensureCalculatorInventoryActions(); updateSyr(); updateRecon(); updateSupply(); updateDoseProjection(); renderLabFoundations(); }
function positiveNumberField(id, label, maximum) {
  const raw = String($(id)?.value ?? '').trim();
  if (!raw) return { valid: false, message: `ENTER VALID VALUES · ${label} IS REQUIRED` };
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > maximum) return { valid: false, message: `INVALID INPUT · CHECK ${label}` };
  return { valid: true, value };
}
function updateSyr() {
  setText('syrUnits', '—'); setText('syrText', 'ENTER VALID VALUES'); setText('syrML', '— mL'); setText('syrConcDisplay', '— mg/mL'); setText('syrResultLine', '—'); setText('syrVolResult', '— mL'); setDisplay('syrTarget', false);
  const doseField = positiveNumberField('cDose', 'USER-ENTERED AMOUNT', 1000), concentrationField = positiveNumberField('cConc', 'CONCENTRATION', 10000);
  if (!doseField.valid || !concentrationField.valid) { setText('syrFormula', !doseField.valid ? doseField.message : concentrationField.message); return; }
  const dose = doseField.value, concentration = concentrationField.value;
  const volume = dose / concentration, units = volume * 100;
  if (!Number.isFinite(volume) || !Number.isFinite(units) || volume > 1000 || units > 100000) { setText('syrFormula', 'INVALID INPUT · CALCULATED RESULT IS OUTSIDE THE SUPPORTED RANGE'); return; }
  setText('syrUnits', `${units.toFixed(1)}u`); setText('syrText', `DRAW TO THE ${units.toFixed(1)} UNIT LINE`); setText('syrML', `${volume.toFixed(3)} mL`); setText('syrConcDisplay', `${concentration} mg/mL`); setText('syrResultLine', `${dose} mg`); setText('syrVolResult', `${volume.toFixed(3)} mL`); setText('syrFormula', `${dose} mg ÷ ${concentration} mg/mL = ${volume.toFixed(3)} mL = ${units.toFixed(1)} U-100 units. Educational math only.`); setDisplay('syrTarget', true);
  const target = $('syrTarget'); if (target) target.style.left = `${Math.min(100, Math.max(0, units))}%`;
}
function updateRecon() {
  setDisplay('reconRes', true); setText('bacAmt', '— mL');
  const vialField = positiveNumberField('rVial', 'TOTAL AMOUNT', 10000), concField = positiveNumberField('rConc', 'TARGET CONCENTRATION', 10000);
  if (!vialField.valid || !concField.valid) { setText('reconOut', !vialField.valid ? vialField.message : concField.message); return; }
  const volume = vialField.value / concField.value;
  if (!Number.isFinite(volume) || volume > 10000) { setText('reconOut', 'INVALID INPUT · CALCULATED RESULT IS OUTSIDE THE SUPPORTED RANGE'); return; }
  setText('reconOut', `Reference math: ${vialField.value} mg ÷ ${concField.value} mg/mL = ${volume.toFixed(3)} mL total reference volume.`); setText('bacAmt', `${volume.toFixed(3)} mL`);
}
function updateSupply() {
  setDisplay('supRes', true);
  const volumeField = positiveNumberField('sVol', 'VOLUME', 10000), concField = positiveNumberField('sConc', 'CONCENTRATION', 10000), weeklyField = positiveNumberField('sDose2', 'WEEKLY AMOUNT', 1000);
  const invalid = [volumeField, concField, weeklyField].find(field => !field.valid);
  if (invalid) { setText('supOut', invalid.message); return; }
  const total = volumeField.value * concField.value, coverage = total / weeklyField.value;
  if (!Number.isFinite(total) || !Number.isFinite(coverage) || coverage > 100000) { setText('supOut', 'INVALID INPUT · CALCULATED RESULT IS OUTSIDE THE SUPPORTED RANGE'); return; }
  setText('supOut', `Reference total: ${total.toFixed(2)} mg · User-entered weekly amount: ${weeklyField.value.toFixed(2)} mg · Approximate record coverage: ${coverage.toFixed(1)} weeks. Educational record keeping only.`);
}

const MEASUREMENT_TYPES = [
  ['waist', 'WAIST CIRCUMFERENCE'],
  ['hip', 'HIP CIRCUMFERENCE'],
  ['chest', 'CHEST CIRCUMFERENCE'],
  ['left_arm', 'LEFT ARM CIRCUMFERENCE'],
  ['right_arm', 'RIGHT ARM CIRCUMFERENCE'],
  ['left_thigh', 'LEFT THIGH CIRCUMFERENCE'],
  ['right_thigh', 'RIGHT THIGH CIRCUMFERENCE']
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
    <div class="gn-foundation-kicker">// BODY METRICS</div>
    <h3 id="gnMeasurementsTitle">WEIGHT + MEASUREMENTS</h3>
    <p class="gn-measurements-copy">Use this profile section as the single entry point for weight and user-entered body measurements.</p>
    <button type="button" class="btn-full btn-primary" onclick="openWeightModal()" style="margin-bottom:10px">LOG WEIGHT</button>
    <form id="gnMeasurementsForm" class="gn-measurements-form">
      <div class="gn-measurements-tools"><label>UNIT<select id="gnMeasurementUnit" onchange="setMeasurementUnit(this.value)"><option value="in">INCHES</option><option value="cm">CENTIMETERS</option></select></label><label>DATE<input id="gnMeasurementDate" type="date"></label></div>
      <div class="gn-measurements-grid">${MEASUREMENT_TYPES.map(([type, label]) => `<label><span>${label}<small id="gnMeasurementLatest_${type}">NO RECORD</small></span><input type="number" min="0" step="0.1" inputmode="decimal" data-measurement-type="${type}" aria-label="${label}"></label>`).join('')}</div>
      <button type="submit" class="btn-full btn-secondary">SAVE MEASUREMENTS</button>
    </form>
    <div class="gn-measurements-empty" id="gnMeasurementsEmpty">No measurements logged yet.</div>
  </section>`);
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
    const latestText = latest && converted !== null ? `${converted.toFixed(1)} ${unit} · ${formatDate(latest.date || latest.createdAt)}` : 'NO RECORD';
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
  if (!saved) { actionFeedback('NO MEASUREMENTS SAVED', 'ENTER AT LEAST ONE POSITIVE VALUE', true); return; }
  S.set('measurements', records);
  const preferences = S.get('preferences', {}); preferences.measurementUnit = unit; S.set('preferences', preferences);
  queueCloudSync('workspace');
  renderMeasurements();
  renderResults();
  actionFeedback('MEASUREMENTS SAVED', `${saved} USER-ENTERED VALUE${saved === 1 ? '' : 'S'} // TIMELINE UPDATED`);
}

function ensureDestructiveDialogs() {
  if ($('gnDeleteLocalOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="gn-delete-overlay" id="gnDeleteLocalOverlay" role="dialog" aria-modal="true" aria-labelledby="gnDeleteLocalTitle"><div class="gn-delete-panel"><div class="gn-delete-kicker">// VAULT CONTROL</div><h2 id="gnDeleteLocalTitle">DELETE ALL LOCAL DATA?</h2><p>This removes all shots, weights, peptides, devices, and settings from this device. Cloud records will be restored on next sign-in. This action cannot be undone.</p><label>TYPE DELETE TO CONFIRM<input id="gnDeleteLocalInput" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" oninput="updateDeleteLocalButton(this.value)"></label><div class="gn-delete-actions"><button type="button" class="btn-full btn-secondary" onclick="closeDeleteLocalData()">CANCEL</button><button type="button" class="btn-full gn-delete-confirm" id="gnDeleteLocalConfirm" disabled onclick="confirmDeleteLocalData()">DELETE LOCAL DATA</button></div></div></div><div class="gn-delete-overlay" id="gnDeleteCloudOverlay" role="dialog" aria-modal="true" aria-labelledby="gnDeleteCloudTitle"><div class="gn-delete-panel"><div class="gn-delete-kicker">// CLOUD ACCOUNT CONTROL</div><h2 id="gnDeleteCloudTitle">DELETE CLOUD ACCOUNT?</h2><p>This permanently removes all synced records from cloud storage. Local data on this device is not affected. You will be signed out.</p><p class="gn-delete-note">A secure server request verifies the signed-in account before deletion. The browser never receives the server key.</p><div class="gn-delete-actions"><button type="button" class="btn-full btn-secondary" onclick="closeDeleteCloudAccount()">CANCEL</button><button type="button" class="btn-full gn-delete-confirm" onclick="confirmDeleteCloudAccount()">DELETE CLOUD ACCOUNT</button></div></div></div>`);
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
  if (!result?.ok) { actionFeedback('CLOUD ACCOUNT NOT DELETED', 'ACCOUNT DELETION FAILED // LOCAL DATA UNCHANGED', true); return; }
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
  setText('profNameTxt', window.CU?.defaultName || profile.name || 'NODE_USER');
  setText('profEmail', sessionLabel());
  setText('profMedTxt', profile.med ? `// ${profile.med.toUpperCase()}` : '// NO MEDICATION SET');
  const currentWeight = latestWeight()?.weight;
  const height = profile.htFt ? `${profile.htFt}'${profile.htIn || 0}"` : 'Height not entered';
  setText('gnProfileMedication', profile.med ? `${profile.med}${profile.dose ? ` · ${profile.dose}mg` : ''}` : 'Not entered');
  setText('gnProfileBody', `${height}${currentWeight ? ` · ${Number(currentWeight).toFixed(1)} lb` : ''}`);
  setText('gnProfileVersion', APP_VERSION);
  setText('gnProfileAccount', state.cloud ? `${state.session?.user?.app_metadata?.provider === 'google' ? 'Signed in with Google' : 'Cloud account connected'} · ${state.session?.user?.email || sessionLabel()}` : 'Local device session');
  setText('gnProfileSync', nodeSyncLabel());
  hydrateProfileFields(profile);
  syncCustomPickers($('pageProfile') || document);
  renderMeasurements();
  let status = document.querySelector('.gn-cloud-status');
  const hero = $('profAvaWrap')?.closest('[style*="background:#0e0e16"]');
  if (!status && hero) { status = document.createElement('div'); status.className = 'gn-cloud-status'; hero.parentElement.insertBefore(status, hero.nextSibling); }
  if (status) status.innerHTML = `<span class="gn-cloud-dot ${state.cloud ? 'cloud' : 'local'}"></span><span>VAULT: ${safeText(state.cloudStatus)} · ${state.cloud ? 'Cloud account connected' : 'Data stays on this device until you connect an account'}</span>`;
  renderDeviceVault();
}

function dismissSystemUpdate() {
  const settings = S.get('settings', {});
  settings.systemUpdateDismissed = APP_VERSION;
  S.set('settings', settings);
  const card = $('gnSystemUpdateCard');
  if (card) card.hidden = true;
}

function openSystemUpdate() {
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
  getAllShots().forEach(record => rows.push(['shot', record.date || '', record.med || '', record.dose || '', record.site || '', record.wt || '', (record.se || []).join('|'), record.notes || '', record.archived ? 'true' : 'false', '', '', '']));
  getWeights().forEach(record => rows.push(['weight', record.date || '', '', '', '', record.weight || '', '', record.notes || '', 'false', '', '', '']));
  S.get('measurements', []).forEach(record => rows.push(['measurement', record.date || '', '', '', '', '', '', '', 'false', record.type || '', record.value || '', record.unit || 'in']));
  downloadFile('gridnode-records.csv', rows.map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast('CSV export prepared.');
}

function csvCell(value) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

function exportBackup() {
  const backup = { app: 'GRID//NODE', version: APP_VERSION, exportedAt: new Date().toISOString(), profile: getProfile(), shots: getAllShots(), weights: getWeights(), measurements: S.get('measurements', []), results: S.get('results', []), notes: S.get('notes', []), symptoms: S.get('symptoms', []), labs: S.get('labs', []), preferences: S.get('preferences', {}), settings: S.get('settings', {}), arsenal: S.get('arsenal', []), researchRecords: S.get('researchRecords', []), devices: S.get('devices', []), inventory: S.get('inventory', []), loadouts: S.get('loadouts', []), eventLedger: S.get('eventLedger', []) };
  downloadFile('gridnode-backup.json', JSON.stringify(backup, null, 2), 'application/json');
  showToast('VAULT backup prepared.');
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
  reader.onerror = () => actionFeedback('IMPORT NOT OPENED', 'THE SELECTED CSV COULD NOT BE READ', true);
  reader.readAsText(file);
  event.target.value = '';
}
function ensureImportDialog() {
  if ($('gnImportOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="gn-import-overlay" id="gnImportOverlay" role="dialog" aria-modal="true" aria-labelledby="gnImportTitle"><div class="gn-import-panel"><div class="gn-import-title" id="gnImportTitle">IMPORT DATA</div><p>Choose a source. GRID//NODE will detect the file format and show a review before commit.</p><label>FROM ANOTHER APP<select id="gnImportSource"><option>Shotsy</option><option>GLAPP</option><option>Generic CSV</option></select></label><label class="gn-import-file">FROM CSV FILE<input type="file" id="gnUnifiedCsvInput" accept=".csv,text/csv"></label><label class="gn-import-file">FROM GRID//NODE BACKUP<input type="file" id="gnBackupInput" accept=".json,application/json"></label><button type="button" class="gn-import-close" onclick="closeImportDialog()">CANCEL</button></div></div>`);
  $('gnUnifiedCsvInput')?.addEventListener('change', handleUnifiedCsvSelection);
  $('gnBackupInput')?.addEventListener('change', handleBackupImportFile);
}
function openImportDialog() { ensureImportDialog(); $('gnImportOverlay')?.classList.add('active'); }
function closeImportDialog() { $('gnImportOverlay')?.classList.remove('active'); }
function handleUnifiedCsvSelection(event) { closeImportDialog(); handleCSVImportFile(event); }
function handleBackupImportFile(event) {
  const file = event.target.files?.[0]; if (!file) return;
  closeImportDialog();
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(String(reader.result || '{}'));
      if (backup.app !== 'GRID//NODE' || !Array.isArray(backup.shots) || !Array.isArray(backup.weights)) throw new Error('BACKUP_FORMAT_NOT_RECOGNIZED');
      moduleState.pendingBackup = backup; moduleState.pendingImportMeta = { fileName: file.name, format: 'GRID//NODE Backup' };
      setText('csvImportTitle', 'GRID//NODE BACKUP PREVIEW'); setText('csvImportFormat', `DETECTED FORMAT // GRID//NODE BACKUP · ${file.name}`); setText('csvImportSummary', `${backup.shots.length} shots · ${backup.weights.length} weights · ${(backup.measurements || []).length} measurements. Review before commit.`);
      const confirm = $('csvImportConfirmBtn'); if (confirm) { confirm.disabled = false; confirm.textContent = 'RESTORE BACKUP'; confirm.setAttribute('onclick', 'confirmBackupImport()'); }
      $('csvImportOverlay')?.classList.add('active');
    } catch (error) { actionFeedback('BACKUP NOT OPENED', error.message === 'BACKUP_FORMAT_NOT_RECOGNIZED' ? 'THIS FILE IS NOT A GRID//NODE BACKUP' : 'THE SELECTED BACKUP COULD NOT BE READ', true); }
  };
  reader.onerror = () => actionFeedback('BACKUP NOT OPENED', 'THE SELECTED BACKUP COULD NOT BE READ', true);
  reader.readAsText(file); event.target.value = '';
}
function confirmBackupImport() {
  const backup = moduleState.pendingBackup; if (!backup) return;
  const merge = (key, incoming) => { if (!Array.isArray(incoming)) return; S.set(key, mergeImportRecords(S.get(key, []), incoming)); };
  merge('shots', backup.shots); merge('weights', backup.weights); merge('measurements', backup.measurements); merge('results', backup.results); merge('notes', backup.notes); merge('symptoms', backup.symptoms); merge('labs', backup.labs); merge('arsenal', backup.arsenal); merge('researchRecords', backup.researchRecords); merge('devices', backup.devices); merge('inventory', backup.inventory); merge('loadouts', backup.loadouts); merge('eventLedger', backup.eventLedger); if (backup.profile && typeof backup.profile === 'object') S.set('profile', { ...getProfile(), ...backup.profile }); if (backup.preferences && typeof backup.preferences === 'object') S.set('preferences', { ...S.get('preferences', {}), ...backup.preferences }); if (backup.settings && typeof backup.settings === 'object') S.set('settings', { ...S.get('settings', {}), ...backup.settings }); if (backup.selectedLocation) S.set('selectedLocation', backup.selectedLocation);
  appendEventLedger({ type: 'IMPORT', label: 'GRID//NODE BACKUP RESTORED', source: 'GRID//NODE Backup', state: 'Needs Review' }); queueCloudSync('workspace'); const count = (backup.shots?.length || 0) + (backup.weights?.length || 0); cancelCSVImport(); refreshAll(); actionFeedback('BACKUP RESTORED', `${count} RECORD${count === 1 ? '' : 'S'} REVIEWED // LOCAL HISTORY UPDATED`);
}
function cancelCSVImport() { moduleState.pendingImport = null; moduleState.pendingImportMeta = null; moduleState.pendingBackup = null; const confirm = $('csvImportConfirmBtn'); if (confirm) { confirm.setAttribute('onclick', 'confirmCSVImport()'); confirm.textContent = 'IMPORT TO SHOTS HISTORY'; } setText('csvImportTitle', 'CSV IMPORT PREVIEW'); setText('csvImportFormat', 'Review detected user-entered protocol records before appending them to SHOTS HISTORY.'); $('csvImportOverlay')?.classList.remove('active'); }
function confirmCSVImport() {
  const pending = moduleState.pendingImport || [];
  const rechecked = classifyCSVRows(pending.map(item => item.row || item), getAllShots(), getWeights());
  const additions = rechecked.rows.filter(item => item.status === 'new').map(item => item.row);
  if (!additions.length) { actionFeedback('NO NEW RECORDS', 'EXISTING HISTORY WAS NOT CHANGED'); cancelCSVImport(); return; }
  const beforeShots = getAllShots(), beforeWeights = getWeights();
  const shots = [...beforeShots], weights = [...beforeWeights];
  const importedAt = new Date().toISOString();
  additions.forEach(row => {
    const provenance = { importedAt, fileName: moduleState.pendingImportMeta?.fileName || 'CSV file' };
    if (row.record_type === 'weight') weights.push({ id: createId('weight'), date: row.date, weight: row.weight_lb, notes: row.notes || null, source: moduleState.pendingImportMeta?.source || 'CSV Import', state: 'Needs Review', importProvenance: provenance });
    else shots.push({ id: createId('shot'), date: row.date, med: row.medication || 'Custom', dose: row.dose_mg, site: row.location || '', wt: row.weight_lb || null, se: row.side_effects, notes: row.notes || null, archived: row.archived, createdAt: importedAt, source: moduleState.pendingImportMeta?.source || 'CSV Import', state: 'Needs Review', importProvenance: provenance });
  });
  if (!S.set('shots', shots) || !S.set('weights', weights)) {
    S.set('shots', beforeShots); S.set('weights', beforeWeights);
    actionFeedback('IMPORT ROLLED BACK', 'LOCAL STORAGE DID NOT ACCEPT THE COMPLETE TRANSACTION', true);
    return;
  }
  appendEventLedger({ type: 'IMPORT', label: 'CSV IMPORT SAVED', source: moduleState.pendingImportMeta?.source || 'CSV Import', state: 'Needs Review', recordCount: additions.length });
  queueCloudSync('workspace');
  const count = additions.length; cancelCSVImport(); refreshAll(); actionFeedback('IMPORT SAVED', `${count} NEW RECORD${count === 1 ? '' : 'S'} // REVIEW STATE PRESERVED`);
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T12:00`;
  return Number.isNaN(new Date(raw).getTime()) ? '' : raw;
}
function csvShotKey(record) { return [record.date || '', record.medication || record.med || 'Custom', Number(record.dose_mg ?? record.dose).toFixed(4), record.location || record.site || ''].join('|').toLowerCase(); }
function csvWeightKey(record) { return [record.date || '', Number(record.weight_lb ?? record.weight).toFixed(4)].join('|').toLowerCase(); }
function classifyCSVRows(rows, shots, weights) {
  const shotKeys = new Set(shots.map(csvShotKey)), weightKeys = new Set(weights.map(csvWeightKey));
  const seenShots = new Set(), seenWeights = new Set();
  const classified = rows.map(row => {
    const validType = row.record_type === 'shot' || row.record_type === 'weight';
    const validDate = Boolean(row.date) && !Number.isNaN(new Date(row.date).getTime());
    const validValue = row.record_type === 'shot' ? Number.isFinite(row.dose_mg) && row.dose_mg > 0 : Number.isFinite(row.weight_lb) && row.weight_lb > 0;
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

function formatTime24(date) { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
function formatTime12(date) { const hour = date.getHours() % 12 || 12; return `${hour}:${String(date.getMinutes()).padStart(2, '0')}`; }
function getShotTime24(value) { const raw = String(value || '').trim().toUpperCase(); const suffix = moduleState.meridiem; const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/); if (!match) return ''; let hour = Number(match[1]), minute = Number(match[2] || '00'); if (suffix === 'PM' && hour < 12) hour += 12; if (suffix === 'AM' && hour === 12) hour = 0; return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : ''; }
function gnSetShotMeridiem(value) { moduleState.meridiem = value === 'PM' ? 'PM' : 'AM'; updateMeridiemButtons(); }
function updateMeridiemButtons() { $('sTimeAM')?.classList.toggle('active', moduleState.meridiem === 'AM'); $('sTimePM')?.classList.toggle('active', moduleState.meridiem === 'PM'); }
function gnShotClockLiveFormat(input) { if (!input) return; input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4).replace(/^(\d{1,2})(\d{2})$/, '$1:$2'); }
function gnNormalizeShotClockField(input) { if (!input) return; const parsed = getShotTime24(input.value); if (parsed) { const date = new Date(`2000-01-01T${parsed}`); input.value = formatTime12(date); } }
function gnWeightDateInput(input) { if (input) input.value = input.value.replace(/[^0-9\/-]/g, '').slice(0, 10); }
function gnWeightTimeInput(input) { if (input) input.value = input.value.replace(/[^0-9:]/g, '').slice(0, 5); }
function renderShotDatePicker() {
  const month = moduleState.shotPickerMonth;
  const label = $('gnDatePickerMonth');
  const grid = $('gnDatePickerGrid');
  if (!label || !grid) return;
  label.textContent = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const year = month.getFullYear(), monthIndex = month.getMonth(), first = new Date(year, monthIndex, 1).getDay(), total = new Date(year, monthIndex + 1, 0).getDate();
  const selected = moduleState.shotPickerSelected || '';
  grid.innerHTML = `${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => `<div class="gn-date-dow">${day}</div>`).join('')}${Array.from({ length: first }, () => '<button type="button" class="gn-date-day blank" tabindex="-1"></button>').join('')}${Array.from({ length: total }, (_, index) => { const day = index + 1, value = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return `<button type="button" class="gn-date-day${value === selected ? ' selected' : ''}" data-gn-picker-date="${value}"><span>${day}</span></button>`; }).join('')}`;
}
function gnOpenShotDatePicker() {
  const input = $('sDate');
  if (!input) return;
  const selected = normalizeDateInput(input.value) || todayISO();
  moduleState.shotPickerOriginal = input.value;
  moduleState.shotPickerSelected = selected;
  const parsed = parseLocalDate(selected);
  moduleState.shotPickerMonth = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  input.value = formatDate(selected, { month: 'short', day: 'numeric', year: 'numeric' });
  input.type = 'text'; input.setAttribute('readonly', 'readonly');
  renderShotDatePicker();
  $('gnDatePickerOverlay')?.classList.add('active');
}
function gnCloseShotDatePicker() { const input = $('sDate'); if (input && moduleState.shotPickerOriginal !== null) input.value = moduleState.shotPickerOriginal; $('gnDatePickerOverlay')?.classList.remove('active'); if (input) { input.type = 'text'; input.setAttribute('readonly', 'readonly'); } }
function gnDatePickerMove(delta) { moduleState.shotPickerMonth.setMonth(moduleState.shotPickerMonth.getMonth() + Number(delta || 0)); renderShotDatePicker(); }
function gnSelectPickerDate(date) { moduleState.shotPickerSelected = normalizeDateInput(date) || todayISO(); const input = $('sDate'); if (input) input.value = formatDate(moduleState.shotPickerSelected, { month: 'short', day: 'numeric', year: 'numeric' }); renderShotDatePicker(); }
function gnSetShotDateFromPicker() { const input = $('sDate'); if (input && moduleState.shotPickerSelected) input.value = formatDate(moduleState.shotPickerSelected, { month: 'short', day: 'numeric', year: 'numeric' }); moduleState.shotPickerOriginal = null; $('gnDatePickerOverlay')?.classList.remove('active'); }
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
  document.addEventListener('click', event => {
    const zone = event.target.closest('[data-stable-zone]');
    if (zone) { if (navigator.vibrate) navigator.vibrate(4); selectScannerLocation(zone.dataset.stableZone); }
    const overlay = event.target.closest('.zone-overlay');
    if (overlay?.dataset.site) { if (navigator.vibrate) navigator.vibrate(4); selectScannerLocation(overlay.dataset.site); }
    const historyButton = event.target.closest('[data-shot-history-view]');
    if (historyButton) setShotHistoryView(historyButton.dataset.shotHistoryView);
    const shotAction = event.target.closest('[data-shot-action]');
    if (shotAction) { const action = shotAction.dataset.shotAction, id = shotAction.dataset.shotId; if (action === 'edit') editShot(id); if (action === 'archive') openArchiveConfirm(id); if (action === 'restore') restoreArchivedShot(id); if (action === 'restore-edit') restoreArchivedShotToEdit(id); }
    if (event.target.closest('[data-empty-shot]')) handleShotFab();
    const pickerDay = event.target.closest('[data-gn-picker-date]'); if (pickerDay) gnSelectPickerDate(pickerDay.dataset.gnPickerDate);
    const calendarDay = event.target.closest('[data-calendar-day]'); if (calendarDay) calDayClick(calendarDay.dataset.calendarDay);
    const dosePill = event.target.closest('.dose-pill'); if (dosePill) selPill(dosePill, Number(dosePill.dataset.dose));
    const researchPick = event.target.closest('[data-research-name]');
    if (researchPick) { if ($('gnResearchName')) $('gnResearchName').value = researchPick.dataset.researchName || ''; if ($('gnResearchCategory')) $('gnResearchCategory').value = researchPick.dataset.researchCategory || 'Custom Research'; $('gnResearchName')?.focus(); }
    const researchDelete = event.target.closest('[data-research-delete]'); if (researchDelete) deleteResearchRecord(researchDelete.dataset.researchDelete);
  });
  document.addEventListener('click', event => { if (!event.target.closest('.cp-select')) { qa('.cp-dropdown.open').forEach(item => item.classList.remove('open')); qa('.cp-select-trigger.open').forEach(item => item.classList.remove('open')); } });
  wireSelectOptions();
  installCustomPickers(document);
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

window.GNModules=Object.freeze({selectState:selectState,moduleState:moduleState,refreshNodeHeader:refreshNodeHeader,showScreen:showScreen,showPage:showPage,refreshAll:refreshAll,loadApp:loadApp,computeTotalChange:computeTotalChange,saveProfileMed:saveProfileMed,saveProfileMetrics:saveProfileMetrics,calcAndShowBMI:calcAndShowBMI,toggleSelect:toggleSelect,selectOpt:selectOpt,showPhasesModal:showPhasesModal,closePhases:closePhases,renderShots:renderShots,setShotHistoryView:setShotHistoryView,setScannerMode:setScannerMode,selectScannerLocation:selectScannerLocation,renderScanner:renderScanner,openLogModal:openLogModal,closeLog:closeLog,editShot:editShot,openArchiveConfirm:openArchiveConfirm,cancelArchiveShot:cancelArchiveShot,confirmArchiveShot:confirmArchiveShot,restoreArchivedShot:restoreArchivedShot,openPermanentDeleteConfirm:openPermanentDeleteConfirm,cancelPermanentDeleteShot:cancelPermanentDeleteShot,confirmPermanentDeleteShot:confirmPermanentDeleteShot,saveShot:saveShot,openFutureTimestampConfirm:openFutureTimestampConfirm,closeFutureTimestampConfirm:closeFutureTimestampConfirm,cancelFutureTimestampSave:cancelFutureTimestampSave,confirmFutureTimestampSave:confirmFutureTimestampSave,handleShotFab:handleShotFab,goToScannerForLocationFromLog:goToScannerForLocationFromLog,openWeightModal:openWeightModal,closeWt:closeWt,setWeightUnit:setWeightUnit,saveWt:saveWt,renderResults:renderResults,setRange:setRange,setWtRange:setWtRange,showLabSeg:showLabSeg,showYouSeg:showYouSeg,openLabTool:openLabTool,closeLabTool:closeLabTool,exportInventory:exportInventory,updateDoseProjection:updateDoseProjection,saveCalculatorReference:saveCalculatorReference,renderLab:renderLab,updateSyr:updateSyr,updateRecon:updateRecon,updateSupply:updateSupply,setMeasurementUnit:setMeasurementUnit,saveMeasurements:saveMeasurements,openDeleteLocalData:openDeleteLocalData,closeDeleteLocalData:closeDeleteLocalData,updateDeleteLocalButton:updateDeleteLocalButton,confirmDeleteLocalData:confirmDeleteLocalData,openDeleteCloudAccount:openDeleteCloudAccount,closeDeleteCloudAccount:closeDeleteCloudAccount,confirmDeleteCloudAccount:confirmDeleteCloudAccount,renderProfile:renderProfile,dismissSystemUpdate:dismissSystemUpdate,openSystemUpdate:openSystemUpdate,exportCSV:exportCSV,exportBackup:exportBackup,prepareCSVImport:prepareCSVImport,handleCSVImportFile:handleCSVImportFile,openImportDialog:openImportDialog,closeImportDialog:closeImportDialog,handleUnifiedCsvSelection:handleUnifiedCsvSelection,handleBackupImportFile:handleBackupImportFile,confirmBackupImport:confirmBackupImport,cancelCSVImport:cancelCSVImport,confirmCSVImport:confirmCSVImport,previewCSVImportForTesting:previewCSVImportForTesting,renderCalendar:renderCalendar,calPrev:calPrev,calNext:calNext,calDayClick:calDayClick,openArsenalMod:openArsenalMod,closeArs:closeArs,saveArs:saveArs,requestLoadoutRemove:requestLoadoutRemove,cancelLoadoutRemove:cancelLoadoutRemove,confirmLoadoutRemove:confirmLoadoutRemove,formatTime24:formatTime24,formatTime12:formatTime12,gnSetShotMeridiem:gnSetShotMeridiem,gnShotClockLiveFormat:gnShotClockLiveFormat,gnNormalizeShotClockField:gnNormalizeShotClockField,gnWeightDateInput:gnWeightDateInput,gnWeightTimeInput:gnWeightTimeInput,gnOpenShotDatePicker:gnOpenShotDatePicker,gnCloseShotDatePicker:gnCloseShotDatePicker,gnDatePickerMove:gnDatePickerMove,gnSelectPickerDate:gnSelectPickerDate,gnSetShotDateFromPicker:gnSetShotDateFromPicker,gnSetShotDateValue:gnSetShotDateValue,gnSetShotTimeValue:gnSetShotTimeValue,gnMedRevealGroup:gnMedRevealGroup,updatePills:updatePills,selPill:selPill,initModules:initModules});

const modules=window.GNModules;

/* GRID//NODE stable app bootstrap
 * Auth UI, boot sequence, compatibility bridge for existing inline controls.
 */

let bootRunning = false;
let authMode = 'signin';
let passwordRecoveryActive = false;
let googleIdentityPromise = null;
let googleIdentityInitialized = false;
let orientationTimer = null;

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
    .gn-auth-card{width:min(100%,380px);padding:28px 22px;border:1px solid rgba(0,212,255,.24);border-top:2px solid #00d4ff;background:linear-gradient(180deg,rgba(14,14,22,.96),rgba(5,5,8,.98));box-shadow:0 16px 46px rgba(0,0,0,.45)}
    .gn-auth-kicker{font:700 .62rem var(--font-m,monospace);letter-spacing:3px;color:#00d4ff;text-align:center}.gn-auth-title{font:700 1.45rem var(--font-d,monospace);letter-spacing:3px;color:#fff;text-align:center;margin:10px 0 5px}.gn-auth-copy{font:.72rem/1.5 var(--font-m,monospace);color:#8295a0;text-align:center;margin:0 0 20px}
    .gn-auth-field{width:100%;box-sizing:border-box;margin:0 0 10px;padding:13px 12px;border:1px solid rgba(0,212,255,.2);background:#080810;color:#eeeef5;border-radius:3px;font:16px var(--font-m,monospace);outline:none}.gn-auth-field:focus{border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.1)}
    .gn-auth-primary,.gn-auth-secondary,.gn-auth-google{width:100%;min-height:46px;margin-top:8px;border-radius:3px;cursor:pointer;font:700 .68rem var(--font-d,monospace);letter-spacing:2px}.gn-auth-primary{border:0;background:linear-gradient(135deg,#ff3355,#c80036);color:#fff}.gn-auth-secondary{border:1px solid rgba(0,212,255,.35);background:transparent;color:#00d4ff}.gn-auth-google{border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);color:#00d4ff}.gn-auth-google:disabled{cursor:not-allowed;opacity:.55;border-color:rgba(130,149,160,.28);color:#8295a0;box-shadow:none}.gn-auth-primary-label{margin-top:4px;color:#00d4ff;font:700 .52rem var(--font-m,monospace);letter-spacing:2px;text-align:left}.gn-google-button-shell{width:100%;min-height:54px;margin-top:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid rgba(0,212,255,.42);background:rgba(0,212,255,.06);border-radius:3px}.gn-google-button-shell.loading{pointer-events:none;opacity:.55}.gn-google-button-shell>div{max-width:100%}.gn-auth-privacy{display:grid;gap:4px;margin-top:12px;padding:10px 11px;border-left:2px solid #00d4ff;background:rgba(0,212,255,.045);color:#9fc7d4;font:.58rem/1.45 var(--font-m,monospace)}.gn-auth-privacy strong{color:#e8fcff;letter-spacing:1px}.gn-auth-options{margin-top:16px;border-top:1px solid rgba(255,255,255,.07);padding-top:12px}.gn-auth-options summary{cursor:pointer;color:#8295a0;font:700 .56rem var(--font-m,monospace);letter-spacing:1.4px;list-style:none}.gn-auth-options summary::-webkit-details-marker{display:none}.gn-auth-options[open] summary{color:#00d4ff;margin-bottom:10px}.gn-auth-links{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.gn-auth-link{padding:0;border:0;background:transparent;color:#8295a0;font:600 .58rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}.gn-auth-link:hover{color:#00d4ff}.gn-auth-message{min-height:22px;margin-top:14px;text-align:center;font:.62rem/1.4 var(--font-m,monospace);letter-spacing:.7px;color:#8295a0}.gn-auth-note{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);font:.56rem/1.5 var(--font-m,monospace);letter-spacing:.6px;color:#586d76;text-align:center}
    .gn-phase-row{display:flex;gap:12px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.07)}.gn-phase-index{font:700 .72rem var(--font-m,monospace);color:#ff3355}.gn-phase-row b{font:700 .72rem var(--font-d,monospace);letter-spacing:1px}.gn-phase-row p{margin:4px 0 0;color:#8295a0;font:.66rem/1.4 var(--font-m,monospace)}
    .gn-weight-record{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)}.gn-weight-record b{display:block;color:#00ff88;font:700 .78rem var(--font-d,monospace)}.gn-weight-record span,.gn-weight-record small{display:block;margin-top:3px;color:#8295a0;font:.6rem var(--font-m,monospace)}.gn-calendar-detail{padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07);font:.66rem var(--font-m,monospace);color:#9fc7d4}
    .gn-toast-kicker{display:none}.gn-toast-message{display:block;font:600 .68rem var(--font-d,monospace);letter-spacing:.7px;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gn-wanda-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 14px}.gn-wanda-card{min-width:0;padding:12px;border:1px solid rgba(0,212,255,.17);border-left:2px solid #00d4ff;background:linear-gradient(135deg,rgba(0,212,255,.055),rgba(0,0,0,.24));color:#eef6f8;text-align:left;cursor:pointer}.gn-wanda-card:hover,.gn-wanda-card:focus-visible{border-color:#00d4ff;background:rgba(0,212,255,.1);outline:none}.gn-wanda-label{display:block;color:#8295a0;font:700 .5rem var(--font-m,monospace);letter-spacing:1.3px}.gn-wanda-value{display:block;margin-top:6px;overflow:hidden;text-overflow:ellipsis;color:#eef6f8;font:800 .9rem var(--font-d,monospace);letter-spacing:.6px;white-space:nowrap}.gn-wanda-note{display:block;margin-top:4px;color:#8295a0;font:.56rem/1.35 var(--font-m,monospace)}.gn-wanda-card.attention{border-color:#ff3355}.gn-wanda-card.attention .gn-wanda-value{color:#ff5577}.gn-wanda-card.empty .gn-wanda-value{color:#6f828c}.gn-wanda-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:-4px 0 16px}.gn-wanda-actions button{min-height:43px;border:1px solid rgba(0,212,255,.35);background:rgba(0,212,255,.045);color:#00d4ff;font:700 .62rem var(--font-d,monospace);letter-spacing:1.3px;cursor:pointer}.gn-wanda-actions button:first-child{border-color:rgba(255,51,85,.5);background:rgba(255,51,85,.06);color:#ff5577}
    .gn-weekly-report{margin:0 0 14px;padding:14px;border:1px solid rgba(0,212,255,.2);border-top:2px solid #00d4ff;background:linear-gradient(180deg,rgba(8,20,27,.92),rgba(6,8,13,.96))}.gn-weekly-report h3{margin:0;color:#eef6f8;font:800 .85rem var(--font-d,monospace);letter-spacing:1.8px}.gn-weekly-report p{margin:8px 0 0;color:#9fc7d4;font:.68rem/1.5 var(--font-m,monospace)}.gn-weekly-signals{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:11px}.gn-weekly-signals span{padding:8px;border:1px solid rgba(0,212,255,.12);color:#8295a0;font:.54rem/1.35 var(--font-m,monospace)}.gn-weekly-signals b{display:block;margin-top:3px;color:#00ff88;font-size:.68rem}
    .gn-orientation{position:fixed;inset:0;z-index:900;display:grid;align-items:end;padding:16px;background:rgba(0,0,0,.72)}.gn-orientation-card{width:min(100%,430px);box-sizing:border-box;margin:0 auto;padding:18px;border:1px solid rgba(0,212,255,.5);border-top:2px solid #00d4ff;background:#080b10;box-shadow:0 18px 60px rgba(0,0,0,.72)}.gn-orientation-kicker{color:#00d4ff;font:700 .55rem var(--font-m,monospace);letter-spacing:2px}.gn-orientation-card h2{margin:9px 0 7px;color:#fff;font:800 1.05rem var(--font-d,monospace);letter-spacing:1.5px}.gn-orientation-card p{margin:0;color:#a9bbc3;font:.75rem/1.5 var(--font-b,system-ui)}.gn-orientation-actions{display:flex;align-items:center;gap:8px;margin-top:16px}.gn-orientation-actions button{min-height:40px;padding:0 14px;border:1px solid rgba(0,212,255,.35);background:transparent;color:#00d4ff;font:700 .58rem var(--font-d,monospace);letter-spacing:1px}.gn-orientation-actions .next{margin-left:auto;background:#00d4ff;color:#001015}.gn-orientation-dots{display:flex;gap:5px}.gn-orientation-dots i{width:6px;height:6px;border-radius:50%;background:#31434b}.gn-orientation-dots i.active{background:#00d4ff;box-shadow:0 0 7px #00d4ff}.gn-orientation-target{position:relative!important;z-index:901!important;box-shadow:0 0 0 2px #00d4ff,0 0 22px rgba(0,212,255,.42)!important}.gn-log-step{margin:0 0 8px;color:#00d4ff;font:700 .53rem var(--font-m,monospace);letter-spacing:1.8px}.gn-shot-optional{margin-top:10px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px}.gn-shot-optional summary{cursor:pointer;color:#8295a0;font:700 .56rem var(--font-m,monospace);letter-spacing:1.2px}.cp-dropdown{max-height:40vh!important;overflow-y:auto!important}.toast{top:calc(58px + var(--safe-top))!important;left:auto!important;right:10px!important;width:min(330px,calc(100vw - 20px))!important;padding:9px 11px!important}.toast .gn-toast-kicker{font-size:.49rem}.toast .gn-toast-message{font-size:.64rem}
    .gn-lab-breadcrumb{margin:0 0 10px;color:#8295a0;font:600 .54rem var(--font-m,monospace);letter-spacing:1px}.gn-lab-breadcrumb b{color:#00d4ff}.gn-foundation-grid{grid-template-columns:repeat(2,1fr)!important}.gn-foundation-tile{min-height:86px}.gn-foundation-panel.gn-tool-focus .gn-foundation-section:not([open]){display:none}.gn-reference-pending{margin:0 0 14px;padding:11px;border-left:2px solid #8295a0;background:rgba(130,149,160,.055);color:#91a5ae;font:.6rem/1.45 var(--font-m,monospace)}
    @media(max-width:620px){.gn-wanda-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gn-weekly-signals{grid-template-columns:1fr}.scroll-body{padding-bottom:calc(66px + var(--safe-bottom))!important}.page-hdr{margin-bottom:12px!important}.card,.phase-card,.results-card{margin-bottom:10px!important}.bottom-nav{height:62px!important}.nav-lbl{font-size:.51rem!important;color:#8ea2b0!important}.nav-item.active .nav-lbl{color:#00d4ff!important}.nav-ico{opacity:.82}.nav-item.active .nav-ico{opacity:1}.gn-orientation{padding:10px}.gn-orientation-card{padding:15px}.gn-foundation-grid{grid-template-columns:1fr 1fr!important}}
    @media(max-width:340px){.gn-wanda-grid{grid-template-columns:1fr}.gn-wanda-card{padding:10px}.gn-orientation-actions button{padding:0 10px}.gn-foundation-grid{grid-template-columns:1fr!important}}
    @media(prefers-reduced-motion:reduce){.gn-orientation-target,.gn-next-overdue{animation:none!important}.gn-orientation *{scroll-behavior:auto!important}}
    .gn-foundation-panel,.gn-profile-hub{margin:0 0 18px;padding:15px;border:1px solid rgba(0,212,255,.2);border-top:2px solid #00d4ff;background:linear-gradient(180deg,rgba(12,18,25,.92),rgba(7,8,13,.96));box-shadow:0 10px 28px rgba(0,0,0,.22)}.gn-foundation-head,.gn-device-vault-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.gn-foundation-kicker{font:700 .53rem var(--font-m,monospace);letter-spacing:2px;color:#00d4ff;margin-bottom:5px}.gn-foundation-head h2,.gn-device-vault-head h3{margin:0;color:#eef6f8;font:700 1rem var(--font-d,monospace);letter-spacing:2px}.gn-foundation-head h2 span,.gn-device-vault-head h3{color:#ffb000}.gn-foundation-signal{font:600 .5rem var(--font-m,monospace);letter-spacing:1px;color:#00ff88;text-align:right}.gn-foundation-grid,.gn-hub-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:14px}.gn-hub-grid{grid-template-columns:repeat(2,1fr)}.gn-foundation-tile,.gn-hub-grid>div{min-width:0;padding:11px;border:1px solid rgba(0,212,255,.15);background:rgba(0,212,255,.025);text-align:left;color:#e9f5f7}.gn-foundation-tile{cursor:pointer}.gn-foundation-tile.active,.gn-foundation-tile:hover{border-color:#00d4ff;background:rgba(0,212,255,.1)}.gn-foundation-icon{display:block;margin-bottom:8px}.gn-foundation-tile b,.gn-hub-grid b{display:block;font:700 .6rem var(--font-d,monospace);letter-spacing:1px}.gn-foundation-tile small,.gn-hub-grid small{display:block;margin-top:4px;color:#8295a0;font:.57rem/1.35 var(--font-m,monospace)}.gn-foundation-section{border-top:1px solid rgba(255,255,255,.08);padding-top:12px;margin-top:12px}.gn-foundation-section summary{display:flex;justify-content:space-between;gap:10px;cursor:pointer;color:#eef6f8;font:700 .65rem var(--font-d,monospace);letter-spacing:1.5px}.gn-foundation-section summary em{font:500 .52rem var(--font-m,monospace);color:#8295a0;font-style:normal;letter-spacing:1px;text-align:right}.gn-research-notice{display:grid;gap:5px;margin:12px 0;padding:10px;border-left:3px solid #ffb000;background:rgba(255,176,0,.06);color:#d6c297;font:.59rem/1.45 var(--font-m,monospace)}.gn-research-notice strong{color:#ffd000;letter-spacing:1px}.gn-research-library{display:grid;gap:9px;margin:12px 0}.gn-research-group>span{display:block;margin-bottom:5px;color:#8295a0;font:600 .52rem var(--font-m,monospace);letter-spacing:1px}.gn-research-group>div{display:flex;flex-wrap:wrap;gap:5px}.gn-research-group button{padding:7px 8px;border:1px solid rgba(0,212,255,.2);background:rgba(0,212,255,.035);color:#a9dce8;font:600 .58rem var(--font-m,monospace);cursor:pointer}.gn-research-group button:hover{border-color:#00d4ff;color:#fff;background:rgba(0,212,255,.12)}.gn-record-form{display:grid;gap:9px;margin-top:12px}.gn-form-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.gn-record-form label{display:grid;gap:5px;color:#8295a0;font:600 .52rem var(--font-m,monospace);letter-spacing:1px}.gn-record-form input,.gn-record-form select,.gn-record-form textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid rgba(0,212,255,.18);background:#080810;color:#eef6f8;font:16px var(--font-m,monospace);outline:none;border-radius:2px;resize:vertical}.gn-record-form input:focus,.gn-record-form select:focus,.gn-record-form textarea:focus{border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.08)}.gn-record-list,.gn-device-list,.gn-ledger-list{display:grid;gap:0;margin-top:12px}.gn-record-row,.gn-ledger-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;padding:10px 0;border-top:1px solid rgba(255,255,255,.07)}.gn-record-row b,.gn-ledger-row b{display:block;color:#eef6f8;font:700 .62rem var(--font-d,monospace);letter-spacing:1px}.gn-record-row small,.gn-ledger-row small{display:block;margin-top:3px;color:#8295a0;font:.56rem var(--font-m,monospace)}.gn-record-state{color:#00ff88;font:600 .5rem var(--font-m,monospace);letter-spacing:.7px;white-space:nowrap}.gn-record-delete{border:0;background:transparent;color:#ff5577;font-size:1rem;cursor:pointer}.gn-empty-state{display:grid;justify-items:start;gap:5px;padding:16px 0;color:#8295a0;font:.6rem/1.4 var(--font-m,monospace)}.gn-empty-state b{color:#a9dce8;letter-spacing:1px}.gn-ledger-copy{margin:10px 0;color:#8295a0;font:.6rem/1.45 var(--font-m,monospace)}.gn-ledger-row{grid-template-columns:auto 1fr auto}.gn-ledger-dot{width:6px;height:6px;border-radius:50%;background:#00d4ff;box-shadow:0 0 8px #00d4ff}.gn-ledger-row em{font:500 .5rem var(--font-m,monospace);color:#8295a0;text-align:right;font-style:normal}.gn-device-vault{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
    .gn-profile-sections{display:grid;gap:12px;margin:4px 0 16px}.gn-profile-section{overflow:hidden;border:1px solid rgba(0,212,255,.16);background:rgba(0,0,0,.2)}.gn-profile-section-label{padding:10px 12px;color:#00d4ff;font:700 .55rem var(--font-m,monospace);letter-spacing:2px;border-bottom:1px solid rgba(0,212,255,.13)}.gn-profile-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:13px 12px;border:0;border-top:1px solid rgba(255,255,255,.07);background:transparent;color:#eef6f8;text-align:left;text-decoration:none;cursor:pointer}.gn-profile-section .gn-profile-row:first-of-type{border-top:0}.gn-profile-row:hover,.gn-profile-row:focus-visible{background:rgba(0,212,255,.07);outline:none}.gn-profile-row b{display:block;font:700 .62rem var(--font-d,monospace);letter-spacing:1px}.gn-profile-row small{display:block;margin-top:4px;color:#8295a0;font:.58rem/1.35 var(--font-m,monospace)}.gn-profile-chevron{color:#00d4ff;font:700 1.1rem var(--font-m,monospace);line-height:1}.gn-profile-signout{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;margin:0 0 16px;padding:14px 12px;border:1px solid rgba(255,51,85,.55);border-left:3px solid #ff3355;background:rgba(255,51,85,.045);color:#fff;text-align:left;cursor:pointer}.gn-profile-signout:hover,.gn-profile-signout:focus-visible{background:rgba(255,51,85,.1);outline:none}.gn-profile-signout b{display:block;color:#ff5577;font:700 .68rem var(--font-d,monospace);letter-spacing:1.5px}.gn-profile-signout small{display:block;margin-top:4px;color:#b58b96;font:.58rem var(--font-m,monospace)}.gn-profile-danger-row b{color:#ff6a7f}.gn-research-disclaimer{margin:12px 0 0;padding:10px;border-top:1px solid rgba(255,255,255,.08);color:#8295a0;font:.58rem/1.45 var(--font-m,monospace)}.landing-footer-honesty{margin:16px 0 0;color:#8295a0;font:.65rem/1.5 var(--font-m,monospace);letter-spacing:.4px}
    .gn-shot-filters{margin:10px 0 14px;border:1px solid rgba(0,212,255,.18);background:rgba(0,212,255,.025);padding:10px 12px}.gn-shot-filters summary{cursor:pointer;color:#9fc7d4;font:700 .6rem var(--font-m,monospace);letter-spacing:1.5px}.gn-shot-filter-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}.gn-shot-filter-grid label,.gn-measurements-tools label,.gn-dose-grid label{display:grid;gap:5px;color:#8295a0;font:600 .53rem var(--font-m,monospace);letter-spacing:1px}.gn-shot-filter-grid select,.gn-shot-filter-grid input,.gn-measurements-tools select,.gn-measurements-tools input,.gn-dose-grid input{box-sizing:border-box;width:100%;padding:9px 8px;border:1px solid rgba(0,212,255,.18);background:#080810;color:#eef6f8;font:16px var(--font-m,monospace);border-radius:2px}.gn-filter-count{color:#ffd700;margin-left:7px}.gn-shot-filter-clear{margin-top:10px;padding:8px 10px;border:1px solid rgba(255,215,0,.38);background:transparent;color:#ffd700;font:700 .55rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}.gn-next-today{border-color:#ff3355!important;box-shadow:0 0 18px rgba(255,51,85,.18)}.gn-next-tomorrow{border-color:#00d4ff!important}.gn-next-overdue{border-color:#ff3355!important;animation:gnShotOverdue 1.8s ease-in-out infinite}.gn-next-today .stat-sub,.gn-next-overdue .stat-sub{color:#ff5577!important}@keyframes gnShotOverdue{50%{box-shadow:0 0 20px rgba(255,51,85,.22)}}
    .gn-measurements-card,.gn-dose-projection{margin:0 0 20px;padding:16px;border:1px solid rgba(0,212,255,.2);border-top:2px solid #00d4ff;background:linear-gradient(180deg,rgba(12,18,25,.92),rgba(7,8,13,.96));box-shadow:0 10px 28px rgba(0,0,0,.2)}.gn-measurements-card h3,.gn-dose-projection h2{margin:0;color:#eef6f8;font:700 1rem var(--font-d,monospace);letter-spacing:2px}.gn-measurements-copy,.gn-dose-copy{margin:7px 0 14px;color:#8295a0;font:.62rem/1.45 var(--font-m,monospace)}.gn-measurements-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.gn-measurements-grid,.gn-dose-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.gn-measurements-grid>label{display:grid;gap:5px;padding:9px;border:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.2);color:#9fc7d4;font:600 .53rem var(--font-m,monospace);letter-spacing:.7px}.gn-measurements-grid>label span{display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap}.gn-measurements-grid small{color:#8295a0;font-weight:400;letter-spacing:0;text-align:right}.gn-measurements-grid input{box-sizing:border-box;width:100%;padding:9px 8px;border:1px solid rgba(0,212,255,.18);background:#080810;color:#eef6f8;font:16px var(--font-m,monospace)}.gn-measurements-empty{margin-top:10px;color:#8295a0;font:.6rem var(--font-m,monospace)}.gn-measurement-trend-list{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:10px}.gn-measurement-trend-row{display:flex;justify-content:space-between;gap:8px;padding:9px;border:1px solid rgba(0,212,255,.12);color:#9fc7d4;font:.58rem var(--font-m,monospace)}.gn-measurement-trend-row span{color:#00ff88}.gn-dose-grid{grid-template-columns:repeat(4,1fr)}.gn-dose-output{margin-top:12px;padding:12px;border-left:3px solid #00d4ff;background:rgba(0,212,255,.05);color:#e8fcff;font:.7rem/1.7 var(--font-m,monospace)}.gn-dose-disclaimer{margin-top:10px;padding:11px;border:1px solid rgba(255,215,0,.45);border-left:3px solid #ffd700;background:rgba(255,215,0,.06);color:#f1d982;font:.62rem/1.5 var(--font-m,monospace)}.gn-dose-disclaimer strong{color:#ffd700}.gn-import-overlay,.gn-delete-overlay{position:fixed;inset:0;z-index:180;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.78)}.gn-import-overlay.active,.gn-delete-overlay.active{display:flex}.gn-import-panel,.gn-delete-panel{width:min(100%,480px);max-height:90vh;overflow:auto;padding:18px;border:1px solid rgba(0,212,255,.36);border-top:2px solid #00d4ff;background:#080810;box-shadow:0 18px 50px rgba(0,0,0,.6)}.gn-import-panel p,.gn-delete-panel p{color:#9fc7d4;font:.65rem/1.5 var(--font-m,monospace)}.gn-import-panel>label{display:grid;gap:6px;margin-top:12px;color:#9fc7d4;font:600 .58rem var(--font-m,monospace);letter-spacing:1px}.gn-import-panel select,.gn-import-panel input{box-sizing:border-box;width:100%;padding:10px;background:#0e0e16;border:1px solid rgba(0,212,255,.2);color:#eef6f8;font:16px var(--font-m,monospace)}.gn-import-title,.gn-delete-kicker{color:#00d4ff;font:700 .64rem var(--font-m,monospace);letter-spacing:2px}.gn-import-close{width:100%;margin-top:14px;padding:11px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#9fc7d4;font:700 .6rem var(--font-m,monospace);letter-spacing:1px}.gn-delete-panel h2{margin:8px 0;color:#ff5577;font:700 1.05rem var(--font-d,monospace);letter-spacing:1.5px}.gn-delete-panel label{display:grid;gap:6px;color:#ffd700;font:700 .58rem var(--font-m,monospace);letter-spacing:1px}.gn-delete-panel input{padding:11px;background:#080810;border:1px solid rgba(255,51,85,.4);color:#fff;font:16px var(--font-m,monospace)}.gn-delete-note{color:#ffd982!important}.gn-delete-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.gn-delete-confirm{border-color:#ff3355!important;color:#ff6a7f!important}.gn-delete-confirm:disabled{cursor:not-allowed;opacity:.4}
    #boot .boot-command-deck{width:min(92vw,520px);padding:26px 22px;background:linear-gradient(180deg,rgba(10,16,23,.96),rgba(5,5,8,.98));border-color:rgba(0,212,255,.34);box-shadow:0 0 55px rgba(0,212,255,.11),inset 0 0 40px rgba(0,212,255,.025)}#boot .boot-terminal,#boot .boot-prog-wrap{max-width:100%}
    canvas{display:block;max-width:100%}
    @media(max-width:560px){.gn-foundation-grid{grid-template-columns:1fr}.gn-form-grid{grid-template-columns:1fr}.gn-foundation-head,.gn-device-vault-head{display:block}.gn-foundation-signal{display:block;margin-top:7px;text-align:left}.gn-record-row{grid-template-columns:1fr auto auto}.gn-ledger-row{grid-template-columns:auto 1fr}.gn-ledger-row em{grid-column:2;text-align:left}}
    .gn-hub-grid>button{font:inherit;cursor:pointer}.gn-hub-grid>button:hover,.gn-hub-grid>button:focus-visible{border-color:#00d4ff;background:rgba(0,212,255,.1)}
    @media(max-width:560px){.gn-shot-filter-grid,.gn-dose-grid{grid-template-columns:1fr 1fr}.gn-measurements-grid{grid-template-columns:1fr}.gn-measurement-trend-list{grid-template-columns:1fr}}
    @media(max-width:380px){.gn-auth-card{padding:24px 16px}.gn-stable-zone-btn{font-size:.62rem}.gn-measurements-tools,.gn-dose-grid{grid-template-columns:1fr}.gn-delete-actions{grid-template-columns:1fr}}
    .gn-weekly-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.gn-weekly-actions button{min-height:40px;border:1px solid rgba(0,212,255,.35);background:rgba(0,212,255,.045);color:#00d4ff;font:700 .58rem var(--font-d,monospace);letter-spacing:1px;cursor:pointer}.gn-weekly-actions button:first-child{border-color:rgba(255,51,85,.5);color:#ff5577;background:rgba(255,51,85,.06)}
    .gn-foundation-panel > .gn-foundation-section{display:none!important}.gn-lab-tool-overlay{position:fixed;inset:0;z-index:220;display:none;overflow:auto;padding:calc(8px + var(--safe-top)) 10px calc(12px + var(--safe-bottom));background:rgba(0,0,0,.88)}.gn-lab-tool-overlay.active{display:block}.gn-lab-tool-shell{width:min(100%,720px);min-height:100%;box-sizing:border-box;margin:0 auto;padding:14px;border:1px solid rgba(0,212,255,.28);border-top:2px solid #00d4ff;background:#080b10;box-shadow:0 18px 60px rgba(0,0,0,.72)}.gn-lab-tool-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(0,212,255,.14)}.gn-lab-tool-head>div{flex:1}.gn-lab-tool-head h2{margin:0;color:#eef6f8;font:700 1rem var(--font-d,monospace);letter-spacing:2px}.gn-lab-back{min-height:36px;padding:8px 10px;border:1px solid rgba(0,212,255,.35);background:rgba(0,212,255,.04);color:#00d4ff;font:700 .58rem var(--font-d,monospace);letter-spacing:1px;cursor:pointer}.gn-lab-tool-host>.time-tabs,.gn-lab-tool-host>.gn-foundation-section,.gn-lab-tool-host>.gn-dose-projection,.gn-lab-tool-host>.gn-device-vault{margin-top:0}.gn-lab-tool-host>.gn-foundation-section{display:block!important}.gn-lab-tool-host>.gn-device-vault{border-top:0;padding-top:0}.phase-context-text{margin:12px 0;padding:11px 12px;border-left:2px solid #00d4ff;background:rgba(0,212,255,.045);color:#a9dce8;font:.68rem/1.5 var(--font-m,monospace)}
    .toast{position:fixed!important;top:calc(6px + var(--safe-top))!important;left:10px!important;right:10px!important;width:auto!important;box-sizing:border-box!important;z-index:1000!important;padding:8px 10px!important;border:0!important;border-bottom:1px solid #00d4ff!important;border-radius:0!important;background:#0a1016!important;box-shadow:0 8px 18px rgba(0,0,0,.4)!important;white-space:nowrap!important;overflow:hidden!important;animation:none!important}.toast.err{border-bottom-color:#ff3355!important}.toast .gn-toast-kicker{display:none!important}.toast .gn-toast-message{display:block!important;font-size:.68rem!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .nav-lbl{font-size:.55rem!important;color:#8a8aa0!important}.nav-item:not(.active) .nav-lbl{color:#8a8aa0!important}.nav-item.active .nav-lbl{color:#00d4ff!important}.nav-item.active::before{height:1px!important;box-shadow:0 0 7px #00d4ff!important}.landing-node-mark{opacity:.65!important}
    @media(max-width:620px){.scroll-body{padding-bottom:calc(50px + var(--safe-bottom))!important}.nav-lbl{font-size:.55rem!important;color:#8a8aa0!important}.gn-foundation-grid{grid-template-columns:1fr 1fr!important}}
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
    .phase-ring-svg-wrap .phase-segment-ring,.landing-phase-visual .phase-segment-ring{position:absolute;border-radius:50%;background:conic-gradient(from -90deg,#00d4ff 0deg 72deg,#2f7bff 72deg 144deg,#ffd700 144deg 216deg,#ff5577 216deg 288deg,#9898b0 288deg 360deg);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));pointer-events:none;z-index:0;opacity:.72}
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
  login.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:0"><div class="gn-auth-card">
    <div class="gn-auth-kicker">// PERSONAL BIOTECH OPERATING SYSTEM //</div>
    <div class="gn-auth-title">${recovering ? 'RESET ACCESS' : 'JACK IN'}</div>
    <p class="gn-auth-copy">${recovering ? 'Enter a new password for this GRID//NODE cloud account.' : 'Use a cloud account when you want recovery across devices. Local session keeps your record on this device.'}</p>
    ${recovering ? '' : '<div class="gn-auth-primary-label">PRIMARY CLOUD PATH</div><div class="gn-google-button-shell" id="gnGoogleButtonMount" aria-label="Continue with Google"></div><div class="gn-auth-privacy"><strong>YOUR DATA STAYS YOURS.</strong><span>Connect cloud recovery only when you choose. GRID//NODE remains a tracking and educational system, not medical advice.</span></div><button class="gn-auth-secondary" id="gnLocalBtn" type="button">CONTINUE LOCALLY</button><details class="gn-auth-options"><summary>OTHER SIGN-IN OPTIONS</summary>'}
    <form id="gnAuthForm" novalidate>
      <input class="gn-auth-field" id="gnAuthEmail" type="email" autocomplete="email" placeholder="EMAIL ADDRESS" aria-label="Email address"${recovering ? ' hidden' : ''}>
      <input class="gn-auth-field" id="gnAuthPassword" type="password" autocomplete="${recovering ? 'new-password' : 'current-password'}" placeholder="${recovering ? 'NEW PASSWORD' : 'PASSWORD'}" aria-label="${recovering ? 'New password' : 'Password'}">
      <button class="gn-auth-primary" id="gnAuthSubmit" type="submit">${recovering ? 'UPDATE PASSWORD' : 'SIGN IN TO CLOUD'}</button>
    </form>
    <div class="gn-auth-links"><button class="gn-auth-link" id="gnAuthModeToggle" type="button">${recovering ? 'BACK TO SIGN IN' : 'CREATE ACCOUNT'}</button>${recovering ? '' : '<button class="gn-auth-link" id="gnAuthReset" type="button">RESET PASSWORD</button>'}</div>
    ${recovering ? '' : '</details>'}
    <div class="gn-auth-message" id="loginMsg" role="status" aria-live="polite"></div>
    <div class="gn-auth-note">// VAULT POLICY: YOUR RECORD STAYS LOCAL UNTIL YOU CONNECT A CLOUD ACCOUNT // GRID//NODE DOES NOT PROVIDE MEDICAL ADVICE //</div>
  </div></div>`;
  $('gnAuthForm')?.addEventListener('submit', event => { event.preventDefault(); submitAuth(); });
  $('gnAuthModeToggle')?.addEventListener('click', toggleAuthMode);
  $('gnAuthReset')?.addEventListener('click', requestPasswordReset);
  $('gnLocalBtn')?.addEventListener('click', enterLocalSession);
  updateAuthMode();
  renderGoogleIdentityButton();
}

function updateAuthMode() {
  const submit = $('gnAuthSubmit'), toggle = $('gnAuthModeToggle');
  if (submit) submit.textContent = authMode === 'recovery' ? 'UPDATE PASSWORD' : authMode === 'signin' ? 'SIGN IN TO CLOUD' : 'CREATE CLOUD ACCOUNT';
  if (toggle) toggle.textContent = authMode === 'signin' ? 'CREATE ACCOUNT' : 'BACK TO SIGN IN';
}
function toggleAuthMode() { if (authMode === 'recovery') { passwordRecoveryActive = false; authMode = 'signin'; authShell(); return; } authMode = authMode === 'signin' ? 'signup' : 'signin'; updateAuthMode(); setAuthMessage('', false); }
function setAuthMessage(message, error = false) { const element = $('loginMsg'); if (element) { element.textContent = message; element.style.color = error ? '#ff5577' : '#8295a0'; } }

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
    setAuthMessage('// GOOGLE SIGN-IN IS NOT ENABLED YET — USE EMAIL OR CONTINUE LOCALLY', false);
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
    setAuthMessage('// GOOGLE SIGN-IN COULD NOT LOAD — USE EMAIL OR CONTINUE LOCALLY', true);
  }
}

async function handleGoogleCredential(response) {
  const host = $('gnGoogleButtonMount');
  host?.classList.add('loading');
  setAuthMessage('// VERIFYING GOOGLE IDENTITY...', false);
  try {
    const session = await signInWithGoogleIdToken(response?.credential);
    if (!session) throw new Error('NO_SESSION');
    await completeCloudSession(session);
  } catch (error) {
    setAuthMessage('// GOOGLE SIGN-IN COULD NOT COMPLETE — RETRY OR USE EMAIL', true);
    host?.classList.remove('loading');
  }
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
  window.setTimeout(startOrientationIfNeeded, 350);
}

const ORIENTATION_STEPS = [
  { page: 'Dash', target: '.fab', title: 'LOG YOUR FIRST SHOT', copy: 'The red SHOT control opens the logging flow from anywhere inside your private grid.' },
  { page: 'Dash', target: '.bottom-nav', title: 'MOVE THROUGH THE GRID', copy: 'HOME, SHOTS, SIGNAL, and LAB keep every core system one tap away.' },
  { page: 'Log', target: '#shotsRegionScanner', title: 'MAP THE LOCATION', copy: 'Choose a body region and a precise zone. The selected location becomes the SHOT record source of truth.' },
  { page: 'Dash', target: '#phaseCard', title: 'READ THE PHASE ENGINE', copy: 'This educational estimate connects time since your last SHOT with your own logged observations.' },
  { page: 'Dash', target: '#navLab', title: 'OPEN LAB SYSTEMS', copy: 'Calculators, research records, inventory, and device identity stay organized behind one launchpad.' }
];

function finishOrientation() {
  window.clearTimeout(orientationTimer);
  document.querySelector('.gn-orientation-target')?.classList.remove('gn-orientation-target');
  document.getElementById('gnOrientation')?.remove();
  const settings = S.get('settings', {});
  settings.orientationComplete = true;
  S.set('settings', settings);
  modules.showPage('Dash', document.getElementById('navDash'));
}

function renderOrientationStep(index) {
  const overlay = document.getElementById('gnOrientation');
  const step = ORIENTATION_STEPS[index];
  if (!overlay || !step) { finishOrientation(); return; }
  document.querySelector('.gn-orientation-target')?.classList.remove('gn-orientation-target');
  modules.showPage(step.page, document.getElementById({ Dash: 'navDash', Log: 'navLog' }[step.page]));
  const target = document.querySelector(step.target);
  target?.classList.add('gn-orientation-target');
  overlay.querySelector('[data-orientation-count]').textContent = `SYSTEM ORIENTATION // ${index + 1} OF ${ORIENTATION_STEPS.length}`;
  overlay.querySelector('h2').textContent = step.title;
  overlay.querySelector('p').textContent = step.copy;
  overlay.querySelector('.gn-orientation-dots').innerHTML = ORIENTATION_STEPS.map((_, dot) => `<i class="${dot === index ? 'active' : ''}"></i>`).join('');
  const next = overlay.querySelector('[data-orientation-next]');
  next.textContent = index === ORIENTATION_STEPS.length - 1 ? 'ENTER GRID' : 'NEXT';
  next.onclick = () => renderOrientationStep(index + 1);
  overlay.querySelector('[data-orientation-skip]').onclick = finishOrientation;
  window.clearTimeout(orientationTimer);
  orientationTimer = window.setTimeout(() => renderOrientationStep(index + 1), 8000);
}

function startOrientationIfNeeded() {
  if (!state.session || S.get('settings', {}).orientationComplete || document.getElementById('gnOrientation')) return;
  document.body.insertAdjacentHTML('beforeend', `<section class="gn-orientation" id="gnOrientation" role="dialog" aria-modal="true" aria-labelledby="gnOrientationTitle"><div class="gn-orientation-card"><div class="gn-orientation-kicker" data-orientation-count></div><h2 id="gnOrientationTitle"></h2><p></p><div class="gn-orientation-actions"><button type="button" data-orientation-skip>SKIP</button><span class="gn-orientation-dots" aria-hidden="true"></span><button type="button" class="next" data-orientation-next>NEXT</button></div></div></section>`);
  renderOrientationStep(0);
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
    .register('/sw.js?v=20260720.36', { updateViaCache: 'none' })
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
