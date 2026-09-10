/* GRID//NODE stable app bootstrap
 * Auth UI, boot sequence, compatibility bridge for existing inline controls.
 */

import {
  APP_VERSION, GOOGLE_OAUTH_CLIENT_ID, CLOUD_CONFIG, state, SESSION_KEY, LOCAL_CLOUD_OWNER_KEY, LEGACY_ACCOUNT_KEYS, WORKSPACE_KEYS, jsonParse, notify, subscribe, safeText, createId, accountStorageKey, legacyStorageKeys, STORAGE_TRANSACTION_SUFFIX, transactionStorageKey, readStorageTransaction, recoverPendingStorageTransaction, logicalStorageValue, S, normalizeLegacyText, normalizeShotRecord, getProfile, getProfileForEvidence, getShots, getAllShots, getWeights, readAccountValue, captureWorkspace, workspaceHasData, localWorkspaceMigrationAllowed, markLocalWorkspaceMigrated, restoreWorkspace, localSession, restoreLocalSession, activateSession, clearSession, withTimeout, cloudLoadPromise, cloudClientPromise, loadCloudLibrary, getCloudClient, getCloudSession, signInCloud, signUpCloud, resetPasswordCloud, updateCloudPassword, isCloudProviderEnabled, signInWithGoogle, signInWithGoogleIdToken, signOutCloud, cloudShotPayload, cloudWeightPayload, syncShot, syncWeight, syncProfile, workspacePayload, syncWorkspace, flushCloudDeletes, deleteCloudShot, hydrateCloudData, mergeRecords, mergeJsonRecords, syncPassFailed, syncInFlight, syncAllCloudData, queueCloudSync, enqueueSync, sessionLabel, deleteCloudAccount, migrateLegacyLocalData, repairStorageShapes, parseLocalDate, formatDate, formatDateTime, normalizeDateInput, todayISO, formatEditableDate, parseEditableDate, setHumanDateInput, readHumanDateInput, downloadFile
} from './gridnode-core.js';
import * as modules from './gridnode-modules.js';

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
    'handleShotsyJSONFile', 'toggleImportForce', 'parseShotsyJSON',
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
    .gn-custom-picker,.gn-custom-date{position:relative;width:100%;min-width:0}.gn-custom-picker-trigger,.gn-custom-date-trigger{width:100%;min-height:44px;padding:10px 14px 10px 12px;text-align:left;border:1px solid rgba(0,212,255,.55);background:linear-gradient(180deg,rgba(0,212,255,.07),rgba(0,0,0,.18));color:#eeeef5;font:600 16px var(--font-m,monospace);border-radius:4px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 0 0 rgba(0,212,255,0);transition:border-color .15s ease,background-color .15s ease,box-shadow .15s ease}.gn-custom-picker-trigger::after,.gn-custom-date-trigger::after{content:'⌄';float:right;color:#00d4ff;margin-left:8px}.gn-custom-picker-trigger:focus-visible,.gn-custom-date-trigger:focus-visible{outline:none;border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.12)}.gn-custom-picker-menu,.gn-custom-date-popover{display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:640;padding:4px;background:#0e0e16;border:1px solid rgba(0,212,255,.28);border-radius:6px;box-shadow:0 16px 42px rgba(0,0,0,.72),0 0 18px rgba(0,212,255,.1)}.gn-custom-picker.open .gn-custom-picker-menu,.gn-custom-date.open .gn-custom-date-popover{display:grid}.gn-custom-picker-option{min-height:38px;padding:9px 10px;border:0;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;color:#9898b0;text-align:left;font:600 .68rem var(--font-m,monospace);cursor:pointer}.gn-custom-picker-option:last-child{border-bottom:0}.gn-custom-picker-option:hover,.gn-custom-picker-option[aria-selected=true]{color:#00d4ff;background:rgba(0,212,255,.08);box-shadow:0 0 10px rgba(0,212,255,.18)}.gn-custom-date-popover{width:min(330px,calc(100vw - 38px));right:auto;padding:10px}.gn-custom-date-head{display:grid;grid-template-columns:34px 1fr 34px;align-items:center;gap:8px;margin-bottom:9px}.gn-custom-date-head button,.gn-custom-date-foot button{min-height:32px;border:1px solid rgba(0,212,255,.24);background:rgba(0,212,255,.06);color:#00d4ff;font:700 .6rem var(--font-d,monospace);cursor:pointer}.gn-custom-date-head strong{color:#eeeef5;text-align:center;font:700 .68rem var(--font-m,monospace);letter-spacing:1px}.gn-custom-date-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.gn-custom-date-dow{padding:3px 0;color:#8295a0;text-align:center;font:600 .48rem var(--font-m,monospace)}.gn-custom-date-blank{min-height:32px}.gn-custom-date-day{min-height:32px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);color:#9898b0;font:600 .62rem var(--font-m,monospace);cursor:pointer}.gn-custom-date-day:hover,.gn-custom-date-day.selected{border-color:#00d4ff;color:#00d4ff;background:rgba(0,212,255,.12);box-shadow:0 0 10px rgba(0,212,255,.18)}.gn-custom-date-foot{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.gn-custom-date-foot button:last-child{color:#9898b0;border-color:rgba(255,255,255,.14);background:transparent}
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
      width: Math.min(336, Math.max(260, host.clientWidth || 336)),
      locale: document.documentElement.lang === 'es' ? 'es' : 'en'
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
