// GRID//NODE ACCESS//GATE — shared types and helpers used by:
//   - functions/api/beta-access.ts
//   - functions/api/beta-session.ts
//   - functions/api/beta-logout.ts
//   - dev/admin.cjs (CLI; references the same algorithm by literal copy)
//
// IMPORTANT: any change here must be reflected in dev/admin.cjs's inline copy
// of the hash function (the CLI runs OUTSIDE the Pages Function runtime).

export interface BetaEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GATE_AUDIT_SECRET: string;  // HMAC key for code hashing + invite_ref derivation
}

// Code format: NODE-XXXX-XXXX (4+4 = 8 alphanumeric chars in two groups).
// Total entropy: 8 chars * 31 (alphanumeric minus O/0/I/1) = 8 * log2(31) ≈ 39.7 bits.
// That is enough for a closed beta of ~20 testers (any duplicate is rejected at
// insertion), AND for resisting single-use online guessing up to rate-limit
// thresholds. The API + admin never log raw codes; only the HMAC hash lives.
export const CODE_FORMAT = /^NODE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 31 chars; excludes O/0/I/1
export const COOKIE_NAME = '__Host-gridnode-beta';
export const TTL_SECONDS = 24 * 60 * 60; // 24h closed-beta session

// normalize + validate
export function normalizeCode(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  // Uppercase already done. Strip whitespace and common separators.
  const stripped = trimmed.replace(/[\s\-_]/g, '-');
  if (!CODE_FORMAT.test(stripped)) return null;
  return stripped;
}

// HMAC-SHA256 keyed digest. Server-side only. The GATE_AUDIT_SECRET is the key.
export async function hashCode(code: string, secret: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', key, enc.encode(code));
}

// Helper to fetch one active invite by raw code. The DB stores HMAC(code, secret).
// We can't SELECT by hash equality cheaply (index on bytea is fine), but we
// also can't SELECT by code equality because the raw code isn't stored. So we
// fetch active candidates and verify locally. For a closed-beta scale (~20 codes),
// this is fine; if the test set grows, add an index on the truncated hash.
export async function fetchActiveInvites(
  env: BetaEnv,
  supabaseFetch: typeof fetch
): Promise<Array<{
  id: string;
  code_hash: string; // hex-encoded bytea
  status: string;
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked_at: string | null;
}>> {
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/beta_invites?status=eq.active&select=id,code_hash,status,uses,max_uses,expires_at,revoked_at&order=created_at.desc&limit=500`;
  const res = await supabaseFetch(url, {
    method: 'GET',
    headers: serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY)
  });
  if (!res.ok) return [];
  const rows = await res.json() as Array<any>;
  const now = Date.now();
  // Strict: only active, not-revoked, not-expired.
  return (rows || []).filter((r) => {
    if (r.status !== 'active') return false;
    if (r.revoked_at) return false;
    if (new Date(r.expires_at).getTime() <= now) return false;
    return true;
  });
}

// Constant-time comparison of ArrayBuffers.
export function timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  if (av.length !== bv.length) return false;
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

// Bytes to hex
export function bytesToHex(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  return Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Hex to bytes
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Generate a random opaque-id for the session cookie. 32 bytes = 64 hex chars.
export function randomOpaqueId(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return bytesToHex(buf.buffer);
}

// HMAC-SHA256 of a string (for invite_ref / ip_hash).
export async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bytesToHex(sig);
}

export function serviceHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

export const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export function json(body: Record<string, unknown>, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

// Build the session cookie. __Host- prefix requires Secure + Path=/ + no Domain.
export function buildSessionCookie(opaqueId: string, ttl: number): string {
  return [
    `${COOKIE_NAME}=${opaqueId}`,
    'Path=/',
    'Secure',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${ttl}`
  ].join('; ');
}

// Build the cookie-clearing Set-Cookie for logout.
export function buildSessionCookieCleared(): string {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Secure',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0'
  ].join('; ');
}

// Coarse classification only. Never fingerprint. Never store full UA.
export function classifyUserAgent(ua: string): { user_agent_class: 'mobile' | 'desktop' | 'bot'; device_class: 'touch' | 'pointer' | 'unknown' } {
  const lower = (ua || '').toLowerCase();
  const isBot = /bot|crawler|spider|preview|monitor/i.test(lower);
  if (isBot) return { user_agent_class: 'bot', device_class: 'unknown' };
  const isMobile = /mobile|iphone|ipad|ipod|android.*mobile|windows phone/i.test(lower);
  return {
    user_agent_class: isMobile ? 'mobile' : 'desktop',
    device_class: isMobile ? 'touch' : 'pointer'
  };
}

// IP normalization: /24 for v4, /48 for v6.
export function normalizeIp(ip: string): string {
  if (!ip) return '';
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 3).join(':') + '::/48';
  }
  const parts = ip.split('.');
  return parts.slice(0, 3).join('.') + '.0/24';
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
      || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || '0.0.0.0';
}

export function coarseCountry(req: Request): string {
  return (req.headers.get('cf-ipcountry') || '').toUpperCase();
}

// Read the cookie and return the raw opaque-id, or null if not present.
export function readSessionCookie(req: Request): string | null {
  const cookie = req.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE_NAME) return v || null;
  }
  return null;
}
