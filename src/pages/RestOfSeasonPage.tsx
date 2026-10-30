// Rest-of-Season Rankings (backlog item 21): rank every startable
// QB/RB/WR/TE by TraderApe's own season-outlook engine — projected points
// from the current week through week 17. League mode blends each drafted
// player's scoring pace with his season projection and flags ownership;
// guest mode degrades to season projections on the guest's scoring shape,
// owner-free. FantasyPros/Yahoo/ESPN publish "rest of season" ranks
// (researched for feature shape only); these are computed from
// TraderApe's own data, no copied content.
import { useMemo, useState } from 'react';
import { PosBadge } from '@/components';
import { POOL } from '@/data/draftPool';
import { WEEKLY_SHAPE } from '@/data/weeklyShape';
import type { League } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { currentWeekEstimate } from '@/utils/matchupRating';
import { buildRosRankings, leagueOwnerMap, type RosRow } from '@/utils/rosRankings';
import { injuryOf } from '@/utils/seasonOutlook';
import styles from './RestOfSeasonPage.module.css';

type PosFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE';

const FILTERS: PosFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];

function fmt(n: number | null | undefined, digits = 1): string {
  return n == null ? '—' : n.toFixed(digits);
}

function perGame(row: RosRow): number | null {
  const o = row.outlook;
  if (o.perGame != null) return o.perGame;
  return o.projectedGames > 0 ? o.projectedPoints / o.projectedGames : null;
}

function injuryTag(player: PoolPlayer): string | null {
  const info = injuryOf(player);
  if (!info) return null;
  if (info.seasonEnding || info.outNow) return player.injuryStatus ?? 'OUT';
  return null;
}

export function RestOfSeasonPage({
  league,
  pool: poolOverride,
}: {
  league: League;
  /** Test override: a synthetic pool replaces the bundled one. */
  pool?: DraftPoolFile;
}) {
  const [pos, setPos] = useState<PosFilter>('ALL');
  const [pool] = useState(() => poolOverride ?? POOL);

  const live = league.status === 'live' && league.currentWeek != null;
  const rows = useMemo(() => {
    const picks = live ? league.teams.flatMap(t => t.draftPicks ?? []) : [];
    const owners = live ? leagueOwnerMap(league, pool) : undefined;
    return buildRosRankings({
      pool,
      shape: pool.season === WEEKLY_SHAPE.season ? WEEKLY_SHAPE : undefined,
      scoring: league.scoringType,
      slots: league.rosterSlots,
      teamCount: league.totalTeams || 10,
      currentWeek: live ? (league.currentWeek as number) : currentWeekEstimate(),
      season: pool.season,
      passTdPoints: league.passTdPoints,
      tePremiumPerReception: league.tePremiumPerReception,
      gamesPlayed:
        live && league.gamesPlayed && league.gamesPlayed.season === league.season
          ? league.gamesPlayed
          : undefined,
      platform: league.platform,
      picks,
      ownerByPoolId: owners,
    });
  }, [league, live, pool]);

  const filtered = useMemo(
    () =>
      pos === 'ALL'
        ? [...rows].sort((a, b) => b.outlook.projectedPoints - a.outlook.projectedPoints)
        : rows.filter(r => r.player.pos === pos),
    [rows, pos],
  );

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Rest-of-Season Rankings</h1>
          <p className={styles.subtitle}>
            {live
              ? `Every startable player ranked by projected points from week ${league.currentWeek} through week 17 — pace blended with season projection.`
              : 'Every startable player ranked by projected points from here through week 17, on season projections.'}
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

        <section aria-label={`Rest-of-season rankings${pos === 'ALL' ? '' : `, ${pos}s`}`}>
          <div className={styles.tableWrap} aria-live="polite">
            {filtered.length === 0 ? (
              <p className={styles.status} role="status">
                No rest-of-season data for this filter.
              </p>
            ) : (
              <table className={styles.table}>
                <caption className={styles.caption}>
                  Rest-of-season rankings
                  {pos === 'ALL' ? ' — all positions, top 40 each' : ` — ${pos}, top 40`}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Player</th>
                    <th scope="col">Pos</th>
                    <th scope="col">NFL</th>
                    <th scope="col">Bye</th>
                    <th scope="col">
                      <abbr title="Projected fantasy points from the current week through week 17">ROS&nbsp;Pts</abbr>
                    </th>
                    <th scope="col">
                      <abbr title="Projected points per game over the rest of the season">/Gm</abbr>
                    </th>
                    <th scope="col">
                      <abbr title="Weeks he is expected to play from here on">Gms</abbr>
                    </th>
                    {live && <th scope="col">Owner</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const tag = injuryTag(r.player);
                    return (
                      <tr key={r.player.id}>
                        <td className={styles.rank}>{i + 1}</td>
                        <th scope="row" className={styles.playerCell}>
                          {r.player.name}
                          {tag && (
                            <span
                              className={styles.injuryTag}
                              title={r.outlook.injury ?? tag}
                              aria-label={`Injured: ${r.outlook.injury ?? tag}`}
                            >
                              {tag}
                            </span>
                          )}
                        </th>
                        <td>
                          <PosBadge pos={r.player.pos} />
                        </td>
                        <td className={styles.mono}>{r.player.team}</td>
                        <td className={styles.mono}>{r.player.bye ?? '—'}</td>
                        <td className={styles.num}>{fmt(r.outlook.projectedPoints)}</td>
                        <td className={styles.num}>{fmt(perGame(r))}</td>
                        <td className={styles.num}>{r.outlook.projectedGames}</td>
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
            {live
              ? `ROS points blend each player's scoring pace with his season projection, priced on your league's ${league.scoringType} scoring; a season-ending injury zeroes the rest of the year. Ownership comes from your league's rosters.`
              : `ROS points come from TraderApe's season-outlook engine on season projections (your league's ${league.scoringType} scoring); a season-ending injury zeroes the rest of the year.`}{' '}
            Top 40 per position. Trade research only — nothing here moves a roster.
          </p>
        </section>
      </div>
    </div>
  );
}
