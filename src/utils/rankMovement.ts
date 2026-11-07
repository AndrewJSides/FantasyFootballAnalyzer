// Rank movement on the Weekly Rankings board (backlog item 181): how far
// each player climbed or fell in TraderApe's own positional ranking vs
// last week's board. FantasyPros' weekly rankings + "trending up/down"
// columns track the same movers week over week (researched for feature
// shape only); the numbers here are TraderApe's own model, no copied
// content. Movement is per position (posRank), never the interleaved
// ALL-view index: a WR who goes WR12 -> WR9 is up 3 even if his board
// row sits elsewhere. A player who wasn't in last week's top 40 at the
// position — usually a bye-week return — is 'new', not a mover.
import type { WeeklyRankRow } from '@/utils/weeklyRankings';

export type RankMovementKind = 'up' | 'down' | 'same' | 'new';

export interface RankMovement {
  kind: RankMovementKind;
  /** Spots climbed (positive) or fell (negative); 0 for held / new. */
  delta: number;
  /** 1-based positional rank on last week's board; null when new. */
  previousRank: number | null;
  /** 1-based positional rank on this week's board. */
  currentRank: number;
}

/**
 * Compare this week's board against last week's, keyed by pool player id.
 * Both boards must be the same position's ranking (buildWeeklyRankings
 * output, top 40 per position); rows missing from the previous board are
 * new entries.
 */
export function rankMovements(
  current: WeeklyRankRow[],
  previous: WeeklyRankRow[],
): Map<string, RankMovement> {
  const prevRank = new Map(previous.map(r => [r.player.id, r.posRank]));
  const out = new Map<string, RankMovement>();
  for (const row of current) {
    const prev = prevRank.get(row.player.id);
    if (prev === undefined) {
      out.set(row.player.id, {
        kind: 'new',
        delta: 0,
        previousRank: null,
        currentRank: row.posRank,
      });
      continue;
    }
    const delta = prev - row.posRank;
    out.set(row.player.id, {
      kind: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
      delta,
      previousRank: prev,
      currentRank: row.posRank,
    });
  }
  return out;
}

/** Plain-language label for a movement cell (hover + screen-reader name). */
export function movementLabel(m: RankMovement, pos: string): string {
  switch (m.kind) {
    case 'up':
      return `Up ${m.delta} spot${m.delta === 1 ? '' : 's'} at ${pos} vs last week (was ${pos}${m.previousRank}, now ${pos}${m.currentRank})`;
    case 'down':
      return `Down ${-m.delta} spot${m.delta === -1 ? '' : 's'} at ${pos} vs last week (was ${pos}${m.previousRank}, now ${pos}${m.currentRank})`;
    case 'same':
      return `Held at ${pos}${m.currentRank} vs last week`;
    case 'new':
      return `New to the ${pos} top 40 this week`;
  }
}
