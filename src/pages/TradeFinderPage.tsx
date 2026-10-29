import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { League, Player, Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { POOL_SEASON } from '@/data/draftPoolMeta';
import { DataAsOf } from '@/components/DataAsOf';
import { PosBadge } from '@/components';
import {
  findTradeCandidates,
  type TradeCandidate,
} from '@/utils/tradeFinder';
import { valueLeagueFor, DEFAULT_MANUAL_SHAPE } from '@/utils/tradeAnalysis';
import { DEFAULT_VOR_CONFIG } from '@/utils/projectionValues';
import { SITE_TITLE } from '@/utils/siteTitle';
import styles from './TradeFinderPage.module.css';

interface TradeFinderPageProps {
  league: League | null;
}

// Trade finder (backlog item 3): proposes concrete win-win swaps between
// league teams. It scans every team pair for depth-for-need trades —
// 1-for-1 depth swaps, 2-for-1 consolidation packages, and star-for-star
// need swaps ("my RB1 for your WR1") — then grades each with the same VOR
// value model and roster-impact takes as the Trade Analyzer. Only swaps that
// are fair on paper (within 25% on VOR) AND leave neither team's starting
// value worse are proposed. Each card deep-links into the Trade Analyzer
// with the pairing pre-filled for a full breakdown.
//
// Guest mode (backlog item 3 remainder): visitors with no connected league
// enter their own roster plus one trade partner's roster, and the same scan
// runs on the two synthetic teams priced on the default manual shape.

const round1 = (n: number) => Math.round(n * 10) / 10;

function tradeLink(
  candidate: TradeCandidate,
  search: string,
  includeTeamIds: boolean,
): string {
  const payload = {
    a: candidate.aGives.map(p => p.name),
    b: candidate.bGives.map(p => p.name),
    ...(includeTeamIds
      ? { ta: candidate.teamA.id, tb: candidate.teamB.id }
      : {}),
  };
  return `/trade-analyzer${search}#trade=${encodeURIComponent(JSON.stringify(payload))}`;
}

function CandidateList({
  candidates,
  search,
  includeTeamIds,
  emptyText,
}: {
  candidates: TradeCandidate[];
  search: string;
  includeTeamIds: boolean;
  emptyText: string;
}) {
  return (
    <>
      <p className={styles.intro} aria-live="polite">
        {candidates.length === 0
          ? emptyText
          : `${candidates.length} proposed swap${candidates.length === 1 ? '' : 's'}: each side gives from a position it can spare and receives at a position it needs.`}
      </p>

      {candidates.length > 0 && (
        <ul className={styles.cards} aria-label="Proposed trades">
          {candidates.map((c, i) => (
            <li key={`${c.teamA.id}-${c.teamB.id}-${i}`} className={styles.card}>
              <article aria-label={`${c.teamA.name} and ${c.teamB.name} proposed trade`}>
                <h2 className={styles.pairing}>
                  {c.teamA.name} <span className={styles.swap} aria-hidden="true">⇄</span>{' '}
                  {c.teamB.name}
                </h2>

                <div className={styles.sides}>
                  <div className={styles.side}>
                    <h3 className={styles.sideTitle}>
                      {c.teamA.name} gives
                    </h3>
                    <ul aria-label={`${c.teamA.name} gives`}>
                      {c.aGives.map(p => (
                        <li key={p.id} className={styles.player}>
                          <PosBadge pos={p.pos} />
                          <span className={styles.playerName}>{p.name}</span>
                          <span className={styles.vor}>
                            {round1(c.analysis.sideA.find(v => v.player.id === p.id)?.vor ?? 0)} VOR
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.side}>
                    <h3 className={styles.sideTitle}>
                      {c.teamB.name} gives
                    </h3>
                    <ul aria-label={`${c.teamB.name} gives`}>
                      {c.bGives.map(p => (
                        <li key={p.id} className={styles.player}>
                          <PosBadge pos={p.pos} />
                          <span className={styles.playerName}>{p.name}</span>
                          <span className={styles.vor}>
                            {round1(c.analysis.sideB.find(v => v.player.id === p.id)?.vor ?? 0)} VOR
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <ul className={styles.reasons} aria-label="Why this trade works">
                  {c.reasons.map((r, ri) => (
                    <li key={ri}>{r}</li>
                  ))}
                </ul>

                <Link
                  className={styles.analyze}
                  to={tradeLink(c, search, includeTeamIds)}
                  aria-label={`Analyze ${c.teamA.name} and ${c.teamB.name} trade in the Trade Analyzer`}
                >
                  Analyze this trade →
                </Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Guest player search: match against the bundled pool by name, like the
// Start/Sit guest builder. Exact prefix hits rank before looser infix hits.
function searchPool(query: string, exclude: Set<string>, limit = 8): PoolPlayer[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const prefix: PoolPlayer[] = [];
  const infix: PoolPlayer[] = [];
  for (const p of POOL.players) {
    if (exclude.has(p.id)) continue;
    const name = p.name.toLowerCase();
    if (name.startsWith(q)) {
      if (prefix.length < limit) prefix.push(p);
    } else if (name.includes(q)) {
      if (infix.length < limit) infix.push(p);
    }
    if (prefix.length >= limit && infix.length >= limit) break;
  }
  return [...prefix, ...infix].slice(0, limit);
}

// Guest roster persistence: sessionStorage, matching the Start/Sit guest
// convention — a guest is a single-session notion that clears with the tab.
const GUEST_FINDER_A_KEY = 'guest-trade-finder-team-a';
const GUEST_FINDER_B_KEY = 'guest-trade-finder-team-b';
const START_SIT_ROSTER_KEY = 'guest-start-sit-roster';

function loadGuestIds(key: string, fallbackKey?: string): string[] {
  const read = (k: string): string[] => {
    try {
      const raw = sessionStorage.getItem(k);
      if (!raw) return [];
      const ids = JSON.parse(raw) as unknown;
      if (!Array.isArray(ids)) return [];
      const valid = new Set(POOL.players.map(p => p.id));
      return ids.filter(
        (id): id is string => typeof id === 'string' && valid.has(id),
      );
    } catch {
      return [];
    }
  };
  const ids = read(key);
  // "Your team" pre-fills from the Start/Sit guest roster so a returning
  // guest doesn't re-enter it.
  return ids.length > 0 || !fallbackKey ? ids : read(fallbackKey);
}

function RosterBuilder({
  idPrefix,
  title,
  hint,
  ids,
  onAdd,
  onRemove,
}: {
  idPrefix: string;
  title: string;
  hint: string;
  ids: string[];
  onAdd: (p: PoolPlayer) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const exclude = useMemo(() => new Set(ids), [ids]);
  const results = useMemo(() => searchPool(query, exclude), [query, exclude]);
  const roster = useMemo(() => {
    const byId = new Map(POOL.players.map(p => [p.id, p]));
    return ids
      .map(id => byId.get(id))
      .filter((p): p is PoolPlayer => p !== undefined);
  }, [ids]);
  const inputId = `${idPrefix}-player-search`;
  const hintId = `${idPrefix}-search-hint`;

  return (
    <section className={styles.builder} aria-label={title}>
      <h2 className={styles.builderTitle}>{title}</h2>
      <label htmlFor={inputId} className={styles.searchLabel}>
        Add players to {title.toLowerCase()}
      </label>
      <input
        id={inputId}
        type="search"
        className={styles.searchInput}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Type a player name…"
        autoComplete="off"
        aria-describedby={hintId}
      />
      <p id={hintId} className={styles.searchHint}>
        {hint}
      </p>
      {results.length > 0 && (
        <ul className={styles.searchResults} aria-label={`Matching players for ${title}`}>
          {results.map(p => (
            <li key={p.id}>
              <button
                type="button"
                className={styles.searchResult}
                onClick={() => {
                  onAdd(p);
                  setQuery('');
                }}
                aria-label={`Add ${p.name} to ${title}`}
              >
                {p.name} <PosBadge pos={p.pos} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {roster.length > 0 && (
        <>
          <h3 className={styles.rosterTitle}>
            {title} · {roster.length} player{roster.length === 1 ? '' : 's'}
          </h3>
          <ul className={styles.rosterList} aria-label={title}>
            {roster.map(p => (
              <li key={p.id} className={styles.rosterItem}>
                <span>
                  {p.name} <PosBadge pos={p.pos} />
                </span>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => onRemove(p.id)}
                  aria-label={`Remove ${p.name} from ${title}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function GuestTradeFinder() {
  const location = useLocation();

  const [aIds, setAIds] = useState<string[]>(() =>
    loadGuestIds(GUEST_FINDER_A_KEY, START_SIT_ROSTER_KEY),
  );
  const [bIds, setBIds] = useState<string[]>(() =>
    loadGuestIds(GUEST_FINDER_B_KEY),
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(GUEST_FINDER_A_KEY, JSON.stringify(aIds));
    } catch {
      // Private-mode / quota / disabled storage: in-memory state still works.
    }
  }, [aIds]);
  useEffect(() => {
    try {
      sessionStorage.setItem(GUEST_FINDER_B_KEY, JSON.stringify(bIds));
    } catch {
      // Private-mode / quota / disabled storage: in-memory state still works.
    }
  }, [bIds]);

  const addA = (p: PoolPlayer) =>
    setAIds(ids => (ids.includes(p.id) ? ids : [...ids, p.id]));
  const addB = (p: PoolPlayer) =>
    setBIds(ids => (ids.includes(p.id) ? ids : [...ids, p.id]));
  const removeA = (id: string) => setAIds(ids => ids.filter(x => x !== id));
  const removeB = (id: string) => setBIds(ids => ids.filter(x => x !== id));

  // Synthetic two-team league for the finder. resolvePoolPlayer matches
  // roster entries by pool id, so the pool players resolve to themselves.
  const guestLeague = useMemo((): League => {
    const byId = new Map(POOL.players.map(p => [p.id, p]));
    const makeTeam = (id: string, name: string, ids: string[]): Team => ({
      id,
      name,
      roster: ids
        .map(rid => byId.get(rid))
        .filter((p): p is PoolPlayer => p !== undefined) as unknown as Player[],
    });
    return {
      id: 'guest-trade-finder',
      platform: 'sleeper',
      name: 'Guest trade finder',
      season: POOL_SEASON,
      draftType: 'snake',
      teams: [makeTeam('guest-a', 'Your team', aIds), makeTeam('guest-b', 'Trade partner', bIds)],
      scoringType: 'ppr',
      totalTeams: 2,
      isLoaded: true,
      rosterSlots: DEFAULT_MANUAL_SHAPE,
      isGuest: true,
    };
  }, [aIds, bIds]);

  const ready = aIds.length > 0 && bIds.length > 0;
  const candidates = useMemo(
    () =>
      ready
        ? findTradeCandidates(
            guestLeague,
            POOL,
            DEFAULT_VOR_CONFIG,
            valueLeagueFor(null),
          )
        : [],
    [guestLeague, ready],
  );

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Trade Finder</h1>
          <p className={styles.subtitle}>
            No league connected — build the two rosters below
          </p>
        </div>

        <div className={styles.builders}>
          <RosterBuilder
            idPrefix="guest-finder-a"
            title="Your team"
            hint="Search the player pool — values come from TraderApe's projections, no account needed."
            ids={aIds}
            onAdd={addA}
            onRemove={removeA}
          />
          <RosterBuilder
            idPrefix="guest-finder-b"
            title="Trade partner"
            hint="Enter the other manager's roster — the finder only proposes swaps that help both sides."
            ids={bIds}
            onAdd={addB}
            onRemove={removeB}
          />
        </div>

        <CandidateList
          candidates={candidates}
          search={location.search}
          includeTeamIds={false}
          emptyText={
            ready
              ? 'No win-win swaps right now — no position lines up with complementary needs and depth.'
              : 'Add players to both rosters above to see win-win swaps.'
          }
        />

        <p className={styles.footnote}>
          Method: value from projected-points VOR on the standard 10-team
          full-PPR shape; a swap is proposed only when the sides are within
          25% on VOR and neither team's starting value goes backwards —
          depth swaps leave every starter untouched, while star-for-star
          swaps are allowed only when each team nets an upgrade at its
          starting lineup. Needs and surplus are priced against the median
          of the two entered rosters.
        </p>
      </div>
    </div>
  );
}

export function TradeFinderPage({ league }: TradeFinderPageProps) {
  useEffect(() => {
    document.title = 'Trade Finder · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);
  const location = useLocation();

  // League mode only; the guest branch below renders GuestTradeFinder.
  const candidates = useMemo(
    () => (league && !league.isGuest ? findTradeCandidates(league) : []),
    [league],
  );

  if (!league || league.isGuest === true) {
    return <GuestTradeFinder />;
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Trade Finder</h1>
          <DataAsOf syncedAt={league.pinSyncedAt} />
          <p className={styles.subtitle}>
            Win-win swaps between {league.totalTeams || league.teams.length} teams
          </p>
        </div>

        <CandidateList
          candidates={candidates}
          search={location.search}
          includeTeamIds
          emptyText="No win-win swaps right now — no team pair lines up with complementary needs and depth."
        />

        <p className={styles.footnote}>
          Method: value from projected-points VOR for your league's shape; a
          swap is proposed only when the sides are within 25% on VOR and
          neither team's starting value goes backwards — depth swaps leave
          every starter untouched, while star-for-star swaps are allowed only
          when each team nets an upgrade at its starting lineup. Needs and
          surplus are priced against the league median at each position.
        </p>
      </div>
    </div>
  );
}
