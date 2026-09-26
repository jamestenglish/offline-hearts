import { mulberry32, newDeck, shuffle, type Card } from '../../shared/cards';

export interface HandDeal {
  hole: (Card[] | null)[];
  deck: Card[];
  board: Card[];
  burned: Card[];
}

function liveSeats(seats: readonly { stack: number }[]): number[] {
  const live = seats.flatMap((seat, index) => seat.stack > 0 ? [index] : []);
  if (live.length < 2) throw new Error('At least two live seats are required');
  return live;
}

export function nextLive(seats: readonly { stack: number }[], from: number): number {
  liveSeats(seats);
  for (let offset = 1; offset <= seats.length; offset++) {
    const index = (from + offset) % seats.length;
    if (seats[index].stack > 0) return index;
  }
  throw new Error('No live seat found');
}

export function firstDealer(seats: readonly { stack: number }[], seed: number): number {
  const live = liveSeats(seats);
  return live[Math.floor(mulberry32(seed)() * live.length)];
}

export function positions(seats: readonly { stack: number }[], dealer: number): {
  small: number; big: number; preflopFirst: number; postflopFirst: number;
} {
  const live = liveSeats(seats);
  if (seats[dealer]?.stack <= 0 || !seats[dealer]) throw new Error('Dealer must be live');
  const small = live.length === 2 ? dealer : nextLive(seats, dealer);
  const big = nextLive(seats, small);
  return { small, big, preflopFirst: nextLive(seats, big), postflopFirst: nextLive(seats, dealer) };
}

export function dealHand(seats: readonly { stack: number }[], dealer: number, seed: number): HandDeal {
  const live = liveSeats(seats);
  if (seats[dealer]?.stack <= 0 || !seats[dealer]) throw new Error('Dealer must be live');
  if (live.length > 22) throw new Error('Not enough cards for a complete hand');
  const deck = shuffle(newDeck(), mulberry32(seed));
  const hole: (Card[] | null)[] = seats.map(seat => seat.stack > 0 ? [] : null);
  let current = dealer;
  for (let round = 0; round < 2; round++) {
    for (let count = 0; count < live.length; count++) {
      current = nextLive(seats, current);
      hole[current]!.push(deck.shift()!);
    }
  }
  return { hole, deck, board: [], burned: [] };
}

export function revealStreet(hand: HandDeal, street: 'flop' | 'turn' | 'river'): HandDeal {
  const count = street === 'flop' ? 3 : 1;
  if (hand.deck.length < count + 1) throw new Error('Not enough cards for street');
  return {
    hole: hand.hole.map(cards => cards?.slice() ?? null),
    deck: hand.deck.slice(count + 1),
    board: [...hand.board, ...hand.deck.slice(1, count + 1)],
    burned: [...hand.burned, hand.deck[0]],
  };
}
