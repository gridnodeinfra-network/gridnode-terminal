interface DeleteAccountEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface SupabaseUser {
  id?: string;
}

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function serviceHeaders(serviceRoleKey: string) {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal'
  };
}

export async function onRequest(context: { request: Request; env: DeleteAccountEnv }) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...jsonHeaders, Allow: 'POST' }
    });
  }

  const serviceRoleKey = String(context.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const supabaseUrl = String(context.env.SUPABASE_URL || '').replace(/\/+$/, '');
  // This branch is exclusively for the isolated QA backend.
  if (supabaseUrl !== 'https://aqzhtxeehdurpdqplhvt.supabase.co') {
    return json({ error: 'QA backend configuration required' }, 503);
  }
  if (!serviceRoleKey || !supabaseUrl) return json({ error: 'Account deletion is not configured' }, 503);

  const authHeader = context.request.headers.get('Authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const userToken = tokenMatch?.[1]?.trim();
  if (!userToken) return json({ error: 'Missing auth token' }, 401);

  let user: SupabaseUser;
  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
        apikey: serviceRoleKey
      }
    });
    if (!userResponse.ok) return json({ error: 'Invalid auth token' }, 401);
    user = await userResponse.json() as SupabaseUser;
  } catch {
    return json({ error: 'Account verification failed' }, 502);
  }

  const userId = String(user.id || '').trim();
  if (!userId) return json({ error: 'Account identity unavailable' }, 401);

  // The current schema uses on delete cascade from auth.users to every GRID//NODE table.
  // Deleting the authenticated user is therefore the single authoritative data purge.
  try {
    const deleteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: serviceHeaders(serviceRoleKey)
    });
    if (!deleteResponse.ok) return json({ error: 'Account deletion failed' }, 502);
  } catch {
    return json({ error: 'Account deletion failed' }, 502);
  }

  return json({ deleted: true });
}

export const onRequestPost = onRequest;
