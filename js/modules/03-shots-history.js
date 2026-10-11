
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
  /* S4/S5: HISTORY type filter — ALL / SHOTS / WEIGHT. ALL renders the
   * presentation-level TimelineEvent union (buildTimeline); SHOTS and WEIGHT
   * stay on their native storage models. */
  const historyType = moduleState.historyType === 'weight' ? 'weight' : moduleState.historyType === 'shots' ? 'shots' : 'all';
  qa('[data-history-type]').forEach(button => button.classList.toggle('active', button.dataset.historyType === historyType));
  /* Shot-only chrome (active/archived toggle, helper copy, shot filters)
   * belongs to the SHOTS subview. WEIGHT and ALL render their own lists. */
  const shotsChrome = historyType === 'shots';
  setDisplay('shotHistoryControls', shotsChrome);
  setDisplay('shotHistoryHelper', shotsChrome);
  const existingFilters = $('gnShotFilters');
  if (existingFilters) existingFilters.hidden = !shotsChrome;
  if (historyType === 'weight') { renderWeightHistory(); return; }
  if (historyType === 'all') { renderAllHistory(); return; }
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
    /* QA 2026-09-17: an empty ARCHIVED tab with active history behind it is
     * not a first run — show a neutral archived state, never the
     * "log your first shot" pitch. */
    if (!activeFilters && moduleState.shotHistoryView === 'archived' && all.some(record => !record.archived)) {
      list.innerHTML = `<div class="empty gn-first-run-card"><span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-protocol-event"></use></svg></span></span><b class="gn-first-run-title">${tx('shots.noArchivedShots', 'NO ARCHIVED SHOTS')}</b><span class="gn-first-run-sub">${tx('shots.noArchivedHint', 'Archived shots rest here. Archive a shot from your active history to tuck it away without deleting it.')}</span></div>`;
      return;
    }
    /* QA 2026-09-18: an empty ACTIVE tab with everything archived is not a
     * first run either — show a neutral state with a path to the archive,
     * never the "log your first shot" pitch. */
    if (!activeFilters && moduleState.shotHistoryView !== 'archived' && all.some(record => record.archived)) {
      list.innerHTML = `<div class="empty gn-first-run-card"><span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-protocol-event"></use></svg></span></span><b class="gn-first-run-title">${tx('shots.noActiveShots', 'NO ACTIVE SHOTS')}</b><span class="gn-first-run-sub">${tx('shots.noActiveHint', 'Every shot is archived. Restore one from the archive to bring it back, or log a new shot.')}</span><br><button class="btn-full btn-secondary empty-cta" type="button" data-shot-history-view="archived">${tx('shots.viewArchive', 'VIEW ARCHIVE')}</button></div>`;
      return;
    }
    list.innerHTML = `<div class="empty${activeFilters ? '' : ' gn-first-run-card'}"><span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-protocol-event"></use></svg></span></span><b class="gn-first-run-title">${activeFilters ? tx('shots.noFilterMatch', 'NO SHOTS MATCH THESE FILTERS.') : moduleState.shotHistoryView === 'archived' ? tx('shots.noArchivedShots', 'NO ARCHIVED SHOTS') : tx('shots.activateYourGrid', 'LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID')}</b>${activeFilters ? '<br><button class="btn-full btn-secondary empty-cta" type="button" id="gnShotFilterEmptyClear">' + tx('shots.clearFilters', 'CLEAR FILTERS') + '</button>' : '<span class="gn-first-run-sub">' + tx('shots.firstShotSub', 'One shot unlocks the Phase Engine, RESULTS, and your full dashboard.') + '</span><br><button class="btn-full btn-primary empty-cta" type="button" data-empty-shot>' + tx('shots.logYourFirst', 'LOG YOUR FIRST SHOT') + '</button>'}</div>`;
    $('gnShotFilterEmptyClear')?.addEventListener('click', () => { moduleState.shotFilters = { medication: '', site: '', range: 'all', query: '' }; renderShots(); });
    return;
  }
  list.innerHTML = visible.map(record => shotCardHtml(record, Boolean(record.archived))).join('');
}

function shotCardHtml(record, archived) {
    return `<article class="log-entry ${archived ? 'archived archived-record' : ''}">
      <div class="log-main"><div><div class="log-date">${archived ? tx('shots.archivedPrefix', 'ARCHIVED') + ' ' : ''}${safeText(formatDateTime(record.date))}</div><div class="log-med">${safeText(medicationLabel(record.med))}</div></div>
      <div class="log-dose">${safeText(record.dose || '—')}mg</div></div>
      <div class="log-chips">${record.site ? `<span class="log-chip lc-site">${safeText(zoneLabel(record.site))}</span>` : ''}${record.deviceId ? `<span class="log-chip lc-site">${tx('shot.deviceUsed', 'DEVICE')}: ${safeText(deviceLabel(record.deviceId) || tx('runtime.notAvailable', 'NOT AVAILABLE'))}</span>` : ''}${record.wt ? `<span class="log-chip lc-wt">${safeText(record.wt)}lb</span>` : ''}${record.se?.length ? `<span class="log-chip lc-se">${safeText(record.se.map(sideEffectLabel).join(', '))}</span>` : ''}</div>
      ${record.notes ? `<div class="log-notes">${safeText(record.notes)}</div>` : ''}
      <div class="log-actions ${archived ? 'archive-actions' : ''}">${archived ? `<button type="button" class="log-action-btn restore archived-action-btn" data-shot-action="restore-edit" data-shot-id="${safeText(record.id)}"><span class="archive-action-main">${tx('shots.restore', 'RESTORE')}</span><span class="archive-action-sub">${tx('shots.restoreToEdit', 'RESTORE TO EDIT')}</span></button><button type="button" class="log-action-btn del archived-action-btn" data-shot-action="delete" data-shot-id="${safeText(record.id)}"><span class="archive-action-main">${tx('deletePerm.confirm', 'DELETE RECORD')}</span><span class="archive-action-sub">${tx('shots.deletePermanently', 'DELETE PERMANENTLY')}</span></button>` : `<button type="button" class="log-action-btn" data-shot-action="edit" data-shot-id="${safeText(record.id)}">${tx('shots.edit', 'EDIT')}</button><button type="button" class="log-action-btn del" data-shot-action="archive" data-shot-id="${safeText(record.id)}">${tx('shots.archive', 'ARCHIVE')}</button>`}</div>
      ${archived ? `<div class="shot-history-helper">${tx('shots.archivedRestoreNote', 'Restore the record before editing.')}</div>` : ''}
    </article>`;
}

export function setShotHistoryView(view) {
  moduleState.shotHistoryView = view === 'archived' ? 'archived' : 'active';
  renderShots();
}

export function setHistoryType(type) {
  moduleState.historyType = type === 'weight' ? 'weight' : type === 'shots' ? 'shots' : 'all';
  renderShots();
}

/* S4: weight card — display only. Weight records keep their own storage
 * model (getWeights); no TimelineEvent union is built here (S5). */
function weightCardHtml(record, datePrecision) {
  const loggedWithShot = record.source === 'shot' || record.notes === 'Logged with SHOT';
  /* S5: never invent midnight — date-only weights render as dates, not datetimes. */
  const precision = datePrecision || (/T\d/.test(record.date || '') ? 'datetime' : 'day');
  const dateLabel = precision === 'day' ? formatDate(record.date) : formatDateTime(record.date);
  return `<article class="log-entry gn-weight-entry">
      <div class="log-main"><div><div class="log-date">${safeText(dateLabel)}</div><div class="log-med">${tx('results.weight', 'WEIGHT')}</div></div>
      <div class="log-dose">${safeText(Number(record.weight).toFixed(1))}lb</div></div>
      <div class="log-chips"><span class="log-chip lc-wt">${loggedWithShot ? tx('history.loggedWithShot', 'LOGGED WITH SHOT') : tx('history.manualEntry', 'MANUAL ENTRY')}</span></div>
      ${record.notes && !loggedWithShot ? `<div class="log-notes">${safeText(record.notes)}</div>` : ''}
    </article>`;
}

function validWeights() {
  return getWeights().filter(record => record && Number.isFinite(Number(record.weight)));
}

function renderWeightHistory() {
  const list = $('logList');
  if (!list) return;
  const weights = validWeights().sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!weights.length) {
    list.innerHTML = `<div class="empty gn-first-run-card"><span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-biometric-gauge"></use></svg></span></span><b class="gn-first-run-title">${tx('history.noWeights', 'NO WEIGHT RECORDS')}</b><span class="gn-first-run-sub">${tx('history.noWeightsSub', 'Log your weight to start building your trend.')}</span><br><button class="btn-full btn-primary empty-cta" type="button" onclick="openWeightModal()">${tx('history.logWeight', 'LOG WEIGHT')}</button></div>`;
    return;
  }
  list.innerHTML = weights.map(weightCardHtml).join('');
}

/* S5: TimelineEvent — presentation-level union of shots and weights.
 * Storage models stay separate (getAllShots / getWeights); this is a
 * read-only view projection, built client-side.
 * - id: namespaced 'shot:<id>' / 'weight:<id>' (never collides across types)
 * - occurredAt: the record's own date string, untouched
 * - createdAt: record creation time; null for legacy records (sorts last)
 * - datePrecision: 'day' when the date carries no time component — the UI
 *   must not invent midnight for these
 * Deterministic sort: occurredAt DESC → createdAt DESC → type ASC → id ASC.
 */
function toTimelineEvent(record, type) {
  const occurredAt = record.date || '';
  const ms = Date.parse(occurredAt);
  return {
    id: `${type}:${record.id}`,
    type,
    occurredAt,
    occurredAtMs: Number.isFinite(ms) ? ms : 0,
    createdAt: record.createdAt || null,
    datePrecision: /T\d/.test(occurredAt) ? 'datetime' : 'day',
    record
  };
}

function compareTimelineEvents(a, b) {
  if (b.occurredAtMs !== a.occurredAtMs) return b.occurredAtMs - a.occurredAtMs;
  const aCreated = a.createdAt ? Date.parse(a.createdAt) : -1;
  const bCreated = b.createdAt ? Date.parse(b.createdAt) : -1;
  if (bCreated !== aCreated) return bCreated - aCreated;
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function buildTimeline(options = {}) {
  const includeArchived = Boolean(options.includeArchived);
  const shots = getAllShots().filter(record => includeArchived || !record.archived);
  const weights = validWeights();
  return [
    ...shots.map(record => toTimelineEvent(record, 'shot')),
    ...weights.map(record => toTimelineEvent(record, 'weight'))
  ].sort(compareTimelineEvents);
}

/* Shot Constellation Timeline: visual event map above the history list */
function renderConstellation() {
  var el = document.getElementById('gnConstellation');
  if (!el) return;
  try {
    var events = buildTimeline().slice().reverse(); // oldest first for left-to-right
    if (events.length < 2) { el.hidden = true; return; }
    el.hidden = false;
    var nodes = document.getElementById('gnConstellationNodes');
    if (!nodes) return;
    var times = events.map(function(e){ return new Date(e.record.date || e.record.createdAt || 0).getTime(); }).filter(function(t){ return !Number.isNaN(t); });
    if (!times.length) { el.hidden = true; return; }
    var mn = Math.min.apply(null, times), mx = Math.max.apply(null, times), span = (mx - mn) || 1;
    // vertical lane by type: shots center, weights upper, labs lower
    nodes.innerHTML = events.slice(-40).map(function(e, i){
      var t = new Date(e.record.date || e.record.createdAt || 0).getTime();
      var x = ((t - mn) / span * 96 + 2).toFixed(2);
      var lane = e.type === 'shot' ? '50%' : (e.type === 'weight' ? '28%' : '72%');
      var cls = e.type === 'shot' ? 'shot' : (e.type === 'weight' ? 'weight' : 'lab');
      return '<div class="gn-const-node ' + cls + '" style="left:' + x + '%;top:' + lane + '" data-const-idx="' + i + '" title="' + e.type + '" role="button" tabindex="0" aria-label="' + e.type + ' event"></div>';
    }).join('');
    nodes.querySelectorAll('.gn-const-node').forEach(function(n){
      n.addEventListener('click', function(){
        var idx = Number(n.dataset.constIdx);
        var cards = document.querySelectorAll('#logList > *');
        if (cards[idx]) { cards[idx].scrollIntoView({ behavior: 'smooth', block: 'center' }); cards[idx].style.outline = '2px solid #00d4ff'; setTimeout(function(){ cards[idx].style.outline = ''; }, 1500); }
      });
    });
  } catch (_) { el.hidden = true; }
}

/* S5: ALL subview — renders the TimelineEvent union, newest first. */
function renderAllHistory() {
  const list = $('logList');
  if (!list) return;
  const events = buildTimeline();
  if (!events.length) {
    list.innerHTML = `<div class="empty gn-first-run-card"><span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-protocol-event"></use></svg></span></span><b class="gn-first-run-title">${tx('history.allEmptyTitle', 'NOTHING LOGGED YET')}</b><span class="gn-first-run-sub">${tx('history.allEmptySub', 'Log a shot or your weight to start your timeline.')}</span><br><button class="btn-full btn-primary empty-cta" type="button" data-empty-shot>${tx('runtime.logShot', 'LOG SHOT')}</button> <button class="btn-full btn-secondary empty-cta" type="button" onclick="openWeightModal()">${tx('history.logWeight', 'LOG WEIGHT')}</button></div>`;
    return;
  }
  renderConstellation();
  list.innerHTML = events.map(event => event.type === 'shot'
    ? shotCardHtml(event.record, false)
    : weightCardHtml(event.record, event.datePrecision)).join('');
}


/* GN_SCANNER_AUDIO_CONTROLLER_V1_START */
