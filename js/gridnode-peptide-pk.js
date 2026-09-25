/* GRID//NODE Peptide Evidence Engine — thin client
 * The evidence models and curve math now live server-side in the pk-curve
 * Supabase Edge Function. This module keeps the GN_PEPTIDE_PK surface but
 * buildProtocolCurve is async: it POSTs the shot records and resolves to the
 * server-computed build. The curated model table never ships to the browser.
 * Never rejects: on failure it resolves to a minimal empty build so the
 * renderers degrade gracefully (offline, blocked network, etc.).
 */
(function (global) {
  'use strict';

  function functionsBase() {
    try {
      if (typeof CLOUD_CONFIG !== 'undefined' && CLOUD_CONFIG && CLOUD_CONFIG.url) {
        return String(CLOUD_CONFIG.url).replace(/\/+$/, '') + '/functions/v1';
      }
    } catch (_) { /* CLOUD_CONFIG unavailable (bundle not loaded) */ }
    return null;
  }

  function emptyBuild(medId, now) {
    var ts = Number(now) || Date.now();
    return {
      points: [],
      nowIndex: -1,
      markers: [],
      start: ts,
      end: ts,
      now: ts,
      count: 0,
      medId: String(medId || ''),
      evidence: { state: 'none' },
      modelKind: 'none',
      tier: 'none',
      horizonDays: 7,
      curvePhase: null,
      dossier: { notes: [], sources: [], animal: null }
    };
  }

  async function buildProtocolCurve(shots, medId, rangeDays, now, pointCount) {
    var ts = Number(now) || Date.now();
    var base = functionsBase();
    if (!base || !medId) return emptyBuild(medId, ts);
    var cleanShots = (Array.isArray(shots) ? shots : []).slice(0, 2000).map(function (s) {
      return {
        date: s && s.date ? String(s.date) : '',
        dose: Number(s && s.dose) || 0,
        med: String((s && s.med) || ''),
        archived: !!(s && s.archived)
      };
    });
    var controller = null;
    var timer = null;
    try {
      if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        timer = setTimeout(function () { try { controller.abort(); } catch (_) {} }, 15000);
      }
      var res = await fetch(base + '/pk-curve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medId: String(medId),
          shots: cleanShots,
          rangeDays: rangeDays == null ? 30 : rangeDays,
          pointCount: pointCount || 96,
          now: ts
        }),
        signal: controller ? controller.signal : undefined
      });
      if (!res.ok) return emptyBuild(medId, ts);
      var data = await res.json();
      if (!data || !Array.isArray(data.points)) return emptyBuild(medId, ts);
      return {
        points: data.points,
        nowIndex: data.nowIndex,
        markers: Array.isArray(data.markers) ? data.markers : [],
        start: data.start,
        end: data.end,
        now: data.now,
        count: data.count,
        medId: data.medId,
        evidence: data.evidence && data.evidence.state ? data.evidence : { state: 'none' },
        modelKind: data.modelKind || 'none',
        tier: data.tier || 'none',
        horizonDays: data.horizonDays || 7,
        curvePhase: data.curvePhase || null,
        dossier: data.dossier || { notes: [], sources: [], animal: null }
      };
    } catch (_) {
      return emptyBuild(medId, ts);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  var api = Object.freeze({ buildProtocolCurve: buildProtocolCurve });
  global.GN_PEPTIDE_PK = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
