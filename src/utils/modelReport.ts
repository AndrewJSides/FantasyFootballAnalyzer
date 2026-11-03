// Model Report Card (backlog item 115) — shapes TraderApe's own weekly
// projection backtest (npm run backtest:projections, Sleeper weekly stats,
// replay uses earlier weeks only) into what the /model-report page renders.
// Pure data logic — the page owns the rendering. The bundled snapshot lives
// in src/data/projectionBacktest.<season>.json and is refreshed by copying
// data/projection-backtests/<season>.json whenever the backtest re-runs.

export interface BacktestScore {
  predictions: number;
  mae: number;
  naiveMae: number;
  bias: number;
  within5Rate: number;
}

export interface PositionReportRow {
  position: string;
  predictions: number;
  mae: number;
  naiveMae: number;
  /** Model MAE minus naive MAE, negative = model wins. */
  maeGap: number;
  verdict: 'leads' | 'ties' | 'trails';
  within5Pct: number;
  bias: number;
}

export interface TermExperiment {
  family: string;
  variants: { name: string; mae: number; isProduction: boolean }[];
}

export interface ModelReport {
  season: number;
  weekRange: string;
  players: number;
  predictions: number;
  mae: number;
  naiveMae: number;
  maeGap: number;
  verdict: 'leads' | 'ties' | 'trails';
  within5Pct: number;
  bias: number;
  generatedAt: string;
  byPosition: PositionReportRow[];
  experiments: TermExperiment[];
}

export interface RawBacktestJson {
  season?: number;
  weeks?: number[];
  players?: number;
  overall?: BacktestScore;
  byPosition?: Record<string, BacktestScore>;
  generatedAt?: string;
  pricingVariants?: { name: string; overall?: { mae: number } }[];
  tdVariants?: { name: string; overall?: { mae: number } }[];
  usageVariants?: { name: string; overall?: { mae: number } }[];
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE'];

/** A gap within half a hundredth is a tie — the scores are rounded to 2dp. */
export function scoreVerdict(mae: number, naiveMae: number): 'leads' | 'ties' | 'trails' {
  const gap = mae - naiveMae;
  if (Math.abs(gap) <= 0.005) return 'ties';
  return gap < 0 ? 'leads' : 'trails';
}

function experiment(
  family: string,
  variants: { name: string; overall?: { mae: number } }[] | undefined,
): TermExperiment {
  return {
    family,
    variants: (variants ?? [])
      .filter(v => Number.isFinite(v.overall?.mae))
      .map(v => ({
        name: v.name,
        mae: v.overall!.mae,
        // The production default for every term family is the no-term
        // variant (measured OFF after each family lost its backtest).
        isProduction: v.name.toLowerCase().startsWith('no term'),
      })),
  };
}

export function summarizeModelReport(raw: RawBacktestJson): ModelReport | null {
  const overall = raw.overall;
  if (!overall || !Number.isFinite(overall.mae) || !Number.isFinite(overall.naiveMae)) {
    return null;
  }
  const weeks = raw.weeks ?? [];
  const byPosition = POSITION_ORDER.filter(pos => raw.byPosition?.[pos]).map(pos => {
    const s = raw.byPosition![pos];
    return {
      position: pos,
      predictions: s.predictions,
      mae: s.mae,
      naiveMae: s.naiveMae,
      maeGap: s.mae - s.naiveMae,
      verdict: scoreVerdict(s.mae, s.naiveMae),
      within5Pct: s.within5Rate * 100,
      bias: s.bias,
    };
  });
  return {
    season: raw.season ?? 0,
    weekRange:
      weeks.length > 0 ? `Weeks ${Math.min(...weeks)}–${Math.max(...weeks)}` : 'Unknown weeks',
    players: raw.players ?? 0,
    predictions: overall.predictions,
    mae: overall.mae,
    naiveMae: overall.naiveMae,
    maeGap: overall.mae - overall.naiveMae,
    verdict: scoreVerdict(overall.mae, overall.naiveMae),
    within5Pct: overall.within5Rate * 100,
    bias: overall.bias,
    generatedAt: raw.generatedAt ?? '',
    byPosition,
    experiments: [
      experiment('Matchup difficulty', raw.pricingVariants),
      experiment('TD regression', raw.tdVariants),
      experiment('Usage trend', raw.usageVariants),
    ],
  };
}

export function verdictLabel(verdict: 'leads' | 'ties' | 'trails'): string {
  return verdict === 'leads' ? 'Beats naive' : verdict === 'ties' ? 'Ties naive' : 'Trails naive';
}
