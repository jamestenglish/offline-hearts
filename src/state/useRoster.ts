import { useCallback, useEffect, useState } from 'react';
import { addPlayer, type Player, renamePlayer, type RosterResult, setArchived } from '../engine/roster';
import { newId } from '../random';
import { loadVersioned, ROSTER_KEY, saveVersioned } from './storage';

interface RosterFile {
  version: number;
  players: Player[];
}

function loadRoster(): Player[] {
  return loadVersioned<RosterFile>(ROSTER_KEY, 1, f => Array.isArray(f.players))?.players ?? [];
}

export function useRoster() {
  const [players, setPlayers] = useState<Player[]>(loadRoster);

  useEffect(() => {
    saveVersioned(ROSTER_KEY, { version: 1, players });
  }, [players]);

  const add = useCallback((name: string): RosterResult => {
    const result = addPlayer(players, name, newId(), Date.now());
    if (result.ok) setPlayers(result.players);
    return result;
  }, [players]);

  const rename = useCallback((id: string, name: string): RosterResult => {
    const result = renamePlayer(players, id, name);
    if (result.ok) setPlayers(result.players);
    return result;
  }, [players]);

  const archive = useCallback((id: string, archived: boolean) => {
    setPlayers(prev => setArchived(prev, id, archived));
  }, []);

  return { players, add, rename, archive };
}
