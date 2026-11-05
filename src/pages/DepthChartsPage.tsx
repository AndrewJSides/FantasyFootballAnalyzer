// NFL Depth Charts (backlog item 116): every NFL team's QB/RB/WR/TE depth
// ladder in one place, with league ownership per player where a league is
// loaded (owner-free in guest mode). The Handcuff Report covers RBs only;
// this is the full ladder for every position — the "who inherits the job
// if the starter goes down, and is he on waivers or a rival's bench"
// question. Orderings come from the bundled pool's Sleeper depth-chart
// order (positional-rank fallback); projections are Sleeper full-PPR
// season projections. Guidance only: nothing here moves a roster.
import { useEffect, useMemo, useState } from 'react';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import { POOL } from '@/data/draftPool';
import { nflTeamInfo } from '@/data/nflTeams';
import { currentWeekEstimate } from '@/utils/matchupRating';
import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import {
  buildDepthChart,
  DEPTH_POSITIONS,
  type DepthTeam,
} from '@/utils/depthChart';
import { NflTeamLabel } from '@/components';
import { SITE_TITLE } from '../utils/siteTitle';
import styles from './DepthChartsPage.module.css';

// League mode: pool player id -> owning fantasy team name, resolved against
// the bundled pool (mirrors the HandcuffReport leagueOwners).
function leagueOwners(league: League, pool: DraftPoolFile): Map<string, string> {
  const index = indexPool(pool);
  const owners = new Map<string, string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p, index);
      if (resolved) owners.set(resolved.id, team.name);
    }
  }
  return owners;
}

interface DepthChartsPageProps {
  /** League when one is loaded (undefined in guest mode). */
  league?: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

function teamLabel(abbr: string): string {
  const info = nflTeamInfo(abbr);
  return info ? `${abbr} — ${info.name}` : abbr;
}

function projPts(player: DepthTeam['positions']['QB'][number]['player']): string {
  return player.projPtsPpr != null && Number.isFinite(player.projPtsPpr)
    ? player.projPtsPpr.toFixed(1)
    : '—';
}

// Item-143 Sleeper projection cell: Sleeper's own week-N projection next to
// the season figure, so a ladder row can be checked against this week's
// market number. A pending or failed fetch just leaves dashes — the
// ladders never wait on it.
function SleeperCell({
  player,
  projections,
  ready,
  week,
}: {
  player: DepthTeam['positions']['QB'][number]['player'];
  projections: Record<string, number> | undefined;
  ready: boolean;
  week: number;
}) {
  const sid = player.sleeperId;
  const value = ready && sid ? projections?.[sid] : undefined;
  if (value === undefined) {
    return (
      <td
        aria-label={
          ready
            ? 'No Sleeper projection for this player'
            : 'Sleeper projection not loaded'
        }
      >
        —
      </td>
    );
  }
  const label = `Sleeper projection ${value.toFixed(1)} for week ${week}`;
  return (
    <td title={label} aria-label={label}>
      {value.toFixed(1)}
    </td>
  );
}

export function DepthChartsPage({ league, pool = POOL }: DepthChartsPageProps) {
  useEffect(() => {
    document.title = 'Depth Charts · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);

  const isLeague = !!league && !league.isGuest;
  const [owners] = useState(() =>
    isLeague ? leagueOwners(league, pool) : new Map<string, string>(),
  );

  // Sleeper projection column (backlog item 143): one no-auth request
  // shared across all team tables; silent degrade to dashes on failure.
  const season = league?.season ?? pool.season;
  const week = league?.currentWeek ?? currentWeekEstimate();
  const [sleeperProjections, setSleeperProjections] = useState<
    Record<string, number> | undefined
  >(undefined);
  const [sleeperReady, setSleeperReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchSleeperWeekProjections(season, week)
      .then(data => {
        if (!cancelled) {
          setSleeperProjections(data);
          setSleeperReady(true);
        }
      })
      .catch(() => {
        // Silent degrade: dashes, the ladders still show season figures.
      });
    return () => {
      cancelled = true;
    };
  }, [season, week]);
  const teams = useMemo(
    () => buildDepthChart({ pool, ownerByPoolId: owners }),
    [pool, owners],
  );
  const [selected, setSelected] = useState<string>('ALL');
  const visible =
    selected === 'ALL' ? teams : teams.filter(t => t.nflTeam === selected);
  const liveMessage =
    selected === 'ALL'
      ? `Showing all ${teams.length} teams`
      : `Showing ${teamLabel(selected)} depth chart`;

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Depth Charts</h1>
          <p className={styles.subtitle}>
            {pool.season} season · every team&apos;s QB / RB / WR / TE ladder
          </p>
        </div>

        <div className={styles.selectRow}>
          <label className={styles.selectLabel} htmlFor="depth-team-select">
            NFL team
          </label>
          <select
            id="depth-team-select"
            className={styles.select}
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            <option value="ALL">All teams</option>
            {teams.map(t => (
              <option key={t.nflTeam} value={t.nflTeam}>
                {teamLabel(t.nflTeam)}
              </option>
            ))}
          </select>
        </div>
        <p className="visually-hidden" role="status" aria-live="polite">
          {liveMessage}
        </p>

        {visible.length === 0 ? (
          <p className={styles.note}>
            No depth-chart players found in the bundled pool.
          </p>
        ) : (
          visible.map(team => (
            <section
              key={team.nflTeam}
              className={styles.teamSection}
              aria-labelledby={`depth-${team.nflTeam}`}
            >
              <h2 id={`depth-${team.nflTeam}`} className={styles.teamHeading}>
                <NflTeamLabel team={team.nflTeam} size="sm" />{' '}
                {nflTeamInfo(team.nflTeam)?.name ?? team.nflTeam}
              </h2>
              <table className={styles.table}>
                <caption className="visually-hidden">
                  {teamLabel(team.nflTeam)} depth chart: ladder order,
                  full-PPR season projection, Sleeper week {week} projection,
                  and fantasy owner
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Pos</th>
                    <th scope="col">Depth</th>
                    <th scope="col">Player</th>
                    <th scope="col">Proj PPR</th>
                    <th scope="col">Sleeper</th>
                    {isLeague && <th scope="col">Owner</th>}
                  </tr>
                </thead>
                <tbody>
                  {DEPTH_POSITIONS.flatMap(pos =>
                    team.positions[pos].map((d, i) => (
                      <tr key={d.player.id}>
                        <td>{pos}</td>
                        <td>{i + 1}</td>
                        <td>
                          {d.player.name}
                          {d.player.injuryStatus ? (
                            <span className={styles.injuryTag}>
                              {' '}
                              · {d.player.injuryStatus}
                            </span>
                          ) : null}
                        </td>
                        <td>{projPts(d.player)}</td>
                        <SleeperCell
                          player={d.player}
                          projections={sleeperProjections}
                          ready={sleeperReady}
                          week={week}
                        />
                        {isLeague && <td>{d.owner ?? 'Free agent'}</td>}
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </section>
          ))
        )}

        <p className={styles.footnote}>
          Order is Sleeper&apos;s depth-chart order from the bundled pool,
          falling back to positional rank where no depth-chart data exists.
          Proj PPR is the Sleeper full-PPR season projection. The Sleeper
          column shows Sleeper&apos;s own week {week} projection where
          published; a dash means no Sleeper line for that player.
          Ownership resolves against the loaded league; in guest mode no
          owners are shown. Guidance only — nothing here moves a roster.
        </p>
      </div>
    </div>
  );
}
