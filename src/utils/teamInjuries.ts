// Per-owner team injury summary (backlog item 18 remainder): the Teams
// page's answer to "how banged up is each team". Reuses buildInjuryReport's
// rows (worst severity first, startable QB/RB/WR/TE only, Sleeper injury
// designations from the bundled pool), resolves ownership against league
// rosters, and groups the injured per fantasy team — the owner-facing view
// of the Waivers page's League Injury Report, priced from TraderApe's own
// data.

import type { League, Player } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import {
  buildInjuryReport,
  type InjuryRow,
  type InjurySeverityTier,
} from '@/utils/injuryReport';

export interface TeamInjurySummary {
  teamId: string;
  teamName: string;
  /** Injured rostered players, worst severity first (buildInjuryReport order). */
  rows: InjuryRow[];
  /** Worst tier among the team's injured players; null when the team is healthy. */
  worstTier: InjurySeverityTier | null;
}

// Worst-first for sorting summaries, same severity ladder as the report.
const TIER_SEVERITY: Record<InjurySeverityTier, number> = {
  'season-ending': 0,
  out: 1,
  doubtful: 2,
  questionable: 3,
  other: 4,
};

export function buildTeamInjurySummaries(
  league: League,
  pool: DraftPoolFile,
): TeamInjurySummary[] {
  const index = indexPool(pool);
  // Pool player id -> owning fantasy team id. buildInjuryReport's `owner`
  // field is just a string, so team ids ride through and grouping recovers
  // them — no extra row mapping needed.
  const ownerByPoolId = new Map<string, string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p as Player, index);
      if (resolved) ownerByPoolId.set(resolved.id, team.id);
    }
  }

  const byTeam = new Map<string, InjuryRow[]>();
  for (const row of buildInjuryReport({ pool, ownerByPoolId })) {
    // Unrostered injured players stay on the Waivers page's League Injury
    // Report — this table is per-owner.
    if (!row.owner) continue;
    const list = byTeam.get(row.owner) ?? [];
    list.push(row);
    byTeam.set(row.owner, list);
  }

  const summaries = league.teams.map(team => {
    const rows = byTeam.get(team.id) ?? [];
    return {
      teamId: team.id,
      teamName: team.name,
      rows,
      worstTier: rows.length > 0 ? rows[0].tier : null,
    };
  });

  // Worst-hit teams first, then most injuries, then name — matches the
  // league-wide report's severity-first philosophy.
  return summaries.sort(
    (a, b) =>
      (a.worstTier === null ? 99 : TIER_SEVERITY[a.worstTier]) -
        (b.worstTier === null ? 99 : TIER_SEVERITY[b.worstTier]) ||
      b.rows.length - a.rows.length ||
      a.teamName.localeCompare(b.teamName),
  );
}
