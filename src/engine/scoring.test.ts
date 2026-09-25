import { describe, expect, it } from 'vitest';
import { perfectSeats, scoreRound, winningSeats } from './scoring';

describe('scoring', () => {
  it('passes points through when nobody shoots the moon', () => {
    expect(scoreRound([13, 5, 8, 0])).toEqual({ scores: [13, 5, 8, 0], moonShooter: null });
  });

  it('gives everyone else 26 when a player shoots the moon', () => {
    expect(scoreRound([0, 26, 0, 0])).toEqual({ scores: [26, 0, 26, 26], moonShooter: 1 });
  });

  it('finds all seats tied for lowest', () => {
    expect(winningSeats([30, 12, 50, 12])).toEqual([1, 3]);
    expect(winningSeats([30, 12, 50, 13])).toEqual([1]);
  });

  it('finds perfect (zero) totals', () => {
    expect(perfectSeats([0, 26, 52, 0])).toEqual([0, 3]);
    expect(perfectSeats([1, 26, 52, 25])).toEqual([]);
  });
});
