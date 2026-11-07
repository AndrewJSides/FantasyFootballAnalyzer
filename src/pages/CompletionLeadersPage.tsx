// Completion Percentage Leaders board (backlog item 191):
// quarterbacks ranked by completion percentage over the last 3
// completed weeks — the accuracy read the volume boards can't give.
// A QB can lead the Passing Yards board on 45 attempts a game while
// completing 55%, and the rating board buries accuracy inside its
// four-component blend; this board prices accuracy alone, with the
// components (completions, attempts, yards, yards per attempt)
// alongside so the rate can be read, not just trusted. Priced on
// Sleeper's free public weekly stats at runtime (pass_cmp /
// pass_att, summed across the window), league-independent so guests
// get the full board like the /passing, /pass-attempts,
// /qb-rushing, and /passer-rating pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildCompletionLeaders,
  type CompletionLeader,
} from '@/utils/completionLeaders';
import styles from './CompletionLeadersPage.module.css';

interface CompletionLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: CompletionLeader[] };

function rowAriaLabel(row: CompletionLeader): string {
  return (
    `${row.player.name} (${row.player.team ?? 'FA'}): ` +
    `${row.cmpPct.toFixed(1)}% completions over his last ${row.games} games, ` +
    `${row.passCmp} of ${row.passAtt} passes for ${row.passYards} yards ` +
    `(${row.ydsPerAtt.toFixed(1)} yards per attempt, ${row.passTd} touchdowns, ` +
    `${row.passInt} interceptions)`
  );
}

export function CompletionLeadersPage({ pool = POOL }: CompletionLeadersPageProps) {
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
        leaders: buildCompletionLeaders({
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
      <h1 className={styles.title}>Completion % Leaders</h1>
      <p className={styles.lede}>
        Who's actually hitting his receivers, ranked: the quarterbacks
        with the best completion percentage over the last three
        completed weeks. Yardage boards reward volume — this one
        rewards accuracy alone, so it's the precision check behind
        every QB start/sit call and streamer pick.
      </p>

      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading completion leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load completion data ({state.message}). Sleeper's
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
                  No completion leaders for weeks {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Completion percentage leaders, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top quarterbacks by completion percentage (weeks{' '}
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
                        <abbr title="Completion percentage over the last 3 completed weeks (completions over attempts, summed across the window)">
                          Cmp%
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Completions over the last 3 completed weeks">
                          Comp
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Pass attempts over the last 3 completed weeks">
                          Att
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Passing yards over the last 3 completed weeks">
                          Pass Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Passing yards per attempt over the last 3 completed weeks">
                          Yds/Att
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
                        <td>{row.cmpPct.toFixed(1)}%</td>
                        <td>{row.passCmp}</td>
                        <td>{row.passAtt}</td>
                        <td>{row.passYards}</td>
                        <td>{row.ydsPerAtt.toFixed(1)}</td>
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
        Method: completion percentage over the last three completed
        weeks, from Sleeper's free public weekly stats; 2+ games and
        20+ pass attempts per game on average required, ranked by
        completion % (ties by total passing yards, then passing
        touchdowns). The rate sums completions and attempts across the
        window — it is the window rate, not an average of weekly
        rates. An opportunity map, not a forecast: pair it with health
        and matchup before a start/sit call.
      </p>
    </div>
  );
}
