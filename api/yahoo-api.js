import { XMLParser } from 'fast-xml-parser';
import { applyCors } from './_cors.js';
import { resolveDeviceToken } from './_yahoo-server.js';

const YAHOO_API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

// Yahoo's XML serializes a repeated element with ONE child as a bare object
// where multiples give a list (one manager vs two, one division vs four).
// Force the known repeated tags to always parse as arrays so client code
// never has to branch on 1-vs-N.
const ALWAYS_ARRAY = new Set([
  'manager',
  'roster_position',
  'stat',
  'division',
  'eligible_position',
  'matchup',
  'team',
  'player',
  'draft_result',
  'transaction',
  'game_week',
]);

export default async function handler(req, res) {
  // GET only: the upstream fetch below is hardcoded to GET, so admitting
  // POST here would silently execute a future write call as a read.
  if (applyCors(req, res, { methods: 'GET, OPTIONS' })) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Two credential paths: a linked device id (server holds the Yahoo tokens
  // and refreshes them) or a client-supplied Bearer token (the pre-device
  // flow; kept for back-compat). The device path wins when it resolves.
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const deviceId = req.headers['x-device-id'];

  let accessToken = null;
  if (typeof deviceId === 'string' && deviceId.length > 0) {
    try {
      accessToken = await resolveDeviceToken(deviceId);
    } catch (err) {
      if (err.status) {
        // The device is linked but its Yahoo refresh failed: surface it so
        // the client tries its own refresh instead of silently degrading.
        const status = err.status;
        return res.status(status).json({ error: status === 401 ? 'Token expired or invalid' : 'Server error during API request' });
      }
      // DB unreachable or the token tables not migrated yet: fall back to
      // the client-supplied Bearer token rather than breaking logged-in
      // users on a partially-rolled-out backend.
      accessToken = null;
    }
    if (!accessToken && bearerToken) {
      accessToken = bearerToken;
    }
    if (!accessToken) {
      return res.status(401).json({ error: 'device_not_linked' });
    }
  } else if (bearerToken) {
    accessToken = bearerToken;
  } else {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const { endpoint } = req.query;

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Missing endpoint parameter' });
  }

  // SSRF prevention: validate endpoint against allowlist pattern
  // Valid Yahoo Fantasy endpoints: /league/..., /users/..., /team/...,
  // /player/..., /game/... (game-scoped player lists power draft analysis)
  const ENDPOINT_PATTERN = /^\/(?:league|users|team|player|games|game)[\/;][\w.;=,\/@_+-]+$/;
  if (!ENDPOINT_PATTERN.test(endpoint.startsWith('/') ? endpoint : '/' + endpoint)) {
    return res.status(400).json({ error: 'Invalid endpoint parameter' });
  }

  try {
    // Make request to Yahoo API
    const yahooUrl = `${YAHOO_API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

    // Verify the constructed URL stays within the Yahoo Fantasy API. Origin
    // alone is not enough: the endpoint pattern admits `.` and `/`, so `..`
    // segments could normalize past /fantasy/v2 to another path on the same
    // host (still only with the caller's own token, but out of scope).
    const parsedUrl = new URL(yahooUrl);
    if (parsedUrl.origin !== 'https://fantasysports.yahooapis.com') {
      return res.status(400).json({ error: 'Invalid endpoint - URL origin mismatch' });
    }
    if (!parsedUrl.pathname.startsWith('/fantasy/v2/')) {
      return res.status(400).json({ error: 'Invalid endpoint - path escapes the fantasy API' });
    }

    const yahooResponse = await fetch(yahooUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!yahooResponse.ok) {
      const errorText = await yahooResponse.text();
      // Log only the status, never the body: Yahoo error payloads carry league/
      // team/manager names and these logs persist server-side ("no server keeps
      // your league data"). The body still goes back to the user's own browser.
      console.error('Yahoo API error:', yahooResponse.status);

      if (yahooResponse.status === 401) {
        return res.status(401).json({ error: 'Token expired or invalid' });
      }

      return res.status(yahooResponse.status).json({
        error: 'Yahoo API error',
        status: yahooResponse.status,
        details: errorText
      });
    }

    // Yahoo returns XML by default, try to parse it
    const contentType = yahooResponse.headers.get('content-type') || '';
    const responseText = await yahooResponse.text();

    if (contentType.includes('xml') || responseText.trim().startsWith('<?xml')) {
      // Parse XML to JSON
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        parseAttributeValue: true,
        trimValues: true,
        // Entity decoding stays ON. Turning it off does NOT harden anything
        // here — billion-laughs is DOCTYPE entity expansion, not character
        // references — and it breaks every league or team name containing
        // & < > " ', which in fantasy team names is a lot of them: they would
        // render as "Bob &amp; Weave" through the UI and the PDF.
        isArray: (name) => ALWAYS_ARRAY.has(name)
      });
      const jsonData = parser.parse(responseText);
      return res.status(200).json(jsonData);
    }

    // Return as-is if already JSON
    try {
      const jsonData = JSON.parse(responseText);
      return res.status(200).json(jsonData);
    } catch {
      // Return raw text if not parseable
      return res.status(200).json({ raw: responseText });
    }
  } catch (err) {
    console.error('Yahoo API proxy error:', err);
    res.status(500).json({ error: 'Server error during API request' });
  }
};
