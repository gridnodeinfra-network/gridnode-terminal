/* GRID//NODE Phase Templates
 * Template data + geometry engine for the Phase Engine reactor core.
 * Three template types:
 *   weekly  - GLP-1s: 6 phases across a 7-day PK arc (onset -> peak -> wear-off)
 *   cycle   - Healing peptides: week-based protocol arcs (loading -> active -> off)
 *   generic - Fallback: neutral onset -> active -> wear-off for unmapped compounds
 *
 * Phase clock = days since first logged shot of the current cycle.
 * All Now/Watch/Do content is educational, never prescriptive. WATCH items
 * carry clinician-escalation lines. Never invent pharmacology.
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
  /* Template definitions                                                */
  /* ------------------------------------------------------------------ */

  var GLP1_PHASES = [
    {
      id: 'activation', color: '#4fb8d8',
      start: 0, end: 6 / 168,
      nameKey: 'phase.tmpl.activation', nameFb: 'ACTIVATION',
      nowKey: 'phase.tmpl.activation.now', nowFb: ['Drug absorbing, receptors engaging.', 'Gastric emptying starting to slow. Most feel little yet.'],
      watchKey: 'phase.tmpl.activation.watch', watchFb: ['Injection-site sting or redness (6-8%).', 'Mild fatigue. Log anything notable and discuss with your clinician.'],
      doKey: 'phase.tmpl.activation.do', doFb: ['Rotate injection site weekly.', 'Eat a protein-containing meal.', 'Pre-hydrate with electrolytes.', 'Evening injection puts peak levels during sleep.']
    },
    {
      id: 'taking-effect', color: '#63b98b',
      start: 6 / 168, end: 24 / 168,
      nameKey: 'phase.tmpl.takingEffect', nameFb: 'TAKING EFFECT',
      nowKey: 'phase.tmpl.takingEffect.now', nowFb: ['Levels climbing toward peak.', 'Appetite circuits engaging, food noise starting to quiet.'],
      watchKey: 'phase.tmpl.takingEffect.watch', watchFb: ['Nausea onset, the most common effect (28-44%).', 'Early fullness, burping, reflux.', 'Fatigue or headache. Discuss persistent issues with your clinician.'],
      doKey: 'phase.tmpl.takingEffect.do', doFb: ['Eat 5-6 small meals.', 'Choose lean, gentle protein.', 'Avoid high-fat, fried, spicy, carbonated foods.', 'Sip water steadily. Ginger can ease nausea.']
    },
    {
      id: 'peak-effect', color: '#d3a24a',
      start: 24 / 168, end: 72 / 168,
      nameKey: 'phase.tmpl.peakEffect', nameFb: 'PEAK EFFECT',
      nowKey: 'phase.tmpl.peakEffect.now', nowFb: ['Peak drug levels. Maximum appetite suppression.', 'Quietest food noise of the cycle.'],
      watchKey: 'phase.tmpl.peakEffect.watch', watchFb: ['Nausea peaks here. Vomiting (8-24%), diarrhea (19-30%).', 'Sulfur burps, dizziness (4-8%).', 'Dose-escalation weeks hit hardest.', 'RED FLAG: vomiting preventing fluids over 24h. Contact your provider.'],
      doKey: 'phase.tmpl.peakEffect.do', doFb: ['Small, bland meals.', 'Keep electrolytes up.', 'Do not lie down right after eating.', 'Log side effects as they happen.']
    },
    {
      id: 'cruise', color: '#4aa89b',
      start: 72 / 168, end: 144 / 168,
      nameKey: 'phase.tmpl.cruise', nameFb: 'CRUISE',
      nowKey: 'phase.tmpl.cruise.now', nowFb: ['Post-peak plateau. Steady, predictable suppression.', 'GI effects easing.'],
      watchKey: 'phase.tmpl.cruise.watch', watchFb: ['Lingering mild nausea.', 'Constipation has the longest tail.', 'Risk of undereating without noticing.'],
      doKey: 'phase.tmpl.cruise.do', doFb: ['Protein at every meal to protect muscle.', 'Fiber plus water for regularity.', 'Keep consistent meal timing.', 'Best window of the week for activity.']
    },
    {
      id: 'winding-down', color: '#c08a52',
      start: 144 / 168, end: 156 / 168,
      nameKey: 'phase.tmpl.windingDown', nameFb: 'WINDING DOWN',
      nowKey: 'phase.tmpl.windingDown.now', nowFb: ['Approaching trough. Appetite signals returning.', 'Gastric emptying normalizing.'],
      watchKey: 'phase.tmpl.windingDown.watch', watchFb: ['Returning hunger and food noise.', 'Carb cravings, mild irritability.', 'GI effects usually minimal by now.'],
      doKey: 'phase.tmpl.windingDown.do', doFb: ['Protein-rich snacks.', 'Keep meal structure even as hunger returns.', 'Prep for injection day.', 'Log returning hunger patterns.']
    },
    {
      id: 'wear-off', color: '#c26674',
      start: 156 / 168, end: 1,
      nameKey: 'phase.tmpl.wearOff', nameFb: 'WEAR-OFF WINDOW',
      nowKey: 'phase.tmpl.wearOff.now', nowFb: ['Trough levels. Least drug activity of the cycle.', 'Appetite nearest baseline.'],
      watchKey: 'phase.tmpl.wearOff.watch', watchFb: ['Strongest hunger of the week, widely reported days 6-7.', 'Loudest food noise.', 'Thirst often misread as hunger.'],
      doKey: 'phase.tmpl.wearOff.do', doFb: ['Mindful portions, slow eating.', 'Hydrate before assuming hunger.', 'Keep trigger foods out of reach.', 'Dose on schedule. Log the shot to restart the cycle.']
    }
  ];

  var BPC157_PHASES = [
    {
      id: 'initiation', color: '#4fb8d8',
      start: 0, end: 7 / 84,
      nameKey: 'phase.tmpl.bpc.initiation', nameFb: 'INITIATION',
      nowKey: 'phase.tmpl.bpc.initiation.now', nowFb: ['First week of the protocol.', 'Early days establish routine and baseline, not results.'],
      watchKey: 'phase.tmpl.bpc.initiation.watch', watchFb: ['Injection-site redness or soreness.', 'Unusual dizziness, nausea, or fatigue. Log and discuss with your clinician.'],
      doKey: 'phase.tmpl.bpc.initiation.do', doFb: ['Log every dose at the same time daily.', 'Record baseline pain and function scores.', 'Note the target area so later weeks have a comparison.']
    },
    {
      id: 'early-response', color: '#63b98b',
      start: 7 / 84, end: 28 / 84,
      nameKey: 'phase.tmpl.bpc.earlyResponse', nameFb: 'EARLY RESPONSE',
      nowKey: 'phase.tmpl.bpc.earlyResponse.now', nowFb: ['Window where first noticeable changes are most often reported.', 'Reduced discomfort, easier movement.'],
      watchKey: 'phase.tmpl.bpc.earlyResponse.watch', watchFb: ['Whether discomfort trends up, down, or flat across the week.', 'Temptation to overdo activity because it feels better.'],
      doKey: 'phase.tmpl.bpc.earlyResponse.do', doFb: ['Keep activity and rehab consistent.', 'Do not change three variables at once.', 'Weekly check-in: pain score, range of motion, new capabilities.']
    },
    {
      id: 'deep-protocol', color: '#d3a24a',
      start: 28 / 84, end: 56 / 84,
      nameKey: 'phase.tmpl.bpc.deepProtocol', nameFb: 'DEEP PROTOCOL',
      nowKey: 'phase.tmpl.bpc.deepProtocol.now', nowFb: ['Structural window. Tendons, ligaments, and gut lining remodel slowly.', 'This phase is about staying the course.'],
      watchKey: 'phase.tmpl.bpc.deepProtocol.watch', watchFb: ['Plateaus are normal here.', 'If objective function has not moved in 2+ weeks, discuss with your provider rather than extending blindly.'],
      doKey: 'phase.tmpl.bpc.deepProtocol.do', doFb: ['Continue logging.', 'Note return-to-activity milestones.', 'Decide in advance what "done" looks like. Do not drift.']
    },
    {
      id: 'off-reassess', color: '#c26674',
      start: 56 / 84, end: 1,
      nameKey: 'phase.tmpl.bpc.offReassess', nameFb: 'OFF / REASSESS',
      nowKey: 'phase.tmpl.bpc.offReassess.now', nowFb: ['Break period. Documented practice is time off roughly equal to time on.', 'No human washout period is established.'],
      watchKey: 'phase.tmpl.bpc.offReassess.watch', watchFb: ['Whether gains hold, fade, or keep improving off-protocol.', 'Any delayed issues.'],
      doKey: 'phase.tmpl.bpc.offReassess.do', doFb: ['Keep a light weekly function log during the break.', 'Reassess with your clinician before another round.']
    }
  ];

  var TB500_PHASES = [
    {
      id: 'loading', color: '#4fb8d8',
      start: 0, end: 6 / 16,
      nameKey: 'phase.tmpl.tb500.loading', nameFb: 'LOADING',
      nowKey: 'phase.tmpl.tb500.loading.now', nowFb: ['Higher-frequency phase building systemic levels.', 'Effects are slower and broader than BPC-157. Expect weeks, not days.'],
      watchKey: 'phase.tmpl.tb500.loading.watch', watchFb: ['Injection days vs. off days in your log.', 'Unusual fatigue or head pressure, occasionally reported. Discuss with your clinician.', 'Do not judge the protocol in week 2.'],
      doKey: 'phase.tmpl.tb500.loading.do', doFb: ['Log both weekly doses.', 'Note mobility and function weekly.', 'Consistency matters most here. Missed loading doses are the commonest self-reported reason for poor results.']
    },
    {
      id: 'maintenance', color: '#63b98b',
      start: 6 / 16, end: 12 / 16,
      nameKey: 'phase.tmpl.tb500.maintenance', nameFb: 'MAINTENANCE',
      nowKey: 'phase.tmpl.tb500.maintenance.now', nowFb: ['Frequency steps down to weekly.', 'This phase answers: do gains hold on less frequent dosing?'],
      watchKey: 'phase.tmpl.tb500.maintenance.watch', watchFb: ['Whether function holds steady, keeps improving, or slips after step-down.'],
      doKey: 'phase.tmpl.tb500.maintenance.do', doFb: ['Keep the weekly log going, lighter touch.', 'Compare against loading-phase notes at the same checkpoint.']
    },
    {
      id: 'off-reassess', color: '#c26674',
      start: 12 / 16, end: 1,
      nameKey: 'phase.tmpl.tb500.offReassess', nameFb: 'OFF / REASSESS',
      nowKey: 'phase.tmpl.tb500.offReassess.now', nowFb: ['Break and evaluation period.'],
      watchKey: 'phase.tmpl.tb500.offReassess.watch', watchFb: ['Durability of changes off-protocol.'],
      doKey: 'phase.tmpl.tb500.offReassess.do', doFb: ['Decide with your clinician whether another round is warranted.', 'Or whether the issue needs a different approach: imaging, PT, etc.']
    }
  ];

  var GHKCU_PHASES = [
    {
      id: 'initiation', color: '#4fb8d8',
      start: 0, end: 4 / 16,
      nameKey: 'phase.tmpl.ghk.initiation', nameFb: 'INITIATION',
      nowKey: 'phase.tmpl.ghk.initiation.now', nowFb: ['Ramp-in. Skin and connective tissue respond slowly.', 'Nothing here works overnight. Set expectations.'],
      watchKey: 'phase.tmpl.ghk.initiation.watch', watchFb: ['Skin tolerance: redness, tingling.', 'Especially if also using retinoids or acids.', 'Any systemic oddities. Discuss with your clinician.'],
      doKey: 'phase.tmpl.ghk.initiation.do', doFb: ['Daily log.', 'Take standardized day-0 photos: same light, same angle.', 'You will not remember "before" in week 10.']
    },
    {
      id: 'active-remodeling', color: '#63b98b',
      start: 4 / 16, end: 8 / 16,
      nameKey: 'phase.tmpl.ghk.remodeling', nameFb: 'ACTIVE REMODELING',
      nowKey: 'phase.tmpl.ghk.remodeling.now', nowFb: ['Main working window.', 'Collagen and elastin remodeling underway, still subtle.'],
      watchKey: 'phase.tmpl.ghk.remodeling.watch', watchFb: ['The urge to judge early.', 'Meaningful comparison needs the day-0 baseline.'],
      doKey: 'phase.tmpl.ghk.remodeling.do', doFb: ['Stay consistent.', 'Mid-cycle photo set at week 6, identical conditions.', 'Note skin texture, firmness, wound-healing speed.']
    },
    {
      id: 'consolidation', color: '#d3a24a',
      start: 8 / 16, end: 12 / 16,
      nameKey: 'phase.tmpl.ghk.consolidation', nameFb: 'CONSOLIDATION',
      nowKey: 'phase.tmpl.ghk.consolidation.now', nowFb: ['Final stretch of the documented cycle.', 'Before/after comparisons are actually informative now.'],
      watchKey: 'phase.tmpl.ghk.consolidation.watch', watchFb: ['Copper-load signs per your clinician guidance.', 'The documented reason for cycling off. Do not extend indefinitely without a plan.'],
      doKey: 'phase.tmpl.ghk.consolidation.do', doFb: ['Final photo set and written comparison vs. day 0.', 'Decide the off-period length in advance.']
    },
    {
      id: 'copper-break', color: '#c26674',
      start: 12 / 16, end: 1,
      nameKey: 'phase.tmpl.ghk.copperBreak', nameFb: 'COPPER BREAK',
      nowKey: 'phase.tmpl.ghk.copperBreak.now', nowFb: ['Off period. Documented practice pauses here to clear copper load.'],
      watchKey: 'phase.tmpl.ghk.copperBreak.watch', watchFb: ['Whether skin gains hold during the break.'],
      doKey: 'phase.tmpl.ghk.copperBreak.do', doFb: ['Light monthly check-in note.', 'Reassess before any repeat cycle.']
    }
  ];

  var CJCIPA_PHASES = [
    {
      id: 'titration-ramp', color: '#4fb8d8',
      start: 0, end: 4 / 16,
      nameKey: 'phase.tmpl.cjcipa.titration', nameFb: 'TITRATION RAMP',
      nowKey: 'phase.tmpl.cjcipa.titration.now', nowFb: ['Gradual ramp per documented schedules.', 'Sleep is usually the first thing people report noticing.'],
      watchKey: 'phase.tmpl.cjcipa.titration.watch', watchFb: ['Sleep quality, better or worse. Some report vivid dreams.', 'Morning grogginess, injection-site irritation, water retention.', 'Report persistent issues to your clinician.'],
      doKey: 'phase.tmpl.cjcipa.titration.do', doFb: ['Log dose time nightly. Timing consistency matters.', 'Keep the pre-bed window and empty-stomach gap consistent.', 'Track sleep subjectively.']
    },
    {
      id: 'full-protocol', color: '#63b98b',
      start: 4 / 16, end: 12 / 16,
      nameKey: 'phase.tmpl.cjcipa.fullProtocol', nameFb: 'FULL PROTOCOL',
      nowKey: 'phase.tmpl.cjcipa.fullProtocol.now', nowFb: ['Steady-state window.', 'Recovery, energy, and body-composition trends are evaluated here, not in week 2.'],
      watchKey: 'phase.tmpl.cjcipa.fullProtocol.watch', watchFb: ['Trends over weeks, not days: recovery, sleep averages, waist trend.', 'Diminishing returns late in the window. Possible desensitization, the documented reason for cycling.'],
      doKey: 'phase.tmpl.cjcipa.fullProtocol.do', doFb: ['Weekly check-in: sleep average, recovery rating, one body metric.', 'Keep training and diet stable so the log means something.']
    },
    {
      id: 'washout', color: '#c26674',
      start: 12 / 16, end: 1,
      nameKey: 'phase.tmpl.cjcipa.washout', nameFb: 'WASHOUT',
      nowKey: 'phase.tmpl.cjcipa.washout.now', nowFb: ['Off period. Documented purpose: receptor sensitivity reset.'],
      watchKey: 'phase.tmpl.cjcipa.washout.watch', watchFb: ['How sleep and recovery feel off-protocol vs. on.', 'This comparison is the most valuable data the cycle produces.'],
      doKey: 'phase.tmpl.cjcipa.washout.do', doFb: ['Light log: sleep plus one recovery note weekly.', 'Plan the next cycle start date rather than drifting back on.']
    }
  ];

  var GENERIC_PHASES = [
    {
      id: 'onset', color: '#4fb8d8',
      start: 0, end: 0.2,
      nameKey: 'phase.tmpl.generic.onset', nameFb: 'ONSET',
      nowKey: 'phase.tmpl.generic.onset.now', nowFb: ['Early cycle after the latest logged shot.', 'New observations begin shaping this signal.'],
      watchKey: 'phase.tmpl.generic.onset.watch', watchFb: ['How you feel in the first hours and days.', 'Log anything notable and discuss with your clinician.'],
      doKey: 'phase.tmpl.generic.onset.do', doFb: ['Log consistently at the same time.', 'Note appetite, energy, sleep, and mood daily.']
    },
    {
      id: 'active-window', color: '#63b98b',
      start: 0.2, end: 0.7,
      nameKey: 'phase.tmpl.generic.active', nameFb: 'ACTIVE WINDOW',
      nowKey: 'phase.tmpl.generic.active.now', nowFb: ['Estimated active-cycle window.', 'Compare this point with your own earlier logged cycles.'],
      watchKey: 'phase.tmpl.generic.active.watch', watchFb: ['Trends across days, not single data points.', 'Anything that feels off. Discuss with your clinician.'],
      doKey: 'phase.tmpl.generic.active.do', doFb: ['Keep the log going.', 'Weekly review: what moved, what held steady.']
    },
    {
      id: 'wear-off', color: '#c26674',
      start: 0.7, end: 1,
      nameKey: 'phase.tmpl.generic.wearOff', nameFb: 'WEAR-OFF',
      nowKey: 'phase.tmpl.generic.wearOff.now', nowFb: ['Late-cycle estimate before the next expected event.', 'Effects fading toward baseline.'],
      watchKey: 'phase.tmpl.generic.wearOff.watch', watchFb: ['How the fade feels compared to last cycle.', 'Keep logging your own patterns.'],
      doKey: 'phase.tmpl.generic.wearOff.do', doFb: ['Dose on schedule if continuing.', 'Review the full cycle before the next one starts.']
    }
  ];

  /* ------------------------------------------------------------------ */
  /* Template registry                                                   */
  /* ------------------------------------------------------------------ */

  var TEMPLATES = [
    {
      id: 'glp1-weekly', type: 'weekly', cycleDays: 7,
      chipKey: 'phase.tmpl.chipGlp1', chipFb: 'GLP-1 · 7-DAY RING',
      match: ['zepbound_tirzepatide', 'mounjaro_tirzepatide', 'tirzepatide_compound',
              'wegovy_semaglutide', 'ozempic_semaglutide', 'semaglutide_compound', 'retatrutide'],
      phases: GLP1_PHASES
    },
    {
      id: 'bpc157-cycle', type: 'cycle', cycleDays: 84,
      chipKey: 'phase.tmpl.chipBpc', chipFb: 'BPC-157 · CYCLE WHEEL',
      match: ['bpc157'],
      phases: BPC157_PHASES
    },
    {
      id: 'tb500-cycle', type: 'cycle', cycleDays: 112,
      chipKey: 'phase.tmpl.chipTb500', chipFb: 'TB-500 · CYCLE WHEEL',
      match: ['tb500', 'thymosin_beta4'],
      phases: TB500_PHASES
    },
    {
      id: 'ghkcu-cycle', type: 'cycle', cycleDays: 112,
      chipKey: 'phase.tmpl.chipGhk', chipFb: 'GHK-Cu · CYCLE WHEEL',
      match: ['ghk_cu_topical', 'ghk_cu_injectable'],
      phases: GHKCU_PHASES
    },
    {
      id: 'cjcipa-cycle', type: 'cycle', cycleDays: 112,
      chipKey: 'phase.tmpl.chipCjcIpa', chipFb: 'GH STACK · CYCLE WHEEL',
      match: ['cjc1295_dac', 'cjc1295_nodac', 'ipamorelin', 'sermorelin', 'tesamorelin'],
      phases: CJCIPA_PHASES
    },
    {
      id: 'generic-cycle', type: 'generic', cycleDays: 7,
      chipKey: 'phase.tmpl.chipGeneric', chipFb: 'GENERIC CYCLE',
      match: [],
      phases: GENERIC_PHASES
    }
  ];

  function normalizeMedId(med) {
    try {
      if (window.GNModules && window.GNModules.normalizeMedicationId) {
        return window.GNModules.normalizeMedicationId(med) || '';
      }
    } catch (_) {}
    return String(med || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  function templateForMed(med) {
    var id = normalizeMedId(med);
    for (var i = 0; i < TEMPLATES.length; i++) {
      if (TEMPLATES[i].match.indexOf(id) !== -1) return TEMPLATES[i];
    }
    return TEMPLATES[TEMPLATES.length - 1]; // generic fallback
  }

  function templateById(id) {
    for (var i = 0; i < TEMPLATES.length; i++) {
      if (TEMPLATES[i].id === id) return TEMPLATES[i];
    }
    return TEMPLATES[TEMPLATES.length - 1];
  }

  /* ------------------------------------------------------------------ */
  /* Geometry engine: template + progress -> arcs, nodes, active phase   */
  /* Angles in degrees, 0 = top (12 o'clock), clockwise.                  */
  /* ------------------------------------------------------------------ */

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function activePhase(template, progress) {
    var p = clamp01(progress);
    var phases = template.phases;
    for (var i = 0; i < phases.length; i++) {
      if (p >= phases[i].start && p < phases[i].end) return { phase: phases[i], index: i };
    }
    return { phase: phases[phases.length - 1], index: phases.length - 1 };
  }

  // Arc segment for a phase: { startDeg, endDeg, sweepDeg }
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

  function phaseName(phase) { return tx(phase.nameKey, phase.nameFb); }
  function phaseLines(phase, kind) {
    // kind: 'now' | 'watch' | 'do'
    // NOTE: keys like phase.tmpl.<phase>.<kind> are intentionally NOT in the
    // locale catalogs; content lives in the English fallbacks below. GN_I18N
    // returns the raw key for missing keys, so detect that and use fallback.
    var key = phase[kind + 'Key'], fb = phase[kind + 'Fb'] || [];
    var out = null;
    try {
      if (window.GN_I18N && window.GN_I18N.t) {
        var v = window.GN_I18N.t(key);
        if (v && v !== key) out = v;
      }
    } catch (_) {}
    if (Array.isArray(out)) return out;
    if (typeof out === 'string' && out) return [out];
    return fb;
  }
  function templateChip(template) { return tx(template.chipKey, template.chipFb); }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  window.GNPhaseTemplates = Object.freeze({
    templates: TEMPLATES,
    templateForMed: templateForMed,
    templateById: templateById,
    activePhase: activePhase,
    phaseArc: phaseArc,
    phaseNode: phaseNode,
    progressPoint: progressPoint,
    arcPath: arcPath,
    phaseName: phaseName,
    phaseLines: phaseLines,
    templateChip: templateChip,
    clamp01: clamp01
  });
})();
