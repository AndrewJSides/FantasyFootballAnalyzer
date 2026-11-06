// Pass Attempts Leaders board (backlog item 167): quarterback
// pass-attempt leaders over the last 3 completed weeks — the
// season-long "whose offense actually throws" reference board, and
// the volume companion to the Passing Leaders board (item 154),
// which shows attempts nowhere. Priced on Sleeper's free public
// weekly stats at runtime (pass_att + pass_cmp, via the shared
// weekly-usage fetch), league-independent so guests get the full
// board like the /passing, /passing-touchdowns, and
// /receiving-touchdowns pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildPassAttemptsLeaders,
  type PassAttLeader,
} from '@/utils/passAttemptsLeaders';
import styles from './PassAttemptsLeadersPage.module.css';

interface PassAttemptsLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: PassAttLeader[] };

function rowAriaLabel(row: PassAttLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.passAtt} pass attempts over his last ${row.games} games ` +
    `(${row.passAttPerGame} attempts per game, ${row.passCmp} completions, ` +
    `${row.cmpPct}% completion, ${row.passYards} passing yards)`
  );
}

export function PassAttemptsLeadersPage({ pool = POOL }: PassAttemptsLeadersPageProps) {
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
          buildPassAttemptsLeaders({
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
      <h1 className={styles.title}>Pass Attempts Leaders</h1>
      <p className={styles.lede}>
        Whose offense actually throws: the top quarterbacks by pass
        attempts per game over the last three completed weeks. Rank 1
        throws more than anyone — the volume read behind every QB
        streamer pickup and QB2-upside call.
      </p>

      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading pass-attempts leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load pass-attempts data ({state.message}). Sleeper's
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
            const rows = state.leaders;
            if (rows.length === 0) {
              return (
                <p className={styles.note}>
                  No QB pass-attempts leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Pass-attempts leaders at QB, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top QBs by pass attempts per game (weeks {weekStart}–
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
                        <abbr title="Pass attempts over the last 3 completed weeks">
                          Att
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Pass attempts per game over the last 3 completed weeks">
                          Att/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Pass completions over the last 3 completed weeks">
                          Cmp
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Completion percentage over the last 3 completed weeks">
                          Cmp%
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Passing yards over the last 3 completed weeks">
                          Pass Yds
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
                        <td>{row.passAtt}</td>
                        <td>{row.passAttPerGame.toFixed(1)}</td>
                        <td>{row.passCmp}</td>
                        <td>{row.cmpPct.toFixed(1)}%</td>
                        <td>{row.passYards}</td>
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
        Method: pass attempts per game (Sleeper's pass_att) over the
        last three completed weeks, from Sleeper's free public weekly
        stats; 2+ games required, ranked by attempts per game, so a
        one-game explosion can't top the board. An opportunity map, not
        a forecast: pair it with health and matchup before a start/sit
        call — attempts are steady, but a high-volume passer on a bad
        team can still outrank an efficient one here.
      </p>
    </div>
  );
}
