// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/* GRID//NODE phase-state edge function.
 * Server-side home of the Phase Engine template structure: protocol arcs
 * (phase boundaries), cycle lengths, and medication-to-template matching.
 * The browser keeps only display text (i18n) and generic SVG geometry; the
 * template design itself never ships in client JS.
 * verify_jwt = false — pure computation over caller-supplied shot records,
 * no user data touched. CORS-locked to GRID//NODE origins.
 *
 * POST /functions/v1/phase-state
 *   { med, shots: [{date, med}], now }
 * -> { empty: true } | { empty: false, template: {id, type, cycleDays,
 *      phases: [{id, start, end, color}]}, cycleStart, elapsedDays,
 *      progress, phaseIndex, phaseId }
 */

const ALLOWED_ORIGINS = [
  "https://gridnode.network",
  "https://www.gridnode.network",
  "http://localhost:3000",
  "http://localhost:8080",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8080",
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/[a-z0-9-]+\.gridnode\.pages\.dev$/.test(origin);
}

function corsHeaders(req) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
  const origin = req.headers.get("origin");
  if (isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

const GLP1_PHASES = [
    { id: 'activation', color: '#4fb8d8', start: 0, end: 6 / 168, nameKey: 'phase.tmpl.activation' },
    { id: 'taking-effect', color: '#63b98b', start: 6 / 168, end: 24 / 168, nameKey: 'phase.tmpl.takingEffect' },
    { id: 'peak-effect', color: '#d3a24a', start: 24 / 168, end: 72 / 168, nameKey: 'phase.tmpl.peakEffect' },
    { id: 'cruise', color: '#4aa89b', start: 72 / 168, end: 144 / 168, nameKey: 'phase.tmpl.cruise' },
    { id: 'winding-down', color: '#c08a52', start: 144 / 168, end: 156 / 168, nameKey: 'phase.tmpl.windingDown' },
    { id: 'wear-off', color: '#c26674', start: 156 / 168, end: 1, nameKey: 'phase.tmpl.wearOff' }
  ];

const BPC157_PHASES = [
    { id: 'initiation', color: '#4fb8d8', start: 0, end: 7 / 84, nameKey: 'phase.tmpl.bpc.initiation' },
    { id: 'early-response', color: '#63b98b', start: 7 / 84, end: 28 / 84, nameKey: 'phase.tmpl.bpc.earlyResponse' },
    { id: 'deep-protocol', color: '#d3a24a', start: 28 / 84, end: 56 / 84, nameKey: 'phase.tmpl.bpc.deepProtocol' },
    { id: 'off-reassess', color: '#c26674', start: 56 / 84, end: 1, nameKey: 'phase.tmpl.bpc.offReassess' }
  ];

const TB500_PHASES = [
    { id: 'loading', color: '#4fb8d8', start: 0, end: 6 / 16, nameKey: 'phase.tmpl.tb500.loading' },
    { id: 'maintenance', color: '#63b98b', start: 6 / 16, end: 12 / 16, nameKey: 'phase.tmpl.tb500.maintenance' },
    { id: 'off-reassess', color: '#c26674', start: 12 / 16, end: 1, nameKey: 'phase.tmpl.tb500.offReassess' }
  ];

const GHKCU_PHASES = [
    { id: 'initiation', color: '#4fb8d8', start: 0, end: 4 / 16, nameKey: 'phase.tmpl.ghk.initiation' },
    { id: 'active-remodeling', color: '#63b98b', start: 4 / 16, end: 8 / 16, nameKey: 'phase.tmpl.ghk.remodeling' },
    { id: 'consolidation', color: '#d3a24a', start: 8 / 16, end: 12 / 16, nameKey: 'phase.tmpl.ghk.consolidation' },
    { id: 'copper-break', color: '#c26674', start: 12 / 16, end: 1, nameKey: 'phase.tmpl.ghk.copperBreak' }
  ];

const CJCIPA_PHASES = [
    { id: 'titration-ramp', color: '#4fb8d8', start: 0, end: 4 / 16, nameKey: 'phase.tmpl.cjcipa.titration' },
    { id: 'full-protocol', color: '#63b98b', start: 4 / 16, end: 12 / 16, nameKey: 'phase.tmpl.cjcipa.fullProtocol' },
    { id: 'washout', color: '#c26674', start: 12 / 16, end: 1, nameKey: 'phase.tmpl.cjcipa.washout' }
  ];

const GENERIC_PHASES = [
    { id: 'onset', color: '#4fb8d8', start: 0, end: 0.2, nameKey: 'phase.tmpl.generic.onset' },
    { id: 'active-window', color: '#63b98b', start: 0.2, end: 0.7, nameKey: 'phase.tmpl.generic.active' },
    { id: 'wear-off', color: '#c26674', start: 0.7, end: 1, nameKey: 'phase.tmpl.generic.wearOff' }
  ];

const TEMPLATES = [
    { id: 'glp1-weekly', type: 'weekly', cycleDays: 7, match: ['zepbound_tirzepatide', 'mounjaro_tirzepatide', 'tirzepatide_compound',              'wegovy_semaglutide', 'ozempic_semaglutide', 'semaglutide_compound', 'retatrutide'], phases: GLP1_PHASES },
    { id: 'bpc157-cycle', type: 'cycle', cycleDays: 84, match: ['bpc157'], phases: BPC157_PHASES },
    { id: 'tb500-cycle', type: 'cycle', cycleDays: 112, match: ['tb500', 'thymosin_beta4'], phases: TB500_PHASES },
    { id: 'ghkcu-cycle', type: 'cycle', cycleDays: 112, match: ['ghk_cu_topical', 'ghk_cu_injectable'], phases: GHKCU_PHASES },
    { id: 'cjcipa-cycle', type: 'cycle', cycleDays: 112, match: ['cjc1295_dac', 'cjc1295_nodac', 'ipamorelin', 'sermorelin', 'tesamorelin'], phases: CJCIPA_PHASES },
    { id: 'generic-cycle', type: 'generic', cycleDays: 7, match: [], phases: GENERIC_PHASES }
  ];

function normalizeMedId(med) {
  return String(med || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function templateForMed(med) {
  const id = normalizeMedId(med);
  for (let i = 0; i < TEMPLATES.length; i++) {
    if (TEMPLATES[i].match.indexOf(id) !== -1) return TEMPLATES[i];
  }
  return TEMPLATES[TEMPLATES.length - 1]; // generic fallback
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function activePhase(template, progress) {
  const p = clamp01(progress);
  const phases = template.phases;
  for (let i = 0; i < phases.length; i++) {
    if (p >= phases[i].start && p < phases[i].end) return { phase: phases[i], index: i };
  }
  return { phase: phases[phases.length - 1], index: phases.length - 1 };
}

function slimTemplate(t) {
  const chip = TEMPLATE_CHIPS[t.id] || { key: 'phase.tmpl.chipGeneric', fb: 'GENERIC CYCLE' };
  return {
    id: t.id,
    type: t.type,
    cycleDays: t.cycleDays,
    chipKey: chip.key,
    chipFb: chip.fb,
    phases: t.phases.map((p) => ({ id: p.id, start: p.start, end: p.end, color: p.color, nameKey: p.nameKey })),
  };
}

const TEMPLATE_CHIPS = {
  'glp1-weekly': { key: 'phase.tmpl.chipGlp1', fb: 'GLP-1 · 7-DAY RING' },
  'bpc157-cycle': { key: 'phase.tmpl.chipBpc', fb: 'BPC-157 · CYCLE WHEEL' },
  'tb500-cycle': { key: 'phase.tmpl.chipTb500', fb: 'TB-500 · CYCLE WHEEL' },
  'ghkcu-cycle': { key: 'phase.tmpl.chipGhk', fb: 'GHK-Cu · CYCLE WHEEL' },
  'cjcipa-cycle': { key: 'phase.tmpl.chipCjcIpa', fb: 'GH STACK · CYCLE WHEEL' },
  'generic-cycle': { key: 'phase.tmpl.chipGeneric', fb: 'GENERIC CYCLE' },
};


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON" }, 400);
  }
  const now = Number(body.now) || Date.now();
  const rawShots = Array.isArray(body.shots) ? body.shots : [];
  const shots = rawShots
    .slice(0, 2000)
    .map((s) => ({ date: String(s.date || ""), med: String(s.med || "") }))
    .filter((s) => Number.isFinite(new Date(s.date).getTime()) && new Date(s.date).getTime() <= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!shots.length) return json(req, { empty: true });

  const med = String(body.med || "");
  const template = templateForMed(med);
  const last = shots[shots.length - 1];

  let cycleStart;
  if (template.type === 'cycle') {
    const matching = shots.filter((s) => templateForMed(s.med).id === template.id);
    cycleStart = new Date((matching[0] || last).date).getTime();
  } else {
    cycleStart = new Date(last.date).getTime();
  }

  const elapsedDays = Math.max(0, (now - cycleStart) / 86400000);
  const progress = clamp01(elapsedDays / template.cycleDays);
  const active = activePhase(template, progress);

  return json(req, {
    empty: false,
    template: slimTemplate(template),
    cycleStart,
    elapsedDays,
    progress,
    phaseIndex: active.index,
    phaseId: active.phase.id,
  });
});
