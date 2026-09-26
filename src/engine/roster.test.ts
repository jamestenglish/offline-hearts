import { describe, expect, it } from 'vitest';
import {
  activePlayers, addPlayer, cleanName, type Player, renamePlayer, setArchived, validateName,
} from './roster';

const make = (name: string, id: string, archived = false): Player => ({ id, name, archived, createdAt: 0 });

describe('roster', () => {
  it('cleans names', () => {
    expect(cleanName('  Mary   Ann ')).toBe('Mary Ann');
  });

  it('rejects blank, too long, and duplicate names', () => {
    const players = [make('Alice', 'a'), make('Hidden', 'h', true)];
    expect(validateName(players, '')).toBe('Enter a name');
    expect(validateName(players, '    ')).toBe('Enter a name');
    expect(validateName(players, 'x'.repeat(21))).toBe('Name must be 20 characters or fewer');
    expect(validateName(players, ' alice ')).toBe('That name is already taken');
    expect(validateName(players, 'HIDDEN')).toBe('That name is already taken');
    expect(validateName(players, 'Bob')).toBeNull();
    expect(validateName(players, 'alice', 'a')).toBeNull();
  });

  it('adds a player with a cleaned name', () => {
    const result = addPlayer([], '  Bob  ', 'b', 123);
    expect(result).toEqual({
      ok: true,
      player: { id: 'b', name: 'Bob', archived: false, createdAt: 123 },
      players: [{ id: 'b', name: 'Bob', archived: false, createdAt: 123 }],
    });
  });

  it('refuses to add a duplicate', () => {
    expect(addPlayer([make('Bob', 'b')], 'bob', 'x', 0)).toEqual({ ok: false, error: 'That name is already taken' });
  });

  it('renames keeping the id', () => {
    const result = renamePlayer([make('Bob', 'b'), make('Cat', 'c')], 'b', 'Robert');
    expect(result.ok && result.players.map(p => [p.id, p.name])).toEqual([['b', 'Robert'], ['c', 'Cat']]);
  });

  it('rejects renaming to another player’s name or an unknown id', () => {
    const players = [make('Bob', 'b'), make('Cat', 'c')];
    expect(renamePlayer(players, 'b', 'cat')).toEqual({ ok: false, error: 'That name is already taken' });
    expect(renamePlayer(players, 'zzz', 'New')).toEqual({ ok: false, error: 'Player not found' });
  });

  it('archives and lists active players sorted by name', () => {
    const players = [make('dan', 'd'), make('Bob', 'b'), make('cat', 'c')];
    const archived = setArchived(players, 'c', true);
    expect(archived.find(p => p.id === 'c')?.archived).toBe(true);
    expect(activePlayers(archived).map(p => p.name)).toEqual(['Bob', 'dan']);
    expect(activePlayers(setArchived(archived, 'c', false)).map(p => p.name)).toEqual(['Bob', 'cat', 'dan']);
  });
});
