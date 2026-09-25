import { type Card, type CardId, cardId, deal } from './cards';
import { applyPasses, passDirection } from './passing';
import { findTwoOfClubs, legalPlays, type Trick, type TrickCard, trickPoints, trickWinner } from './rules';
import { scoreRound } from './scoring';
import { sortHand } from './sort';

export const GAME_VERSION = 1;
export const ROUNDS = 4;
export const TRICKS_PER_ROUND = 13;

export interface SeatPlayer {
  id: string;
  name: string;
}

export type Phase =
  | 'setup'
  | 'dealing'
  | 'passing'
  | 'leadAnnounce'
  | 'playing'
  | 'trickResult'
  | 'roundSummary'
  | 'gameOver';

export interface LastTrick {
  winner: number;
  cards: TrickCard[];
  points: number;
}

export interface GameState {
  version: number;
  gameId: string;
  players: SeatPlayer[];
  round: number;
  phase: Phase;
  hands: Card[][];
  received: CardId[][];
  passSelections: (CardId[] | null)[];
  passer: number;
  current: number;
  handRevealed: boolean;
  trick: Trick;
  lastTrick: LastTrick | null;
  trickNumber: number;
  heartsBroken: boolean;
  taken: number[];
  roundScores: number[][];
  totals: number[];
  moonShooter: number | null;
  moonHistory: (number | null)[];
}

export type Action =
  | { type: 'START_GAME'; players: SeatPlayer[]; gameId: string; seed: number }
  | { type: 'DEAL_DONE' }
  | { type: 'REVEAL_HAND' }
  | { type: 'FINALIZE_PASS'; cards: CardId[] }
  | { type: 'BEGIN_PLAY' }
  | { type: 'PLAY_CARD'; card: CardId }
  | { type: 'ACK_TRICK' }
  | { type: 'NEXT_ROUND'; seed: number }
  | { type: 'PLAY_AGAIN'; gameId: string; seed: number }
  | { type: 'NEW_GAME' };

export function initialState(): GameState {
  return {
    version: GAME_VERSION,
    gameId: '',
    players: [],
    round: 0,
    phase: 'setup',
    hands: [[], [], [], []],
    received: [[], [], [], []],
    passSelections: [null, null, null, null],
    passer: 0,
    current: 0,
    handRevealed: false,
    trick: { leader: 0, cards: [] },
    lastTrick: null,
    trickNumber: 0,
    heartsBroken: false,
    taken: [0, 0, 0, 0],
    roundScores: [],
    totals: [0, 0, 0, 0],
    moonShooter: null,
    moonHistory: [],
  };
}

function startRound(state: GameState, round: number, seed: number): GameState {
  const hands = deal(seed).map(sortHand);
  const leader = findTwoOfClubs(hands);
  return {
    ...state,
    round,
    phase: 'dealing',
    hands,
    received: [[], [], [], []],
    passSelections: [null, null, null, null],
    passer: 0,
    current: leader,
    handRevealed: false,
    trick: { leader, cards: [] },
    lastTrick: null,
    trickNumber: 0,
    heartsBroken: false,
    taken: [0, 0, 0, 0],
    moonShooter: null,
  };
}

function startGame(players: readonly SeatPlayer[], gameId: string, seed: number): GameState {
  const seats = players.map(p => ({ id: p.id, name: p.name }));
  return startRound({ ...initialState(), gameId, players: seats }, 0, seed);
}

export function currentLegalPlays(state: GameState): Card[] {
  if (state.phase !== 'playing') return [];
  return legalPlays({
    hand: state.hands[state.current],
    trick: state.trick,
    firstTrick: state.trickNumber === 0,
    heartsBroken: state.heartsBroken,
  });
}

function finalizePass(state: GameState, cards: CardId[]): GameState {
  if (state.phase !== 'passing' || !state.handRevealed) return state;
  const hand = state.hands[state.passer].map(cardId);
  if (cards.length !== 3 || new Set(cards).size !== 3 || !cards.every(id => hand.includes(id))) {
    return state;
  }
  const passSelections = state.passSelections.slice();
  passSelections[state.passer] = cards.slice();
  if (state.passer < 3) {
    return { ...state, passSelections, passer: state.passer + 1, handRevealed: false };
  }
  const { hands, received } = applyPasses(state.hands, passSelections as CardId[][], state.round);
  const leader = findTwoOfClubs(hands);
  return {
    ...state,
    hands,
    received,
    passSelections: [null, null, null, null],
    phase: 'leadAnnounce',
    current: leader,
    trick: { leader, cards: [] },
    handRevealed: false,
  };
}

function playCard(state: GameState, id: CardId): GameState {
  if (state.phase !== 'playing' || !state.handRevealed) return state;
  const card = currentLegalPlays(state).find(c => cardId(c) === id);
  if (!card) return state;

  const seat = state.current;
  const hands = state.hands.map((hand, i) => (i === seat ? hand.filter(c => cardId(c) !== id) : hand));
  const trick: Trick = { leader: state.trick.leader, cards: [...state.trick.cards, { seat, card }] };
  const heartsBroken = state.heartsBroken || card.suit === 'H';

  if (trick.cards.length < 4) {
    return { ...state, hands, trick, heartsBroken, current: (seat + 1) % 4, handRevealed: false };
  }

  const winner = trickWinner(trick);
  const points = trickPoints(trick);
  return {
    ...state,
    hands,
    heartsBroken,
    taken: state.taken.map((t, i) => (i === winner ? t + points : t)),
    trick: { leader: winner, cards: [] },
    lastTrick: { winner, cards: trick.cards, points },
    trickNumber: state.trickNumber + 1,
    phase: 'trickResult',
    current: winner,
    handRevealed: false,
  };
}

function ackTrick(state: GameState): GameState {
  if (state.phase !== 'trickResult') return state;
  if (state.trickNumber < TRICKS_PER_ROUND) {
    return { ...state, phase: 'playing', handRevealed: true };
  }
  const { scores, moonShooter } = scoreRound(state.taken);
  return {
    ...state,
    phase: 'roundSummary',
    roundScores: [...state.roundScores, scores],
    totals: state.totals.map((t, i) => t + scores[i]),
    moonShooter,
    moonHistory: [...state.moonHistory, moonShooter],
    handRevealed: false,
  };
}

export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const ids = new Set(action.players.map(p => p.id));
      if (state.phase !== 'setup' || action.players.length !== 4 || ids.size !== 4) return state;
      return startGame(action.players, action.gameId, action.seed);
    }
    case 'DEAL_DONE':
      if (state.phase !== 'dealing') return state;
      if (passDirection(state.round) === 'none') return { ...state, phase: 'leadAnnounce' };
      return { ...state, phase: 'passing', passer: 0, handRevealed: false };
    case 'REVEAL_HAND':
      if (state.phase !== 'passing' && state.phase !== 'playing') return state;
      if (state.handRevealed) return state;
      return { ...state, handRevealed: true };
    case 'FINALIZE_PASS':
      return finalizePass(state, action.cards);
    case 'BEGIN_PLAY':
      if (state.phase !== 'leadAnnounce') return state;
      return { ...state, phase: 'playing', handRevealed: true };
    case 'PLAY_CARD':
      return playCard(state, action.card);
    case 'ACK_TRICK':
      return ackTrick(state);
    case 'NEXT_ROUND':
      if (state.phase !== 'roundSummary') return state;
      if (state.round >= ROUNDS - 1) return { ...state, phase: 'gameOver' };
      return startRound(state, state.round + 1, action.seed);
    case 'PLAY_AGAIN':
      if (state.phase !== 'gameOver') return state;
      return startGame(state.players, action.gameId, action.seed);
    case 'NEW_GAME':
      return initialState();
    default:
      return state;
  }
}
