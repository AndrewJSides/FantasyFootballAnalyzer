// Receiving Touchdowns Leaders board (backlog item 166): per-position
// (RB/WR/TE) receiving-touchdown leaders over the last 3 completed
// weeks — the season-long "who is actually finding the end zone as a
// pass-catcher" reference board, and the TD-regression companion to
// the Receiving Yards board (item 161), which shows rec TD only as a
// secondary column. Priced on Sleeper's free public weekly stats at
// runtime (rec_td, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the
// /receiving-yards, /receptions, /passing-touchdowns, and
// /rushing-touchdowns pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildReceivingTdLeaders,
  REC_TD_POSITIONS,
  type RecTdLeader,
  type RecTdPosition,
} from '@/utils/receivingTdLeaders';
import styles from './ReceivingTdLeadersPage.module.css';

interface ReceivingTdLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<RecTdPosition, RecTdLeader[]> };

function rowAriaLabel(row: RecTdLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.recTd} receiving touchdowns over his last ${row.games} games ` +
    `(${row.recTdPerGame} touchdowns per game, ${row.recYards} receiving ` +
    `yards, ${row.receptions} receptions)`
  );
}

export function ReceivingTdLeadersPage({ pool = POOL }: ReceivingTdLeadersPageProps) {
  const [position, setPosition] = useState<RecTdPosition>('WR');
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
        leaders: buildReceivingTdLeaders({
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
      <h1 className={styles.title}>Receiving Touchdowns Leaders</h1>
      <p className={styles.lede}>
        Who is actually finding the end zone as a pass-catcher: the
        most receiving touchdowns per game at each skill position over
        the last three completed weeks. Rank 1 scores through the air
        more often than anyone at his position — the through-the-air
        scoring read behind every red-zone and TD-regression call.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {REC_TD_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading receiving-touchdowns leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load receiving-touchdowns data ({state.message}).
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
                  No {position} receiving-touchdowns leaders for weeks{' '}
                  {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Receiving-touchdowns leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by receiving touchdowns per game (weeks{' '}
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
                        <abbr title="Receiving touchdowns over the last 3 completed weeks">
                          Rec TD
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receiving touchdowns per game over the last 3 completed weeks">
                          TDs/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receiving yards over the last 3 completed weeks">
                          Rec Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receptions over the last 3 completed weeks">
                          Receptions
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
                        <td>{row.recTd}</td>
                        <td>{row.recTdPerGame.toFixed(1)}</td>
                        <td>{row.recYards}</td>
                        <td>{row.receptions}</td>
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
        Method: receiving touchdowns per game (Sleeper's rec_td) over
        the last three completed weeks, from Sleeper's free public
        weekly stats; 2+ games required, ranked by touchdowns per
        game, so a one-game explosion can't top the board. An
        opportunity map, not a forecast: pair it with health and
        matchup before a start/sit call — receiving touchdowns are the
        highest-variance fantasy points, and a red-zone specialist can
        outrank a high-yardage receiver here.
      </p>
    </div>
  );
}
