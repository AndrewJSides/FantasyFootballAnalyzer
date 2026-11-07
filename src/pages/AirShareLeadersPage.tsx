// Air Yards Share Leaders board (backlog item 194): per-position
// (RB/WR/TE) leaders in share of their own NFL team's air yards over
// the last 3 completed weeks — the "who does this passing game run
// through downfield" reference board. Priced on Sleeper's free public
// weekly stats at runtime (rec_air_yd + rec_tgt, via the shared
// weekly-usage fetch), league-independent so guests get the full board
// like the /air-yards and /targets pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildAirShareLeaders,
  AIR_SHARE_POSITIONS,
  type AirShareLeader,
  type AirSharePosition,
} from '@/utils/airShareLeaders';
import styles from './AirShareLeadersPage.module.css';

interface AirShareLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<AirSharePosition, AirShareLeader[]> };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function rowAriaLabel(row: AirShareLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${pct(row.airShare)} of his team's air yards over his last ${row.games} games ` +
    `(${row.airYards} air yards, ${row.airYardsPerGame} per game)` +
    (row.targetShare === null
      ? ''
      : `, ${pct(row.targetShare)} target share`) +
    (row.aDot === null
      ? ''
      : `, ${row.aDot} yards downfield per target`) +
    (row.isThirtyThirty ? ', in the 30/30 club' : '')
  );
}

export function AirShareLeadersPage({ pool = POOL }: AirShareLeadersPageProps) {
  const [position, setPosition] = useState<AirSharePosition>('WR');
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
        leaders: buildAirShareLeaders({
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
      <h1 className={styles.title}>Air Yards Share Leaders</h1>
      <p className={styles.lede}>
        Who owns his team's downfield passing game: the highest shares of
        team air yards at each skill position over the last three completed
        weeks. Rank 1 commands the biggest slice of his offense's passing
        distance — the volume read and the depth read in one number.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {AIR_SHARE_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading air-yards-share leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load air-yards-share data ({state.message}).
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
                  No {position} air-yards-share leaders for weeks{' '}
                  {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Air-yards-share leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by share of team air yards (weeks{' '}
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
                        <abbr title="Share of the player's NFL team's air yards over the last 3 completed weeks">
                          Air %
                        </abbr>
                      </th>
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
                        <abbr title="Share of the player's NFL team's targets over the last 3 completed weeks">
                          Tgt %
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
                        <td>
                          {pct(row.airShare)}{' '}
                          {row.isThirtyThirty && (
                            <span
                              className={styles.tag30}
                              title="30/30 club: 30%+ target share and 30%+ air-yards share"
                            >
                              30/30
                            </span>
                          )}
                        </td>
                        <td>{row.airYards}</td>
                        <td>{row.airYardsPerGame.toFixed(1)}</td>
                        <td>
                          {row.targetShare === null ? '—' : pct(row.targetShare)}
                        </td>
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
        Method: each player's air yards over his own NFL team's air yards
        (Sleeper's rec_air_yd), plus target share on the same window, over
        the last three completed weeks, from Sleeper's free public weekly
        stats; 2+ games required, positive team air yards required. The
        30/30 tag marks 30%+ target share and 30%+ air-yards share — a
        passing game that runs through one player at every depth. An
        opportunity map, not a forecast: pair it with health and matchup
        before a start/sit call.
      </p>
    </div>
  );
}
