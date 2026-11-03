// GameLog (backlog item 112): opponent + points per completed week.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameLog } from './GameLog';

describe('GameLog', () => {
  it('renders opponent and points per week, with a dash for no recorded points', () => {
    render(
      <GameLog
        playerName="Test Player"
        team="SEA"
        weekly={{ 1: 24.5, 3: 12 }}
        toWeek={3}
      />,
    );
    const table = screen.getByRole('table');
    expect(table).toHaveAccessibleName(
      "Test Player's completed weeks, weeks 1–3",
    );
    // Week 1: SEA hosted NE in the bundled 2026 schedule.
    expect(screen.getByRole('row', { name: /W1 NE 24\.5/ })).toBeInTheDocument();
    // Week 2: SEA at ARI, but no points recorded — a dash, not a zero.
    expect(
      screen.getByRole('row', { name: /W2 ARI.*no points recorded/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /W3 WAS 12\.0/ })).toBeInTheDocument();
  });

  it('labels a bye week explicitly', () => {
    // CAR sits out week 5 in the bundled 2026 schedule.
    render(
      <GameLog playerName="Test Player" team="CAR" weekly={{ 1: 10 }} toWeek={5} />,
    );
    expect(
      screen.getByRole('row', { name: /W5 Bye.*bye week/ }),
    ).toBeInTheDocument();
  });

  it('hides when there is nothing to log', () => {
    const { container: noTeam } = render(
      <GameLog playerName="Test Player" team={null} weekly={{ 1: 10 }} toWeek={3} />,
    );
    expect(noTeam).toBeEmptyDOMElement();
    const { container: noWeeks } = render(
      <GameLog playerName="Test Player" team="SEA" weekly={{ 1: 10 }} toWeek={0} />,
    );
    expect(noWeeks).toBeEmptyDOMElement();
  });
});
