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
  const titles = { calculators: tx('lab.calculators', 'CALCULATORS'), research: tx('lab.researchPeptides', 'RESEARCH PEPTIDES'), inventory: tx('lab.inventory', 'INVENTORY'), devices: tx('lab.deviceVault', 'DEVICE VAULT'), ledger: tx('lab.eventLedger', 'EVENT LEDGER') };
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
   + input focus (unless the focus belongs to the element that just dispatched the action). */
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
    if (!enabled) return;
    if (reduceMotion()) return;
    const skipFocus = opts && opts.skipFocus;
    if (!skipFocus && shouldSuppressForFocus()) return;
    if (!supported()) return;
    /* v0.15.32 — wrap in try/catch but DO NOT silently swallow: log a
       single warning for diagnostics. Android Chrome WebView occasionally
       throws "vibrate() must be called from a user gesture" — that's fine
       to swallow, but any other error is unexpected and we want to see it. */
    try {
      navigator.vibrate(pattern);
    } catch (err) {
      const msg = String(err && err.message || err);
      if (!/user gesture|secure context|not allowed|gestureactivation/i.test(msg)) {
        try { console.warn('[GRID//NODE gnHaptics]', msg); } catch (_) {}
      }
    }
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
  showPage(prev === 'Profile' ? 'Dash' : prev, document.getElementById('navPro'));
}

function toggleProfileHub() {
  const active = document.querySelector('.page.active')?.id;
  if (active === 'pageProfile') { closeProfileHub(); return; }
  showPage('Profile', document.getElementById('navPro'));
}

function ensureProfileHub() {
  const page = $('pageProfile');
  if (!page || page.querySelector('[data-gn-profile-hub]')) return;
  const avatar = $('profAvaWrap');
  const hero = avatar?.closest('[style*="background:#0e0e16"]');
  if (!hero) return;
  hero.insertAdjacentHTML('afterend', `<section class="gn-profile-hub" data-gn-profile-hub aria-labelledby="gnProfileHubTitle">
    <div class="gn-foundation-head"><div><div class="gn-foundation-kicker" data-i18n="vault.kicker">// NODE PROFILE HUB</div><h2 id="gnProfileHubTitle" data-i18n="vault.hubTitle">YOUR NODE</h2></div><span class="gn-foundation-actions"><span class="gn-foundation-signal" id="gnProfileSync">LOCAL MODE</span><button type="button" class="gn-hub-close" id="gnHubClose" onclick="closeProfileHub()" aria-label="CERRAR" data-i18n-aria-label="vault.closeHub">✕</button></span></div>
    <div class="gn-profile-sections">
      <section class="gn-profile-section"><div class="gn-profile-section-label" data-i18n="vault.node">// YOUR NODE</div><div class="gn-profile-row"><span><b data-i18n="vault.medicationLabel">Medication</b><small id="gnProfileMedication">Not entered</small></span><span class="gn-profile-chevron">›</span></div><div class="gn-profile-row"><span><b data-i18n="vault.bodyMetrics">Body Metrics</b><small id="gnProfileBody">Not entered</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row" onclick="openSystemUpdate()"><span><b data-i18n="vault.whatsNew">What's New</b><small data-gn-whatsnew-version></small></span><span class="gn-profile-chevron">›</span></button></section>
      <section class="gn-profile-section"><div class="gn-profile-section-label" data-i18n="vault.yourData">// YOUR DATA</div><button type="button" class="gn-profile-row" onclick="exportCSV()"><span><b data-i18n="vault.exportCsv">Export CSV</b><small data-i18n="vault.exportCsvHelp">Download readable records</small></span><span class="gn-profile-chevron">›</span></button><button type="button" class="gn-profile-row" onclick="exportBackup()"><span><b data-i18n="vault.exportBackup">Export Backup</b><small data-i18n="vault.exportBackupHelp">Save a complete local copy</small></span><span class="gn-profile-chevron">›</span></button><button type="button" class="gn-profile-row" onclick="openImportDialog()"><span><b data-i18n="vault.importData">Import Data</b><small data-i18n="vault.importDataHelp">Bring history from Shotsy or CSV</small></span><span class="gn-profile-chevron">›</span></button><div class="gn-profile-row"><span><b data-i18n="vault.dataOwnership">Data Ownership</b><small data-i18n="vault.dataOwnershipHelp">Export or delete anytime</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row gn-profile-danger-row" onclick="openDeleteLocalData()"><span><b data-i18n="vault.deleteAllData">Delete All Local Data</b><small data-i18n="vault.deleteAllDataHelp">Remove this device record</small></span><span class="gn-profile-chevron">›</span></button></section>
      <section class="gn-profile-section"><div class="gn-profile-section-label" data-i18n="vault.tools">// TOOLS</div><button type="button" class="gn-profile-row" onclick="document.querySelector('.gn-device-vault')?.scrollIntoView({behavior:'smooth',block:'start'})"><span><b data-i18n="vault.deviceVaultLink">Device Vault</b><small data-i18n="vault.deviceVaultLinkHelp">Private identity registry</small></span><span class="gn-profile-chevron">›</span></button><div class="gn-profile-row"><span><b data-i18n="vault.connectedAccount">Connected Account</b><small id="gnProfileAccount">Local device session</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row gn-profile-danger-row" onclick="openDeleteCloudAccount()"><span><b data-i18n="vault.deleteCloudAccount">Delete Cloud Account</b><small data-i18n="vault.deleteCloudAccountHelp">Requires server deletion control</small></span><span class="gn-profile-chevron">›</span></button><button type="button" class="gn-profile-row" id="gnHapticsToggle" onclick="toggleGnHaptics()"><span><b data-i18n="vault.hapticsTitle">Tactile Feedback</b><small id="gnHapticsHelp" data-i18n="vault.hapticsHelp">Vibration confirms saves, locks, and selections when the device supports it.</small></span><span class="gn-profile-chevron" id="gnHapticsState">·</span></button><div class="gn-profile-row"><span><b data-i18n="vault.appVersion">App Version</b><small id="gnProfileVersion">0.12.0</small></span><span class="gn-profile-chevron">›</span></div><button type="button" class="gn-profile-row" onclick="window.location.reload()"><span><b data-i18n="vault.reloadApp">Reload App</b><small data-i18n="vault.reloadAppHelp">Refresh the current build</small></span><span class="gn-profile-chevron">›</span></button></section>
    </div>
    <button type="button" class="gn-profile-signout" onclick="openSignOutModal()"><span><b data-i18n="vault.signOut">SIGN OUT</b><small data-i18n="vault.localOnlyFooter">Your data stays on this device.</small></span><span class="gn-profile-chevron">›</span></button>
    <div class="gn-device-vault"><div class="gn-device-vault-head"><div><div class="gn-foundation-kicker" data-i18n="vault.deviceVaultKicker">// DEVICE VAULT</div><h3 data-i18n="vault.deviceVaultSubhead">PHYSICAL OBJECT IDENTITY</h3></div><span class="gn-record-state" data-i18n="vault.deviceVaultPrivate">PRIVATE REGISTRY</span></div><p class="gn-ledger-copy" data-i18n="vault.deviceVaultPhilosophy">The device is not the cartridge. The cartridge is not the dose. The dose is not the plan. Device identity, inventory, SHOT events, and LOADOUT remain separate records.</p><form class="gn-record-form" id="gnDeviceForm"><div class="gn-form-grid"><label><span data-i18n="vault.deviceName">DEVICE NAME</span><input id="gnDeviceName" required placeholder="e.g. Home pen A" data-i18n-placeholder="vault.deviceNamePlaceholder"></label><label><span data-i18n="vault.deviceType">DEVICE TYPE</span><select id="gnDeviceType"><option value="REUSABLE" data-i18n="vault.deviceTypeReusable">Reusable pen</option><option value="DISPOSABLE" data-i18n="vault.deviceTypeDisposable">Disposable pen</option><option value="AUTOINJECTOR" data-i18n="vault.deviceTypeAutoinjector">Autoinjector</option><option value="OTHER" data-i18n="vault.deviceTypeOther">Other device</option></select></label><label><span data-i18n="vault.deviceStatus">STATUS</span><select id="gnDeviceStatus">${DEVICE_STATUSES.map(status => { const key = 'vault.status' + status.replace(/\s+/g, ''); return `<option value="${status}" data-i18n="${key}">${tx(key, status)}</option>`; }).join('')}</select></label></div><label><span data-i18n="vault.deviceLabelNotes">LABEL / NOTES</span><textarea id="gnDeviceNotes" rows="2" placeholder="User-entered identity notes" data-i18n-placeholder="vault.deviceNotesPlaceholder"></textarea></label><button class="btn-full btn-secondary" type="submit" data-i18n="vault.deviceRegister">REGISTER DEVICE IDENTITY</button></form><div class="gn-device-list" id="gnDeviceList"></div></div>
  </section>`);
  installCustomPickers(hero.parentElement || page);
  window.GN_I18N?.applyTo?.(page);
  const updateVersion = hero.parentElement?.querySelector('[data-system-update-version]');
  if (updateVersion) updateVersion.textContent = APP_VERSION;
  const updateCopy = hero.parentElement?.querySelector('#gnSystemUpdateCard p');
  if (updateCopy) updateCopy.textContent = tx('vault.systemUpdateNotes', `${APP_VERSION} — LAB tools now open in focused views, the Phase Engine adds neutral cycle context, and the LIVE NODE status is compact on mobile and desktop.`).replace(/^v[^ ]+/, APP_VERSION);
  const whatsNewVersion = document.querySelector('[data-gn-whatsnew-version]') || hero.parentElement?.querySelector('.gn-profile-section:first-of-type button small');
  if (whatsNewVersion) whatsNewVersion.textContent = `v${APP_VERSION}`;
  const deviceVault = hero.parentElement?.querySelector('.gn-device-vault');
  const deviceKicker = deviceVault?.querySelector('.gn-foundation-kicker');
  const deviceSignal = deviceVault?.querySelector('.gn-record-state');
  if (deviceKicker) deviceKicker.textContent = tx('vault.deviceVaultKicker', '// DEVICE VAULT');
  if (deviceSignal) deviceSignal.textContent = tx('vault.deviceVaultPrivate', 'PRIVATE REGISTRY');
  $('gnSystemUpdateDismiss')?.addEventListener('click', dismissSystemUpdate);
  document.querySelector('[data-system-update-open]')?.addEventListener('click', openSystemUpdate);
  $('gnDeviceForm')?.addEventListener('submit', event => { event.preventDefault(); saveDeviceRecord(); });
  $('gnDeviceList')?.addEventListener('click', handleDeviceAction);
  renderDeviceVault();
  ensurePasskeySection();
  renderGnHapticsState();
}

function renderDeviceVault() {
  const list = $('gnDeviceList');
  if (!list) return;
  const devices = S.get('devices', []);
  const active = devices.filter(device => !device.archived), archived = devices.filter(device => device.archived);
  list.innerHTML = devices.length ? `${active.slice().reverse().map(device => `<article class="gn-record-row"><div><b>${safeText(device.name)}</b><small>${safeText(deviceTypeLabel(device.type))} · ${tx('vault.privateId', 'PRIVATE ID')} ${safeText(device.qrIdentity || tx('vault.devicePending', 'PENDING'))}</small></div><span class="gn-record-state">${safeText(deviceStatusLabel(device.status))}</span><div style="display:flex;gap:4px"><button type="button" class="gn-record-delete" data-device-edit="${safeText(device.id)}" aria-label="${tx('vault.editDevice', 'Edit device')}">✎</button><button type="button" class="gn-record-delete" data-device-retire="${safeText(device.id)}" aria-label="${tx('vault.retireDevice', 'Retire device')}">×</button></div></article>`).join('')}${archived.length ? `<div class="gn-ledger-copy" style="margin-top:10px">${tx('vault.deviceArchived', 'RETIRED / ARCHIVED DEVICES')}</div>${archived.slice().reverse().map(device => `<article class="gn-record-row"><div><b>${safeText(device.name)}</b><small>${safeText(deviceTypeLabel(device.type))} · ${tx('vault.privateIdentityPreserved', 'Private identity preserved')}</small></div><span class="gn-record-state">${safeText(deviceStatusLabel(device.status || 'RETIRED'))}</span><button type="button" class="gn-record-delete" data-device-restore="${safeText(device.id)}" aria-label="${tx('vault.restoreDevice', 'Restore device')}">↺</button></article>`).join('')}` : ''}` : `<div class="gn-empty-state"><span class="gn-icon gn-icon-md gn-accent-y"><svg><use href="#gn-vault-core"></use></svg></span><b>${tx('vault.deviceReadyEmpty', 'DEVICE VAULT READY')}</b><span>${tx('vault.deviceReadyEmptyHelp', 'Register a physical object when you want its identity and lifecycle preserved.')}</span></div>`;
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
  if (!window.gnHaptics?.supported?.()) return;
  window.gnHaptics.setEnabled(!window.gnHaptics.enabled());
  renderGnHapticsState();
  try { window.gnHaptics.tap(); } catch (_) {}
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
  S.set('devices', devices); appendEventLedger({ type: 'DEVICE', recordId: device.id, label: existing ? 'DEVICE IDENTITY UPDATED' : 'DEVICE IDENTITY REGISTERED' }); queueCloudSync('workspace'); moduleState.deviceEditId = null; $('gnDeviceForm')?.reset(); renderDeviceVault(); actionFeedback(existing ? 'DEVICE IDENTITY UPDATED' : 'DEVICE IDENTITY REGISTERED', 'DEVICE VAULT UPDATED // HISTORY PRESERVED');
}

function handleDeviceAction(event) {
  const button = event.target.closest('button[data-device-edit],button[data-device-retire],button[data-device-restore]');
  if (!button) return;
  const id = button.dataset.deviceEdit || button.dataset.deviceRetire || button.dataset.deviceRestore;
  const devices = S.get('devices', []), device = devices.find(item => item.id === id);
  if (!device) return;
  if (button.dataset.deviceEdit) { moduleState.deviceEditId = id; $('gnDeviceName').value = device.name || ''; $('gnDeviceType').value = normalizeDeviceType(device.type); $('gnDeviceStatus').value = device.status || 'NEEDS CHECKING'; $('gnDeviceNotes').value = device.notes || ''; const submit = document.querySelector('#gnDeviceForm button[type="submit"]'); if (submit) submit.textContent = tx('vault.updateDevice', 'UPDATE DEVICE IDENTITY'); syncCustomPicker($('gnDeviceType')); syncCustomPicker($('gnDeviceStatus')); $('gnDeviceForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
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

export function renderLab() { ensureLabFoundations(); ensureDoseProjection(); ensureCalculatorInventoryActions(); updateSyr(); updateRecon(); updateSupply(); updateDoseProjection(); renderLabFoundations(); window.GN_I18N?.applyTo?.(document.getElementById('pageLab')); }
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
  setText('syrUnits', `${units.toFixed(1)}u`); setText('syrText', tx('lab.drawToUnit', 'DRAW TO THE {units} UNIT LINE', { units: units.toFixed(1) })); setText('syrML', `${volume.toFixed(3)} mL`); setText('syrConcDisplay', `${concentration} mg/mL`); setText('syrResultLine', `${dose} mg`); setText('syrVolResult', `${volume.toFixed(3)} mL`); setText('syrFormula', `${dose} mg ÷ ${concentration} mg/mL = ${volume.toFixed(3)} mL = ${units.toFixed(1)} U-100 units. ${tx('lab.educationalMathOnly', 'Educational math only.')}`); $('syrFormula')?.setAttribute('data-valid', 'true'); setDisplay('syrTarget', true);
  const target = $('syrTarget'); if (target) target.style.left = `${Math.min(100, Math.max(0, units))}%`;
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

function ensureProfileMeasurements() {
  const page = $('pageProfile');
  if (!page || $('gnMeasurementsCard')) return;
  const bodyInput = $('profHtFt');
  const bodyCard = bodyInput?.closest('div[style*="background:#0e0e16"]');
  if (!bodyCard) return;
  bodyCard.insertAdjacentHTML('afterend', `<section class="gn-measurements-card" id="gnMeasurementsCard" aria-labelledby="gnMeasurementsTitle">
    <div class="gn-foundation-kicker" data-i18n="vault.measurementsKicker">// BODY METRICS</div>
    <h3 id="gnMeasurementsTitle" data-i18n="vault.measurementsTitle">WEIGHT + MEASUREMENTS</h3>
    <p class="gn-measurements-copy" data-i18n="vault.measurementsCopy">Use this profile section as the single entry point for weight and user-entered body measurements.</p>
    <button type="button" class="btn-full btn-primary" onclick="openWeightModal()" style="margin-bottom:10px" data-i18n="dashboard.logWeight">LOG WEIGHT</button>
    <form id="gnMeasurementsForm" class="gn-measurements-form">
      <div class="gn-measurements-tools"><label><span data-i18n="vault.measurementUnit">UNIT</span><select id="gnMeasurementUnit" onchange="setMeasurementUnit(this.value)"><option value="in" data-i18n="vault.inches">INCHES</option><option value="cm" data-i18n="vault.centimeters">CENTIMETERS</option></select></label><label><span data-i18n="vault.measurementDate">DATE</span><input id="gnMeasurementDate" type="date"></label></div>
      <div class="gn-measurements-grid">${MEASUREMENT_TYPES.map(([type, label, key]) => `<label><span><b data-i18n="${key}">${label}</b><small id="gnMeasurementLatest_${type}" data-i18n="vault.noRecord">NO RECORD</small></span><input type="number" min="0" step="0.1" inputmode="decimal" data-measurement-type="${type}" aria-label="${tx(key, label)}"></label>`).join('')}</div>
      <button type="submit" class="btn-full btn-secondary" data-i18n="vault.saveMeasurements">SAVE MEASUREMENTS</button>
    </form>
    <div class="gn-measurements-empty" id="gnMeasurementsEmpty">No measurements logged yet.</div>
  </section>`);
  window.GN_I18N?.applyTo?.($('gnMeasurementsCard'));
  $('gnMeasurementsForm')?.addEventListener('submit', event => { event.preventDefault(); saveMeasurements(); });
  installCustomPickers(page);
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
  MEASUREMENT_TYPES.forEach(([type]) => {
    const latest = latestMeasurement(type);
    const converted = latest ? convertMeasurement(latest.value, latest.unit || 'in', unit) : null;
    const latestText = latest && converted !== null ? `${converted.toFixed(1)} ${unit} · ${formatDate(latest.date || latest.createdAt)}` : tx('vault.noRecord', 'NO RECORD');
    setText(`gnMeasurementLatest_${type}`, latestText);
    const field = card.querySelector(`[data-measurement-type="${type}"]`);
    if (field && document.activeElement !== field) field.value = converted === null ? '' : converted.toFixed(1);
  });
  setDisplay('gnMeasurementsEmpty', !records.length);
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

