import { describe, expect, it } from 'vitest';
import { cardId, deal } from './cards';
import { applyPasses, passDirection, passTarget } from './passing';

describe('passing', () => {
  it('rotates left, right, across, none', () => {
    expect([0, 1, 2, 3].map(passDirection)).toEqual(['left', 'right', 'across', 'none']);
  });

  it('targets the correct seat', () => {
    expect(passTarget(0, 0)).toBe(1);
    expect(passTarget(3, 0)).toBe(0);
    expect(passTarget(0, 1)).toBe(3);
    expect(passTarget(1, 2)).toBe(3);
    expect(passTarget(2, 3)).toBe(2);
  });

  it('moves the selected cards to the target and records them as received', () => {
    const hands = deal(7);
    const selections = hands.map(h => h.slice(0, 3).map(cardId));
    const result = applyPasses(hands, selections, 0);
    result.hands.forEach(h => expect(h).toHaveLength(13));
    for (let seat = 0; seat < 4; seat++) {
      const target = (seat + 1) % 4;
      const targetIds = result.hands[target].map(cardId);
      const ownIds = result.hands[seat].map(cardId);
      selections[seat].forEach(id => {
        expect(targetIds).toContain(id);
        expect(ownIds).not.toContain(id);
      });
      expect(result.received[target].slice().sort()).toEqual(selections[seat].slice().sort());
    }
  });
});
