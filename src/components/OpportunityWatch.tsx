// Opportunity Watch panel (backlog item 71): available players earning a
// real role — 55%+ snap share and/or 20%+ target share over their last 3
// completed weeks — priced with this week's matchup chip. The "who's earning
// the work before the points show up" question: distinct from Breakout Watch
// (production surging vs the player's own earlier pace) and Trending Adds
// (league-wide ownership momentum). Guidance only — nothing here moves
// rosters.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { League, Player } from '@/types';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import {
  opportunityTargets,
  SNAP_SHARE_FLAG,
  TARGET_SHARE_FLAG,
  type OpportunityCandidate,
} from '@/utils/opportunityWatch';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import {
  currentWeekEstimate,
  getMatchupRating,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './OpportunityWatch.module.css';

interface OpportunityWatchProps {
  league: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; candidates: OpportunityCandidate[] };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

export function OpportunityWatch({ league, pool = POOL }: OpportunityWatchProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [week] = useState(() =>
    league && !league.isGuest
      ? (league.currentWeek ?? currentWeekEstimate())
      : currentWeekEstimate(),
  );

  // League mode: name the owning team so rostered players are filtered out.
  // Guest mode: no rosters, no filtering — every candidate shows. Usage
  // always prices Sleeper's free public stats (the owner's sync doesn't
  // carry snap/target data).
  const teamByPoolId = useMemo(() => {
    if (!league || league.isGuest) return undefined;
    const index = indexPool(pool);
    const map = new Map<string, string>();
    for (const team of league.teams) {
      for (const p of team.roster ?? []) {
        const resolved = resolvePoolPlayer(p as Player, index);
        if (!resolved) continue;
        map.set(resolved.id, team.name);
      }
    }
    return map;
  }, [league, pool]);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const usage = await fetchWeeklyUsage(pool.season, week - 1);
      if (!usage) throw new Error('no weekly usage data');
      setState({
        kind: 'ready',
        candidates: opportunityTargets({
          poolPlayers: pool.players,
          usageBySleeperId: usage.usageBySleeperId,
          teamByPoolId,
          currentWeek: week,
        }),
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }, [pool, week, teamByPoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isLeague = !!league && !league.isGuest;

  return (
    <section className={styles.panel} aria-label="Opportunity watch">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Opportunity Watch</h2>
        <span className={styles.window}>
          Earning the work · last 3 weeks · week {week}
        </span>
      </div>
      <p className={styles.intro}>
        Available players earning {Math.round(SNAP_SHARE_FLAG * 100)}%+ of
        their offense&apos;s snaps or {Math.round(TARGET_SHARE_FLAG * 100)}%+
        of their team&apos;s targets over the last 3 weeks — the role is here
        before the box score catches up. Research only; nothing here moves
        rosters.
      </p>

      {/* The list swaps in place on load/retry with no navigation; announce
          the change politely. */}
      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Scanning weekly usage…</p>
        )}

        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn&apos;t load weekly usage ({state.message}). The waiver
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
                Available players earning a large snap or target share over
                their last 3 completed weeks
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Rank</span>
                  </th>
                  <th scope="col">Player</th>
                  <th scope="col">
                    <abbr title="Share of the offense's snaps over the player's last 3 completed weeks">
                      Snap %
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Share of the player's NFL team's targets over the same weeks (pass-catchers)">
                      Tgt %
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Rushing attempts plus receptions per game over the last 3 completed weeks">
                      Touches/gm
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
                      <td className={styles.share}>{pct(c.snapShare)}</td>
                      <td className={styles.nums}>
                        {c.targetShare === null ? (
                          <span className={styles.dash}>—</span>
                        ) : (
                          pct(c.targetShare)
                        )}
                      </td>
                      <td className={styles.nums}>{c.touchesPerGame}</td>
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
              No opportunity candidates right now — nobody available is
              earning {Math.round(SNAP_SHARE_FLAG * 100)}%+ of the snaps or{' '}
              {Math.round(TARGET_SHARE_FLAG * 100)}%+ of the targets over his
              last 3.
            </p>
          ))}
      </div>

      <p className={styles.footnote}>
        Method: Sleeper&apos;s free public weekly stats (offensive snaps /
        team snaps / targets), last 3 completed weeks, minimum 2 games.
        League mode excludes rostered players; guest mode shows every
        candidate. QB/RB/WR/TE only — target share is priced for
        pass-catchers.
      </p>
    </section>
  );
}
