// RB Handcuff Report (backlog item 17): the league-wide version of
// FantasyPros' Handcuff Report, built from TraderApe's own data. A handcuff is
// the direct backup to an NFL team's lead running back — the player who
// inherits the starting job if the lead misses time. Handcuffs are derived
// from the bundled pool's Sleeper depth-chart order (falling back to
// positional rank), priced on Sleeper full-PPR season projections, and
// ownership resolves against the loaded league where one exists (a neutral,
// owner-free list in guest mode). FantasyPros' handcuff report was researched
// for the feature shape only; nothing here copies its rankings or content.

import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { canonicalTeam } from '@/utils/playerNames';

export type HandcuffStatus =
  | 'secured' // the handcuff sits on the same fantasy team as the lead back
  | 'available' // the handcuff is on no league roster: a waiver target
  | 'rival-held' // another fantasy team already owns the handcuff
  | 'unknown'; // no league rosters (guest mode) — ownership not listed

export interface HandcuffRow {
  nflTeam: string;
  lead: PoolPlayer;
  handcuff: PoolPlayer;
  leadOwner: string | null;
  handcuffOwner: string | null;
  status: HandcuffStatus;
}

// The lead back and his direct backup for one NFL team. Prefers Sleeper
// depth-chart order (1 = starter, 2 = backup); falls back to positional rank
// when the pool carries no depth-chart data for the team. Returns null when
// the team has fewer than two rosterable RBs.
export function leadAndHandcuff(
  teamPlayers: PoolPlayer[]
): { lead: PoolPlayer; handcuff: PoolPlayer } | null {
  const rbs = teamPlayers.filter(p => p.pos === 'RB');
  if (rbs.length < 2) return null;
  const byDepth = [...rbs].sort(
    (a, b) =>
      (a.depthChartOrder ?? 99) - (b.depthChartOrder ?? 99) || a.posRank - b.posRank
  );
  const lead = byDepth[0];
  const handcuff = byDepth.find(p => p.id !== lead.id);
  if (!handcuff) return null;
  return { lead, handcuff };
}

export interface HandcuffReportInput {
  pool: DraftPoolFile;
  /** League mode: pool player id -> owning fantasy team name. Absent in guest mode. */
  ownerByPoolId?: Map<string, string>;
}

// One row per NFL team with a lead back and a direct backup. Sorted by the
// lead back's overall rank (best backfields first).
export function buildHandcuffReport(input: HandcuffReportInput): HandcuffRow[] {
  const ownerByPoolId = input.ownerByPoolId ?? new Map<string, string>();
  const hasRosters = ownerByPoolId.size > 0;
  const byTeam = new Map<string, PoolPlayer[]>();
  for (const p of input.pool.players) {
    const team = canonicalTeam(p.team);
    if (!team || team === 'FA') continue;
    const list = byTeam.get(team) ?? [];
    list.push(p);
    byTeam.set(team, list);
  }
  const rows: HandcuffRow[] = [];
  for (const [nflTeam, players] of byTeam) {
    const pair = leadAndHandcuff(players);
    if (!pair) continue;
    const leadOwner = ownerByPoolId.get(pair.lead.id) ?? null;
    const handcuffOwner = ownerByPoolId.get(pair.handcuff.id) ?? null;
    const status: HandcuffStatus = !hasRosters
      ? 'unknown'
      : handcuffOwner === null
        ? 'available'
        : leadOwner !== null && leadOwner === handcuffOwner
          ? 'secured'
          : 'rival-held';
    rows.push({
      nflTeam,
      lead: pair.lead,
      handcuff: pair.handcuff,
      leadOwner,
      handcuffOwner,
      status,
    });
  }
  return rows.sort((a, b) => a.lead.overallRank - b.lead.overallRank);
}
