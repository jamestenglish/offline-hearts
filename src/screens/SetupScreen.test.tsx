import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Player } from '../engine/roster';
import { SetupScreen } from './SetupScreen';

const p = (id: string, name: string, archived = false): Player => ({ id, name, archived, createdAt: 0 });
const roster = [p('a', 'Ann'), p('b', 'Bob'), p('c', 'Cat'), p('d', 'Dan'), p('x', 'Gone', true)];
const noop = () => {};

describe('SetupScreen', () => {
  it('starts with four chosen players in seat order', () => {
    const onStart = vi.fn();
    render(<SetupScreen roster={roster} onAddPlayer={vi.fn()} onStart={onStart} onOpenPlayers={noop} onOpenStats={noop} />);
    const start = screen.getByRole('button', { name: 'Start Game' });
    expect(start).toBeDisabled();
    ['c', 'a', 'd', 'b'].forEach((id, i) => {
      fireEvent.change(screen.getByLabelText(`Seat ${i + 1}`), { target: { value: id } });
    });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledWith([
      { id: 'c', name: 'Cat' }, { id: 'a', name: 'Ann' }, { id: 'd', name: 'Dan' }, { id: 'b', name: 'Bob' },
    ]);
  });

  it('hides archived players and disables players already seated', () => {
    render(<SetupScreen roster={roster} onAddPlayer={vi.fn()} onStart={noop} onOpenPlayers={noop} onOpenStats={noop} />);
    expect(screen.queryAllByRole('option', { name: 'Gone' })).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Seat 1'), { target: { value: 'a' } });
    const seat2Ann = screen.getAllByRole('option', { name: 'Ann' })[1] as HTMLOptionElement;
    expect(seat2Ann.disabled).toBe(true);
  });

  it('adds a new player inline and shows validation errors', () => {
    const onAddPlayer = vi
      .fn()
      .mockReturnValueOnce({ ok: false, error: 'That name is already taken' })
      .mockReturnValueOnce({ ok: true, player: p('e', 'Eve'), players: [...roster, p('e', 'Eve')] });
    render(<SetupScreen roster={roster} onAddPlayer={onAddPlayer} onStart={noop} onOpenPlayers={noop} onOpenStats={noop} />);
    fireEvent.change(screen.getByLabelText('Seat 1'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'ann' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('That name is already taken')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'Eve' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAddPlayer).toHaveBeenLastCalledWith('Eve');
    expect(screen.queryByLabelText('New player name')).not.toBeInTheDocument();
  });

  it('disables start when a selected player is subsequently hidden', () => {
    const onStart = vi.fn();
    const props = { onAddPlayer: vi.fn(), onStart, onOpenPlayers: noop, onOpenStats: noop };
    const { rerender } = render(<SetupScreen roster={roster} {...props} />);
    ['a', 'b', 'c', 'd'].forEach((id, i) => {
      fireEvent.change(screen.getByLabelText(`Seat ${i + 1}`), { target: { value: id } });
    });
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeEnabled();
    rerender(<SetupScreen roster={roster.map(player => player.id === 'a' ? { ...player, archived: true } : player)} {...props} />);
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeDisabled();
  });
});
