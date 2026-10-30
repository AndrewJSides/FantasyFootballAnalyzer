// Breakout Watch panel (backlog item 36): players whose last-3 average is
// surging 60%+ over their own earlier-season baseline, filtered to players
// the league can actually add and priced with this week's matchup chip.
// Guidance only — nothing here moves rosters.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { League, Player } from '@/types';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import {
  breakoutCandidates,
  RECENT_FLOOR,
  SURGE_RATIO,
  type BreakoutCandidate,
} from '@/utils/breakoutWatch';
import { fetchWeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import {
  currentWeekEstimate,
  getMatchupRating,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './BreakoutWatch.module.css';

interface BreakoutWatchProps {
  league: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; candidates: BreakoutCandidate[] };

export function BreakoutWatch({ league, pool = POOL }: BreakoutWatchProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [week] = useState(() =>
    league && !league.isGuest
      ? (league.currentWeek ?? currentWeekEstimate())
      : currentWeekEstimate(),
  );

  // League mode: resolve pool players back to their platform ids (the weekly
  // points key) and name the owning team so rostered breakouts are filtered.
  // Guest mode: no rosters, no filtering — every breakout shows.
  const maps = useMemo(() => {
    if (!league || league.isGuest) return null;
    const index = indexPool(pool);
    const platformIdByPoolId = new Map<string, string>();
    const teamByPoolId = new Map<string, string>();
    for (const team of league.teams) {
      for (const p of team.roster ?? []) {
        const resolved = resolvePoolPlayer(p as Player, index);
        if (!resolved) continue;
        if (p.platformId) platformIdByPoolId.set(resolved.id, p.platformId);
        teamByPoolId.set(resolved.id, team.name);
      }
    }
    return { platformIdByPoolId, teamByPoolId };
  }, [league, pool]);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      // League mode: the owner's /admin sync already stored weekly points.
      // Guest mode: Sleeper's free public stats, completed weeks only.
      const weeklyPoints =
        league && !league.isGuest && league.playerWeeklyPoints
          ? league.playerWeeklyPoints
          : (await fetchWeeklyPprPoints(pool.season, week - 1))?.pointsBySleeperId;
      if (!weeklyPoints) throw new Error('no weekly data');
      setState({
        kind: 'ready',
        candidates: breakoutCandidates({
          poolPlayers: pool.players,
          weeklyPoints,
          platformIdByPoolId: maps?.platformIdByPoolId,
          teamByPoolId: maps?.teamByPoolId,
          currentWeek: week,
        }),
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }, [league, pool, week, maps]);

  useEffect(() => {
    void load();
  }, [load]);

  const isLeague = !!league && !league.isGuest;

  return (
    <section className={styles.panel} aria-label="Breakout watch">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Breakout Watch</h2>
        <span className={styles.window}>
          Surging vs their own earlier pace · week {week}
        </span>
      </div>
      <p className={styles.intro}>
        Players averaging at least {RECENT_FLOOR} over their last 3 at
        {Math.round((SURGE_RATIO - 1) * 100)}%+ over their own earlier-season
        pace — role expansions the season rankings haven&apos;t caught yet.
        Research only; nothing here moves rosters.
      </p>

      {/* The list swaps in place on load/retry with no navigation; announce
          the change politely. */}
      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Scanning weekly production…</p>
        )}

        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn&apos;t load weekly production ({state.message}). The waiver
              table below is unaffected.
            </p>
            <button type="button" className="input" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {state.kind === 'ready' &&
          (state.candidates.length > 0 ? (
            <table className={styles.table}>
              <caption className="visually-hidden">
                Players whose last-3-week scoring average is surging over
                their earlier-season pace
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Rank</span>
                  </th>
                  <th scope="col">Player</th>
                  <th scope="col">
                    <abbr title="Average full-PPR points over the last 3 completed weeks">
                      Last-3
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Average full-PPR points over the player's earlier completed weeks">
                      Earlier
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Last-3 average divided by the earlier average">
                      Surge
                    </abbr>
                  </th>
                  <th scope="col">Matchup</th>
                  {isLeague && <th scope="col">Owner</th>}
                </tr>
              </thead>
              <tbody>
                {state.candidates.map((c, i) => {
                  const rating = getMatchupRating(c.player.team, c.player.pos, week);
                  const muCls =
                    rating?.label === 'favorable'
                      ? styles.muFav
                      : rating?.label === 'tough'
                        ? styles.muTough
                        : styles.muNeutral;
                  return (
                    <tr key={c.player.id}>
                      <td className={styles.rank}>{i + 1}</td>
                      <th scope="row" className={styles.playerCell}>
                        <span className={styles.playerName}>{c.player.name}</span>
                        <span className={styles.playerMeta}>
                          <PosBadge pos={c.player.pos} />{' '}
                          {c.player.team && <NflTeamLabel team={c.player.team} />}
                        </span>
                        <ul className={styles.reasons} aria-label={`Why ${c.player.name}`}>
                          {c.reasons.map((r, j) => (
                            <li key={j}>{r}</li>
                          ))}
                        </ul>
                      </th>
                      <td className={styles.nums}>{c.last3}</td>
                      <td className={styles.nums}>{c.baseline}</td>
                      <td className={styles.surge}>{c.surge}x</td>
                      <td className={muCls}>
                        {rating ? (
                          <span
                            title={matchupLabel(rating, c.player.pos)}
                          >
                            {matchupShort(rating)}
                          </span>
                        ) : (
                          <span className={styles.dash}>—</span>
                        )}
                      </td>
                      {isLeague && (
                        <td className={styles.dim}>{c.rosteredBy ?? 'Free agent'}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className={styles.note}>
              No breakout candidates right now — nobody&apos;s last-3 average is
              running 60%+ over his own earlier-season pace.
            </p>
          ))}
      </div>

      <p className={styles.footnote}>
        Method: last-3 completed weeks vs all earlier completed weeks, minimum
        3 earlier games and 2 recent games, recent average at least{' '}
        {RECENT_FLOOR}. League mode prices the owner&apos;s last /admin sync;
        guest mode prices Sleeper&apos;s free public stats. QB/RB/WR/TE only.
      </p>
    </section>
  );
}
