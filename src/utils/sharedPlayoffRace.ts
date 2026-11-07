// Shared Playoff Race result (backlog item 196 remainder): the Teams page
// and the Start/Sit "My Week" briefing both price the same 10,000-season
// Monte Carlo, so the race is memoized per league snapshot in this module
// instead of re-simmed on every page. The fingerprint covers everything
// playoffRace reads — team records and scoring, the future schedule, the
// playoff size, and the current week — so a changed league recomputes and
// the two pages can never disagree on the same snapshot. Callers must treat
// the returned array as read-only: it is the shared instance. Callers that
// need forced or seeded variants (clinchWatch, Playoff Scenarios) keep
// calling playoffRace directly — this cache is for the plain default run
// only.

import type { League } from '@/types';
import { playoffRace, type PlayoffRaceEntry } from './playoffOdds';

export type PlayoffRaceLeague = Pick<
  League,
  'teams' | 'futureSchedule' | 'playoffTeams' | 'currentWeek'
>;

function raceFingerprint(league: PlayoffRaceLeague): string {
  return JSON.stringify({
    teams: league.teams.map(t => [
      t.id,
      t.name,
      t.wins ?? 0,
      t.losses ?? 0,
      t.ties ?? 0,
      t.pointsFor ?? 0,
    ]),
    schedule: league.futureSchedule ?? [],
    playoffTeams: league.playoffTeams ?? null,
    currentWeek: league.currentWeek ?? null,
  });
}

let cachedFingerprint: string | null = null;
let cachedRace: PlayoffRaceEntry[] | null = null;

/**
 * The Playoff Race for this league snapshot, shared across pages: the
 * first call for a snapshot runs the 10,000-season sim, later calls with
 * the same snapshot return the same array. A league with no future
 * schedule or playoff size returns (and caches) the empty race, so
 * old snapshots and guest mode stay cheap too.
 */
export function getPlayoffRace(league: PlayoffRaceLeague): PlayoffRaceEntry[] {
  const fingerprint = raceFingerprint(league);
  if (fingerprint === cachedFingerprint && cachedRace !== null) {
    return cachedRace;
  }
  const race = playoffRace(league);
  cachedFingerprint = fingerprint;
  cachedRace = race;
  return race;
}

/** Test-only: drop the memoized result so the next call re-sims. */
export function __resetPlayoffRaceCache(): void {
  cachedFingerprint = null;
  cachedRace = null;
}
