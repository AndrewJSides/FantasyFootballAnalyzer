// Matchup context for the projection backtest (backlog item 1, remainder).
//
// The shipped /start-sit model prices a numeric matchup term: the target
// week's opponent's fantasy points allowed vs the player's position,
// relative to the league average, blended at 50% and capped at ±5.
// To backtest THAT model (not the matchup-free one), the harness must
// reconstruct what the model would have seen for each scored week: the
// opponent in the target week, and the opponent's allowed-vs-position from
// completed weeks ONLY — never the target week or later (no lookahead
// leakage).
//
// Data sources: the bundled ESPN full-season schedule
// (src/data/nflSchedule.2026.json — weeks[week] = [[home, away], ...])
// and Sleeper's free players map + per-week stats, which the backtest
// script already fetches.

import type { MatchupContext } from './weeklyProjection';

/** Position labels the matchup term is defined for. */
export const BACKTEST_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

/** week -> team -> opponent, from the bundled schedule. */
export function buildOpponentMap(
  scheduleWeeks: Record<string, [string, string][]>,
): Record<number, Record<string, string>> {
  const out: Record<number, Record<string, string>> = {};
  for (const [weekStr, games] of Object.entries(scheduleWeeks)) {
    const week = Number(weekStr);
    if (!Number.isInteger(week)) continue;
    const map: Record<string, string> = {};
    for (const [a, b] of games ?? []) {
      if (a && b) {
        map[a] = b;
        map[b] = a;
      }
    }
    out[week] = map;
  }
  return out;
}

export interface SleeperPlayerMeta {
  team?: string;
  position?: string;
}

/**
 * week -> defending team -> position -> fantasy points allowed that week.
 * Allowed = PPR points scored by the opponent's players at that position.
 * Teams on bye get no entry (they neither allowed nor were scored on).
 */
export function buildAllowedByWeek(
  players: Record<string, SleeperPlayerMeta>,
  statsByWeek: Record<number, Record<string, { pts_ppr?: number }>>,
  opponentByWeek: Record<number, Record<string, string>>,
): Record<number, Record<string, Record<string, number>>> {
  const out: Record<number, Record<string, Record<string, number>>> = {};
  for (const [weekStr, stats] of Object.entries(statsByWeek)) {
    const week = Number(weekStr);
    const opp = opponentByWeek[week];
    if (!opp) continue;
    // Seed every team that played with zeros, so a genuine 0-allowed
    // week counts as 0 rather than looking like the team didn't play.
    const allowed: Record<string, Record<string, number>> = {};
    for (const defender of Object.keys(opp)) {
      allowed[defender] = {};
      for (const pos of BACKTEST_POSITIONS) allowed[defender][pos] = 0;
    }
    for (const [playerId, s] of Object.entries(stats)) {
      if (typeof s.pts_ppr !== 'number') continue;
      const meta = players[playerId];
      const team = meta?.team;
      const position = meta?.position;
      if (!team || !position || !BACKTEST_POSITIONS.includes(position as (typeof BACKTEST_POSITIONS)[number])) continue;
      const defender = opp[team];
      if (!defender) continue; // team on bye — no opponent, no allowed line
      const byPos = (allowed[defender] ??= {});
      byPos[position] = (byPos[position] ?? 0) + s.pts_ppr;
    }
    out[week] = allowed;
  }
  return out;
}

/**
 * Build the MatchupContext the model would have seen for `team`'s player at
 * `position` in target `week`: the opponent's points allowed vs that
 * position averaged over weeks 1..week-1 only, plus the league average
 * (all teams that played, same completed-week window). Returns null when
 * there is no usable history (no opponent — bye week — or no completed
 * weeks to average).
 */
export function matchupContextForWeek(
  week: number,
  team: string,
  position: string,
  opponentByWeek: Record<number, Record<string, string>>,
  allowedByWeek: Record<number, Record<string, Record<string, number>>>,
): MatchupContext | null {
  if (!BACKTEST_POSITIONS.includes(position as (typeof BACKTEST_POSITIONS)[number])) return null;
  const opponent = opponentByWeek[week]?.[team];
  if (!opponent) return null;
  let allowedSum = 0;
  let allowedWeeks = 0;
  let leagueSum = 0;
  let leagueSamples = 0;
  for (let w = 1; w < week; w++) {
    const allowed = allowedByWeek[w];
    if (!allowed) continue;
    const oppAllowed = allowed[opponent]?.[position];
    if (typeof oppAllowed === 'number') {
      allowedSum += oppAllowed;
      allowedWeeks += 1;
    }
    for (const byPos of Object.values(allowed)) {
      const v = byPos[position];
      if (typeof v === 'number') {
        leagueSum += v;
        leagueSamples += 1;
      }
    }
  }
  if (allowedWeeks === 0 || leagueSamples === 0) return null;
  return {
    avgAllowed: allowedSum / allowedWeeks,
    leagueAverage: leagueSum / leagueSamples,
    sampleWeeks: allowedWeeks,
  };
}
