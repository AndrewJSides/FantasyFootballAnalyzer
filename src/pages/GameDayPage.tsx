// Game Day Live Leaderboard (backlog item 171): the league-wide live
// view — every team ranked by banked fantasy points with projected
// final and live win %, plus the week's top live individual scorers.
// League mode reuses the Matchup page's live-matchup engine, so this
// board and the per-matchup live scores can't disagree; guests get the
// top-scorers board from Sleeper's free public weekly stats, which
// update as NFL games play. Auto-refreshes every minute while starters
// are still pending; a live read, not a final.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { fetchWeekPprStats } from '@/api/sleeperWeeklyPoints';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildGameDayBoard,
  topLiveScorersFromStats,
  type GameDayBoard,
  type GameDayScorer,
} from '@/utils/gameDayLeaderboard';
import { timeAgo } from '@/utils/relativeTime';
import styles from './GameDayPage.module.css';

const LIVE_REFRESH_MS = 60_000;

interface GameDayPageProps {
  league?: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      week: number;
      board: GameDayBoard | null;
      scorers: GameDayScorer[];
      updatedAt: number;
    };

function teamRowAriaLabel(row: GameDayBoard['teams'][number]): string {
  return (
    `${row.teamName}, rank ${row.rank}: ${row.actualSoFar.toFixed(1)} ` +
    `live points, ${row.projectedFinal.toFixed(1)} projected final, ` +
    `${row.winProb.toFixed(0)}% to win against ${row.opponentName}, ` +
    `${row.played} of ${row.starters} starters played`
  );
}

function scorerRowAriaLabel(row: GameDayScorer): string {
  const team = row.fantasyTeam ?? row.nflTeam ?? 'free agent';
  return `${row.name} (${row.position}, ${team}): ${row.points.toFixed(1)} live points`;
}

export function GameDayPage({ league, pool = POOL }: GameDayPageProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [announcement, setAnnouncement] = useState('Loading live scores.');
  const week = league?.currentWeek ?? currentWeekEstimate();
  const season = league?.season ?? pool.season;

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const stats = await fetchWeekPprStats(season, week);
      if (!stats) throw new Error('no live stats for this week');
      const board = league ? buildGameDayBoard(league, stats) : null;
      const scorers = league
        ? (board?.topScorers ?? [])
        : topLiveScorersFromStats(stats, pool.players);
      setState({
        kind: 'ready',
        week,
        board,
        scorers,
        updatedAt: Date.now(),
      });
      setAnnouncement(`Game Day updated for week ${week}.`);
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
      setAnnouncement('Could not load live scores.');
    }
  }, [league, pool, season, week]);

  useEffect(() => {
    void load();
  }, [load]);

  const anyPending = useMemo(
    () =>
      state.kind === 'ready' &&
      state.board !== null &&
      state.board.teams.some(t => t.played < t.starters),
    [state],
  );

  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [anyPending, load]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Game Day</h1>
      <p className={styles.lede}>
        Where every team stands right now, live: banked points, projected
        finals, and who is going off this week.
      </p>

      <div>
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading live scores…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn&apos;t load live scores ({state.message}). Sleeper&apos;s
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
            const { board, scorers } = state;
            return (
              <>
                <p className={styles.metaRow}>
                  <span>Updated {timeAgo(new Date(state.updatedAt).toISOString())}</span>
                  <button
                    type="button"
                    className="input"
                    onClick={() => void load()}
                  >
                    Refresh
                  </button>
                </p>
                {league && board === null && (
                  <p className={styles.note}>
                    No live matchups for week {state.week} yet — the league
                    schedule may not be synced.
                  </p>
                )}
                {league && board !== null && (
                  <>
                    {!board.anyPlayed && (
                      <p className={styles.note}>
                        No games have started yet for week {state.week} —
                        teams are ranked by projected final until kickoff.
                      </p>
                    )}
                    <div className={styles.tableWrapper}>
                      <table
                        className={styles.table}
                        aria-label={`Game Day leaderboard, week ${state.week}`}
                      >
                        <caption className={styles.caption}>
                          Team leaderboard — week {state.week}
                          {board.anyPlayed ? ' (live)' : ' (projected)'}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">
                              <span className="visually-hidden">Rank</span>
                            </th>
                            <th scope="col">Team</th>
                            <th scope="col">
                              <abbr title="Actual fantasy points banked by starters whose games have started">
                                Live
                              </abbr>
                            </th>
                            <th scope="col">
                              <abbr title="Projected final: actuals where available, else TraderApe's weekly projection">
                                Proj final
                              </abbr>
                            </th>
                            <th scope="col">
                              <abbr title="Live win probability against this week's opponent">
                                Win %
                              </abbr>
                            </th>
                            <th scope="col">
                              <abbr title="Starters whose games have started, out of the optimal lineup">
                                Played
                              </abbr>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {board.teams.map(row => (
                            <tr key={row.teamId}>
                              <td>{row.rank}</td>
                              <th scope="row" aria-label={teamRowAriaLabel(row)}>
                                {row.teamName}
                              </th>
                              <td>{row.actualSoFar.toFixed(1)}</td>
                              <td>{row.projectedFinal.toFixed(1)}</td>
                              <td>{row.winProb.toFixed(0)}%</td>
                              <td>
                                {row.played}/{row.starters}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <h2 className={styles.sectionTitle}>Top live scorers</h2>
                {scorers.length === 0 ? (
                  <p className={styles.note}>
                    No players have scored yet for week {state.week} — check
                    back after kickoff.
                  </p>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table
                      className={styles.table}
                      aria-label={`Top live scorers, week ${state.week}`}
                    >
                      <caption className={styles.caption}>
                        Top live scorers — week {state.week}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">
                            <span className="visually-hidden">Rank</span>
                          </th>
                          <th scope="col">Player</th>
                          <th scope="col">Pos</th>
                          <th scope="col">{league ? 'Team' : 'NFL'}</th>
                          <th scope="col">
                            <abbr title="Actual full-PPR points this week, live from Sleeper">
                              Pts
                            </abbr>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {scorers.map((row, i) => (
                          <tr key={`${row.name}-${row.fantasyTeam ?? row.nflTeam ?? 'fa'}`}>
                            <td>{i + 1}</td>
                            <th scope="row" aria-label={scorerRowAriaLabel(row)}>
                              {row.name}
                            </th>
                            <td>{row.position}</td>
                            <td>{row.fantasyTeam ?? row.nflTeam ?? '—'}</td>
                            <td>{row.points.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!league && (
                  <p className={styles.note}>
                    Connect a league to see the full team leaderboard — this
                    board ranks the week&apos;s top scorers across the NFL.
                  </p>
                )}
              </>
            );
          })()}
      </div>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>

      <p className={styles.footnote}>
        Method: live actuals come from Sleeper&apos;s free public weekly
        stats, which update as NFL games play; starters who haven&apos;t
        played count at TraderApe&apos;s own weekly projection, so the
        projected final is actuals plus remaining projections. Lineups are
        each team&apos;s optimal projected lineup from the Start/Sit engine
        — the same live scoring as the Matchup page. A live read, not a
        final: the board refreshes every minute while starters are still
        pending.
      </p>
    </div>
  );
}
