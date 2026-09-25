import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { gameReducer, type GameState, initialState } from './engine/game';
import { GAME_KEY, HISTORY_KEY } from './state/storage';
import { autoAction } from './test/autoplay';

const players = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];

const saveGame = (until: (s: GameState) => boolean) => {
  let s = gameReducer(initialState(), { type: 'START_GAME', players, gameId: 'saved', seed: 4 });
  for (let i = 0; i < 5000 && !until(s); i++) s = gameReducer(s, autoAction(s));
  if (!until(s)) throw new Error('Could not reach saved game phase');
  localStorage.setItem(GAME_KEY, JSON.stringify(s));
  return s;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('App', () => {
  it('adds four players, starts a game and reaches the pass screen', () => {
    vi.useFakeTimers();
    render(<App />);
    ['Ann', 'Bob', 'Cat', 'Dan'].forEach((name, i) => {
      fireEvent.change(screen.getByLabelText(`Seat ${i + 1}`), { target: { value: '__new__' } });
      fireEvent.change(screen.getByLabelText('New player name'), { target: { value: name } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
    expect(screen.getByText('Shuffling and dealing…')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('button', { name: "Show Ann's hand" })).toBeInTheDocument();
  });

  it('offers to resume a saved revealed game without exposing its hand', () => {
    saveGame(s => s.phase === 'playing' && s.handRevealed);
    render(<App />);
    expect(screen.getByText('You have a game in progress.')).toBeInTheDocument();
    expect(screen.queryByText("Ann's turn")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('button', { name: /^See .*'s cards$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Play / })).not.toBeInTheDocument();
  });

  it('starts over from the resume prompt', () => {
    saveGame(s => s.phase === 'passing');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
  });

  it('abandons a game only after confirming and without recording it', () => {
    saveGame(s => s.phase === 'passing');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(screen.getByText("Abandon this game? It won't be recorded.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
    expect(localStorage.getItem(HISTORY_KEY)).not.toContain('saved');
  });

  it('records a finished game exactly once in StrictMode and across reloads', () => {
    saveGame(s => s.phase === 'gameOver');
    const first = render(<StrictMode><App /></StrictMode>);
    expect(screen.getByRole('button', { name: 'Play Again' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!).games).toHaveLength(1);
    first.unmount();
    render(<StrictMode><App /></StrictMode>);
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY)!);
    expect(history.games).toHaveLength(1);
    expect(history.games[0].gameId).toBe('saved');
  });

  it('opens stats from game over', () => {
    saveGame(s => s.phase === 'gameOver');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }));
    expect(screen.getByRole('heading', { name: 'Stats' })).toBeInTheDocument();
    expect(screen.getAllByRole('row', { name: /Ann/ }).length).toBeGreaterThan(0);
  });
});
