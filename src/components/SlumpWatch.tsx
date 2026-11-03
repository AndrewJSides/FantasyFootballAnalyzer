// Slump Watch panel (backlog item 117): players whose last-3 average fell
// 40%+ below their own earlier-season baseline, with the owning team named
// — a sit/sell question, so rostered players stay in (unlike Breakout
// Watch, where rostered players are excluded). Guidance only — nothing
// here moves rosters.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { League, Player } from '@/types';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import {
  slumpCandidates,
  BASELINE_FLOOR,
  DIP_RATIO,
  type SlumpCandidate,
} from '@/utils/slumpWatch';
import { fetchWeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import {
  currentWeekEstimate,
  getMatchupRating,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './SlumpWatch.module.css';

interface SlumpWatchProps {
  league: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; candidates: SlumpCandidate[] };

export function SlumpWatch({ league, pool = POOL }: SlumpWatchProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [week] = useState(() =>
    league && !league.isGuest
      ? (league.currentWeek ?? currentWeekEstimate())
      : currentWeekEstimate(),
  );

  // League mode: resolve pool players back to their platform ids (the weekly
  // points key) and name the owning team. Guest mode: no rosters — every
  // slump shows owner-free.
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
        candidates: slumpCandidates({
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
    <section className={styles.panel} aria-label="Slump watch">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Slump Watch</h2>
        <span className={styles.window}>
          Fading vs their own earlier pace · week {week}
        </span>
      </div>
      <p className={styles.intro}>
        Players whose last-3 average fell {Math.round((1 - DIP_RATIO) * 100)}%+
        below their own earlier-season pace (earlier average at least{' '}
        {BASELINE_FLOOR}) — fading starters to consider sitting or shopping,
        and free agents to avoid chasing on name value. Research only;
        nothing here moves rosters.
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
                Players whose last-3-week scoring average fell sharply below
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
                      Dip
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
                      <td className={styles.surge}>{c.dip}x</td>
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
              No slump candidates right now — nobody&apos;s last-3 average is
              running 40%+ below his own earlier-season pace.
            </p>
          ))}
      </div>

      <p className={styles.footnote}>
        Method: last-3 completed weeks vs all earlier completed weeks, minimum
        3 earlier games and 2 recent games, earlier average at least{' '}
        {BASELINE_FLOOR}. League mode prices the owner&apos;s last /admin sync;
        guest mode prices Sleeper&apos;s free public stats. QB/RB/WR/TE only.
      </p>
    </section>
  );
}
