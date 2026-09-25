import type { Card } from '../../shared/cards';

export interface HandRank {
  category: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  tiebreak: number[];
  label: string;
  bestFive: Card[];
}

function straightHigh(ranks: number[]): number | undefined {
  if (ranks.length !== 5) return undefined;
  const descending = [...ranks].sort((a, b) => b - a);
  if (descending.every((rank, index) => index === 0 || descending[index - 1] - rank === 1)) {
    return descending[0];
  }
  if (descending.join(',') === '14,5,4,3,2') return 5;
  return undefined;
}

export function evaluateFive(cards: readonly Card[]): HandRank {
  if (cards.length !== 5) throw new RangeError('A five-card hand must contain exactly five cards');

  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const groups = [...counts].map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const flush = cards.every(card => card.suit === cards[0].suit);
  const straight = straightHigh([...counts.keys()]);
  const sortedRanks = [...cards].map(card => card.rank).sort((a, b) => b - a);

  let category: HandRank['category'];
  let tiebreak: number[];
  let label: string;
  if (flush && straight !== undefined) {
    category = 8;
    tiebreak = [straight];
    label = straight === 14 ? 'Royal Flush' : 'Straight Flush';
  } else if (groups[0].count === 4) {
    category = 7;
    tiebreak = groups.map(group => group.rank);
    label = 'Four of a Kind';
  } else if (groups[0].count === 3 && groups[1].count === 2) {
    category = 6;
    tiebreak = groups.map(group => group.rank);
    label = 'Full House';
  } else if (flush) {
    category = 5;
    tiebreak = sortedRanks;
    label = 'Flush';
  } else if (straight !== undefined) {
    category = 4;
    tiebreak = [straight];
    label = 'Straight';
  } else if (groups[0].count === 3) {
    category = 3;
    tiebreak = groups.map(group => group.rank);
    label = 'Three of a Kind';
  } else if (groups[0].count === 2 && groups[1].count === 2) {
    category = 2;
    tiebreak = groups.map(group => group.rank);
    label = 'Two Pair';
  } else if (groups[0].count === 2) {
    category = 1;
    tiebreak = groups.map(group => group.rank);
    label = 'One Pair';
  } else {
    category = 0;
    tiebreak = sortedRanks;
    label = 'High Card';
  }

  return { category, tiebreak, label, bestFive: [...cards] };
}

export function compareHands(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < a.tiebreak.length; i++) {
    const difference = a.tiebreak[i] - b.tiebreak[i];
    if (difference !== 0) return difference;
  }
  return 0;
}

export function bestOfSeven(cards: readonly Card[]): HandRank {
  if (cards.length !== 7) throw new RangeError('A seven-card hand must contain exactly seven cards');

  let best: HandRank | undefined;
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 4; b++) {
      for (let c = b + 1; c < 5; c++) {
        for (let d = c + 1; d < 6; d++) {
          for (let e = d + 1; e < 7; e++) {
            const candidate = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareHands(candidate, best) > 0) best = candidate;
          }
        }
      }
    }
  }
  return best!;
}
