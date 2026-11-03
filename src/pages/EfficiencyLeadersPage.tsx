// Efficiency Leaders board (backlog item 105): per-position (RB/WR/TE)
// fantasy-points-per-touch leaders over the last 3 completed weeks — the
// "who's doing the most with every touch" reference board. Companion to
// Snap Leaders (item 104), which ranks volume: this one ranks what each
// touch is worth. Priced by joining Sleeper's free public weekly stats at
// runtime (full-PPR points + rush attempts/receptions), league-independent
// so guests get the full board like the /snaps page.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildEfficiencyLeaders,
  EFFICIENCY_MIN_TOUCHES,
  EFFICIENCY_POSITIONS,
  type EfficiencyLeader,
  type EfficiencyPosition,
} from '@/utils/efficiencyLeaders';
import styles from './EfficiencyLeadersPage.module.css';

interface EfficiencyLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      leaders: Map<EfficiencyPosition, EfficiencyLeader[]>;
    };

function rowAriaLabel(row: EfficiencyLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.ptsPerTouch.toFixed(2)} fantasy points per touch over his last ` +
    `${row.games} games, ${row.touchesPerGame.toFixed(1)} touches per game, ` +
    `${row.ptsPerGame.toFixed(1)} points per game`
  );
}

export function EfficiencyLeadersPage({ pool = POOL }: EfficiencyLeadersPageProps) {
  const [position, setPosition] = useState<EfficiencyPosition>('RB');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Pure NFL data — the estimate prices the latest completed weeks in both
  // league and guest mode.
  const [week] = useState(() => currentWeekEstimate());

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [usage, points] = await Promise.all([
        fetchWeeklyUsage(pool.season, week - 1),
        fetchWeeklyPprPoints(pool.season, week - 1),
      ]);
      if (!usage || !points) throw new Error('no weekly stats data');
      setState({
        kind: 'ready',
        leaders: buildEfficiencyLeaders({
          poolPlayers: pool.players,
          pointsBySleeperId: points.pointsBySleeperId,
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
      <h1 className={styles.title}>Efficiency Leaders</h1>
      <p className={styles.lede}>
        Who's doing the most with every touch: the highest fantasy points
        per touch at each skill position over the last three completed
        weeks. Rank 1 squeezes the most out of his opportunities — the
        buy-low read behind every waiver and trade decision.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {EFFICIENCY_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading efficiency leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load efficiency data ({state.message}). Sleeper's
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
                  No {position} efficiency leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Efficiency leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by fantasy points per touch (weeks{' '}
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
                        <abbr title="Full-PPR fantasy points per touch (rushing attempts plus receptions) over the last 3 completed weeks">
                          Pts/touch
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing attempts plus receptions per game over the last 3 completed weeks">
                          Touches/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Full-PPR fantasy points per game over the last 3 completed weeks">
                          Pts/gm
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
                        <td>{row.ptsPerTouch.toFixed(2)}</td>
                        <td>{row.touchesPerGame.toFixed(1)}</td>
                        <td>{row.ptsPerGame.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
      </div>

      <p className={styles.footnote}>
        Method: full-PPR points divided by touches (rushing attempts plus
        receptions) over the last three completed weeks, from Sleeper's
        free public weekly stats; 2+ games and {EFFICIENCY_MIN_TOUCHES}+
        touches required. An efficiency map, not a forecast: a high rate on
        few touches regresses — pair it with snap share and matchup before
        a start/sit call.
      </p>
    </div>
  );
}
