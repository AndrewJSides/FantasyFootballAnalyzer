// Passer Rating Leaders board (backlog item 186): quarterbacks
// ranked by NFL passer rating over the last 3 completed weeks —
// the efficiency read the volume boards can't give. A QB can lead
// the Passing Yards board on 45 attempts a game while completing
// 55% with picks; this board says so in one number, with the
// components (completion %, yards per attempt, TDs, INTs) alongside
// so the rating can be read, not just trusted. Priced on Sleeper's
// free public weekly stats at runtime (pass_cmp / pass_att /
// pass_yd / pass_td / pass_int, summed across the window with the
// NFL formula applied once), league-independent so guests get the
// full board like the /passing, /pass-attempts, and /qb-rushing
// pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildPasserRatingLeaders,
  type PasserRatingLeader,
} from '@/utils/passerRatingLeaders';
import styles from './PasserRatingLeadersPage.module.css';

interface PasserRatingLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: PasserRatingLeader[] };

function rowAriaLabel(row: PasserRatingLeader): string {
  return (
    `${row.player.name} (${row.player.team ?? 'FA'}): ` +
    `passer rating ${row.rating.toFixed(1)} over his last ${row.games} games, ` +
    `${row.cmpPct.toFixed(1)}% completions, ${row.ydsPerAtt.toFixed(1)} yards per attempt, ` +
    `${row.passTd} touchdowns and ${row.passInt} interceptions`
  );
}

export function PasserRatingLeadersPage({ pool = POOL }: PasserRatingLeadersPageProps) {
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
        leaders: buildPasserRatingLeaders({
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
      <h1 className={styles.title}>Passer Rating Leaders</h1>
      <p className={styles.lede}>
        Who's actually throwing it well, ranked: the quarterbacks with
        the best NFL passer rating over the last three completed weeks.
        Yardage boards reward volume — this one rewards accuracy,
        explosiveness, scoring, and ball security in a single number,
        so it's the efficiency check behind every QB start/sit call
        and streamer pick.
      </p>

      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading passer ratings…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load passer rating data ({state.message}). Sleeper's
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
                  No passer rating leaders for weeks {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Passer rating leaders, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top quarterbacks by passer rating (weeks{' '}
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
                        <abbr title="NFL passer rating over the last 3 completed weeks (components summed across the window, formula applied once; scale 0 to 158.3)">
                          Rating
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Completion percentage over the last 3 completed weeks">
                          Cmp%
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Passing yards per attempt over the last 3 completed weeks">
                          Yds/Att
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Passing touchdowns over the last 3 completed weeks">
                          TD
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Interceptions thrown over the last 3 completed weeks">
                          INT
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
                        <td>{row.rating.toFixed(1)}</td>
                        <td>{row.cmpPct.toFixed(1)}%</td>
                        <td>{row.ydsPerAtt.toFixed(1)}</td>
                        <td>{row.passTd}</td>
                        <td>{row.passInt}</td>
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
        Method: NFL passer rating over the last three completed weeks,
        from Sleeper's free public weekly stats; 2+ games and 20+
        pass attempts per game on average required, ranked by rating
        (ties by total passing yards, then passing touchdowns). The
        rating sums completions, attempts, yards, touchdowns, and
        interceptions across the window and applies the standard NFL
        formula once (each component clamped to 0–2.375, scale 0 to
        158.3) — a one-number read on accuracy, explosiveness,
        scoring, and ball security. An opportunity map, not a
        forecast: pair it with health and matchup before a start/sit
        call.
      </p>
    </div>
  );
}
