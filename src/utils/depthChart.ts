// NFL Depth Charts (backlog item 116): every NFL team's QB/RB/WR/TE depth
// ladder in one place — the league-wide answer to "if the starter goes down,
// who inherits the job, and is he on waivers or on a rival's bench". The
// Handcuff Report covers RBs only and the Injury Report covers next-men-up
// per injured player; this is the full ladder for every position. Orderings
// come from the bundled pool's Sleeper depth-chart order (falling back to
// positional rank, same as the Handcuff Report), and ownership resolves
// against the loaded league where one exists (a neutral, owner-free list in
// guest mode). FantasyPros' depth charts page was researched for the feature
// shape only; nothing here copies its content.

import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { canonicalTeam } from '@/utils/playerNames';

export const DEPTH_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type DepthPosition = (typeof DEPTH_POSITIONS)[number];

export interface DepthPlayer {
  player: PoolPlayer;
  owner: string | null;
}

export interface DepthTeam {
  nflTeam: string;
  positions: Record<DepthPosition, DepthPlayer[]>;
}

export interface DepthChartInput {
  pool: DraftPoolFile;
  /** League mode: pool player id -> owning fantasy team name. Absent in guest mode. */
  ownerByPoolId?: Map<string, string>;
}

// Sleeper depth-chart order first (1 = starter), positional rank as the
// fallback when the pool carries no depth-chart data for the player.
export function depthOrder(a: PoolPlayer, b: PoolPlayer): number {
  return (
    (a.depthChartOrder ?? 99) - (b.depthChartOrder ?? 99) || a.posRank - b.posRank
  );
}

// One entry per NFL team with at least one skill-position player in the
// pool, teams alphabetical, each position ladder in depth order. Free agents
// and non-skill positions (K/DST, covered by the streamer boards) are out.
export function buildDepthChart(input: DepthChartInput): DepthTeam[] {
  const ownerByPoolId = input.ownerByPoolId ?? new Map<string, string>();
  const byTeam = new Map<string, PoolPlayer[]>();
  for (const p of input.pool.players) {
    if (!(DEPTH_POSITIONS as readonly string[]).includes(p.pos)) continue;
    const team = canonicalTeam(p.team);
    if (!team || team === 'FA') continue;
    const list = byTeam.get(team) ?? [];
    list.push(p);
    byTeam.set(team, list);
  }
  const teams: DepthTeam[] = [];
  for (const [nflTeam, players] of byTeam) {
    const positions = {} as Record<DepthPosition, DepthPlayer[]>;
    for (const pos of DEPTH_POSITIONS) {
      positions[pos] = players
        .filter(p => p.pos === pos)
        .sort(depthOrder)
        .map(player => ({
          player,
          owner: ownerByPoolId.get(player.id) ?? null,
        }));
    }
    teams.push({ nflTeam, positions });
  }
  teams.sort((a, b) => a.nflTeam.localeCompare(b.nflTeam));
  return teams;
}
