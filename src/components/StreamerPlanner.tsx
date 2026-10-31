import { useState } from 'react';
import type { League } from '@/types';
import { currentWeekEstimate } from '@/utils/matchupRating';
import { injuryAbbrev } from '@/utils/injury';
import {
  buildStreamerPlan,
  planEndWeek,
  rosteredDefenseTeams,
  rosteredKickerTeams,
  rosteredSkillPlayerIds,
  type StreamerPlanRow,
} from '@/utils/streamerPlanner';
import type { DstMatchupLabel } from '@/utils/dstStreamers';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './StreamerPlanner.module.css';

interface StreamerPlannerProps {
  league: League;
}

type ChipLabel = DstMatchupLabel;

function chipClass(label: ChipLabel): string {
  return label === 'favorable'
    ? styles.muFav
    : label === 'tough'
      ? styles.muTough
      : styles.muNeutral;
}

function chipText(label: ChipLabel): string {
  return label === 'favorable' ? 'Favorable' : label === 'tough' ? 'Tough' : 'Neutral';
}

interface Pick {
  name: string;
  team?: string;
  opponent: string;
  label: ChipLabel;
  verdict: string;
  injuryStatus?: string;
}

function pickFor(row: StreamerPlanRow): Record<'dst' | 'kicker' | 'qb' | 'te', Pick | null> {
  return {
    dst: row.dst
      ? {
          name: `${row.dst.team} Defense`,
          team: row.dst.team,
          opponent: row.dst.opponent,
          label: row.dst.label,
          verdict: `vs ${row.dst.opponent} · ${chipText(row.dst.label)} — ${row.dst.opponent} allows ${row.dst.avgAllowed} pts/game to opposing defenses`,
        }
      : null,
    kicker: row.kicker
      ? {
          name: row.kicker.name,
          opponent: row.kicker.opponent,
          label: row.kicker.label,
          verdict: `vs ${row.kicker.opponent} · ${chipText(row.kicker.label)} — ${row.kicker.opponent} allows ${row.kicker.avgAllowed} pts/game to opposing kickers`,
        }
      : null,
    qb: row.qb
      ? {
          name: row.qb.name,
          opponent: row.qb.opponent,
          label: row.qb.label,
          verdict: `vs ${row.qb.opponent} · ${chipText(row.qb.label)} — ${row.qb.opponent} allows ${row.qb.avgAllowed} pts/game to QBs`,
          injuryStatus: row.qb.injuryStatus,
        }
      : null,
    te: row.te
      ? {
          name: row.te.name,
          opponent: row.te.opponent,
          label: row.te.label,
          verdict: `vs ${row.te.opponent} · ${chipText(row.te.label)} — ${row.te.opponent} allows ${row.te.avgAllowed} pts/game to TEs`,
          injuryStatus: row.te.injuryStatus,
        }
      : null,
  };
}

function PickCell({ pick, label }: { pick: Pick | null; label: string }) {
  if (!pick) {
    return (
      <td aria-label={`No streamable ${label} that week`}>
        <span className={styles.pickSub}>—</span>
      </td>
    );
  }
  return (
    <td className={styles.pickCell}>
      <span className={styles.pickName} title={pick.verdict}>
        {pick.team ? (
          <>
            <NflTeamLabel team={pick.team} /> Defense
          </>
        ) : (
          pick.name
        )}
        {pick.injuryStatus ? (
          <span className={styles.injBadge} title={`Injury status: ${pick.injuryStatus}`}>
            {injuryAbbrev(pick.injuryStatus)}
          </span>
        ) : null}
      </span>
      <span className={chipClass(pick.label)} title={pick.verdict}>
        vs {pick.opponent} · {chipText(pick.label)}
      </span>
    </td>
  );
}

// Streamer Planner: the best available streamer at D/ST, K, QB and TE for
// every remaining week (through the week before the fantasy playoffs), so
// managers can plan pickups ahead instead of re-streaming blind each
// Tuesday. Each week is priced on the same season-to-date opponent
// generosity as the weekly streamer sections — a difficulty map, not a
// forecast. Guidance only — nothing moves a roster.
export function StreamerPlanner({ league }: StreamerPlannerProps) {
  const [week] = useState(() => league.currentWeek ?? currentWeekEstimate());
  const [plan] = useState(() =>
    buildStreamerPlan({
      fromWeek: week,
      toWeek: planEndWeek(league, week),
      rosteredDefenses: rosteredDefenseTeams(league),
      rosteredKickerTeams: rosteredKickerTeams(league),
      rosteredSkillIds: rosteredSkillPlayerIds(league),
    }),
  );
  const endWeek = plan.length > 0 ? plan[plan.length - 1].week : week;

  return (
    <section className={styles.panel} aria-label="Streamer planner">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Streamer Planner</h2>
        <span className={styles.window}>
          Best available streamers · Weeks {week}–{endWeek}
        </span>
      </div>

      {plan.length > 0 ? (
        <table className={styles.table}>
          <caption className="visually-hidden">
            Best unrostered streamer at each position for weeks {week} through{' '}
            {endWeek}, ranked by opponent generosity
          </caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">D/ST</th>
              <th scope="col">K</th>
              <th scope="col">QB</th>
              <th scope="col">TE</th>
            </tr>
          </thead>
          <tbody>
            {plan.map(row => {
              const picks = pickFor(row);
              return (
                <tr key={row.week}>
                  <th scope="row" className={styles.weekCell}>
                    Week {row.week}
                  </th>
                  <PickCell pick={picks.dst} label="defense" />
                  <PickCell pick={picks.kicker} label="kicker" />
                  <PickCell pick={picks.qb} label="quarterback" />
                  <PickCell pick={picks.te} label="tight end" />
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className={styles.note}>
          No weeks left to plan — the season is over or the current week is
          past the planning horizon.
        </p>
      )}

      <p className={styles.footnote}>
        Each week is priced on season-to-date opponent generosity (the same
        numbers as the weekly streamer sections) — a difficulty map, not a
        forecast, and availability is as of today: rosters move weekly, so
        re-check before each waiver run. Guidance only — nothing moves your
        roster.
      </p>
    </section>
  );
}
