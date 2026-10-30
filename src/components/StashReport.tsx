// Waiver Stash Report (backlog item 23): available players worth stashing
// BEFORE the waiver rush — high rest-of-season value with a short-term
// reason they are cheap this week (handcuff insurance, an injury return,
// or a bye-week discount). Ranked by TraderApe's own season-outlook
// engine. Guidance only — nothing here moves a roster.
import { useMemo } from 'react';
import type { League } from '@/types';
import { POOL } from '@/data/draftPool';
import { WEEKLY_SHAPE } from '@/data/weeklyShape';
import type { DraftPoolFile } from '@/types/draft';
import { currentWeekEstimate } from '@/utils/matchupRating';
import { buildStashReport, type StashReason, type StashRow } from '@/utils/stashReport';
import { leagueOwnerMap } from '@/utils/rosRankings';
import { injuryOf } from '@/utils/seasonOutlook';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './StashReport.module.css';

interface StashReportProps {
  league: League;
  /** Test override: a synthetic pool replaces the bundled one. */
  pool?: DraftPoolFile;
}

const REASON_LABEL: Record<StashReason, string> = {
  handcuff: 'Handcuff',
  'injury-return': 'Injury return',
  'bye-discount': 'Bye discount',
};

const REASON_DETAIL: Record<StashReason, string> = {
  handcuff:
    'Direct backup to the lead back (Sleeper depth chart) — stashes the lead-back role.',
  'injury-return':
    'Out, doubtful, or questionable now; the rest-of-season projection prices his return.',
  'bye-discount':
    'On bye this week, so managers may have dropped him for coverage.',
};

function round1(n: number): string {
  return n.toFixed(1);
}

function perGame(row: StashRow): string {
  const o = row.outlook;
  const pg = o.perGame ?? (o.projectedGames > 0 ? o.projectedPoints / o.projectedGames : null);
  return pg == null ? '—' : round1(pg);
}

function injuryTag(player: StashRow['player']): string | null {
  const info = injuryOf(player);
  if (!info) return null;
  if (info.seasonEnding || info.outNow) return player.injuryStatus ?? 'OUT';
  return null;
}

export function StashReport({ league, pool: poolOverride }: StashReportProps) {
  const pool = useMemo(() => poolOverride ?? POOL, [poolOverride]);
  const live = league.status === 'live' && league.currentWeek != null;
  const week = live ? (league.currentWeek as number) : currentWeekEstimate();

  const rows = useMemo(() => {
    const picks = live ? league.teams.flatMap(t => t.draftPicks ?? []) : [];
    const owners = live ? leagueOwnerMap(league, pool) : undefined;
    return buildStashReport({
      pool,
      shape: pool.season === WEEKLY_SHAPE.season ? WEEKLY_SHAPE : undefined,
      scoring: league.scoringType,
      slots: league.rosterSlots,
      teamCount: league.totalTeams || 10,
      currentWeek: week,
      season: pool.season,
      passTdPoints: league.passTdPoints,
      tePremiumPerReception: league.tePremiumPerReception,
      gamesPlayed:
        live && league.gamesPlayed && league.gamesPlayed.season === league.season
          ? league.gamesPlayed
          : undefined,
      platform: league.platform,
      picks,
      ownerByPoolId: owners,
    });
  }, [league, live, pool, week]);

  return (
    <section className={styles.panel} aria-label="Waiver stash report">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Stash Report</h2>
        <span className={styles.window}>
          Week {week} · stash before the rush
        </span>
      </div>
      <p className={styles.intro}>
        Available players with real rest-of-season value and a short-term
        reason they are cheap this week — grab them before the waiver rush
        does. Research only; nothing here moves a roster.
      </p>

      {rows.length === 0 ? (
        <p className={styles.empty}>
          No stash candidates right now — every available player with forward
          value is either rostered or has no cheap-now reason.
        </p>
      ) : (
        <table className={styles.table}>
          <caption className="visually-hidden">
            Waiver stash candidates ranked by rest-of-season projected points,
            with the reason each is cheap this week
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Rank</span>
              </th>
              <th scope="col">Player</th>
              <th scope="col">
                <abbr title="Rest-of-season rank within his position (same as the ROS Rankings)">
                  ROS rank
                </abbr>
              </th>
              <th scope="col">
                <abbr title="TraderApe projected full-PPR points for the rest of the season">
                  ROS pts
                </abbr>
              </th>
              <th scope="col">
                <abbr title="Projected points per remaining game">Per game</abbr>
              </th>
              <th scope="col">Why stash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const tag = injuryTag(row.player);
              return (
                <tr key={row.player.id}>
                  <td className={styles.rank}>{i + 1}</td>
                  <th scope="row" className={styles.playerCell}>
                    {row.player.name} <PosBadge pos={row.player.pos} />{' '}
                    {row.player.team && <NflTeamLabel team={row.player.team} />}
                    {tag && (
                      <span className={styles.injuryTag} title={injuryOf(row.player)?.label ?? tag}>
                        {tag}
                      </span>
                    )}
                  </th>
                  <td className={styles.nums}>
                    {row.player.pos}
                    {row.posRank}
                  </td>
                  <td className={styles.nums}>{round1(row.outlook.projectedPoints)}</td>
                  <td className={styles.nums}>{perGame(row)}</td>
                  <td>
                    <ul
                      className={styles.reasons}
                      aria-label={`Why stash ${row.player.name}`}
                    >
                      {row.reasons.map(reason => (
                        <li
                          key={reason}
                          className={styles.reason}
                          title={REASON_DETAIL[reason]}
                        >
                          {REASON_LABEL[reason]}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className={styles.footnote}>
        Method: TraderApe&apos;s season-outlook engine (rest-of-season
        projections from week {week} through week 17); handcuffs from Sleeper
        depth-chart order, injury designations refreshed twice daily, bye
        weeks from the bundled pool. Ownership resolves from the last /admin
        sync. Waiver research only — nothing here moves a roster.
      </p>
    </section>
  );
}
