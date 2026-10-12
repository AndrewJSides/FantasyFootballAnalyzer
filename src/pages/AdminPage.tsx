// /admin — league owner console. Everything here is gated by the admin key
// (ADMIN_SYNC_KEY on the server, entered once per session). Lets the owner:
//   1. Connect Yahoo (existing OAuth flow)
//   2. Pick one of their leagues and sync it to the TraderApe database
//   3. Create / view the share PIN for a synced league
//
// PIN holders get read-only access via ?pin=… — they never touch this page.

import { useCallback, useEffect, useState } from 'react';
import { getAuthUrl, getUserLeagues, isAuthenticated, loadLeague } from '@/api/yahoo';
import type { League } from '@/types';

const ADMIN_KEY_STORAGE = 'traderape_admin_key';

function getAdminKey(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE);
  } catch {
    return null;
  }
}

async function adminPost(path: string, adminKey: string, body: Record<string, unknown>) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminKey, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function AdminPage() {
  const [adminKey, setAdminKey] = useState<string>(() => getAdminKey() ?? '');
  const [unlocked, setUnlocked] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [yahooConnected] = useState(isAuthenticated());
  const [leagues, setLeagues] = useState<Array<{ id: string; name: string }>>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(async () => {
    setKeyError(null);
    setStatus(null);
    try {
      // Validate the key with a harmless call: creating a PIN for a bogus
      // league returns 404 only when the key is right, 403 when it isn't.
      await adminPost('/api/league-pin', adminKey, { leagueKey: '__probe__' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (/invalid admin key/i.test(message)) {
        setKeyError('Wrong admin key.');
        return;
      }
      // 404 on the probe means the key was accepted.
    }
    try {
      sessionStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
    } catch {
      /* private mode — key just won't persist */
    }
    setUnlocked(true);
  }, [adminKey]);

  const connectYahoo = useCallback(async () => {
    const url = await getAuthUrl();
    window.location.href = url;
  }, []);

  const loadYahooLeagues = useCallback(async () => {
    setError(null);
    try {
      const list = await getUserLeagues();
      setLeagues(list);
      if (list.length === 0) setStatus('No Yahoo leagues found on this account.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list Yahoo leagues.');
    }
  }, []);

  useEffect(() => {
    if (unlocked && yahooConnected) loadYahooLeagues();
  }, [unlocked, yahooConnected, loadYahooLeagues]);

  const syncLeague = useCallback(
    async (leagueId: string) => {
      setSyncing(leagueId);
      setError(null);
      setStatus(null);
      try {
        const league: League = await loadLeague(leagueId);
        const result = await adminPost('/api/league-sync', adminKey, { league });
        setStatus(`Synced "${result.league.name}" (${result.league.season}) to the database.`);
        const pinResult = await adminPost('/api/league-pin', adminKey, { leagueKey: leagueId });
        setPins(prev => ({ ...prev, [leagueId]: pinResult.pin }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sync failed.');
      } finally {
        setSyncing(null);
      }
    },
    [adminKey]
  );

  if (!unlocked) {
    return (
      <div style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1rem' }}>
        <h1>Owner console</h1>
        <p>Enter the admin key to manage league syncing and share PINs.</p>
        <input
          type="password"
          value={adminKey}
          onChange={e => setAdminKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && unlock()}
          placeholder="Admin key"
          autoComplete="off"
          style={{ width: '100%', padding: '0.6rem', fontSize: '1rem' }}
        />
        {keyError && <p style={{ color: '#c0392b' }}>{keyError}</p>}
        <button onClick={unlock} disabled={!adminKey} style={{ marginTop: '0.75rem', padding: '0.6rem 1.2rem' }}>
          Unlock
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Owner console</h1>
      {status && <p style={{ color: '#1e7e34' }}>{status}</p>}
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      <section style={{ marginBottom: '2rem' }}>
        <h2>1. Yahoo connection</h2>
        {yahooConnected ? (
          <p>Connected to Yahoo. <button onClick={loadYahooLeagues}>Refresh league list</button></p>
        ) : (
          <button onClick={connectYahoo}>Connect Yahoo</button>
        )}
      </section>

      <section>
        <h2>2. Sync a league &amp; get its PIN</h2>
        {leagues.length === 0 && <p>{yahooConnected ? 'Loading leagues…' : 'Connect Yahoo first.'}</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {leagues.map(l => (
            <li key={l.id} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 8 }}>
              <strong>{l.name}</strong>
              <div style={{ marginTop: '0.5rem' }}>
                <button onClick={() => syncLeague(l.id)} disabled={syncing !== null}>
                  {syncing === l.id ? 'Syncing…' : 'Sync to database'}
                </button>
                {pins[l.id] && (
                  <span style={{ marginLeft: '1rem' }}>
                    Share PIN: <code style={{ fontSize: '1.2rem', letterSpacing: '0.2em' }}>{pins[l.id]}</code>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          Syncing pulls the full league (teams, rosters, settings) into the database.
          Anyone with the PIN can view it — no account needed. Only this page can re-sync.
        </p>
      </section>
    </div>
  );
}
