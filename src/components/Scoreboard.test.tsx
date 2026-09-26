import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Scoreboard } from './Scoreboard';

const players = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];

describe('Scoreboard', () => {
  it('shows each round, totals, highlights the lowest and marks moon shots', () => {
    render(
      <Scoreboard
        players={players}
        roundScores={[[26, 0, 26, 26], [5, 10, 11, 0]]}
        totals={[31, 10, 37, 26]}
        moonRounds={[1, null]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'R2' })).toBeInTheDocument();
    const bobRow = screen.getByRole('row', { name: /Bob/ });
    expect(bobRow).toHaveTextContent('0 🌙');
    expect(bobRow.querySelector('td:last-child')).toHaveClass('best');
    expect(bobRow.querySelector('td:last-child')).toHaveTextContent('10');
  });

  it('marks all players tied for lowest total', () => {
    render(<Scoreboard players={players} roundScores={[[0, 0, 13, 13]]} totals={[0, 0, 13, 13]} />);
    expect(screen.getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Player', 'R1', 'Total']);
    expect(screen.getByRole('row', { name: /Ann/ }).querySelector('td:last-child')).toHaveClass('best');
    expect(screen.getByRole('row', { name: /Bob/ }).querySelector('td:last-child')).toHaveClass('best');
    expect(screen.getByRole('row', { name: /Cat/ }).querySelector('td:last-child')).not.toHaveClass('best');
    expect(screen.getByRole('row', { name: /Dan/ }).querySelector('td:last-child')).not.toHaveClass('best');
    expect(screen.queryByText(/🌙/)).not.toBeInTheDocument();
  });
});
