// Touchdown Leaders board (backlog item 153): per-position
// (RB/WR/TE) touchdown leaders over the last 3 completed weeks —
// the season-long "who is actually scoring" reference board.
// Priced on Sleeper's free public weekly stats at runtime
// (rush_td + rec_td, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /ypc, and /scrimmage pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildTouchdownLeaders,
  TOUCHDOWN_POSITIONS,
  type TouchdownLeader,
  type TouchdownPosition,
} from '@/utils/touchdownLeaders';
import styles from './TouchdownLeadersPage.module.css';

interface TouchdownLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<TouchdownPosition, TouchdownLeader[]> };

function rowAriaLabel(row: TouchdownLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.touchdowns} touchdowns over his last ${row.games} games ` +
    `(${row.rushTd} rushing and ${row.recTd} receiving, ` +
    `${row.touchdownsPerGame} touchdowns per game)`
  );
}

export function TouchdownLeadersPage({ pool = POOL }: TouchdownLeadersPageProps) {
  const [position, setPosition] = useState<TouchdownPosition>('RB');
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
        leaders: buildTouchdownLeaders({
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
      <h1 className={styles.title}>Touchdown Leaders</h1>
      <p className={styles.lede}>
        Who is actually scoring: the most touchdowns at each skill
        position over the last three completed weeks. Rank 1 finds the
        end zone every way — the scoring read behind every buy-low and
        sell-high call.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {TOUCHDOWN_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading Touchdown leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load Touchdown data ({state.message}). Sleeper's free
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
                  No {position} Touchdown leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Touchdown leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by touchdowns per game (weeks{' '}
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
                        <abbr title="Total touchdowns (rushing + receiving) over the last 3 completed weeks">
                          TDs
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Touchdowns per game over the last 3 completed weeks">
                          TDs/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing touchdowns over the last 3 completed weeks">
                          Rush TD
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receiving touchdowns over the last 3 completed weeks">
                          Rec TD
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
                        <td>{row.touchdowns}</td>
                        <td>{row.touchdownsPerGame.toFixed(1)}</td>
                        <td>{row.rushTd}</td>
                        <td>{row.recTd}</td>
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
        Method: total touchdowns (Sleeper's rush_td + rec_td) over the
        last three completed weeks, from Sleeper's free public weekly
        stats; 2+ games required, ranked by touchdowns per game, so a
        one-game explosion can't top the board. An opportunity map, not
        a forecast: pair it with health and matchup before a start/sit
        call — touchdowns are the highest-variance fantasy points.
      </p>
    </div>
  );
}
