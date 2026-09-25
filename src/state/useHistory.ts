import { useCallback, useEffect, useState } from 'react';
import { appendRecord, type GameRecord } from '../engine/history';
import { HISTORY_KEY, loadVersioned, saveVersioned } from './storage';

interface HistoryFile {
  version: number;
  games: GameRecord[];
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown) => Array.isArray(v) && v.every(item => typeof item === 'string');
const scores = (v: unknown) => Array.isArray(v) && v.every(item => Number.isFinite(item) && item >= 0);

function validRecord(v: unknown): v is GameRecord {
  return object(v) && typeof v.gameId === 'string' && Number.isFinite(v.finishedAt)
    && Array.isArray(v.seats) && v.seats.every(seat => object(seat)
      && typeof seat.playerId === 'string' && typeof seat.name === 'string')
    && Array.isArray(v.roundScores) && v.roundScores.every(scores)
    && scores(v.totals) && strings(v.winners) && typeof v.tie === 'boolean'
    && Array.isArray(v.moonShooters) && v.moonShooters.every(item => item === null || typeof item === 'string')
    && strings(v.perfect);
}

function loadHistory(): GameRecord[] {
  return loadVersioned<HistoryFile>(HISTORY_KEY, 1, f => Array.isArray(f.games) && f.games.every(validRecord))?.games ?? [];
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
