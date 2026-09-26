import { cardId, mulberry32, newDeck, type Card } from '../../shared/cards';
import { bestOfSeven, compareHands } from './evaluate';

export interface EquityPlayer {
  seat: number;
  hole: [Card, Card];
}

export interface EquityInput {
  players: EquityPlayer[];
  board: Card[];
}

export interface EquityCursor {
  indices: number[];
  processed: number;
  shares: number[];
  total: number;
  done: boolean;
}

export function runoutCount(available: number, missing: number): number {
  if (!Number.isSafeInteger(available) || !Number.isSafeInteger(missing)
    || available < 0 || missing < 0 || missing > available) {
    throw new RangeError('Invalid runout dimensions');
  }
  let count = 1;
  for (let i = 1; i <= Math.min(missing, available - missing); i++) {
    count = count * (available - i + 1) / i;
  }
  if (!Number.isSafeInteger(count)) throw new RangeError('Runout count exceeds safe integer range');
  return count;
}

function validate(input: EquityInput): void {
  if (input.players.length < 2 || ![0, 3, 4, 5].includes(input.board.length)) {
    throw new RangeError('Invalid player count or board length');
  }
  const seats = new Set(input.players.map(player => player.seat));
  if (seats.size !== input.players.length) throw new RangeError('Duplicate player seats');

  const known = [...input.board, ...input.players.flatMap(player => player.hole)];
  const valid = new Set(newDeck().map(cardId));
  const ids = known.map(cardId);
  if (input.players.some(player => player.hole.length !== 2)
    || ids.some(id => !valid.has(id)) || new Set(ids).size !== ids.length) {
    throw new RangeError('Invalid or duplicate known cards');
  }
}

export function candidateCards(input: EquityInput): Card[] {
  validate(input);
  const known = new Set([...input.board, ...input.players.flatMap(player => player.hole)].map(cardId));
  return newDeck().filter(card => !known.has(cardId(card)));
}

export function createEquity(input: EquityInput): { cursor: EquityCursor; advance(maxRunouts: number): EquityCursor } {
  const candidates = candidateCards(input);
  const board = [...input.board];
  const holes = input.players.map(player => [...player.hole]);
  const missing = 5 - board.length;
  const total = runoutCount(candidates.length, missing);
  const indices = Array.from({ length: missing }, (_, index) => index);
  const shares = input.players.map(() => 0);
  let processed = 0;

  const snapshot = (): EquityCursor => ({
    indices: [...indices], processed, shares: [...shares], total, done: processed === total,
  });

  function advance(maxRunouts: number): EquityCursor {
    if (!Number.isSafeInteger(maxRunouts) || maxRunouts < 0) {
      throw new RangeError('maxRunouts must be a nonnegative integer');
    }
    const stop = Math.min(total, processed + maxRunouts);
    while (processed < stop) {
      const completed = [...board, ...indices.map(index => candidates[index])];
      const ranks = holes.map(hole => bestOfSeven([...hole, ...completed]));
      let winners = [0];
      for (let i = 1; i < ranks.length; i++) {
        const comparison = compareHands(ranks[i], ranks[winners[0]]);
        if (comparison > 0) winners = [i];
        else if (comparison === 0) winners.push(i);
      }
      for (const winner of winners) shares[winner] += 1 / winners.length;
      processed++;

      if (processed < total) {
        for (let i = missing - 1; i >= 0; i--) {
          if (indices[i] < candidates.length - missing + i) {
            indices[i]++;
            for (let j = i + 1; j < missing; j++) indices[j] = indices[j - 1] + 1;
            break;
          }
        }
      }
    }
    return snapshot();
  }

  return { get cursor() { return snapshot(); }, advance };
}

export function createSampledEquity(input: EquityInput, samples: number, seed: number):
  { cursor: EquityCursor; advance(maxRunouts: number): EquityCursor } {
  const candidates = candidateCards(input);
  if (!Number.isSafeInteger(samples) || samples < 1 || !Number.isSafeInteger(seed)) {
    throw new RangeError('Invalid sample count or seed');
  }
  const missing = 5 - input.board.length;
  const total = Math.min(samples, runoutCount(candidates.length, missing));
  if (total === runoutCount(candidates.length, missing)) return createEquity(input);
  const rng = mulberry32(seed);
  const knownBoard = input.board.slice();
  const holes = input.players.map(player => player.hole.slice());
  const shares = input.players.map(() => 0);
  const seen = new Set<string>();
  let processed = 0;
  const snapshot = (): EquityCursor => ({ indices: [], processed, shares: shares.slice(), total, done: processed === total });

  function advance(maxRunouts: number): EquityCursor {
    if (!Number.isSafeInteger(maxRunouts) || maxRunouts < 0) throw new RangeError('maxRunouts must be a nonnegative integer');
    const stop = Math.min(total, processed + maxRunouts);
    while (processed < stop) {
      let indices: number[];
      let key: string;
      do {
        const pool = Array.from({ length: candidates.length }, (_, i) => i);
        indices = [];
        for (let i = 0; i < missing; i++) {
          const next = i + Math.floor(rng() * (pool.length - i));
          [pool[i], pool[next]] = [pool[next], pool[i]];
          indices.push(pool[i]);
        }
        key = indices.slice().sort((a, b) => a - b).join(',');
      } while (seen.has(key));
      seen.add(key);
      const board = [...knownBoard, ...indices.map(i => candidates[i])];
      const ranks = holes.map(hole => bestOfSeven([...hole, ...board]));
      let winners = [0];
      for (let i = 1; i < ranks.length; i++) {
        const comparison = compareHands(ranks[i], ranks[winners[0]]);
        if (comparison > 0) winners = [i];
        else if (comparison === 0) winners.push(i);
      }
      for (const winner of winners) shares[winner] += 1 / winners.length;
      processed++;
    }
    return snapshot();
  }

  return { get cursor() { return snapshot(); }, advance };
}
