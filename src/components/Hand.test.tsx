import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseCardId } from '../engine/cards';
import { Hand } from './Hand';

const cards = ['2C', 'AH', 'QS', 'KD'].map(parseCardId);

describe('Hand', () => {
  it('renders cards in sorted order', () => {
    render(<Hand cards={cards} selected={[]} onToggle={() => {}} />);
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Q♠', 'A♥', '2♣', 'K♦']);
  });

  it('dims and disables unplayable cards', () => {
    const onToggle = vi.fn();
    render(<Hand cards={cards} selected={[]} playable={['2C']} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'A♥' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'A♥' })).toHaveClass('dim');
    fireEvent.click(screen.getByRole('button', { name: 'A♥' }));
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '2♣' }));
    expect(onToggle).toHaveBeenCalledWith('2C');
  });

  it('raises selected cards and marks received cards', () => {
    render(<Hand cards={cards} selected={['QS']} received={['KD']} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Q♠' })).toHaveClass('raised');
    expect(screen.getByRole('button', { name: 'Q♠' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'K♦' })).toHaveClass('received');
  });
});
