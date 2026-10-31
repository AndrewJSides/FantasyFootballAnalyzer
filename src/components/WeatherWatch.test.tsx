// WeatherWatch rendering: a successful forecast fetch renders flagged
// outdoor games with affected starters; calm weather renders the all-clear
// line; a failed fetch hides the section; undefined week renders nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WeatherWatch } from './WeatherWatch';

function hourlyPayload(over: Partial<Record<string, number[]>> = {}) {
  const times: string[] = [];
  for (let h = 0; h < 48; h++) {
    const d = new Date(Date.UTC(2026, 10, 1, h, 0, 0));
    times.push(d.toISOString().slice(0, 16));
  }
  return {
    hourly: {
      time: times,
      temperature_2m: times.map(() => 55),
      precipitation_probability: times.map(() => 0),
      wind_speed_10m: times.map(() => 5),
      wind_gusts_10m: times.map(() => 8),
      ...over,
    },
  };
}

function mockFetchWith(payload: (lat: string[]) => unknown[]) {
  return vi.fn().mockImplementation(async (url: string) => {
    const lats = new URL(url).searchParams.get('latitude')?.split(',') ?? [];
    return { ok: true, json: async () => payload(lats) };
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WeatherWatch', () => {
  it('renders flagged outdoor games with affected starters', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchWith(lats =>
        lats.map(() => ({
          hourly: {
            time: ['2026-11-01T17:00'],
            temperature_2m: [55],
            precipitation_probability: [10],
            wind_speed_10m: [22],
            wind_gusts_10m: [30],
          },
        })),
      ),
    );
    render(
      <WeatherWatch
        week={8}
        starters={[{ name: 'Lamar Jackson', nflTeam: 'BAL' }]}
        cacheTtlMs={0}
      />,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Weather watch' })).toBeInTheDocument());
    // BAL @ BUF is an outdoor week-8 game; both teams' players named.
    expect(screen.getByText(/BAL @ BUF/)).toBeInTheDocument();
    expect(screen.getByText(/Your starters in this game: Lamar Jackson/)).toBeInTheDocument();
    // Ford Field (DET) is a dome — never flagged.
    expect(screen.queryByText(/Ford Field/)).not.toBeInTheDocument();
  });

  it('renders the all-clear line when nothing is flagged', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchWith(lats =>
        lats.map(() => hourlyPayload()),
      ),
    );
    render(<WeatherWatch week={8} starters={[]} cacheTtlMs={0} />);
    await waitFor(() => expect(screen.getByText(/No weather concerns/)).toBeInTheDocument());
  });

  it('hides the section when the forecast fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { container } = render(<WeatherWatch week={8} starters={[]} cacheTtlMs={0} />);
    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Weather watch' })).not.toBeInTheDocument();
  });

  it('renders nothing without a week', () => {
    const { container } = render(<WeatherWatch week={undefined} starters={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
