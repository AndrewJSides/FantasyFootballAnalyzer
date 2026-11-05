// Snap Count Leaders board (backlog item 159): per-position
// (RB/WR/TE) snap-share leaders over the last 3 completed weeks —
// the season-long "who is actually on the field" reference board.
// Priced on Sleeper's free public weekly stats at runtime
// (off_snp / tm_off_snp, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /ypc, /scrimmage, /touchdowns, /passing, /target-volume,
// /first-downs, /touches, and /fantasy-points pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildSnapCountLeaders,
  SNAP_COUNT_POSITIONS,
  type SnapCountLeader,
  type SnapCountPosition,
} from '@/utils/snapCountLeaders';
import styles from './SnapCountLeadersPage.module.css';

interface SnapCountLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<SnapCountPosition, SnapCountLeader[]> };

function rowAriaLabel(row: SnapCountLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.snaps} offensive snaps over his last ${row.games} games ` +
    `(${row.snapSharePct}% snap share, ${row.snapsPerGame} per game)`
  );
}

export function SnapCountLeadersPage({ pool = POOL }: SnapCountLeadersPageProps) {
  // Running backs drive the snap-share conversation, so they lead
  // the default tab.
  const [position, setPosition] = useState<SnapCountPosition>('RB');
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
        leaders: buildSnapCountLeaders({
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
      <h1 className={styles.title}>Snap Count Leaders</h1>
      <p className={styles.lede}>
        Who is actually on the field: the highest snap share at each
        position over the last three completed weeks. A player can
        only score when he is on the field, so a rising share usually
        comes before rising fantasy points — this is the opportunity
        read behind every other leaders board.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {SNAP_COUNT_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading Snap Count leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load Snap Count data ({state.message}).
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
                  No {position} Snap Count leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Snap Count leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by snap share (weeks {weekStart}–
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
                        <abbr title="Total offensive snaps over the last 3 completed weeks">
                          Snaps
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Share of the team's offensive snaps over the last 3 completed weeks">
                          Snap %
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Offensive snaps per game over the last 3 completed weeks">
                          Snaps/gm
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
                        <td>{row.snaps}</td>
                        <td>{row.snapSharePct.toFixed(1)}%</td>
                        <td>{row.snapsPerGame.toFixed(1)}</td>
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
        Method: offensive snaps as a share of the team's offensive
        snaps (Sleeper's off_snp / tm_off_snp) over the last three
        completed weeks, from Sleeper's free public weekly stats; 2+
        games required, ranked by snap share, so a one-game explosion
        can't top the board. An opportunity map, not a forecast: pair
        it with health and matchup before a start/sit call — snaps
        are the chance to score, not the score.
      </p>
    </div>
  );
}
