// Playoff Scenarios (backlog item 72): the what-if simulator — the manager
// picks W/L results for the team's remaining games and the same Monte Carlo
// that powers the Playoff Race re-runs with those results decided by fiat,
// so "what if we win out?" gets a modeled answer. Competitor concept: the
// NFL "Playoff Machine" tools (ESPN/StickToTheModel/PFSN publish playoff
// machines that recompute the picture from picked winners) — nothing exists
// like it for fantasy leagues, so this is TraderApe's own engine.

import type { League } from '@/types';
import { playoffRace, type PlayoffRaceEntry } from '@/utils/playoffOdds';

/** Week number → the forced result for the scenario team's game that week. */
export type ScenarioPicks = Record<number, 'win' | 'loss'>;

export interface ScenarioRun {
  teamId: string;
  /** How many of the team's remaining games were forced. */
  pickCount: number;
  /** The team's race entry with the forced results applied. */
  entry: PlayoffRaceEntry;
  /** The team's entry from the same-sized unforced run (the comparison base). */
  base: PlayoffRaceEntry;
  /** Playoff probability delta, scenario minus base, in percentage points. */
  oddsDelta: number;
  /** Projected-final-wins delta, scenario minus base. */
  winsDelta: number;
}

export interface ScenarioOptions {
  /** Sims per run (base + scenario). Default 2000 — enough to price a
   *  what-if without the full 10,000-season cost of the Playoff Race. */
  simulations?: number;
  /** Seed for deterministic runs (tests). The scenario run uses seed + 1. */
  seed?: number;
}

type LeagueInput = Pick<
  League,
  'teams' | 'futureSchedule' | 'playoffTeams' | 'currentWeek'
>;

/** One-tap presets: force every remaining week to a win or a loss. */
export function scenarioPreset(
  weeks: number[],
  result: 'win' | 'loss',
): ScenarioPicks {
  const picks: ScenarioPicks = {};
  for (const w of weeks) picks[w] = result;
  return picks;
}

/**
 * Re-sim the rest of the season with the team's picked results forced by
 * fiat and everything else drawn from the Playoff Race's rating model.
 * Returns null when there are no picks, the team is missing, or the
 * league's schedule/playoff size can't be priced.
 */
export function runScenario(
  league: LeagueInput,
  teamId: string,
  picks: ScenarioPicks,
  opts: ScenarioOptions = {},
): ScenarioRun | null {
  const entries = Object.entries(picks);
  if (entries.length === 0) return null;
  const sims = opts.simulations ?? 2000;
  const seed = opts.seed;
  const base = playoffRace(league, { simulations: sims, seed });
  const scenario = playoffRace(league, {
    simulations: sims,
    seed: seed === undefined ? undefined : seed + 1,
    forceResults: entries.map(([week, result]) => ({
      teamId,
      week: Number(week),
      result,
    })),
  });
  const baseEntry = base.find(e => e.teamId === teamId);
  const entry = scenario.find(e => e.teamId === teamId);
  if (!baseEntry || !entry) return null;
  return {
    teamId,
    pickCount: entries.length,
    entry,
    base: baseEntry,
    oddsDelta: Math.round((entry.playoffProb - baseEntry.playoffProb) * 10) / 10,
    winsDelta:
      Math.round((entry.projectedWins - baseEntry.projectedWins) * 10) / 10,
  };
}
