// Shared server-side Yahoo token helpers for the device-token flow.
//
// The browser no longer has to hold Yahoo OAuth tokens itself: after one
// OAuth login, tokens live in the `yahoo_connections` Supabase table keyed
// by Yahoo user GUID, and each browser is linked via `yahoo_devices`.
// yahoo-api.js resolves a device id to a live access token here (refreshing
// server-side when expired) instead of trusting a client-supplied token.
//
// Never log token values: these logs persist server-side.

import { randomInt } from 'node:crypto';
import { getSupabase } from './_supabase.js';

const YAHOO_TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';
// Refresh a few minutes before the real expiry so a slow clock never serves
// a dead token to the proxy.
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

async function refreshConnection(supabase, row) {
  const CLIENT_ID = process.env.YAHOO_CLIENT_ID;
  const CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Yahoo credentials not configured');
  }
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const tokenResponse = await fetch(YAHOO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }),
  });
  if (!tokenResponse.ok) {
    // Status only, never the body (same logging policy as yahoo-api.js).
    console.error('Server-side Yahoo refresh failed:', tokenResponse.status);
    const err = new Error('Token refresh failed');
    err.status = tokenResponse.status >= 500 ? 502 : tokenResponse.status === 429 ? 429 : 401;
    throw err;
  }
  const tokens = await tokenResponse.json();
  const updated = {
    access_token: tokens.access_token,
    // A refresh response may omit the refresh token; keep the one we have.
    refresh_token: tokens.refresh_token || row.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('yahoo_connections')
    .update(updated)
    .eq('yahoo_guid', row.yahoo_guid);
  if (error) {
    console.error('Failed to persist refreshed Yahoo tokens:', error.message);
    throw new Error('Token persist failed');
  }
  return updated.access_token;
}

// Resolve a device id to a live Yahoo access token, or null when the device
// is not linked to any Yahoo account.
export async function resolveDeviceToken(deviceId) {
  if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 128) {
    return null;
  }
  const supabase = await getSupabase();
  const { data: device, error: deviceError } = await supabase
    .from('yahoo_devices')
    .select('yahoo_guid')
    .eq('device_id', deviceId)
    .maybeSingle();
  if (deviceError || !device || !device.yahoo_guid) {
    return null;
  }
  const { data: conn, error: connError } = await supabase
    .from('yahoo_connections')
    .select('yahoo_guid, access_token, refresh_token, expires_at')
    .eq('yahoo_guid', device.yahoo_guid)
    .maybeSingle();
  if (connError || !conn) {
    return null;
  }
  if (new Date(conn.expires_at).getTime() - EXPIRY_BUFFER_MS <= Date.now()) {
    return refreshConnection(supabase, conn);
  }
  return conn.access_token;
}

// Six-digit pairing code, crypto-random. Short enough to type, single-use,
// ten-minute expiry (set by the caller).
export function generatePairingCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}
