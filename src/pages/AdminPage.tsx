// /admin — league owner console. Everything here is gated by the admin key
// (ADMIN_SYNC_KEY on the server, entered once per session). Lets the owner:
//   1. Connect Yahoo (existing OAuth flow)
//   2. See every synced league with its share PIN and last-synced time
//   3. Pick one of their leagues and sync it to the TraderApe database
//      (the PIN is created or reused alongside the sync)
//
// PIN holders get read-only access via ?pin=… — they never touch this page.

import { useCallback, useEffect, useState } from 'react';
import { getAuthUrl, getUserLeagues, isAuthenticated, loadLeague, saveOAuthReturn } from '@/api/yahoo';
import type { League } from '@/types';
import { SITE_TITLE } from '../utils/siteTitle';

const ADMIN_KEY_STORAGE = 'traderape_admin_key';

function getAdminKey(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE);
  } catch {
    return null;
  }
}

async function adminGet(path: string, adminKey: string) {
  const res = await fetch(path, {
    headers: { 'X-Admin-Key': adminKey },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function formatSyncedAt(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? 'never'
    : d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
}

interface SyncedLeagueInfo {
  leagueKey: string;
  name: string;
  season: number;
  lastSyncedAt: string | null;
  pin: string | null;
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
  // Owner console gets its own tab title like the league pages; leaving
  // restores the site default (matches the NotFoundPage tab-title pattern).
  useEffect(() => {
    document.title = 'Owner Console · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);
  const [adminKey, setAdminKey] = useState<string>(() => getAdminKey() ?? '');
  const [unlocked, setUnlocked] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [yahooConnected] = useState(isAuthenticated());
  const [leagues, setLeagues] = useState<Array<{ id: string; name: string }>>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [synced, setSynced] = useState<SyncedLeagueInfo[]>([]);
  const [syncedLoading, setSyncedLoading] = useState(false);
  const [copiedPin, setCopiedPin] = useState<string | null>(null);
  // Auto-copy can fail silently (old browser / non-secure context / mobile
  // webview). When it does, the PIN shows as selectable text next to the
  // button instead of a dead "Copied" label — same fallback discipline as
  // the trade analyzer's copy-trade-link button.
  const [copyFailedFor, setCopyFailedFor] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inventory of what's already in the database: every synced league with
  // its share PIN and last-synced time. Loads on unlock, refreshes after
  // each sync so the timestamps stay honest.
  const loadSyncedInventory = useCallback(async () => {
    setSyncedLoading(true);
    try {
      const data = await adminGet('/api/league-pin', adminKey);
      setSynced(data.leagues ?? []);
      for (const l of data.leagues ?? []) {
        if (l.pin) setPins(prev => ({ ...prev, [l.leagueKey]: l.pin }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load synced leagues.');
    } finally {
      setSyncedLoading(false);
    }
  }, [adminKey]);

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
    void loadSyncedInventory();
  }, [adminKey, loadSyncedInventory]);

  // Re-validate a stored key on mount: the OAuth round trip reloads this
  // page, and without this the owner would have to click Unlock again.
  useEffect(() => {
    if (!unlocked && getAdminKey()) unlock();
  }, [unlocked, unlock]);

  const connectYahoo = useCallback(async () => {
    // Stash the return so the OAuth round trip lands back here, not on '/'.
    saveOAuthReturn({ path: '/admin' });
    const url = await getAuthUrl();
    window.location.href = url;
  }, []);

  // Copy a share PIN to the clipboard; resets the "Copied" feedback after
  // a moment so it reads honestly again on the next click.
  const copyPin = useCallback(async (pin: string, leagueKey: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(pin);
      ok = true;
    } catch {
      // Clipboard API unavailable (old browser / non-secure context):
      // fall back to a select-and-copy textarea. iOS Safari's
      // execCommand('copy') only works on a focused, readonly field with an
      // explicit selection range — select() alone fails there (same fix as
      // the trade analyzer's copy-trade-link fallback). execCommand returns
      // false when the copy silently fails, so only confirm on true success —
      // a failed copy shows the PIN as selectable text instead of lying.
      const ta = document.createElement('textarea');
      ta.value = pin;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.readOnly = true;
      document.body.appendChild(ta);
      ta.focus();
      ta.setSelectionRange(0, ta.value.length);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
    }
    if (ok) {
      setCopyFailedFor(prev => (prev === leagueKey ? null : prev));
      setCopiedPin(leagueKey);
      window.setTimeout(() => {
        setCopiedPin(prev => (prev === leagueKey ? null : prev));
      }, 2000);
    } else {
      setCopiedPin(null);
      setCopyFailedFor(leagueKey);
    }
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
        void loadSyncedInventory();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sync failed.');
      } finally {
        setSyncing(null);
      }
    },
    [adminKey, loadSyncedInventory]
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
          title="Admin key"
          autoComplete="off"
          // Phones: Enter unlocks, so label the keyboard's action key "go"
          // to match what it does (same pattern as the search inputs).
          enterKeyHint="go"
          style={{ width: '100%', padding: '0.6rem', fontSize: '1rem' }}
        />
        {keyError && <p style={{ color: '#c0392b' }}>{keyError}</p>}
        <button
          onClick={unlock}
          disabled={!adminKey}
          style={{ marginTop: '0.75rem', padding: '0.6rem 1.2rem' }}
          // The label says what it is; the title says what happens on click,
          // matching the owner console's other button title discipline.
          title="Verify the admin key and open the owner console"
        >
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
          <p>Connected to Yahoo. <button onClick={loadYahooLeagues} title="Reload your Yahoo fantasy leagues from Yahoo">Refresh league list</button></p>
        ) : (
          <button onClick={connectYahoo} title="Sign in with Yahoo so leagues can be synced to the database">Connect Yahoo</button>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>2. Synced leagues</h2>
        {syncedLoading && <p>Loading…</p>}
        {!syncedLoading && synced.length === 0 && (
          <p style={{ color: '#666' }}>Nothing in the database yet — sync a league below.</p>
        )}
        {!syncedLoading && synced.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {synced.map(l => (
              <li key={l.leagueKey} style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem', border: '1px solid #ddd', borderRadius: 8 }}>
                <strong>{l.name}</strong>
                <span style={{ color: '#666' }}> ({l.season})</span>
                <div style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>
                  <span>Last synced: {formatSyncedAt(l.lastSyncedAt)}</span>
                  <span style={{ marginLeft: '1rem' }}>
                    PIN: {l.pin ? (
                      <>
                        <code style={{ fontSize: '1.1rem', letterSpacing: '0.2em' }}>{l.pin}</code>
                        <button
                          onClick={() => void copyPin(l.pin ?? '', l.leagueKey)}
                          title="Copy this league's share PIN to the clipboard"
                          // The label flips to "Copied ✓"/"Copy failed" —
                          // announce the outcome so screen-reader users hear it too.
                          aria-live="polite"
                          style={{ marginLeft: '0.5rem', padding: '0.25rem 0.6rem', fontSize: '0.85rem' }}
                        >
                          {copiedPin === l.leagueKey
                            ? 'Copied ✓'
                            : copyFailedFor === l.leagueKey
                              ? 'Copy failed'
                              : 'Copy'}
                        </button>
                        {copyFailedFor === l.leagueKey && (
                          <input
                            type="text"
                            readOnly
                            value={l.pin}
                            aria-label={`Share PIN for ${l.name} — auto-copy failed, select and copy manually`}
                            // The button already says copy failed in visible
                            // text; the title keeps the why attached to the
                            // control itself for tooltips and assistive tech.
                            title="Auto-copy isn't available here — select the PIN and copy it by hand"
                            onFocus={e => e.currentTarget.select()}
                            onClick={e => e.currentTarget.select()}
                            style={{ marginLeft: '0.5rem', fontSize: '1rem', letterSpacing: '0.2em', width: '8em' }}
                          />
                        )}
                      </>
                    ) : (
                      <span style={{ color: '#999' }}>none</span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>3. Sync a league &amp; get its PIN</h2>
        {leagues.length === 0 && <p>{yahooConnected ? 'Loading leagues…' : 'Connect Yahoo first.'}</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {leagues.map(l => (
            <li key={l.id} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 8 }}>
              <strong>{l.name}</strong>
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  onClick={() => syncLeague(l.id)}
                  disabled={syncing !== null}
                  // The label says what it is; the title says what happens on
                  // click (and what the "Last synced" line below will show),
                  // matching the admin page's Copy-button title discipline.
                  title="Pull the latest league data from the platform and update its last-synced time"
                >
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
