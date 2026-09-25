import { describe, expect, it } from 'vitest';
import { type GameState, initialState } from './game';
import { appendRecord, buildRecord } from './history';

const finished = (totals: number[], moonHistory: (number | null)[] = [null, null, null, null]): GameState => ({
  ...initialState(),
  gameId: 'g1',
  phase: 'gameOver',
  players: [
    { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
  ],
  roundScores: [totals, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  totals,
  moonHistory,
});

describe('buildRecord', () => {
  it('records a single winner', () => {
    const r = buildRecord(finished([10, 5, 40, 49]), 999);
    expect(r).toMatchObject({
      gameId: 'g1',
      finishedAt: 999,
      seats: [
        { playerId: 'a', name: 'Ann' }, { playerId: 'b', name: 'Bob' },
        { playerId: 'c', name: 'Cat' }, { playerId: 'd', name: 'Dan' },
      ],
      totals: [10, 5, 40, 49],
      winners: ['b'],
      tie: false,
      perfect: [],
    });
    expect(r.roundScores).toHaveLength(4);
  });

  it('records ties, moons and perfect games by player id', () => {
    const r = buildRecord(finished([0, 0, 52, 52], [2, null, 3, null]), 1);
    expect(r.winners).toEqual(['a', 'b']);
    expect(r.tie).toBe(true);
    expect(r.perfect).toEqual(['a', 'b']);
    expect(r.moonShooters).toEqual(['c', null, 'd', null]);
  });

  it('snapshots scores and seats independently of the game state', () => {
    const state = finished([10, 5, 40, 49]);
    const r = buildRecord(state, 1);
    state.players[0].name = 'Annie';
    state.roundScores[0][0] = 99;
    state.totals[0] = 99;
    expect(r.seats[0].name).toBe('Ann');
    expect(r.roundScores[0][0]).toBe(10);
    expect(r.totals[0]).toBe(10);
  });
});

describe('appendRecord', () => {
  it('appends new records and ignores duplicates by gameId', () => {
    const r = buildRecord(finished([10, 5, 40, 49]), 1);
    const once = appendRecord([], r);
    expect(once).toHaveLength(1);
    const twice = appendRecord(once, { ...r, finishedAt: 2 });
    expect(twice).toBe(once);
  });
});
