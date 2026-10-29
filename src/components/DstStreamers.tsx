import { useState } from 'react';
import type { League } from '@/types';
import { currentWeekEstimate, rankPhrase } from '@/utils/matchupRating';
import { basePosition, canonicalTeam } from '@/utils/playerNames';
import {
  generosityWeeksRange,
  rankDstStreamers,
  type DstMatchup,
} from '@/utils/dstStreamers';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './DstStreamers.module.css';

interface DstStreamersProps {
  league: League;
}

// The NFL defenses already on a league roster — those aren't streamable.
function rosteredDefenses(league: League): Set<string> {
  const rostered = new Set<string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      if (basePosition(p.position ?? '') === 'DST') {
        const abbr = canonicalTeam(p.team ?? '');
        if (abbr) rostered.add(abbr);
      }
    }
  }
  return rostered;
}

function verdictLabel(m: DstMatchup): string {
  const verdict =
    m.label === 'favorable'
      ? 'Favorable'
      : m.label === 'tough'
        ? 'Tough'
        : 'Neutral';
  return `vs ${m.opponent} · ${verdict} — ${m.opponent} allows ${m.avgAllowed} pts/game to opposing defenses (${rankPhrase(m.rank)} points)`;
}

// D/ST Streamers: the best available team defenses to pick up for the
// current week, ranked by how generous each opponent's offense has been to
// opposing defenses over completed weeks (TraderApe's own numbers, standard
// D/ST scoring). Nothing here moves a roster — it's waiver-wire research.
export function DstStreamers({ league }: DstStreamersProps) {
  const [week] = useState(() => league.currentWeek ?? currentWeekEstimate());
  const [rostered] = useState(() => rosteredDefenses(league));
  const [weeks] = useState(generosityWeeksRange);
  const streamers = rankDstStreamers(week, rostered, 5);

  return (
    <section className={styles.panel} aria-label="D S T streamers">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>D/ST Streamers</h2>
        <span className={styles.window}>Best available defenses · Week {week}</span>
      </div>

      {streamers.length > 0 ? (
        <table className={styles.table}>
          <caption className="visually-hidden">
            Top 5 unrostered team defenses for week {week}, ranked by opponent
            generosity to opposing defenses
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Rank</span>
              </th>
              <th scope="col">Defense</th>
              <th scope="col">Matchup</th>
              <th scope="col">
                <abbr title="Average fantasy points the opponent's offense allowed to opposing defenses per game">
                  Opp gives
                </abbr>
              </th>
              <th scope="col">
                <abbr title="The defense's own average fantasy points per game over completed weeks">
                  Own avg
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
              const info =
                `${m.team} defense vs ${m.opponent}`;
              return (
                <tr key={m.team}>
                  <td className={styles.rank}>{i + 1}</td>
                  <th scope="row" className={styles.defenseCell} title={info}>
                    <NflTeamLabel team={m.team} />
                    <span className={styles.defenseName}>Defense</span>
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
                  <td className={styles.nums}>{m.ownAvg}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className={styles.note}>
          No streamable defenses for week {week} — every defense with a game
          is already rostered in this league, or the week has no schedule data.
        </p>
      )}

      <p className={styles.footnote}>
        Ranked on weeks {weeks[0]}–{weeks[1]} actuals: how many fantasy points
        each offense gave opposing defenses, standard D/ST scoring (sack 1,
        INT/fumble recovery 2, defensive TD 6, safety/blocked kick 2,
        points-allowed brackets). Guidance only — nothing moves your roster.
      </p>
    </section>
  );
}
