import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type GameState, initialState } from '../engine/game';
import type { GameRecord } from '../engine/history';
import { GameOverScreen } from './GameOverScreen';
import { RoundSummaryScreen } from './RoundSummaryScreen';
import { StatsScreen } from './StatsScreen';

const players = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];
const base = (over: Partial<GameState>): GameState => ({ ...initialState(), players, gameId: 'g', ...over });

describe('RoundSummaryScreen', () => {
  it('celebrates a moon shot and advances', () => {
    const dispatch = vi.fn();
    const state = base({
      phase: 'roundSummary', round: 0, roundScores: [[26, 0, 26, 26]], totals: [26, 0, 26, 26],
      moonShooter: 1, moonHistory: [1],
    });
    const { container } = render(<RoundSummaryScreen state={state} dispatch={dispatch} />);
    expect(screen.getByRole('heading', { name: 'Round 1 of 4' })).toBeInTheDocument();
    expect(screen.getByText('🌙 Bob shot the moon! 🚀')).toBeInTheDocument();
    expect(container.querySelector('.celebration')).not.toBeNull();
    expect(screen.getByRole('cell', { name: '0 🌙' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next Round (pass right)' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'NEXT_ROUND', seed: expect.any(Number) });
  });

  it.each([[1, 'pass across'], [2, 'no pass']] as const)('labels round %i next pass %s', (round, label) => {
    render(<RoundSummaryScreen state={base({ phase: 'roundSummary', round })} dispatch={vi.fn()} />);
    expect(screen.getByRole('button', { name: `Next Round (${label})` })).toBeInTheDocument();
  });

  it('labels the last round and shows no celebration without a moon', () => {
    const state = base({
      phase: 'roundSummary', round: 3, roundScores: [[1, 2, 3, 20]], totals: [1, 2, 3, 20], moonHistory: [null],
    });
    const { container } = render(<RoundSummaryScreen state={state} dispatch={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Round 4 of 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See final results' })).toBeInTheDocument();
    expect(container.querySelector('.celebration')).toBeNull();
  });
});

describe('GameOverScreen', () => {
  it('shows a tie and a perfect game celebration', () => {
    const state = base({ phase: 'gameOver', totals: [0, 0, 52, 52], roundScores: [[0, 0, 26, 26], [0, 0, 26, 26]] });
    const { container } = render(<GameOverScreen state={state} onPlayAgain={vi.fn()} onNewPlayers={vi.fn()} onOpenStats={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Tie: Ann & Bob' })).toBeInTheDocument();
    expect(screen.getByText('💯 Perfect game: Ann & Bob!')).toBeInTheDocument();
    expect(container.querySelector('.celebration')).not.toBeNull();
  });

  it('shows a single winner and wires the buttons', () => {
    const onPlayAgain = vi.fn();
    const onNewPlayers = vi.fn();
    const onOpenStats = vi.fn();
    const state = base({ phase: 'gameOver', totals: [10, 20, 30, 44], roundScores: [[10, 20, 30, 44]] });
    render(<GameOverScreen state={state} onPlayAgain={onPlayAgain} onNewPlayers={onNewPlayers} onOpenStats={onOpenStats} />);
    expect(screen.getByRole('heading', { name: 'Ann wins!' })).toBeInTheDocument();
    expect(screen.queryByText(/Perfect game/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
    fireEvent.click(screen.getByRole('button', { name: 'New Players' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }));
    expect(onPlayAgain).toHaveBeenCalledOnce();
    expect(onNewPlayers).toHaveBeenCalledOnce();
    expect(onOpenStats).toHaveBeenCalledOnce();
  });
});

describe('StatsScreen', () => {
  const record: GameRecord = {
    gameId: 'g1', finishedAt: Date.UTC(2026, 8, 25), seats: players.map(p => ({ playerId: p.id, name: p.name })),
    roundScores: [[26, 0, 26, 26], [0, 5, 10, 11], [0, 0, 0, 26], [0, 0, 26, 0]], totals: [26, 5, 62, 63],
    winners: ['b'], tie: false, moonShooters: ['b', null, null, null], perfect: [],
  };

  it('shows an empty state and a working back button', () => {
    const onBack = vi.fn();
    render(<StatsScreen records={[]} roster={[]} onClear={vi.fn()} onBack={onBack} />);
    expect(screen.getByText('No games played yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear history' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('shows per-player stats and the game log', () => {
    render(<StatsScreen records={[record]} roster={[]} onClear={vi.fn()} onBack={vi.fn()} />);
    const bob = screen.getAllByRole('row', { name: /Bob/ })[0];
    expect(within(bob).getAllByRole('cell').map(c => c.textContent)).toEqual(['Bob', '1', '1', '0', '1', '0']);
    expect(screen.getByText(/Bob 5 🏆/)).toBeInTheDocument();
  });

  it('shows game logs newest first without changing record order', () => {
    const later = { ...record, gameId: 'g2', finishedAt: record.finishedAt + 1000 };
    const records = [record, later];
    const { container } = render(<StatsScreen records={records} roster={[]} onClear={vi.fn()} onBack={vi.fn()} />);
    const logs = container.querySelectorAll('details.game-log');
    expect(logs).toHaveLength(2);
    expect(logs[0].querySelector('summary')?.textContent).toContain(new Date(later.finishedAt).toLocaleString());
    expect(records[0]).toBe(record);
  });

  it('confirms before clearing history and permits cancellation', () => {
    const onClear = vi.fn();
    render(<StatsScreen records={[record]} roster={[]} onClear={onClear} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(screen.getByRole('dialog', { name: 'Delete all game history?' })).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
