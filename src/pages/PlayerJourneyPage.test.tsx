// PlayerJourneyPage weekly matchup chip (backlog item 2 remainder): the
// selected player shows the same favorable/tough/neutral matchup chip as the
// Rankings, Start/Sit, and Trade Analyzer pages, priced on the league's
// current week, with a method footnote; K/DST and bye-week players get a
// dim dash instead.

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player, Team } from '@/types';
import { PlayerJourneyPage } from './PlayerJourneyPage';

function player(overrides: Partial<Player>): Player {
  return {
    id: 'p1',
    platformId: 'p1',
    name: 'Pack Runner',
    position: 'RB',
    team: 'GB',
    ...overrides,
  };
}

function team(overrides: Partial<Team> = {}): Team {
  return { id: 't1', name: 'The Pack', ...overrides };
}

function league(players: Player[], currentWeek?: number): League {
  const t = team({
    roster: players,
    draftPicks: players.map((p, i) => ({
      pickNumber: i + 1,
      round: 1,
      player: p,
      teamId: 't1',
    })),
  });
  return {
    id: 'l1',
    platform: 'sleeper',
    name: 'Test League',
    season: 2026,
    draftType: 'snake',
    teams: [t],
    scoringType: 'ppr',
    totalTeams: 12,
    currentWeek,
    isLoaded: true,
  };
}

function renderPage(leagueData: League) {
  return render(
    <MemoryRouter>
      <PlayerJourneyPage league={leagueData} />
    </MemoryRouter>,
  );
}

// Week 8 in the bundled 2026 schedule: GB visits CAR, so a GB player faces
// CAR in week 8.
const WEEK = 8;

describe('Player Journey matchup chip', () => {
  it('shows the week-N opponent chip for the selected player', () => {
    renderPage(league([player({})], WEEK));
    fireEvent.click(
      screen.getByRole('button', { name: /Show Pack Runner's journey/i }),
    );
    // The stat card labels its week explicitly.
    const label = screen.getByText(`Week ${WEEK} Matchup`);
    const card = label.closest('div');
    expect(card).not.toBeNull();
    // GB's week-8 opponent is CAR.
    const chip = within(card as HTMLElement).getByText(/^vs CAR · /);
    expect(chip.getAttribute('title')).toContain('CAR allows');
    expect(chip.getAttribute('aria-label')).toContain('CAR allows');
    // Method footnote names the week and the completed-weeks range behind
    // the bundled allowed averages (weeks 1–7).
    expect(
      screen.getByText(/Matchup prices on week 8/, { selector: 'p' }),
    ).toHaveTextContent(/completed weeks 1–7/);
  });

  it('shows a dim dash for positions the rating does not cover', () => {
    renderPage(league([player({ position: 'K', team: 'GB' })], WEEK));
    fireEvent.click(
      screen.getByRole('button', { name: /Show Pack Runner's journey/i }),
    );
    expect(
      screen.getByLabelText(/No matchup rating — bye week or position not covered/i),
    ).toHaveTextContent('-');
  });

  it('shows a dim dash when the league has no current week and the estimate has no game', () => {
    // No league.currentWeek -> falls back to currentWeekEstimate(); a bogus
    // team never matches a schedule game, so the chip is a dash. The label
    // still names the priced week.
    renderPage(league([player({ team: 'ZZZ' })]));
    fireEvent.click(
      screen.getByRole('button', { name: /Show Pack Runner's journey/i }),
    );
    expect(
      screen.getByLabelText(/No matchup rating — bye week or position not covered/i),
    ).toHaveTextContent('-');
  });
});
