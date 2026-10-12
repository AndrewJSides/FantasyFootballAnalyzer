// POST /api/league-pin — create (or fetch) the share PIN for a league.
// Admin-only: requires the ADMIN_SYNC_KEY.
// Body: { adminKey: string, leagueKey: string, label?: string }
// Returns: { pin: "A7K2QD" }

import crypto from 'crypto';
import { applyCors } from './_cors.js';
import { getSupabase, requireAdmin } from './_supabase.js';

// Unambiguous alphabet: no 0/O, 1/I/L.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generatePin(length = 6) {
  const bytes = crypto.randomBytes(length);
  let pin = '';
  for (let i = 0; i < length; i++) pin += ALPHABET[bytes[i] % ALPHABET.length];
  return pin;
}

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: 'POST, OPTIONS' })) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const { leagueKey, label } = req.body || {};
  if (!leagueKey || typeof leagueKey !== 'string') {
    return res.status(400).json({ error: 'Missing leagueKey' });
  }

  try {
    const supabase = await getSupabase();
    const { data: league, error: leagueErr } = await supabase
      .from('leagues')
      .select('id, name')
      .eq('platform_league_key', leagueKey)
      .single();
    if (leagueErr || !league) {
      return res.status(404).json({ error: 'League not synced yet — run a sync first' });
    }

    // Reuse the existing PIN if there is one, so re-clicking doesn't
    // invalidate a PIN already shared with the league.
    const { data: existing } = await supabase
      .from('league_pins')
      .select('pin')
      .eq('league_id', league.id)
      .limit(1)
      .single();
    if (existing?.pin) {
      return res.status(200).json({ pin: existing.pin, league: league.name, reused: true });
    }

    let pin = null;
    for (let attempt = 0; attempt < 5 && !pin; attempt++) {
      const candidate = generatePin();
      const { error } = await supabase
        .from('league_pins')
        .insert({ pin: candidate, league_id: league.id, label: label || null });
      if (!error) pin = candidate;
    }
    if (!pin) throw new Error('Could not generate a unique PIN');
    return res.status(200).json({ pin, league: league.name, reused: false });
  } catch (err) {
    console.error('league-pin failed:', err.message);
    return res.status(500).json({ error: 'PIN creation failed' });
  }
}
