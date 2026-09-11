export function renderCalendar() {
  const grid = $('calGrid'); if (!grid) return;
  const date = moduleState.calendarDate, year = date.getFullYear(), month = date.getMonth();
  const locale = document.documentElement?.lang?.startsWith('es') ? 'es-419' : 'en-US';
  const monthLabel = new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' }).toLocaleUpperCase(locale);
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Date(2026, 7, 2 + index).toLocaleDateString(locale, { weekday: 'short' }).replace('.', '').toLocaleUpperCase(locale));
  setText('calTitle', monthLabel);
  const first = new Date(year, month, 1).getDay(), total = new Date(year, month + 1, 0).getDate();
  const shots = new Set(sortedShots().map(item => item.date?.slice(0, 10))), weights = new Set(sortedWeights().map(item => item.date?.slice(0, 10)));
  grid.innerHTML = `${weekdayLabels.map(day => `<div class="cal-day-head">${day}</div>`).join('')}${Array.from({ length: first }, () => '<div class="cal-day empty-day"></div>').join('')}${Array.from({ length: total }, (_, index) => { const day = index + 1, key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return `<button type="button" class="cal-day ${moduleState.selectedCalendarDay === key ? 'selected' : ''}" data-calendar-day="${key}"><span>${day}</span>${shots.has(key) ? '<i class="cal-mark shot"></i>' : ''}${weights.has(key) ? '<i class="cal-mark weight"></i>' : ''}</button>`; }).join('')}`;
  const selected = moduleState.selectedCalendarDay;
  if (selected) { const records = [...getAllShots().filter(item => item.date?.slice(0, 10) === selected), ...getWeights().filter(item => item.date?.slice(0, 10) === selected)]; $('calDetail').innerHTML = records.length ? records.map(item => `<div class="gn-calendar-detail">${safeText(item.med ? medicationLabel(item.med) : tx('results.weight', 'WEIGHT'))} · ${safeText(formatDateTime(item.date))}</div>`).join('') : `<div class="gn-calendar-detail">${tx('calendar.noRecords', 'No records on this day.')}</div>`; }
}
export function calPrev() { moduleState.calendarDate.setMonth(moduleState.calendarDate.getMonth() - 1); renderCalendar(); }
export function calNext() { moduleState.calendarDate.setMonth(moduleState.calendarDate.getMonth() + 1); renderCalendar(); }
export function calDayClick(day) { moduleState.selectedCalendarDay = day; renderCalendar(); }

export function openArsenalMod(type = 'compound', editId = null) { moduleState.arsenalEditId = editId; $('arsTitle')?.replaceChildren(document.createTextNode(editId ? tx('shots.editContext', 'EDIT CONTEXT') : tx('shots.addContext', 'ADD CONTEXT'))); $('arsOv')?.classList.add('active'); }
export function closeArs() { $('arsOv')?.classList.remove('active'); moduleState.arsenalEditId = null; }
export function saveArs() { const items = S.get('arsenal', []); const record = { id: moduleState.arsenalEditId || createId('context'), name: $('aName')?.value?.trim(), concentration: Number($('aConc')?.value) || null, volume: Number($('aVol')?.value) || null, quantity: Number($('aQty')?.value) || 1, reviewDate: $('aExpiry')?.value || '' }; if (!record.name) { showToast(tx('shots.contextNameRequired', 'Enter a context name.'), true); return; } const index = items.findIndex(item => item.id === record.id); if (index >= 0) items[index] = record; else items.push(record); S.set('arsenal', items); queueCloudSync('workspace'); closeArs(); showToast(tx('lab.saveContext', 'VAULT context saved.')); }
export function requestLoadoutRemove(id) { moduleState.pendingArsenalId = id; $('loadoutRemoveOverlay')?.classList.add('active'); }
export function cancelLoadoutRemove() { moduleState.pendingArsenalId = null; $('loadoutRemoveOverlay')?.classList.remove('active'); }
export function confirmLoadoutRemove() { const next = S.get('arsenal', []).filter(item => item.id !== moduleState.pendingArsenalId); S.set('arsenal', next); queueCloudSync('workspace'); cancelLoadoutRemove(); showToast(tx('shots.contextRemoved', 'Context removed.')); }

export function formatTime24(date) { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
export function formatTime12(date) { const hour = date.getHours() % 12 || 12; return `${hour}:${String(date.getMinutes()).padStart(2, '0')}`; }
function getShotTime24(value) { const raw = String(value || '').trim().toUpperCase(); const suffix = moduleState.meridiem; const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/); if (!match) return ''; let hour = Number(match[1]), minute = Number(match[2] || '00'); if (suffix === 'PM' && hour < 12) hour += 12; if (suffix === 'AM' && hour === 12) hour = 0; return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : ''; }
export function gnSetShotMeridiem(value) { moduleState.meridiem = value === 'PM' ? 'PM' : 'AM'; updateMeridiemButtons(); }
function updateMeridiemButtons() { $('sTimeAM')?.classList.toggle('active', moduleState.meridiem === 'AM'); $('sTimePM')?.classList.toggle('active', moduleState.meridiem === 'PM'); }
export function gnShotClockLiveFormat(input) { if (!input) return; input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4).replace(/^(\d{1,2})(\d{2})$/, '$1:$2'); }
export function gnNormalizeShotClockField(input) { if (!input) return; const parsed = getShotTime24(input.value); if (parsed) { const date = new Date(`2000-01-01T${parsed}`); input.value = formatTime12(date); } }
export function gnWeightDateInput(input) {
  if (!input) return;
  input.value = input.value.replace(/[^0-9\/-]/g, '').slice(0, 10);
  delete input.dataset.isoDate;
  delete input.dataset.dateDisplay;
}
export function gnWeightTimeInput(input) { if (input) input.value = input.value.replace(/[^0-9:]/g, '').slice(0, 5); }
function renderShotDatePicker() {
  const month = moduleState.shotPickerMonth;
  const label = $('gnDatePickerMonth');
  const grid = $('gnDatePickerGrid');
  if (!label || !grid) return;
  label.textContent = month.toLocaleDateString(document.documentElement.lang?.startsWith('es') ? 'es-419' : 'en-US', { month: 'long', year: 'numeric' });
  const year = month.getFullYear(), monthIndex = month.getMonth(), first = new Date(year, monthIndex, 1).getDay(), total = new Date(year, monthIndex + 1, 0).getDate();
  const selected = moduleState.shotPickerSelected || '';
  const weekdays = document.documentElement.lang?.startsWith('es') ? ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'] : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  grid.innerHTML = `${weekdays.map(day => `<div class="gn-date-dow">${day}</div>`).join('')}${Array.from({ length: first }, () => '<button type="button" class="gn-date-day blank" tabindex="-1"></button>').join('')}${Array.from({ length: total }, (_, index) => { const day = index + 1, value = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return `<button type="button" class="gn-date-day${value === selected ? ' selected' : ''}" data-gn-picker-date="${value}"><span>${day}</span></button>`; }).join('')}`;
}
export function gnOpenShotDatePicker() {
  const input = $('sDate');
  if (!input) return;
  const selected = readHumanDateInput(input) || todayISO();
  moduleState.shotPickerOriginal = { value: input.value, isoDate: input.dataset.isoDate || selected, dateDisplay: input.dataset.dateDisplay || input.value };
  moduleState.shotPickerSelected = selected;
  const parsed = parseLocalDate(selected);
  moduleState.shotPickerMonth = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  setHumanDateInput(input, selected);
  input.type = 'text'; input.setAttribute('readonly', 'readonly');
  renderShotDatePicker();
  $('gnDatePickerOverlay')?.classList.add('active');
}
export function gnCloseShotDatePicker() { const input = $('sDate'); if (input && moduleState.shotPickerOriginal !== null) { input.value = moduleState.shotPickerOriginal.value; input.dataset.isoDate = moduleState.shotPickerOriginal.isoDate; input.dataset.dateDisplay = moduleState.shotPickerOriginal.dateDisplay; } moduleState.shotPickerOriginal = null; $('gnDatePickerOverlay')?.classList.remove('active'); if (input) { input.type = 'text'; input.setAttribute('readonly', 'readonly'); } }
export function gnDatePickerMove(delta) { moduleState.shotPickerMonth.setMonth(moduleState.shotPickerMonth.getMonth() + Number(delta || 0)); renderShotDatePicker(); }
export function gnSelectPickerDate(date) { moduleState.shotPickerSelected = normalizeDateInput(date) || todayISO(); setHumanDateInput($('sDate'), moduleState.shotPickerSelected); renderShotDatePicker(); }
export function gnSetShotDateFromPicker() { if (moduleState.shotPickerSelected) setHumanDateInput($('sDate'), moduleState.shotPickerSelected); moduleState.shotPickerOriginal = null; $('gnDatePickerOverlay')?.classList.remove('active'); }
export function gnSetShotDateValue(value) { setHumanDateInput($('sDate'), value); }
export function gnSetShotTimeValue(value) { if ($('sTime')) $('sTime').value = formatTime12(new Date(`2000-01-01T${value}`)); }
export function gnMedRevealGroup(dropId, group) {
  const drop = $(dropId);
  if (!drop) return;
  qa('[data-gn-med-options]', drop).forEach(block => {
    const isActive = block.dataset.gnMedOptions === group;
    block.classList.toggle('gn-revealed', isActive);
    block.style.display = '';
  });
}
export function updatePills() { const med = normalizeMedicationId(selectState.cpShotMed?.val); const dose = Number(getProfile().dose); const container = $('dosePills'); if (!container) return; const values = dose ? [dose] : [0.5, 1, 2.5, 5, 7.5, 10]; container.innerHTML = values.map(value => `<button type="button" class="dose-pill" data-dose="${value}">${value} mg</button>`).join(''); setText('profMedTxt', med ? `// ${medicationLabel(med).toUpperCase()}` : tx('profile.noMedicationSet', '// NO MEDICATION SET')); }
export function selPill(button, dose) {
  const el = $('sDose');
  if (el) {
    el.value = dose;
    /* v0.15.37: dose pills set the value programmatically, which fires no
       input/change. The native session draft (gridnode-native.js) only
       captures on input/change, so a pill-picked dose went stale there and
       restoreShotDraft() wiped it on the next modal reopen (e.g. the
       injection-zone round trip), unchecking the coach's dose step. */
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  qa('.dose-pill').forEach(item => item.classList.toggle('active', item === button));
}

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

export function initModules() {
  initScannerAudioControl();
  document.addEventListener('click', event => {
    const zone = event.target.closest('[data-stable-zone]');
    if (zone) selectScannerLocation(zone.dataset.stableZone, { source: 'fallback', gestureToken: gnScannerAudioGesture.fromEvent(event) });
    const historyButton = event.target.closest('[data-shot-history-view]');
    if (historyButton) setShotHistoryView(historyButton.dataset.shotHistoryView);
    const shotAction = event.target.closest('[data-shot-action]');
    if (shotAction) { const action = shotAction.dataset.shotAction, id = shotAction.dataset.shotId; if (action === 'edit') editShot(id); if (action === 'archive') openArchiveConfirm(id); if (action === 'restore') restoreArchivedShot(id); if (action === 'restore-edit') restoreArchivedShotToEdit(id); if (action === 'delete') openPermanentDeleteConfirm(id); }
    if (event.target.closest('[data-empty-shot]')) handleShotFab();
    const pickerDay = event.target.closest('[data-gn-picker-date]'); if (pickerDay) gnSelectPickerDate(pickerDay.dataset.gnPickerDate);
    const calendarDay = event.target.closest('[data-calendar-day]'); if (calendarDay) calDayClick(calendarDay.dataset.calendarDay);
    const dosePill = event.target.closest('.dose-pill'); if (dosePill) selPill(dosePill, Number(dosePill.dataset.dose));
    const researchPick = event.target.closest('[data-research-name]');
    if (researchPick) {
      const pickName = researchPick.dataset.researchName || '';
      const mode = $('gnResearchMode');
      if (pickName) {
        if (mode) { mode.style.display = ''; mode.dataset.mode = 'library'; }
        const mlc = $('gnModeLibraryChip'), mcc = $('gnModeCategoryChip'), mcb = $('gnModeBack');
        if (mlc) { mlc.style.display = ''; mlc.textContent = tx('research.modeLibrarySelected', 'BIBLIOTECA · SELECCIONADA') + ' ' + tx('research.lockGlyph', '🔒'); }
        if (mcc) { mcc.style.display = ''; mcc.textContent = tx('research.modeCategoryAssigned', 'CATEGORÍA · ASIGNADA') + ' ' + tx('research.lockGlyph', '🔒'); }
        if (mcb) mcb.style.display = 'none';
        const customTitle = document.querySelector('.gn-research-mode-custom .gn-research-mode-title');
        if (customTitle) customTitle.style.display = 'none';
        if ($('gnResearchName')) {
          $('gnResearchName').value = pickName;
          $('gnResearchName').readOnly = true;
          $('gnResearchName').setAttribute('data-research-locked', '1');
        }
        const category = $('gnResearchCategory');
        if (category) { category.dataset.categoryId = researchPick.dataset.researchCategory || 'lab.customResearch'; category.value = researchCategoryLabel(category.dataset.categoryId); category.readOnly = true; category.setAttribute('data-category-locked', '1'); }
        $('gnResearchName')?.setAttribute('placeholder', tx('research.presetLockedPlaceholder', 'Library entry — name is locked'));
        const badgeHost = $('gnResearchForm')?.querySelector('[data-research-badge]');
        if (badgeHost) badgeHost.textContent = tx('research.presetBadge', 'PRESET');
        const customSave = $('gnResearchSave');
        if (customSave) customSave.textContent = tx('research.save', 'SAVE RESEARCH RECORD');
        const cw = $('gnCustomWarning');
        if (cw) cw.style.display = 'none';
        // B12 rev (2026-08-08): after picking a peptide, bring the form
        // into view so NOMBRE + CATEGORÍA are visibly auto-filled —
        // the user can log in ≤3 taps + fill on a 360px screen.
        $('gnResearchForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        researchEnterCustomMode();
        $('gnResearchForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    const researchDelete = event.target.closest('[data-research-delete]'); if (researchDelete) deleteResearchRecord(researchDelete.dataset.researchDelete);
  });
  document.addEventListener('click', event => { if (!event.target.closest('.cp-select')) { qa('.cp-dropdown.open').forEach(item => item.classList.remove('open')); qa('.cp-select-trigger.open').forEach(item => item.classList.remove('open')); } });
  wireSelectOptions();
  installCustomPickers(document);
  $('gnResearchCategory')?.addEventListener('input', event => { delete event.currentTarget.dataset.categoryId; if ($('gnResearchName')) { $('gnResearchName').readOnly = false; $('gnResearchName').removeAttribute('data-research-locked'); const bH = $('gnResearchForm')?.querySelector('[data-research-badge]'); if (bH) bH.textContent = ''; $('gnResearchName')?.setAttribute('placeholder', tx('research.recordNamePlaceholder', 'Select a library entry or type a custom name')); } });
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


/* v0.15.19 - install pointer handlers on first user interaction with scanner */
document.addEventListener("DOMContentLoaded", () => { installScannerPointerHandlers(); installScannerDebugMode(); });
window.addEventListener("load", () => { installScannerPointerHandlers(); installScannerDebugMode(); });
