// Fantasy Points Leaders board (backlog item 158): per-position
// (QB/RB/WR/TE) PPR fantasy-points leaders over the last 3
// completed weeks — the season-long "who is actually scoring"
// reference board. Priced on Sleeper's free public weekly stats at
// runtime (pts_ppr, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /ypc, /scrimmage, /touchdowns, /passing, /target-volume,
// /first-downs, and /touches pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildFantasyPointsLeaders,
  FANTASY_POINTS_POSITIONS,
  type FantasyPointsLeader,
  type FantasyPointsPosition,
} from '@/utils/fantasyPointsLeaders';
import styles from './FantasyPointsLeadersPage.module.css';

interface FantasyPointsLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<FantasyPointsPosition, FantasyPointsLeader[]> };

function rowAriaLabel(row: FantasyPointsLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.ptsPpr} PPR fantasy points over his last ${row.games} games ` +
    `(${row.ptsPerGame} per game)`
  );
}

export function FantasyPointsLeadersPage({ pool = POOL }: FantasyPointsLeadersPageProps) {
  // QBs top the scoring board, so they lead the default tab.
  const [position, setPosition] = useState<FantasyPointsPosition>('QB');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Pure NFL data — the estimate prices the latest completed weeks in both
  // league and guest mode.
  const [week] = useState(() => currentWeekEstimate());

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const usage = await fetchWeeklyUsage(pool.season, week - 1);
      if (!usage) throw new Error('no weekly usage data');
      setState({
        kind: 'ready',
        leaders: buildFantasyPointsLeaders({
          poolPlayers: pool.players,
          usageBySleeperId: usage.usageBySleeperId,
          currentWeek: week,
        }),
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }, [pool, week]);

  useEffect(() => {
    void load();
  }, [load]);

  const weekStart = week - 3;
  const weekEnd = week - 1;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Fantasy Points Leaders</h1>
      <p className={styles.lede}>
        Who is actually scoring: the most PPR fantasy points at each
        position over the last three completed weeks. Rank 1 is the
        number every start/sit, waiver, and trade call is ultimately
        judged against — the only board where quarterbacks sit next to
        the skill positions.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {FANTASY_POINTS_POSITIONS.map(pos => (
          <button
            key={pos}
            type="button"
            className={pos === position ? styles.chipOn : styles.chip}
            aria-pressed={pos === position}
            onClick={() => setPosition(pos)}
          >
            {pos}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading Fantasy Points leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load Fantasy Points data ({state.message}).
              Sleeper's free public stats may be down.
            </p>
            <button
              type="button"
              className="input"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        )}
        {state.kind === 'ready' &&
          (() => {
            const rows = state.leaders.get(position) ?? [];
            if (rows.length === 0) {
              return (
                <p className={styles.note}>
                  No {position} Fantasy Points leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Fantasy Points leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by PPR points per game (weeks{' '}
                    {weekStart}–{weekEnd})
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="visually-hidden">Rank</span>
                      </th>
                      <th scope="col">Player</th>
                      <th scope="col">NFL</th>
                      <th scope="col">
                        <abbr title="Total PPR fantasy points over the last 3 completed weeks">
                          PPR Pts
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="PPR fantasy points per game over the last 3 completed weeks">
                          Pts/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Games with a stat line in the last 3 completed weeks">
                          Games
                        </abbr>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.player.id}>
                        <td>{i + 1}</td>
                        <th scope="row" aria-label={rowAriaLabel(row)}>
                          {row.player.name}
                        </th>
                        <td>{row.player.team ?? '—'}</td>
                        <td>{row.ptsPpr.toFixed(1)}</td>
                        <td>{row.ptsPerGame.toFixed(1)}</td>
                        <td>{row.games}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
      </div>

      <p className={styles.footnote}>
        Method: total PPR fantasy points (Sleeper's pts_ppr) over the
        last three completed weeks, from Sleeper's free public weekly
        stats; 2+ games required, ranked by points per game, so a
        one-game explosion can't top the board. A scoreboard, not a
        forecast: pair it with health and matchup before a start/sit
        call — points are the outcome, not the reason.
      </p>
    </div>
  );
}
