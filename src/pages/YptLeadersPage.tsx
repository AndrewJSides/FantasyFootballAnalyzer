// YPT Leaders board (backlog item 188): per-position (RB/WR/TE)
// yards-per-target leaders over the last 3 completed weeks — the
// season-long "who makes the most of every opportunity" reference
// board. Priced on Sleeper's free public weekly stats at runtime
// (rec_yd over rec_tgt, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr, and
// /rookies pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildYptLeaders,
  YPT_POSITIONS,
  type YptLeader,
  type YptPosition,
} from '@/utils/yptLeaders';
import styles from './YptLeadersPage.module.css';

interface YptLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<YptPosition, YptLeader[]> };

function rowAriaLabel(row: YptLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.ypt} yards per target over his last ${row.games} games ` +
    `(${row.recYards} receiving yards on ${row.targets} targets, ` +
    `${row.receptions} receptions, ${Math.round(row.catchRate * 100)}% catch rate)`
  );
}

export function YptLeadersPage({ pool = POOL }: YptLeadersPageProps) {
  const [position, setPosition] = useState<YptPosition>('WR');
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
        leaders: buildYptLeaders({
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
      <h1 className={styles.title}>YPT Leaders</h1>
      <p className={styles.lede}>
        Who makes the most of every opportunity: the most yards per
        target at each skill position over the last three completed
        weeks. Rank 1 squeezes the most yardage out of every target —
        the per-target efficiency read behind every breakout and
        start/sit tiebreak.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {YPT_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading YPT leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load YPT data ({state.message}). Sleeper's free
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
                  No {position} YPT leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`YPT leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by yards per target (weeks{' '}
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
                        <abbr title="Receiving yards per target over the last 3 completed weeks">
                          YPT
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receiving yards over the last 3 completed weeks">
                          Rec Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Targets over the last 3 completed weeks">
                          Targets
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Catch rate (receptions over targets) over the last 3 completed weeks">
                          Catch%
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
                        <td>{row.ypt.toFixed(1)}</td>
                        <td>{row.recYards}</td>
                        <td>{row.targets}</td>
                        <td>{Math.round(row.catchRate * 100)}%</td>
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
        Method: receiving yards per target (Sleeper's rec_yd over
        rec_tgt) over the last three completed weeks, from Sleeper's
        free public weekly stats; 2+ games and 10+ targets required,
        so a 1-for-40 spot start can't top the board. An opportunity
        map, not a forecast: pair it with health and matchup before a
        start/sit call.
      </p>
    </div>
  );
}
