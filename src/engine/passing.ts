import { type Card, type CardId, cardId } from './cards';
import { sortHand } from './sort';

export type PassDirection = 'left' | 'right' | 'across' | 'none';

const DIRECTIONS: readonly PassDirection[] = ['left', 'right', 'across', 'none'];
const OFFSET: Record<PassDirection, number> = { left: 1, right: 3, across: 2, none: 0 };

export function passDirection(round: number): PassDirection {
  return DIRECTIONS[round % 4];
}

export function passTarget(seat: number, round: number): number {
  return (seat + OFFSET[passDirection(round)]) % 4;
}

export function applyPasses(
  hands: readonly (readonly Card[])[],
  selections: readonly (readonly CardId[])[],
  round: number,
): { hands: Card[][]; received: CardId[][] } {
  const received: CardId[][] = [[], [], [], []];
  const next = hands.map((hand, seat) => hand.filter(c => !selections[seat].includes(cardId(c))));
  hands.forEach((hand, seat) => {
    const target = passTarget(seat, round);
    const passed = hand.filter(c => selections[seat].includes(cardId(c)));
    next[target].push(...passed);
    received[target].push(...passed.map(cardId));
  });
  return { hands: next.map(sortHand), received };
}
