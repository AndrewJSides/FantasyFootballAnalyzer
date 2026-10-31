// Roster-hole / bye-week / injury-out warnings for team pages.
//
// For each of the next few weeks (current week through three ahead, clipped
// to the regular season), the optimal lineup is run twice: once with the
// full roster and once with every player on a bye that week removed — plus,
// for the current week, every player ruled Out or season-ending removed.
// A slot that loses its starter with no bench cover is a "hole"; a slot
// that loses its starter but has cover is a "bye-watch" (or an injury gap
// when the cause is injury). Each alert names the roster players
// unavailable at that slot and the top available (unrostered) pool players
// at the eligible positions who could fill the gap.
//
// Injury designations are current-week knowledge only: a player listed Out
// this week is treated as unavailable for this week's scan, and a
// season-ending designation (IR) rules him out for every remaining scanned
// week. Questionable/Doubtful players stay eligible — they are game-time
// decisions, covered by the Late-swap watch on Start/Sit.
//
// Nothing here sets lineups or claims players: it is guidance only.

import type { League, Player, RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import { currentWeekEstimate } from './matchupRating';
import {
  optimalLineup,
  slotEligiblePositions,
  normalizeLineupPos,
  type OptimalLineupPlayer,
} from './optimalLineup';
import { DEFAULT_ROSTER_SLOTS } from './projectedRoster';
import { injuryTier, type InjurySeverityTier } from './injuryReport';

export type RosterAlertSeverity = 'hole' | 'bye-watch';

export type RosterAlertCause = 'bye' | 'injury';

export interface RosterAlert {
  week: number;
  // Slot types affected, e.g. ['RB'] or ['RB', 'RB'] when both RB slots are empty.
  slots: string[];
  eligible: string[];
  severity: RosterAlertSeverity;
  cause: RosterAlertCause;
  // Roster players at the eligible positions who are on bye this week.
  onBye: PoolPlayer[];
  // Roster players at the eligible positions ruled out by injury this week.
  outInjured: PoolPlayer[];
  // Who fills the first affected slot instead (bye-watch only).
  cover: PoolPlayer | null;
  // Top available (unrostered, not on bye this week) pool players at the
  // eligible positions, by bundled-pool full-PPR projection.
  fillers: PoolPlayer[];
}

// How far ahead the scan looks. Three weeks is the actionable window: this
// week's waivers plus two more claims before the problem arrives.
const LOOKAHEAD_WEEKS = 3;

// Regular season ends before the playoffs; never scan playoff weeks.
function regularSeasonEnd(league: League): number {
  return league.playoffStartWeek ? Math.max(1, league.playoffStartWeek - 1) : 18;
}

export function alertWeeks(league: League): number[] {
  const start = league.currentWeek ?? currentWeekEstimate();
  const end = Math.min(regularSeasonEnd(league), start + LOOKAHEAD_WEEKS);
  const weeks: number[] = [];
  for (let w = Math.max(1, start); w <= end; w++) weeks.push(w);
  return weeks;
}

interface ScoredRosterPlayer extends OptimalLineupPlayer {
  bye: number | null;
  injury: InjurySeverityTier;
  pool: PoolPlayer;
}

// Injury designations are current-week knowledge: a player listed Out is
// unavailable for this week's scan only, while a season-ending designation
// (IR etc.) rules him out for every remaining scanned week.
// Questionable/Doubtful are game-time decisions and stay eligible here.
function outForWeek(tier: InjurySeverityTier, week: number, currentWeek: number): boolean {
  if (tier === 'season-ending') return true;
  return tier === 'out' && week === currentWeek;
}

function scoreRoster(team: Team, pool: DraftPoolFile): ScoredRosterPlayer[] {
  const index = indexPool(pool);
  const out: ScoredRosterPlayer[] = [];
  for (const p of (team.roster ?? []) as Player[]) {
    const resolved = resolvePoolPlayer(p, index);
    if (!resolved) continue;
    out.push({
      id: resolved.id,
      name: resolved.name,
      position: normalizeLineupPos(resolved.pos),
      // Season-long projection: the point here is slot coverage, not the
      // exact pecking order, and this is the one league-independent number
      // every pool player has.
      score: resolved.projPtsPpr ?? 0,
      bye: resolved.bye ?? null,
      injury: injuryTier(resolved),
      pool: resolved,
    });
  }
  return out;
}

export function teamRosterAlerts(
  league: League,
  team: Team,
  pool: DraftPoolFile = POOL,
): RosterAlert[] {
  const slots: RosterSlots = league.rosterSlots ?? DEFAULT_ROSTER_SLOTS;
  const roster = scoreRoster(team, pool);
  if (roster.length === 0) return [];

  // The available pool: every team roster's resolved ids, so fillers are
  // genuinely unowned in this league.
  const index = indexPool(pool);
  const rostered = new Set<string>();
  for (const t of league.teams) {
    for (const p of (t.roster ?? []) as Player[]) {
      const resolved = resolvePoolPlayer(p, index);
      if (resolved) rostered.add(resolved.id);
    }
  }

  const alerts: RosterAlert[] = [];
  const currentWeek = league.currentWeek ?? currentWeekEstimate();

  for (const week of alertWeeks(league)) {
    const unavailable = (p: ScoredRosterPlayer): boolean =>
      p.bye === week || outForWeek(p.injury, week, currentWeek);
    const full = optimalLineup(roster, slots);
    const active = optimalLineup(
      roster.filter(p => !unavailable(p)),
      slots,
    );
    // Collapse duplicate slot types (two RB slots with the same fate read as
    // one alert, with the count, instead of two identical lines).
    const groups = new Map<string, RosterAlert>();
    full.starters.forEach((assigned, i) => {
      const slot = assigned.slot;
      const activeAssigned = active.starters[i]?.player ?? null;
      const starter = assigned.player as ScoredRosterPlayer | null;
      const starterOnBye = starter !== null && starter.bye === week;
      const starterOut =
        starter !== null && outForWeek(starter.injury, week, currentWeek);
      // Only absence-driven gaps: a slot the full roster already leaves
      // empty is a roster-construction issue, not a weekly warning.
      if (!starterOnBye && !starterOut) return;
      const cause: RosterAlertCause = starterOut ? 'injury' : 'bye';

      const key = `${activeAssigned === null ? 'hole' : 'watch'}:${cause}:${slot}`;
      let alert = groups.get(key);
      if (!alert) {
        const eligible = [...slotEligiblePositions(slot)];
        const onBye = roster.filter(
          p => eligible.includes(p.position) && p.bye === week,
        );
        const outInjured = roster.filter(
          p => eligible.includes(p.position) && outForWeek(p.injury, week, currentWeek),
        );
        const fillers = pool.players
          .filter(
            p =>
              eligible.includes(normalizeLineupPos(p.pos)) &&
              !rostered.has(p.id) &&
              (p.bye ?? null) !== week &&
              // A filler who is out himself is no rescue (injury status is
              // only known for the current week, so filter there).
              !(week === currentWeek && outForWeek(injuryTier(p), week, currentWeek)) &&
              typeof p.projPtsPpr === 'number' &&
              p.projPtsPpr > 0,
          )
          .sort((a, b) => (b.projPtsPpr ?? 0) - (a.projPtsPpr ?? 0))
          .slice(0, 3);
        alert = {
          week,
          slots: [],
          eligible,
          severity: activeAssigned === null ? 'hole' : 'bye-watch',
          cause,
          onBye: onBye.map(p => p.pool),
          outInjured: outInjured.map(p => p.pool),
          cover: (activeAssigned as ScoredRosterPlayer | null)?.pool ?? null,
          fillers,
        };
        groups.set(key, alert);
        alerts.push(alert);
      }
      alert.slots.push(slot);
    });
  }

  return alerts.sort((a, b) => a.week - b.week || a.slots[0].localeCompare(b.slots[0]));
}
