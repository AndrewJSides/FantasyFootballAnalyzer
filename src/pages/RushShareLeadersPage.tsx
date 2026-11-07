// Rush Share Leaders board (backlog item 184): per-position (RB/WR/TE)
// rush-share leaders over the last 3 completed weeks — the season-long
// "who's actually getting the carries" reference board. The workhorse
// read behind every RB start/sit call and waiver pickup, priced on
// Sleeper's free public weekly stats at runtime (same data as the
// Target Share board), league-independent so guests get the full board
// like the /targets page.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildRushShareLeaders,
  RUSH_SHARE_POSITIONS,
  type RushShareLeader,
  type RushSharePosition,
} from '@/utils/rushShareLeaders';
import styles from './RushShareLeadersPage.module.css';

interface RushShareLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<RushSharePosition, RushShareLeader[]> };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function rowAriaLabel(row: RushShareLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${pct(row.rushShare)} of his team's rushing attempts over his last ${row.games} ` +
    `games, ${row.rushAttPerGame} carries and ${row.rushYardsPerGame} rushing yards per game`
  );
}

export function RushShareLeadersPage({ pool = POOL }: RushShareLeadersPageProps) {
  const [position, setPosition] = useState<RushSharePosition>('RB');
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
        leaders: buildRushShareLeaders({
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
      <h1 className={styles.title}>Rush Share Leaders</h1>
      <p className={styles.lede}>
        Who's actually getting the carries: the highest shares of their own
        team's rushing attempts at each skill position over the last three
        completed weeks. Rank 1 commands the backfield — the workload read
        behind every RB waiver and trade decision.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {RUSH_SHARE_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading rush shares…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load rush-share data ({state.message}). Sleeper's
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
                  No {position} rush-share leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Rush share leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by rush share (weeks {weekStart}–{weekEnd})
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="visually-hidden">Rank</span>
                      </th>
                      <th scope="col">Player</th>
                      <th scope="col">NFL</th>
                      <th scope="col">
                        <abbr title="Share of the player's NFL team's rushing attempts over the player's last 3 completed weeks">
                          Rush %
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing attempts per game over the last 3 completed weeks">
                          Att/gm
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
                        <td>{pct(row.rushShare)}</td>
                        <td>{row.rushAttPerGame.toFixed(1)}</td>
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
        Method: rush share (player rushing attempts / team rushing attempts)
        over the last three completed weeks, from Sleeper's free public
        weekly stats; 2+ games required, QB scrambles included in the team
        total. An opportunity map, not a forecast: pair it with health and
        matchup before a start/sit call.
      </p>
    </div>
  );
}
