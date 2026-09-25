import { useCallback, useEffect, useState } from 'react';
import { appendRecord, type GameRecord } from '../engine/history';
import { HISTORY_KEY, loadVersioned, saveVersioned } from './storage';

interface HistoryFile {
  version: number;
  games: GameRecord[];
  clearedGameId?: string | null;
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

function loadHistory(): HistoryFile {
  return loadVersioned<HistoryFile>(HISTORY_KEY, 1, f => Array.isArray(f.games) && f.games.every(validRecord)
    && (f.clearedGameId === undefined || f.clearedGameId === null || typeof f.clearedGameId === 'string'))
    ?? { version: 1, games: [], clearedGameId: null };
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryFile>(loadHistory);
  const records = history.games;

  useEffect(() => {
    saveVersioned(HISTORY_KEY, history);
  }, [history]);

  const append = useCallback((record: GameRecord) => {
    setHistory(prev => record.gameId === prev.clearedGameId ? prev : {
      ...prev, games: appendRecord(prev.games, record),
    });
  }, []);

  const clear = useCallback((gameId?: string) => setHistory(prev => ({
    ...prev, games: [], clearedGameId: gameId ?? prev.clearedGameId ?? null,
  })), []);

  return { records, append, clear };
}
