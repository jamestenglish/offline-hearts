import { type Dispatch, useEffect, useReducer, useState } from 'react';
import { cardId as toCardId } from '../engine/cards';
import { type Action, GAME_VERSION, gameReducer, type GameState, initialState } from '../engine/game';
import { GAME_KEY, loadVersioned, saveVersioned } from './storage';

const phases = ['setup', 'dealing', 'passing', 'leadAnnounce', 'playing', 'trickResult', 'roundSummary', 'gameOver'];
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const seat = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 4;
const score = (v: unknown) => Number.isFinite(v) && (v as number) >= 0 && Number.isInteger(v);
const four = (v: unknown, valid: (v: unknown) => boolean) => Array.isArray(v) && v.length === 4 && v.every(valid);
const cardId = (v: unknown) => typeof v === 'string' && /^(?:[2-9]|10|J|Q|K|A)[CDSH]$/.test(v);
const card = (v: unknown) => record(v) && ['C', 'D', 'S', 'H'].includes(v.suit as string)
  && Number.isInteger(v.rank) && (v.rank as number) >= 2 && (v.rank as number) <= 14;
const trickCard = (v: unknown) => record(v) && seat(v.seat) && card(v.card);
const trick = (v: unknown) => record(v) && seat(v.leader) && Array.isArray(v.cards)
  && v.cards.length <= 4 && v.cards.every(trickCard);

export function isValidGame(value: GameState): boolean {
  if (!record(value) || value.version !== GAME_VERSION || !phases.includes(value.phase)
    || typeof value.gameId !== 'string' || !Array.isArray(value.players)
    || !value.players.every(p => record(p) && typeof p.id === 'string' && typeof p.name === 'string')
    || (value.phase === 'setup' ? value.players.length !== 0 : value.players.length !== 4)
    || !Number.isInteger(value.round) || value.round < 0 || value.round >= 4
    || !four(value.hands, v => Array.isArray(v) && v.every(card))
    || !four(value.received, v => Array.isArray(v) && v.every(cardId))
    || !four(value.passSelections, v => v === null || (Array.isArray(v) && v.every(cardId)))
    || !seat(value.passer) || !seat(value.current) || typeof value.handRevealed !== 'boolean'
    || !trick(value.trick) || (value.lastTrick !== null && (!record(value.lastTrick)
      || !seat(value.lastTrick.winner) || !Array.isArray(value.lastTrick.cards)
      || value.lastTrick.cards.length !== 4 || !value.lastTrick.cards.every(trickCard)
      || !score(value.lastTrick.points)))
    || !Number.isInteger(value.trickNumber) || value.trickNumber < 0 || value.trickNumber > 13
    || typeof value.heartsBroken !== 'boolean' || !four(value.taken, score)
    || !Array.isArray(value.roundScores) || !value.roundScores.every(s => four(s, score))
    || (value.tricksWon !== undefined && !four(value.tricksWon, score))
    || !four(value.totals, score) || (value.moonShooter !== null && !seat(value.moonShooter))
    || !Array.isArray(value.moonHistory) || !value.moonHistory.every(s => s === null || seat(s))) {
    return false;
  }
  if (value.phase !== 'setup') {
    const activeCards = [...value.hands.flat(), ...value.trick.cards.map(c => c.card)];
    if (activeCards.length !== 52 - 4 * value.trickNumber
      || new Set(activeCards.map(toCardId)).size !== activeCards.length) return false;
  }
  return true;
}

export function loadGame(): GameState {
  const saved = loadVersioned<GameState>(GAME_KEY, GAME_VERSION, isValidGame);
  return saved ? { ...saved, tricksWon: saved.tricksWon ?? [0, 0, 0, 0], handRevealed: false } : initialState();
}

export function useGame(): { state: GameState; dispatch: Dispatch<Action>; resumable: boolean } {
  const [state, dispatch] = useReducer(gameReducer, undefined, loadGame);
  const [resumable] = useState(() => state.phase !== 'setup' && state.phase !== 'gameOver');

  useEffect(() => {
    saveVersioned(GAME_KEY, state);
  }, [state]);

  return { state, dispatch, resumable };
}
