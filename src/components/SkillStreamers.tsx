import { useState } from 'react';
import type { League } from '@/types';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import { injuryAbbrev } from '@/utils/injury';
import { currentWeekEstimate, rankPhrase } from '@/utils/matchupRating';
import {
  rankSkillStreamers,
  skillMatchupWeeksRange,
  type SkillMatchup,
  type SkillStreamerPosition,
} from '@/utils/skillStreamers';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './SkillStreamers.module.css';

interface SkillStreamersProps {
  league: League;
  position: SkillStreamerPosition;
}

// The pool ids of QBs/TEs already on a league roster — those aren't
// streamable. Resolves each roster player through the pool index so ESPN
// and Yahoo id schemes still match.
function rosteredSkillPlayerIds(league: League, position: SkillStreamerPosition): Set<string> {
  const index = indexPool(POOL);
  const rostered = new Set<string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const pooled = resolvePoolPlayer(p, index);
      if (pooled && pooled.pos === position) rostered.add(pooled.id);
    }
  }
  return rostered;
}

const POSITION_LABEL: Record<SkillStreamerPosition, string> = {
  QB: 'quarterbacks',
  TE: 'tight ends',
};

const POSITION_SINGULAR: Record<SkillStreamerPosition, string> = {
  QB: 'quarterback',
  TE: 'tight end',
};

function verdictLabel(m: SkillMatchup): string {
  const verdict =
    m.label === 'favorable' ? 'Favorable' : m.label === 'tough' ? 'Tough' : 'Neutral';
  return `vs ${m.opponent} · ${verdict} — ${m.opponent} allows ${m.avgAllowed} pts/game to opposing ${POSITION_LABEL[m.position]} (${rankPhrase(m.rank)} points)`;
}

// QB/TE Streamers: the best available starting quarterbacks or tight ends
// to pick up for the current week, ranked by how generous each opponent's
// defense has been to the position over completed weeks (TraderApe's own
// numbers, half-PPR scoring). Nothing here moves a roster — it's waiver-wire
// research.
export function SkillStreamers({ league, position }: SkillStreamersProps) {
  const [week] = useState(() => league.currentWeek ?? currentWeekEstimate());
  const [rostered] = useState(() => rosteredSkillPlayerIds(league, position));
  const [weeks] = useState(skillMatchupWeeksRange);
  const streamers = rankSkillStreamers(week, position, rostered, 5);
  const label = POSITION_LABEL[position];
  const heading = position === 'QB' ? 'QB Streamers' : 'TE Streamers';

  return (
    <section className={styles.panel} aria-label={heading}>
      <div className={styles.headRow}>
        <h2 className={styles.heading}>{heading}</h2>
        <span className={styles.window}>Best available {label} · Week {week}</span>
      </div>

      {streamers.length > 0 ? (
        <table className={styles.table}>
          <caption className="visually-hidden">
            Top 5 unrostered {label} for week {week}, ranked by opponent
            generosity to opposing {label}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Rank</span>
              </th>
              <th scope="col">{position}</th>
              <th scope="col">Matchup</th>
              <th scope="col">
                <abbr title={`Average fantasy points the opponent's defense allowed to opposing ${label} per game`}>
                  Opp gives
                </abbr>
              </th>
              <th scope="col">
                <abbr title={`The player's own projected weekly points, from the bundled season projection (half-PPR)`}>
                  Own proj
                </abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {streamers.map((m, i) => {
              const muCls =
                m.label === 'favorable'
                  ? styles.muFav
                  : m.label === 'tough'
                    ? styles.muTough
                    : styles.muNeutral;
              const info = `${m.name} (${m.team}) vs ${m.opponent}`;
              return (
                <tr key={m.playerId}>
                  <td className={styles.rank}>{i + 1}</td>
                  <th scope="row" className={styles.playerCell} title={info}>
                    <NflTeamLabel team={m.team} />
                    <span className={styles.playerName}>
                      {m.name}
                      {m.injuryStatus && (
                        <span className={styles.injBadge} title={`Injury status: ${m.injuryStatus}`}>
                          {injuryAbbrev(m.injuryStatus)}
                        </span>
                      )}
                    </span>
                  </th>
                  <td>
                    <span className={muCls} title={verdictLabel(m)}>
                      vs {m.opponent} ·{' '}
                      {m.label === 'favorable'
                        ? 'Favorable'
                        : m.label === 'tough'
                          ? 'Tough'
                          : 'Neutral'}
                    </span>
                  </td>
                  <td className={styles.nums}>
                    {m.avgAllowed}
                    <span className={styles.sub}> ({rankPhrase(m.rank)})</span>
                  </td>
                  <td className={styles.nums}>{m.ownWeeklyProj.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className={styles.note}>
          No streamable {label} for week {week} — every starting {POSITION_SINGULAR[position]} with a
          game is already rostered in this league, or the week has no schedule data.
        </p>
      )}

      <p className={styles.footnote}>
        Ranked on weeks {weeks[0]}–{weeks[1]} actuals: how many fantasy points each defense gave
        opposing {label}, half-PPR scoring. Guidance only — nothing moves your roster.
      </p>
    </section>
  );
}
