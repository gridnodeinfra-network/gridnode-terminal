import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* GRID//NODE NODE KEY gateway.
 * verify_jwt = false (public validate endpoint); all trust comes from
 * HMAC-signed single-use grant tokens + the service-role DB checks below.
 *
 * Actions (JSON body { action, ... }):
 *   validate { code }            -> checks + reserves one use, returns grant token
 *   consume  { grant } + user JWT -> links the key to the caller's account
 *   status   (user JWT)          -> { needsKey } for new-account gating
 *
 * Code canonical form: uppercase, no spaces/dashes, e.g. "NODE7X4K9D".
 * Only SHA-256 hashes are stored (node_keys.code_hash).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Users created before this instant are grandfathered (no key required).
const GATE_SINCE_ISO = "2026-09-15T00:00:00Z";
// Grant tokens live 7 days: covers the email-confirmation gap between
// key validation and first sign-in.
const GRANT_TTL_MS = 7 * 24 * 3600 * 1000;

const ALLOWED_ORIGINS = [
  "https://gridnode.network",
  "https://www.gridnode.network",
  "http://localhost:3000",
  "http://localhost:8080",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8080",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/[a-z0-9-]+\.gridnode\.pages\.dev$/.test(origin);
}

function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
  const origin = req.headers.get("origin");
  if (isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin!;
  return headers;
}

function json(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

async function hmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const secret = SERVICE_ROLE_KEY || ANON_KEY;
  return await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeCode(raw: unknown): string {
  return String(raw || "").toUpperCase().replace(/[\s-]+/g, "");
}

interface GrantPayload { h: string; exp: number; jti: string; }

async function mintGrant(codeHash: string): Promise<{ token: string; jti: string }> {
  const payload: GrantPayload = {
    h: codeHash,
    exp: Date.now() + GRANT_TTL_MS,
    jti: crypto.randomUUID(),
  };
  const payloadText = JSON.stringify(payload);
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payloadText));
  const b64 = (buf: ArrayBuffer | string) => btoa(
    typeof buf === "string" ? buf : String.fromCharCode(...new Uint8Array(buf)),
  );
  return { token: `${b64(payloadText)}.${b64(sig)}`, jti: payload.jti };
}

async function verifyGrant(token: string): Promise<GrantPayload | null> {
  const [payloadB64, sigB64] = String(token || "").split(".");
  if (!payloadB64 || !sigB64) return null;
  try {
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    const payloadText = atob(payloadB64);
    const ok = await crypto.subtle.verify(
      "HMAC", await hmacKey(), sig, new TextEncoder().encode(payloadText),
    );
    if (!ok) return null;
    const payload = JSON.parse(payloadText) as GrantPayload;
    if (!payload.h || !payload.exp || !payload.jti) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0]?.trim() || "unknown";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { ok: false, reason: "METHOD" }, 405);

  const rpc = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { ok: false, reason: "BAD_JSON" }, 400);
  }
  const action = String(body.action || "");

  // ---- validate: public, rate-limited, reserves one use atomically ----
  if (action === "validate") {
    const { data: allowed } = await rpc.rpc("node_key_rate_limit_check", {
      p_bucket: `nodekey:${clientIp(req)}`, p_max: 20, p_window_ms: 10 * 60 * 1000,
    });
    if (allowed !== true) return json(req, { ok: false, reason: "RATE_LIMITED" }, 429);

    const code = normalizeCode(body.code);
    if (!/^NODE[A-Z0-9]{6}$/.test(code)) {
      return json(req, { ok: false, reason: "INVALID" });
    }
    const codeHash = await sha256Hex(code);
    const { data, error } = await rpc.rpc("node_key_redeem", { p_code_hash: codeHash });
    if (error) {
      console.error("[redeem-node-key] redeem rpc failed", error.message);
      return json(req, { ok: false, reason: "SERVER" }, 500);
    }
    const result = data as { ok: boolean; reason: string };
    if (!result?.ok) return json(req, { ok: false, reason: result?.reason || "INVALID" });

    const { token, jti } = await mintGrant(codeHash);
    const { data: stored, error: grantErr } = await rpc.rpc("node_key_store_grant", {
      p_jti: jti, p_code_hash: codeHash,
    });
    if (grantErr || stored !== true) {
      console.error("[redeem-node-key] grant store failed", grantErr?.message);
      return json(req, { ok: false, reason: "SERVER" }, 500);
    }
    return json(req, { ok: true, grant: token });
  }

  // ---- authenticated actions ----
  const userJwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!userJwt) return json(req, { ok: false, reason: "AUTH" }, 401);
  const { data: userData, error: userErr } = await authClient.auth.getUser(userJwt);
  const user = userData?.user;
  if (userErr || !user) return json(req, { ok: false, reason: "AUTH" }, 401);

  // ---- status: does this account still need a key? ----
  if (action === "status") {
    const { data: needsKey, error: statusErr } = await rpc.rpc("node_key_status", {
      p_user_id: user.id,
      p_created_at: user.created_at,
      p_gate_since: GATE_SINCE_ISO,
    });
    if (statusErr) {
      console.error("[redeem-node-key] status failed", statusErr.message);
      return json(req, { ok: false, reason: "SERVER" }, 500);
    }
    return json(req, { ok: true, needsKey: needsKey === true });
  }

  // ---- consume: single-use grant -> redemption row ----
  if (action === "consume") {
    const grant = await verifyGrant(String(body.grant || ""));
    if (!grant) return json(req, { ok: false, reason: "BAD_GRANT" }, 400);

    const { data: claim, error: claimErr } = await rpc.rpc("node_key_claim_grant", {
      p_jti: grant.jti, p_user_id: user.id,
    });
    if (claimErr || !claim?.ok) {
      if (!claimErr) return json(req, { ok: false, reason: claim.reason || "GRANT_USED" }, 400);
      console.error("[redeem-node-key] grant claim failed", claimErr.message);
      return json(req, { ok: false, reason: "SERVER" }, 500);
    }
    if (claim.code_hash !== grant.h) {
      return json(req, { ok: false, reason: "GRANT_MISMATCH" }, 400);
    }
    const { error: redErr } = await rpc.rpc("node_key_redeem_grant", {
      p_code_hash: grant.h, p_user_id: user.id,
    });
    if (redErr) {
      console.error("[redeem-node-key] redemption insert failed", redErr.message);
      return json(req, { ok: false, reason: "SERVER" }, 500);
    }
    return json(req, { ok: true });
  }

  return json(req, { ok: false, reason: "UNKNOWN_ACTION" }, 400);
});
