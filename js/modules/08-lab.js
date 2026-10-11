function ensureLabFoundations() {
  const page = $('pageLab');
  if (!page || page.querySelector('[data-gn-lab-foundation]')) return;
  const header = page.querySelector('.page-hdr');
  if (!header) return;
  header.insertAdjacentHTML('afterend', `<section class="gn-foundation-panel" data-gn-lab-foundation aria-labelledby="gnLabFoundationTitle">
    <div class="gn-foundation-head"><div><div class="gn-foundation-kicker" data-i18n="lab.organizedSystems">// ORGANIZED SYSTEMS</div><h2 id="gnLabFoundationTitle">LAB <span data-i18n="lab.expansionLayer">EXPANSION LAYER</span></h2></div><span class="gn-foundation-signal" data-i18n="lab.localRecords">LOCAL RECORDS</span></div>
    <div class="gn-lab-breadcrumb">LAB <b>›</b> <span data-i18n="lab.chooseSystemPhrase">CHOOSE A SYSTEM</span></div>
    <div class="gn-foundation-grid">
      <button type="button" class="gn-foundation-tile" data-lab-focus="calculators"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-g"><svg><use href="#gn-biometric-gauge"></use></svg></span></span><b data-i18n="lab.calculators">CALCULATORS</b><small data-i18n="lab.calculatorsHelp">Focused educational tools</small></button>
      <button type="button" class="gn-foundation-tile active" data-lab-focus="research"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-lab-vessel"></use></svg></span></span><b data-i18n="lab.researchPeptides">RESEARCH PEPTIDES</b><small data-i18n="lab.researchPeptidesHelp">Personal record tracking</small></button>
      <button type="button" class="gn-foundation-tile" data-lab-focus="inventory"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-g"><svg><use href="#gn-inventory-core"></use></svg></span></span><b data-i18n="lab.inventory">INVENTORY</b><small data-i18n="lab.inventoryHelp">Supply records + deduction</small></button>
      <button type="button" class="gn-foundation-tile" data-lab-focus="devices"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-y"><svg><use href="#gn-vault-core"></use></svg></span></span><b data-i18n="lab.deviceVault">DEVICE VAULT</b><small data-i18n="lab.deviceVaultHelp">Identity, lifecycle, status</small></button>
      <button type="button" class="gn-foundation-tile" data-lab-focus="ledger"><span class="gn-foundation-icon"><span class="gn-icon gn-icon-md gn-accent-r"><svg><use href="#gn-timeline-node"></use></svg></span></span><b data-i18n="lab.eventLedger">EVENT LEDGER</b><small data-i18n="lab.eventLedgerHelp">Source-aware history</small></button>
    </div>
    <details class="gn-foundation-section" open id="gnResearchSection"><summary><span data-i18n="lab.researchPeptides">RESEARCH PEPTIDES</span><em data-i18n="research.organize">ORGANIZE · OBSERVE · REVIEW</em></summary>
      <div class="gn-research-notice gn-research-notice-compact"><button type="button" class="gn-research-info-toggle" aria-expanded="false" aria-controls="gnResearchNoticeBody" data-i18n-aria-label="research.noticeToggleAria"><span aria-hidden="true">?</span></button><strong data-i18n="research.noticeTitle">USER-ENTERED RESEARCH RECORDS</strong><span class="gn-research-notice-body" id="gnResearchNoticeBody" hidden data-i18n="research.noticeBody">Some compounds above have FDA-approved indications in specific clinical contexts. This organizer does not distinguish regulated from research use. All records are user-entered. Verify independently.</span></div>
      <div class="gn-research-library">${RESEARCH_LIBRARY.map(({ category, names, context }) => { const catKey = RESEARCH_CATEGORY_KEYS[category]; const ctxKey = context === 'RESEARCH-FOCUSED RECORDS · REGULATORY STATUS IS NOT VERIFIED HERE.' ? 'lab.researchKicker' : 'lab.mixedResearchContext'; return `<div class="gn-research-group"><span>${safeText(catKey ? tx(catKey, category) : category)}</span><small class="gn-research-context">${safeText(tx(ctxKey, context))}</small><div>${names.map(name => `<button type="button" data-research-name="${safeText(name)}" data-research-category="${safeText(catKey)}">${safeText(name)}</button>`).join('')}</div></div>`; }).join('')}<div class="gn-research-group gn-research-custom-group"><span data-i18n="lab.customEntry">CUSTOM ENTRY</span><small class="gn-research-context" data-i18n="lab.customEntryHelp">USER-ENTERED RECORD · REGULATORY STATUS IS NOT VERIFIED HERE.</small><div><button type="button" class="gn-research-custom-link" data-research-name="" data-research-category="lab.customResearch" data-i18n="research.customEntryLink">¿Necesitas un compuesto personalizado? → Crear entrada personalizada</button></div></div>
      <div class="gn-custom-warning" id="gnCustomWarning" data-i18n="research.customWarning">⚠ CUSTOM ENTRIES ARE NOT VERIFIED AGAINST THE LIBRARY. Verify the name and category independently.</div></div>
      <div class="gn-research-disclaimer" data-i18n="research.noticeBody">Some compounds above have FDA-approved indications in specific clinical contexts. This organizer does not distinguish regulated from research use. All records are user-entered. Verify independently.</div>
      <div class="gn-research-mode" id="gnResearchMode" data-mode="pick" style="display:none">
        <div class="gn-research-mode-chips"><span class="gn-research-chip" id="gnModeLibraryChip" data-i18n="research.modeLibrarySelected">BIBLIOTECA · SELECCIONADA</span><span class="gn-research-chip" id="gnModeCategoryChip" data-i18n="research.modeCategoryAssigned">CATEGORÍA · ASIGNADA</span></div>
        <div class="gn-research-mode-custom"><span class="gn-research-mode-title" data-i18n="research.modeCustomTitle">CREAR ENTRADA PERSONALIZADA</span><button type="button" class="gn-research-back" id="gnModeBack" onclick="researchBackToLibrary()" data-i18n="research.backToLibrary">← Volver a la biblioteca</button></div>
      </div>
      <form class="gn-record-form" id="gnResearchForm"><div class="gn-form-grid"><label><span data-i18n="research.recordName">RECORD NAME</span> <em data-research-badge class="gn-research-preset-badge"></em><input id="gnResearchName" required placeholder="Select a library entry or type a custom name" data-i18n-placeholder="research.recordNamePlaceholder"></label><label><span data-i18n="research.category">CATEGORY</span><input id="gnResearchCategory" placeholder="Research category" data-i18n-placeholder="research.categoryPlaceholder"></label><label><span data-i18n="research.date">DATE</span><input id="gnResearchDate" type="date"></label></div><div class="gn-form-grid"><label><span data-i18n="research.status">STATUS</span><select id="gnResearchState"><option value="TRACKING" data-i18n="research.tracking">TRACKING</option><option value="COMPLETED" data-i18n="research.completed">COMPLETED</option><option value="ARCHIVED" data-i18n="research.archived">ARCHIVED</option><option value="RESEARCH NOTE ONLY" data-i18n="research.noteOnly">RESEARCH NOTE ONLY</option></select></label></div><div class="gn-advanced-fields"><button type="button" class="gn-advanced-toggle" aria-expanded="false" aria-controls="gnAdvancedFields" data-i18n="research.advanced">ADVANCED</button><div class="gn-advanced-body" id="gnAdvancedFields" hidden><div class="gn-form-grid"><label><span data-i18n="research.source">SOURCE</span><input id="gnResearchSource" placeholder="User-entered source or note" data-i18n-placeholder="research.sourcePlaceholder"></label></div><label><span data-i18n="research.observations">OBSERVATIONS / NOTES</span><textarea id="gnResearchNotes" rows="3" placeholder="User-entered observations only" data-i18n-placeholder="research.observationsPlaceholder"></textarea></label></div></div><button class="btn-full btn-primary" type="submit" id="gnResearchSave" data-i18n="research.save">SAVE RESEARCH RECORD</button></form>
      <div class="gn-record-list" id="gnResearchList"></div>
    </details>
    <details class="gn-foundation-section" id="gnLedgerSection"><summary><span data-i18n="lab.ledgerTitle">SOURCE-AWARE EVENT LEDGER</span><em data-i18n="lab.noSilentRewrites">NO SILENT REWRITES</em></summary><div class="gn-ledger-copy" data-i18n="lab.ledgerCopy">Every important record keeps its origin and review state. Manual Entry, Import, Device Reported, and System Generated events remain distinguishable.</div><div class="gn-ledger-list" id="gnLedgerList"></div></details>
    <details class="gn-foundation-section" id="gnSupplySection"><summary><span data-i18n="lab.savedInventory">SAVED INVENTORY</span><em data-i18n="lab.separateCalculators">SEPARATE FROM CALCULATORS</em></summary><div class="gn-ledger-copy"><strong data-i18n="lab.calculatorEstimate">CALCULATOR / REFERENCE ESTIMATE</strong> <span data-i18n="lab.inventoryBoundary">remains educational math. Saved Inventory is user-entered supply records and does not verify product, storage, potency, or safety.</span></div><form class="gn-record-form" id="gnInventoryForm"><div class="gn-form-grid"><label><span data-i18n="lab.itemName">ITEM NAME</span><input id="gnInventoryName" required placeholder="e.g. cartridge A" data-i18n-placeholder="lab.itemNamePlaceholder"></label><label><span data-i18n="lab.itemType">ITEM TYPE</span><select id="gnInventoryType"><option value="VIAL" data-i18n="lab.typeVial">Vial</option><option value="CARTRIDGE" data-i18n="lab.typeCartridge">Cartridge</option><option value="DISPOSABLE_PEN" data-i18n="lab.typeDisposable">Disposable pen</option><option value="BOX_PACKAGE" data-i18n="lab.typeBox">Box or package</option><option value="SUPPLY" data-i18n="lab.typeSupply">General supply item</option><option value="CUSTOM" data-i18n="lab.typeCustom">Custom item</option></select></label><label><span data-i18n="lab.quantity">QUANTITY</span><input id="gnInventoryQuantity" type="number" min="0" step="any" placeholder="0"></label></div><div class="gn-form-grid"><label><span data-i18n="lab.units">UNITS</span><input id="gnInventoryUnits" placeholder="items, mL, boxes" data-i18n-placeholder="lab.unitsPlaceholder"></label><label><span data-i18n="lab.expiration">EXPIRATION / BUD</span><input id="gnInventoryExpiry" type="date"></label><label><span data-i18n="lab.storageLocation">STORAGE LOCATION</span><input id="gnInventoryLocation" placeholder="User-entered location" data-i18n-placeholder="lab.storagePlaceholder"></label></div><label><span data-i18n="lab.notes">NOTES</span><textarea id="gnInventoryNotes" rows="2" placeholder="User-entered supply notes" data-i18n-placeholder="lab.supplyNotesPlaceholder"></textarea></label><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-full btn-secondary" type="submit" style="flex:1 1 180px" id="gnInventorySave" data-i18n="lab.saveInventory">SAVE INVENTORY ITEM</button><button class="btn-full btn-secondary" type="button" id="gnInventoryExport" style="flex:0 1 170px" data-i18n="lab.exportInventory">EXPORT INVENTORY</button></div></form><div class="gn-record-list" id="gnInventoryList"></div></details>
  </section>`);
  $('gnResearchForm')?.addEventListener('submit', event => { event.preventDefault(); saveResearchRecord(); });
  // B12 (2026-08-08): compact research notice — "?" toggles the body.
  document.querySelectorAll('.gn-research-info-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const body = document.getElementById(toggle.getAttribute('aria-controls'));
      const open = !body.hidden;
      body.hidden = open;
      toggle.setAttribute('aria-expanded', String(!open));
    });
  });
  // B12 rev (2026-08-08): Advanced fields (FUENTE + OBSERVACIONES) collapse.
  // Button + hidden div, not <details> — Chromium breaks details content
  // layout when styled, so we drive it explicitly.
  document.querySelectorAll('.gn-advanced-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const body = document.getElementById(toggle.getAttribute('aria-controls'));
      const open = !body.hidden;
      body.hidden = open;
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.classList.toggle('open', !open);
    });
  });
  $('gnResearchList')?.addEventListener('click', handleResearchAction);
  const inventoryNotesLabel = $('gnInventoryNotes')?.closest('label');
  inventoryNotesLabel?.insertAdjacentHTML('beforebegin', `<div class="gn-form-grid"><label><span data-i18n="lab.concentration">CONCENTRATION</span><input id="gnInventoryConcentration" placeholder="User-entered label" data-i18n-placeholder="lab.userLabelPlaceholder"></label><label><span data-i18n="lab.volume">VOLUME</span><input id="gnInventoryVolume" placeholder="User-entered volume" data-i18n-placeholder="lab.userVolumePlaceholder"></label><label><span data-i18n="lab.acquiredDate">ACQUIRED DATE</span><input id="gnInventoryAcquired" type="date"></label></div><div class="gn-form-grid"><label><span data-i18n="research.source">SOURCE</span><input id="gnInventorySource" placeholder="User-entered source" data-i18n-placeholder="lab.userSourcePlaceholder"></label><label><span data-i18n="lab.linkedMedication">LINKED MEDICATION</span><input id="gnInventoryMedication" placeholder="e.g. Zepbound" data-i18n-placeholder="lab.medicationPlaceholder"></label><label style="display:flex;align-items:center;gap:8px;grid-template-columns:auto 1fr"><input id="gnInventoryAutoDeduct" type="checkbox" style="width:auto"><span data-i18n="lab.autoDeduct">AUTO-DEDUCT SHOTS</span> <small data-i18n="lab.autoDeductHelp">Requires quantity unit mg and a matching medication.</small></label></div>`);
  installCustomPickers(page);
  $('gnInventoryForm')?.addEventListener('submit', event => { event.preventDefault(); saveInventoryRecord(); });
  $('gnInventoryExport')?.addEventListener('click', exportInventory);
  $('gnInventoryList')?.addEventListener('click', handleInventoryAction);
  page.classList.add('gn-lab-launchpad-mode');
  const overlay = document.createElement('section');
  overlay.className = 'gn-lab-tool-overlay';
  overlay.id = 'gnLabToolOverlay';
  overlay.hidden = true;
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-labelledby', 'gnLabToolTitle');
  overlay.innerHTML = `<div class="gn-lab-tool-shell"><header class="gn-lab-tool-head"><button type="button" class="gn-lab-back" data-lab-back data-i18n="lab.back">${tx('lab.back', '← BACK TO LAB')}</button><div><div class="gn-foundation-kicker" data-i18n="lab.kicker">// LAB SYSTEM</div><h2 id="gnLabToolTitle">${tx('lab.chooseSystem', 'LAB > CHOOSE A SYSTEM')}</h2></div><span class="gn-foundation-signal" data-i18n="lab.localRecords">LOCAL RECORDS</span></header><div id="gnLabToolHost" class="gn-lab-tool-host"></div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-lab-back]')?.addEventListener('click', closeLabTool);
  qa('[data-lab-focus]').forEach(tile => tile.addEventListener('click', () => openLabTool(tile.dataset.labFocus)));
  const banner = page.querySelector('#gnLabToolBanner');
  if (!banner) page.insertAdjacentHTML('beforeend', `<div id="gnLabToolBanner" class="gn-sr-only" role="status" aria-live="polite" aria-atomic="true"></div>`);
  renderLabFoundations();
}

function labSlot(node) {
  if (!node || moduleState.labOriginalSlots.has(node)) return;
  moduleState.labOriginalSlots.set(node, { parent: node.parentNode, next: node.nextSibling });
}

function restoreLabNodes() {
  [...moduleState.labOriginalSlots.entries()].reverse().forEach(([node, slot]) => {
    if (!slot.parent) return;
    if (slot.next?.parentNode === slot.parent) slot.parent.insertBefore(node, slot.next);
    else slot.parent.appendChild(node);
  });
  moduleState.labOriginalSlots.clear();
}

export function openLabTool(tool) {
  ensureLabFoundations();
  ensureDoseProjection();
  ensureCalculatorInventoryActions();
  if (tool === 'devices') ensureProfileHub();
  const overlay = $('gnLabToolOverlay'), host = $('gnLabToolHost'), page = $('pageLab');
  if (!overlay || !host || !page) return;
  moduleState.labToolLauncher = document.activeElement?.closest?.('[data-lab-focus]') || document.querySelector(`[data-lab-focus="${tool}"]`);
  const toolNodes = {
    calculators: ['labSegTabs', 'labSeg-draw', 'labSeg-recon', 'labSeg-supply', 'labSeg-assay', 'gnDoseProjection'].map($),
    research: [$('gnResearchSection')],
    inventory: [$('gnSupplySection')],
    devices: [document.querySelector('.gn-device-vault')],
    ledger: [$('gnLedgerSection')]
  }[tool]?.filter(Boolean) || [];
  if (!toolNodes.length) return;
  restoreLabNodes();
  toolNodes.forEach(labSlot);
  // LAB focus: subdue the directory while the tool content is moved.
  page.classList.add('gn-tool-focus');
  toolNodes.forEach(node => host.appendChild(node));
  [$('gnResearchSection'), $('gnLedgerSection'), $('gnSupplySection')].forEach(section => { if (section) section.open = section.id === (tool === 'research' ? 'gnResearchSection' : tool === 'inventory' ? 'gnSupplySection' : 'gnLedgerSection'); });
  const titles = { calculators: tx('lab.calculators', 'CALCULATORS'), research: tx('lab.researchPeptides', 'RESEARCH PEPTIDES'), inventory: tx('lab.inventory', 'INVENTORY'), devices: tx('lab.deviceVault', 'DEVICE REGISTRY'), ledger: tx('lab.eventLedger', 'EVENT LEDGER') };
  setText('gnLabToolTitle', titles[tool] || 'LAB SYSTEM');
  qa('[data-lab-focus]').forEach(tile => tile.classList.toggle('active', tile.dataset.labFocus === tool));
  page.classList.add('gn-lab-tool-open');
  overlay.hidden = false;
  overlay.classList.add('active');
  document.body.classList.add('gn-lab-tool-open');
  if (tool === 'calculators') showLabSeg('draw', document.querySelector('[data-labseg="draw"]'));
  renderLabFoundations();
  if (tool === 'devices') renderDeviceVault();
  // Focus scroll position: the overlay is the scroll container. For a newly
  // opened tool, reset scrollTop to 0 after layout — the shell's layout already
  // places the first content block below the sticky header (gap >= 12px).
  // scrollIntoView is deliberately avoided here: it scrolls the container down
  // and lands the content behind the sticky header. (CSS scroll-padding-top on
  // .gn-lab-tool-overlay keeps later anchor jumps clear of the header.)
  requestAnimationFrame(function () {
    overlay.scrollTop = 0;
  });
  overlay.querySelector('[data-lab-back]')?.focus({ preventScroll: true });
}

export function closeLabTool() {
  // Close the focused LAB tool view fully: hide the overlay, restore the DOM
  // nodes to their original slots, and release the focused-view state.
  const overlay = $('gnLabToolOverlay');
  const page = $('pageLab');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.hidden = true;
  }
  try { restoreLabNodes(); } catch (_) {}
  if (page) page.classList.remove('gn-tool-focus', 'gn-lab-tool-open');
  document.body?.classList.remove('gn-lab-tool-open');
  const launcher = moduleState.labToolLauncher;
  moduleState.labToolLauncher = null;
  if (launcher?.isConnected) window.setTimeout(() => launcher.focus({ preventScroll: true }), 0);
}

window.addEventListener('popstate', function (event) {
  // Browser Back while the LAB tool overlay is open -> close the tool view.
  const overlay = $('gnLabToolOverlay');
  // A nested picker/popover returning to the LAB layer must not also dismiss
  // the focused tool. The native shell owns that inner history entry first.
  if (overlay && event.state?.gnLayer === overlay.id) return;
  if (overlay && overlay.classList.contains('active')) {
    overlay.classList.remove('active');
    overlay.hidden = true;
    try { restoreLabNodes(); } catch (_) {}
    const page = $('pageLab');
    if (page) page.classList.remove('gn-tool-focus', 'gn-lab-tool-open');
    document.body?.classList.remove('gn-lab-tool-open');
    const launcher = moduleState.labToolLauncher;
    moduleState.labToolLauncher = null;
    if (launcher?.isConnected) window.setTimeout(() => launcher.focus({ preventScroll: true }), 0);
  }
});

/* v0.15.32 — global gesture tagger. Wraps the document so EVERY click anywhere
   in the app is captured at the very first moment and registers as a
   "user gesture element" with gnHaptics. This means the focus-gate
   permits confirm/error haptic for the next 250ms — fixing the
   Android Chrome case where tapping Save leaves focus on the save
   button and the focus-gate would otherwise suppress the success pulse. */
if (typeof document !== 'undefined' && !document.documentElement.dataset.gnGestureTagger) {
  document.documentElement.dataset.gnGestureTagger = '1';
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    /* Tag the most-actionable ancestor — the clickable thing. */
    const actionable = target.closest('button, a, summary, [role="button"], label, [tabindex]:not([tabindex="-1"])');
    /* Note: gnHaptics const declaration lives below this block; we read
       via window.gnHaptics (exposed by try { window.gnHaptics = gnHaptics; } further down)
       to avoid a Temporal Dead Zone ReferenceError on initial top-level execution. */
    if (actionable && typeof window.gnHaptics !== 'undefined' && window.gnHaptics.markUserGesture) {
      window.gnHaptics.markUserGesture(actionable);
    }
  }, true /* capture phase — runs before any handler */);
}

function announceLabToolStatus(label, detail) {
  const banner = document.getElementById('gnLabToolBanner');
  if (!banner) return;
  const combined = detail ? `${label} — ${detail}` : label;
  banner.textContent = '';
  requestAnimationFrame(() => { banner.textContent = combined; });
}

/* v0.15.30 — premium vibration feedback (additive). Gated by user pref + reduced-motion
   + input focus (unless the focus belongs to the element that just dispatched the action).
   v0.15.41 — VIBRATION REMOVED at founder direction (2026-09-12). The module is
   now a hard no-op for vibration: play() returns immediately, so NO vibration
   fires regardless of the stored gn_haptics_v1 preference ('on' or missing).
   The API surface is kept intact so existing call sites don't break. */
const gnHaptics = (() => {
  const KEY = 'gn_haptics_v1';
  let enabled = (() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === 'on' || stored === 'off') return stored === 'on';
    } catch (_) {}
    return true;
  })();
  const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  /* v0.15.32 — gesture-tag: gesture handlers register the element that
     received the user gesture (e.g. a Save button). The focus gate allows
     the haptic through for 250ms even if focus happens to be on that
     element (clicking a button leaves focus on the button). */
  let lastGestureEl = null;
  let lastGestureAt = 0;
  const markUserGesture = (el) => {
    lastGestureEl = el || null;
    lastGestureAt = Date.now();
  };
  const gestureTarget = (el) => markUserGesture(el);

  const focusInsideField = () => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  };
  const shouldSuppressForFocus = () => {
    if (!focusInsideField()) return false;
    /* v0.15.32 — gesture window: if the user just dispatched a gesture on
       this same element within the last 250ms, allow the haptic. Real world
       fix for the Android-Chrome-WebView case where tapping Save briefly
       leaves focus on the Save button (or a submit input inside the form)
       and the focus-gate was suppressing the success pulse. */
    const el = document.activeElement;
    if (lastGestureEl === el && Date.now() - lastGestureAt < 250) return false;
    return true;
  };
  const play = (pattern, opts = {}) => {
    /* v0.15.41 — vibration removed at founder direction. Hard no-op:
       nothing vibrates, whatever the stored preference says. The old
       gate/probe machinery was deleted; this stub keeps call sites working. */
    return;
  };
  const setEnabled = (next) => {
    enabled = !!next;
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (_) {}
  };
  /* v0.15.32 — direct-fire API used by actionFeedback: passes the gesture
     gate ONLY if a gesture was just registered. */
  const confirmNow = (gestureEl) => { if (gestureEl) markUserGesture(gestureEl); play([8, 30, 12]); };
  const errorNow = (gestureEl) => { if (gestureEl) markUserGesture(gestureEl); play([4, 30, 4, 30, 4]); };
  const lockNow = (gestureEl) => { if (gestureEl) markUserGesture(gestureEl); play([4, 18, 10]); };
  return {
    supported,
    enabled: () => enabled,
    setEnabled,
    markUserGesture,
    gestureTarget,
    confirmNow,
    errorNow,
    lockNow,
    tap: () => play(6),
    confirm: () => play([8, 30, 12]),
    error: () => play([4, 30, 4, 30, 4]),
    lock: () => play([4, 18, 10]),
    mode: () => play([6, 30, 6]),
    select: () => play([10, 24, 6]),
    fire: (pattern) => play(pattern, { skipFocus: true })
  };
})();

try { window.gnHaptics = gnHaptics; } catch (_) {}

function renderLabFoundations() {
  const list = $('gnResearchList');
  if (list) {
    const records = S.get('researchRecords', []);
    const localizedRecords = records.map(record => ({
      ...record,
      category: researchCategoryLabel(record.category),
      source: ['manual', 'Manual Entry', ''].includes(record.source || '') ? eventSourceText('manual') : record.source
    }));
    const active = localizedRecords.filter(record => !record.archived);
    const archived = localizedRecords.filter(record => record.archived);
    list.innerHTML = records.length ? `${active.slice().reverse().map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(record.category || tx('lab.customResearch', 'CUSTOM RESEARCH'))} · ${safeText(formatDate(record.date || record.createdAt))} · ${safeText(record.source || tx('research.manualEntry', 'Manual Entry'))}</small></div><span class="gn-record-state">${safeText(researchStateLabel(record.state))}</span><div style="display:flex;gap:4px"><button type="button" class="gn-record-delete" data-research-edit="${safeText(record.id)}" aria-label="${tx('lab.editResearch', 'Edit research record')}">✎</button><button type="button" class="gn-record-delete" data-research-archive="${safeText(record.id)}" aria-label="${tx('lab.archiveResearch', 'Archive research record')}">×</button></div></article>`).join('')}${archived.length ? `<div class="gn-ledger-copy" style="margin-top:10px">${tx("research.archivedHeading", "ARCHIVED RECORDS · Restore the record before editing.")}</div>${archived.slice().reverse().map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(record.category || tx('lab.customResearch', 'CUSTOM RESEARCH'))} · ${tx('research.archivedPrefix', 'Archived')} ${safeText(formatDate(record.modifiedAt || record.createdAt))}</small></div><span class="gn-record-state">${tx("research.archivedState", "ARCHIVED")}</span><button type="button" class="gn-record-delete gn-restore-edit" data-research-restore="${safeText(record.id)}" aria-label="${tx('lab.restoreResearch', 'Restore research record to edit')}">${tx("research.restoreToEdit", "RESTORE TO EDIT")}</button></article>`).join('')}` : ''}` : `<div class="gn-empty-state"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-lab-vessel"></use></svg></span><b>${tx("research.emptyTitle", "NO RESEARCH RECORDS YET")}</b><span>${tx("research.emptyBody", "Choose a library entry or create a custom record when you have something to preserve.")}</span></div>`;
  }
  const ledger = $('gnLedgerList');
  if (ledger) {
    const events = S.get('eventLedger', []).slice(-8).reverse();
    ledger.innerHTML = events.length ? events.map(event => `<div class="gn-ledger-row"><span class="gn-ledger-dot"></span><div><b>${safeText(eventLabelText(event.label || event.type))}</b><small>${safeText(formatDateTime(event.date || event.createdAt))}</small></div><em>${safeText(eventSourceText(event.source))} · ${safeText(eventStateText(event.state))}</em></div>`).join('') : `<div class="gn-empty-state"><b>${tx('lab.ledgerReady', 'LEDGER READY')}</b><span>${tx('lab.ledgerEmpty', 'New SHOTS and RESULTS events will appear here with their origin.')}</span></div>`;
  }
  renderInventory();
  syncCustomPickers($('pageLab') || document);
}

function renderInventory() {
  const list = $('gnInventoryList');
  if (!list) return;
  const records = S.get('inventory', []);
  const visible = records.filter(record => !record.archived);
  const archived = records.filter(record => record.archived);
  list.innerHTML = records.length ? `${visible.map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(inventoryTypeLabel(record.type))} · ${safeText(record.quantity ?? '—')} ${safeText(record.units || '')} · ${safeText(record.location || tx('lab.locationNotEntered', 'LOCATION NOT ENTERED'))}</small></div><span class="gn-record-state">${safeText(record.status === 'ARCHIVED' ? tx('research.archivedState', 'ARCHIVED') : tx('lab.active', 'ACTIVE'))}</span><div style="display:flex;gap:4px"><button type="button" class="gn-record-delete" data-inventory-edit="${safeText(record.id)}" aria-label="Edit inventory item" data-i18n-aria-label="lab.editInventoryAria">✎</button><button type="button" class="gn-record-delete" data-inventory-archive="${safeText(record.id)}" aria-label="Archive inventory item" data-i18n-aria-label="lab.archiveInventoryAria">×</button></div></article>`).join('')}${archived.length ? `<div class="gn-ledger-copy" style="margin-top:10px">${tx('research.archivedHeading', 'ARCHIVED RECORDS · Restore the record before editing.')}</div>${archived.map(record => `<article class="gn-record-row"><div><b>${safeText(record.name)}</b><small>${safeText(inventoryTypeLabel(record.type))} · ${tx('research.archivedPrefix', 'Archived')} ${safeText(formatDate(record.modifiedAt || record.createdAt))}</small></div><span class="gn-record-state">${tx('research.archivedState', 'ARCHIVED')}</span><button type="button" class="gn-record-delete gn-restore-edit" data-inventory-restore="${safeText(record.id)}" aria-label="Restore inventory item to edit" data-i18n-aria-label="lab.restoreInventoryAria">${tx('research.restoreToEdit', 'RESTORE TO EDIT')}</button></article>`).join('')}` : ''}` : `<div class="gn-empty-state"><span class="gn-icon gn-icon-md gn-accent-c"><svg><use href="#gn-archive-core"></use></svg></span><b>${tx('lab.inventoryReady', 'SAVED INVENTORY READY')}</b><span>${tx('lab.inventoryEmpty', 'Record supplies separately from educational calculators when you want a persistent list.')}</span></div>`;
}

function saveInventoryRecord() {
  const name = $('gnInventoryName')?.value?.trim();
  if (!name) { actionFeedback(tx('inventory.notSaved', 'INVENTORY NOT SAVED'), tx('inventory.addName', 'ADD AN ITEM NAME BEFORE COMMITTING'), true); return; }
  const records = S.get('inventory', []);
  const now = new Date().toISOString();
  const id = moduleState.inventoryEditId || createId('inventory');
  const existing = records.find(record => record.id === id);
  const history = [...(existing?.history || []), { at: now, action: existing ? 'UPDATED' : 'CREATED', source: 'manual' }];
  const record = { id, name, type: normalizeInventoryType($('gnInventoryType')?.value), quantity: Number($('gnInventoryQuantity')?.value) || 0, units: $('gnInventoryUnits')?.value?.trim() || '', medication: $('gnInventoryMedication')?.value?.trim() || '', autoDeduct: Boolean($('gnInventoryAutoDeduct')?.checked), concentration: $('gnInventoryConcentration')?.value?.trim() || '', volume: $('gnInventoryVolume')?.value?.trim() || '', acquired: $('gnInventoryAcquired')?.value || '', expires: $('gnInventoryExpiry')?.value || '', inventorySource: $('gnInventorySource')?.value?.trim() || '', location: $('gnInventoryLocation')?.value?.trim() || '', notes: $('gnInventoryNotes')?.value?.trim() || '', status: existing?.status || 'ACTIVE', archived: existing?.archived || false, source: existing?.source || 'manual', state: existing?.state || 'confirmed', history, createdAt: existing?.createdAt || now, modifiedAt: now };
  const index = records.findIndex(item => item.id === id);
  if (index >= 0) records[index] = record; else records.push(record);
  S.set('inventory', records); appendEventLedger({ type: 'INVENTORY', recordId: record.id, label: existing ? 'INVENTORY UPDATED' : 'INVENTORY ITEM SAVED' }); queueCloudSync('workspace');
  moduleState.inventoryEditId = null; $('gnInventoryForm')?.reset(); setText('gnInventorySave', 'SAVE INVENTORY ITEM'); renderInventory(); actionFeedback(existing ? tx('inventory.updated', 'INVENTORY UPDATED') : tx('inventory.saved', 'INVENTORY SAVED'), tx('inventory.timelineUpdated', 'SAVED INVENTORY // TIMELINE UPDATED'));
}

function handleInventoryAction(event) {
  const button = event.target.closest('button[data-inventory-edit],button[data-inventory-archive],button[data-inventory-restore]');
  if (!button) return;
  const id = button.dataset.inventoryEdit || button.dataset.inventoryArchive || button.dataset.inventoryRestore;
  const records = S.get('inventory', []);
  const record = records.find(item => item.id === id);
  if (!record) return;
  if (button.dataset.inventoryEdit) {
    moduleState.inventoryEditId = id;
    $('gnInventoryName').value = record.name || ''; $('gnInventoryType').value = normalizeInventoryType(record.type); $('gnInventoryQuantity').value = record.quantity || ''; $('gnInventoryUnits').value = record.units || ''; $('gnInventoryMedication').value = record.medication || ''; $('gnInventoryAutoDeduct').checked = Boolean(record.autoDeduct); $('gnInventoryConcentration').value = record.concentration || ''; $('gnInventoryVolume').value = record.volume || ''; $('gnInventoryAcquired').value = record.acquired || ''; $('gnInventoryExpiry').value = record.expires || ''; $('gnInventorySource').value = record.inventorySource || ''; $('gnInventoryLocation').value = record.location || ''; $('gnInventoryNotes').value = record.notes || ''; setText('gnInventorySave', tx('lab.updateInventory', 'UPDATE INVENTORY ITEM')); syncCustomPicker($('gnInventoryType')); syncCustomDate($('gnInventoryAcquired')); syncCustomDate($('gnInventoryExpiry')); $('gnInventoryForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
  }
  if (button.dataset.inventoryArchive) { record.archived = true; record.status = 'ARCHIVED'; record.modifiedAt = new Date().toISOString(); record.history = [...(record.history || []), { at: record.modifiedAt, action: 'ARCHIVED', source: 'manual' }]; actionFeedback(tx('inventory.archived', 'INVENTORY ARCHIVED'), tx('inventory.historyPreserved', 'HISTORY PRESERVED // RECORD REMAINS RECOVERABLE')); }
  else { record.archived = false; record.status = 'ACTIVE'; record.modifiedAt = new Date().toISOString(); record.history = [...(record.history || []), { at: record.modifiedAt, action: 'RESTORED', source: 'manual' }]; actionFeedback(tx('inventory.restored', 'INVENTORY RESTORED'), tx('inventory.timelineUpdated', 'SAVED INVENTORY // TIMELINE UPDATED')); }
  S.set('inventory', records); appendEventLedger({ type: 'INVENTORY', recordId: record.id, label: record.archived ? 'INVENTORY ARCHIVED' : 'INVENTORY RESTORED' }); queueCloudSync('workspace'); renderInventory();
}

export function exportInventory() {
  downloadFile('gridnode-inventory.json', JSON.stringify({ app: 'GRID//NODE', exportedAt: new Date().toISOString(), inventory: S.get('inventory', []) }, null, 2), 'application/json');
  actionFeedback(tx('inventory.exportReady', 'INVENTORY EXPORT READY'), tx('inventory.recordsPrepared', 'USER-CONTROLLED RECORDS PREPARED'));
}

function saveResearchRecord() {
  const name = $('gnResearchName')?.value?.trim();
  const nameInput = $('gnResearchName');
  const dateInput = $('gnResearchDate');
  if (nameInput) nameInput.setAttribute('aria-invalid', 'false');
  if (dateInput) dateInput.setAttribute('aria-invalid', 'false');
  if (!name) {
    if (nameInput) {
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.setAttribute('aria-describedby', 'gnResearchErrorName');
      let hint = $('gnResearchErrorName');
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'gnResearchErrorName';
        hint.className = 'gn-form-error';
        hint.dataset.i18n = 'research.addName';
        hint.textContent = tx('research.addName', 'ADD A NAME BEFORE COMMITTING');
        nameInput.insertAdjacentElement('afterend', hint);
      } else {
        hint.textContent = tx('research.addName', 'ADD A NAME BEFORE COMMITTING');
      }
    }
    announceLabToolStatus(tx('research.notSaved', 'RESEARCH RECORD NOT SAVED'), tx('research.addName', 'ADD A NAME BEFORE COMMITTING'));
    actionFeedback(tx('research.notSaved', 'RESEARCH RECORD NOT SAVED'), tx('research.addName', 'ADD A NAME BEFORE COMMITTING'), true);
    nameInput?.focus();
    return;
  }
  if (nameInput) nameInput.removeAttribute('aria-describedby');
  const records = S.get('researchRecords', []), now = new Date().toISOString(), id = moduleState.researchEditId || createId('research'), existing = records.find(item => item.id === id);
  const categoryInput = $('gnResearchCategory');
  const shotDate = dateInput?.value?.trim();
  if (!shotDate) {
    if (dateInput) {
      dateInput.setAttribute('aria-invalid', 'true');
      dateInput.setAttribute('aria-describedby', 'gnResearchErrorDate');
      let hint = $('gnResearchErrorDate');
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'gnResearchErrorDate';
        hint.className = 'gn-form-error';
        hint.dataset.i18n = 'research.addDate';
        hint.textContent = tx('research.addDate', 'SELECT A DATE BEFORE COMMITTING');
        dateInput.insertAdjacentElement('afterend', hint);
      } else {
        hint.textContent = tx('research.addDate', 'SELECT A DATE BEFORE COMMITTING');
      }
    }
    announceLabToolStatus(tx('research.notSaved', 'RESEARCH RECORD NOT SAVED'), tx('research.addDate', 'SELECT A DATE BEFORE COMMITTING'));
    actionFeedback(tx('research.notSaved', 'RESEARCH RECORD NOT SAVED'), tx('research.addDate', 'SELECT A DATE BEFORE COMMITTING'), true);
    dateInput?.focus();
    return;
  }
  if (dateInput) dateInput.removeAttribute('aria-describedby');
  const record = { id, name, category: normalizeResearchCategory(categoryInput?.dataset.categoryId || categoryInput?.value), date: shotDate, notes: $('gnResearchNotes')?.value?.trim() || '', source: $('gnResearchSource')?.value?.trim() || existing?.source || 'manual', state: $('gnResearchState')?.value || existing?.state || 'TRACKING', archived: existing?.archived || false, createdAt: existing?.createdAt || now, modifiedAt: now };
  const index = records.findIndex(item => item.id === id);
  if (index >= 0) records[index] = record; else records.push(record);
  S.set('researchRecords', records); appendEventLedger({ type: 'RESEARCH', recordId: record.id, date: record.date, label: existing ? 'RESEARCH RECORD UPDATED' : 'RESEARCH RECORD CAPTURED' });
  queueCloudSync('workspace'); moduleState.researchEditId = null; $('gnResearchForm')?.reset(); if ($('gnResearchName')) { $('gnResearchName').readOnly = false; $('gnResearchName').removeAttribute('data-research-locked'); $('gnResearchName')?.setAttribute('placeholder', tx('research.recordNamePlaceholder', 'Select a library entry or type a custom name')); } const sb = $('gnResearchForm')?.querySelector('[data-research-badge]'); if (sb) sb.textContent = ''; setText('gnResearchSave', tx('research.save', 'SAVE RESEARCH RECORD')); const sr = $('gnResearchSave'); if (sr) sr.textContent = tx('research.save', 'SAVE RESEARCH RECORD'); const rm = $('gnResearchMode'); if (rm) { rm.style.display = 'none'; rm.dataset.mode = 'pick'; } const rcat = $('gnResearchCategory'); if (rcat) { rcat.readOnly = false; rcat.removeAttribute('data-category-locked'); } $('gnResearchErrorName')?.remove(); $('gnResearchErrorDate')?.remove(); if ($('gnResearchName')) { $('gnResearchName').removeAttribute('aria-invalid'); $('gnResearchName').removeAttribute('aria-describedby'); } if ($('gnResearchDate')) { $('gnResearchDate').removeAttribute('aria-invalid'); $('gnResearchDate').removeAttribute('aria-describedby'); }
    renderLabFoundations();
    const successLabel = existing ? tx('research.updated', 'RESEARCH RECORD UPDATED') : tx('research.captured', 'RESEARCH RECORD CAPTURED');
    const successDetail = tx('research.timelineSignal', 'TIMELINE UPDATED // USER-ENTERED ONLY');
    announceLabToolStatus(successLabel, successDetail);
    actionFeedback(successLabel, successDetail);
    pulseGnCapture($('gnResearchSave'));
}

function handleResearchAction(event) {
  const button = event.target.closest('button[data-research-edit],button[data-research-archive],button[data-research-restore]');
  if (!button) return;
  const id = button.dataset.researchEdit || button.dataset.researchArchive || button.dataset.researchRestore;
  const records = S.get('researchRecords', []), record = records.find(item => item.id === id);
  if (!record) return;
  if (button.dataset.researchEdit) {
    moduleState.researchEditId = id; $('gnResearchName').value = record.name || ''; const isLibraryName = Boolean(record.name) && RESEARCH_LIBRARY.some(g => g.names.includes(record.name)); if (isLibraryName) { const em = $('gnResearchMode'); if (em) { em.style.display = ''; em.dataset.mode = 'library'; } const emc = $('gnModeLibraryChip'); if (emc) { emc.style.display = ''; emc.textContent = tx('research.modeLibrarySelected', 'BIBLIOTECA · SELECCIONADA') + ' ' + tx('research.lockGlyph', '🔒'); } const ecc = $('gnModeCategoryChip'); if (ecc) { ecc.style.display = ''; ecc.textContent = tx('research.modeCategoryAssigned', 'CATEGORÍA · ASIGNADA') + ' ' + tx('research.lockGlyph', '🔒'); } const ecb = $('gnModeBack'); if (ecb) ecb.style.display = 'none'; const ect = document.querySelector('.gn-research-mode-custom .gn-research-mode-title'); if (ect) ect.style.display = 'none'; const ecw = $('gnCustomWarning'); if (ecw) ecw.style.display = 'none'; } else { researchEnterCustomMode(); const ec2 = $('gnResearchMode'); if (ec2) ec2.style.display = ''; } $('gnResearchName').readOnly = isLibraryName; if (isLibraryName) $('gnResearchName').setAttribute('data-research-locked', '1'); else $('gnResearchName').removeAttribute('data-research-locked'); const editBadgeHost = $('gnResearchForm')?.querySelector('[data-research-badge]'); if (editBadgeHost) editBadgeHost.textContent = isLibraryName ? tx('research.presetBadge', 'PRESET') : ''; $('gnResearchName')?.setAttribute('placeholder', isLibraryName ? tx('research.presetLockedPlaceholder', 'Library entry — name is locked') : tx('research.recordNamePlaceholder', 'Select a library entry or type a custom name')); $('gnResearchCategory').dataset.categoryId = normalizeResearchCategory(record.category); $('gnResearchCategory').value = researchCategoryLabel(record.category); $('gnResearchDate').value = record.date || ''; $('gnResearchState').value = record.state || 'TRACKING'; $('gnResearchSource').value = (record.source && record.source !== 'manual') ? record.source : ''; $('gnResearchNotes').value = record.notes || ''; setText('gnResearchSave', tx('research.update', 'UPDATE RESEARCH RECORD')); syncCustomPicker($('gnResearchState')); syncCustomDate($('gnResearchDate')); $('gnResearchForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
  }
  record.archived = Boolean(button.dataset.researchArchive); record.state = record.archived ? 'ARCHIVED' : (record.state === 'ARCHIVED' ? 'TRACKING' : record.state); record.modifiedAt = new Date().toISOString(); S.set('researchRecords', records); appendEventLedger({ type: 'RESEARCH', recordId: record.id, label: record.archived ? 'RESEARCH RECORD ARCHIVED' : 'RESEARCH RECORD RESTORED' }); queueCloudSync('workspace'); renderLabFoundations(); actionFeedback(record.archived ? tx('research.archived', 'RESEARCH RECORD ARCHIVED') : tx('research.restored', 'RESEARCH RECORD RESTORED'), tx('inventory.historyPreserved', 'HISTORY PRESERVED // TIMELINE UPDATED'));
}

function deleteResearchRecord(id) {
  S.set('researchRecords', S.get('researchRecords', []).filter(record => record.id !== id)); queueCloudSync('workspace'); renderLabFoundations(); actionFeedback(tx('research.removed', 'RESEARCH RECORD REMOVED'), tx('research.localUpdated', 'LOCAL RECORD UPDATED'));
}

function closeProfileHub() {
  const prev = localStorage.getItem('gn_last_active_page_v1') || 'Dash';
  showPage(prev === 'Profile' ? 'Dash' : prev);
}

function ensureProfileHub() {
  const page = $('pageProfile');
  if (!page || page.querySelector('[data-gn-profile-hub]')) return;
  const hero = $('gnVaultSummary') || $('profAvaWrap')?.closest('[style*="background:#0e0e16"]');
  if (!hero) return;
  const chev = '<span class="gn-vault-chev" aria-hidden="true">›</span>';
  const ico = (id) => `<span class="gn-vault-row-ico" aria-hidden="true"><svg><use href="#${id}"></use></svg></span>`;
  hero.insertAdjacentHTML('afterend', `<section class="gn-vault" data-gn-profile-hub aria-label="${tx('vault.hubAria', 'Node settings')}">
    <div class="gn-vault-group" data-gn-vault-group="profile">
      <div class="gn-vault-group-label" data-i18n="vault.groupProfile">// PROFILE</div>
      <div id="gnVaultProfileCards" class="gn-vault-cards"></div>
    </div>
    <div class="gn-vault-group" data-gn-vault-group="data">
      <div class="gn-vault-group-label" data-i18n="vault.yourData">// YOUR DATA</div>
      <div class="gn-vault-card-static">
        <button type="button" class="gn-vault-row" onclick="exportCSV()">${ico('gn-data-packet')}<span class="gn-vault-row-txt"><b data-i18n="vault.exportCsv">Export CSV</b><small data-i18n="vault.exportCsvHelp">Download readable records</small></span>${chev}</button>
        <button type="button" class="gn-vault-row" onclick="exportBackup()">${ico('gn-archive-core')}<span class="gn-vault-row-txt"><b data-i18n="vault.exportBackup">Export Backup</b><small data-i18n="vault.exportBackupHelp">Save a complete local copy</small></span>${chev}</button>
        <button type="button" class="gn-vault-row" onclick="openImportDialog()">${ico('gn-timeline-node')}<span class="gn-vault-row-txt"><b data-i18n="vault.importData">Import Data</b><small data-i18n="vault.importDataHelp">Bring history from Shotsy or CSV</small></span>${chev}</button>
      </div>
      <div class="gn-vault-card-static">
        <button type="button" class="gn-vault-row" onclick="openPrivacyPolicy()">${ico('gn-check')}<span class="gn-vault-row-txt"><b data-i18n="vault.privacyPolicy">Privacy Policy</b><small data-i18n="vault.privacyPolicyHelp">How your data is stored</small></span>${chev}</button>
        <button type="button" class="gn-vault-row" onclick="openDataOwnership()">${ico('gn-operator-profile')}<span class="gn-vault-row-txt"><b data-i18n="vault.dataOwnership">Data Ownership</b><small data-i18n="vault.dataOwnershipHelp">Export or delete anytime</small></span>${chev}</button>
      </div>
    </div>
    <div class="gn-vault-group" data-gn-vault-group="prefs">
      <div class="gn-vault-group-label" data-i18n="vault.groupPreferences">// PREFERENCES</div>
      <div class="gn-vault-card-static">
        <button type="button" class="gn-vault-row" onclick="replayGuidedTour()">${ico('gn-signal')}<span class="gn-vault-row-txt"><b data-i18n="vault.replayTour">Replay Tour</b><small data-i18n="vault.replayTourHelp">Restart the guided tour</small></span>${chev}</button>
        <div class="gn-vault-row gn-vault-row-static">${ico('gn-phase-ring')}<span class="gn-vault-row-txt"><b data-i18n="vault.theme">Theme</b><small data-i18n="vault.themeHelp">Dark or light display</small></span><span class="gn-theme-toggle-host" role="group" aria-label="THEME"></span></div>
        <button type="button" class="gn-vault-row" onclick="toggleGnHaptics()"><span class="gn-vault-row-txt"><b data-i18n="vault.hapticsTitle">Haptics</b><small id="gnHapticsHelp"></small></span><span id="gnHapticsState" class="gn-vault-haptics-state" aria-hidden="true"></span></button>
      </div>
    </div>
    <div class="gn-vault-group" data-gn-vault-group="devices">
      <div class="gn-vault-group-label" data-i18n="vault.deviceVaultKicker">// DEVICE REGISTRY</div>
      <details class="gn-vault-card" id="gnDeviceCard">
        <summary class="gn-vault-card-head">
          <span class="gn-vault-card-ico" aria-hidden="true"><svg><use href="#gn-network-node"></use></svg></span>
          <span class="gn-vault-card-titles"><b data-i18n="vault.deviceRegistryTitle">DEVICE REGISTRY</b><small id="gnDeviceSummary" class="gn-vault-card-sub"></small></span>
          ${chev}
        </summary>
        <div class="gn-vault-card-body">
          <p class="gn-ledger-copy" data-i18n="vault.deviceVaultPhilosophy">The device is not the cartridge. The cartridge is not the dose. The dose is not the plan. Device identity, inventory, SHOT events, and LOADOUT remain separate records.</p>
          <details class="gn-vault-subcard" id="gnDeviceFormWrap">
            <summary class="gn-vault-subcard-head"><span data-i18n="vault.registerDevice">REGISTER DEVICE</span>${chev}</summary>
            <form class="gn-record-form" id="gnDeviceForm"><div class="gn-form-grid"><label><span data-i18n="vault.deviceName">DEVICE NAME</span><input id="gnDeviceName" required placeholder="e.g. Home pen A" data-i18n-placeholder="vault.deviceNamePlaceholder"></label><label><span data-i18n="vault.deviceType">DEVICE TYPE</span><select id="gnDeviceType"><option value="REUSABLE" data-i18n="vault.deviceTypeReusable">Reusable pen</option><option value="DISPOSABLE" data-i18n="vault.deviceTypeDisposable">Disposable pen</option><option value="AUTOINJECTOR" data-i18n="vault.deviceTypeAutoinjector">Autoinjector</option><option value="OTHER" data-i18n="vault.deviceTypeOther">Other device</option></select></label><label><span data-i18n="vault.deviceStatus">STATUS</span><select id="gnDeviceStatus">${DEVICE_STATUSES.map(status => { const key = 'vault.status' + status.replace(/\s+/g, ''); return `<option value="${status}" data-i18n="${key}">${tx(key, status)}</option>`; }).join('')}</select></label></div><label><span data-i18n="vault.deviceLabelNotes">LABEL / NOTES</span><textarea id="gnDeviceNotes" rows="2" placeholder="User-entered identity notes" data-i18n-placeholder="vault.deviceNotesPlaceholder"></textarea></label><button class="btn-full btn-secondary" type="submit" data-i18n="vault.deviceRegister">REGISTER DEVICE IDENTITY</button></form>
          </details>
          <div class="gn-device-list" id="gnDeviceList"></div>
        </div>
      </details>
    </div>
    <div class="gn-vault-group" data-gn-vault-group="account">
      <div class="gn-vault-group-label" data-i18n="vault.groupAccount">// ACCOUNT</div>
      <div class="gn-vault-card-static">
        <div class="gn-vault-row gn-vault-row-static">${ico('gn-vault-core')}<span class="gn-vault-row-txt"><b data-i18n="vault.connectedAccount">Connected Account</b><small id="gnProfileAccount">Local device session</small></span></div>
        <button type="button" class="gn-vault-row" data-gn-local-only onclick="openCloudConnect()">${ico('gn-network-node')}<span class="gn-vault-row-txt"><b data-i18n="vault.connectAccount">Connect Cloud Account</b><small data-i18n="vault.connectAccountHelp">Use a NODE KEY to sync across devices</small></span>${chev}</button>
        <button type="button" class="gn-vault-row" onclick="openSystemUpdate()">${ico('gn-protocol-event')}<span class="gn-vault-row-txt"><b data-i18n="vault.whatsNew">What's New</b><small data-gn-whatsnew-version></small></span>${chev}</button>
        <button type="button" class="gn-vault-row gn-vault-row-signout" data-gn-cloud-only onclick="openSignOutModal()">${ico('gn-disconnect-node')}<span class="gn-vault-row-txt"><b data-i18n="vault.signOut">SIGN OUT</b><small data-i18n="vault.localOnlyFooter">Your data stays on this device.</small></span>${chev}</button>
      </div>
      <div class="gn-vault-footline"><span data-i18n="vault.appVersion">App Version</span> <small id="gnProfileVersion"></small> · <button type="button" class="gn-linklike" onclick="window.location.reload()"><span data-i18n="vault.reloadApp">Reload App</span></button></div>
    </div>
    <details class="gn-danger-zone gn-vault-danger">
      <summary class="gn-vault-danger-head"><span data-i18n="vault.dangerZone">Danger Zone</span>${chev}</summary>
      <div class="gn-vault-card-static">
        <button type="button" class="gn-vault-row gn-vault-row-danger" onclick="openDeleteLocalData()">${ico('gn-trash')}<span class="gn-vault-row-txt"><b data-i18n="vault.deleteAllData">Delete All Local Data</b><small data-i18n="vault.deleteAllDataHelp">Remove this device record</small></span>${chev}</button>
        <button type="button" class="gn-vault-row gn-vault-row-danger" data-gn-cloud-only onclick="openDeleteCloudAccount()">${ico('gn-trash')}<span class="gn-vault-row-txt"><b data-i18n="vault.deleteCloudAccount">Delete Cloud Account</b><small data-i18n="vault.deleteCloudAccountHelp">Requires server deletion control</small></span>${chev}</button>
      </div>
    </details>
    <div class="oskar-dedication gn-vault-oskar"><span data-i18n="vault.oskarMemorialPre">In memory of</span> <span class="oskar-name" data-i18n="vault.oskarName">Oskar</span> <span data-i18n="vault.oskarMemorialPost">(2011–2024) ♥</span></div>
  </section>`);
  const hub = page.querySelector('[data-gn-profile-hub]');
  const profileCards = $('gnVaultProfileCards');
  ['gnMedCard', 'gnBodyCard'].forEach(id => { const el = document.getElementById(id); if (el && profileCards && el.parentElement !== profileCards) profileCards.appendChild(el); });
  const prefsCard = $('gnPreferencesCard');
  const prefsGroup = hub?.querySelector('[data-gn-vault-group="prefs"]');
  if (prefsCard && prefsGroup && prefsCard.parentElement !== prefsGroup) prefsGroup.appendChild(prefsCard);
  installCustomPickers(hero.parentElement || page);
  window.GN_I18N?.applyTo?.(page);
  const updateVersion = hero.parentElement?.querySelector('[data-system-update-version]');
  if (updateVersion) updateVersion.textContent = APP_VERSION;
  const updateCopy = hero.parentElement?.querySelector('#gnSystemUpdateCard p');
  if (updateCopy) updateCopy.textContent = tx('vault.systemUpdateNotes', `${APP_VERSION} — LAB tools now open in focused views, the Phase Engine adds neutral cycle context, and the LIVE NODE status is compact on mobile and desktop.`).replace(/^v[^ ]+/, APP_VERSION);
  const whatsNewVersion = document.querySelector('[data-gn-whatsnew-version]');
  if (whatsNewVersion) whatsNewVersion.textContent = `v${APP_VERSION}`;
  $('gnSystemUpdateDismiss')?.addEventListener('click', dismissSystemUpdate);
  document.querySelector('[data-system-update-open]')?.addEventListener('click', openSystemUpdate);
  $('gnDeviceForm')?.addEventListener('submit', event => { event.preventDefault(); saveDeviceRecord(); });
  $('gnDeviceList')?.addEventListener('click', handleDeviceAction);
  renderDeviceVault();
  ensurePasskeySection();
  renderGnHapticsState();
  syncCloudOnlyButtons();
}

/* v0.15.41 — SIGN OUT and Delete Cloud Account are cloud-only controls. A
 * local-only user must never be offered to sign out of nothing or delete a
 * cloud account that doesn't exist. The hub template is built once, so this
 * re-syncs visibility on every profile render (called from 09-vault). */
function syncCloudOnlyButtons() {
  let hasCloud = false;
  try { hasCloud = !!(typeof state !== 'undefined' && state && state.cloud); } catch (_) {}
  document.querySelectorAll('[data-gn-cloud-only]').forEach((el) => { el.hidden = !hasCloud; });
  document.querySelectorAll('[data-gn-local-only]').forEach((el) => { el.hidden = hasCloud; });
}

function renderDeviceVault() {
  const list = $('gnDeviceList');
  const summary = $('gnDeviceSummary');
  const devices = S.get('devices', []);
  if (summary) summary.textContent = devices.length ? tx('vault.deviceCount', '{count} REGISTERED', { count: devices.length }) : tx('vault.deviceReadyEmpty', 'DEVICE REGISTRY READY');
  if (!list) return;
  const active = devices.filter(device => !device.archived), archived = devices.filter(device => device.archived);
  list.innerHTML = devices.length ? `${active.slice().reverse().map(device => `<article class="gn-record-row"><div><b>${safeText(device.name)}</b><small>${safeText(deviceTypeLabel(device.type))} · ${tx('vault.privateId', 'PRIVATE ID')} ${safeText(device.qrIdentity || tx('vault.devicePending', 'PENDING'))}</small></div><span class="gn-record-state">${safeText(deviceStatusLabel(device.status))}</span><div style="display:flex;gap:4px"><button type="button" class="gn-record-delete" data-device-edit="${safeText(device.id)}" aria-label="${tx('vault.editDevice', 'Edit device')}">✎</button><button type="button" class="gn-record-delete" data-device-retire="${safeText(device.id)}" aria-label="${tx('vault.retireDevice', 'Retire device')}">×</button></div></article>`).join('')}${archived.length ? `<div class="gn-ledger-copy" style="margin-top:10px">${tx('vault.deviceArchived', 'RETIRED / ARCHIVED DEVICES')}</div>${archived.slice().reverse().map(device => `<article class="gn-record-row"><div><b>${safeText(device.name)}</b><small>${safeText(deviceTypeLabel(device.type))} · ${tx('vault.privateIdentityPreserved', 'Private identity preserved')}</small></div><span class="gn-record-state">${safeText(deviceStatusLabel(device.status || 'RETIRED'))}</span><button type="button" class="gn-record-delete" data-device-restore="${safeText(device.id)}" aria-label="${tx('vault.restoreDevice', 'Restore device')}">↺</button></article>`).join('')}` : ''}` : `<div class="gn-empty-state"><span class="gn-icon gn-icon-md gn-accent-y"><svg><use href="#gn-vault-core"></use></svg></span><b>${tx('vault.deviceReadyEmpty', 'DEVICE REGISTRY READY')}</b><span>${tx('vault.deviceReadyEmptyHelp', 'Register a physical object when you want its identity and lifecycle preserved.')}</span></div>`;
}

function renderGnHapticsState() {
  const stateEl = $('gnHapticsState');
  const helpEl = $('gnHapticsHelp');
  if (!stateEl) return;
  const supported = window.gnHaptics?.supported?.();
  const enabled = window.gnHaptics?.enabled?.();
  if (!supported) {
    stateEl.textContent = '·';
    if (helpEl) helpEl.textContent = tx('vault.hapticsUnsupported', 'Not supported on this device.');
    return;
  }
  stateEl.textContent = enabled ? '◆' : '◇';
  if (helpEl) helpEl.textContent = enabled ? tx('vault.hapticsOn', 'ON — save and lock actions vibrate briefly.') : tx('vault.hapticsOff', 'OFF — silent confirmation. Tap to enable.');
}

function toggleGnHaptics() {
  if (!window.gnHaptics?.supported?.()) {
    probeGnHaptics();
    return;
  }
  window.gnHaptics.setEnabled(!window.gnHaptics.enabled());
  renderGnHapticsState();
  try { window.gnHaptics.tap(); } catch (_) {}
}

/* Live vibration probe — v0.15.41: vibration removed at founder direction, so the
 * probe no longer fires a test pulse. It only reports API presence for
 * diagnostics; the verdict can never re-enable vibration. */
function probeGnHaptics() {
  const helpEl = $('gnHapticsHelp');
  let apiType = 'unknown';
  try { apiType = typeof navigator !== 'undefined' ? typeof navigator.vibrate : 'no navigator'; } catch (_) {}
  const callResult = 'not attempted (vibration disabled in v0.15.41)';
  try { console.info('[GRID//NODE haptics probe]', 'vibrate typeof:', apiType, '| test pulse:', callResult); } catch (_) {}
  if (helpEl) helpEl.textContent = 'Probe: vibrate API is ' + apiType + '; ' + callResult + '.';
}

function pulseGnCapture(saveButton) {
  if (!saveButton || !saveButton.classList) return;
  saveButton.classList.remove('gn-capture-pulse');
  void saveButton.offsetWidth;
  saveButton.classList.add('gn-capture-pulse');
  setTimeout(() => saveButton.classList.remove('gn-capture-pulse'), 560);
}

function saveDeviceRecord() {
  const name = $('gnDeviceName')?.value?.trim();
  if (!name) { actionFeedback(tx('device.notRegistered', 'DEVICE NOT REGISTERED'), tx('device.addName', 'ADD A DEVICE NAME BEFORE COMMITTING'), true); return; }
  const devices = S.get('devices', []), now = new Date().toISOString(), id = moduleState.deviceEditId || createId('device'), existing = devices.find(item => item.id === id);
  const device = { ...(existing || {}), id, name, type: normalizeDeviceType($('gnDeviceType')?.value), status: $('gnDeviceStatus')?.value || 'NEEDS CHECKING', notes: $('gnDeviceNotes')?.value?.trim() || '', qrIdentity: existing?.qrIdentity || `GN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, source: existing?.source || 'manual', state: existing?.state || 'confirmed', archived: existing?.archived || false, createdAt: existing?.createdAt || now, modifiedAt: now };
  const index = devices.findIndex(item => item.id === id); if (index >= 0) devices[index] = device; else devices.push(device);
  S.set('devices', devices); appendEventLedger({ type: 'DEVICE', recordId: device.id, label: existing ? 'DEVICE IDENTITY UPDATED' : 'DEVICE IDENTITY REGISTERED' }); queueCloudSync('workspace'); moduleState.deviceEditId = null; $('gnDeviceForm')?.reset(); const wrap = document.getElementById('gnDeviceFormWrap'); if (wrap) wrap.open = false; renderDeviceVault(); actionFeedback(existing ? 'DEVICE IDENTITY UPDATED' : 'DEVICE IDENTITY REGISTERED', 'DEVICE REGISTRY UPDATED // HISTORY PRESERVED');
}

function handleDeviceAction(event) {
  const button = event.target.closest('button[data-device-edit],button[data-device-retire],button[data-device-restore]');
  if (!button) return;
  const id = button.dataset.deviceEdit || button.dataset.deviceRetire || button.dataset.deviceRestore;
  const devices = S.get('devices', []), device = devices.find(item => item.id === id);
  if (!device) return;
  if (button.dataset.deviceEdit) { moduleState.deviceEditId = id; $('gnDeviceName').value = device.name || ''; $('gnDeviceType').value = normalizeDeviceType(device.type); $('gnDeviceStatus').value = device.status || 'NEEDS CHECKING'; $('gnDeviceNotes').value = device.notes || ''; const submit = document.querySelector('#gnDeviceForm button[type="submit"]'); if (submit) submit.textContent = tx('vault.updateDevice', 'UPDATE DEVICE IDENTITY'); syncCustomPicker($('gnDeviceType')); syncCustomPicker($('gnDeviceStatus')); const wrap = document.getElementById('gnDeviceFormWrap'); if (wrap) wrap.open = true; $('gnDeviceForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  device.archived = Boolean(button.dataset.deviceRetire); device.status = device.archived ? 'RETIRED' : 'READY'; device.modifiedAt = new Date().toISOString(); S.set('devices', devices); appendEventLedger({ type: 'DEVICE', recordId: id, label: device.archived ? 'DEVICE RETIRED' : 'DEVICE RESTORED' }); queueCloudSync('workspace'); renderDeviceVault(); actionFeedback(device.archived ? 'DEVICE RETIRED' : 'DEVICE RESTORED', 'HARDWARE HISTORY PRESERVED // TIMELINE UPDATED');
}

function ensureDoseProjection() {
  const page = $('pageLab');
  if (!page || $('gnDoseProjection')) return;
  page.insertAdjacentHTML('beforeend', `<section class="gn-dose-projection" id="gnDoseProjection" aria-labelledby="gnDoseProjectionTitle"><div class="gn-foundation-kicker" data-i18n="vault.educationalRefKicker">// EDUCATIONAL REFERENCE</div><h2 id="gnDoseProjectionTitle" data-i18n="vault.educationalRefTitle">DOSE PROJECTION</h2><p class="gn-dose-copy" data-i18n="vault.educationalRefCopy">Map a user-entered dose progression as a text timeline. This stores no protocol and makes no recommendation.</p><div class="gn-dose-grid"><label><span data-i18n="vault.currentDose">CURRENT DOSE (mg)</span><input id="gnDoseCurrent" type="number" min="0" step="0.1" inputmode="decimal" oninput="updateDoseProjection()"></label><label><span data-i18n="vault.stepIncrease">STEP INCREASE (mg)</span><input id="gnDoseStep" type="number" min="0" step="0.1" inputmode="decimal" oninput="updateDoseProjection()"></label><label><span data-i18n="vault.stepInterval">STEP INTERVAL (weeks)</span><input id="gnDoseInterval" type="number" min="1" step="1" inputmode="numeric" oninput="updateDoseProjection()"></label><label><span data-i18n="vault.targetDose">TARGET DOSE (mg)</span><input id="gnDoseTarget" type="number" min="0" step="0.1" inputmode="decimal" oninput="updateDoseProjection()"></label></div><div class="gn-dose-output" id="gnDoseOutput" data-i18n="vault.educationalRefAllValues">Enter all four values to view a text reference timeline.</div><div class="gn-dose-disclaimer"><strong data-i18n="vault.educationalRefOnly">EDUCATIONAL REFERENCE ONLY.</strong> <span data-i18n="vault.educationalRefDisclaimer">This is not a dosing recommendation. Titration schedules vary by individual protocol. Verify with prescribing guidance.</span></div></section>`);
  const profile = getProfile();
  if ($('gnDoseCurrent') && profile.dose) $('gnDoseCurrent').value = profile.dose;
  if ($('gnDoseInterval')) $('gnDoseInterval').value = 4;
}

export function updateDoseProjection() {
  const output = $('gnDoseOutput');
  if (!output) return;
  const current = Number($('gnDoseCurrent')?.value), step = Number($('gnDoseStep')?.value), interval = Number($('gnDoseInterval')?.value), target = Number($('gnDoseTarget')?.value);
  if (![current, step, interval, target].every(value => Number.isFinite(value)) || current < 0 || step <= 0 || interval < 1 || !Number.isInteger(interval) || target < current) {
    output.textContent = tx('vault.educationalRefInvalid', 'Enter a current dose, positive step, interval, and target at or above the current dose.');
    return;
  }
  const stepCount = Math.ceil((target - current) / step);
  if (stepCount > 99) {
    output.textContent = tx('vault.educationalRefTooManySteps', 'This range creates too many steps to display. Increase the step or lower the target.');
    return;
  }
  const segments = [];
  let dose = current, startWeek = 1, guard = 0;
  while (guard++ < 100) {
    const endWeek = dose < target ? startWeek + interval - 1 : null;
    segments.push(`${endWeek ? `WEEK ${startWeek}-${endWeek}` : `WEEK ${startWeek}+`}: ${dose.toFixed(1)} mg`);
    if (dose >= target) break;
    dose = Math.min(target, dose + step);
    startWeek += interval;
  }
  output.textContent = segments.join('  →  ');
}

function ensureCalculatorInventoryActions() {
  [['labSeg-draw', 'draw'], ['labSeg-recon', 'recon'], ['labSeg-supply', 'supply']].forEach(([id, type]) => {
    const segment = $(id);
    if (!segment || segment.querySelector('[data-save-calculator]')) return;
    segment.insertAdjacentHTML('beforeend', `<button type="button" class="btn-full btn-secondary" data-save-calculator="${type}" onclick="saveCalculatorReference('${type}')" data-i18n="vault.saveReference">SAVE REFERENCE TO INVENTORY</button>`);
  });
}

export function saveCalculatorReference(type) {
  const snapshots = {
    draw: { name: 'Draw calculator reference', notes: $('syrFormula')?.textContent || '' },
    recon: { name: 'Mix calculator reference', notes: $('reconOut')?.textContent || '' },
    supply: { name: 'Supply calculator reference', notes: $('supOut')?.textContent || '' }
  };
  const snapshot = snapshots[type];
  const output = { draw: $('syrFormula'), recon: $('reconOut'), supply: $('supOut') }[type];
  if (!snapshot?.notes || output?.dataset.valid !== 'true') { actionFeedback(tx('lab.referenceNotSaved', 'REFERENCE NOT SAVED'), tx('lab.enterValidFirst', 'ENTER VALID CALCULATOR VALUES FIRST'), true); return; }
  const records = S.get('inventory', []), now = new Date().toISOString();
  records.push({ id: createId('inventory'), name: snapshot.name, type: 'Calculator reference', quantity: 0, units: '', medication: '', autoDeduct: false, notes: snapshot.notes, status: 'REFERENCE', archived: false, source: 'System Generated', state: 'User Confirmed', history: [{ at: now, action: 'CALCULATOR REFERENCE SAVED', source: 'System Generated' }], createdAt: now, modifiedAt: now });
  S.set('inventory', records); appendEventLedger({ type: 'INVENTORY', recordId: records.at(-1).id, label: 'CALCULATOR REFERENCE SAVED' }); queueCloudSync('workspace'); renderInventory(); actionFeedback(tx('lab.referenceSaved', 'REFERENCE SAVED'), tx('lab.referenceSavedDetail', 'INVENTORY UPDATED // EDUCATIONAL MATH ONLY'));
}

export function renderLab() {
  try { if (document.querySelector('[data-labseg-block="visuals"]')?.style.display !== "none") renderVisualInstruments(); } catch (_) {}
  ensureLabFoundations(); ensureDoseProjection(); ensureCalculatorInventoryActions(); updateSyr(); updateRecon(); updateSupply(); updateDoseProjection(); renderLabFoundations(); window.GN_I18N?.applyTo?.(document.getElementById('pageLab')); }
function positiveNumberField(id, label, maximum) {
  const raw = String($(id)?.value ?? '').trim();
  if (!raw) return { valid: false, message: tx('lab.requiredField', 'ENTER VALID VALUES · {label} IS REQUIRED', { label }) };
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > maximum) return { valid: false, message: tx('lab.invalidField', 'INVALID INPUT · CHECK {label}', { label }) };
  return { valid: true, value };
}
export function updateSyr() {
  setText('syrUnits', '—'); setText('syrText', tx('lab.enterValidValues', 'ENTER VALID VALUES')); setText('syrML', '— mL'); setText('syrConcDisplay', '— mg/mL'); setText('syrResultLine', '—'); setText('syrVolResult', '— mL'); setDisplay('syrTarget', false);
  $('syrFormula')?.setAttribute('data-valid', 'false');
  const doseField = positiveNumberField('cDose', tx('lab.userAmount', 'USER-ENTERED AMOUNT'), 1000), concentrationField = positiveNumberField('cConc', tx('lab.concentration', 'CONCENTRATION'), 10000);
  if (!doseField.valid || !concentrationField.valid) { setText('syrFormula', !doseField.valid ? doseField.message : concentrationField.message); return; }
  const dose = doseField.value, concentration = concentrationField.value;
  const volume = dose / concentration, units = volume * 100;
  if (!Number.isFinite(volume) || !Number.isFinite(units) || volume > 1000 || units > 100000) { setText('syrFormula', tx('lab.outOfRange', 'INVALID INPUT · CALCULATED RESULT IS OUTSIDE THE SUPPORTED RANGE')); return; }
  /* Safety (audit 2026-10-08): U-100 barrel holds 0–100 units. Reject
   * over-capacity results instead of clamping the marker and reporting READY. */
  if (units > 100 || units < 0) {
    setText('syrFormula', tx('lab.overCapacity', 'OVER CAPACITY · RESULT EXCEEDS THE 0–100 UNIT BARREL'));
    setDisplay('syrTarget', false);
    $('syrFormula')?.setAttribute('data-valid', 'false');
    return;
  }
  setText('syrUnits', `${units.toFixed(1)}u`); setText('syrText', tx('lab.drawToUnit', 'DRAW TO THE {units} UNIT LINE', { units: units.toFixed(1) })); setText('syrML', `${volume.toFixed(3)} mL`); setText('syrConcDisplay', `${concentration} mg/mL`); setText('syrResultLine', `${dose} mg`); setText('syrVolResult', `${volume.toFixed(3)} mL`); setText('syrFormula', `${dose} mg ÷ ${concentration} mg/mL = ${volume.toFixed(3)} mL = ${units.toFixed(1)} U-100 units. ${tx('lab.educationalMathOnly', 'Educational math only.')}`); $('syrFormula')?.setAttribute('data-valid', 'true'); setDisplay('syrTarget', true);
  const target = $('syrTarget'); if (target) target.style.left = `${units}%`;
}
export function updateRecon() {
  setDisplay('reconRes', true); setText('bacAmt', '— mL');
  $('reconOut')?.setAttribute('data-valid', 'false');
  const vialField = positiveNumberField('rVial', tx('lab.totalAmount', 'TOTAL AMOUNT'), 10000), concField = positiveNumberField('rConc', tx('lab.targetConcentration', 'TARGET CONCENTRATION'), 10000);
  if (!vialField.valid || !concField.valid) { setText('reconOut', !vialField.valid ? vialField.message : concField.message); return; }
  const volume = vialField.value / concField.value;
  if (!Number.isFinite(volume) || volume > 10000) { setText('reconOut', tx('lab.outOfRange', 'INVALID INPUT · CALCULATED RESULT IS OUTSIDE THE SUPPORTED RANGE')); return; }
  setText('reconOut', `Reference math: ${vialField.value} mg ÷ ${concField.value} mg/mL = ${volume.toFixed(3)} mL total reference volume.`); $('reconOut')?.setAttribute('data-valid', 'true'); setText('bacAmt', `${volume.toFixed(3)} mL`);
}
export function updateSupply() {
  setDisplay('supRes', true);
  $('supOut')?.setAttribute('data-valid', 'false');
  const volumeField = positiveNumberField('sVol', tx('lab.volume', 'VOLUME'), 10000), concField = positiveNumberField('sConc', tx('lab.concentration', 'CONCENTRATION'), 10000), weeklyField = positiveNumberField('sDose2', tx('lab.weeklyAmount', 'WEEKLY AMOUNT'), 1000);
  const invalid = [volumeField, concField, weeklyField].find(field => !field.valid);
  if (invalid) { setText('supOut', invalid.message); return; }
  const total = volumeField.value * concField.value, coverage = total / weeklyField.value;
  if (!Number.isFinite(total) || !Number.isFinite(coverage) || coverage > 100000) { setText('supOut', tx('lab.outOfRange', 'INVALID INPUT · CALCULATED RESULT IS OUTSIDE THE SUPPORTED RANGE')); return; }
  setText('supOut', tx('lab.referenceTotal', 'Reference total: {total} mg · User-entered weekly amount: {weekly} mg · Approximate record coverage: {coverage} weeks. Educational record keeping only.', { total: total.toFixed(2), weekly: weeklyField.value.toFixed(2), coverage: coverage.toFixed(1) })); $('supOut')?.setAttribute('data-valid', 'true');
}

const MEASUREMENT_TYPES = [
  ['waist', 'WAIST CIRCUMFERENCE', 'vault.waist'],
  ['hip', 'HIP CIRCUMFERENCE', 'vault.hip'],
  ['chest', 'CHEST CIRCUMFERENCE', 'vault.chest'],
  ['left_arm', 'LEFT ARM CIRCUMFERENCE', 'vault.leftArm'],
  ['right_arm', 'RIGHT ARM CIRCUMFERENCE', 'vault.rightArm'],
  ['left_thigh', 'LEFT THIGH CIRCUMFERENCE', 'vault.leftThigh'],
  ['right_thigh', 'RIGHT THIGH CIRCUMFERENCE', 'vault.rightThigh']
];

function measurementUnit() {
  return S.get('preferences', {}).measurementUnit === 'cm' ? 'cm' : 'in';
}

function convertMeasurement(value, from, to) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (from === to) return numeric;
  return from === 'in' && to === 'cm' ? numeric * 2.54 : numeric / 2.54;
}

function latestMeasurement(type) {
  return S.get('measurements', []).filter(record => record.type === type).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))[0] || null;
}

/* Before/After Compare: two periods side by side */
function renderCompare() {
  var selA = document.getElementById('gnCompareA'), selB = document.getElementById('gnCompareB');
  var out = document.getElementById('gnCompareOut');
  if (!selA || !selB || !out) return;
  try {
    var shots = (typeof getAllShots === 'function' ? getAllShots() : []).filter(function(s){ return !s.archived; });
    if (shots.length < 4) { out.innerHTML = '<p class="gn-visual-sub">Log at least 4 shots to compare periods.</p>'; return; }
    // Build month options from shot dates
    var months = {};
    shots.forEach(function(s){ var d = new Date(s.date); var k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); months[k] = 1; });
    var keys = Object.keys(months).sort();
    if (!selA.options.length) {
      keys.forEach(function(k){ var o1 = document.createElement('option'); o1.value = k; o1.textContent = k; selA.appendChild(o1); var o2 = document.createElement('option'); o2.value = k; o2.textContent = k; selB.appendChild(o2); });
      if (keys.length >= 2) { selA.value = keys[0]; selB.value = keys[keys.length-1]; }
      selA.onchange = renderCompare; selB.onchange = renderCompare;
    }
    function statsFor(mk) {
      var recs = shots.filter(function(s){ var d = new Date(s.date); return (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')) === mk; });
      if (!recs.length) return null;
      var doses = recs.map(function(s){ return Number(s.dose)||0; }).filter(function(d){return d>0;});
      var avgDose = doses.length ? (doses.reduce(function(a,b){return a+b;},0)/doses.length).toFixed(1) : '—';
      var st = recs.slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);});
      var gaps = [];
      for (var i=1;i<st.length;i++){ var g=(new Date(st[i].date)-new Date(st[i-1].date))/86400000; if(g>0&&g<60) gaps.push(g); }
      var avgGap = gaps.length ? (gaps.reduce(function(a,b){return a+b;},0)/gaps.length).toFixed(1)+'d' : '—';
      return { n: recs.length, dose: avgDose, gap: avgGap };
    }
    var a = statsFor(selA.value), b = statsFor(selB.value);
    function row(label, va, vb) { return '<div class="gn-compare-row2"><span>' + label + '</span><b>' + (va==null?'—':va) + '</b><b>' + (vb==null?'—':vb) + '</b></div>'; }
    out.innerHTML = '<div class="gn-compare-grid"><div class="gn-compare-row2 head"><span></span><b>' + selA.value + '</b><b>' + selB.value + '</b></div>'
      + row('SHOTS', a&&a.n, b&&b.n) + row('AVG DOSE', a&&a.dose, b&&b.dose) + row('AVG GAP', a&&a.gap, b&&b.gap) + '</div>';
  } catch (_) {}
}

/* Visual Instruments: Dose Stack, Cadence Radar, Protocol Fingerprint */
function renderVisualInstruments() {
  try {
    var shots = (typeof getAllShots === 'function' ? getAllShots() : []).filter(function(s){ return !s.archived; });
    if (!shots.length) return;
    renderDoseStack(shots);
    renderCadenceRadar(shots);
    renderFingerprint(shots);
    renderCompare();
  } catch (_) {}
}

function renderDoseStack(shots) {
  var cv = document.getElementById('gnDoseStackCanvas');
  if (!cv) return;
  var w = cv.clientWidth || 320, h = 160, dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  var ctx = cv.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  var now = Date.now(), rangeMs = 21 * 86400000, start = now - rangeMs;
  var recent = shots.filter(function(s){ var t = new Date(s.date).getTime(); return !Number.isNaN(t) && t >= start && t <= now; }).slice(-8);
  if (!recent.length) return;
  var padL = 8, padR = 8, padT = 10, padB = 18, pw = w - padL - padR, ph = h - padT - padB;
  var xFor = function(t){ return padL + ((t - start) / rangeMs) * pw; };
  var maxV = 0;
  var curves = recent.map(function(s){
    var st = new Date(s.date).getTime(), dose = Number(s.dose) || 1;
    var pts = [];
    for (var i = 0; i <= 60; i++) {
      var t = start + (rangeMs * i / 60);
      var el = (t - st) / 86400000;
      var v = el < 0 ? 0 : (el <= 0.75 ? Math.max(0.04, el / 0.75) : Math.exp(-0.28 * (el - 0.75))) * dose;
      pts.push({ t: t, v: v });
      if (v > maxV) maxV = v;
    }
    return { shot: s, pts: pts };
  });
  maxV = maxV || 1;
  var yFor = function(v){ return padT + ph - (v / maxV) * ph; };
  // individual faint curves
  curves.forEach(function(c, i){
    ctx.strokeStyle = 'rgba(0,212,255,' + (0.12 + (i / curves.length) * 0.15) + ')';
    ctx.lineWidth = 1; ctx.beginPath();
    c.pts.forEach(function(p, j){ var x = xFor(p.t), y = yFor(p.v); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  });
  // combined dominant curve
  ctx.save();
  ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 10; ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (var i = 0; i <= 60; i++) {
    var t = start + (rangeMs * i / 60);
    var total = curves.reduce(function(sum, c){ var p = c.pts[i]; return sum + (p ? p.v : 0); }, 0);
    var x = xFor(t), y = yFor(total);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke(); ctx.restore();
  // shot markers
  curves.forEach(function(c){
    var x = xFor(new Date(c.shot.date).getTime());
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(x, padT + ph - 4, 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  });
}

function renderCadenceRadar(shots) {
  var cv = document.getElementById('gnCadenceCanvas');
  if (!cv || shots.length < 2) return;
  var w = cv.clientWidth || 320, h = 180, dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  var ctx = cv.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  var st = shots.slice().sort(function(a,b){ return new Date(a.date) - new Date(b.date); }).slice(-12);
  var gaps = [];
  for (var i = 1; i < st.length; i++) { var g = (new Date(st[i].date) - new Date(st[i-1].date)) / 86400000; if (g > 0 && g < 60) gaps.push(g); }
  if (!gaps.length) return;
  var avg = gaps.reduce(function(a,b){return a+b;},0) / gaps.length;
  var cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 20;
  // ideal ring
  ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(211,162,74,.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  // actual intervals as radial spokes
  gaps.forEach(function(g, i){
    var ang = (i / gaps.length) * Math.PI * 2 - Math.PI / 2;
    var r = R * Math.min(1.5, Math.max(0.2, g / (avg || 7)));
    var x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
    var onBeat = Math.abs(g - avg) / (avg || 7) < 0.25;
    ctx.strokeStyle = onBeat ? '#00d4ff' : '#c26674'; ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = '#8295a0'; ctx.font = '10px Share Tech Mono, monospace'; ctx.textAlign = 'center';
  ctx.fillText('AVG ' + avg.toFixed(1) + 'd', cx, cy + 4);
}

function renderFingerprint(shots) {
  var cv = document.getElementById('gnFingerprintCanvas');
  if (!cv || shots.length < 3) return;
  var w = cv.clientWidth || 320, h = 180, dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  var ctx = cv.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  var recent = shots.slice(-8);
  // 5 axes: dose consistency, interval consistency, recency, count, site variety
  var doses = recent.map(function(s){ return Number(s.dose) || 0; }).filter(function(d){ return d > 0; });
  var avgDose = doses.length ? doses.reduce(function(a,b){return a+b;},0)/doses.length : 1;
  var doseVar = doses.length ? Math.sqrt(doses.reduce(function(a,d){return a + Math.pow(d - avgDose, 2);},0)/doses.length) / (avgDose||1) : 1;
  var st = recent.slice().sort(function(a,b){ return new Date(a.date) - new Date(b.date); });
  var gaps = [];
  for (var i = 1; i < st.length; i++) { var g = (new Date(st[i].date) - new Date(st[i-1].date))/86400000; if (g>0&&g<60) gaps.push(g); }
  var avgGap = gaps.length ? gaps.reduce(function(a,b){return a+b;},0)/gaps.length : 7;
  var gapVar = gaps.length ? Math.sqrt(gaps.reduce(function(a,g){return a+Math.pow(g-avgGap,2);},0)/gaps.length)/(avgGap||1) : 1;
  var lastT = new Date(recent[recent.length-1].date).getTime();
  var recency = Math.max(0, 1 - ((Date.now() - lastT) / (14 * 86400000)));
  var sites = {}; recent.forEach(function(s){ if (s.site) sites[s.site] = 1; });
  var axes = [
    { label: 'DOSE', v: Math.max(0.1, 1 - Math.min(1, doseVar)) },
    { label: 'RHYTHM', v: Math.max(0.1, 1 - Math.min(1, gapVar)) },
    { label: 'RECENT', v: Math.max(0.1, recency) },
    { label: 'SITES', v: Math.max(0.1, Math.min(1, Object.keys(sites).length / 4)) },
    { label: 'LOGS', v: Math.max(0.1, Math.min(1, recent.length / 8)) },
  ];
  var cx = w/2, cy = h/2, R = Math.min(w,h)/2 - 30;
  // grid rings
  [0.33, 0.66, 1].forEach(function(f){
    ctx.strokeStyle = 'rgba(127,127,127,.2)'; ctx.lineWidth = 1; ctx.beginPath();
    axes.forEach(function(a, i){ var ang = (i/axes.length)*Math.PI*2 - Math.PI/2; var x = cx + Math.cos(ang)*R*f, y = cy + Math.sin(ang)*R*f; i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); });
    ctx.closePath(); ctx.stroke();
  });
  // data polygon
  ctx.save();
  ctx.fillStyle = 'rgba(0,212,255,.18)'; ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2;
  ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 8; ctx.beginPath();
  axes.forEach(function(a, i){
    var ang = (i/axes.length)*Math.PI*2 - Math.PI/2;
    var x = cx + Math.cos(ang)*R*a.v, y = cy + Math.sin(ang)*R*a.v;
    i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    // axis labels
    ctx.fillStyle = '#8295a0'; ctx.font = '9px Share Tech Mono, monospace'; ctx.textAlign = 'center';
    var lx = cx + Math.cos(ang)*(R+16), ly = cy + Math.sin(ang)*(R+16);
    ctx.fillText(a.label, lx, ly + 3);
    ctx.fillStyle = 'rgba(0,212,255,.18)';
  });
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}

/* Injection Site Map: visual body diagram with recency encoding */
var GNSiteMap = { zones: null };

function siteMapZoneCoords() {
  // Simplified body: abdomen 6, thighs 6, arms 4 — SVG viewBox 0 0 200 280
  return [
    { id: 'Upper Left', x: 70, y: 95, w: 28, h: 22 }, { id: 'Upper Right', x: 102, y: 95, w: 28, h: 22 },
    { id: 'Middle Left', x: 70, y: 120, w: 28, h: 22 }, { id: 'Middle Right', x: 102, y: 120, w: 28, h: 22 },
    { id: 'Lower Left', x: 70, y: 145, w: 28, h: 22 }, { id: 'Lower Right', x: 102, y: 145, w: 28, h: 22 },
    { id: 'Left Thigh Upper', x: 62, y: 180, w: 32, h: 26 }, { id: 'Right Thigh Upper', x: 106, y: 180, w: 32, h: 26 },
    { id: 'Left Thigh Lower', x: 62, y: 210, w: 32, h: 26 }, { id: 'Right Thigh Lower', x: 106, y: 210, w: 32, h: 26 },
    { id: 'Left Thigh Outer', x: 40, y: 195, w: 20, h: 40 }, { id: 'Right Thigh Outer', x: 140, y: 195, w: 20, h: 40 },
    { id: 'Left Back Upper Arm Upper', x: 30, y: 80, w: 22, h: 20 }, { id: 'Left Back Upper Arm Lower', x: 30, y: 102, w: 22, h: 20 },
    { id: 'Right Back Upper Arm Upper', x: 148, y: 80, w: 22, h: 20 }, { id: 'Right Back Upper Arm Lower', x: 148, y: 102, w: 22, h: 20 },
  ];
}

function renderSiteMap() {
  var container = document.getElementById('gnSiteMap');
  if (!container) return;
  try {
    var shots = (typeof getAllShots === 'function' ? getAllShots() : []).filter(function(s){ return !s.archived; });
    var now = Date.now();
    var lastUse = {};
    shots.forEach(function(s){
      var t = new Date(s.date).getTime();
      if (Number.isNaN(t) || !s.site) return;
      if (!lastUse[s.site] || t > lastUse[s.site]) lastUse[s.site] = t;
    });
    var zones = siteMapZoneCoords();
    var svg = '<svg viewBox="0 0 200 280" class="gn-sitemap-svg" role="img" aria-label="Injection site map">';
    svg += '<ellipse cx="100" cy="40" rx="28" ry="32" class="gn-sitemap-body"/>';
    svg += '<rect x="68" y="70" width="64" height="100" rx="18" class="gn-sitemap-body"/>';
    svg += '<rect x="58" y="170" width="36" height="90" rx="14" class="gn-sitemap-body"/>';
    svg += '<rect x="106" y="170" width="36" height="90" rx="14" class="gn-sitemap-body"/>';
    svg += '<rect x="28" y="72" width="26" height="60" rx="12" class="gn-sitemap-body"/>';
    svg += '<rect x="146" y="72" width="26" height="60" rx="12" class="gn-sitemap-body"/>';
    zones.forEach(function(z){
      var t = lastUse[z.id];
      var cls = 'gn-sitemap-zone', opacity = 0.15, label = 'never';
      if (t) {
        var daysAgo = (now - t) / 86400000;
        if (daysAgo < 7) { cls += ' recent'; opacity = 0.95; label = Math.floor(daysAgo) + 'd ago'; }
        else if (daysAgo < 21) { cls += ' warm'; opacity = 0.6; label = Math.floor(daysAgo) + 'd ago'; }
        else { cls += ' cool'; opacity = 0.35; label = Math.floor(daysAgo) + 'd ago'; }
      }
      svg += '<rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" rx="6" class="' + cls + '" opacity="' + opacity + '" data-site="' + z.id + '"><title>' + z.id + (t ? ' · ' + label : ' · never') + '</title></rect>';
    });
    svg += '</svg>';
    svg += '<div class="gn-sitemap-legend"><span><i class="sw recent"></i>RECENT</span><span><i class="sw warm"></i>USED</span><span><i class="sw cool"></i>OLD</span><span><i class="sw never"></i>NEVER</span></div>';
    container.innerHTML = svg;
  } catch (_) {}
}

function ensureProfileMeasurements() {
  const page = $('pageProfile');
  if (!page || $('gnMeasurementsCard')) return;
  const anchor = $('gnBodyCard');
  if (!anchor) return;
  anchor.insertAdjacentHTML('afterend', `<details class="gn-vault-card" id="gnMeasurementsCard">
    <summary class="gn-vault-card-head">
      <span class="gn-vault-card-ico" aria-hidden="true"><svg><use href="#gn-trend-signal"></use></svg></span>
      <span class="gn-vault-card-titles"><b id="gnMeasurementsTitle" data-i18n="vault.measurementsTitle">WEIGHT + MEASUREMENTS</b><small id="gnMeasurementsSummary" class="gn-vault-card-sub" data-i18n="vault.noRecord">NO RECORD</small></span>
      <span class="gn-vault-chev" aria-hidden="true">›</span>
    </summary>
    <div class="gn-vault-card-body">
      <p class="gn-measurements-copy" data-i18n="vault.measurementsCopy">Use this profile section as the single entry point for weight and user-entered body measurements.</p>
      <button type="button" class="btn-full btn-primary" onclick="openWeightModal()" style="margin-bottom:10px" data-i18n="dashboard.logWeight">LOG WEIGHT</button>
      <form id="gnMeasurementsForm" class="gn-measurements-form">
        <div class="gn-measurements-tools"><label><span data-i18n="vault.measurementUnit">UNIT</span><select id="gnMeasurementUnit" onchange="setMeasurementUnit(this.value)"><option value="in" data-i18n="vault.inches">INCHES</option><option value="cm" data-i18n="vault.centimeters">CENTIMETERS</option></select></label><label><span data-i18n="vault.measurementDate">DATE</span><input id="gnMeasurementDate" type="date"></label></div>
        <div class="gn-measurements-grid">${MEASUREMENT_TYPES.map(([type, label, key]) => `<label><span><b data-i18n="${key}">${label}</b><small id="gnMeasurementLatest_${type}" data-i18n="vault.noRecord">NO RECORD</small></span><input type="number" min="0" step="0.1" inputmode="decimal" data-measurement-type="${type}" aria-label="${tx(key, label)}"></label>`).join('')}</div>
        <button type="submit" class="btn-full btn-secondary" data-i18n="vault.saveMeasurements">SAVE MEASUREMENTS</button>
      </form>
      <div class="gn-sitemap-wrap">
        <div class="gn-foundation-kicker" data-i18n="vault.siteMapKicker">// INJECTION SITES</div>
        <div id="gnSiteMap" class="gn-sitemap"></div>
      </div>
      <div class="gn-measurements-empty" id="gnMeasurementsEmpty">No measurements logged yet.</div>
    </div>
  </details>`);
  window.GN_I18N?.applyTo?.($('gnMeasurementsCard'));
  $('gnMeasurementsForm')?.addEventListener('submit', event => { event.preventDefault(); saveMeasurements(); });
  installCustomPickers(page);
  try { renderSiteMap(); } catch (_) {}
}

function renderMeasurements() {
  const card = $('gnMeasurementsCard');
  if (!card) return;
  const unit = measurementUnit();
  const unitSelect = $('gnMeasurementUnit');
  if (unitSelect) unitSelect.value = unit;
  syncCustomPickers(card);
  const dateInput = $('gnMeasurementDate');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();
  const records = S.get('measurements', []);
  MEASUREMENT_TYPES.forEach(([type, label, key]) => {
    const latest = latestMeasurement(type);
    const converted = latest ? convertMeasurement(latest.value, latest.unit || 'in', unit) : null;
    const latestText = latest && converted !== null ? `${converted.toFixed(1)} ${unit} · ${formatDate(latest.date || latest.createdAt)}` : tx('vault.noRecord', 'NO RECORD');
    setText(`gnMeasurementLatest_${type}`, latestText);
    const field = card.querySelector(`[data-measurement-type="${type}"]`);
    /* v0.15.42: spinbutton accessible names refresh with the language instead
       of freezing at card build time. */
    if (field) field.setAttribute('aria-label', tx(key, label));
    if (field && document.activeElement !== field) field.value = converted === null ? '' : converted.toFixed(1);
  });
  setDisplay('gnMeasurementsEmpty', !records.length);
  const measureSummary = $('gnMeasurementsSummary');
  if (measureSummary) {
    const lw = latestWeight();
    measureSummary.textContent = lw ? `${Number(lw.weight).toFixed(1)} ${lw.unit || 'lb'} · ${formatDate(lw.date || lw.createdAt)}` : tx('vault.noRecord', 'NO RECORD');
  }
}

export function setMeasurementUnit(unit) {
  const preferences = S.get('preferences', {});
  preferences.measurementUnit = unit === 'cm' ? 'cm' : 'in';
  S.set('preferences', preferences);
  renderMeasurements();
}

export function saveMeasurements() {
  const unit = measurementUnit();
  const date = $('gnMeasurementDate')?.value || todayISO();
  const records = S.get('measurements', []);
  let saved = 0;
  MEASUREMENT_TYPES.forEach(([type]) => {
    const field = document.querySelector(`[data-measurement-type="${type}"]`);
    const value = Number(field?.value);
    if (!field?.value || !Number.isFinite(value) || value <= 0) return;
    records.push({ id: createId('measurement'), type, value, unit, date, createdAt: new Date().toISOString() });
    saved += 1;
  });
  if (!saved) { actionFeedback(tx('vault.noMeasurementsSaved', 'NO MEASUREMENTS SAVED'), tx('vault.enterPositiveValue', 'ENTER AT LEAST ONE POSITIVE VALUE'), true); return; }
  S.set('measurements', records);
  const preferences = S.get('preferences', {}); preferences.measurementUnit = unit; S.set('preferences', preferences);
  queueCloudSync('workspace');
  renderMeasurements();
  renderResults();
  actionFeedback(tx('vault.measurementsSaved', 'MEASUREMENTS SAVED'), tx('vault.measurementsSavedDetail', '{count} USER-ENTERED VALUE{plural} // TIMELINE UPDATED', { count: saved, plural: saved === 1 ? '' : 'S' }));
}


/* v0.15.42: explicit VAULT hub REPLAY TOUR control — calls the tour engine
 * directly instead of relying on fragile DOM injection anchors. */
export function replayGuidedTour() {
  try {
    window.GN_FIRSTCONTACT?.restart?.();
  } catch (_) { /* tour unavailable */ }
}
