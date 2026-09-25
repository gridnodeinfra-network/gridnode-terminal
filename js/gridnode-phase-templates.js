/* GRID//NODE Phase Templates — thin client
 * The phase template STRUCTURE (protocol arcs, phase boundaries, cycle
 * lengths, medication-to-template matching) now lives server-side in the
 * phase-state Supabase Edge Function. This module keeps only:
 *   - phase display text (i18n keys + English fallbacks), keyed by nameKey
 *   - generic SVG geometry helpers (arcs, node positions)
 *   - phaseState(): async client for the server-computed phase state
 * The browser never sees phase boundaries or the template registry.
 */
(function phaseTemplatesModule() {
  'use strict';

  var tx = function (key, fallback, vars) {
    try {
      if (window.GN_I18N && window.GN_I18N.text) return window.GN_I18N.text(key, fallback, vars) || fallback;
    } catch (_) {}
    return fallback;
  };

  /* ------------------------------------------------------------------ */
  /* Phase display text (UI copy only — no boundaries, no structure)      */
  /* ------------------------------------------------------------------ */

const PHASE_TEXT = {
    'phase.tmpl.activation': { nameFb: 'ACTIVATION',
      nowKey: 'phase.tmpl.activation.now', nowFb: ['Absorption begins. Receptors engaging.', 'Gastric emptying starts to slow. Most people feel little this early.'],
      watchKey: 'phase.tmpl.activation.watch', watchFb: ['Mild sting or redness at the injection site.', 'Light fatigue. Log anything notable for your clinician.'],
      doKey: 'phase.tmpl.activation.do', doFb: ['Rotate the injection site each week.', 'Pair the shot with a protein-containing meal.', 'Hydrate with electrolytes beforehand.'] },
    'phase.tmpl.takingEffect': { nameFb: 'TAKING EFFECT',
      nowKey: 'phase.tmpl.takingEffect.now', nowFb: ['Levels climbing toward peak.', 'Appetite signals starting to quiet.'],
      watchKey: 'phase.tmpl.takingEffect.watch', watchFb: ['Nausea onset, the most commonly reported effect.', 'Early fullness, burping, reflux.', 'Fatigue or headache. Flag anything persistent with your clinician.'],
      doKey: 'phase.tmpl.takingEffect.do', doFb: ['Five or six small meals instead of three large ones.', 'Lean, gentle protein.', 'Easier without high-fat, fried, spicy, or carbonated foods.', 'Sip water steadily. Ginger can ease nausea.'] },
    'phase.tmpl.peakEffect': { nameFb: 'PEAK EFFECT',
      nowKey: 'phase.tmpl.peakEffect.now', nowFb: ['Peak drug levels. Appetite suppression at its strongest.', 'Food noise at its quietest this cycle.'],
      watchKey: 'phase.tmpl.peakEffect.watch', watchFb: ['Nausea peaks here. Vomiting and diarrhea are most likely in this window.', 'Sulfur burps, dizziness.', 'Dose-escalation weeks hit hardest.', 'Urgent: vomiting that keeps you from holding fluids for 24 hours. Contact your provider.'],
      doKey: 'phase.tmpl.peakEffect.do', doFb: ['Small, bland meals.', 'Keep electrolytes up.', 'Stay upright after eating.', 'Log side effects as they happen.'] },
    'phase.tmpl.cruise': { nameFb: 'CRUISE',
      nowKey: 'phase.tmpl.cruise.now', nowFb: ['Post-peak plateau. Steady, predictable suppression.', 'GI effects usually easing.'],
      watchKey: 'phase.tmpl.cruise.watch', watchFb: ['Lingering mild nausea.', 'Constipation can linger longest.', 'Undereating without noticing.'],
      doKey: 'phase.tmpl.cruise.do', doFb: ['Protein at every meal to protect muscle.', 'Fiber plus water for regularity.', 'Keep meal timing consistent.', 'Best window of the week for activity.'] },
    'phase.tmpl.windingDown': { nameFb: 'WINDING DOWN',
      nowKey: 'phase.tmpl.windingDown.now', nowFb: ['Approaching trough. Appetite signals returning.', 'Digestion normalizing.'],
      watchKey: 'phase.tmpl.windingDown.watch', watchFb: ['Returning hunger and food noise.', 'Carb cravings, mild irritability.', 'GI effects usually minimal by now.'],
      doKey: 'phase.tmpl.windingDown.do', doFb: ['Protein-rich snacks.', 'Hold your meal structure as hunger returns.', 'Prep for injection day.', 'Log how hunger returns. It is useful data.'] },
    'phase.tmpl.wearOff': { nameFb: 'WEAR-OFF WINDOW',
      nowKey: 'phase.tmpl.wearOff.now', nowFb: ['Trough levels. The quietest part of the cycle.', 'Appetite nearest baseline.'],
      watchKey: 'phase.tmpl.wearOff.watch', watchFb: ['Strongest hunger of the week, usually days 6-7.', 'Loudest food noise.', 'Thirst often misread as hunger.'],
      doKey: 'phase.tmpl.wearOff.do', doFb: ['Smaller portions, unhurried meals.', 'Hydrate before assuming hunger.', 'Keep trigger foods out of reach.', 'Dose on schedule. Logging the shot restarts the cycle.'] },
    'phase.tmpl.bpc.initiation': { nameFb: 'INITIATION',
      nowKey: 'phase.tmpl.bpc.initiation.now', nowFb: ['First week of the protocol.', 'Early days establish routine and baseline, not results.'],
      watchKey: 'phase.tmpl.bpc.initiation.watch', watchFb: ['Injection-site redness or soreness.', 'Unusual dizziness, nausea, or fatigue. Log and discuss with your clinician.'],
      doKey: 'phase.tmpl.bpc.initiation.do', doFb: ['Log every dose at the same time daily.', 'Record baseline pain and function scores.', 'Note the target area so later weeks have a comparison.'] },
    'phase.tmpl.bpc.earlyResponse': { nameFb: 'EARLY RESPONSE',
      nowKey: 'phase.tmpl.bpc.earlyResponse.now', nowFb: ['Window where first noticeable changes are most often reported.', 'Reduced discomfort, easier movement.'],
      watchKey: 'phase.tmpl.bpc.earlyResponse.watch', watchFb: ['Whether discomfort trends up, down, or flat across the week.', 'Temptation to overdo activity because it feels better.'],
      doKey: 'phase.tmpl.bpc.earlyResponse.do', doFb: ['Keep activity and rehab consistent.', 'Do not change three variables at once.', 'Weekly check-in: pain score, range of motion, new capabilities.'] },
    'phase.tmpl.bpc.deepProtocol': { nameFb: 'DEEP PROTOCOL',
      nowKey: 'phase.tmpl.bpc.deepProtocol.now', nowFb: ['Structural window. Tendons, ligaments, and gut lining remodel slowly.', 'This phase is about staying the course.'],
      watchKey: 'phase.tmpl.bpc.deepProtocol.watch', watchFb: ['Plateaus are normal here.', 'If objective function has not moved in 2+ weeks, discuss with your provider rather than extending blindly.'],
      doKey: 'phase.tmpl.bpc.deepProtocol.do', doFb: ['Continue logging.', 'Note return-to-activity milestones.', 'Decide in advance what "done" looks like. Do not drift.'] },
    'phase.tmpl.bpc.offReassess': { nameFb: 'OFF / REASSESS',
      nowKey: 'phase.tmpl.bpc.offReassess.now', nowFb: ['Break period. Documented practice is time off roughly equal to time on.', 'No human washout period is established.'],
      watchKey: 'phase.tmpl.bpc.offReassess.watch', watchFb: ['Whether gains hold, fade, or keep improving off-protocol.', 'Any delayed issues.'],
      doKey: 'phase.tmpl.bpc.offReassess.do', doFb: ['Keep a light weekly function log during the break.', 'Reassess with your clinician before another round.'] },
    'phase.tmpl.tb500.loading': { nameFb: 'LOADING',
      nowKey: 'phase.tmpl.tb500.loading.now', nowFb: ['Higher-frequency phase building systemic levels.', 'Effects are slower and broader than BPC-157. Expect weeks, not days.'],
      watchKey: 'phase.tmpl.tb500.loading.watch', watchFb: ['Injection days vs. off days in your log.', 'Unusual fatigue or head pressure, occasionally reported. Discuss with your clinician.', 'Do not judge the protocol in week 2.'],
      doKey: 'phase.tmpl.tb500.loading.do', doFb: ['Log both weekly doses.', 'Note mobility and function weekly.', 'Consistency matters most here. Missed loading doses are the most common self-reported reason for weak results.'] },
    'phase.tmpl.tb500.maintenance': { nameFb: 'MAINTENANCE',
      nowKey: 'phase.tmpl.tb500.maintenance.now', nowFb: ['Frequency steps down to weekly.', 'This phase answers: do gains hold on less frequent dosing?'],
      watchKey: 'phase.tmpl.tb500.maintenance.watch', watchFb: ['Whether function holds steady, keeps improving, or slips after step-down.'],
      doKey: 'phase.tmpl.tb500.maintenance.do', doFb: ['Keep the weekly log going, lighter touch.', 'Compare against loading-phase notes at the same checkpoint.'] },
    'phase.tmpl.tb500.offReassess': { nameFb: 'OFF / REASSESS',
      nowKey: 'phase.tmpl.tb500.offReassess.now', nowFb: ['Break and evaluation period.'],
      watchKey: 'phase.tmpl.tb500.offReassess.watch', watchFb: ['Durability of changes off-protocol.'],
      doKey: 'phase.tmpl.tb500.offReassess.do', doFb: ['Decide with your clinician whether another round is warranted.', 'Or whether the issue needs a different approach: imaging, PT, etc.'] },
    'phase.tmpl.ghk.initiation': { nameFb: 'INITIATION',
      nowKey: 'phase.tmpl.ghk.initiation.now', nowFb: ['Ramp-in. Skin and connective tissue respond slowly.', 'Nothing here works overnight. Set expectations.'],
      watchKey: 'phase.tmpl.ghk.initiation.watch', watchFb: ['Skin tolerance: redness, tingling.', 'Especially if also using retinoids or acids.', 'Any systemic oddities. Discuss with your clinician.'],
      doKey: 'phase.tmpl.ghk.initiation.do', doFb: ['Daily log.', 'Take standardized day-0 photos: same light, same angle.', 'You will not remember "before" in week 10.'] },
    'phase.tmpl.ghk.remodeling': { nameFb: 'ACTIVE REMODELING',
      nowKey: 'phase.tmpl.ghk.remodeling.now', nowFb: ['Main working window.', 'Collagen and elastin remodeling underway, still subtle.'],
      watchKey: 'phase.tmpl.ghk.remodeling.watch', watchFb: ['The urge to judge early.', 'Meaningful comparison needs the day-0 baseline.'],
      doKey: 'phase.tmpl.ghk.remodeling.do', doFb: ['Stay consistent.', 'Mid-cycle photo set at week 6, identical conditions.', 'Note skin texture, firmness, wound-healing speed.'] },
    'phase.tmpl.ghk.consolidation': { nameFb: 'CONSOLIDATION',
      nowKey: 'phase.tmpl.ghk.consolidation.now', nowFb: ['Final stretch of the documented cycle.', 'Before/after comparisons are actually informative now.'],
      watchKey: 'phase.tmpl.ghk.consolidation.watch', watchFb: ['Copper-load signs per your clinician guidance.', 'The documented reason for cycling off. Do not extend indefinitely without a plan.'],
      doKey: 'phase.tmpl.ghk.consolidation.do', doFb: ['Final photo set and written comparison vs. day 0.', 'Decide the off-period length in advance.'] },
    'phase.tmpl.ghk.copperBreak': { nameFb: 'COPPER BREAK',
      nowKey: 'phase.tmpl.ghk.copperBreak.now', nowFb: ['Off period. Documented practice pauses here to clear copper load.'],
      watchKey: 'phase.tmpl.ghk.copperBreak.watch', watchFb: ['Whether skin gains hold during the break.'],
      doKey: 'phase.tmpl.ghk.copperBreak.do', doFb: ['Light monthly check-in note.', 'Reassess before any repeat cycle.'] },
    'phase.tmpl.cjcipa.titration': { nameFb: 'TITRATION RAMP',
      nowKey: 'phase.tmpl.cjcipa.titration.now', nowFb: ['Gradual ramp per documented schedules.', 'Sleep is usually the first thing people report noticing.'],
      watchKey: 'phase.tmpl.cjcipa.titration.watch', watchFb: ['Sleep quality, better or worse. Some report vivid dreams.', 'Morning grogginess, injection-site irritation, water retention.', 'Report persistent issues to your clinician.'],
      doKey: 'phase.tmpl.cjcipa.titration.do', doFb: ['Log dose time nightly. Timing consistency matters.', 'Keep the pre-bed window and empty-stomach gap consistent.', 'Track sleep subjectively.'] },
    'phase.tmpl.cjcipa.fullProtocol': { nameFb: 'FULL PROTOCOL',
      nowKey: 'phase.tmpl.cjcipa.fullProtocol.now', nowFb: ['Steady-state window.', 'Recovery, energy, and body-composition trends are evaluated here, not in week 2.'],
      watchKey: 'phase.tmpl.cjcipa.fullProtocol.watch', watchFb: ['Trends over weeks, not days: recovery, sleep averages, waist trend.', 'Diminishing returns late in the window. Possible desensitization, the documented reason for cycling.'],
      doKey: 'phase.tmpl.cjcipa.fullProtocol.do', doFb: ['Weekly check-in: sleep average, recovery rating, one body metric.', 'Keep training and diet stable so the log means something.'] },
    'phase.tmpl.cjcipa.washout': { nameFb: 'WASHOUT',
      nowKey: 'phase.tmpl.cjcipa.washout.now', nowFb: ['Off period. Documented purpose: receptor sensitivity reset.'],
      watchKey: 'phase.tmpl.cjcipa.washout.watch', watchFb: ['How sleep and recovery feel off-protocol vs. on.', 'This comparison is the most valuable data the cycle produces.'],
      doKey: 'phase.tmpl.cjcipa.washout.do', doFb: ['Light log: sleep plus one recovery note weekly.', 'Plan the next cycle start date rather than drifting back on.'] },
    'phase.tmpl.generic.onset': { nameFb: 'ONSET',
      nowKey: 'phase.tmpl.generic.onset.now', nowFb: ['Early cycle after the latest logged shot.', 'New observations begin shaping this signal.'],
      watchKey: 'phase.tmpl.generic.onset.watch', watchFb: ['How you feel in the first hours and days.', 'Log anything notable and discuss with your clinician.'],
      doKey: 'phase.tmpl.generic.onset.do', doFb: ['Log consistently at the same time.', 'Note appetite, energy, sleep, and mood daily.'] },
    'phase.tmpl.generic.active': { nameFb: 'ACTIVE WINDOW',
      nowKey: 'phase.tmpl.generic.active.now', nowFb: ['Estimated active-cycle window.', 'Compare this point with your own earlier logged cycles.'],
      watchKey: 'phase.tmpl.generic.active.watch', watchFb: ['Trends across days, not single data points.', 'Anything that feels off. Discuss with your clinician.'],
      doKey: 'phase.tmpl.generic.active.do', doFb: ['Keep the log going.', 'Weekly review: what moved, what held steady.'] },
    'phase.tmpl.generic.wearOff': { nameFb: 'WEAR-OFF',
      nowKey: 'phase.tmpl.generic.wearOff.now', nowFb: ['Late-cycle estimate before the next expected event.', 'Effects fading toward baseline.'],
      watchKey: 'phase.tmpl.generic.wearOff.watch', watchFb: ['How the fade feels compared to last cycle.', 'Keep logging your own patterns.'],
      doKey: 'phase.tmpl.generic.wearOff.do', doFb: ['Dose on schedule if continuing.', 'Review the full cycle before the next one starts.'] }
  };

  function textFor(phase) {
    if (!phase) return null;
    if (phase.nameKey && PHASE_TEXT[phase.nameKey]) return PHASE_TEXT[phase.nameKey];
    return null;
  }

  function phaseName(phase) {
    var t = textFor(phase);
    if (t) return tx(phase.nameKey, t.nameFb);
    return tx(phase && phase.nameKey, (phase && phase.nameFb) || (phase && phase.id) || '');
  }

  function phaseLines(phase, kind) {
    // kind: 'now' | 'watch' | 'do'
    // NOTE: keys like phase.tmpl.<phase>.<kind> are intentionally NOT in the
    // English catalog; content lives in the English fallbacks below. The
    // Spanish catalog MAY carry these keys as arrays (see GN_I18N.raw, which
    // returns catalog values untouched, unlike t() which flattens arrays).
    var t = textFor(phase) || {};
    var key = (phase && phase[kind + 'Key']) || t[kind + 'Key'];
    var fb = (phase && phase[kind + 'Fb']) || t[kind + 'Fb'] || [];
    var out = null;
    try {
      if (window.GN_I18N && window.GN_I18N.raw) {
        var v = window.GN_I18N.raw(key);
        if (v !== undefined && v !== key) out = v;
      } else if (window.GN_I18N && window.GN_I18N.t) {
        var v2 = window.GN_I18N.t(key);
        if (v2 && v2 !== key) out = v2;
      }
    } catch (_) {}
    if (Array.isArray(out)) return out;
    if (typeof out === 'string' && out) return [out];
    return fb;
  }

  function templateChip(template) { return tx(template.chipKey, template.chipFb); }

  function normalizeMedId(med) {
    try {
      if (window.GNModules && window.GNModules.normalizeMedicationId) {
        return window.GNModules.normalizeMedicationId(med) || '';
      }
    } catch (_) {}
    return String(med || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  /* ------------------------------------------------------------------ */
  /* Generic SVG geometry (presentation only)                            */
  /* ------------------------------------------------------------------ */

  function phaseArc(phase) {
    var startDeg = phase.start * 360;
    var sweepDeg = Math.max(1, (phase.end - phase.start) * 360);
    return { startDeg: startDeg, endDeg: startDeg + sweepDeg, sweepDeg: sweepDeg };
  }

  // Node position for a phase (midpoint angle): { deg, x, y } in 0..1 box coords
  function phaseNode(phase) {
    var mid = (phase.start + phase.end) / 2;
    var deg = mid * 360;
    var rad = (deg - 90) * Math.PI / 180; // 0deg = top
    return { deg: deg, x: 0.5 + 0.5 * Math.cos(rad), y: 0.5 + 0.5 * Math.sin(rad) };
  }

  // Sweep-head position for exact progress
  function progressPoint(progress) {
    var deg = clamp01(progress) * 360;
    var rad = (deg - 90) * Math.PI / 180;
    return { deg: deg, x: 0.5 + 0.5 * Math.cos(rad), y: 0.5 + 0.5 * Math.sin(rad) };
  }

  // SVG arc path for a phase segment. r in 0..1 box units, center 0.5,0.5.
  // scale multiplies all coordinates (use 100 for a 0 0 100 100 viewBox).
  function arcPath(phase, r, scale) {
    var s = scale || 1;
    var a = phaseArc(phase);
    var startRad = (a.startDeg - 90) * Math.PI / 180;
    var endRad = (a.endDeg - 90) * Math.PI / 180;
    var x1 = (0.5 + r * Math.cos(startRad)) * s, y1 = (0.5 + r * Math.sin(startRad)) * s;
    var x2 = (0.5 + r * Math.cos(endRad)) * s, y2 = (0.5 + r * Math.sin(endRad)) * s;
    var rr = (r * s).toFixed(2);
    var large = a.sweepDeg > 180 ? 1 : 0;
    return 'M ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
           ' A ' + rr + ' ' + rr + ' 0 ' + large + ' 1 ' +
           x2.toFixed(2) + ' ' + y2.toFixed(2);
  }

  /* ------------------------------------------------------------------ */
  /* Server-computed phase state                                         */
  /* ------------------------------------------------------------------ */

  var _stateCache = {}; // normalized med -> { at, data }
  var CACHE_TTL_MS = 5 * 60 * 1000;

  function functionsBase() {
    try {
      if (typeof CLOUD_CONFIG !== 'undefined' && CLOUD_CONFIG && CLOUD_CONFIG.url) {
        return String(CLOUD_CONFIG.url).replace(/\/+$/, '') + '/functions/v1';
      }
    } catch (_) {}
    return null;
  }

  // Resolve of the phase-state edge function. Never rejects: returns null
  // when the server is unreachable so the sphere falls back to its empty
  // state instead of throwing inside a render tick.
  async function phaseState(medRaw, shots, now) {
    var ts = Number(now) || Date.now();
    var med = normalizeMedId(medRaw);
    var cached = _stateCache[med];
    if (cached && ts - cached.at < CACHE_TTL_MS) return cached.data;
    var base = functionsBase();
    if (!base) return null;
    var cleanShots = (Array.isArray(shots) ? shots : []).slice(0, 2000).map(function (s) {
      return { date: s && s.date ? String(s.date) : '', med: String((s && s.med) || '') };
    });
    var controller = null, timer = null;
    try {
      if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        timer = setTimeout(function () { try { controller.abort(); } catch (_) {} }, 15000);
      }
      var res = await fetch(base + '/phase-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ med: med, shots: cleanShots, now: ts }),
        signal: controller ? controller.signal : undefined
      });
      if (!res.ok) return null;
      var data = await res.json();
      if (data && !data.empty) _stateCache[med] = { at: ts, data: data };
      return data;
    } catch (_) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Synchronous read of the last fetched state for a med (may be null on
  // first paint before the fetch resolves).
  function cachedState(medRaw) {
    var c = _stateCache[normalizeMedId(medRaw)];
    return c ? c.data : null;
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  window.GNPhaseTemplates = Object.freeze({
    phaseState: phaseState,
    cachedState: cachedState,
    phaseArc: phaseArc,
    phaseNode: phaseNode,
    progressPoint: progressPoint,
    arcPath: arcPath,
    phaseName: phaseName,
    phaseLines: phaseLines,
    templateChip: templateChip,
    normalizeMedId: normalizeMedId,
    clamp01: clamp01
  });
})();
