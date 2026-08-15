// GRID//NODE ACCESS//GATE — private-beta authorization endpoint.
// Cloudflare Pages Function at /api/beta-access.
//
// Contract (v6):
//   POST { code: string }
//   200 -> Set-Cookie: __Host-gridnode-beta=<opaque>; + { status: "granted", ttl }
//   401 -> { status: "denied" } (no detail distinction to client)
//   429 -> { status: "limited", retryAfter } (+ Retry-After header)
//   503 -> { status: "interrupted" }
//   405 -> method not allowed
//
// Hard rules:
//   - Server verifies the invitation. No offline grant.
//   - HttpOnly cookie is the ONLY session credential. No token in JSON.
//   - Never log raw code, cookie value, session opaque-id, or Authorization header.
//   - No device fingerprinting. Rate limits are endpoint + IP + invite-id.
//   - Atomic single-use claim via claim_beta_invite() Postgres function.

import {
  BetaEnv,
  TTL_SECONDS,
  buildSessionCookie,
  classifyUserAgent,
  clientIp,
  coarseCountry,
  fetchActiveInvites,
  hashCode,
  json,
  normalizeCode,
  normalizeIp,
  serviceHeaders,
  timingSafeEqual
} from './_beta-shared';

interface RateLimitConfig {
  endpoint: { windowSec: number; max: number };
  ip:       { windowSec: number; max: number };
  invite:   { windowSec: number; max: number };
}

const RATE_LIMITS: RateLimitConfig = {
  endpoint: { windowSec: 60,    max: 60 },
  ip:       { windowSec: 600,   max: 10 },
  invite:   { windowSec: 3600,  max: 5 }
};

function alignedWindowStart(nowMs: number, windowSec: number): string {
  return new Date(Math.floor(nowMs / (windowSec * 1000)) * (windowSec * 1000)).toISOString();
}

async function incrBucket(env: BetaEnv, bucket: string, windowStart: string): Promise<number> {
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/beta_rate_limits?bucket=eq.${encodeURIComponent(bucket)}&window_start=eq.${encodeURIComponent(windowStart)}`;
  const headers = {
    ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
    Prefer: 'resolution=merge-duplicates,return=representation'
  };
  const body = JSON.stringify({ bucket, window_start: windowStart, count: 1 });
  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) return 0;
  const rows = await res.json() as Array<{ count: number }>;
  return rows?.[0]?.count ?? 0;
}

async function checkRateLimits(env: BetaEnv, req: Request, inviteId: string | null): Promise<{ allowed: boolean; retryAfter: number; scope: string | null }> {
  const nowMs = Date.now();
  const ip = normalizeIp(clientIp(req));

  // Layer 1: endpoint / global
  const epBucket = 'endpoint';
  const epWindow = alignedWindowStart(nowMs, RATE_LIMITS.endpoint.windowSec);
  const epCount = await incrBucket(env, epBucket, epWindow);
  if (epCount > RATE_LIMITS.endpoint.max) {
    return { allowed: false, retryAfter: RATE_LIMITS.endpoint.windowSec - Math.floor(nowMs / 1000) % RATE_LIMITS.endpoint.windowSec, scope: 'endpoint' };
  }

  // Layer 2: IP-based
  if (ip) {
    const ipBucket = `ip:${ip}`;
    const ipWindow = alignedWindowStart(nowMs, RATE_LIMITS.ip.windowSec);
    const ipCount = await incrBucket(env, ipBucket, ipWindow);
    if (ipCount > RATE_LIMITS.ip.max) {
      return { allowed: false, retryAfter: RATE_LIMITS.ip.windowSec - Math.floor(nowMs / 1000) % RATE_LIMITS.ip.windowSec, scope: 'ip' };
    }
  }

  // Layer 3: invite-id (only if we have one)
  if (inviteId) {
    const invBucket = `invite:${inviteId}`;
    const invWindow = alignedWindowStart(nowMs, RATE_LIMITS.invite.windowSec);
    const invCount = await incrBucket(env, invBucket, invWindow);
    if (invCount > RATE_LIMITS.invite.max) {
      // Auto-revoke invite on bucket exhaust.
      await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/revoke_beta_invite`, {
        method: 'POST',
        headers: { ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=minimal' },
        body: JSON.stringify({ p_invite_id: inviteId })
      }).catch(() => undefined);
      return { allowed: false, retryAfter: RATE_LIMITS.invite.windowSec, scope: 'invite' };
    }
  }

  return { allowed: true, retryAfter: 0, scope: null };
}

async function atomicClaim(env: BetaEnv, inviteId: string): Promise<{ id: string; uses: number; max_uses: number; status: string } | null> {
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/claim_beta_invite`;
  const res = await fetch(url, {
    method: 'POST',
    headers: serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
    body: JSON.stringify({ p_invite_id: inviteId })
  });
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ id: string; uses: number; max_uses: number; status: string }>;
  return rows?.[0] ?? null;
}

async function issueSession(env: BetaEnv, inviteId: string, cookieTokenHash: Uint8Array, ipHashHex: string, ttlSeconds: number): Promise<{ expires_at: string } | null> {
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/beta_sessions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=minimal' },
    body: JSON.stringify({
      token_hash: encodeHexForBytea(cookieTokenHash),
      invite_id: inviteId,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      ip_hash: ipHashHex
    })
  });
  if (!res.ok) return null;
  return { expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
}

// Supabase bytea encoding: '\\x' + hex bytes.
function encodeHexForBytea(bytes: Uint8Array): string {
  let out = '\\x';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  const arr = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
  return out;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const arr = new Uint8Array(sig);
  let out = '';
  for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
  return out;
}

async function writeAudit(env: BetaEnv, attempt: {
  invite_ref: string | null;
  result: string;
  result_reason: string | null;
  rate_limit_outcome: string;
  rate_limit_remaining: number;
  ip_hash: string;
  ip_country: string;
  user_agent_class: string;
  device_class: string;
  response_time_ms: number;
  http_status: number;
}): Promise<void> {
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/beta_attempts`;
  await fetch(url, {
    method: 'POST',
    headers: { ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=minimal' },
    body: JSON.stringify(attempt)
  }).catch(() => undefined);
}

async function auditForAttempt(env: BetaEnv, req: Request, t0: number, inviteRef: string | null, result: string, resultReason: string | null, rateOutcome: string, remaining: number, httpStatus: number): Promise<void> {
  let inviteRefHex: string | null = null;
  if (inviteRef) inviteRefHex = await hmacHex(env.GATE_AUDIT_SECRET, inviteRef + ':' + env.GATE_AUDIT_SECRET);
  const ua = req.headers.get('user-agent') || '';
  const cls = classifyUserAgent(ua);
  const ip = normalizeIp(clientIp(req));
  const ipHashHex = await sha256Hex(ip + ':' + env.GATE_AUDIT_SECRET);
  await writeAudit(env, {
    invite_ref: inviteRefHex,
    result,
    result_reason: resultReason,
    rate_limit_outcome: rateOutcome,
    rate_limit_remaining: remaining,
    ip_hash: ipHashHex,
    ip_country: coarseCountry(req),
    user_agent_class: cls.user_agent_class,
    device_class: cls.device_class,
    response_time_ms: Date.now() - t0,
    http_status: httpStatus
  });
}

function randomOpaqueId32(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < buf.length; i++) out += buf[i].toString(16).padStart(2, '0');
  return out;
}

export async function onRequest(context: { request: Request; env: BetaEnv }) {
  const t0 = Date.now();
  const req = context.request;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ status: 'interrupted' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Allow: 'POST' }
    });
  }

  const supabaseUrl = String(context.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceRoleKey = String(context.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const auditSecret = String(context.env.GATE_AUDIT_SECRET || '').trim();
  if (!supabaseUrl || !serviceRoleKey || !auditSecret) {
    return json({ status: 'interrupted' }, 503);
  }
  const env: BetaEnv = { SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey, GATE_AUDIT_SECRET: auditSecret };

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    await auditForAttempt(env, req, t0, null, 'denied', 'invalid', 'allowed', 0, 401);
    return json({ status: 'denied' }, 401);
  }

  const code = normalizeCode(typeof body.code === 'string' ? body.code : '');
  if (!code) {
    await auditForAttempt(env, req, t0, null, 'denied', 'invalid', 'allowed', 0, 401);
    return json({ status: 'denied' }, 401);
  }

  // Compute the HMAC of the code. Constant time after this.
  const codeHash = await hashCode(code, env.GATE_AUDIT_SECRET);

  // First-pass rate limit (endpoint + IP) — runs before any DB lookup so an
  // attacker can't differentiate not-found from rate-limited.
  const preRl = await checkRateLimits(env, req, null);
  if (!preRl.allowed) {
    await auditForAttempt(env, req, t0, null, 'limited', null, preRl.scope || 'throttled', 0, 429);
    return json({ status: 'limited', retryAfter: preRl.retryAfter }, 429, { 'Retry-After': String(preRl.retryAfter) });
  }

  // Look up active invite by hash. We can't SELECT by hash equality
  // efficiently at small scale, so we fetch active candidates and verify
  // locally with constant-time comparison.
  const candidates = await fetchActiveInvites(env, fetch);
  let matched: any = null;
  for (const inv of candidates) {
    const invHash = hexToBytes(inv.code_hash.startsWith('\\x') ? inv.code_hash.slice(2) : inv.code_hash);
    if (timingSafeEqual(codeHash, invHash.buffer)) {
      matched = inv; break;
    }
  }
  if (!matched) {
    await auditForAttempt(env, req, t0, null, 'denied', 'invalid', 'allowed', 0, 401);
    return json({ status: 'denied' }, 401);
  }

  // Layer 3 rate limit (invite-specific).
  const rl3 = await checkRateLimits(env, req, matched.id);
  if (!rl3.allowed) {
    await auditForAttempt(env, req, t0, matched.id, 'limited', null, rl3.scope || 'throttled', 0, 429);
    return json({ status: 'limited', retryAfter: rl3.retryAfter }, 429, { 'Retry-After': String(rl3.retryAfter) });
  }

  // Atomic claim.
  const claim = await atomicClaim(env, matched.id);
  if (!claim) {
    await auditForAttempt(env, req, t0, matched.id, 'denied', 'invalid', 'allowed', 0, 401);
    return json({ status: 'denied' }, 401);
  }

  // Issue session.
  const opaqueId = randomOpaqueId32();
  const cookieTokenHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(opaqueId)));
  const ip = normalizeIp(clientIp(req));
  const ipHashHex = await sha256Hex(ip + ':' + env.GATE_AUDIT_SECRET);
  const inserted = await issueSession(env, matched.id, cookieTokenHash, ipHashHex, TTL_SECONDS);
  if (!inserted) {
    await auditForAttempt(env, req, t0, matched.id, 'interrupted', null, 'allowed', 0, 503);
    return json({ status: 'interrupted' }, 503);
  }

  await auditForAttempt(env, req, t0, matched.id, 'granted', null, 'allowed', RATE_LIMITS.invite.max - claim.uses, 200);
  return json({ status: 'granted', ttl: TTL_SECONDS }, 200, {
    'Set-Cookie': buildSessionCookie(opaqueId, TTL_SECONDS)
  });
}
