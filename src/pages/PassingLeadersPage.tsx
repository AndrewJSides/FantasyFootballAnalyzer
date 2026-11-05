// Passing Leaders board (backlog item 154): quarterback passing
// leaders over the last 3 completed weeks — the season-long "who
// is throwing for the most yardage" reference board, and the first
// leaders board for the QB position. Priced on Sleeper's free
// public weekly stats at runtime (pass_yd + pass_td, via the
// shared weekly-usage fetch), league-independent so guests get the
// full board like the /targets, /red-zone, /air-yards,
// /deep-plays, /catch-rate, /yac, /ypr, /ypc, /scrimmage, and
// /touchdowns pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildPassingLeaders,
  type PassingLeader,
} from '@/utils/passingLeaders';
import styles from './PassingLeadersPage.module.css';

interface PassingLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: PassingLeader[] };

function rowAriaLabel(row: PassingLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.passYards} passing yards over his last ${row.games} games ` +
    `(${row.passYardsPerGame} yards per game, ${row.passTd} passing ` +
    `touchdowns, ${row.passTdPerGame} touchdowns per game)`
  );
}

export function PassingLeadersPage({ pool = POOL }: PassingLeadersPageProps) {
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
          buildPassingLeaders({
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
      <h1 className={styles.title}>Passing Leaders</h1>
      <p className={styles.lede}>
        Who is throwing for the most yardage: the top quarterbacks by
        passing yards per game over the last three completed weeks.
        Rank 1 moves the ball through the air every week — the
        passing-volume read behind every QB start/sit call and
        streamer pickup.
      </p>

      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading Passing leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load Passing data ({state.message}). Sleeper's free
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
            const rows = state.leaders;
            if (rows.length === 0) {
              return (
                <p className={styles.note}>
                  No QB Passing leaders for weeks {weekStart}–{weekEnd}{' '}
                  yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Passing leaders at QB, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top QBs by passing yards per game (weeks {weekStart}–
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
                        <td>{row.passYards}</td>
                        <td>{row.passYardsPerGame.toFixed(1)}</td>
                        <td>{row.passTd}</td>
                        <td>{row.passTdPerGame.toFixed(1)}</td>
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
        Method: passing yards per game (Sleeper's pass_yd) over the
        last three completed weeks, from Sleeper's free public weekly
        stats; 2+ games required, ranked by yards per game, so a
        one-game explosion can't top the board. An opportunity map, not
        a forecast: pair it with health and matchup before a start/sit
        call — passing volume is steady, but touchdowns are the
        highest-variance fantasy points.
      </p>
    </div>
  );
}
