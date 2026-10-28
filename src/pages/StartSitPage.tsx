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
import styles from './StartSitPage.module.css';

interface StartSitPageProps {
  league: League;
}

// Start/Sit optimizer (backlog item 1, first slice): the optimal starting
// lineup for a picked team from its current roster, ranked by what players
// have actually scored this season — points per game, with a last-3-weeks
// form line — not by preseason projections, which go stale the moment the
// season starts. Players on bye in the league's current week are benched
// regardless of average: they score zero that week. A weekly projection
// feed and a guest-mode manual roster are the queued remainder, not this
// slice: the app has no weekly projection source to rank on.

interface ScoredPlayer extends OptimalLineupPlayer {
  player: Player;
  nflTeam: string;
  ppg: number | null;
  last3: number | null;
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
      const bye = resolvePoolPlayer(rosterPlayer, poolIndex)?.bye ?? null;
      return {
        id: rosterPlayer.id,
        name: rosterPlayer.name,
        position: rosterPlayer.position,
        score: ppg ?? 0,
        player: rosterPlayer,
        nflTeam: rosterPlayer.team,
        ppg,
        last3,
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
    if (s.onBye) return `On bye in week ${currentWeek} — sits regardless of average.`;
    const pos = normalizeLineupPos(s.position);
    // The lowest starter this player could have displaced, if any.
    const displaced = lineup.starters
      .filter(a => a.player && slotEligiblePositions(a.slot).includes(pos))
      .map(a => a.player!)
      .sort((a, b) => a.score - b.score)[0];
    if (!displaced || s.ppg === null) return 'No starting slot at this position.';
    return `${round1(displaced.score - (s.ppg ?? 0))} pts/game behind the ${starterById.get(displaced.id)} starter.`;
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
              ? `Optimal lineup for week ${currentWeek}, ranked by actual points per game this season.`
              : 'Optimal lineup from this roster, ranked by actual points per game this season.'}
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
            ? `${team.name}: optimal lineup averages ${lineup.totalScore} points per game.`
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
              Optimal starters · {lineup.totalScore} pts/game combined average
            </h2>
            <table className={styles.table} aria-label={`Optimal starters for ${team.name}`}>
              <thead>
                <tr>
                  <th scope="col">Slot</th>
                  <th scope="col">Player</th>
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
                      <td>{s?.ppg ?? '—'}</td>
                      <td>{s?.last3 ?? '—'}</td>
                      <td>
                        {s ? `${slotReason(a.slot)}${trendLabel(s.ppg, s.last3)}.` : '—'}
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
              Ranked on actual scoring so far, not preseason projections — a
              player&apos;s average moves with every week played. This does not
              see matchups, injuries, or news, so check those before lock.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
