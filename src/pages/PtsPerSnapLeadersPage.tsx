// Points Per Snap Leaders board (backlog item 189): per-position
// (RB/WR/TE) full-PPR-points-per-offensive-snap leaders over the last
// 3 completed weeks — the season-long "who makes the most of every
// snap" reference board. Priced on Sleeper's free public weekly stats
// at runtime (pts_ppr over off_snp, via the shared weekly-usage
// fetch), league-independent so guests get the full board like the
// /ypt, /rookies, /efficiency, and /snap-counts pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildPtsPerSnapLeaders,
  PTS_PER_SNAP_POSITIONS,
  type PtsPerSnapLeader,
  type PtsPerSnapPosition,
} from '@/utils/ptsPerSnapLeaders';
import styles from './PtsPerSnapLeadersPage.module.css';

interface PtsPerSnapLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<PtsPerSnapPosition, PtsPerSnapLeader[]> };

function rowAriaLabel(row: PtsPerSnapLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.ptsPerSnap} full-PPR points per snap over his last ${row.games} games ` +
    `(${row.points} points on ${row.snaps} snaps, ${row.ptsPerGame} points per game)`
  );
}

export function PtsPerSnapLeadersPage({ pool = POOL }: PtsPerSnapLeadersPageProps) {
  const [position, setPosition] = useState<PtsPerSnapPosition>('WR');
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
        leaders: buildPtsPerSnapLeaders({
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
      <h1 className={styles.title}>Points / Snap Leaders</h1>
      <p className={styles.lede}>
        Who makes the most of every snap: the most full-PPR points per
        offensive snap at each skill position over the last three
        completed weeks. Rank 1 turns each snap into the most fantasy
        points — the per-snap efficiency read behind every breakout and
        start/sit tiebreak.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {PTS_PER_SNAP_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading points-per-snap leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load points-per-snap data ({state.message}).
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
                  No {position} points-per-snap leaders for weeks{' '}
                  {weekStart}–{weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Points-per-snap leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by points per snap (weeks{' '}
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
                        <abbr title="Full-PPR points per offensive snap over the last 3 completed weeks">
                          Pts/Snap
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Full-PPR points over the last 3 completed weeks">
                          Pts
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Offensive snaps over the last 3 completed weeks">
                          Snaps
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Full-PPR points per game over the last 3 completed weeks">
                          Pts/gm
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
                        <td>{row.ptsPerSnap.toFixed(2)}</td>
                        <td>{row.points.toFixed(1)}</td>
                        <td>{row.snaps}</td>
                        <td>{row.ptsPerGame.toFixed(1)}</td>
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
        Method: full-PPR points per offensive snap (Sleeper's pts_ppr
        over off_snp) over the last three completed weeks, from Sleeper's
        free public weekly stats; 2+ games and 20+ snaps required, so a
        one-snap touchdown can't top the board. An opportunity map, not
        a forecast: pair it with health and matchup before a start/sit
        call.
      </p>
    </div>
  );
}
