import { useState } from 'react';
import type { League } from '@/types';
import { currentWeekEstimate, rankPhrase } from '@/utils/matchupRating';
import { basePosition, canonicalTeam } from '@/utils/playerNames';
import {
  kickerGenerosityWeeksRange,
  rankKickerStreamers,
  type KickerMatchup,
} from '@/utils/kickerStreamers';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './KickerStreamers.module.css';

interface KickerStreamersProps {
  league: League;
}

// The NFL teams whose kicker is already on a league roster — those aren't
// streamable.
function rosteredKickerTeams(league: League): Set<string> {
  const rostered = new Set<string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      if (basePosition(p.position ?? '') === 'K') {
        const abbr = canonicalTeam(p.team ?? '');
        if (abbr) rostered.add(abbr);
      }
    }
  }
  return rostered;
}

function verdictLabel(m: KickerMatchup): string {
  const verdict =
    m.label === 'favorable'
      ? 'Favorable'
      : m.label === 'tough'
        ? 'Tough'
        : 'Neutral';
  return `vs ${m.opponent} · ${verdict} — ${m.opponent} allows ${m.avgAllowed} pts/game to opposing kickers (${rankPhrase(m.rank)} points)`;
}

// Kicker Streamers: the best available kickers to pick up for the current
// week, ranked by how generous each opponent's defense has been to opposing
// kickers over completed weeks (TraderApe's own numbers, standard kicker
// scoring). Nothing here moves a roster — it's waiver-wire research.
export function KickerStreamers({ league }: KickerStreamersProps) {
  const [week] = useState(() => league.currentWeek ?? currentWeekEstimate());
  const [rostered] = useState(() => rosteredKickerTeams(league));
  const [weeks] = useState(kickerGenerosityWeeksRange);
  const streamers = rankKickerStreamers(week, rostered, 5);

  return (
    <section className={styles.panel} aria-label="Kicker streamers">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Kicker Streamers</h2>
        <span className={styles.window}>Best available kickers · Week {week}</span>
      </div>

      {streamers.length > 0 ? (
        <table className={styles.table}>
          <caption className="visually-hidden">
            Top 5 unrostered kickers for week {week}, ranked by opponent
            generosity to opposing kickers
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Rank</span>
              </th>
              <th scope="col">Kicker</th>
              <th scope="col">Matchup</th>
              <th scope="col">
                <abbr title="Average fantasy points the opponent's defense allowed to opposing kickers per game">
                  Opp gives
                </abbr>
              </th>
              <th scope="col">
                <abbr title="The kicker's team's own average kicker fantasy points per game over completed weeks">
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
              const info = `${m.name} (${m.team}) vs ${m.opponent}`;
              return (
                <tr key={m.kickerId}>
                  <td className={styles.rank}>{i + 1}</td>
                  <th scope="row" className={styles.defenseCell} title={info}>
                    <NflTeamLabel team={m.team} />
                    <span className={styles.defenseName}>{m.name}</span>
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
          No streamable kickers for week {week} — every kicking team with a
          game is already rostered in this league, or the week has no
          schedule data.
        </p>
      )}

      <p className={styles.footnote}>
        Ranked on weeks {weeks[0]}–{weeks[1]} actuals: how many fantasy points
        each defense gave opposing kickers, standard kicker scoring (FG made
        3, PAT made 1, FG missed -1). Guidance only — nothing moves your
        roster.
      </p>
    </section>
  );
}
