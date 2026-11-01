// GameDayChecklist rendering: items render with checkboxes, toggling
// persists to localStorage under the storage key, persisted state
// restores on mount, and an empty list renders nothing.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameDayChecklist } from './GameDayChecklist';
import type { ChecklistItem } from '@/utils/gameDayChecklist';

const ITEMS: ChecklistItem[] = [
  { kind: 'action', headline: 'Q WR is Questionable and kicks off Sun 1:05pm ET', detail: 'Decide before his kickoff.' },
  { kind: 'done', headline: 'Nothing needs doing before kickoff', detail: 'The lineup is set.' },
];

beforeEach(() => {
  localStorage.clear();
});

describe('GameDayChecklist', () => {
  it('renders nothing with no items', () => {
    const { container } = render(<GameDayChecklist items={[]} storageKey="gdc:test" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each item with a labeled checkbox', () => {
    render(<GameDayChecklist items={ITEMS} storageKey="gdc:test" />);
    expect(screen.getByRole('heading', { name: 'Game-day checklist' })).toBeInTheDocument();
    const box = screen.getByRole('checkbox', { name: 'Q WR is Questionable and kicks off Sun 1:05pm ET' });
    expect(box).not.toBeChecked();
    expect(screen.getByText('Decide before his kickoff.')).toBeInTheDocument();
  });

  it('persists toggles to localStorage and restores them', () => {
    const { unmount } = render(<GameDayChecklist items={ITEMS} storageKey="gdc:test" />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Q WR is Questionable and kicks off Sun 1:05pm ET' }));
    expect(JSON.parse(localStorage.getItem('gdc:test') ?? '[]')).toEqual([
      'Q WR is Questionable and kicks off Sun 1:05pm ET',
    ]);
    unmount();
    render(<GameDayChecklist items={ITEMS} storageKey="gdc:test" />);
    expect(screen.getByRole('checkbox', { name: 'Q WR is Questionable and kicks off Sun 1:05pm ET' })).toBeChecked();
    // The other item's box stays unchecked.
    expect(screen.getByRole('checkbox', { name: 'Nothing needs doing before kickoff' })).not.toBeChecked();
  });

  it('survives corrupt storage without crashing', () => {
    localStorage.setItem('gdc:test', 'not-json{');
    render(<GameDayChecklist items={ITEMS} storageKey="gdc:test" />);
    expect(screen.getByRole('checkbox', { name: 'Q WR is Questionable and kicks off Sun 1:05pm ET' })).not.toBeChecked();
  });
});
