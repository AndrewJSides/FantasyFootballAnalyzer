// Red Zone Leaders board (backlog item 145): per-position (RB/WR/TE)
// red-zone opportunity leaders over the last 3 completed weeks — the
// season-long "who gets the ball inside the 20" reference board.
// Priced on Sleeper's free public weekly stats at runtime (rush_rz_att +
// rec_rz_tgt, via the shared weekly-usage fetch), league-independent so
// guests get the full board like the /targets and /opportunity pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildRedZoneLeaders,
  RED_ZONE_POSITIONS,
  type RedZoneLeader,
  type RedZonePosition,
} from '@/utils/redZoneLeaders';
import styles from './RedZoneLeadersPage.module.css';

interface RedZoneLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<RedZonePosition, RedZoneLeader[]> };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function rowAriaLabel(row: RedZoneLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.rzOpps} red-zone opportunities over his last ${row.games} ` +
    `games (${row.rzOppsPerGame} per game), ${pct(row.rzShare ?? 0)} of his team's red-zone work`
  );
}

export function RedZoneLeadersPage({ pool = POOL }: RedZoneLeadersPageProps) {
  const [position, setPosition] = useState<RedZonePosition>('RB');
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
        leaders: buildRedZoneLeaders({
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
      <h1 className={styles.title}>Red Zone Leaders</h1>
      <p className={styles.lede}>
        Who gets the ball inside the 20: the highest red-zone workloads
        (rush attempts + targets) at each skill position over the last
        three completed weeks. Rank 1 commands the most scoring chances —
        the TD-probability read behind every waiver and trade decision.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {RED_ZONE_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading red-zone leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load red-zone data ({state.message}). Sleeper's
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
                  No {position} red-zone leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Red-zone opportunity leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by red-zone opportunities (weeks {weekStart}–
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
                        <abbr title="Red-zone opportunities (rush attempts + targets inside the 20) over the last 3 completed weeks">
                          RZ Opps
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Red-zone opportunities per game over the last 3 completed weeks">
                          RZ/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Share of the player's NFL team's red-zone opportunities over the player's last 3 completed weeks">
                          RZ %
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
                        <td>{row.rzOpps}</td>
                        <td>{row.rzOppsPerGame.toFixed(1)}</td>
                        <td>{pct(row.rzShare ?? 0)}</td>
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
        Method: red-zone opportunities (a rush attempt or a target on a
        play starting inside the opponent's 20) over the last three
        completed weeks, from Sleeper's free public weekly stats; 2+
        games required. An opportunity map, not a forecast: pair it with
        health and matchup before a start/sit call.
      </p>
    </div>
  );
}
