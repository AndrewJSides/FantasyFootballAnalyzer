// Usage Risers panel (backlog item 109): available players whose snap
// share jumped vs their own earlier-season baseline — the "whose job just
// grew" question. Distinct from Opportunity Watch (absolute role level)
// and Breakout Watch (production surge): a role can expand before the box
// score or the ownership momentum catches up. Guidance only — nothing
// here moves rosters.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { League, Player } from '@/types';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import {
  usageRisers,
  RECENT_SNAP_SHARE_FLOOR,
  SNAP_SHARE_JUMP,
  type UsageRiser,
} from '@/utils/usageMovers';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import {
  currentWeekEstimate,
  getMatchupRating,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './UsageRisers.module.css';

interface UsageRisersProps {
  league: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; risers: UsageRiser[] };

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const signedPct = (n: number): string =>
  `+${Math.round(n * 100)} pts`;

export function UsageRisers({ league, pool = POOL }: UsageRisersProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [week] = useState(() =>
    league && !league.isGuest
      ? (league.currentWeek ?? currentWeekEstimate())
      : currentWeekEstimate(),
  );

  // League mode: name the owning team so rostered players are filtered out.
  // Guest mode: no rosters, no filtering — every riser shows. Usage always
  // prices Sleeper's free public stats (the owner's sync doesn't carry
  // snap data).
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
        risers: usageRisers({
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
    <section className={styles.panel} aria-label="Usage risers">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Usage Risers</h2>
        <span className={styles.window}>
          Whose job just grew · last 3 weeks vs earlier season · week {week}
        </span>
      </div>
      <p className={styles.intro}>
        Available players whose snap share jumped{' '}
        {Math.round(SNAP_SHARE_JUMP * 100)}+ points vs their own
        earlier-season baseline while holding a{' '}
        {Math.round(RECENT_SNAP_SHARE_FLOOR * 100)}%+ role now — the role
        change lands before the box score and the waiver rush catch up.
        Research only; nothing here moves rosters.
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
          (state.risers.length > 0 ? (
            <table className={styles.table}>
              <caption className="visually-hidden">
                Available players whose snap share jumped vs their
                earlier-season baseline
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Rank</span>
                  </th>
                  <th scope="col">Player</th>
                  <th scope="col">
                    <abbr title="Share of the offense's snaps over the player's last 3 completed weeks">
                      Snap % now
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Share of the offense's snaps over the player's earlier completed weeks this season">
                      Snap % earlier
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Recent snap share minus earlier snap share, in percentage points">
                      Change
                    </abbr>
                  </th>
                  <th scope="col">Matchup</th>
                  {isLeague && <th scope="col">Owner</th>}
                </tr>
              </thead>
              <tbody>
                {state.risers.map((r, i) => {
                  const rating = getMatchupRating(r.player.team, r.player.pos, week);
                  const muCls =
                    rating?.label === 'favorable'
                      ? styles.muFav
                      : rating?.label === 'tough'
                        ? styles.muTough
                        : styles.muNeutral;
                  return (
                    <tr key={r.player.id}>
                      <td className={styles.rank}>{i + 1}</td>
                      <th scope="row" className={styles.playerCell}>
                        <span className={styles.playerName}>{r.player.name}</span>
                        <span className={styles.playerMeta}>
                          <PosBadge pos={r.player.pos} />{' '}
                          {r.player.team && <NflTeamLabel team={r.player.team} />}
                        </span>
                        <ul className={styles.reasons} aria-label={`Why ${r.player.name}`}>
                          <li>{r.reason}</li>
                        </ul>
                      </th>
                      <td className={styles.share}>{pct(r.recentSnapShare)}</td>
                      <td className={styles.nums}>{pct(r.earlierSnapShare)}</td>
                      <td className={styles.nums}>{signedPct(r.delta)}</td>
                      <td className={muCls}>
                        {rating ? (
                          <span title={matchupLabel(rating, r.player.pos)}>
                            {matchupShort(rating)}
                          </span>
                        ) : (
                          <span className={styles.dash}>—</span>
                        )}
                      </td>
                      {isLeague && (
                        <td className={styles.dim}>{r.rosteredBy ?? 'Free agent'}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className={styles.note}>
              No usage risers right now — nobody available jumped{' '}
              {Math.round(SNAP_SHARE_JUMP * 100)}+ points of snap share vs
              his earlier-season baseline while holding a{' '}
              {Math.round(RECENT_SNAP_SHARE_FLOOR * 100)}%+ role.
            </p>
          ))}
      </div>

      <p className={styles.footnote}>
        Method: Sleeper&apos;s free public weekly stats (offensive snaps /
        team snaps), last 3 completed weeks vs all earlier completed weeks
        this season, minimum 2 games in each window. League mode excludes
        rostered players; guest mode shows every riser. RB/WR/TE only —
        QB snap share carries no jump signal.
      </p>
    </section>
  );
}
