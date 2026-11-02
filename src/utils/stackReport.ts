// Stack Report (backlog item 92): the classic QB + pass-catcher stack — a
// rostered QB paired with his rostered WR/TE teammates on the same NFL
// team — ranked league-wide by TraderApe's own rest-of-season outlook,
// plus waiver stack-mates (unrostered pass-catchers sharing an NFL team
// with a rostered QB) for teams that want to build or complete a stack.
//
// FantasyPros' stacking guides (researched for feature shape only) call the
// QB/WR stack "the most commonly used and recommended option... the most
// lucrative"; measured week-to-week correlation data (RotoWire, 2026)
// puts QB-WR at +0.31 and QB-TE at +0.27, while QB-RB is +0.07
// ("functionally zero... not a hedge") and WR-WR is -0.02 — so RBs and
// same-position pairs are not counted as stacks. All numbers are
// TraderApe's own; no copied content.
import type { DraftPick, GamesPlayed, League, Player, RosterSlots, ScoringType } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { WeeklyShapeFile } from '@/types/weeklyShape';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import { DEFAULT_ROSTER_SLOTS } from './draftDefaults';
import { canonicalTeam } from './playerNames';
import { seasonOutlooks } from './seasonOutlook';

/** A stack is a QB plus at least one of these on the same NFL team. */
export const STACK_CATCHER_POSITIONS = ['WR', 'TE'] as const;
export type StackCatcherPosition = (typeof STACK_CATCHER_POSITIONS)[number];

/** Max waiver stack-mate rows shown on the page. */
export const MAX_WAIVER_STACK_TARGETS = 8;

export interface StackEntry {
  teamId: string;
  teamName: string;
  /** Canonical NFL team abbreviation, e.g. 'KC'. */
  nflTeam: string;
  qbNames: string[];
  /** Catcher names with position, e.g. 'Worthy (WR)'. */
  catcherNames: string[];
  /** Summed projected rest-of-season points, one decimal. */
  combinedRos: number;
  /** 1-based league-wide rank (1 = best). */
  rank: number;
}

export interface WaiverStackTarget {
  poolId: string;
  name: string;
  pos: StackCatcherPosition;
  nflTeam: string;
  /** Projected rest-of-season points, one decimal. */
  ros: number;
  /** Fantasy team whose rostered QB(s) this player would stack with. */
  qbTeamId: string;
  qbTeamName: string;
  qbNames: string[];
}

export interface StackReport {
  /** Every rostered QB+pass-catcher stack, ranked best first. */
  stacks: StackEntry[];
  /** Unrostered pass-catchers who would complete a stack, best first. */
  waiverTargets: WaiverStackTarget[];
}

export interface StackReportInput {
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

interface RosPlayer {
  pool: PoolPlayer;
  ros: number;
}

/** League-mode stack report, or undefined when the league can't be priced. */
export function buildStackReport(input: StackReportInput): StackReport | undefined {
  const { league, pool, shape } = input;
  const currentWeek = league.currentWeek;
  if (!currentWeek || league.status !== 'live') return undefined;
  if (!league.teams.some(t => (t.roster?.length ?? 0) > 0)) return undefined;

  const scoring = input.scoring ?? league.scoringType ?? 'ppr';
  const slots = input.slots ?? league.rosterSlots ?? DEFAULT_ROSTER_SLOTS;
  const teamCount = input.teamCount ?? league.totalTeams ?? league.teams.length;
  const season = input.season ?? league.season;

  // Real league players as picks for the outlook engine (teamGrades'
  // trick: draft picks carry seasonPoints for the pace blend; roster
  // players with no draft pick are added without points). Uncovered pool
  // QB/WR/TE players get synthetic picks so waiver stack-mates price on
  // the same engine.
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
  for (const pp of pool.players) {
    if (covered.has(pp.id)) continue;
    if (pp.pos !== 'QB' && !(STACK_CATCHER_POSITIONS as readonly string[]).includes(pp.pos)) continue;
    realPicks.push({
      pickNumber: 0,
      round: 0,
      player: { id: pp.id, platformId: pp.id, name: pp.name, position: pp.pos, team: pp.team } as Player,
      teamId: '',
      teamName: '',
      seasonPoints: 0,
    });
    covered.add(pp.id);
    poolIdByPickKey.set(`${pp.pos}-${pp.id}`, pp.id);
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
  const rosByPoolId = new Map<string, number>();
  for (const [poolId, key] of outlookKeyByPoolId) {
    const outlook = outlooks.get(key);
    if (outlook) rosByPoolId.set(poolId, Math.round(outlook.projectedPoints * 10) / 10);
  }

  // Per team: rostered QBs and catchers grouped by canonical NFL team.
  // Only pool-resolved players count, so platform id quirks can't split a
  // stack across two NFL abbreviations.
  const ownerOf = new Map<string, string>();
  const qbsByTeam = new Map<string, Map<string, RosPlayer[]>>();
  const catchersByTeam = new Map<string, Map<string, RosPlayer[]>>();
  for (const team of league.teams) {
    const qbs = new Map<string, RosPlayer[]>();
    const catchers = new Map<string, RosPlayer[]>();
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p as Player, index);
      if (!resolved) continue;
      const ros = rosByPoolId.get(resolved.id);
      if (ros === undefined) continue;
      ownerOf.set(resolved.id, team.id);
      const nfl = canonicalTeam(resolved.team);
      if (resolved.pos === 'QB') {
        const list = qbs.get(nfl) ?? [];
        list.push({ pool: resolved, ros });
        qbs.set(nfl, list);
      } else if ((STACK_CATCHER_POSITIONS as readonly string[]).includes(resolved.pos)) {
        const list = catchers.get(nfl) ?? [];
        list.push({ pool: resolved, ros });
        catchers.set(nfl, list);
      }
    }
    qbsByTeam.set(team.id, qbs);
    catchersByTeam.set(team.id, catchers);
  }

  const stacks: StackEntry[] = [];
  for (const team of league.teams) {
    const qbs = qbsByTeam.get(team.id) ?? new Map<string, RosPlayer[]>();
    const catchers = catchersByTeam.get(team.id) ?? new Map<string, RosPlayer[]>();
    for (const [nfl, qbList] of qbs) {
      const catcherList = catchers.get(nfl);
      if (!catcherList || catcherList.length === 0) continue;
      const combinedRos =
        Math.round((qbList.reduce((s, q) => s + q.ros, 0) + catcherList.reduce((s, c) => s + c.ros, 0)) * 10) / 10;
      stacks.push({
        teamId: team.id,
        teamName: team.name,
        nflTeam: nfl,
        qbNames: qbList.map(q => q.pool.name),
        catcherNames: catcherList.map(c => `${c.pool.name} (${c.pool.pos})`),
        combinedRos,
        rank: 0,
      });
    }
  }
  stacks.sort((a, b) => b.combinedRos - a.combinedRos);
  stacks.forEach((s, i) => {
    s.rank = i + 1;
  });

  // Waiver stack-mates: unrostered pool WR/TE whose NFL team has a rostered
  // QB on some fantasy team. A player is attributed to every QB team whose
  // NFL team matches (a backup QB on the same NFL team still counts).
  const waiverTargets: WaiverStackTarget[] = [];
  for (const pp of pool.players) {
    if (ownerOf.has(pp.id)) continue;
    if (!(STACK_CATCHER_POSITIONS as readonly string[]).includes(pp.pos)) continue;
    const ros = rosByPoolId.get(pp.id);
    if (ros === undefined || ros <= 0) continue;
    const nfl = canonicalTeam(pp.team);
    for (const team of league.teams) {
      const qbList = qbsByTeam.get(team.id)?.get(nfl);
      if (!qbList || qbList.length === 0) continue;
      waiverTargets.push({
        poolId: pp.id,
        name: pp.name,
        pos: pp.pos as StackCatcherPosition,
        nflTeam: nfl,
        ros,
        qbTeamId: team.id,
        qbTeamName: team.name,
        qbNames: qbList.map(q => q.pool.name),
      });
    }
  }
  waiverTargets.sort((a, b) => b.ros - a.ros || a.name.localeCompare(b.name));

  return { stacks, waiverTargets: waiverTargets.slice(0, MAX_WAIVER_STACK_TARGETS) };
}
