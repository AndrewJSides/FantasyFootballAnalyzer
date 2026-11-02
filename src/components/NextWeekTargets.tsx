// Next-week waiver targets panel (backlog item 86): the league-wide
// "who do I claim before waivers run" board — the best unrostered
// QB/RB/WR/TE ranked by NEXT week's TraderApe projection, with that
// week's matchup chip. Waiver claims usually run Tuesday night, so the
// plain this-week board goes stale on Monday; this prices the week the
// claims are actually for. Priced on the same buildWeeklyRankings engine
// as the Weekly Rankings page (raised per-position cap so free agents
// below the board's top-40 cut are covered), filtered to players no
// league team rosters. League mode only — the /waivers route bounces
// guests. Guidance only: nothing here adds a player.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { League } from '@/types';
import type { PoolPlayer, DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import {
  fetchWeeklyPprPoints,
  type WeeklyPprPoints,
} from '@/api/sleeperWeeklyPoints';
import { buildWeeklyRankings, type WeeklyRankRow } from '@/utils/weeklyRankings';
import { topFreeAgents, TOP_FREE_AGENT_POSITIONS, type TopFreeAgentPosition } from '@/utils/topFreeAgents';
import { leagueOwnerMap } from '@/utils/rosRankings';
import {
  currentWeekEstimate,
  getMatchupRating,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { injuryOf } from '@/utils/seasonOutlook';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './NextWeekTargets.module.css';

interface NextWeekTargetsProps {
  league: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

/** The last week a forward board can price: the regular season ends at 18. */
export const MAX_TARGET_WEEK = 18;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; weekly: WeeklyPprPoints };

function fmt(n: number | null | undefined, digits = 1): string {
  return n == null ? '—' : n.toFixed(digits);
}

function injuryTag(player: PoolPlayer): string | null {
  const info = injuryOf(player);
  if (!info) return null;
  if (info.seasonEnding || info.outNow) return player.injuryStatus ?? 'OUT';
  return null;
}

// The same favorable/tough/neutral rating the Rankings, Start/Sit, and
// Trade Analyzer pages use — the player's TARGET-week opponent and that
// opponent's points allowed vs the position from completed weeks.
function MatchupCell({ row, week }: { row: WeeklyRankRow; week: number }) {
  const rating = getMatchupRating(row.player.team, row.player.pos, week);
  if (!rating)
    return (
      <td className={`${styles.num} ${styles.dim}`} aria-label="No matchup data">
        -
      </td>
    );
  const cls =
    rating.label === 'favorable'
      ? styles.muFav
      : rating.label === 'tough'
        ? styles.muTough
        : styles.muNeutral;
  const label = matchupLabel(rating, row.player.pos);
  return (
    <td className={styles.num} title={label} aria-label={label}>
      <span className={cls}>{matchupShort(rating)}</span>
    </td>
  );
}

// Item-20 consistency verdict: the same Steady/Mixed/Volatile rating the
// Player Journey page shows, priced on this player's completed weeks.
function ConsistencyCell({ row }: { row: WeeklyRankRow }) {
  const c = row.consistency;
  if (!c)
    return (
      <td className={`${styles.num} ${styles.dim}`} aria-label="Not enough games for a consistency rating">
        -
      </td>
    );
  const cls =
    c.verdict === 'Steady'
      ? styles.volSteady
      : c.verdict === 'Volatile'
        ? styles.volVolatile
        : styles.volMixed;
  const label =
    `${c.verdict}: floor ${c.floor} / ceiling ${c.ceiling} (P25–P75 of ${c.games} ` +
    `completed weeks), ${c.boomWeeks} boom and ${c.bustWeeks} bust weeks ` +
    `(boom ≥ ${c.boomBar}, bust ≤ ${c.bustBar})`;
  return (
    <td className={styles.num} title={label} aria-label={label}>
      <span className={cls}>{c.verdict}</span>
    </td>
  );
}

export function NextWeekTargets({ league, pool = POOL }: NextWeekTargetsProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [position, setPosition] = useState<TopFreeAgentPosition>('RB');
  const week = league.currentWeek ?? currentWeekEstimate();
  const targetWeek = week + 1;

  // Completed weeks only: the in-progress week's partial stats would halve
  // a player's pace (same convention as Weekly Rankings and Start/Sit).
  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await fetchWeeklyPprPoints(league.season, week - 1);
      if (!r || r.weeks.length === 0) throw new Error('No weekly scoring data yet');
      setState({ kind: 'ready', weekly: r });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }, [league.season, week]);

  useEffect(() => {
    if (targetWeek > MAX_TARGET_WEEK) return; // no next week to price
    void load();
  }, [load, targetWeek]);

  const groups = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const owners = leagueOwnerMap(league, pool);
    // Raised cap: the Weekly Rankings board keeps the top 40 per position,
    // but free agents worth adding often sit below that cut. The engine
    // keys bye exclusions, the form series, and the matchup chips off the
    // target week, so the numbers match a week-N+1 Weekly Rankings board.
    const rows = buildWeeklyRankings({
      pool,
      weekly: state.weekly,
      currentWeek: targetWeek,
      ownerByPoolId: owners,
      perPosition: 200,
    });
    return topFreeAgents(rows, 10);
  }, [state, league, pool, targetWeek]);

  const active = groups?.find(g => g.position === position) ?? groups?.[0];

  if (targetWeek > MAX_TARGET_WEEK) {
    return (
      <section className={styles.panel} aria-label="Next week's waiver targets">
        <h2 className={styles.heading}>Next Week&apos;s Targets</h2>
        <p className={styles.status} role="status">
          The season&apos;s last week is priced — there&apos;s no next week
          to rank.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="Next week's waiver targets">
      <h2 className={styles.heading}>Next Week&apos;s Targets</h2>
      <p className={styles.sub}>
        The best players nobody rosters, ranked by TraderApe&apos;s own
        projection for week {targetWeek} — put your claims in before waivers
        run.
      </p>
      {state.kind === 'loading' && (
        <p className={styles.status} role="status">
          Loading next week&apos;s projections…
        </p>
      )}
      {state.kind === 'error' && (
        <div>
          <p className={styles.status} role="alert">
            Couldn&apos;t load weekly scoring data ({state.message}).
          </p>
          <button type="button" className={styles.retryButton} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {state.kind === 'ready' && groups && (
        <>
          <div className={styles.filterBar} role="group" aria-label="Filter targets by position">
            {TOP_FREE_AGENT_POSITIONS.map(p => (
              <button
                key={p}
                type="button"
                className={`${styles.filterButton} ${position === p ? styles.active : ''}`}
                aria-pressed={position === p}
                onClick={() => setPosition(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <div aria-live="polite">
            {active && active.rows.length > 0 ? (
              <table
                className={styles.table}
                aria-label={`Next week's waiver targets, ${active.position}, best projection first`}
              >
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Player</th>
                    <th scope="col">NFL</th>
                    <th scope="col" className={styles.num}>
                      <abbr title={`TraderApe's projection for week ${targetWeek}`}>Wk {targetWeek} Proj</abbr>
                    </th>
                    <th scope="col" className={styles.num}>
                      <abbr title="Points per game over completed weeks">PPG</abbr>
                    </th>
                    <th scope="col" className={styles.num}>
                      <abbr title="Average over the last 3 completed weeks">Last 3</abbr>
                    </th>
                    <th scope="col" className={styles.num}>
                      <abbr title={`Week ${targetWeek} matchup difficulty`}>Matchup</abbr>
                    </th>
                    <th scope="col" className={styles.num}>
                      <abbr title="Week-to-week consistency from completed weeks">Consistency</abbr>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {active.rows.map((r, i) => {
                    const tag = injuryTag(r.player);
                    return (
                      <tr key={r.player.id}>
                        <td className={styles.rank}>{i + 1}</td>
                        <th scope="row" className={styles.player}>
                          <PosBadge pos={r.player.pos} /> {r.player.name}
                          {tag && <span className={styles.injuryTag}>{tag}</span>}
                        </th>
                        <td>
                          <NflTeamLabel team={r.player.team} />
                        </td>
                        <td className={styles.num}>{fmt(r.projection)}</td>
                        <td className={styles.num}>{fmt(r.ppg)}</td>
                        <td className={styles.num}>{fmt(r.last3)}</td>
                        <MatchupCell row={r} week={targetWeek} />
                        <ConsistencyCell row={r} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className={styles.status} role="status">
                No unrostered {active?.position ?? 'QB'}s with a projection for
                week {targetWeek} — every startable player is on a roster.
              </p>
            )}
          </div>
          <p className={styles.footnote}>
            Ranked by TraderApe&apos;s own weekly projection for week{' '}
            {targetWeek} (recency-weighted form + season baseline), priced on
            full-PPR scoring; players on bye in week {targetWeek} are
            excluded. Guidance only — nothing here adds a player.
          </p>
        </>
      )}
    </section>
  );
}
