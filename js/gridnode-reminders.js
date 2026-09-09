/* GRID//NODE dose reminders — local-first scheduling, no server required.
 *
 * Reads the notification preference the user already sets in VAULT
 * preferences (OFF / LOCAL REMINDERS / CLOUD REMINDERS) and the protocol
 * rhythm (frequencyDays + startDate, mirrored to the profile as
 * shotFrequency / protocolStartDate). CLOUD has no push server yet, so it
 * is delivered through the same local scheduling until the NODE backend
 * ships — strictly better than the previous behavior, which scheduled
 * nothing at all.
 *
 * Delivery layers:
 *   1. System notification via TimestampTrigger (Chrome Android) when the
 *      permission is granted and the API exists.
 *   2. In-app due banner on boot + whenever the page becomes visible, so a
 *      missed dose is always surfaced the next time the app opens, even
 *      where system scheduling is unsupported.
 *
 * Next dose = (last SHOT time, or protocol start date at 09:00) + frequency.
 * Recomputed live from localStorage on every check, so logging a shot
 * immediately pushes the next reminder out without any hook into the
 * shot-saving code.
 */
(function () {
  'use strict';

  var LS_NEXT = 'gn_reminder_next_v1';
  var DAY_MS = 86400000;

  function isSpanish() {
    try { return document.documentElement.lang === 'es'; } catch (_) { return false; }
  }
  function copy(en, es) { return isSpanish() ? es : en; }

  // Account-agnostic localStorage read: keys look like gn_<account>_<name>.
  function readAll(name) {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.slice(-name.length - 1) !== '_' + name) continue;
        try {
          var v = JSON.parse(localStorage.getItem(k));
          if (v !== undefined && v !== null) out.push(v);
        } catch (_) {}
      }
    } catch (_) {}
    return out;
  }
  function readMerged(name) {
    var merged = {};
    readAll(name).forEach(function (v) {
      if (Array.isArray(v)) return;
      if (v && typeof v === 'object') Object.assign(merged, v);
    });
    return merged;
  }

  function lastShotTime() {
    var latest = 0;
    readAll('shots').forEach(function (list) {
      (Array.isArray(list) ? list : []).forEach(function (r) {
        if (!r || r.archived) return;
        var t = new Date(r.date || r.timestamp || r.createdAt || 0).getTime();
        if (isFinite(t) && t > latest) latest = t;
      });
    });
    return latest || 0;
  }

  function protocol() {
    var prefs = readMerged('preferences');
    var profile = readMerged('profile');
    var freqDays = Number(prefs.frequencyDays || profile.shotFrequency) || 0;
    var startDate = prefs.startDate || profile.protocolStartDate || '';
    var mode = prefs.notifications || 'off';
    return { freqDays: freqDays, startDate: startDate, mode: mode };
  }

  function computeNextDose() {
    var p = protocol();
    if (!(p.freqDays > 0)) return null;
    var anchor = lastShotTime();
    var when;
    if (anchor > 0) {
      when = anchor + p.freqDays * DAY_MS;
    } else if (p.startDate) {
      var d = new Date(p.startDate + 'T09:00:00');
      if (!isFinite(d.getTime())) return null;
      when = d.getTime();
      // Start date in the past: roll forward to the next upcoming slot.
      while (when <= Date.now()) when += p.freqDays * DAY_MS;
    } else {
      return null;
    }
    return new Date(when);
  }

  function fmtWhen(date) {
    try {
      return date.toLocaleString(isSpanish() ? 'es' : 'en',
        { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (_) { return date.toString(); }
  }

  function reminderCopy(next) {
    return {
      title: copy('GRID//NODE · DOSE DUE', 'GRID//NODE · DOSIS PROGRAMADA'),
      body: copy('Time for your next shot — ' + fmtWhen(next),
                 'Hora de tu próxima dosis — ' + fmtWhen(next)),
      banner: copy('DOSE DUE · TAP TO LOG', 'DOSIS PROGRAMADA · TOCA PARA REGISTRAR'),
      action: copy('LOG SHOT', 'REGISTRAR')
    };
  }

  async function ensurePermission(interactive) {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    if (!interactive) return 'default';
    try { return await Notification.requestPermission(); }
    catch (_) { return 'denied'; }
  }

  function canScheduleSystem() {
    return ('Notification' in window) &&
      typeof TimestampTrigger !== 'undefined' &&
      ('showTrigger' in Notification.prototype);
  }

  async function scheduleSystem(next, text) {
    if (!canScheduleSystem()) return false;
    try {
      var reg = await navigator.serviceWorker.ready;
      await reg.showNotification(text.title, {
        body: text.body,
        tag: 'gn-dose-reminder',
        renotify: true,
        showTrigger: new TimestampTrigger(next.getTime()),
        data: { url: '/', action: 'log', when: next.getTime() }
      });
      return true;
    } catch (_) { return false; }
  }

  // System-scheduled notifications cannot be enumerated or cancelled, so a
  // superseded schedule may still fire once. The in-app due check below is
  // always authoritative; the banner state is recomputed live.
  async function reschedule(opts) {
    var interactive = !!(opts && opts.interactive);
    var p = protocol();
    var next = computeNextDose();
    try {
      if (next) localStorage.setItem(LS_NEXT, next.toISOString());
      else localStorage.removeItem(LS_NEXT);
    } catch (_) {}
    if (p.mode === 'off' || !next) return { ok: false, reason: p.mode === 'off' ? 'off' : 'no-protocol' };
    var perm = await ensurePermission(interactive);
    var system = false;
    if (perm === 'granted') system = await scheduleSystem(next, reminderCopy(next));
    checkDue();
    return { ok: true, mode: p.mode, system: system, permission: perm, next: next.toISOString() };
  }

  function checkDue() {
    var next = computeNextDose();
    if (!next || Date.now() < next.getTime()) return false;
    var text = reminderCopy(next);
    window.dispatchEvent(new CustomEvent('gn:reminder-due', {
      detail: {
        message: text.banner,
        actionLabel: text.action,
        next: next.toISOString()
      }
    }));
    return true;
  }

  // Tapping a system notification focuses the app and opens the log modal.
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'GN_OPEN_LOG') {
          try { window.openLogModal ? window.openLogModal() : null; } catch (_) {}
        }
      });
    }
  } catch (_) {}

  function boot() {
    checkDue();
    // Soft reschedule on boot: never prompts for permission without a gesture.
    reschedule({ interactive: false }).catch(function () {});
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) checkDue();
    });
  }

  window.GN_REMINDERS = Object.freeze({
    reschedule: reschedule,
    checkDue: checkDue,
    nextDose: function () { var n = computeNextDose(); return n ? n.toISOString() : null; }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
