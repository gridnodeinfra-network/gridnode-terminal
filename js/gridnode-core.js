/* GRID//NODE stable core
 * State, local persistence, session handling, and optional Supabase sync.
 * No UI code belongs in this file.
 */

export const APP_VERSION = '2.0.0-stable';

export const CLOUD_CONFIG = Object.freeze({
  url: 'https://pjcnmejgjgbsgjhgwncw.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqY25tZWpnamdic2dqaGd3bmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NDM0OTUsImV4cCI6MjA5NzMxOTQ5NX0.10DFzo00M38yQMlrW4IIdOCUC-4JEBffPd1RpqKWmhw'
});

export const state = {
  session: null,
  accountKey: 'local',
  cloud: false,
  cloudClient: null,
  cloudStatus: 'LOCAL_ONLY',
  listeners: new Set()
};

const SESSION_KEY = 'gn_session_v2';
const LEGACY_ACCOUNT_KEYS = ['0', 'local'];

function jsonParse(raw, fallback) {
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function notify() {
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

function legacyStorageKeys(key) {
  return LEGACY_ACCOUNT_KEYS
    .filter(accountKey => accountKey !== state.accountKey)
    .map(accountKey => `gn_${accountKey}_${key}`);
}

export const S = Object.freeze({
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

export function normalizeLegacyText(value) {
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

export function getProfile() { return S.get('profile', {}); }
export function getShots() { return S.get('shots', []).filter(record => !record.archived).map(normalizeShotRecord); }
export function getAllShots() { return S.get('shots', []).map(normalizeShotRecord); }
export function getWeights() { return S.get('weights', []); }

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

export function activateSession(session, cloud = false) {
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

export function clearSession() {
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

export function loadCloudLibrary() {
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

export async function signInWithGoogle() {
  const client = await getCloudClient();
  if (!client) throw new Error('CLOUD_UNAVAILABLE');
  const { error } = await withTimeout(client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href.split('#')[0] }
  }), 8000);
  if (error) throw error;
}

export async function signOutCloud() {
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

export async function syncShot(record) {
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

export async function syncWeight(record) {
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

export async function syncProfile(profile) {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return;
  try {
    const { error } = await withTimeout(state.cloudClient.from('profiles').upsert({
      id: state.session.user.id,
      display_name: profile.name || 'NODE_USER',
      weight_unit: profile.weightUnit || 'lbs',
      height_unit: 'ft/in',
      dose_mg: Number(profile.dose) || null,
      updated_at: new Date().toISOString()
    }), 8000);
    if (error) throw error;
    state.cloudStatus = 'CLOUD_SYNCED';
  } catch (error) {
    state.cloudStatus = 'LOCAL_BACKUP';
    console.warn('[GRID//NODE cloud profile sync]', error);
  }
}

export async function hydrateCloudData() {
  if (!state.cloud || !state.cloudClient || !state.session?.user?.id) return { ok: false, reason: 'LOCAL_ONLY' };
  try {
    const userId = state.session.user.id;
    const [profileResult, shotsResult, weightsResult] = await Promise.all([
      withTimeout(state.cloudClient.from('profiles').select('*').eq('id', userId).maybeSingle(), 8000),
      withTimeout(state.cloudClient.from('shots').select('*').eq('user_id', userId).order('date', { ascending: true }), 8000),
      withTimeout(state.cloudClient.from('weights').select('*').eq('user_id', userId).order('date', { ascending: true }), 8000)
    ]);
    if (profileResult.error) throw profileResult.error;
    if (shotsResult.error) throw shotsResult.error;
    if (weightsResult.error) throw weightsResult.error;

    const localShots = getAllShots();
    const cloudShots = (shotsResult.data || []).map(item => ({
      id: `cloud_${item.id}`,
      cloudId: item.id,
      date: item.date,
      med: item.compound || item.med || 'CUSTOM',
      dose: Number(item.dose_mg) || 0,
      site: item.site || '',
      notes: item.notes || null,
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
      profile.name = profile.name || remoteProfile.display_name || '';
      if (remoteProfile.dose_mg && !profile.dose) profile.dose = remoteProfile.dose_mg;
      S.set('profile', profile);
    }
    state.cloudStatus = 'CLOUD_SYNCED';
    return { ok: true };
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

export function queueCloudSync(kind, record) {
  const work = kind === 'shot' ? syncShot(record) : kind === 'weight' ? syncWeight(record) : syncProfile(record);
  work.catch(error => console.warn('[GRID//NODE cloud queue]', error));
}

export function sessionLabel() {
  return state.session?.user?.email || (state.cloud ? 'CLOUD ACCOUNT' : 'LOCAL DEVICE SESSION');
}

export function migrateLegacyLocalData() {
  if (state.accountKey !== 'local') return;
  for (const key of ['profile', 'shots', 'weights', 'settings', 'arsenal']) {
    const current = localStorage.getItem(`gn_local_${key}`);
    if (current !== null) continue;
    const legacy = localStorage.getItem(`gn_0_${key}`);
    if (legacy !== null) localStorage.setItem(`gn_local_${key}`, legacy);
  }
}

export function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', options);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mdy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function todayISO() { return new Date().toISOString().slice(0, 10); }

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
