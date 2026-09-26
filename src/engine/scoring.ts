export const MOON_POINTS = 26;

export interface RoundResult {
  scores: number[];
  moonShooter: number | null;
}

export function scoreRound(taken: readonly number[]): RoundResult {
  const shooter = taken.findIndex(points => points === MOON_POINTS);
  if (shooter === -1) return { scores: taken.slice(), moonShooter: null };
  return {
    scores: taken.map((_, seat) => (seat === shooter ? 0 : MOON_POINTS)),
    moonShooter: shooter,
  };
}

export function winningSeats(totals: readonly number[]): number[] {
  const lowest = Math.min(...totals);
  return totals.flatMap((total, seat) => (total === lowest ? [seat] : []));
}

export function perfectSeats(totals: readonly number[]): number[] {
  return totals.flatMap((total, seat) => (total === 0 ? [seat] : []));
}
