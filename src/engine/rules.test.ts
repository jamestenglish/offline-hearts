import { describe, expect, it } from 'vitest';
import { type Card, cardId, parseCardId } from './cards';
import { findTwoOfClubs, legalPlays, type Trick, trickPoints, trickWinner } from './rules';

const cards = (ids: string[]) => ids.map(parseCardId);
const ids = (cs: Card[]) => cs.map(cardId).sort();
const trickOf = (leader: number, played: string[]): Trick => ({
  leader,
  cards: played.map((id, i) => ({ seat: (leader + i) % 4, card: parseCardId(id) })),
});
const empty: Trick = { leader: 0, cards: [] };

describe('legalPlays', () => {
  it('forces the 2 of clubs on the opening lead', () => {
    const hand = cards(['2C', 'AC', '5H', 'QS']);
    expect(ids(legalPlays({ hand, trick: empty, firstTrick: true, heartsBroken: false }))).toEqual(['2C']);
  });

  it('requires following suit', () => {
    const hand = cards(['3D', 'KD', '5H', 'QS']);
    const trick = trickOf(1, ['9D']);
    expect(ids(legalPlays({ hand, trick, firstTrick: false, heartsBroken: false }))).toEqual(['3D', 'KD']);
  });

  it('blocks points on the first trick when void and holding safe cards', () => {
    const hand = cards(['QS', '5H', '3D']);
    const trick = trickOf(0, ['2C']);
    expect(ids(legalPlays({ hand, trick, firstTrick: true, heartsBroken: false }))).toEqual(['3D']);
  });

  it('allows points on the first trick when holding only point cards', () => {
    const hand = cards(['QS', '5H', '9H']);
    const trick = trickOf(0, ['2C']);
    expect(ids(legalPlays({ hand, trick, firstTrick: true, heartsBroken: false }))).toEqual(['5H', '9H', 'QS']);
  });

  it('allows anything when void after the first trick', () => {
    const hand = cards(['QS', '5H', '3D']);
    const trick = trickOf(0, ['7C']);
    expect(ids(legalPlays({ hand, trick, firstTrick: false, heartsBroken: false }))).toEqual(['3D', '5H', 'QS']);
  });

  it('forbids leading hearts before they are broken', () => {
    const hand = cards(['5H', '9H', 'QS', '3D']);
    expect(ids(legalPlays({ hand, trick: empty, firstTrick: false, heartsBroken: false }))).toEqual(['3D', 'QS']);
  });

  it('allows leading hearts before broken when holding only hearts', () => {
    const hand = cards(['5H', '9H']);
    expect(ids(legalPlays({ hand, trick: empty, firstTrick: false, heartsBroken: false }))).toEqual(['5H', '9H']);
  });

  it('allows leading hearts once broken', () => {
    const hand = cards(['5H', '3D']);
    expect(ids(legalPlays({ hand, trick: empty, firstTrick: false, heartsBroken: true }))).toEqual(['3D', '5H']);
  });
});

describe('trick resolution', () => {
  it('awards the trick to the highest card of the led suit', () => {
    const trick = trickOf(2, ['9D', 'AS', 'KD', '2D']);
    expect(trickWinner(trick)).toBe(0); // seats 2,3,0,1 -> KD played by seat 0
  });

  it('counts trick points', () => {
    expect(trickPoints(trickOf(0, ['9D', 'QS', '5H', 'AH']))).toBe(15);
    expect(trickPoints(trickOf(0, ['9D', '8D', '7D', '6D']))).toBe(0);
  });

  it('finds the holder of the 2 of clubs', () => {
    const hands = [cards(['3C']), cards(['4C']), cards(['2C']), cards(['5C'])];
    expect(findTwoOfClubs(hands)).toBe(2);
  });

  it('returns -1 when no hand holds the 2 of clubs', () => {
    expect(findTwoOfClubs([cards(['3C']), cards(['4C'])])).toBe(-1);
  });
});
