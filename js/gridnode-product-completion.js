/* GRID//NODE product completion layer.
 * Keeps the protected .36 bundle intact while adding focused, local-first UI
 * behavior that can be reviewed and removed independently.
 */
(function productCompletion() {
  'use strict';

  const $ = id => document.getElementById(id);
  const q = (selector, root = document) => [...root.querySelectorAll(selector)];
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dayMs = 86400000;
  const weekMs = 7 * dayMs;

  function store() { return window.GN?.S; }
  function records(key) { const value = store()?.get?.(key, []); return Array.isArray(value) ? value : []; }
  function activeShots() { return records('shots').filter(item => !item?.archived && Number.isFinite(new Date(item?.date).getTime())).sort((a, b) => new Date(a.date) - new Date(b.date)); }
  function weights() { return records('weights').filter(item => Number.isFinite(Number(item?.weight)) && Number.isFinite(new Date(item?.date).getTime())).sort((a, b) => new Date(a.date) - new Date(b.date)); }
  function localDate(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; }
  function dateLabel(value) { const date = localDate(value); return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'; }
  function formatSince(value) {
    const date = localDate(value); if (!date) return '—';
    const elapsed = Math.max(0, Date.now() - date.getTime());
    if (elapsed < dayMs) return `${Math.max(1, Math.floor(elapsed / 3600000))}h`;
    return `${Math.floor(elapsed / dayMs)}d`;
  }

  function renderStreak() {
    const node = $('streakText'); if (!node) return;
    const shots = activeShots();
    if (!shots.length) { node.textContent = 'NO SHOT CADENCE YET · LOG YOUR FIRST SHOT'; return; }
    if (shots.length === 1) { node.textContent = '1 SHOT LOGGED · LOG ANOTHER TO ESTABLISH CADENCE'; return; }
    // Cadence = observed median gap between consecutive shots, in days.
    // Honest reporting: shows the actual rhythm, not a stretched streak.
    const gaps = [];
    for (let index = 1; index < shots.length; index += 1) {
      const delta = (new Date(shots[index].date).getTime() - new Date(shots[index - 1].date).getTime()) / dayMs;
      if (Number.isFinite(delta) && delta >= 0) gaps.push(delta);
    }
    if (!gaps.length) {
      node.textContent = `${shots.length} SHOTS LOGGED · KEEP A REGULAR TIMELINE`;
      return;
    }
    const sorted = gaps.slice().sort((a, b) => a - b);
    const mid = sorted.length / 2;
    // True median: average the two middle values for even-length arrays,
    // not the upper bound. e.g. gaps [6, 8] -> 7, not 8.
    const medianDays = sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[Math.floor(mid)];
    const labelCount = `${shots.length} SHOT${shots.length === 1 ? '' : 'S'}`;
    // 0D median means same-day shots. Don't show '0D MEDIAN GAP' to the user;
    // describe what actually happened in their record instead.
    node.textContent = medianDays === 0
      ? `CADENCE · SAME-DAY · ${labelCount} LOGGED`
      : `CADENCE · ${medianDays}D MEDIAN GAP · ${labelCount} LOGGED`;
  }

  function drawWeightChart() {
    const canvas = $('wtChart');
    if (!canvas) return;
    const data = weights();
    const goal = Number(window.GN?.S?.get?.('profile', {})?.goalWt);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, Math.round(rect.width || canvas.parentElement?.clientWidth || 320));
    const height = Math.max(180, Math.round(rect.height || 220));
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) { canvas.width = width * ratio; canvas.height = height * ratio; }
    const context = canvas.getContext('2d'); if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
    const summary = $('weightTrendChartSummary');
    if (!data.length) { if (summary) summary.textContent = 'Log weight to build your trend.'; return; }
    const left = 40, right = 12, top = 18, bottom = 30;
    const plotWidth = Math.max(1, width - left - right), plotHeight = Math.max(1, height - top - bottom);
    const values = data.map(item => Number(item.weight));
    const minValue = Math.min(...values, Number.isFinite(goal) && goal > 0 ? goal : Infinity);
    const maxValue = Math.max(...values, Number.isFinite(goal) && goal > 0 ? goal : -Infinity);
    const pad = Math.max(1, (maxValue - minValue || 1) * 0.16), min = minValue - pad, max = maxValue + pad, span = max - min || 1;
    const x = index => data.length === 1 ? left + plotWidth / 2 : left + index / (data.length - 1) * plotWidth;
    const y = value => top + (max - Number(value)) / span * plotHeight;
    context.font = '10px Share Tech Mono, monospace'; context.textAlign = 'left'; context.fillStyle = '#8ea5ad'; context.strokeStyle = 'rgba(255,255,255,.11)'; context.lineWidth = 1;
    for (let index = 0; index <= 3; index += 1) { const rowY = top + plotHeight * index / 3; context.beginPath(); context.moveTo(left, rowY); context.lineTo(width - right, rowY); context.stroke(); context.fillText((max - span * index / 3).toFixed(1), 4, rowY + 3); }
    if (Number.isFinite(goal) && goal > 0) { context.save(); context.shadowColor = 'rgba(255,215,0,.35)'; context.shadowBlur = 6; context.setLineDash([6, 5]); context.strokeStyle = 'rgba(255,215,0,.58)'; context.lineWidth = 1.8; context.beginPath(); context.moveTo(left, y(goal)); context.lineTo(width - right, y(goal)); context.stroke(); context.setLineDash([]); context.shadowBlur = 0; context.strokeStyle = 'rgba(255,215,0,.15)'; context.lineWidth = 4; context.beginPath(); context.moveTo(left, y(goal)); context.lineTo(width - right, y(goal)); context.stroke(); context.restore(); context.fillStyle = '#ffd766'; context.font = 'bold 9px Share Tech Mono, monospace'; context.fillText(`GOAL ${goal.toFixed(1)}`, Math.max(left, width - 78), Math.max(12, y(goal) - 5)); }
    context.strokeStyle = '#00e6f0'; context.lineWidth = 2.5; context.shadowColor = '#00e6f0'; context.shadowBlur = 7; context.beginPath();
    values.forEach((value, index) => { const pointX = x(index), pointY = y(value); if (index === 0) context.moveTo(pointX, pointY); else context.lineTo(pointX, pointY); }); context.stroke(); context.shadowBlur = 0;
    context.fillStyle = '#00e6f0'; values.forEach((value, index) => { context.beginPath(); context.arc(x(index), y(value), 3.2, 0, Math.PI * 2); context.fill(); });
    // Moving end dot — GLAPP-style glow on the most recent data point
    if (data.length > 1) {
      const lastIdx = data.length - 1, lastX = x(lastIdx), lastY = y(values[lastIdx]);
      context.save();
      context.shadowColor = '#00e6f0'; context.shadowBlur = 22;
      context.fillStyle = '#00e6f0'; context.beginPath(); context.arc(lastX, lastY, 5.5, 0, Math.PI * 2); context.fill();
      context.shadowBlur = 0; context.strokeStyle = 'rgba(0,230,240,.28)'; context.lineWidth = 1.8;
      context.beginPath(); context.arc(lastX, lastY, 10, 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.arc(lastX, lastY, 18, 0, Math.PI * 2); context.stroke();
      context.restore();
    }
    const shotTimes = activeShots().map(item => localDate(item.date)?.getTime()).filter(Number.isFinite);
    shotTimes.forEach(time => { const nearest = data.reduce((best, item, index) => Math.abs(new Date(item.date).getTime() - time) < Math.abs(new Date(data[best].date).getTime() - time) ? index : best, 0); context.fillStyle = '#ff5577'; context.beginPath(); context.arc(x(nearest), y(values[nearest]), 5.5, 0, Math.PI * 2); context.fill(); });
    // GLAPP-style date labels — show a selection of reference dates along the x-axis
    context.font = '8px Share Tech Mono, monospace'; context.textAlign = 'center'; context.fillStyle = 'rgba(142,165,173,.55)';
    if (data.length <= 3) {
      // Sparse data: show every label
      data.forEach((item, index) => { if (index === 0 || index === data.length - 1) { context.fillText(dateLabel(item.date), x(index), height - 8); } });
    } else {
      // Dense data: show first, last, midpoint, and quarter marks
      const markers = [0, Math.floor(data.length * 0.25), Math.floor(data.length * 0.5), Math.floor(data.length * 0.75), data.length - 1];
      [...new Set(markers)].forEach(idx => { context.fillText(dateLabel(data[idx].date), x(idx), height - 8); });
    }
    context.textAlign = 'left';
    if (summary) summary.textContent = data.length < 2 ? 'One data point logged. Keep tracking to see direction.' : `Showing ${data.length} weight records · red markers are SHOT events${Number.isFinite(goal) && goal > 0 ? ` · goal ${goal.toFixed(1)} lb` : ''}.`;
    const direction = $('resWeightDirection');
    if (direction) { const delta = values.at(-1) - values[0]; const ready = data.length >= 2 && new Date(data.at(-1).date).getTime() - new Date(data[0].date).getTime() >= dayMs * 3; direction.textContent = ready ? `Trend direction: ${delta < -0.05 ? 'Downward' : delta > 0.05 ? 'Upward' : 'Stable'} across logged measurements` : 'Trend direction: INSUFFICIENT DATA'; direction.className = `results-direction ${ready && delta <= 0 ? 'good' : ready ? 'warn' : 'insufficient'}`; }
  }

  function renderProgressViews() {
    const page = $('pageResults'); if (!page || !$('weightRecordsPanel')) return;
    let section = $('gnProgressSignals');
    if (!section) { $('weightRecordsPanel').insertAdjacentHTML('afterend', '<section class="results-card gn-progress-signals" id="gnProgressSignals"><div class="results-card-title">PROGRESS SIGNALS</div><div class="results-card-sub">Only your own logged observations appear here.</div><div class="gn-progress-grid" id="gnProgressGrid"></div><div class="gn-phase-timeline" id="gnPhaseTimeline"></div></section>'); section = $('gnProgressSignals'); }
    const grid = $('gnProgressGrid'); if (!grid) return;
    const shots = activeShots(); const weightRows = weights(); const measurements = records('measurements'); const symptoms = records('symptoms');
    const sideEffects = shots.flatMap(item => Array.isArray(item.se) ? item.se : []); const observations = records('results').concat(records('notes'));
    const cards = [
      ['WEIGHT', weightRows.length ? `${Number(weightRows.at(-1).weight).toFixed(1)} lb` : 'NO DATA', weightRows.length > 1 ? `${weightRows.length} logged measurements` : 'Log another value for direction'],
      ['MEASUREMENTS', measurements.length ? `${measurements.length} values` : 'NO DATA', measurements.length ? 'Latest body measurements' : 'Add measurements from PROFILE'],
      ['SYMPTOMS', symptoms.length ? `${symptoms.length} entries` : 'NO DATA', symptoms.length ? 'User-entered symptom history' : 'No symptom records yet'],
      ['ENERGY / MOOD', observations.length ? `${observations.length} notes` : 'NO DATA', observations.length ? 'User-entered observations' : 'No observations yet'],
      ['SIDE EFFECTS', sideEffects.length ? `${sideEffects.length} logged` : 'NO DATA', sideEffects.length ? 'Attached to SHOT events' : 'No side effects attached'],
      ['TRACKING ACTIVITY', `${shots.length} SHOT${shots.length === 1 ? '' : 'S'}`, shots.length ? `Last ${formatSince(shots.at(-1).date)} ago` : 'Start with a SHOT']
    ];
    grid.innerHTML = cards.map(([label, value, note]) => `<article class="gn-progress-signal"><span>${safe(label)}</span><b>${safe(value)}</b><small>${safe(note)}</small></article>`).join('');
    const timeline = $('gnPhaseTimeline');
    if (timeline) timeline.innerHTML = shots.length ? `<div class="gn-progress-timeline-label">CYCLE / PHASE TIMELINE</div>${shots.slice(-6).reverse().map(item => `<div class="gn-progress-timeline-row"><i></i><span><b>${safe(dateLabel(item.date))}</b><small>${safe(item.med || 'SHOT')} · ${safe(item.dose ? String(item.dose) + ' mg' : 'dose not entered')}</small></span></div>`).join('')}</div>` : '<div class="gn-progress-empty">No SHOT timeline yet. Your cycle appears after the first logged event.</div>';
  }

  function enhanceInventory() {
    const form = $('gnInventoryForm');
    if (!form) return;
    if (!$('gnInventoryRemaining')) { const units = $('gnInventoryUnits')?.closest('label'); units?.insertAdjacentHTML('afterend', '<label>REMAINING AMOUNT<input id="gnInventoryRemaining" type="number" min="0" step="any" placeholder="Optional current amount"></label>'); }
    if (!form.dataset.completionBound) {
      form.dataset.completionBound = 'true';
      form.addEventListener('submit', () => {
        const name = $('gnInventoryName')?.value?.trim(); const value = $('gnInventoryRemaining')?.value?.trim();
        window.setTimeout(() => {
          const list = records('inventory'); const item = [...list].reverse().find(record => record.name === name);
          if (!item || value === '') return;
          item.remaining = Number(value); item.modifiedAt = new Date().toISOString(); item.history = [...(item.history || []), { at: item.modifiedAt, action: 'REMAINING UPDATED', source: 'Manual Entry' }]; store().set('inventory', list); window.GNModules?.refreshAll?.();
        }, 0);
      }, { capture: true });
    }
    const list = $('gnInventoryList'); if (!list || list.dataset.completionBound) return;
    list.dataset.completionBound = 'true';
    const decorate = () => {
      records('inventory').forEach(item => {
        const row = list.querySelector(`[data-inventory-edit="${CSS.escape(item.id)}"]`)?.closest('.gn-record-row');
        if (!row || row.querySelector('.gn-inventory-history')) return;
        const history = Array.isArray(item.history) ? item.history : [];
        const details = document.createElement('details'); details.className = 'gn-inventory-history'; details.innerHTML = `<summary>HISTORY${item.expires ? ` · BUD ${safe(dateLabel(item.expires))}` : ''}${item.remaining != null ? ` · REMAINING ${safe(item.remaining)}` : ''}</summary><div>${history.length ? history.slice().reverse().map(entry => `<span>${safe(dateLabel(entry.at))} · ${safe(entry.action || 'UPDATED')} · ${safe(entry.source || 'Manual Entry')}</span>`).join('') : '<span>No changes recorded yet.</span>'}</div>`; row.appendChild(details);
      });
    };
    const observer = new MutationObserver(decorate);
    observer.observe(list, { childList: true, subtree: true });
    decorate();
    list.addEventListener('click', event => {
      const button = event.target.closest('[data-inventory-edit]'); if (!button) return;
      const item = records('inventory').find(record => record.id === button.dataset.inventoryEdit);
      window.setTimeout(() => { if ($('gnInventoryRemaining')) $('gnInventoryRemaining').value = item?.remaining ?? ''; }, 0);
    }, { capture: true });
  }

  function ensurePreferences() {
    const page = $('pageProfile'); if (!page || $('gnPreferencesCard')) return;
    const anchor = document.querySelector('[data-gn-profile-hub]') || page.querySelector('.page-hdr'); if (!anchor) return;
    anchor.insertAdjacentHTML('afterend', `<section class="gn-preferences-card" id="gnPreferencesCard"><div class="gn-foundation-kicker">// PRIVATE PREFERENCES</div><h3>YOUR TRACKING SETTINGS</h3><p class="gn-measurements-copy">These choices stay local until you choose cloud sync.</p><div class="gn-preferences-grid"><label>TRACKED PROTOCOL<input id="gnPrefProtocol" placeholder="e.g. weekly GLP-1"></label><label>FREQUENCY (DAYS)<input id="gnPrefFrequency" type="number" min="1" max="90" inputmode="numeric"></label><label>START DATE<input id="gnPrefStartDate" type="date"></label><label>NOTIFICATION STYLE<select id="gnPrefNotifications"><option value="off">OFF</option><option value="local">LOCAL REMINDERS</option><option value="cloud">CLOUD REMINDERS</option></select></label><label class="gn-pref-wide">INJECTION-SITE PREFERENCES<input id="gnPrefSites" placeholder="User-entered sites, separated by commas"></label><label class="gn-pref-wide"><input id="gnPrefPrediction" type="checkbox"> SHOW EDUCATIONAL PREDICTION CONTEXT</label><label class="gn-pref-wide"><input id="gnPrefPrivacy" type="checkbox"> KEEP DATA LOCAL BY DEFAULT</label></div><button type="button" class="btn-full btn-primary" id="gnPreferencesSave">SAVE PREFERENCES</button><div class="gn-preferences-status" id="gnPreferencesStatus">LOCAL SETTINGS READY</div></section>`);
    const preferenceState = () => ({ ...records('preferences')[0], ...store().get('preferences', {}) });
    const hydrate = () => { const pref = preferenceState(); $('gnPrefProtocol').value = pref.protocol || store().get('profile', {})?.med || ''; $('gnPrefFrequency').value = pref.frequencyDays || store().get('profile', {})?.shotFrequency || ''; $('gnPrefStartDate').value = pref.startDate || ''; $('gnPrefNotifications').value = pref.notifications || 'off'; $('gnPrefSites').value = Array.isArray(pref.injectionSites) ? pref.injectionSites.join(', ') : pref.injectionSites || ''; $('gnPrefPrediction').checked = pref.predictions !== false; $('gnPrefPrivacy').checked = pref.localOnly !== false; };
    $('gnPreferencesSave').addEventListener('click', () => { const pref = { ...preferenceState(), protocol: $('gnPrefProtocol').value.trim(), frequencyDays: Number($('gnPrefFrequency').value) || null, startDate: $('gnPrefStartDate').value || '', notifications: $('gnPrefNotifications').value, injectionSites: $('gnPrefSites').value.split(',').map(value => value.trim()).filter(Boolean), predictions: $('gnPrefPrediction').checked, localOnly: $('gnPrefPrivacy').checked, modifiedAt: new Date().toISOString() }; store().set('preferences', pref); const profile = store().get('profile', {}); profile.shotFrequency = pref.frequencyDays; profile.protocolStartDate = pref.startDate; store().set('profile', profile); Promise.resolve(window.GN?.syncNow?.()).catch(() => null); $('gnPreferencesStatus').textContent = pref.localOnly ? 'SAVED LOCALLY · CLOUD SYNC OPTIONAL' : 'SAVED · SYNC FOLLOWS YOUR ACCOUNT'; });
    hydrate();
  }

  function installSwipeNavigation() {
    const root = document.querySelector('.app-shell') || document.body; if (!root || root.dataset.gnSwipe) return; root.dataset.gnSwipe = 'true';
    let start = null;
    const ignored = target => target?.closest?.('input,textarea,select,button,a,canvas,[contenteditable="true"],.modal,.overlay,.scanner,.carousel,.cp-dropdown,[data-no-swipe]');
    root.addEventListener('touchstart', event => { if (event.touches.length !== 1 || ignored(event.target)) { start = null; return; } const touch = event.touches[0]; start = { x: touch.clientX, y: touch.clientY, time: Date.now() }; }, { passive: true });
    root.addEventListener('touchend', event => { if (!start || event.changedTouches.length !== 1) { start = null; return; } const touch = event.changedTouches[0]; const dx = touch.clientX - start.x, dy = touch.clientY - start.y; const elapsed = Date.now() - start.time; start = null; if (elapsed > 800 || Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.35) return; const pages = ['Dash', 'Log', 'Results', 'Lab', 'Profile']; const active = pages.findIndex(name => $('page' + name)?.classList.contains('active')); if (active < 0) return; const next = pages[Math.max(0, Math.min(pages.length - 1, active + (dx < 0 ? 1 : -1)))]; if (next === pages[active]) return; const nav = $('nav' + ({ Dash: 'Dash', Log: 'Log', Results: 'Res', Lab: 'Lab', Profile: 'Pro' }[next])); window.GNModules?.showPage?.(next, nav); }, { passive: true });
  }

  function ensureGenericImport() {
    const panel = document.querySelector('#gnImportOverlay .gn-import-panel');
    if (!panel) {
      if (!document.body.dataset.gnImportObserver) {
        document.body.dataset.gnImportObserver = 'true';
        new MutationObserver(() => ensureGenericImport()).observe(document.body, { childList: true });
      }
      return;
    }
    if ($('gnMappedCsvButton')) return;
    panel.insertAdjacentHTML('beforeend', '<button type="button" class="gn-import-map-button" id="gnMappedCsvButton">MAP A GENERIC CSV</button><input type="file" id="gnMappedCsvInput" accept=".csv,text/csv" hidden>');
    $('gnMappedCsvButton').addEventListener('click', () => $('gnMappedCsvInput').click()); $('gnMappedCsvInput').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) file.text().then(text => openMapping(file.name, text)); event.target.value = ''; });
  }
  function openMapping(fileName, csvText) {
    const lines = String(csvText).split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { window.alert('This CSV does not contain a header and at least one row.'); return; }
    const parse = line => {
      const cells = []; let value = ''; let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
        else if (char === '"') quoted = !quoted;
        else if (char === ',' && !quoted) { cells.push(value.trim()); value = ''; }
        else value += char;
      }
      cells.push(value.trim()); return cells;
    };
    const headers = parse(lines[0]); const rows = lines.slice(1).map(parse);
    const guess = names => headers.find(header => names.some(name => header.toLowerCase().includes(name))) || '';
    const select = (id, label, value, required) => `<label>${label}<select data-map="${id}" ${required ? 'required' : ''}><option value="">— NOT MAPPED —</option>${headers.map(header => `<option value="${safe(header)}" ${header === value ? 'selected' : ''}>${safe(header)}</option>`).join('')}</select></label>`;
    const overlay = document.createElement('div');
    overlay.className = 'gn-import-overlay active'; overlay.id = 'gnMappingOverlay';
    overlay.innerHTML = `<div class="gn-import-panel"><div class="gn-import-title">MAP GENERIC CSV</div><p>${safe(fileName)} · fields are never guessed at commit.</p><div class="gn-mapping-grid">${select('type', 'RECORD TYPE', guess(['record type', 'type']), true)}${select('date', 'DATE', guess(['date', 'timestamp']), true)}${select('medication', 'MEDICATION', guess(['medication', 'medicine', 'drug']))}${select('dose', 'DOSE (MG)', guess(['dose', 'mg']))}${select('weight', 'WEIGHT (LB)', guess(['weight', 'lbs']))}${select('site', 'SITE', guess(['site', 'location']))}${select('notes', 'NOTES', guess(['note', 'comment']))}</div><div class="gn-import-summary" id="gnMappingSummary">Choose DATE and RECORD TYPE, then preview.</div><div class="gn-import-actions"><button type="button" class="gn-import-close" data-map-cancel>CANCEL</button><button type="button" class="csv-import-save" data-map-preview>PREVIEW MAPPED ROWS</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('[data-map-cancel]').addEventListener('click', close);
    overlay.querySelector('[data-map-preview]').addEventListener('click', () => {
      const map = Object.fromEntries(q('[data-map]', overlay).map(field => [field.dataset.map, field.value]));
      const summary = overlay.querySelector('#gnMappingSummary');
      if (!map.type || !map.date) { summary.textContent = 'Map RECORD TYPE and DATE before previewing.'; return; }
      const index = Object.fromEntries(headers.map((header, position) => [header, position]));
      const mapped = rows.map((cells, rowIndex) => {
        const value = key => map[key] ? cells[index[map[key]]] || '' : '';
        const type = value('type').toLowerCase(); const dose = Number(value('dose')); const weight = Number(value('weight'));
        return { rowIndex: rowIndex + 2, record_type: type.includes('weight') ? 'weight' : type.includes('shot') ? 'shot' : '', date: value('date'), medication: value('medication'), dose_mg: Number.isFinite(dose) && dose > 0 ? dose : null, weight_lb: Number.isFinite(weight) && weight > 0 ? weight : null, location: value('site'), notes: value('notes'), side_effects: [] };
      });
      const valid = mapped.filter(item => item.record_type && item.date && (item.record_type === 'shot' ? item.dose_mg : item.weight_lb));
      const existingShots = new Set(activeShots().map(item => `${item.date}|${item.med}|${item.dose}`)); const existingWeights = new Set(weights().map(item => `${item.date}|${item.weight}`));
      const fresh = valid.filter(item => item.record_type === 'shot' ? !existingShots.has(`${item.date}|${item.medication}|${item.dose_mg}`) : !existingWeights.has(`${item.date}|${item.weight_lb}`));
      summary.textContent = `${valid.length} recognized · ${mapped.length - valid.length} invalid · ${valid.length - fresh.length} duplicates · ${fresh.length} new.`;
      const button = overlay.querySelector('[data-map-preview]'); button.textContent = fresh.length ? `COMMIT ${fresh.length} NEW` : 'CLOSE';
      button.onclick = () => {
        if (!fresh.length) { close(); return; }
        const beforeShots = records('shots'); const beforeWeights = records('weights'); const importedAt = new Date().toISOString();
        try {
          const nextShots = [...beforeShots]; const nextWeights = [...beforeWeights];
          fresh.forEach(item => { if (item.record_type === 'weight') nextWeights.push({ id: `weight_import_${crypto.randomUUID()}`, date: item.date, weight: item.weight_lb, source: 'Mapped CSV Import', state: 'Needs Review', importProvenance: { fileName, importedAt } }); else nextShots.push({ id: `shot_import_${crypto.randomUUID()}`, date: item.date, med: item.medication || 'Custom', dose: item.dose_mg, site: item.location || '', se: item.side_effects, notes: item.notes || null, archived: false, source: 'Mapped CSV Import', state: 'Needs Review', importProvenance: { fileName, importedAt } }); });
          if (!store().set('shots', nextShots) || !store().set('weights', nextWeights)) throw new Error('LOCAL_STORAGE_REJECTED');
          window.GNModules?.refreshAll?.(); close();
        } catch (error) { store().set('shots', beforeShots); store().set('weights', beforeWeights); summary.textContent = `IMPORT ROLLED BACK · ${error.message}`; }
      };
    });
  }

  function boot() {
    if (!store()) { window.setTimeout(boot, 150); return; }
    renderStreak(); drawWeightChart(); renderProgressViews(); enhanceInventory(); ensurePreferences(); ensureGenericImport(); installSwipeNavigation();
    window.setInterval(() => { renderStreak(); drawWeightChart(); renderProgressViews(); enhanceInventory(); ensurePreferences(); ensureGenericImport(); }, 900);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderStreak(); drawWeightChart(); } });
  }
  document.addEventListener('DOMContentLoaded', boot, { once: true });
}());
