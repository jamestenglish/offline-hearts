import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { useEquity } from './useEquity';
import { EquityChart } from './EquityChart';

type Points = ReturnType<typeof useEquity>;
const point = (phase: string, shares: number[] | null, processed = 0, total = 0, error: string | null = null) =>
  ({ key: phase, shares, processed, total, error });
const players = [{ seat: 1, name: 'Ann' }, { seat: 3, name: 'Bo' }];

it('charts completed streets with exact accessible table values and distinct player series', () => {
  const points: Points = {
    preflop: point('preflop', [0.625, 0.375], 80, 80),
    flop: point('flop', [1, 0], 12, 12),
    turn: point('turn', [0.5, 0.5], 4, 4),
    river: point('river', [0.75, 0.25], 1, 1),
  };
  render(<EquityChart players={players} points={points} />);
  const chart = screen.getByRole('img', { name: /equity/i });
  expect(chart).toHaveAttribute('viewBox', '0 0 360 180');
  for (const phase of ['Preflop', 'Flop', 'Turn', 'River']) expect(within(chart).getByText(phase)).toBeInTheDocument();
  for (const tick of ['0%', '50%', '100%']) expect(within(chart).getByText(tick)).toBeInTheDocument();
  expect(chart.querySelectorAll('polyline')).toHaveLength(2);
  expect(chart.querySelectorAll('circle')).toHaveLength(8);
  expect(chart.querySelector('polyline')).toHaveAttribute('points', '42,72.5 140,20 238,90 336,55');
  expect(screen.getByText('● Ann')).toBeInTheDocument();
  expect(screen.getByText('● Bo')).toBeInTheDocument();
  const table = screen.getByRole('table', { name: /equity/i });
  expect(within(table).getByRole('row', { name: /Ann.*62.5%.*100%.*50%.*75%/ })).toBeInTheDocument();
  expect(within(table).getByRole('row', { name: /Bo.*37.5%.*0%.*50%.*25%/ })).toBeInTheDocument();
});

it('does not connect unfinished streets and reports progress and worker errors in the table', () => {
  const points: Points = {
    preflop: point('preflop', [0.5, 0.5], 2, 2),
    flop: point('flop', null, 10, 44),
    turn: point('turn', null, 0, 0, 'Worker failed'),
    river: null,
  };
  render(<EquityChart players={players} points={points} />);
  expect(screen.getByRole('img', { name: /equity/i }).querySelectorAll('circle')).toHaveLength(2);
  expect(screen.getAllByText('Calculating… 10 / 44')).toHaveLength(2);
  expect(screen.getAllByText('Worker failed')).toHaveLength(2);
  expect(screen.getByRole('table', { name: /equity/i })).toHaveTextContent('Preflop');
});
