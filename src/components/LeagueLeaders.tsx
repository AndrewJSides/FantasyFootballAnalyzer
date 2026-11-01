import { useMemo, useState } from 'react';
import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import type { DraftPoolFile } from '@/types/draft';
import {
  buildLeagueLeaders,
  LEADER_POSITIONS,
  type LeaderPosition,
} from '@/utils/leagueLeaders';
import styles from './LeagueLeaders.module.css';

interface LeagueLeadersProps {
  pool: DraftPoolFile;
  weekly: WeeklyPprPoints | undefined;
  currentWeek: number;
  /** League mode: pool player id -> owning fantasy team name. Absent in guest mode. */
  ownerByPoolId?: Map<string, string>;
}

// League Leaders: the season's scoring leaders per position — top 10 by
// total full-PPR points over completed weeks, with games, PPG, each
// leader's best week, and the position's biggest single-week explosion.
// Hidden until the weekly stats load (the section needs the same data as
// the rankings table above it). Guidance only: nothing here moves rosters.
export function LeagueLeaders({
  pool,
  weekly,
  currentWeek,
  ownerByPoolId,
}: LeagueLeadersProps) {
  const [position, setPosition] = useState<LeaderPosition>('RB');
  const leaders = useMemo(
    () =>
      buildLeagueLeaders({ pool, weekly, currentWeek, ownerByPoolId }),
    [pool, weekly, currentWeek, ownerByPoolId],
  );

  if (!leaders) return null;
  const active = leaders.find(l => l.position === position) ?? leaders[0];
  const showOwner = ownerByPoolId !== undefined;

  return (
    <section className={styles.panel} aria-label="League leaders">
      <h2 className={styles.heading}>League Leaders</h2>
      <p className={styles.sub}>
        Who is actually scoring the most this season — full-PPR totals over
        completed weeks, not projections.
      </p>
      <div className={styles.filterBar} role="group" aria-label="Filter leaders by position">
        {LEADER_POSITIONS.map(p => (
          <button
            key={p}
            type="button"
            className={`${styles.filterButton} ${position === p ? styles.active : ''}`}
            aria-pressed={position === p}
            onClick={() => setPosition(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {active.rows.length === 0 ? (
          <p className={styles.status} role="status">
            No scoring data for {active.position}s yet.
          </p>
        ) : (
          <>
            <table
              className={styles.table}
              aria-label={`Season scoring leaders, ${active.position}, most total points first`}
            >
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">NFL</th>
                  {showOwner && <th scope="col">Owner</th>}
                  <th scope="col" className={styles.num}>
                    <abbr title="Completed weeks with a played game">G</abbr>
                  </th>
                  <th scope="col" className={styles.num}>
                    <abbr title="Total full-PPR points over completed weeks">Total</abbr>
                  </th>
                  <th scope="col" className={styles.num}>
                    <abbr title="Points per game over completed weeks">PPG</abbr>
                  </th>
                  <th scope="col" className={styles.num}>
                    <abbr title="The player's best single week this season">Best wk</abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {active.rows.map((r, i) => (
                  <tr key={r.player.id}>
                    <td className={styles.rank}>{i + 1}</td>
                    <th scope="row" className={styles.player}>
                      {r.player.name}
                    </th>
                    <td>{r.player.team}</td>
                    {showOwner && (
                      <td
                        aria-label={
                          r.owner
                            ? `${r.player.name} is rostered by ${r.owner}`
                            : `${r.player.name} is on waivers`
                        }
                      >
                        {r.owner ?? 'Waivers'}
                      </td>
                    )}
                    <td className={styles.num}>{r.games}</td>
                    <td className={styles.num}>{r.total}</td>
                    <td className={styles.num}>{r.ppg}</td>
                    <td
                      className={styles.num}
                      aria-label={`${r.player.name}'s best week: week ${r.bestWeek}, ${r.bestWeekPts} points`}
                    >
                      W{r.bestWeek} · {r.bestWeekPts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {active.topBoom && (
              <p className={styles.boom}>
                Biggest {active.position} explosion:{' '}
                <strong>
                  {active.topBoom.player.name} — {active.topBoom.pts} pts in
                  week {active.topBoom.week}
                </strong>
                .
              </p>
            )}
          </>
        )}
      </div>
      <p className={styles.note}>
        Totals come from Sleeper&apos;s public weekly stats over completed
        weeks only — the current week&apos;s partial games are excluded so
        nobody&apos;s pace is halved. Ownership flags the loaded league&apos;s
        rosters; without a league every leader reads as a free agent.
      </p>
    </section>
  );
}
