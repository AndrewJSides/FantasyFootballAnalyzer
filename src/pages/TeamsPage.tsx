import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataAsOf } from '@/components/DataAsOf';
import { TeamCard } from '@/components/TeamCard';
import { POOL } from '@/data/draftPool';
import { WEEKLY_SHAPE } from '@/data/weeklyShape';
import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { calculateLuckMetrics, type LuckMetrics, type MatchupData } from '@/utils/luck';
import { completedMatchups } from '@/utils/completedMatchups';
import { managerScores } from '@/utils/managerScore';
import { playoffRace, clinchWatch } from '@/utils/playoffOdds';
import { buildPlayoffBracket } from '@/utils/playoffBracket';
import type { BracketSlot } from '@/utils/playoffBracket';
import { previewWeeklyMatchups } from '@/utils/matchupPreview';
import { buildTeamInjurySummaries } from '@/utils/teamInjuries';
import { buildTeamGrades } from '@/utils/teamGrades';
import { buildStackReport } from '@/utils/stackReport';
import { buildTeamPlayoffSOS } from '@/utils/teamPlayoffSOS';
import { playoffWeeksForLeague, rosShort } from '@/utils/rosSchedule';
import { buildDraftRoi } from '@/utils/draftRoi';
import { buildLineupEfficiency } from '@/utils/lineupEfficiency';
import { buildPerfectLineupRecord } from '@/utils/perfectLineupRecord';
import { buildPowerRankings } from '@/utils/powerRankings';
import { buildRecordBook } from '@/utils/recordBook';
import { buildRivalryMatrix, type RivalryCell } from '@/utils/rivalryMatrix';
import { buildStrengthOfVictory, SOV_VERDICT_LABEL } from '@/utils/strengthOfVictory';
import {
  buildTeamExpectationGap,
  expectationVerdict,
} from '@/utils/startSitReportCard';
import {
  buildAllPlayRecord,
  formatRecord,
} from '@/utils/allPlayRecord';
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

/** Display record for a rivalry-matrix cell ("2-0", "1-0-1" when ties exist). */
function rivalryCellRecord(cell: RivalryCell): string {
  return cell.ties > 0
    ? `${cell.wins}-${cell.losses}-${cell.ties}`
    : `${cell.wins}-${cell.losses}`;
}

/** Plain-language verdict for a rivalry-matrix cell, from the row team's side. */
function rivalryCellVerdict(
  rowName: string,
  cell: RivalryCell,
): string {
  const record = rivalryCellRecord(cell);
  if (cell.wins > cell.losses) return `${rowName} leads ${cell.opponentName} ${record}`;
  if (cell.losses > cell.wins) return `${rowName} trails ${cell.opponentName} ${record}`;
  return `${rowName} is even with ${cell.opponentName} ${record}`;
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
  // Clinch watch (backlog item 55): for each still-alive team, re-sim with
  // this week's game forced to a win / a loss and flag the locks. Runs on
  // fewer sims than the main race — it's a scenario check, not a forecast.
  const clinch = useMemo(
    () => new Map(clinchWatch(league, race).map(c => [c.teamId, c])),
    [league, race],
  );
  const bracket = useMemo(
    () =>
      race.length > 0 && league.playoffTeams
        ? buildPlayoffBracket(race, league.playoffTeams)
        : [],
    [race, league.playoffTeams],
  );

  // Round-by-round advancement odds on the projected bracket (backlog item
  // 37): each known team slot shows its modeled chance to win each playoff
  // round, from the same 10,000 simulated seasons as Champ %. Only the
  // standard 4/6-team brackets render lines — their displayed rounds align
  // 1:1 with the simulated rounds; other sizes keep the bracket as-is.
  const entryById = useMemo(() => new Map(race.map(r => [r.teamId, r])), [race]);
  const advancementFor = (
    slot: BracketSlot,
  ): { text: string; detail: string } | null => {
    if (!slot.teamId || !league.playoffTeams) return null;
    const probs = entryById.get(slot.teamId)?.roundProbs ?? [];
    const spots = league.playoffTeams;
    const short = (label: string): string | null =>
      label === 'Quarterfinals'
        ? 'QF'
        : label === 'Semifinals'
          ? 'SF'
          : label === 'Final'
            ? 'Title'
            : null;
    if (
      probs.length === 0 ||
      bracket.length !== probs.length ||
      bracket.length < 2 ||
      !(spots === 4 || spots === 6) ||
      !bracket.every(r => short(r.label) !== null)
    ) {
      return null;
    }
    // The 6-team bracket's top two seeds bye the quarterfinal: their line
    // starts at the semifinal.
    const offset = spots === 6 && slot.seed <= 2 ? 1 : 0;
    const parts = bracket
      .slice(offset)
      .map((r, i) => `${short(r.label)} ${probs[offset + i]}%`);
    return {
      text: parts.join(' · '),
      detail:
        `Modeled chance to win each playoff round — share of 10,000 ` +
        `simulated brackets (a bye counts as a won round): ${parts.join(', ')}.`,
    };
  };

  // Per-team fantasy-playoff schedule softness (backlog item 88): each
  // team's current optimal starters' playoff-week (W15–W17 by default)
  // opponent ranks averaged — the trade-deadline "whose playoff schedule
  // is soft" read. Hides with the Playoff Race section when rosters can't
  // be priced.
  const playoffWeeks = useMemo(
    () => playoffWeeksForLeague(league.playoffStartWeek),
    [league.playoffStartWeek],
  );
  const teamPlayoffSOS = useMemo(
    () => (race.length > 0 ? buildTeamPlayoffSOS({ league, weeks: playoffWeeks }) : undefined),
    [league, playoffWeeks, race.length],
  );
  const playoffSOSByTeam = useMemo(
    () => new Map((teamPlayoffSOS ?? []).map(s => [s.teamId, s])),
    [teamPlayoffSOS],
  );
  // Highest championship share across the simulated seasons.
  const projectedChampion = useMemo(
    () =>
      race.length > 0
        ? race.reduce((best, r) => (r.championProb > best.championProb ? r : best))
        : null,
    [race],
  );
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
  // Stack report: rostered QB + his WR/TE teammates per NFL team, ranked
  // league-wide by TraderApe's own rest-of-season outlook, plus waiver
  // stack-mates (unrostered pass-catchers sharing an NFL team with a
  // rostered QB). Same roster gating as Team Grades.
  const stackReport = useMemo(
    () =>
      hasRosters
        ? buildStackReport({
            league,
            pool,
            shape: pool.season === WEEKLY_SHAPE.season ? WEEKLY_SHAPE : undefined,
          })
        : undefined,
    [league, pool, hasRosters],
  );
  // Draft ROI: auction $ efficiency per team — actual auction spend vs
  // TraderApe's full-season outlook (points so far + projected rest).
  // Gated on auctioned draft picks existing (the util hides itself in
  // non-auction leagues); rosters aren't needed for the math.
  const hasAuctionPicks = league.teams.some(t =>
    (t.draftPicks ?? []).some(p => (p.auctionValue ?? 0) > 0),
  );
  const draftRoi = useMemo(
    () =>
      hasAuctionPicks
        ? buildDraftRoi({
            league,
            pool,
            shape: pool.season === WEEKLY_SHAPE.season ? WEEKLY_SHAPE : undefined,
          })
        : undefined,
    [league, pool, hasAuctionPicks],
  );
  // Lineup efficiency: each team's actual starter points vs the best legal
  // lineup, summed over completed weeks. Hides when the sync fetched no
  // weekly lineups (Yahoo, old snapshots, guest mode) or in best-ball.
  const lineupEfficiency = useMemo(() => buildLineupEfficiency(league), [league]);
  // Perfect-lineup record: each team's W-L if every manager had fielded
  // his best legal lineup every completed week. Hides under the same
  // conditions as lineup efficiency.
  const perfectLineup = useMemo(() => buildPerfectLineupRecord(league), [league]);
  // Expectation gap: actual points vs what the model expected each team's
  // best lineup to score (no-lookahead replay). Hides under the same
  // conditions as the Start/Sit model report card.
  const expectationGap = useMemo(() => buildTeamExpectationGap(league), [league]);
  // All-play record: each team's record if it had played every other team
  // every week. Hides when the sync fetched no matchups (old snapshots,
  // guest mode) or no week is complete yet.
  const allPlay = useMemo(() => buildAllPlayRecord(league), [league]);
  const sovByTeam = useMemo(
    () => new Map(buildStrengthOfVictory(league).map(r => [r.teamId, r])),
    [league],
  );
  // Record book: the season's extremes (highs, lows, blowouts, squeakers,
  // streaks). Hides when the sync fetched no matchups (old snapshots,
  // guest mode) or no week is complete yet.
  const recordBook = useMemo(() => buildRecordBook(league), [league]);
  // Rivalry matrix: this season's head-to-head W-L-T between every pair
  // of teams. Hides when the sync fetched no matchups (old snapshots,
  // guest mode) or no week is complete yet.
  const rivalry = useMemo(() => buildRivalryMatrix(league), [league]);
  // Power rankings: each team's season scoring average shrunk toward the
  // league mean (the same rating the Playoff Race sims run on), with a
  // last-3-weeks form trend. Hides with no completed matchups.
  const powerRankings = useMemo(() => buildPowerRankings(league), [league]);
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
              The full game plan — projected scores, win probabilities, score
              distributions, swing players, and per-team start/sit close
              calls — lives on the{' '}
              <Link to="/matchup">Matchup view</Link>.
            </p>
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

        {stackReport && (
          <section className={styles.raceSection} aria-labelledby="stack-report-heading">
            <h2 id="stack-report-heading" className={styles.sectionTitle}>
              Stack Report
            </h2>
            <p className={styles.sectionHint}>
              QB + pass-catcher stacks: a rostered QB paired with his rostered
              WR/TE teammates on the same NFL team, ranked league-wide by
              TraderApe&apos;s own rest-of-season outlook. Stacked teammates
              spike together — when the QB erupts, his pass-catchers tend to
              as well. QB–RB pairs don&apos;t correlate and aren&apos;t counted
              as stacks.
            </p>
            {stackReport.stacks.length > 0 ? (
              <div className={`${styles.matrixWrapper} scroll-x-hint`}>
                <table className={styles.matrix} aria-label="League stacks ranked by rest-of-season outlook">
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Team</th>
                      <th scope="col">Stack</th>
                      <th scope="col">ROS pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stackReport.stacks.map(s => (
                      <tr key={`${s.teamId}-${s.nflTeam}`}>
                        <td>{s.rank}</td>
                        <th scope="row" title={s.teamName}>{shortName(s.teamName)}</th>
                        <td
                          title={`${s.teamName}: ${s.nflTeam} stack — ${[...s.qbNames, ...s.catcherNames].join(' + ')}: ${s.combinedRos.toFixed(1)} projected rest-of-season points, ranked ${s.rank} of ${stackReport.stacks.length} league stacks`}
                          aria-label={`${s.nflTeam} stack: ${[...s.qbNames, ...s.catcherNames].join(', ')}, ${s.combinedRos.toFixed(1)} projected rest-of-season points, ranked ${s.rank} of ${stackReport.stacks.length}`}
                        >
                          {s.nflTeam}: {[...s.qbNames, ...s.catcherNames].join(' + ')}
                        </td>
                        <td>{s.combinedRos.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.sectionHint}>
                No team rosters a QB with one of his WR/TE teammates yet — the
                waiver stack-mates below are how to build one.
              </p>
            )}
            {stackReport.waiverTargets.length > 0 && (
              <>
                <h3 id="stack-waiver-heading" className={styles.sectionTitle}>
                  Waiver stack-mates
                </h3>
                <p className={styles.sectionHint}>
                  Unrostered pass-catchers who share an NFL team with a
                  rostered QB — add one to complete (or start) a stack.
                </p>
                <div className={`${styles.matrixWrapper} scroll-x-hint`}>
                  <table className={styles.matrix} aria-label="Waiver stack-mates: unrostered pass-catchers sharing an NFL team with a rostered quarterback">
                    <thead>
                      <tr>
                        <th scope="col">Player</th>
                        <th scope="col">Pos</th>
                        <th scope="col">NFL</th>
                        <th scope="col">Stacks with</th>
                        <th scope="col">ROS pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stackReport.waiverTargets.map(t => (
                        <tr key={`${t.poolId}-${t.qbTeamId}`}>
                          <th scope="row">{t.name}</th>
                          <td>{t.pos}</td>
                          <td>{t.nflTeam}</td>
                          <td
                            title={`${t.name} (${t.nflTeam}) would stack with ${t.qbNames.join(' and ')} on ${t.qbTeamName}`}
                            aria-label={`Stacks with ${t.qbNames.join(' and ')} on ${t.qbTeamName}`}
                          >
                            {shortName(t.qbTeamName)}&apos;s {t.qbNames.join(', ')}
                          </td>
                          <td>{t.ros.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {draftRoi && draftRoi.length > 0 && (
          <section className={styles.raceSection} aria-labelledby="draft-roi-heading">
            <h2 id="draft-roi-heading" className={styles.sectionTitle}>
              Draft ROI
            </h2>
            <p className={styles.sectionHint}>
              Auction-dollar efficiency: each team&apos;s actual auction
              spend vs TraderApe&apos;s full-season outlook (points scored
              so far + projected rest of season). $ per projected point —
              lower is better. Best/worst buys name the $5+ picks with the
              highest and lowest expected points per dollar.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table className={styles.matrix} aria-label="Auction draft ROI by team: spend vs projected season points">
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Team</th>
                    <th scope="col">Spent</th>
                    <th scope="col">Proj. season pts</th>
                    <th scope="col">$ per pt</th>
                    <th scope="col">Best buy</th>
                    <th scope="col">Worst buy</th>
                  </tr>
                </thead>
                <tbody>
                  {draftRoi.map(r => (
                    <tr key={r.teamId}>
                      <td>{r.rank}</td>
                      <th scope="row" title={r.teamName}>{shortName(r.teamName)}</th>
                      <td>${r.spent}</td>
                      <td>{r.projectedPoints.toFixed(1)}</td>
                      <td
                        title={`${r.teamName}: $${r.spent} spent for ${r.projectedPoints.toFixed(1)} projected season points — $${r.costPerPoint.toFixed(2)} per point, ranked ${r.rank} of ${draftRoi.length}`}
                        aria-label={`$${r.costPerPoint.toFixed(2)} per projected point, ranked ${r.rank} of ${draftRoi.length}`}
                      >
                        ${r.costPerPoint.toFixed(2)}
                      </td>
                      <td
                        title={r.bestBuy ? `${r.bestBuy.playerName}: $${r.bestBuy.cost} for ${r.bestBuy.pointsPerDollar.toFixed(1)} expected points per dollar` : 'No $5+ pick to grade'}
                      >
                        {r.bestBuy ? `${r.bestBuy.playerName} ($${r.bestBuy.cost})` : '—'}
                      </td>
                      <td
                        title={r.worstBuy ? `${r.worstBuy.playerName}: $${r.worstBuy.cost} for ${r.worstBuy.pointsPerDollar.toFixed(1)} expected points per dollar` : 'No $5+ pick to grade'}
                      >
                        {r.worstBuy ? `${r.worstBuy.playerName} ($${r.worstBuy.cost})` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {powerRankings.length > 0 && (
          <section className={styles.raceSection} aria-labelledby="power-rankings-heading">
            <h2 id="power-rankings-heading" className={styles.sectionTitle}>
              Power Rankings
            </h2>
            <p className={styles.sectionHint}>
              Each team's season scoring average over completed weeks, shrunk
              toward the league mean — the same rating the Playoff Race sims
              run on, so a one-week explosion can't over-swing it. The Rank
              Δ column shows movement vs the same table priced on last
              week's completed weeks (FantasyPros' League Analyzer shows
              each team's change in rank as a headline feature). Team
              Grades answers the forward-looking version of this question
              (projected points from here); this is what each team has
              actually done.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table
                className={styles.matrix}
                aria-label="Team power rankings: shrunk scoring rating over completed weeks"
              >
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Team</th>
                    <th scope="col">Rank Δ</th>
                    <th scope="col">Power rating</th>
                    <th scope="col">Avg pts</th>
                    <th scope="col">Last 3</th>
                    <th scope="col">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {powerRankings.map((r, i) => {
                    const delta =
                      r.priorWeekRank == null ? null : r.priorWeekRank - (i + 1);
                    const deltaTitle =
                      delta == null
                        ? 'Rank change needs two completed weeks'
                        : delta > 0
                          ? `Rank ${i + 1}, up ${delta} from rank ${r.priorWeekRank} last week`
                          : delta < 0
                            ? `Rank ${i + 1}, down ${-delta} from rank ${r.priorWeekRank} last week`
                            : `Rank ${i + 1}, unchanged from last week`;
                    const trend =
                      r.trend == null
                        ? '—'
                        : r.trend === 'hot'
                          ? '🔥 Hot'
                          : r.trend === 'cold'
                            ? '❄️ Cold'
                            : 'Steady';
                    return (
                      <tr key={r.teamId}>
                        <td>{i + 1}</td>
                        <td>{r.teamName}</td>
                        <td
                          className={
                            delta == null || delta === 0
                              ? styles.matrixEven
                              : delta > 0
                                ? styles.matrixWin
                                : styles.matrixLoss
                          }
                          title={deltaTitle}
                          aria-label={deltaTitle}
                        >
                          {delta == null ? (
                            '—'
                          ) : delta > 0 ? (
                            `↑${delta}`
                          ) : delta < 0 ? (
                            `↓${-delta}`
                          ) : (
                            '—'
                          )}
                        </td>
                        <td
                          title={`Season scoring average ${r.avg.toFixed(1)} over ${r.weeks} completed week${r.weeks === 1 ? '' : 's'}, pulled toward the league mean`}
                        >
                          {r.rating.toFixed(1)}
                        </td>
                        <td>{r.avg.toFixed(1)}</td>
                        <td>{r.last3 != null ? r.last3.toFixed(1) : '—'}</td>
                        <td
                          title={
                            r.trend == null
                              ? 'Fewer than 3 completed weeks'
                              : `Last-3 average ${r.last3!.toFixed(1)} vs season average ${r.avg.toFixed(1)}`
                          }
                        >
                          {trend}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {allPlay.length > 0 && (
          <section className={styles.raceSection} aria-labelledby="all-play-heading">
            <h2 id="all-play-heading" className={styles.sectionTitle}>
              All-Play Record
            </h2>
            <p className={styles.sectionHint}>
              Each team's record if it had played every other team every
              completed week. A team outscoring its actual record was lucky
              with the schedule; one trailing it was robbed. SOV (strength
              of victory) is the combined win rate of the teams each manager
              actually beat — the NFL's quality-of-wins tiebreaker: a high
              SOV means the wins came against good teams.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table
                className={styles.matrix}
                aria-label="All-play record: each team's record vs every opponent each completed week, plus strength of victory"
              >
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Team</th>
                    <th scope="col">All-play</th>
                    <th scope="col">Actual</th>
                    <th scope="col">Schedule luck</th>
                    <th scope="col" title="Strength of victory: the combined win rate of the teams beaten">
                      SOV
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allPlay.map((r, i) => {
                    const luck =
                      r.luckDiff == null
                        ? '—'
                        : r.luckDiff > 0
                          ? `+${r.luckDiff.toFixed(1)} lucky`
                          : r.luckDiff < 0
                            ? `${r.luckDiff.toFixed(1)} unlucky`
                            : 'even';
                    const sov = sovByTeam.get(r.teamId);
                    const sovDetail =
                      sov?.sovPct == null
                        ? 'No wins yet — no strength of victory'
                        : `Strength of victory ${sov.sovPct.toFixed(1)}%: beat teams with a combined ${sov.opponentsCombined} record — ${SOV_VERDICT_LABEL[sov.verdict]}`;
                    return (
                      <tr key={r.teamId}>
                        <td>{i + 1}</td>
                        <td>{r.teamName}</td>
                        <td
                          title={`${r.allWins} wins, ${r.allLosses} losses${r.allTies ? `, ${r.allTies} ties` : ''} over ${r.weeks} completed week${r.weeks === 1 ? '' : 's'} — ${r.allPlayPct.toFixed(1)}% win rate`}
                        >
                          {formatRecord(r.allWins, r.allLosses, r.allTies)}
                        </td>
                        <td>
                          {formatRecord(r.actualWins, r.actualLosses, r.actualTies)}
                        </td>
                        <td
                          title={
                            r.luckDiff == null
                              ? 'Actual record unavailable'
                              : `Actual win rate ${r.actualPct!.toFixed(1)}% vs all-play win rate ${r.allPlayPct.toFixed(1)}%`
                          }
                        >
                          {luck}
                        </td>
                        <td title={sovDetail} aria-label={sovDetail}>
                          {sov?.sovPct == null ? '—' : `${sov.sovPct.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {recordBook && (
          <section className={styles.raceSection} aria-labelledby="record-book-heading">
            <h2 id="record-book-heading" className={styles.sectionTitle}>
              Record Book
            </h2>
            <p className={styles.sectionHint}>
              The season's extremes from the {recordBook.weeks} completed
              week{recordBook.weeks === 1 ? '' : 's'}' scores — the
              in-progress week is excluded, so a half-played game can never
              hold a record.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table
                className={styles.matrix}
                aria-label="League record book: highest and lowest single-week scores, biggest blowout, closest game, and longest win and losing streaks"
              >
                <thead>
                  <tr>
                    <th scope="col">Record</th>
                    <th scope="col">Holder</th>
                    <th scope="col">Mark</th>
                    <th scope="col">Week</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Highest single-week score</th>
                    <td>{recordBook.highestWeek.teamName}</td>
                    <td
                      title={`Week ${recordBook.highestWeek.week}: ${recordBook.highestWeek.teamName} scored ${recordBook.highestWeek.points.toFixed(1)}`}
                    >
                      {recordBook.highestWeek.points.toFixed(1)} pts
                    </td>
                    <td>W{recordBook.highestWeek.week}</td>
                  </tr>
                  <tr>
                    <th scope="row">Lowest single-week score</th>
                    <td>{recordBook.lowestWeek.teamName}</td>
                    <td
                      title={`Week ${recordBook.lowestWeek.week}: ${recordBook.lowestWeek.teamName} scored ${recordBook.lowestWeek.points.toFixed(1)}`}
                    >
                      {recordBook.lowestWeek.points.toFixed(1)} pts
                    </td>
                    <td>W{recordBook.lowestWeek.week}</td>
                  </tr>
                  <tr>
                    <th scope="row">Biggest blowout</th>
                    <td>
                      {recordBook.biggestBlowout.winnerName} over{' '}
                      {recordBook.biggestBlowout.loserName}
                    </td>
                    <td
                      title={`${recordBook.biggestBlowout.winnerName} ${recordBook.biggestBlowout.winnerPoints.toFixed(1)} – ${recordBook.biggestBlowout.loserName} ${recordBook.biggestBlowout.loserPoints.toFixed(1)}`}
                    >
                      won by {recordBook.biggestBlowout.margin.toFixed(1)}
                    </td>
                    <td>W{recordBook.biggestBlowout.week}</td>
                  </tr>
                  <tr>
                    <th scope="row">Closest game</th>
                    <td>
                      {recordBook.closestGame.winnerName}
                      {recordBook.closestGame.tie
                        ? ` tied ${recordBook.closestGame.loserName}`
                        : ` over ${recordBook.closestGame.loserName}`}
                    </td>
                    <td
                      title={
                        recordBook.closestGame.tie
                          ? `Tied ${recordBook.closestGame.winnerPoints.toFixed(1)} – ${recordBook.closestGame.loserPoints.toFixed(1)}`
                          : `${recordBook.closestGame.winnerName} ${recordBook.closestGame.winnerPoints.toFixed(1)} – ${recordBook.closestGame.loserName} ${recordBook.closestGame.loserPoints.toFixed(1)}`
                      }
                    >
                      {recordBook.closestGame.tie
                        ? 'tied'
                        : `won by ${recordBook.closestGame.margin.toFixed(1)}`}
                    </td>
                    <td>W{recordBook.closestGame.week}</td>
                  </tr>
                  <tr>
                    <th scope="row">Longest win streak</th>
                    <td>{recordBook.longestWinStreak.teamName}</td>
                    <td
                      title={`Weeks ${recordBook.longestWinStreak.fromWeek}–${recordBook.longestWinStreak.toWeek}`}
                    >
                      {recordBook.longestWinStreak.length} game
                      {recordBook.longestWinStreak.length === 1 ? '' : 's'}
                    </td>
                    <td>
                      W{recordBook.longestWinStreak.fromWeek}–W
                      {recordBook.longestWinStreak.toWeek}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Longest losing streak</th>
                    <td>{recordBook.longestLossStreak.teamName}</td>
                    <td
                      title={`Weeks ${recordBook.longestLossStreak.fromWeek}–${recordBook.longestLossStreak.toWeek}`}
                    >
                      {recordBook.longestLossStreak.length} game
                      {recordBook.longestLossStreak.length === 1 ? '' : 's'}
                    </td>
                    <td>
                      W{recordBook.longestLossStreak.fromWeek}–W
                      {recordBook.longestLossStreak.toWeek}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {rivalry && (
          <section className={styles.raceSection} aria-labelledby="rivalry-heading">
            <h2 id="rivalry-heading" className={styles.sectionTitle}>
              Rivalry Matrix
            </h2>
            <p className={styles.sectionHint}>
              This season's head-to-head record between every pair of teams,
              from the {rivalry.weeks} completed week
              {rivalry.weeks === 1 ? '' : 's'}' scores. Rows read left to
              right: the row team's record against each opponent. The
              in-progress week is excluded, so a half-played game can never
              count in a season series.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table
                className={styles.matrix}
                aria-label="Rivalry matrix: this season's head-to-head win-loss record between every pair of teams"
              >
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="visually-hidden">Team</span>
                    </th>
                    {rivalry.rows.map(r => (
                      <th key={r.teamId} scope="col">
                        {r.teamName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rivalry.rows.map(row => (
                    <tr key={row.teamId}>
                      <th scope="row">{row.teamName}</th>
                      {row.cells.map(cell => {
                        const isSelf = cell.opponentId === row.teamId;
                        const verdict = isSelf
                          ? row.teamName
                          : cell.games === 0
                            ? `${row.teamName} and ${cell.opponentName} haven't met yet this season`
                            : rivalryCellVerdict(row.teamName, cell);
                        return (
                          <td
                            key={cell.opponentId}
                            title={verdict}
                            aria-label={verdict}
                          >
                            {isSelf || cell.games === 0
                              ? '—'
                              : rivalryCellRecord(cell)}
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

        {lineupEfficiency.length > 0 && (
          <section className={styles.raceSection} aria-labelledby="lineup-efficiency-heading">
            <h2 id="lineup-efficiency-heading" className={styles.sectionTitle}>
              Lineup Efficiency
            </h2>
            <p className={styles.sectionHint}>
              Each manager's actual starter points vs the best legal lineup he
              could have fielded, summed over completed weeks. 100% means he
              never left a point on the bench.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table
                className={styles.matrix}
                aria-label="Lineup efficiency: actual starter points vs best legal lineup, completed weeks"
              >
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Team</th>
                    <th scope="col">Weeks</th>
                    <th scope="col">Efficiency</th>
                    <th scope="col">Started</th>
                    <th scope="col">Best possible</th>
                    <th scope="col">Left on bench</th>
                  </tr>
                </thead>
                <tbody>
                  {lineupEfficiency.map((r, i) => (
                    <tr key={r.teamId}>
                      <td>{i + 1}</td>
                      <td>{r.teamName}</td>
                      <td>{r.weeks}</td>
                      <td
                        title={`Started ${r.actual} of a possible ${r.best} over ${r.weeks} completed week${r.weeks === 1 ? '' : 's'}`}
                      >
                        {r.efficiency.toFixed(1)}%
                      </td>
                      <td>{r.actual.toFixed(1)}</td>
                      <td>{r.best.toFixed(1)}</td>
                      <td>{r.leftOnBench.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {perfectLineup.length > 0 && (
          <section className={styles.raceSection} aria-labelledby="perfect-lineup-heading">
            <h2 id="perfect-lineup-heading" className={styles.sectionTitle}>
              Perfect-Lineup Record
            </h2>
            <p className={styles.sectionHint}>
              Each team's record if every manager had fielded his best legal
              lineup every completed week — every matchup re-decided with
              both sides' best-possible scores. Swing is the wins the manager
              left on the bench: positive means better lineups would have won
              more games, negative means he won games his best lineup
              wouldn't have.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table
                className={styles.matrix}
                aria-label="Perfect-lineup record: each team's record with best-possible lineups every completed week"
              >
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Team</th>
                    <th scope="col">Perfect record</th>
                    <th scope="col">Actual</th>
                    <th scope="col">Swing</th>
                  </tr>
                </thead>
                <tbody>
                  {perfectLineup.map((r, i) => {
                    const optRec = formatRecord(r.optWins, r.optLosses, r.optTies);
                    const actRec = formatRecord(r.actWins, r.actLosses, r.actTies);
                    const swingLabel =
                      r.winSwing === 0
                        ? 'Same record with perfect lineups'
                        : r.winSwing > 0
                          ? `${r.teamName} would be ${optRec} with perfect lineups instead of ${actRec} — ${r.winSwing} win${r.winSwing === 1 ? '' : 's'} left on the bench`
                          : `${r.teamName} won ${actRec} but his best lineups only go ${optRec} — ${Math.abs(r.winSwing)} win${r.winSwing === -1 ? '' : 's'} he wouldn't have won`;
                    return (
                      <tr key={r.teamId}>
                        <td>{i + 1}</td>
                        <td>{r.teamName}</td>
                        <td>{optRec}</td>
                        <td>{actRec}</td>
                        <td title={swingLabel} aria-label={swingLabel}>
                          {r.winSwing > 0 ? `+${r.winSwing.toFixed(1)}` : r.winSwing.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {expectationGap && (
          <section className={styles.raceSection} aria-labelledby="expectation-gap-heading">
            <h2 id="expectation-gap-heading" className={styles.sectionTitle}>
              Expectation Gap
            </h2>
            <p className={styles.sectionHint}>
              Actual points vs what the model expected each team&apos;s best
              lineup to score each completed week — positive means the roster
              is producing more than expected (running hot), negative means
              it&apos;s leaving points on the table (running cold). Hot teams
              are regression candidates; cold teams are buy-low context.
            </p>
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table
                className={styles.matrix}
                aria-label="Expectation gap: each team's actual points vs model-expected points"
              >
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Team</th>
                    <th scope="col">Expected</th>
                    <th scope="col">Actual</th>
                    <th scope="col">Gap</th>
                    <th scope="col">Read</th>
                  </tr>
                </thead>
                <tbody>
                  {expectationGap.teams.map((t, i) => {
                    const read = expectationVerdict(t.avgGap);
                    const detail =
                      `Over ${t.weeks} graded ${t.weeks === 1 ? 'week' : 'weeks'} ${t.teamName}'s ` +
                      `best lineups scored ${t.actualPoints} pts vs ${t.expectedPoints} expected ` +
                      `(${t.gap >= 0 ? '+' : ''}${t.gap} pts, ${t.avgGap >= 0 ? '+' : ''}${t.avgGap} per week) — ${read.toLowerCase()}.`;
                    return (
                      <tr key={t.teamId}>
                        <td>{i + 1}</td>
                        <td>{t.teamName}</td>
                        <td>{t.expectedPoints}</td>
                        <td>{t.actualPoints}</td>
                        <td title={detail} aria-label={detail}>
                          {t.gap > 0 ? `+${t.gap.toFixed(1)}` : t.gap.toFixed(1)}
                        </td>
                        <td title={detail} aria-label={detail}>{read}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>
              Each completed week is replayed with the model&apos;s projection
              priced on completed weeks only — no lookahead — using the same
              balanced-mode optimal-lineup pass as the Start/Sit model report
              card, with the same bye-week and injury-out benching. The live
              week is excluded, and week 1 is skipped (the model has no
              history to price on yet). Injury designations are the
              pool&apos;s current ones, so an early-week replay may bench a
              player who was healthy then.
            </p>
          </section>
        )}

        {race.length > 0 && (
          <section className={styles.raceSection} aria-labelledby="playoff-race-heading">
            <h2 id="playoff-race-heading" className={styles.sectionTitle}>Playoff Race</h2>
            <p className={styles.sectionHint}>
              {league.playoffTeams} playoff spots · 10,000 simulated seasons
              from each team's season scoring average (shrunk toward the league
              mean). The % next to each opponent is that team's share of sims
              in which it won that game; Proj. W-L is the projected final
              record from the same simulations. Proj. seed is the mean playoff
              seed across the sims, and Status is the model's verdict —
              Clinched means the team made the playoffs in every sim,
              Eliminated means it missed in every sim (the model, not the
              league office). Champ % is the share of sims in which the team
              won the fully simulated playoff bracket. "This week" names the
              clinch scenarios the model found by re-simulating each alive
              team's season with this week's game forced to a win and to a
              loss — "Clinches with a win" means the team made the playoffs
              in every forced-win season, "Out with a loss" means it missed
              in every forced-loss season (model verdict, not league-official).
              PO SOS averages each team's current optimal starters'
              fantasy-playoff (W{Math.min(...playoffWeeks)}–W{Math.max(...playoffWeeks)})
              opponent ranks — 1 is the softest — on the same season-to-date
              allowed-vs-position data as the Rankings page's PO SOS column;
              a difficulty map for the trade deadline, not a forecast.
              Schedule from the owner's latest sync.
            </p>
            {projectedChampion && (
              <p className={styles.sectionHint}>
                Projected champion: {projectedChampion.teamName}{' '}
                ({projectedChampion.championProb}%) — the highest championship
                share across the 10,000 simulated seasons (model verdict, not
                league-official).
              </p>
            )}
            <div className={`${styles.matrixWrapper} scroll-x-hint`}>
              <table className={styles.matrix} aria-label="Playoff race: remaining schedule, SOS, playoff schedule softness, projected standings, seed, championship odds, status, this week's clinch scenarios, and odds">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">W-L</th>
                    <th scope="col">Proj. W-L</th>
                    <th scope="col">Proj. seed</th>
                    <th scope="col">Remaining</th>
                    <th scope="col">SOS</th>
                    <th scope="col">PO SOS</th>
                    <th scope="col">Playoff odds</th>
                    <th scope="col">Champ %</th>
                    <th scope="col">Status</th>
                    <th scope="col">This week</th>
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
                      <td
                        title={`Projected final record ${r.projectedWins.toFixed(1)}-${r.projectedLosses.toFixed(1)} from 10,000 simulated seasons`}
                        aria-label={`Projected final record: ${r.projectedWins.toFixed(1)} wins, ${r.projectedLosses.toFixed(1)} losses`}
                      >
                        {r.projectedWins.toFixed(1)}-{r.projectedLosses.toFixed(1)}
                      </td>
                      <td
                        title={`Mean playoff seed ${r.projectedSeed.toFixed(1)} of ${race.length} across 10,000 simulated seasons`}
                        aria-label={`Projected playoff seed: ${r.projectedSeed.toFixed(1)}`}
                      >
                        {r.projectedSeed.toFixed(1)}
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
                      {(() => {
                        const sos = playoffSOSByTeam.get(r.teamId);
                        if (!sos) return <td>—</td>;
                        const verdict =
                          sos.label === 'favorable'
                            ? 'Soft'
                            : sos.label === 'tough'
                              ? 'Tough'
                              : 'Average';
                        return (
                          <td
                            title={
                              `Fantasy-playoff schedule (W${Math.min(...playoffWeeks)}–W${Math.max(...playoffWeeks)}): ` +
                              `${verdict} — this team's ${sos.starters} priced starters' playoff opponents ` +
                              `average rank ${sos.avgRank.toFixed(1)} (1 = easiest). Priced on the same ` +
                              `season-to-date allowed-vs-position averages as the Rankings page's PO SOS ` +
                              `column; a difficulty map, not a forecast.`
                            }
                            aria-label={`Playoff schedule softness: ${verdict}, average opponent rank ${sos.avgRank.toFixed(1)} (1 = easiest)`}
                          >
                            {rosShort({ avgRank: sos.avgRank, label: sos.label, games: [] })}
                          </td>
                        );
                      })()}
                      <td className={r.playoffProb >= 50 ? styles.raceLikely : styles.raceLong}>
                        {r.playoffProb}%
                      </td>
                      <td
                        title={`Championship odds: won ${r.championProb}% of 10,000 fully simulated playoff brackets (model verdict, not league-official)`}
                        aria-label={`Championship odds: ${r.championProb}%`}
                      >
                        {r.championProb}%
                      </td>
                      <td
                        title={
                          r.playoffStatus === 'clinched'
                            ? 'Clinched: made the playoffs in all 10,000 simulated seasons (model verdict, not league-official)'
                            : r.playoffStatus === 'eliminated'
                              ? 'Eliminated: missed the playoffs in all 10,000 simulated seasons (model verdict, not league-official)'
                              : 'Still alive in the playoff race'
                        }
                        aria-label={
                          r.playoffStatus === 'clinched'
                            ? 'Playoff status: clinched, per the model'
                            : r.playoffStatus === 'eliminated'
                              ? 'Playoff status: eliminated, per the model'
                              : 'Playoff status: still alive'
                        }
                      >
                        {r.playoffStatus === 'clinched'
                          ? 'Clinched'
                          : r.playoffStatus === 'eliminated'
                            ? 'Eliminated'
                            : '—'}
                      </td>
                      <td
                        title={(() => {
                          const c = clinch.get(r.teamId);
                          const bits: string[] = [];
                          if (c?.clinchesWithWin)
                            bits.push(
                              'Clinches a playoff berth with a win this week: made the playoffs in every forced-win simulated season (model verdict, not league-official)',
                            );
                          if (c?.eliminatedWithLoss)
                            bits.push(
                              'Eliminated with a loss this week: missed the playoffs in every forced-loss simulated season (model verdict, not league-official)',
                            );
                          return bits.length > 0
                            ? bits.join(' ')
                            : 'No clinch or elimination scenario this week';
                        })()}
                        aria-label={(() => {
                          const c = clinch.get(r.teamId);
                          const bits: string[] = [];
                          if (c?.clinchesWithWin)
                            bits.push('clinches a playoff berth with a win');
                          if (c?.eliminatedWithLoss)
                            bits.push('eliminated with a loss');
                          return bits.length > 0
                            ? `This week's scenarios, per the model: ${bits.join(' and ')}`
                            : 'No clinch or elimination scenario this week';
                        })()}
                      >
                        {(() => {
                          const c = clinch.get(r.teamId);
                          if (!c) return '—';
                          const bits: string[] = [];
                          if (c.clinchesWithWin) bits.push('Clinches with a win');
                          if (c.eliminatedWithLoss)
                            bits.push('Out with a loss');
                          return bits.length > 0 ? bits.join(' · ') : '—';
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bracket.length > 0 && (
              <div aria-labelledby="playoff-bracket-heading">
                <h3 id="playoff-bracket-heading" className={styles.sectionTitle}>
                  Projected Bracket
                </h3>
                <p className={styles.sectionHint}>
                  Pairs the projected seeds above; the higher seed is favored
                  in each matchup. Later rounds show winners to be determined —
                  the bracket itself does not play individual games, but the
                  Champ % column in the table above does: it comes from fully
                  simulating these playoff brackets in each of the 10,000
                  seasons. Each team's line names its modeled chance to win
                  each round (QF/SF/Title) from those same simulations.
                </p>
                {bracket.map(round => (
                  <div key={round.label}>
                    <h4>{round.label}</h4>
                    <ul aria-label={`${round.label} matchups`}>
                      {round.matchups.map((m, i) => {
                        const favoredName =
                          m.favoredTeamId === m.slotA.teamId
                            ? m.slotA.name
                            : m.favoredTeamId === m.slotB.teamId
                              ? m.slotB.name
                              : null;
                        const advA = advancementFor(m.slotA);
                        const advB = advancementFor(m.slotB);
                        const slotLabel = (
                          slot: BracketSlot,
                          adv: { detail: string } | null,
                        ) =>
                          `${slot.seed > 0 ? `${slot.seed}-seed ` : ''}${slot.name}` +
                          (adv ? ` — ${adv.detail}` : '');
                        return (
                          <li
                            key={i}
                            aria-label={
                              `${slotLabel(m.slotA, advA)} versus ${slotLabel(m.slotB, advB)}` +
                              (favoredName
                                ? `, ${favoredName} favored as the higher seed`
                                : '')
                            }
                          >
                            {m.slotA.seed > 0 ? `${m.slotA.seed}. ` : ''}
                            {m.slotA.name}
                            {advA && (
                              <span
                                className={styles.bracketOdds}
                                title={advA.detail}
                              >
                                {' '}· {advA.text}
                              </span>
                            )}
                            {' vs '}
                            {m.slotB.seed > 0 ? `${m.slotB.seed}. ` : ''}
                            {m.slotB.name}
                            {advB && (
                              <span
                                className={styles.bracketOdds}
                                title={advB.detail}
                              >
                                {' '}· {advB.text}
                              </span>
                            )}
                            {favoredName !== null && (
                              <span
                                title={`${favoredName} favored as the higher seed`}
                              >
                                {' '}· {favoredName} favored
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
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
