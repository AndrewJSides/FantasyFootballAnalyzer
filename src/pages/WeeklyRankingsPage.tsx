// Week-N Projections board (backlog item 30): every startable QB/RB/WR/TE
// ranked by THIS week's TraderApe projection (recency-weighted form +
// matchup blend) — the browsable-board answer to the weekly "who are this
// week's top plays at my position" question. League mode flags ownership;
// guest mode is owner-free. Priced on Sleeper's free weekly stats in both
// modes (same as the Compare page), full-PPR. FantasyPros publishes
// "Weekly Rankings" pages (researched for feature shape only); this is
// computed from TraderApe's own data, no copied content.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PosBadge } from '@/components';
import { fetchWeeklyPprPoints, type WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { POOL } from '@/data/draftPool';
import type { League } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
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
import styles from './WeeklyRankingsPage.module.css';

type PosFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE';

const FILTERS: PosFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];

type WeeklyState = 'loading' | 'ready' | 'error';

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
// Trade Analyzer pages use — the player's week-N opponent and that
// opponent's points allowed vs the position from completed weeks.
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

// Item-20 consistency verdict on the weekly board: the same Steady/Mixed/
// Volatile rating the Player Journey page shows, priced on this player's
// completed weeks. Steady = low week-to-week variance, Volatile = high.
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

export function WeeklyRankingsPage({
  league,
  pool: poolOverride,
}: {
  league: League;
  /** Test override: a synthetic pool replaces the bundled one. */
  pool?: DraftPoolFile;
}) {
  const [pos, setPos] = useState<PosFilter>('ALL');
  const [pool] = useState(() => poolOverride ?? POOL);
  const [weekly, setWeekly] = useState<WeeklyPprPoints | undefined>(undefined);
  const [weeklyState, setWeeklyState] = useState<WeeklyState>('loading');

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

  const owners = useMemo(
    () => (live && weeklyState === 'ready' ? leagueOwnerMap(league, pool) : undefined),
    [league, live, pool, weeklyState],
  );

  const rows = useMemo(
    () =>
      buildWeeklyRankings({
        pool,
        weekly,
        currentWeek: week,
        ownerByPoolId: owners,
      }),
    [pool, weekly, week, owners],
  );

  const filtered = useMemo(() => {
    if (pos === 'ALL') {
      // Flex-style board: interleave all positions by this week's projection,
      // unprojected players sinking to the bottom (same convention as the
      // engine's within-position order).
      return [...rows].sort(
        (a, b) =>
          (a.projection === null ? 1 : 0) - (b.projection === null ? 1 : 0) ||
          (b.projection ?? -1) - (a.projection ?? -1) ||
          (b.ppg ?? -1) - (a.ppg ?? -1) ||
          (a.player.overallRank ?? 9999) - (b.player.overallRank ?? 9999),
      );
    }
    return rows.filter(r => r.player.pos === pos);
  }, [rows, pos]);

  const [dataStart, dataEnd] = matchupDataWeeks();

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Weekly Rankings</h1>
          <p className={styles.subtitle}>
            Every startable player ranked by TraderApe&apos;s own projection for
            week {week} — not a consensus board.
          </p>
        </div>

        <div className={styles.filterBar} role="group" aria-label="Filter by position">
          {FILTERS.map(f => (
            <button
              key={f}
              type="button"
              className={`${styles.filterButton} ${pos === f ? styles.active : ''}`}
              aria-pressed={pos === f}
              onClick={() => setPos(f)}
            >
              {f}
            </button>
          ))}
        </div>

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
          <section aria-label={`Weekly rankings for week ${week}${pos === 'ALL' ? '' : `, ${pos}s`}`}>
            <div className={styles.tableWrap} aria-live="polite">
              {filtered.length === 0 ? (
                <p className={styles.status} role="status">
                  No weekly projection data for this filter.
                </p>
              ) : (
                <table className={styles.table}>
                  <caption className={styles.caption}>
                    Week {week} rankings
                    {pos === 'ALL' ? ' — all positions, top 40 each' : ` — ${pos}, top 40`}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Player</th>
                      <th scope="col">Pos</th>
                      <th scope="col">NFL</th>
                      <th scope="col">
                        <abbr title={`TraderApe's projected fantasy points for week ${week}`}>
                          Wk {week} Proj
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Points per game over completed weeks">PPG</abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Average points over the last three completed weeks">Last 3</abbr>
                      </th>
                      <th scope="col">Matchup</th>
                      <th scope="col">
                        <abbr title="Week-to-week reliability from the player's completed weeks: floor/ceiling percentiles, boom and bust week counts">
                          Consistency
                        </abbr>
                      </th>
                      {live && <th scope="col">Owner</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => {
                      const tag = injuryTag(r.player);
                      return (
                        <tr key={r.player.id}>
                          <td className={styles.rank}>{pos === 'ALL' ? i + 1 : r.posRank}</td>
                          <th scope="row" className={styles.playerCell}>
                            {r.player.name}
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
                            <PosBadge pos={r.player.pos} />
                          </td>
                          <td className={styles.mono}>{r.player.team}</td>
                          <td className={styles.num}>{fmt(r.projection)}</td>
                          <td className={styles.num}>{fmt(r.ppg)}</td>
                          <td className={styles.num}>{fmt(r.last3)}</td>
                          <MatchupCell team={r.player.team} pos={r.player.pos} week={week} />
                          <ConsistencyCell row={r} />
                          {live && (
                            <td className={styles.owner}>
                              {r.owner ?? <span className={styles.freeAgent}>Free agent</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className={styles.footnote}>
              Week {week} projections come from TraderApe&apos;s weekly model
              (recency-weighted last-4 form blended with the season baseline,
              nudged by this week&apos;s matchup difficulty), priced on full-PPR
              scoring from Sleeper&apos;s free weekly stats. Matchup ratings are
              priced on the opponent&apos;s fantasy points allowed per position
              over weeks {dataStart}–{dataEnd}. Consistency reuses the
              Player Journey boom/bust engine (P25 floor / P75 ceiling, TraderApe&apos;s
              own per-position bars). Players on bye this week are
              excluded. Top 40 per position. Trade research only — nothing here
              moves a roster.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
