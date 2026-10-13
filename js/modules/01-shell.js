export function showScreen(id) {
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

export function showPage(name, navElement) {
  const previousPage = document.querySelector('.page.active')?.id || '';
  try { localStorage.setItem('gn_last_active_page_v1', previousPage.replace('page', '') || 'Dash'); } catch (e) {}
  const page = $(`page${name}`);
  if (!page) return;
  document.body.classList.toggle('gn-fab-hidden-context', ['Profile'].includes(name));
  qa('.page').forEach(item => item.classList.remove('active'));
  page.classList.add('active');
  qa('.nav-item').forEach(item => {
    item.classList.remove('active');
    item.removeAttribute('aria-current');
  });
  const nav = navElement || document.getElementById({ Dash: 'navDash', Log: 'navLog', Results: 'navRes', Lab: 'navLab', Profile: 'navVault' }[name]);
  if (nav) {
    nav.classList.add('active');
    nav.setAttribute('aria-current', 'page');
  }
  /* Code-split (2026-10-12): page renderers live in lazy chunks. When the
   * chunk is registered, render synchronously exactly as before. When it is
   * not, show the 11-ux-states loading pattern, load via GNEnsurePage, and
   * render on arrival only if this page is still the active one. */
  const rendererName = { Log: 'renderShots', Results: 'renderResults', Lab: 'renderLab', Profile: 'renderProfile' }[name];
  if (rendererName) {
    const renderer = window.GNModules && window.GNModules[rendererName];
    if (typeof renderer === 'function') renderer();
    else if (typeof window.GNEnsurePage === 'function') {
      showChunkLoading(page);
      window.GNEnsurePage(name).then(() => {
        hideChunkLoading(page);
        const fn = window.GNModules && window.GNModules[rendererName];
        if (page.classList.contains('active') && typeof fn === 'function') fn();
      }).catch(() => showChunkError(page, name));
    }
  }
  /* MOBILE-FIRST perf: scroll after render to avoid double full-document layout */
  $('scrollBody')?.scrollTo({ top: 0, behavior: 'auto' });
  document.dispatchEvent(new CustomEvent('gn:pagechange', { detail: { name, previousPage } }));
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.page.active')?.id === 'pageProfile') { if (typeof window.closeProfileHub === 'function') window.closeProfileHub(); } });
document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target && typeof e.target.matches === 'function' && e.target.matches('.cp-group-minimized')) { e.preventDefault(); e.target.click(); } });
/* TRACK 3 (2026-10-11): universal modal dismiss. This Escape handler is the
 * single registry for every modal/overlay surface — checked topmost-first so a
 * nested confirm closes before its parent. Two deliberate strict exceptions:
 * #futureTimestampConfirm (explicit choice required) and #gnLegalModal (boot
 * consent); everything else dismisses on Escape. The phase drill-down, peptide
 * evidence overlay, and first-shot celebrate keep their own local Escape
 * handlers; the assay modal closer is reached via window.GN_ASSAY. */
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (document.querySelector('#futureTimestampConfirm.active')) return;
  /* The native shell binds its own Escape keydown on overlay elements
   * (gridnode-native.js wireOverlayDismiss, same selector below): it clicks
   * the overlay's close/cancel control. When the keypress originated inside
   * such an overlay, that handler already ran during bubbling — skip the
   * document chain here to avoid double-handling (e.g. the native layer
   * dismisses the discard confirm, then closeLog() on the dirty sheet would
   * immediately re-open it). Overlays outside that selector (privacy, terms,
   * delete dialogs) and body-focus keypresses still use the chain. */
  var nativeLayer = e.target && e.target.closest ? e.target.closest('.overlay, .archive-confirm-overlay, .future-confirm-overlay, .gn-date-overlay, .csv-import-overlay, .gn-import-overlay, .gn-whatsnew-overlay, .gn-peptide-overlay, .gn-onb-overlay, .gn-lab-tool-overlay') : null;
  if (nativeLayer) return;
  var disc = document.getElementById('shotDiscardConfirmOv');
  if (disc && (disc.classList.contains('active') || getComputedStyle(disc).display !== 'none')) { if (typeof window.cancelShotDiscard === 'function') window.cancelShotDiscard(); return; }
  var chain = [
    ['#archiveConfirmOv', 'cancelArchiveShot'],
    ['#permanentDeleteConfirmOv', 'cancelPermanentDeleteShot'],
    ['#loadoutRemoveOverlay', 'cancelLoadoutRemove'],
    ['#gnDeleteLocalOverlay', 'closeDeleteLocalData'],
    ['#gnDeleteCloudOverlay', 'closeDeleteCloudAccount'],
    ['#arsOv', 'closeArs'],
    ['#phasesOv', 'closePhases'],
    ['#logOv', 'closeLog'],
    ['#wtOv', 'closeWt'],
    ['#signOutOverlay', 'closeSignOutModal'],
    ['#gnPrivacyOverlay', 'closePrivacyPolicy'],
    ['#gnTermsOverlay', 'closeTermsOfService'],
    ['#gnLabToolOverlay', 'closeLabTool']
  ];
  for (var i = 0; i < chain.length; i++) {
    if (document.querySelector(chain[i][0] + '.active')) {
      var fn = window[chain[i][1]];
      if (typeof fn === 'function') fn();
      return;
    }
  }
  if (document.querySelector('#gnAssayModalOv.active') && window.GN_ASSAY && typeof window.GN_ASSAY.closeAssayModal === 'function') {
    window.GN_ASSAY.closeAssayModal();
  }
});

/* TRACK 3 (2026-10-11): backdrop-tap-to-dismiss. A click that lands directly
 * on an overlay backdrop (event.target === the overlay element) dismisses it.
 * Skipped while a custom picker dropdown is open (the tap only closes the
 * picker), and for the two strict confirms (futureTimestampConfirm,
 * gnLegalModal) which require an explicit choice. Sign-out already had its own
 * backdrop listener (js/gridnode-app.js wireGlobalEvents); the drill-down and
 * assay modals have theirs too. */
document.addEventListener('click', function (e) {
  var target = e.target;
  if (!target || !target.id || !target.classList || !target.classList.contains('active')) return;
  var closer = {
    logOv: 'closeLog', wtOv: 'closeWt', arsOv: 'closeArs', phasesOv: 'closePhases',
    gnPrivacyOverlay: 'closePrivacyPolicy', gnTermsOverlay: 'closeTermsOfService',
    archiveConfirmOv: 'cancelArchiveShot', shotDiscardConfirmOv: 'cancelShotDiscard',
    permanentDeleteConfirmOv: 'cancelPermanentDeleteShot', loadoutRemoveOverlay: 'cancelLoadoutRemove',
    gnDeleteLocalOverlay: 'closeDeleteLocalData', gnDeleteCloudOverlay: 'closeDeleteCloudAccount'
  }[target.id];
  if (!closer) return;
  if (document.querySelector('.cp-dropdown.open, .gn-custom-picker.open, .gn-custom-date.open')) return;
  var fn = window[closer];
  if (typeof fn === 'function') fn();
});

export function refreshAll() {
  /* Code-split: lazy page renderers are skipped until their chunk loads;
   * each page renders fresh on first navigation via the showPage hook. */
  if (typeof renderProfile === 'function') renderProfile();
  renderDashboard();
  if (typeof renderShots === 'function') renderShots();
  if (typeof renderResults === 'function') renderResults();
  if (typeof renderScanner === 'function') renderScanner();
  if (typeof renderLab === 'function') renderLab();
  renderCalendar();
}

/* Chunk loading state (css/native/11-ux-states.css patterns): skeleton card
 * inside a .gn-chunk-loading host + .gn-ux-syncing on the page; the error
 * state reuses .gn-ux-sync-error with a RETRY that re-runs the page load.
 * Page renderers write to their own containers and never touch this host;
 * it is removed before the renderer runs. */
function showChunkLoading(page) {
  hideChunkLoading(page);
  page.classList.add('gn-ux-syncing');
  const host = document.createElement('div');
  host.className = 'gn-chunk-loading';
  host.setAttribute('role', 'status');
  host.innerHTML = '<div class="gn-skeleton-card"><div class="gn-skeleton gn-skeleton-line mid"></div><div class="gn-skeleton gn-skeleton-line"></div><div class="gn-skeleton gn-skeleton-line short"></div></div>';
  page.prepend(host);
}
function hideChunkLoading(page) {
  page.classList.remove('gn-ux-syncing');
  page.querySelectorAll('.gn-chunk-loading').forEach(el => el.remove());
}
function showChunkError(page, name) {
  page.classList.remove('gn-ux-syncing');
  let host = page.querySelector('.gn-chunk-loading');
  if (!host) { host = document.createElement('div'); host.className = 'gn-chunk-loading'; page.prepend(host); }
  host.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'gn-ux-sync-error';
  const title = document.createElement('b');
  title.textContent = tx('runtime.chunkLoadFailedTitle', 'THIS SECTION COULD NOT LOAD');
  const copy = document.createElement('span');
  copy.textContent = tx('runtime.chunkLoadFailed', 'Check your connection and try again. Your data is safe on this device.');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = tx('runtime.retry', 'RETRY');
  retry.addEventListener('click', () => { if (typeof window.showPage === 'function') window.showPage(name); });
  box.append(title, copy, retry);
  host.append(box);
}

export function loadApp() {
  const profile = getProfile();
  moduleState.selectedLocation = normalizeLegacyText(S.get('selectedLocation', moduleState.selectedLocation || ''));
  syncIdentityAvatars();
  /* v0.15.41 S16: zero-shot users (no name, no shots) get plain chrome
     instead of unexplained NODE jargon. Named or active users keep the
     NODE-flavored identity line. */
  renderDashSub();
  const displayName = window.CU?.defaultName || profile.name || '';
  let zeroShot = !displayName;
  try { zeroShot = zeroShot && !(typeof sortedShots === 'function' && sortedShots().length); } catch (_) {}
  setText('profSub', zeroShot ? '// PROFILE //' : `// ${displayName || 'NODE_USER'} //`);
  setText('profNameTxt', displayName || tx('profile.anonFallback', 'NODE_USER'));
  setText('profEmail', sessionLabel());
  setText('profMedTxt', normalizeMedicationId(profile.med) ? `// ${medicationLabel(profile.med).toUpperCase()}` : tx('profile.noMedicationSet', '// NO MEDICATION SET'));
  hydrateProfileFields(profile);
  setTodayDefaults();
  refreshAll();
}

function setText(id, value) { const element = $(id); if (element) element.textContent = value; }
function setDisplay(id, visible) { const element = $(id); if (element) element.style.display = visible ? '' : 'none'; }

/* Track 6 auth parity: dashSub zero-shot copy is mode-aware. Cloud-signed-in
   users with no name/shots see the cloud variant instead of the false
   local-only claim. Named or active users keep the NODE identity line. */
function renderDashSub() {
  const profile = getProfile();
  const displayName = window.CU?.defaultName || profile.name || '';
  let zeroShot = !displayName;
  try { zeroShot = zeroShot && !(typeof sortedShots === 'function' && sortedShots().length); } catch (_) {}
  if (!zeroShot) {
    setText('dashSub', tx('dashboard.nodeOnline', '// {name} // NODE ONLINE', { name: displayName || 'NODE_USER' }));
    return;
  }
  setText('dashSub', state.cloud
    ? tx('dashboard.zeroShotCloudSub', 'SYNCED TO YOUR CLOUD')
    : tx('dashboard.zeroShotSub', 'STORED ON THIS DEVICE'));
}
/* i18n applyTo() resets [data-i18n] elements on gn:langchange, which would
   restore the static local-only copy for cloud users; refreshAll() does not
   re-render dashSub, so re-apply the mode-aware copy here. */
document.addEventListener('gn:langchange', () => { try { renderDashSub(); } catch (_) {} });

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

