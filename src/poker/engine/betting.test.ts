import { describe, expect, it } from 'vitest';
import { act, legalActions, roundComplete, type BetSeat, type BettingState } from './betting';

function seat(stack = 100, streetBet = 0): BetSeat {
  return { stack, streetBet, committed: streetBet, folded: false, allIn: stack === 0,
    actedSinceFullRaise: false, raiseLocked: false };
}

function game(seats: BetSeat[], pending = seats.map((_, index) => index), current: number | null = pending[0] ?? null,
  currentBet = Math.max(0, ...seats.map(s => s.streetBet))): BettingState {
  return { seats, currentBet, lastFullRaise: 10, pending, current, bigBlind: 10 };
}

function move(state: BettingState, action: Parameters<typeof act>[1]): BettingState {
  const chips = state.seats.reduce((sum, s) => sum + s.stack + s.committed, 0);
  const next = act(state, action);
  expect(next).not.toBe(state);
  expect(next.seats.reduce((sum, s) => sum + s.stack + s.committed, 0)).toBe(chips);
  return next;
}

describe('no-limit betting', () => {
  it('checks for free, prohibits folding without a bet, and completes after everyone checks', () => {
    const start = game([seat(), seat()]);
    expect(legalActions(start)).toMatchObject({ check: true, call: null, fold: false, minTotal: 10, maxTotal: 100 });
    expect(act(start, { type: 'FOLD' })).toBe(start);
    expect(act(start, { type: 'CALL' })).toBe(start);
    const checked = move(start, { type: 'CHECK' });
    expect(checked.pending).toEqual([1]);
    expect(checked.current).toBe(1);
    expect(checked.seats[0].actedSinceFullRaise).toBe(true);
    expect(roundComplete(checked)).toBe(false);
    const done = move(checked, { type: 'CHECK' });
    expect(done.pending).toEqual([]);
    expect(done.current).toBeNull();
    expect(roundComplete(done)).toBe(true);
  });

  it('caps calls by stack and keeps street contributions independent of committed chips', () => {
    const start = game([seat(4, 3), seat(90, 10)], [0, 1], 0, 10);
    expect(legalActions(start)).toMatchObject({ check: false, call: 4, fold: true, allIn: true, minTotal: null, maxTotal: 7 });
    const called = move(start, { type: 'CALL' });
    expect(called.seats[0]).toMatchObject({ stack: 0, streetBet: 7, committed: 7, allIn: true });
    expect(called.pending).toEqual([]);
    expect(roundComplete(called)).toBe(true);
  });

  it('lets the big blind check after callers, including a short blind using the full blind raise minimum', () => {
    const start = game([seat(100), seat(95, 5), seat(90, 10)], [0, 1, 2], 0, 10);
    expect(legalActions(start).call).toBe(10);
    expect(act(start, { type: 'BET_TO', total: 9 })).toBe(start);
    const first = move(start, { type: 'CALL' });
    const second = move(first, { type: 'CALL' });
    expect(second.current).toBe(2);
    expect(legalActions(second)).toMatchObject({ check: true, call: null });
    expect(roundComplete(move(second, { type: 'CHECK' }))).toBe(true);

    const shortBlind = game([seat(100), seat(0, 7)], [0], 0, 7);
    expect(legalActions(shortBlind).minTotal).toBeNull(); // no opponent able to call
    expect(shortBlind.lastFullRaise).toBe(10);
    const multiwayShortBlind = game([seat(100), seat(100), seat(0, 7)], [0, 1], 0, 7);
    expect(legalActions(multiwayShortBlind).minTotal).toBe(17);
    expect(act(multiwayShortBlind, { type: 'BET_TO', total: 16 })).toBe(multiwayShortBlind);
  });

  it('full raises reopen action clockwise and reset previous action flags', () => {
    const start = game([seat(100), seat(95, 5), seat(90, 10)], [0, 1, 2], 0, 10);
    const raised = move(start, { type: 'BET_TO', total: 30 });
    expect(raised.lastFullRaise).toBe(20);
    expect(raised.pending).toEqual([1, 2]);
    expect(raised.current).toBe(1);
    expect(raised.seats[0]).toMatchObject({ stack: 70, streetBet: 30, committed: 30 });
    const called = move(raised, { type: 'CALL' });
    const reraised = move(called, { type: 'BET_TO', total: 55 });
    expect(reraised.lastFullRaise).toBe(25);
    expect(reraised.pending).toEqual([0, 1]);
    expect(reraised.seats[1]).toMatchObject({ actedSinceFullRaise: false, raiseLocked: false });
    expect(legalActions(reraised).minTotal).toBe(80);
  });

  it('short all-in requeues prior callers to call or fold, but does not reopen their raises', () => {
    const start = game([seat(100, 10), seat(5, 10), seat(100, 10)], [0, 1, 2], 0, 10);
    const first = move(start, { type: 'CHECK' });
    const short = move(first, { type: 'ALL_IN' });
    expect(short.currentBet).toBe(15);
    expect(short.lastFullRaise).toBe(10);
    expect(short.pending).toEqual([2, 0]);
    expect(short.seats[0]).toMatchObject({ actedSinceFullRaise: true, raiseLocked: true });
    const called = move(short, { type: 'CALL' });
    expect(legalActions(called)).toMatchObject({ call: 5, fold: true, minTotal: null, allIn: false });
    expect(act(called, { type: 'BET_TO', total: 25 })).toBe(called);
    expect(act(called, { type: 'ALL_IN' })).toBe(called);
    expect(roundComplete(move(called, { type: 'CALL' }))).toBe(true);
  });

  it('a full raise after a short all-in reopens the previously locked player', () => {
    const start = game([seat(100, 10), seat(5, 10), seat(100, 10)], [0, 1, 2], 0, 10);
    const checked = move(start, { type: 'CHECK' });
    const short = move(checked, { type: 'ALL_IN' });
    expect(short.seats[0].raiseLocked).toBe(true);
    expect(legalActions(short).minTotal).toBe(25);
    const raised = move(short, { type: 'BET_TO', total: 25 });
    expect(raised.pending).toEqual([0]);
    expect(raised.seats[0]).toMatchObject({ actedSinceFullRaise: false, raiseLocked: false });
    expect(raised.lastFullRaise).toBe(10);
    expect(legalActions(raised)).toMatchObject({ call: 15, minTotal: 35 });
    expect(roundComplete(move(raised, { type: 'CALL' }))).toBe(true);
  });

  it('folds only when facing a bet, preserving previous contributions', () => {
    const start = game([seat(95, 5), seat(90, 10)], [0], 0, 10);
    const folded = move(start, { type: 'FOLD' });
    expect(folded.seats[0]).toMatchObject({ stack: 95, streetBet: 5, committed: 5, folded: true });
    expect(folded.current).toBeNull();
    expect(roundComplete(folded)).toBe(true);
  });

  it('a prior checker can answer a later opening bet and a full raise unlocks them again', () => {
    const start = game([seat(), seat(), seat()]);
    const checked = move(start, { type: 'CHECK' });
    const bet = move(checked, { type: 'BET_TO', total: 10 });
    expect(bet.pending).toEqual([2, 0]);
    expect(bet.seats[0].raiseLocked).toBe(false);
    const raised = move(bet, { type: 'BET_TO', total: 20 });
    expect(raised.pending).toEqual([0, 1]);
    expect(legalActions(raised).minTotal).toBe(30);
  });

  it('does not allow an uncallable new bet or raise, but allows matching an existing all-in', () => {
    const lone = game([seat(), seat(0)], [0], 0);
    expect(legalActions(lone)).toMatchObject({ allIn: false, minTotal: null });
    expect(act(lone, { type: 'ALL_IN' })).toBe(lone);
    expect(act(lone, { type: 'BET_TO', total: 10 })).toBe(lone);
    expect(roundComplete(lone)).toBe(true);
    expect(legalActions(lone)).toMatchObject({ check: false, call: null, allIn: false, minTotal: null });
    expect(act(lone, { type: 'CHECK' })).toBe(lone);
    const facing = game([seat(100), seat(0, 20)], [0], 0, 20);
    expect(legalActions(facing)).toMatchObject({ call: 20, fold: true, allIn: false, minTotal: null });
    expect(roundComplete(facing)).toBe(false);
    expect(roundComplete(move(facing, { type: 'CALL' }))).toBe(true);
  });

  it('rejects missing, fractional, negative, over-stack, under-minimum and non-finite totals by identity', () => {
    const start = game([seat(100), seat(100)]);
    for (const total of [undefined, -1, 0, 9, 10.5, 101, NaN, Infinity]) {
      expect(act(start, { type: 'BET_TO', total })).toBe(start);
    }
    expect(act(start, { type: 'CHECK', total: 1 })).toBe(start);
    expect(act(start, { type: 'ALL_IN', total: 10 })).toBe(start);
    const bet = move(start, { type: 'BET_TO', total: 10 });
    expect(act(bet, { type: 'CHECK' })).toBe(bet);
    expect(act(bet, { type: 'BET_TO', total: 19 })).toBe(bet);
    expect(act(bet, { type: 'BET_TO', total: 101 })).toBe(bet);
  });

  it('short all-in opening bet can be raised by prior checkers and all-in below minimum is permitted', () => {
    const start = game([seat(100), seat(6), seat(100)]);
    const checked = move(start, { type: 'CHECK' });
    const short = move(checked, { type: 'ALL_IN' });
    expect(short.lastFullRaise).toBe(10);
    expect(short.pending).toEqual([2, 0]);
    expect(short.seats[0].raiseLocked).toBe(false);
    expect(legalActions(move(short, { type: 'CALL' })).minTotal).toBe(16);
  });
});
