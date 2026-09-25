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
  it('appends once per gameId, persists, and clears', () => {
    const { result } = renderHook(() => useHistory());
    act(() => { result.current.append(rec); result.current.append(rec); });
    expect(result.current.records).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!).games).toHaveLength(1);
    act(() => { result.current.clear(); });
    expect(result.current.records).toEqual([]);
  });

  it('loads saved history', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, games: [rec] }));
    const { result } = renderHook(() => useHistory());
    expect(result.current.records).toEqual([rec]);
  });
});
