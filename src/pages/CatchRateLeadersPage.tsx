// Catch Rate Leaders board (backlog item 148): per-position (RB/WR/TE)
// catch-rate leaders over the last 3 completed weeks — the season-long
// "who is actually converting his targets into catches" reference
// board. Priced on Sleeper's free public weekly stats at runtime
// (rec / rec_tgt, via the shared weekly-usage fetch), league-independent
// so guests get the full board like the /targets, /red-zone,
// /air-yards, and /deep-plays pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildCatchRateLeaders,
  CATCH_RATE_POSITIONS,
  type CatchRateLeader,
  type CatchRatePosition,
} from '@/utils/catchRateLeaders';
import styles from './CatchRateLeadersPage.module.css';

interface CatchRateLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<CatchRatePosition, CatchRateLeader[]> };

const pct1 = (n: number): string => `${(n * 100).toFixed(1)}%`;

function rowAriaLabel(row: CatchRateLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `caught ${row.receptions} of ${row.targets} targets over his last ${row.games} games ` +
    `(${pct1(row.catchRate)} catch rate, ${row.targetsPerGame} targets per game)`
  );
}

export function CatchRateLeadersPage({ pool = POOL }: CatchRateLeadersPageProps) {
  const [position, setPosition] = useState<CatchRatePosition>('WR');
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
        leaders: buildCatchRateLeaders({
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
      <h1 className={styles.title}>Catch Rate Leaders</h1>
      <p className={styles.lede}>
        Who is actually converting his targets into catches: the highest
        catch rates at each skill position over the last three completed
        weeks. Rank 1 secures the most of what comes his way — the
        reliability read behind every start/sit tiebreak.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {CATCH_RATE_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading catch-rate leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load catch-rate data ({state.message}). Sleeper's
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
            const rows = state.leaders.get(position) ?? [];
            if (rows.length === 0) {
              return (
                <p className={styles.note}>
                  No {position} catch-rate leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Catch-rate leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by catch rate (weeks {weekStart}–
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
                        <abbr title="Receptions over targets over the last 3 completed weeks">
                          Catch %
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Targets over the last 3 completed weeks">
                          Targets
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receptions over the last 3 completed weeks">
                          Rec
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Targets per game over the last 3 completed weeks">
                          Tgt/gm
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
                        <td>{pct1(row.catchRate)}</td>
                        <td>{row.targets}</td>
                        <td>{row.receptions}</td>
                        <td>{row.targetsPerGame.toFixed(1)}</td>
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
        Method: catch rate (receptions over targets, Sleeper's rec /
        rec_tgt) over the last three completed weeks, from Sleeper's free
        public weekly stats; 2+ games and 10+ targets required, so a
        2-for-2 can't top the board. An opportunity map, not a forecast:
        pair it with health and matchup before a start/sit call.
      </p>
    </div>
  );
}
