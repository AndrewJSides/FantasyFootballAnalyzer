import { useMemo } from 'react';
import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { leagueOwnerMap } from '@/utils/rosRankings';
import {
  labelFor,
  playoffWeeksForLeague,
  type RosLabel,
} from '@/utils/rosSchedule';
import { rankPlayoffStash } from '@/utils/playoffStash';
import { rankPhrase } from '@/utils/matchupRating';
import { NflTeamLabel } from './NflTeamLabel';
import { PosBadge } from './PosBadge';
import styles from './PlayoffStash.module.css';

interface PlayoffStashProps {
  league: League;
  /** Test override: a synthetic pool replaces the bundled one. */
  pool?: DraftPoolFile;
}

function chipClass(label: RosLabel): string {
  return label === 'favorable'
    ? styles.muFav
    : label === 'tough'
      ? styles.muTough
      : styles.muNeutral;
}

// Playoff Stash Board: the top 10 available QB/RB/WR/TE ranked by how soft
// their fantasy-playoff slate is (average opponent allowed-vs-position rank
// over the league's playoff weeks, 15–17 by default). The week-by-week slate
// names each playoff opponent; a bye in a playoff week shows as "Bye" and
// simply isn't averaged in. Priced on season-to-date allowed averages — a
// difficulty map, not a forecast. Guidance only — nothing here moves a roster.
export function PlayoffStash({ league, pool: poolOverride }: PlayoffStashProps) {
  const pool = useMemo(() => poolOverride ?? POOL, [poolOverride]);
  const weeks = useMemo(
    () => playoffWeeksForLeague(league.playoffStartWeek),
    [league.playoffStartWeek],
  );
  const rostered = useMemo(
    () => new Set(leagueOwnerMap(league, pool).keys()),
    [league, pool],
  );
  const rows = useMemo(
    () => rankPlayoffStash(pool, rostered, weeks, 10),
    [pool, rostered, weeks],
  );
  const heading = 'Playoff Stash Board';
  const windowLabel = `Best available players · Fantasy playoffs W${Math.min(...weeks)}–W${Math.max(...weeks)}`;

  return (
    <section className={styles.panel} aria-label={heading}>
      <div className={styles.headRow}>
        <h2 className={styles.heading}>{heading}</h2>
        <span className={styles.window}>{windowLabel}</span>
      </div>

      {rows.length > 0 ? (
        <table className={styles.table}>
          <caption className="visually-hidden">
            Top 10 unrostered skill players ranked by softest fantasy-playoff
            schedule, with each playoff-week opponent
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Rank</span>
              </th>
              <th scope="col">Player</th>
              <th scope="col">Playoff slate</th>
              <th scope="col">
                <abbr title="Average of the playoff opponents' allowed-vs-position ranks (1 = allows the most points, the easiest matchup)">
                  Avg opp rank
                </abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const { player, strength } = row;
              const verdict =
                strength.label === 'favorable'
                  ? 'Soft slate'
                  : strength.label === 'tough'
                    ? 'Tough slate'
                    : 'Average slate';
              const gameByWeek = new Map(strength.games.map(g => [g.week, g]));
              const slateText = weeks
                .map(w => {
                  const g = gameByWeek.get(w);
                  return g
                    ? `W${w} vs ${g.opponent} (${rankPhrase(g.rank)})`
                    : `W${w} bye`;
                })
                .join(' · ');
              return (
                <tr key={player.id}>
                  <td className={styles.rank}>{i + 1}</td>
                  <th scope="row" className={styles.playerCell}>
                    <PosBadge pos={player.pos} posRank={player.posRank} />
                    <span className={styles.playerName}>{player.name}</span>
                    <NflTeamLabel team={player.team} />
                  </th>
                  <td>
                    <span className={styles.slate} title={slateText} aria-label={slateText}>
                      {weeks.map(w => {
                        const g = gameByWeek.get(w);
                        if (!g) {
                          return (
                            <span key={w} className={styles.bye}>
                              W{w} bye
                            </span>
                          );
                        }
                        return (
                          <span
                            key={w}
                            className={chipClass(labelFor(g.rank))}
                            title={`Week ${w} vs ${g.opponent}: ${rankPhrase(g.rank)} points allowed to opposing ${player.pos}s`}
                          >
                            W{w} vs {g.opponent}
                          </span>
                        );
                      })}
                    </span>
                  </td>
                  <td className={styles.nums}>
                    <span
                      className={chipClass(strength.label)}
                      title={`${verdict} — playoff opponents average the ${strength.avgRank.toFixed(1)}-ranked matchup for ${player.pos}s`}
                    >
                      {verdict} ({strength.avgRank.toFixed(1)})
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className={styles.note}>
          No playoff stash candidates — every skill player with a playoff-week
          game is already rostered in this league, or the playoff weeks have
          no schedule data.
        </p>
      )}

      <p className={styles.footnote}>
        Ranked on season-to-date allowed-vs-position averages: how many fantasy
        points each defense gave opposing players at the position. A
        difficulty map, not a forecast — roles and injuries change. Guidance
        only — nothing moves your roster.
      </p>
    </section>
  );
}
