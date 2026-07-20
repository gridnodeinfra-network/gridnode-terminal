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
  const text = (id, value) => { const node = $(id); if (node) node.textContent = value; };

  function activeShots() {
    const records = window.GN?.S?.get?.('shots', []);
    return (Array.isArray(records) ? records : [])
      .filter(record => !record?.archived && Number.isFinite(new Date(record?.date).getTime()))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  function render() {
    const panel = $('phaseSpherePanel');
    if (!panel || !window.GN?.S) return false;
    const shots = activeShots();
    const last = shots.at(-1);
    const core = $('phaseSphereCore');
    const coreLabel = $('phaseSphereCoreLabel');
    const orb = $('phaseSphereOrb');
    const marker = $('phaseSphereMarker');
    if (!last) {
      panel.dataset.state = 'empty';
      text('phaseSpherePhase', 'AWAITING FIRST SHOT');
      text('phaseSphereProgress', '0% · NO ACTIVE CYCLE');
      text('phaseSphereSince', 'Log a SHOT to initialize the sphere.');
      text('phaseSphereCount', '0 ACTIVE RECORDS');
      if (core) core.textContent = '01';
      if (coreLabel) coreLabel.textContent = 'CYCLE';
      if (orb) {
        orb.style.setProperty('--sphere-color', '#00e6f0');
        orb.style.setProperty('--sphere-progress', '0deg');
      }
      if (marker) marker.style.setProperty('--sphere-angle', '0deg');
      return true;
    }

    const elapsed = Math.max(0, (Date.now() - new Date(last.date).getTime()) / 86400000);
    const progress = Math.min((elapsed % 7) / 7, 0.999);
    const phase = phases.find(item => progress >= item.start && progress < item.end) || phases.at(-1);
    const since = elapsed < 1
      ? `${Math.max(1, Math.round(elapsed * 24))}h since last SHOT`
      : `${Math.floor(elapsed)}d since last SHOT`;
    panel.dataset.state = 'active';
    text('phaseSpherePhase', phase.name);
    text('phaseSphereProgress', `${Math.round(progress * 100)}% · 7-DAY REFERENCE CYCLE`);
    text('phaseSphereSince', since);
    text('phaseSphereCount', `${shots.length} ACTIVE RECORD${shots.length === 1 ? '' : 'S'}`);
    if (core) core.textContent = String(Math.round(progress * 100)).padStart(2, '0');
    if (coreLabel) coreLabel.textContent = phase.name;
    if (orb) {
      orb.style.setProperty('--sphere-color', phase.color);
      orb.style.setProperty('--sphere-progress', `${Math.round(progress * 360)}deg`);
    }
    if (marker) marker.style.setProperty('--sphere-angle', `${Math.round(progress * 360)}deg`);
    return true;
  }

  function start() {
    if (render()) {
      window.setInterval(render, 60000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
      return;
    }
    window.setTimeout(start, 150);
  }

  document.addEventListener('DOMContentLoaded', start, { once: true });
}());
