import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseCardId } from '../engine/cards';
import { Table } from './Table';

const players = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];

describe('Table', () => {
  it('shows names, tricks won instead of points, and played cards', () => {
    render(
      <Table
        players={players}
        tricksWon={[0, 3, 10, 0]}
        cards={[{ seat: 2, card: parseCardId('QS') }]}
        active={3}
      />,
    );
    expect(within(screen.getByTestId('seat-2')).getByText('Cat')).toBeInTheDocument();
    expect(within(screen.getByTestId('seat-2')).getByText('10 tricks')).toBeInTheDocument();
    expect(within(screen.getByTestId('seat-0')).getByText('0 tricks')).toBeInTheDocument();
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
    expect(screen.getByTestId('seat-3')).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Q♠' }).closest('.played')).toHaveClass('seat-2');
  });

  it('places all four players at their seats and highlights the winning card', () => {
    render(
      <Table
        players={players}
        tricksWon={[0, 1, 0, 0]}
        cards={[{ seat: 1, card: parseCardId('AH') }, { seat: 3, card: parseCardId('2H') }]}
        winner={1}
      />,
    );
    players.forEach((player, seat) => {
      expect(screen.getByTestId(`seat-${seat}`)).toHaveClass(`seat-${seat}`);
      expect(within(screen.getByTestId(`seat-${seat}`)).getByText(player.name)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'A♥' }).closest('.played')).toHaveClass('winner');
    expect(within(screen.getByTestId('seat-1')).getByText('1 trick')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2♥' }).closest('.played')).not.toHaveClass('winner');
  });
});
