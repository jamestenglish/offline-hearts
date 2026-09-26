import { cardId, type Card } from '../shared/cards';
import type { EquityPlayer } from './engine/equity';

export type EquityPhase = 'preflop' | 'flop' | 'turn' | 'river';

export interface EquityJob {
  key: string;
  handId: string;
  phase: EquityPhase;
  players: EquityPlayer[];
  board: Card[];
}

export type EquityRequest =
  | { type: 'start'; job: EquityJob }
  | { type: 'cancel'; key: string }
  | { type: 'cancelAll' };

export type EquityResponse =
  | { type: 'progress'; key: string; processed: number; total: number }
  | { type: 'result'; key: string; processed: number; total: number; shares: number[] }
  | { type: 'error'; key: string; message: string };

export function equityKey(handId: string, phase: EquityPhase, players: EquityPlayer[], board: Card[]): string {
  return JSON.stringify([handId, phase, players.map(({ seat, hole }) => [seat, ...hole.map(cardId)]), board.map(cardId)]);
}
