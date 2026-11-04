// Rest-of-season rank lookup for the Player Journey pane (backlog item
// 127): the pane shows a player's history, and this answers "what's left"
// by joining the viewed player to the ROS Rankings engine's rows (item 21).
// The join is the existing matchPlayer helper (normalized name, suffix- and
// punctuation-insensitive, team as tiebreaker), restricted to the player's
// own position first so a same-name player at another position can never
// stand in for him. Returns null for K/DST and unresolvable players, so
// the pane card hides instead of guessing.

import { basePosition, matchPlayer } from './playerNames';
import type { RosRow } from './rosRankings';

export interface RosLookupPlayer {
  name: string;
  position: string;
  team: string;
}

export function findPlayerRosRow(
  rows: RosRow[],
  player: RosLookupPlayer,
): RosRow | null {
  const pos = basePosition(player.position);
  const atPos = rows.filter(r => basePosition(r.player.pos) === pos);
  const found = matchPlayer(
    { name: player.name, pos: player.position, team: player.team },
    atPos.map(r => ({
      row: r,
      name: r.player.name,
      pos: r.player.pos,
      team: r.player.team,
    })),
  );
  return found?.row ?? null;
}

/** Compact rank label for the stat card, e.g. "RB12". */
export function rosRankLabel(row: RosRow): string {
  return `${row.player.pos}${row.posRank}`;
}

/** Plain-language detail for the card's hover text and aria-label. */
export function rosRankDetail(row: RosRow, fromWeek: number): string {
  return (
    `Projected ${row.outlook.projectedPoints.toFixed(1)} points from week ` +
    `${fromWeek} through week 17, ranked ${row.posRank} among ${row.player.pos}s`
  );
}
