// Late-swap watch for the Start/Sit page (backlog item 35).
//
// In most season-long leagues a starter locks at HIS kickoff, not at the
// week's first game — so the question "can I still swap out my Questionable
// starter" depends on whether anyone on the bench plays LATER. This builds
// the plain-language alerts from TraderApe's own data: the optimal lineup,
// the bench, each NFL team's kickoff (gameTimes.ts), and the bundled pool's
// injury designations. Guidance only — nothing moves lineups.

import { gameKickoff, isGameTimeDecision } from '@/utils/gameTimes';
import { normalizeLineupPos, slotEligiblePositions } from '@/utils/optimalLineup';

export interface WatchPlayer {
  name: string;
  position: string;
  nflTeam: string;
  /** Lineup slot (starters only), e.g. "RB", "FLEX". */
  slot?: string;
  /** Sleeper injury designation, e.g. "Questionable", from the bundled pool. */
  injuryStatus?: string | null;
}

export interface SwapAlert {
  kind: 'risk' | 'insurance';
  headline: string;
  detail: string;
}

export interface LateSwapInputs {
  starters: WatchPlayer[];
  bench: WatchPlayer[];
  week: number | undefined;
}

export function lateSwapAlerts({ starters, bench, week }: LateSwapInputs): SwapAlert[] {
  const alerts: SwapAlert[] = [];
  if (week === undefined) return alerts;

  const withKickoff = <T extends WatchPlayer>(ps: T[]) =>
    ps
      .map(p => ({ ...p, kickoff: gameKickoff(p.nflTeam, week) }))
      .filter(p => p.kickoff !== null) as (T & {
      kickoff: NonNullable<ReturnType<typeof gameKickoff>>;
    })[];

  const startersK = withKickoff(starters);
  const benchK = withKickoff(bench);
  if (startersK.length === 0) return alerts;

  // 1. Game-time decisions: a Questionable/Doubtful starter can only be
  //    rescued by a same-slot-eligible bench player kicking off LATER.
  for (const s of startersK) {
    if (!isGameTimeDecision(s.injuryStatus)) continue;
    const slot = s.slot ?? normalizeLineupPos(s.position).toUpperCase();
    const eligibleBench = benchK.filter(b => {
      const pos = normalizeLineupPos(b.position).toUpperCase();
      return (
        slotEligiblePositions(slot).includes(pos) && b.kickoff.rank > s.kickoff.rank
      );
    });
    if (eligibleBench.length > 0) {
      const names = eligibleBench.map(b => `${b.name} (${b.kickoff.slot})`).join(', ');
      alerts.push({
        kind: 'risk',
        headline: `${s.name} is ${s.injuryStatus} and kicks off ${s.kickoff.label}`,
        detail: `A late scratch can still be swapped: ${names} ${eligibleBench.length === 1 ? 'kicks' : 'kick'} off later and ${eligibleBench.length === 1 ? 'is' : 'are'} slot-eligible.`,
      });
    } else {
      alerts.push({
        kind: 'risk',
        headline: `${s.name} is ${s.injuryStatus} and kicks off ${s.kickoff.label}`,
        detail:
          'No same-slot bench player kicks off later — once he locks, the call is final. Decide before his kickoff.',
      });
    }
  }

  // 2. Swap insurance: bench players whose games start after at least one
  //    starter has locked. Keep one free — they are the only live options
  //    once Sunday's early window is over.
  const earliestStarter = Math.min(...startersK.map(s => s.kickoff.rank));
  const latePieces = benchK.filter(b => b.kickoff.rank > earliestStarter);
  if (latePieces.length > 0) {
    const latest = latePieces.reduce((a, b) => (a.kickoff.rank > b.kickoff.rank ? a : b));
    alerts.push({
      kind: 'insurance',
      headline: `Late-swap insurance: ${latePieces.map(b => `${b.name} (${b.kickoff.slot})`).join(', ')}`,
      detail: `${latest.name} stays swappable until ${latest.kickoff.label} — keep one of these free as your last move.`,
    });
  }

  return alerts;
}
