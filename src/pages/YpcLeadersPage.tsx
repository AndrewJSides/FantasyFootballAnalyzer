// YPC Leaders board (backlog item 151): per-position (RB/WR/TE)
// yards-per-carry leaders over the last 3 completed weeks — the
// season-long "who earns chunk yardage on every carry" reference
// board. Priced on Sleeper's free public weekly stats at runtime
// (rush_yd over rush attempts, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, and /ypr
// pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildYpcLeaders,
  YPC_POSITIONS,
  type YpcLeader,
  type YpcPosition,
} from '@/utils/ypcLeaders';
import styles from './YpcLeadersPage.module.css';

interface YpcLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<YpcPosition, YpcLeader[]> };

function rowAriaLabel(row: YpcLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.ypc} yards per carry over his last ${row.games} games ` +
    `(${row.rushYards} rushing yards on ${row.carries} carries, ` +
    `${row.rushYardsPerGame} yards per game)`
  );
}

export function YpcLeadersPage({ pool = POOL }: YpcLeadersPageProps) {
  const [position, setPosition] = useState<YpcPosition>('RB');
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
        leaders: buildYpcLeaders({
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
      <h1 className={styles.title}>YPC Leaders</h1>
      <p className={styles.lede}>
        Who earns chunk yardage on every carry: the most yards per
        carry at each skill position over the last three completed
        weeks. Rank 1 makes the most of every carry — the per-carry
        efficiency read behind every breakout and start/sit tiebreak.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {YPC_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading YPC leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load YPC data ({state.message}). Sleeper's free
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
                  No {position} YPC leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`YPC leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by yards per carry (weeks{' '}
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
                        <abbr title="Rushing yards per carry over the last 3 completed weeks">
                          YPC
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing yards over the last 3 completed weeks">
                          Rush Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Carries over the last 3 completed weeks">
                          Carries
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing yards per game over the last 3 completed weeks">
                          Yds/gm
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
                        <td>{row.ypc.toFixed(1)}</td>
                        <td>{row.rushYards}</td>
                        <td>{row.carries}</td>
                        <td>{row.rushYardsPerGame.toFixed(1)}</td>
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
        Method: rushing yards per carry (Sleeper's rush_yd over
        rush attempts) over the last three completed weeks, from Sleeper's
        free public weekly stats; 2+ games and 15+ carries required,
        so a 1-for-40 spot start can't top the board. An opportunity
        map, not a forecast: pair it with health and matchup before a
        start/sit call.
      </p>
    </div>
  );
}
