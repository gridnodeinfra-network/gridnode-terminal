/* GRID//NODE stable app bootstrap
 * Auth UI, boot sequence, compatibility bridge for existing inline controls.
 */

import {
  APP_VERSION, GOOGLE_OAUTH_CLIENT_ID, CLOUD_CONFIG, state, SESSION_KEY, LOCAL_CLOUD_OWNER_KEY, LEGACY_ACCOUNT_KEYS, WORKSPACE_KEYS, jsonParse, notify, subscribe, safeText, createId, accountStorageKey, legacyStorageKeys, STORAGE_TRANSACTION_SUFFIX, transactionStorageKey, readStorageTransaction, recoverPendingStorageTransaction, logicalStorageValue, S, normalizeLegacyText, normalizeShotRecord, getProfile, getProfileForEvidence, getShots, getAllShots, getWeights, readAccountValue, captureWorkspace, workspaceHasData, localWorkspaceMigrationAllowed, markLocalWorkspaceMigrated, restoreWorkspace, localSession, restoreLocalSession, activateSession, clearSession, withTimeout, cloudLoadPromise, cloudClientPromise, loadCloudLibrary, getCloudClient, getCloudSession, signInCloud, signUpCloud, resetPasswordCloud, updateCloudPassword, isCloudProviderEnabled, signInWithGoogle, signInWithGoogleIdToken, signOutCloud, sendSignInCode, verifySignInCode, cloudShotPayload, cloudWeightPayload, syncShot, syncWeight, syncProfile, workspacePayload, syncWorkspace, flushCloudDeletes, deleteCloudShot, hydrateCloudData, mergeRecords, mergeJsonRecords, syncPassFailed, syncInFlight, syncAllCloudData, queueCloudSync, enqueueSync, sessionLabel, deleteCloudAccount, migrateLegacyLocalData, repairStorageShapes, parseLocalDate, formatDate, formatDateTime, normalizeDateInput, todayISO, formatEditableDate, parseEditableDate, setHumanDateInput, readHumanDateInput, downloadFile
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
    .gn-auth-kicker{font:700 .62rem var(--font-m,monospace);letter-spacing:3px;color:#00d4ff;text-align:center}@media(max-width:480px){.gn-auth-kicker{margin-right:54px;font-size:.56rem;letter-spacing:1px}}.gn-auth-title{font:800 1.35rem var(--font-d,monospace);letter-spacing:3px;color:#fff;text-align:center;margin:14px 0 6px}.gn-auth-copy{font:.78rem/1.55 var(--font-m,monospace);color:#9fc7d4;text-align:center;margin:0 auto 22px;max-width:38ch}
    .gn-auth-field{width:100%;box-sizing:border-box;margin:0 0 10px;padding:13px 12px;border:1px solid rgba(0,212,255,.2);background:#080810;color:#eeeef5;border-radius:3px;font:16px var(--font-m,monospace);outline:none}.gn-auth-field:focus{border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.1)}
    .gn-auth-primary,.gn-auth-passkey,.gn-auth-google{width:100%;min-height:52px;margin-top:10px;border-radius:3px;cursor:pointer;font:700 .72rem var(--font-d,monospace);letter-spacing:2px}.gn-auth-primary{border:0;background:linear-gradient(135deg,#FF3B3B,#D12424);color:#fff}.gn-auth-passkey{display:flex;align-items:center;justify-content:center;gap:10px;border:0;background:linear-gradient(135deg,#FF3B3B,#D12424);color:#fff}.gn-auth-passkey .gn-passkey-icon{font-size:1rem}.gn-auth-google{border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);color:#00d4ff}.gn-auth-google:disabled{cursor:not-allowed;opacity:.55;border-color:rgba(130,149,160,.28);color:#8295a0;box-shadow:none}.gn-auth-primary-label{margin-top:4px;color:#00d4ff;font:700 .52rem var(--font-m,monospace);letter-spacing:2px;text-align:left}.gn-google-button-shell{width:100%;min-height:54px;margin-top:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:0;border-radius:3px}.gn-google-button-shell.loading{pointer-events:none;opacity:.55}.gn-google-button-shell>div{max-width:100%}.gn-auth-divider{display:flex;align-items:center;gap:12px;margin:18px 0 4px;color:#8295a0;font:600 .6rem var(--font-m,monospace);letter-spacing:2px;text-transform:uppercase}.gn-auth-divider::before,.gn-auth-divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.12)}.gn-auth-local{display:block;width:100%;min-height:44px;margin-top:10px;padding:8px 12px;border:0;background:transparent;color:#8295a0;font:600 .62rem var(--font-m,monospace);letter-spacing:1.4px;cursor:pointer;text-align:center}.gn-auth-local:hover{color:#00d4ff}.gn-auth-privacy{display:grid;gap:4px;margin-top:12px;padding:10px 11px;border-left:2px solid #00d4ff;background:rgba(0,212,255,.045);color:#9fc7d4;font:.58rem/1.45 var(--font-m,monospace)}.gn-auth-privacy strong{color:#e8fcff;letter-spacing:1px}.gn-auth-options{margin-top:16px;border-top:1px solid rgba(255,255,255,.07);padding-top:12px}.gn-auth-options summary{cursor:pointer;color:#8295a0;font:700 .56rem var(--font-m,monospace);letter-spacing:1.4px;list-style:none}.gn-auth-options summary::-webkit-details-marker{display:none}.gn-auth-options[open] summary{color:#00d4ff;margin-bottom:10px}.gn-auth-links{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.gn-auth-link{padding:0;border:0;background:transparent;color:#8295a0;font:600 .58rem var(--font-m,monospace);letter-spacing:1px;cursor:pointer}.gn-auth-link:hover{color:#00d4ff}.gn-auth-message{min-height:22px;margin-top:14px;text-align:center;font:.62rem/1.4 var(--font-m,monospace);letter-spacing:.7px;color:#8295a0}.gn-auth-note{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);font:.56rem/1.5 var(--font-m,monospace);letter-spacing:.6px;color:#586d76;text-align:center}.gn-auth-policy-link{margin-top:16px;text-align:center}.gn-auth-policy-link button{padding:6px 10px;border:0;background:transparent;color:#586d76;font:600 .56rem var(--font-m,monospace);letter-spacing:1.2px;cursor:pointer}.gn-auth-policy-link button:hover{color:#00d4ff}
    /* v0.15.55: calm entry flow — two choices, legal gate moved to a modal */
    .gn-auth-secondary{width:100%;min-height:52px;margin-top:16px;border:1px solid rgba(0,212,255,.4);background:rgba(0,212,255,.04);color:#00d4ff;border-radius:3px;cursor:pointer;font:700 .72rem var(--font-d,monospace);letter-spacing:2px}
    .gn-auth-secondary:hover{border-color:#00d4ff;background:rgba(0,212,255,.09)}
    .gn-auth-secondary[aria-expanded="true"]{border-color:#00d4ff;color:#fff;background:rgba(0,212,255,.1)}
    .gn-legal-modal-title{margin:0 0 16px;color:#00d4ff;font:700 .66rem var(--font-d,monospace);letter-spacing:2px}
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
    .phase-ring-svg-wrap .phase-segment-ring,.landing-phase-visual .phase-segment-ring{position:absolute;border-radius:50%;background:conic-gradient(from -90deg,#4fb8d8 0deg 72deg,#63b98b 72deg 144deg,#d3a24a 144deg 216deg,#c26674 216deg 288deg,#9898b0 288deg 360deg);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));pointer-events:none;z-index:0;opacity:.5}
    .phase-ring-svg-wrap .phase-segment-ring{inset:-4px}.phase-ring-svg-wrap .ring-svg{z-index:1}.phase-ring-svg-wrap .phase-nodes{z-index:3}.phase-ring-svg-wrap .ring-center{z-index:4}.phase-marker{position:absolute;width:9px;height:9px;border-radius:50%;transform:translate(-50%,-50%);z-index:5;box-shadow:0 0 0 2px rgba(0,0,0,.45);opacity:.95;pointer-events:none}.phase-marker[hidden]{display:none!important}
    .gn-phase-marker{animation:none}
    .page{transition:opacity .15s ease,visibility .15s ease}.page:not(.active){opacity:0;visibility:hidden;pointer-events:none}.page.active{opacity:1;visibility:visible}
    .gn-streak-card{display:grid;gap:5px;margin:0 0 14px;padding:12px;border:1px solid rgba(0,212,255,.3);border-left:2px solid #00d4ff;background:linear-gradient(135deg,rgba(0,212,255,.08),rgba(0,0,0,.24));color:#eef6f8}.gn-streak-card[hidden]{display:none}.gn-streak-card b{color:#00d4ff;font:800 .7rem var(--font-d,monospace);letter-spacing:1.7px}.gn-streak-card span{color:#9fc7d4;font:.62rem/1.45 var(--font-m,monospace)}
    .gn-celebrate-particle{position:fixed;left:var(--x);bottom:40%;width:var(--size);height:var(--size);border-radius:50%;background:#00d4ff;box-shadow:0 0 8px #00d4ff;animation:gnCelebrate 2.2s ease-out forwards;animation-delay:var(--delay);pointer-events:none;z-index:9999}@keyframes gnCelebrate{0%{transform:translateY(0) translateX(0) scale(1);opacity:1}100%{transform:translateY(-80px) translateX(var(--drift)) scale(0);opacity:0}}
    .landing-phase-visual{position:absolute;right:-14%;bottom:12%;width:min(420px,44vw);aspect-ratio:1;opacity:.35;pointer-events:none;z-index:0;filter:drop-shadow(0 0 20px rgba(0,212,255,.16));animation:gnLandingRingRotate 8s linear infinite}.landing-phase-visual .phase-segment-ring{inset:0;opacity:.95}.landing-phase-core{position:absolute;inset:31%;display:grid;place-items:center;align-content:center;gap:8px;border:1px solid rgba(0,212,255,.28);border-radius:50%;color:#9fefff;text-align:center;background:rgba(5,5,8,.28)}.landing-phase-core span{font:700 .52rem var(--font-m,monospace);letter-spacing:2px}.landing-phase-core b{font:800 2.2rem var(--font-d,monospace);color:#eef6f8}@keyframes gnLandingRingRotate{to{transform:rotate(360deg)}}.landing-hero>:not(.landing-phase-visual){position:relative;z-index:1}
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
    login.querySelector('.gn-auth-card')?.insertAdjacentHTML('afterbegin', '<div class="gn-auth-lang-kanji" role="group" data-i18n-aria-label="lang.switcherAria"><button type="button" class="gn-lang-globe" data-lang-choice="es" aria-label="Español" title="Cambiar a Español"><svg class="gn-lang-kanji" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><text x="12" y="17.5" text-anchor="middle" font-family="Noto Sans JP, Hiragino Sans, Yu Gothic, PingFang SC, Microsoft YaHei, sans-serif" font-size="17" stroke="currentColor" stroke-width="2" fill="none">電</text></svg></button></div>');
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
    <div class="gn-auth-policy-link"><button type="button" id="gnVaultPolicyLink" data-i18n="landing.yourDataYourRules">YOUR DATA, YOUR RULES</button></div>
    <div class="gn-auth-note" data-i18n="auth.inviteBetaNote">GRID//NODE is in private beta. Cloud sync requires a NODE KEY invite.</div>
    <div class="gn-auth-message" id="loginMsg" role="status" aria-live="polite"></div>
  </div>
  <div class="gn-legal-modal" id="gnLegalModal" hidden>
    <div class="gn-legal-modal-card" role="dialog" aria-modal="true" aria-labelledby="gnLegalModalTitle">
      <h2 class="gn-legal-modal-title" id="gnLegalModalTitle" data-i18n="legal.modalTitle">BEFORE YOU ENTER</h2>
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
  login.querySelector('.gn-auth-card')?.insertAdjacentHTML('afterbegin', '<div class="gn-auth-lang-kanji" role="group" data-i18n-aria-label="lang.switcherAria"><button type="button" class="gn-lang-globe" data-lang-choice="es" aria-label="Español" title="Cambiar a Español"><svg class="gn-lang-kanji" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><text x="12" y="17.5" text-anchor="middle" font-family="Noto Sans JP, Hiragino Sans, Yu Gothic, PingFang SC, Microsoft YaHei, sans-serif" font-size="17" stroke="currentColor" stroke-width="2" fill="none">電</text></svg></button></div>');
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
  <h2 class="gn-auth-view-title" data-i18n="otp.welcomeBack">WELCOME BACK</h2>
  <p class="gn-auth-view-sub" data-i18n="otp.welcomeSub">Sign in to get to your grid.</p>
  <div id="gnOtpNoAccount"></div>
  <input class="gn-auth-field" id="gnOtpEmail" type="email" inputmode="email" autocomplete="email" data-i18n-ph="otp.emailPlaceholder" placeholder="name@email.com" data-i18n-aria-label="auth.emailAddress" aria-label="Email">
  <button class="gn-auth-primary" id="gnSendCodeBtn" type="button"><span data-i18n="otp.sendCode">SEND ME A SIGN-IN CODE</span></button>
  <div class="gn-auth-divider"><span data-i18n="otp.orContinueWithEmail">or</span></div>
  <div class="gn-google-button-shell" id="gnGoogleButtonMount" data-i18n-aria-label="auth.continueWithGoogle" aria-label="Continue with Google"></div>
  <button class="gn-auth-quiet" id="gnPasskeyBtn" type="button" style="display:none">
    <span data-i18n="otp.usePasskeyInstead">Use a passkey instead</span>
    <span class="gn-quiet-sub" data-i18n="otp.passkeyHint">Have a passkey? Your device can offer it in the email field.</span>
  </button>
  <button class="gn-auth-quiet" id="gnDeviceBtn" type="button">
    <span data-i18n="auth.continueOnDevice">CONTINUE ON THIS DEVICE</span>
    <span class="gn-quiet-sub" data-i18n="otp.continueOnDeviceSub">Nothing leaves your phone.</span>
  </button>
  <div class="gn-auth-links" style="justify-content:center;margin-top:8px">
    <button class="gn-auth-link" id="gnNewHereBtn" type="button"><span data-i18n="otp.newHereLink">New here? I HAVE A NODE KEY</span></button>
  </div>
  <div class="gn-auth-links" style="justify-content:center;margin-top:2px">
    <button class="gn-auth-link" id="gnPasswordToggle" type="button"><span data-i18n="otp.usePasswordInstead">Use password instead</span></button>
  </div>
  <div id="gnPasswordBlock" ${expand ? '' : 'hidden'}>
    <form id="gnAuthForm" novalidate>
      <input class="gn-auth-field" id="gnAuthEmail" type="email" inputmode="email" autocomplete="email" data-i18n-ph="auth.emailPlaceholder" placeholder="EMAIL ADDRESS" data-i18n-aria-label="auth.emailAddress" aria-label="Email">
      <input class="gn-auth-field" id="gnAuthPassword" type="password" autocomplete="current-password" data-i18n-ph="auth.passwordPlaceholder" placeholder="PASSWORD" data-i18n-aria-label="auth.password" aria-label="Password">
      <button class="gn-auth-primary" id="gnAuthSubmit" type="submit">SIGN IN TO CLOUD</button>
    </form>
    <div class="gn-auth-links">
      <button class="gn-auth-link" id="gnAuthModeToggle" type="button">CREATE ACCOUNT</button>
      <button class="gn-auth-link" id="gnAuthReset" type="button" data-i18n="auth.resetPassword">RESET PASSWORD</button>
    </div>
  </div>
  <div class="gn-auth-message" id="gnOtpMsg" role="status" aria-live="polite"></div>`;
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
  ${opts.allowSkip ? `<button class="gn-auth-quiet" id="gnKeySkipBtn" type="button" style="margin-top:0"><span data-i18n="otp.alreadyHaveAccount">I already have an account</span></button>` : ''}
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
  const enabled = await isCloudProviderEnabled('google');
  if (!host.isConnected) return;
  if (!enabled) return;
  host.style.removeProperty('display');
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
    host.style.display = 'none';
    setAuthMessage(tx('auth.googleCouldNotLoad', '// GOOGLE SIGN-IN COULD NOT LOAD — USE EMAIL OR CONTINUE LOCALLY'), true);
  }
}

async function handleGoogleCredential(response) {
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
 * The post-auth backstop (ensureNodeKeyClearance) remains the enforcer. */
function requireNodeKeyForGoogle(proceed) {
  const passThrough = () => {
    const p = proceed;
    gnKeyContinuation = null;
    gnKeySkipAction = null;
    p();
  };
  if (getNodeKeyGrant() || isGoogleKnownDevice()) { passThrough(); return; }
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
  return true;
}

function showApp() {
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
    if (!hub) return;
    hub.insertAdjacentHTML('beforeend', `<section class="gn-passkeys-card" id="gnPasskeysCard" aria-labelledby="gnPasskeysTitle">
      <div class="gn-foundation-kicker" data-i18n="auth.passkeysKicker">// PASSKEYS</div>
      <h3 id="gnPasskeysTitle" data-i18n="auth.passkeysTitle">MANAGE PASSKEYS</h3>
      <p class="gn-measurements-copy" data-i18n="auth.passkeysCopy">Sign in with your fingerprint, face, or security key.</p>
      <ul class="gn-passkeys-list" data-gn-passkeys-list></ul>
      <button type="button" class="btn-full btn-primary" id="gnRegisterPasskeyBtn" data-i18n="auth.registerNewPasskey">+ REGISTER A NEW PASSKEY</button>
    </section>`);
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
      if (!reduced) await new Promise(r => window.setTimeout(r, 90)); /* v0.15.45: was 140 */
    }
  }
  // completion: kicker ONLINE + cyan->Mars Red pulse on the emblem
  setKicker(3);
  const emblem = document.querySelector('.gn-b2b-symbol');
  if (emblem && !reduced && !bootSkipped) {
    emblem.classList.add('boot-complete-pulse');
    await new Promise(r => window.setTimeout(r, 500)); /* v0.15.45: was 750 */
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
  /* Google pre-gate interceptor: the GIS-rendered button's clicks are captured
   * by Google's SDK before our callback ever runs, so the callback wrapper
   * alone cannot pre-gate. Intercept in the capture phase (before the event
   * reaches the Google iframe) on unknown devices, then route through the
   * pre-gated OAuth flow. Known devices and grant holders pass through to GIS. */
  document.addEventListener('click', event => {
    const mount = event.target?.closest?.('#gnGoogleButtonMount');
    if (!mount || mount.style.display === 'none') return;
    if (getNodeKeyGrant() || isGoogleKnownDevice()) return;
    event.stopPropagation();
    event.preventDefault();
    requireNodeKeyForGoogle(() => doGoogleSignIn());
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
