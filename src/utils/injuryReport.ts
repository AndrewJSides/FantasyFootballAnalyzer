// League Injury Report (backlog item 18): the league-wide version of
// FantasyPros/Yahoo/ESPN's injury report, built from TraderApe's own data.
// The bundled pool already carries Sleeper injury designations (refreshed
// twice daily); Rankings and Values show a tag per player, but nothing
// answered "which players are hurt and who owns them". This lists every
// startable QB/RB/WR/TE with a current injury designation, worst first,
// resolving ownership against the loaded league where one exists (a neutral,
// owner-free list in guest mode). FantasyPros' injury report was researched
// for the feature shape only (designation-based list, severity-first order);
// nothing here copies its content or write-ups.

import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { injuryOf } from '@/utils/seasonOutlook';
import { canonicalTeam } from '@/utils/playerNames';

export const INJURY_REPORT_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

export type InjurySeverityTier = 'season-ending' | 'out' | 'doubtful' | 'questionable' | 'other';

export interface InjuryRow {
  player: PoolPlayer;
  tier: InjurySeverityTier;
  /** Human label for the tier: "Season-ending", "Out", "Doubtful", "Questionable", or the raw status. */
  tierLabel: string;
  /** e.g. "Hamstring" or "Knee - ACL (surgery)" — empty when the pool has no detail. */
  detail: string;
  /** League mode: owning fantasy team name, or null when the player is on no roster. Absent in guest mode. */
  owner: string | null;
  /**
   * The next man up: the direct backup who would inherit the starting job if
   * this player is his NFL team's depth-chart leader at his position (per
   * Sleeper depth-chart order with a positional-rank fallback — the same
   * pairing the Handcuff Report uses for RBs, generalized to QB/WR/TE).
   * Null for non-leaders, for positions with no pair, and when the team has
   * no depth-chart data. Shown regardless of the backup's own health — the
   * backup's own row shows its designation.
   */
  replacement: PoolPlayer | null;
  /**
   * League mode: the fantasy team owning the replacement, or null when the
   * replacement is a free agent. Null in guest mode (no rosters to resolve).
   */
  replacementOwner: string | null;
}

export interface InjuryReportInput {
  pool: DraftPoolFile;
  /** League mode: pool player id -> owning fantasy team name. Absent in guest mode. */
  ownerByPoolId?: Map<string, string>;
}

const TIER_ORDER: Record<InjurySeverityTier, number> = {
  'season-ending': 0,
  out: 1,
  doubtful: 2,
  questionable: 3,
  other: 4,
};

// Only designations that matter for fantasy: season-ending and out-now from
// Sleeper's injuryOf classifier, then the two game-time designations. Every
// other status (NA, DNR, unrecognized) sorts last.
export function injuryTier(player: PoolPlayer): InjurySeverityTier {
  const info = injuryOf(player);
  if (!info) return 'other';
  if (info.seasonEnding) return 'season-ending';
  if (info.outNow) return 'out';
  const status = player.injuryStatus ?? '';
  if (status.toLowerCase() === 'doubtful') return 'doubtful';
  if (status.toLowerCase() === 'questionable') return 'questionable';
  return 'other';
}

export function injuryTierLabel(player: PoolPlayer, tier: InjurySeverityTier): string {
  switch (tier) {
    case 'season-ending':
      return 'Season-ending';
    case 'out':
      return 'Out';
    case 'doubtful':
      return 'Doubtful';
    case 'questionable':
      return 'Questionable';
    default:
      return player.injuryStatus ?? 'Unknown';
  }
}

// The depth-chart leader and his direct backup at one position for one NFL
// team. Prefers Sleeper depth-chart order (1 = starter, 2 = backup); falls
// back to positional rank when the pool carries no depth-chart data.
// Returns null when the team has fewer than two players at the position.
// (The Handcuff Report's leadAndHandcuff is this same shape for RBs.)
export function leadAndBackup(
  teamPlayers: PoolPlayer[],
  pos: string
): { lead: PoolPlayer; backup: PoolPlayer } | null {
  const group = teamPlayers.filter(p => p.pos === pos);
  if (group.length < 2) return null;
  const byDepth = [...group].sort(
    (a, b) =>
      (a.depthChartOrder ?? 99) - (b.depthChartOrder ?? 99) || a.posRank - b.posRank
  );
  const lead = byDepth[0];
  const backup = byDepth.find(p => p.id !== lead.id);
  if (!backup) return null;
  return { lead, backup };
}

// Worst-first, then by overall rank so the stars sit on top of each tier.
export function buildInjuryReport(input: InjuryReportInput): InjuryRow[] {
  const ownerByPoolId = input.ownerByPoolId ?? new Map<string, string>();
  // Leader/backup pairs per NFL team per position, computed once so the
  // next-man-up column reuses one pairing per team.
  const byTeam = new Map<string, PoolPlayer[]>();
  for (const p of input.pool.players) {
    const team = canonicalTeam(p.team);
    if (!team || team === 'FA') continue;
    const list = byTeam.get(team) ?? [];
    list.push(p);
    byTeam.set(team, list);
  }
  const pairByTeamPos = new Map<string, { lead: PoolPlayer; backup: PoolPlayer }>();
  const pairFor = (team: string | null, pos: string) => {
    if (!team || team === 'FA') return null;
    const key = `${team}|${pos}`;
    if (!pairByTeamPos.has(key)) {
      const pair = leadAndBackup(byTeam.get(team) ?? [], pos);
      if (pair) pairByTeamPos.set(key, pair);
    }
    return pairByTeamPos.get(key) ?? null;
  };

  const rows: InjuryRow[] = [];
  for (const player of input.pool.players) {
    if (!INJURY_REPORT_POSITIONS.includes(player.pos as (typeof INJURY_REPORT_POSITIONS)[number])) continue;
    if (!player.injuryStatus) continue;
    const tier = injuryTier(player);
    const notes = player.injuryNotes ? ` (${player.injuryNotes})` : '';
    const detail = player.injuryBodyPart ? `${player.injuryBodyPart}${notes}` : notes.replace(/^ \(|\)$/g, '');
    const pair = pairFor(canonicalTeam(player.team), player.pos);
    const replacement = pair && pair.lead.id === player.id ? pair.backup : null;
    rows.push({
      player,
      tier,
      tierLabel: injuryTierLabel(player, tier),
      detail,
      owner: ownerByPoolId.get(player.id) ?? null,
      replacement,
      replacementOwner: replacement ? ownerByPoolId.get(replacement.id) ?? null : null,
    });
  }
  return rows.sort(
    (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.player.overallRank - b.player.overallRank
  );
}
