import type { GameState } from './game';
import { perfectSeats, winningSeats } from './scoring';

export interface RecordSeat {
  playerId: string;
  name: string;
}

export interface GameRecord {
  gameId: string;
  finishedAt: number;
  seats: RecordSeat[];
  roundScores: number[][];
  totals: number[];
  winners: string[];
  tie: boolean;
  moonShooters: (string | null)[];
  perfect: string[];
}

export function buildRecord(state: GameState, finishedAt: number): GameRecord {
  const ids = state.players.map(p => p.id);
  const winners = winningSeats(state.totals).map(seat => ids[seat]);
  return {
    gameId: state.gameId,
    finishedAt,
    seats: state.players.map(p => ({ playerId: p.id, name: p.name })),
    roundScores: state.roundScores.map(round => round.slice()),
    totals: state.totals.slice(),
    winners,
    tie: winners.length > 1,
    moonShooters: state.moonHistory.map(seat => (seat === null ? null : ids[seat])),
    perfect: perfectSeats(state.totals).map(seat => ids[seat]),
  };
}

export function appendRecord(records: readonly GameRecord[], record: GameRecord): GameRecord[] {
  if (records.some(r => r.gameId === record.gameId)) return records as GameRecord[];
  return [...records, record];
}
