// Projected playoff bracket from the Playoff Race's mean projected seeds.
//
// TraderApe already simulates 10,000 seasons and prices each team's mean
// playoff seed (see playoffOdds.ts). The bracket is a free by-product: pair
// the projected seeds into the rounds a real bracket would use, favor the
// higher seed in each matchup, and leave later-round slots as
// "winner of ..." placeholders. It answers "who plays whom in the
// playoffs" — the Playoff Race table only ever said "who gets in".

export interface BracketSlot {
  /** 1-based projected seed; 0 for a not-yet-decided winner slot. */
  seed: number;
  name: string;
  teamId: string | null;
}

export interface BracketMatchup {
  slotA: BracketSlot;
  slotB: BracketSlot;
  /** teamId of the favored side (the higher seed), null when unknown. */
  favoredTeamId: string | null;
}

export interface BracketRound {
  label: string;
  matchups: BracketMatchup[];
}

/** Minimal view of a PlayoffRaceEntry — the bracket only needs seeds. */
export interface BracketSeedSource {
  teamId: string;
  teamName: string;
  projectedSeed: number;
  playoffProb: number;
  wins: number;
}

function orderedSeeds(
  entries: BracketSeedSource[],
  spots: number,
): BracketSeedSource[] {
  return entries
    .filter(e => e.playoffProb > 0)
    .sort(
      (a, b) =>
        a.projectedSeed - b.projectedSeed ||
        b.playoffProb - a.playoffProb ||
        b.wins - a.wins,
    )
    .slice(0, Math.max(0, spots));
}

function seeded(entry: BracketSeedSource, seed: number): BracketSlot {
  return { seed, name: entry.teamName, teamId: entry.teamId };
}

function tbd(source: string): BracketSlot {
  return { seed: 0, name: `Winner of ${source}`, teamId: null };
}

function versus(m: BracketMatchup): string {
  const a = m.slotA.seed > 0 ? `${m.slotA.seed}` : '?';
  const b = m.slotB.seed > 0 ? `${m.slotB.seed}` : '?';
  return `${a} vs ${b}`;
}

function matchup(slotA: BracketSlot, slotB: BracketSlot): BracketMatchup {
  const favoredTeamId =
    slotA.teamId !== null &&
    slotB.teamId !== null &&
    slotA.seed > 0 &&
    slotB.seed > 0 &&
    slotA.seed !== slotB.seed
      ? slotA.seed < slotB.seed
        ? slotA.teamId
        : slotB.teamId
      : null;
  return { slotA, slotB, favoredTeamId };
}

/**
 * Build the projected playoff bracket. Seeds come from the Playoff Race's
 * mean projected seeds; teams with 0% playoff odds never enter the bracket.
 * Later rounds show "winner of ..." slots because individual playoff games
 * are not simulated. Returns no rounds when fewer than two teams qualify.
 */
export function buildPlayoffBracket(
  entries: BracketSeedSource[],
  spots: number,
): BracketRound[] {
  const seeds = orderedSeeds(entries, spots);
  if (seeds.length < 2) return [];
  const n = seeds.length;
  const S = (i: number): BracketSlot => seeded(seeds[i], i + 1);

  if (n === 2) {
    return [{ label: 'Final', matchups: [matchup(S(0), S(1))] }];
  }

  if (n === 4) {
    const semi1 = matchup(S(0), S(3));
    const semi2 = matchup(S(1), S(2));
    return [
      { label: 'Semifinals', matchups: [semi1, semi2] },
      {
        label: 'Final',
        matchups: [matchup(tbd(versus(semi1)), tbd(versus(semi2)))],
      },
    ];
  }

  if (n === 6) {
    const qf1 = matchup(S(2), S(5));
    const qf2 = matchup(S(3), S(4));
    return [
      { label: 'Quarterfinals', matchups: [qf1, qf2] },
      {
        label: 'Semifinals',
        matchups: [
          matchup(S(0), tbd(versus(qf2))),
          matchup(S(1), tbd(versus(qf1))),
        ],
      },
      {
        label: 'Final',
        matchups: [matchup(tbd('Semifinal 1'), tbd('Semifinal 2'))],
      },
    ];
  }

  // Generic bracket for unusual playoff sizes: first round pairs the top
  // seed against the bottom seed, and so on inward.
  const first: BracketMatchup[] = [];
  for (let i = 0; i < Math.floor(n / 2); i++) {
    first.push(matchup(S(i), S(n - 1 - i)));
  }
  return [
    { label: 'First round', matchups: first },
    { label: 'Final', matchups: [matchup(tbd('Match 1'), tbd('Match 2'))] },
  ];
}
