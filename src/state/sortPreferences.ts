import { useState } from 'react';
import type { SortMode } from '../engine/sort';
import { loadVersioned, saveVersioned } from './storage';

export const SORT_PREFERENCES_KEY = 'hearts.sortPreferences';

interface SortPreferences {
  version: number;
  byPlayer: Record<string, SortMode>;
}

function readPreferences(): SortPreferences {
  return loadVersioned<SortPreferences>(SORT_PREFERENCES_KEY, 1, value =>
    value.byPlayer !== null && typeof value.byPlayer === 'object' && !Array.isArray(value.byPlayer)
    && Object.values(value.byPlayer).every(mode => mode === 'ascending' || mode === 'descending'),
  ) ?? { version: 1, byPlayer: {} };
}

export function getSortPreference(playerId: string): SortMode {
  return readPreferences().byPlayer[playerId] ?? 'descending';
}

export function setSortPreference(playerId: string, mode: SortMode): void {
  const { byPlayer } = readPreferences();
  saveVersioned(SORT_PREFERENCES_KEY, { version: 1, byPlayer: { ...byPlayer, [playerId]: mode } });
}

export function useSortPreference(playerId: string): [SortMode, () => void] {
  const [mode, setMode] = useState<SortMode>(() => getSortPreference(playerId));
  const toggle = () => {
    const next = mode === 'descending' ? 'ascending' : 'descending';
    setSortPreference(playerId, next);
    setMode(next);
  };
  return [mode, toggle];
}
