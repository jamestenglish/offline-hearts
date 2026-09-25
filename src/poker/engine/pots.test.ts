import { describe, expect, it } from 'vitest';
import { parseCardId } from '../../shared/cards';
import type { BetSeat } from './betting';
import { evaluateFive } from './evaluate';
import { awardPots, awardUncontested, buildPots, refundUncalled } from './pots';

function seatsFrom(amounts: number[]): BetSeat[] {
  return amounts.map(amount => ({ stack: 0, streetBet: amount, committed: amount,
    folded: false, allIn: false, actedSinceFullRaise: false, raiseLocked: false }));
}

const low = evaluateFive(['2C', '2D', '4S', '7H', 'JC'].map(parseCardId));
const high = evaluateFive(['AS', 'AD', 'AH', '7C', 'JC'].map(parseCardId));
const weakest = evaluateFive(['2C', '4D', '6S', '8H', 'TC'].map(parseCardId));

describe('pot construction', () => {
  it('splits short all-ins into a main pot and a deeper side pot', () => {
    expect(buildPots(seatsFrom([25, 100, 100]))).toEqual([
      { amount: 75, eligible: [0, 1, 2] },
      { amount: 150, eligible: [1, 2] },
    ]);
  });

  it('includes folded contributions in each tier but excludes folded seats from eligibility', () => {
    const seats = seatsFrom([40, 100, 100]);
    seats[0].folded = true;
    expect(buildPots(seats)).toEqual([
      { amount: 120, eligible: [1, 2] },
      { amount: 120, eligible: [1, 2] },
    ]);
  });

  it('places a folded one-chip contribution in the main tier, not the side tier', () => {
    const seats = seatsFrom([1, 2, 2]);
    seats[0].folded = true;
    expect(buildPots(seats)).toEqual([
      { amount: 3, eligible: [1, 2] },
      { amount: 2, eligible: [1, 2] },
    ]);
  });

  it('refunds only unmatched excess, updating stack, committed and street bet without mutating input', () => {
    const seats = seatsFrom([100, 40]);
    const result = refundUncalled(seats);
    expect(result).toMatchObject({ refund: 60, seat: 0 });
    expect(result.seats[0]).toMatchObject({ stack: 60, committed: 40, streetBet: 40, allIn: false });
    expect(seats[0]).toMatchObject({ stack: 0, committed: 100, streetBet: 100 });
    expect(refundUncalled(seatsFrom([40, 40]))).toMatchObject({ refund: 0, seat: null });
  });

  it('caps a refund to current street chips when prior streets account for the unmatched total', () => {
    const seats = seatsFrom([100, 40]);
    seats[0].streetBet = 10;
    seats[1].streetBet = 0;
    // The betting engine can carry earlier contributions into committed.
    expect(refundUncalled(seats).seats[0].streetBet).toBe(0);
  });
});

describe('showdown payouts', () => {
  it('awards a folded one-chip main tier and its side tier independently', () => {
    const seats = seatsFrom([1, 2, 2]);
    seats[0].folded = true;
    const result = awardPots(seats, 0, new Map([[1, low], [2, low]]));
    expect(result.pots).toEqual([
      { amount: 3, eligible: [1, 2], winners: [1, 2] },
      { amount: 2, eligible: [1, 2], winners: [1, 2] },
    ]);
    expect(result.seats.map(seat => seat.stack)).toEqual([0, 3, 2]);
    expect(result.seats.every(seat => seat.committed === 0 && seat.streetBet === 0)).toBe(true);
    expect(seats.map(seat => seat.committed)).toEqual([1, 2, 2]);
  });

  it('splits a tied five-chip main pot 3/2 with the odd chip clockwise left of dealer', () => {
    const seats = seatsFrom([1, 1, 1, 1, 1]);
    seats[2].folded = true;
    seats[3].folded = true;
    seats[4].folded = true;
    const result = awardPots(seats, 0, new Map([[0, low], [1, low]]));
    expect(result.pots).toEqual([{ amount: 5, eligible: [0, 1], winners: [1, 0] }]);
    expect(result.seats.map(seat => seat.stack)).toEqual([2, 3, 0, 0, 0]);
  });

  it('starts odd-chip distribution at dealer+1, even when that is not the smallest seat index', () => {
    const seats = seatsFrom([2, 2, 1]);
    seats[2].folded = true;
    const result = awardPots(seats, 1, new Map([[0, low], [1, low]]));
    expect(result.seats.map(seat => seat.stack)).toEqual([3, 2, 0]);
    expect(result.pots[0].winners).toEqual([0, 1]);
  });

  it('awards main and side pots to different hands and preserves all chips including a refund', () => {
    const seats = seatsFrom([25, 100, 100]);
    seats[0].stack = 8;
    seats[1].stack = 9;
    seats[2].stack = 10;
    const result = awardPots(seats, 2, new Map([[0, high], [1, weakest], [2, low]]));
    expect(result.pots).toEqual([
      { amount: 75, eligible: [0, 1, 2], winners: [0] },
      { amount: 150, eligible: [1, 2], winners: [2] },
    ]);
    expect(result.seats.map(seat => seat.stack)).toEqual([83, 9, 160]);
    expect(result.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(252);
  });

  it('handles one all-in against two zero-stack opponents without an unmatched refund', () => {
    const seats = seatsFrom([20, 20, 20]);
    seats.forEach(seat => { seat.allIn = true; });
    const result = awardPots(seats, 0, new Map([[0, high], [1, low], [2, low]]));
    expect(result.pots).toEqual([{ amount: 60, eligible: [0, 1, 2], winners: [0] }]);
    expect(result.seats.map(seat => seat.stack)).toEqual([60, 0, 0]);
    expect(result.seats.map(seat => seat.allIn)).toEqual([false, true, true]);
  });

  it('refunds an unmatched bet before distributing the contested pot', () => {
    const seats = seatsFrom([100, 40]);
    const result = awardPots(seats, 0, new Map([[0, low], [1, high]]));
    expect(result.pots).toEqual([{ amount: 80, eligible: [0, 1], winners: [1] }]);
    expect(result.seats.map(seat => seat.stack)).toEqual([60, 80]);
  });
});

describe('uncontested payout', () => {
  it('refunds excess and awards all committed chips without needing hand ranks', () => {
    const seats = seatsFrom([100, 40, 40]);
    seats[1].folded = true;
    seats[2].folded = true;
    const result = awardUncontested(seats, 0);
    expect(result.map(seat => seat.stack)).toEqual([180, 0, 0]);
    expect(result.every(seat => seat.committed === 0 && seat.streetBet === 0)).toBe(true);
    expect(seats[0].committed).toBe(100);
  });
});
