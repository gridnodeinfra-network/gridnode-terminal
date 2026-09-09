/* GRID//NODE ASSAY — batch lab-test log (fourth LAB segment).
 *
 * One record per third-party tested batch: peptide, vendor, lot, lab,
 * method, purity, label claim, measured amount, endotoxin, notes.
 * Variance % is derived, never entered. Local VAULT storage via
 * GNModules (labTests workspace key, same sync path as SHOTS).
 *
 * Pure helpers are exposed on window.GN_ASSAY for the contract test.
 */
(function () {
  'use strict';

  var MOD = window.GNModules || {};
  var MED = window.GN_MEDICATION_IDENTITY || { ids: [], normalize: function (v) { return v; }, label: function (v) { return v; } };

  function $(id) { return document.getElementById(id); }
  /* Bundle-parity i18n: GN_I18N.text(key, fallback) returns the fallback when
     the catalog has no entry (unlike t(), which returns the raw key). */
  function tx(key, fallback) {
    try {
      if (window.GN_I18N && typeof window.GN_I18N.text === 'function') {
        var v = window.GN_I18N.text(key, fallback);
        return v == null || v === '' ? fallback : v;
      }
    } catch (_) {}
    return fallback;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function todayISO() { try { if (typeof window.todayISO === 'function') return window.todayISO(); } catch (_) {} return new Date().toISOString().slice(0, 10); }

  var state = {
    view: 'active',          // active | archived
    peptide: '',             // peptide filter (medication id)
    vendor: '',              // vendor filter
    expandedId: null,
    confirmId: null,         // id awaiting second-tap confirm
    confirmKind: null,       // 'archive' | 'delete'
    editingId: null,
    method: null,
    endotoxin: 'untested'
  };

  /* ── pure logic ── */

  function labTestVariance(record) {
    var m = record && record.measuredMg;
    var c = record && record.labelClaimMg;
    if (m == null || m === '' || c == null || c === '') return null;
    var measured = Number(m);
    var claim = Number(c);
    if (!Number.isFinite(measured) || !Number.isFinite(claim) || claim <= 0) return null;
    return (measured - claim) / claim;
  }

  function labTestVarianceBand(fraction) {
    if (!Number.isFinite(fraction)) return null;
    var abs = Math.abs(fraction);
    if (abs <= 0.05) return 'green';
    if (abs <= 0.10) return 'amber';
    return 'red';
  }

  function validateLabTest(draft) {
    var errors = [];
    if (!draft.peptide) errors.push('peptide');
    if (!draft.vendor || !String(draft.vendor).trim()) errors.push('vendor');
    if (!draft.testDate) errors.push('testDate');
    return { ok: errors.length === 0, errors: errors };
  }

  function methodLabel(m) {
    var map = { hplc: 'HPLC', ms: 'MS', hplc_ms: 'HPLC+MS', coa: 'COA ONLY', other: 'OTHER' };
    return map[m] || '—';
  }
  function endotoxinLabel(e) {
    var map = { pass: tx('assay.endoPass', 'PASS'), fail: tx('assay.endoFail', 'FAIL'), untested: tx('assay.endoUntested', 'NOT TESTED') };
    return map[e] || map.untested;
  }
  function endotoxinClass(e) { return e === 'pass' ? 'green' : e === 'fail' ? 'red' : ''; }

  function fmtPct(fraction) {
    if (!Number.isFinite(fraction)) return '—';
    var sign = fraction > 0 ? '+' : '';
    return sign + (fraction * 100).toFixed(1) + '%';
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d) ? esc(iso) : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /* ── storage (through the bundle, so account keys + journal apply) ── */

  function allTests() {
    try { return MOD.getAllLabTests ? MOD.getAllLabTests() : []; } catch (_) { return []; }
  }
  function persist(list) {
    try { return MOD.setLabTests ? MOD.setLabTests(list) : false; } catch (_) { return false; }
  }
  function varianceOf(record) { return labTestVariance(record); }
  function bandOf(fraction) { return labTestVarianceBand(fraction); }
  function peptideLabel(id) {
    try { return MED.label(id) || id; } catch (_) { return id; }
  }

  /* ── history rendering ── */

  function distinctVendors(list) {
    var seen = {}, out = [];
    list.forEach(function (r) { if (r.vendor && !seen[r.vendor]) { seen[r.vendor] = 1; out.push(r.vendor); } });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }
  function distinctPeptides(list) {
    var seen = {}, out = [];
    list.forEach(function (r) { if (r.peptide && !seen[r.peptide]) { seen[r.peptide] = 1; out.push(r.peptide); } });
    return out.sort(function (a, b) { return peptideLabel(a).localeCompare(peptideLabel(b)); });
  }

  function chip(text, cls) { return '<span class="gn-assay-chip' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>'; }

  function cardHTML(record) {
    var archived = Boolean(record.archived);
    var v = varianceOf(record);
    var band = bandOf(v);
    var expanded = state.expandedId === record.id;
    var html = '<article class="log-entry gn-assay-entry' + (archived ? ' archived archived-record' : '') + '" data-assay-id="' + esc(record.id) + '">';
    html += '<div class="gn-assay-row" data-assay-toggle="' + esc(record.id) + '">';
    html += '<div class="gn-assay-main"><b>' + esc(peptideLabel(record.peptide)) + '</b>';
    html += '<span class="gn-assay-meta">' + esc(record.vendor || '—') + (record.batch ? ' · ' + tx('assay.lot', 'LOT') + ' ' + esc(record.batch) : '') + '</span>';
    html += '<span class="gn-assay-meta">' + fmtDate(record.testDate) + (record.method ? ' · ' + esc(methodLabel(record.method)) : '') + '</span></div>';
    html += '<div class="gn-assay-chips">';
    if (record.purityPct != null) html += chip(record.purityPct + '%', 'cyan');
    html += chip((v == null ? '±—' : fmtPct(v)), band || '');
    html += '</div></div>';
    if (expanded) {
      html += '<div class="gn-assay-detail">';
      html += detailRow(tx('assay.lab', 'TESTED BY'), record.lab || '—');
      html += detailRow(tx('assay.claim', 'LABEL CLAIM'), record.labelClaimMg != null ? record.labelClaimMg + ' mg' : '—');
      html += detailRow(tx('assay.measured', 'MEASURED'), record.measuredMg != null ? record.measuredMg + ' mg' : '—');
      html += detailRow(tx('assay.endotoxin', 'ENDOTOXIN'), endotoxinLabel(record.endotoxin), endotoxinClass(record.endotoxin));
      if (record.notes) html += '<div class="gn-assay-notes">' + esc(record.notes) + '</div>';
      html += '<div class="gn-assay-actions">';
      html += assayBtn(record.id, 'edit', tx('assay.edit', 'EDIT'), false);
      if (!archived) {
        html += assayBtn(record.id, 'archive', tx('assay.archive', 'ARCHIVE'), state.confirmId === record.id && state.confirmKind === 'archive');
      } else {
        html += assayBtn(record.id, 'restore', tx('assay.restore', 'RESTORE'), false);
      }
      html += assayBtn(record.id, 'delete', tx('assay.delete', 'DELETE'), state.confirmId === record.id && state.confirmKind === 'delete');
      html += '</div>';
      if (record.archivedAt) html += '<div class="gn-assay-meta">' + tx('assay.archivedOn', 'Archived') + ' ' + fmtDate(record.archivedAt) + '</div>';
      html += '</div>';
    }
    html += '</article>';
    return html;
  }
  function detailRow(k, v, cls) {
    return '<div class="gn-assay-drow"><span class="k">' + esc(k) + '</span><span class="v' + (cls ? ' ' + cls : '') + '">' + esc(v) + '</span></div>';
  }
  function assayBtn(id, action, label, confirming) {
    var text = confirming
      ? (action === 'delete' ? tx('assay.confirmDelete', 'CONFIRM DELETE?') : tx('assay.confirmArchive', 'CONFIRM ARCHIVE?'))
      : label;
    return '<button type="button" class="btn-full ' + (action === 'delete' ? 'btn-danger' : 'btn-secondary') + ' gn-assay-act' + (confirming ? ' confirming' : '') + '" data-assay-action="' + action + '" data-assay-id="' + esc(id) + '">' + esc(text) + '</button>';
  }

  function renderAssay() {
    var list = $('gnAssayList');
    if (!list) return;
    var all = allTests();
    var filters = $('gnAssayFilters');
    if (filters) filters.style.display = all.length ? '' : 'none';

    // filter options
    syncFilterOptions('gnAssayFilterPeptide', distinctPeptides(all), state.peptide, function (id) { return peptideLabel(id); }, tx('assay.allPeptides', 'ALL'));
    syncFilterOptions('gnAssayFilterVendor', distinctVendors(all), state.vendor, function (v) { return v; }, tx('assay.allVendors', 'ALL'));
    Array.prototype.forEach.call(document.querySelectorAll('[data-assay-view]'), function (b) {
      b.classList.toggle('active', b.dataset.assayView === state.view);
    });

    var visible = all
      .filter(function (r) { return state.view === 'archived' ? r.archived : !r.archived; })
      .filter(function (r) { return !state.peptide || r.peptide === state.peptide; })
      .filter(function (r) { return !state.vendor || r.vendor === state.vendor; })
      .sort(function (a, b) { return String(b.testDate).localeCompare(String(a.testDate)); });

    if (!visible.length) {
      var filtering = Boolean(state.peptide || state.vendor);
      list.innerHTML = '<div class="empty">' +
        '<b>' + esc(filtering ? tx('assay.noMatch', 'NO TESTS MATCH THESE FILTERS.') : state.view === 'archived' ? tx('assay.noArchived', 'NO ARCHIVED TESTS') : tx('assay.emptyTitle', 'NO TESTS LOGGED')) + '</b>' +
        (filtering
          ? '<br><button class="btn-full btn-secondary empty-cta" type="button" id="gnAssayClearFilters">' + esc(tx('assay.clearFilters', 'CLEAR FILTERS')) + '</button>'
          : '<span class="gn-assay-empty-sub">' + esc(tx('assay.emptySub', 'One tested batch is worth ten untested ones.')) + '</span>') +
        '</div>';
      var clear = $('gnAssayClearFilters');
      if (clear) clear.addEventListener('click', function () { state.peptide = ''; state.vendor = ''; renderAssay(); });
      return;
    }
    list.innerHTML = visible.map(cardHTML).join('');
    try { if (window.GN_I18N && window.GN_I18N.applyTo) window.GN_I18N.applyTo(list); } catch (_) {}
  }

  function syncFilterOptions(selectId, values, current, labelFn, allLabel) {
    var sel = $(selectId);
    if (!sel) return;
    var html = '<option value="">' + esc(allLabel) + '</option>' + values.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(labelFn(v)) + '</option>';
    }).join('');
    if (sel.innerHTML !== html) sel.innerHTML = html;
    else sel.value = current || '';
  }

  /* ── LOG TEST modal ── */

  function ensureModal() {
    var ov = $('gnAssayModalOv');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'gnAssayModalOv';
    ov.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="gnAssayModalTitle">' +
      '<div class="modal-hdr"><div class="modal-title" id="gnAssayModalTitle" data-i18n="assay.logTest">LOG TEST</div>' +
      '<div class="modal-actions"><button type="button" class="btn-icon" id="gnAssayClose" aria-label="Close">×</button></div></div>' +
      '<div class="form-group"><label class="form-label" for="gnAssayPeptide" data-i18n="assay.peptide">PEPTIDE</label><select class="form-input" id="gnAssayPeptide"></select></div>' +
      '<div class="form-group"><label class="form-label" for="gnAssayVendor" data-i18n="assay.vendor">VENDOR</label><input class="form-input" id="gnAssayVendor" list="gnAssayVendorList" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><datalist id="gnAssayVendorList"></datalist></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label" for="gnAssayBatch" data-i18n="assay.batch">BATCH / LOT</label><input class="form-input" id="gnAssayBatch" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>' +
      '<div class="form-group"><label class="form-label" for="gnAssayDate" data-i18n="assay.testDate">TEST DATE</label><input class="form-input" id="gnAssayDate" type="date"></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label" for="gnAssayLab" data-i18n="assay.lab">TESTED BY (LAB)</label><input class="form-input" id="gnAssayLab" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-i18n-ph="assay.labPh" placeholder="e.g. Janoshik"></div>' +
      '<div class="form-group"><label class="form-label" data-i18n="assay.method">METHOD</label><div class="gn-assay-pills" id="gnAssayMethodPills"></div></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label" for="gnAssayPurity" data-i18n="assay.purity">PURITY (%)</label><input class="form-input" id="gnAssayPurity" type="number" inputmode="decimal" step="0.1" min="0" max="100" placeholder="e.g. 99.2"></div>' +
      '<div class="form-group"><label class="form-label" for="gnAssayClaim" data-i18n="assay.claim">LABEL CLAIM (mg)</label><input class="form-input" id="gnAssayClaim" type="number" inputmode="decimal" step="0.1" min="0" placeholder="e.g. 10"></div>' +
      '</div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label" for="gnAssayMeasured" data-i18n="assay.measured">MEASURED (mg)</label><input class="form-input" id="gnAssayMeasured" type="number" inputmode="decimal" step="0.1" min="0" placeholder="e.g. 9.7"></div>' +
      '<div class="form-group"><label class="form-label" data-i18n="assay.variance">VARIANCE</label><div class="gn-assay-varpreview" id="gnAssayVarPreview">—</div></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label" data-i18n="assay.endotoxin">ENDOTOXIN</label><div class="gn-assay-pills" id="gnAssayEndoPills"></div></div>' +
      '<div class="form-group"><label class="form-label" for="gnAssayNotes" data-i18n="assay.notes">NOTES</label><textarea class="form-input" id="gnAssayNotes" rows="3"></textarea></div>' +
      '<div class="gn-assay-err" id="gnAssayErr" style="display:none"></div>' +
      '<button class="btn-full btn-primary" type="button" id="gnAssaySave" data-i18n="assay.logTest">LOG TEST</button>' +
      '</div>';
    document.body.appendChild(ov);
    wireModal(ov);
    try { if (window.GN_I18N && window.GN_I18N.applyTo) window.GN_I18N.applyTo(ov); } catch (_) {}
    return ov;
  }

  function pillGroup(containerId, options, current, onPick) {
    var c = $(containerId);
    if (!c) return;
    c.innerHTML = '';
    options.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dose-pill' + (opt.value === current ? ' active' : '');
      b.textContent = opt.label;
      b.setAttribute('aria-pressed', String(opt.value === current));
      b.addEventListener('click', function () { onPick(opt.value); });
      c.appendChild(b);
    });
  }

  function syncPills() {
    pillGroup('gnAssayMethodPills',
      [{ value: 'hplc', label: 'HPLC' }, { value: 'ms', label: 'MS' }, { value: 'hplc_ms', label: 'HPLC+MS' }, { value: 'coa', label: tx('assay.coaOnly', 'COA ONLY') }, { value: 'other', label: tx('assay.other', 'OTHER') }],
      state.method, function (v) { state.method = (state.method === v ? null : v); syncPills(); });
    pillGroup('gnAssayEndoPills',
      [{ value: 'pass', label: tx('assay.endoPass', 'PASS') }, { value: 'fail', label: tx('assay.endoFail', 'FAIL') }, { value: 'untested', label: tx('assay.endoUntested', 'NOT TESTED') }],
      state.endotoxin, function (v) { state.endotoxin = v; syncPills(); });
  }

  function syncVarPreview() {
    var el = $('gnAssayVarPreview');
    if (!el) return;
    var claim = Number($('gnAssayClaim') && $('gnAssayClaim').value);
    var measured = Number($('gnAssayMeasured') && $('gnAssayMeasured').value);
    var v = labTestVariance({ labelClaimMg: claim, measuredMg: measured });
    if (v == null || !Number.isFinite(v)) { el.textContent = '—'; el.className = 'gn-assay-varpreview'; return; }
    var band = bandOf(v);
    el.textContent = fmtPct(v);
    el.className = 'gn-assay-varpreview ' + (band || '');
  }

  function fillPeptideOptions(selected) {
    var sel = $('gnAssayPeptide');
    if (!sel) return;
    var html = '<option value="">' + esc(tx('assay.selectPeptide', 'Select peptide')) + '</option>' +
      MED.ids.map(function (id) { return '<option value="' + esc(id) + '"' + (id === selected ? ' selected' : '') + '>' + esc(peptideLabel(id)) + '</option>'; }).join('');
    sel.innerHTML = html;
  }

  function openAssayModal(editId) {
    var ov = ensureModal();
    state.editingId = editId || null;
    state.method = null;
    state.endotoxin = 'untested';
    state.confirmId = null; state.confirmKind = null;
    var rec = editId ? allTests().find(function (r) { return r.id === editId; }) : null;
    if (rec) {
      try { state.method = rec.method; state.endotoxin = rec.endotoxin || 'untested'; } catch (_) {}
    }
    fillPeptideOptions(rec ? rec.peptide : '');
    $('gnAssayVendor').value = rec ? rec.vendor || '' : '';
    $('gnAssayBatch').value = rec ? rec.batch || '' : '';
    $('gnAssayDate').value = rec ? (rec.testDate || todayISO()) : todayISO();
    $('gnAssayLab').value = rec ? rec.lab || '' : '';
    $('gnAssayPurity').value = rec && rec.purityPct != null ? rec.purityPct : '';
    $('gnAssayClaim').value = rec && rec.labelClaimMg != null ? rec.labelClaimMg : '';
    $('gnAssayMeasured').value = rec && rec.measuredMg != null ? rec.measuredMg : '';
    $('gnAssayNotes').value = rec ? rec.notes || '' : '';
    // vendor suggestions from history
    var dl = $('gnAssayVendorList');
    if (dl) dl.innerHTML = distinctVendors(allTests()).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('');
    var err = $('gnAssayErr');
    if (err) err.style.display = 'none';
    var title = $('gnAssayModalTitle');
    if (title) title.textContent = rec ? tx('assay.editTest', 'EDIT TEST') : tx('assay.logTest', 'LOG TEST');
    var save = $('gnAssaySave');
    if (save) save.textContent = rec ? tx('assay.saveTest', 'SAVE TEST') : tx('assay.logTest', 'LOG TEST');
    syncPills();
    syncVarPreview();
    try { if (window.GN_I18N && window.GN_I18N.applyTo) window.GN_I18N.applyTo(ov); } catch (_) {}
    ov.classList.add('active');
  }

  function closeAssayModal() { var ov = $('gnAssayModalOv'); if (ov) ov.classList.remove('active'); }

  function collectDraft() {
    var peptide = $('gnAssayPeptide') ? $('gnAssayPeptide').value : '';
    try { peptide = MED.normalize(peptide) || ''; } catch (_) {}
    return {
      peptide: peptide,
      vendor: $('gnAssayVendor') ? $('gnAssayVendor').value.trim() : '',
      batch: $('gnAssayBatch') ? $('gnAssayBatch').value.trim() : '',
      testDate: $('gnAssayDate') ? $('gnAssayDate').value : '',
      lab: $('gnAssayLab') ? $('gnAssayLab').value.trim() : '',
      method: state.method,
      purityPct: numOrNull($('gnAssayPurity') && $('gnAssayPurity').value),
      labelClaimMg: numOrNull($('gnAssayClaim') && $('gnAssayClaim').value),
      measuredMg: numOrNull($('gnAssayMeasured') && $('gnAssayMeasured').value),
      endotoxin: state.endotoxin || 'untested',
      notes: $('gnAssayNotes') ? $('gnAssayNotes').value.trim() : ''
    };
  }
  function numOrNull(v) { var n = Number(v); return v !== '' && Number.isFinite(n) ? n : null; }

  function saveAssayModal() {
    var draft = collectDraft();
    var check = validateLabTest(draft);
    var err = $('gnAssayErr');
    if (!check.ok) {
      if (err) {
        err.textContent = tx('assay.requiredErr', 'Peptide, vendor, and test date are required.');
        err.style.display = '';
      }
      return;
    }
    if (err) err.style.display = 'none';
    var list = allTests();
    var now = new Date().toISOString();
    if (state.editingId) {
      var idx = list.findIndex(function (r) { return r.id === state.editingId; });
      if (idx < 0) { closeAssayModal(); return; }
      var prev = list[idx];
      list[idx] = Object.assign({}, MOD.normalizeLabTest ? MOD.normalizeLabTest(draft) : draft, {
        id: prev.id, createdAt: prev.createdAt || now, modifiedAt: now, archived: prev.archived, archivedAt: prev.archivedAt
      });
    } else {
      var rec = MOD.normalizeLabTest ? MOD.normalizeLabTest(draft) : draft;
      rec.createdAt = now; rec.modifiedAt = now;
      list.push(rec);
    }
    if (!persist(list)) {
      if (err) { err.textContent = tx('assay.storageErr', 'Could not save — storage unavailable.'); err.style.display = ''; }
      return;
    }
    closeAssayModal();
    state.editingId = null;
    renderAssay();
  }

  function wireModal(ov) {
    $('gnAssayClose').addEventListener('click', closeAssayModal);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeAssayModal(); });
    $('gnAssaySave').addEventListener('click', saveAssayModal);
    ['gnAssayClaim', 'gnAssayMeasured'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', syncVarPreview);
    });
  }

  /* ── archive / restore / delete (two-tap confirm, same spirit as SHOTS) ── */

  function doArchive(id) {
    var list = allTests();
    var rec = list.find(function (r) { return r.id === id; });
    if (!rec) return;
    var now = new Date().toISOString();
    rec.archived = true; rec.archivedAt = now; rec.modifiedAt = now;
    if (persist(list)) renderAssay();
  }
  function doRestore(id) {
    var list = allTests();
    var rec = list.find(function (r) { return r.id === id; });
    if (!rec) return;
    rec.archived = false; rec.archivedAt = null; rec.modifiedAt = new Date().toISOString();
    if (persist(list)) renderAssay();
  }
  function doDelete(id) {
    var list = allTests().filter(function (r) { return r.id !== id; });
    if (persist(list)) { if (state.expandedId === id) state.expandedId = null; renderAssay(); }
  }

  function onAction(action, id) {
    if (state.confirmId === id && state.confirmKind === action) {
      state.confirmId = null; state.confirmKind = null;
      if (action === 'archive') doArchive(id);
      else if (action === 'delete') doDelete(id);
      return;
    }
    if (action === 'restore') { doRestore(id); return; }
    if (action === 'edit') { openAssayModal(id); return; }
    state.confirmId = id; state.confirmKind = action;
    state.expandedId = id;
    renderAssay();
  }

  /* ── wiring ── */

  function wire() {
    var btn = $('gnAssayLogBtn');
    if (btn) btn.addEventListener('click', function () { openAssayModal(null); });
    var fp = $('gnAssayFilterPeptide');
    if (fp) fp.addEventListener('change', function () { state.peptide = fp.value; renderAssay(); });
    var fv = $('gnAssayFilterVendor');
    if (fv) fv.addEventListener('change', function () { state.vendor = fv.value; renderAssay(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-assay-view]'), function (b) {
      b.addEventListener('click', function () { state.view = b.dataset.assayView; state.expandedId = null; renderAssay(); });
    });
    var list = $('gnAssayList');
    if (list) list.addEventListener('click', function (e) {
      var act = e.target.closest('[data-assay-action]');
      if (act) { e.stopPropagation(); onAction(act.dataset.assayAction, act.dataset.assayId); return; }
      var tog = e.target.closest('[data-assay-toggle]');
      if (tog) {
        var id = tog.dataset.assayToggle;
        state.expandedId = (state.expandedId === id ? null : id);
        state.confirmId = null; state.confirmKind = null;
        renderAssay();
      }
    });
    document.addEventListener('gn:langchange', function () { renderAssay(); });
    // re-render when the ASSAY segment is shown
    try {
      var orig = window.showLabSeg;
      if (typeof orig === 'function' && !orig._gnAssayWrapped) {
        var wrapped = function (segment, button) {
          orig(segment, button);
          if (segment === 'assay') renderAssay();
        };
        wrapped._gnAssayWrapped = true;
        window.showLabSeg = wrapped;
      }
    } catch (_) {}
  }

  function boot() {
    wire();
    renderAssay();
    // The i18n catalog loads async; re-render once it lands so a non-default
    // language gets real translations instead of the English fallbacks.
    try {
      if (window.GN_I18N && window.GN_I18N.ready && typeof window.GN_I18N.ready.then === 'function') {
        window.GN_I18N.ready.then(function () { renderAssay(); });
      }
    } catch (_) {}
  }

  window.GN_ASSAY = Object.freeze({
    validateLabTest: validateLabTest,
    labTestVariance: labTestVariance,
    labTestVarianceBand: labTestVarianceBand,
    renderAssay: renderAssay,
    openAssayModal: openAssayModal,
    methodLabel: methodLabel,
    endotoxinLabel: endotoxinLabel
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
