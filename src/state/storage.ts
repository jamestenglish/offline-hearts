export const GAME_KEY = 'hearts.game';
export const ROSTER_KEY = 'hearts.roster';
export const HISTORY_KEY = 'hearts.history';

function discard(key: string): null {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage is unavailable.
  }
  return null;
}

export function loadVersioned<T extends { version: number }>(
  key: string,
  version: number,
  isValid: (value: T) => boolean = () => true,
): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value = JSON.parse(raw) as T;
    if (typeof value !== 'object' || value === null || value.version !== version || !isValid(value)) {
      return discard(key);
    }
    return value;
  } catch {
    return discard(key);
  }
}

export function saveVersioned(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: keep playing in memory.
  }
}
