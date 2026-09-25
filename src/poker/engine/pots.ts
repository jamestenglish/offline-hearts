import type { BetSeat } from './betting';
import { compareHands, type HandRank } from './evaluate';

export interface Pot {
  amount: number;
  eligible: number[];
}

export function refundUncalled(seats: readonly BetSeat[]): { seats: BetSeat[]; refund: number; seat: number | null } {
  const copy = seats.map(seat => ({ ...seat }));
  const sorted = seats.map((seat, index) => ({ amount: seat.committed, index }))
    .sort((a, b) => b.amount - a.amount);
  if (sorted.length === 0 || sorted[0].amount <= (sorted[1]?.amount ?? 0)) {
    return { seats: copy, refund: 0, seat: null };
  }
  const { index } = sorted[0];
  const refund = sorted[0].amount - (sorted[1]?.amount ?? 0);
  copy[index].stack += refund;
  copy[index].committed -= refund;
  copy[index].streetBet = Math.max(0, copy[index].streetBet - refund);
  if (copy[index].stack > 0) copy[index].allIn = false;
  return { seats: copy, refund, seat: index };
}

export function buildPots(seats: readonly BetSeat[]): Pot[] {
  const levels = [...new Set(seats.map(seat => seat.committed).filter(amount => amount > 0))]
    .sort((a, b) => a - b);
  let previous = 0;
  return levels.map(level => {
    const contributors = seats.flatMap((seat, index) => seat.committed >= level ? [index] : []);
    const amount = (level - previous) * contributors.length;
    previous = level;
    return { amount, eligible: contributors.filter(index => !seats[index].folded) };
  });
}

export function awardPots(seats: readonly BetSeat[], dealer: number, ranks: ReadonlyMap<number, HandRank>):
  { seats: BetSeat[]; pots: { amount: number; eligible: number[]; winners: number[] }[] } {
  const refunded = refundUncalled(seats).seats;
  const pots = buildPots(refunded).map(pot => {
    if (pot.eligible.length === 0) throw new Error('Pot has no eligible winner');
    let best: HandRank | undefined;
    let winners: number[] = [];
    for (const index of pot.eligible) {
      const rank = ranks.get(index);
      if (!rank) throw new Error(`Missing hand rank for seat ${index}`);
      const comparison = best ? compareHands(rank, best) : 1;
      if (comparison > 0) {
        best = rank;
        winners = [index];
      } else if (comparison === 0) winners.push(index);
    }
    winners.sort((a, b) =>
      (a - dealer - 1 + refunded.length) % refunded.length -
      (b - dealer - 1 + refunded.length) % refunded.length);
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount % winners.length;
    for (const index of winners) refunded[index].stack += share + (remainder-- > 0 ? 1 : 0);
    return { ...pot, winners };
  });
  return { seats: clearContributions(refunded), pots };
}

function clearContributions(seats: BetSeat[]): BetSeat[] {
  return seats.map(seat => ({ ...seat, committed: 0, streetBet: 0, allIn: seat.stack === 0 }));
}

export function awardUncontested(seats: readonly BetSeat[], winner: number): BetSeat[] {
  const refunded = refundUncalled(seats).seats;
  refunded[winner].stack += refunded.reduce((sum, seat) => sum + seat.committed, 0);
  return clearContributions(refunded);
}
