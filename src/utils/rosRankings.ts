// Rest-of-Season Rankings (backlog item 21): rank every startable QB/RB/WR/TE
// by TraderApe's own season-outlook engine — projected points from the
// current week through week 17. FantasyPros, Yahoo, and ESPN all publish
// "rest of season" ranks (researched for feature shape only); these are
// computed from TraderApe's own data (bundled pool, weekly shape, league
// rosters), no copied content.
//
// League mode blends each drafted player's scoring pace with his season
// projection (the same engine as Compare + draft grades) and flags
// ownership; guest mode degrades to pure season projections on a default
// 10-team full-PPR shape with no ownership.

import type { DraftPick, GamesPlayed, League, Player, RosterSlots, ScoringType } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { WeeklyShapeFile } from '@/types/weeklyShape';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import { DEFAULT_ROSTER_SLOTS } from './draftDefaults';
import { seasonOutlooks, type SeasonOutlook } from './seasonOutlook';

export const ROS_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type RosPosition = (typeof ROS_POSITIONS)[number];

/** pool player id -> owning fantasy team name, league mode only. */
export function leagueOwnerMap(league: League, pool: DraftPoolFile): Map<string, string> {
  const index = indexPool(pool);
  const owners = new Map<string, string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p as Player, index);
      if (resolved) owners.set(resolved.id, team.name);
    }
  }
  return owners;
}

export interface RosRow {
  player: PoolPlayer;
  outlook: SeasonOutlook;
  /** League mode: owning fantasy team name; null when on waivers. Absent in guest mode. */
  owner: string | null;
  /** 1-based rank within his position, priced on the same context. */
  posRank: number;
}

export interface RosBuildInput {
  pool: DraftPoolFile;
  shape: WeeklyShapeFile | undefined;
  scoring: ScoringType;
  slots?: RosterSlots;
  teamCount?: number;
  currentWeek: number;
  season?: number;
  passTdPoints?: number;
  tePremiumPerReception?: number;
  gamesPlayed?: GamesPlayed;
  platform?: League['platform'];
  /** Real league draft picks: pace + points-so-far blend in league mode. */
  picks?: DraftPick[];
  ownerByPoolId?: Map<string, string>;
  /** Rows per position; default 40. */
  maxPerPosition?: number;
}

function syntheticPick(player: PoolPlayer, n: number): DraftPick {
  return {
    pickNumber: n,
    round: 0,
    player: {
      id: player.id,
      platformId: '',
      name: player.name,
      position: player.pos,
      team: player.team,
    } as Player,
    teamId: '',
    teamName: '',
    seasonPoints: 0,
  };
}

export function buildRosRankings(input: RosBuildInput): RosRow[] {
  const maxPerPosition = input.maxPerPosition ?? 40;
  const index = indexPool(input.pool);

  const realPicks = input.picks ?? [];
  // Pool ids already covered by a real pick: skip the synthetic so no player
  // appears twice (platform player ids differ from pool ids).
  const covered = new Set<string>();
  const poolIdByPickKey = new Map<string, string>();
  for (const pick of realPicks) {
    const resolved = resolvePoolPlayer(pick.player, index);
    if (!resolved) continue;
    covered.add(resolved.id);
    poolIdByPickKey.set(`${pick.player.position}-${pick.player.id}`, resolved.id);
  }

  const picks: DraftPick[] = [...realPicks];
  let n = 0;
  for (const p of input.pool.players) {
    if (!ROS_POSITIONS.includes(p.pos as RosPosition)) continue;
    if (covered.has(p.id)) continue;
    picks.push(syntheticPick(p, ++n));
    poolIdByPickKey.set(`${p.pos}-${p.id}`, p.id);
  }

  const outlooks = seasonOutlooks(
    picks,
    input.pool,
    input.shape,
    {
      scoring: input.scoring,
      slots: input.slots ?? DEFAULT_ROSTER_SLOTS,
      teamCount: input.teamCount ?? 10,
      currentWeek: input.currentWeek,
      season: input.season,
      extras: {
        passTdPoints: input.passTdPoints,
        tePremiumPerReception: input.tePremiumPerReception,
      },
      gamesPlayed: input.gamesPlayed,
      platform: input.platform,
    },
  );

  const owners = input.ownerByPoolId ?? new Map<string, string>();
  // Outlook keys use the pick's (possibly platform-specific) player id; map
  // back to pool ids so each pool player resolves to exactly one outlook.
  const outlookKeyByPoolId = new Map<string, string>();
  for (const [key, poolId] of poolIdByPickKey) {
    if (!outlookKeyByPoolId.has(poolId)) outlookKeyByPoolId.set(poolId, key);
  }
  const rows: RosRow[] = [];
  for (const p of input.pool.players) {
    if (!ROS_POSITIONS.includes(p.pos as RosPosition)) continue;
    const key = outlookKeyByPoolId.get(p.id);
    const outlook = key ? outlooks.get(key) : undefined;
    if (!outlook) continue;
    rows.push({ player: p, outlook, owner: owners.get(p.id) ?? null, posRank: 0 });
  }

  const out: RosRow[] = [];
  for (const pos of ROS_POSITIONS) {
    const atPos = rows
      .filter(r => r.player.pos === pos)
      .sort(
        (a, b) =>
          b.outlook.projectedPoints - a.outlook.projectedPoints ||
          a.player.overallRank - b.player.overallRank,
      )
      .slice(0, maxPerPosition);
    atPos.forEach((r, i) => {
      r.posRank = i + 1;
    });
    out.push(...atPos);
  }
  return out;
}
