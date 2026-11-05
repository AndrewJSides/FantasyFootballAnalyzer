// Player Watchlist (backlog item 52): the manager's personal "my guys"
// list — trade targets, stash candidates, boom/bust starters to keep an
// eye on — with this week's TraderApe projection, matchup chip, injury
// tag, consistency verdict, and owner per player. Persists in
// localStorage so it survives the week. Works in league and guest mode
// (Yahoo's Watch List is the competitor reference, researched for feature
// shape only; everything here is computed from TraderApe's own data).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PosBadge } from '@/components';
import { fetchWeeklyPprPoints, type WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import { POOL } from '@/data/draftPool';
import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import {
  currentWeekEstimate,
  getMatchupRating,
  matchupDataWeeks,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { leagueOwnerMap } from '@/utils/rosRankings';
import { injuryOf } from '@/utils/seasonOutlook';
import { buildWeeklyRankings, type WeeklyRankRow } from '@/utils/weeklyRankings';
import {
  loadWatchlist,
  saveWatchlist,
  toggleWatchlistId,
} from '@/utils/watchlist';
import styles from './WatchlistPage.module.css';

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

const VALID_IDS = new Set(POOL.players.map(p => p.id));

function searchPool(query: string, watched: Set<string>, limit = 8): PoolPlayer[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const prefix: PoolPlayer[] = [];
  const infix: PoolPlayer[] = [];
  for (const p of POOL.players) {
    if (watched.has(p.id) || !SKILL_POSITIONS.has(p.pos)) continue;
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

function fmt(n: number | null | undefined, digits = 1): string {
  return n == null ? '—' : n.toFixed(digits);
}

function injuryTag(player: PoolPlayer): string | null {
  const info = injuryOf(player);
  if (!info) return null;
  if (info.seasonEnding || info.outNow) return player.injuryStatus ?? 'OUT';
  return null;
}

// The same favorable/tough/neutral rating the Rankings, Start/Sit, and
// Weekly Rankings pages use.
function MatchupCell({ team, pos, week }: { team: string; pos: string; week: number }) {
  const rating = getMatchupRating(team, pos, week);
  if (!rating)
    return (
      <td className={`${styles.num} ${styles.dim}`} aria-label="No matchup data">
        -
      </td>
    );
  const cls =
    rating.label === 'favorable'
      ? styles.muFav
      : rating.label === 'tough'
        ? styles.muTough
        : styles.muNeutral;
  const label = matchupLabel(rating, pos);
  return (
    <td className={styles.num} title={label} aria-label={label}>
      <span className={cls}>{matchupShort(rating)}</span>
    </td>
  );
}

// Item-20 consistency verdict, same as the Weekly Rankings board.
function ConsistencyCell({ row }: { row: WeeklyRankRow }) {
  const c = row.consistency;
  if (!c)
    return (
      <td className={`${styles.num} ${styles.dim}`} aria-label="Not enough games for a consistency rating">
        -
      </td>
    );
  const cls =
    c.verdict === 'Steady'
      ? styles.volSteady
      : c.verdict === 'Volatile'
        ? styles.volVolatile
        : styles.volMixed;
  const label =
    `${c.verdict}: floor ${c.floor} / ceiling ${c.ceiling} (P25–P75 of ${c.games} ` +
    `completed weeks), ${c.boomWeeks} boom and ${c.bustWeeks} bust weeks ` +
    `(boom ≥ ${c.boomBar}, bust ≤ ${c.bustBar})`;
  return (
    <td className={styles.num} title={label} aria-label={label}>
      <span className={cls}>{c.verdict}</span>
    </td>
  );
}

// Item-141 Sleeper projection cell: Sleeper's own week-N projection next to
// TraderApe's, so a watched player can be checked against the market
// number. A pending or failed fetch just leaves dashes — the list never
// waits on it.
function SleeperCell({
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
  const value = ready && sid ? projections?.[sid] : undefined;
  if (value === undefined) {
    return (
      <td
        className={`${styles.num} ${styles.dim}`}
        aria-label={
          ready
            ? 'No Sleeper projection for this player'
            : 'Sleeper projection not loaded'
        }
      >
        —
      </td>
    );
  }
  const label = `Sleeper projection ${value.toFixed(1)} for week ${week}`;
  return (
    <td className={styles.num} title={label} aria-label={label}>
      {value.toFixed(1)}
    </td>
  );
}

type WeeklyState = 'loading' | 'ready' | 'error';

export function WatchlistPage({ league }: { league: League }) {
  const [watchedIds, setWatchedIds] = useState<string[]>(() =>
    loadWatchlist(id => VALID_IDS.has(id)),
  );
  const [query, setQuery] = useState('');
  const [weekly, setWeekly] = useState<WeeklyPprPoints | undefined>(undefined);
  const [weeklyState, setWeeklyState] = useState<WeeklyState>('loading');

  useEffect(() => {
    saveWatchlist(watchedIds);
  }, [watchedIds]);

  const live = league.status === 'live' && league.currentWeek != null;
  const week = league.currentWeek ?? currentWeekEstimate();

  // Score completed weeks only; the in-progress week's partial stats would
  // halve a player's pace (same convention as Start/Sit and Compare).
  const loadWeekly = useCallback(() => {
    setWeeklyState('loading');
    fetchWeeklyPprPoints(league.season, week - 1)
      .then(r => {
        if (!r || r.weeks.length === 0) setWeeklyState('error');
        else {
          setWeekly(r);
          setWeeklyState('ready');
        }
      })
      .catch(() => setWeeklyState('error'));
  }, [league.season, week]);

  useEffect(loadWeekly, [loadWeekly]);

  // Sleeper projection column (backlog item 141): one no-auth request
  // shared across the rows; silent degrade to dashes on failure.
  const [sleeperProjections, setSleeperProjections] = useState<
    Record<string, number> | undefined
  >(undefined);
  const [sleeperReady, setSleeperReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchSleeperWeekProjections(league.season, week)
      .then(data => {
        if (!cancelled) {
          setSleeperProjections(data);
          setSleeperReady(true);
        }
      })
      .catch(() => {
        // Silent degrade: dashes, the list still prices on its own number.
      });
    return () => {
      cancelled = true;
    };
  }, [league.season, week]);

  const watchedSet = useMemo(() => new Set(watchedIds), [watchedIds]);
  const results = useMemo(() => searchPool(query, watchedSet), [query, watchedSet]);

  const owners = useMemo(
    () => (live && weeklyState === 'ready' ? leagueOwnerMap(league, POOL) : undefined),
    [league, live, weeklyState],
  );

  // Full-board pricing, indexed by player: every watched player is covered
  // even below the Weekly Rankings board's top-40 cut.
  const rowsById = useMemo(() => {
    const rows = buildWeeklyRankings({
      pool: POOL,
      weekly,
      currentWeek: week,
      ownerByPoolId: owners,
      perPosition: 1000,
    });
    return new Map(rows.map(r => [r.player.id, r]));
  }, [weekly, week, owners]);

  const byId = useMemo(() => new Map(POOL.players.map(p => [p.id, p])), []);
  const watchedPlayers = useMemo(
    () =>
      watchedIds
        .map(id => byId.get(id))
        .filter((p): p is PoolPlayer => !!p),
    [watchedIds, byId],
  );

  const addPlayer = (p: PoolPlayer) => {
    setWatchedIds(ids => toggleWatchlistId(ids, p.id));
    setQuery('');
  };
  const removePlayer = (id: string) => {
    setWatchedIds(ids => toggleWatchlistId(ids, id));
  };

  const [dataStart, dataEnd] = matchupDataWeeks();
  const inputId = 'watchlist-player-search';
  const hintId = 'watchlist-search-hint';

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Watchlist</h1>
          <p className={styles.subtitle}>
            Your guys — trade targets, stash candidates, boom-or-bust
            starters — with this week&apos;s TraderApe projection, matchup,
            and injury status in one glance. Saved on this device.
          </p>
        </div>

        <section className={styles.addBox} aria-label="Add a player to the watchlist">
          <label htmlFor={inputId} className={styles.searchLabel}>
            Add a player
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
            Quarterbacks, running backs, wide receivers, and tight ends.
            Players already on the list are hidden.
          </p>
          {results.length > 0 && (
            <ul className={styles.searchResults} aria-label="Matching players">
              {results.map(p => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.searchResult}
                    onClick={() => addPlayer(p)}
                    aria-label={`Add ${p.name}, ${p.pos}, ${p.team} to watchlist`}
                  >
                    {p.name} <PosBadge pos={p.pos} />{' '}
                    <span className={styles.resultTeam}>{p.team}</span>
                    <span className={styles.addTag} aria-hidden="true">+ Watch</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {weeklyState === 'loading' && (
          <p className={styles.status} role="status">
            Loading weekly stats…
          </p>
        )}
        {weeklyState === 'error' && (
          <p className={styles.status} role="alert">
            Couldn&apos;t load weekly stats.{' '}
            <button type="button" className={styles.retryButton} onClick={loadWeekly}>
              Retry
            </button>
          </p>
        )}

        {weeklyState === 'ready' && (
          <section aria-label="Watchlist" aria-live="polite">
            {watchedPlayers.length === 0 ? (
              <p className={styles.status} role="status">
                Your watchlist is empty — search above to add players you want
                to keep an eye on.
              </p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className={styles.caption}>
                    Watched players — week {week} outlook
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Player</th>
                      <th scope="col">Pos</th>
                      <th scope="col">NFL</th>
                      <th scope="col">
                        <abbr title={`TraderApe's projected fantasy points for week ${week}`}>
                          Wk {week} Proj
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title={`Sleeper's projected fantasy points for week ${week}`}>
                          Sleeper
                        </abbr>
                      </th>
                      <th scope="col">Matchup</th>
                      <th scope="col">
                        <abbr title="Week-to-week reliability from the player's completed weeks: floor/ceiling percentiles, boom and bust week counts">
                          Consistency
                        </abbr>
                      </th>
                      {live && <th scope="col">Owner</th>}
                      <th scope="col">
                        <span className={styles.srOnly}>Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchedPlayers.map(p => {
                      const row = rowsById.get(p.id);
                      const tag = injuryTag(p);
                      return (
                        <tr key={p.id}>
                          <th scope="row" className={styles.playerCell}>
                            <Link
                              to={`/players?player=${encodeURIComponent(p.id)}`}
                              className={styles.playerLink}
                            >
                              {p.name}
                            </Link>
                            {tag && (
                              <span
                                className={styles.injuryTag}
                                title={tag}
                                aria-label={`Injured: ${tag}`}
                              >
                                {tag}
                              </span>
                            )}
                          </th>
                          <td>
                            <PosBadge pos={p.pos} />
                          </td>
                          <td className={styles.mono}>{p.team}</td>
                          <td className={styles.num}>{fmt(row?.projection)}</td>
                          <SleeperCell
                            player={p}
                            projections={sleeperProjections}
                            ready={sleeperReady}
                            week={week}
                          />
                          <MatchupCell team={p.team} pos={p.pos} week={week} />
                          {row ? (
                            <ConsistencyCell row={row} />
                          ) : (
                            <td className={`${styles.num} ${styles.dim}`} aria-label="No weekly data">
                              -
                            </td>
                          )}
                          {live && (
                            <td className={styles.owner}>
                              {row?.owner ?? (
                                <span className={styles.freeAgent}>Free agent</span>
                              )}
                            </td>
                          )}
                          <td>
                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => removePlayer(p.id)}
                              aria-label={`Remove ${p.name} from watchlist`}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className={styles.footnote}>
              Week {week} projections come from TraderApe&apos;s weekly model
              (recency-weighted last-4 form blended with the season baseline,
              nudged by this week&apos;s matchup difficulty), priced on full-PPR
              scoring from Sleeper&apos;s free weekly stats. The Sleeper
              column shows Sleeper&apos;s own week {week} projection where
              published; a dash means no Sleeper line for that player.
              Matchup ratings
              are priced on the opponent&apos;s fantasy points allowed per
              position over weeks {dataStart}–{dataEnd}. The list is stored in
              this browser only — nothing here moves a roster.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
