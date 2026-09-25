import { type Card, type Suit, isRed } from './cards';

const BASE_ORDER: readonly Suit[] = ['S', 'H', 'C', 'D'];

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]),
  );
}

function alternations(order: readonly Suit[]): number {
  let count = 0;
  for (let i = 1; i < order.length; i++) {
    if (isRed(order[i]) !== isRed(order[i - 1])) count++;
  }
  return count;
}

export function suitOrder(present: readonly Suit[]): Suit[] {
  const suits = BASE_ORDER.filter(s => present.includes(s));
  let best = suits;
  let bestScore = -1;
  for (const order of permutations(suits)) {
    const score = alternations(order);
    if (score > bestScore) {
      best = order;
      bestScore = score;
    }
  }
  return best;
}

export function sortHand(hand: readonly Card[]): Card[] {
  const order = suitOrder([...new Set(hand.map(c => c.suit))]);
  return hand
    .slice()
    .sort((a, b) => order.indexOf(a.suit) - order.indexOf(b.suit) || b.rank - a.rank);
}
