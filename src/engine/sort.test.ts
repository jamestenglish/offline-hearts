import { describe, expect, it } from 'vitest';
import { cardId, parseCardId } from './cards';
import { sortHand, suitOrder } from './sort';

const hand = (ids: string[]) => ids.map(parseCardId);

describe('suitOrder', () => {
  it('alternates colours with all four suits', () => {
    expect(suitOrder(['C', 'D', 'H', 'S'])).toEqual(['S', 'H', 'C', 'D']);
  });
  it('alternates when two reds and one black are present', () => {
    expect(suitOrder(['H', 'D', 'C'])).toEqual(['H', 'C', 'D']);
  });
  it('alternates when two blacks and one red are present', () => {
    expect(suitOrder(['S', 'C', 'D'])).toEqual(['S', 'D', 'C']);
  });
  it('keeps base order when alternation is impossible', () => {
    expect(suitOrder(['D', 'H'])).toEqual(['H', 'D']);
    expect(suitOrder(['C', 'S'])).toEqual(['S', 'C']);
  });
  it('handles a single suit', () => {
    expect(suitOrder(['D'])).toEqual(['D']);
  });
});

describe('sortHand', () => {
  it('groups by alternating suit, high to low within each suit', () => {
    const sorted = sortHand(hand(['2C', 'AH', '10S', 'KD', 'QS', '3H', 'JC', '4D']));
    expect(sorted.map(cardId)).toEqual(['QS', '10S', 'AH', '3H', 'JC', '2C', 'KD', '4D']);
  });
  it('does not mutate its input', () => {
    const input = hand(['2C', 'AH']);
    sortHand(input);
    expect(input.map(cardId)).toEqual(['2C', 'AH']);
  });
});

describe('ascending suit-grouped order', () => {
  it('keeps alternating suit groups and orders ranks low to high within each', () => {
    expect(sortHand(hand(['2C', 'AH', 'AS', '10D', 'QS', '10H', '3C', '4D']), 'ascending').map(cardId))
      .toEqual(['QS', 'AS', '10H', 'AH', '2C', '3C', '4D', '10D']);
  });
  it('does not mutate the hand', () => {
    const input = hand(['2C', 'AH']);
    sortHand(input, 'ascending');
    expect(input.map(cardId)).toEqual(['2C', 'AH']);
  });
});
