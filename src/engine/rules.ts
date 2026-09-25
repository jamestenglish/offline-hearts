import { type Card, cardId, cardPoints, TWO_OF_CLUBS } from './cards';

export interface TrickCard {
  seat: number;
  card: Card;
}

export interface Trick {
  leader: number;
  cards: TrickCard[];
}

export interface PlayContext {
  hand: readonly Card[];
  trick: Trick;
  firstTrick: boolean;
  heartsBroken: boolean;
}

export function legalPlays({ hand, trick, firstTrick, heartsBroken }: PlayContext): Card[] {
  if (trick.cards.length === 0) {
    if (firstTrick) {
      const two = hand.filter(c => cardId(c) === TWO_OF_CLUBS);
      if (two.length) return two;
    }
    if (!heartsBroken) {
      const nonHearts = hand.filter(c => c.suit !== 'H');
      if (nonHearts.length) return nonHearts;
    }
    return hand.slice();
  }

  const led = trick.cards[0].card.suit;
  const following = hand.filter(c => c.suit === led);
  if (following.length) return following;

  if (firstTrick) {
    const safe = hand.filter(c => cardPoints(c) === 0);
    if (safe.length) return safe;
  }
  return hand.slice();
}

export function trickWinner(trick: Trick): number {
  const led = trick.cards[0].card.suit;
  let best = trick.cards[0];
  for (const played of trick.cards) {
    if (played.card.suit === led && played.card.rank > best.card.rank) best = played;
  }
  return best.seat;
}

export function trickPoints(trick: Trick): number {
  return trick.cards.reduce((sum, played) => sum + cardPoints(played.card), 0);
}

export function findTwoOfClubs(hands: readonly (readonly Card[])[]): number {
  return hands.findIndex(hand => hand.some(c => cardId(c) === TWO_OF_CLUBS));
}
