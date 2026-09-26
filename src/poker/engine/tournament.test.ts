import { describe, expect, it } from 'vitest';
import { legalActions } from './betting';
import { nextLive, positions } from './seats';
import { initialTournament, tournamentReducer, type Action, type Tournament } from './tournament';

const players = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
const start = (count = 3, stack = 100, seed = 19) => {
  const state = tournamentReducer(initialTournament(), { type: 'START', players: players(count), stack, bigBlind: 10, id: 't1', seed });
  expect(state).not.toBeNull();
  verify(state!);
  return state!;
};
function verify(state: Tournament) {
  const committed = state.hand?.betting.seats.reduce((sum, s) => sum + s.committed, 0) ?? 0;
  expect(state.stacks.reduce((sum, chips) => sum + chips, 0) + committed)
    .toBe(state.initialChips * state.players.length);
  expect(state.stacks.every(s => Number.isSafeInteger(s) && s >= 0)).toBe(true);
  if (state.hand) {
    expect(state.stacks).toEqual(state.hand.betting.seats.map(s => s.stack));
    expect(state.current).toBe(state.hand.betting.current);
  }
}
function dispatch(state: Tournament, action: Action) {
  const next = tournamentReducer(state, action);
  expect(next).not.toBeNull();
  verify(next!);
  return next!;
}
function move(state: Tournament, action: Action & { type: 'ACT' }) {
  state = dispatch(state, { type: 'REVEAL' });
  expect(state.holeRevealed).toBe(true);
  state = dispatch(state, action);
  expect(state.holeRevealed).toBe(false);
  return state;
}
function passive(state: Tournament) {
  const legal = legalActions(state.hand!.betting);
  return move(state, { type: 'ACT', action: { type: legal.check ? 'CHECK' : 'CALL' } });
}
function complete(state: Tournament) {
  let turns = 0;
  while (state.phase === 'hand' && turns++ < 50) state = passive(state);
  expect(turns).toBeLessThan(50);
  return state;
}

describe('tournament reducer', () => {
  it('starts from a seed, deals privately, charges capped blinds and follows clockwise preflop order', () => {
    const a = start(4, 100, 19);
    const b = start(4, 100, 19);
    expect(a).toEqual(b);
    expect(a.handNumber).toBe(1);
    expect(a.phase).toBe('hand');
    expect(a.street).toBe('preflop');
    expect(a.hand?.smallBlind).toBe(5);
    expect(a.hand?.bigBlind).toBe(10);
    const p = positions(a.stacks.map(() => ({ stack: 1 })), a.dealer);
    expect(a.hand!.betting.seats[p.small].committed).toBe(5);
    expect(a.hand!.betting.seats[p.big].committed).toBe(10);
    expect(a.current).toBe(p.preflopFirst);
    expect(a.holeRevealed).toBe(false);
    expect(a.hand?.hole.every(h => h?.length === 2)).toBe(true);
    const next = passive(a);
    expect(next.current).toBe((p.preflopFirst + 1) % 4);
    expect(a.hand!.betting.seats[p.preflopFirst].committed).toBe(0);
  });

  it('reveals flop, turn, river with one burn each, resets street action, and completes showdown', () => {
    let state = start();
    for (const [street, boardLength, burns] of [['flop', 3, 1], ['turn', 4, 2], ['river', 5, 3]] as const) {
      let turns = 0;
      while (state.street !== street && turns++ < 10) state = passive(state);
      expect(state.street).toBe(street);
      expect(state.hand!.board).toHaveLength(boardLength);
      expect(state.hand!.burned).toHaveLength(burns);
      expect(state.hand!.betting.seats.every(s => s.streetBet === 0 && !s.actedSinceFullRaise && !s.raiseLocked)).toBe(true);
      expect(state.hand!.betting.currentBet).toBe(0);
      expect(state.hand!.betting.lastFullRaise).toBe(10);
      expect(state.current).toBe(positions(state.stacks.map(() => ({ stack: 1 })), state.dealer).postflopFirst);
    }
    state = complete(state);
    expect(state.phase).toBe('result');
    expect(state.result?.kind).toBe('showdown');
    expect(state.result?.hands).toHaveLength(3);
    expect(state.result?.hands.every(h => h.hole.length === 2 && h.best.bestFive.length === 5)).toBe(true);
  });

  it('awards a fold-to-one pot without showing any private cards', () => {
    let state = start(2);
    state = move(state, { type: 'ACT', action: { type: 'FOLD' } });
    expect(state.phase).toBe('result');
    expect(state.result).toMatchObject({ kind: 'uncontested', hands: [], winnerSeats: [state.dealer === 0 ? 1 : 0] });
    expect(state.holeRevealed).toBe(false);
    expect(state.stacks.reduce((a, b) => a + b, 0)).toBe(200);
  });

  it('runs out the board immediately when everyone is all-in', () => {
    let state = start(2, 20);
    state = move(state, { type: 'ACT', action: { type: 'ALL_IN' } });
    state = move(state, { type: 'ACT', action: { type: 'CALL' } });
    expect(state.phase).toBe('result');
    expect(state.hand!.board).toHaveLength(5);
    expect(state.hand!.burned).toHaveLength(3);
    expect(state.result?.kind).toBe('showdown');
    expect(state.result?.pots.reduce((sum, p) => sum + p.amount, 0)).toBe(40);
  });

  it('runs out without a meaningless check when only one player can still act after matching an all-in', () => {
    let state = start(2, 10);
    const actor = state.current!;
    expect(state.hand!.betting.seats[actor].allIn).toBe(false);
    expect(state.hand!.betting.seats[1 - actor].allIn).toBe(true);
    state = move(state, { type: 'ACT', action: { type: 'CALL' } });
    expect(state.phase).toBe('result');
    expect(state.hand!.board).toHaveLength(5);
  });

  it('resolves a short blind automatically on the next hand after a fold', () => {
    let state = start(2, 10);
    state = move(state, { type: 'ACT', action: { type: 'FOLD' } });
    state = dispatch(state, { type: 'NEXT_HAND', bigBlind: 10, seed: 77 });
    expect(state.phase).toBe('result');
    expect(state.handNumber).toBe(2);
    expect(state.hand!.board).toHaveLength(5);
    expect(state.result!.kind).toBe('showdown');
  });

  it('awards distinct main and side pots with three different stacks', () => {
    const base = start();
    const fixture: Tournament = { ...base, phase: 'result', hand: null, street: null, current: null,
      stacks: [30, 60, 210], result: { kind: 'uncontested', pots: [], hands: [], winnerSeats: [2] } };
    let state = dispatch(fixture, { type: 'NEXT_HAND', seed: 12, bigBlind: 10 });
    for (let i = 0; i < 12 && state.phase === 'hand'; i++) {
      const legal = legalActions(state.hand!.betting);
      state = move(state, { type: 'ACT', action: { type: legal.allIn ? 'ALL_IN' : legal.call !== null ? 'CALL' : 'CHECK' } });
    }
    expect(state.phase).toBe('result');
    expect(state.result?.kind).toBe('showdown');
    expect(state.result?.pots.map(p => p.amount)).toEqual([90, 60]);
    expect(state.result?.pots.map(p => p.eligible.length)).toEqual([3, 2]);
    expect(state.stacks[2]).toBeGreaterThanOrEqual(150); // uncalled excess is returned, not a single-player pot
    expect(state.stacks.reduce((a, b) => a + b, 0)).toBe(300);
  });

  it('heads-up dealer posts small blind, acts first preflop, and big blind acts first postflop', () => {
    let state = start(2);
    const dealer = state.dealer;
    expect(state.current).toBe(dealer);
    expect(state.hand!.betting.seats[dealer].committed).toBe(5);
    expect(state.hand!.betting.seats[1 - dealer].committed).toBe(10);
    state = passive(state);
    state = passive(state);
    expect(state.street).toBe('flop');
    expect(state.current).toBe(1 - dealer);
  });

  it('advances a street even if the dealer folded preflop', () => {
    let state = start(3);
    const dealer = state.dealer;
    const first = state.current!;
    state = move(state, { type: 'ACT', action: { type: first === dealer ? 'FOLD' : 'CALL' } });
    while (state.phase === 'hand' && state.street === 'preflop') {
      if (state.current === dealer) state = move(state, { type: 'ACT', action: { type: 'FOLD' } });
      else state = passive(state);
    }
    expect(state.street).toBe('flop');
    expect(state.hand!.betting.seats[dealer].folded).toBe(true);
  });

  it('rotates past eliminated seats, uses new blind only next hand, and clears stale all-in flags', () => {
    const base = start(3);
    const fixture: Tournament = { ...base, phase: 'result', hand: null, street: null, current: null,
      dealer: 0, stacks: [0, 100, 200], result: { kind: 'uncontested', pots: [], hands: [], winnerSeats: [2] } };
    const next = dispatch(fixture, { type: 'NEXT_HAND', seed: 4, bigBlind: 20 });
    expect(next.dealer).toBe(nextLive(fixture.stacks.map(stack => ({ stack })), 0));
    expect(next.hand?.hole[0]).toBeNull();
    expect(next.hand?.betting.seats[0]).toMatchObject({ stack: 0, allIn: true });
    expect(next.hand?.bigBlind).toBe(20);
    expect(next.hand?.smallBlind).toBe(10);
    expect(base.hand?.bigBlind).toBe(10);
    expect(next.hand?.betting.seats.filter(s => s.stack > 0).every(s => !s.allIn)).toBe(true);
  });

  it('finishes instead of dealing when one player owns all chips', () => {
    const base = start(2);
    const fixture: Tournament = { ...base, phase: 'result', hand: null, street: null, current: null,
      stacks: [0, 200], result: { kind: 'uncontested', pots: [], hands: [], winnerSeats: [1] } };
    const ended = dispatch(fixture, { type: 'NEXT_HAND', seed: 7, bigBlind: 10 });
    expect(ended.phase).toBe('finished');
    expect(ended.hand).toBeNull();
    expect(ended.handNumber).toBe(1);
    expect(ended.result?.winnerSeats).toEqual([1]);
  });

  it('declares the champion after a real all-in showdown', () => {
    let state = start(2, 10);
    state = move(state, { type: 'ACT', action: { type: 'CALL' } });
    expect(state.phase).toBe('result');
    // A tie is possible with community cards; find a seeded hand with a decisive winner.
    if (state.stacks.every(stack => stack > 0)) {
      state = start(2, 10, 28);
      state = move(state, { type: 'ACT', action: { type: 'CALL' } });
    }
    expect(state.stacks.filter(stack => stack > 0)).toHaveLength(1);
    const champion = state.stacks.findIndex(stack => stack > 0);
    state = dispatch(state, { type: 'NEXT_HAND', seed: 3, bigBlind: 10 });
    expect(state.phase).toBe('finished');
    expect(state.result?.winnerSeats).toEqual([champion]);
  });

  it('deals eight unique hands and three burn cards without card reuse', () => {
    const state = complete(start(8));
    expect(state.result?.kind).toBe('showdown');
    const hand = state.hand!;
    const cards = [...hand.hole.flatMap(hole => hole ?? []), ...hand.deck, ...hand.board, ...hand.burned];
    expect(cards).toHaveLength(52);
    expect(new Set(cards.map(card => `${card.rank}${card.suit}`)).size).toBe(52);
  });

  it('returns the identical state for invalid transitions and accepts abandon', () => {
    expect(tournamentReducer(null, { type: 'REVEAL' })).toBeNull();
    for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(tournamentReducer(null, { type: 'START', players: players(2), stack: invalid, bigBlind: 10, id: 't', seed: 1 })).toBeNull();
    }
    expect(tournamentReducer(null, { type: 'START', players: players(2), stack: 9, bigBlind: 10, id: 't', seed: 1 })).toBeNull();
    expect(tournamentReducer(null, { type: 'START', players: players(2), stack: 100, bigBlind: 0, id: 't', seed: 1 })).toBeNull();
    for (const roster of [players(1), players(9), [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }]]) {
      expect(tournamentReducer(null, { type: 'START', players: roster, stack: 100, bigBlind: 10, id: 't', seed: 1 })).toBeNull();
    }
    const state = start();
    expect(tournamentReducer(state, { type: 'START', players: players(2), stack: 100, bigBlind: 10, id: 't', seed: 1 })).toBe(state);
    expect(tournamentReducer(state, { type: 'ACT', action: { type: 'CALL' } })).toBe(state);
    expect(tournamentReducer(state, { type: 'NEXT_HAND', seed: 4, bigBlind: 10 })).toBe(state);
    const revealed = dispatch(state, { type: 'REVEAL' });
    expect(tournamentReducer(revealed, { type: 'REVEAL' })).toBe(revealed);
    expect(tournamentReducer(revealed, { type: 'ACT', action: { type: 'BET_TO', total: -1 } })).toBe(revealed);
    expect(tournamentReducer(revealed, { type: 'ACT', action: { type: 'CHECK' } })).toBe(revealed);
    expect(tournamentReducer(revealed, { type: 'NEXT_HAND', seed: 4, bigBlind: 0 })).toBe(revealed);
    expect(tournamentReducer(state, { type: 'ABANDON' })).toBeNull();
  });
});
