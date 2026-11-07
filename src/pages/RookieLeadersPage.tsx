// Rookie Leaders board (backlog item 187): per-position (QB/RB/WR/TE)
// rookie PPR fantasy-points leaders over the last 3 completed
// weeks — the season-long "which rookies are breaking out right
// now" reference board. Priced on Sleeper's free public weekly stats
// at runtime (pts_ppr, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the
// /fantasy-points, /passing, /pass-attempts, and /qb-rushing pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildRookieLeaders,
  ROOKIE_POSITIONS,
  type RookieLeader,
  type RookiePosition,
} from '@/utils/rookieLeaders';
import styles from './RookieLeadersPage.module.css';

interface RookieLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<RookiePosition, RookieLeader[]> };

function rowAriaLabel(row: RookieLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.ptsPpr} PPR fantasy points over his last ${row.games} games ` +
    `(${row.ptsPerGame} per game, ${row.touches} touches)`
  );
}

export function RookieLeadersPage({ pool = POOL }: RookieLeadersPageProps) {
  // Rookie breakouts people chase are RBs and WRs; RB leads the tabs.
  const [position, setPosition] = useState<RookiePosition>('RB');
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
        leaders: buildRookieLeaders({
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
      <h1 className={styles.title}>Rookie Leaders</h1>
      <p className={styles.lede}>
        Which rookies are actually producing: the most PPR fantasy points
        among first-year players at each position over the last three
        completed weeks. The touches column is the role check — a rookie
        scoring on three touches a game is a fluke, on fifteen it is a
        job.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {ROOKIE_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading Rookie leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load Rookie data ({state.message}).
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
                  No {position} Rookie leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Rookie leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top rookie {position}s by PPR points per game (weeks{' '}
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
                        <abbr title="Rush attempts plus receptions over the last 3 completed weeks">
                          Touches
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
                        <td>{row.touches}</td>
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
        stats; rookies only (the bundled pool's rookie flag), 2+ games
        required, ranked by points per game, so a one-game explosion
        can't top the board. A scoreboard, not a forecast: pair it
        with health and matchup before a start/sit call — points are
        the outcome, not the reason.
      </p>
    </div>
  );
}
