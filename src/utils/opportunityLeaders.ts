// Opportunity Share Leaders board (backlog item 108).
//
// Per-position (RB/WR/TE) opportunity-share leaders over the last 3
// completed weeks — the season-long "how much of this offense runs
// through him" reference board. A touch is a carry or a target, and the
// share is the player's touches over his own NFL team's touches in the
// same weeks. Distinct from Target Share (item 107), which prices passing
// volume only, and from Snap Leaders (item 104), which ranks by snap
// share: the board ranks everyone, rostered or not, purely by touch
// share. Pure NFL data (Sleeper's free public weekly stats: rush_att +
// rec_tgt against the team-touches denominator Opportunity Watch
// exports), no league needed, so guests get the full board like the
// /targets page.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import { teamTouchesByWeek } from '@/utils/opportunityWatch';

export const OPPORTUNITY_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type OpportunityPosition = (typeof OPPORTUNITY_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const OPPORTUNITY_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_OPPORTUNITY_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface OpportunityLeader {
  player: PoolPlayer;
  /** Opportunity share over the recent window (0..1). */
  opportunityShare: number;
  /** Touches (carries + targets) per game over the recent window. */
  touchesPerGame: number;
  /** Carries per game over the recent window. */
  carriesPerGame: number;
  /** Targets per game over the recent window. */
  targetsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface OpportunityLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position opportunity-share leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games, ranked by
 * opportunity share descending (ties broken by touches per game), top 15
 * per position. Players without a team (or whose team recorded no touches
 * in the window) can't be priced and are skipped. Returns a Map keyed by
 * position; positions with no leaders are absent.
 */
export function buildOpportunityLeaders(
  input: OpportunityLeadersInput,
): Map<OpportunityPosition, OpportunityLeader[]> {
  const touchesByWeek = teamTouchesByWeek(
    input.poolPlayers,
    input.usageBySleeperId,
  );

  const out = new Map<OpportunityPosition, OpportunityLeader[]>();
  for (const pos of OPPORTUNITY_POSITIONS) {
    const rows: OpportunityLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      if (!p.team) continue;
      const teamWeeks = touchesByWeek.get(p.team.toUpperCase());
      if (!teamWeeks) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < OPPORTUNITY_MIN_GAMES) continue;

      const touches = entries.reduce(
        (s, e) => s + e.line.rushAtt + e.line.targets,
        0,
      );
      const teamTouches = entries.reduce(
        (s, e) => s + (teamWeeks.get(e.week) ?? 0),
        0,
      );
      if (teamTouches <= 0) continue;
      const carries = entries.reduce((s, e) => s + e.line.rushAtt, 0);
      const targets = entries.reduce((s, e) => s + e.line.targets, 0);
      rows.push({
        player: p,
        opportunityShare: round1((touches / teamTouches) * 100) / 100,
        touchesPerGame: round1(touches / entries.length),
        carriesPerGame: round1(carries / entries.length),
        targetsPerGame: round1(targets / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.opportunityShare - a.opportunityShare ||
        b.touchesPerGame - a.touchesPerGame,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_OPPORTUNITY_LEADERS));
  }
  return out;
}
