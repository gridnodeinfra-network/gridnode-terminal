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
  document.body.classList.toggle('gn-fab-hidden-context', ['Lab', 'Profile', 'Cal'].includes(name));
  qa('.page').forEach(item => item.classList.remove('active'));
  page.classList.add('active');
  qa('.nav-item').forEach(item => {
    item.classList.remove('active');
    item.removeAttribute('aria-current');
  });
  const nav = navElement || document.getElementById({ Dash: 'navDash', Log: 'navLog', Results: 'navRes', Lab: 'navLab', Profile: 'navPro', Cal: 'navCal' }[name]);
  if (nav) {
    nav.classList.add('active');
    nav.setAttribute('aria-current', 'page');
  }
  $('scrollBody')?.scrollTo({ top: 0, behavior: 'auto' });
  if (name === 'Log') renderShots();
  if (name === 'Results') renderResults();
  if (name === 'Lab') renderLab();
  if (name === 'Profile') renderProfile();
  if (name === 'Cal') renderCalendar();
  document.dispatchEvent(new CustomEvent('gn:pagechange', { detail: { name, previousPage } }));
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.page.active')?.id === 'pageProfile') { closeProfileHub(); } });
document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target && typeof e.target.matches === 'function' && e.target.matches('.cp-group-minimized')) { e.preventDefault(); e.target.click(); } });
document.addEventListener('keydown', function (e) { if (e.key !== 'Escape') return; var disc = document.getElementById('shotDiscardConfirmOv'); if (disc && (disc.classList.contains('active') || getComputedStyle(disc).display !== 'none')) { cancelShotDiscard(); return; } if (document.querySelector('#futureTimestampConfirm.active')) return; if (document.querySelector('#logOv.active')) { closeLog(); } if (document.querySelector('#wtOv.active')) { closeWt(); } });

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
  setText('dashSub', tx('dashboard.nodeOnline', '// {name} // NODE ONLINE', { name: window.CU?.defaultName || profile.name || 'NODE_USER' }));
  setText('profSub', `// ${window.CU?.defaultName || profile.name || 'NODE_USER'} //`);
  setText('profNameTxt', window.CU?.defaultName || profile.name || tx('profile.anonFallback', 'NODE_USER'));
  setText('profEmail', sessionLabel());
  setText('profMedTxt', normalizeMedicationId(profile.med) ? `// ${medicationLabel(profile.med).toUpperCase()}` : tx('profile.noMedicationSet', '// NO MEDICATION SET'));
  hydrateProfileFields(profile);
  setTodayDefaults();
  refreshAll();
}

function setText(id, value) { const element = $(id); if (element) element.textContent = value; }
function setDisplay(id, visible) { const element = $(id); if (element) element.style.display = visible ? '' : 'none'; }

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

