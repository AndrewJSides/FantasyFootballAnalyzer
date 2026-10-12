// Shared Supabase service-role client for the league DB endpoints.
// Uses the service-role key, so it bypasses RLS (tables have no public
// policies by design). Never import this from client-side code.

let clientPromise = null;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new Error('Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
      }
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(url, key, { auth: { persistSession: false } });
    })();
  }
  return clientPromise;
}

// Throws a 500 response when the admin key is missing or wrong.
// The admin key lives in ADMIN_SYNC_KEY (Vercel env). Only the league
// owner knows it; PIN holders get read-only access via /api/league-data.
export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_SYNC_KEY;
  if (!expected) {
    res.status(500).json({ error: 'Sync not configured (ADMIN_SYNC_KEY)' });
    return false;
  }
  const provided = req.body?.adminKey || req.headers['x-admin-key'];
  if (provided !== expected) {
    res.status(403).json({ error: 'Invalid admin key' });
    return false;
  }
  return true;
}
