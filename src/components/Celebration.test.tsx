import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Celebration, MOON_EMOJIS } from './Celebration';

describe('Celebration', () => {
  it('renders the requested number of emoji pieces', () => {
    const { container } = render(<Celebration emojis={MOON_EMOJIS} count={12} />);
    const pieces = container.querySelectorAll('.celebration span');
    expect(pieces).toHaveLength(12);
    pieces.forEach(p => expect(MOON_EMOJIS).toContain(p.textContent));
  });
});
