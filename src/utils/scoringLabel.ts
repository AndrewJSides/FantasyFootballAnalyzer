// Human label for a scoring type: 'ppr' -> 'PPR', 'half_ppr' -> 'Half PPR'.
// The raw enum value reads lowercase ('ppr', 'half ppr') when rendered
// directly, while every scoring select in the app shows the capitalized
// label — so tooltips and settings rows for a loaded league should use the
// same words. Unknown values (e.g. 'custom') fall back to the old
// replace('_', ' ') form so nothing renders worse than before.
const SCORING_LABEL: Record<string, string> = {
  standard: 'Standard',
  half_ppr: 'Half PPR',
  ppr: 'PPR',
};

export function scoringLabel(scoring: string): string {
  return SCORING_LABEL[scoring] ?? scoring.replace('_', ' ');
}
