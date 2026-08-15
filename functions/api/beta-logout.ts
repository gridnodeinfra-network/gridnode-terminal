// GRID//NODE ACCESS//GATE — session logout endpoint.
// Cloudflare Pages Function at /api/beta/logout.
//
// Contract:
//   POST /api/beta/logout
//   200 { status: "revoked" } + Set-Cookie: <cookie with Max-Age=0>
//
// Reads the HttpOnly cookie server-side, looks up the session by hash, marks
// it revoked. The invite itself is NOT revoked — this is a user-level logout,
// not an admin-level revocation. The browser cookie is cleared via the
// Set-Cookie header.
//
// No session secret is ever returned.

import {
  BetaEnv,
  buildSessionCookieCleared,
  json,
  readSessionCookie,
  serviceHeaders
} from './_beta-shared';

function encodeHexForBytea(bytes: Uint8Array): string {
  let out = '\\x';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export async function onRequest(context: { request: Request; env: BetaEnv }) {
  const req = context.request;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ status: 'revoked' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Allow: 'POST' }
    });
  }

  const supabaseUrl = String(context.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceRoleKey = String(context.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ status: 'error' }, 503);
  }
  const env: BetaEnv = { SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey, GATE_AUDIT_SECRET: String(context.env.GATE_AUDIT_SECRET || '').trim() };

  const cookieRaw = readSessionCookie(req);
  if (!cookieRaw) {
    // No cookie — still return revoked + clear-cookie so the browser drops it.
    return json({ status: 'revoked' }, 200, { 'Set-Cookie': buildSessionCookieCleared() });
  }

  // Hash the cookie and look up the session.
  const cookieHashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cookieRaw)));
  const cookieHashHex = encodeHexForBytea(cookieHashBytes);

  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/beta_sessions?token_hash=eq.${encodeURIComponent(cookieHashHex)}&select=id&limit=1`;
  const sessionsRes = await fetch(url, { headers: serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY) });
  if (sessionsRes.ok) {
    const sessions = await sessionsRes.json() as Array<{ id: string }>;
    const session = sessions?.[0];
    if (session) {
      await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/beta_sessions?id=eq.${encodeURIComponent(session.id)}`, {
        method: 'PATCH',
        headers: { ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=minimal' },
        body: JSON.stringify({ revoked_at: new Date().toISOString() })
      }).catch(() => undefined);
    }
  }

  return json({ status: 'revoked' }, 200, { 'Set-Cookie': buildSessionCookieCleared() });
}
