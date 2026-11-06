// Receptions Leaders board (backlog item 163): per-position
// (RB/WR/TE) receptions leaders over the last 3 completed
// weeks — the season-long "who is actually seeing the ball
// completed to him" reference board. Priced on Sleeper's free public weekly
// stats at runtime (rec, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /fantasy-points, /snap-counts, /yards-per-target,
// /receiving-yards, and /rushing-yards pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildReceptionsLeaders,
  RECEPTIONS_POSITIONS,
  type ReceptionsLeader,
  type ReceptionsPosition,
} from '@/utils/receptionsLeaders';
import styles from './ReceptionsLeadersPage.module.css';

interface ReceptionsLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<ReceptionsPosition, ReceptionsLeader[]> };

function rowAriaLabel(row: ReceptionsLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.receptions} receptions over his last ${row.games} games ` +
    `(${row.receptionsPerGame} per game, ${row.targets} targets, ` +
    `${row.recYards} receiving yards)`
  );
}

export function ReceptionsLeadersPage({ pool = POOL }: ReceptionsLeadersPageProps) {
  const [position, setPosition] = useState<ReceptionsPosition>('WR');
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
        leaders: buildReceptionsLeaders({
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
      <h1 className={styles.title}>Receptions Leaders</h1>
      <p className={styles.lede}>
        Who is actually seeing the ball completed to him: the most
        receptions per game at each skill position over the last three
        completed weeks. Rank 1 catches more passes than anyone at his
        position — the plainest catch-volume read, and the PPR floor
        behind every start/sit and waiver call.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {RECEPTIONS_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading receptions leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load receptions data ({state.message}).
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
                  No {position} receptions leaders for weeks{' '}
                  {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Receptions leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by receptions per game (weeks{' '}
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
                        <abbr title="Receptions over the last 3 completed weeks">
                          Rec
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receptions per game over the last 3 completed weeks">
                          Rec/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Targets over the last 3 completed weeks">
                          Targets
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receiving yards over the last 3 completed weeks">
                          Rec Yds
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
                        <td>{row.receptions}</td>
                        <td>{row.receptionsPerGame.toFixed(1)}</td>
                        <td>{row.targets}</td>
                        <td>{row.recYards}</td>
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
        Method: receptions per game (Sleeper's rec) over the
        last three completed weeks, from Sleeper's free public weekly
        stats; 2+ games required, so a one-week explosion can't top the
        board. An opportunity map, not a forecast: pair it with health
        and matchup before a start/sit call.
      </p>
    </div>
  );
}
