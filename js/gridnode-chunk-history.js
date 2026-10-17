function ensureShotHistoryFilters() {
  const controls = $('shotHistoryControls');
  if (!controls || $('gnShotFilters')) return;
  controls.insertAdjacentHTML('afterend', `<details class="gn-shot-filters" id="gnShotFilters"><summary><span data-i18n="shots.filterHistory">FILTER SHOT HISTORY</span> <span class="gn-filter-count" id="gnShotFilterCount"></span></summary><div class="gn-shot-filter-grid"><label><span data-i18n="shot.medication">MEDICATION</span><select id="gnShotFilterMedication"><option value="" data-i18n="shots.allMedications">ALL MEDICATIONS</option></select></label><label><span data-i18n="shot.location">LOCATION</span><select id="gnShotFilterSite"><option value="" data-i18n="shots.allLocations">ALL LOCATIONS</option></select></label><label><span data-i18n="shots.dateRange">DATE RANGE</span><select id="gnShotFilterRange"><option value="all" data-i18n="shots.allTime">ALL TIME</option><option value="today" data-i18n="shots.today">TODAY</option><option value="week" data-i18n="shots.thisWeek">THIS WEEK</option><option value="month" data-i18n="shots.thisMonth">THIS MONTH</option></select></label><label><span data-i18n="shots.searchHistory">SEARCH HISTORY</span><input id="gnShotFilterQuery" type="search" placeholder="Search medication, site, or notes" data-i18n-placeholder="shots.searchHistoryPlaceholder"></label></div><button type="button" class="gn-shot-filter-clear" id="gnShotFilterClear" hidden data-i18n="shots.clearAllFilters">CLEAR ALL FILTERS</button></details>`);
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

function shotFilterCutoff() {
  const range = moduleState.shotFilters.range;
  if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  if (range === 'week') { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6); return d.getTime(); }
  if (range === 'month') { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 29); return d.getTime(); }
  return null;
}

/* A1 simplification: one predicate for SHOTS and for the ALL timeline, and the
   search box now matches what users actually remember — medication, site, or
   dose — not only the free-text notes field (the old "NOTES SEARCH" label hid
   that limitation and made most searches return nothing). */
function shotMatchesFilters(record) {
  const filters = moduleState.shotFilters;
  const query = filters.query.trim().toLowerCase();
  const cutoff = shotFilterCutoff();
  if (filters.medication && normalizeMedicationId(record.med) !== filters.medication) return false;
  if (filters.site && (record.site || '') !== filters.site) return false;
  if (cutoff && new Date(record.date).getTime() < cutoff) return false;
  if (query) {
    const haystack = [
      record.notes || '',
      medicationLabel(record.med) || '',
      record.site || '',
      (typeof zoneLabel === 'function' && zoneLabel(record.site)) || '',
      record.dose != null ? String(record.dose) : ''
    ].join(' ').toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

function filterShots(records) {
  return records.filter(shotMatchesFilters);
}

function historyFiltersActive() {
  return Object.values(moduleState.shotFilters).some(value => value && value !== 'all');
}

/* Weight rows in the ALL timeline honour the same search/range, so a filtered
   ALL view never mixes filtered shots with unfiltered weights. Medication and
   site filters are shot-only concepts and exclude weight rows while active. */
function weightMatchesFilters(record) {
  const filters = moduleState.shotFilters;
  if (filters.medication || filters.site) return false;
  const cutoff = shotFilterCutoff();
  if (cutoff && new Date(record.date).getTime() < cutoff) return false;
  const query = filters.query.trim().toLowerCase();
  if (query && !['weight', String(record.weight ?? ''), record.notes || ''].join(' ').toLowerCase().includes(query)) return false;
  return true;
}

/* HISTORY render window (reliability audit 2026-10-14, item 7):
 * HISTORY used to materialize EVERY record on every render — 5,000
 * records cost ~5 s and ~47,000 DOM descendants on first navigation,
 * and the hidden weight list was rebuilt inside the timeline render
 * too. The views now render a bounded window (SHOW MORE grows it),
 * the timeline projection is memoized per data signature, and the
 * constellation reuses the render's own timeline instead of building
 * a second one. Visible behavior at small histories is unchanged:
 * everything fits in the first window. */
const HISTORY_PAGE_SIZE = 50;

function historyScopeKey() {
  const f = moduleState.shotFilters;
  return [moduleState.historyType, moduleState.shotHistoryView, f.medication, f.site, f.range, f.query].join('|');
}

function historyWindow(total) {
  const scope = historyScopeKey();
  if (moduleState.historyLimitScope !== scope) {
    moduleState.historyLimitScope = scope;
    moduleState.historyLimit = HISTORY_PAGE_SIZE;
  }
  return Math.min(moduleState.historyLimit, total);
}

function historyMoreHtml(shown, total) {
  if (shown >= total) return '';
  return `<div class="gn-history-more"><div class="gn-history-count">${tx('history.showingOf', 'SHOWING {shown} OF {total}', { shown, total })}</div><button type="button" class="btn-full btn-secondary" id="gnHistoryMore">${tx('history.showMore', 'SHOW MORE RECORDS')}</button></div>`;
}

function wireHistoryMore() {
  $('gnHistoryMore')?.addEventListener('click', () => {
    moduleState.historyLimit += HISTORY_PAGE_SIZE;
    renderShots();
  });
}

/* Constellation click-through: cards are keyed by timeline id, so a
 * node reveals ITS record — growing the window first when the record
 * sits beyond it. (The old index-based mapping pointed at the wrong
 * card whenever the timeline exceeded the node count.) */
function revealHistoryRecord(key, orderedEvents) {
  const idx = orderedEvents.findIndex(event => event.id === key);
  if (idx >= 0 && moduleState.historyLimit <= idx) {
    moduleState.historyLimit = Math.ceil((idx + 1) / HISTORY_PAGE_SIZE) * HISTORY_PAGE_SIZE;
    renderShots();
  }
  const card = document.querySelector(`#logList [data-history-key="${key}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.outline = '2px solid #00d4ff';
    setTimeout(() => { card.style.outline = ''; }, 1500);
  }
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

/* TRACK C: HISTORY gets the same honest sync states as TODAY (S1 in
   02-dashboard). A cloud user whose records have not arrived yet must
   never see the first-run pitch or a fake "nothing logged" empty. */
/* NODKI empty-state host: his welcome pose replaces the generic icon on
 * first-run empties while the companion is enabled (gn_nodki_v1). */
function nodkiEmptyIcon() {
  let on = true;
  try { on = localStorage.getItem('gn_nodki_v1') !== 'off'; } catch (_) {}
  return on ? '<img class="gn-nodki-empty" src="assets/mascot/nodki-pose-welcome.webp" alt="" width="72" height="72" decoding="async">' : '<span class="empty-ico"><span class="gn-icon gn-icon-lg gn-icon-hud gn-accent-c"><svg><use href="#gn-protocol-event"></use></svg></span></span>';
}

function historySyncMode(totalRecords) {
  if (totalRecords > 0) return null;
  /* CLARITY PASS (P1): gate on state.cloud, not session id + client
     presence — both exist in local mode (see 02-dashboard). */
  const cloudUser = Boolean(state.cloud && state.session?.user?.id);
  if (!cloudUser || state.cloudHydration === 'ok') return null;
  return state.cloudHydration === 'failed' ? 'failed' : 'syncing';
}
function historySyncMarkup(mode) {
  if (mode === 'failed') return `<div class="gn-ux-sync-error" role="alert"><b>${tx('dashboard.syncFailedTitle', "COULDN'T REACH YOUR DATA")}</b>${tx('dashboard.syncFailedSub', 'Your cloud records didn\u2019t load. Your data is safe \u2014 check your connection and try again.')}<br><button type="button" class="btn-full btn-secondary empty-cta" onclick="retryCloudHydration()">${tx('dashboard.retrySync', 'RETRY SYNC')}</button></div>`;
  return `<div class="gn-skeleton-list" role="status" aria-label="${tx('dashboard.syncingTitle', 'PULLING YOUR GRID FROM THE CLOUD')}"><div class="gn-skeleton-card"><div class="gn-skeleton gn-skeleton-line mid"></div><div class="gn-skeleton gn-skeleton-line short"></div></div><div class="gn-skeleton-card"><div class="gn-skeleton gn-skeleton-line mid"></div><div class="gn-skeleton gn-skeleton-line short"></div></div></div>`;
}

function renderShots() {
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
  /* A1: the filter bar belongs to SHOTS and to ALL (the default view). Before,
     it only existed inside SHOTS, so finding a past record from the default
     ALL view meant switching subviews first — an extra step with no signpost.
     WEIGHT keeps its own simple list, so filters stay hidden there. */
  if (historyType !== 'weight') ensureShotHistoryFilters();
  const existingFilters = $('gnShotFilters');
  if (existingFilters) existingFilters.hidden = historyType === 'weight';
  if (historyType === 'weight') { renderWeightHistory(); return; }
  if (historyType === 'all') { renderShotFilterOptions(getAllShots()); renderAllHistory(); return; }
  const list = $('logList');
  if (!list) return;
  const all = getAllShots();
  const visible = filterShots(all.filter(record => moduleState.shotHistoryView === 'archived' ? record.archived : !record.archived).sort((a, b) => new Date(b.date) - new Date(a.date)));
  renderShotFilterOptions(all);
  installCustomPickers(document);
  /* Item 7 hygiene: this listener used to be registered AGAIN on
   * every SHOTS render, stacking a full picker rebuild per render.
   * It is render-independent — wire it once. */
  if (!renderShots.langChangeWired) {
    renderShots.langChangeWired = true;
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
  }
  syncCustomPickers($('gnShotFilters') || document);
  setText('shotHistoryHelper', moduleState.shotHistoryView === 'archived' ? tx('shots.archivedRetained', 'Archived records remain stored for review and can be restored.') : tx('shots.activeRecordsRetained', 'Active SHOT records are retained in your local VAULT.'));
  qa('[data-shot-history-view]').forEach(button => button.classList.toggle('active', button.dataset.shotHistoryView === moduleState.shotHistoryView));
  if (!visible.length) {
    const syncMode = historySyncMode(all.length);
    if (syncMode) { list.innerHTML = historySyncMarkup(syncMode); return; }
    const activeFilters = Object.values(moduleState.shotFilters).some(value => value && value !== 'all');
    /* QA 2026-09-17: an empty ARCHIVED tab with active history behind it is
     * not a first run — show a neutral archived state, never the
     * "log your first shot" pitch. */
    if (!activeFilters && moduleState.shotHistoryView === 'archived' && all.some(record => !record.archived)) {
list.innerHTML = `<div class="empty gn-first-run-card">${nodkiEmptyIcon()}<b class="gn-first-run-title">${tx('shots.noArchivedShots', 'NO ARCHIVED SHOTS')}</b><span class="gn-first-run-sub">${tx('shots.noArchivedHint', 'Archived shots rest here. Archive a shot from your active history to tuck it away without deleting it.')}</span><br><button class="btn-full btn-secondary empty-cta" type="button" data-shot-history-view="active">${tx('shots.viewActive', 'VIEW ACTIVE SHOTS')}</button></div>`;
      return;
    }
    /* QA 2026-09-18: an empty ACTIVE tab with everything archived is not a
     * first run either — show a neutral state with a path to the archive,
     * never the "log your first shot" pitch. */
    if (!activeFilters && moduleState.shotHistoryView !== 'archived' && all.some(record => record.archived)) {
      list.innerHTML = `<div class="empty gn-first-run-card">${nodkiEmptyIcon()}<b class="gn-first-run-title">${tx('shots.noActiveShots', 'NO ACTIVE SHOTS')}</b><span class="gn-first-run-sub">${tx('shots.noActiveHint', 'Every shot is archived. Restore one from the archive to bring it back, or log a new shot.')}</span><br><button class="btn-full btn-secondary empty-cta" type="button" data-shot-history-view="archived">${tx('shots.viewArchive', 'VIEW ARCHIVE')}</button></div>`;
      return;
    }
    list.innerHTML = `<div class="empty${activeFilters ? '' : ' gn-first-run-card'}">${nodkiEmptyIcon()}<b class="gn-first-run-title">${activeFilters ? tx('shots.noFilterMatch', 'NO SHOTS MATCH THESE FILTERS.') : moduleState.shotHistoryView === 'archived' ? tx('shots.noArchivedShots', 'NO ARCHIVED SHOTS') : tx('shots.activateYourGrid', 'LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID')}</b>${activeFilters ? '<br><button class="btn-full btn-secondary empty-cta" type="button" id="gnShotFilterEmptyClear">' + tx('shots.clearFilters', 'CLEAR FILTERS') + '</button>' : '<span class="gn-first-run-sub">' + (moduleState.shotHistoryView === 'archived' ? tx('shots.noArchivedHint', 'Archived shots rest here. Archive a shot from your active history to tuck it away without deleting it.') : tx('shots.firstShotSub', 'One shot unlocks the Phase Engine, RESULTS, and your full dashboard.')) + '</span><br><button class="btn-full btn-primary empty-cta" type="button" data-empty-shot>' + tx('shots.logYourFirst', 'LOG YOUR FIRST SHOT') + '</button>'}</div>`;
    $('gnShotFilterEmptyClear')?.addEventListener('click', () => { moduleState.shotFilters = { medication: '', site: '', range: 'all', query: '' }; renderShots(); });
    return;
  }
  const windowSize = historyWindow(visible.length);
  list.innerHTML = visible.slice(0, windowSize).map(record => shotCardHtml(record, Boolean(record.archived))).join('') + historyMoreHtml(windowSize, visible.length);
  wireHistoryMore();
}

function shotCardHtml(record, archived) {
    return `<article class="log-entry ${archived ? 'archived archived-record' : ''}" data-history-key="shot:${safeText(record.id)}">
      <div class="log-main"><div><div class="log-date">${archived ? tx('shots.archivedPrefix', 'ARCHIVED') + ' ' : ''}${safeText(formatDateTime(record.date))}</div><div class="log-med">${safeText(medicationLabel(record.med))}</div></div>
      <div class="log-dose">${safeText(record.dose || '—')}mg</div></div>
      <div class="log-chips">${record.site ? `<span class="log-chip lc-site">${safeText(zoneLabel(record.site))}</span>` : ''}${record.deviceId ? `<span class="log-chip lc-site">${tx('shot.deviceUsed', 'DEVICE')}: ${safeText(deviceLabel(record.deviceId) || tx('runtime.notAvailable', 'NOT AVAILABLE'))}</span>` : ''}${record.wt ? `<span class="log-chip lc-wt">${safeText(record.wt)}lb</span>` : ''}${record.se?.length ? `<span class="log-chip lc-se">${safeText(record.se.map(sideEffectLabel).join(', '))}</span>` : ''}</div>
      ${record.notes ? `<div class="log-notes">${safeText(record.notes)}</div>` : ''}
      <div class="log-actions ${archived ? 'archive-actions' : ''}">${archived ? `<button type="button" class="log-action-btn restore archived-action-btn" data-shot-action="restore-edit" data-shot-id="${safeText(record.id)}"><span class="archive-action-main">${tx('shots.restore', 'RESTORE')}</span><span class="archive-action-sub">${tx('shots.restoreToEdit', 'RESTORE TO EDIT')}</span></button><button type="button" class="log-action-btn del archived-action-btn" data-shot-action="delete" data-shot-id="${safeText(record.id)}"><span class="archive-action-main">${tx('deletePerm.confirm', 'DELETE RECORD')}</span><span class="archive-action-sub">${tx('shots.deletePermanently', 'DELETE PERMANENTLY')}</span></button>` : `<button type="button" class="log-action-btn" data-shot-action="edit" data-shot-id="${safeText(record.id)}">${tx('shots.edit', 'EDIT')}</button><button type="button" class="log-action-btn del" data-shot-action="archive" data-shot-id="${safeText(record.id)}">${tx('shots.archive', 'ARCHIVE')}</button>`}</div>
      ${archived ? `<div class="shot-history-helper">${tx('shots.archivedRestoreNote', 'Restore the record before editing.')}</div>` : ''}
    </article>`;
}

function setShotHistoryView(view) {
  moduleState.shotHistoryView = view === 'archived' ? 'archived' : 'active';
  renderShots();
}

function setHistoryType(type) {
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
  return `<article class="log-entry gn-weight-entry" data-history-key="weight:${safeText(record.id)}">
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
  const windowSize = historyWindow(weights.length);
  list.innerHTML = weights.slice(0, windowSize).map(record => weightCardHtml(record)).join('') + historyMoreHtml(windowSize, weights.length);
  wireHistoryMore();
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

/* Memoized per data signature (item 7): one normalized/sorted
 * timeline per data state, reused by the list render AND the
 * constellation instead of a fresh full sort per consumer per render.
 * The signature is (counts, newest modifiedAt, archived flag) — every
 * mutation path stamps modifiedAt, so a stale memo cannot survive an
 * edit, and undo/redo restore whole snapshots whose signature matches
 * their own content. */
let timelineCache = { sig: '', events: null };

function buildTimeline(options = {}) {
  const includeArchived = Boolean(options.includeArchived);
  const allShots = getAllShots();
  const allWeights = getWeights();
  let maxModified = 0;
  for (const record of allShots) { const ms = Date.parse(record?.modifiedAt || record?.createdAt || ''); if (Number.isFinite(ms) && ms > maxModified) maxModified = ms; }
  for (const record of allWeights) { const ms = Date.parse(record?.modifiedAt || record?.createdAt || ''); if (Number.isFinite(ms) && ms > maxModified) maxModified = ms; }
  const sig = `${includeArchived ? 'arch' : 'act'}|${allShots.length}|${allWeights.length}|${maxModified}`;
  if (timelineCache.sig === sig && timelineCache.events) return timelineCache.events;
  const shots = allShots.filter(record => includeArchived || !record.archived);
  const weights = allWeights.filter(record => record && Number.isFinite(Number(record.weight)));
  const events = [
    ...shots.map(record => toTimelineEvent(record, 'shot')),
    ...weights.map(record => toTimelineEvent(record, 'weight'))
  ].sort(compareTimelineEvents);
  timelineCache = { sig, events };
  return events;
}

/* Shot Constellation Timeline: visual event map above the history list.
 * Item 7: consumes the render's own (memoized, filtered) timeline —
 * no second buildTimeline() per render — and maps nodes to records by
 * timeline id instead of by child index. */
function renderConstellation(orderedEvents) {
  var el = document.getElementById('gnConstellation');
  if (!el) return;
  try {
    var events = (orderedEvents || []).slice().reverse(); // oldest first for left-to-right
    if (events.length < 2) { el.hidden = true; return; }
    el.hidden = false;
    var nodes = document.getElementById('gnConstellationNodes');
    if (!nodes) return;
    var times = events.map(function(e){ return new Date(e.record.date || e.record.createdAt || 0).getTime(); }).filter(function(t){ return !Number.isNaN(t); });
    if (!times.length) { el.hidden = true; return; }
    var mn = Math.min.apply(null, times), mx = Math.max.apply(null, times), span = (mx - mn) || 1;
    // vertical lane by type: shots center, weights upper, labs lower
    nodes.innerHTML = events.slice(-40).map(function(e){
      var t = new Date(e.record.date || e.record.createdAt || 0).getTime();
      var x = ((t - mn) / span * 96 + 2).toFixed(2);
      var lane = e.type === 'shot' ? '50%' : (e.type === 'weight' ? '28%' : '72%');
      var cls = e.type === 'shot' ? 'shot' : (e.type === 'weight' ? 'weight' : 'lab');
      return '<div class="gn-const-node ' + cls + '" style="left:' + x + '%;top:' + lane + '" data-const-key="' + e.id + '" title="' + e.type + '" role="button" tabindex="0" aria-label="' + e.type + ' event"></div>';
    }).join('');
    nodes.querySelectorAll('.gn-const-node').forEach(function(n){
      n.addEventListener('click', function(){
        revealHistoryRecord(n.dataset.constKey, orderedEvents);
      });
    });
  } catch (_) { el.hidden = true; }
}

/* S5: ALL subview — renders the TimelineEvent union, newest first. */
function renderAllHistory() {
  const list = $('logList');
  if (!list) return;
  const allEvents = buildTimeline();
  const events = historyFiltersActive()
    ? allEvents.filter(event => event.type === 'shot' ? shotMatchesFilters(event.record) : weightMatchesFilters(event.record))
    : allEvents;
  if (!events.length && allEvents.length && historyFiltersActive()) {
    list.innerHTML = `<div class="empty">${nodkiEmptyIcon()}<b class="gn-first-run-title">${tx('shots.noFilterMatch', 'NO SHOTS MATCH THESE FILTERS.')}</b><br><button class="btn-full btn-secondary empty-cta" type="button" id="gnShotFilterEmptyClear">${tx('shots.clearFilters', 'CLEAR FILTERS')}</button></div>`;
    $('gnShotFilterEmptyClear')?.addEventListener('click', () => { moduleState.shotFilters = { medication: '', site: '', range: 'all', query: '' }; renderShots(); });
    return;
  }
  if (!events.length) {
    const syncMode = historySyncMode(allEvents.length);
    if (syncMode) { list.innerHTML = historySyncMarkup(syncMode); return; }
    list.innerHTML = `<div class="empty gn-first-run-card">${nodkiEmptyIcon()}<b class="gn-first-run-title">${tx('history.allEmptyTitle', 'NOTHING LOGGED YET')}</b><span class="gn-first-run-sub">${tx('history.allEmptySub', 'Log a shot or your weight to start your timeline.')}</span><br><button class="btn-full btn-primary empty-cta" type="button" data-empty-shot>${tx('runtime.logShot', 'LOG SHOT')}</button><br><button class="gn-ux-empty-link" type="button" onclick="openWeightModal()">${tx('history.logWeightInstead', 'or log your weight instead')}</button></div>`;
    return;
  }
  renderConstellation(events);
  const windowSize = historyWindow(events.length);
  list.innerHTML = events.slice(0, windowSize).map(event => event.type === 'shot'
    ? shotCardHtml(event.record, false)
    : weightCardHtml(event.record, event.datePrecision)).join('') + historyMoreHtml(windowSize, events.length);
  wireHistoryMore();
}
/* v0.15.19 SKIN TONE REMOVED - synthetic biotech scanner, single body per mode */
function scannerSkinTone() { return null; }

/* v0.15.19 SKIN TONE REMOVED - synthetic biotech scanner, single body per mode */
function setScannerSkinTone(tone, button) {
  /* no-op: skin-tone selector is dead in v0.15.19 */
  try { localStorage.removeItem('gn_scanner_skin_tone'); } catch (e) {}
}

/* v0.15.19 INTENSITY REMOVED - single body per mode, no 9-state map */
function scannerIntensityForMode(mode) { return null; }

function setScannerMode(mode, button) {
  moduleState.scannerMode = ZONES[mode] ? mode : 'core';
  /* v1.1.4 — selection tick from the tactile engine, inside the tap. */
  try { window.GN_HAPTICS?.fire('tick'); } catch (_) {}
  /* v0.15.19 - drive .biotech-stage SVG architecture */
  qa('.scanner-mode-btn').forEach(item => {
    const active = item === button || item.dataset.mode === moduleState.scannerMode;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', active ? 'true' : 'false');
    item.setAttribute('aria-selected', active ? 'true' : 'false');
    item.setAttribute('tabindex', active ? '0' : '-1');
  });
  clearScannerTransientState();
  /* toggle .biotech-stage visibility - one stage per mode */
  qa('.biotech-stage').forEach(stage => {
    const isActive = stage.dataset.view === moduleState.scannerMode;
    stage.hidden = !isActive;
    stage.classList.toggle('active', isActive);
    if (isActive) {
      /* re-trigger scanline sweep on stage entry */
      const scan = stage.querySelector('.biotech-scanline');
      if (scan) {
        scan.classList.remove('sweep');
        void scan.offsetWidth;
        scan.classList.add('sweep');
      }
    }
  });
  /* navel keep-out legend is CORE-only: hide it on LEGS and ARMS views */
  qa('.scanner-keepout-legend').forEach(legend => {
    legend.hidden = moduleState.scannerMode !== 'core';
  });
  setText('scannerModeLabel', tx('shots.trackableZones', 'TRACKABLE {zone} ZONES', { zone: scannerModeLabel(moduleState.scannerMode) }));
  const helper = document.querySelector('#shotsRegionScanner .asset-helper');
  if (helper) {
    /* v0.15.19 - GRID//NODE biotech microcopy */
    const help = {
      core: tx('shots.coreHint', 'ZONE//CORE - Tap a quadrant around the navel. Center excluded.'),
      lower: tx('shots.legsHint', 'ZONE//LEGS - Tap the upper or lower front-thigh zone.'),
      upper: tx('shots.armsHint', 'ZONE//ARMS - Tap a triceps zone above the elbow. Rear view.')
    };
    helper.textContent = help[moduleState.scannerMode] || help.core;
  }
  installScannerPointerHandlers();
  renderScanner();
}


function selectScannerLocation(label, options = {}) {
  const { source = 'programmatic', feedback = source !== 'programmatic' } = options;
  try {
    localStorage.setItem('gn_scanner_hint_shown', '1');
    const cap = document.querySelector('.gn-zone-hint-caption');
    if (cap) cap.remove();
    document.querySelectorAll('.gn-zone-hint').forEach(el => el.classList.remove('gn-zone-hint'));
  } catch (e) {}
  moduleState.selectedLocation = label;
  S.set('selectedLocation', label);
  queueCloudSync('workspace');
  renderScanner();
  const panel = document.querySelector('#shotsRegionScanner .scanner-selected-panel');
  if (panel) {
    panel.classList.add('gn-zone-confirmed');
    clearTimeout(panel._confirmTimer);
    panel._confirmTimer = setTimeout(() => panel.classList.remove('gn-zone-confirmed'), 900);
    let lock = panel.querySelector('.gn-location-lock');
    if (!lock) {
      lock = document.createElement('div');
      lock.className = 'gn-location-lock';
      lock.setAttribute('role', 'status');
      lock.setAttribute('aria-live', 'polite');
      panel.insertBefore(lock, panel.firstChild);
    }
    lock.innerHTML = `<small>${tx('shots.locationLocked', 'LOCATION//LOCKED')}</small><span>${safeText(zoneLabel(label))}</span>`;
    lock.classList.add('is-on');
  }
  /* v0.15.19 - drive SVG .zone-path rects; add .zone-acquiring pulse */
  qa('#shotsRegionScanner .zone-path').forEach(path => {
    const on = path.getAttribute('data-site') === label;
    path.classList.toggle('selected', on);
    path.classList.toggle('selected-active', on);
    if (on) {
      path.classList.remove('zone-acquiring');
      void path.getBoundingClientRect();
      path.classList.add('zone-acquiring');
      setTimeout(() => path.classList.remove('zone-acquiring'), 480);
    }
  });
  if (feedback) {
    /* v1.1.4 — site lock signature from the tactile engine, fired
       synchronously inside the zone-tap handler. */
    try { window.GN_HAPTICS?.fire('lock'); } catch (_) {}
  }
  if ($('logOv')?.classList.contains('active')) {
    setText('modalSelectedLocation', zoneLabel(label));
  }
}

const scannerPointerStates = new WeakMap();

function renderScanner() {
  try {
    if (!localStorage.getItem('gn_scanner_hint_shown')) {
      setTimeout(() => {
        if (localStorage.getItem('gn_scanner_hint_shown')) return;
        /* v0.15.19 - hint targets the first zone-path in the active stage */
        const zone = document.querySelector('#shotsRegionScanner .biotech-stage:not([hidden]) .zone-path');
        if (zone && !zone.classList.contains('gn-zone-hint')) {
          zone.classList.add('gn-zone-hint');
          const cap = document.createElement('div');
          cap.className = 'gn-zone-hint-caption';
          cap.textContent = tx('scanner.tapZoneHint', 'TAP A ZONE');
          zone.parentElement?.parentElement?.insertBefore(cap, zone.parentElement);
        }
      }, 700);
    }
  } catch (e) {}

  const panel = document.querySelector('#shotsRegionScanner .scanner-selected-panel');
  if (!panel) return;
  const scanner = document.querySelector('#shotsRegionScanner .site-scanner');
  scanner?.setAttribute('aria-label', tx('shots.scannerAria', 'GRID//NODE user-entered location scanner'));
  qa('#shotsRegionScanner .biotech-stage').forEach(stage => {
    const mode = stage.dataset.view || 'core';
    const modeLabel = scannerModeLabel(mode);
    stage.setAttribute('aria-label', tx('shots.scannerPanelAria', '{mode} location scanner', { mode: modeLabel }));
    stage.querySelector('.biotech-zones')?.setAttribute('aria-label', tx('shots.scannerZonesAria', '{mode} tracking zones', { mode: modeLabel }));
    qa('.zone-path', stage).forEach(path => path.setAttribute('aria-label', zoneLabel(path.getAttribute('data-site'))));
  });
  let picker = panel.querySelector('.gn-stable-zone-picker');
  if (!picker) { picker = document.createElement('div'); picker.className = 'gn-stable-zone-picker'; panel.appendChild(picker); }
  picker.innerHTML = `<div class="gn-stable-zone-title">${tx('shots.trackableZones', 'TRACKABLE {zone} ZONES', { zone: scannerModeLabel(moduleState.scannerMode) })}</div>${ZONES[moduleState.scannerMode].map(label => `<button type="button" class="gn-stable-zone-btn ${label === moduleState.selectedLocation ? 'selected' : ''}" data-stable-zone="${safeText(label)}" data-zone-key="${safeText(ZONE_IDS[label] || '')}" aria-pressed="${label === moduleState.selectedLocation ? 'true' : 'false'}">${safeText(zoneLabel(label))}</button>`).join('')}`;
  setText('scannerSelectedDisplay', zoneLabel(moduleState.selectedLocation) || tx('shots.noLocationSelected', 'No location selected'));
  const recent = sortedShots().slice(-6).reverse().map(item => item.site).filter(Boolean);
  const uniqRecent = [...new Set(recent)];
  const lastSite = uniqRecent[0] || '';
  setText('scannerHistoryDisplay', uniqRecent.length ? uniqRecent.slice(0, 4).map(zoneLabel).join(' · ') : tx('shots.noLoggedLocationYet', 'No logged location yet'));
  const lock = panel.querySelector('.gn-location-lock');
  if (lock && moduleState.selectedLocation) {
    lock.innerHTML = `<small>${tx('shots.locationLocked', 'LOCATION//LOCKED')}</small><span>${safeText(zoneLabel(moduleState.selectedLocation))}</span>`;
    lock.classList.add('is-on');
  } else if (lock) {
    lock.classList.remove('is-on');
  }
  /* v0.15.19 - drive .zone-path SVG rects in the active .biotech-stage */
  qa('#shotsRegionScanner .biotech-stage:not([hidden]) .zone-path').forEach(path => {
    const site = path.getAttribute('data-site');
    const isSel = site === moduleState.selectedLocation;
    path.classList.toggle('selected', isSel);
    path.classList.toggle('selected-active', isSel);
    path.classList.toggle('last', Boolean(lastSite && site === lastSite && site !== moduleState.selectedLocation));
    path.classList.toggle('recent', Boolean(site && uniqRecent.includes(site) && site !== lastSite && site !== moduleState.selectedLocation));
    path.classList.toggle('is-dim', Boolean(moduleState.selectedLocation && !isSel));
    path.setAttribute('aria-pressed', isSel ? 'true' : 'false');
  });
  /* v0.15.19 - no skin-tone asset sync. Single body per mode. Image already set in HTML. */
}


/* v0.15.19 SCANNER POINTER + HIT-TEST ENGINE */
function pointerToSvgPoint(svg, clientX, clientY) {
  const point = (typeof DOMPoint === "function") ? new DOMPoint(clientX, clientY) : { x: clientX, y: clientY, matrixTransform: function(m) { return { x: clientX * m.a + m.e, y: clientY * m.d + m.f }; } };
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  return point.matrixTransform(ctm.inverse());
}

function hitTestScannerZone(svg, clientX, clientY) {
  const sp = pointerToSvgPoint(svg, clientX, clientY);
  if (!sp) return null;
  /* Try native path.isPointInFill first */
  const hitPaths = svg.querySelectorAll(".zone-hit");
  for (let i = 0; i < hitPaths.length; i++) {
    const p = hitPaths[i];
    if (typeof p.isPointInFill === "function") {
      try { if (p.isPointInFill(sp)) return p; } catch (e) {}
    }
  }
  /* CLARITY PASS (P6, 2026-10-14): second pass — stroke expansion. Every
     .zone-hit carries a transparent stroke-width sized so the smallest
     zones reach a >=44px effective tap target at phone widths (core
     Lower zones measured 22.6px high at 360px before this). The stroke
     is never painted — every state visual lives on the .zone-visible
     sibling — it only widens the tap area into the dead space around a
     zone. Exact fill hits always win (pass 1 above), so no existing
     hit changes; where two expansions contest dead space, DOM order
     decides, same as the pre-existing fill overlaps. */
  for (let i = 0; i < hitPaths.length; i++) {
    const p = hitPaths[i];
    if (typeof p.isPointInStroke === "function") {
      try { if (p.isPointInStroke(sp)) return p; } catch (e) {}
    }
  }
  /* Fallback: nearest zone by distance (should never trigger on real devices) */
  return null;
}

function installScannerPointerHandlers() {
  if (window.__gnScannerPointerInstalled) return;
  window.__gnScannerPointerInstalled = true;
  const TAP_THRESHOLD = 10; /* px */
  qa("#shotsRegionScanner .biotech-stage").forEach(stage => {
    const svg = stage.querySelector(".biotech-zones");
    if (!svg || svg.__gnPointerBound) return;
    svg.__gnPointerBound = true;
    const clearPointerState = (releaseCapture = true) => {
      const state = scannerPointerStates.get(svg);
      if (!state) return;
      if (state.candidate) state.candidate.classList.remove('pressed');
      if (releaseCapture && state.pointerId !== null) {
        try { svg.releasePointerCapture(state.pointerId); } catch (_) {}
      }
      scannerPointerStates.delete(svg);
    };
    svg.addEventListener("pointerdown", (e) => {
      if (stage.hidden) return;
      clearPointerState();
      const candidate = hitTestScannerZone(svg, e.clientX, e.clientY);
      const state = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        candidate,
        cancelled: !candidate
      };
      scannerPointerStates.set(svg, state);
      if (candidate) {
        try { svg.setPointerCapture(e.pointerId); } catch (_) {}
        candidate.classList.add("pressed");
      }
    }, { passive: true });
    svg.addEventListener("pointermove", (e) => {
      const state = scannerPointerStates.get(svg);
      if (!state || state.pointerId !== e.pointerId) return;
      const dx = e.clientX - state.startX, dy = e.clientY - state.startY;
      if (Math.hypot(dx, dy) > TAP_THRESHOLD) {
        state.cancelled = true;
        if (state.candidate) state.candidate.classList.remove("pressed");
      }
    }, { passive: true });
    function endPointer(e) {
      const state = scannerPointerStates.get(svg);
      if (!state || state.pointerId !== e.pointerId) return;
      const endpoint = hitTestScannerZone(svg, e.clientX, e.clientY);
      const candidate = state.candidate;
      const validTap = !state.cancelled && candidate && endpoint === candidate;
      const site = validTap ? candidate.getAttribute("data-site") : '';
      clearPointerState();
      if (site) selectScannerLocation(site, { source: 'pointer' });
    }
    svg.addEventListener("pointerup", endPointer, { passive: true });
    svg.addEventListener("pointercancel", () => clearPointerState(), { passive: true });
    svg.addEventListener("lostpointercapture", () => clearPointerState(false), { passive: true });
    /* Keyboard a11y */
    qa("#shotsRegionScanner .zone-path").forEach(zp => {
      if (zp.__gnKeyBound) return;
      zp.__gnKeyBound = true;
      zp.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          const site = zp.getAttribute("data-site");
          if (site) {
            selectScannerLocation(site, { source: 'keyboard' });
          }
        }
      });
    });
  });
}

function clearScannerTransientState() {
  qa('#shotsRegionScanner .zone-path.pressed, #shotsRegionScanner .zone-path.zone-acquiring')
    .forEach(path => path.classList.remove('pressed', 'zone-acquiring'));
}

/* v0.15.19 SCANNER DEBUG MODE - ?scannerDebug=1 */
function installScannerDebugMode() {
  if (!/[?&]scannerDebug=1\b/.test(location.search)) return;
  qa("#shotsRegionScanner .zone-path").forEach(zp => {
    zp.classList.add("debug-on");
  });
  document.addEventListener("pointermove", (e) => {
    const svg = (e.target && e.target.closest && e.target.closest(".biotech-zones")) || null;
    if (!svg) return;
    const sp = pointerToSvgPoint(svg, e.clientX, e.clientY);
    if (!sp) return;
    let zoneId = "none", matches = 0;
    qa(svg, ".zone-hit").forEach(p => {
      if (typeof p.isPointInFill === "function") {
        try { if (p.isPointInFill(sp)) { matches++; zoneId = p.getAttribute("data-site") || zoneId; } } catch (err) {}
      }
    });
    let dbg = document.getElementById("__gnScannerDebug");
    if (!dbg) {
      dbg = document.createElement("pre");
      dbg.id = "__gnScannerDebug";
      dbg.style.cssText = "position:fixed;bottom:80px;left:8px;z-index:99999;background:rgba(0,0,0,0.85);color:#06BBE3;font:11px monospace;padding:6px 8px;border:1px solid #06BBE3;border-radius:4px;pointer-events:none;white-space:pre;";
      document.body.appendChild(dbg);
    }
    dbg.textContent = "SCREEN " + Math.round(e.clientX) + "," + Math.round(e.clientY) + "\nSVG " + Math.round(sp.x) + "," + Math.round(sp.y) + "\nZONE " + zoneId + "\nMATCHES " + matches;
  }, { passive: true });
}
;(function(){var m={renderShots:renderShots,setShotHistoryView:setShotHistoryView,setHistoryType:setHistoryType,scannerSkinTone:scannerSkinTone,setScannerSkinTone:setScannerSkinTone,setScannerMode:setScannerMode,selectScannerLocation:selectScannerLocation,renderScanner:renderScanner};if(window.GNRegisterChunk){window.GNRegisterChunk('history',m);}else if(window.GNModules){Object.assign(window.GNModules,m);}})();
