/* GRID//NODE Phase Sphere
 * A small, local-first visualization layer. It reads the same active SHOTS
 * records as the live Phase Engine and never writes or syncs data itself.
 */
(function phaseSphereModule() {
  'use strict';

  const phases = [
    { name: 'ACTIVATION', start: 0, end: 1 / 7, color: '#ffd700' },
    { name: 'TAKING EFFECT', start: 1 / 7, end: 2 / 7, color: '#ffb000' },
    { name: 'PEAK EFFECT', start: 2 / 7, end: 3 / 7, color: '#ff8200' },
    { name: 'CRUISE', start: 3 / 7, end: 5 / 7, color: '#00e6f0' },
    { name: 'WINDING DOWN', start: 5 / 7, end: 6 / 7, color: '#5bd6c5' },
    { name: 'WEAR-OFF', start: 6 / 7, end: 1, color: '#ff5577' },
  ];

  const $ = id => document.getElementById(id);
  const text = (id, value) => { const node = $(id); if (node && node.textContent !== value) node.textContent = value; };
  const tx = (key, fallback, vars) => window.GN_I18N?.text?.(key, fallback, vars) || fallback;
  const phaseKeys = Object.freeze({
    ACTIVATION: 'phase.sphereActivation',
    'TAKING EFFECT': 'phase.sphereTakingEffect',
    'PEAK EFFECT': 'phase.spherePeakEffect',
    CRUISE: 'phase.sphereCruise',
    'WINDING DOWN': 'phase.sphereWindingDown',
    'WEAR-OFF': 'phase.sphereWearOff'
  });
  const phaseLabel = phase => tx(phaseKeys[phase?.name], phase?.name || '');
  const protocolLabel = protocol => protocol
    ? tx('phase.sphereProtocol', 'PROTOCOL · {protocol}', { protocol })
    : tx('phase.protocolNotSet', 'PROTOCOL · NOT SET');

  function ensureTicks() {
    const ticks = $('phaseSphereTicks');
    if (!ticks || ticks.childElementCount) return;
    for (let index = 0; index < 12; index += 1) {
      const tick = document.createElement('i');
      tick.className = 'phase-sphere-tick';
      tick.style.transform = `translateX(-50%) rotate(${index * 30}deg)`;
      ticks.appendChild(tick);
    }
  }

  function activeShots() {
    const now = Date.now();
    const records = window.GN?.S?.get?.('shots', []);
    return (Array.isArray(records) ? records : [])
      .filter(record => {
        const timestamp = new Date(record?.date).getTime();
        return !record?.archived && Number.isFinite(timestamp) && timestamp <= now;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  async function render() {
    if (window.GN_I18N?.ready) await window.GN_I18N.ready;
    const panel = $('phaseSpherePanel');
    if (!panel || !window.GN?.S) return false;
    const shots = activeShots();
    const last = shots.at(-1);
    const core = $('phaseSphereCore');
    const coreLabel = $('phaseSphereCoreLabel');
    const orb = $('phaseSphereOrb');
    const marker = $('phaseSphereMarker');
    ensureTicks();
    const profile = window.GN.S.get('profile', {}) || {};
    const protocol = profile.med ? profile.med + (profile.dose ? ' · ' + profile.dose + 'mg' : '') : '';
    text('phaseSphereProtocol', protocolLabel(protocol));
    if (!last) {
      panel.dataset.state = 'empty';
      text('phaseSpherePhase', tx('runtime.awaitingFirstShot', 'AWAITING FIRST SHOT'));
      text('phaseSphereProgress', tx('phase.noActiveCycle', '0% · NO ACTIVE CYCLE'));
      text('phaseSphereSince', tx('phase.initializeSphere', 'Log a SHOT to initialize the sphere.'));
      text('phaseSphereCount', tx('phase.zeroActiveRecords', '0 ACTIVE RECORDS'));
      if (core) core.textContent = '01';
      if (coreLabel) coreLabel.textContent = tx('phase.cycleLabel', 'CYCLE');
      if (orb) {
        orb.style.setProperty('--sphere-color', '#00e6f0');
        orb.style.setProperty('--sphere-progress', '0deg');
      }
      if (marker) marker.style.setProperty('--sphere-angle', '0deg');
      text('phaseSphereProtocol', protocolLabel(protocol));
      return true;
    }

    const elapsed = Math.max(0, (Date.now() - new Date(last.date).getTime()) / 86400000);
    const progress = Math.min(elapsed / 7, 0.999);
    const phase = phases.find(item => progress >= item.start && progress < item.end) || phases.at(-1);
    const since = elapsed < 1
      ? tx('phase.sphereSinceHours', '{hours}h since last SHOT', { hours: Math.max(1, Math.round(elapsed * 24)) })
      : tx('phase.sphereSinceDays', '{days}d since last SHOT', { days: Math.floor(elapsed) });
    panel.dataset.state = 'active';
    const localizedName = phaseLabel(phase);
    text('phaseSpherePhase', localizedName);
    text('phaseSphereProgress', tx('phase.sphereProgress', '{pct}% · 7-DAY REFERENCE CYCLE', { pct: Math.round(progress * 100) }));
    text('phaseSphereSince', since);
    text('phaseSphereCount', tx(shots.length === 1 ? 'phase.sphereActiveRecords_one' : 'phase.sphereActiveRecords_other', '{count} ACTIVE RECORDS', { count: shots.length }));
    if (core) core.textContent = String(Math.round(progress * 100)).padStart(2, '0');
    if (coreLabel) coreLabel.textContent = localizedName;
    if (orb) {
      orb.style.setProperty('--sphere-color', phase.color);
      orb.style.setProperty('--sphere-progress', `${Math.round(progress * 360)}deg`);
    }
    if (marker) marker.style.setProperty('--sphere-angle', `${Math.round(progress * 360)}deg`);
    return true;
  }

  async function start() {
    if (await render()) {
      // The sphere is read-only, so a lightweight poll keeps it responsive
      // after SHOT saves without changing the existing storage contract.
      window.setInterval(render, 1000);
      document.addEventListener('gn:langchange', () => { render(); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
      return;
    }
    window.setTimeout(start, 150);
  }

  document.addEventListener('DOMContentLoaded', start, { once: true });
}());
