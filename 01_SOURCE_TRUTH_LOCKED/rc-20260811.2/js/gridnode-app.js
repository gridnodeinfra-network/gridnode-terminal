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
const tx = (key, fallback, vars) => window.GN_I18N?.text?.(key, fallback, vars) || fallback;

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
  window.GN_NATIVE?.bridgeReady?.();
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
    .gn-auth-primary,.gn-auth-secondary,.gn-auth-google{width:100%;min-height:46px;margin-top:8px;border-radius:3px;cursor:pointer;font:700 .68rem var(--font-d,monospace);letter-spacing:2px}.gn-auth-primary{border:0;background:linear-gradient(135deg,#FF3B3B,#D12424);color:#fff}.gn-auth-secondary{border:1px solid rgba(0,212,255,.35);background:transparent;color:#00d4ff}.gn-auth-google{border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);color:#00d4ff}.gn-auth-google:disabled{cursor:not-allowed;opacity:.55;border-color:rgba(130,149,160,.28);color:#8295a0;box-shadow:none}.gn-google-button-shell{width:100%;min-height:46px;margin-top:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:3px}.gn-google-button-shell.loading{pointer-events:none;opacity:.55}.gn-google-button-shell>div{max-width:100%}.gn-auth-links{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.gn-auth-link{padding:0;border:0;background:transparent;color:#8295a0;font:600 .58rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}.gn-auth-link:hover{color:#00d4ff}.gn-auth-message{min-height:22px;margin-top:14px;text-align:center;font:.62rem/1.4 var(--font-m,monospace);letter-spacing:.7px;color:#8295a0}.gn-auth-note{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);font:.56rem/1.5 var(--font-m,monospace);letter-spacing:.6px;color:#586d76;text-align:center}
    .gn-phase-row{display:flex;gap:12px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.07)}.gn-phase-index{font:700 .72rem var(--font-m,monospace);color:#FF3B3B}.gn-phase-row b{font:700 .72rem var(--font-d,monospace);letter-spacing:1px}.gn-phase-row p{margin:4px 0 0;color:#8295a0;font:.66rem/1.4 var(--font-m,monospace)}
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
    <div class="gn-auth-lang-kanji" role="group" data-i18n-aria-label="lang.switcherAria"><button type="button" class="gn-lang-globe" data-lang-choice="${document.documentElement.lang === 'es' ? 'en' : 'es'}" aria-label="${document.documentElement.lang === 'es' ? 'English' : 'Español'}" title="${document.documentElement.lang === 'es' ? 'Switch to English' : 'Cambiar a Español'}"><svg class="gn-lang-kanji" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><text x="12" y="17.5" text-anchor="middle" font-family="Noto Sans JP, Hiragino Sans, Yu Gothic, PingFang SC, Microsoft YaHei, sans-serif" font-size="17" stroke="currentColor" stroke-width="2" fill="none">電</text></svg></button></div>
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
  applyAuthTranslations(recovering);
  $('gnAuthForm')?.addEventListener('submit', event => { event.preventDefault(); submitAuth(); });
  $('gnAuthModeToggle')?.addEventListener('click', toggleAuthMode);
  $('gnAuthReset')?.addEventListener('click', requestPasswordReset);
  $('gnLocalBtn')?.addEventListener('click', enterLocalSession);
  updateAuthMode();
  renderGoogleIdentityButton();
}

function applyAuthTranslations(recovering) {
  const login = $('login');
  const title = login?.querySelector('.gn-auth-title');
  const copy = login?.querySelector('.gn-auth-copy');
  const note = login?.querySelector('.gn-auth-note');
  if (title) title.setAttribute('data-i18n', recovering ? 'auth.resetAccess' : 'auth.enterGrid');
  if (copy) copy.setAttribute('data-i18n', recovering ? 'auth.enterNewPassword' : 'auth.signInSyncLine');
  if (note) note.setAttribute('data-i18n', 'landing.vaultPolicy');
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
  renderGoogleFallback(host, tx('auth.checkingGoogle', 'CHECKING GOOGLE...'));
  const enabled = await isCloudProviderEnabled('google');
  if (!host.isConnected) return;
  if (!enabled) {
    renderGoogleFallback(host, tx('auth.googleSignInSetupPending', 'GOOGLE SIGN-IN SETUP PENDING'));
    setAuthMessage(tx('auth.googleAuthIsNotEnabled', '// GOOGLE SIGN-IN IS NOT ENABLED YET — USE EMAIL OR CONTINUE LOCALLY'), false);
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
    renderGoogleFallback(host, tx('auth.googleSignInUnavailable', 'GOOGLE SIGN-IN UNAVAILABLE'));
    setAuthMessage(tx('auth.googleAuthCouldNotStart', '// GOOGLE SIGN-IN COULD NOT LOAD — USE EMAIL OR CONTINUE LOCALLY'), true);
  }
}

async function handleGoogleCredential(response) {
  const host = $('gnGoogleButtonMount');
  host?.classList.add('loading');
  setAuthMessage(tx('auth.checkingGoogle', '// VERIFYING GOOGLE IDENTITY...'), false);
  try {
    const session = await signInWithGoogleIdToken(response?.credential);
    if (!session) throw new Error('NO_SESSION');
    await completeCloudSession(session);
  } catch (error) {
    setAuthMessage(tx('auth.googleAuthCouldNotStart', '// GOOGLE SIGN-IN COULD NOT COMPLETE — RETRY OR USE EMAIL'), true);
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
    const detail = error.message || 'TRY AGAIN'; setAuthMessage(error.message === 'CLOUD_UNAVAILABLE' ? tx('auth.cloudRecoveryUnavailable', '// CLOUD RECOVERY UNAVAILABLE — RETRY WHEN ONLINE') : tx('auth.recoveryError', '// RECOVERY ERROR: {message}', { message: detail }), true);
  } finally { if (button) button.disabled = false; }
}

async function submitAuth() {
  const email = $('gnAuthEmail')?.value?.trim();
  const password = $('gnAuthPassword')?.value || '';
  if (authMode !== 'recovery' && (!email || !email.includes('@'))) { setAuthMessage(tx('auth.checkYourDetails', '// ENTER A VALID EMAIL ADDRESS'), true); return; }
  if (password.length < 8) { setAuthMessage(tx('auth.checkYourDetails', '// PASSWORD MUST BE AT LEAST 8 CHARACTERS'), true); return; }
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
      if (result?.session) { await completeCloudSession(result.session); } else { setAuthMessage(tx('auth.accountCreated', '// ACCOUNT CREATED — CHECK YOUR EMAIL TO CONFIRM'), false); }
    } else {
      const session = await signInCloud(email, password);
      if (!session) throw new Error('NO_SESSION');
      await completeCloudSession(session);
    }
  } catch (error) {
    const detail = error.message || 'CHECK YOUR DETAILS'; setAuthMessage(error.message === 'CLOUD_UNAVAILABLE' ? tx('auth.cloudAuthUnavailable', '// CLOUD AUTH UNAVAILABLE — CONTINUE LOCALLY OR RETRY WHEN ONLINE') : tx('auth.authError', '// AUTH ERROR: {message}', { message: detail }), true);
  } finally {
    if (submit) { submit.disabled = false; updateAuthMode(); }
  }
}

async function handleGoogleSignIn() {
  const button = $('loginGoogleBtn'); if (button) { button.disabled = true; button.textContent = tx('auth.connecting', 'CONNECTING...'); }
  setAuthMessage(tx('auth.connecting', '// OPENING GOOGLE AUTHENTICATION...'), false);
  try {
    await signInWithGoogle();
  } catch (error) {
    const disabled = error.message === 'GOOGLE_AUTH_DISABLED';
    setAuthMessage(disabled ? tx('auth.googleAuthIsNotEnabled', '// GOOGLE SIGN-IN IS NOT ENABLED YET — USE EMAIL OR CONTINUE LOCALLY') : error.message === 'CLOUD_UNAVAILABLE' ? tx('auth.cloudAuthUnavailable', '// GOOGLE AUTH UNAVAILABLE — CONTINUE LOCALLY OR RETRY WHEN ONLINE') : tx('auth.googleAuthCouldNotStart', '// GOOGLE AUTH COULD NOT START — RETRY OR USE EMAIL'), true);
    if (button) { button.disabled = disabled; button.textContent = disabled ? tx('auth.googleSignInSetupPending', 'GOOGLE SIGN-IN SETUP PENDING') : tx('auth.continueWithGoogle', 'CONTINUE WITH GOOGLE'); }
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

export async function startGridNode() {
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

export function openSignOutModal() {
  const overlay = $('signOutOverlay');
  if (!overlay) return;
  overlay.style.setProperty('display', 'flex');
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
}
export function closeSignOutModal() {
  const overlay = $('signOutOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.setProperty('display', 'none');
}
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
    .register('/sw.js?v=20260811.2', { updateViaCache: 'none' })
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
