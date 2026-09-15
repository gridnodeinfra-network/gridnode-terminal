import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* GRID//NODE cloud account deletion.
 * verify_jwt = false (we verify the caller's user JWT manually below).
 *
 * POST /functions/v1/delete-account
 *   Authorization: Bearer <the signed-in user's access token>
 * -> verifies the token belongs to a real user, then deletes that user
 *    via the admin API. RLS cascade from auth.users purges all
 *    GRID//NODE rows. The caller can only ever delete themselves.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const userToken = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1]?.trim();
  if (!userToken) return json(req, { error: "Missing auth token" }, 401);

  // Verify the token belongs to a real user (anon client, user-scoped).
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser(userToken);
  if (userError || !user?.id) {
    return json(req, { error: "Invalid auth token" }, 401);
  }

  // Delete that user via the admin API. The caller can only delete
  // themselves: the deleted id always comes from the verified token.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("delete-account failed", deleteError.message);
    return json(req, { error: "Account deletion failed" }, 502);
  }

  return json(req, { deleted: true });
});
