import { describe, expect, it } from 'vitest';
import {
  cardId, cardLabel, cardPoints, deal, isRed, mulberry32, newDeck, parseCardId, shuffle,
} from './cards';

describe('cards', () => {
  it('builds a 52-card deck of unique cards', () => {
    const ids = newDeck().map(cardId);
    expect(ids).toHaveLength(52);
    expect(new Set(ids).size).toBe(52);
  });

  it('formats and parses ids', () => {
    expect(cardId({ suit: 'H', rank: 10 })).toBe('10H');
    expect(cardId({ suit: 'S', rank: 12 })).toBe('QS');
    expect(parseCardId('10H')).toEqual({ suit: 'H', rank: 10 });
    expect(parseCardId('AS')).toEqual({ suit: 'S', rank: 14 });
    expect(parseCardId('2C')).toEqual({ suit: 'C', rank: 2 });
    expect(cardLabel({ suit: 'S', rank: 12 })).toBe('Q♠');
  });

  it('scores hearts 1 and the queen of spades 13, totalling 26', () => {
    expect(cardPoints({ suit: 'H', rank: 2 })).toBe(1);
    expect(cardPoints({ suit: 'S', rank: 12 })).toBe(13);
    expect(cardPoints({ suit: 'S', rank: 13 })).toBe(0);
    expect(newDeck().reduce((sum, c) => sum + cardPoints(c), 0)).toBe(26);
  });

  it('knows red suits', () => {
    expect(isRed('H')).toBe(true);
    expect(isRed('D')).toBe(true);
    expect(isRed('S')).toBe(false);
    expect(isRed('C')).toBe(false);
  });

  it('shuffles without mutating the input', () => {
    const deck = newDeck();
    const before = deck.map(cardId);
    const out = shuffle(deck, mulberry32(1));
    expect(deck.map(cardId)).toEqual(before);
    expect(out.map(cardId).sort()).toEqual([...before].sort());
    expect(out.map(cardId)).not.toEqual(before);
  });

  it('deals 4 hands of 13 deterministically by seed', () => {
    const hands = deal(42);
    expect(hands).toHaveLength(4);
    hands.forEach(h => expect(h).toHaveLength(13));
    expect(new Set(hands.flat().map(cardId)).size).toBe(52);
    expect(deal(42)).toEqual(hands);
    expect(deal(43)).not.toEqual(hands);
  });
});
