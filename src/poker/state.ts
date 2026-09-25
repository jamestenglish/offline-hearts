import { type Dispatch, useEffect, useReducer, useRef, useState } from 'react';
import { cardId, type Card } from '../shared/cards';
import { getSaveFailures, loadVersioned, removeVersioned, saveVersioned } from '../shared/storage';
import { tournamentReducer, type Action, type Tournament } from './engine/tournament';

export const POKER_KEY = 'poker.tournament';
export const SETTINGS_KEY = 'poker.settings';

type Settings = { version: 1; bigBlind: number };
const defaults: Settings = { version: 1, bigBlind: 10 };
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const amount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const positive = (v: unknown): v is number => amount(v) && v > 0;
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const index = (v: unknown, count: number): v is number => amount(v) && v < count;
const indices = (v: unknown, count: number): v is number[] => Array.isArray(v) && v.every(i => index(i, count)) && new Set(v).size === v.length;
const card = (v: unknown) => record(v) && ['C', 'D', 'S', 'H'].includes(v.suit as string)
  && Number.isInteger(v.rank) && (v.rank as number) >= 2 && (v.rank as number) <= 14;
const cards = (v: unknown): v is Card[] => Array.isArray(v) && v.every(card);

function validResult(result: unknown, count: number, hand: NonNullable<Tournament['hand']> | null, totalChips: number): boolean {
  if (!record(result) || !['showdown', 'uncontested'].includes(result.kind as string)
    || !Array.isArray(result.pots) || !Array.isArray(result.hands)
    || !indices(result.winnerSeats, count) || result.winnerSeats.length === 0) return false;
  if (!result.pots.every(pot => record(pot) && positive(pot.amount) && indices(pot.eligible, count)
    && indices(pot.winners, count) && pot.winners.length > 0 && pot.winners.every((seat: number) => (pot.eligible as number[]).includes(seat)))) return false;
  if (result.kind === 'uncontested' && result.hands.length !== 0) return false;
  if (!result.hands.every(entry => record(entry) && index(entry.seat, count) && cards(entry.hole)
    && entry.hole.length === 2 && (!hand || (hand.hole[entry.seat as number] !== null
    && entry.hole.every((c, i) => cardId(c) === cardId(hand.hole[entry.seat as number]![i]))))
    && record(entry.best) && amount(entry.best.category) && entry.best.category <= 8
    && Array.isArray(entry.best.tiebreak) && entry.best.tiebreak.every(amount)
    && typeof entry.best.label === 'string' && entry.best.label.length > 0
    && cards(entry.best.bestFive) && entry.best.bestFive.length === 5
    && (!hand || entry.best.bestFive.every(c => [...(entry.hole as Card[]), ...hand.board].some(original => cardId(original) === cardId(c)))))) return false;
  if (new Set(result.hands.map(entry => entry.seat)).size !== result.hands.length) return false;
  if (hand) {
    const awarded = result.pots.flatMap(p => p.winners);
    if (result.winnerSeats.length !== new Set(awarded).size
      || !result.winnerSeats.every(seat => awarded.includes(seat))) return false;
    const committed = hand.betting.seats.reduce((total, seat) => total + seat.committed, 0);
    if (!Number.isSafeInteger(committed) || (result.kind === 'showdown' && committed !== 0)) return false;
    // At a showdown all chips have already been awarded; the retained pot records
    // describe the transfer but must not exceed the chips in the tournament.
    if (result.pots.reduce((total, pot) => total + pot.amount, 0) > totalChips) return false;
  }
  return true;
}

export function isValidPoker(value: Tournament): boolean {
  if (!record(value) || value.version !== 1 || typeof value.id !== 'string' || !value.id.trim()
    || !Array.isArray(value.players) || value.players.length < 2 || value.players.length > 8
    || !value.players.every(p => record(p) && typeof p.id === 'string' && !!p.id.trim()
      && typeof p.name === 'string' && !!p.name.trim())
    || new Set(value.players.map(p => p.id)).size !== value.players.length
    || !positive(value.initialChips) || !Number.isSafeInteger(value.initialChips * value.players.length)
    || !Array.isArray(value.stacks) || value.stacks.length !== value.players.length || !value.stacks.every(amount)
    || !index(value.dealer, value.players.length) || !positive(value.handNumber)
    || !['hand', 'result', 'finished'].includes(value.phase) || !bool(value.holeRevealed)) return false;
  const count = value.players.length;
  if (value.phase === 'finished') {
    return value.hand === null && value.street === null && value.current === null
      && !value.holeRevealed && value.stacks.filter(s => s > 0).length === 1
      && value.stacks.reduce((a, b) => a + b, 0) === value.initialChips * count
      && validResult(value.result, count, null, value.initialChips * count) && value.result!.winnerSeats.includes(value.stacks.findIndex(s => s > 0));
  }
  const hand = value.hand;
  if (!record(hand) || !['preflop', 'flop', 'turn', 'river'].includes(value.street as string)
    || !positive(hand.bigBlind) || hand.smallBlind !== Math.ceil(hand.bigBlind / 2)
    || !Array.isArray(hand.hole) || hand.hole.length !== count
    || !hand.hole.every(hole => hole === null || (cards(hole) && hole.length === 2))
    || !cards(hand.deck) || !cards(hand.board) || !cards(hand.burned)) return false;
  const boardCount = { preflop: 0, flop: 3, turn: 4, river: 5 }[value.street as 'preflop' | 'flop' | 'turn' | 'river'];
  const burnCount = { preflop: 0, flop: 1, turn: 2, river: 3 }[value.street as 'preflop' | 'flop' | 'turn' | 'river'];
  const dealt = [...hand.hole.flatMap(hole => hole ?? []), ...hand.deck, ...hand.board, ...hand.burned];
  if (hand.board.length !== boardCount || hand.burned.length !== burnCount
    || dealt.length !== 52 || new Set(dealt.map(cardId)).size !== 52
    || hand.hole.filter(hole => hole !== null).length < 2 || !record(hand.betting)) return false;
  const betting = hand.betting;
  if (!Array.isArray(betting.seats) || betting.seats.length !== count || !amount(betting.currentBet)
    || !positive(betting.lastFullRaise) || betting.bigBlind !== hand.bigBlind
    || !indices(betting.pending, count) || (betting.current !== null && !index(betting.current, count))
    || betting.current !== (betting.pending[0] ?? null) || value.current !== betting.current) return false;
  if (!betting.seats.every((seat, i) => record(seat) && amount(seat.stack) && amount(seat.streetBet)
    && amount(seat.committed) && seat.streetBet <= seat.committed && seat.stack === value.stacks[i]
    && bool(seat.folded) && bool(seat.allIn) && bool(seat.actedSinceFullRaise) && bool(seat.raiseLocked)
    && (!seat.allIn || seat.stack === 0) && (seat.folded || seat.allIn || seat.stack > 0)
    && (hand.hole[i] === null ? seat.folded && seat.allIn && seat.stack === 0 && seat.committed === 0 : true))) return false;
  if (betting.pending.some(i => betting.seats[i].folded || betting.seats[i].allIn || betting.seats[i].stack === 0)
    || !Number.isSafeInteger(betting.seats.reduce((a, s) => a + s.committed, 0))
    || value.stacks.reduce((a, b) => a + b, 0) + betting.seats.reduce((a, s) => a + s.committed, 0) !== value.initialChips * count
    || (value.phase === 'hand' && (betting.current === null || value.result !== null || betting.seats.filter(s => !s.folded).length < 2))
    || (value.phase === 'result' && (betting.current !== null || betting.pending.length !== 0
      || !validResult(value.result, count, hand, value.initialChips * count) || value.holeRevealed))) return false;
  return true;
}

export function loadPoker(): Tournament | null {
  const value = loadVersioned<Tournament>(POKER_KEY, 1, isValidPoker);
  return value ? { ...value, holeRevealed: false } : null;
}

export function loadSettings(): Settings {
  return loadVersioned<Settings>(SETTINGS_KEY, 1, value => record(value) && positive(value.bigBlind)) ?? { ...defaults };
}

export function saveSettings(bigBlind: number): boolean {
  if (!positive(bigBlind)) return false;
  saveVersioned(SETTINGS_KEY, { version: 1, bigBlind });
  return !getSaveFailures().split(', ').includes(SETTINGS_KEY);
}

function reducer(state: Tournament | null, action: Action): Tournament | null {
  return tournamentReducer(state, action);
}

export function usePoker(): { state: Tournament | null; dispatch: Dispatch<Action>; resumable: boolean; bigBlind: number; setBigBlind: (value: number) => boolean } {
  const [state, baseDispatch] = useReducer(reducer, undefined, loadPoker);
  const [bigBlind, setBigBlindValue] = useState(() => loadSettings().bigBlind);
  const pendingBlind = useRef<number | null>(null);
  const setBigBlind = (value: number): boolean => {
    if (!positive(value)) return false;
    pendingBlind.current = value;
    setBigBlindValue(value);
    return saveSettings(value);
  };
  const dispatch: Dispatch<Action> = action => baseDispatch(action.type === 'NEXT_HAND'
    ? { ...action, bigBlind: pendingBlind.current ?? loadSettings().bigBlind } : action);
  const [resumable] = useState(() => state !== null && state.phase !== 'finished');
  const mounted = useRef(false);
  useEffect(() => {
    if (state === null) {
      if (mounted.current) {
        removeVersioned(POKER_KEY);
      }
    } else saveVersioned(POKER_KEY, { ...state, holeRevealed: false });
    mounted.current = true;
  }, [state]);
  return { state, dispatch, resumable, bigBlind, setBigBlind };
}
