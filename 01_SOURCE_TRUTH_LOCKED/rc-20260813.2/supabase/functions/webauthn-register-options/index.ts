import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { generateRegistrationOptions } from "https://esm.sh/@simplewebauthn/server@10.0.0";
import {
  SUPABASE_URL, SERVICE_ROLE_KEY, RP_ID, RP_NAME,
  corsHeaders, json, text, signChallenge, storeChallenge,
  checkRateLimit, recordAudit, clientInfo,
} from "../_shared/webauthn.ts";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return text("method not allowed", 405);
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!jwt) return text("unauthorized", 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { ip, userAgent } = clientInfo(req);
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return text("unauthorized", 401);

  if (!(await checkRateLimit(admin, `register_options:${user.id}`, 10, 15 * 60 * 1000))) {
    await recordAudit(admin, { user_id: user.id, event: "register_options", success: false, error: "rate_limited", ip, user_agent: userAgent });
    return text("rate limited", 429);
  }
  const { data: existing } = await admin.from("webauthn_credentials")
    .select("credential_id")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  const options = await generateRegistrationOptions({
    rpID: RP_ID,
    rpName: RP_NAME,
    userName: user.email ?? user.id,
    userID: new TextEncoder().encode(user.id),
    excludeCredentials: (existing ?? []).map((row: { credential_id: string }) => ({ id: row.credential_id, type: "public-key" })),
    authenticatorSelection: { userVerification: "preferred" },
    attestationType: "none",
  });
  const challengeToken = await signChallenge(options.challenge, user.id, "register");
  await storeChallenge(admin, challengeToken, user.id, "register");
  await recordAudit(admin, { user_id: user.id, event: "register_options", success: true, ip, user_agent: userAgent });
  const userId = typeof options.user.id === "string" ? options.user.id : toBase64Url(options.user.id);
  return json({
    rp: options.rp,
    user: { ...options.user, id: userId },
    challenge: options.challenge,
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    excludeCredentials: options.excludeCredentials,
    authenticatorSelection: options.authenticatorSelection,
    attestation: options.attestation,
    challengeToken,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    const response = await handle(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(req))) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error("webauthn-register-options", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders(req) });
  }
});
