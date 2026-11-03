// Snap Leaders board (backlog item 104): per-position (RB/WR/TE)
// snap-share leaders over the last 3 completed weeks — the season-long
// "who's actually playing every snap" reference board. Companion to
// Opportunity Watch (item 71), which flags available players earning a
// role; the board ranks everyone, rostered or not, by snap share. Priced
// on Sleeper's free public weekly stats at runtime (same data as
// Opportunity Watch), league-independent so guests get the full board
// like the /points-allowed page.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildSnapLeaders,
  SNAP_POSITIONS,
  type SnapLeader,
  type SnapPosition,
} from '@/utils/snapLeaders';
import styles from './SnapLeadersPage.module.css';

interface SnapLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<SnapPosition, SnapLeader[]> };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function rowAriaLabel(row: SnapLeader): string {
  const targetShare =
    row.targetShare === null ? 'unknown target share' : pct(row.targetShare);
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${pct(row.snapShare)} of the offense's snaps over his last ${row.games} ` +
    `games, ${targetShare} of his team's targets, ${row.touchesPerGame} touches per game`
  );
}

export function SnapLeadersPage({ pool = POOL }: SnapLeadersPageProps) {
  const [position, setPosition] = useState<SnapPosition>('RB');
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
        leaders: buildSnapLeaders({
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
      <h1 className={styles.title}>Snap Leaders</h1>
      <p className={styles.lede}>
        Who's actually playing every snap: the highest snap shares at each
        skill position over the last three completed weeks. Rank 1 plays the
        most — the bellcow read behind every waiver and trade decision.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {SNAP_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading snap shares…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load snap data ({state.message}). Sleeper's free
              public stats may be down.
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
                  No {position} snap leaders for weeks {weekStart}–{weekEnd}
                  yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Snap share leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by snap share (weeks {weekStart}–{weekEnd})
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="visually-hidden">Rank</span>
                      </th>
                      <th scope="col">Player</th>
                      <th scope="col">NFL</th>
                      <th scope="col">
                        <abbr title="Share of the offense's snaps over the player's last 3 completed weeks">
                          Snap %
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Share of the player's NFL team's targets over the same weeks">
                          Tgt %
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing attempts plus receptions per game over the last 3 completed weeks">
                          Touches/gm
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
                        <td>{pct(row.snapShare)}</td>
                        <td>
                          {row.targetShare === null
                            ? '—'
                            : pct(row.targetShare)}
                        </td>
                        <td>{row.touchesPerGame.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
      </div>

      <p className={styles.footnote}>
        Method: snap share (player snaps / team offensive snaps) and target
        share (player targets / team targets) over the last three completed
        weeks, from Sleeper's free public weekly stats; 2+ games required. An
        opportunity map, not a forecast: pair it with health and matchup
        before a start/sit call.
      </p>
    </div>
  );
}
