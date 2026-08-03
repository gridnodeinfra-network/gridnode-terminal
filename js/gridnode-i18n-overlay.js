/* GRID//NODE — i18n overlay for bundle-injected hardcoded strings.
 * The runtime bundle injects some LAB/VAULT strings without i18n attributes.
 * This satellite overlays Spanish text on those elements (and re-applies on
 * language change and re-renders). English is untouched (no-op).
 */
(function () {
  'use strict';

  var ES_MAP = [
    // LAB foundations: ledger + supply sections
    ['#gnLedgerSection > summary span', 'LEDGER DE EVENTOS CON FUENTE'],
    ['#gnLedgerSection > summary em', 'SIN REESCRITURAS SILENCIOSAS'],
    ['#gnSupplySection > summary span', 'INVENTARIO GUARDADO'],
    ['#gnSupplySection > summary em', 'SEPARADO DE LAS CALCULADORAS'],
    // Inventory form
    ['#gnInventoryForm label:nth-of-type(1) span, #gnInventoryForm > label:first-child', 'NOMBRE DEL ARTÍCULO'],
    ['#gnInventoryForm label:nth-of-type(2) span, #gnInventoryForm label:nth-of-type(2)', 'TIPO DE ARTÍCULO'],
    ['#gnInventoryForm label:nth-of-type(3) span', 'CANTIDAD'],
    ['#gnInventoryForm label:nth-of-type(4) span', 'UNIDADES'],
    ['#gnInventoryForm label:nth-of-type(5) span', 'VENCIMIENTO / LOTE'],
    ['#gnInventoryForm label:nth-of-type(6) span', 'UBICACIÓN DE ALMACENAMIENTO'],
    ['#gnInventoryNotes', 'Notas ingresadas por el usuario'],
    ['#gnInventorySave', 'GUARDAR ARTÍCULO DE INVENTARIO'],
    ['#gnInventoryExport', 'EXPORTAR INVENTARIO'],
    // Measurements card
    ['#gnMeasurementsTitle', 'PESO + MEDIDAS'],
    ['#gnMeasurementsForm label span', 'UNIDAD'],
    ['#gnMeasurementsSave, #gnMeasurementsForm button[type="submit"]', 'GUARDAR MEDIDAS'],
    ['#gnMeasurementsEmpty', 'Aún no hay medidas registradas.'],
  ];

  function isEs() {
    return document.documentElement && document.documentElement.lang === 'es';
  }

  function applyOverlay(root) {
    if (!isEs()) return;
    root = root || document;
    ES_MAP.forEach(function (entry) {
      var selector = entry[0], esText = entry[1];
      var nodes;
      try { nodes = root.querySelectorAll ? root.querySelectorAll(selector) : []; } catch (_) { return; }
      nodes.forEach(function (node) {
        if (node.dataset && node.dataset.gnI18nOverlay === esText) return;
        if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
          if (node.dataset && node.dataset.gnI18nOverlayOriginal === undefined) node.dataset.gnI18nOverlayOriginal = node.placeholder || '';
          node.placeholder = esText;
        } else if (node.querySelector && node.querySelector('input, select, textarea, button')) {
          // Never destroy a label that wraps a form control; retarget its
          // direct text span when present.
          const span = node.querySelector(':scope > span');
          if (span) span.textContent = esText;
        } else {
          node.textContent = esText;
        }
        if (node.dataset) node.dataset.gnI18nOverlay = esText;
      });
    });
  }

  function boot() {
    if (isEs()) applyOverlay();
    document.addEventListener('gn:langchange', function () { applyOverlay(); });
    new MutationObserver(function (mutations) {
      var relevant = mutations.some(function (m) { return m.addedNodes && m.addedNodes.length; });
      if (relevant && isEs()) applyOverlay();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
