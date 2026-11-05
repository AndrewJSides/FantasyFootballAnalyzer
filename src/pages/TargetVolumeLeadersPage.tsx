// Target Volume Leaders board (backlog item 155): per-position
// (RB/WR/TE) target leaders over the last 3 completed weeks —
// the season-long "who is actually getting thrown to" reference
// board. Priced on Sleeper's free public weekly stats at runtime
// (rec_tgt + rec, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /ypc, /scrimmage, /touchdowns, and /passing pages. Note:
// /targets is already the Target Share board (item 107), so this
// board lives at /target-volume.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildTargetVolumeLeaders,
  TARGET_VOLUME_POSITIONS,
  type TargetVolumeLeader,
  type TargetVolumePosition,
} from '@/utils/targetVolumeLeaders';
import styles from './TargetVolumeLeadersPage.module.css';

interface TargetVolumeLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<TargetVolumePosition, TargetVolumeLeader[]> };

function rowAriaLabel(row: TargetVolumeLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.targets} targets over his last ${row.games} games ` +
    `(${row.targetsPerGame} targets per game, ${row.receptions} ` +
    `receptions, ${row.catchRate}% catch rate)`
  );
}

export function TargetVolumeLeadersPage({ pool = POOL }: TargetVolumeLeadersPageProps) {
  const [position, setPosition] = useState<TargetVolumePosition>('WR');
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
        leaders: buildTargetVolumeLeaders({
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
      <h1 className={styles.title}>Target Volume Leaders</h1>
      <p className={styles.lede}>
        Who is actually getting thrown to: the most targets at each
        skill position over the last three completed weeks. Rank 1 is
        the workload — the volume read behind every WR/TE start/sit
        call and waiver pickup.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {TARGET_VOLUME_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading Target Volume leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load Target Volume data ({state.message}). Sleeper's
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
                  No {position} Target Volume leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Target Volume leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by targets per game (weeks{' '}
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
                        <abbr title="Total targets over the last 3 completed weeks">
                          Targets
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Targets per game over the last 3 completed weeks">
                          Tgt/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receptions over the last 3 completed weeks">
                          Receptions
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Catch rate (receptions divided by targets) over the last 3 completed weeks">
                          Catch%
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
                        <td>{row.targets}</td>
                        <td>{row.targetsPerGame.toFixed(1)}</td>
                        <td>{row.receptions}</td>
                        <td>{row.catchRate.toFixed(1)}%</td>
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
        Method: total targets (Sleeper's rec_tgt) over the last three
        completed weeks, from Sleeper's free public weekly stats; 2+
        games required, ranked by targets per game, so a one-game
        explosion can't top the board. An opportunity map, not a
        forecast: pair it with health and matchup before a start/sit
        call — targets are the workload, not the points.
      </p>
    </div>
  );
}
