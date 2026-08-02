/* GRID//NODE // MOTIVATION LAYER
 * Progress arc, streak flame, operator level, achievement badges,
 * and milestone celebrations. Reads the active workspace; never writes records.
 */
(() => {
  'use strict';

  const dayMs = 86400000;
  const $ = id => document.getElementById(id);
  const tx = (key, fallback, vars) => window.GN_I18N?.text?.(key, fallback, vars) || fallback;
  const records = key => { const value = window.GN?.S?.get?.(key, []); return Array.isArray(value) ? value : []; };
  const profile = () => window.GN?.S?.get?.('profile', {}) || {};
  const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  // Change-guarded DOM writes: poll loops must not churn identical markup.
  const setHtml = (node, html) => { if (node && node.innerHTML !== html) node.innerHTML = html; };
  const setNodeText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
  const seen = (() => { try { return JSON.parse(localStorage.getItem('gn_motiv_seen') || '{}'); } catch (_) { return {}; } })();
  const markSeen = id => { seen[id] = true; try { localStorage.setItem('gn_motiv_seen', JSON.stringify(seen)); } catch (_) { /* storage unavailable */ } };
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;

  function validShots() {
    return records('shots').filter(item => !item?.archived && item?.date).sort((a, b) => new Date(a.date) - new Date(b.date));
  }
  function validWeights() {
    return records('weights').filter(item => item?.date && Number.isFinite(Number(item?.weight)) && Number(item.weight) > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
  }
  function weekKey(date) {
    const value = new Date(date);
    if (!Number.isFinite(value.getTime())) return null;
    const day = (value.getUTCDay() + 6) % 7;
    value.setUTCDate(value.getUTCDate() - day);
    value.setUTCHours(0, 0, 0, 0);
    return value.getTime();
  }
  function streakWeeks(shots) {
    const weeks = [...new Set(shots.map(item => weekKey(item.date)).filter(Boolean))].sort((a, b) => a - b);
    if (!weeks.length) return 0;
    let streak = 1;
    for (let index = weeks.length - 1; index > 0; index -= 1) {
      if (weeks[index] - weeks[index - 1] <= 8 * dayMs) streak += 1;
      else break;
    }
    return streak;
  }
  function goalProgress() {
    const pref = profile();
    const weights = validWeights();
    const startRaw = Number(pref.startWt) || Number(weights[0]?.weight) || 0;
    const currentRaw = Number(weights.at(-1)?.weight) || 0;
    const goalRaw = Number(pref.goalWt) || 0;
    if (![startRaw, currentRaw, goalRaw].every(value => Number.isFinite(value) && value > 0) || startRaw === goalRaw) return null;
    const raw = (startRaw - currentRaw) / (startRaw - goalRaw) * 100;
    return { startRaw, currentRaw, goalRaw, percent: Math.max(0, Math.min(100, raw)) };
  }
  function levelFrom(shots, weeks) {
    const xp = shots.length * 10 + weeks * 5;
    const thresholds = [0, 100, 250, 500];
    let level = 0;
    for (let index = 0; index < thresholds.length; index += 1) if (xp >= thresholds[index]) level = index;
    return { xp, level, next: thresholds[level + 1] ?? null, current: thresholds[level], progress: thresholds[level + 1] ? Math.max(0, Math.min(1, (xp - thresholds[level]) / (thresholds[level + 1] - thresholds[level]))) : 1 };
  }

  const BADGES = [
    ['streak7', 'badges.streak7', 'S7'],
    ['streak30', 'badges.streak30', 'S30'],
    ['shots10', 'badges.shots10', '10'],
    ['shots50', 'badges.shots50', '50'],
    ['shots100', 'badges.shots100', '100'],
    ['goal10', 'badges.goal10', 'G10'],
    ['goal25', 'badges.goal25', 'G25'],
    ['goal50', 'badges.goal50', 'G50'],
  ];
  function unlockedBadges(shots, weeks, progress) {
    const set = new Set();
    if (weeks >= 1) set.add('streak7');
    if (weeks >= 4) set.add('streak30');
    if (shots.length >= 10) set.add('shots10');
    if (shots.length >= 50) set.add('shots50');
    if (shots.length >= 100) set.add('shots100');
    if (progress && progress.percent >= 10) set.add('goal10');
    if (progress && progress.percent >= 25) set.add('goal25');
    if (progress && progress.percent >= 50) set.add('goal50');
    return set;
  }

  function toast(message, tone) {
    let node = $('gnMotivToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'gnMotivToast';
      node.className = 'gn-motiv-toast';
      document.body.appendChild(node);
    }
    node.innerHTML = `<span class="gn-motiv-toast-glyph" aria-hidden="true">◆</span><span class="gn-motiv-toast-msg">${safe(message)}</span>`;
    node.className = `gn-motiv-toast active${tone === 'level' ? ' level' : ''}`;
    if (navigator.vibrate && !reducedMotion()) { try { navigator.vibrate(tone === 'level' ? [40, 60, 40] : 60); } catch (_) {} }
    clearTimeout(node._timer);
    node._timer = setTimeout(() => node.classList.remove('active'), 3600);
  }

  function celebrate(shots, weeks, progress, level) {
    const app = document.getElementById('app');
    if (!app || getComputedStyle(app).display === 'none') return;
    const shotTiers = [10, 50, 100];
    shotTiers.forEach(tier => {
      const id = `shots${tier}`;
      if (shots.length >= tier && !seen[id]) { markSeen(id); toast(tx('milestone.shots', 'PROTOCOL MILESTONE — {count} SHOTS LOGGED', { count: tier })); }
    });
    const weekTiers = [4, 13, 26];
    weekTiers.forEach(tier => {
      const id = `streak${tier}`;
      if (weeks >= tier && !seen[id]) { markSeen(id); toast(tx('milestone.streak', 'STREAK MILESTONE — {weeks} WEEKS', { weeks: tier })); }
    });
    const goalTiers = [10, 25, 50];
    if (progress) goalTiers.forEach(tier => {
      const id = `goal${tier}`;
      if (progress.percent >= tier && !seen[id]) { markSeen(id); toast(tx('milestone.goal', 'GOAL MILESTONE — {percent}% OF GOAL REACHED', { percent: tier })); }
    });
    const levelId = `level${level.level}`;
    const previous = Number(localStorage.getItem('gn_motiv_level') || -1);
    if (level.level > previous && level.level > 0 && !seen[levelId]) {
      markSeen(levelId);
      toast(tx('milestone.level', 'LEVEL UP — {level}', { level: tx(`level.name${level.level}`, ['OPERATOR', 'ANALYST', 'ARCHITECT', 'OVERSEER'][level.level]) }), 'level');
    }
    if (level.level > previous) { try { localStorage.setItem('gn_motiv_level', String(level.level)); } catch (_) {} }
  }

  function arcMarkup(progress) {
    if (!progress) return `<div class="gn-arc-empty">${safe(tx('telemetry.emptyTarget', 'SET A START AND TARGET WEIGHT TO ACTIVATE'))}</div>`;
    const radius = 46, circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - progress.percent / 100);
    return `<div class="gn-arc-wrap" role="img" aria-label="${safe(tx('progress.arcTitle', 'GOAL VECTOR'))} ${progress.percent.toFixed(0)}%">
      <svg class="gn-arc" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="gn-arc-track" cx="60" cy="60" r="${radius}"></circle>
        <circle class="gn-arc-fill" cx="60" cy="60" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
        <circle class="gn-arc-goal-tick" cx="60" cy="60" r="${radius}" stroke-dasharray="2 ${circumference - 2}" stroke-dashoffset="${circumference * .25}"></circle>
      </svg>
      <div class="gn-arc-center"><b>${progress.percent.toFixed(0)}%</b><span>${safe(tx('progress.toGoal', 'TO GOAL'))}</span></div>
    </div>`;
  }
  function arcReadouts(progress) {
    if (!progress) return '';
    const remaining = Math.max(0, progress.currentRaw - progress.goalRaw);
    const lost = Math.max(0, progress.startRaw - progress.currentRaw);
    return `<div class="gn-arc-readouts">
      <span><small>${safe(tx('progress.lost', 'LOST'))}</small><b>${lost.toFixed(1)}</b></span>
      <span><small>${safe(tx('progress.remaining', 'REMAINING'))}</small><b>${remaining.toFixed(1)}</b></span>
      <span><small>${safe(tx('progress.target', 'TARGET'))}</small><b>${progress.goalRaw.toFixed(1)}</b></span>
    </div>`;
  }

  function levelMarkup(level) {
    const name = tx(`level.name${level.level}`, ['OPERATOR', 'ANALYST', 'ARCHITECT', 'OVERSEER'][level.level]);
    const pct = Math.round(level.progress * 100);
    return `<div class="gn-level-card" role="group" aria-label="${safe(tx('level.title', 'OPERATOR LEVEL'))}">
      <div class="gn-level-head"><span class="gn-level-kicker" data-i18n="level.title">OPERATOR LEVEL</span><b>${safe(name)}</b></div>
      <div class="gn-level-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${safe(name)} XP"><i style="width:${pct}%"></i></div>
      <div class="gn-level-xp">${level.xp} ${safe(tx('level.xp', 'XP'))}${level.next ? ` · ${level.next - level.xp} ${safe(tx('level.xp', 'XP'))} →` : ' · MAX'}</div>
    </div>`;
  }

  function streakFlame(weeks) {
    const tier = weeks >= 26 ? 3 : weeks >= 13 ? 2 : weeks >= 4 ? 1 : 0;
    return `<span class="gn-flame gn-flame-${tier}" aria-label="${safe(tx('streak.flameAria', 'Streak flame'))}" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M12 2c1.8 3.2 4.4 5.2 4.4 9a4.4 4.4 0 0 1-8.8 0C7.6 7.2 10.2 5.2 12 2z"></path><path class="gn-flame-core" d="M12 10c.9 1.7 2.2 2.7 2.2 4.5a2.2 2.2 0 0 1-4.4 0c0-1.8 1.3-2.8 2.2-4.5z"></path></svg>
    </span>`;
  }

  function ensureStrip() {
    const page = $('pageDash');
    if (!page || $('gnMotivationStrip')) return;
    const anchor = page.querySelector('.gn-wanda-actions');
    if (!anchor) return;
    const strip = document.createElement('section');
    strip.id = 'gnMotivationStrip';
    strip.className = 'gn-motivation-strip';
    strip.innerHTML = `<div class="gn-arc-card"><div class="gn-foundation-kicker" data-i18n="progress.arcTitle">GOAL VECTOR</div><div data-gn-arc></div><div data-gn-arc-readouts></div></div><div data-gn-level></div>`;
    anchor.insertAdjacentElement('afterend', strip);
  }
  function ensureBadges() {
    const page = $('pageProfile');
    if (!page || $('gnBadgesCard')) return;
    const anchor = page.querySelector('[data-gn-profile-hub]');
    if (!anchor) return;
    const card = document.createElement('section');
    card.id = 'gnBadgesCard';
    card.className = 'gn-badges-card';
    card.innerHTML = `<div class="gn-foundation-head"><div><div class="gn-foundation-kicker" data-i18n="badges.kicker">// COLLECTION</div><h3 data-i18n="badges.title">ACHIEVEMENT BADGES</h3></div></div><div class="gn-badges-grid" data-gn-badges></div>`;
    anchor.insertAdjacentElement('afterend', card);
  }
  function ensureStreakFlame() {
    const card = $('gnStreakCard');
    if (!card || card.querySelector('.gn-flame')) return;
    card.insertAdjacentHTML('afterbegin', '<span class="gn-streak-flame-holder" data-gn-flame></span>');
  }

  function badgesMarkup(shots, weeks, progress) {
    const unlocked = unlockedBadges(shots, weeks, progress);
    return BADGES.map(([id, key, glyph]) => {
      const open = unlocked.has(id);
      return `<div class="gn-badge${open ? ' unlocked' : ''}" role="img" aria-label="${safe(tx(key, id))} — ${safe(tx(open ? 'badges.unlocked' : 'badges.locked', open ? 'UNLOCKED' : 'LOCKED'))}">
        <span class="gn-badge-ring"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><text x="12" y="15" text-anchor="middle">${safe(glyph)}</text></svg></span>
        <b>${safe(tx(key, id))}</b>
      </div>`;
    }).join('');
  }

  function render() {
    const shots = validShots();
    const weeks = streakWeeks(shots);
    const progress = goalProgress();
    const level = levelFrom(shots, weeks);
    celebrate(shots, weeks, progress, level);

    ensureStrip();
    const arcHost = document.querySelector('#gnMotivationStrip [data-gn-arc]');
    if (arcHost) {
      const next = arcMarkup(progress);
      if (arcHost.innerHTML !== next) { arcHost.innerHTML = next; if (!reducedMotion()) requestAnimationFrame(() => arcHost.classList.add('gn-arc-live')); }
      const readouts = document.querySelector('#gnMotivationStrip [data-gn-arc-readouts]');
      if (readouts) setHtml(readouts, arcReadouts(progress));
      const levelHost = document.querySelector('#gnMotivationStrip [data-gn-level]');
      if (levelHost) setHtml(levelHost, levelMarkup(level));
    }

    ensureStreakFlame();
    const flameHost = document.querySelector('#gnStreakCard [data-gn-flame]');
    if (flameHost) setHtml(flameHost, streakFlame(weeks));

    ensureBadges();
    const badgesHost = document.querySelector('#gnBadgesCard [data-gn-badges]');
    if (badgesHost) setHtml(badgesHost, badgesMarkup(shots, weeks, progress));

    if (window.GN_I18N?.applyTo && lastAppliedLang !== (document.documentElement?.lang || 'en')) {
      lastAppliedLang = document.documentElement?.lang || 'en';
      window.GN_I18N.applyTo(document.getElementById('pageDash'));
      window.GN_I18N.applyTo(document.getElementById('pageProfile'));
    }
  }

  let timer = null;
  let lastAppliedLang = '';
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 80); }
  async function boot() {
    if (!window.GN?.S) { setTimeout(boot, 100); return; }
    await window.GN_I18N?.ready;
    render();
    document.addEventListener('storage', event => {
      if (event.key?.includes('_shots') || event.key?.includes('_weights') || event.key?.includes('_profile')) schedule();
    });
    document.addEventListener('gn:langchange', schedule);
    document.addEventListener('gn:themechange', schedule);
    window.setInterval(render, 1500);
    new MutationObserver(() => {
      if (document.querySelector('#pageDash .gn-wanda-actions') || document.querySelector('#pageProfile [data-gn-profile-hub]')) schedule();
    }).observe(document.body, { childList: true, subtree: true });
  }
  document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
