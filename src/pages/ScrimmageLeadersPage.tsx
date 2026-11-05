// Scrimmage Yards Leaders board (backlog item 152): per-position
// (RB/WR/TE) yards-from-scrimmage leaders over the last 3 completed
// weeks — the season-long "who produces the most total yardage"
// reference board. Priced on Sleeper's free public weekly stats at
// runtime (rush_yd + rec_yd, via the shared weekly-usage fetch),
// league-independent so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr, and
// /ypc pages.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildScrimmageLeaders,
  SCRIMMAGE_POSITIONS,
  type ScrimmageLeader,
  type ScrimmagePosition,
} from '@/utils/scrimmageLeaders';
import styles from './ScrimmageLeadersPage.module.css';

interface ScrimmageLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<ScrimmagePosition, ScrimmageLeader[]> };

function rowAriaLabel(row: ScrimmageLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.scrimmageYards} yards from scrimmage over his last ${row.games} games ` +
    `(${row.rushYards} rushing yards and ${row.recYards} receiving yards ` +
    `on ${row.touches} touches, ${row.scrimmagePerGame} yards per game)`
  );
}

export function ScrimmageLeadersPage({ pool = POOL }: ScrimmageLeadersPageProps) {
  const [position, setPosition] = useState<ScrimmagePosition>('RB');
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
        leaders: buildScrimmageLeaders({
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
      <h1 className={styles.title}>Scrimmage Yards Leaders</h1>
      <p className={styles.lede}>
        Who produces the most total yardage: the most yards from
        scrimmage at each skill position over the last three completed
        weeks. Rank 1 moves the chains every way — the total-workload
        read behind every breakout and start/sit tiebreak.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {SCRIMMAGE_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading Scrimmage leaders…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load Scrimmage data ({state.message}). Sleeper's free
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
                  No {position} Scrimmage leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Scrimmage leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by scrimmage yards per game (weeks{' '}
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
                        <abbr title="Yards from scrimmage (rushing + receiving) over the last 3 completed weeks">
                          Scrimmage
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Rushing yards over the last 3 completed weeks">
                          Rush Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Receiving yards over the last 3 completed weeks">
                          Rec Yds
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Scrimmage yards per game over the last 3 completed weeks">
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
                        <td>{row.scrimmageYards}</td>
                        <td>{row.rushYards}</td>
                        <td>{row.recYards}</td>
                        <td>{row.scrimmagePerGame.toFixed(1)}</td>
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
        Method: yards from scrimmage (Sleeper's rush_yd + rec_yd) over
        the last three completed weeks, from Sleeper's free public
        weekly stats; 2+ games and 10+ touches required, ranked by
        scrimmage yards per game, so a 1-touch spot start can't top the
        board. An opportunity map, not a forecast: pair it with health
        and matchup before a start/sit call.
      </p>
    </div>
  );
}
