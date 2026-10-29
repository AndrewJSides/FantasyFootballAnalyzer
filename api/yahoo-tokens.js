// POST /api/yahoo-tokens — register a browser's device id and store the
// Yahoo OAuth tokens server-side (one login lights up every device).
//
// Body: { device_id, yahoo_guid, access_token, refresh_token, expires_in }
// The browser calls this once, right after the OAuth callback lands, while
// it still holds the fresh tokens. Tokens are never logged.
import { applyCors } from './_cors.js';
import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: 'POST, OPTIONS' })) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { device_id, yahoo_guid, access_token, refresh_token, expires_in } = body;

  if (
    typeof device_id !== 'string' || device_id.length === 0 || device_id.length > 128 ||
    typeof yahoo_guid !== 'string' || yahoo_guid.length === 0 || yahoo_guid.length > 128 ||
    typeof access_token !== 'string' || access_token.length === 0 ||
    typeof refresh_token !== 'string' || refresh_token.length === 0 ||
    typeof expires_in !== 'number' || !(expires_in > 0)
  ) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  try {
    const supabase = await getSupabase();
    const now = new Date().toISOString();

    const { error: connError } = await supabase
      .from('yahoo_connections')
      .upsert(
        {
          yahoo_guid,
          access_token,
          refresh_token,
          expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
          updated_at: now,
        },
        { onConflict: 'yahoo_guid' }
      );
    if (connError) {
      console.error('yahoo-tokens: connection upsert failed:', connError.message);
      return res.status(500).json({ error: 'Failed to store tokens' });
    }

    const { error: deviceError } = await supabase
      .from('yahoo_devices')
      .upsert(
        { device_id, yahoo_guid, pairing_code: null, pairing_expires: null },
        { onConflict: 'device_id' }
      );
    if (deviceError) {
      console.error('yahoo-tokens: device link failed:', deviceError.message);
      return res.status(500).json({ error: 'Failed to link device' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('yahoo-tokens error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
