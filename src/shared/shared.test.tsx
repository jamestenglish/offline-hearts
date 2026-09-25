import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cardId as heartsCardId } from '../engine/cards';
import { useRoster as heartsUseRoster } from '../state/useRoster';
import { CardView } from './CardView';
import { cardId, mulberry32, newDeck, shuffle } from './cards';
import { addPlayer, type Player } from './roster';
import { loadVersioned, ROSTER_KEY, saveVersioned } from './storage';
import { useRoster } from './useRoster';

describe('shared Hearts APIs', () => {
  it('exposes the existing card IDs and a complete shuffleable deck', () => {
    const deck = newDeck();
    expect(new Set(deck.map(cardId)).size).toBe(52);
    expect(cardId({ rank: 14, suit: 'S' })).toBe('AS');
    expect(cardId({ rank: 14, suit: 'S' })).toBe(heartsCardId({ rank: 14, suit: 'S' }));
    expect(new Set(shuffle(deck, mulberry32(1)).map(cardId))).toEqual(new Set(deck.map(cardId)));
  });

  it('keeps the Hearts roster key and version-1 player shape readable by the original hook', () => {
    expect(ROSTER_KEY).toBe('hearts.roster');
    const added = addPlayer([], 'Ann', 'id-ann', 1);
    expect(added).toMatchObject({ ok: true });
    if (!added.ok) throw new Error(added.error);
    const existingHeartsRoster: Player[] = [
      { id: 'id-bob', name: 'Bob', archived: false, createdAt: 2 },
    ];
    const players = [...existingHeartsRoster, ...added.players];
    saveVersioned(ROSTER_KEY, { version: 1, players });
    expect(loadVersioned<{ version: number; players: Player[] }>(ROSTER_KEY, 1)?.players).toEqual(players);
    expect(useRoster).toBe(heartsUseRoster);
    const { result } = renderHook(() => heartsUseRoster());
    expect(result.current.players).toEqual(players);
    expect(JSON.parse(localStorage.getItem('hearts.roster')!)).toEqual({ version: 1, players });
  });

  it('renders the existing accessible card face', () => {
    render(<CardView card={{ rank: 14, suit: 'S' }} />);
    expect(screen.getByRole('button', { name: 'A♠' })).toBeInTheDocument();
  });
});
