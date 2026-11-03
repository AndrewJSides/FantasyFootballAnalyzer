// Peak Weeks board (backlog item 106): per-position (QB/RB/WR/TE) best
// single-week full-PPR performances of the season so far — the ceiling
// evidence behind a buy-low or a start/sit call. Priced by joining
// Sleeper's free public weekly points at runtime (the same feed the
// /efficiency page uses) with the bundled schedule for the opponent.
// League-independent, so guests get the full board like /snaps and
// /efficiency. Completed weeks only: the in-progress week never counts,
// so a partial Sunday can't top the board.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { currentWeekEstimate } from '@/utils/matchupRating';
import { remainingOpponents } from '@/utils/rosSchedule';
import {
  buildPeakWeeks,
  PEAK_POSITIONS,
  type PeakPosition,
  type PeakWeek,
} from '@/utils/peakWeeks';
import styles from './PeakWeeksPage.module.css';

interface PeakWeeksPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      peaks: Map<PeakPosition, PeakWeek[]>;
    };

function rowAriaLabel(row: PeakWeek): string {
  const vs = row.opponent ? ` against ${row.opponent}` : '';
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.points.toFixed(1)} fantasy points in week ${row.week}${vs}`
  );
}

export function PeakWeeksPage({ pool = POOL }: PeakWeeksPageProps) {
  const [position, setPosition] = useState<PeakPosition>('QB');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Pure NFL data — the estimate prices the latest completed weeks in both
  // league and guest mode.
  const [week] = useState(() => currentWeekEstimate());

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const points = await fetchWeeklyPprPoints(pool.season, week - 1);
      if (!points) throw new Error('no weekly stats data');
      setState({
        kind: 'ready',
        peaks: buildPeakWeeks({
          poolPlayers: pool.players,
          pointsBySleeperId: points.pointsBySleeperId,
          currentWeek: week,
          opponentFor: (team, w) =>
            remainingOpponents(team, w, undefined, w)[0]?.opponent ?? null,
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

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Peak Weeks</h1>
      <p className={styles.lede}>
        The biggest single-week explosions of the season: the best
        full-PPR week each player has put up so far, per position. A
        player can appear more than once — once per monster week — and
        the opponent shows who it came against.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {PEAK_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading peak weeks…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load peak weeks ({state.message}). Sleeper's free
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
            const rows = state.peaks.get(position) ?? [];
            if (rows.length === 0) {
              return (
                <p className={styles.note}>
                  No {position} peak weeks through week {week - 1} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Peak weeks at ${position}, weeks 1 through ${week - 1}`}
                >
                  <caption className={styles.caption}>
                    Top {position} single-week performances (weeks 1–
                    {week - 1})
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="visually-hidden">Rank</span>
                      </th>
                      <th scope="col">Player</th>
                      <th scope="col">NFL</th>
                      <th scope="col">Week</th>
                      <th scope="col">Opp</th>
                      <th scope="col">
                        <abbr title="Full-PPR fantasy points scored that week">
                          Pts
                        </abbr>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={`${row.player.id}-${row.week}`}>
                        <td>{i + 1}</td>
                        <th scope="row" aria-label={rowAriaLabel(row)}>
                          {row.player.name}
                        </th>
                        <td>{row.player.team ?? '—'}</td>
                        <td>{row.week}</td>
                        <td>{row.opponent ?? '—'}</td>
                        <td>{row.points.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
      </div>

      <p className={styles.footnote}>
        Method: best single-week full-PPR scores across completed weeks
        only (through week {week - 1}), from Sleeper's free public weekly
        stats; opponents from the bundled 2026 NFL schedule. A ceiling
        map, not a forecast: one monster week is evidence of upside, not
        a projection — pair it with snap share, efficiency, and matchup
        before a start/sit call.
      </p>
    </div>
  );
}
