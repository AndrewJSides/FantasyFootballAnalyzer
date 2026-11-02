// Shop-a-player (backlog item 90): the reverse trade lookup. The manager
// picks one of their players and the lookup answers "who wants him, and
// what would they send back?" It reuses the existing Trade Finder engine
// wholesale — the candidates are the same win-win swaps findTradeCandidates
// proposes (fair within 25% on VOR, neither team's starting value harmed) —
// filtered to the pairs where the owner's side gives the chosen player and
// re-ranked by the owner's net starter gain, so the best offer for the
// manager floats to the top.
//
// Season-agnostic like the finder: consumes whatever pool season is bundled
// and whatever league is supplied.

import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import {
  DEFAULT_VOR_CONFIG,
  type ValueLeague,
  type VorConfig,
} from './projectionValues';
import {
  findTradeCandidates,
  netStarterChange,
  teamProfiles,
  type TradeCandidate,
} from './tradeFinder';
import { valueLeagueFor } from './tradeAnalysis';

export interface ShopOffer extends TradeCandidate {
  // The team the shopped player belongs to (always the giver of that
  // player in every returned offer).
  ownerTeamId: string;
  // Net change in the owner's starting value (best VOR per position,
  // before → after). Ranking signal: the offer that helps the manager's
  // starters most comes first.
  ownerNetGain: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function shopOffers(
  league: League,
  playerId: string,
  pool: DraftPoolFile = POOL,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
  valueLeague: ValueLeague = valueLeagueFor(league),
): ShopOffer[] {
  if (!playerId) return [];

  // Locate the team that owns the player: scan every profile's depth
  // charts for the pool id.
  const profiles = teamProfiles(league, pool, cfg, valueLeague);
  const owner = profiles.find(p =>
    Object.values(p.positions).some(pos =>
      pos.depthChart.some(pl => pl.id === playerId),
    ),
  );
  if (!owner) return [];

  return findTradeCandidates(league, pool, cfg, valueLeague)
    .map(c => {
      const ownerIsA = c.teamA.id === owner.team.id;
      const ownerIsB = c.teamB.id === owner.team.id;
      if (!ownerIsA && !ownerIsB) return null;
      // The owner must be the one giving the shopped player — an offer to
      // RECEIVE the player back is the opposite lookup.
      const gives = ownerIsA ? c.aGives : c.bGives;
      if (!gives.some(p => p.id === playerId)) return null;
      const impact = ownerIsA
        ? c.analysis.teamAImpact
        : c.analysis.teamBImpact;
      return {
        ...c,
        ownerTeamId: owner.team.id,
        ownerNetGain: round1(netStarterChange(impact)),
      } as ShopOffer;
    })
    .filter((o): o is ShopOffer => o !== null)
    .sort((a, b) => b.ownerNetGain - a.ownerNetGain || b.score - a.score);
}
