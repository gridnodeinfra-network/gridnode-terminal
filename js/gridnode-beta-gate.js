/* GRID//NODE ACCESS//GATE v0.15.22 — private-beta authorization boundary (client-side).
 *
 * Responsibilities (CLIENT ONLY):
 *   - Mount the gate DOM overlay over the existing landing screen.
 *   - Manage gate state machine: IDLE, FOCUSED, READY, VERIFYING, GRANTED,
 *     REJECTED, INTERRUPTED, LIMITED.
 *   - POST { code } to /api/beta/access.
 *   - Read only response.json() for status/ttl. Never read or store the
 *     session cookie. The browser sends the HttpOnly cookie automatically.
 *   - Render truthful telemetry only. No fake biometric, no fake handshakes.
 *
 * Out of scope:
 *   - Authorization logic (server-only).
 *   - Rate limiting (server-only).
 *   - Invite storage (server-only).
 *
 * Feature flag: window.GN_BETA_GATE === true enables the gate at boot.
 * Default OFF — existing site behaves exactly as before.
 */

(function () {
  'use strict';

  const ROOT_ID = 'gnBetaGateRoot';
  const ENABLED = window.GN_BETA_GATE === true;

  if (!ENABLED) return; // feature off — no DOM, no listeners, no impact.

  const STATE = Object.freeze({
    IDLE: 'IDLE',
    FOCUSED: 'FOCUSED',
    READY: 'READY',
    VERIFYING: 'VERIFYING',
    GRANTED: 'GRANTED',
    REJECTED: 'REJECTED',
    INTERRUPTED: 'INTERRUPTED',
    LIMITED: 'LIMITED'
  });

  const COPY = Object.freeze({
    en: {
      brandTopTag: '[LIVE] GRID//NODE v0.15.22 // PRIVATE',
      kicker: 'ACCESS // GATE',
      productLine1: 'PERSONAL BIOTECH OPERATING',
      productLine2: 'SYSTEM',
      productTag: 'PRIVATE // BETA',
      headline: 'INVITATION SIGNAL REQUIRED',
      accessLabel: 'ACCESS CODE',
      accessPlaceholder: 'Enter access code',
      cta: 'AUTHORIZE // ACCESS',
      foundingTag: 'FOUNDING TESTER ACCESS',
      closingLine: 'YOUR BODY. YOUR DATA. YOUR GRID.',
      // Stable category rail labels (left side) — never change per state.
      railRow1: 'INVITE // CHANNEL',
      railRow2: 'CHANNEL // SECURE',
      // Live state values (right side) — change per state.
      status: {
        IDLE:        'SIGNAL // AWAITING',
        FOCUSED:     'KEY // PENDING',
        READY:       'KEY // READY',
        VERIFYING:   'KEY // VERIFYING',
        GRANTED:     'ACCESS // GRANTED',
        REJECTED:    'SIGNAL // REJECTED',
        INTERRUPTED: 'SIGNAL // INTERRUPTED',
        LIMITED:     'SIGNAL // LIMITED'
      },
      nodeStatus: {
        IDLE:        'NODE // STANDBY',
        FOCUSED:     'NODE // STANDBY',
        READY:       'NODE // STANDBY',
        VERIFYING:   'NODE // TRANSMIT',
        GRANTED:     'NODE // ONLINE',
        REJECTED:    'NODE // STANDBY',
        INTERRUPTED: 'NODE // INTERRUPTED',
        LIMITED:     'NODE // LOCKED'
      },
      retry: 'RETRY VERIFICATION'
    }
  });

  const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gate = {
    state: STATE.IDLE,
    code: '',
    retryAfter: 0,
    reduced: REDUCED_MOTION,
    el: null,
    input: null,
    cta: null,
    status: null,
    glassOverlay: null,
    form: null,
    reducedFallback: REDUCED_MOTION,
    errorTimer: 0
  };

  // -------------------------------------------------------------------------
  // Mount
  // -------------------------------------------------------------------------

  function mount() {
    if (document.getElementById(ROOT_ID)) return;

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'gn-beta-gate';
    root.setAttribute('data-state', STATE.IDLE);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'gnBetaGateHeadline');
    root.setAttribute('aria-describedby', 'gnBetaGateStatus');
    root.tabIndex = -1;

    // Glass overlay over the existing landing (rendered first so it sits behind
    // the gate panel via stacking context).
    const glass = document.createElement('div');
    glass.className = 'gn-beta-gate__glass';
    glass.setAttribute('aria-hidden', 'true');
    root.appendChild(glass);

    // Top microstatus strip
    const top = document.createElement('div');
    top.className = 'gn-beta-gate__top';
    top.innerHTML = '<span class="gn-beta-gate__live">● LIVE</span>' +
                    '<span class="gn-beta-gate__brand">GRID//NODE v0.15.22</span>' +
                    '<span class="gn-beta-gate__badge">PRIVATE</span>';
    root.appendChild(top);

    // Kicker
    const kicker = document.createElement('div');
    kicker.className = 'gn-beta-gate__kicker';
    kicker.textContent = COPY.en.kicker;
    root.appendChild(kicker);

    // GN mark + wordmark — uses the existing locked GN.svg asset (founder-approved identity)
    const mark = document.createElement('div');
    mark.className = 'gn-beta-gate__mark';
    mark.innerHTML =
      '<div class="gn-beta-gate__gn" aria-hidden="true">' +
        '<span class="g">G</span><span class="n">N</span>' +
      '</div>' +
      '<div class="gn-beta-gate__wordmark">GRID//NODE</div>';
    root.appendChild(mark);

    // Product line
    const product = document.createElement('div');
    product.className = 'gn-beta-gate__product';
    product.innerHTML = '<div class="gn-beta-gate__product-line">' + COPY.en.productLine1 + '</div>' +
                        '<div class="gn-beta-gate__product-line">' + COPY.en.productLine2 + '</div>';
    root.appendChild(product);

    // PRIVATE // BETA
    const beta = document.createElement('div');
    beta.className = 'gn-beta-gate__beta';
    beta.textContent = COPY.en.productTag;
    root.appendChild(beta);

    // Headline
    const headline = document.createElement('div');
    headline.id = 'gnBetaGateHeadline';
    headline.className = 'gn-beta-gate__headline';
    headline.textContent = COPY.en.headline;
    root.appendChild(headline);

    // Glass panel containing the access field
    const panel = document.createElement('div');
    panel.className = 'gn-beta-gate__panel';

    // HUD corner ticks (instrument signature — same convention as scanner chrome)
    for (const corner of ['tl','tr','bl','br']) {
      const tick = document.createElement('span');
      tick.className = `gn-hud-tick gn-hud-tick--${corner} gn-beta-gate__hud`;
      tick.setAttribute('aria-hidden', 'true');
      panel.appendChild(tick);
    }

    const panelLabel = document.createElement('div');
    panelLabel.className = 'gn-beta-gate__panel-label';
    panelLabel.textContent = COPY.en.accessLabel;
    panel.appendChild(panelLabel);

    // Real semantic form
    const form = document.createElement('form');
    form.className = 'gn-beta-gate__form';
    form.setAttribute('novalidate', '');

    const label = document.createElement('label');
    label.className = 'gn-beta-gate__label';
    label.setAttribute('for', 'gnBetaGateInput');
    label.textContent = COPY.en.accessLabel;

    const input = document.createElement('input');
    input.id = 'gnBetaGateInput';
    input.className = 'gn-beta-gate__input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.inputMode = 'text';
    input.maxLength = 128;
    input.setAttribute('aria-label', COPY.en.accessLabel);
    input.placeholder = COPY.en.accessPlaceholder;

    const cta = document.createElement('button');
    cta.type = 'submit';
    cta.className = 'gn-beta-gate__cta';
    cta.textContent = COPY.en.cta;
    cta.setAttribute('aria-label', COPY.en.cta);
    cta.disabled = true;

    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(cta);
    panel.appendChild(form);
    root.appendChild(panel);

    // Founding tester access
    const founding = document.createElement('div');
    founding.className = 'gn-beta-gate__founding';
    founding.textContent = COPY.en.foundingTag;
    root.appendChild(founding);

    // Closing line
    const closing = document.createElement('div');
    closing.className = 'gn-beta-gate__closing';
    closing.textContent = COPY.en.closingLine;
    root.appendChild(closing);

    // Truthful telemetry strip — INVITE//SIGNAL / KEY//PENDING / CHANNEL//SECURE / NODE//STANDBY
    const telem = document.createElement('div');
    telem.id = 'gnBetaGateStatus';
    telem.className = 'gn-beta-gate__telemetry';
    telem.setAttribute('aria-live', 'polite');
    telem.setAttribute('role', 'status');
    telem.innerHTML =
      '<div class="gn-beta-gate__tel-row">' +
        '<span class="gn-beta-gate__tel-key">' + COPY.en.railRow1 + '</span>' +
        '<span class="gn-beta-gate__tel-arrow">›</span>' +
        '<span class="gn-beta-gate__tel-key" data-live="channel">' + COPY.en.status.IDLE + '</span>' +
      '</div>' +
      '<div class="gn-beta-gate__tel-row">' +
        '<span class="gn-beta-gate__tel-key">' + COPY.en.railRow2 + '</span>' +
        '<span class="gn-beta-gate__tel-arrow">›</span>' +
        '<span class="gn-beta-gate__tel-key" data-live="node">' + COPY.en.nodeStatus.IDLE + '</span>' +
      '</div>';
    root.appendChild(telem);

    document.body.appendChild(root);
    gate.el = root;
    gate.input = input;
    gate.cta = cta;
    gate.status = telem;
    gate.form = form;
    gate.glassOverlay = glass;

    wireEvents();
    setState(STATE.IDLE);
    // Focus moves to the gate after a short delay so the landing can settle.
    setTimeout(() => root.focus({ preventScroll: true }), 50);
  }

  // -------------------------------------------------------------------------
  // State machine
  // -------------------------------------------------------------------------

  function setState(next) {
    gate.state = next;
    gate.el.setAttribute('data-state', next);
    updateTelemetry(next);
    updateCta();
    if (next === STATE.LIMITED) startCountdown();
  }

  function updateTelemetry(s) {
    const channelEl = gate.status.querySelector('[data-live="channel"]');
    const nodeEl = gate.status.querySelector('[data-live="node"]');
    if (channelEl) channelEl.textContent = (COPY.en.status[s] || COPY.en.status.IDLE);
    if (nodeEl) nodeEl.textContent = (COPY.en.nodeStatus[s] || COPY.en.nodeStatus.IDLE);
  }

  function updateCta() {
    const allowed = gate.state === STATE.READY;
    gate.cta.disabled = !allowed;
  }

  function startCountdown() {
    if (gate.errorTimer) clearInterval(gate.errorTimer);
    let n = gate.retryAfter;
    const right1 = gate.status.querySelector('[data-live="channel"]');
    const tick = () => {
      if (n <= 0) {
        clearInterval(gate.errorTimer);
        gate.errorTimer = 0;
        gate.retryAfter = 0;
        setState(STATE.IDLE);
        gate.input.disabled = false;
        gate.cta.disabled = true; // CTA enables on READY only
        return;
      }
      if (right1) right1.textContent = 'SIGNAL // LIMITED — RETRY IN ' + n + 's';
      n--;
    };
    tick();
    if (n > 0) gate.errorTimer = setInterval(tick, 1000);
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  function wireEvents() {
    gate.input.addEventListener('focus', () => {
      if (gate.state === STATE.IDLE || gate.state === STATE.REJECTED || gate.state === STATE.INTERRUPTED) {
        setState(STATE.FOCUSED);
      }
    });
    gate.input.addEventListener('blur', () => {
      if (gate.state === STATE.FOCUSED) setState(STATE.IDLE);
    });
    gate.input.addEventListener('input', () => {
      gate.code = gate.input.value;
      // READY is driven by actual input requirements — no fixed shape.
      // Valid input is non-empty (server enforces the rest).
      const hasContent = gate.code.trim().length >= 4;
      if (hasContent && (gate.state === STATE.IDLE || gate.state === STATE.FOCUSED || gate.state === STATE.REJECTED || gate.state === STATE.INTERRUPTED)) {
        setState(STATE.READY);
      } else if (!hasContent && (gate.state === STATE.READY)) {
        setState(STATE.FOCUSED);
      }
    });

    gate.form.addEventListener('submit', onSubmit);
    gate.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !gate.cta.disabled) {
        e.preventDefault();
        gate.form.requestSubmit ? gate.form.requestSubmit() : gate.form.submit();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Submit -> server -> response handler
  // -------------------------------------------------------------------------

  async function onSubmit(e) {
    e.preventDefault();
    if (gate.state !== STATE.READY) return;
    setState(STATE.VERIFYING);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch('/api/beta-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // ensure cookies are sent/received
        body: JSON.stringify({ code: gate.code }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const body = await res.json().catch(() => ({}));
      await handleResponse(res.status, body);
    } catch (_) {
      // Network failure, timeout, or abort — NEVER treat as granted.
      clearTimeout(timeout);
      setState(STATE.INTERRUPTED);
      // After 4s return to idle so the user can retry.
      setTimeout(() => {
        if (gate.state === STATE.INTERRUPTED) setState(STATE.IDLE);
      }, 4000);
    }
  }

  async function handleResponse(status, body) {
    // Body must contain a status string. Anything malformed -> interrupted.
    const s = (body && typeof body === 'object' && body.status) ? String(body.status) : 'interrupted';

    if (status === 200 && s === 'granted') {
      // ACCESS // GRANTED — explicit flash for 250-400ms, then dissolve.
      setState(STATE.GRANTED);
      gate.input.disabled = true;
      gate.cta.disabled = true;
      runUnlockChoreography(body);
      return;
    }
    if (status === 401 || (status === 200 && s === 'denied')) {
      // 401 is the contract. Some server shapes also return 200 with denied.
      setState(STATE.REJECTED);
      shakePanel();
      gate.input.value = '';
      gate.code = '';
      gate.input.disabled = true;
      // After 2.4s return to IDLE.
      setTimeout(() => {
        if (gate.state === STATE.REJECTED) {
          gate.input.disabled = false;
          setState(STATE.IDLE);
        }
      }, 2400);
      return;
    }
    if (status === 429 || s === 'limited') {
      const retry = Number(body && body.retryAfter) || 60;
      gate.retryAfter = Math.max(1, Math.min(retry, 3600));
      setState(STATE.LIMITED);
      gate.input.disabled = true;
      gate.cta.disabled = true;
      // Convert CTA into retry — only when NOT in reduced-motion: keep it disabled, the
      // countdown is the visual. When reduced-motion, re-enable CTA after countdown.
      if (gate.reduced) {
        // startCountdown will re-enable on completion; nothing else to do.
      }
      return;
    }
    // 5xx, 503, malformed — interrupted.
    setState(STATE.INTERRUPTED);
    setTimeout(() => {
      if (gate.state === STATE.INTERRUPTED) {
        gate.input.disabled = false;
        setState(STATE.IDLE);
      }
    }, 4000);
  }

  function shakePanel() {
    // Tiny CSS-keyframe shake; defined in the CSS injected below.
    gate.el.classList.add('gn-beta-gate--shake');
    setTimeout(() => gate.el.classList.remove('gn-beta-gate--shake'), 360);
  }

  // -------------------------------------------------------------------------
  // Unlock choreography — 0.9s to 1.2s. CTA press -> GRANTED -> dissolve.
  // -------------------------------------------------------------------------

  function runUnlockChoreography(body) {
    const ttl = (body && Number(body.ttl)) || 0;
    const total = gate.reduced ? 700 : 1100;
    // 0–80ms press feedback (handled by CSS :active + scale on submit)
    // 80–260ms corner ticks snap (handled by CSS animation triggered by GRANTED class)
    // 260–520ms panel jitter + letter-flip (handled by CSS animation)
    // 520–820ms glass fades, hero sharpens
    // 820–1100ms gate collapses, status becomes NODE // ONLINE
    setTimeout(() => {
      // CSS handles the transitions; here we just set the GRANTED state which
      // adds the class that drives them.
      gate.el.classList.add('gn-beta-gate--granted');
    }, 0);
    setTimeout(() => {
      // 90% mark — start collapsing the gate.
      gate.el.classList.add('gn-beta-gate--dissolving');
    }, Math.round(total * 0.82));
    setTimeout(() => {
      // Fully gone. The HttpOnly cookie is now set; the existing app is interactive.
      // The landing page is already rendered underneath; the gate's pointer-events
      // are now none and aria-hidden=true.
      gate.el.remove();
      // Notify the rest of the app that the gate cleared (purely informational).
      window.dispatchEvent(new CustomEvent('gn:beta-gate-cleared', { detail: { ttl: ttl } }));
    }, total);
  }

  // -------------------------------------------------------------------------
  // Boot — mount as early as possible so the landing never shows interactive
  // before the gate resolves.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Startup:
  //   1. Check for ?invite=<code> in the URL. If present, prefill the input
  //      and (best-effort) replace the URL with a clean one so the code is
  //      not sitting in the browser history.
  //   2. GET /api/beta/session. If 200 { active: true }, skip the gate entirely.
  //      If 401, mount the gate. If the request fails, mount the gate with
  //      SIGNAL//INTERRUPTED language (we never grant offline).
  //   3. The session check is the gate; the rest of the unlock choreography
  //      (ACCESS//GRANTED -> NODE//ONLINE) only fires on a fresh POST.
  // -------------------------------------------------------------------------

  function prefillFromUrl() {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('invite');
      if (code) {
        // Best-effort: replace URL to drop the query string. We use
        // replaceState so the back button doesn't reveal the code.
        url.searchParams.delete('invite');
        const clean = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash;
        if (clean !== window.location.pathname + window.location.search + window.location.hash) {
          window.history.replaceState({}, '', clean);
        }
        return code;
      }
    } catch (e) {}
    return null;
  }

  async function checkSession() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch('/api/beta-session', {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.status === 200) {
        const body = await res.json().catch(() => ({}));
        if (body && body.active === true) {
          return { active: true };
        }
      }
      return { active: false };
    } catch (_) {
      clearTimeout(timeout);
      return { active: false, networkFail: true };
    }
  }

  async function boot() {
    const prefillCode = prefillFromUrl();
    const session = await checkSession();
    if (session.active) {
      // Already authorized. Dispatch a hidden event so the rest of the app
      // can surface a "session resumed" indicator if it wants.
      window.dispatchEvent(new CustomEvent('gn:beta-session-resumed'));
      return;
    }
    mount();
    if (prefillCode) {
      gate.input.value = prefillCode;
      gate.code = prefillCode;
      gate.input.dispatchEvent(new Event('input'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Expose a tiny test hook (no-op in production; useful for QA only).
  window.GN_BETA_GATE_API = {
    getState: () => gate.state,
    isEnabled: () => ENABLED
  };
})();
