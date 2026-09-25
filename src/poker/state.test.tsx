import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { legalActions } from './engine/betting';
import { tournamentReducer, type Tournament } from './engine/tournament';
import { getSaveFailures } from '../shared/storage';
import { loadPoker, loadSettings, POKER_KEY, saveSettings, SETTINGS_KEY, usePoker } from './state';

const players = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Carol' }];
function started(): Tournament {
  return tournamentReducer(null, { type: 'START', players, stack: 100, bigBlind: 10, id: 'poker-1', seed: 19 })!;
}
function saved(value: unknown) { localStorage.setItem(POKER_KEY, JSON.stringify(value)); }
function moveToResult(): Tournament {
  let state = started();
  for (let i = 0; i < 50 && state.phase === 'hand'; i++) {
    state = tournamentReducer(state, { type: 'REVEAL' })!;
    const action = legalActions(state.hand!.betting).check ? 'CHECK' : 'CALL';
    state = tournamentReducer(state, { type: 'ACT', action: { type: action } })!;
  }
  expect(state.phase).toBe('result');
  return state;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('saved poker tournament', () => {
  it('resumes a revealed hand privately without changing board, hand or stacks', () => {
    const revealed = tournamentReducer(started(), { type: 'REVEAL' })!;
    saved(revealed);
    const restored = loadPoker();
    expect(restored).toEqual({ ...revealed, holeRevealed: false });
    const { result } = renderHook(usePoker);
    expect(result.current.resumable).toBe(true);
    expect(result.current.state?.holeRevealed).toBe(false);
  });

  it('rejects duplicate, missing and invalid cards across deck, hole, board and burned', () => {
    const base = moveToResult();
    const hand = base.hand!;
    const invalid = [
      { ...base, hand: { ...hand, deck: [...hand.deck, hand.board[0]] } },
      { ...base, hand: { ...hand, hole: [hand.hole[0], hand.hole[0], hand.hole[2]] } },
      { ...base, hand: { ...hand, burned: [...hand.burned, { suit: 'X', rank: 3 }] } },
      { ...base, hand: { ...hand, board: hand.board.slice(1) } },
    ];
    for (const state of invalid) {
      saved(state);
      expect(loadPoker()).toBeNull();
      expect(localStorage.getItem(POKER_KEY)).toBeNull();
    }
  });

  it('rejects invalid money, seating, phase, turn, records and version', () => {
    const base = started();
    const invalid = [
      { ...base, stacks: [-1, ...base.stacks.slice(1)] },
      { ...base, stacks: [base.stacks[0] + 1, ...base.stacks.slice(1)] },
      { ...base, current: 9 },
      { ...base, current: null },
      { ...base, hand: { ...base.hand!, betting: { ...base.hand!.betting, pending: [9] } } },
      { ...base, hand: { ...base.hand!, betting: { ...base.hand!.betting, seats: [{ ...base.hand!.betting.seats[0], stack: -1 }, ...base.hand!.betting.seats.slice(1)] } } },
      { ...base, hand: { ...base.hand!, bigBlind: 0 } },
      { ...base, hand: { ...base.hand!, betting: { ...base.hand!.betting, currentBet: -1 } } },
      { ...base, hand: { ...base.hand!, betting: { ...base.hand!.betting, seats: base.hand!.betting.seats.map((seat, i) => i === 0 ? { ...seat, committed: Number.MAX_SAFE_INTEGER } : seat) } } },
      { ...base, dealer: 99 },
      { ...base, players: [{ id: 'a', name: 'Alice' }, { id: 'a', name: 'Bob' }] },
      { ...base, phase: 'other' },
      { ...base, street: 'other' },
      { ...base, result: { kind: 'showdown', pots: 'bad', hands: [], winnerSeats: [] } },
      { ...base, version: 2 },
    ];
    for (const state of invalid) {
      saved(state);
      expect(loadPoker()).toBeNull();
    }
  });

  it('rejects result pot records that create or award invalid chip totals', () => {
    const base = moveToResult();
    const invalid = [
      { ...base, result: { ...base.result!, pots: [{ amount: 1, eligible: [0], winners: [0] }], winnerSeats: [1] } },
      { ...base, result: { ...base.result!, pots: [{ amount: 1000, eligible: [0], winners: [0] }] } },
      { ...base, result: { ...base.result!, pots: [{ amount: 1, eligible: [0], winners: [1] }] } },
    ];
    for (const state of invalid) {
      saved(state);
      expect(loadPoker()).toBeNull();
    }
  });

  it('accepts a completed showdown where result cards reference the dealt cards', () => {
    const state = moveToResult();
    saved(state);
    expect(loadPoker()).toEqual(state);
  });

  it('restores a finished tournament after a decisive showdown', () => {
    let state = tournamentReducer(null, { type: 'START', players: players.slice(0, 2), stack: 10,
      bigBlind: 10, id: 'finished', seed: 19 })!;
    state = tournamentReducer(state, { type: 'REVEAL' })!;
    state = tournamentReducer(state, { type: 'ACT', action: { type: 'CALL' } })!;
    if (state.stacks.filter(stack => stack > 0).length !== 1) {
      state = tournamentReducer(null, { type: 'START', players: players.slice(0, 2), stack: 10,
        bigBlind: 10, id: 'finished', seed: 28 })!;
      state = tournamentReducer(state, { type: 'REVEAL' })!;
      state = tournamentReducer(state, { type: 'ACT', action: { type: 'CALL' } })!;
    }
    state = tournamentReducer(state, { type: 'NEXT_HAND', seed: 4, bigBlind: 10 })!;
    expect(state.phase).toBe('finished');
    saved(state);
    expect(loadPoker()).toEqual(state);
  });

  it('isolates corrupt poker data from all Hearts keys', () => {
    for (const key of ['hearts.game', 'hearts.history', 'hearts.roster']) localStorage.setItem(key, `existing-${key}`);
    localStorage.setItem(POKER_KEY, '{bad');
    expect(loadPoker()).toBeNull();
    for (const key of ['hearts.game', 'hearts.history', 'hearts.roster']) expect(localStorage.getItem(key)).toBe(`existing-${key}`);
  });

  it('saves on every changed reducer state and resumes after unmount', async () => {
    const { result, unmount } = renderHook(usePoker);
    expect(result.current.resumable).toBe(false);
    act(() => result.current.dispatch({ type: 'START', players, stack: 100, bigBlind: 10, id: 'poker-1', seed: 19 }));
    await waitFor(() => expect(loadPoker()?.phase).toBe('hand'));
    act(() => result.current.dispatch({ type: 'REVEAL' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(POKER_KEY)!).holeRevealed).toBe(true));
    unmount();
    const resumed = renderHook(usePoker);
    expect(resumed.result.current.resumable).toBe(true);
    expect(resumed.result.current.state?.holeRevealed).toBe(false);
  });

  it('does not resume an abandoned tournament', async () => {
    const { result, unmount } = renderHook(usePoker);
    act(() => result.current.dispatch({ type: 'START', players, stack: 100, bigBlind: 10, id: 'poker-1', seed: 19 }));
    await waitFor(() => expect(loadPoker()).not.toBeNull());
    act(() => result.current.dispatch({ type: 'ABANDON' }));
    await waitFor(() => expect(localStorage.getItem(POKER_KEY)).toBeNull());
    unmount();
    const reopened = renderHook(usePoker);
    expect(reopened.result.current.state).toBeNull();
    expect(reopened.result.current.resumable).toBe(false);
  });
});

describe('poker settings', () => {
  it('defaults to 10 and persists a valid blind independently', () => {
    expect(loadSettings()).toEqual({ version: 1, bigBlind: 10 });
    expect(saveSettings(20)).toBe(true);
    expect(localStorage.getItem(SETTINGS_KEY)).toBe('{"version":1,"bigBlind":20}');
    expect(loadSettings()).toEqual({ version: 1, bigBlind: 20 });
  });

  it('rejects invalid settings and invalid requested blinds without replacing a valid setting', () => {
    saveSettings(20);
    for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10', null]) {
      expect(saveSettings(invalid as number)).toBe(false);
      expect(loadSettings().bigBlind).toBe(20);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, bigBlind: invalid }));
      expect(loadSettings().bigBlind).toBe(10);
      saveSettings(20);
    }
    localStorage.setItem(SETTINGS_KEY, '{bad');
    expect(loadSettings().bigBlind).toBe(10);
  });

  it('applies changed settings to the next hand but not the current hand', () => {
    const { result } = renderHook(usePoker);
    act(() => result.current.dispatch({ type: 'START', players, stack: 100, bigBlind: 10, id: 'poker-1', seed: 19 }));
    expect(result.current.state?.hand?.bigBlind).toBe(10);
    expect(saveSettings(20)).toBe(true);
    expect(result.current.state?.hand?.bigBlind).toBe(10);
    for (let i = 0; i < 50 && result.current.state?.phase === 'hand'; i++) {
      act(() => result.current.dispatch({ type: 'REVEAL' }));
      const action = legalActions(result.current.state!.hand!.betting).check ? 'CHECK' : 'CALL';
      act(() => result.current.dispatch({ type: 'ACT', action: { type: action } }));
    }
    expect(result.current.state?.phase).toBe('result');
    act(() => result.current.dispatch({ type: 'NEXT_HAND', seed: 42, bigBlind: 10 }));
    expect(result.current.state?.hand?.bigBlind).toBe(20);
  });

  it('reports poker and settings write failures through the shared warning store', async () => {
    const { result } = renderHook(usePoker);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === POKER_KEY || key === SETTINGS_KEY) throw new Error('quota');
      return original.call(this, key, value);
    });
    act(() => result.current.dispatch({ type: 'START', players, stack: 100, bigBlind: 10, id: 'poker-1', seed: 19 }));
    await waitFor(() => expect(getSaveFailures()).toContain(POKER_KEY));
    expect(saveSettings(20)).toBe(false);
    expect(getSaveFailures()).toContain(SETTINGS_KEY);
    vi.restoreAllMocks();
    expect(saveSettings(20)).toBe(true);
    act(() => result.current.dispatch({ type: 'REVEAL' }));
    await waitFor(() => expect(getSaveFailures()).not.toContain(POKER_KEY));
    expect(getSaveFailures()).not.toContain(SETTINGS_KEY);
  });

  it('falls back safely and warns through the shared store when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(loadPoker()).toBeNull();
    expect(loadSettings()).toEqual({ version: 1, bigBlind: 10 });
    expect(getSaveFailures()).toContain(POKER_KEY);
    expect(getSaveFailures()).toContain(SETTINGS_KEY);
  });
});
