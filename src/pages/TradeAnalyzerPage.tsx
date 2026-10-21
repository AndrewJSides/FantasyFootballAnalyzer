import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { League, Player, Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { PosBadge } from '@/components/PosBadge';
import { DataAsOf } from '@/components/DataAsOf';
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

// Both entry shapes carry the NFL team abbreviation, so the picked list can
// show the same identity line the roster/search buttons do (name · team).
function entryTeam(e: Entry): string {
  return e.team ?? '';
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
// When a league is loaded the sender's team picks ride along as optional
// ta/tb team ids, so the link reopens the same pairing the sender analyzed.
// Old links without ta/tb still decode — the Side A preselect covers them.
// ---------------------------------------------------------------------------

const TRADE_HASH_PREFIX = '#trade=';

interface TradeHashSides {
  a: string[];
  b: string[];
  ta?: string;
  tb?: string;
}

function encodeTradeHash(
  sideA: Entry[],
  sideB: Entry[],
  teamAId = '',
  teamBId = '',
): string {
  const payload: TradeHashSides = {
    a: sideA.map(entryLabel),
    b: sideB.map(entryLabel),
    // Team ids only exist with a loaded league; leaving them out in manual
    // mode keeps the hash short and identical to the pre-team-pick format.
    ...(teamAId ? { ta: teamAId } : {}),
    ...(teamBId ? { tb: teamBId } : {}),
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
      const id = (v: unknown): string | undefined =>
        typeof v === 'string' && v ? v : undefined;
      return {
        a: names((parsed as TradeHashSides).a),
        b: names((parsed as TradeHashSides).b),
        ta: id((parsed as TradeHashSides).ta),
        tb: id((parsed as TradeHashSides).tb),
      };
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
function syncTradeHashToUrl(
  sideA: Entry[],
  sideB: Entry[],
  teamAId = '',
  teamBId = '',
): void {
  if (sideA.length === 0 && sideB.length === 0) {
    // Analyzing an empty builder (only reachable from a hand-made empty
    // #trade= link) shouldn't leave a noise hash in the address bar.
    clearTradeHashFromUrl();
    return;
  }
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${encodeTradeHash(sideA, sideB, teamAId, teamBId)}`,
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
  // The other side's picks: a player already on the other side can't be added
  // here — trading him against himself grades nothing real. The roster and
  // search rows show the other-side state the same way they show "added".
  otherEntries: Entry[];
  otherSideName: string;
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
    title, entries, otherEntries, otherSideName, onRemove, teams, teamId,
    onTeamChange, searchQuery, onSearchChange, onAddSearch, leagueLoaded,
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
              // Same for a player sitting on the other side: he can't be
              // traded against himself, so the row names where he is.
              const added = entries.some(e => sameEntry(e, p));
              const onOtherSide = !added && otherEntries.some(e => sameEntry(e, p));
              const unavailable = added || onOtherSide;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.rosterBtn}
                    disabled={unavailable}
                    onClick={() => addRosterPlayer(p)}
                    aria-label={added ? `${p.name} (already added)` : onOtherSide ? `${p.name} (on ${otherSideName})` : `Add ${p.name}`}
                  >
                    <PosBadge pos={p.position} />
                    <span className={styles.pName}>{p.name}</span>
                    {added
                      ? <span className={styles.pTeam}>✓ added</span>
                      : onOtherSide
                        ? <span className={styles.pTeam}>on {otherSideName}</span>
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
          // Player names are proper nouns — stop phone keyboards from
          // "correcting" them (e.g. Hurts -> Hurts' fine, but more often the
          // spacebar replaces the name mid-typing and breaks the search).
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          // Phones: the Enter key already adds the top search hit, so label
          // the keyboard's action key "search" to match what it does.
          enterKeyHint="search"
          // Escape clears the search without touching the picked players. Enter
          // adds the top result — the fast keyboard path when the search has
          // an obvious hit ("puka" -> Puka Nacua) without tapping it. Tapping
          // a result button still clears the search too.
          onKeyDown={e => {
            if (e.key === 'Escape') { onSearchChange(''); return; }
            if (e.key === 'Enter') {
              const top = results[0];
              if (top) {
                if (!entries.some(en => sameEntry(en, top))) onAddSearch(top);
                // Clear either way: the search did its job whether the top
                // hit was just added or was already on this side.
                onSearchChange('');
              }
            }
          }}
        />
      </label>
      {results.length > 0 && (
        <ul className={styles.searchResults}>
          {results.map(p => {
            // Like the roster buttons above, show the added state instead of
            // silently no-op'ing when the search hit is already on this side.
            // Same for hits already on the other side — they can't be traded
            // against themselves.
            const added = entries.some(e => sameEntry(e, p));
            const onOtherSide = !added && otherEntries.some(e => sameEntry(e, p));
            const unavailable = added || onOtherSide;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={styles.rosterBtn}
                  disabled={unavailable}
                  onClick={() => { onAddSearch(p); onSearchChange(''); }}
                  aria-label={added ? `${p.name} (already added)` : onOtherSide ? `${p.name} (on ${otherSideName})` : `Add ${p.name}`}
                >
                  <PosBadge pos={p.pos} />
                  <span className={styles.pName}>{p.name}</span>
                  {added
                    ? <span className={styles.pTeam}>✓ added</span>
                    : onOtherSide
                      ? <span className={styles.pTeam}>on {otherSideName}</span>
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
              <span className={styles.pTeam}>{entryTeam(e)}</span>
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

  // Title the tab with the verdict once a trade is analyzed: tabs and
  // history entries for different trades stay tellable apart, and a shared
  // #trade= link's recipient sees the verdict in their tab too. App.tsx's
  // per-page title effect only fires on pathname change, so this owns the
  // title while the analyzer is mounted; leaving the page restores it.
  useEffect(() => {
    if (!result) return;
    const { label, margin } = verdictCopy(result);
    document.title = margin ? `${label} by ${margin} · TraderApe` : `${label} · TraderApe`;
    return () => {
      document.title = 'Trade Analyzer · TraderApe';
    };
  }, [result]);
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
  // A shared #trade= link's team picks (ta/tb) live in a ref, not hashSides:
  // the auto-run effect consumes hashSides as soon as the sides analyze,
  // which in the no-league-yet case is before the league arrives to resolve
  // the team ids against. The ref survives until the team-apply effect below.
  const sharedTeamsRef = useRef<{ ta?: string; tb?: string } | null>(null);
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
    // One seen-set across both sides: a hand-made link naming the same player
    // on both sides resolves him once (Side A wins the tie), matching the
    // builder's cross-side guard — a trade can't grade a player against
    // himself no matter how the sides were populated.
    const seen = new Set<string>();
    const resolveSide = (names: string[]): Entry[] => {
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
    // Seed the team-apply ref whenever the link carries team picks — even
    // when every named player failed to resolve against the pool (all names
    // stale), the pairing the sender analyzed still matters.
    if (shared.ta || shared.tb) {
      sharedTeamsRef.current = { ta: shared.ta, tb: shared.tb };
    }
    if (skipped > 0) setSkippedShared(skipped);
  }, []);

  // A shared #trade= link carries the sender's team picks (ta/tb). Once the
  // league loads, resolve them against its teams so the link reopens the
  // same pairing the sender analyzed — Side B especially, which otherwise
  // always opens empty. Ids that don't resolve (different league, hand-made
  // link) are ignored and the isMyTeam preselect covers Side A as before.
  // Raw setters only — changeTeam would clear the sides the link just added.
  // Declared after the preselect effect: in the commit where the league
  // lands, the preselect's myTeamId set queues first and this one wins.
  const sharedTeamsAppliedRef = useRef(false);
  useEffect(() => {
    if (sharedTeamsAppliedRef.current || !leagueLoaded) return;
    sharedTeamsAppliedRef.current = true;
    const shared = sharedTeamsRef.current;
    if (!shared || (!shared.ta && !shared.tb)) return;
    const leagueTeams = league && !league.isGuest ? league.teams : [];
    const resolveTeam = (id?: string) =>
      id && leagueTeams.some(t => t.id === id) ? id : '';
    const ta = resolveTeam(shared.ta);
    const tb = resolveTeam(shared.tb);
    if (ta) {
      setTeamAId(ta);
      // Same discipline as a hand pick: once the link's team is applied, the
      // preselect never re-fires behind the user for this league.
      touchedTeamAForRef.current = leagueKey;
    }
    if (tb) setTeamBId(tb);
  }, [leagueLoaded, leagueKey, league]);

  // Editing a side (add/remove a player) invalidates the verdict on screen:
  // it was priced for the previous entries, so clear the stale result,
  // warnings, and URL hash — same discipline as changeTeam below.
  // otherEntries is the opposite side's picks at render time: a player
  // already there can't be added here, so a trade can never grade him
  // against himself. The roster/search buttons already disable for this;
  // the guard here covers the Enter-key path, which bypasses the buttons.
  const addTo = (
    setter: React.Dispatch<React.SetStateAction<Entry[]>>,
    otherEntries: Entry[],
  ) =>
    (p: PoolPlayer) =>
      setter(prev => {
        if (prev.some(e => sameEntry(e, p))) return prev;
        if (otherEntries.some(e => sameEntry(e, p))) return prev;
        setResult(null);
        setWarnings([]);
        setSkippedShared(0);
        clearCopyStatusTimer();
        setCopyStatus('idle');
        setFailedCopyUrl(null);
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
        clearCopyStatusTimer();
        setCopyStatus('idle');
        setFailedCopyUrl(null);
        clearTradeHashFromUrl();
        return prev.filter((_, i) => i !== idx);
      });

  // Declared above changeTeam: the team-change handler lists it as a
  // useCallback dependency, so it must exist before that definition runs.
  // Stable across renders (only touches the ref), and its unmount cleanup
  // means a stale "Copied" reset never fires after the page unmounts.
  const copyStatusTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyStatusTimer.current !== null) window.clearTimeout(copyStatusTimer.current);
    },
    [],
  );
  const clearCopyStatusTimer = useCallback(() => {
    if (copyStatusTimer.current !== null) {
      window.clearTimeout(copyStatusTimer.current);
      copyStatusTimer.current = null;
    }
  }, []);

  // Switching a side's team resets that side: entries came from the old team's
  // roster (or were searched in its context) and any analysis on screen is
  // stale for the new pairing. Never clears the other side. The URL hash
  // clears too — same discipline as addTo/removeFrom — so the address bar
  // never points at a trade the builder no longer holds.
  // Wrapped in useCallback so the memoized per-side handlers below can list it
  // as a dependency without re-creating every render: the body only calls
  // stable state setters, the stable clearCopyStatusTimer, and module-level
  // helpers.
  const changeTeam = useCallback(
    (
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
        clearCopyStatusTimer();
        setCopyStatus('idle');
        setFailedCopyUrl(null);
        clearTradeHashFromUrl();
      },
    [clearCopyStatusTimer],
  );
  const changeTeamA = useMemo(
    () => changeTeam(setTeamAId, setSideA, setQueryA),
    [changeTeam],
  );
  const changeTeamB = useMemo(
    () => changeTeam(setTeamBId, setSideB, setQueryB),
    [changeTeam],
  );

  // Flip the trade around: Side A <-> Side B, including team picks and
  // search boxes. The old verdict was priced for the previous orientation,
  // so it (and its URL hash) clears — same discipline as addTo/removeFrom.
  // Mark Side A's team as user-touched: the swap is a deliberate pick, and
  // without this a later manual clear of Side A would let the isMyTeam
  // preselect re-fire behind the user's back.
  const swapSides = () => {
    touchedTeamAForRef.current = leagueKey;
    setSideA(sideB);
    setSideB(sideA);
    setTeamAId(teamBId);
    setTeamBId(teamAId);
    setQueryA(queryB);
    setQueryB(queryA);
    setResult(null);
    setWarnings([]);
    setSkippedShared(0);
    clearCopyStatusTimer();
    setCopyStatus('idle');
    setFailedCopyUrl(null);
    clearTradeHashFromUrl();
  };

  // Clear means clear: drop the team picks too, matching the league-change
  // reset discipline — a cleared builder with stale teams behind it is only
  // half cleared. Mark Side A's team as user-touched so the isMyTeam
  // preselect doesn't immediately re-add Andrew's team behind the user's
  // back (same discipline as the swap button).
  const clearBuilder = () => {
    touchedTeamAForRef.current = leagueKey;
    setTeamAId('');
    setTeamBId('');
    setSideA([]);
    setSideB([]);
    setResult(null);
    setWarnings([]);
    setSkippedShared(0);
    clearCopyStatusTimer();
    setCopyStatus('idle');
    setFailedCopyUrl(null);
    clearTradeHashFromUrl();
    setQueryA('');
    setQueryB('');
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
    syncTradeHashToUrl(entriesA, entriesB, teamAId, teamBId);
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
  // When the clipboard is unavailable (older browsers, non-secure context,
  // mobile webviews), the button can't copy — but the link still exists.
  // Keep it visible as a selectable field so the user can copy it by hand
  // instead of hitting a dead end. Cleared whenever the builder changes,
  // since the URL encodes the exact sides.
  const [failedCopyUrl, setFailedCopyUrl] = useState<string | null>(null);
  // The "copied"/"failed" label resets after a beat. Track the timer so a
  // second click can't let the first timer erase the fresh status, and so
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
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${encodeTradeHash(sideA, sideB, teamAId, teamBId)}`;
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
      // iOS Safari's execCommand('copy') only works on a focused, readonly
      // field with an explicit selection range — select() alone fails there.
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
      document.body.removeChild(ta);
    }
    clearCopyStatusTimer();
    setCopyStatus(ok ? 'copied' : 'failed');
    setFailedCopyUrl(ok ? null : url);
    copyStatusTimer.current = window.setTimeout(() => setCopyStatus('idle'), 2000);
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.kicker}>▌ PROSPECTIVE TRADE ANALYZER</span>
          <h1 className={styles.heading}>Trade Analyzer</h1>
          <p className={styles.intro}>
            Grade a trade <em>before</em> you make it. Pick the players changing
            hands and get a value-over-replacement verdict
            {leagueLoaded
              ? <> for your league's exact shape — {league.name} — with
                roster-aware takes on how the deal hits each team's positional depth.</>
              : ' against the consensus board.'}
          </p>
          <DataAsOf syncedAt={league?.pinSyncedAt} />
          {!leagueLoaded && (
            <p className={styles.guestNote}>
              No league connected — running in manual mode against the consensus
              board. <Link to="/">Load the league</Link> for team rosters and
              depth analysis.
            </p>
          )}
        </header>

        <div className={styles.builder}>
          <SideBuilder
            title="Side A gives"
            entries={sideA}
            otherEntries={sideB}
            otherSideName="Side B"
            onRemove={removeFrom(setSideA)}
            teams={teams}
            teamId={teamAId}
            onTeamChange={id => { touchedTeamAForRef.current = leagueKey; changeTeamA(id); }}
            searchQuery={queryA}
            onSearchChange={setQueryA}
            onAddSearch={addTo(setSideA, sideB)}
            leagueLoaded={leagueLoaded}
          />
          <button
            type="button"
            className={styles.swap}
            onClick={swapSides}
            // Swap exchanges the team picks too, not just the players — so it
            // stays enabled when either side has a team picked (e.g. the Side A
            // preselect) even before any players are added.
            disabled={sideA.length === 0 && sideB.length === 0 && teamAId === '' && teamBId === ''}
            aria-label="Swap sides"
            title="Swap sides"
          >
            <span className={styles.swapIconH} aria-hidden="true">⇄</span>
            <span className={styles.swapIconV} aria-hidden="true">⇅</span>
          </button>
          <SideBuilder
            title="Side B gives"
            entries={sideB}
            otherEntries={sideA}
            otherSideName="Side A"
            onRemove={removeFrom(setSideB)}
            teams={teams}
            teamId={teamBId}
            onTeamChange={changeTeamB}
            searchQuery={queryB}
            onSearchChange={setQueryB}
            onAddSearch={addTo(setSideB, sideA)}
            leagueLoaded={leagueLoaded}
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.analyze}
            disabled={!canRun}
            // The empty-builder hint below the button already says this in
            // visible text; the title keeps the reason attached to the
            // button itself for tooltips and assistive tech.
            title={sideA.length === 0 && sideB.length === 0 ? 'Add players to either side first' : undefined}
            onClick={() => runAnalysis()}
          >
            Analyze trade
          </button>
          {(sideA.length > 0 || sideB.length > 0) && (
            <button
              type="button"
              className={styles.copy}
              onClick={copyTradeLink}
              aria-live="polite"
              // The URL already carries the #trade= hash, but nothing on the
              // button says what the link contains — keep the why attached
              // to the button itself for tooltips and assistive tech.
              title="Copies a link with this trade's players and teams — league context stays in the URL"
            >
              {copyStatus === 'copied' ? 'Copied ✓' : copyStatus === 'failed' ? 'Copy failed' : 'Copy trade link'}
            </button>
          )}
          {(sideA.length > 0 || sideB.length > 0) && (
            <button
              type="button"
              className={styles.clear}
              onClick={clearBuilder}
              // The last of the action buttons to get one: Swap, Analyze, and
              // Copy trade link all carry title tooltips — keep the why
              // attached to this one too, for tooltips and assistive tech.
              title="Clear all players, teams, and results"
            >
              Clear
            </button>
          )}
        </div>

        {failedCopyUrl && (
          <div className={styles.copyFallback}>
            <p className={styles.copyFallbackHint}>
              Auto-copy isn't available on this device — select the link below
              and copy it by hand:
            </p>
            <input
              type="text"
              readOnly
              className={styles.copyFallbackInput}
              value={failedCopyUrl}
              aria-label="Trade link — select and copy manually"
              onFocus={e => e.currentTarget.select()}
              onClick={e => e.currentTarget.select()}
            />
          </div>
        )}

        {sameTeam && (
          <p className={styles.warning}>
            Side A and Side B are the same team — pick two different teams to grade a trade.
          </p>
        )}

        {sideA.length === 0 && sideB.length === 0 && (
          <p className={styles.emptyHint}>
            {leagueLoaded
              ? 'Add players to either side — from a team roster or the name search — then hit Analyze trade.'
              : 'Add players to either side with the name search — then hit Analyze trade.'}
          </p>
        )}

        {warnings.map((w, i) => (
          <p key={i} className={styles.warning}>{w}</p>
        ))}

        {/* Always mounted: the live region must exist before the verdict
            appears so screen readers announce it. Announcing only the
            verdict, not the builder/search chatter, keeps it noise-free. */}
        <div ref={resultsRef} aria-live="polite">
          {result && <Results result={result} leagueLoaded={leagueLoaded} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

// One source of truth for the human-readable verdict, shared by the results
// section and the document title. Names the winning team when we know it
// (league loaded with teams picked); falls back to "Side A/B wins" in
// manual mode.
function verdictCopy(result: FullTradeAnalysis): { label: string; margin: string | null } {
  const teamAName = result.teamAImpact?.teamName ?? '';
  const teamBName = result.teamBImpact?.teamName ?? '';
  const winnerName = result.winner === 'A' ? teamAName : result.winner === 'B' ? teamBName : '';
  const label =
    result.winner === 'even'
      ? 'Even trade'
      : winnerName
        ? `${winnerName} wins`
        : result.winner === 'A'
          ? 'Side A wins'
          : 'Side B wins';
  const margin = result.winner === 'even' ? null : `${result.margin} VOR pt${result.margin === 1 ? '' : 's'}`;
  return { label, margin };
}

function Results({ result, leagueLoaded }: { result: FullTradeAnalysis; leagueLoaded: boolean }) {
  const teamAName = result.teamAImpact?.teamName ?? '';
  const teamBName = result.teamBImpact?.teamName ?? '';
  const { label: verdict, margin } = verdictCopy(result);
  return (
    <section className={styles.results} aria-label="Trade verdict">
      <div className={`${styles.verdict} ${styles[`verdict${result.winner}`]}`}>
        <span className={styles.verdictLabel}>{verdict}</span>
        {margin && <span className={styles.verdictMargin}>by {margin}</span>}
      </div>

      <div className={styles.totals}>
        <div className={styles.total}>
          <span className={styles.totalLabel}>{teamAName ? `Side A — ${teamAName}` : 'Side A'} value</span>
          {/* Side A lost: dim its number so the totals row agrees with the
             verdict strip above (Side B keeps the lime accent). Even trades
             leave both numbers lime. */}
          <span className={`${styles.totalNum}${result.winner === 'B' ? ` ${styles.totalLose}` : ''}`}>{result.sideATotal}</span>
        </div>
        <div className={styles.total}>
          <span className={styles.totalLabel}>{teamBName ? `Side B — ${teamBName}` : 'Side B'} value</span>
          <span className={`${styles.totalNum}${result.winner === 'A' ? ` ${styles.totalLose}` : ''}`}>{result.sideBTotal}</span>
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
            K, DST, 6 bench). <Link to="/">Load the league</Link> to grade the
            trade against your league's real shape and get roster takes for
            each team.
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
            {/* NFL team identity line, matching the picked-player rows —
                the verdict section is the one place picks lose their team. */}
            <span className={styles.pTeam}>{player.team}</span>
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
