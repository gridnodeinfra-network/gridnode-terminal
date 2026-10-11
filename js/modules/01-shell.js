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
  if (name === 'Log') renderShots();
  if (name === 'Results') renderResults();
  if (name === 'Lab') renderLab();
  if (name === 'Profile') renderProfile();
  /* MOBILE-FIRST perf: scroll after render to avoid double full-document layout */
  $('scrollBody')?.scrollTo({ top: 0, behavior: 'auto' });
  document.dispatchEvent(new CustomEvent('gn:pagechange', { detail: { name, previousPage } }));
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.page.active')?.id === 'pageProfile') { closeProfileHub(); } });
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
  var disc = document.getElementById('shotDiscardConfirmOv');
  if (disc && (disc.classList.contains('active') || getComputedStyle(disc).display !== 'none')) { cancelShotDiscard(); return; }
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
  renderProfile();
  renderDashboard();
  renderShots();
  renderResults();
  renderScanner();
  renderLab();
  renderCalendar();
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

