// Rushing Attempts Leaders board (backlog item 168): per-position
// (RB/WR/TE) rushing-attempt leaders over the last 3 completed
// weeks — the season-long "whose backfield actually feeds him"
// reference board, and the workload companion to the Rushing Yards
// board (item 162). Priced on Sleeper's free public weekly stats
// at runtime (rush_att, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the
// /rushing-yards, /pass-attempts, and /receiving-yards pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildRushingAttemptsLeaders,
  RUSH_ATT_POSITIONS,
  type RushAttLeader,
  type RushAttPosition,
} from '@/utils/rushingAttemptsLeaders';
import styles from './RushingAttemptsLeadersPage.module.css';

interface RushingAttemptsLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<RushAttPosition, RushAttLeader[]> };

function rowAriaLabel(row: RushAttLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.rushAtt} rushing attempts over his last ${row.games} games ` +
    `(${row.rushAttPerGame} attempts per game, ${row.rushYards} rushing yards, ` +
    `${row.ypc} yards per carry, ${row.rushTd} rushing touchdowns)`
  );
}

export function RushingAttemptsLeadersPage({ pool = POOL }: RushingAttemptsLeadersPageProps) {
  const [position, setPosition] = useState<RushAttPosition>('RB');
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
        leaders: buildRushingAttemptsLeaders({
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
      <h1 className={styles.title}>Rushing Attempts Leaders</h1>
      <p className={styles.lede}>
        Whose backfield actually feeds him: the most rushing attempts
        per game at each skill position over the last three completed
        weeks. Rank 1 carries more than anyone at his position — the
        plainest workload read behind every start/sit and waiver call.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {RUSH_ATT_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading rushing-attempts leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load rushing-attempts data ({state.message}).
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
                  No {position} rushing-attempts leaders for weeks{' '}
                  {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Rushing-attempts leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by rushing attempts per game (weeks{' '}
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
                        <abbr title="Rushing attempts over the last 3 completed weeks">
                          Att
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing attempts per game over the last 3 completed weeks">
                          Att/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing yards over the last 3 completed weeks">
                          Rush Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Yards per carry over the last 3 completed weeks">
                          Yds/Att
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing touchdowns over the last 3 completed weeks">
                          Rush TD
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
                        <td>{row.rushAtt}</td>
                        <td>{row.rushAttPerGame.toFixed(1)}</td>
                        <td>{row.rushYards}</td>
                        <td>{row.ypc.toFixed(1)}</td>
                        <td>{row.rushTd}</td>
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
        Method: rushing attempts per game (Sleeper's rush_att) over the
        last three completed weeks, from Sleeper's free public weekly
        stats; 2+ games required, so a one-week explosion can't top the
        board. An opportunity map, not a forecast: pair it with health
        and matchup before a start/sit call.
      </p>
    </div>
  );
}
