import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { League, Player, Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { POOL_SEASON } from '@/data/draftPoolMeta';
import { DataAsOf } from '@/components/DataAsOf';
import { BuyLowSellHigh } from '@/components/BuyLowSellHigh';
import { TeamNeedsMatrix } from '@/components/TeamNeedsMatrix';
import { PosBadge } from '@/components';
import {
  findTradeCandidates,
  teamProfiles,
  type TradeCandidate,
} from '@/utils/tradeFinder';
import { shopOffers } from '@/utils/shopPlayer';
import { partnerDealLine, rankTradePartners } from '@/utils/tradePartners';
import { tradeLink } from '@/utils/tradeLinks';
import { valueLeagueFor, DEFAULT_MANUAL_SHAPE } from '@/utils/tradeAnalysis';
import { DEFAULT_VOR_CONFIG } from '@/utils/projectionValues';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  marketTargets,
  type MarketTarget,
} from '@/utils/buyLowSellHigh';
import {
  fetchWeeklyPprPoints,
  type WeeklyPprPoints,
} from '@/api/sleeperWeeklyPoints';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
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

// Item-130 Sleeper projection value: Sleeper's own week-N projection next
// to TraderApe's VOR, so a proposed swap can be checked against the market
// number. A pending or failed fetch just leaves dashes — the cards never
// wait on it, and proposals still count VOR rows only.
function SleeperValue({
  player,
  projections,
  ready,
  week,
}: {
  player: PoolPlayer;
  projections: Record<string, number> | undefined;
  ready: boolean;
  week: number;
}) {
  const sid = player.sleeperId;
  const value = ready && sid ? projections?.[String(sid)] : undefined;
  if (value === undefined) {
    return (
      <span
        className={styles.sleeper}
        aria-label={
          ready
            ? 'No Sleeper projection for this player'
            : 'Sleeper projection not loaded'
        }
      >
        —
      </span>
    );
  }
  const label = `Sleeper projection ${value.toFixed(1)} for week ${week}`;
  return (
    <span className={styles.sleeper} title={label} aria-label={label}>
      {value.toFixed(1)}
    </span>
  );
}

function CandidateList({
  candidates,
  search,
  includeTeamIds,
  emptyText,
  sleeperProjections,
  sleeperReady,
  week,
}: {
  candidates: TradeCandidate[];
  search: string;
  includeTeamIds: boolean;
  emptyText: string;
  sleeperProjections: Record<string, number> | undefined;
  sleeperReady: boolean;
  week: number;
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
                          <SleeperValue
                            player={p}
                            projections={sleeperProjections}
                            ready={sleeperReady}
                            week={week}
                          />
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
                          <SleeperValue
                            player={p}
                            projections={sleeperProjections}
                            ready={sleeperReady}
                            week={week}
                          />
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

// Buy Low / Sell High targets panel (backlog item 16): regression targets
// from TraderApe's own forward projection vs last-3 actuals. The wrapper
// announces the in-place swap for guest mode, where the weekly data loads
// after the page renders.
function MarketTargetsPanel({
  targets,
  week,
  showRosteredBy,
}: {
  targets: { buyLow: MarketTarget[]; sellHigh: MarketTarget[] } | null;
  week: number;
  showRosteredBy: boolean;
}) {
  if (!targets) return null;
  return (
    <div aria-live="polite">
      <BuyLowSellHigh
        week={week}
        buyLow={targets.buyLow}
        sellHigh={targets.sellHigh}
        showRosteredBy={showRosteredBy}
      />
    </div>
  );
}

// League mode: map pool players back to their league roster entries so the
// weekly points (keyed by platform player id) resolve and the owning team
// is named on each target.
function leagueRosterMaps(league: League): {
  platformIdByPoolId: Map<string, string>;
  teamByPoolId: Map<string, string>;
} {
  const index = indexPool(POOL);
  const platformIdByPoolId = new Map<string, string>();
  const teamByPoolId = new Map<string, string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p as Player, index);
      if (!resolved) continue;
      if (p.platformId) platformIdByPoolId.set(resolved.id, p.platformId);
      teamByPoolId.set(resolved.id, team.name);
    }
  }
  return { platformIdByPoolId, teamByPoolId };
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
  const removeA = (id: string) => {
    setAIds(ids => ids.filter(x => x !== id));
    // A shopped player who leaves the roster unpicks the shop lookup.
    setShopPlayerId(prev => (prev === id ? '' : prev));
  };
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

  // --- Shop a player (backlog item 90 remainder): guest-mode reverse
  // lookup. The synthetic two-team league runs through the same shopOffers
  // engine as league mode; the shopped player always comes from "Your team".
  const [shopPlayerId, setShopPlayerId] = useState('');
  const shopRoster = useMemo(() => {
    const byId = new Map(POOL.players.map(p => [p.id, p]));
    return aIds
      .map(id => byId.get(id))
      .filter(
        (p): p is PoolPlayer =>
          p !== undefined && ['QB', 'RB', 'WR', 'TE'].includes(p.pos),
      );
  }, [aIds]);
  const shopPlayerName = useMemo(
    () => shopRoster.find(p => p.id === shopPlayerId)?.name ?? '',
    [shopRoster, shopPlayerId],
  );
  const shopOffersList = useMemo(
    () =>
      shopPlayerId
        ? shopOffers(
            guestLeague,
            shopPlayerId,
            POOL,
            DEFAULT_VOR_CONFIG,
            valueLeagueFor(null),
          )
        : [],
    [guestLeague, shopPlayerId],
  );

  // --- Guest weekly data for Buy Low / Sell High: Sleeper public stats ---
  const [guestWeek] = useState(() => currentWeekEstimate());
  const [guestWeekly, setGuestWeekly] = useState<WeeklyPprPoints | null>(null);
  const [guestWeeklyState, setGuestWeeklyState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  useEffect(() => {
    let cancelled = false;
    setGuestWeeklyState('loading');
    // A guest league's season is the pool season; score completed weeks only.
    fetchWeeklyPprPoints(guestLeague.season, guestWeek - 1)
      .then(r => {
        if (cancelled) return;
        if (!r || r.weeks.length === 0) {
          setGuestWeeklyState('error');
        } else {
          setGuestWeekly(r);
          setGuestWeeklyState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setGuestWeeklyState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [guestLeague.season, guestWeek]);

  // Sleeper projection values (backlog item 130): one no-auth request
  // shared across every proposal card; silent degrade to dashes on
  // failure, exactly like the Trade Analyzer's item-129 values.
  const [sleeperProjections, setSleeperProjections] = useState<
    Record<string, number> | undefined
  >(undefined);
  const [sleeperReady, setSleeperReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchSleeperWeekProjections(guestLeague.season, guestWeek)
      .then(data => {
        if (!cancelled) {
          setSleeperProjections(data);
          setSleeperReady(true);
        }
      })
      .catch(() => {
        // Silent degrade: dashes, the cards still grade on VOR.
      });
    return () => {
      cancelled = true;
    };
  }, [guestLeague.season, guestWeek]);

  const market = useMemo(
    () =>
      guestWeekly
        ? marketTargets({
            poolPlayers: POOL.players,
            weeklyPoints: guestWeekly.pointsBySleeperId,
            currentWeek: guestWeek,
            valueLeague: valueLeagueFor(null),
            vorCfg: DEFAULT_VOR_CONFIG,
          })
        : null,
    [guestWeekly, guestWeek],
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
          sleeperProjections={sleeperProjections}
          sleeperReady={sleeperReady}
          week={guestWeek}
        />

        {aIds.length > 0 && (
          <section className={styles.shop} aria-label="Shop a player">
            <h2 className={styles.shopTitle}>Shop a player</h2>
            <p className={styles.shopIntro}>
              Want to move someone before the deadline? Pick one of your
              players — the finder shows what the trade partner would send
              back, ranked by what it does for your starters.
            </p>
            <div className={styles.shopControls}>
              <div className={styles.shopField}>
                <label
                  htmlFor="guest-shop-player"
                  className={styles.shopLabel}
                >
                  Your player
                </label>
                <select
                  id="guest-shop-player"
                  className={styles.shopSelect}
                  value={shopPlayerId}
                  onChange={e => setShopPlayerId(e.target.value)}
                >
                  <option value="">Choose a player…</option>
                  {shopRoster.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.pos.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {shopPlayerId && (
              <CandidateList
                candidates={shopOffersList}
                search={location.search}
                includeTeamIds={false}
                emptyText={`No fair offers for ${shopPlayerName} right now — no deal with the trade partner lines up at a fair price.`}
                sleeperProjections={sleeperProjections}
                sleeperReady={sleeperReady}
                week={guestWeek}
              />
            )}
          </section>
        )}

        {guestWeeklyState === 'loading' && (
          <p className={styles.footnote} aria-live="polite">
            Loading weekly stats for the Buy Low / Sell High targets…
          </p>
        )}
        <MarketTargetsPanel
          targets={market}
          week={guestWeek}
          showRosteredBy={false}
        />

        <p className={styles.footnote}>
          Method: value from projected-points VOR on the standard 10-team
          full-PPR shape; a swap is proposed only when the sides are within
          25% on VOR and neither team's starting value goes backwards —
          depth swaps leave every starter untouched, while star-for-star
          swaps are allowed only when each team nets an upgrade at its
          starting lineup. Needs and surplus are priced against the median
          of the two entered rosters. The dim number beside each VOR is
          Sleeper's own week-{guestWeek} projection where published; a dash
          means no Sleeper line for that player, and the proposal counts
          VOR rows only.
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
  const currentWeek = useMemo(
    () =>
      league && !league.isGuest
        ? (league.currentWeek ?? currentWeekEstimate())
        : currentWeekEstimate(),
    [league],
  );
  const rosterMaps = useMemo(
    () => (league && !league.isGuest ? leagueRosterMaps(league) : null),
    [league],
  );

  // Sleeper projection values (backlog item 130): one no-auth request
  // shared across every proposal card; silent degrade to dashes on
  // failure, exactly like the Trade Analyzer's item-129 values. Placed
  // before the guest early-return below so hook order stays stable.
  const sleeperSeason = league?.season ?? POOL_SEASON;
  const [sleeperProjections, setSleeperProjections] = useState<
    Record<string, number> | undefined
  >(undefined);
  const [sleeperReady, setSleeperReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchSleeperWeekProjections(sleeperSeason, currentWeek)
      .then(data => {
        if (!cancelled) {
          setSleeperProjections(data);
          setSleeperReady(true);
        }
      })
      .catch(() => {
        // Silent degrade: dashes, the cards still grade on VOR.
      });
    return () => {
      cancelled = true;
    };
  }, [sleeperSeason, currentWeek]);
  const market = useMemo(
    () =>
      league && !league.isGuest && league.playerWeeklyPoints && rosterMaps
        ? marketTargets({
            poolPlayers: POOL.players,
            weeklyPoints: league.playerWeeklyPoints,
            platformIdByPoolId: rosterMaps.platformIdByPoolId,
            teamByPoolId: rosterMaps.teamByPoolId,
            currentWeek,
            valueLeague: valueLeagueFor(league),
            vorCfg: DEFAULT_VOR_CONFIG,
          })
        : null,
    [league, currentWeek, rosterMaps],
  );

  // --- Shop a player (backlog item 90): reverse trade lookup ---
  const profiles = useMemo(
    () =>
      league && !league.isGuest
        ? teamProfiles(league, POOL, DEFAULT_VOR_CONFIG, valueLeagueFor(league))
        : [],
    [league],
  );
  const defaultShopTeamId = useMemo(
    () =>
      league && !league.isGuest
        ? (league.teams.find(t => t.isMyTeam)?.id ?? league.teams[0]?.id ?? '')
        : '',
    [league],
  );
  const [shopTeamId, setShopTeamId] = useState(defaultShopTeamId);
  const [shopPlayerId, setShopPlayerId] = useState('');

  // The chosen team's pool players, grouped by position (the finder's
  // depth charts already resolve league roster entries to pool players).
  const shopRoster = useMemo(() => {
    const prof = profiles.find(p => p.team.id === shopTeamId);
    if (!prof) return [];
    const seen = new Set<string>();
    const out: PoolPlayer[] = [];
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      for (const p of prof.positions[pos].depthChart) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
      }
    }
    return out;
  }, [profiles, shopTeamId]);

  const shopPlayerName = useMemo(
    () => shopRoster.find(p => p.id === shopPlayerId)?.name ?? '',
    [shopRoster, shopPlayerId],
  );

  const offers = useMemo(
    () =>
      league && !league.isGuest && shopPlayerId
        ? shopOffers(
            league,
            shopPlayerId,
            POOL,
            DEFAULT_VOR_CONFIG,
            valueLeagueFor(league),
          )
        : [],
    [league, shopPlayerId],
  );

  // --- Ranked trade partners (backlog item 93): "who should I call first" ---
  const shopTeamName = useMemo(
    () =>
      league && !league.isGuest
        ? (league.teams.find(t => t.id === shopTeamId)?.name ?? '')
        : '',
    [league, shopTeamId],
  );
  const partners = useMemo(
    () =>
      league && !league.isGuest && shopTeamId
        ? rankTradePartners(candidates, shopTeamId)
        : [],
    [league, candidates, shopTeamId],
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
          sleeperProjections={sleeperProjections}
          sleeperReady={sleeperReady}
          week={currentWeek}
        />

        <TeamNeedsMatrix profiles={profiles} />

        <section className={styles.shop} aria-label="Shop a player">
          <h2 className={styles.shopTitle}>Shop a player</h2>
          <p className={styles.shopIntro}>
            Want to move someone before the deadline? Pick a player — the
            finder shows which teams want him and what they'd send back,
            ranked by what it does for your starters.
          </p>
          <div className={styles.shopControls}>
            <div className={styles.shopField}>
              <label htmlFor="shop-team" className={styles.shopLabel}>
                Team
              </label>
              <select
                id="shop-team"
                className={styles.shopSelect}
                value={shopTeamId}
                onChange={e => {
                  setShopTeamId(e.target.value);
                  setShopPlayerId('');
                }}
              >
                {(league.teams ?? []).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.shopField}>
              <label htmlFor="shop-player" className={styles.shopLabel}>
                Player
              </label>
              <select
                id="shop-player"
                className={styles.shopSelect}
                value={shopPlayerId}
                onChange={e => setShopPlayerId(e.target.value)}
              >
                <option value="">Choose a player…</option>
                {shopRoster.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.pos.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {shopPlayerId && (
            <CandidateList
              candidates={offers}
              search={location.search}
              includeTeamIds
              emptyText={`No fair offers for ${shopPlayerName} right now — no team lines up with a need at his position plus a return that keeps your starters intact.`}
              sleeperProjections={sleeperProjections}
              sleeperReady={sleeperReady}
              week={currentWeek}
            />
          )}
        </section>

        <section className={styles.shop} aria-label="Trade partners">
          <h2 className={styles.shopTitle}>Trade partners</h2>
          <p className={styles.shopIntro}>
            Who should you call first? Every rival ranked by how many
            win-win deals the finder sees with {shopTeamName || 'this team'} —
            strongest mutual fit at the top, with the best deal each way.
          </p>
          {partners.length === 0 ? (
            <p className={styles.partnerEmpty}>
              No win-win deals involving {shopTeamName || 'this team'} right
              now — no rival's needs and depth line up at a fair price.
            </p>
          ) : (
            <table
              className={styles.partnerTable}
              aria-label={`Trade partners for ${shopTeamName}`}
            >
              <caption className="visually-hidden">
                Rival teams ranked by win-win trade fit with {shopTeamName}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Team</th>
                  <th scope="col">Win-win deals</th>
                  <th scope="col">Best deal</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((row, i) => {
                  const line = partnerDealLine(row.best, shopTeamId);
                  return (
                    <tr key={row.team.id}>
                      <th scope="row" className={styles.partnerCount}>
                        {i + 1}
                      </th>
                      <td className={styles.partnerTeam}>{row.team.name}</td>
                      <td className={styles.partnerCount}>
                        {row.candidateCount}
                      </td>
                      <td
                        className={styles.partnerDeal}
                        aria-label={`Best deal with ${row.team.name}: you give ${line.give.join(', ')} and get ${line.get.join(', ')}`}
                      >
                        Give {line.give.join(', ')} → get {line.get.join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <MarketTargetsPanel
          targets={market}
          week={currentWeek}
          showRosteredBy
        />

        <p className={styles.footnote}>
          Method: value from projected-points VOR for your league's shape; a
          swap is proposed only when the sides are within 25% on VOR and
          neither team's starting value goes backwards — depth swaps leave
          every starter untouched, while star-for-star swaps are allowed only
          when each team nets an upgrade at its starting lineup. Needs and
          surplus are priced against the league median at each position.
          The dim number beside each VOR is Sleeper's own week-{currentWeek}
          projection where published; a dash means no Sleeper line for that
          player, and the proposal counts VOR rows only.
        </p>
      </div>
    </div>
  );
}
