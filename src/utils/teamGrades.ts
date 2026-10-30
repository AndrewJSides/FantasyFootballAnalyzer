// Team Grades (backlog item 22): mid-season "League Analyzer" answer to
// "how does my roster stack up against everyone else's". FantasyPros ships
// an in-season League Analyzer (power rankings + projected standings —
// researched for feature shape only); these grades are computed from
// TraderApe's own ROS outlook engine, no copied content.
//
// Per team, per position group (QB/RB/WR/TE): the optimal starters (base
// slots + FLEX/SUPERFLEX filled from the team's own best leftovers) are
// priced on projected ROS points from seasonOutlooks, then ranked against
// the same group's starters on every other team. Bench depth grades the
// top two non-starters the same way. Overall is the weighted mean of the
// group ratios vs the league median. K and D/ST are not graded.
import type { DraftPick, GamesPlayed, League, Player, RosterSlots, ScoringType } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { WeeklyShapeFile } from '@/types/weeklyShape';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import { DEFAULT_ROSTER_SLOTS } from './draftDefaults';
import { seasonOutlooks } from './seasonOutlook';

export const GRADE_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type GradePosition = (typeof GRADE_POSITIONS)[number];

// Starter-slot weighting for the overall grade. Bench counts less than any
// single starter group — it covers one injury, not a season.
const GROUP_WEIGHTS: Record<GradePosition, number> = { QB: 0.15, RB: 0.3, WR: 0.3, TE: 0.15 };
const BENCH_WEIGHT = 0.1;

export interface GroupGrade {
  /** Letter grade from the percentile of this team's group value among teams. */
  letter: string;
  /** This team's group ROS value vs the league median group value. */
  ratio: number;
  /** Sum of projected ROS points of the team's starters in this group. */
  value: number;
  /** 1-based rank of the group among teams (1 = best). */
  rank: number;
}

export interface TeamGrade {
  teamId: string;
  teamName: string;
  groups: Record<GradePosition, GroupGrade>;
  bench: GroupGrade;
  /** Letter grade from the weighted-mean ratio vs the league median. */
  overall: string;
  /** Weighted-mean group ratio vs the league median. */
  overallRatio: number;
  /** Strongest position group (name), for the one-line note. */
  strength: GradePosition | 'Bench';
  /** Weakest position group (name), for the one-line note. */
  weakness: GradePosition | 'Bench';
}

export interface TeamGradesInput {
  league: League;
  pool: DraftPoolFile;
  shape?: WeeklyShapeFile;
  scoring?: ScoringType;
  slots?: RosterSlots;
  teamCount?: number;
  season?: number;
  passTdPoints?: number;
  tePremiumPerReception?: number;
  gamesPlayed?: GamesPlayed;
}

function letterForPercentile(percentile: number): string {
  // percentile: 1 = best team, 0 = worst.
  if (percentile >= 0.97) return 'A+';
  if (percentile >= 0.88) return 'A';
  if (percentile >= 0.79) return 'A-';
  if (percentile >= 0.7) return 'B+';
  if (percentile >= 0.6) return 'B';
  if (percentile >= 0.51) return 'B-';
  if (percentile >= 0.42) return 'C+';
  if (percentile >= 0.32) return 'C';
  if (percentile >= 0.22) return 'C-';
  if (percentile >= 0.12) return 'D';
  return 'F';
}

function letterForRatio(ratio: number): string {
  if (ratio >= 1.2) return 'A+';
  if (ratio >= 1.12) return 'A';
  if (ratio >= 1.06) return 'A-';
  if (ratio >= 1.02) return 'B+';
  if (ratio >= 0.98) return 'B';
  if (ratio >= 0.94) return 'B-';
  if (ratio >= 0.9) return 'C+';
  if (ratio >= 0.86) return 'C';
  if (ratio >= 0.82) return 'C-';
  if (ratio >= 0.75) return 'D';
  return 'F';
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface TeamRosPlayer {
  teamId: string;
  pool: PoolPlayer;
  ros: number;
}

/** League-mode team grades, or undefined when the league can't be priced. */
export function buildTeamGrades(input: TeamGradesInput): TeamGrade[] | undefined {
  const { league, pool, shape } = input;
  const currentWeek = league.currentWeek;
  if (!currentWeek || league.status !== 'live') return undefined;
  if (!league.teams.some(t => (t.roster?.length ?? 0) > 0)) return undefined;

  const scoring = input.scoring ?? league.scoringType ?? 'ppr';
  const slots = input.slots ?? league.rosterSlots ?? DEFAULT_ROSTER_SLOTS;
  const teamCount = input.teamCount ?? league.totalTeams ?? league.teams.length;
  const season = input.season ?? league.season;

  // Real league players as picks for the outlook engine (rosRankings' trick:
  // the outlook map keys use the pick's own player id, so map back through
  // pool-id dedupe). Draft picks carry seasonPoints for the pace blend;
  // roster players with no draft pick (waiver pickups, trades) are added
  // without points — the engine falls back to their season projection.
  const index = indexPool(pool);
  const realPicks: DraftPick[] = [];
  const poolIdByPickKey = new Map<string, string>();
  const covered = new Set<string>();
  for (const team of league.teams) {
    for (const pick of team.draftPicks ?? []) {
      const resolved = resolvePoolPlayer(pick.player, index);
      if (!resolved) continue;
      realPicks.push(pick);
      covered.add(resolved.id);
      poolIdByPickKey.set(`${pick.player.position}-${pick.player.id}`, resolved.id);
    }
  }
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p as Player, index);
      if (!resolved || covered.has(resolved.id)) continue;
      realPicks.push({
        pickNumber: 0,
        round: 0,
        player: p as Player,
        teamId: team.id,
        teamName: team.name,
        seasonPoints: 0,
      });
      covered.add(resolved.id);
      poolIdByPickKey.set(`${p.position}-${p.id}`, resolved.id);
    }
  }
  if (realPicks.length === 0) return undefined;

  const outlooks = seasonOutlooks(realPicks, pool, season === shape?.season ? shape : undefined, {
    scoring,
    slots,
    teamCount,
    currentWeek,
    season,
    extras: {
      passTdPoints: input.passTdPoints ?? league.passTdPoints,
      tePremiumPerReception: input.tePremiumPerReception ?? league.tePremiumPerReception,
    },
    gamesPlayed: input.gamesPlayed ?? league.gamesPlayed,
    platform: league.platform,
  });
  const outlookKeyByPoolId = new Map<string, string>();
  for (const [key, poolId] of poolIdByPickKey) {
    if (!outlookKeyByPoolId.has(poolId)) outlookKeyByPoolId.set(poolId, key);
  }

  // Team id -> graded players at each group, sorted best first.
  const byTeam = new Map<string, Map<GradePosition, TeamRosPlayer[]>>();
  for (const team of league.teams) {
    const atPos = new Map<GradePosition, TeamRosPlayer[]>();
    for (const pos of GRADE_POSITIONS) atPos.set(pos, []);
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p as Player, index);
      if (!resolved || !GRADE_POSITIONS.includes(resolved.pos as GradePosition)) continue;
      const key = outlookKeyByPoolId.get(resolved.id);
      const outlook = key ? outlooks.get(key) : undefined;
      if (!outlook) continue;
      atPos.get(resolved.pos as GradePosition)!.push({
        teamId: team.id,
        pool: resolved,
        ros: outlook.projectedPoints,
      });
    }
    for (const list of atPos.values()) list.sort((a, b) => b.ros - a.ros);
    byTeam.set(team.id, atPos);
  }

  // Per team: starter values per group (base slots + FLEX/SUPERFLEX filled
  // from the team's own best leftovers), and the top-2 non-starter bench.
  interface TeamValues {
    teamId: string;
    teamName: string;
    groupValue: Record<GradePosition, number>;
    benchValue: number;
  }
  const values: TeamValues[] = league.teams.map(team => {
    const atPos = byTeam.get(team.id)!;
    const used = new Set<TeamRosPlayer>();
    const groupValue: Record<GradePosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };

    for (const pos of GRADE_POSITIONS) {
      const starters = atPos.get(pos)!.slice(0, slots[pos] ?? 0);
      for (const s of starters) {
        used.add(s);
        groupValue[pos] += s.ros;
      }
    }

    // FLEX: best remaining RB/WR/TE. SUPERFLEX: best remaining QB/RB/WR/TE.
    const remaining = (positions: GradePosition[]) =>
      positions
        .flatMap(pos => atPos.get(pos)!)
        .filter(p => !used.has(p))
        .sort((a, b) => b.ros - a.ros);
    for (const s of remaining(['RB', 'WR', 'TE']).slice(0, slots.FLEX ?? 0)) {
      used.add(s);
      groupValue[s.pool.pos as GradePosition] += s.ros;
    }
    for (const s of remaining(['QB', 'RB', 'WR', 'TE']).slice(0, slots.SUPERFLEX ?? 0)) {
      used.add(s);
      groupValue[s.pool.pos as GradePosition] += s.ros;
    }

    const leftovers = remaining(['QB', 'RB', 'WR', 'TE']);
    const benchValue = leftovers.slice(0, 2).reduce((sum, p) => sum + p.ros, 0);

    return { teamId: team.id, teamName: team.name, groupValue, benchValue };
  });

  const medians: Record<GradePosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const pos of GRADE_POSITIONS) medians[pos] = median(values.map(v => v.groupValue[pos]));
  const benchMedian = median(values.map(v => v.benchValue));

  const n = values.length;
  const rankOf = (list: TeamValues[], key: (v: TeamValues) => number) =>
    new Map(
      [...list]
        .sort((a, b) => key(b) - key(a))
        .map((v, i) => [v.teamId, i + 1] as [string, number]),
    );
  const groupRanks = new Map<GradePosition, Map<string, number>>();
  for (const pos of GRADE_POSITIONS)
    groupRanks.set(pos, rankOf(values, v => v.groupValue[pos]));
  const benchRanks = rankOf(values, v => v.benchValue);

  const grades: TeamGrade[] = values.map(v => {
    const groups = {} as Record<GradePosition, GroupGrade>;
    let overallRatio = 0;
    for (const pos of GRADE_POSITIONS) {
      const med = medians[pos];
      const ratio = med > 0 ? v.groupValue[pos] / med : 0;
      const rank = groupRanks.get(pos)!.get(v.teamId)!;
      groups[pos] = {
        letter: letterForPercentile((n - rank + 1) / n),
        ratio,
        value: v.groupValue[pos],
        rank,
      };
      overallRatio += ratio * GROUP_WEIGHTS[pos];
    }
    const benchRatio = benchMedian > 0 ? v.benchValue / benchMedian : 0;
    const benchRank = benchRanks.get(v.teamId)!;
    // No bench depth anywhere (rosters exactly at starter size): no signal,
    // so grade it C ("league average") rather than ranking noise.
    const bench: GroupGrade =
      benchMedian <= 0
        ? { letter: 'C', ratio: 1, value: v.benchValue, rank: 1 }
        : {
            letter: letterForPercentile((n - benchRank + 1) / n),
            ratio: benchRatio,
            value: v.benchValue,
            rank: benchRank,
          };
    overallRatio += (benchMedian <= 0 ? 1 : benchRatio) * BENCH_WEIGHT;

    const entries: Array<[GradePosition | 'Bench', number]> = [
      ...GRADE_POSITIONS.map(p => [p, groups[p].ratio] as [GradePosition, number]),
      ['Bench' as const, benchRatio],
    ];
    const sorted = [...entries].sort((a, b) => b[1] - a[1]);

    return {
      teamId: v.teamId,
      teamName: v.teamName,
      groups,
      bench,
      overall: letterForRatio(overallRatio),
      overallRatio,
      strength: sorted[0][0],
      weakness: sorted[sorted.length - 1][0],
    };
  });

  // Best roster first.
  return grades.sort((a, b) => b.overallRatio - a.overallRatio);
}
