// Rushing Touchdowns Leaders board (backlog item 165): per-position
// (RB/WR/TE) rushing-touchdown leaders over the last 3 completed
// weeks — the season-long "who is actually finding the end zone on
// the ground" reference board, and the TD-regression companion to
// the Rushing Yards board (item 162), which shows rush TD only as a
// secondary column. Priced on Sleeper's free public weekly stats at
// runtime (rush_td, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the
// /rushing-yards, /receiving-yards, /receptions, and
// /passing-touchdowns pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildRushingTdLeaders,
  RUSH_TD_POSITIONS,
  type RushTdLeader,
  type RushTdPosition,
} from '@/utils/rushingTdLeaders';
import styles from './RushingTdLeadersPage.module.css';

interface RushingTdLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<RushTdPosition, RushTdLeader[]> };

function rowAriaLabel(row: RushTdLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.rushTd} rushing touchdowns over his last ${row.games} games ` +
    `(${row.rushTdPerGame} touchdowns per game, ${row.rushYards} rushing ` +
    `yards, ${row.carries} carries)`
  );
}

export function RushingTdLeadersPage({ pool = POOL }: RushingTdLeadersPageProps) {
  const [position, setPosition] = useState<RushTdPosition>('RB');
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
        leaders: buildRushingTdLeaders({
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
      <h1 className={styles.title}>Rushing Touchdowns Leaders</h1>
      <p className={styles.lede}>
        Who is actually finding the end zone on the ground: the most
        rushing touchdowns per game at each skill position over the
        last three completed weeks. Rank 1 punches it in more often
        than anyone at his position — the ground-game scoring read
        behind every goal-line and TD-regression call.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {RUSH_TD_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading rushing-touchdowns leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load rushing-touchdowns data ({state.message}).
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
                  No {position} rushing-touchdowns leaders for weeks{' '}
                  {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Rushing-touchdowns leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by rushing touchdowns per game (weeks{' '}
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
                        <abbr title="Rushing touchdowns over the last 3 completed weeks">
                          Rush TD
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing touchdowns per game over the last 3 completed weeks">
                          TDs/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing yards over the last 3 completed weeks">
                          Rush Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Carries over the last 3 completed weeks">
                          Carries
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
                        <td>{row.rushTd}</td>
                        <td>{row.rushTdPerGame.toFixed(1)}</td>
                        <td>{row.rushYards}</td>
                        <td>{row.carries}</td>
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
        Method: rushing touchdowns per game (Sleeper's rush_td) over
        the last three completed weeks, from Sleeper's free public
        weekly stats; 2+ games required, ranked by touchdowns per
        game, so a one-game explosion can't top the board. An
        opportunity map, not a forecast: pair it with health and
        matchup before a start/sit call — rushing touchdowns are the
        highest-variance fantasy points, and a goal-line vulture can
        outrank a high-yardage grinder here.
      </p>
    </div>
  );
}
