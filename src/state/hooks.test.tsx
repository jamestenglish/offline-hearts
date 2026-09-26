import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameReducer, initialState } from '../engine/game';
import type { GameRecord } from '../engine/history';
import { GAME_KEY, HISTORY_KEY, ROSTER_KEY } from './storage';
import { useGame } from './useGame';
import { useHistory } from './useHistory';
import { useRoster } from './useRoster';

const rec: GameRecord = {
  gameId: 'g1', finishedAt: 1, seats: [], roundScores: [], totals: [],
  winners: [], tie: false, moonShooters: [], perfect: [],
};

describe('useGame', () => {
  it('initializes fresh, persists actions and is not resumable', () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.state).toEqual(initialState());
    expect(result.current.resumable).toBe(false);
    const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }];
    act(() => { result.current.dispatch({ type: 'START_GAME', players, gameId: 'g', seed: 3 }); });
    expect(result.current.state.phase).toBe('dealing');
    expect(JSON.parse(localStorage.getItem(GAME_KEY)!)).toEqual(result.current.state);
    expect(result.current.resumable).toBe(false);
  });

  it('marks a loaded mid-game state resumable and hides its hand', () => {
    const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }];
    const started = gameReducer(initialState(), { type: 'START_GAME', players, gameId: 'g', seed: 3 });
    const passing = gameReducer(gameReducer(started, { type: 'DEAL_DONE' }), { type: 'REVEAL_HAND' });
    localStorage.setItem(GAME_KEY, JSON.stringify(passing));
    const { result } = renderHook(() => useGame());
    expect(result.current.resumable).toBe(true);
    expect(result.current.state.handRevealed).toBe(false);
  });
});

describe('useRoster', () => {
  it('discards malformed saved players and allows adding safely', () => {
    const valid = { id: 'a', name: 'Ann', archived: false, createdAt: 1 };
    for (const players of [[null], [{ ...valid, name: null }], [{ ...valid, archived: 'no' }],
      [{ ...valid, createdAt: 'yesterday' }], [valid, { ...valid, name: 'Bob' }]]) {
      localStorage.setItem(ROSTER_KEY, JSON.stringify({ version: 1, players }));
      const { result, unmount } = renderHook(() => useRoster());
      expect(result.current.players).toEqual([]);
      act(() => { expect(result.current.add('Cara').ok).toBe(true); });
      expect(result.current.players).toHaveLength(1);
      unmount();
    }
  });

  it('keeps same-tick add, rename, and archive writes and returns synchronous results', () => {
    const { result } = renderHook(() => useRoster());
    let first!: ReturnType<typeof result.current.add>;
    let second!: ReturnType<typeof result.current.add>;
    let renamed!: ReturnType<typeof result.current.rename>;
    let duplicate!: ReturnType<typeof result.current.add>;
    act(() => {
      first = result.current.add('Ann');
      second = result.current.add('Bob');
      if (!first.ok) throw new Error('first add failed');
      renamed = result.current.rename(first.player.id, 'Annie');
      result.current.archive(first.player.id, true);
      duplicate = result.current.add(' annie ');
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(renamed.ok).toBe(true);
    expect(duplicate).toEqual({ ok: false, error: 'That name is already taken' });
    expect(result.current.players).toEqual([
      expect.objectContaining({ name: 'Annie', archived: true }),
      expect.objectContaining({ name: 'Bob', archived: false }),
    ]);
    expect(JSON.parse(localStorage.getItem(ROSTER_KEY)!).players).toEqual(result.current.players);
  });

  it('adds, renames, archives and persists players', () => {
    const { result } = renderHook(() => useRoster());
    let added!: ReturnType<typeof result.current.add>;
    act(() => { added = result.current.add('Ann'); });
    expect(added.ok).toBe(true);
    const id = added.ok ? added.player.id : '';
    act(() => { result.current.rename(id, 'Annie'); });
    act(() => { result.current.archive(id, true); });
    expect(result.current.players).toEqual([expect.objectContaining({ id, name: 'Annie', archived: true })]);
    expect(JSON.parse(localStorage.getItem(ROSTER_KEY)!)).toEqual({ version: 1, players: result.current.players });
  });

  it('reports validation errors without changing the roster', () => {
    const { result } = renderHook(() => useRoster());
    act(() => { result.current.add('Ann'); });
    let dup!: ReturnType<typeof result.current.add>;
    act(() => { dup = result.current.add(' ann '); });
    expect(dup).toEqual({ ok: false, error: 'That name is already taken' });
    expect(result.current.players).toHaveLength(1);
  });
});

describe('useHistory', () => {
  it('discards malformed records instead of loading entries that break append', () => {
    const invalid = [null, { ...rec, gameId: null }, { ...rec, finishedAt: 'today' },
      { ...rec, seats: [null] }, { ...rec, seats: [{ playerId: 1, name: 'A' }] },
      { ...rec, roundScores: [[1, 'bad']] }, { ...rec, totals: ['bad'] },
      { ...rec, winners: [null] }, { ...rec, tie: 'false' },
      { ...rec, moonShooters: [42] }, { ...rec, perfect: [null] }];
    for (const entry of invalid) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, games: [entry] }));
      const { result, unmount } = renderHook(() => useHistory());
      expect(result.current.records).toEqual([]);
      act(() => { result.current.append(rec); });
      expect(result.current.records).toEqual([rec]);
      unmount();
    }
  });

  it('appends once per gameId, persists, and clears', () => {
    const { result } = renderHook(() => useHistory());
    act(() => { result.current.append(rec); result.current.append(rec); });
    expect(result.current.records).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!).games).toHaveLength(1);
    act(() => { result.current.clear(); });
    expect(result.current.records).toEqual([]);
  });

  it('does not resurrect the cleared Game Over record but accepts a different game', () => {
    const { result } = renderHook(() => useHistory());
    act(() => { result.current.append(rec); });
    act(() => { result.current.clear('g1'); });
    act(() => { result.current.append(rec); });
    expect(result.current.records).toEqual([]);
    act(() => { result.current.append({ ...rec, gameId: 'g2' }); });
    expect(result.current.records.map(game => game.gameId)).toEqual(['g2']);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!).games.map((game: GameRecord) => game.gameId)).toEqual(['g2']);
  });

  it('loads saved history', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, games: [rec] }));
    const { result } = renderHook(() => useHistory());
    expect(result.current.records).toEqual([rec]);
  });
});
