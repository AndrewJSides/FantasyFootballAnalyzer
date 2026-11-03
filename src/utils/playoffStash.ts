// Playoff stash board (backlog item 111): rank the available skill players
// by how soft their fantasy-playoff schedule is — the "stash him NOW
// because his W15–17 slate is easy" answer. Same engine as the per-player
// playoff SOS (rosSchedule.ts item 19): each opponent's season-to-date
// allowed-vs-position rank, averaged over the league's playoff weeks.
// Rank 1 = allows the most points (easiest matchup), so a lower average
// rank means a softer playoff slate. Implemented from TraderApe's own data
// (bundled 2026 NFL schedule + allowed-vs-position averages); no new data
// source, no copied content. Guidance only — nothing here moves a roster.

import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { AllowedFile, ScheduleFile } from './matchupRating';
import {
  playoffScheduleStrength,
  type RosScheduleStrength,
} from './rosSchedule';

export interface PlayoffStashRow {
  player: PoolPlayer;
  strength: RosScheduleStrength;
}

/**
 * Rank unrostered skill players (QB/RB/WR/TE) by softest fantasy-playoff
 * schedule: lowest average opponent allowed-vs-position rank first, ties
 * broken by player name. K/DST, players with no playoff-week game carrying
 * allowed data, and rostered players are skipped. Guest mode passes an
 * empty rostered set, so every pool player is eligible.
 */
export function rankPlayoffStash(
  pool: DraftPoolFile,
  rosteredPlayerIds: ReadonlySet<string>,
  playoffWeeks: number[],
  limit = 10,
  schedule?: ScheduleFile,
  allowed?: AllowedFile,
): PlayoffStashRow[] {
  const rows: PlayoffStashRow[] = [];
  for (const player of pool.players) {
    if (rosteredPlayerIds.has(player.id)) continue;
    const strength = playoffScheduleStrength(
      player.team,
      player.pos,
      playoffWeeks,
      schedule,
      allowed,
    );
    if (!strength) continue;
    rows.push({ player, strength });
  }
  rows.sort(
    (a, b) =>
      a.strength.avgRank - b.strength.avgRank ||
      a.player.name.localeCompare(b.player.name),
  );
  return rows.slice(0, Math.max(0, limit));
}
