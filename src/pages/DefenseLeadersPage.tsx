// Defense Leaders board (backlog item 169): the team defenses
// actually producing over the last 3 completed weeks, ranked by
// standard D/ST fantasy points per game — the "which defense is
// hot" read the D/ST Streamers board prices by matchup instead.
// Priced on Sleeper's free public weekly team-defense stats at
// runtime (via the shared weekly-usage fetch), league-independent
// so guests get the full board like the skill-position leaders
// pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildDefenseLeaders,
  type DefenseLeader,
} from '@/utils/defenseLeaders';
import styles from './DefenseLeadersPage.module.css';

interface DefenseLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: DefenseLeader[] };

function rowAriaLabel(row: DefenseLeader): string {
  return (
    `${row.player.name} (${row.player.team ?? 'FA'}): ` +
    `${row.fantasyPtsPerGame} fantasy points per game over the last ` +
    `${row.games} games (${row.fantasyPts} points total, ${row.sacks} ` +
    `sacks, ${row.takeaways} takeaways, ${row.defTd} defensive ` +
    `touchdowns, ${row.ptsAllowedPerGame} points allowed per game)`
  );
}

export function DefenseLeadersPage({ pool = POOL }: DefenseLeadersPageProps) {
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
        leaders: buildDefenseLeaders({
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
      <h1 className={styles.title}>Defense Leaders</h1>
      <p className={styles.lede}>
        Which defense is actually producing: the top team defenses by
        standard D/ST fantasy points per game over the last three
        completed weeks. Rank 1 is scoring more than any other defense
        right now — the production read behind every streaming and
        stash call.
      </p>

      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading defense leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load defense data ({state.message}).
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
                  No defense leaders for weeks {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Defense leaders, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top defenses by fantasy points per game (weeks{' '}
                    {weekStart}–{weekEnd})
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="visually-hidden">Rank</span>
                      </th>
                      <th scope="col">Defense</th>
                      <th scope="col">NFL</th>
                      <th scope="col">
                        <abbr title="Standard D/ST fantasy points over the last 3 completed weeks">
                          Pts
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Standard D/ST fantasy points per game over the last 3 completed weeks">
                          Pts/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Sacks over the last 3 completed weeks">
                          Sacks
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Takeaways (interceptions + fumble recoveries) over the last 3 completed weeks">
                          Takeaways
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Defensive touchdowns over the last 3 completed weeks">
                          Def TD
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Points allowed per game over the last 3 completed weeks">
                          Pts Allow/gm
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
                        <td>{row.sacks}</td>
                        <td>{row.takeaways}</td>
                        <td>{row.defTd}</td>
                        <td>{row.ptsAllowedPerGame.toFixed(1)}</td>
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
        Method: standard D/ST scoring (sack 1, interception 2, fumble
        recovery 2, defensive touchdown 6, safety 2, blocked kick 2,
        points-allowed brackets) per game over the last three completed
        weeks, from Sleeper's free public weekly team-defense stats;
        2+ games required, so a one-week explosion can't top the board.
        A production map, not a forecast: pair it with this week's
        matchup on the D/ST Streamers board before a start/sit call.
      </p>
    </div>
  );
}
