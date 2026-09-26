import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Player } from '../engine/roster';
import { PlayersScreen } from './PlayersScreen';

const p = (id: string, name: string, archived = false): Player => ({ id, name, archived, createdAt: 0 });

describe('PlayersScreen', () => {
  it('adds a player and shows errors', () => {
    const onAdd = vi.fn().mockReturnValueOnce({ ok: false, error: 'Enter a name' });
    render(<PlayersScreen roster={[]} onAdd={onAdd} onRename={vi.fn()} onArchive={vi.fn()} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
  });

  it('renames a player', () => {
    const onRename = vi.fn().mockReturnValue({ ok: true, player: p('a', 'Annie'), players: [p('a', 'Annie')] });
    render(<PlayersScreen roster={[p('a', 'Ann')]} onAdd={vi.fn()} onRename={onRename} onArchive={vi.fn()} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Rename Ann'), { target: { value: 'Annie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onRename).toHaveBeenCalledWith('a', 'Annie');
  });

  it('hides and unhides players', () => {
    const onArchive = vi.fn();
    render(
      <PlayersScreen roster={[p('a', 'Ann'), p('b', 'Bob', true)]} onAdd={vi.fn()} onRename={vi.fn()} onArchive={onArchive} onBack={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(onArchive).toHaveBeenCalledWith('a', true);
    fireEvent.click(screen.getByRole('button', { name: 'Hidden players (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unhide' }));
    expect(onArchive).toHaveBeenCalledWith('b', false);
  });
});
