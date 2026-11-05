// Deep Play Leaders board (backlog item 147): per-position (RB/WR/TE)
// deep-reception leaders over the last 3 completed weeks — the
// season-long "who is actually converting downfield work into big
// plays" reference board. Priced on Sleeper's free public weekly stats
// at runtime (rec_20_29 + rec_30_39 + rec_40p, rec_lng, via the shared
// weekly-usage fetch), league-independent so guests get the full board
// like the /targets, /red-zone, and /air-yards pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildDeepPlayLeaders,
  DEEP_PLAY_POSITIONS,
  type DeepPlayLeader,
  type DeepPlayPosition,
} from '@/utils/deepPlayLeaders';
import styles from './DeepPlayLeadersPage.module.css';

interface DeepPlayLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<DeepPlayPosition, DeepPlayLeader[]> };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function rowAriaLabel(row: DeepPlayLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.deepRec} deep receptions over his last ${row.games} games ` +
    `(${row.deepRecPerGame} per game), ${pct(row.deepShare ?? 0)} of his team's deep receptions` +
    `, longest catch ${row.longRec} yards`
  );
}

export function DeepPlayLeadersPage({ pool = POOL }: DeepPlayLeadersPageProps) {
  const [position, setPosition] = useState<DeepPlayPosition>('WR');
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
        leaders: buildDeepPlayLeaders({
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
      <h1 className={styles.title}>Deep Play Leaders</h1>
      <p className={styles.lede}>
        Who is actually converting downfield work into big plays: the
        most 20+ yard catches at each skill position over the last three
        completed weeks. Rank 1 catches the most deep balls — the ceiling
        read behind every start/sit tiebreak.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {DEEP_PLAY_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading deep-play leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load deep-play data ({state.message}). Sleeper's
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
                  No {position} deep-play leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Deep-play leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by deep receptions (weeks {weekStart}–
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
                        <abbr title="Deep receptions (catches of 20+ yards) over the last 3 completed weeks">
                          Deep Rec
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Deep receptions per game over the last 3 completed weeks">
                          Deep/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Share of the player's NFL team's deep receptions over the player's last 3 completed weeks">
                          Deep %
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Longest reception in the last 3 completed weeks">
                          Long
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
                        <td>{row.deepRec}</td>
                        <td>{row.deepRecPerGame.toFixed(1)}</td>
                        <td>{pct(row.deepShare ?? 0)}</td>
                        <td>{row.longRec}</td>
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
        Method: deep receptions (catches of 20+ yards, Sleeper's
        rec_20_29 + rec_30_39 + rec_40p) over the last three completed
        weeks, from Sleeper's free public weekly stats; 2+ games
        required, and a player needs at least one deep reception to lead
        the board. Longest reception is the longest catch in the window.
        An opportunity map, not a forecast: pair it with health and
        matchup before a start/sit call.
      </p>
    </div>
  );
}
