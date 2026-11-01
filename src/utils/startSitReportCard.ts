// Start/Sit report card — grade the optimizer's own weekly calls. Each
// completed week is replayed with the model's projection priced on completed
// weeks only (no lookahead: weekly points are clipped to weeks before the
// target week), then the same balanced-mode optimal-lineup pass the Start/Sit
// page runs picks the recommended starters. The recommended lineup's actual
// points are compared against the points the manager's actual starters
// scored — "would following the model have beaten your gut".
//
// This is the honest, measured version of the accuracy claims competitors
// market (FantasyPros' annual accuracy competition crowns the most accurate
// experts; we grade our own model instead of claiming it).
//
// Hides (returns null) when the sync fetched no weekly lineups or weekly
// points (Yahoo, old snapshots, guest mode), in best-ball leagues (starters
// are auto-optimized there, so there are no calls to grade), or when no
// completed week replays. The live current week is excluded, mirroring
// completedMatchups: partial scores would grade half-played games.
//
// Caveat: the replay mirrors the page's bye/injury discipline, but injury
// designations are the bundled pool's current ones — an early-week replay
// may bench a player who was healthy then. The method footnote says so.

import type { League, LineupPlayer, Player, RosterSlots, WeeklyLineup } from '@/types';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer, type PoolIndex } from '@/utils/consensusGrade';
import { basePosition, canonicalTeam } from '@/utils/playerNames';
import { modeScore } from '@/utils/lineupMode';
import { optimalLineup } from '@/utils/optimalLineup';
import { actualPoints } from '@/utils/lineups';
import { scoreRosterPlayers, type ScoredPlayer } from '@/utils/rosterScoring';
import { DEFAULT_ROSTER_SLOTS } from '@/utils/draftDefaults';

export interface StartSitTeamGrade {
  teamId: string;
  teamName: string;
  /** Completed weeks with a gradeable replay. */
  weeks: number;
  /** Sum of the model's recommended lineups' actual points, 2dp. */
  modelPoints: number;
  /** Sum of the managers' actual starters' points, 2dp. */
  actualPoints: number;
  /** modelPoints - actualPoints, 1dp. Positive = the model beats the manager. */
  delta: number;
  /** Average delta per graded week, 1dp. */
  avgDelta: number;
  /** Completed weeks where the model's lineup outscored the actual one. */
  modelWonWeeks: number;
}

export interface StartSitReportCard {
  teams: StartSitTeamGrade[];
  /** Completed weeks with at least one gradeable team replay. */
  weeksGraded: number;
  /** Sum of team deltas, 1dp — the model's net edge across the league. */
  netDelta: number;
}

type LeagueSlice = Pick<
  League,
  | 'weeklyLineups'
  | 'playerWeeklyPoints'
  | 'teams'
  | 'rosterSlots'
  | 'status'
  | 'currentWeek'
  | 'isBestBall'
  | 'gamesPlayed'
  | 'season'
>;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// The weekly lineup carries platform ids, names, and positions but no NFL
// team — resolve it through the pool (same fallback chain as the rest of
// the app: platform ids, then names). Defenses get an extra lookup: the
// pool keys them dst-<abbr> and Sleeper rides them as the bare abbreviation.
function lineupPlayerTeam(lp: LineupPlayer, poolIndex: PoolIndex): string {
  const probe: Player = {
    id: lp.id,
    platformId: lp.id,
    name: lp.name,
    position: lp.pos,
    team: '',
  };
  const poolPlayer = resolvePoolPlayer(probe, poolIndex);
  if (poolPlayer?.team) return poolPlayer.team;
  if (basePosition(lp.pos) === 'DST') {
    const canon = canonicalTeam(lp.name.replace(/\s*(D\/ST|DST|DEF)\s*$/i, ''));
    const dst = poolIndex.byId.get(`dst-${canon.toLowerCase()}`);
    if (dst?.team) return dst.team;
  }
  return '';
}

interface WeekReplay {
  model: number;
  actual: number;
}

function replayWeek(
  lineup: WeeklyLineup,
  weeklyPoints: Record<string, Record<number, number>>,
  slots: RosterSlots,
  season: number | undefined,
  gamesPlayed: League['gamesPlayed'],
  poolIndex: PoolIndex,
): WeekReplay | null {
  const week = lineup.week;
  const all = [...lineup.starters, ...lineup.bench].filter(
    (p): p is LineupPlayer => p !== null,
  );
  if (all.length === 0) return null;
  const seen = new Map<string, LineupPlayer>();
  for (const p of all) if (!seen.has(p.id)) seen.set(p.id, p);
  const players = [...seen.values()];
  const roster: Player[] = players.map(p => ({
    id: p.id,
    platformId: p.id,
    name: p.name,
    position: p.pos,
    team: lineupPlayerTeam(p, poolIndex),
  }));
  // Clip to completed weeks only — the projection must never see the week
  // being graded or anything after it. scoreRosterPlayers' own
  // completed/weeks split would otherwise fall back to all weeks (future
  // included) for players with no history yet.
  const clipped: Record<string, Record<string, number>> = {};
  for (const [pid, weeks] of Object.entries(weeklyPoints)) {
    const c: Record<string, number> = {};
    for (const [w, pts] of Object.entries(weeks)) {
      if (Number(w) < week) c[w] = pts;
    }
    if (Object.keys(c).length > 0) clipped[pid] = c;
  }
  const scored: ScoredPlayer[] = scoreRosterPlayers({
    roster,
    weeklyPoints: clipped,
    gamesBySleeperId: gamesPlayed?.bySleeperId,
    gamesSeason: gamesPlayed?.season,
    season,
    currentWeek: week,
  });
  // The model needs something to price on — skip weeks that predate all
  // history (week 1), where every candidate would score 0 and the lineup
  // would be alphabetical noise.
  if (!scored.some(s => s.projection !== null || s.ppg !== null)) return null;
  // The page's exact balanced-mode pass: rank on the projection, bench bye
  // weeks and injured-out players.
  const ranked = scored.map(s => ({ ...s, score: modeScore(s, 'balanced') }));
  const byId = new Map(ranked.map(s => [s.id, s]));
  const model = optimalLineup(
    ranked.filter(s => !s.onBye && !s.injuredOut),
    slots ?? DEFAULT_ROSTER_SLOTS,
  );
  if (model.starters.every(a => a.player === null)) return null;
  const actualById = new Map(players.map(p => [p.id, p.points]));
  const modelPts = round2(
    model.starters.reduce((sum, a) => {
      if (!a.player) return sum;
      const sp = byId.get(a.player.id);
      const plat = sp?.player.platformId ?? a.player.id;
      const pts =
        weeklyPoints[plat]?.[week] ??
        weeklyPoints[a.player.id]?.[week] ??
        actualById.get(a.player.id) ??
        0;
      return sum + pts;
    }, 0),
  );
  return { model: modelPts, actual: actualPoints(lineup) };
}

export function buildStartSitReportCard(league: LeagueSlice): StartSitReportCard | null {
  if (league.isBestBall) return null;
  const lineups = league.weeklyLineups ?? [];
  const weeklyPoints = league.playerWeeklyPoints;
  if (lineups.length === 0 || !weeklyPoints) return null;
  // Same cutoff as completedMatchups: the in-progress week's partial scores
  // are not a final lineup.
  const currentWeek =
    league.status === 'live' && league.currentWeek ? league.currentWeek : null;
  const slots = league.rosterSlots ?? DEFAULT_ROSTER_SLOTS;
  const poolIndex = indexPool(POOL);
  const names = new Map(league.teams.map(t => [t.id, t.name]));
  const agg = new Map<string, { model: number; actual: number; weeks: number; won: number }>();
  const gradedWeeks = new Set<number>();
  for (const l of lineups) {
    if (currentWeek !== null && l.week >= currentWeek) continue;
    const r = replayWeek(l, weeklyPoints, slots, league.season, league.gamesPlayed, poolIndex);
    if (!r) continue;
    gradedWeeks.add(l.week);
    const a = agg.get(l.teamId) ?? { model: 0, actual: 0, weeks: 0, won: 0 };
    a.model += r.model;
    a.actual += r.actual;
    a.weeks += 1;
    if (r.model > r.actual) a.won += 1;
    agg.set(l.teamId, a);
  }
  const teams: StartSitTeamGrade[] = [];
  for (const [teamId, a] of agg) {
    if (a.weeks === 0) continue;
    const modelPoints = round2(a.model);
    const actual = round2(a.actual);
    const delta = round1(modelPoints - actual);
    teams.push({
      teamId,
      teamName: names.get(teamId) ?? teamId,
      weeks: a.weeks,
      modelPoints,
      actualPoints: actual,
      delta,
      avgDelta: round1(delta / a.weeks),
      modelWonWeeks: a.won,
    });
  }
  if (teams.length === 0) return null;
  teams.sort((a, b) => b.delta - a.delta || b.modelPoints - a.modelPoints);
  return {
    teams,
    weeksGraded: gradedWeeks.size,
    netDelta: round1(teams.reduce((s, t) => s + t.delta, 0)),
  };
}

/** Plain-language verdict for a team's grade row. */
export function reportCardVerdict(delta: number): string {
  if (delta >= 3) return 'Model beats you';
  if (delta <= -3) return 'You beat the model';
  return 'About even';
}
