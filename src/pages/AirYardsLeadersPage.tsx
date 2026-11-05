// Air Yards Leaders board (backlog item 146): per-position (RB/WR/TE)
// air-yards leaders over the last 3 completed weeks — the season-long
// "who is earning downfield targets" reference board. Priced on
// Sleeper's free public weekly stats at runtime (rec_air_yd, via the
// shared weekly-usage fetch), league-independent so guests get the full
// board like the /targets and /red-zone pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildAirYardsLeaders,
  AIR_YARDS_POSITIONS,
  type AirYardsLeader,
  type AirYardsPosition,
} from '@/utils/airYardsLeaders';
import styles from './AirYardsLeadersPage.module.css';

interface AirYardsLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<AirYardsPosition, AirYardsLeader[]> };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function rowAriaLabel(row: AirYardsLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.airYards} air yards over his last ${row.games} games ` +
    `(${row.airYardsPerGame} per game), ${pct(row.airShare ?? 0)} of his team's air yards` +
    (row.aDot === null
      ? ''
      : `, ${row.aDot} yards downfield per target`)
  );
}

export function AirYardsLeadersPage({ pool = POOL }: AirYardsLeadersPageProps) {
  const [position, setPosition] = useState<AirYardsPosition>('WR');
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
        leaders: buildAirYardsLeaders({
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
      <h1 className={styles.title}>Air Yards Leaders</h1>
      <p className={styles.lede}>
        Who is earning downfield targets: the highest air-yard workloads
        at each skill position over the last three completed weeks.
        Rank 1 commands the most yards in the air — the leading indicator
        behind every breakout before the box score catches up.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {AIR_YARDS_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading air-yards leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load air-yards data ({state.message}). Sleeper's
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
                  No {position} air-yards leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Air-yards leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by air yards (weeks {weekStart}–
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
                        <abbr title="Air yards (yards a pass travels in the air on a target) over the last 3 completed weeks">
                          Air Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Air yards per game over the last 3 completed weeks">
                          Air/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Share of the player's NFL team's air yards over the player's last 3 completed weeks">
                          Air %
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Average depth of target: air yards per target over the last 3 completed weeks">
                          aDOT
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
                        <td>{row.airYards}</td>
                        <td>{row.airYardsPerGame.toFixed(1)}</td>
                        <td>{pct(row.airShare ?? 0)}</td>
                        <td>{row.aDot === null ? '—' : row.aDot.toFixed(1)}</td>
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
        Method: receiving air yards (yards a pass travels in the air on a
        target, Sleeper's rec_air_yd) over the last three completed weeks,
        from Sleeper's free public weekly stats; 2+ games required.
        Screen-heavy weeks can go negative, so a player needs positive
        total air yards to lead the board. An opportunity map, not a
        forecast: pair it with health and matchup before a start/sit call.
      </p>
    </div>
  );
}
