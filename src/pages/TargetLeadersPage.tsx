// Target Share Leaders board (backlog item 107): per-position (RB/WR/TE)
// target-share leaders over the last 3 completed weeks — the season-long
// "who's actually getting fed" reference board. Companion to Snap
// Leaders (item 104), which ranks by snap share, and Opportunity Watch
// (item 71), which flags available players earning a role; the board
// ranks everyone, rostered or not, by share of his own NFL team's
// targets. Priced on Sleeper's free public weekly stats at runtime (same
// data as Opportunity Watch), league-independent so guests get the full
// board like the /snaps page.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildTargetLeaders,
  TARGET_POSITIONS,
  type TargetLeader,
  type TargetPosition,
} from '@/utils/targetLeaders';
import styles from './TargetLeadersPage.module.css';

interface TargetLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<TargetPosition, TargetLeader[]> };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function rowAriaLabel(row: TargetLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${pct(row.targetShare)} of his team's targets over his last ${row.games} ` +
    `games, ${row.targetsPerGame} targets and ${row.receptionsPerGame} receptions per game`
  );
}

export function TargetLeadersPage({ pool = POOL }: TargetLeadersPageProps) {
  const [position, setPosition] = useState<TargetPosition>('RB');
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
        leaders: buildTargetLeaders({
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
      <h1 className={styles.title}>Target Share Leaders</h1>
      <p className={styles.lede}>
        Who's actually getting fed: the highest shares of their own team's
        targets at each skill position over the last three completed weeks.
        Rank 1 commands the most targets — the volume read behind every
        waiver and trade decision.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {TARGET_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading target shares…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load target data ({state.message}). Sleeper's free
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
                  No {position} target leaders for weeks {weekStart}–{weekEnd}
                  yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Target share leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by target share (weeks {weekStart}–{weekEnd})
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="visually-hidden">Rank</span>
                      </th>
                      <th scope="col">Player</th>
                      <th scope="col">NFL</th>
                      <th scope="col">
                        <abbr title="Share of the player's NFL team's targets over the player's last 3 completed weeks">
                          Tgt %
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Targets per game over the last 3 completed weeks">
                          Targets/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receptions per game over the last 3 completed weeks">
                          Rec/gm
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
                        <td>{pct(row.targetShare)}</td>
                        <td>{row.targetsPerGame.toFixed(1)}</td>
                        <td>{row.receptionsPerGame.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
      </div>

      <p className={styles.footnote}>
        Method: target share (player targets / team targets) over the last
        three completed weeks, from Sleeper's free public weekly stats; 2+
        games required. An opportunity map, not a forecast: pair it with
        health and matchup before a start/sit call.
      </p>
    </div>
  );
}
