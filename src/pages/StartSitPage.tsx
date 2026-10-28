import { useEffect, useMemo, useState } from 'react';
import type { League, Player } from '@/types';
import { DataAsOf } from '@/components/DataAsOf';
import { NflTeamLabel, PosBadge } from '@/components';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import { DEFAULT_ROSTER_SLOTS } from '@/utils/draftDefaults';
import {
  normalizeLineupPos,
  optimalLineup,
  slotEligiblePositions,
  type OptimalLineupPlayer,
} from '@/utils/optimalLineup';
import {
  projectWeeklyPoints,
  projectionReason,
  type WeeklyProjection,
} from '@/utils/weeklyProjection';
import styles from './StartSitPage.module.css';

interface StartSitPageProps {
  league: League;
}

// Start/Sit optimizer (backlog item 1): the optimal starting lineup for a
// picked team from its current roster, ranked by projected points for the
// coming week — recency-weighted last-4 form blended with the season
// baseline, so one big week can't over-swing it — not by preseason
// projections, which go stale the moment the season starts. Players on bye
// in the league's current week are benched regardless of projection: they
// score zero that week. A matchup term (opponent points allowed vs position)
// is the queued remainder: the app has no NFL schedule source to derive it
// from yet. Guest-mode manual roster entry is also still queued.

interface ScoredPlayer extends OptimalLineupPlayer {
  player: Player;
  nflTeam: string;
  ppg: number | null;
  last3: number | null;
  projection: WeeklyProjection | null;
  bye: number | null;
  onBye: boolean;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function trendLabel(ppg: number | null, last3: number | null): string {
  if (ppg === null || last3 === null) return '';
  if (last3 >= ppg + 2) return ' · trending up';
  if (last3 <= ppg - 2) return ' · cooling off';
  return '';
}

export function StartSitPage({ league }: StartSitPageProps) {
  // Tab title matches the other league pages; leaving restores the Teams
  // title (the page this links from most often).
  useEffect(() => {
    document.title = 'Start/Sit Optimizer · TraderApe';
    return () => {
      document.title = 'Teams · TraderApe';
    };
  }, []);

  const [teamId, setTeamId] = useState<string | undefined>(() => {
    const mine = league.teams.find(t => t.isMyTeam);
    return (mine ?? league.teams[0])?.id;
  });
  const team = league.teams.find(t => t.id === teamId) ?? league.teams[0];
  const currentWeek = league.currentWeek;
  const slots = league.rosterSlots ?? DEFAULT_ROSTER_SLOTS;

  const scored = useMemo<ScoredPlayer[]>(() => {
    if (!team?.roster) return [];
    const poolIndex = indexPool(POOL);
    return team.roster.map(rosterPlayer => {
      // Weekly points are keyed by platform player id; try both id spaces
      // (Sleeper ids live in one, ESPN/Yahoo in the other).
      const weekly =
        league.playerWeeklyPoints?.[rosterPlayer.platformId] ??
        league.playerWeeklyPoints?.[rosterPlayer.id];
      const weeks = weekly
        ? Object.entries(weekly)
            .map(([w, pts]) => ({ week: Number(w), pts }))
            .filter(e => Number.isFinite(e.week))
            .sort((a, b) => a.week - b.week)
        : [];
      const completed =
        currentWeek !== undefined ? weeks.filter(e => e.week < currentWeek) : weeks;
      const usable = completed.length > 0 ? completed : weeks;
      // Games played, where the loader supplies it (Sleeper ids): the count
      // of completed weeks the player actually played. Otherwise the weekly
      // entry count stands in — a 0-point week still counts as played when
      // the platform reports it, and the weekly fallback only undercounts
      // players whose platform omits scoreless weeks.
      const gpWeeks = league.gamesPlayed?.season === league.season
        ? (league.gamesPlayed.bySleeperId[rosterPlayer.platformId] ??
          league.gamesPlayed.bySleeperId[rosterPlayer.id])
        : undefined;
      const gpCompleted = gpWeeks
        ? currentWeek !== undefined
          ? gpWeeks.filter(w => w < currentWeek).length
          : gpWeeks.length
        : null;
      const games = gpCompleted ?? (usable.length > 0 ? usable.length : null);
      const total =
        rosterPlayer.seasonPoints ?? (usable.length > 0 ? usable.reduce((s, e) => s + e.pts, 0) : null);
      const ppg = games !== null && games > 0 && total !== null ? round1(total / games) : null;
      const last3Entries = usable.slice(-3);
      const last3 =
        last3Entries.length > 0
          ? round1(last3Entries.reduce((s, e) => s + e.pts, 0) / last3Entries.length)
          : null;
      const projection = projectWeeklyPoints(completed, gpCompleted);
      const bye = resolvePoolPlayer(rosterPlayer, poolIndex)?.bye ?? null;
      return {
        id: rosterPlayer.id,
        name: rosterPlayer.name,
        position: rosterPlayer.position,
        // Rank on the projection where one exists; fall back to the season
        // average (or zero with no data at all) so guest/no-data rosters
        // still get a lineup instead of an empty one.
        score: projection?.projection ?? ppg ?? 0,
        player: rosterPlayer,
        nflTeam: rosterPlayer.team,
        ppg,
        last3,
        projection,
        bye,
        onBye: bye !== null && currentWeek !== undefined && bye === currentWeek,
      };
    });
  }, [team, league.playerWeeklyPoints, league.gamesPlayed, league.season, currentWeek]);

  // Bye-week players score zero this week, so they never start no matter
  // their average — they stay in the bench list with the reason attached.
  const lineup = useMemo(
    () => optimalLineup(scored.filter(s => !s.onBye), slots),
    [scored, slots],
  );
  const benched: ScoredPlayer[] = useMemo(() => {
    const bench = lineup.bench as ScoredPlayer[];
    const byeBench = scored.filter(s => s.onBye);
    return [...bench, ...byeBench].sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
  }, [lineup, scored]);
  const byePlayers = scored.filter(s => s.onBye);
  const starterById = new Map(
    lineup.starters
      .filter(s => s.player)
      .map(s => [s.player!.id, s.slot] as const),
  );

  const benchReason = (s: ScoredPlayer): string => {
    if (s.onBye) return `On bye in week ${currentWeek} — sits regardless of projection.`;
    const pos = normalizeLineupPos(s.position);
    // The lowest starter this player could have displaced, if any.
    const displaced = lineup.starters
      .filter(a => a.player && slotEligiblePositions(a.slot).includes(pos))
      .map(a => a.player as ScoredPlayer)
      .sort((a, b) => a.score - b.score)[0];
    const sScore = s.projection?.projection ?? s.ppg;
    if (!displaced || sScore === null || sScore === undefined)
      return 'No starting slot at this position.';
    // Compare on the same basis: projected vs projected, else season average
    // vs season average, so the gap is never a mixed-unit number.
    const displacedScore = s.projection
      ? displaced.score
      : (displaced.ppg ?? displaced.score);
    const unit = s.projection ? 'projected pts' : 'pts/game';
    return `${round1(displacedScore - sScore)} ${unit} behind the ${starterById.get(displaced.id)} starter.`;
  };

  const starterReason = (s: ScoredPlayer, slot: string): string => {
    const base = slotReason(slot);
    if (s.projection) return `${base}. ${projectionReason(s.projection)}`;
    return `${base}${trendLabel(s.ppg, s.last3)}.`;
  };

  const slotReason = (slot: string): string => {
    switch (slot) {
      case 'FLEX':
        return 'Highest average among remaining RB/WR/TE';
      case 'SUPERFLEX':
        return 'Highest average among remaining QB/RB/WR/TE';
      default:
        return `Highest average at ${slot}`;
    }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Start/Sit Optimizer</h1>
          <DataAsOf syncedAt={league.pinSyncedAt} />
          <p className={styles.subtitle}>
            {currentWeek !== undefined
              ? `Optimal lineup for week ${currentWeek}, ranked by projected points — recent form blended with season average.`
              : 'Optimal lineup from this roster, ranked by projected points — recent form blended with season average.'}
          </p>
        </div>

        <label className={styles.teamPicker}>
          Team
          <select
            aria-label="Team to optimize"
            value={team?.id ?? ''}
            onChange={e => setTeamId(e.target.value)}
          >
            {league.teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {/* Picking a team swaps the lineup in place with no navigation, so
            announce the new team and its total (matches the Waivers/Trade
            Analyzer in-place swap pattern). Always mounted. */}
        <div aria-live="polite" className="visually-hidden">
          {team
            ? `${team.name}: optimal lineup projects ${lineup.totalScore} points.`
            : ''}
        </div>

        {!team || !team.roster || team.roster.length === 0 ? (
          <div className={styles.empty}>
            <h2>No roster for this team</h2>
            <p>Sync the league from the Owner Console and this page will fill in.</p>
          </div>
        ) : (
          <>
            {byePlayers.length > 0 && (
              <p className={styles.byeWarning} role="status">
                On bye{currentWeek !== undefined ? ` in week ${currentWeek}` : ''} — benched
                automatically: {byePlayers.map(s => s.name).join(', ')}.
              </p>
            )}
            <h2 className={styles.sectionTitle}>
              Optimal starters · {lineup.totalScore} projected points combined
            </h2>
            <table className={styles.table} aria-label={`Optimal starters for ${team.name}`}>
              <thead>
                <tr>
                  <th scope="col">Slot</th>
                  <th scope="col">Player</th>
                  <th scope="col">Proj.</th>
                  <th scope="col">Pts/game</th>
                  <th scope="col">Last 3</th>
                  <th scope="col">Why they start</th>
                </tr>
              </thead>
              <tbody>
                {lineup.starters.map((a, i) => {
                  const s = a.player as ScoredPlayer | null;
                  return (
                    <tr key={`${a.slot}-${i}`}>
                      <th scope="row">{a.slot}</th>
                      <td>
                        {s ? (
                          <>
                            {s.name} <PosBadge pos={s.position} />{' '}
                            <NflTeamLabel team={s.nflTeam} />
                          </>
                        ) : (
                          <span className={styles.emptySlot}>Empty — no eligible player</span>
                        )}
                      </td>
                      <td>{s?.projection?.projection ?? '—'}</td>
                      <td>{s?.ppg ?? '—'}</td>
                      <td>{s?.last3 ?? '—'}</td>
                      <td>
                        {s ? starterReason(s, a.slot) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {benched.length > 0 && (
              <>
                <h2 className={styles.sectionTitle}>Bench</h2>
                <table className={styles.table} aria-label={`Bench for ${team.name}`}>
                  <thead>
                    <tr>
                      <th scope="col">Player</th>
                      <th scope="col">Proj.</th>
                      <th scope="col">Pts/game</th>
                      <th scope="col">Last 3</th>
                      <th scope="col">Why they sit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benched.map(s => (
                      <tr key={s.id}>
                        <td>
                          {s.name} <PosBadge pos={s.position} />{' '}
                          <NflTeamLabel team={s.nflTeam} />
                        </td>
                        <td>{s.projection?.projection ?? '—'}</td>
                        <td>{s.ppg ?? '—'}</td>
                        <td>{s.last3 ?? '—'}</td>
                        <td>{benchReason(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className={styles.note}>
              Projected from each player&apos;s last-4-week form blended with
              their season average, so one big week can&apos;t over-swing it.
              This does not yet see matchups, injuries, or news, so check
              those before lock.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
