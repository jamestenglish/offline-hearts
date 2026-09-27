import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardId, cardLabel } from '../engine/cards';
import { currentLegalPlays, gameReducer, type GameState, initialState } from '../engine/game';
import { autoAction } from '../test/autoplay';
import { DealScreen } from './DealScreen';
import { LeadScreen } from './LeadScreen';
import { PassScreen } from './PassScreen';
import { PlayScreen } from './PlayScreen';
import { TrickResultScreen } from './TrickResultScreen';

const players = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];
const start = () => gameReducer(initialState(), { type: 'START_GAME', players, gameId: 'g', seed: 11 });
const advance = (s: GameState, done: (s: GameState) => boolean) => {
  let state = s;
  for (let i = 0; i < 5000 && !done(state); i++) state = gameReducer(state, autoAction(state));
  return state;
};

afterEach(() => vi.useRealTimers());

describe('DealScreen', () => {
  it('calls onDone once after 1700 ms, including StrictMode effect replay', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(<StrictMode><DealScreen players={players} onDone={onDone} /></StrictMode>);
    expect(container.querySelectorAll('.deal-card')).toHaveLength(52);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(100); });
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not complete when unmounted before the timer', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { unmount } = render(<DealScreen players={players} onDone={onDone} />);
    unmount();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('PassScreen', () => {
  it('remembers a player’s ascending sort after the hand is hidden and shown again', () => {
    const passing = gameReducer(start(), { type: 'DEAL_DONE' });
    const revealed = gameReducer(passing, { type: 'REVEAL_HAND' });
    const { unmount } = render(<PassScreen state={revealed} dispatch={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Descending' }));
    expect(screen.getByRole('button', { name: 'Sort: Ascending' })).toBeInTheDocument();
    unmount();
    render(<PassScreen state={revealed} dispatch={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sort: Ascending' })).toBeInTheDocument();
  });

  it('hides the hand until revealed, then allows exactly three cards', () => {
    const dispatch = vi.fn();
    const passing = gameReducer(start(), { type: 'DEAL_DONE' });
    const { rerender } = render(<PassScreen state={passing} dispatch={dispatch} />);
    expect(screen.getByText('Pass the device to Ann')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { pressed: false })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: "Show Ann's hand" }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'REVEAL_HAND' });

    const revealed = gameReducer(passing, { type: 'REVEAL_HAND' });
    rerender(<PassScreen state={revealed} dispatch={dispatch} />);
    expect(screen.getByText('Ann: pass 3 cards left → Bob')).toBeInTheDocument();
    const finalize = screen.getByRole('button', { name: 'Finalize Selection' });
    expect(finalize).toBeDisabled();
    const hand = revealed.hands[0];
    hand.slice(0, 4).forEach(c => fireEvent.click(screen.getByRole('button', { name: cardLabel(c) })));
    expect(screen.getByText('3/3 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: cardLabel(hand[3]) })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(finalize);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'FINALIZE_PASS', cards: hand.slice(0, 3).map(cardId) });
  });

  it('hides the prior hand and clears selection between passers', () => {
    const dispatch = vi.fn();
    const passing = gameReducer(start(), { type: 'DEAL_DONE' });
    const revealed = gameReducer(passing, { type: 'REVEAL_HAND' });
    const { rerender } = render(<PassScreen state={revealed} dispatch={dispatch} />);
    revealed.hands[0].slice(0, 3).forEach(c => fireEvent.click(screen.getByRole('button', { name: cardLabel(c) })));
    const next = gameReducer(revealed, { type: 'FINALIZE_PASS', cards: revealed.hands[0].slice(0, 3).map(cardId) });
    rerender(<PassScreen state={next} dispatch={dispatch} />);
    expect(screen.getByText('Pass the device to Bob')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    rerender(<PassScreen state={gameReducer(next, { type: 'REVEAL_HAND' })} dispatch={dispatch} />);
    expect(screen.getByText('0/3 selected')).toBeInTheDocument();
  });
});

describe('LeadScreen', () => {
  it('announces the 2 of clubs holder', () => {
    const dispatch = vi.fn();
    const lead = advance(start(), s => s.phase === 'leadAnnounce');
    const name = players[lead.current].name;
    render(<LeadScreen state={lead} dispatch={dispatch} />);
    expect(screen.getByText(`${name} has the 2♣ and leads.`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Show ${name}'s cards` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'BEGIN_PLAY' });
  });
});

describe('PlayScreen', () => {
  it('shows the last completed trick in name badges during the next trick and replaces it after another', () => {
    const first = advance(start(), s => s.phase === 'trickResult');
    const next = gameReducer(first, { type: 'ACK_TRICK' });
    const { rerender } = render(<PlayScreen state={next} dispatch={vi.fn()} />);
    for (const { seat, card } of first.lastTrick!.cards) {
      expect(within(screen.getByTestId(`seat-${seat}`)).getByText(cardLabel(card))).toBeInTheDocument();
    }
    const second = advance(next, s => s.phase === 'trickResult');
    const thirdTrick = gameReducer(second, { type: 'ACK_TRICK' });
    rerender(<PlayScreen state={thirdTrick} dispatch={vi.fn()} />);
    for (const { seat, card } of second.lastTrick!.cards) {
      expect(within(screen.getByTestId(`seat-${seat}`)).getByText(cardLabel(card))).toBeInTheDocument();
    }
    expect(screen.getByTestId('seat-0').querySelectorAll('.last-card-mini')).toHaveLength(1);
  });
  it('keeps the selected card while toggling sort and explains received cards', () => {
    const dispatch = vi.fn();
    const playing = advance(start(), s => s.phase === 'playing' && s.handRevealed);
    const withReceived: GameState = {
      ...playing,
      received: playing.received.map((r, seat) => seat === playing.current ? ['2C', ...r] : r),
    };
    render(<PlayScreen state={withReceived} dispatch={dispatch} />);
    expect(screen.getByText(/NEW = received in the pass/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2♣' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Descending' }));
    expect(screen.getByRole('button', { name: '2♣' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Play 2♣' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAY_CARD', card: '2C' });
  });

  it('shows the gate when hidden and reveals only on request', () => {
    const dispatch = vi.fn();
    const hidden: GameState = { ...advance(start(), s => s.phase === 'playing'), handRevealed: false };
    render(<PlayScreen state={hidden} dispatch={dispatch} />);
    const name = players[hidden.current].name;
    expect(screen.getByText(`Pass the device to ${name}`)).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { pressed: false })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: `See ${name}'s cards` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'REVEAL_HAND' });
  });

  it('dims illegal cards and confirms the raised card', () => {
    const dispatch = vi.fn();
    const playing = advance(start(), s => s.phase === 'playing' && s.handRevealed);
    render(<PlayScreen state={playing} dispatch={dispatch} />);
    const legal = currentLegalPlays(playing).map(cardId);
    playing.hands[playing.current].forEach(c => {
      const button = screen.getByRole('button', { name: cardLabel(c) });
      if (legal.includes(cardId(c))) expect(button).toBeEnabled();
      else expect(button).toBeDisabled();
    });
    expect(screen.queryByRole('button', { name: /^Play / })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2♣' }));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play 2♣' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAY_CARD', card: '2C' });
  });

  it('clears selected card when the turn advances to the next player', () => {
    const dispatch = vi.fn();
    const playing = advance(start(), s => s.phase === 'playing' && s.handRevealed);
    const { rerender } = render(<PlayScreen state={playing} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole('button', { name: '2♣' }));
    const next = gameReducer(playing, { type: 'PLAY_CARD', card: '2C' });
    rerender(<PlayScreen state={next} dispatch={dispatch} />);
    expect(screen.queryByRole('button', { name: /^Play / })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    rerender(<PlayScreen state={gameReducer(next, { type: 'REVEAL_HAND' })} dispatch={dispatch} />);
    expect(screen.queryByRole('button', { name: /^Play / })).not.toBeInTheDocument();
  });
});

describe('TrickResultScreen', () => {
  it('announces the winner and hands over', () => {
    const dispatch = vi.fn();
    const result = advance(start(), s => s.phase === 'trickResult');
    const winner = players[result.lastTrick!.winner].name;
    render(<TrickResultScreen state={result} dispatch={dispatch} />);
    expect(screen.getByText(new RegExp(`${winner} wins the trick`))).toBeInTheDocument();
    expect(screen.queryByText(/\+\d+|\d+ pts/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Show ${winner}'s cards` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'ACK_TRICK' });
  });

  it('offers round results after the last trick', () => {
    const last = advance(start(), s => s.phase === 'trickResult' && s.trickNumber === 13);
    render(<TrickResultScreen state={last} dispatch={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'See round results' })).toBeInTheDocument();
  });
});
