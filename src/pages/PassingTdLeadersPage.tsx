// Passing Touchdowns Leaders board (backlog item 164): quarterback
// passing-touchdown leaders over the last 3 completed weeks — the
// season-long "who is actually putting the ball in the end zone
// through the air" reference board, and the QB scoring companion
// to the Passing Leaders yardage board (item 154), which shows pass
// TD only as a secondary column. Priced on Sleeper's free public
// weekly stats at runtime (pass_td + pass_yd, via the shared
// weekly-usage fetch), league-independent so guests get the full
// board like the /passing, /targets, /red-zone, /air-yards,
// /deep-plays, /catch-rate, /yac, /ypr, /ypc, /scrimmage,
// /touchdowns, and /receptions pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildPassingTdLeaders,
  type PassingTdLeader,
} from '@/utils/passingTdLeaders';
import styles from './PassingTdLeadersPage.module.css';

interface PassingTdLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: PassingTdLeader[] };

function rowAriaLabel(row: PassingTdLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.passTd} passing touchdowns over his last ${row.games} games ` +
    `(${row.passTdPerGame} touchdowns per game, ${row.passYards} passing ` +
    `yards, ${row.passYardsPerGame} yards per game)`
  );
}

export function PassingTdLeadersPage({ pool = POOL }: PassingTdLeadersPageProps) {
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
        leaders:
          buildPassingTdLeaders({
            poolPlayers: pool.players,
            usageBySleeperId: usage.usageBySleeperId,
            currentWeek: week,
          }).get('QB') ?? [],
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
      <h1 className={styles.title}>Passing Touchdowns Leaders</h1>
      <p className={styles.lede}>
        Who is actually putting the ball in the end zone through the
        air: the top quarterbacks by passing touchdowns per game over
        the last three completed weeks. Rank 1 scores through the air
        every week — the passing-touchdown read behind every QB
        start/sit call and streamer pickup.
      </p>

      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading Passing Touchdowns leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load Passing Touchdowns data ({state.message}).
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
            const rows = state.leaders;
            if (rows.length === 0) {
              return (
                <p className={styles.note}>
                  No QB Passing Touchdowns leaders for weeks {weekStart}–{weekEnd}{' '}
                  yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Passing Touchdowns leaders at QB, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top QBs by passing touchdowns per game (weeks {weekStart}–
                    {weekEnd})
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="visually-hidden">Rank</span>
                      </th>
                      <th scope="col">Player</th>
                      <th scope="col">NFL</th>
                      <th scope="col">
                        <abbr title="Passing touchdowns over the last 3 completed weeks">
                          Pass TD
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Passing touchdowns per game over the last 3 completed weeks">
                          TDs/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Passing yards over the last 3 completed weeks">
                          Pass Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Passing yards per game over the last 3 completed weeks">
                          Pass/gm
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
                        <td>{row.passTd}</td>
                        <td>{row.passTdPerGame.toFixed(1)}</td>
                        <td>{row.passYards}</td>
                        <td>{row.passYardsPerGame.toFixed(1)}</td>
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
        Method: passing touchdowns per game (Sleeper's pass_td) over
        the last three completed weeks, from Sleeper's free public
        weekly stats; 2+ games required, ranked by touchdowns per
        game, so a one-game explosion can't top the board. An
        opportunity map, not a forecast: pair it with health and
        matchup before a start/sit call — passing touchdowns are the
        highest-variance fantasy points, and a low-yardage red-zone
        surgeon can outrank a high-yardage passer here.
      </p>
    </div>
  );
}
