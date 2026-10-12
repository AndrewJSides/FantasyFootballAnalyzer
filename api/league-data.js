// GET /api/league-data?pin=XXXXXX — read a league snapshot via its PIN.
// No account needed and no admin key: possession of the PIN is the auth.
// Returns the stored League object as { league, syncedAt }.

import { applyCors } from './_cors.js';
import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: 'GET, OPTIONS' })) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pin = typeof req.query.pin === 'string' ? req.query.pin.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{4,10}$/.test(pin)) {
    return res.status(400).json({ error: 'Invalid PIN format' });
  }

  try {
    const supabase = await getSupabase();
    const { data: pinRow, error: pinErr } = await supabase
      .from('league_pins')
      .select('league_id')
      .eq('pin', pin)
      .single();
    if (pinErr || !pinRow) {
      return res.status(404).json({ error: 'PIN not found' });
    }
    const { data: league, error: leagueErr } = await supabase
      .from('leagues')
      .select('snapshot, name, season, last_synced_at')
      .eq('id', pinRow.league_id)
      .single();
    if (leagueErr || !league) {
      return res.status(404).json({ error: 'League not found' });
    }
    return res.status(200).json({
      league: league.snapshot,
      syncedAt: league.last_synced_at,
    });
  } catch (err) {
    console.error('league-data failed:', err.message);
    return res.status(500).json({ error: 'Failed to load league' });
  }
}
