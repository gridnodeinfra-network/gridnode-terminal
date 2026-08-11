/* GRID//NODE Peptide Visualization Layer
 * Immersive, evidence-aware Phase Engine renderer. Reads the same active SHOTS
 * records as the live engine; never writes or syncs data. Pairs with
 * gridnode-peptide-pk.js (data + math). Canvas for the luminous scene, SVG
 * overlay for phase bands + animated trace + pulse (reduced-motion gated via
 * CSS, matching the weight-trend chart pattern).
 */
(function (global) {
  'use strict';

  const DAY_MS = 86400000;
  const HOUR_MS = 3600000;
  const tx = (key, fallback, vars) => global.GN_I18N && typeof global.GN_I18N.text === 'function'
    ? global.GN_I18N.text(key, fallback, vars)
    : (fallback || key);
  const $ = id => document.getElementById(id);
  const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';

  const C = {
    onset: '#00d4ff', active: '#00ff88', peak: '#ffd700',
    response: '#ff8c00', decay: '#ff5577', baseline: '#9898b0',
    grid: 'rgba(255,255,255,.07)', dim: '#8295a0',
    curve: '#00E6F0', curveSoft: 'rgba(0,230,240,.55)'
  };

  let lastRender = null; // { shots, medId, medLabel, labelMap, range, now }

  /* ── phase helpers ───────────────────────────────────────────────────── */
  function phaseFor(model, elapsedH) {
    if (!model || model.kind !== 'curve') return null;
    if (elapsedH <= model.riseToPeakH) return 'ONSET';
    if (elapsedH <= model.peakWindowH[1]) return 'PEAK';
    if (elapsedH <= model.riseToPeakH + 4 * model.tHalfH) return 'DECAY';
    return 'BASELINE';
  }
  const PHASE_KEYS = {
    ONSET: 'peptide.phaseOnset', PEAK: 'peptide.phasePeak',
    DECAY: 'peptide.phaseDecay', BASELINE: 'peptide.phaseBaseline'
  };
  const phaseLabel = name => (name ? tx(PHASE_KEYS[name], name) : '');

  function evidenceLabel(state) {
    return tx({
      pk: 'peptide.evidencePk', pd: 'peptide.evidencePd', iv: 'peptide.evidenceIv',
      none: 'peptide.evidenceNone', generic: 'peptide.evidenceGeneric'
    }[state] || 'peptide.evidenceNone', state || '');
  }

  /* ── canvas scene (shared by card, overlay, lanes) ──────────────────── */
  function drawScene(canvas, build, opts) {
    if (!canvas) return;
    const width = Math.max(280, canvas.clientWidth || 320);
    const height = opts.height || Math.max(110, canvas.clientHeight || 130);
    const scale = window.devicePixelRatio || 1;
    canvas.width = width * scale; canvas.height = height * scale;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padL = 6, padR = 6, padT = 8, padB = 10;
    const plotW = width - padL - padR, plotH = height - padT - padB;
    const xFor = t => padL + (t - build.start) / (build.end - build.start) * plotW;
    const yFor = v => padT + plotH - Math.max(0, Math.min(1.6, v)) / 1.6 * plotH;

    // grid: 7-day rhythm + horizon lines
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    const dayMs = DAY_MS;
    const startDay = Math.floor(build.start / dayMs) * dayMs;
    for (let t = startDay; t <= build.end; t += dayMs) {
      const x = xFor(t); if (x < padL - 1 || x > width - padR + 1) continue;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(padL, padT + plotH * 0.5); ctx.lineTo(width - padR, padT + plotH * 0.5); ctx.stroke();

    const model = build.model;
    if (model.kind === 'curve' && build.points.length) {
      // area gradient
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, 'rgba(0,230,240,.34)');
      grad.addColorStop(0.55, 'rgba(0,230,240,.12)');
      grad.addColorStop(1, 'rgba(0,230,240,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(xFor(build.start), padT + plotH);
      build.points.forEach((v, i) => ctx.lineTo(padL + plotW * i / (build.count - 1), yFor(v)));
      ctx.lineTo(xFor(build.end), padT + plotH);
      ctx.closePath(); ctx.fill();

      // glow pass + core pass
      ctx.shadowColor = C.curveSoft; ctx.shadowBlur = 14; ctx.strokeStyle = C.curveSoft; ctx.lineWidth = 4;
      ctx.beginPath();
      build.points.forEach((v, i) => { const x = padL + plotW * i / (build.count - 1), y = yFor(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.shadowBlur = 7; ctx.strokeStyle = C.curve; ctx.lineWidth = 2;
      ctx.beginPath();
      build.points.forEach((v, i) => { const x = padL + plotW * i / (build.count - 1), y = yFor(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.shadowBlur = 0;
    }

    // shot markers: filled = actual, hollow = planned
    build.markers.forEach(m => {
      const x = xFor(m.t);
      if (x < padL - 8 || x > width - padR + 8) return;
      const y = model.kind === 'curve' && build.points.length
        ? yFor(modelValueAt(build, m.t)) : padT + plotH * 0.72;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      if (m.planned) {
        ctx.strokeStyle = C.dim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.rect(-3.5, -3.5, 7, 7); ctx.stroke();
      } else {
        ctx.shadowColor = C.curve; ctx.shadowBlur = 8;
        ctx.fillStyle = C.curve; ctx.fillRect(-3.5, -3.5, 7, 7);
      }
      ctx.restore();
    });

    // state text for timeline-only / pd (no curve)
    if (model.kind === 'none' && build.points.length === 0 && opts.stateText !== false) {
      ctx.fillStyle = C.dim; ctx.font = '600 9px "Share Tech Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tx(model.tier === 'iv' ? 'peptide.ivTimeline' : 'peptide.timelineOnlyText', 'TIMELINE ONLY'), width / 2, padT + plotH / 2);
      ctx.textAlign = 'left';
    } else if (model.kind === 'window' && opts.stateText !== false) {
      ctx.fillStyle = C.response; ctx.font = '600 9px "Share Tech Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tx('peptide.pdWindowText', 'HUMAN RESPONSE WINDOW · PD'), width / 2, padT + plotH / 2);
      ctx.textAlign = 'left';
    }

    // now line (canvas core; pulse rings go in the SVG overlay)
    if (build.nowIndex >= 0 && opts.showNow !== false) {
      const nx = padL + plotW * build.nowIndex / (build.count - 1);
      ctx.strokeStyle = 'rgba(0,230,240,.5)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(nx, padT); ctx.lineTo(nx, padT + plotH); ctx.stroke();
      ctx.setLineDash([]);
      const ny = model.kind === 'curve' && build.points.length ? yFor(build.points[build.nowIndex]) : padT + plotH * 0.72;
      ctx.fillStyle = C.curve; ctx.beginPath(); ctx.arc(nx, ny, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function modelValueAt(build, t) {
    if (build.model.kind !== 'curve') return 0;
    const idx = Math.round((t - build.start) / (build.end - build.start) * (build.count - 1));
    return build.points[Math.max(0, Math.min(build.count - 1, idx))];
  }

  /* ── SVG overlay: phase bands + animated trace + pulse ──────────────── */
  function drawOverlay(svg, build, opts) {
    if (!svg) return;
    const width = Math.max(280, svg.clientWidth || 320);
    const height = opts.height || Math.max(110, svg.clientHeight || 130);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = '';

    const padL = 6, padR = 6, padT = 8, padB = 10;
    const plotW = width - padL - padR, plotH = height - padT - padB;
    const xFor = t => padL + (t - build.start) / (build.end - build.start) * plotW;

    // phase bands anchored to the most recent shot
    const model = build.model;
    const last = build.markers.filter(m => !m.planned).at(-1);
    if (model.kind === 'curve' && last) {
      const bands = [
        [model.riseToPeakH * 0.001, model.riseToPeakH, C.onset],
        [model.peakWindowH[0], model.peakWindowH[1], C.peak],
        [model.riseToPeakH, model.riseToPeakH + 4 * model.tHalfH, C.decay],
        [model.riseToPeakH + 4 * model.tHalfH, Math.max(model.riseToPeakH + 5 * model.tHalfH, model.horizonDays * 24), C.baseline]
      ];
      bands.forEach(([a, b, color]) => {
        if (b <= a) return;
        const x1 = xFor(last.t + a * HOUR_MS), x2 = xFor(last.t + b * HOUR_MS);
        if (x2 < padL || x1 > width - padR) return;
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', Math.max(padL, x1)); rect.setAttribute('y', padT);
        rect.setAttribute('width', Math.max(0, Math.min(x2, width - padR) - Math.max(padL, x1)));
        rect.setAttribute('height', plotH);
        rect.setAttribute('fill', color);
        rect.setAttribute('class', 'gn-phase-band');
        svg.appendChild(rect);
      });
    } else if (model.kind === 'window' && last) {
      model.windows.forEach(([a, b]) => {
        const x1 = xFor(last.t + a * HOUR_MS), x2 = xFor(last.t + b * HOUR_MS);
        if (x2 < padL || x1 > width - padR) return;
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', Math.max(padL, x1)); rect.setAttribute('y', padT);
        rect.setAttribute('width', Math.max(0, Math.min(x2, width - padR) - Math.max(padL, x1)));
        rect.setAttribute('height', plotH);
        rect.setAttribute('fill', C.response);
        rect.setAttribute('class', 'gn-phase-band');
        svg.appendChild(rect);
      });
    }

    // animated trace along the curve (CSS-gated; reduced motion = static)
    if (model.kind === 'curve' && build.points.length && opts.trace !== false) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'gn-live-trace');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#9be9ff');
      path.setAttribute('stroke-width', '1.4');
      path.setAttribute('stroke-linecap', 'round');
      const d = build.points.map((v, i) => {
        const x = padL + plotW * i / (build.count - 1), y = padT + plotH - Math.max(0, Math.min(1.6, v)) / 1.6 * plotH;
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join('');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }

    // now pulse
    if (build.nowIndex >= 0 && opts.showNow !== false) {
      const padLx = padL, plotWx = plotW;
      const nx = padLx + plotWx * build.nowIndex / (build.count - 1);
      const ny = model.kind === 'curve' && build.points.length
        ? padT + plotH - Math.max(0, Math.min(1.6, build.points[build.nowIndex])) / 1.6 * plotH
        : padT + plotH * 0.72;
      const ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('class', 'gn-pulse-ring');
      ring.setAttribute('cx', nx); ring.setAttribute('cy', ny); ring.setAttribute('r', '5');
      ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', C.curve); ring.setAttribute('stroke-width', '1.5');
      svg.appendChild(ring);
      const core = document.createElementNS(NS, 'circle');
      core.setAttribute('class', 'gn-pulse-core');
      core.setAttribute('cx', nx); core.setAttribute('cy', ny); core.setAttribute('r', '2.5');
      core.setAttribute('fill', C.curve);
      svg.appendChild(core);
    }
  }

  /* ── summary text (accessible, no color/pattern needed) ─────────────── */
  function summaryLine(medLabel, build, phaseName) {
    const model = build.model;
    if (model.kind === 'none') {
      return `${medLabel} · ${tx('peptide.summaryTimeline', 'timeline only')} · ${evidenceLabel(build.evidence.state)}`;
    }
    if (model.kind === 'window') {
      return `${medLabel} · ${tx('peptide.summaryWindow', 'response window')} · ${evidenceLabel(build.evidence.state)}`;
    }
    const last = build.markers.filter(m => !m.planned).at(-1);
    const elapsedH = last ? (build.now - last.t) / HOUR_MS : 0;
    const state = phaseName || phaseFor(model, elapsedH) || 'ONSET';
    const words = { ONSET: tx('peptide.summaryRising', 'rising'), PEAK: tx('peptide.summaryPeak', 'peak window'), DECAY: tx('peptide.summaryDecline', 'decline'), BASELINE: tx('peptide.summaryBaseline', 'baseline') };
    const since = last ? `${Math.floor(elapsedH / 24)}d ${Math.floor(elapsedH % 24)}h` : '—';
    return `${medLabel} · ${since} · ${words[state] || state} · ${evidenceLabel(build.evidence.state)}`;
  }

  /* ── dashboard card render (called by the bundle hook) ───────────────── */
  function render(opts) {
    try {
      const { canvas, readout, shots, medId, medLabel, labelMap, range, now, phaseName } = opts;
      if (!canvas || !medId) return;
      const engine = global.GN_PEPTIDE_PK;
      if (!engine) return;
      const build = engine.buildProtocolCurve(shots || [], medId, range || 30, now || Date.now());
      const chip = $('medEvidenceChip');
      const summary = $('medCurveSummary');
      const overlaySvg = $('medChartOverlay');
      lastRender = { shots, medId, medLabel, labelMap, range: range || 30, now: now || Date.now() };

      drawScene(canvas, build, { height: 130 });
      drawOverlay(overlaySvg, build, { height: 130 });

      const last = build.markers.filter(m => !m.planned).at(-1);
      const elapsedH = last ? (build.now - last.t) / HOUR_MS : 0;
      const phaseNameResolved = phaseFor(build.model, elapsedH) || phaseName || 'ONSET';

      if (readout) {
        const detail = document.createElement('span');
        detail.textContent = ` ${evidenceLabel(build.evidence.state)} · ${tx('peptide.modelNote', 'literature-derived relative model · not measured')}`;
        readout.replaceChildren(document.createTextNode(phaseLabel(phaseNameResolved)), detail);
      }
      if (chip) { chip.textContent = evidenceLabel(build.evidence.state); chip.dataset.state = build.evidence.state; }
      if (summary) {
        summary.textContent = summaryLine(medLabel || medId, build, phaseNameResolved);
        summary.setAttribute('aria-live', 'polite');
      }
      const expand = $('medExpandBtn');
      if (expand) expand.hidden = false;
    } catch (err) {
      console.warn('[peptide-viz] render failed, falling back', err);
    }
  }

  /* ── immersive overlay ───────────────────────────────────────────────── */
  function openOverlay() {
    try {
      if (!lastRender) return;
      const overlay = $('gnPeptideOverlay');
      if (!overlay) return;
      const { shots, medId, medLabel, labelMap, range, now } = lastRender;
      const engine = global.GN_PEPTIDE_PK;
      const build = engine.buildProtocolCurve(shots || [], medId, range, now, 160);

      $('gnPeptideTitle').textContent = medLabel || medId;
      const chip = $('gnPeptideChip');
      chip.textContent = evidenceLabel(build.evidence.state);
      chip.dataset.state = build.evidence.state;

      // big chart
      drawScene($('gnPeptideBigChart'), build, { height: 240, pointCount: 160 });
      drawOverlay($('gnPeptideBigOverlay'), build, { height: 240 });
      renderRing($('gnPeptideRing'), build, medLabel);
      renderDossier($('gnPeptideDossier'), build, medLabel);
      renderAnimal($('gnPeptideAnimal'), build);
      renderLanes($('gnPeptideLanes'), shots || [], labelMap || {});
      renderNext($('gnPeptideNext'));

      overlay.classList.add('active');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('gn-peptide-overlay-open');
      const closeBtn = $('gnPeptideClose');
      if (closeBtn) closeBtn.focus();
      wireBigChartInteractions(build);
    } catch (err) {
      console.warn('[peptide-viz] overlay failed', err);
    }
  }

  function closeOverlay() {
    const overlay = $('gnPeptideOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('gn-peptide-overlay-open');
    const expand = $('medExpandBtn');
    if (expand) expand.focus();
  }

  /* ── ring: focused-compound summary ─────────────────────────────────── */
  function renderRing(svg, build, medLabel) {
    if (!svg) return;
    const model = build.model;
    const last = build.markers.filter(m => !m.planned).at(-1);
    const elapsedH = last ? (build.now - last.t) / HOUR_MS : 0;
    const horizonH = model.horizonDays ? model.horizonDays * 24 : 24 * 7;
    const frac = Math.min(1, Math.max(0, elapsedH / horizonH));
    const phase = phaseFor(model, elapsedH) || (model.kind === 'none' ? 'BASELINE' : model.kind === 'window' ? 'RESPONSE' : 'ONSET');
    const R = 52, cx = 60, cy = 60;

    svg.setAttribute('viewBox', '0 0 120 120');
    svg.innerHTML = '';
    const bg = document.createElementNS(NS, 'circle');
    bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', R);
    bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', 'rgba(255,255,255,.1)'); bg.setAttribute('stroke-width', '8');
    svg.appendChild(bg);
    if (last) {
      const arc = document.createElementNS(NS, 'circle');
      arc.setAttribute('cx', cx); arc.setAttribute('cy', cy); arc.setAttribute('r', R);
      arc.setAttribute('fill', 'none');
      arc.setAttribute('stroke', { ONSET: C.onset, PEAK: C.peak, DECAY: C.decay, BASELINE: C.baseline, RESPONSE: C.response }[phase] || C.curve);
      arc.setAttribute('stroke-width', '8'); arc.setAttribute('stroke-linecap', 'round');
      arc.setAttribute('stroke-dasharray', `${(frac * 2 * Math.PI * R).toFixed(1)} ${(2 * Math.PI * R).toFixed(1)}`);
      arc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
      svg.appendChild(arc);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy - R);
      dot.setAttribute('r', '3'); dot.setAttribute('fill', { ONSET: C.onset, PEAK: C.peak, DECAY: C.decay, BASELINE: C.baseline, RESPONSE: C.response }[phase] || C.curve);
      svg.appendChild(dot);
    }
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', cx); label.setAttribute('y', cy - 2); label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#eef6f8'); label.setAttribute('font-size', '13'); label.setAttribute('font-weight', '700');
    label.setAttribute('font-family', '"Share Tech Mono", monospace');
    label.textContent = last ? phaseLabel(phase) : tx('peptide.noShots', 'NO SHOTS');
    svg.appendChild(label);
    const sub = document.createElementNS(NS, 'text');
    sub.setAttribute('x', cx); sub.setAttribute('y', cy + 16); sub.setAttribute('text-anchor', 'middle');
    sub.setAttribute('fill', C.dim); sub.setAttribute('font-size', '8'); sub.setAttribute('font-family', '"Share Tech Mono", monospace');
    sub.textContent = last ? `${Math.floor(elapsedH / 24)}d ${Math.floor(elapsedH % 24)}h · ${Math.round(frac * 100)}%` : tx('peptide.logToStart', 'LOG A SHOT TO START');
    svg.appendChild(sub);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${medLabel} — ${phaseLabel(phase)} — ${last ? `${Math.floor(elapsedH / 24)}d ${Math.floor(elapsedH % 24)}h elapsed` : 'no shots'}`);
  }

  /* ── dossier: sources + notes + claim audit ─────────────────────────── */
  function renderDossier(container, build, medLabel) {
    if (!container) return;
    const model = build.model;
    const parts = [];
    parts.push(`<div class="gn-peptide-dossier-head">${tx('peptide.dossier', 'EVIDENCE DOSSIER')} · ${safe(medLabel)}</div>`);
    parts.push(`<div class="gn-peptide-dossier-line"><b>${tx('peptide.dossierState', 'DISPLAY STATE')}</b> ${evidenceLabel(build.evidence.state)}</div>`);
    if (model.kind === 'curve') {
      parts.push(`<div class="gn-peptide-dossier-line"><b>${tx('peptide.dossierPeak', 'RISE TO PEAK')}</b> ${fmtH(model.riseToPeakH)}</div>`);
      parts.push(`<div class="gn-peptide-dossier-line"><b>${tx('peptide.dossierPeakWindow', 'PEAK WINDOW')}</b> ${fmtH(model.peakWindowH[0])}–${fmtH(model.peakWindowH[1])}</div>`);
      parts.push(`<div class="gn-peptide-dossier-line"><b>${tx('peptide.dossierHalfLife', 'MODEL HALF-LIFE')}</b> ${fmtH(model.tHalfH)}</div>`);
    }
    if ((model.notes || []).length) {
      parts.push(`<div class="gn-peptide-dossier-sub">${tx('peptide.dossierNotes', 'NOTES')}</div>`);
      model.notes.forEach(n => parts.push(`<div class="gn-peptide-dossier-note">▸ ${safe(n)}</div>`));
    }
    if ((model.sources || []).length) {
      parts.push(`<div class="gn-peptide-dossier-sub">${tx('peptide.dossierSources', 'SOURCES')}</div>`);
      model.sources.forEach(s => parts.push(`<a class="gn-peptide-dossier-src" href="${safe(s.url)}" target="_blank" rel="noopener noreferrer">↗ ${safe(s.label)}</a>`));
    }
    container.innerHTML = parts.join('');
  }

  function fmtH(hours) {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
    return `${Math.round(hours / 24 * 10) / 10} d`;
  }

  /* ── animal model panel (research context only) ─────────────────────── */
  function renderAnimal(container, build) {
    if (!container) return;
    const animal = build.model.animal;
    container.innerHTML = '';
    if (!animal) return;
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%'; canvas.style.height = '64px';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const width = 320, height = 64, scale = window.devicePixelRatio || 1;
    canvas.width = width * scale; canvas.height = height * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
    if (animal.tHalfH) {
      ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.shadowColor = 'rgba(255,140,0,.5)'; ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const t = i / 60 * 6 * animal.tHalfH;
        const v = Math.exp(-Math.LN2 * t / animal.tHalfH);
        const x = i / 60 * (width - 16) + 8;
        const y = height - 10 - v * (height - 20);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
    } else if (animal.note) {
      ctx.fillStyle = '#8295a0'; ctx.font = '600 9px "Share Tech Mono", monospace';
      ctx.fillText(safe(animal.note).slice(0, 60), 8, height / 2 + 3);
    }
    const head = document.createElement('div');
    head.className = 'gn-peptide-animal-head';
    head.textContent = `${tx('peptide.animalModel', 'ANIMAL MODEL')} · ${safe(animal.label || '')} — ${tx('peptide.animalNotHuman', 'NOT HUMAN EXPOSURE')}`;
    container.insertBefore(head, container.firstChild);
  }

  /* ── stack lanes (multi-compound, aligned, separate scales) ─────────── */
  function renderLanes(container, shots, labelMap) {
    if (!container) return;
    const engine = global.GN_PEPTIDE_PK;
    const active = (shots || []).filter(s => !s.archived);
    const meds = [...new Set(active.map(s => String(s.med)))];
    if (meds.length <= 1) { container.innerHTML = ''; return; }
    const now = Date.now();
    const parts = [];
    parts.push(`<div class="gn-peptide-lanes-head">${tx('peptide.stackTitle', 'STACK LANES')} · ${tx('peptide.separateScales', 'SEPARATE SCALES — CURVE HEIGHTS ARE NOT COMPARABLE')}</div>`);

    let modeledCount = 0;
    const perMed = meds.map(medId => {
      const build = engine.buildProtocolCurve(active, medId, 'all', now, 120);
      const modelable = build.model.kind !== 'none';
      if (modelable) modeledCount += 1;
      return { medId, build, modelable, label: labelMap[medId] || medId };
    });

    // overlap across modeled lanes
    let overlap = null;
    if (modeledCount >= 2) {
      const n = perMed[0].build.count;
      let hits = 0, total = 0;
      const dayMs = DAY_MS;
      const start = Math.min(...perMed.map(p => p.build.start));
      const end = Math.max(...perMed.map(p => p.build.end));
      for (let i = 0; i < n; i++) {
        const t = start + (end - start) * i / (n - 1);
        const activeLanes = perMed.filter(p => {
          const build = p.build;
          const idx = Math.round((t - build.start) / (build.end - build.start) * (build.count - 1));
          const v = build.points[Math.max(0, Math.min(build.count - 1, idx))];
          return build.model.kind === 'window' ? v > 0 : v > 0.15;
        }).length;
        if (activeLanes >= 2) hits += 1;
        total += 1;
      }
      overlap = Math.round(hits / total * 100);
    }

    if (overlap !== null) {
      parts.push(`<div class="gn-peptide-overlap">${tx('peptide.stackOverlap', 'MODELED OVERLAP')} <b>${overlap}%</b> · ${tx('peptide.interactionsNotModeled', 'INTERACTIONS NOT MODELED')}</div>`);
    } else {
      parts.push(`<div class="gn-peptide-overlap dim">${tx('peptide.stackUnavailable', 'STACK OVERLAP UNAVAILABLE')} · ${tx('peptide.interactionsNotModeled', 'INTERACTIONS NOT MODELED')}</div>`);
    }

    container.innerHTML = parts.join('');

    perMed.forEach(({ medId, build, modelable, label }) => {
      const row = document.createElement('div');
      row.className = 'gn-peptide-lane';
      const head = document.createElement('div');
      head.className = 'gn-peptide-lane-head';
      head.innerHTML = `<b>${safe(label)}</b><span class="gn-evidence-chip" data-state="${build.evidence.state}">${evidenceLabel(build.evidence.state)}</span><span class="gn-peptide-lane-summary">${summaryLine(label, build)}</span>`;
      row.appendChild(head);
      const stack = document.createElement('div');
      stack.className = 'gn-chart-stack gn-peptide-lane-chart';
      const canvas = document.createElement('canvas');
      canvas.className = 'gn-peptide-lane-canvas';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'gn-chart-overlay');
      stack.appendChild(canvas); stack.appendChild(svg);
      row.appendChild(stack);
      container.appendChild(row);
      drawScene(canvas, build, { height: 72, showNow: false, stateText: false });
      drawOverlay(svg, build, { height: 72, trace: false, showNow: false });
    });
  }

  /* ── NEXT SHOT (user schedule only) ─────────────────────────────────── */
  function renderNext(container) {
    if (!container) return;
    let next = null;
    try {
      const profile = global.GNModules && global.GNModules.getProfile ? global.GNModules.getProfile() : null;
      const shots = (lastRender && lastRender.shots || []).filter(s => !s.archived);
      const last = shots.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (profile && last) {
        const date = new Date(last.date);
        const days = Number.isFinite(Number(profile.shotDay)) ? ((Number(profile.shotDay) - date.getDay() + 7) % 7 || 7) : 7;
        date.setDate(date.getDate() + days);
        next = date;
      }
    } catch (_) { /* profile unavailable — treat as unscheduled */ }
    container.innerHTML = next
      ? `<div class="gn-peptide-next"><span>${tx('peptide.yourSchedule', 'YOUR SCHEDULE')}</span><b>${next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</b><small>${tx('peptide.nextFromSchedule', 'from the shot-day you set in PROFILE')}</small></div>`
      : `<div class="gn-peptide-next dim"><span>${tx('peptide.nextNotScheduled', 'NEXT SHOT NOT SCHEDULED')}</span><small>${tx('peptide.setScheduleHint', 'set a shot day in PROFILE to plan ahead')}</small></div>`;
  }

  /* ── big chart interactivity ────────────────────────────────────────── */
  function wireBigChartInteractions(build) {
    const canvas = $('gnPeptideBigChart');
    const tip = $('gnPeptideTip');
    if (!canvas || !tip) return;
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const frac = Math.max(0, Math.min(1, x / rect.width));
      const t = build.start + (build.end - build.start) * frac;
      const idx = Math.round(frac * (build.count - 1));
      const level = build.points[idx];
      const last = build.markers.filter(m => !m.planned).at(-1);
      const elapsedH = last ? Math.max(0, (t - last.t) / HOUR_MS) : null;
      const phase = phaseFor(build.model, elapsedH) || null;
      const marker = build.markers.find(m => Math.abs((m.t - build.start) / (build.end - build.start) - frac) < 0.02);
      const lines = [];
      lines.push(`${formatClock(t)}`);
      if (marker) lines.push(`${tx('peptide.tipShot', 'SHOT')} · ${marker.dose} mg${marker.planned ? ' · ' + tx('peptide.tipPlanned', 'PLANNED') : ''}`);
      if (elapsedH !== null) lines.push(`${Math.floor(elapsedH / 24)}d ${Math.floor(elapsedH % 24)}h ${tx('peptide.tipSinceShot', 'since shot')}`);
      if (phase) lines.push(phaseLabel(phase));
      if (build.model.kind === 'curve') lines.push(`${tx('peptide.tipLevel', 'relative level')} ${Math.round(Math.max(0, Math.min(1.6, level)) / 1.6 * 100)}%`);
      tip.innerHTML = lines.map(l => `<div>${safe(l)}</div>`).join('');
      tip.style.left = `${Math.min(rect.width - 150, x + 12)}px`;
      tip.style.top = `${Math.max(8, y - 40)}px`;
      tip.style.display = 'block';
    };
    const onLeave = () => { tip.style.display = 'none'; };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
  }

  function formatClock(t) {
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function safe(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ── wiring ──────────────────────────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const overlay = $('gnPeptideOverlay');
      if (overlay && overlay.classList.contains('active')) closeOverlay();
    }
  });

  const api = Object.freeze({ render, openOverlay, closeOverlay, summaryLine, phaseFor });
  global.GN_PEPTIDE_VIZ = api;
})(typeof window !== 'undefined' ? window : globalThis);
