// GRID//NODE WebAuthn shared security helpers.
// Used by all four passkey edge functions so CORS, challenge signing,
// single-use challenges, rate limiting, and audit rules stay in one place.

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const RP_ID = Deno.env.get("WEBAUTHN_RP_ID")!;
export const RP_NAME = Deno.env.get("WEBAUTHN_RP_NAME") ?? "GRID//NODE";
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function allowedOrigins(): string[] {
  const rp = `https://${RP_ID}`;
  const extra = Deno.env.get("WEBAUTHN_EXPECTED_ORIGINS") || "";
  return [rp, ...extra.split(",").map((item) => item.trim()).filter(Boolean)];
}

// Production origin, GRID//NODE Cloudflare Pages preview subdomains, and local dev are
// allowed; anything else gets no CORS headers.
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins().includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.gridnode\.pages\.dev$/.test(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export function text(message: string, status: number): Response {
  return new Response(message, { status });
}

async function hmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey("raw", enc.encode(SERVICE_ROLE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export interface ChallengePayload {
  challenge?: string;
  userId?: string | null;
  op?: string;
  exp?: number;
  jti?: string;
}

export async function signChallenge(challenge: string, userId: string | null, op: string): Promise<string> {
  const payload = JSON.stringify({ challenge, userId, op, exp: Date.now() + CHALLENGE_TTL_MS, jti: crypto.randomUUID() });
  const enc = new TextEncoder();
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(payload) + "." + btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function verifyChallengeToken(token: string | undefined | null): Promise<ChallengePayload | null> {
  const [payloadB64, sigB64] = String(token || "").split(".");
  if (!payloadB64 || !sigB64) return null;
  const enc = new TextEncoder();
  const key = await hmacKey();
  const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
  const payloadText = atob(payloadB64);
  const ok = await crypto.subtle.verify("HMAC", key, sig, enc.encode(payloadText));
  if (!ok) return null;
  try {
    const payload = JSON.parse(payloadText) as ChallengePayload;
    return payload.op && payload.challenge && payload.exp && payload.jti ? payload : null;
  } catch {
    return null;
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ClientInfo {
  ip: string;
  userAgent: string;
}

export function clientInfo(req: Request): ClientInfo {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  const userAgent = String(req.headers.get("user-agent") || "").slice(0, 200);
  return { ip, userAgent };
}

export async function storeChallenge(admin: any, token: string, userId: string | null, op: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  // NOTE (2026-09-10): supabase-js never throws for PostgREST errors; insert()
  // resolves to { data, error }. Swallowing the error here mints a challenge
  // token that can never verify, which surfaces later as the misleading
  // "challenge already used". Fail loudly so the real cause is visible.
  const { error } = await admin.from("webauthn_challenges").insert({ token_hash: tokenHash, user_id: userId, op });
  if (error) throw new Error(`challenge_store_failed: ${error.message ?? String(error)}`);
}

// Atomically claims a challenge (single-use). Returns false on replay/unknown.
// Throws on database errors so infra failures are never misreported as replays.
export async function consumeChallenge(admin: any, token: string): Promise<boolean> {
  const tokenHash = await sha256Hex(token);
  const { data, error } = await admin.from("webauthn_challenges")
    .delete()
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .select("token_hash")
    .maybeSingle();
  if (error) throw new Error(`challenge_consume_failed: ${error.message ?? String(error)}`);
  return Boolean(data);
}

// Atomic rate limit via the webauthn_rate_limit_check RPC. Returns true = allowed.
// Authentication throttling fails closed. Other sign-in methods remain available
// if the rate-limit store is temporarily unavailable.
export async function checkRateLimit(admin: any, bucket: string, max: number, windowMs: number): Promise<boolean> {
  const { data, error } = await admin.rpc("webauthn_rate_limit_check", { bucket, max_count: max, window_ms: windowMs });
  if (error) {
    console.warn("[webauthn] rateLimit", error);
    return false;
  }
  return data === true;
}

export async function recordAudit(admin: any, entry: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await admin.from("webauthn_audit_log").insert(entry);
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("[webauthn] audit", error);
    return false;
  }
}

// Mints a session from the user's existing credentials WITHOUT ever touching
// their password. Returns null when the magiclink path cannot yield tokens
// (caller should refuse rather than reset the password).
export async function mintSessionTokens(admin: any, sessionClient: any, email: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) return null;
  const verificationType = linkData.properties.verification_type === "email" ? "email" : "magiclink";
  // Exchange on a separate client: verifyOtp mutates that client's auth state.
  // The service-role client must remain service-scoped for counter/audit writes.
  const { data: verified, error: verifyError } = await sessionClient.auth.verifyOtp({ token_hash: tokenHash, type: verificationType });
  const access_token = verified?.session?.access_token;
  const refresh_token = verified?.session?.refresh_token;
  if (verifyError) return null;
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}
