import { describe, expect, it } from 'vitest';
import type { GameRecord } from './history';
import type { Player } from './roster';
import { computeStats } from './stats';

const seats = [
  { playerId: 'a', name: 'Ann' }, { playerId: 'b', name: 'Bob' },
  { playerId: 'c', name: 'Cat' }, { playerId: 'd', name: 'Dan' },
];
const record = (over: Partial<GameRecord>): GameRecord => ({
  gameId: Math.random().toString(),
  finishedAt: 0,
  seats,
  roundScores: [],
  totals: [0, 0, 0, 0],
  winners: [],
  tie: false,
  moonShooters: [null, null, null, null],
  perfect: [],
  ...over,
});

describe('computeStats', () => {
  it('counts games, wins, ties, moons and perfect games', () => {
    const records = [
      record({ finishedAt: 1, winners: ['a'], moonShooters: ['a', null, 'a', null] }),
      record({ finishedAt: 2, winners: ['a', 'b'], tie: true, perfect: ['a', 'b'] }),
    ];
    const stats = computeStats(records, []);
    const byId = Object.fromEntries(stats.map(s => [s.playerId, s]));
    expect(byId.a).toEqual({ playerId: 'a', name: 'Ann', games: 2, wins: 2, ties: 1, moons: 2, perfect: 1 });
    expect(byId.b).toEqual({ playerId: 'b', name: 'Bob', games: 2, wins: 1, ties: 1, moons: 0, perfect: 1 });
    expect(byId.c).toEqual({ playerId: 'c', name: 'Cat', games: 2, wins: 0, ties: 0, moons: 0, perfect: 0 });
    expect(stats.map(s => s.playerId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('uses the current roster name so renames follow the player', () => {
    const roster: Player[] = [{ id: 'a', name: 'Annie', archived: true, createdAt: 0 }];
    const stats = computeStats([record({ winners: ['a'] })], roster);
    expect(stats.find(s => s.playerId === 'a')?.name).toBe('Annie');
  });

  it('returns nothing for an empty log', () => {
    expect(computeStats([], [])).toEqual([]);
  });

  it('uses the latest historical seat name regardless of record order when a player is absent from the roster', () => {
    const stats = computeStats([
      record({ finishedAt: 2, seats: [{ playerId: 'a', name: 'Annie' }] }),
      record({ finishedAt: 1, seats: [{ playerId: 'a', name: 'Ann' }] }),
    ], []);
    expect(stats).toEqual([{ playerId: 'a', name: 'Annie', games: 2, wins: 0, ties: 0, moons: 0, perfect: 0 }]);
  });

  it('sorts equal wins by games then name', () => {
    const stats = computeStats([
      record({ seats: [{ playerId: 'z', name: 'Zoe' }, { playerId: 'a', name: 'Amy' }] }),
      record({ seats: [{ playerId: 'z', name: 'Zoe' }, { playerId: 'b', name: 'Bea' }] }),
    ], []);
    expect(stats.map(s => s.playerId)).toEqual(['z', 'a', 'b']);
  });
});
