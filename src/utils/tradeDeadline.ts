import type { League, Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { PlayoffRaceEntry } from './playoffOdds';
import type { TradeCandidate } from './tradeFinder';

export type DeadlineTier = 'contender' | 'bubble' | 'pretender';
export type DeadlineStanceWord = 'buy' | 'hold' | 'sell';

export interface DeadlineStance {
  team: Team;
  tier: DeadlineTier;
  stance: DeadlineStanceWord;
  /** 0..100, one decimal, from the Playoff Race sims. */
  playoffProb: number;
  rationale: string;
}

/** Contender cutoff on the Playoff Race's modeled playoff probability. */
export const CONTENDER_CUTOFF = 50;
/** Pretender cutoff on the Playoff Race's modeled playoff probability. */
export const PRETENDER_CUTOFF = 15;

/**
 * Classify every team as a contender, bubble team, or pretender from the
 * Playoff Race's modeled playoff probability, and attach the deadline
 * posture: contenders BUY (go all-in on win-now upgrades), bubble teams
 * HOLD (only take clear win-win upgrades), pretenders SELL (flip win-now
 * value for future value). All probabilities are the model's verdict, not
 * league-official.
 */
export function deadlineStances(
  league: League,
  entries: PlayoffRaceEntry[],
): DeadlineStance[] {
  const byId = new Map(entries.map(e => [e.teamId, e]));
  return league.teams.map(team => {
    const entry = byId.get(team.id);
    const prob = entry?.playoffProb ?? 0;
    let tier: DeadlineTier;
    let stance: DeadlineStanceWord;
    let rationale: string;
    if (entry?.playoffStatus === 'clinched' || prob >= CONTENDER_CUTOFF) {
      tier = 'contender';
      stance = 'buy';
      rationale =
        `Modeled ${prob}% to make the playoffs — go all-in: trade depth ` +
        `and future value for win-now starters before the window closes.`;
    } else if (entry?.playoffStatus === 'eliminated' || prob < PRETENDER_CUTOFF) {
      tier = 'pretender';
      stance = 'sell';
      rationale =
        `Modeled ${prob}% to make the playoffs — sell: flip veteran ` +
        `win-now pieces to contenders for younger or higher-upside return.`;
    } else {
      tier = 'bubble';
      stance = 'hold';
      rationale =
        `Modeled ${prob}% to make the playoffs — stand pat unless a deal ` +
        `clearly upgrades the starting lineup; one more loss and this ` +
        `becomes a sell.`;
    }
    return { team, tier, stance, playoffProb: prob, rationale };
  });
}

export interface DeadlineDeal {
  candidate: TradeCandidate;
  contender: Team;
  pretender: Team;
  /** The packages each side would receive in the swap. */
  contenderReceives: PoolPlayer[];
  pretenderReceives: PoolPlayer[];
  framing: string;
}

/**
 * Restrict the Trade Finder's win-win candidates to contender↔pretender
 * pairs — the deadline's natural buyers and sellers — and frame each deal
 * directionally: the contender gets the win-now upgrade, the pretender
 * gets the future-value package. Candidates arrive pre-ranked, so the
 * first maxDeals opposite-tier pairs win.
 */
export function deadlineDeals(
  candidates: TradeCandidate[],
  stances: DeadlineStance[],
  maxDeals = 6,
): DeadlineDeal[] {
  const stanceById = new Map(stances.map(s => [s.team.id, s]));
  const out: DeadlineDeal[] = [];
  for (const c of candidates) {
    const sa = stanceById.get(c.teamA.id);
    const sb = stanceById.get(c.teamB.id);
    if (!sa || !sb) continue;
    const opposite =
      (sa.tier === 'contender' && sb.tier === 'pretender') ||
      (sa.tier === 'pretender' && sb.tier === 'contender');
    if (!opposite) continue;
    const contenderIsA = sa.tier === 'contender';
    const contender = contenderIsA ? c.teamA : c.teamB;
    const pretender = contenderIsA ? c.teamB : c.teamA;
    out.push({
      candidate: c,
      contender,
      pretender,
      contenderReceives: contenderIsA ? c.bGives : c.aGives,
      pretenderReceives: contenderIsA ? c.aGives : c.bGives,
      framing:
        `${contender.name} (contender) buys the win-now upgrade; ` +
        `${pretender.name} (pretender) sells for the future-value package.`,
    });
    if (out.length >= maxDeals) break;
  }
  return out;
}
