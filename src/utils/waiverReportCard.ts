// Waiver Wire Report Card: who is winning the waiver wire. Per team, sums
// TraderApe's own points-above-replacement (PAR) across every waiver and
// free-agent pickup in the synced transactions, names the best and worst
// pickup, and grades the team on the same percentile letter scale as Team
// Grades. Guidance only — nothing here moves rosters.
import type { Team } from '@/types';

export interface WaiverReportCardRow {
  teamId: string;
  teamName: string;
  // Waiver + free-agent transaction count.
  claims: number;
  // Total players added on the wire.
  pickups: number;
  // Summed points-above-replacement across graded pickups, one decimal.
  totalPar: number;
  bestPickup: { name: string; par: number } | null;
  worstPickup: { name: string; par: number } | null;
  grade: string;
}

// Same percentile letter scale as teamGrades' letterForPercentile
// (percentile: 1 = best team, 0 = worst) — kept local so this module stays
// self-contained.
function letterForPercentile(percentile: number): string {
  if (percentile >= 0.97) return 'A+';
  if (percentile >= 0.88) return 'A';
  if (percentile >= 0.79) return 'A-';
  if (percentile >= 0.7) return 'B+';
  if (percentile >= 0.6) return 'B';
  if (percentile >= 0.51) return 'B-';
  if (percentile >= 0.42) return 'C+';
  if (percentile >= 0.32) return 'C';
  if (percentile >= 0.22) return 'C-';
  if (percentile >= 0.12) return 'D';
  return 'F';
}

// Rows before the league-relative grade is attached.
type UngradedRow = Omit<WaiverReportCardRow, 'grade'>;

export function buildWaiverReportCard(teams: Team[]): WaiverReportCardRow[] | null {
  const rows: UngradedRow[] = teams.map(team => {
    const wire = (team.transactions ?? []).filter(
      tx => tx.type === 'waiver' || tx.type === 'free_agent',
    );
    let totalPar = 0;
    let pickups = 0;
    let best: { name: string; par: number } | null = null;
    let worst: { name: string; par: number } | null = null;
    for (const tx of wire) {
      for (const p of tx.adds ?? []) {
        pickups += 1;
        const par = p.pointsAboveReplacement ?? null;
        if (par === null) continue;
        totalPar += par;
        if (!best || par > best.par) best = { name: p.name, par };
        if (!worst || par < worst.par) worst = { name: p.name, par };
      }
    }
    return {
      teamId: team.id,
      teamName: team.name,
      claims: wire.length,
      pickups,
      totalPar: Math.round(totalPar * 10) / 10,
      bestPickup: best,
      worstPickup: worst,
    };
  });

  // No wire activity at all: nothing to grade. Also hide when the sync
  // graded no pickups (old snapshots lack pointsAboveReplacement) — a
  // report card of all zeros would be misinformation, not a grade.
  const anyClaims = rows.some(r => r.claims > 0);
  const anyGraded = rows.some(r => r.bestPickup !== null);
  if (!anyClaims || !anyGraded) return null;

  rows.sort((a, b) => b.totalPar - a.totalPar);
  const n = rows.length;
  return rows.map((r, i) => ({
    ...r,
    grade: letterForPercentile((n - i) / n),
  }));
}
