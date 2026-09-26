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
    preflop: point('preflop', [50, 30], 80, 80),
    flop: point('flop', [12, 0], 12, 12),
    turn: point('turn', [2, 2], 4, 4),
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
  expect(within(table).getByRole('row', { name: /Ann.*63%.*100%.*50%.*75%/ })).toBeInTheDocument();
  expect(within(table).getByRole('row', { name: /Bo.*38%.*0%.*50%.*25%/ })).toBeInTheDocument();
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
    preflop: point('preflop', [1, 2], 3, 3), flop: null, turn: null, river: null,
  }} />);
  const table = screen.getByRole('table', { name: /rounded equity/i });
  expect(table).toHaveTextContent('33%');
  expect(table).toHaveTextContent('67%');
  expect(screen.getByText(/percentages rounded to whole numbers/i)).toBeInTheDocument();
});

it('normalizes accumulated winning runouts before drawing or displaying percentages', () => {
  render(<EquityChart players={players} points={{
    preflop: point('preflop', [547414.666667, 1164889.333333], 1_712_304, 1_712_304),
    flop: point('flop', [481, 509], 990, 990),
    turn: point('turn', [0, 44], 44, 44),
    river: point('river', [0, 1], 1, 1),
  }} />);
  const table = screen.getByRole('table', { name: /equity/i });
  expect(within(table).getByRole('row', { name: /Ann/ })).toHaveTextContent('32%');
  expect(within(table).getByRole('row', { name: /Ann/ })).toHaveTextContent('49%');
  expect(table).not.toHaveTextContent('54741466');
  const coordinates = [...screen.getByRole('img', { name: /equity/i }).querySelectorAll('polyline')]
    .flatMap(line => (line.getAttribute('points') ?? '').split(' ').map(pair => Number(pair.split(',')[1])));
  expect(coordinates.every(y => y >= 20 && y <= 160)).toBe(true);
});

it('labels estimated streets and exact streets in the companion table', () => {
  render(<EquityChart players={players} points={{
    preflop: point('preflop', [1200, 800], 2000, 2000),
    flop: point('flop', [60, 40], 100, 100),
    turn: point('turn', [22, 22], 44, 44), river: point('river', [1, 0], 1, 1),
  }} />);
  const table = screen.getByRole('table', { name: /equity/i });
  expect(within(table).getByRole('columnheader', { name: /^Preflop \(estimated\)$/i })).toBeInTheDocument();
  expect(within(table).getByRole('columnheader', { name: /^Flop \(estimated\)$/i })).toBeInTheDocument();
  expect(within(table).getByRole('columnheader', { name: /^Turn \(exact\)$/i })).toBeInTheDocument();
  expect(within(table).getByRole('columnheader', { name: /^River \(exact\)$/i })).toBeInTheDocument();
});
