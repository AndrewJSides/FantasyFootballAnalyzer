// Safe & Risky Starts of the Week (backlog item 68) — TraderApe's
// league-aware take on the weekly "safe & risky picks" start/sit concept
// (FantasyPros publishes a weekly Safe & Risky Picks article; researched
// Oct 31, 2026 from the public feature description only — their expert
// picks are their research). Here the ranks come from TraderApe's own
// numbers: the consistency engine's Steady/Volatile verdicts (item 20),
// each player's P25–P75 range (item 62), and the weekly matchup difficulty
// (matchupRating). Safe = bankable production; risky = could sink the
// week. Only optimal starters are ranked — benched, bye, and injured-out
// players never appear. Pure data logic — the page owns the rendering.

import type { ScoredPlayer } from './rosterScoring';
import { round1 } from './rosterScoring';
import { consistencySummary } from './consistency';
import { rankPhrase } from './matchupRating';

export interface SafeRiskyPick {
  player: ScoredPlayer;
  /** One-line plain-language reason naming the numbers behind the verdict. */
  reason: string;
}

export interface SafeRiskyPicks {
  safe: SafeRiskyPick[];
  risky: SafeRiskyPick[];
}

/**
 * Rank optimal starters into Safest and Riskiest starts. A player needs a
 * consistency summary (3+ played weeks) to be ranked; without one there is
 * no safe/risky read and the player is skipped. Injured-out and bye
 * players are excluded — the lineup never fields them.
 */
export function safeRiskyPicks(
  starters: ScoredPlayer[],
  weeklyPoints: Record<string, Record<number, number>> | undefined,
  count = 3,
): SafeRiskyPicks {
  const ranked: { player: ScoredPlayer; safeScore: number; riskyScore: number; reason: string }[] =
    [];
  for (const s of starters) {
    if (s.injuredOut || s.onBye) continue;
    const weekly =
      weeklyPoints?.[s.player.platformId] ?? weeklyPoints?.[s.player.id];
    const c = consistencySummary(weekly, s.position);
    if (!c) continue;
    const proj = s.projection?.projection ?? s.ppg ?? 0;
    const spread = c.ceiling - c.floor;
    const tough = s.matchup?.label === 'tough';
    const kind = s.matchup?.label === 'favorable' ? 'favorable' : s.matchup?.label ?? 'neutral';
    const matchupBit = s.matchup
      ? `, ${kind} matchup vs ${s.matchup.opponent} (${rankPhrase(s.matchup.rank)} points allowed to ${s.position}s)`
      : '';
    const steady =
      c.verdict === 'Steady' ? 2 : c.verdict === 'Mixed' ? 1 : 0;
    const volatile =
      c.verdict === 'Volatile' ? 2 : c.verdict === 'Mixed' ? 1 : 0;
    const safeScore =
      steady + (tough ? 0 : 1) + (proj > 0 ? c.floor / proj : 0);
    const riskyScore =
      volatile + (tough ? 1 : 0) + (proj > 0 ? spread / proj : 0);
    const range = `${round1(c.floor)}–${round1(c.ceiling)} pts in ${c.games} weeks`;
    ranked.push({
      player: s,
      safeScore,
      riskyScore,
      reason:
        `${c.verdict === 'Steady' ? 'Steady' : c.verdict === 'Volatile' ? 'Volatile' : 'Up-and-down'}: typical week ${range}${matchupBit}.`,
    });
  }
  const safe = [...ranked]
    .sort((a, b) => b.safeScore - a.safeScore)
    .slice(0, count)
    .map(({ player, reason }) => ({ player, reason }));
  const risky = [...ranked]
    .sort((a, b) => b.riskyScore - a.riskyScore)
    .slice(0, count)
    .map(({ player, reason }) => ({ player, reason }));
  return { safe, risky };
}
