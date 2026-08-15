// GRID//NODE ACCESS//GATE — session check endpoint.
// Cloudflare Pages Function at /api/beta/session.
//
// Contract:
//   GET /api/beta/session
//   200 { active: true }                    // session valid
//   401 { active: false }                   // missing, invalid, expired, revoked, or invite revoked
//
// Reads the HttpOnly cookie server-side. The cookie's raw opaque-id is never
// returned to the client. We hash the cookie value with SHA-256 and look up
// the matching row in beta_sessions, then validate:
//   - session.expires_at > now()
//   - session.revoked_at is null
//   - the associated invite.status is 'active' or 'claimed'
//   - the associated invite.revoked_at is null
//   - the associated invite.expires_at > now()
//
// On success, last_seen_at is updated (best-effort, never blocks the response).
// No session secret is ever returned.

import {
  BetaEnv,
  COOKIE_NAME,
  classifyUserAgent,
  clientIp,
  coarseCountry,
  json,
  normalizeIp,
  readSessionCookie,
  serviceHeaders
} from './_beta-shared';

interface SessionRow {
  id: string;
  token_hash: string;
  invite_id: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
}

interface InviteRow {
  id: string;
  status: string;
  expires_at: string;
  revoked_at: string | null;
}

async function sha256Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  const arr = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
  return out;
}

function encodeHexForBytea(bytes: Uint8Array): string {
  let out = '\\x';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

interface AttemptAudit {
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
}

async function audit(env: BetaEnv, req: Request, t0: number, audit: Partial<AttemptAudit>): Promise<void> {
  const ua = req.headers.get('user-agent') || '';
  const cls = classifyUserAgent(ua);
  const ip = normalizeIp(clientIp(req));
  const ipHashHex = await sha256Hex(ip + ':' + env.GATE_AUDIT_SECRET);
  await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/beta_attempts`, {
    method: 'POST',
    headers: { ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=minimal' },
    body: JSON.stringify({
      invite_ref: audit.invite_ref || null,
      result: audit.result || 'denied',
      result_reason: audit.result_reason || null,
      rate_limit_outcome: audit.rate_limit_outcome || 'allowed',
      rate_limit_remaining: audit.rate_limit_remaining || 0,
      ip_hash: ipHashHex,
      ip_country: coarseCountry(req),
      user_agent_class: cls.user_agent_class,
      device_class: cls.device_class,
      response_time_ms: Date.now() - t0,
      http_status: audit.http_status || 401
    })
  }).catch(() => undefined);
}

export async function onRequest(context: { request: Request; env: BetaEnv }) {
  const t0 = Date.now();
  const req = context.request;

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ active: false }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Allow: 'GET' }
    });
  }

  const supabaseUrl = String(context.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceRoleKey = String(context.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const auditSecret = String(context.env.GATE_AUDIT_SECRET || '').trim();
  if (!supabaseUrl || !serviceRoleKey || !auditSecret) {
    return json({ active: false }, 503);
  }
  const env: BetaEnv = { SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey, GATE_AUDIT_SECRET: auditSecret };

  const cookieRaw = readSessionCookie(req);
  if (!cookieRaw) {
    await audit(env, req, t0, { result: 'denied', result_reason: 'invalid', http_status: 401 });
    return json({ active: false }, 401);
  }

  // Hash the cookie and look up the session by hash.
  const cookieHashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cookieRaw)));
  const cookieHashHex = encodeHexForBytea(cookieHashBytes);

  const sessionsUrl = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/beta_sessions?token_hash=eq.${encodeURIComponent(cookieHashHex)}&select=id,token_hash,invite_id,expires_at,revoked_at,last_seen_at&limit=1`;
  const sessionsRes = await fetch(sessionsUrl, { headers: serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY) });
  if (!sessionsRes.ok) {
    await audit(env, req, t0, { result: 'interrupted', http_status: 503 });
    return json({ active: false }, 503);
  }
  const sessions = await sessionsRes.json() as SessionRow[];
  const session = sessions?.[0];
  if (!session) {
    await audit(env, req, t0, { result: 'denied', result_reason: 'invalid', http_status: 401 });
    return json({ active: false }, 401);
  }

  // Session expired?
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await audit(env, req, t0, { result: 'denied', result_reason: 'expired', invite_ref: session.invite_id, http_status: 401 });
    return json({ active: false }, 401);
  }

  // Session revoked?
  if (session.revoked_at) {
    await audit(env, req, t0, { result: 'denied', result_reason: 'revoked', invite_ref: session.invite_id, http_status: 401 });
    return json({ active: false }, 401);
  }

  // Look up invite.
  const inviteUrl = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/beta_invites?id=eq.${encodeURIComponent(session.invite_id)}&select=id,status,expires_at,revoked_at&limit=1`;
  const inviteRes = await fetch(inviteUrl, { headers: serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY) });
  if (!inviteRes.ok) {
    await audit(env, req, t0, { result: 'interrupted', invite_ref: session.invite_id, http_status: 503 });
    return json({ active: false }, 503);
  }
  const invites = await inviteRes.json() as InviteRow[];
  const invite = invites?.[0];
  if (!invite) {
    await audit(env, req, t0, { result: 'denied', result_reason: 'revoked', invite_ref: session.invite_id, http_status: 401 });
    return json({ active: false }, 401);
  }

  // Invite revoked?
  if (invite.revoked_at || invite.status === 'revoked') {
    await audit(env, req, t0, { result: 'denied', result_reason: 'revoked', invite_ref: session.invite_id, http_status: 401 });
    return json({ active: false }, 401);
  }

  // Invite expired?
  if (new Date(invite.expires_at).getTime() <= Date.now() || invite.status === 'expired') {
    await audit(env, req, t0, { result: 'denied', result_reason: 'expired', invite_ref: session.invite_id, http_status: 401 });
    return json({ active: false }, 401);
  }

  // Update last_seen_at (best-effort). Never blocks the response.
  fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/beta_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=minimal' },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() })
  }).catch(() => undefined);

  // Success. No session secret returned.
  return json({ active: true }, 200);
}
