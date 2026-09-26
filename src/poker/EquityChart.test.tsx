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
  expect(within(screen.getByRole('list', { name: /equity legend/i })).getByText('Ann')).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: /equity legend/i })).getByText('Bo')).toBeInTheDocument();
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

it('distinguishes all eight overlapping paths by line pattern and matching legend samples', () => {
  const eight = Array.from({ length: 8 }, (_, seat) => ({ seat, name: `Player ${seat + 1}` }));
  const points: Points = {
    preflop: point('preflop', Array(8).fill(0.125), 8, 8),
    flop: point('flop', Array(8).fill(0.125), 8, 8),
    turn: null, river: null,
  };
  render(<EquityChart players={eight} points={points} />);
  const chart = screen.getByRole('img', { name: /equity/i });
  const paths = [...chart.querySelectorAll('polyline')];
  expect(paths).toHaveLength(8);
  expect(new Set(paths.map(path => path.getAttribute('points'))).size).toBe(1);
  const patterns = paths.map(path => path.getAttribute('stroke-dasharray'));
  expect(new Set(patterns).size).toBe(8);
  expect(chart.querySelectorAll('circle')).toHaveLength(16);
  const legend = screen.getByRole('list', { name: /equity legend/i });
  for (const [index, pattern] of patterns.entries()) {
    const item = within(legend).getAllByRole('listitem')[index];
    expect(item).toHaveTextContent(`Player ${index + 1}`);
    const sample = item.querySelector('svg line');
    expect(sample?.getAttribute('stroke-dasharray')).toBe(pattern);
  }
});

it('labels displayed percentages as rounded while retaining sub-percent equity', () => {
  render(<EquityChart players={players} points={{
    preflop: point('preflop', [1 / 3, 2 / 3], 3, 3), flop: null, turn: null, river: null,
  }} />);
  const table = screen.getByRole('table', { name: /rounded equity/i });
  expect(table).toHaveTextContent('33.3333%');
  expect(table).toHaveTextContent('66.6667%');
  expect(screen.getByText(/percentages rounded to up to four decimal places/i)).toBeInTheDocument();
});
