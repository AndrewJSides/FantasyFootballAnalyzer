// Rushing Yards Leaders board (backlog item 162): per-position
// (RB/WR/TE) rushing-yards leaders over the last 3 completed
// weeks — the season-long "who is actually producing on the
// ground" reference board. Priced on Sleeper's free public weekly
// stats at runtime (rush_yd, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /fantasy-points, /snap-counts, /yards-per-target, and
// /receiving-yards pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildRushingYardsLeaders,
  RUSH_YARDS_POSITIONS,
  type RushYardsLeader,
  type RushYardsPosition,
} from '@/utils/rushingYardsLeaders';
import styles from './RushingYardsLeadersPage.module.css';

interface RushingYardsLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<RushYardsPosition, RushYardsLeader[]> };

function rowAriaLabel(row: RushYardsLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.rushYards} rushing yards over his last ${row.games} games ` +
    `(${row.rushYardsPerGame} yards per game, ${row.carries} carries, ` +
    `${row.rushTd} rushing touchdowns)`
  );
}

export function RushingYardsLeadersPage({ pool = POOL }: RushingYardsLeadersPageProps) {
  const [position, setPosition] = useState<RushYardsPosition>('RB');
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
        leaders: buildRushingYardsLeaders({
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
      <h1 className={styles.title}>Rushing Yards Leaders</h1>
      <p className={styles.lede}>
        Who is actually producing on the ground: the most rushing
        yards per game at each skill position over the last three
        completed weeks. Rank 1 grinds out more yards on the ground
        than anyone at his position — the plainest ground-production
        read behind every start/sit and waiver call.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {RUSH_YARDS_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading rushing-yards leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load rushing-yards data ({state.message}).
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
                  No {position} rushing-yards leaders for weeks{' '}
                  {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Rushing-yards leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by rushing yards per game (weeks{' '}
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
                        <abbr title="Rushing yards over the last 3 completed weeks">
                          Rush Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing yards per game over the last 3 completed weeks">
                          Yds/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Carries over the last 3 completed weeks">
                          Carries
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
                        <td>{row.rushYards}</td>
                        <td>{row.rushYardsPerGame.toFixed(1)}</td>
                        <td>{row.carries}</td>
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
        Method: rushing yards per game (Sleeper's rush_yd) over the
        last three completed weeks, from Sleeper's free public weekly
        stats; 2+ games required, so a one-week explosion can't top the
        board. An opportunity map, not a forecast: pair it with health
        and matchup before a start/sit call.
      </p>
    </div>
  );
}
