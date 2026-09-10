
function ensureShotHistoryFilters() {
  const controls = $('shotHistoryControls');
  if (!controls || $('gnShotFilters')) return;
  controls.insertAdjacentHTML('afterend', `<details class="gn-shot-filters" id="gnShotFilters"><summary><span data-i18n="shots.filterHistory">FILTER SHOT HISTORY</span> <span class="gn-filter-count" id="gnShotFilterCount"></span></summary><div class="gn-shot-filter-grid"><label><span data-i18n="shot.medication">MEDICATION</span><select id="gnShotFilterMedication"><option value="" data-i18n="shots.allMedications">ALL MEDICATIONS</option></select></label><label><span data-i18n="shot.location">LOCATION</span><select id="gnShotFilterSite"><option value="" data-i18n="shots.allLocations">ALL LOCATIONS</option></select></label><label><span data-i18n="shots.dateRange">DATE RANGE</span><select id="gnShotFilterRange"><option value="all" data-i18n="shots.allTime">ALL TIME</option><option value="today" data-i18n="shots.today">TODAY</option><option value="week" data-i18n="shots.thisWeek">THIS WEEK</option><option value="month" data-i18n="shots.thisMonth">THIS MONTH</option></select></label><label><span data-i18n="shots.notesSearch">NOTES SEARCH</span><input id="gnShotFilterQuery" type="search" placeholder="Search notes" data-i18n-placeholder="shots.searchNotes"></label></div><button type="button" class="gn-shot-filter-clear" id="gnShotFilterClear" hidden data-i18n="shots.clearAllFilters">CLEAR ALL FILTERS</button></details>`);
  window.GN_I18N?.applyTo?.($('gnShotFilters'));
  $('gnShotFilters')?.addEventListener('input', event => {
    const id = event.target.id;
    if (id === 'gnShotFilterMedication') moduleState.shotFilters.medication = event.target.value;
    if (id === 'gnShotFilterSite') moduleState.shotFilters.site = event.target.value;
    if (id === 'gnShotFilterRange') moduleState.shotFilters.range = event.target.value;
    if (id === 'gnShotFilterQuery') moduleState.shotFilters.query = event.target.value;
    renderShots();
  });
  $('gnShotFilterClear')?.addEventListener('click', () => { moduleState.shotFilters = { medication: '', site: '', range: 'all', query: '' }; renderShots(); });
}

function filterShots(records) {
  const filters = moduleState.shotFilters;
  const query = filters.query.trim().toLowerCase();
  let cutoff = null;
  if (filters.range === 'today') {
    const d = new Date(); d.setHours(0,0,0,0); cutoff = d.getTime();
  } else if (filters.range === 'week') {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 6); cutoff = d.getTime();
  } else if (filters.range === 'month') {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 29); cutoff = d.getTime();
  }
  return records.filter(record => {
    if (filters.medication && normalizeMedicationId(record.med) !== filters.medication) return false;
    if (filters.site && (record.site || '') !== filters.site) return false;
    if (cutoff && new Date(record.date).getTime() < cutoff) return false;
    if (query && !String(record.notes || '').toLowerCase().includes(query)) return false;
    return true;
  });
}

function renderShotFilterOptions(records) {
  const filters = moduleState.shotFilters;
  const med = $('gnShotFilterMedication');
  const site = $('gnShotFilterSite');
  if (med) { const values = [...new Set(records.map(record => normalizeMedicationId(record.med)).filter(Boolean))].sort(); med.innerHTML = `<option value="">${tx('shots.allMedications', 'ALL MEDICATIONS')}</option>` + values.map(value => `<option value="${safeText(value)}">${safeText(medicationLabel(value))}</option>`).join(''); med.value = filters.medication; }
  if (site) { const values = [...new Set(records.map(record => record.site).filter(Boolean))].sort(); site.innerHTML = `<option value="">${tx('shots.allLocations', 'ALL LOCATIONS')}</option>` + values.map(value => `<option value="${safeText(value)}">${safeText(value)}</option>`).join(''); site.value = filters.site; }
  const query = $('gnShotFilterQuery'); if (query && query.value !== filters.query) query.value = filters.query;
  const range = $('gnShotFilterRange'); if (range) range.value = filters.range;
  const count = Object.values(filters).filter(value => value && value !== 'all').length;
  setText('gnShotFilterCount', count ? tx(count === 1 ? 'shots.filterActive_one' : 'shots.filterActive_other', '{count} FILTERS ACTIVE', { count }) : '');
  const clear = $('gnShotFilterClear'); if (clear) clear.hidden = !count;
}

export function renderShots() {
  renderScanner();
  ensureShotHistoryFilters();
  const list = $('logList');
  if (!list) return;
  const all = getAllShots();
  const visible = filterShots(all.filter(record => moduleState.shotHistoryView === 'archived' ? record.archived : !record.archived).sort((a, b) => new Date(b.date) - new Date(a.date)));
  renderShotFilterOptions(all);
  installCustomPickers(document);
  document.addEventListener('gn:langchange', () => {
    const shotDate = $('sDate');
    const weightDate = $('wtDate');
    if (shotDate?.dataset.isoDate) setHumanDateInput(shotDate, shotDate.dataset.isoDate);
    if (weightDate?.dataset.isoDate) setHumanDateInput(weightDate, weightDate.dataset.isoDate, true);
    window.requestAnimationFrame(() => {
      installCustomPickers(document);
      syncCustomPickers(document);
      qa('.gn-custom-date').forEach(renderCustomDatePopover);
      renderScanner();
    });
  });
  syncCustomPickers($('gnShotFilters') || document);
  setText('shotHistoryHelper', moduleState.shotHistoryView === 'archived' ? tx('shots.archivedRetained', 'Archived records remain stored for review and can be restored.') : tx('shots.activeRecordsRetained', 'Active SHOT records are retained in your local VAULT.'));
  qa('[data-shot-history-view]').forEach(button => button.classList.toggle('active', button.dataset.shotHistoryView === moduleState.shotHistoryView));
  if (!visible.length) {
    const activeFilters = Object.values(moduleState.shotFilters).some(value => value && value !== 'all');
    list.innerHTML = `<div class="empty${activeFilters ? '' : ' gn-first-run-card'}"><span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-protocol-event"></use></svg></span></span><b class="gn-first-run-title">${activeFilters ? tx('shots.noFilterMatch', 'NO SHOTS MATCH THESE FILTERS.') : moduleState.shotHistoryView === 'archived' ? tx('shots.noArchivedShots', 'NO ARCHIVED SHOTS') : tx('shots.activateYourGrid', 'LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID')}</b>${activeFilters ? '<br><button class="btn-full btn-secondary empty-cta" type="button" id="gnShotFilterEmptyClear">' + tx('shots.clearFilters', 'CLEAR FILTERS') + '</button>' : '<span class="gn-first-run-sub">' + tx('shots.firstShotSub', 'One shot unlocks the Phase Engine, RESULTS, and your full dashboard.') + '</span><br><button class="btn-full btn-primary empty-cta" type="button" data-empty-shot>' + tx('shots.logYourFirst', 'LOG YOUR FIRST SHOT') + '</button>'}</div>`;
    $('gnShotFilterEmptyClear')?.addEventListener('click', () => { moduleState.shotFilters = { medication: '', site: '', range: 'all', query: '' }; renderShots(); });
    return;
  }
  list.innerHTML = visible.map(record => {
    const archived = Boolean(record.archived);
    return `<article class="log-entry ${archived ? 'archived archived-record' : ''}">
      <div class="log-main"><div><div class="log-date">${archived ? tx('shots.archivedPrefix', 'ARCHIVED') + ' ' : ''}${safeText(formatDateTime(record.date))}</div><div class="log-med">${safeText(medicationLabel(record.med))}</div></div>
      <div class="log-dose">${safeText(record.dose || '—')}mg</div></div>
      <div class="log-chips">${record.site ? `<span class="log-chip lc-site">${safeText(zoneLabel(record.site))}</span>` : ''}${record.deviceId ? `<span class="log-chip lc-site">${tx('shot.deviceUsed', 'DEVICE')}: ${safeText(deviceLabel(record.deviceId) || tx('runtime.notAvailable', 'NOT AVAILABLE'))}</span>` : ''}${record.wt ? `<span class="log-chip lc-wt">${safeText(record.wt)}lb</span>` : ''}${record.se?.length ? `<span class="log-chip lc-se">${safeText(record.se.map(sideEffectLabel).join(', '))}</span>` : ''}</div>
      ${record.notes ? `<div class="log-notes">${safeText(record.notes)}</div>` : ''}
      <div class="log-actions ${archived ? 'archive-actions' : ''}">${archived ? `<button type="button" class="log-action-btn restore archived-action-btn" data-shot-action="restore-edit" data-shot-id="${safeText(record.id)}"><span class="archive-action-main">${tx('shots.restore', 'RESTORE')}</span><span class="archive-action-sub">${tx('shots.restoreToEdit', 'RESTORE TO EDIT')}</span></button><button type="button" class="log-action-btn del archived-action-btn" data-shot-action="delete" data-shot-id="${safeText(record.id)}"><span class="archive-action-main">${tx('deletePerm.confirm', 'DELETE RECORD')}</span><span class="archive-action-sub">${tx('shots.deletePermanently', 'DELETE PERMANENTLY')}</span></button>` : `<button type="button" class="log-action-btn" data-shot-action="edit" data-shot-id="${safeText(record.id)}">${tx('shots.edit', 'EDIT')}</button><button type="button" class="log-action-btn del" data-shot-action="archive" data-shot-id="${safeText(record.id)}">${tx('shots.archive', 'ARCHIVE')}</button>`}</div>
      ${archived ? `<div class="shot-history-helper">${tx('shots.archivedRestoreNote', 'Restore the record before editing.')}</div>` : ''}
    </article>`;
  }).join('');
}

export function setShotHistoryView(view) {
  moduleState.shotHistoryView = view === 'archived' ? 'archived' : 'active';
  renderShots();
}


/* GN_SCANNER_AUDIO_CONTROLLER_V1_START */
