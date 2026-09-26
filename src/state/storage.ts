export const GAME_KEY = 'hearts.game';
export const ROSTER_KEY = 'hearts.roster';
export const HISTORY_KEY = 'hearts.history';

const failedKeys = new Set<string>();
const listeners = new Set<() => void>();
let failureSnapshot = '';

export function subscribeToSaveFailures(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getSaveFailures(): string {
  return failureSnapshot;
}

function reportSave(key: string, failed: boolean): void {
  if (failed) failedKeys.add(key);
  else failedKeys.delete(key);
  const next = [...failedKeys].sort().join(', ');
  if (next !== failureSnapshot) {
    failureSnapshot = next;
    listeners.forEach(listener => listener());
  }
}

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
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    reportSave(key, true);
    return null;
  }
  try {
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
    reportSave(key, false);
  } catch {
    // Keep playing in memory, but warn that this slice is not saved.
    reportSave(key, true);
  }
}

export function removeVersioned(key: string): boolean {
  try {
    localStorage.removeItem(key);
    reportSave(key, false);
    return true;
  } catch {
    reportSave(key, true);
    return false;
  }
}
