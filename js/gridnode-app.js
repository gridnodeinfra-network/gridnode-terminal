/* GRID//NODE stable app bootstrap
 * Auth UI, boot sequence, compatibility bridge for existing inline controls.
 */

import {
  APP_VERSION, state, S, activateSession, clearSession, localSession,
  restoreLocalSession, migrateLegacyLocalData, getCloudSession, getCloudClient,
  signInCloud, signUpCloud, signInWithGoogle, signOutCloud, hydrateCloudData,
  queueCloudSync, getAllShots, getWeights, loadCloudLibrary
} from './gridnode-core.js';
import * as modules from './gridnode-modules.js';

let bootRunning = false;
let authMode = 'signin';

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
    .gn-auth-primary,.gn-auth-secondary,.gn-auth-google{width:100%;min-height:46px;margin-top:8px;border-radius:3px;cursor:pointer;font:700 .68rem var(--font-d,monospace);letter-spacing:2px}.gn-auth-primary{border:0;background:linear-gradient(135deg,#ff3355,#c80036);color:#fff}.gn-auth-secondary{border:1px solid rgba(0,212,255,.35);background:transparent;color:#00d4ff}.gn-auth-google{border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);color:#00d4ff}.gn-auth-links{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.gn-auth-link{padding:0;border:0;background:transparent;color:#8295a0;font:600 .58rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}.gn-auth-link:hover{color:#00d4ff}.gn-auth-message{min-height:22px;margin-top:14px;text-align:center;font:.62rem/1.4 var(--font-m,monospace);letter-spacing:.7px;color:#8295a0}.gn-auth-note{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);font:.56rem/1.5 var(--font-m,monospace);letter-spacing:.6px;color:#586d76;text-align:center}
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
  login.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:0"><div class="gn-auth-card">
    <div class="gn-auth-kicker">// PERSONAL BIOTECH OPERATING SYSTEM //</div>
    <div class="gn-auth-title">JACK IN</div>
    <p class="gn-auth-copy">Use a cloud account when you want recovery across devices. Local session keeps your record on this device.</p>
    <form id="gnAuthForm" novalidate>
      <input class="gn-auth-field" id="gnAuthEmail" type="email" autocomplete="email" placeholder="EMAIL ADDRESS" aria-label="Email address">
      <input class="gn-auth-field" id="gnAuthPassword" type="password" autocomplete="current-password" placeholder="PASSWORD" aria-label="Password">
      <button class="gn-auth-primary" id="gnAuthSubmit" type="submit">SIGN IN TO CLOUD</button>
    </form>
    <div class="gn-auth-links"><button class="gn-auth-link" id="gnAuthModeToggle" type="button">CREATE ACCOUNT</button><button class="gn-auth-link" id="gnAuthReset" type="button">RESET PASSWORD</button></div>
    <button class="gn-auth-google" id="loginGoogleBtn" type="button">CONTINUE WITH GOOGLE</button>
    <button class="gn-auth-secondary" id="gnLocalBtn" type="button">CONTINUE LOCALLY</button>
    <div class="gn-auth-message" id="loginMsg" role="status" aria-live="polite"></div>
    <div class="gn-auth-note">// VAULT POLICY: YOUR RECORD STAYS LOCAL UNTIL YOU CONNECT A CLOUD ACCOUNT // GRID//NODE DOES NOT PROVIDE MEDICAL ADVICE //</div>
  </div></div>`;
  $('gnAuthForm')?.addEventListener('submit', event => { event.preventDefault(); submitAuth(); });
  $('gnAuthModeToggle')?.addEventListener('click', toggleAuthMode);
  $('gnAuthReset')?.addEventListener('click', () => setAuthMessage('Password recovery requires a connected cloud account. Use your provider recovery flow.', false));
  $('loginGoogleBtn')?.addEventListener('click', handleGoogleSignIn);
  $('gnLocalBtn')?.addEventListener('click', enterLocalSession);
  updateAuthMode();
}

function updateAuthMode() {
  const submit = $('gnAuthSubmit'), toggle = $('gnAuthModeToggle');
  if (submit) submit.textContent = authMode === 'signin' ? 'SIGN IN TO CLOUD' : 'CREATE CLOUD ACCOUNT';
  if (toggle) toggle.textContent = authMode === 'signin' ? 'CREATE ACCOUNT' : 'BACK TO SIGN IN';
}
function toggleAuthMode() { authMode = authMode === 'signin' ? 'signup' : 'signin'; updateAuthMode(); setAuthMessage('', false); }
function setAuthMessage(message, error = false) { const element = $('loginMsg'); if (element) { element.textContent = message; element.style.color = error ? '#ff5577' : '#8295a0'; } }

async function submitAuth() {
  const email = $('gnAuthEmail')?.value?.trim();
  const password = $('gnAuthPassword')?.value || '';
  if (!email || !email.includes('@')) { setAuthMessage('// ENTER A VALID EMAIL ADDRESS', true); return; }
  if (password.length < 6) { setAuthMessage('// PASSWORD MUST BE AT LEAST 6 CHARACTERS', true); return; }
  const submit = $('gnAuthSubmit'); if (submit) { submit.disabled = true; submit.textContent = 'CONNECTING...'; }
  try {
    if (authMode === 'signup') {
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
  try { await signInWithGoogle(); } catch (error) { setAuthMessage(error.message === 'CLOUD_UNAVAILABLE' ? '// GOOGLE AUTH UNAVAILABLE — CONTINUE LOCALLY OR RETRY WHEN ONLINE' : `// GOOGLE AUTH ERROR: ${error.message}`, true); if (button) { button.disabled = false; button.textContent = 'CONTINUE WITH GOOGLE'; } }
}

function enterLocalSession() {
  migrateLegacyLocalData();
  activateSession(restoreLocalSession() || localSession(), false);
  showApp();
}

async function completeCloudSession(session) {
  activateSession(session, true);
  await hydrateCloudData();
  getAllShots().forEach(record => queueCloudSync('shot', record));
  getWeights().forEach(record => queueCloudSync('weight', record));
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
  const local = restoreLocalSession();
  if (local) { migrateLegacyLocalData(); activateSession(local, false); showApp(); }
  else modules.showScreen('landing');
  const cloud = await getCloudSession();
  if (cloud) await completeCloudSession(cloud);
}

function wireGlobalEvents() {
  $('signOutOverlay')?.addEventListener('click', event => { if (event.target.id === 'signOutOverlay') closeSignOutModal(); });
  window.addEventListener('storage', event => { if (!event.key?.includes('_shots') && !event.key?.includes('_weights')) return; if (state.session) modules.refreshAll(); });
  window.addEventListener('error', event => console.warn('[GRID//NODE runtime]', event.error || event.message));
}

window.GN = {
  version: APP_VERSION,
  state,
  S,
  async syncNow() { await Promise.all([getCloudClient(), hydrateCloudData()]); modules.refreshAll(); },
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
  await restoreSession();
  // Load the cloud library in the background so the local-first boot is immediate.
  loadCloudLibrary().catch(() => null);
});
