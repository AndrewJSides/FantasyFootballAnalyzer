// POST /api/yahoo-pair — link a new device to the Yahoo account connected
// on another device, via a short pairing code.
//
// Actions:
//   { action: 'create', device_id }          -> { code, expires_in } (device
//      must already be linked; code is single-use, 10-minute expiry)
//   { action: 'claim', device_id, code }     -> { ok: true } (links the new
//      device to the same Yahoo account; the code is consumed)
//   { action: 'unlink', device_id }          -> { ok: true } (this browser
//      signs out; other linked devices keep working)
import { applyCors } from './_cors.js';
import { getSupabase } from './_supabase.js';
import { generatePairingCode } from './_yahoo-server.js';

const CODE_TTL_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: 'POST, OPTIONS' })) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { action, device_id, code } = body;

  if (typeof device_id !== 'string' || device_id.length === 0 || device_id.length > 128) {
    return res.status(400).json({ error: 'Missing device_id' });
  }

  try {
    const supabase = await getSupabase();

    if (action === 'create') {
      const { data: device } = await supabase
        .from('yahoo_devices')
        .select('yahoo_guid')
        .eq('device_id', device_id)
        .maybeSingle();
      if (!device || !device.yahoo_guid) {
        return res.status(401).json({ error: 'device_not_linked' });
      }
      const pairingCode = generatePairingCode();
      const { error } = await supabase
        .from('yahoo_devices')
        .update({
          pairing_code: pairingCode,
          pairing_expires: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        })
        .eq('device_id', device_id);
      if (error) {
        console.error('yahoo-pair: code store failed:', error.message);
        return res.status(500).json({ error: 'Failed to create code' });
      }
      return res.status(200).json({ code: pairingCode, expires_in: CODE_TTL_MS / 1000 });
    }

    if (action === 'claim') {
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'Invalid code' });
      }
      const { data: host } = await supabase
        .from('yahoo_devices')
        .select('device_id, yahoo_guid, pairing_expires')
        .eq('pairing_code', code)
        .maybeSingle();
      if (
        !host || !host.yahoo_guid ||
        !host.pairing_expires ||
        new Date(host.pairing_expires).getTime() <= Date.now()
      ) {
        return res.status(400).json({ error: 'invalid_or_expired_code' });
      }
      // Single-use: consume the code as the new device links.
      const { error: consumeError } = await supabase
        .from('yahoo_devices')
        .update({ pairing_code: null, pairing_expires: null })
        .eq('device_id', host.device_id);
      if (consumeError) {
        console.error('yahoo-pair: code consume failed:', consumeError.message);
        return res.status(500).json({ error: 'Failed to claim code' });
      }
      const { error: linkError } = await supabase
        .from('yahoo_devices')
        .upsert(
          { device_id, yahoo_guid: host.yahoo_guid, pairing_code: null, pairing_expires: null },
          { onConflict: 'device_id' }
        );
      if (linkError) {
        console.error('yahoo-pair: device link failed:', linkError.message);
        return res.status(500).json({ error: 'Failed to link device' });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'unlink') {
      const { error } = await supabase
        .from('yahoo_devices')
        .delete()
        .eq('device_id', device_id);
      if (error) {
        console.error('yahoo-pair: unlink failed:', error.message);
        return res.status(500).json({ error: 'Failed to unlink device' });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('yahoo-pair error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
