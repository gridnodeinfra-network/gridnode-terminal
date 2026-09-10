import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { verifyAuthenticationResponse } from "https://esm.sh/@simplewebauthn/server@10.0.0";
import {
  SUPABASE_URL, SERVICE_ROLE_KEY, RP_ID,
  allowedOrigins, corsHeaders, json, text, verifyChallengeToken, consumeChallenge,
  checkRateLimit, recordAudit, clientInfo, mintSessionTokens,
  base64UrlToBytes,
} from "../_shared/webauthn.ts";

function parseCoseEc2(raw: Uint8Array): Record<string, Uint8Array | number> {
  const out: Record<string, Uint8Array | number> = {};
  if (!raw.length) return out;
  const first = raw[0];
  if ((first & 0xe0) !== 0xa0) return out;
  const mapCount = first & 0x1f;
  let pos = 1;
  const readInt = (): number => {
    const b = raw[pos++];
    if (b <= 0x17) return b;
    if (b >= 0x20 && b <= 0x37) return -1 - (b - 0x20);
    if (b === 0x38 && pos < raw.length) return -1 - raw[pos++];
    return b;
  };
  for (let index = 0; index < mapCount && pos < raw.length; index += 1) {
    const key = readInt();
    const type = raw[pos++];
    if (type === 0x58 && pos < raw.length) {
      const len = raw[pos++];
      const value = raw.slice(pos, Math.min(raw.length, pos + len));
      pos += len;
      out[String(key)] = value;
    } else if (type <= 0x17) {
      out[String(key)] = type;
    } else if (type >= 0x20 && type <= 0x37) {
      out[String(key)] = -1 - (type - 0x20);
    } else if (type === 0x38 && pos < raw.length) {
      out[String(key)] = -1 - raw[pos++];
    } else {
      pos += 1;
    }
  }
  return out;
}

async function manualVerifyFallback(body: any, payload: any, credentialRow: any, rpId: string): Promise<{ verified: boolean; newCounter: number } | null> {
  try {
    const authResp = body.authResp || {};
    const adB64 = String(authResp.response?.authenticatorData || "").replace(/-/g, "+").replace(/_/g, "/");
    const sigB64 = String(authResp.response?.signature || "").replace(/-/g, "+").replace(/_/g, "/");
    const cdjB64 = String(authResp.response?.clientDataJSON || "").replace(/-/g, "+").replace(/_/g, "/");
    if (!adB64 || !sigB64 || !cdjB64) return null;
    const adRaw = Uint8Array.from(atob(adB64), (c) => c.charCodeAt(0));
    const sigRaw = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    const clientDataJSON = atob(cdjB64);
    const clientData = JSON.parse(clientDataJSON);
    const allowed = allowedOrigins();
    if (!allowed.includes(clientData.origin)) return null;
    if (clientData.challenge !== payload.challenge) return null;
    const rpIdHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId)));
    for (let index = 0; index < 32; index += 1) {
      if (adRaw[index] !== rpIdHash[index]) return null;
    }
    const flags = adRaw[32];
    if ((flags & 0x01) === 0) return null;
    const counter = ((adRaw[33] << 24) | (adRaw[34] << 16) | (adRaw[35] << 8) | adRaw[36]) >>> 0;
    const cdHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientDataJSON)));
    const data = new Uint8Array(adRaw.length + cdHash.length);
    data.set(adRaw, 0);
    data.set(cdHash, adRaw.length);
    const keyBytes = Uint8Array.from(atob(String(credentialRow.public_key || "").replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const cose = parseCoseEc2(keyBytes);
    const pick = (keys: string[]): Uint8Array | undefined => {
      for (const key of keys) {
        const value = cose[key];
        if (value instanceof Uint8Array) return value;
      }
      return undefined;
    };
    let xBytes = pick(["-2", "62"]);
    let yBytes = pick(["-3", "61"]);
    if (!xBytes || xBytes.length !== 32) return null;
    const kty = Number(cose["1"] ?? 0);
    const crv = Number(cose["-1"] ?? 0);
    const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (kty === 1 && crv === 6) {
      const edKey = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: toB64(xBytes) }, { name: "Ed25519" }, false, ["verify"]);
      if (await crypto.subtle.verify({ name: "Ed25519" }, edKey, sigRaw, data)) {
        return { verified: true, newCounter: counter };
      }
      return null;
    }
    if (!yBytes) {
      const p = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
      const b = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
      const modPow = (base: bigint, exp: bigint): bigint => {
        let result = 1n;
        let b2 = base % p;
        let e = exp;
        while (e > 0n) { if (e & 1n) result = (result * b2) % p; b2 = (b2 * b2) % p; e >>= 1n; }
        return result;
      };
      const x = BigInt("0x" + [...xBytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
      const rhs = (modPow(x, 3n) + (p - 3n) * x + b) % p;
      const y = modPow(rhs, (p + 1n) / 4n);
      if ((y * y) % p !== rhs) return null;
      const yBytes1 = new Uint8Array(32);
      let yv = y;
      for (let index = 31; index >= 0; index -= 1) { yBytes1[index] = Number(yv & 0xffn); yv >>= 8n; }
      const yBytes2 = new Uint8Array(32);
      let yv2 = (p - y) % p;
      for (let index = 31; index >= 0; index -= 1) { yBytes2[index] = Number(yv2 & 0xffn); yv2 >>= 8n; }
      const candidates = [yBytes1, yBytes2];
      for (const candidate of candidates) {
        const jwk = { kty: "EC", crv: "P-256", x: toB64(xBytes), y: toB64(candidate) };
        const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        if (await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sigRaw, data)) {
          return { verified: true, newCounter: counter };
        }
      }
      return null;
    }
    if (yBytes.length !== 32) return null;
    const jwk = { kty: "EC", crv: "P-256", x: toB64(xBytes), y: toB64(yBytes) };
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    if (await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sigRaw, data)) {
      return { verified: true, newCounter: counter };
    }
    return null;
  } catch (_) {
    return null;
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return text("method not allowed", 405);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const sessionClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { ip, userAgent } = clientInfo(req);
  const body = await req.json().catch(() => ({}));

  const payload = await verifyChallengeToken(body.challengeToken);
  if (!payload) {
    await recordAudit(admin, { event: "authenticate_verify", success: false, error: "bad_challenge_token", ip, user_agent: userAgent });
    return text("bad challenge token", 400);
  }
  if (payload.op !== "authenticate" || !payload.exp || payload.exp < Date.now()) {
    await recordAudit(admin, { event: "authenticate_verify", success: false, error: "stale_challenge", ip, user_agent: userAgent });
    return text("stale challenge", 400);
  }
  if (!(await checkRateLimit(admin, `authn_verify:${ip}`, 15, 15 * 60 * 1000))) {
    await recordAudit(admin, { event: "authenticate_verify", success: false, error: "rate_limited", ip, user_agent: userAgent });
    return text("rate limited", 429);
  }
  let consumed: boolean;
  try {
    consumed = await consumeChallenge(admin, String(body.challengeToken || ""));
  } catch (e) {
    const msg = (e as Error).message;
    await recordAudit(admin, { event: "authenticate_verify", success: false, error: msg.slice(0, 200), ip, user_agent: userAgent });
    return text(`challenge consume failed: ${msg}`, 500);
  }
  if (!consumed) {
    await recordAudit(admin, { event: "authenticate_verify", success: false, error: "challenge_replay", ip, user_agent: userAgent });
    return text("challenge already used", 400);
  }

  const credentialId = String(body.authResp?.id || "");
  const { data: credentialRow } = await admin.from("webauthn_credentials")
    .select("id, user_id, credential_id, public_key, sign_count, transports, revoked_at")
    .eq("credential_id", credentialId)
    .is("revoked_at", null)
    .single();
  if (!credentialRow) {
    await recordAudit(admin, { event: "authenticate_verify", credential_id: credentialId, success: false, error: "unknown_credential", ip, user_agent: userAgent });
    return text("unknown credential", 404);
  }
  // The challenge token's user binding must match the credential's owner.
  if (payload.userId && credentialRow.user_id !== payload.userId) {
    await recordAudit(admin, { user_id: credentialRow.user_id, event: "authenticate_verify", credential_id: credentialId, success: false, error: "user_mismatch", ip, user_agent: userAgent });
    return text("verification failed", 400);
  }
  const { data: { user } } = await admin.auth.admin.getUserById(credentialRow.user_id);
  if (!user) {
    await recordAudit(admin, { event: "authenticate_verify", credential_id: credentialId, success: false, error: "unknown_user", ip, user_agent: userAgent });
    return text("unknown user", 404);
  }
  if (!user.email_confirmed_at && !user.confirmed_at) {
    await recordAudit(admin, { user_id: user.id, event: "authenticate_verify", credential_id: credentialId, success: false, error: "email_not_confirmed", ip, user_agent: userAgent });
    return text("email not confirmed", 403);
  }

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>> | null = null;
  for (const origin of allowedOrigins()) {
    try {
      const attempt = await verifyAuthenticationResponse({
        response: body.authResp,
        expectedChallenge: payload.challenge!,
        expectedOrigin: origin,
        expectedRPID: RP_ID,
        authenticator: {
          credentialID: credentialRow.credential_id,
          credentialPublicKey: base64UrlToBytes(credentialRow.public_key),
          counter: Number(credentialRow.sign_count),
          transports: Array.isArray(credentialRow.transports) ? credentialRow.transports : [],
        },
      });
      if (attempt.verified) { verification = attempt; break; }
    } catch (_) { /* try next allowed origin */ }
  }
  if (!verification?.verified) {
    await recordAudit(admin, { user_id: user.id, event: "authenticate_verify", credential_id: credentialId, success: false, error: "verification_failed", ip, user_agent: userAgent });
    return text("verification failed", 400);
  }

  const { error: counterError } = await admin.from("webauthn_credentials")
    .update({ sign_count: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq("id", credentialRow.id);
  if (counterError) {
    await recordAudit(admin, { user_id: user.id, event: "authenticate_verify", credential_id: credentialId, success: false, error: "counter_update_failed", ip, user_agent: userAgent });
    return text("credential update unavailable", 500);
  }

  const tokens = await mintSessionTokens(admin, sessionClient, user.email!);
  if (!tokens) {
    await recordAudit(admin, { user_id: user.id, event: "authenticate_verify", credential_id: credentialId, success: false, error: "session_unavailable", ip, user_agent: userAgent });
    return text("session unavailable", 500);
  }
  const audited = await recordAudit(admin, { user_id: user.id, event: "authenticate_verify", credential_id: credentialId, success: true, ip, user_agent: userAgent });
  if (!audited) return text("audit unavailable", 500);
  return json(tokens);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    const response = await handle(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(req))) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error("webauthn-authenticate-verify", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders(req) });
  }
});
