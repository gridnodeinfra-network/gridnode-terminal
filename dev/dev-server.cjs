// GRID//NODE — LOCAL-ONLY unified dev server.
//
// Responsibilities:
//   1. Serve the static tree at the worktree root.
//   2. Handle /api/beta-access, /api/beta/session, /api/beta/logout.
//   3. Maintain an in-memory invite + session store seeded with the four
//      NODE-format fixture codes (NODE-GRNT-AB7K, NODE-DENY-DENY, NODE-LMMT-LIMIT, NODE-ERRR-STOP) AND any
//      real invites added via the npm run beta:invite CLI.
//
// NOT deployed. Does NOT touch production Supabase. Lives in /dev/ which is
// not staged by scripts/stage-deploy.sh.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.GATE_STUB_PORT || '4189', 10);
const HOST = process.env.GATE_STUB_HOST || '127.0.0.1';
const STATE_FILE = process.env.GATE_STATE_FILE || path.join(__dirname, '.dev-state.json');
const HMAC_SECRET = process.env.BETA_HMAC_SECRET || 'dev-hmac-secret-do-not-use-in-prod';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

const COOKIE_NAME = '__Host-gridnode-beta';
const TTL_SECONDS = 24 * 60 * 60;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_FORMAT = /^NODE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

// ---------------------------------------------------------------------------
// In-memory store (resets when the server restarts, unless STATE_FILE exists)
// ---------------------------------------------------------------------------

function genUuid() {
  return crypto.randomUUID();
}
function genOpaqueId() {
  return crypto.randomBytes(32).toString('hex');
}
function hashCode(code) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(code).digest();
}
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest();
}
function hashIp(ip) {
  return crypto.createHash('sha256').update(ip + ':' + HMAC_SECRET).digest('hex');
}
function inviteRef(id) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(id).digest('hex');
}
function normalizeIp(ip) {
  if (!ip) return '';
  if (ip.includes(':')) {
    const p = ip.split(':');
    return p.slice(0, 3).join(':') + '::/48';
  }
  const p = ip.split('.');
  return p.slice(0, 3).join('.') + '.0/24';
}
function clientIp(req) {
  return req.headers['cf-connecting-ip']
      || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || '0.0.0.0';
}
function coarseCountry(req) { return (req.headers['cf-ipcountry'] || '').toUpperCase(); }
function readSessionCookie(req) {
  const c = req.headers['cookie'] || '';
  for (const part of c.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE_NAME) return v || null;
  }
  return null;
}
function timingSafeEqual(a, b) {
  const av = Buffer.from(a);
  const bv = Buffer.from(b);
  if (av.length !== bv.length) return false;
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

function defaultStore() {
  const store = {
    invites: new Map(),    // id -> invite
    sessions: new Map(),   // tokenHash hex -> session
    attempts: []           // recent attempts (for debugging)
  };
  // Seed with the four DEV-* fixtures. These are DOC strings, not via the
  // standard generate/insert path, so they can be referenced by stable
  // code values rather than rotated UUIDs.
  function seedFixture(code, behavior) {
    const id = genUuid();
    const codeHash = hashCode(code);
    store.invites.set(id, {
      id,
      code_hash: codeHash,
      status: 'active',
      max_uses: 1,
      uses: 0,
      expires_at: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      claimed_at: null,
      revoked_at: null,
      _behavior: behavior,
      _fixture: true
    });
    return id;
  }
  seedFixture('NODE-GRNT-AB7K', 'grant');
  seedFixture('NODE-DENY-DENY', 'deny');
  seedFixture('NODE-LMMT-LMMT', 'limit');
  seedFixture('NODE-ERRR-ERST', 'error');
  return store;
}

let STORE = null;
function loadStore() {
  if (STORE) return STORE;
  if (fs.existsSync(STATE_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      STORE = {
        invites: new Map((raw.invites || []).map((i) => [i.id, i])),
        sessions: new Map(raw.sessions || []),
        attempts: raw.attempts || []
      };
    } catch (e) {
      STORE = defaultStore();
    }
  } else {
    STORE = defaultStore();
  }
  return STORE;
}
function saveStore() {
  if (!STORE) return;
  try {
    const dump = {
      invites: Array.from(STORE.invites.values()),
      sessions: Array.from(STORE.sessions.entries()),
      attempts: STORE.attempts.slice(-200)
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(dump, null, 2));
  } catch (e) {}
}

function logAttempt(attempt) {
  const store = loadStore();
  store.attempts.push({ ...attempt, timestamp: new Date().toISOString() });
  if (store.attempts.length > 500) store.attempts = store.attempts.slice(-500);
  saveStore();
}

function generateCode() {
  const buf = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return `NODE-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

function normalizeCode(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  if (!CODE_FORMAT.test(trimmed)) return null;
  return trimmed;
}

const RATE_LIMITS = {
  endpoint: { windowSec: 60,    max: 60 },
  ip:       { windowSec: 600,   max: 10 },
  invite:   { windowSec: 3600,  max: 5 }
};

function alignedWindowStart(nowMs, windowSec) {
  return new Date(Math.floor(nowMs / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
}

function checkRateLimits(req, inviteId) {
  const nowMs = Date.now();
  const ip = normalizeIp(clientIp(req));

  // Layer 1
  const epBucket = 'endpoint';
  const epWindow = alignedWindowStart(nowMs, RATE_LIMITS.endpoint.windowSec);
  const epCount = bumpBucket(epBucket, epWindow);
  if (epCount > RATE_LIMITS.endpoint.max) {
    const retryAfter = RATE_LIMITS.endpoint.max;
    return { allowed: false, retryAfter, scope: 'endpoint' };
  }
  // Layer 2
  if (ip) {
    const ipBucket = `ip:${ip}`;
    const ipWindow = alignedWindowStart(nowMs, RATE_LIMITS.ip.windowSec);
    const ipCount = bumpBucket(ipBucket, ipWindow);
    if (ipCount > RATE_LIMITS.ip.max) {
      const retryAfter = RATE_LIMITS.ip.max;
      return { allowed: false, retryAfter, scope: 'ip' };
    }
  }
  // Layer 3
  if (inviteId) {
    const invBucket = `invite:${inviteId}`;
    const invWindow = alignedWindowStart(nowMs, RATE_LIMITS.invite.windowSec);
    const invCount = bumpBucket(invBucket, invWindow);
    if (invCount > RATE_LIMITS.invite.max) {
      const retryAfter = RATE_LIMITS.invite.max;
      // auto-revoke invite
      const inv = loadStore().invites.get(inviteId);
      if (inv) { inv.status = 'revoked'; inv.revoked_at = new Date().toISOString(); saveStore(); }
      return { allowed: false, retryAfter, scope: 'invite' };
    }
  }
  return { allowed: true, retryAfter: 0, scope: null };
}

const _buckets = new Map(); // bucket|window -> count
function bumpBucket(bucket, windowStart) {
  const key = `${bucket}|${windowStart}`;
  const c = (_buckets.get(key) || 0) + 1;
  _buckets.set(key, c);
  // garbage-collect old buckets
  if (_buckets.size > 5000) {
    const cutoff = Date.now() - 2 * 3600 * 1000;
    for (const [k, _] of _buckets) {
      const ts = k.split('|')[1];
      if (ts && new Date(ts).getTime() < cutoff) _buckets.delete(k);
    }
  }
  return c;
}

function buildSessionCookie(opaqueId, ttlSeconds) {
  return [
    `${COOKIE_NAME}=${opaqueId}`,
    'Path=/',
    'Secure',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${ttlSeconds}`
  ].join('; ');
}

function buildSessionCookieCleared() {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Secure',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0'
  ].join('; ');
}

function jsonResponse(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(payload);
}

function serveStatic(req, res, pathname) {
  let filepath = path.join(ROOT, pathname);
  if (!filepath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.stat(filepath, (err, stat) => {
    if (err || !stat.isFile()) {
      if (req.method === 'GET' && !pathname.startsWith('/api/')) {
        return serveStatic(req, res, '/index.html');
      }
      res.writeHead(404); res.end('Not Found'); return;
    }
    const ext = path.extname(filepath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filepath).pipe(res);
  });
}

// ---------------------------------------------------------------------------
// Handler implementations
// ---------------------------------------------------------------------------

function handleBetaAccess(req, res) {
  const t0 = Date.now();
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 8192) req.destroy(); });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch { parsed = {}; }
    const code = normalizeCode(parsed.code);
    if (!code) {
      logAttempt({ result: 'denied', reason: 'invalid', ip_h: hashIp(normalizeIp(clientIp(req))).slice(0, 8), ua: req.headers['user-agent'] || '' });
      return jsonResponse(res, 401, { status: 'denied' });
    }

    const codeHash = hashCode(code);

    // First-pass rate limit (endpoint + ip).
    const rl1 = checkRateLimits(req, null);
    if (!rl1.allowed) {
      logAttempt({ result: 'limited', scope: rl1.scope });
      return jsonResponse(res, 429, { status: 'limited', retryAfter: rl1.retryAfter }, { 'Retry-After': String(rl1.retryAfter) });
    }

    // Find invite by hash.
    const store = loadStore();
    let matched = null;
    for (const inv of store.invites.values()) {
      if (inv.status !== 'active') continue;
      if (inv.revoked_at) continue;
      if (new Date(inv.expires_at).getTime() <= Date.now()) continue;
      if (Buffer.isBuffer(inv.code_hash)) {
        if (timingSafeEqual(codeHash, inv.code_hash)) { matched = inv; break; }
      } else if (typeof inv.code_hash === 'string') {
        // Defensive: legacy string hash
        if (inv.code_hash === codeHash.toString('hex')) { matched = inv; break; }
      }
    }

    // Apply fixture override behavior.
    if (matched && matched._behavior) {
      const behavior = matched._behavior;
      // Burn the use either way (single-use).
      matched.uses += 1;
      matched.status = 'claimed';
      matched.claimed_at = new Date().toISOString();
      saveStore();
      if (behavior === 'grant') {
        const opaqueId = genOpaqueId();
        const tokenHash = hashToken(opaqueId).toString('hex');
        store.sessions.set(tokenHash, {
          id: genUuid(),
          token_hash: tokenHash,
          invite_id: matched.id,
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
          revoked_at: null,
          last_seen_at: null,
          ip_hash: hashIp(normalizeIp(clientIp(req)))
        });
        saveStore();
        logAttempt({ result: 'granted', invite_ref: inviteRef(matched.id).slice(0, 8), code: 'NODE-GRNT-AB7K' });
        return jsonResponse(res, 200, { status: 'granted', ttl: TTL_SECONDS }, { 'Set-Cookie': buildSessionCookie(opaqueId, TTL_SECONDS) });
      }
      if (behavior === 'deny') {
        logAttempt({ result: 'denied', reason: 'invalid', invite_ref: inviteRef(matched.id).slice(0, 8), code: 'NODE-DENY-DENY' });
        return jsonResponse(res, 401, { status: 'denied' });
      }
      if (behavior === 'limit') {
        logAttempt({ result: 'limited', scope: 'invite', code: 'NODE-LMMT-LMMT' });
        return jsonResponse(res, 429, { status: 'limited', retryAfter: 12 }, { 'Retry-After': '12' });
      }
      if (behavior === 'error') {
        logAttempt({ result: 'interrupted', code: 'NODE-ERRR-ERST' });
        return jsonResponse(res, 503, { status: 'interrupted' });
      }
    }

    if (!matched) {
      logAttempt({ result: 'denied', reason: 'invalid' });
      return jsonResponse(res, 401, { status: 'denied' });
    }

    // Layer 3 rate limit (invite-specific).
    const rl3 = checkRateLimits(req, matched.id);
    if (!rl3.allowed) {
      logAttempt({ result: 'limited', scope: rl3.scope });
      return jsonResponse(res, 429, { status: 'limited', retryAfter: rl3.retryAfter }, { 'Retry-After': String(rl3.retryAfter) });
    }

    // Atomic claim.
    if (matched.uses >= matched.max_uses) {
      logAttempt({ result: 'denied', reason: 'exhausted', invite_ref: inviteRef(matched.id).slice(0, 8) });
      return jsonResponse(res, 401, { status: 'denied' });
    }
    matched.uses += 1;
    if (matched.uses >= matched.max_uses) {
      matched.status = 'claimed';
      matched.claimed_at = new Date().toISOString();
    }
    saveStore();

    // Issue session.
    const opaqueId = genOpaqueId();
    const tokenHash = hashToken(opaqueId).toString('hex');
    store.sessions.set(tokenHash, {
      id: genUuid(),
      token_hash: tokenHash,
      invite_id: matched.id,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
      revoked_at: null,
      last_seen_at: null,
      ip_hash: hashIp(normalizeIp(clientIp(req)))
    });
    saveStore();

    logAttempt({ result: 'granted', invite_ref: inviteRef(matched.id).slice(0, 8) });
    return jsonResponse(res, 200, { status: 'granted', ttl: TTL_SECONDS }, { 'Set-Cookie': buildSessionCookie(opaqueId, TTL_SECONDS) });
  });
}

function handleBetaSession(req, res) {
  const t0 = Date.now();
  const cookieRaw = readSessionCookie(req);
  if (!cookieRaw) {
    return jsonResponse(res, 401, { active: false });
  }
  const tokenHash = hashToken(cookieRaw).toString('hex');
  const store = loadStore();
  const session = store.sessions.get(tokenHash);
  if (!session) {
    return jsonResponse(res, 401, { active: false });
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return jsonResponse(res, 401, { active: false });
  }
  if (session.revoked_at) {
    return jsonResponse(res, 401, { active: false });
  }
  const invite = store.invites.get(session.invite_id);
  if (!invite) {
    return jsonResponse(res, 401, { active: false });
  }
  if (invite.revoked_at || invite.status === 'revoked') {
    return jsonResponse(res, 401, { active: false });
  }
  if (new Date(invite.expires_at).getTime() <= Date.now() || invite.status === 'expired') {
    return jsonResponse(res, 401, { active: false });
  }
  // Best-effort last_seen_at update
  session.last_seen_at = new Date().toISOString();
  saveStore();
  return jsonResponse(res, 200, { active: true });
}

function handleBetaLogout(req, res) {
  const cookieRaw = readSessionCookie(req);
  if (!cookieRaw) {
    return jsonResponse(res, 200, { status: 'revoked' }, { 'Set-Cookie': buildSessionCookieCleared() });
  }
  const tokenHash = hashToken(cookieRaw).toString('hex');
  const store = loadStore();
  const session = store.sessions.get(tokenHash);
  if (session) {
    session.revoked_at = new Date().toISOString();
    saveStore();
  }
  return jsonResponse(res, 200, { status: 'revoked' }, { 'Set-Cookie': buildSessionCookieCleared() });
}

// ---------------------------------------------------------------------------
// Admin API — used by scripts/beta-admin.cjs to create / list / revoke.
// ---------------------------------------------------------------------------

function handleAdminInvite(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 8192) req.destroy(); });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch { parsed = {}; }
    const count = parseInt(parsed.count || '1', 10);
    const maxUses = parseInt(parsed.max_uses || '1', 10);
    const ttlMs = parseInt(parsed.ttl_ms || (14 * 86400 * 1000), 10);
    if (!Number.isFinite(count) || count < 1 || count > 100) {
      return jsonResponse(res, 400, { error: 'count must be 1-100' });
    }
    const store = loadStore();
    const out = [];
    for (let i = 0; i < count; i++) {
      const code = generateCode();
      const codeHash = hashCode(code);
      const id = genUuid();
      const inv = {
        id,
        code_hash: codeHash,
        status: 'active',
        max_uses: maxUses,
        uses: 0,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
        created_at: new Date().toISOString(),
        claimed_at: null,
        revoked_at: null
      };
      store.invites.set(id, inv);
      out.push({ id, code, expires_at: inv.expires_at });
    }
    saveStore();
    console.log('[DEV] created', count, 'invite(s). Codes printed to CLI stdout only.');
    return jsonResponse(res, 200, { invites: out });
  });
}

function handleAdminList(req, res) {
  const store = loadStore();
  const rows = Array.from(store.invites.values())
    .filter((i) => !i._fixture) // hide the DEV-* fixtures from the admin list
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((i) => ({
      id: i.id,
      code_hash: Buffer.isBuffer(i.code_hash) ? i.code_hash.toString('hex') : (typeof i.code_hash === 'string' ? i.code_hash : null),
      status: i.status,
      max_uses: i.max_uses,
      uses: i.uses,
      expires_at: i.expires_at,
      created_at: i.created_at,
      claimed_at: i.claimed_at,
      revoked_at: i.revoked_at
    }));
  return jsonResponse(res, 200, { invites: rows });
}

function handleAdminRevoke(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 8192) req.destroy(); });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch { parsed = {}; }
    const id = parsed.id;
    if (!id) return jsonResponse(res, 400, { error: 'id required' });
    const store = loadStore();
    const inv = store.invites.get(id);
    if (!inv) return jsonResponse(res, 404, { error: 'not found' });
    if (inv.status === 'revoked') return jsonResponse(res, 200, { ok: false, reason: 'already revoked' });
    inv.status = 'revoked';
    inv.revoked_at = new Date().toISOString();
    // Cascade: revoke sessions.
    for (const session of store.sessions.values()) {
      if (session.invite_id === id && !session.revoked_at) {
        session.revoked_at = new Date().toISOString();
      }
    }
    saveStore();
    return jsonResponse(res, 200, { ok: true });
  });
}

function handleAdminSeed(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'method not allowed' });
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 8192) req.destroy(); });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch { parsed = {}; }
    const code = normalizeCode(parsed.code);
    const maxUses = parseInt(parsed.max_uses || '1', 10);
    // expires_at can be an ISO timestamp directly (for testing expired invites)
    let expiresAt;
    if (parsed.expires_at) {
      expiresAt = parsed.expires_at;
    } else {
      const ttlMs = parseInt(parsed.ttl_ms || (14 * 86400 * 1000), 10);
      expiresAt = new Date(Date.now() + ttlMs).toISOString();
    }
    if (!code) return jsonResponse(res, 400, { error: 'invalid code shape' });
    const store = loadStore();
    const id = parsed.id || genUuid();
    const inv = {
      id,
      code_hash: hashCode(code),
      status: parsed.status || 'active',
      max_uses: maxUses,
      uses: parsed.uses || 0,
      expires_at: expiresAt,
      created_at: parsed.created_at || new Date().toISOString(),
      claimed_at: parsed.claimed_at || null,
      revoked_at: parsed.revoked_at || null
    };
    store.invites.set(id, inv);
    saveStore();
    return jsonResponse(res, 200, { id, code, expires_at: inv.expires_at, status: inv.status });
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // API routes
  if (url === '/api/beta-access' && req.method === 'POST') return handleBetaAccess(req, res);
  if (url === '/api/beta-session' && req.method === 'GET') return handleBetaSession(req, res);
  if (url === '/api/beta-logout' && req.method === 'POST') return handleBetaLogout(req, res);

  // Admin API (no auth — INTERNAL DEV ONLY, never deployed, bind 127.0.0.1 only)
  if (url === '/api/_dev/invite' && req.method === 'POST') return handleAdminInvite(req, res);
  if (url === '/api/_dev/list' && req.method === 'GET') return handleAdminList(req, res);
  if (url === '/api/_dev/revoke' && req.method === 'POST') return handleAdminRevoke(req, res);
  if (url === '/api/_dev/seed' && req.method === 'POST') return handleAdminSeed(req, res);

  // Static
  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res, url === '/' ? '/index.html' : url);
  }

  res.writeHead(405); res.end();
});

server.listen(PORT, HOST, () => {
  console.log('[DEV] Static + API server');
  console.log('  worktree (static root): ' + ROOT);
  console.log('  state file:              ' + STATE_FILE);
  console.log('  HMAC secret:              ' + (HMAC_SECRET === 'dev-hmac-secret-do-not-use-in-prod' ? '(dev default — DO NOT USE IN PROD)' : '(custom — set via BETA_HMAC_SECRET)'));
  console.log('  listening:                http://' + HOST + ':' + PORT);
  console.log('');
  console.log('  /api/beta-access       POST   {"code": "..."}');
  console.log('  /api/beta-session      GET    (cookie-based)');
  console.log('  /api/beta-logout       POST   (revoke session cookie)');
  console.log('');
  console.log('  /api/_dev/invite       POST   admin: create invite');
  console.log('  /api/_dev/list         GET    admin: list invites');
  console.log('  /api/_dev/revoke       POST   admin: revoke invite');
  console.log('  /api/_dev/seed         POST   admin: seed a plain invite');
  console.log('');
  console.log('  NODE-format fixtures (seeded): NODE-GRNT-AB7K (granted), NODE-DENY-DENY (denied), NODE-LMMT-LMMT (limited), NODE-ERRR-ERST (interrupted)');
  console.log('  These are stable codes for testing the four contract branches.');
  console.log('  They are NOT in production code paths.');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
