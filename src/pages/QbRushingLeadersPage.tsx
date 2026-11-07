// QB Rushing Leaders board (backlog item 185): quarterbacks ranked
// by rushing yards per game over the last 3 completed weeks — the
// season-long Konami-code reference board. A rushing yard is worth
// 2.5x a passing yard and a rushing TD 1.5x a passing TD in full-PPR
// scoring, so QB rushing floor is the streamer / QB2-upside read
// behind every QB start/sit call. Priced on Sleeper's free public
// weekly stats at runtime (same data as the Rushing Yards board,
// which is RB/WR/TE only), league-independent so guests get the full
// board like the /targets page.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildQbRushingLeaders,
  type QbRushingLeader,
} from '@/utils/qbRushingLeaders';
import styles from './QbRushingLeadersPage.module.css';

interface QbRushingLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: QbRushingLeader[] };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function rowAriaLabel(row: QbRushingLeader): string {
  return (
    `${row.player.name} (${row.player.team ?? 'FA'}): ` +
    `${row.rushYardsPerGame} rushing yards and ${row.rushAttPerGame} carries per game ` +
    `over his last ${row.games} games, ${row.rushTd} rushing touchdowns, ` +
    `${pct(row.rushPtsShare)} of his fantasy points from rushing`
  );
}

export function QbRushingLeadersPage({ pool = POOL }: QbRushingLeadersPageProps) {
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
        leaders: buildQbRushingLeaders({
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
      <h1 className={styles.title}>QB Rushing Leaders</h1>
      <p className={styles.lede}>
        The Konami code, ranked: the quarterbacks gaining the most on the
        ground over the last three completed weeks. A rushing yard is
        worth 2.5x a passing yard in full-PPR scoring, so the QBs at the
        top of this board carry a rushing floor no pocket passer can
        match — the streamer and QB2-upside read behind every QB
        start/sit call.
      </p>

      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading QB rushing…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load QB rushing data ({state.message}). Sleeper's
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
                  No QB rushing leaders for weeks {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`QB rushing leaders, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top quarterbacks by rushing yards per game (weeks{' '}
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
                        <abbr title="Rushing yards per game over the last 3 completed weeks">
                          Rush Yds/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing attempts per game over the last 3 completed weeks">
                          Att/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing touchdowns over the last 3 completed weeks">
                          Rush TD
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Share of the quarterback's full-PPR fantasy points over the last 3 completed weeks that came from rushing (rushing yards / 10 plus rushing touchdowns x 6, over total PPR points)">
                          Rush Pts %
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
                        <td>{row.rushYardsPerGame.toFixed(1)}</td>
                        <td>{row.rushAttPerGame.toFixed(1)}</td>
                        <td>{row.rushTd}</td>
                        <td>{pct(row.rushPtsShare)}</td>
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
        Method: rushing yards per game over the last three completed
        weeks, from Sleeper's free public weekly stats; 2+ games
        required, ranked by yards per game (ties by total rushing
        yards, then rushing touchdowns). Rush Pts % is the share of the
        QB's full-PPR points in the window from rushing — rushing yards
        / 10 plus rushing touchdowns x 6, over total PPR points. An
        opportunity map, not a forecast: pair it with health and matchup
        before a start/sit call.
      </p>
    </div>
  );
}
