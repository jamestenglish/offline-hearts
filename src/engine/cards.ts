export type Suit = 'C' | 'D' | 'S' | 'H';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card {
  suit: Suit;
  rank: Rank;
}
export type CardId = string;

export const SUITS: readonly Suit[] = ['C', 'D', 'S', 'H'];
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const SUIT_SYMBOL: Record<Suit, string> = { C: '♣', D: '♦', S: '♠', H: '♥' };
export const TWO_OF_CLUBS: CardId = '2C';

const FACE_LABEL: Partial<Record<Rank, string>> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const FACE_RANK: Record<string, Rank> = { J: 11, Q: 12, K: 13, A: 14 };

export function rankLabel(rank: Rank): string {
  return FACE_LABEL[rank] ?? String(rank);
}

export function cardId(card: Card): CardId {
  return `${rankLabel(card.rank)}${card.suit}`;
}

export function parseCardId(id: CardId): Card {
  const suit = id.slice(-1) as Suit;
  const label = id.slice(0, -1);
  const rank = (FACE_RANK[label] ?? Number(label)) as Rank;
  return { suit, rank };
}

export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

export function cardPoints(card: Card): number {
  if (card.suit === 'H') return 1;
  if (card.suit === 'S' && card.rank === 12) return 13;
  return 0;
}

export function newDeck(): Card[] {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank })));
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function deal(seed: number): Card[][] {
  const deck = shuffle(newDeck(), mulberry32(seed));
  const hands: Card[][] = [[], [], [], []];
  deck.forEach((card, i) => hands[i % 4].push(card));
  return hands;
}
