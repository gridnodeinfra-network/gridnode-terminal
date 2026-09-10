import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { verifyRegistrationResponse } from "https://esm.sh/@simplewebauthn/server@10.0.0";
import {
  SUPABASE_URL, SERVICE_ROLE_KEY, RP_ID,
  allowedOrigins, corsHeaders, json, text, verifyChallengeToken, consumeChallenge,
  checkRateLimit, recordAudit, clientInfo,
} from "../_shared/webauthn.ts";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function credentialKeyToBase64Url(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return toBase64Url(value);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, number>);
    const bytes = new Uint8Array(entries.length);
    entries.forEach(([key, byte]) => { bytes[Number(key)] = byte; });
    return toBase64Url(bytes);
  }
  return String(value || "");
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return text("method not allowed", 405);
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!jwt) return text("unauthorized", 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { ip, userAgent } = clientInfo(req);
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return text("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const payload = await verifyChallengeToken(body.challengeToken);
  if (!payload) {
    await recordAudit(admin, { user_id: user.id, event: "register_verify", success: false, error: "bad_challenge_token", ip, user_agent: userAgent });
    return text("bad challenge token", 400);
  }
  if (payload.op !== "register" || payload.userId !== user.id || !payload.exp || payload.exp < Date.now()) {
    await recordAudit(admin, { user_id: user.id, event: "register_verify", success: false, error: "stale_challenge", ip, user_agent: userAgent });
    return text("stale challenge", 400);
  }
  if (!(await checkRateLimit(admin, `register_verify:${user.id}`, 10, 15 * 60 * 1000))) {
    await recordAudit(admin, { user_id: user.id, event: "register_verify", success: false, error: "rate_limited", ip, user_agent: userAgent });
    return text("rate limited", 429);
  }
  let consumed: boolean;
  try {
    consumed = await consumeChallenge(admin, String(body.challengeToken || ""));
  } catch (e) {
    const msg = (e as Error).message;
    await recordAudit(admin, { user_id: user.id, event: "register_verify", success: false, error: msg.slice(0, 200), ip, user_agent: userAgent });
    return text(`challenge consume failed: ${msg}`, 500);
  }
  if (!consumed) {
    await recordAudit(admin, { user_id: user.id, event: "register_verify", success: false, error: "challenge_replay", ip, user_agent: userAgent });
    return text("challenge already used", 400);
  }

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>> | null = null;
  for (const origin of allowedOrigins()) {
    try {
      const attempt = await verifyRegistrationResponse({
        response: body.attResp,
        expectedChallenge: payload.challenge!,
        expectedOrigin: origin,
        expectedRPID: RP_ID,
      });
      if (attempt.verified) { verification = attempt; break; }
    } catch (_) { /* try next allowed origin */ }
  }
  if (!verification?.verified || !verification.registrationInfo) {
    await recordAudit(admin, { user_id: user.id, event: "register_verify", success: false, error: "verification_failed", ip, user_agent: userAgent });
    return text("verification failed", 400);
  }
  const info = verification.registrationInfo;
  const { error: insertError } = await admin.from("webauthn_credentials").insert({
    user_id: user.id,
    credential_id: info.credentialID,
    public_key: credentialKeyToBase64Url(info.credentialPublicKey),
    sign_count: 0,
    device_name: String(body.deviceName || "Unknown device").slice(0, 80),
    transports: Array.isArray(body.attResp?.response?.transports) ? body.attResp.response.transports : [],
    aaguid: info.aaguid ?? null,
    last_used_at: new Date().toISOString(),
  });
  if (insertError) {
    await recordAudit(admin, { user_id: user.id, event: "register_verify", success: false, error: "insert_failed", ip, user_agent: userAgent });
    return text("credential insert failed", 500);
  }
  await recordAudit(admin, { user_id: user.id, event: "register_verify", success: true, credential_id: info.credentialID, ip, user_agent: userAgent });
  return json({ ok: true });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    const response = await handle(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(req))) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error("webauthn-register-verify", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders(req) });
  }
});
