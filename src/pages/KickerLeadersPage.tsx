// Kicker Leaders board (backlog item 170): the kickers actually
// producing over the last 3 completed weeks, ranked by standard
// kicker fantasy points per game — the "which kicker is hot" read
// the Kicker Streamers board prices by matchup instead.
// Priced on Sleeper's free public weekly kicker stats at runtime
// (via the shared weekly-usage fetch), league-independent so guests
// get the full board like the skill-position leaders pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildKickerLeaders,
  type KickerLeader,
} from '@/utils/kickerLeaders';
import styles from './KickerLeadersPage.module.css';

interface KickerLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: KickerLeader[] };

function rowAriaLabel(row: KickerLeader): string {
  return (
    `${row.player.name} (${row.player.team ?? 'FA'}): ` +
    `${row.fantasyPtsPerGame} fantasy points per game over the last ` +
    `${row.games} games (${row.fantasyPts} points total, ${row.fgMade} ` +
    `of ${row.fgAtt} field goals, ${row.patMade} extra points)`
  );
}

export function KickerLeadersPage({ pool = POOL }: KickerLeadersPageProps) {
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
        leaders: buildKickerLeaders({
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
      <h1 className={styles.title}>Kicker Leaders</h1>
      <p className={styles.lede}>
        Which kicker is actually producing: the top kickers by standard
        kicker fantasy points per game over the last three completed
        weeks. Rank 1 is scoring more than any other kicker right now —
        the production read behind every streaming and stash call.
      </p>

      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading kicker leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load kicker data ({state.message}).
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
                  No kicker leaders for weeks {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Kicker leaders, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top kickers by fantasy points per game (weeks{' '}
                    {weekStart}–{weekEnd})
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="visually-hidden">Rank</span>
                      </th>
                      <th scope="col">Kicker</th>
                      <th scope="col">NFL</th>
                      <th scope="col">
                        <abbr title="Standard kicker fantasy points over the last 3 completed weeks">
                          Pts
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Standard kicker fantasy points per game over the last 3 completed weeks">
                          Pts/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Field goals made over the last 3 completed weeks">
                          FG
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Field-goal percentage over the last 3 completed weeks">
                          FG%
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Extra points made over the last 3 completed weeks">
                          PAT
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
                        <td>{row.fantasyPts}</td>
                        <td>{row.fantasyPtsPerGame.toFixed(1)}</td>
                        <td>
                          {row.fgMade}/{row.fgAtt}
                        </td>
                        <td>
                          {row.fgPct === null ? '—' : `${row.fgPct.toFixed(1)}%`}
                        </td>
                        <td>{row.patMade}</td>
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
        Method: standard kicker scoring (field goal made 3, extra point
        made 1, field goal missed -1) per game over the last three
        completed weeks, from Sleeper's free public weekly kicker stats;
        2+ games required, so a one-week explosion can't top the board.
        A production map, not a forecast: pair it with this week's
        matchup on the Kicker Streamers board before a start/sit call.
      </p>
    </div>
  );
}
