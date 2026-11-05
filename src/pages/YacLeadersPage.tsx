// YAC Leaders board (backlog item 149): per-position (RB/WR/TE)
// yards-after-catch leaders over the last 3 completed weeks — the
// season-long "who is creating his own yards after the catch"
// reference board. Priced on Sleeper's free public weekly stats at
// runtime (rec_yar, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, and /catch-rate pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildYacLeaders,
  YAC_POSITIONS,
  type YacLeader,
  type YacPosition,
} from '@/utils/yacLeaders';
import styles from './YacLeadersPage.module.css';

interface YacLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<YacPosition, YacLeader[]> };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function rowAriaLabel(row: YacLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.yac} yards after the catch over his last ${row.games} games ` +
    `(${row.yacPerGame} per game, ${row.yacPerRec ?? '—'} per reception), ` +
    `${pct(row.yacShare ?? 0)} of his team's yards after the catch`
  );
}

export function YacLeadersPage({ pool = POOL }: YacLeadersPageProps) {
  const [position, setPosition] = useState<YacPosition>('WR');
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
        leaders: buildYacLeaders({
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
      <h1 className={styles.title}>YAC Leaders</h1>
      <p className={styles.lede}>
        Who is creating his own yards after the catch: the most yards
        after the catch at each skill position over the last three
        completed weeks. Rank 1 makes the most of every reception — the
        after-the-catch read behind every breakout and start/sit
        tiebreak.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {YAC_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading YAC leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load YAC data ({state.message}). Sleeper's free
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
            const rows = state.leaders.get(position) ?? [];
            if (rows.length === 0) {
              return (
                <p className={styles.note}>
                  No {position} YAC leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`YAC leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by yards after the catch (weeks{' '}
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
                        <abbr title="Yards after the catch over the last 3 completed weeks">
                          YAC
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Yards after the catch per game over the last 3 completed weeks">
                          YAC/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Yards after the catch per reception over the last 3 completed weeks">
                          YAC/rec
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Share of the player's NFL team's yards after the catch over the player's last 3 completed weeks">
                          YAC %
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
                        <td>{row.yac}</td>
                        <td>{row.yacPerGame.toFixed(1)}</td>
                        <td>{row.yacPerRec === null ? '—' : row.yacPerRec.toFixed(1)}</td>
                        <td>{pct(row.yacShare ?? 0)}</td>
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
        Method: yards after the catch (Sleeper's rec_yar) over the last
        three completed weeks, from Sleeper's free public weekly stats;
        2+ games required, and a player needs at least one yard after
        the catch to lead the board. YAC per reception divides the
        window's YAC by its receptions. An opportunity map, not a
        forecast: pair it with health and matchup before a start/sit
        call.
      </p>
    </div>
  );
}
