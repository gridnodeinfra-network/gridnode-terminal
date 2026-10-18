#!/usr/bin/env node
/* NODKI lines library linter (Spec B, 1.3.0).
 * Fails the build if the finite line library breaks its contract:
 * counts (40 tips + 24 facts), EN+ES completeness and length, the
 * expression pairing map (Pipe, 2026-10-17: every line declares a
 * primary expression + approved alternates, expressions align with
 * meaning), and Spec B.5 for facts (general domain only, mandatory
 * named source + two-question risk review, no user/protocol reference,
 * no compound or dose language, no "you should"). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/modules/15-nodki-library.js'), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const LIB = sandbox.window.GN_NODKI_LIBRARY;
if (!LIB) { console.error('FAIL: GN_NODKI_LIBRARY did not load'); process.exit(1); }

const errors = [];
const err = (m) => errors.push(m);
const lines = LIB.lines || [];
const tips = lines.filter((l) => l.cat === 'tip');
const facts = lines.filter((l) => l.cat === 'fact');
if (tips.length !== 40) err(`tips count ${tips.length} !== 40`);
if (facts.length !== 24) err(`facts count ${facts.length} !== 24`);

const EXPRS = Object.keys(LIB.exprAssets || {});
if (!EXPRS.length) err('exprAssets missing');
const ids = new Set();
const enTexts = new Set();

/* Pairing map (class -> allowed primary expressions). */
const CLASS_EXPR = {
  scanner: ['focused'],
  planning: ['thinking'],
  support: ['concerned'],
  playful: ['cheeky'],
  fact: ['thinking', 'default']
};

for (const l of lines) {
  const at = l.id || '(no id)';
  if (!l.id) err('line without id');
  if (ids.has(l.id)) err(`${at}: duplicate id`);
  ids.add(l.id);
  if (!l.en || !l.es) err(`${at}: missing en or es`);
  for (const lang of ['en', 'es']) {
    if (l[lang] && l[lang].length > 140) err(`${at}: ${lang} is ${l[lang].length} chars (>140)`);
  }
  if (enTexts.has(l.en)) err(`${at}: duplicate en text`);
  enTexts.add(l.en);
  if (!EXPRS.includes(l.expr)) err(`${at}: expr '${l.expr}' not in canonical expression set`);
  if (!Array.isArray(l.alts) || l.alts.length < 1) err(`${at}: needs at least one approved alternate expression`);
  (l.alts || []).forEach((a) => { if (!EXPRS.includes(a)) err(`${at}: alt '${a}' not canonical`); });
  if (!l.trigger || !['state', 'event', 'idle', 'pull'].includes(l.trigger.type)) err(`${at}: bad trigger type`);
  if (l.trigger && l.trigger.type === 'event' && !l.trigger.key) err(`${at}: event trigger without key`);
  if (!Array.isArray(l.surfaces) || !l.surfaces.length) err(`${at}: no surfaces`);
  if (l.expires && isNaN(Date.parse(l.expires))) err(`${at}: expires does not parse`);
  const allowed = CLASS_EXPR[l.cat === 'fact' ? 'fact' : l.kind];
  if (allowed && !allowed.includes(l.expr)) err(`${at}: expr '${l.expr}' violates pairing map for kind '${l.kind}' (allowed: ${allowed.join('/')})`);
  if (l.expr === 'cheeky' && l.kind !== 'playful') err(`${at}: cheeky is reserved for playful lines`);
  if (l.expr === 'concerned' && l.kind !== 'support') err(`${at}: concerned is reserved for support lines`);
  if (/you should/i.test(l.en) || /deberías/i.test(l.es)) err(`${at}: "you should" framing is banned`);
}

for (const t of tips) {
  if (!['playful', 'pull'].includes(t.kind) && !t.cta) err(`${t.id}: tip without a CTA`);
}
for (const f of facts) {
  if (f.cta) err(`${f.id}: facts never carry a CTA`);
  if (!f.source || !f.source.label || !f.source.ref) err(`${f.id}: fact without a complete named source`);
  const r = f.review || {};
  if (!(r.by && r.date && r.status === 'pass' && r.q1 === true && r.q2 === true)) {
    err(`${f.id}: fact without a complete risk review (reviewer, date, pass, two-question test)`);
  }
  const text = (f.en + ' ' + f.es).toLowerCase();
  if (/\b(bpc|tb-500|tb500|ipamorelin|sermorelin|ghk|peptide|péptido|dose|dosis|dosage|mg|inject|inyección|inyect)/.test(text)) {
    err(`${f.id}: fact references compounds/doses/protocol language (Spec B.5)`);
  }
  if (/\byour (body|dose|protocol|health|curve)\b/.test(f.en) || /\btu (cuerpo|dosis|protocolo|salud|curva)\b/.test(f.es)) {
    err(`${f.id}: fact framed around the user (Spec B.5)`);
  }
}

/* >=70% of tips keyed to current user state (Spec B mix rule). */
const keyed = tips.filter((t) => t.trigger.type === 'event' || t.trigger.type === 'idle' ||
  (t.requires || []).some((r) => r !== 'any')).length;
if (keyed / tips.length < 0.70) err(`only ${keyed}/${tips.length} tips are state-keyed (<70%)`);

if (errors.length) {
  console.error('NODKI LIBRARY LINT FAIL (' + errors.length + '):');
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}
console.log(`NODKI LIBRARY LINT PASS: ${tips.length} tips + ${facts.length} facts, ${lines.length * 2} strings, ${keyed}/${tips.length} tips state-keyed, pairing map + Spec B.5 clean.`);
