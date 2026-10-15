import { useEffect, useMemo, useRef, useState } from 'react';
import type { League, Player, Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { PosBadge } from '@/components/PosBadge';
import {
  analyzeTrade,
  resolveTradeSide,
  valueLeagueFor,
  type FullTradeAnalysis,
} from '@/utils/tradeAnalysis';
import styles from './TradeAnalyzerPage.module.css';

interface TradeAnalyzerPageProps {
  league: League | null;
}

type Entry = Player | PoolPlayer;

// ---------------------------------------------------------------------------
// Player search (manual mode): match against the bundled pool by name.
// ---------------------------------------------------------------------------

function searchPool(query: string, limit = 8): PoolPlayer[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  // Rank exact prefix hits before looser infix hits so typing "ja" offers
  // Ja'Marr Chase before mid-name matches. The pool is consensus-ranked, so
  // pool order still breaks ties within each bucket.
  const prefix: PoolPlayer[] = [];
  const infix: PoolPlayer[] = [];
  for (const p of POOL.players) {
    const name = p.name.toLowerCase();
    if (name.startsWith(q)) {
      if (prefix.length < limit) prefix.push(p);
    } else if (name.includes(q)) {
      if (infix.length < limit) infix.push(p);
    }
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...infix].slice(0, limit);
}

function entryLabel(e: Entry): string {
  return e.name;
}

function entryPos(e: Entry): string {
  return 'position' in e ? (e as Player).position : (e as PoolPlayer).pos;
}

// Two entries are the same player when their ids match, or when their names
// match — league roster ids and consensus-pool ids come from different
// schemes, so the id check alone can't catch cross-source duplicates.
function sameEntry(a: Entry, b: Entry): boolean {
  if (a.id === b.id) return true;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Shareable trade links: sides are encoded as player names in the URL hash,
// e.g. /trade-analyzer#trade=%7B%22a%22%3A%5B%22Saquon+Barkley%22%5D...%7D
// Names resolve against the bundled consensus pool, so links work in manual
// mode with no league connected. Unknown names are skipped on load.
// ---------------------------------------------------------------------------

const TRADE_HASH_PREFIX = '#trade=';

interface TradeHashSides {
  a: string[];
  b: string[];
}

function encodeTradeHash(sideA: Entry[], sideB: Entry[]): string {
  const payload: TradeHashSides = {
    a: sideA.map(entryLabel),
    b: sideB.map(entryLabel),
  };
  return `${TRADE_HASH_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

function decodeTradeHash(hash: string): TradeHashSides | null {
  if (!hash.startsWith(TRADE_HASH_PREFIX)) return null;
  try {
    const parsed: unknown = JSON.parse(
      decodeURIComponent(hash.slice(TRADE_HASH_PREFIX.length)),
    );
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as TradeHashSides).a) &&
      Array.isArray((parsed as TradeHashSides).b)
    ) {
      const names = (arr: unknown[]): string[] =>
        arr.filter((n): n is string => typeof n === 'string');
      return { a: names((parsed as TradeHashSides).a), b: names((parsed as TradeHashSides).b) };
    }
  } catch {
    // Malformed hash — ignore and leave the builder empty.
  }
  return null;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Warning shown when a shared #trade= link names players the consensus pool
// can't resolve. Held in state (not folded into the warnings array) so an
// analysis re-run — manual or the shared-link auto-run — doesn't wipe it. It
// clears only when the user edits the builder, at which point the trade is
// no longer the shared one.
function skippedSharedWarning(count: number): string {
  return `${count} player${count === 1 ? '' : 's'} in this shared link ` +
    `couldn't be matched and ${count === 1 ? 'was' : 'were'} left out.`;
}

// Keep the address bar's #trade= hash in sync with the analyzed trade, so a
// plain copy of the URL from the bar shares the same thing the copy button
// does. replaceState keeps the back button clean; the mount-once hash loader
// above never re-fires on these replacements. The search string is preserved
// so a shared-league param (?league= / ?pin=) survives the analysis —
// dropping it would unload the league on the next refresh.
function syncTradeHashToUrl(sideA: Entry[], sideB: Entry[]): void {
  if (sideA.length === 0 && sideB.length === 0) {
    // Analyzing an empty builder (only reachable from a hand-made empty
    // #trade= link) shouldn't leave a noise hash in the address bar.
    clearTradeHashFromUrl();
    return;
  }
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${encodeTradeHash(sideA, sideB)}`,
  );
}

// A cleared builder must not leave a hash behind that would reload the trade
// on the next refresh. The search string stays so the league context isn't
// lost with the trade.
function clearTradeHashFromUrl(): void {
  if (window.location.hash.startsWith(TRADE_HASH_PREFIX)) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
}

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// Shared-link names resolve against the pool with several fallbacks, since
// roster names, abbreviations, and punctuation vary ("X. Worthy",
// "A.J. Brown" vs "AJ Brown"). Exact matches come first; fuzzier passes only
// run when nothing exact hit, and the pool is consensus-ranked so the first
// fuzzy hit is the best guess.
function matchPoolByName(name: string): PoolPlayer | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const exact = POOL.players.find(p => p.name.toLowerCase() === q);
  if (exact) return exact;
  const nq = normName(q);
  const normExact = POOL.players.find(p => normName(p.name) === nq);
  if (normExact) return normExact;
  const partial = POOL.players.find(p => normName(p.name).includes(nq));
  if (partial) return partial;
  const qTokens = tokens(q);
  if (qTokens.length === 0) return null;
  return (
    POOL.players.find(p => {
      const pTokens = tokens(p.name);
      if (pTokens.length !== qTokens.length) return false;
      return qTokens.every((qt, i) => pTokens[i].startsWith(qt));
    }) ?? null
  );
}

// ---------------------------------------------------------------------------
// Side builder column
// ---------------------------------------------------------------------------

function SideBuilder(props: {
  title: string;
  entries: Entry[];
  onRemove: (idx: number) => void;
  teams: Team[];
  teamId: string;
  onTeamChange: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onAddSearch: (p: PoolPlayer) => void;
  leagueLoaded: boolean;
}) {
  const {
    title, entries, onRemove, teams, teamId, onTeamChange,
    searchQuery, onSearchChange, onAddSearch, leagueLoaded,
  } = props;
  const team = teams.find(t => t.id === teamId);
  const results = useMemo(() => searchPool(searchQuery), [searchQuery]);

  const addRosterPlayer = (p: Player) => {
    if (!entries.some(e => sameEntry(e, p))) {
      onAddSearch(p as unknown as PoolPlayer);
    }
  };

  return (
    <section className={styles.side} aria-label={title}>
      <h2 className={styles.sideTitle}>{title}</h2>

      {leagueLoaded && (
        <label className={styles.field}>
          <span className={styles.label}>Team</span>
          <select
            className={styles.select}
            value={teamId}
            onChange={e => onTeamChange(e.target.value)}
          >
            <option value="">— pick a team —</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.isMyTeam ? ' (you)' : ''}</option>
            ))}
          </select>
        </label>
      )}

      {team && (
        <div className={styles.rosterList}>
          <span className={styles.label}>Tap a player to add</span>
          <ul>
            {(team.roster ?? []).map(p => {
              // Re-tapping an already-added player silently did nothing; now
              // the button shows its added state and won't accept the tap.
              const added = entries.some(e => sameEntry(e, p));
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.rosterBtn}
                    disabled={added}
                    onClick={() => addRosterPlayer(p)}
                    aria-label={added ? `${p.name} (already added)` : `Add ${p.name}`}
                  >
                    <PosBadge pos={p.position} />
                    <span className={styles.pName}>{p.name}</span>
                    {added
                      ? <span className={styles.pTeam}>✓ added</span>
                      : <span className={styles.pTeam}>{p.team}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Or search any player</span>
        <input
          className={styles.input}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Type a name…"
        />
      </label>
      {results.length > 0 && (
        <ul className={styles.searchResults}>
          {results.map(p => {
            // Like the roster buttons above, show the added state instead of
            // silently no-op'ing when the search hit is already on this side.
            const added = entries.some(e => sameEntry(e, p));
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={styles.rosterBtn}
                  disabled={added}
                  onClick={() => { onAddSearch(p); onSearchChange(''); }}
                  aria-label={added ? `${p.name} (already added)` : `Add ${p.name}`}
                >
                  <PosBadge pos={p.pos} />
                  <span className={styles.pName}>{p.name}</span>
                  {added
                    ? <span className={styles.pTeam}>✓ added</span>
                    : <span className={styles.pTeam}>{p.team} · {p.pos}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {entries.length > 0 && (
        <ul className={styles.picked}>
          {entries.map((e, i) => (
            <li key={`${entryLabel(e)}-${i}`} className={styles.pick}>
              <PosBadge pos={entryPos(e)} />
              <span className={styles.pName}>{entryLabel(e)}</span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => onRemove(i)}
                aria-label={`Remove ${entryLabel(e)}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TradeAnalyzerPage({ league }: TradeAnalyzerPageProps) {
  const leagueLoaded = !!league && !league.isGuest;
  const teams = leagueLoaded ? league.teams : [];

  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [sideA, setSideA] = useState<Entry[]>([]);
  const [sideB, setSideB] = useState<Entry[]>([]);
  const [queryA, setQueryA] = useState('');
  const [queryB, setQueryB] = useState('');
  const [result, setResult] = useState<FullTradeAnalysis | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  // Players a shared #trade= link named that the consensus pool couldn't
  // resolve. Survives re-analysis; clears when the user edits the builder.
  const [skippedShared, setSkippedShared] = useState(0);

  // When a synced league (PIN or directly connected) loads, preselect
  // Andrew's own team as Side A so the common "what should I give?" flow
  // starts one tap ahead. Never overrides a team the user already picked.
  const leagueKey = leagueLoaded && league ? `${league.platform}:${league.id}` : '';
  // Tracks the league the builder last rendered for. A genuinely different
  // league arriving mid-session resets the builder (see the effect after
  // the preselect below); the first load ('' -> league) is excluded so a
  // shared #trade= link's sides survive until the league's auto-run.
  const prevLeagueKeyRef = useRef(leagueKey);
  const myTeamId = useMemo(
    () => (leagueLoaded && league ? league.teams.find(t => t.isMyTeam)?.id ?? '' : ''),
    [leagueLoaded, league],
  );
  // The league for which the user hand-picked (or hand-cleared) Side A's
  // team. A manual clear leaves teamAId empty just like "never picked",
  // so without this the effect below would re-preselect behind their back.
  const touchedTeamAForRef = useRef('');
  // A genuinely different league arriving mid-session (e.g. opening a
  // ?league= share link while already on this page) invalidates everything
  // the builder holds: stale team ids would sit behind the "pick a team"
  // placeholder and silently block the isMyTeam preselect above. Reset the
  // whole builder — same discipline as switching a side's team. The first
  // load ('' -> league) is NOT a reset: that's when a shared #trade= link's
  // sides are still arriving, and clearing them here would strand the link.
  // Declared after the preselect effect so the reset lands first in the
  // same commit and the preselect immediately picks the new league's team.
  useEffect(() => {
    if (prevLeagueKeyRef.current === leagueKey || prevLeagueKeyRef.current === '') {
      prevLeagueKeyRef.current = leagueKey;
      return;
    }
    prevLeagueKeyRef.current = leagueKey;
    touchedTeamAForRef.current = '';
    setTeamAId('');
    setTeamBId('');
    setSideA([]);
    setSideB([]);
    setQueryA('');
    setQueryB('');
    setResult(null);
    setWarnings([]);
    setSkippedShared(0);
  }, [leagueKey]);
  useEffect(() => {
    if (!myTeamId || teamAId || touchedTeamAForRef.current === leagueKey) return;
    setTeamAId(myTeamId);
  }, [myTeamId, teamAId, leagueKey]);

  // Populate the builder from a shared #trade= link on first load. Runs once;
  // skips names that don't resolve against the consensus pool. hashSides holds
  // the resolved sides until their analysis has run (see the auto-run effect
  // below): a ref isn't enough because the league may still be loading when
  // the hash is applied, and the analysis must reprice once it arrives.
  const hashAppliedRef = useRef(false);
  const [hashSides, setHashSides] = useState<{ a: Entry[]; b: Entry[] } | null>(null);
  useEffect(() => {
    if (hashAppliedRef.current) return;
    hashAppliedRef.current = true;
    const shared = decodeTradeHash(window.location.hash);
    if (!shared) return;
    // Names that don't match the consensus pool used to be dropped silently,
    // so a shared link could quietly lose players. Count the misses and keep
    // the count in state — runAnalysis folds it back into the warnings on
    // every run (manual and auto) instead of wiping it on first render.
    let skipped = 0;
    const resolveSide = (names: string[]): Entry[] => {
      const seen = new Set<string>();
      const out: Entry[] = [];
      for (const name of names) {
        const p = matchPoolByName(name);
        if (p && !seen.has(p.id)) {
          seen.add(p.id);
          out.push(p);
        } else if (!p) {
          skipped += 1;
        }
      }
      return out;
    };
    const a = resolveSide(shared.a);
    const b = resolveSide(shared.b);
    if (a.length > 0) setSideA(a);
    if (b.length > 0) setSideB(b);
    if (a.length > 0 || b.length > 0) setHashSides({ a, b });
    if (skipped > 0) setSkippedShared(skipped);
  }, []);

  // Editing a side (add/remove a player) invalidates the verdict on screen:
  // it was priced for the previous entries, so clear the stale result,
  // warnings, and URL hash — same discipline as changeTeam below.
  const addTo = (setter: React.Dispatch<React.SetStateAction<Entry[]>>) =>
    (p: PoolPlayer) =>
      setter(prev => {
        if (prev.some(e => sameEntry(e, p))) return prev;
        setResult(null);
        setWarnings([]);
        setSkippedShared(0);
        clearTradeHashFromUrl();
        return [...prev, p as Entry];
      });
  const removeFrom = (setter: React.Dispatch<React.SetStateAction<Entry[]>>) =>
    (idx: number) =>
      setter(prev => {
        if (idx < 0 || idx >= prev.length) return prev;
        setResult(null);
        setWarnings([]);
        setSkippedShared(0);
        clearTradeHashFromUrl();
        return prev.filter((_, i) => i !== idx);
      });

  // Switching a side's team resets that side: entries came from the old team's
  // roster (or were searched in its context) and any analysis on screen is
  // stale for the new pairing. Never clears the other side. The URL hash
  // clears too — same discipline as addTo/removeFrom — so the address bar
  // never points at a trade the builder no longer holds.
  const changeTeam = (
    teamSetter: React.Dispatch<React.SetStateAction<string>>,
    entriesSetter: React.Dispatch<React.SetStateAction<Entry[]>>,
    querySetter: React.Dispatch<React.SetStateAction<string>>,
  ) =>
    (id: string) => {
      teamSetter(id);
      entriesSetter([]);
      querySetter('');
      setResult(null);
      setWarnings([]);
      setSkippedShared(0);
      clearTradeHashFromUrl();
    };
  const changeTeamA = useMemo(
    () => changeTeam(setTeamAId, setSideA, setQueryA),
    [],
  );
  const changeTeamB = useMemo(
    () => changeTeam(setTeamBId, setSideB, setQueryB),
    [],
  );

  // Flip the trade around: Side A <-> Side B, including team picks and
  // search boxes. The old verdict was priced for the previous orientation,
  // so it (and its URL hash) clears — same discipline as addTo/removeFrom.
  const swapSides = () => {
    setSideA(sideB);
    setSideB(sideA);
    setTeamAId(teamBId);
    setTeamBId(teamAId);
    setQueryA(queryB);
    setQueryB(queryA);
    setResult(null);
    setWarnings([]);
    setSkippedShared(0);
    clearTradeHashFromUrl();
  };

  const runAnalysis = (sides?: { a: Entry[]; b: Entry[] }) => {
    const entriesA = sides?.a ?? sideA;
    const entriesB = sides?.b ?? sideB;
    const valueLeague = valueLeagueFor(leagueLoaded ? league : null);
    const ra = resolveTradeSide(entriesA);
    const rb = resolveTradeSide(entriesB);
    const warns: string[] = [];
    // The shared-link "couldn't be matched" notice is state, not a one-shot:
    // every re-run re-emits it so the auto-run on first load can't swallow it.
    if (skippedShared > 0) warns.push(skippedSharedWarning(skippedShared));
    if (ra.unresolved.length > 0 || rb.unresolved.length > 0) {
      warns.push(
        `Couldn't match ${[...ra.unresolved, ...rb.unresolved].join(', ')} to rankings — left out of the math.`,
      );
    }
    const teamA = teams.find(t => t.id === teamAId);
    const teamB = teams.find(t => t.id === teamBId);
    setResult(
      analyzeTrade(ra.players, rb.players, {
        valueLeague,
        teamA,
        teamB,
      }),
    );
    setWarnings(warns);
    syncTradeHashToUrl(entriesA, entriesB);
  };

  // A shared #trade= link should land on the verdict, not a populated but
  // un-analyzed builder. Runs as soon as the hash sides are applied (with
  // manual-mode values if the league hasn't loaded yet), then re-runs once
  // the real league arrives (null -> league) so the verdict reprices for the
  // league's size, scoring, and roster shape. The pending auto-run survives
  // until the league's team pickers have settled, so the league-priced run
  // includes Side A's preselect (and its roster takes). If the user edits the
  // builder before the league arrives, the pending auto-run is stale and is
  // dropped.
  useEffect(() => {
    if (!hashSides) return;
    const stale =
      hashSides.a.length !== sideA.length ||
      hashSides.b.length !== sideB.length ||
      hashSides.a.some((e, i) => !sameEntry(e, sideA[i])) ||
      hashSides.b.some((e, i) => !sameEntry(e, sideB[i]));
    if (stale) {
      setHashSides(null);
      return;
    }
    runAnalysis(hashSides);
    const teamsSettled = !leagueLoaded || teamAId !== '' || myTeamId === '';
    if (teamsSettled) setHashSides(null);
    setAutoScrollPending(true);
    // runAnalysis is an event handler whose identity changes every render;
    // depending on it would re-analyze on every keystroke. The listed deps
    // are the only ones that should re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueLoaded, league, hashSides, sideA, sideB, teamAId, teamBId, myTeamId]);

  // A trade needs two different teams: trading with yourself grades
  // nothing real. The button disables and a note explains.
  const sameTeam = leagueLoaded && teamAId !== '' && teamAId === teamBId;
  const canRun = (sideA.length > 0 || sideB.length > 0) && !sameTeam;
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resultsRef = useRef<HTMLDivElement>(null);
  // A shared-link auto-run lands the visitor at the top of a populated
  // builder; once the verdict renders, bring it into view. Scoped to the
  // auto-run — manual "Analyze trade" clicks stay put.
  const [autoScrollPending, setAutoScrollPending] = useState(false);
  useEffect(() => {
    if (autoScrollPending && result) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setAutoScrollPending(false);
    }
  }, [autoScrollPending, result]);

  const copyTradeLink = async () => {
    // Use the live location (not a hardcoded path) so the copied link keeps
    // the shared-league params (?league= / ?pin=) the trade was priced for.
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${encodeTradeHash(sideA, sideB)}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Clipboard API unavailable (older browsers / non-secure context):
      // fall back to the legacy execCommand path. execCommand returns false
      // when the copy silently fails, so only confirm on true success.
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    setCopyStatus(ok ? 'copied' : 'failed');
    window.setTimeout(() => setCopyStatus('idle'), 2000);
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.kicker}>▌ PROSPECTIVE TRADE ANALYZER</span>
          <h1 className={styles.heading}>Trade Analyzer</h1>
          <p className={styles.intro}>
            Grade a trade <em>before</em> you make it. Pick the players changing
            hands and get a value-over-replacement verdict for your league's
            exact shape
            {leagueLoaded ? ` — ${league.name}` : ''}. Load the league for
            roster-aware takes on how the deal hits each
            team's positional depth.
          </p>
          {!leagueLoaded && (
            <p className={styles.guestNote}>
              No league connected — running in manual mode against the consensus
              board. <a href="/">Load the league</a> for team rosters and
              depth analysis.
            </p>
          )}
        </header>

        <div className={styles.builder}>
          <SideBuilder
            title="Side A gives"
            entries={sideA}
            onRemove={removeFrom(setSideA)}
            teams={teams}
            teamId={teamAId}
            onTeamChange={id => { touchedTeamAForRef.current = leagueKey; changeTeamA(id); }}
            searchQuery={queryA}
            onSearchChange={setQueryA}
            onAddSearch={addTo(setSideA)}
            leagueLoaded={leagueLoaded}
          />
          <button
            type="button"
            className={styles.swap}
            onClick={swapSides}
            disabled={sideA.length === 0 && sideB.length === 0}
            aria-label="Swap sides"
            title="Swap sides"
          >
            <span className={styles.swapIconH} aria-hidden="true">⇄</span>
            <span className={styles.swapIconV} aria-hidden="true">⇅</span>
          </button>
          <SideBuilder
            title="Side B gives"
            entries={sideB}
            onRemove={removeFrom(setSideB)}
            teams={teams}
            teamId={teamBId}
            onTeamChange={changeTeamB}
            searchQuery={queryB}
            onSearchChange={setQueryB}
            onAddSearch={addTo(setSideB)}
            leagueLoaded={leagueLoaded}
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.analyze}
            disabled={!canRun}
            onClick={() => runAnalysis()}
          >
            Analyze trade
          </button>
          {(sideA.length > 0 || sideB.length > 0) && (
            <button
              type="button"
              className={styles.copy}
              onClick={copyTradeLink}
            >
              {copyStatus === 'copied' ? 'Copied ✓' : copyStatus === 'failed' ? 'Copy failed' : 'Copy trade link'}
            </button>
          )}
          {(sideA.length > 0 || sideB.length > 0) && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => { setSideA([]); setSideB([]); setResult(null); setWarnings([]); setSkippedShared(0); clearTradeHashFromUrl(); }}
            >
              Clear
            </button>
          )}
        </div>

        {sameTeam && (
          <p className={styles.warning}>
            Side A and Side B are the same team — pick two different teams to grade a trade.
          </p>
        )}

        {warnings.map((w, i) => (
          <p key={i} className={styles.warning}>{w}</p>
        ))}

        {result && (
          <div ref={resultsRef}>
            <Results result={result} leagueLoaded={leagueLoaded} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function Results({ result, leagueLoaded }: { result: FullTradeAnalysis; leagueLoaded: boolean }) {
  const teamAName = result.teamAImpact?.teamName ?? '';
  const teamBName = result.teamBImpact?.teamName ?? '';
  // Name the winning team when we know it (league loaded with teams
  // picked); fall back to "Side A/B wins" in manual mode.
  const winnerName = result.winner === 'A' ? teamAName : result.winner === 'B' ? teamBName : '';
  const verdict =
    result.winner === 'even'
      ? 'Even trade'
      : winnerName
        ? `${winnerName} wins`
        : result.winner === 'A'
          ? 'Side A wins'
          : 'Side B wins';
  return (
    <section className={styles.results} aria-label="Trade verdict">
      <div className={`${styles.verdict} ${styles[`verdict${result.winner}`]}`}>
        <span className={styles.verdictLabel}>{verdict}</span>
        {result.winner !== 'even' && (
          <span className={styles.verdictMargin}>
            by {result.margin} VOR pts
          </span>
        )}
      </div>

      <div className={styles.totals}>
        <div className={styles.total}>
          <span className={styles.totalLabel}>{teamAName ? `Side A — ${teamAName}` : 'Side A'} value</span>
          <span className={styles.totalNum}>{result.sideATotal}</span>
        </div>
        <div className={styles.total}>
          <span className={styles.totalLabel}>{teamBName ? `Side B — ${teamBName}` : 'Side B'} value</span>
          <span className={styles.totalNum}>{result.sideBTotal}</span>
        </div>
      </div>

      <div className={styles.breakdowns}>
        <PlayerBreakdown title={teamAName ? `Side A — ${teamAName}` : 'Side A'} players={result.sideA} />
        <PlayerBreakdown title={teamBName ? `Side B — ${teamBName}` : 'Side B'} players={result.sideB} />
      </div>

      {(result.teamAImpact || result.teamBImpact) && (
        <div className={styles.impacts}>
          {result.teamAImpact && <TeamImpact impact={result.teamAImpact} side="A" />}
          {result.teamBImpact && <TeamImpact impact={result.teamBImpact} side="B" />}
        </div>
      )}

      <p className={styles.method}>
        Values are value-over-replacement (VOR) in projected points, computed
        {leagueLoaded ? (
          <>
            {' '}
            for your league's size, scoring, and roster shape. A raw value win
            isn't everything — check the roster takes below for how each team's
            starting lineup actually changes.
          </>
        ) : (
          <>
            {' '}
            for a standard 10-team full-PPR league (1 QB, 2 RB, 2 WR, TE, FLEX,
            K, DST, 6 bench). Load the league to grade the trade against your
            league's real shape and get roster takes for each team.
          </>
        )}
      </p>
    </section>
  );
}

function PlayerBreakdown({
  title,
  players,
}: {
  title: string;
  players: FullTradeAnalysis['sideA'];
}) {
  if (players.length === 0) {
    return (
      <div className={styles.breakdown}>
        <h3>{title}</h3>
        <p className={styles.emptySide}>Nothing</p>
      </div>
    );
  }
  return (
    <div className={styles.breakdown}>
      <h3>{title}</h3>
      <ul>
        {players.map(({ player, vor }) => (
          <li key={player.id} className={styles.vorRow}>
            <PosBadge pos={player.pos} />
            <span className={styles.pName}>{player.name}</span>
            <span className={styles.vor}>{vor.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamImpact({
  impact,
  side,
}: {
  impact: NonNullable<FullTradeAnalysis['teamAImpact']>;
  side: string;
}) {
  if (impact.takes.length === 0) return null;
  return (
    <div className={styles.impact}>
      <h3>
        {impact.teamName} <span className={styles.sideTag}>(Side {side})</span>
      </h3>
      <ul>
        {impact.takes.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
