import { describe, expect, it } from 'vitest';
import { cardId, parseCardId, type Card } from '../../shared/cards';
import { candidateCards, createEquity, createSampledEquity, runoutCount, type EquityInput } from './equity';

const cards = (ids: string[]) => ids.map(parseCardId);
const players: EquityInput['players'] = [
  { seat: 0, hole: cards(['AS', 'AD']) as [Card, Card] },
  { seat: 1, hole: cards(['QS', 'QD']) as [Card, Card] },
];

describe('exact showdown equity', () => {
  it('estimates preflop from a bounded reproducible sample', () => {
    const work = createSampledEquity({ players, board: [] }, 20, 42);
    expect(work.cursor.total).toBe(20);
    const result = work.advance(20);
    expect(result).toMatchObject({ processed: 20, total: 20, done: true });
    expect(result.shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(20);
    expect(createSampledEquity({ players, board: [] }, 20, 42).advance(20).shares).toEqual(result.shares);
  });

  it('estimates flop in a bounded sample but leaves turn exhaustive', () => {
    expect(createSampledEquity({ players, board: cards(['2C', '3D', '4H']) }, 40, 9).advance(40).total).toBe(40);
    expect(createEquity({ players, board: cards(['2C', '3D', '4H', '8S']) }).cursor.total).toBe(44);
  });
  it('awards the sole river runout to the stronger hole hand', () => {
    const work = createEquity({ players, board: cards(['2C', '3D', '4H', '8S', 'KC']) });
    expect(work.cursor).toEqual({ indices: [], processed: 0, shares: [0, 0], total: 1, done: false });
    expect(work.advance(1)).toEqual({ indices: [], processed: 1, shares: [1, 0], total: 1, done: true });
    expect(work.advance(1)).toEqual({ indices: [], processed: 1, shares: [1, 0], total: 1, done: true });
  });

  it('splits a board-played royal flush equally', () => {
    const work = createEquity({
      players: [
        { seat: 7, hole: cards(['2C', '3D']) as [Card, Card] },
        { seat: 1, hole: cards(['4C', '5D']) as [Card, Card] },
      ],
      board: cards(['10S', 'JS', 'QS', 'KS', 'AS']),
    });
    expect(work.advance(1).shares).toEqual([0.5, 0.5]);
  });

  it('resumes turn runouts without recounting and leaves earlier cursors unchanged', () => {
    const work = createEquity({ players, board: cards(['2C', '3D', '4H', '8S']) });
    const initial = work.cursor;
    const first = work.advance(10);
    expect(first).toMatchObject({ total: 44, processed: 10, done: false });
    expect(first.indices).toEqual([10]);
    const finished = work.advance(100);
    expect(finished).toMatchObject({ total: 44, processed: 44, done: true });
    expect(finished.shares.reduce((sum, share) => sum + share, 0)).toBe(44);
    expect(first.processed).toBe(10);
    expect(initial).toEqual({ indices: [0], processed: 0, shares: [0, 0], total: 44, done: false });
    finished.shares[0] = -1;
    finished.indices[0] = -1;
    expect(work.cursor.processed).toBe(44);
    expect(work.cursor.shares.reduce((sum, share) => sum + share, 0)).toBe(44);
  });

  it('preserves input player order when awarding shares', () => {
    const reversed = createEquity({ players: [players[1], players[0]], board: cards(['2C', '3D', '4H', '8S', 'KC']) });
    expect(reversed.advance(1).shares).toEqual([0, 1]);
  });

  it('counts combinations for every supported street without evaluating preflop', () => {
    expect(runoutCount(48, 5)).toBe(1_712_304);
    expect(runoutCount(45, 2)).toBe(990);
    expect(runoutCount(44, 1)).toBe(44);
    expect(runoutCount(43, 0)).toBe(1);
    expect(createEquity({ players, board: [] }).cursor.total).toBe(1_712_304);
    expect(createEquity({ players, board: cards(['2C', '3D', '4H']) }).cursor.total).toBe(990);
  });

  it('includes a separately known folded or burned card in the turn candidate deck', () => {
    const foldedOrBurned = '7S';
    const input = { players, board: cards(['2C', '3D', '4H', '8S']) };
    const candidates = candidateCards(input).map(cardId);
    expect(candidates).toHaveLength(44);
    expect(candidates).toContain(foldedOrBurned);
    expect(candidates).not.toContain('AS');
    expect(candidates).not.toContain('2C');
  });

  it('rejects duplicate cards, invalid seats, player counts, and board sizes', () => {
    const board = cards(['2C', '3D', '4H', '8S', 'KC']);
    expect(() => createEquity({ players, board: cards(['AS', '3D', '4H', '8S', 'KC']) })).toThrow(RangeError);
    expect(() => createEquity({ players: [players[0], players[0]], board })).toThrow(RangeError);
    expect(() => createEquity({ players: [players[0]], board })).toThrow(RangeError);
    expect(() => createEquity({ players, board: cards(['2C']) })).toThrow(RangeError);
    expect(() => createEquity({ players, board: cards(['2C', '3D']) })).toThrow(RangeError);
    expect(() => createEquity({ players, board: cards(['2C', '3D', '4H', '8S', 'KC', '9S']) })).toThrow(RangeError);
    expect(() => createEquity({
      players: [players[0], { seat: 2, hole: cards(['AS', '9D']) as [Card, Card] }], board,
    })).toThrow(RangeError);
    expect(() => createEquity({
      players: [players[0], { seat: 2, hole: cards(['1C', '9D']) as [Card, Card] }], board,
    })).toThrow(RangeError);
  });
});
