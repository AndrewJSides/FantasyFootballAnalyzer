// Expected Points Leaders board (backlog item 195): per-position
// (QB/RB/WR/TE) expected-points leaders over the last 3 completed
// weeks — how many full-PPR points a perfectly average player would
// score on the same workload (PFF's xFP concept, priced on TraderApe's
// own window rates: each opportunity type at the same window's
// per-position league-average points per opportunity). The FPOE column
// is actual minus expected per game: positive means the player
// outscored his role, negative means the role is worth more than the
// points so far. Priced on Sleeper's free public weekly stats at
// runtime (via the shared weekly-usage fetch), league-independent so
// guests get the full board like the /pts-per-snap and /ypt pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildExpectedPointsLeaders,
  EXPECTED_POINTS_POSITIONS,
  type ExpectedPointsLeader,
  type ExpectedPointsPosition,
} from '@/utils/expectedPointsLeaders';
import styles from './ExpectedPointsLeadersPage.module.css';

interface ExpectedPointsLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<ExpectedPointsPosition, ExpectedPointsLeader[]> };

function signed1(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
}

function rowAriaLabel(row: ExpectedPointsLeader): string {
  const gap =
    row.fpoePerGame > 0
      ? `${row.fpoePerGame.toFixed(1)} points over expected`
      : row.fpoePerGame < 0
        ? `${Math.abs(row.fpoePerGame).toFixed(1)} points under expected`
        : 'right at expected';
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.expectedPerGame.toFixed(1)} expected points per game on his workload ` +
    `over his last ${row.games} games (${row.actualPerGame.toFixed(1)} actual, ${gap})`
  );
}

export function ExpectedPointsLeadersPage({ pool = POOL }: ExpectedPointsLeadersPageProps) {
  const [position, setPosition] = useState<ExpectedPointsPosition>('RB');
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
        leaders: buildExpectedPointsLeaders({
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
  const isQb = position === 'QB';

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Expected Points Leaders</h1>
      <p className={styles.lede}>
        Whose role is worth the most: the expected full-PPR points per game
        an average player would score on the same workload over the last
        three completed weeks. A negative FPOE (actual below expected) is
        the buy-low read — the role is producing less than it should.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {EXPECTED_POINTS_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading expected-points leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load expected-points data ({state.message}).
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
                  No {position} expected-points leaders for weeks{' '}
                  {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Expected-points leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by expected points per game (weeks{' '}
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
                        <abbr title="Expected full-PPR points per game: the player's targets, carries, and pass attempts priced at the same window's per-position league-average points per opportunity">
                          xFP/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Actual full-PPR points per game over the last 3 completed weeks (Sleeper's pts_ppr)">
                          Actual/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Fantasy points over expected per game: actual minus expected. Positive means the player outscored his role; negative means the role is worth more than the points so far">
                          FPOE
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr
                          title={
                            isQb
                              ? 'Pass attempts per game over the last 3 completed weeks'
                              : 'Targets per game over the last 3 completed weeks'
                          }
                        >
                          {isQb ? 'Pass/gm' : 'Tgt/gm'}
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rush attempts per game over the last 3 completed weeks">
                          Rush/gm
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
                        <td>{row.expectedPerGame.toFixed(1)}</td>
                        <td>{row.actualPerGame.toFixed(1)}</td>
                        <td>{signed1(row.fpoePerGame)}</td>
                        <td>{isQb ? row.passPerGame.toFixed(1) : row.targetsPerGame.toFixed(1)}</td>
                        <td>{row.rushPerGame.toFixed(1)}</td>
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
        Method: each target, carry, and pass attempt is priced at the same
        three-week window's per-position league-average points for that
        opportunity type (standard full-PPR scoring: 1 per reception, 1
        per 10 rushing/receiving yards, 6 per rushing/receiving TD, 1
        per 25 passing yards, 4 per passing TD, −1 per interception),
        computed from Sleeper's free public weekly stats; 2+ games
        required. Actuals are Sleeper's pts_ppr, which also include
        fumbles lost, 2-point conversions, and return scores — the
        workload pricing excludes them by design. A role map, not a
        forecast: pair it with health and matchup before a start/sit
        call.
      </p>
    </div>
  );
}
