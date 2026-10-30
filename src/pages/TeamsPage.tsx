import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataAsOf } from '@/components/DataAsOf';
import { TeamCard } from '@/components/TeamCard';
import { POOL } from '@/data/draftPool';
import { WEEKLY_SHAPE } from '@/data/weeklyShape';
import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { calculateLuckMetrics, type LuckMetrics, type MatchupData } from '@/utils/luck';
import { completedMatchups } from '@/utils/completedMatchups';
import { managerScores } from '@/utils/managerScore';
import { playoffRace } from '@/utils/playoffOdds';
import { previewWeeklyMatchups } from '@/utils/matchupPreview';
import { buildTeamInjurySummaries } from '@/utils/teamInjuries';
import { buildTeamGrades } from '@/utils/teamGrades';
import { injuryAbbrev, injuryTitle } from '@/utils/injury';
import type { InjurySeverityTier } from '@/utils/injuryReport';
import { TeamDetail } from './TeamDetail';
import styles from './TeamsPage.module.css';

interface TeamsPageProps {
  league: League;
  /** Test override: a synthetic pool replaces the bundled one. */
  pool?: DraftPoolFile;
}

function tierInjuryClass(tier: InjurySeverityTier): string {
  switch (tier) {
    case 'season-ending':
      return styles.injuryTierSeasonEnding;
    case 'out':
      return styles.injuryTierOut;
    case 'doubtful':
      return styles.injuryTierDoubtful;
    case 'questionable':
      return styles.injuryTierQuestionable;
    default:
      return styles.injuryTierOther;
  }
}

export function TeamsPage({ league, pool: poolOverride }: TeamsPageProps) {
  // ?team=<id> opens the team hub; team names across the app link here.
  const [searchParams, setSearchParams] = useSearchParams();
  const detailTeam = useMemo(() => {
    const id = searchParams.get('team');
    return id ? league.teams.find(t => t.id === id) ?? null : null;
  }, [searchParams, league.teams]);

  // Title the tab with the open team's name: tabs and history entries for
  // different teams stay tellable apart (matches the Player Journey's
  // player-name title). App.tsx's per-page title effect only fires on
  // pathname change, and ?team= never changes the pathname, so this owns
  // the title while a team is open; closing the hub or leaving the page
  // restores the page title.
  useEffect(() => {
    if (!detailTeam) return;
    document.title = `${detailTeam.name} · TraderApe`;
    return () => {
      document.title = 'Teams · TraderApe';
    };
  }, [detailTeam]);

  const openTeam = (id: string | null) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (id) params.set('team', id);
      else params.delete('team');
      return params;
    });
  };
  // Calculate luck metrics
  const luckByTeam = useMemo((): Map<string, LuckMetrics> => {
    const done = completedMatchups(league);
    if (done.length === 0) {
      return new Map();
    }

    const matchupData: MatchupData[] = done.map(m => ({
      week: m.week,
      team1Id: m.team1Id,
      team1Points: m.team1Points,
      team2Id: m.team2Id,
      team2Points: m.team2Points,
    }));

    const teams = league.teams.map(t => ({
      id: t.id,
      name: t.name,
      wins: t.wins || 0,
      losses: t.losses || 0,
      ties: t.ties || 0,
      pointsFor: t.pointsFor || 0,
    }));

    const metrics = calculateLuckMetrics(matchupData, teams, 10, {
      medianMatchup: league.hasMedianMatchup,
    });
    const map = new Map<string, LuckMetrics>();
    metrics.forEach(m => map.set(m.teamId, m));
    return map;
  }, [league]);

  // One number to argue about: draft + waivers + trades + schedule-adjusted
  // results, each normalized within the league.
  const scores = useMemo(() => {
    if (!league.matchups || league.matchups.length === 0) return [];
    return managerScores(league);
  }, [league]);

  // Season head-to-head grid: every pairing's record this season.
  const h2h = useMemo(() => {
    const grid = new Map<string, Map<string, { w: number; l: number; t: number }>>();
    for (const m of completedMatchups(league)) {
      if (m.team1Points === 0 && m.team2Points === 0) continue;
      const upd = (a: string, b: string, aPts: number, bPts: number) => {
        const row = grid.get(a) ?? new Map();
        const cell = row.get(b) ?? { w: 0, l: 0, t: 0 };
        if (aPts > bPts) cell.w++;
        else if (aPts < bPts) cell.l++;
        else cell.t++;
        row.set(b, cell);
        grid.set(a, row);
      };
      upd(m.team1Id, m.team2Id, m.team1Points, m.team2Points);
      upd(m.team2Id, m.team1Id, m.team2Points, m.team1Points);
    }
    return grid;
  }, [league]);

  // Sort teams by record (wins desc, then points for desc)
  const sortedTeams = [...league.teams].sort((a, b) => {
    const aWins = a.wins || 0;
    const bWins = b.wins || 0;
    if (aWins !== bWins) return bWins - aWins;

    const aPoints = a.pointsFor || 0;
    const bPoints = b.pointsFor || 0;
    return bPoints - aPoints;
  });

  const shortName = (name: string) =>
    name.length > 10 ? `${name.slice(0, 9)}…` : name;

  // Playoff race: needs the future schedule the owner's last sync fetched.
  // Absent on old snapshots and in guest mode — the section hides itself.
  const race = useMemo(() => playoffRace(league), [league]);
  // Per-owner injury summary: each team's injured rostered players, worst
  // first, from the bundled pool's Sleeper injury data. Hides when the sync
  // fetched no rosters (there's nobody to attribute injuries to).
  const pool = poolOverride ?? POOL;
  const hasRosters = league.teams.some(t => (t.roster?.length ?? 0) > 0);
  const injurySummaries = useMemo(
    () => (hasRosters ? buildTeamInjurySummaries(league, pool) : []),
    [league, pool, hasRosters],
  );
  // Weekly matchup preview: this week's projected scores + win probability
  // per matchup, priced on the Start/Sit projection engine. Hides itself
  // when the sync fetched no future schedule (old snapshots, guest mode).
  const matchupPreviews = useMemo(() => previewWeeklyMatchups(league), [league]);
  // Team grades: mid-season League Analyzer — each team's optimal starters
  // vs the league median per position group, priced on TraderApe's own
  // rest-of-season outlook. Hides in guest mode and on snapshots without
  // rosters or a live week.
  const teamGrades = useMemo(
    () =>
      hasRosters
        ? buildTeamGrades({
            league,
            pool,
            shape: pool.season === WEEKLY_SHAPE.season ? WEEKLY_SHAPE : undefined,
          })
        : undefined,
    [league, pool, hasRosters],
  );
  const gradeClass = (letter: string) =>
    letter.startsWith('A')
      ? styles.gradeA
      : letter.startsWith('B')
        ? ''
        : letter.startsWith('C')
          ? styles.gradeC
          : styles.gradeDF;
  const teamById = useMemo(
    () => new Map(league.teams.map(t => [t.id, t])),
    [league.teams],
  );
  const remainingTitle = (r: (typeof race)[number]) =>
    r.remaining.length === 0
      ? 'No games left'
      : r.remaining
          .map(
            o =>
              `Week ${o.week} vs ${teamById.get(o.opponentId)?.name ?? '?'} — ${o.winProb}% win probability`,
          )
          .join(', ');

  if (detailTeam) {
    return (
      <div className={styles.page}>
        <div className="container">
          {/* Clicking a team card swaps the whole page to that team's hub
              in place with no navigation, so screen readers heard nothing
              change; this announces the opened team. Visible text unchanged. */}
          <div aria-live="polite" className="visually-hidden">
            {`${detailTeam.name} team hub open.`}
          </div>
          <TeamDetail league={league} team={detailTeam} onBack={() => openTeam(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className="container">
        {/* Closing a team hub swaps back to the team list in place with no
            navigation, so screen readers heard nothing change; this
            announces the return to the list. Visible text unchanged. */}
        <div aria-live="polite" className="visually-hidden">
          {`Team list, ${league.teams.length} teams.`}
        </div>
        <div className={styles.header}>
          <h1 className={styles.title}>Team Overview</h1>
          <p className={styles.subtitle}>
            {league.totalTeams} teams in {league.name}
          </p>
          {/* The snapshot comes from the owner's last /admin sync, not a live
              pull — show how fresh it is. */}
          <DataAsOf syncedAt={league.pinSyncedAt} />
          {league.hasMedianMatchup && (
            <p className={styles.subtitle}>
              Median league — luck compares head-to-head results only; the extra
              weekly median win is excluded.
            </p>
          )}
          {league.isBestBall && (
            <p className={styles.subtitle}>
              Best ball — starters are auto-optimized, so points-since-pickup
              and lineup-based numbers reflect optimal lineups, not decisions.
            </p>
          )}
        </div>

        {scores.length > 0 && (
          <section className={styles.skillSection}>
            <h2 className={styles.sectionTitle}>Manager Skill Score</h2>
            <p className={styles.sectionHint}>
              {scores[0].components.trades === null
                ? 'Draft value, waiver PAR, and all-play results (35 / 24 / 41%; no trades yet, so trades sit out).'
                : 'Draft value (30%), waiver PAR (20%), trade PAR (15%), all-play results (35%).'}{' '}
              Each scored 0-100 against this league.
            </p>
            <div className={styles.skillList}>
              {scores.map((s, i) => (
                <div key={s.teamId} className={styles.skillRow}>
                  <span className={styles.skillRank}>{i + 1}</span>
                  <span className={styles.skillName}>{s.teamName}</span>
                  <span
                    className={styles.skillParts}
                    title={`Draft ${s.components.draft} · Waivers ${s.components.waivers}${s.components.trades === null ? '' : ` · Trades ${s.components.trades}`} · Results ${s.components.results}`}
                  >
                    D{s.components.draft} W{s.components.waivers}{s.components.trades === null ? '' : ` T${s.components.trades}`} R{s.components.results}
                  </span>
                  <div className={styles.skillBarTrack}>
                    <div className={styles.skillBarFill} style={{ width: `${s.score}%` }} />
                  </div>
                  <span className={styles.skillScore}>{s.score}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className={styles.grid}>
          {sortedTeams.map((team) => (
            <TeamCard
              key={team.id}
              league={league}
              team={team}
              luckMetrics={luckByTeam.get(team.id)}
              onClick={() => openTeam(team.id)}
            />
          ))}
        </div>

        {hasRosters && injurySummaries.length > 0 && (
          <section className={styles.raceSection} aria-labelledby="team-injuries-heading">
            <h2 id="team-injuries-heading" className={styles.sectionTitle}>
              Team Injuries
            </h2>
            <p className={styles.sectionHint}>
              Each team&apos;s injured startable players, worst severity
              first. Designations from Sleeper&apos;s injury data in the
              bundled pool (refreshed twice daily); ownership from the
              owner&apos;s latest sync. The league-wide view with handcuff
              replacements lives on the Waivers page.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table className={styles.matrix} aria-label="Team injury summary">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">Hurt</th>
                    <th scope="col">Injured players</th>
                  </tr>
                </thead>
                <tbody>
                  {injurySummaries.map(s => (
                    <tr key={s.teamId}>
                      <th scope="row" title={s.teamName}>{shortName(s.teamName)}</th>
                      <td>
                        {s.rows.length === 0 ? (
                          <span className={styles.injuryClear}>All clear</span>
                        ) : (
                          s.rows.length
                        )}
                      </td>
                      <td>
                        {s.rows.length === 0
                          ? '—'
                          : s.rows.map((row, i) => (
                              <span key={row.player.id}>
                                {i > 0 ? '; ' : ''}
                                <span
                                  className={tierInjuryClass(row.tier)}
                                  title={injuryTitle(row.player)}
                                  aria-label={`${row.player.name}: ${row.tierLabel}${row.detail ? `, ${row.detail}` : ''}`}
                                >
                                  {row.player.name} ({injuryAbbrev(row.player.injuryStatus ?? '')})
                                </span>
                              </span>
                            ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {matchupPreviews.length > 0 && (
          <section className={styles.raceSection} aria-labelledby="matchup-preview-heading">
            <h2 id="matchup-preview-heading" className={styles.sectionTitle}>
              This Week&apos;s Matchups
            </h2>
            <p className={styles.sectionHint}>
              Projected scores from TraderApe&apos;s weekly projection model
              (recency-weighted form blended with the season baseline, nudged
              by this week&apos;s matchup difficulty — the same engine as
              Start/Sit), priced on completed weeks only. A 30-point projected
              gap ≈ 91% win probability. Schedule from the owner&apos;s latest
              sync.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table className={styles.matrix} aria-label="This week's matchup projections">
                <thead>
                  <tr>
                    <th scope="col">Matchup</th>
                    <th scope="col">Proj. score</th>
                    <th scope="col">Win probability</th>
                  </tr>
                </thead>
                <tbody>
                  {matchupPreviews.map(p => {
                    const aName = teamById.get(p.teamAId)?.name ?? '?';
                    const bName = teamById.get(p.teamBId)?.name ?? '?';
                    const favA = p.winProbA >= 50;
                    const favName = favA ? aName : bName;
                    const favProb = favA ? p.winProbA : 100 - p.winProbA;
                    return (
                      <tr key={`${p.week}-${p.teamAId}-${p.teamBId}`}>
                        <th scope="row">
                          {aName} vs {bName}
                        </th>
                        <td>
                          {p.projA.toFixed(1)} – {p.projB.toFixed(1)}
                        </td>
                        <td>
                          <span
                            title={`${aName} ${p.winProbA.toFixed(1)}% · ${bName} ${(100 - p.winProbA).toFixed(1)}%`}
                          >
                            {favName} {favProb.toFixed(1)}%
                          </span>
                          <div className={styles.skillBarTrack} aria-hidden="true">
                            <div
                              className={styles.skillBarFill}
                              style={{ width: `${p.winProbA}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {teamGrades && teamGrades.length > 0 && (
          <section className={styles.raceSection} aria-labelledby="team-grades-heading">
            <h2 id="team-grades-heading" className={styles.sectionTitle}>
              Team Grades
            </h2>
            <p className={styles.sectionHint}>
              Mid-season roster grades: each team&apos;s optimal starters vs
              the league median at every position group, priced on
              TraderApe&apos;s own rest-of-season outlook (draft pace blended
              with the season projection). Overall weights starters most —
              bench depth counts, but lightly. K and D/ST are not graded.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table className={styles.matrix} aria-label="Team grades by position group">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">Overall</th>
                    <th scope="col">QB</th>
                    <th scope="col">RB</th>
                    <th scope="col">WR</th>
                    <th scope="col">TE</th>
                    <th scope="col">Bench</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {teamGrades.map(g => (
                    <tr key={g.teamId}>
                      <th scope="row" title={g.teamName}>{shortName(g.teamName)}</th>
                      <td>
                        <span
                          className={`${styles.gradeLetter} ${gradeClass(g.overall)}`}
                          title={`Overall grade ${g.overall}: roster at ${Math.round(g.overallRatio * 100)}% of the league-median rest-of-season outlook`}
                          aria-label={`Overall grade ${g.overall}`}
                        >
                          {g.overall}
                        </span>
                      </td>
                      {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => (
                        <td key={pos}>
                          <span
                            className={`${styles.gradeLetter} ${gradeClass(g.groups[pos].letter)}`}
                            title={`${pos} grade ${g.groups[pos].letter}: ${g.groups[pos].value.toFixed(1)} projected rest-of-season points among starters, ranked ${g.groups[pos].rank} of ${teamGrades.length}`}
                            aria-label={`${pos} grade ${g.groups[pos].letter}`}
                          >
                            {g.groups[pos].letter}
                          </span>
                        </td>
                      ))}
                      <td>
                        <span
                          className={`${styles.gradeLetter} ${gradeClass(g.bench.letter)}`}
                          title={`Bench depth grade ${g.bench.letter}: top two non-starters at ${g.bench.value.toFixed(1)} projected rest-of-season points, ranked ${g.bench.rank} of ${teamGrades.length}`}
                          aria-label={`Bench depth grade ${g.bench.letter}`}
                        >
                          {g.bench.letter}
                        </span>
                      </td>
                      <td>
                        {`Strongest: ${g.strength} · Weakest: ${g.weakness}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {race.length > 0 && (
          <section className={styles.raceSection} aria-labelledby="playoff-race-heading">
            <h2 id="playoff-race-heading" className={styles.sectionTitle}>Playoff Race</h2>
            <p className={styles.sectionHint}>
              {league.playoffTeams} playoff spots · 10,000 simulated seasons
              from each team's season scoring average (shrunk toward the league
              mean). The % next to each opponent is that team's share of sims
              in which it won that game. Schedule from the owner's latest sync.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table className={styles.matrix} aria-label="Playoff race: remaining schedule and odds">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">W-L</th>
                    <th scope="col">Remaining</th>
                    <th scope="col">SOS</th>
                    <th scope="col">Playoff odds</th>
                  </tr>
                </thead>
                <tbody>
                  {race.map(r => (
                    <tr key={r.teamId}>
                      <th scope="row" title={r.teamName}>{shortName(r.teamName)}</th>
                      <td>
                        {r.wins}-{r.losses}
                        {r.ties > 0 ? `-${r.ties}` : ''}
                      </td>
                      <td title={remainingTitle(r)}>
                        {r.remaining.length === 0
                          ? '—'
                          : r.remaining
                              .map(o => `W${o.week} ${shortName(teamById.get(o.opponentId)?.name ?? '?')} ${o.winProb}%`)
                              .join(' · ')}
                      </td>
                      <td
                        title={`Schedule difficulty rank ${r.sosRank} of ${race.length} (1 = toughest)`}
                      >
                        #{r.sosRank}
                      </td>
                      <td className={r.playoffProb >= 50 ? styles.raceLikely : styles.raceLong}>
                        {r.playoffProb}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {h2h.size > 1 && (
          <section className={styles.matrixSection}>
            <h2 className={styles.sectionTitle}>Head-to-Head Grid</h2>
            <p className={styles.sectionHint}>Season records, row vs column.</p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table className={styles.matrix} aria-label="Head-to-head grid">
                <thead>
                  <tr>
                    <th />
                    {sortedTeams.map(t => (
                      <th key={t.id} scope="col" title={t.name}>
                        {shortName(t.name)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTeams.map(row => (
                    <tr key={row.id}>
                      <th scope="row" title={row.name}>{shortName(row.name)}</th>
                      {sortedTeams.map(col => {
                        if (row.id === col.id) {
                          return <td key={col.id} className={styles.matrixSelf}>—</td>;
                        }
                        const cell = h2h.get(row.id)?.get(col.id);
                        if (!cell) return <td key={col.id} className={styles.matrixEmpty} />;
                        const cls =
                          cell.w > cell.l
                            ? styles.matrixWin
                            : cell.l > cell.w
                              ? styles.matrixLoss
                              : styles.matrixEven;
                        return (
                          <td key={col.id} className={cls} title={`${row.name} ${cell.w}-${cell.l}${cell.t ? `-${cell.t}` : ''} vs ${col.name}`}>
                            {cell.w}-{cell.l}
                            {cell.t > 0 ? `-${cell.t}` : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
