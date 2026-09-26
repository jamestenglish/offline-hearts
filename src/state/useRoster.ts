import { useCallback, useEffect, useRef, useState } from 'react';
import { addPlayer, type Player, renamePlayer, type RosterResult, setArchived } from '../engine/roster';
import { newId } from '../random';
import { loadVersioned, ROSTER_KEY, saveVersioned } from './storage';

interface RosterFile {
  version: number;
  players: Player[];
}

function loadRoster(): Player[] {
  return loadVersioned<RosterFile>(ROSTER_KEY, 1, f => {
    if (!Array.isArray(f.players) || !f.players.every(p => p !== null && typeof p === 'object'
      && typeof p.id === 'string' && p.id.length > 0
      && typeof p.name === 'string' && p.name.trim().length > 0
      && typeof p.archived === 'boolean' && Number.isFinite(p.createdAt))) return false;
    return new Set(f.players.map(p => p.id)).size === f.players.length;
  })?.players ?? [];
}

export function useRoster() {
  const [players, setPlayers] = useState<Player[]>(loadRoster);
  const playersRef = useRef(players);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    saveVersioned(ROSTER_KEY, { version: 1, players });
  }, [players]);

  const add = useCallback((name: string): RosterResult => {
    const result = addPlayer(playersRef.current, name, newId(), Date.now());
    if (result.ok) {
      playersRef.current = result.players;
      setPlayers(result.players);
    }
    return result;
  }, []);

  const rename = useCallback((id: string, name: string): RosterResult => {
    const result = renamePlayer(playersRef.current, id, name);
    if (result.ok) {
      playersRef.current = result.players;
      setPlayers(result.players);
    }
    return result;
  }, []);

  const archive = useCallback((id: string, archived: boolean) => {
    const next = setArchived(playersRef.current, id, archived);
    playersRef.current = next;
    setPlayers(next);
  }, []);

  return { players, add, rename, archive };
}
