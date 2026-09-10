import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { generateAuthenticationOptions } from "https://esm.sh/@simplewebauthn/server@10.0.0";
import {
  SUPABASE_URL, SERVICE_ROLE_KEY, RP_ID,
  corsHeaders, json, text, signChallenge, storeChallenge,
  checkRateLimit, recordAudit, clientInfo,
} from "../_shared/webauthn.ts";

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return text("method not allowed", 405);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { ip, userAgent } = clientInfo(req);
  const body = await req.json().catch(() => ({}));

  // Email is required: we never enumerate credentials across the whole project.
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return text("email required", 400);
  if (!(await checkRateLimit(admin, `authn_options:${email}`, 20, 15 * 60 * 1000))) {
    await recordAudit(admin, { event: "authenticate_options", success: false, error: "rate_limited", ip, user_agent: userAgent });
    return text("rate limited", 429);
  }

  // Resolve the account by email via the GoTrue admin endpoint (scoped, no global enumeration).
  const adminResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
    headers: { "apikey": SERVICE_ROLE_KEY, "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
  });
  const adminBody = await adminResponse.json().catch(() => ({}));
  const user = Array.isArray(adminBody.users) ? adminBody.users[0] : null;
  if (!user || String(user.email || "").toLowerCase() !== email) {
    await recordAudit(admin, { event: "authenticate_options", success: false, error: "no_user", ip, user_agent: userAgent });
    return text("no passkey registered", 404);
  }
  const { data: credentials } = await admin.from("webauthn_credentials")
    .select("credential_id")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (!credentials?.length) {
    await recordAudit(admin, { user_id: user.id, event: "authenticate_options", success: false, error: "no_passkeys", ip, user_agent: userAgent });
    return text("no passkey registered", 404);
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: credentials.map((row: { credential_id: string }) => ({ id: row.credential_id, type: "public-key" })),
    userVerification: "preferred",
  });
  const challengeToken = await signChallenge(options.challenge, user.id, "authenticate");
  try {
    await storeChallenge(admin, challengeToken, user.id, "authenticate");
  } catch (e) {
    const msg = (e as Error).message;
    await recordAudit(admin, { user_id: user.id, event: "authenticate_options", success: false, error: msg.slice(0, 200), ip, user_agent: userAgent });
    return text(`challenge store failed: ${msg}`, 500);
  }
  await recordAudit(admin, { user_id: user.id, event: "authenticate_options", success: true, ip, user_agent: userAgent });
  return json({ ...options, challengeToken });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    const response = await handle(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(req))) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error("webauthn-authenticate-options", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders(req) });
  }
});
