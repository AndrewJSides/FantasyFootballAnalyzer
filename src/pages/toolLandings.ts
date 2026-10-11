// Content for the static tool landing pages (trade analyzer, draft grades).
// Kept separate from the ToolLanding component so that file only exports a
// component (react-refresh) and so the prerender can import the data without
// pulling in anything else. See src/pages/ToolLanding.tsx and
// scripts/prerender.tsx.

export interface ToolLandingCta {
  // Route path without the base (e.g. '' for home, 'rankings').
  to: string;
  label: string;
  primary?: boolean;
}

export interface ToolLandingContent {
  // dist/<path>/index.html, also the in-app route.
  path: string;
  title: string;
  desc: string;
  kicker: string;
  heading: string;
  intro: string;
  points: Array<{ h: string; p: string }>;
  ctas: ToolLandingCta[];
}

export const TOOL_LANDINGS: Record<'trade-analyzer' | 'draft-grades', ToolLandingContent> = {
  'trade-analyzer': {
    path: 'trade-analyzer',
    title: 'Fantasy Football Trade Analyzer (Free): Sleeper, ESPN, Yahoo',
    desc:
      'Free fantasy football trade analyzer for Sleeper, ESPN, and Yahoo. ' +
      'Grade a trade before you make it with value-over-replacement for your ' +
      'league\'s exact shape, plus roster-aware takes on positional need. No login required.',
    kicker: '▌ PROSPECTIVE TRADE ANALYZER',
    heading: 'Fantasy Football Trade Analyzer',
    intro:
      'Grade a trade before you make it. Pick the players changing hands and ' +
      'get a value-over-replacement verdict computed for your league\'s size, ' +
      'scoring, and roster shape. Connect your Sleeper, ESPN, or Yahoo league ' +
      'for team rosters and roster-aware takes on how the deal hits each ' +
      'team\'s positional depth.',
    points: [
      { h: 'Valued for your league shape', p: 'VOR is computed against replacement level for your teams, scoring, and slots — not a generic chart.' },
      { h: 'Roster-aware takes', p: 'See how each team\'s positional depth and starter quality change, so a paper overpay that fills your hole still grades fairly.' },
      { h: 'Every league, every season', p: 'Works across Sleeper, ESPN, and Yahoo, backed by the consensus board refreshed twice daily.' },
    ],
    ctas: [
      { to: '', label: 'Connect your league', primary: true },
      { to: 'rankings', label: 'Browse rankings' },
    ],
  },
  'draft-grades': {
    path: 'draft-grades',
    title: 'Fantasy Football Draft Grades & Grader (Free): Sleeper, ESPN, Yahoo',
    desc:
      'Free fantasy football draft grades for Sleeper, ESPN, and Yahoo. ' +
      'Grade every pick on actual season production, see who found value and who reached, and run mock drafts. No login.',
    kicker: '▌ DRAFT GRADES',
    heading: 'Fantasy Football Draft Grades',
    intro:
      'See who won your draft based on how the picks actually scored. ' +
      'Connect your Sleeper, ESPN, or Yahoo league for a letter grade on every pick and every team, ' +
      'or run a mock draft first.',
    points: [
      { h: 'Graded on production', p: 'Each pick is scored against what it returned in started games.' },
      { h: 'Team draft leaderboard', p: 'See which manager drafted best, who reached early, and who found value late.' },
      { h: 'Mock first', p: 'Practice snake or auction drafts against AI opponents.' },
    ],
    ctas: [
      { to: '', label: 'Connect your league', primary: true },
      { to: 'draft-room', label: 'Run a mock draft' },
    ],
  },
};
