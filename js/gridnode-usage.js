/* GRID//NODE // USAGE EVENTS
 *
 * First-party, privacy-clean visit tracking. Fire-and-forget by design:
 * every failure path is silent, so this module can never break the app.
 * No cookies, no IPs, no fingerprinting. session_id is a random UUID kept
 * in sessionStorage; user_id links only when the visitor is signed in.
 *
 * Automatic events: session_start (once per tab session), page_view.
 * Funnel events: any element with data-usage="event_name" sends that event
 * on click (delegated, passive). Manual: window.GN_USAGE.track(event, extra).
 */
(() => {
  'use strict';

  try {
    const SUPABASE_URL = 'https://quwbmhxgteyykujydvii.supabase.co';
    const ANON_KEY = 'sb_publishable_rWPuL8wGfe2zok4cYNENng_L6n2Qttu';
    const ENDPOINT = SUPABASE_URL + '/rest/v1/usage_events';
    const AUTH_TOKEN_KEY = 'sb-quwbmhxgteyykujydvii-auth-token';
    const SID_KEY = 'gn_usage_sid';

    let sid = null;
    let isNewSession = false;
    try {
      sid = sessionStorage.getItem(SID_KEY);
      if (!sid) {
        isNewSession = true;
        sid = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'sid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(SID_KEY, sid);
      }
    } catch (e) {
      sid = 'nosession';
      isNewSession = true;
    }

    function signedInUserId() {
      try {
        const raw = localStorage.getItem(AUTH_TOKEN_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const id = parsed && parsed.user && parsed.user.id;
        return typeof id === 'string' && id.length >= 8 ? id : null;
      } catch (e) {
        return null;
      }
    }

    function referrerHost() {
      try {
        return document.referrer ? new URL(document.referrer).hostname.slice(0, 128) : '';
      } catch (e) {
        return '';
      }
    }

    function appVersion() {
      try {
        const v = window.GN_VERSION || {};
        return String(v.semver || v.build || '').slice(0, 32);
      } catch (e) {
        return '';
      }
    }

    function basePayload() {
      return {
        session_id: String(sid).slice(0, 128),
        user_id: signedInUserId(),
        event: '',
        path: String(location.pathname || '/').slice(0, 256),
        host: String(location.hostname || '').slice(0, 128),
        lang: String((document.documentElement && document.documentElement.lang) || '').slice(0, 16),
        referrer_host: referrerHost(),
        app_version: appVersion()
      };
    }

    function send(eventName, extra) {
      try {
        const name = String(eventName || '').slice(0, 64);
        if (!name) return;
        const payload = basePayload();
        payload.event = name;
        if (extra && typeof extra === 'object') {
          // Allow only the known optional string fields; never user_id/session_id.
          if (typeof extra.path === 'string') payload.path = extra.path.slice(0, 256);
          if (typeof extra.lang === 'string') payload.lang = extra.lang.slice(0, 16);
          if (typeof extra.auth_method === 'string') payload.auth_method = extra.auth_method.slice(0, 32);
        }
        fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            apikey: ANON_KEY,
            Authorization: 'Bearer ' + ANON_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(() => { /* silent: tracking must never surface errors */ });
      } catch (e) {
        /* silent */
      }
    }

    window.GN_USAGE = {
      track(eventName, extra) { send(eventName, extra); }
    };

    if (isNewSession) send('session_start');
    send('page_view');

    document.addEventListener('click', (ev) => {
      try {
        const target = ev.target && ev.target.closest ? ev.target.closest('[data-usage]') : null;
        if (target) send(target.getAttribute('data-usage'));
      } catch (e) { /* silent */ }
    }, { passive: true });
  } catch (e) {
    /* The entire module is optional; never let it throw. */
  }
})();
