/* GRID//NODE Peptide Evidence Engine
 * Canonical, primary-source-derived evidence models for the Phase Engine.
 * Verified 2026-08-10 against FDA labels, ClinicalTrials.gov API v2, and
 * indexed peer-reviewed literature (Europe PMC). Pure math — no DOM.
 * Loaded as its own script so the bundle growth gate stays intact.
 * Node-testable: require() returns the same API.
 */
(function (global) {
  'use strict';

  const H = 1, DAY = 24;

  /* ── Evidence tiers ────────────────────────────────────────────────────
   * pk   : human exposure curve eligible (exact molecule/formulation/route)
   * pd   : human response window eligible (biomarker/PD, NOT a curve)
   * none : timeline only — no eligible human model as of 2026-08-10
   * iv   : human IV study exists but logged route is uncharacterized
   * ───────────────────────────────────────────────────────────────────── */
  const models = {
    /* ——— Approved GLP-1 / metabolic track (FDA labels) ——— */
    zepbound_tirzepatide: curve('pk', 24, [8, 72], 120, 21, [
      src('FDA Mounjaro/Zepbound label', 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/215866s000lbl.pdf'),
      src('FDA Zepbound label', 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/216419s000lbl.pdf')
    ], ['Median Tmax 24 h (range 8–72 h). Half-life ≈ 5 days (label).']),
    wegovy_semaglutide: curve('pk', 48, [24, 72], 168, 21, [
      src('FDA Wegovy label', 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/215256s013lbl.pdf'),
      src('FDA Ozempic label', 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/209637s014lbl.pdf')
    ], ['Tmax 1–3 days; half-life ≈ 7 days (labels).']),
    retatrutide: curve('pk', 36, [12, 72], 144, 21, [
      src('Urva et al. 2022, Lancet (Phase 1b)', 'https://doi.org/10.1016/S0140-6736(22)02033-5'),
      src('Jastreboff et al. 2023, NEJM (Phase 2)', 'https://doi.org/10.1056/NEJMoa2301973')
    ], ['Dose-proportional PK; t½ ≈ 6 days; median Tmax 12–49 h (Phase 1b).']),

    /* ——— Research library · human PK available ——— */
    cjc1295_dac: curve('pk', 12, [8, 48], 168, 28, [
      src('Teichman et al. 2006, JCEM', 'https://doi.org/10.1210/jc.2005-1536'),
      src('Ionescu & Frohman 2006, JCEM', 'https://doi.org/10.1210/jc.2006-1702')
    ], ['SC t½ 5.8–8.1 days (healthy adults). PD layer: GH ↑ 2–10× ≥6 d; IGF-I ↑ 1.5–3× for 9–28 d — response window is PD, not concentration.', 'DAC variant only — no-DAC products never inherit this model.']),
    tesamorelin: curve('pk', 0.15, [0.05, 0.5], 0.133, 1, [
      src('Egrifta FDA label (12.3)', 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2016/021505s003lbl.pdf')
    ], ['SC bioavailability <4%; Tmax 0.15 h; t½ 8 min after single SC dose; Vd 4.8 L/kg (label).']),
    thymosin_alpha1: curve('pk', 2, [1, 2], 3, 1, [
      src('Rost et al. 1999, Int J Clin Pharmacol Ther', 'https://pubmed.ncbi.nlm.nih.gov/10027483/')
    ], ['SC 900 µg/m²: Tmax 1–2 h; t½ <3 h; Cmax 30–80 µg/L; no accumulation. Formulation-dependent AUC (Zadaxin vs Timosina).']),
    elamipretide_ss31: curve('pk', 1, [0.5, 1], 9, 2, [
      src('Forzinity FDA label (12.3)', 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/217589s000lbl.pdf')
    ], ['SC Tmax 0.5–1 h; bioavailability ≈92%; Vd ≈0.5 L/kg; ~100% of dose in urine by 48 h. t½ ≈9 h derived from 48-h recovery (not a stated label value).', 'Gray-market SS-31 vials carry no approved-brand manufacturing control.']),

    /* ——— Research library · human response windows (PD, not PK) ——— */
    semax: window('pd', [[0, 10 * DAY]], 30, [
      src('Gusev et al. 2018, Zh Nevrol Psikhiatr', 'https://pubmed.ncbi.nlm.nih.gov/29798983/'),
      src('Panikratova et al. 2020, Dokl Biol Sci', 'https://doi.org/10.1134/s001249662001007x')
    ], ['Human PD only: stroke trial (n=110), intranasal 6 mg/day ×10 d ×2 courses — plasma BDNF elevated and sustained through the study period; acute fMRI connectivity changes 5–20 min. No published human plasma PK; tracker half-life values are animal-derived.']),
    selank: window('pd', [[0.08, 0.33]], 1, [
      src('Panikratova et al. 2020, Dokl Biol Sci', 'https://doi.org/10.1134/s001249662001007x'),
      src('Doyno & White 2021, J Clin Pharmacol', 'https://doi.org/10.1002/jcph.1922')
    ], ['Human PD only: resting-state fMRI changes 5–20 min after administration (n=52). No published human PK.', '2021 J Clin Pharmacol review: poorly studied Russian drug sold to US consumers as a supplement — context, not endorsement.']),
    ghk_cu_topical: window('pd', [[0, 84 * DAY]], 90, [
      src('12-week peptide serum study (2026)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12968976/'),
      src('Copper tripeptide-1 scar gel study (2025)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12459080/')
    ], ['Topical only: cosmetic outcome windows from published human studies (12-week trials). No systemic exposure curve — topical entries never display systemic PK. Injectable GHK-Cu has no published human study.']),

    /* ——— Research library · timeline only ——— */
    bpc157: none([
      src('He et al. 2022, Front Pharmacol (rat/dog ADME)', 'https://doi.org/10.3389/fphar.2022.1026182'),
      src('Lee & Burgess 2025 (IV pilot, n=2 — no PK)', 'https://pubmed.ncbi.nlm.nih.gov/40131143/'),
      src('Mateescu et al. 2025, Pharmaceutics', 'https://doi.org/10.3390/pharmaceutics18050625')
    ], [
      'No human plasma concentrations published as of 2026-08-10. Phase I (NCT02637284) terminated without results.',
      'Claim audit: “4 h half-life” is unsourced vendor lore; “sub-30-min human pilot” is a misattribution — the value is rat/dog IV/IM data (t½ <30 min; IM bioavailability 14–19% rat, 45–51% dog) and the n=2 pilot measured no concentrations.',
      '2026 registry entries (NCT07437547, Hudson Biotech) are part of a fabricated trial cluster — not human evidence.'
    ], { animal: { tHalfH: 0.5, species: 'RAT / DOG', route: 'IV / IM', label: 'RAT / DOG IV/IM' } }),
    tb500: none([
      src('Rahaman et al. 2024, J Chromatogr B (rat metabolism)', 'https://doi.org/10.1016/j.jchromb.2024.124033'),
      src('FDA 503A bulk substance nomination', 'https://www.fda.gov/media/193349/download')
    ], [
      'No human PK or human outcome study for the fragment. Full-length Tβ4 PK must never transfer to TB-500.',
      'Claim audit: “10-day half-life” is unsourced vendor lore. Rat metabolism: primary metabolite Ac-LK peaks 0–6 h; Ac-LKK detected up to 72 h. WADA prohibits Tβ4 and fragments.',
      'The only registered “trial” (NCT07487363) is self-described as a fictional record in its own ClinicalTrials.gov summary.'
    ], { animal: { note: 'Rat metabolism: Ac-LK 0–6 h · Ac-LKK ≤72 h', species: 'RAT', route: 'IV/URINE', label: 'RAT METABOLISM' } }),
    cjc1295_nodac: none([
      src('Dominikowski et al. 2026, Front Endocrinol', 'https://doi.org/10.3389/fendo.2026.1822475')
    ], [
      'No published human PK for mod-GRF(1-29) as marketed. The circulating “~30 min half-life” is vendor consensus, not a primary human study.',
      'Nearest human anchor is sermorelin (Geref label, t½ ~11–12 min IV) — a different molecule; not transferable. DAC-variant PK (5.8–8.1 d) must never attach.'
    ]),
    mots_c: none([
      src('Endogenous MOTS-c, PCOS (2026)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12976357/'),
      src('Mendias & Awan 2026, Sports Med', 'https://doi.org/10.1007/s40279-026-02437-0')
    ], [
      'No administered-human study published. Human papers measure endogenous MOTS-c (PCOS, exercise) — never presented as drug-response curves.',
      'Registry integrity: “Phase 2a” NCT07505745 is part of the fabricated Hudson Biotech cluster — not human evidence.',
      'All circulating dosing protocols are allometric scalings from mouse IP studies.'
    ]),
    epitalon: none([
      src('Al-Dulaimi et al. 2025, Biogerontology (cell lines)', 'https://doi.org/10.1007/s10522-025-10315-x'),
      src('Araj et al. 2025, IJMS (overview)', 'https://doi.org/10.3390/ijms26062691')
    ], [
      'No indexed human trial located (Europe PMC, 2026-08-10). Human claims (retinitis pigmentosa n=162; elderly telomere studies) trace to a single Russian research group via secondary sources — bibliographically unstable.',
      'Identity: Epitalon (tetrapeptide AEDG) is not Epithalamin (bovine pineal extract).'
    ]),
    kpv: none([
      src('KPV, hepatic lipid accumulation (2026)', 'https://pubmed.ncbi.nlm.nih.gov/42064835/'),
      src('KPV oral nanoparticles (preclinical)', 'https://pubmed.ncbi.nlm.nih.gov/28143741/')
    ], [
      'No published human study located. Preclinical models only (DSS colitis, PepT1 transport, nanoparticle oral delivery, in vitro NAFLD).',
      'Oral-route claims derive from mouse nanoparticle studies — not human bioavailability.'
    ]),
    ghk_cu_injectable: none([
      src('Injectable Peptide Therapy primer (2026)', 'https://pubmed.ncbi.nlm.nih.gov/41476424/')
    ], [
      'No published human injection study of GHK-Cu. Injectable entries are timeline-only; topical response windows must not imply systemic behavior.',
      'Registry integrity: NCT07437586 (GHK-Cu gel) is part of the fabricated Hudson Biotech cluster.'
    ]),
    thymosin_beta4: ivStudy([
      src('Wang et al. 2021, J Cell Mol Med (first-in-human IV)', 'https://doi.org/10.1111/jcmm.16693')
    ], [
      'Human IV Phase I exists: rhTβ4 (NL005), Tmax 3–15 min, t½ 0.5–2.08 h, dose-proportional 0.05–25 µg/kg, no accumulation.',
      'Logged route is SC — SC PK is uncharacterized for this molecule, so no curve is drawn. IV study data shown for information only.',
      'Distinct from TB-500 (fragment). WADA prohibits Tβ4 and fragments.'
    ]),
    ipamorelin: ivStudy([
      src('Gobburu et al. 1999, Pharm Res (human IV PK/PD)', 'https://doi.org/10.1023/a:1018955126402')
    ], [
      'Human IV PK/PD exists: t½ ~2 h; CL 0.078 L/h/kg; Vss 0.22 L/kg; GH peak ~0.67 h (SC50 214 nmol/L).',
      'Logged route is SC — SC PK is uncharacterized in humans; no curve is drawn. IV study data shown for information only.',
      'Rat nasal bioavailability (~20%) is animal data and never rendered as human exposure.'
    ]),

    custom_compound: generic()
  };

  /* Alias entries must be resolved after the base object exists. */
  models.mounjaro_tirzepatide = same('zepbound_tirzepatide');
  models.tirzepatide_compound = same('zepbound_tirzepatide', ['Compounded product — no approved-brand manufacturing control. Model carries approved-molecule label PK with provenance caveat.']);
  models.ozempic_semaglutide = same('wegovy_semaglutide');
  models.semaglutide_compound = same('wegovy_semaglutide', ['Compounded product — approved-brand label PK shown with provenance caveat.']);
  models.thymosin_beta4_full = same('thymosin_beta4');

  const MODELS = Object.freeze(models);

  /* ── model constructors ─────────────────────────────────────────────── */
  function curve(tier, riseToPeakH, peakWindowH, tHalfH, horizonDays, sources, notes) {
    return { tier, kind: 'curve', riseToPeakH, peakWindowH, tHalfH, horizonDays, sources, notes };
  }
  function window(tier, windows, horizonDays, sources, notes) {
    return { tier, kind: 'window', windows, horizonDays, sources, notes };
  }
  function none(sources, notes, extra) {
    return Object.assign({ tier: 'none', kind: 'none', sources, notes }, extra || {});
  }
  function ivStudy(sources, notes) {
    return { tier: 'iv', kind: 'none', sources, notes };
  }
  function generic() {
    return { tier: 'generic', kind: 'curve', riseToPeakH: 18, peakWindowH: [12, 48], tHalfH: 84, horizonDays: 14, sources: [], notes: ['Generic timing model for an unidentified or custom compound — no identity evidence. Labeled as a relative model, never a measurement.'] };
  }
  function src(label, url) { return { label, url }; }
  function same(from, extraNotes) {
    const base = models[from];
    if (!extraNotes) return base;
    return Object.assign({}, base, { notes: (base.notes || []).concat(extraNotes) });
  }

  /* ── model math ─────────────────────────────────────────────────────── */
  function relativeLevel(model, elapsedHours) {
    if (!model || model.kind !== 'curve') return 0;
    const t = Math.max(0, elapsedHours);
    if (t <= model.riseToPeakH) return Math.min(1, t / Math.max(0.0001, model.riseToPeakH));
    return Math.exp(-Math.LN2 * (t - model.riseToPeakH) / Math.max(0.0001, model.tHalfH));
  }

  function buildProtocolCurve(shots, medId, rangeDays, now, pointCount) {
    const model = MODELS[medId] || generic();
    const count = pointCount || 96;
    const ts = now || Date.now();
    const relevant = (shots || []).filter(s => !s.archived && String(s.med) === String(medId));
    const RANGE_MAP = { '2w': 14, '1m': 30, '3m': 90 };
    const range = rangeDays === 'all'
      ? Math.max(30, rangeDaysFor(relevant, ts))
      : (RANGE_MAP[rangeDays] || (Number.isFinite(Number(rangeDays)) ? Number(rangeDays) : 30));
    const start = ts - range * DAY * H * 3600000;
    const end = Math.max(ts + 7 * DAY * H * 3600000, start + (range + 7) * DAY * H * 3600000);
    const span = end - start;

    const markers = relevant.map(s => ({ t: new Date(s.date).getTime(), dose: Number(s.dose) || 0, planned: new Date(s.date).getTime() > ts }))
      .filter(m => Number.isFinite(m.t) && m.t >= start - DAY * H * 3600000 && m.t <= end)
      .sort((a, b) => a.t - b.t);

    let points = [];
    let nowIndex = -1;
    if (model.kind === 'curve') {
      points = Array.from({ length: count }, (_, i) => {
        const time = start + span * i / (count - 1);
        const level = relevant.reduce((sum, s) => {
          const elapsedH = (time - new Date(s.date).getTime()) / 3600000;
          if (!Number.isFinite(elapsedH) || elapsedH < 0) return sum;
          return sum + relativeLevel(model, elapsedH);
        }, 0);
        return Math.min(1.6, level);
      });
      nowIndex = Math.round(((ts - start) / span) * (count - 1));
    } else if (model.kind === 'window') {
      points = Array.from({ length: count }, (_, i) => {
        const time = start + span * i / (count - 1);
        const inWindow = relevant.some(s => {
          const elapsedH = (time - new Date(s.date).getTime()) / 3600000;
          return model.windows.some(([a, b]) => elapsedH >= a && elapsedH <= b);
        });
        return inWindow ? 0.35 : 0;
      });
      nowIndex = Math.round(((ts - start) / span) * (count - 1));
    }

    return { points, nowIndex, markers, model, medId, start, end, now: ts, count, evidence: evidenceOf(model) };
  }

  function evidenceOf(model) {
    switch (model.tier) {
      case 'pk': return { state: 'pk', labelKey: 'peptide.evidencePk' };
      case 'pd': return { state: 'pd', labelKey: 'peptide.evidencePd' };
      case 'iv': return { state: 'iv', labelKey: 'peptide.evidenceIv' };
      case 'generic': return { state: 'generic', labelKey: 'peptide.evidenceGeneric' };
      default: return { state: 'none', labelKey: 'peptide.evidenceNone' };
    }
  }

  function rangeDaysFor(shots, ts) {
    if (!shots || !shots.length) return 30;
    const first = Math.min(...shots.filter(s => !s.archived).map(s => new Date(s.date).getTime()));
    return Math.max(30, Math.ceil((ts - first) / (DAY * H * 3600000)));
  }

  const api = Object.freeze({ MODELS, buildProtocolCurve, relativeLevel, evidenceOf });
  global.GN_PEPTIDE_PK = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
