import type { Card } from '../../shared/cards';
import { act, roundComplete, type BetAction, type BetSeat, type BettingState } from './betting';
import { bestOfSeven, type HandRank } from './evaluate';
import { awardPots, awardUncontested, buildPots, refundUncalled } from './pots';
import { dealHand, firstDealer, nextLive, positions, revealStreet } from './seats';

export interface Tournament {
  version: 1;
  id: string;
  players: { id: string; name: string }[];
  initialChips: number;
  stacks: number[];
  dealer: number;
  handNumber: number;
  phase: 'hand' | 'result' | 'finished';
  street: 'preflop' | 'flop' | 'turn' | 'river' | null;
  hand: {
    hole: (Card[] | null)[];
    deck: Card[];
    board: Card[];
    burned: Card[];
    betting: BettingState;
    bigBlind: number;
    smallBlind: number;
  } | null;
  result: {
    kind: 'showdown' | 'uncontested';
    pots: { amount: number; eligible: number[]; winners: number[] }[];
    hands: { seat: number; hole: Card[]; best: HandRank }[];
    winnerSeats: number[];
  } | null;
  current: number | null;
  holeRevealed: boolean;
}

export type Action =
  | { type: 'START'; players: { id: string; name: string }[]; stack: number; bigBlind: number; id: string; seed: number }
  | { type: 'REVEAL' }
  | { type: 'ACT'; action: BetAction }
  | { type: 'NEXT_HAND'; seed: number; bigBlind: number }
  | { type: 'ABANDON' };

export function initialTournament(): Tournament | null { return null; }

function validAmount(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function validSeed(seed: number): boolean { return Number.isSafeInteger(seed); }

function startHand(state: Tournament, seed: number, bigBlind: number): Tournament {
  const { small, big, preflopFirst } = positions(state.stacks.map(stack => ({ stack })), state.dealer);
  const smallBlind = Math.ceil(bigBlind / 2);
  const seats: BetSeat[] = state.stacks.map(stack => ({ stack, streetBet: 0, committed: 0,
    folded: stack === 0, allIn: stack === 0, actedSinceFullRaise: false, raiseLocked: false }));
  for (const [index, amount] of [[small, smallBlind], [big, bigBlind]]) {
    const seat = seats[index];
    const paid = Math.min(seat.stack, amount);
    seat.stack -= paid;
    seat.streetBet += paid;
    seat.committed += paid;
    seat.allIn = seat.stack === 0;
  }
  const pending = Array.from({ length: seats.length }, (_, offset) => (preflopFirst + offset) % seats.length)
    .filter(index => !seats[index].folded && !seats[index].allIn);
  const betting: BettingState = { seats, currentBet: Math.max(seats[small].streetBet, seats[big].streetBet),
    lastFullRaise: bigBlind, pending, current: pending[0] ?? null, bigBlind };
  return settle({ ...state, phase: 'hand', street: 'preflop', result: null, current: betting.current,
    holeRevealed: false, stacks: seats.map(seat => seat.stack),
    hand: { ...dealHand(state.stacks.map(stack => ({ stack })), state.dealer, seed),
      betting, bigBlind, smallBlind } });
}

function nextStreet(state: Tournament): Tournament {
  const hand = state.hand!;
  const street = state.street === 'preflop' ? 'flop' : state.street === 'flop' ? 'turn' : 'river';
  const revealed = revealStreet(hand, street);
  const seats = hand.betting.seats.map(seat => ({ ...seat, streetBet: 0,
    actedSinceFullRaise: false, raiseLocked: false }));
  const first = (state.dealer + 1 + seats.findIndex((_, offset) => {
    const index = (state.dealer + 1 + offset) % seats.length;
    return !seats[index].folded && !seats[index].allIn;
  })) % seats.length;
  const pending = Array.from({ length: seats.length }, (_, offset) => (first + offset) % seats.length)
    .filter(index => !seats[index].folded && !seats[index].allIn);
  const betting: BettingState = { ...hand.betting, seats, pending, current: pending[0] ?? null,
    currentBet: 0, lastFullRaise: hand.bigBlind };
  return { ...state, street, hand: { ...hand, ...revealed, betting }, current: betting.current };
}

function finishHand(state: Tournament): Tournament {
  const hand = state.hand!;
  const seats = hand.betting.seats;
  const live = seats.flatMap((seat, index) => !seat.folded ? [index] : []);
  if (live.length === 1) {
    const winner = live[0];
    const refunded = refundUncalled(seats).seats;
    const pots = buildPots(refunded).map(pot => ({ ...pot, winners: [winner] }));
    const awarded = awardUncontested(seats, winner);
    return { ...state, phase: 'result', current: null, holeRevealed: false,
      hand: { ...hand, betting: { ...hand.betting, seats: awarded, pending: [], current: null } },
      stacks: awarded.map(seat => seat.stack),
      result: { kind: 'uncontested', pots, hands: [], winnerSeats: [winner] } };
  }
  const hands = live.map(seat => ({ seat, hole: hand.hole[seat]!.slice(),
    best: bestOfSeven([...hand.hole[seat]!, ...hand.board]) }));
  const { seats: awarded, pots } = awardPots(seats, state.dealer,
    new Map(hands.map(({ seat, best }) => [seat, best])));
  return { ...state, phase: 'result', current: null, holeRevealed: false,
    hand: { ...hand, betting: { ...hand.betting, seats: awarded, pending: [], current: null } },
    stacks: awarded.map(seat => seat.stack),
    result: { kind: 'showdown', pots, hands,
      winnerSeats: [...new Set(pots.flatMap(pot => pot.winners))] } };
}

function settle(state: Tournament): Tournament {
  if (state.phase !== 'hand' || !state.hand) return state;
  if (state.hand.betting.seats.filter(seat => !seat.folded).length === 1) return finishHand(state);
  if (!roundComplete(state.hand.betting)) return state;
  // No additional wagers are possible when at most one non-all-in player remains.
  const actionable = state.hand.betting.seats.filter(seat => !seat.folded && !seat.allIn).length;
  let next = state;
  while (next.street !== 'river') {
    next = nextStreet(next);
    if (actionable > 1) return next;
  }
  return finishHand(next);
}

export function tournamentReducer(state: Tournament | null, action: Action): Tournament | null {
  if (action.type === 'ABANDON') return null;
  if (action.type === 'START') {
    if (state !== null || !Array.isArray(action.players) || action.players.length < 2 || action.players.length > 8 ||
      !validAmount(action.stack) || !validAmount(action.bigBlind) || action.stack < action.bigBlind || !validSeed(action.seed) ||
      !Number.isSafeInteger(action.stack * action.players.length) ||
      typeof action.id !== 'string' || !action.id.trim() ||
      action.players.some(player => !player || typeof player.id !== 'string' || !player.id.trim() ||
        typeof player.name !== 'string' || !player.name.trim()) ||
      new Set(action.players.map(player => player.id)).size !== action.players.length) return state;
    const stacks = action.players.map(() => action.stack);
    const base: Tournament = { version: 1, id: action.id, players: action.players.map(player => ({ ...player })),
      initialChips: action.stack, stacks, dealer: firstDealer(stacks.map(stack => ({ stack })), action.seed),
      handNumber: 1, phase: 'hand', street: null, hand: null, result: null, current: null, holeRevealed: false };
    return startHand(base, action.seed, action.bigBlind);
  }
  if (!state) return state;
  if (action.type === 'NEXT_HAND') {
    if (state.phase !== 'result' || !validAmount(action.bigBlind) || !validSeed(action.seed)) return state;
    if (state.stacks.filter(stack => stack > 0).length === 1) {
      return { ...state, phase: 'finished', street: null, hand: null, current: null, holeRevealed: false };
    }
    const dealer = nextLive(state.stacks.map(stack => ({ stack })), state.dealer);
    return startHand({ ...state, dealer, handNumber: state.handNumber + 1 }, action.seed, action.bigBlind);
  }
  if (state.phase !== 'hand' || !state.hand || state.current === null) return state;
  if (action.type === 'REVEAL') return state.holeRevealed ? state : { ...state, holeRevealed: true };
  if (action.type === 'ACT') {
    if (!state.holeRevealed) return state;
    const betting = act(state.hand.betting, action.action);
    if (betting === state.hand.betting) return state;
    return settle({ ...state, hand: { ...state.hand, betting }, stacks: betting.seats.map(seat => seat.stack),
      current: betting.current, holeRevealed: false });
  }
  return state;
}
