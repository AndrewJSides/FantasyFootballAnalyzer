// Prospective trade analysis: grade a trade BEFORE it happens.
//
// Where tradeVerdict.ts grades completed trades on points actually scored,
// this module values the players changing hands using VOR (value over
// replacement) from projected points, computed for the league's exact shape
// via projectionValues.ts. Season-agnostic: it consumes whatever pool season
// is bundled and whatever league (or manual defaults) is supplied.
//
// The roster-impact half answers the question a raw value grade cannot:
// "I know I'm overpaying on paper — does this still help my starting lineup?"
// It compares each team's positional depth before and after the deal.

import type { League, Player, RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import {
  DEFAULT_VOR_CONFIG,
  vorPoints,
  type ValueLeague,
  type VorConfig,
} from './projectionValues';
import { pickLabel, pickTradeValue, type TradePick } from './pickValueCurve';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import { dynastyValue } from './dynastyValue';

// ---------------------------------------------------------------------------
// League shape
// ---------------------------------------------------------------------------

// Default shape for manual mode (no league loaded): 10-team full PPR, the
// most common redraft shape. Callers with a real league should pass it to
// valueLeagueFor so replacement levels match their actual settings.
export const DEFAULT_MANUAL_SHAPE: RosterSlots = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  SUPERFLEX: 0,
  K: 1,
  DST: 1,
  BENCH: 6,
  IR: 1,
};

export function valueLeagueFor(
  league: League | null | undefined,
  scoringOverride?: ValueLeague['scoring'],
): ValueLeague {
  if (league) {
    return {
      budget: 200,
      teams: league.totalTeams || 10,
      rounds:
        (league.rosterSlots
          ? Object.values(league.rosterSlots).reduce((a, b) => a + (b ?? 0), 0)
          : 16) || 16,
      rosterSlots: league.rosterSlots ?? DEFAULT_MANUAL_SHAPE,
      scoring: scoringOverride ?? league.scoringType ?? 'ppr',
    };
  }
  return {
    budget: 200,
    teams: 10,
    rounds: 16,
    rosterSlots: DEFAULT_MANUAL_SHAPE,
    scoring: scoringOverride ?? 'ppr',
  };
}

// ---------------------------------------------------------------------------
// Player resolution
// ---------------------------------------------------------------------------

// Resolve a mixed bag of league Players and/or pool ids to PoolPlayers.
// Unresolvable players are dropped and reported so the UI can warn.
export interface ResolvedSide {
  players: PoolPlayer[];
  unresolved: string[];
}

export function resolveTradeSide(
  entries: Array<Player | PoolPlayer | string>,
  pool: DraftPoolFile = POOL,
): ResolvedSide {
  const index = indexPool(pool);
  const byId = new Map(pool.players.map(p => [p.id, p]));
  const players: PoolPlayer[] = [];
  const unresolved: string[] = [];
  for (const entry of entries) {
    let resolved: PoolPlayer | undefined;
    let label: string;
    if (typeof entry === 'string') {
      resolved = byId.get(entry);
      label = entry;
    } else if ('platformId' in entry) {
      resolved = resolvePoolPlayer(entry as Player, index);
      label = (entry as Player).name || (entry as Player).id;
    } else {
      resolved = byId.get((entry as PoolPlayer).id);
      label = (entry as PoolPlayer).name || (entry as PoolPlayer).id;
    }
    if (resolved) players.push(resolved);
    else unresolved.push(label);
  }
  return { players, unresolved };
}

// ---------------------------------------------------------------------------
// Trade value comparison
// ---------------------------------------------------------------------------

export interface ValuedPlayer {
  player: PoolPlayer;
  // The mode's per-player value: VOR in redraft mode, the age-adjusted
  // dynasty value (backlog item 182) in dynasty mode. The field keeps its
  // name so every consumer keeps working; the mode on TradeAnalysis says
  // which units a number is in.
  vor: number;
}

// Which value basis prices a deal: redraft value over replacement, or the
// dynasty model's age-adjusted value (backlog item 182).
export type TradeValueMode = 'redraft' | 'dynasty';

// The unit a value-model number is in. 'VOR' is redraft value over
// replacement; 'dynasty pts' is the dynasty model's age-adjusted value.
export type FinderValueUnit = 'VOR' | 'dynasty pts';

// A pricing basis for the finder stack (backlog item 193): a per-player
// value map in one unit, plus the per-position replacement level in the
// same unit — a player at or below it is not startable. Redraft mode is
// VOR with a 0 replacement (VOR is already replacement-subtracted);
// dynasty mode is raw dynasty value with the replacement-ranked dynasty
// value as the line, so need / surplus / startable keep their exact
// redraft semantics and the numbers agree with the analyzer's dynasty
// totals (which price the same raw dynasty values).
export interface ValueModel {
  values: Map<string, number>;
  replacement: Record<PositionKey, number>;
  unit: FinderValueUnit;
}

// A future draft pick on one side of the deal, priced in the same VOR
// points as the players (backlog item 175). A pick never touches the
// roster-impact half — it helps no starting lineup this week — so it only
// ever appears in the value totals and the breakdown rows.
export interface ValuedPick {
  pick: TradePick;
  vor: number;
  label: string;
}

export interface TradeAnalysis {
  sideA: ValuedPlayer[];
  sideB: ValuedPlayer[];
  picksA: ValuedPick[];
  picksB: ValuedPick[];
  sideATotal: number;
  sideBTotal: number;
  // 'A' | 'B' | 'even', from Team A's perspective naming.
  winner: 'A' | 'B' | 'even';
  // Absolute VOR gap between the sides.
  margin: number;
  // Margin as a share of the larger side's value (0-1). Small trades can
  // have big absolute gaps; this keeps "even" calls proportional.
  marginShare: number;
  // Which value basis priced this analysis — the per-player numbers and
  // the totals are in that mode's units (VOR points vs dynasty points).
  valueMode: TradeValueMode;
}

const EVEN_THRESHOLD_SHARE = 0.15;

export function analyzeTradeValue(
  sideA: PoolPlayer[],
  sideB: PoolPlayer[],
  valueLeague: ValueLeague,
  pool: DraftPoolFile = POOL,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
  // Future draft picks per side (backlog item 175). Priced in the same VOR
  // points as the players, so the totals — and the winner — include them.
  picks?: { picksA?: TradePick[]; picksB?: TradePick[] },
  // Dynasty mode (backlog item 182): price each player on the dynasty
  // model's age-adjusted value instead of VOR. Picks are VOR-priced, so
  // they contribute 0 to dynasty totals rather than mixing units.
  opts?: {
    valueMode?: TradeValueMode;
    agesBySleeperId?: Record<string, number>;
  },
): TradeAnalysis {
  const valueMode = opts?.valueMode ?? 'redraft';
  const dynasty =
    valueMode === 'dynasty'
      ? (player: PoolPlayer): number => {
          const proj = player.projPtsPpr ?? player.projPts ?? 0;
          const age = player.sleeperId
            ? (opts?.agesBySleeperId?.[player.sleeperId] ?? null)
            : null;
          return dynastyValue(proj, player.pos, age);
        }
      : null;
  const vor = dynasty ? null : vorPoints(pool.players, valueLeague, cfg);
  const value = (players: PoolPlayer[]): ValuedPlayer[] =>
    players.map(player => ({
      player,
      vor: dynasty ? dynasty(player) : (vor?.get(player.id) ?? 0),
    }));
  const sideAValued = value(sideA);
  const sideBValued = value(sideB);
  const valuePick = (pick: TradePick): ValuedPick => ({
    pick,
    vor: dynasty ? 0 : pickTradeValue(pick, valueLeague, pool, cfg),
    label: pickLabel(pick),
  });
  const picksAValued = (picks?.picksA ?? []).map(valuePick);
  const picksBValued = (picks?.picksB ?? []).map(valuePick);
  const sideATotal = round1(
    sideAValued.reduce((s, v) => s + v.vor, 0) +
      picksAValued.reduce((s, v) => s + v.vor, 0),
  );
  const sideBTotal = round1(
    sideBValued.reduce((s, v) => s + v.vor, 0) +
      picksBValued.reduce((s, v) => s + v.vor, 0),
  );
  const margin = round1(Math.abs(sideATotal - sideBTotal));
  const larger = Math.max(sideATotal, sideBTotal);
  const marginShare = larger > 0 ? margin / larger : 0;
  let winner: TradeAnalysis['winner'] = 'even';
  if (marginShare > EVEN_THRESHOLD_SHARE && larger > 0) {
    winner = sideATotal > sideBTotal ? 'A' : 'B';
  }
  return {
    sideA: sideAValued,
    sideB: sideBValued,
    picksA: picksAValued,
    picksB: picksBValued,
    sideATotal,
    sideBTotal,
    winner,
    margin,
    marginShare: round1(marginShare),
    valueMode,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Roster impact: does the trade help each team's starting lineup?
// ---------------------------------------------------------------------------

export type PositionKey = 'QB' | 'RB' | 'WR' | 'TE';

export interface PositionalDepth {
  position: PositionKey;
  // Players above the replacement line at this position (VOR > 0 in
  // redraft mode, dynasty value above replacement in dynasty mode).
  startableBefore: number;
  startableAfter: number;
  // Best value at this position before/after (the likely starter's value,
  // in the model's units).
  bestBefore: number;
  bestAfter: number;
}

export interface TeamImpact {
  teamId: string;
  teamName: string;
  depth: PositionalDepth[];
  // Short human-readable takes, strongest first.
  takes: string[];
}

// How many starters each position needs, counting flex demand coarsely:
// every FLEX slot is one more starter split across RB/WR/TE, reported as a
// range rather than pretending we know the split.
function starterDemand(slots: RosterSlots): Record<PositionKey, { base: number; flex: number }> {
  const flex = slots.FLEX ?? 0;
  return {
    QB: { base: slots.QB ?? 0, flex: 0 },
    RB: { base: slots.RB ?? 0, flex },
    WR: { base: slots.WR ?? 0, flex },
    TE: { base: slots.TE ?? 0, flex },
  };
}

function posKey(pos: string): PositionKey | null {
  const p = pos.toUpperCase();
  if (p === 'QB' || p === 'RB' || p === 'WR' || p === 'TE') return p;
  return null;
}

export function analyzeTeamImpact(
  team: Team,
  outgoing: PoolPlayer[],
  incoming: PoolPlayer[],
  valueLeague: ValueLeague,
  pool: DraftPoolFile = POOL,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
  // Dynasty mode (backlog item 193): price the depth math on the caller's
  // value model instead of redraft VOR, so the "starter upgraded /
  // downgraded" takes and the startable counts are in the same units as
  // the verdict totals. Without it the impact half stays redraft VOR,
  // exactly as before.
  valueModel?: ValueModel,
): TeamImpact {
  const index = indexPool(pool);
  const values = valueModel?.values ?? vorPoints(pool.players, valueLeague, cfg);
  const replacement = valueModel?.replacement;
  const unit = valueModel?.unit ?? 'VOR';
  const demand = starterDemand(valueLeague.rosterSlots);

  // Current roster as pool players (best effort; unresolvable players are
  // invisible to the depth math and noted in takes).
  const rosterPool: PoolPlayer[] = [];
  let unmapped = 0;
  for (const p of team.roster ?? []) {
    const resolved = resolvePoolPlayer(p, index);
    if (resolved) rosterPool.push(resolved);
    else unmapped += 1;
  }

  const outIds = new Set(outgoing.map(p => p.id));
  const afterPool = rosterPool.filter(p => !outIds.has(p.id)).concat(incoming);

  const depth: PositionalDepth[] = (['QB', 'RB', 'WR', 'TE'] as PositionKey[]).map(
    position => {
      const before = rosterPool.filter(p => posKey(p.pos) === position);
      const after = afterPool.filter(p => posKey(p.pos) === position);
      const vorOf = (p: PoolPlayer) => values.get(p.id) ?? 0;
      // Startable means above the replacement line in the model's units
      // (VOR > 0 in redraft mode, dynasty value above the replacement
      // dynasty value in dynasty mode).
      const startable = (list: PoolPlayer[]) =>
        list.filter(p => vorOf(p) > (replacement?.[position] ?? 0)).length;
      const best = (list: PoolPlayer[]) =>
        list.reduce((m, p) => Math.max(m, vorOf(p)), 0);
      return {
        position,
        startableBefore: startable(before),
        startableAfter: startable(after),
        bestBefore: round1(best(before)),
        bestAfter: round1(best(after)),
      };
    },
  );

  const takes: string[] = [];
  for (const d of depth) {
    const need = demand[d.position];
    const slots = need.base + (need.flex > 0 ? 1 : 0);
    if (d.bestAfter > d.bestBefore + 0.5) {
      takes.push(
        `${d.position} starter upgraded (${d.bestBefore} → ${d.bestAfter} ${unit}) — fills a need`,
      );
    } else if (d.bestAfter < d.bestBefore - 0.5) {
      takes.push(
        `${d.position} starter downgraded (${d.bestBefore} → ${d.bestAfter} ${unit})`,
      );
    }
    if (d.startableAfter < slots && d.startableBefore >= slots) {
      takes.push(
        `${d.position} depth drops below starter demand (${d.startableAfter} startable for ~${slots} slots)`,
      );
    } else if (d.startableAfter < d.startableBefore && d.startableAfter >= slots) {
      takes.push(
        `${d.position} thins out (${d.startableBefore} → ${d.startableAfter} startable) but still covers demand`,
      );
    }
  }
  if (unmapped > 0) {
    takes.push(
      `${unmapped} rostered player${unmapped === 1 ? '' : 's'} couldn't be matched to rankings and ${unmapped === 1 ? 'was' : 'were'} excluded from depth math`,
    );
  }
  return { teamId: team.id, teamName: team.name, depth, takes };
}

// ---------------------------------------------------------------------------
// Combined result
// ---------------------------------------------------------------------------

export interface FullTradeAnalysis extends TradeAnalysis {
  teamAImpact?: TeamImpact;
  teamBImpact?: TeamImpact;
}

export function analyzeTrade(
  sideA: PoolPlayer[],
  sideB: PoolPlayer[],
  opts: {
    valueLeague: ValueLeague;
    teamA?: Team;
    teamB?: Team;
    pool?: DraftPoolFile;
    cfg?: VorConfig;
    picksA?: TradePick[];
    picksB?: TradePick[];
    valueMode?: TradeValueMode;
    agesBySleeperId?: Record<string, number>;
    // Dynasty mode (backlog item 193): the finder passes its value model
    // so the roster-impact half prices in the same units as the verdict
    // totals. Without it the impacts stay redraft VOR, as before.
    valueModel?: ValueModel;
  },
): FullTradeAnalysis {
  const pool = opts.pool ?? POOL;
  const cfg = opts.cfg ?? DEFAULT_VOR_CONFIG;
  const value = analyzeTradeValue(sideA, sideB, opts.valueLeague, pool, cfg, {
    picksA: opts.picksA,
    picksB: opts.picksB,
  }, {
    valueMode: opts.valueMode,
    agesBySleeperId: opts.agesBySleeperId,
  });
  const teamAImpact = opts.teamA
    ? analyzeTeamImpact(opts.teamA, sideA, sideB, opts.valueLeague, pool, cfg, opts.valueModel)
    : undefined;
  const teamBImpact = opts.teamB
    ? analyzeTeamImpact(opts.teamB, sideB, sideA, opts.valueLeague, pool, cfg, opts.valueModel)
    : undefined;
  return { ...value, teamAImpact, teamBImpact };
}
