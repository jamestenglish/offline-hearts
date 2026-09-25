import { useCallback, useEffect, useState } from 'react';
import { appendRecord, type GameRecord } from '../engine/history';
import { HISTORY_KEY, loadVersioned, saveVersioned } from './storage';

interface HistoryFile {
  version: number;
  games: GameRecord[];
}

function loadHistory(): GameRecord[] {
  return loadVersioned<HistoryFile>(HISTORY_KEY, 1, f => Array.isArray(f.games))?.games ?? [];
}

export function useHistory() {
  const [records, setRecords] = useState<GameRecord[]>(loadHistory);

  useEffect(() => {
    saveVersioned(HISTORY_KEY, { version: 1, games: records });
  }, [records]);

  const append = useCallback((record: GameRecord) => {
    setRecords(prev => appendRecord(prev, record));
  }, []);

  const clear = useCallback(() => setRecords([]), []);

  return { records, append, clear };
}
