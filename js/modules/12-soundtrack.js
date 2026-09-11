/* GRID//NODE — YouTube soundtrack dock.
 *
 * Replaces the generative ambience prototype (12-ambience.js, removed
 * 2026-09-10 at Pipe's request). The SOUND switch in the topbar now streams
 * a real soundtrack instead of procedural pads.
 *
 * Track: "YOU CAN //NOT// FIX THAT | 1 HOUR BLADERUNNER MUSIC PLAYLIST"
 * (synthwave / retrowave), starts at 07:32 (t=452s), loops the single video.
 * Playback uses the official YouTube IFrame Player API: the track streams
 * from YouTube inside their player, nothing is downloaded or re-hosted.
 *
 * Opt-in only: the API script is not even fetched until the user flips the
 * SOUND switch (or left it on and makes their first tap, per autoplay
 * policy). Preference persists under the same gn_sound_v1 key.
 *
 * Compatibility: keeps the window.GN_AMBIENCE global with the same
 * `toggle` / `enabled` surface, so the topbar button's inline handler and
 * the haptics module (13-haptics.js) keep working untouched.
 */

const GN_SOUND_STORAGE_KEY = 'gn_sound_v1';
const GN_TRACK_VIDEO_ID = 'KGsJHYSzAKM';
const GN_TRACK_START_S = 452; // t=452s from Pipe's link
const GN_TRACK_TITLE = 'BLADERUNNER SYNTHWAVE // 1HR';

let gnSoundOn = false;
try { gnSoundOn = localStorage.getItem(GN_SOUND_STORAGE_KEY) === '1'; } catch (_) { /* private mode */ }

let gnYtApiLoading = false;
let gnYtApiReady = !!(window.YT && window.YT.Player);
let gnYtApiQueue = [];
let gnPlayer = null;
let gnPlayerReady = false;
let gnBootArmed = false;

/* ---------- dock ---------- */

function gnSoundtrackDock() {
  let dock = document.getElementById('gnSoundtrackDock');
  if (dock) return dock;
  dock = document.createElement('div');
  dock.id = 'gnSoundtrackDock';
  dock.className = 'gn-st-dock';
  dock.hidden = true;
  dock.innerHTML =
    '<div class="gn-st-head" data-gn-st-head>' +
      '<span class="gn-st-dot" aria-hidden="true"></span>' +
      '<span class="gn-st-title">' + GN_TRACK_TITLE + '</span>' +
      '<button type="button" class="gn-st-min" data-gn-st-min aria-label="Minimize soundtrack">–</button>' +
    '</div>' +
    '<div class="gn-st-body"><div id="gnYtPlayerHost" class="gn-st-host"></div></div>';
  document.body.appendChild(dock);
  dock.querySelector('[data-gn-st-min]').addEventListener('click', (e) => {
    e.stopPropagation();
    const min = dock.classList.toggle('gn-st-min');
    dock.querySelector('[data-gn-st-min]').textContent = min ? '+' : '–';
  });
  dock.querySelector('[data-gn-st-head]').addEventListener('click', () => {
    if (dock.classList.contains('gn-st-min')) {
      dock.classList.remove('gn-st-min');
      dock.querySelector('[data-gn-st-min]').textContent = '–';
    }
  });
  return dock;
}

function gnSoundtrackShowDock(show) {
  const dock = gnSoundtrackDock();
  dock.hidden = !show;
}

function gnSoundtrackNote(msg) {
  const dock = gnSoundtrackDock();
  const title = dock.querySelector('.gn-st-title');
  if (title && msg) title.textContent = msg;
}

/* ---------- YouTube IFrame API ---------- */

function gnYtEnsureApi(cb) {
  if (gnYtApiReady) { if (cb) cb(); return; }
  if (cb) gnYtApiQueue.push(cb);
  if (gnYtApiLoading) return;
  if (window.YT && window.YT.Player) {
    gnYtApiReady = true;
    const q = gnYtApiQueue; gnYtApiQueue = [];
    q.forEach((fn) => { try { fn(); } catch (_) {} });
    return;
  }
  gnYtApiLoading = true;
  window.onYouTubeIframeAPIReady = () => {
    gnYtApiReady = true;
    gnYtApiLoading = false;
    const q = gnYtApiQueue; gnYtApiQueue = [];
    q.forEach((fn) => { try { fn(); } catch (_) {} });
  };
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.async = true;
  tag.onerror = () => {
    gnYtApiLoading = false;
    gnYtApiQueue = [];
    gnSoundtrackNote('SOUNDTRACK OFFLINE');
  };
  document.head.appendChild(tag);
}

function gnSoundtrackCreatePlayer() {
  if (gnPlayer) return;
  const host = document.getElementById('gnYtPlayerHost');
  if (!host || !window.YT || !window.YT.Player) return;
  try {
    gnPlayer = new window.YT.Player(host, {
      width: '100%',
      height: '100%',
      videoId: GN_TRACK_VIDEO_ID,
      playerVars: {
        start: GN_TRACK_START_S,
        loop: 1,
        playlist: GN_TRACK_VIDEO_ID, // required for single-video loop
        rel: 0,
        modestbranding: 1,
      },
      events: {
        onReady: () => {
          gnPlayerReady = true;
          if (gnSoundOn) { try { gnPlayer.playVideo(); } catch (_) {} }
        },
        onStateChange: (e) => {
          // Loop flag usually handles this; belt-and-braces for embed quirks.
          if (e && e.data === window.YT.PlayerState.ENDED && gnSoundOn) {
            try { gnPlayer.seekTo(GN_TRACK_START_S, true); gnPlayer.playVideo(); } catch (_) {}
          }
        },
        onError: () => { gnSoundtrackNote('TRACK UNAVAILABLE'); },
      },
    });
  } catch (_) { gnPlayer = null; }
}

/* ---------- public surface ---------- */

function gnSoundRender() {
  const btn = document.getElementById('gnSoundToggle');
  if (!btn) return;
  btn.setAttribute('aria-checked', gnSoundOn ? 'true' : 'false');
  const state = tx(gnSoundOn ? 'shots.soundOn' : 'shots.soundOff', gnSoundOn ? 'ON' : 'OFF');
  btn.setAttribute('aria-label', tx('sound.toggle', 'SOUNDTRACK') + ' — ' + state);
}

function gnSoundStart() {
  gnSoundtrackShowDock(true);
  gnYtEnsureApi(() => {
    gnSoundtrackCreatePlayer();
    let tries = 0;
    const tryPlay = () => {
      if (!gnSoundOn) return;
      if (gnPlayerReady && gnPlayer) { try { gnPlayer.playVideo(); } catch (_) {} return; }
      if (++tries < 40) setTimeout(tryPlay, 300);
    };
    tryPlay();
  });
}

function gnSoundStop() {
  try { if (gnPlayer && gnPlayer.pauseVideo) gnPlayer.pauseVideo(); } catch (_) {}
  gnSoundtrackShowDock(false);
}

function gnSoundToggle() {
  gnSoundOn = !gnSoundOn;
  try { localStorage.setItem(GN_SOUND_STORAGE_KEY, gnSoundOn ? '1' : '0'); } catch (_) {}
  gnSoundRender();
  if (gnSoundOn) gnSoundStart();
  else gnSoundStop();
}

function gnSoundArmBoot() {
  // Browsers require a user gesture before media playback. If the user left
  // SOUND on, honor it on their first tap/keypress instead of staying
  // mysteriously silent.
  if (gnBootArmed || !gnSoundOn) return;
  gnBootArmed = true;
  const boot = () => { if (gnSoundOn) gnSoundStart(); };
  window.addEventListener('pointerdown', boot, { once: true });
  window.addEventListener('keydown', boot, { once: true });
}

window.GN_AMBIENCE = {
  toggle: gnSoundToggle,
  get enabled() { return gnSoundOn; },
};

gnSoundRender();
gnSoundArmBoot();
