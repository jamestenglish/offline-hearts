import { describe, expect, it } from 'vitest';
import { cardId, parseCardId } from '../../shared/cards';
import { bestOfSeven, compareHands, evaluateFive } from './evaluate';

const hand = (ids: string[]) => ids.map(parseCardId);

describe('evaluateFive', () => {
  it.each([
    { ids: ['AS', 'KD', '9C', '6H', '2S'], category: 0, tiebreak: [14, 13, 9, 6, 2] },
    { ids: ['AS', 'AD', 'KC', '9H', '2S'], category: 1, tiebreak: [14, 13, 9, 2] },
    { ids: ['AS', 'AD', 'KC', 'KH', '2S'], category: 2, tiebreak: [14, 13, 2] },
    { ids: ['AS', 'AD', 'AC', 'KH', '2S'], category: 3, tiebreak: [14, 13, 2] },
    { ids: ['AS', '2D', '3C', '4H', '5S'], category: 4, tiebreak: [5] },
    { ids: ['AS', 'KS', '9S', '6S', '2S'], category: 5, tiebreak: [14, 13, 9, 6, 2] },
    { ids: ['AS', 'AD', 'AC', 'KH', 'KS'], category: 6, tiebreak: [14, 13] },
    { ids: ['AS', 'AD', 'AC', 'AH', 'KS'], category: 7, tiebreak: [14, 13] },
    { ids: ['5S', '6S', '7S', '8S', '9S'], category: 8, tiebreak: [9] },
  ] as const)('ranks $ids as category $category', ({ ids, category, tiebreak }) => {
    const cards = hand([...ids]);
    const result = evaluateFive(cards);
    expect(result.category).toBe(category);
    expect(result.tiebreak).toEqual(tiebreak);
    expect(result.bestFive.map(cardId)).toEqual([...ids]);
  });

  it('labels an ace-high straight flush royal', () => {
    const result = evaluateFive(hand(['10S', 'JS', 'QS', 'KS', 'AS']));
    expect(result.category).toBe(8);
    expect(result.tiebreak).toEqual([14]);
    expect(result.label).toBe('Royal Flush');
  });

  it('recognizes an ace-high straight distinct from a wheel', () => {
    expect(evaluateFive(hand(['10C', 'JD', 'QH', 'KS', 'AS'])).tiebreak).toEqual([14]);
  });

  it('does not call a flush with nonconsecutive ranks a straight flush', () => {
    expect(evaluateFive(hand(['AS', 'KS', 'QS', 'JS', '9S'])).category).toBe(5);
  });

  it('requires exactly five cards', () => {
    expect(() => evaluateFive(hand(['AS', 'KS', 'QS', 'JS']))).toThrow();
    expect(() => evaluateFive(hand(['AS', 'KS', 'QS', 'JS', '9S', '2D']))).toThrow();
  });
});

describe('compareHands', () => {
  it('ranks quads over a full house', () => {
    expect(compareHands(
      evaluateFive(hand(['2S', '2D', '2H', '2C', 'AS'])),
      evaluateFive(hand(['AS', 'AD', 'AC', 'KH', 'KS'])),
    )).toBeGreaterThan(0);
  });

  it('uses both pair ranks and then the kicker', () => {
    const higherSecondPair = evaluateFive(hand(['AS', 'AD', 'KC', 'KH', '2S']));
    const lowerSecondPair = evaluateFive(hand(['AS', 'AD', 'QC', 'QH', 'JS']));
    const higherKicker = evaluateFive(hand(['AC', 'AH', 'KS', 'KD', '3C']));
    expect(compareHands(higherSecondPair, lowerSecondPair)).toBeGreaterThan(0);
    expect(compareHands(higherSecondPair, higherKicker)).toBeLessThan(0);
  });

  it('uses all kickers for equal pairs and does not use suits', () => {
    const stronger = evaluateFive(hand(['AS', 'AD', 'KC', '9H', '3S']));
    const weaker = evaluateFive(hand(['AC', 'AH', 'KS', '9D', '2C']));
    const sameRanks = evaluateFive(hand(['AH', 'AC', 'KD', '9S', '3H']));
    expect(compareHands(stronger, weaker)).toBeGreaterThan(0);
    expect(compareHands(stronger, sameRanks)).toBe(0);
  });

  it('compares straight highs rather than treating ace in the wheel as high', () => {
    expect(compareHands(
      evaluateFive(hand(['AS', '2D', '3C', '4H', '5S'])),
      evaluateFive(hand(['2S', '3D', '4C', '5H', '6S'])),
    )).toBeLessThan(0);
  });
});

describe('bestOfSeven', () => {
  it('takes the strongest of the 21 five-card choices', () => {
    const result = bestOfSeven(hand(['2C', '3D', '10S', 'JS', 'QS', 'KS', 'AS']));
    expect(result.category).toBe(8);
    expect(result.bestFive.map(cardId)).toEqual(['10S', 'JS', 'QS', 'KS', 'AS']);
    expect(result.bestFive).toHaveLength(5);
  });

  it('chooses a full house over two available triplets', () => {
    const result = bestOfSeven(hand(['AS', 'AD', 'AC', 'KH', 'KS', 'KC', '2D']));
    expect(result.category).toBe(6);
    expect(result.tiebreak).toEqual([14, 13]);
    expect(result.bestFive.map(cardId)).toEqual(['AS', 'AD', 'AC', 'KH', 'KS']);
  });

  it('keeps the first equal-scoring choice in input order', () => {
    const result = bestOfSeven(hand(['AS', 'AD', 'KC', 'KH', '3C', '3D', '2S']));
    expect(result.bestFive.map(cardId)).toEqual(['AS', 'AD', 'KC', 'KH', '3C']);
  });

  it('ties when the best hand is entirely on the board', () => {
    expect(compareHands(
      bestOfSeven(hand(['2C', '3D', '10S', 'JS', 'QS', 'KS', 'AS'])),
      bestOfSeven(hand(['4C', '5D', '10S', 'JS', 'QS', 'KS', 'AS'])),
    )).toBe(0);
  });

  it('requires exactly seven cards', () => {
    expect(() => bestOfSeven(hand(['AS', 'KS', 'QS', 'JS', '10S', '2D']))).toThrow();
    expect(() => bestOfSeven(hand(['AS', 'KS', 'QS', 'JS', '10S', '2D', '3C', '4H']))).toThrow();
  });
});
