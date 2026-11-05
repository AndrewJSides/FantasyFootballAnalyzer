// Touches Leaders board (backlog item 157): per-position
// (RB/WR/TE) touches leaders over the last 3 completed weeks —
// the season-long "who is actually getting the ball" reference
// board. Priced on Sleeper's free public weekly stats at runtime
// (rush_att + rec, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /ypc, /scrimmage, /touchdowns, /passing, /target-volume, and
// /first-downs pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildTouchesLeaders,
  TOUCHES_POSITIONS,
  type TouchesLeader,
  type TouchesPosition,
} from '@/utils/touchesLeaders';
import styles from './TouchesLeadersPage.module.css';

interface TouchesLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<TouchesPosition, TouchesLeader[]> };

function rowAriaLabel(row: TouchesLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.touches} touches over his last ${row.games} games ` +
    `(${row.touchesPerGame} per game, ${row.rushAtt} rushing attempts, ` +
    `${row.receptions} receptions)`
  );
}

export function TouchesLeadersPage({ pool = POOL }: TouchesLeadersPageProps) {
  const [position, setPosition] = useState<TouchesPosition>('RB');
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
        leaders: buildTouchesLeaders({
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
      <h1 className={styles.title}>Touches Leaders</h1>
      <p className={styles.lede}>
        Who is actually getting the ball: the most touches at each
        skill position over the last three completed weeks. Rank 1 is
        the workload read behind every start/sit and waiver call — a
        player earning touches earns the next snap and the next target.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {TOUCHES_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading Touches leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load Touches data ({state.message}). Sleeper's
              free public stats may be down.
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
                  No {position} Touches leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Touches leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by touches per game (weeks{' '}
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
                        <abbr title="Total touches (rushing attempts + receptions) over the last 3 completed weeks">
                          Touches
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Touches per game over the last 3 completed weeks">
                          Tch/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing attempts over the last 3 completed weeks">
                          Rush Att
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receptions over the last 3 completed weeks">
                          Receptions
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
                        <td>{row.touches}</td>
                        <td>{row.touchesPerGame.toFixed(1)}</td>
                        <td>{row.rushAtt}</td>
                        <td>{row.receptions}</td>
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
        Method: total touches (Sleeper's rush_att + rec) over the
        last three completed weeks, from Sleeper's free public weekly
        stats; 2+ games required, ranked by touches per game, so a
        one-game explosion can't top the board. An opportunity map, not
        a forecast: pair it with health and matchup before a start/sit
        call — touches are the workload, not the points.
      </p>
    </div>
  );
}
