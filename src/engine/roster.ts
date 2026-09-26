export interface Player {
  id: string;
  name: string;
  archived: boolean;
  createdAt: number;
}

export type RosterResult =
  | { ok: true; players: Player[]; player: Player }
  | { ok: false; error: string };

export const MAX_NAME_LENGTH = 20;

export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

const nameKey = (name: string) => cleanName(name).toLowerCase();

export function validateName(players: readonly Player[], name: string, exceptId?: string): string | null {
  const cleaned = cleanName(name);
  if (!cleaned) return 'Enter a name';
  if (cleaned.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer`;
  if (players.some(p => p.id !== exceptId && nameKey(p.name) === nameKey(cleaned))) {
    return 'That name is already taken';
  }
  return null;
}

export function addPlayer(players: readonly Player[], name: string, id: string, createdAt: number): RosterResult {
  const error = validateName(players, name);
  if (error) return { ok: false, error };
  const player: Player = { id, name: cleanName(name), archived: false, createdAt };
  return { ok: true, player, players: [...players, player] };
}

export function renamePlayer(players: readonly Player[], id: string, name: string): RosterResult {
  const existing = players.find(p => p.id === id);
  if (!existing) return { ok: false, error: 'Player not found' };
  const error = validateName(players, name, id);
  if (error) return { ok: false, error };
  const player = { ...existing, name: cleanName(name) };
  return { ok: true, player, players: players.map(p => (p.id === id ? player : p)) };
}

export function setArchived(players: readonly Player[], id: string, archived: boolean): Player[] {
  return players.map(p => (p.id === id ? { ...p, archived } : p));
}

export function activePlayers(players: readonly Player[]): Player[] {
  return players
    .filter(p => !p.archived)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
