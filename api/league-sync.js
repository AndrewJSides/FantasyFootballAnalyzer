// POST /api/league-sync — store (or refresh) a league snapshot in Supabase.
// Admin-only: requires the ADMIN_SYNC_KEY. The client does the Yahoo OAuth
// and platform parsing itself (it already has that code); the server just
// validates and upserts the normalized League object.
//
// Body: { adminKey: string, league: League }
// The League's `id` is the platform league key (e.g. Yahoo "461.l.12345").
// Strips client-only volatile fields before storing.

import { applyCors } from './_cors.js';
import { getSupabase, requireAdmin } from './_supabase.js';

// Never persist these: they describe this browser session, not the league.
const STRIP_KEYS = new Set(['viaPin', 'isGuest', 'loadIncomplete', 'loadedAt']);

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: 'POST, OPTIONS' })) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const { league } = req.body || {};
  if (!league || typeof league !== 'object' || !league.id || !league.name) {
    return res.status(400).json({ error: 'Missing or invalid league payload' });
  }
  const platform = ['sleeper', 'espn', 'yahoo'].includes(league.platform) ? league.platform : 'yahoo';

  const snapshot = { ...league };
  for (const k of STRIP_KEYS) delete snapshot[k];
  snapshot.isLoaded = true;

  try {
    const supabase = await getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('leagues')
      .upsert(
        {
          platform,
          platform_league_key: String(league.id),
          name: String(league.name),
          season: Number(league.season) || new Date().getFullYear(),
          team_count: Array.isArray(league.teams) ? league.teams.length : null,
          snapshot,
          updated_at: now,
          last_synced_at: now,
        },
        { onConflict: 'platform_league_key' }
      )
      .select('id, name, season')
      .single();
    if (error) throw error;
    return res.status(200).json({ ok: true, league: data });
  } catch (err) {
    console.error('league-sync failed:', err.message);
    return res.status(500).json({ error: 'Sync failed' });
  }
}
