// Receiving Yards Leaders board (backlog item 161): per-position
// (RB/WR/TE) receiving-yards leaders over the last 3 completed
// weeks — the season-long "who is actually producing through the
// air" reference board. Priced on Sleeper's free public weekly stats
// at runtime (rec_yd, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /fantasy-points, /snap-counts, and /yards-per-target pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildReceivingYardsLeaders,
  REC_YARDS_POSITIONS,
  type RecYardsLeader,
  type RecYardsPosition,
} from '@/utils/receivingYardsLeaders';
import styles from './ReceivingYardsLeadersPage.module.css';

interface ReceivingYardsLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<RecYardsPosition, RecYardsLeader[]> };

function rowAriaLabel(row: RecYardsLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.recYards} receiving yards over his last ${row.games} games ` +
    `(${row.recYardsPerGame} yards per game, ${row.targets} targets, ` +
    `${row.receptions} receptions)`
  );
}

export function ReceivingYardsLeadersPage({ pool = POOL }: ReceivingYardsLeadersPageProps) {
  const [position, setPosition] = useState<RecYardsPosition>('WR');
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
        leaders: buildReceivingYardsLeaders({
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
      <h1 className={styles.title}>Receiving Yards Leaders</h1>
      <p className={styles.lede}>
        Who is actually producing through the air: the most receiving
        yards per game at each skill position over the last three
        completed weeks. Rank 1 moves the chains through the air more
        than anyone at his position — the plainest production read
        behind every start/sit and waiver call.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {REC_YARDS_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading receiving-yards leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load receiving-yards data ({state.message}).
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
                  No {position} receiving-yards leaders for weeks{' '}
                  {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Receiving-yards leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by receiving yards per game (weeks{' '}
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
                        <abbr title="Receiving yards over the last 3 completed weeks">
                          Rec Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receiving yards per game over the last 3 completed weeks">
                          Yds/gm
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
                        <td>{row.recYards}</td>
                        <td>{row.recYardsPerGame.toFixed(1)}</td>
                        <td>{row.targets}</td>
                        <td>{row.receptions}</td>
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
        Method: receiving yards per game (Sleeper's rec_yd) over the
        last three completed weeks, from Sleeper's free public weekly
        stats; 2+ games required, so a one-week explosion can't top the
        board. An opportunity map, not a forecast: pair it with health
        and matchup before a start/sit call.
      </p>
    </div>
  );
}
