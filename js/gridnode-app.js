/* GRID//NODE stable app bootstrap
 * Auth UI, boot sequence, compatibility bridge for existing inline controls.
 */

import {
  APP_VERSION, GOOGLE_OAUTH_CLIENT_ID, state, S, activateSession, clearSession, localSession,
  restoreLocalSession, migrateLegacyLocalData, getCloudSession, getCloudClient,
  signInCloud, signUpCloud, resetPasswordCloud, updateCloudPassword, isCloudProviderEnabled, signInWithGoogle, signInWithGoogleIdToken, signOutCloud, hydrateCloudData,
  captureWorkspace, workspaceHasData, restoreWorkspace, localWorkspaceMigrationAllowed,
  markLocalWorkspaceMigrated, syncAllCloudData, loadCloudLibrary
} from './gridnode-core.js';
import * as modules from './gridnode-modules.js';

let bootRunning = false;
let authMode = 'signin';
let passwordRecoveryActive = false;
let googleIdentityPromise = null;
let googleIdentityInitialized = false;

const $ = id => document.getElementById(id);

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
    .gn-auth-primary,.gn-auth-secondary,.gn-auth-google{width:100%;min-height:46px;margin-top:8px;border-radius:3px;cursor:pointer;font:700 .68rem var(--font-d,monospace);letter-spacing:2px}.gn-auth-primary{border:0;background:linear-gradient(135deg,#ff3355,#c80036);color:#fff}.gn-auth-secondary{border:1px solid rgba(0,212,255,.35);background:transparent;color:#00d4ff}.gn-auth-google{border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);color:#00d4ff}.gn-auth-google:disabled{cursor:not-allowed;opacity:.55;border-color:rgba(130,149,160,.28);color:#8295a0;box-shadow:none}.gn-google-button-shell{width:100%;min-height:46px;margin-top:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:3px}.gn-google-button-shell.loading{pointer-events:none;opacity:.55}.gn-google-button-shell>div{max-width:100%}.gn-auth-links{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.gn-auth-link{padding:0;border:0;background:transparent;color:#8295a0;font:600 .58rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}.gn-auth-link:hover{color:#00d4ff}.gn-auth-message{min-height:22px;margin-top:14px;text-align:center;font:.62rem/1.4 var(--font-m,monospace);letter-spacing:.7px;color:#8295a0}.gn-auth-note{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);font:.56rem/1.5 var(--font-m,monospace);letter-spacing:.6px;color:#586d76;text-align:center}
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
    ${recovering ? '' : '<div class="gn-google-button-shell" id="gnGoogleButtonMount" aria-label="Continue with Google"></div><button class="gn-auth-secondary" id="gnLocalBtn" type="button">CONTINUE LOCALLY</button>'}
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
}

export function startGridNode() {
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

export function openSignOutModal() { $('signOutOverlay')?.style.setProperty('display', 'flex'); }
export function closeSignOutModal() { $('signOutOverlay')?.style.setProperty('display', 'none'); }
export async function confirmSignOut() {
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

