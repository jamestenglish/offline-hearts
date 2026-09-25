import { describe, expect, it } from 'vitest';
import { cardId, mulberry32, newDeck, shuffle } from '../../shared/cards';
import { dealHand, firstDealer, nextLive, positions, revealStreet } from './seats';

const live = [{ stack: 100 }, { stack: 0 }, { stack: 100 }, { stack: 0 }, { stack: 100 }];

function expectCompleteDeck(hand: ReturnType<typeof dealHand>) {
  const cards = [...hand.hole.flatMap(cards => cards ?? []), ...hand.deck, ...hand.board, ...hand.burned];
  expect(cards).toHaveLength(52);
  expect(new Set(cards.map(cardId)).size).toBe(52);
}

describe('clockwise seats', () => {
  it('skips eliminated seats and wraps around', () => {
    expect(nextLive(live, 0)).toBe(2);
    expect(nextLive(live, 2)).toBe(4);
    expect(nextLive(live, 4)).toBe(0);
    expect(nextLive(live, 1)).toBe(2);
  });

  it('positions blinds and first actors for three players', () => {
    expect(positions(live, 0)).toEqual({ small: 2, big: 4, preflopFirst: 0, postflopFirst: 2 });
  });

  it('positions the heads-up dealer as small blind and first preflop actor', () => {
    expect(positions([{ stack: 100 }, { stack: 100 }], 0)).toEqual({
      small: 0, big: 1, preflopFirst: 0, postflopFirst: 1,
    });
  });

  it('selects the seeded dealer from only live seats in seat order', () => {
    for (const seed of [0, 1, 2, 99, 12345]) {
      const index = Math.floor(mulberry32(seed)() * 3);
      expect(firstDealer(live, seed)).toBe([0, 2, 4][index]);
    }
  });

  it('rejects tables without two live seats instead of looping forever', () => {
    for (const seats of [[], [{ stack: 0 }, { stack: 0 }], [{ stack: 1 }, { stack: 0 }]]) {
      expect(() => nextLive(seats, 0)).toThrow();
      expect(() => firstDealer(seats, 1)).toThrow();
      expect(() => positions(seats, 0)).toThrow();
      expect(() => dealHand(seats, 0, 1)).toThrow();
    }
  });

  it('rejects deals that cannot leave room for the board and burns', () => {
    expect(() => dealHand(Array.from({ length: 23 }, () => ({ stack: 1 })), 0, 1)).toThrow();
  });
});

describe('dealing and streets', () => {
  it('deals one card per round clockwise from the dealer to live seats only', () => {
    const hand = dealHand(live, 0, 42);
    const shuffled = shuffle(newDeck(), mulberry32(42));
    expect(hand.hole.map(cards => cards?.map(cardId) ?? null)).toEqual([
      [cardId(shuffled[2]), cardId(shuffled[5])], null,
      [cardId(shuffled[0]), cardId(shuffled[3])], null,
      [cardId(shuffled[1]), cardId(shuffled[4])],
    ]);
    expect(hand.deck.map(cardId)).toEqual(shuffled.slice(6).map(cardId));
    expect(hand.board).toEqual([]);
    expect(hand.burned).toEqual([]);
    expectCompleteDeck(hand);
  });

  it('burns before each street, exposes 3/1/1 board cards, and preserves previous states', () => {
    const dealt = dealHand([{ stack: 100 }, { stack: 100 }], 0, 7);
    const originalDeck = dealt.deck.map(cardId);
    const flop = revealStreet(dealt, 'flop');
    const turn = revealStreet(flop, 'turn');
    const river = revealStreet(turn, 'river');
    expect(flop.burned.map(cardId)).toEqual([originalDeck[0]]);
    expect(flop.board.map(cardId)).toEqual(originalDeck.slice(1, 4));
    expect(turn.burned.map(cardId)).toEqual([originalDeck[0], originalDeck[4]]);
    expect(turn.board.map(cardId)).toEqual([...originalDeck.slice(1, 4), originalDeck[5]]);
    expect(river.burned.map(cardId)).toEqual([originalDeck[0], originalDeck[4], originalDeck[6]]);
    expect(river.board.map(cardId)).toEqual([...originalDeck.slice(1, 4), originalDeck[5], originalDeck[7]]);
    expect(river.deck.map(cardId)).toEqual(originalDeck.slice(8));
    expect(dealt.deck.map(cardId)).toEqual(originalDeck);
    expect(dealt.board).toEqual([]);
    expect(dealt.burned).toEqual([]);
    expect(flop.board).toHaveLength(3);
    expect(flop.hole).not.toBe(dealt.hole);
    expect(flop.hole[0]).not.toBe(dealt.hole[0]);
    for (const state of [dealt, flop, turn, river]) expectCompleteDeck(state);
  });

  it('repeats the same hole cards and deck for the same seed', () => {
    expect(dealHand(live, 4, 123)).toEqual(dealHand(live, 4, 123));
    expect(dealHand(live, 4, 123).deck).not.toEqual(dealHand(live, 4, 124).deck);
  });
});
