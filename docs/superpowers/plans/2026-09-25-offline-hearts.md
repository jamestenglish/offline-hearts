# Offline Hearts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pass-and-play, 4-player, 4-round Hearts PWA (installable to the iOS Home Screen, fully offline) with a managed player roster, game log, and per-player stats, deployed to GitHub Pages.

**Architecture:** All game rules live in pure TypeScript modules under `src/engine/` (no React), driven by a single serializable `GameState` and a pure reducer. React screens render by `state.phase`; three small hooks persist the game, roster, and history to separate localStorage keys. `vite-plugin-pwa` generates the service worker and manifest.

**Tech Stack:** React 19, Vite 8, TypeScript ~5.9, Vitest 5 + jsdom + Testing Library, vite-plugin-pwa 1.x, @vite-pwa/assets-generator, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-09-25-offline-hearts-design.md` — read it before starting any task.

## Global Constraints

- Fixed 4 rounds; pass direction by round index: 0 left, 1 right, 2 across, 3 none.
- Seats 0..3 clockwise. Left = seat+1, right = seat+3, across = seat+2 (mod 4).
- Rules: 2♣ leads first trick; follow suit; no hearts/Q♠ on first trick unless holding nothing else; no heart lead until broken unless only hearts; heart = 1, Q♠ = 13; moon = shooter 0, others +26.
- Winners = all seats tied for lowest total; each tied winner gets a win AND a tie.
- Reducer is pure: randomness comes in through action payloads (`seed`, `gameId`).
- Illegal actions return the unchanged state object (same reference).
- localStorage keys: `hearts.game`, `hearts.roster`, `hearts.history`; each `{ version: 1, ... }` and validated independently.
- A loaded game always has `handRevealed: false` (a reload never shows a hand).
- `vite.config` `base: '/offline-hearts/'`.
- No image assets for cards: cards are CSS/Unicode. Only PNG/ICO icons for the PWA.
- Portrait, iPhone-first; inputs use `font-size: 16px` (prevents iOS zoom); buttons `touch-action: manipulation`.
- Roster names: trimmed, internal whitespace collapsed, 1–20 chars, unique case-insensitively across all roster players (including archived).

## Review Focus

1. **Reload at any phase** (mid-deal, after some players finalized passes, mid-trick, on Game Over) must resume correctly without exposing a hand — pinned in Task 9 (load → `handRevealed: false`, JSON round-trip then autoplay to end) and Task 15 (App resume prompt).
2. **No soft-lock from rules edge cases** (first trick holding only hearts + Q♠; leading with only hearts before broken) — `legalPlays` must never be empty for a non-empty hand. Pinned in Task 4 edge tests and Task 6 multi-seed simulation asserting non-empty legal plays.
3. **Double-taps / rapid repeat taps** on "Play" or "Finalize Selection" must not act twice — pinned in Task 6 (repeat `PLAY_CARD` / `FINALIZE_PASS` after hand hidden is ignored).
4. **Messy player names** (blank, spaces only, `" alice "` vs `"Alice"`, 21+ chars, name of a hidden player) must be rejected with a message — pinned in Task 7.
5. **Game Over recorded exactly once** despite reloads and React StrictMode double effects — pinned in Task 8 (`appendRecord` idempotency) and Task 15 (mount App twice with a gameOver save → one record).

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html
public/icon.svg (+ generated PNG/ICO icons, Task 16)
.github/workflows/deploy.yml
src/
  main.tsx                 entry; imports CSS; StrictMode
  App.tsx                  view switching, resume prompt, history recording
  random.ts                randomSeed(), newId()
  engine/
    cards.ts               Card types, deck, ids, labels, points, PRNG, shuffle, deal
    sort.ts                suitOrder, sortHand
    rules.ts               Trick types, legalPlays, trickWinner, trickPoints, findTwoOfClubs
    passing.ts             passDirection, passTarget, applyPasses
    scoring.ts             scoreRound, winningSeats, perfectSeats
    game.ts                GameState, Action, initialState, gameReducer, currentLegalPlays
    roster.ts              Player, cleanName, validateName, addPlayer, renamePlayer, setArchived, activePlayers
    history.ts             GameRecord, buildRecord, appendRecord
    stats.ts               PlayerStats, computeStats
  state/
    storage.ts             keys, loadVersioned, saveVersioned
    useGame.ts             loadGame, isValidGame, useGame
    useRoster.ts           useRoster
    useHistory.ts          useHistory
  components/
    CardView.tsx, Hand.tsx, PrivacyScreen.tsx, ConfirmDialog.tsx, Celebration.tsx, Table.tsx, Scoreboard.tsx
  screens/
    SetupScreen.tsx, PlayersScreen.tsx, DealScreen.tsx, PassScreen.tsx, LeadScreen.tsx,
    PlayScreen.tsx, TrickResultScreen.tsx, RoundSummaryScreen.tsx, GameOverScreen.tsx, StatsScreen.tsx
  styles/
    base.css, card.css, table.css, celebration.css
  test/
    setup.ts               jest-dom matchers + RTL cleanup
    autoplay.ts            autoAction(state) helper for simulations
```

Tests live next to the code they test as `*.test.ts(x)`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/test/setup.ts`, `src/App.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm test` (Vitest, jsdom), `npm run build` (typecheck + Vite build), `export function App()` in `src/App.tsx`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "offline-hearts",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install react@^19 react-dom@^19
npm install -D vite@^8 @vitejs/plugin-react@^6 typescript@~5.9 vitest@^5 jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event @types/react@^19 @types/react-dom@^19
```
Expected: installs without peer-dependency errors.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Write `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/offline-hearts/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 5: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b5d2a" />
    <title>Offline Hearts</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Write `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

- [ ] **Step 7: Write the failing test `src/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /offline hearts/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./App`.

- [ ] **Step 9: Write `src/App.tsx` and `src/main.tsx`**

`src/App.tsx`:
```tsx
export function App() {
  return <h1>Offline Hearts</h1>;
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 10: Update `.gitignore`**

Replace contents with:
```
ignore/prompts
node_modules
dist
dev-dist
*.local
```

- [ ] **Step 11: Verify tests and build pass**

Run: `npm test` → Expected: 1 passed.
Run: `npm run build` → Expected: exits 0, creates `dist/index.html`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold react + vite + vitest project"
```

---

### Task 2: Cards, deck, PRNG, deal

**Files:**
- Create: `src/engine/cards.ts`
- Test: `src/engine/cards.test.ts`

**Interfaces:**
- Produces:
  - `type Suit = 'C' | 'D' | 'S' | 'H'`; `type Rank = 2..14` (11 J, 12 Q, 13 K, 14 A)
  - `interface Card { suit: Suit; rank: Rank }`; `type CardId = string` (e.g. `"10H"`, `"QS"`, `"2C"`)
  - `SUITS`, `RANKS`, `SUIT_SYMBOL: Record<Suit,string>`, `TWO_OF_CLUBS: CardId = '2C'`
  - `rankLabel(rank): string`, `cardId(card): CardId`, `parseCardId(id): Card`, `cardLabel(card): string` (e.g. `"Q♠"`)
  - `isRed(suit): boolean`, `cardPoints(card): number`
  - `newDeck(): Card[]`, `mulberry32(seed: number): () => number`, `shuffle<T>(items, rng): T[]` (non-mutating), `deal(seed: number): Card[][]` (4 × 13)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  cardId, cardLabel, cardPoints, deal, isRed, mulberry32, newDeck, parseCardId, shuffle,
} from './cards';

describe('cards', () => {
  it('builds a 52-card deck of unique cards', () => {
    const ids = newDeck().map(cardId);
    expect(ids).toHaveLength(52);
    expect(new Set(ids).size).toBe(52);
  });

  it('formats and parses ids', () => {
    expect(cardId({ suit: 'H', rank: 10 })).toBe('10H');
    expect(cardId({ suit: 'S', rank: 12 })).toBe('QS');
    expect(parseCardId('10H')).toEqual({ suit: 'H', rank: 10 });
    expect(parseCardId('AS')).toEqual({ suit: 'S', rank: 14 });
    expect(parseCardId('2C')).toEqual({ suit: 'C', rank: 2 });
    expect(cardLabel({ suit: 'S', rank: 12 })).toBe('Q♠');
  });

  it('scores hearts 1 and the queen of spades 13, totalling 26', () => {
    expect(cardPoints({ suit: 'H', rank: 2 })).toBe(1);
    expect(cardPoints({ suit: 'S', rank: 12 })).toBe(13);
    expect(cardPoints({ suit: 'S', rank: 13 })).toBe(0);
    expect(newDeck().reduce((sum, c) => sum + cardPoints(c), 0)).toBe(26);
  });

  it('knows red suits', () => {
    expect(isRed('H')).toBe(true);
    expect(isRed('D')).toBe(true);
    expect(isRed('S')).toBe(false);
    expect(isRed('C')).toBe(false);
  });

  it('shuffles without mutating the input', () => {
    const deck = newDeck();
    const before = deck.map(cardId);
    const out = shuffle(deck, mulberry32(1));
    expect(deck.map(cardId)).toEqual(before);
    expect(out.map(cardId).sort()).toEqual([...before].sort());
    expect(out.map(cardId)).not.toEqual(before);
  });

  it('deals 4 hands of 13 deterministically by seed', () => {
    const hands = deal(42);
    expect(hands).toHaveLength(4);
    hands.forEach(h => expect(h).toHaveLength(13));
    expect(new Set(hands.flat().map(cardId)).size).toBe(52);
    expect(deal(42)).toEqual(hands);
    expect(deal(43)).not.toEqual(hands);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/cards.test.ts`
Expected: FAIL — cannot resolve `./cards`.

- [ ] **Step 3: Write `src/engine/cards.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/cards.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/cards.ts src/engine/cards.test.ts
git commit -m "feat(engine): cards, deck, seeded shuffle and deal"
```

---

### Task 3: Hand sorting

**Files:**
- Create: `src/engine/sort.ts`
- Test: `src/engine/sort.test.ts`

**Interfaces:**
- Consumes: `Card`, `Suit`, `isRed`, `parseCardId`, `cardId` from `./cards`.
- Produces: `suitOrder(present: readonly Suit[]): Suit[]`, `sortHand(hand: readonly Card[]): Card[]` (non-mutating).

Algorithm: take the suits present, in base order ♠ ♥ ♣ ♦; enumerate permutations in that lexicographic order; pick the first with the most red/black alternations between neighbours. Within a suit, rank high → low.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { cardId, parseCardId } from './cards';
import { sortHand, suitOrder } from './sort';

const hand = (ids: string[]) => ids.map(parseCardId);

describe('suitOrder', () => {
  it('alternates colours with all four suits', () => {
    expect(suitOrder(['C', 'D', 'H', 'S'])).toEqual(['S', 'H', 'C', 'D']);
  });
  it('alternates when two reds and one black are present', () => {
    expect(suitOrder(['H', 'D', 'C'])).toEqual(['H', 'C', 'D']);
  });
  it('alternates when two blacks and one red are present', () => {
    expect(suitOrder(['S', 'C', 'D'])).toEqual(['S', 'D', 'C']);
  });
  it('keeps base order when alternation is impossible', () => {
    expect(suitOrder(['D', 'H'])).toEqual(['H', 'D']);
    expect(suitOrder(['C', 'S'])).toEqual(['S', 'C']);
  });
  it('handles a single suit', () => {
    expect(suitOrder(['D'])).toEqual(['D']);
  });
});

describe('sortHand', () => {
  it('groups by alternating suit, high to low within each suit', () => {
    const sorted = sortHand(hand(['2C', 'AH', '10S', 'KD', 'QS', '3H', 'JC', '4D']));
    expect(sorted.map(cardId)).toEqual(['QS', '10S', 'AH', '3H', 'JC', '2C', 'KD', '4D']);
  });
  it('does not mutate its input', () => {
    const input = hand(['2C', 'AH']);
    sortHand(input);
    expect(input.map(cardId)).toEqual(['2C', 'AH']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/sort.test.ts`
Expected: FAIL — cannot resolve `./sort`.

- [ ] **Step 3: Write `src/engine/sort.ts`**

```ts
import { type Card, type Suit, isRed } from './cards';

const BASE_ORDER: readonly Suit[] = ['S', 'H', 'C', 'D'];

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]),
  );
}

function alternations(order: readonly Suit[]): number {
  let count = 0;
  for (let i = 1; i < order.length; i++) {
    if (isRed(order[i]) !== isRed(order[i - 1])) count++;
  }
  return count;
}

export function suitOrder(present: readonly Suit[]): Suit[] {
  const suits = BASE_ORDER.filter(s => present.includes(s));
  let best = suits;
  let bestScore = -1;
  for (const order of permutations(suits)) {
    const score = alternations(order);
    if (score > bestScore) {
      best = order;
      bestScore = score;
    }
  }
  return best;
}

export function sortHand(hand: readonly Card[]): Card[] {
  const order = suitOrder([...new Set(hand.map(c => c.suit))]);
  return hand
    .slice()
    .sort((a, b) => order.indexOf(a.suit) - order.indexOf(b.suit) || b.rank - a.rank);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/sort.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/sort.ts src/engine/sort.test.ts
git commit -m "feat(engine): alternating-colour hand sort"
```

---

### Task 4: Trick rules

**Files:**
- Create: `src/engine/rules.ts`
- Test: `src/engine/rules.test.ts`

**Interfaces:**
- Consumes: `Card`, `cardId`, `cardPoints`, `parseCardId`, `TWO_OF_CLUBS` from `./cards`.
- Produces:
  - `interface TrickCard { seat: number; card: Card }`
  - `interface Trick { leader: number; cards: TrickCard[] }`
  - `interface PlayContext { hand: readonly Card[]; trick: Trick; firstTrick: boolean; heartsBroken: boolean }`
  - `legalPlays(ctx: PlayContext): Card[]` — never empty for a non-empty hand
  - `trickWinner(trick: Trick): number` (seat), `trickPoints(trick: Trick): number`
  - `findTwoOfClubs(hands: readonly (readonly Card[])[]): number` (seat, -1 if none)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { type Card, cardId, parseCardId } from './cards';
import { findTwoOfClubs, legalPlays, type Trick, trickPoints, trickWinner } from './rules';

const cards = (ids: string[]) => ids.map(parseCardId);
const ids = (cs: Card[]) => cs.map(cardId).sort();
const trickOf = (leader: number, played: string[]): Trick => ({
  leader,
  cards: played.map((id, i) => ({ seat: (leader + i) % 4, card: parseCardId(id) })),
});
const empty: Trick = { leader: 0, cards: [] };

describe('legalPlays', () => {
  it('forces the 2 of clubs on the opening lead', () => {
    const hand = cards(['2C', 'AC', '5H', 'QS']);
    expect(ids(legalPlays({ hand, trick: empty, firstTrick: true, heartsBroken: false }))).toEqual(['2C']);
  });

  it('requires following suit', () => {
    const hand = cards(['3D', 'KD', '5H', 'QS']);
    const trick = trickOf(1, ['9D']);
    expect(ids(legalPlays({ hand, trick, firstTrick: false, heartsBroken: false }))).toEqual(['3D', 'KD']);
  });

  it('blocks points on the first trick when void and holding safe cards', () => {
    const hand = cards(['QS', '5H', '3D']);
    const trick = trickOf(0, ['2C']);
    expect(ids(legalPlays({ hand, trick, firstTrick: true, heartsBroken: false }))).toEqual(['3D']);
  });

  it('allows points on the first trick when holding only point cards', () => {
    const hand = cards(['QS', '5H', '9H']);
    const trick = trickOf(0, ['2C']);
    expect(ids(legalPlays({ hand, trick, firstTrick: true, heartsBroken: false }))).toEqual(['5H', '9H', 'QS']);
  });

  it('allows anything when void after the first trick', () => {
    const hand = cards(['QS', '5H', '3D']);
    const trick = trickOf(0, ['7C']);
    expect(ids(legalPlays({ hand, trick, firstTrick: false, heartsBroken: false }))).toEqual(['3D', '5H', 'QS']);
  });

  it('forbids leading hearts before they are broken', () => {
    const hand = cards(['5H', '9H', 'QS', '3D']);
    expect(ids(legalPlays({ hand, trick: empty, firstTrick: false, heartsBroken: false }))).toEqual(['3D', 'QS']);
  });

  it('allows leading hearts before broken when holding only hearts', () => {
    const hand = cards(['5H', '9H']);
    expect(ids(legalPlays({ hand, trick: empty, firstTrick: false, heartsBroken: false }))).toEqual(['5H', '9H']);
  });

  it('allows leading hearts once broken', () => {
    const hand = cards(['5H', '3D']);
    expect(ids(legalPlays({ hand, trick: empty, firstTrick: false, heartsBroken: true }))).toEqual(['3D', '5H']);
  });
});

describe('trick resolution', () => {
  it('awards the trick to the highest card of the led suit', () => {
    const trick = trickOf(2, ['9D', 'AS', 'KD', '2D']);
    expect(trickWinner(trick)).toBe(0); // seats 2,3,0,1 -> KD played by seat 0
  });

  it('counts trick points', () => {
    expect(trickPoints(trickOf(0, ['9D', 'QS', '5H', 'AH']))).toBe(15);
    expect(trickPoints(trickOf(0, ['9D', '8D', '7D', '6D']))).toBe(0);
  });

  it('finds the holder of the 2 of clubs', () => {
    const hands = [cards(['3C']), cards(['4C']), cards(['2C']), cards(['5C'])];
    expect(findTwoOfClubs(hands)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/rules.test.ts`
Expected: FAIL — cannot resolve `./rules`.

- [ ] **Step 3: Write `src/engine/rules.ts`**

```ts
import { type Card, cardId, cardPoints, TWO_OF_CLUBS } from './cards';

export interface TrickCard {
  seat: number;
  card: Card;
}

export interface Trick {
  leader: number;
  cards: TrickCard[];
}

export interface PlayContext {
  hand: readonly Card[];
  trick: Trick;
  firstTrick: boolean;
  heartsBroken: boolean;
}

export function legalPlays({ hand, trick, firstTrick, heartsBroken }: PlayContext): Card[] {
  if (trick.cards.length === 0) {
    if (firstTrick) {
      const two = hand.filter(c => cardId(c) === TWO_OF_CLUBS);
      if (two.length) return two;
    }
    if (!heartsBroken) {
      const nonHearts = hand.filter(c => c.suit !== 'H');
      if (nonHearts.length) return nonHearts;
    }
    return hand.slice();
  }

  const led = trick.cards[0].card.suit;
  const following = hand.filter(c => c.suit === led);
  if (following.length) return following;

  if (firstTrick) {
    const safe = hand.filter(c => cardPoints(c) === 0);
    if (safe.length) return safe;
  }
  return hand.slice();
}

export function trickWinner(trick: Trick): number {
  const led = trick.cards[0].card.suit;
  let best = trick.cards[0];
  for (const played of trick.cards) {
    if (played.card.suit === led && played.card.rank > best.card.rank) best = played;
  }
  return best.seat;
}

export function trickPoints(trick: Trick): number {
  return trick.cards.reduce((sum, played) => sum + cardPoints(played.card), 0);
}

export function findTwoOfClubs(hands: readonly (readonly Card[])[]): number {
  return hands.findIndex(hand => hand.some(c => cardId(c) === TWO_OF_CLUBS));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/rules.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/rules.ts src/engine/rules.test.ts
git commit -m "feat(engine): legal plays and trick resolution"
```

---

### Task 5: Passing and scoring

**Files:**
- Create: `src/engine/passing.ts`, `src/engine/scoring.ts`
- Test: `src/engine/passing.test.ts`, `src/engine/scoring.test.ts`

**Interfaces:**
- Consumes: `Card`, `CardId`, `cardId` from `./cards`; `sortHand` from `./sort`.
- Produces:
  - `type PassDirection = 'left' | 'right' | 'across' | 'none'`
  - `passDirection(round: number): PassDirection`
  - `passTarget(seat: number, round: number): number`
  - `applyPasses(hands, selections: readonly (readonly CardId[])[], round): { hands: Card[][]; received: CardId[][] }` — result hands sorted
  - `MOON_POINTS = 26`
  - `interface RoundResult { scores: number[]; moonShooter: number | null }`
  - `scoreRound(taken: readonly number[]): RoundResult`
  - `winningSeats(totals: readonly number[]): number[]`, `perfectSeats(totals: readonly number[]): number[]`

- [ ] **Step 1: Write the failing tests**

`src/engine/passing.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cardId, deal } from './cards';
import { applyPasses, passDirection, passTarget } from './passing';

describe('passing', () => {
  it('rotates left, right, across, none', () => {
    expect([0, 1, 2, 3].map(passDirection)).toEqual(['left', 'right', 'across', 'none']);
  });

  it('targets the correct seat', () => {
    expect(passTarget(0, 0)).toBe(1);
    expect(passTarget(3, 0)).toBe(0);
    expect(passTarget(0, 1)).toBe(3);
    expect(passTarget(1, 2)).toBe(3);
    expect(passTarget(2, 3)).toBe(2);
  });

  it('moves the selected cards to the target and records them as received', () => {
    const hands = deal(7);
    const selections = hands.map(h => h.slice(0, 3).map(cardId));
    const result = applyPasses(hands, selections, 0);
    result.hands.forEach(h => expect(h).toHaveLength(13));
    for (let seat = 0; seat < 4; seat++) {
      const target = (seat + 1) % 4;
      const targetIds = result.hands[target].map(cardId);
      const ownIds = result.hands[seat].map(cardId);
      selections[seat].forEach(id => {
        expect(targetIds).toContain(id);
        expect(ownIds).not.toContain(id);
      });
      expect(result.received[target].slice().sort()).toEqual(selections[seat].slice().sort());
    }
  });
});
```

`src/engine/scoring.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { perfectSeats, scoreRound, winningSeats } from './scoring';

describe('scoring', () => {
  it('passes points through when nobody shoots the moon', () => {
    expect(scoreRound([13, 5, 8, 0])).toEqual({ scores: [13, 5, 8, 0], moonShooter: null });
  });

  it('gives everyone else 26 when a player shoots the moon', () => {
    expect(scoreRound([0, 26, 0, 0])).toEqual({ scores: [26, 0, 26, 26], moonShooter: 1 });
  });

  it('finds all seats tied for lowest', () => {
    expect(winningSeats([30, 12, 50, 12])).toEqual([1, 3]);
    expect(winningSeats([30, 12, 50, 13])).toEqual([1]);
  });

  it('finds perfect (zero) totals', () => {
    expect(perfectSeats([0, 26, 52, 0])).toEqual([0, 3]);
    expect(perfectSeats([1, 26, 52, 25])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/passing.test.ts src/engine/scoring.test.ts`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Write `src/engine/passing.ts`**

```ts
import { type Card, type CardId, cardId } from './cards';
import { sortHand } from './sort';

export type PassDirection = 'left' | 'right' | 'across' | 'none';

const DIRECTIONS: readonly PassDirection[] = ['left', 'right', 'across', 'none'];
const OFFSET: Record<PassDirection, number> = { left: 1, right: 3, across: 2, none: 0 };

export function passDirection(round: number): PassDirection {
  return DIRECTIONS[round % 4];
}

export function passTarget(seat: number, round: number): number {
  return (seat + OFFSET[passDirection(round)]) % 4;
}

export function applyPasses(
  hands: readonly (readonly Card[])[],
  selections: readonly (readonly CardId[])[],
  round: number,
): { hands: Card[][]; received: CardId[][] } {
  const received: CardId[][] = [[], [], [], []];
  const next = hands.map((hand, seat) => hand.filter(c => !selections[seat].includes(cardId(c))));
  hands.forEach((hand, seat) => {
    const target = passTarget(seat, round);
    const passed = hand.filter(c => selections[seat].includes(cardId(c)));
    next[target].push(...passed);
    received[target].push(...passed.map(cardId));
  });
  return { hands: next.map(sortHand), received };
}
```

- [ ] **Step 4: Write `src/engine/scoring.ts`**

```ts
export const MOON_POINTS = 26;

export interface RoundResult {
  scores: number[];
  moonShooter: number | null;
}

export function scoreRound(taken: readonly number[]): RoundResult {
  const shooter = taken.findIndex(points => points === MOON_POINTS);
  if (shooter === -1) return { scores: taken.slice(), moonShooter: null };
  return {
    scores: taken.map((_, seat) => (seat === shooter ? 0 : MOON_POINTS)),
    moonShooter: shooter,
  };
}

export function winningSeats(totals: readonly number[]): number[] {
  const lowest = Math.min(...totals);
  return totals.flatMap((total, seat) => (total === lowest ? [seat] : []));
}

export function perfectSeats(totals: readonly number[]): number[] {
  return totals.flatMap((total, seat) => (total === 0 ? [seat] : []));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/engine/passing.test.ts src/engine/scoring.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine/passing.ts src/engine/passing.test.ts src/engine/scoring.ts src/engine/scoring.test.ts
git commit -m "feat(engine): pass rotation and round scoring"
```

---

### Task 6: Game state and reducer

**Files:**
- Create: `src/engine/game.ts`, `src/test/autoplay.ts`
- Test: `src/engine/game.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces:
  - `GAME_VERSION = 1`, `ROUNDS = 4`, `TRICKS_PER_ROUND = 13`
  - `interface SeatPlayer { id: string; name: string }`
  - `type Phase = 'setup' | 'dealing' | 'passing' | 'leadAnnounce' | 'playing' | 'trickResult' | 'roundSummary' | 'gameOver'`
  - `interface LastTrick { winner: number; cards: TrickCard[]; points: number }`
  - `interface GameState` (fields exactly as below)
  - `type Action` (union exactly as below)
  - `initialState(): GameState`, `gameReducer(state, action): GameState`, `currentLegalPlays(state): Card[]`
  - `autoAction(state: GameState): Action` in `src/test/autoplay.ts` (test helper: always picks first legal card / first 3 cards)

Phase transitions (every illegal action returns `state` unchanged):

| Action | Allowed in | Result |
|---|---|---|
| `START_GAME {players, gameId, seed}` | `setup`, 4 unique ids | deal round 0 → `dealing` |
| `DEAL_DONE` | `dealing` | round 0–2 → `passing` (passer 0, hidden); round 3 → `leadAnnounce` |
| `REVEAL_HAND` | `passing`, `playing` | `handRevealed: true` |
| `FINALIZE_PASS {cards}` | `passing`, revealed, 3 unique ids in passer's hand | save; next passer hidden; after seat 3 apply passes → `leadAnnounce`, `current` = 2♣ holder |
| `BEGIN_PLAY` | `leadAnnounce` | `playing`, revealed (the lead screen is the leader's privacy gate) |
| `PLAY_CARD {card}` | `playing`, revealed, card legal | card to trick; next seat hidden; on 4th card → `trickResult` with `lastTrick`, points to winner, `current` = winner |
| `ACK_TRICK` | `trickResult` | tricks < 13 → `playing`, revealed (the result screen is the winner's gate); 13 → score round → `roundSummary` |
| `NEXT_ROUND {seed}` | `roundSummary` | round 3 → `gameOver`; else deal next round → `dealing` |
| `PLAY_AGAIN {gameId, seed}` | `gameOver` | new game, same players → `dealing` |
| `NEW_GAME` | any | `initialState()` |

- [ ] **Step 1: Write `src/test/autoplay.ts`** (test helper, used by this and later tasks)

```ts
import { cardId } from '../engine/cards';
import { type Action, currentLegalPlays, type GameState } from '../engine/game';

export function autoAction(state: GameState): Action {
  switch (state.phase) {
    case 'dealing':
      return { type: 'DEAL_DONE' };
    case 'passing':
      return state.handRevealed
        ? { type: 'FINALIZE_PASS', cards: state.hands[state.passer].slice(0, 3).map(cardId) }
        : { type: 'REVEAL_HAND' };
    case 'leadAnnounce':
      return { type: 'BEGIN_PLAY' };
    case 'playing': {
      if (!state.handRevealed) return { type: 'REVEAL_HAND' };
      const legal = currentLegalPlays(state);
      if (legal.length === 0) throw new Error('no legal plays');
      return { type: 'PLAY_CARD', card: cardId(legal[0]) };
    }
    case 'trickResult':
      return { type: 'ACK_TRICK' };
    case 'roundSummary':
      return { type: 'NEXT_ROUND', seed: 1000 + state.round };
    default:
      throw new Error(`autoAction: unexpected phase ${state.phase}`);
  }
}
```

- [ ] **Step 2: Write the failing test `src/engine/game.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { autoAction } from '../test/autoplay';
import { cardId } from './cards';
import { findTwoOfClubs } from './rules';
import {
  type Action, currentLegalPlays, gameReducer, type GameState, initialState, type SeatPlayer,
} from './game';

const PLAYERS: SeatPlayer[] = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];

const run = (state: GameState, ...actions: Action[]) => actions.reduce(gameReducer, state);
const started = (seed = 1) => run(initialState(), { type: 'START_GAME', players: PLAYERS, gameId: 'g1', seed });
const until = (state: GameState, phase: GameState['phase']) => {
  let s = state;
  for (let i = 0; i < 10000 && s.phase !== phase; i++) s = gameReducer(s, autoAction(s));
  return s;
};

describe('gameReducer', () => {
  it('starts a game and deals 13 cards each', () => {
    const s = started();
    expect(s.phase).toBe('dealing');
    expect(s.gameId).toBe('g1');
    expect(s.players).toEqual(PLAYERS);
    s.hands.forEach(h => expect(h).toHaveLength(13));
  });

  it('rejects starting with duplicate players', () => {
    const init = initialState();
    const dup = [...PLAYERS.slice(0, 3), PLAYERS[0]];
    expect(gameReducer(init, { type: 'START_GAME', players: dup, gameId: 'g', seed: 1 })).toBe(init);
  });

  it('goes to passing after the deal in round 1', () => {
    const s = run(started(), { type: 'DEAL_DONE' });
    expect(s.phase).toBe('passing');
    expect(s.passer).toBe(0);
    expect(s.handRevealed).toBe(false);
  });

  it('ignores FINALIZE_PASS while the hand is hidden or with the wrong card count', () => {
    const s = run(started(), { type: 'DEAL_DONE' });
    const three = s.hands[0].slice(0, 3).map(cardId);
    expect(gameReducer(s, { type: 'FINALIZE_PASS', cards: three })).toBe(s);
    const revealed = gameReducer(s, { type: 'REVEAL_HAND' });
    expect(gameReducer(revealed, { type: 'FINALIZE_PASS', cards: three.slice(0, 2) })).toBe(revealed);
    expect(gameReducer(revealed, { type: 'FINALIZE_PASS', cards: [three[0], three[0], three[1]] })).toBe(revealed);
  });

  it('ignores a repeated FINALIZE_PASS (double tap)', () => {
    const s = run(started(), { type: 'DEAL_DONE' }, { type: 'REVEAL_HAND' });
    const once = gameReducer(s, { type: 'FINALIZE_PASS', cards: s.hands[0].slice(0, 3).map(cardId) });
    expect(once.passer).toBe(1);
    expect(gameReducer(once, { type: 'FINALIZE_PASS', cards: s.hands[0].slice(0, 3).map(cardId) })).toBe(once);
  });

  it('applies passes after all four players finalize and announces the 2 of clubs holder', () => {
    const s = until(started(), 'leadAnnounce');
    expect(s.current).toBe(findTwoOfClubs(s.hands));
    s.received.forEach(r => expect(r).toHaveLength(3));
    s.hands.forEach(h => expect(h).toHaveLength(13));
  });

  it('ignores illegal and hidden-hand plays, including a double tap', () => {
    const lead = run(until(started(), 'leadAnnounce'), { type: 'BEGIN_PLAY' });
    expect(lead.phase).toBe('playing');
    expect(lead.handRevealed).toBe(true);
    const illegal = lead.hands[lead.current].find(c => cardId(c) !== '2C')!;
    expect(gameReducer(lead, { type: 'PLAY_CARD', card: cardId(illegal) })).toBe(lead);
    const played = gameReducer(lead, { type: 'PLAY_CARD', card: '2C' });
    expect(played.trick.cards).toHaveLength(1);
    expect(played.handRevealed).toBe(false);
    expect(played.current).toBe((lead.current + 1) % 4);
    expect(gameReducer(played, { type: 'PLAY_CARD', card: '2C' })).toBe(played);
  });

  it('resolves a trick after four cards', () => {
    const s = until(started(), 'trickResult');
    expect(s.trickNumber).toBe(1);
    expect(s.lastTrick?.cards).toHaveLength(4);
    expect(s.current).toBe(s.lastTrick?.winner);
    expect(s.trick.cards).toHaveLength(0);
    expect(s.taken.reduce((a, b) => a + b, 0)).toBe(s.lastTrick?.points);
  });

  it('scores a moon shot', () => {
    const s: GameState = {
      ...started(), phase: 'trickResult', trickNumber: 13, taken: [26, 0, 0, 0],
    };
    const scored = gameReducer(s, { type: 'ACK_TRICK' });
    expect(scored.phase).toBe('roundSummary');
    expect(scored.moonShooter).toBe(0);
    expect(scored.moonHistory).toEqual([0]);
    expect(scored.roundScores).toEqual([[0, 26, 26, 26]]);
    expect(scored.totals).toEqual([0, 26, 26, 26]);
  });

  it('skips passing in round 4', () => {
    const s: GameState = { ...started(), phase: 'roundSummary', round: 2 };
    const r4 = run(s, { type: 'NEXT_ROUND', seed: 9 }, { type: 'DEAL_DONE' });
    expect(r4.round).toBe(3);
    expect(r4.phase).toBe('leadAnnounce');
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('plays a full game to the end (seed %i)', seed => {
    let s = started(seed);
    let steps = 0;
    while (s.phase !== 'gameOver') {
      if (s.phase === 'playing' && s.handRevealed) {
        expect(currentLegalPlays(s).length).toBeGreaterThan(0);
      }
      s = gameReducer(s, autoAction(s));
      if (++steps > 5000) throw new Error('game did not finish');
    }
    expect(s.roundScores).toHaveLength(4);
    expect(s.moonHistory).toHaveLength(4);
    s.roundScores.forEach((round, i) => {
      const sum = round.reduce((a, b) => a + b, 0);
      expect(sum).toBe(s.moonHistory[i] === null ? 26 : 78);
    });
    expect(s.totals).toEqual([0, 1, 2, 3].map(seat => s.roundScores.reduce((t, r) => t + r[seat], 0)));
  });

  it('PLAY_AGAIN keeps players and resets scores', () => {
    const over = until(started(), 'gameOver');
    const again = gameReducer(over, { type: 'PLAY_AGAIN', gameId: 'g2', seed: 5 });
    expect(again.phase).toBe('dealing');
    expect(again.gameId).toBe('g2');
    expect(again.players).toEqual(PLAYERS);
    expect(again.totals).toEqual([0, 0, 0, 0]);
    expect(again.roundScores).toEqual([]);
    expect(again.moonHistory).toEqual([]);
  });

  it('NEW_GAME resets to setup', () => {
    expect(gameReducer(started(), { type: 'NEW_GAME' })).toEqual(initialState());
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/engine/game.test.ts`
Expected: FAIL — cannot resolve `./game`.

- [ ] **Step 4: Write `src/engine/game.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engine/game.test.ts`
Expected: PASS (all tests, including 8 full-game simulations).

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test` → Expected: all pass.
Run: `npx tsc --noEmit` → Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/engine/game.ts src/engine/game.test.ts src/test/autoplay.ts
git commit -m "feat(engine): game state machine reducer"
```

---

### Task 7: Player roster

**Files:**
- Create: `src/engine/roster.ts`
- Test: `src/engine/roster.test.ts`

**Interfaces:**
- Produces:
  - `interface Player { id: string; name: string; archived: boolean; createdAt: number }`
  - `type RosterResult = { ok: true; players: Player[]; player: Player } | { ok: false; error: string }`
  - `MAX_NAME_LENGTH = 20`
  - `cleanName(name: string): string` — trim + collapse internal whitespace
  - `validateName(players: readonly Player[], name: string, exceptId?: string): string | null` — error message or null
  - `addPlayer(players, name, id, createdAt): RosterResult`
  - `renamePlayer(players, id, name): RosterResult`
  - `setArchived(players, id, archived: boolean): Player[]`
  - `activePlayers(players): Player[]` — non-archived, sorted by name (case-insensitive)

Error messages (exact): `'Enter a name'`, `'Name must be 20 characters or fewer'`, `'That name is already taken'`, `'Player not found'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  activePlayers, addPlayer, cleanName, type Player, renamePlayer, setArchived, validateName,
} from './roster';

const make = (name: string, id: string, archived = false): Player => ({ id, name, archived, createdAt: 0 });

describe('roster', () => {
  it('cleans names', () => {
    expect(cleanName('  Mary   Ann ')).toBe('Mary Ann');
  });

  it('rejects blank, too long, and duplicate names', () => {
    const players = [make('Alice', 'a'), make('Hidden', 'h', true)];
    expect(validateName(players, '')).toBe('Enter a name');
    expect(validateName(players, '    ')).toBe('Enter a name');
    expect(validateName(players, 'x'.repeat(21))).toBe('Name must be 20 characters or fewer');
    expect(validateName(players, ' alice ')).toBe('That name is already taken');
    expect(validateName(players, 'HIDDEN')).toBe('That name is already taken');
    expect(validateName(players, 'Bob')).toBeNull();
    expect(validateName(players, 'alice', 'a')).toBeNull();
  });

  it('adds a player with a cleaned name', () => {
    const result = addPlayer([], '  Bob  ', 'b', 123);
    expect(result).toEqual({
      ok: true,
      player: { id: 'b', name: 'Bob', archived: false, createdAt: 123 },
      players: [{ id: 'b', name: 'Bob', archived: false, createdAt: 123 }],
    });
  });

  it('refuses to add a duplicate', () => {
    expect(addPlayer([make('Bob', 'b')], 'bob', 'x', 0)).toEqual({ ok: false, error: 'That name is already taken' });
  });

  it('renames keeping the id', () => {
    const result = renamePlayer([make('Bob', 'b'), make('Cat', 'c')], 'b', 'Robert');
    expect(result.ok && result.players.map(p => [p.id, p.name])).toEqual([['b', 'Robert'], ['c', 'Cat']]);
  });

  it('rejects renaming to another player’s name or an unknown id', () => {
    const players = [make('Bob', 'b'), make('Cat', 'c')];
    expect(renamePlayer(players, 'b', 'cat')).toEqual({ ok: false, error: 'That name is already taken' });
    expect(renamePlayer(players, 'zzz', 'New')).toEqual({ ok: false, error: 'Player not found' });
  });

  it('archives and lists active players sorted by name', () => {
    const players = [make('dan', 'd'), make('Bob', 'b'), make('cat', 'c')];
    const archived = setArchived(players, 'c', true);
    expect(archived.find(p => p.id === 'c')?.archived).toBe(true);
    expect(activePlayers(archived).map(p => p.name)).toEqual(['Bob', 'dan']);
    expect(activePlayers(setArchived(archived, 'c', false)).map(p => p.name)).toEqual(['Bob', 'cat', 'dan']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/roster.test.ts`
Expected: FAIL — cannot resolve `./roster`.

- [ ] **Step 3: Write `src/engine/roster.ts`**

```ts
export interface Player {
  id: string;
  name: string;
  archived: boolean;
  createdAt: number;
}

export type RosterResult =
  | { ok: true; players: Player[]; player: Player }
  | { ok: false; error: string };

export const MAX_NAME_LENGTH = 20;

export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

const nameKey = (name: string) => cleanName(name).toLowerCase();

export function validateName(players: readonly Player[], name: string, exceptId?: string): string | null {
  const cleaned = cleanName(name);
  if (!cleaned) return 'Enter a name';
  if (cleaned.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer`;
  if (players.some(p => p.id !== exceptId && nameKey(p.name) === nameKey(cleaned))) {
    return 'That name is already taken';
  }
  return null;
}

export function addPlayer(players: readonly Player[], name: string, id: string, createdAt: number): RosterResult {
  const error = validateName(players, name);
  if (error) return { ok: false, error };
  const player: Player = { id, name: cleanName(name), archived: false, createdAt };
  return { ok: true, player, players: [...players, player] };
}

export function renamePlayer(players: readonly Player[], id: string, name: string): RosterResult {
  const existing = players.find(p => p.id === id);
  if (!existing) return { ok: false, error: 'Player not found' };
  const error = validateName(players, name, id);
  if (error) return { ok: false, error };
  const player = { ...existing, name: cleanName(name) };
  return { ok: true, player, players: players.map(p => (p.id === id ? player : p)) };
}

export function setArchived(players: readonly Player[], id: string, archived: boolean): Player[] {
  return players.map(p => (p.id === id ? { ...p, archived } : p));
}

export function activePlayers(players: readonly Player[]): Player[] {
  return players
    .filter(p => !p.archived)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/roster.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/roster.ts src/engine/roster.test.ts
git commit -m "feat(engine): player roster management"
```

---

### Task 8: Game log and stats

**Files:**
- Create: `src/engine/history.ts`, `src/engine/stats.ts`
- Test: `src/engine/history.test.ts`, `src/engine/stats.test.ts`

**Interfaces:**
- Consumes: `GameState` from `./game`; `winningSeats`, `perfectSeats` from `./scoring`; `Player` from `./roster`.
- Produces:
  - `interface RecordSeat { playerId: string; name: string }`
  - `interface GameRecord { gameId: string; finishedAt: number; seats: RecordSeat[]; roundScores: number[][]; totals: number[]; winners: string[]; tie: boolean; moonShooters: (string | null)[]; perfect: string[] }`
  - `buildRecord(state: GameState, finishedAt: number): GameRecord`
  - `appendRecord(records: readonly GameRecord[], record: GameRecord): GameRecord[]` — returns the same array reference if `gameId` already present
  - `interface PlayerStats { playerId: string; name: string; games: number; wins: number; ties: number; moons: number; perfect: number }`
  - `computeStats(records: readonly GameRecord[], roster: readonly Player[]): PlayerStats[]` — sorted wins desc, games desc, name asc

- [ ] **Step 1: Write the failing tests**

`src/engine/history.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { type GameState, initialState } from './game';
import { appendRecord, buildRecord } from './history';

const finished = (totals: number[], moonHistory: (number | null)[] = [null, null, null, null]): GameState => ({
  ...initialState(),
  gameId: 'g1',
  phase: 'gameOver',
  players: [
    { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
  ],
  roundScores: [totals, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  totals,
  moonHistory,
});

describe('buildRecord', () => {
  it('records a single winner', () => {
    const r = buildRecord(finished([10, 5, 40, 49]), 999);
    expect(r).toMatchObject({
      gameId: 'g1',
      finishedAt: 999,
      seats: [
        { playerId: 'a', name: 'Ann' }, { playerId: 'b', name: 'Bob' },
        { playerId: 'c', name: 'Cat' }, { playerId: 'd', name: 'Dan' },
      ],
      totals: [10, 5, 40, 49],
      winners: ['b'],
      tie: false,
      perfect: [],
    });
    expect(r.roundScores).toHaveLength(4);
  });

  it('records ties, moons and perfect games by player id', () => {
    const r = buildRecord(finished([0, 0, 52, 52], [2, null, 3, null]), 1);
    expect(r.winners).toEqual(['a', 'b']);
    expect(r.tie).toBe(true);
    expect(r.perfect).toEqual(['a', 'b']);
    expect(r.moonShooters).toEqual(['c', null, 'd', null]);
  });
});

describe('appendRecord', () => {
  it('appends new records and ignores duplicates by gameId', () => {
    const r = buildRecord(finished([10, 5, 40, 49]), 1);
    const once = appendRecord([], r);
    expect(once).toHaveLength(1);
    const twice = appendRecord(once, { ...r, finishedAt: 2 });
    expect(twice).toBe(once);
  });
});
```

`src/engine/stats.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { GameRecord } from './history';
import type { Player } from './roster';
import { computeStats } from './stats';

const seats = [
  { playerId: 'a', name: 'Ann' }, { playerId: 'b', name: 'Bob' },
  { playerId: 'c', name: 'Cat' }, { playerId: 'd', name: 'Dan' },
];
const record = (over: Partial<GameRecord>): GameRecord => ({
  gameId: Math.random().toString(),
  finishedAt: 0,
  seats,
  roundScores: [],
  totals: [0, 0, 0, 0],
  winners: [],
  tie: false,
  moonShooters: [null, null, null, null],
  perfect: [],
  ...over,
});

describe('computeStats', () => {
  it('counts games, wins, ties, moons and perfect games', () => {
    const records = [
      record({ finishedAt: 1, winners: ['a'], moonShooters: ['a', null, 'a', null] }),
      record({ finishedAt: 2, winners: ['a', 'b'], tie: true, perfect: ['a', 'b'] }),
    ];
    const stats = computeStats(records, []);
    const byId = Object.fromEntries(stats.map(s => [s.playerId, s]));
    expect(byId.a).toEqual({ playerId: 'a', name: 'Ann', games: 2, wins: 2, ties: 1, moons: 2, perfect: 1 });
    expect(byId.b).toEqual({ playerId: 'b', name: 'Bob', games: 2, wins: 1, ties: 1, moons: 0, perfect: 1 });
    expect(byId.c).toEqual({ playerId: 'c', name: 'Cat', games: 2, wins: 0, ties: 0, moons: 0, perfect: 0 });
    expect(stats.map(s => s.playerId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('uses the current roster name so renames follow the player', () => {
    const roster: Player[] = [{ id: 'a', name: 'Annie', archived: true, createdAt: 0 }];
    const stats = computeStats([record({ winners: ['a'] })], roster);
    expect(stats.find(s => s.playerId === 'a')?.name).toBe('Annie');
  });

  it('returns nothing for an empty log', () => {
    expect(computeStats([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/history.test.ts src/engine/stats.test.ts`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Write `src/engine/history.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/engine/stats.ts`**

```ts
import type { GameRecord } from './history';
import type { Player } from './roster';

export interface PlayerStats {
  playerId: string;
  name: string;
  games: number;
  wins: number;
  ties: number;
  moons: number;
  perfect: number;
}

export function computeStats(records: readonly GameRecord[], roster: readonly Player[]): PlayerStats[] {
  const byId = new Map<string, PlayerStats>();
  const chronological = [...records].sort((a, b) => a.finishedAt - b.finishedAt);

  for (const record of chronological) {
    for (const seat of record.seats) {
      const stats = byId.get(seat.playerId) ?? {
        playerId: seat.playerId, name: seat.name, games: 0, wins: 0, ties: 0, moons: 0, perfect: 0,
      };
      stats.name = seat.name;
      stats.games += 1;
      if (record.winners.includes(seat.playerId)) {
        stats.wins += 1;
        if (record.tie) stats.ties += 1;
      }
      stats.moons += record.moonShooters.filter(id => id === seat.playerId).length;
      if (record.perfect.includes(seat.playerId)) stats.perfect += 1;
      byId.set(seat.playerId, stats);
    }
  }

  const currentNames = new Map(roster.map(p => [p.id, p.name]));
  return [...byId.values()]
    .map(s => ({ ...s, name: currentNames.get(s.playerId) ?? s.name }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/engine/history.test.ts src/engine/stats.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine/history.ts src/engine/history.test.ts src/engine/stats.ts src/engine/stats.test.ts
git commit -m "feat(engine): game log records and player stats"
```

---

### Task 9: Persistence and hooks

**Files:**
- Create: `src/state/storage.ts`, `src/state/useGame.ts`, `src/state/useRoster.ts`, `src/state/useHistory.ts`, `src/random.ts`
- Test: `src/state/storage.test.ts`, `src/state/hooks.test.tsx`

**Interfaces:**
- Consumes: `GameState`, `GAME_VERSION`, `initialState`, `gameReducer`, `Action` from `../engine/game`; `Player`, `RosterResult`, `addPlayer`, `renamePlayer`, `setArchived` from `../engine/roster`; `GameRecord`, `appendRecord` from `../engine/history`.
- Produces:
  - `GAME_KEY = 'hearts.game'`, `ROSTER_KEY = 'hearts.roster'`, `HISTORY_KEY = 'hearts.history'`
  - `loadVersioned<T extends { version: number }>(key: string, version: number, isValid?: (value: T) => boolean): T | null` — removes the key and returns null on bad JSON / wrong version / invalid
  - `saveVersioned(key: string, value: unknown): void` — swallows storage errors
  - `isValidGame(value: GameState): boolean`, `loadGame(): GameState` (always `handRevealed: false`)
  - `useGame(): { state: GameState; dispatch: Dispatch<Action>; resumable: boolean }` — `resumable` true when the loaded game was mid-play (not `setup`/`gameOver`)
  - `useRoster(): { players: Player[]; add(name): RosterResult; rename(id, name): RosterResult; archive(id, archived): void }`
  - `useHistory(): { records: GameRecord[]; append(record): void; clear(): void }`
  - `randomSeed(): number`, `newId(): string` in `src/random.ts`

- [ ] **Step 1: Write the failing tests**

`src/state/storage.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { gameReducer, type GameState, initialState } from '../engine/game';
import { autoAction } from '../test/autoplay';
import { GAME_KEY, loadVersioned, saveVersioned } from './storage';
import { loadGame } from './useGame';

describe('loadVersioned', () => {
  it('returns null and clears the key for corrupt JSON', () => {
    localStorage.setItem('k', '{not json');
    expect(loadVersioned('k', 1)).toBeNull();
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('returns null and clears the key for a version mismatch', () => {
    saveVersioned('k', { version: 2 });
    expect(loadVersioned('k', 1)).toBeNull();
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('returns null when the validator rejects', () => {
    saveVersioned('k', { version: 1, players: 'nope' });
    expect(loadVersioned<{ version: number; players: unknown }>('k', 1, v => Array.isArray(v.players))).toBeNull();
  });

  it('round-trips a valid value', () => {
    saveVersioned('k', { version: 1, a: 1 });
    expect(loadVersioned('k', 1)).toEqual({ version: 1, a: 1 });
  });
});

describe('loadGame', () => {
  it('falls back to a fresh game when nothing is saved', () => {
    expect(loadGame()).toEqual(initialState());
  });

  it('never restores a revealed hand', () => {
    const s: GameState = { ...initialState(), phase: 'passing', handRevealed: true };
    saveVersioned(GAME_KEY, s);
    expect(loadGame().handRevealed).toBe(false);
  });

  it('resumes a saved mid-game state and can play to the end', () => {
    let s = gameReducer(initialState(), {
      type: 'START_GAME',
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }],
      gameId: 'g',
      seed: 3,
    });
    for (let i = 0; i < 150; i++) s = gameReducer(s, autoAction(s));
    saveVersioned(GAME_KEY, s);
    let resumed = loadGame();
    expect(resumed.phase).toBe(s.phase);
    for (let i = 0; i < 5000 && resumed.phase !== 'gameOver'; i++) resumed = gameReducer(resumed, autoAction(resumed));
    expect(resumed.phase).toBe('gameOver');
  });

  it('discards a saved game with a malformed shape', () => {
    localStorage.setItem(GAME_KEY, JSON.stringify({ version: 1, phase: 'playing', hands: [] }));
    expect(loadGame()).toEqual(initialState());
  });
});
```

`src/state/hooks.test.tsx`:
```tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GameRecord } from '../engine/history';
import { HISTORY_KEY, ROSTER_KEY } from './storage';
import { useHistory } from './useHistory';
import { useRoster } from './useRoster';

const rec: GameRecord = {
  gameId: 'g1', finishedAt: 1, seats: [], roundScores: [], totals: [],
  winners: [], tie: false, moonShooters: [], perfect: [],
};

describe('useRoster', () => {
  it('adds, renames, archives and persists players', () => {
    const { result } = renderHook(() => useRoster());
    let added!: ReturnType<typeof result.current.add>;
    act(() => { added = result.current.add('Ann'); });
    expect(added.ok).toBe(true);
    const id = added.ok ? added.player.id : '';
    act(() => { result.current.rename(id, 'Annie'); });
    act(() => { result.current.archive(id, true); });
    expect(result.current.players).toEqual([expect.objectContaining({ id, name: 'Annie', archived: true })]);
    const saved = JSON.parse(localStorage.getItem(ROSTER_KEY)!);
    expect(saved).toEqual({ version: 1, players: result.current.players });
  });

  it('reports validation errors without changing the roster', () => {
    const { result } = renderHook(() => useRoster());
    act(() => { result.current.add('Ann'); });
    let dup!: ReturnType<typeof result.current.add>;
    act(() => { dup = result.current.add(' ann '); });
    expect(dup).toEqual({ ok: false, error: 'That name is already taken' });
    expect(result.current.players).toHaveLength(1);
  });
});

describe('useHistory', () => {
  it('appends once per gameId, persists, and clears', () => {
    const { result } = renderHook(() => useHistory());
    act(() => { result.current.append(rec); result.current.append(rec); });
    expect(result.current.records).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!).games).toHaveLength(1);
    act(() => { result.current.clear(); });
    expect(result.current.records).toEqual([]);
  });

  it('loads saved history', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, games: [rec] }));
    const { result } = renderHook(() => useHistory());
    expect(result.current.records).toEqual([rec]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Write `src/random.ts`**

```ts
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

export function newId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 4: Write `src/state/storage.ts`**

```ts
export const GAME_KEY = 'hearts.game';
export const ROSTER_KEY = 'hearts.roster';
export const HISTORY_KEY = 'hearts.history';

function discard(key: string): null {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage unavailable
  }
  return null;
}

export function loadVersioned<T extends { version: number }>(
  key: string,
  version: number,
  isValid: (value: T) => boolean = () => true,
): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value = JSON.parse(raw) as T;
    if (typeof value !== 'object' || value === null || value.version !== version || !isValid(value)) {
      return discard(key);
    }
    return value;
  } catch {
    return discard(key);
  }
}

export function saveVersioned(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: keep playing in memory
  }
}
```

- [ ] **Step 5: Write `src/state/useGame.ts`**

```ts
import { type Dispatch, useEffect, useReducer, useState } from 'react';
import { type Action, GAME_VERSION, gameReducer, type GameState, initialState } from '../engine/game';
import { GAME_KEY, loadVersioned, saveVersioned } from './storage';

const four = (value: unknown) => Array.isArray(value) && value.length === 4;

export function isValidGame(value: GameState): boolean {
  if (typeof value.phase !== 'string' || !Array.isArray(value.players)) return false;
  if (value.phase === 'setup') return true;
  return four(value.players) && four(value.hands) && four(value.totals) && Array.isArray(value.roundScores);
}

export function loadGame(): GameState {
  const saved = loadVersioned<GameState>(GAME_KEY, GAME_VERSION, isValidGame);
  return saved ? { ...saved, handRevealed: false } : initialState();
}

export function useGame(): { state: GameState; dispatch: Dispatch<Action>; resumable: boolean } {
  const [state, dispatch] = useReducer(gameReducer, undefined, loadGame);
  const [resumable] = useState(() => state.phase !== 'setup' && state.phase !== 'gameOver');

  useEffect(() => {
    saveVersioned(GAME_KEY, state);
  }, [state]);

  return { state, dispatch, resumable };
}
```

- [ ] **Step 6: Write `src/state/useRoster.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import { addPlayer, type Player, renamePlayer, type RosterResult, setArchived } from '../engine/roster';
import { newId } from '../random';
import { loadVersioned, ROSTER_KEY, saveVersioned } from './storage';

interface RosterFile {
  version: number;
  players: Player[];
}

function loadRoster(): Player[] {
  return loadVersioned<RosterFile>(ROSTER_KEY, 1, f => Array.isArray(f.players))?.players ?? [];
}

export function useRoster() {
  const [players, setPlayers] = useState<Player[]>(loadRoster);

  useEffect(() => {
    saveVersioned(ROSTER_KEY, { version: 1, players });
  }, [players]);

  const add = useCallback(
    (name: string): RosterResult => {
      const result = addPlayer(players, name, newId(), Date.now());
      if (result.ok) setPlayers(result.players);
      return result;
    },
    [players],
  );

  const rename = useCallback(
    (id: string, name: string): RosterResult => {
      const result = renamePlayer(players, id, name);
      if (result.ok) setPlayers(result.players);
      return result;
    },
    [players],
  );

  const archive = useCallback((id: string, archived: boolean) => {
    setPlayers(prev => setArchived(prev, id, archived));
  }, []);

  return { players, add, rename, archive };
}
```

- [ ] **Step 7: Write `src/state/useHistory.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import { appendRecord, type GameRecord } from '../engine/history';
import { HISTORY_KEY, loadVersioned, saveVersioned } from './storage';

interface HistoryFile {
  version: number;
  games: GameRecord[];
}

function loadHistory(): GameRecord[] {
  return loadVersioned<HistoryFile>(HISTORY_KEY, 1, f => Array.isArray(f.games))?.games ?? [];
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
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/state`
Expected: PASS (13 tests).

- [ ] **Step 9: Full suite + typecheck, then commit**

Run: `npm test && npx tsc --noEmit` → Expected: all pass, no type errors.

```bash
git add src/random.ts src/state
git commit -m "feat(state): versioned localStorage persistence and hooks"
```

---

### Task 10: Styles and primitive components

**Files:**
- Create: `src/styles/base.css`, `src/styles/card.css`, `src/styles/celebration.css`
- Create: `src/components/CardView.tsx`, `src/components/Hand.tsx`, `src/components/PrivacyScreen.tsx`, `src/components/ConfirmDialog.tsx`, `src/components/Celebration.tsx`
- Modify: `src/main.tsx` (import CSS)
- Test: `src/components/Hand.test.tsx`, `src/components/Celebration.test.tsx`

**Interfaces:**
- Consumes: `Card`, `CardId`, `cardId`, `cardLabel`, `rankLabel`, `isRed`, `SUIT_SYMBOL` from `../engine/cards`; `sortHand` from `../engine/sort`.
- Produces:
  - `CardView({ card, raised?, dim?, received?, onClick? })` — a `<button>` with `aria-label` = `cardLabel(card)` (e.g. `"Q♠"`); disabled when `dim` or no `onClick`; `aria-pressed` = raised when clickable
  - `Hand({ cards, selected: readonly CardId[], playable?: readonly CardId[], received?: readonly CardId[], onToggle(id) })` — renders sorted; cards not in `playable` are dimmed/disabled (omit `playable` = all playable)
  - `PrivacyScreen({ message, buttonLabel, onReveal })`
  - `ConfirmDialog({ message, confirmLabel, onConfirm, onCancel })` — `role="dialog"`
  - `Celebration({ emojis: readonly string[], count?: number })` — default count 40; `aria-hidden`
  - `MOON_EMOJIS`, `PERFECT_EMOJIS` constants exported from `Celebration.tsx`
  - CSS classes used by later tasks: `.screen .title .message .btn .btn.secondary .btn.small .row .header .field .error .banner .privacy .card-back .dialog-backdrop .dialog table.scores .best`

- [ ] **Step 1: Write the failing tests**

`src/components/Hand.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseCardId } from '../engine/cards';
import { Hand } from './Hand';

const cards = ['2C', 'AH', 'QS', 'KD'].map(parseCardId);

describe('Hand', () => {
  it('renders cards in sorted order', () => {
    render(<Hand cards={cards} selected={[]} onToggle={() => {}} />);
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Q♠', 'A♥', '2♣', 'K♦']);
  });

  it('dims and disables unplayable cards', () => {
    const onToggle = vi.fn();
    render(<Hand cards={cards} selected={[]} playable={['2C']} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'A♥' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'A♥' })).toHaveClass('dim');
    fireEvent.click(screen.getByRole('button', { name: 'A♥' }));
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '2♣' }));
    expect(onToggle).toHaveBeenCalledWith('2C');
  });

  it('raises selected cards and marks received cards', () => {
    render(<Hand cards={cards} selected={['QS']} received={['KD']} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Q♠' })).toHaveClass('raised');
    expect(screen.getByRole('button', { name: 'Q♠' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'K♦' })).toHaveClass('received');
  });
});
```

`src/components/Celebration.test.tsx`:
```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Celebration, MOON_EMOJIS } from './Celebration';

describe('Celebration', () => {
  it('renders the requested number of emoji pieces', () => {
    const { container } = render(<Celebration emojis={MOON_EMOJIS} count={12} />);
    const pieces = container.querySelectorAll('.celebration span');
    expect(pieces).toHaveLength(12);
    pieces.forEach(p => expect(MOON_EMOJIS).toContain(p.textContent));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Write `src/components/CardView.tsx`**

```tsx
import { type Card, cardLabel, isRed, rankLabel, SUIT_SYMBOL } from '../engine/cards';

interface CardViewProps {
  card: Card;
  raised?: boolean;
  dim?: boolean;
  received?: boolean;
  onClick?: () => void;
}

export function CardView({ card, raised = false, dim = false, received = false, onClick }: CardViewProps) {
  const className = [
    'card',
    isRed(card.suit) ? 'red' : 'black',
    raised && 'raised',
    dim && 'dim',
    received && 'received',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={dim || !onClick}
      aria-label={cardLabel(card)}
      aria-pressed={onClick ? raised : undefined}
    >
      <span className="corner">
        {rankLabel(card.rank)}
        <span className="suit">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="pip">{SUIT_SYMBOL[card.suit]}</span>
    </button>
  );
}
```

- [ ] **Step 4: Write `src/components/Hand.tsx`**

```tsx
import { type Card, type CardId, cardId } from '../engine/cards';
import { sortHand } from '../engine/sort';
import { CardView } from './CardView';

interface HandProps {
  cards: readonly Card[];
  selected: readonly CardId[];
  playable?: readonly CardId[];
  received?: readonly CardId[];
  onToggle: (id: CardId) => void;
}

export function Hand({ cards, selected, playable, received = [], onToggle }: HandProps) {
  return (
    <div className="hand">
      {sortHand(cards).map(card => {
        const id = cardId(card);
        const canPlay = !playable || playable.includes(id);
        return (
          <CardView
            key={id}
            card={card}
            raised={selected.includes(id)}
            dim={!canPlay}
            received={received.includes(id)}
            onClick={canPlay ? () => onToggle(id) : undefined}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/components/PrivacyScreen.tsx` and `src/components/ConfirmDialog.tsx`**

```tsx
interface PrivacyScreenProps {
  message: string;
  buttonLabel: string;
  onReveal: () => void;
}

export function PrivacyScreen({ message, buttonLabel, onReveal }: PrivacyScreenProps) {
  return (
    <div className="privacy">
      <p className="message">{message}</p>
      <button type="button" className="btn" onClick={onReveal}>
        {buttonLabel}
      </button>
    </div>
  );
}
```

```tsx
interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={message}>
        <p>{message}</p>
        <div className="row">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write `src/components/Celebration.tsx`**

```tsx
import { type CSSProperties, useMemo } from 'react';

export const MOON_EMOJIS: readonly string[] = ['🌙', '🚀', '⭐', '🌕', '✨'];
export const PERFECT_EMOJIS: readonly string[] = ['🎉', '💯', '✨', '🏆', '🥳'];

interface CelebrationProps {
  emojis: readonly string[];
  count?: number;
}

export function Celebration({ emojis, count = 40 }: CelebrationProps) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        emoji: emojis[i % emojis.length],
        style: {
          '--x': `${Math.random() * 100}%`,
          '--size': `${1.6 + Math.random() * 1.8}rem`,
          '--delay': `${Math.random() * 0.8}s`,
          '--dur': `${1.8 + Math.random() * 1.2}s`,
          '--rot': `${Math.random() * 720 - 360}deg`,
        } as CSSProperties,
      })),
    [emojis, count],
  );
  return (
    <div className="celebration" aria-hidden="true">
      {pieces.map((piece, i) => (
        <span key={i} style={piece.style}>
          {piece.emoji}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/components`
Expected: PASS (4 tests).

- [ ] **Step 8: Write `src/styles/base.css`**

```css
:root {
  --felt: #0b5d2a;
  --felt-dark: #084521;
  --felt-light: #13803d;
  --ink: #fdfdf6;
  --accent: #f5c542;
  --red: #c8102e;
  --black: #1a1a1a;
  --card-w: min(16vw, 72px);
  --card-h: calc(var(--card-w) * 1.4);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--ink);
  background: var(--felt);
  -webkit-text-size-adjust: 100%;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
  height: 100%;
}

body {
  background: radial-gradient(ellipse at center, var(--felt-light) 0%, var(--felt) 55%, var(--felt-dark) 100%);
  background-attachment: fixed;
  overscroll-behavior: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}

#root {
  display: flex;
  flex-direction: column;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}

button {
  touch-action: manipulation;
  font: inherit;
  cursor: pointer;
}

.screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px;
  min-height: 0;
  overflow-y: auto;
}

.title {
  font-size: 1.8rem;
  margin: 8px 0;
  text-align: center;
}

.message {
  font-size: 1.2rem;
  text-align: center;
  margin: 0;
}

.btn {
  background: var(--accent);
  color: #222;
  border: none;
  border-radius: 12px;
  padding: 14px 22px;
  font-weight: 700;
  font-size: 1.1rem;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35);
}

.btn:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.btn.secondary {
  background: rgba(255, 255, 255, 0.15);
  color: var(--ink);
}

.btn.small {
  padding: 8px 12px;
  font-size: 0.9rem;
}

.row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
}

.field {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

input,
select {
  font: inherit;
  font-size: 16px;
  padding: 10px;
  border-radius: 10px;
  border: none;
  width: 100%;
  user-select: text;
  -webkit-user-select: text;
}

.field .row input {
  flex: 1;
  width: auto;
}

.error {
  color: #ffb4b4;
  font-size: 0.9rem;
}

.privacy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 16px;
}

.banner {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--accent);
  text-align: center;
  animation: pop 0.5s ease-out;
}

@keyframes pop {
  from {
    scale: 0.3;
    opacity: 0;
  }
  70% {
    scale: 1.15;
  }
}

table.scores {
  border-collapse: collapse;
  width: 100%;
  max-width: 420px;
}

table.scores th,
table.scores td {
  padding: 8px 4px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

table.scores th:first-child,
table.scores td:first-child {
  text-align: left;
}

table.scores .best {
  color: var(--accent);
  font-weight: 700;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.dialog {
  background: var(--felt-dark);
  padding: 20px;
  border-radius: 16px;
  max-width: 320px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.list {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.list li {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 12px;
  border-radius: 10px;
}

.list li .grow {
  flex: 1;
}

details.game-log {
  width: 100%;
  max-width: 420px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: 8px 12px;
}
```

- [ ] **Step 9: Write `src/styles/card.css`**

```css
.card {
  width: var(--card-w);
  height: var(--card-h);
  background: #fff;
  border-radius: 8px;
  border: 1px solid #ccc;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  position: relative;
  flex: none;
  padding: 0;
  color: var(--black);
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.card.red {
  color: var(--red);
}

.card:disabled {
  cursor: default;
}

.card .corner {
  position: absolute;
  top: 4px;
  left: 5px;
  line-height: 1;
  font-weight: 700;
  font-size: calc(var(--card-w) * 0.28);
  text-align: center;
}

.card .corner .suit {
  display: block;
  font-size: 0.9em;
}

.card .pip {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--card-w) * 0.55);
}

.card.raised {
  transform: translateY(-20px);
}

.card.dim {
  opacity: 0.4;
}

.card.received {
  box-shadow: 0 0 0 3px var(--accent), 0 2px 4px rgba(0, 0, 0, 0.4);
}

.card-back {
  width: var(--card-w);
  height: var(--card-h);
  border-radius: 8px;
  background: repeating-linear-gradient(45deg, #8b1e2d 0 6px, #a8283a 6px 12px);
  border: 3px solid #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}

.hand {
  display: flex;
  justify-content: center;
  padding: 28px 8px 8px;
  width: 100%;
}

.hand .card + .card {
  margin-left: calc(var(--card-w) * -0.6);
}
```

- [ ] **Step 10: Write `src/styles/celebration.css`**

```css
.celebration {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 40;
}

.celebration span {
  position: absolute;
  bottom: -10vh;
  left: var(--x);
  font-size: var(--size);
  animation: emoji-rise var(--dur) ease-out var(--delay) both;
}

@keyframes emoji-rise {
  0% {
    transform: translateY(0) rotate(0deg) scale(0.6);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  100% {
    transform: translateY(-110vh) rotate(var(--rot)) scale(1.2);
    opacity: 0;
  }
}
```

- [ ] **Step 11: Import CSS in `src/main.tsx`**

Add after the existing imports:
```tsx
import './styles/base.css';
import './styles/card.css';
import './styles/table.css';
import './styles/celebration.css';
```
Also create an empty `src/styles/table.css` now (filled in Task 11) so the build resolves.

- [ ] **Step 12: Verify and commit**

Run: `npm test && npm run build` → Expected: all pass; build exits 0.

```bash
git add src/components src/styles src/main.tsx
git commit -m "feat(ui): felt theme, card, hand, privacy, dialog and celebration components"
```

---

### Task 11: Table and Scoreboard

**Files:**
- Create: `src/components/Table.tsx`, `src/components/Scoreboard.tsx`
- Modify: `src/styles/table.css`
- Test: `src/components/Table.test.tsx`, `src/components/Scoreboard.test.tsx`

**Interfaces:**
- Consumes: `SeatPlayer` from `../engine/game`; `TrickCard` from `../engine/rules`; `winningSeats` from `../engine/scoring`; `CardView`.
- Produces:
  - `Table({ players: readonly SeatPlayer[], taken: readonly number[], cards: readonly TrickCard[], active?: number, winner?: number })` — seat 0 bottom, 1 left, 2 top, 3 right; each played card sits between its player's name and the centre; each seat label has `data-testid="seat-{n}"`
  - `Scoreboard({ players: readonly SeatPlayer[], roundScores: readonly number[][], totals: readonly number[], moonRounds?: readonly (number | null)[] })` — columns `Player | R1..Rn | Total`; lowest total(s) get class `best`; 🌙 after the moon shooter's score in that round

- [ ] **Step 1: Write the failing tests**

`src/components/Table.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseCardId } from '../engine/cards';
import { Table } from './Table';

const players = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];

describe('Table', () => {
  it('shows names, points taken and played cards', () => {
    render(
      <Table
        players={players}
        taken={[0, 3, 13, 0]}
        cards={[{ seat: 2, card: parseCardId('QS') }]}
        active={3}
      />,
    );
    expect(within(screen.getByTestId('seat-2')).getByText('Cat')).toBeInTheDocument();
    expect(within(screen.getByTestId('seat-2')).getByText('13 pts')).toBeInTheDocument();
    expect(screen.getByTestId('seat-3')).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Q♠' }).closest('.played')).toHaveClass('seat-2');
  });
});
```

`src/components/Scoreboard.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Scoreboard } from './Scoreboard';

const players = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];

describe('Scoreboard', () => {
  it('shows each round, totals, highlights the lowest and marks moon shots', () => {
    render(
      <Scoreboard
        players={players}
        roundScores={[[26, 0, 26, 26], [5, 10, 11, 0]]}
        totals={[31, 10, 37, 26]}
        moonRounds={[1, null]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'R2' })).toBeInTheDocument();
    const bobRow = screen.getByRole('row', { name: /Bob/ });
    expect(bobRow).toHaveTextContent('0 🌙');
    expect(bobRow.querySelector('td:last-child')).toHaveClass('best');
    expect(bobRow.querySelector('td:last-child')).toHaveTextContent('10');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/Table.test.tsx src/components/Scoreboard.test.tsx`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Write `src/components/Table.tsx`**

```tsx
import { cardId } from '../engine/cards';
import type { SeatPlayer } from '../engine/game';
import type { TrickCard } from '../engine/rules';
import { CardView } from './CardView';

interface TableProps {
  players: readonly SeatPlayer[];
  taken: readonly number[];
  cards: readonly TrickCard[];
  active?: number;
  winner?: number;
}

export function Table({ players, taken, cards, active, winner }: TableProps) {
  return (
    <div className="table">
      {players.map((player, seat) => (
        <div
          key={player.id}
          data-testid={`seat-${seat}`}
          className={`seat-label seat-${seat}${seat === active ? ' active' : ''}`}
        >
          <div className="name">{player.name}</div>
          <div className="taken">{taken[seat]} pts</div>
        </div>
      ))}
      {cards.map(({ seat, card }) => (
        <div key={cardId(card)} className={`played seat-${seat}${seat === winner ? ' winner' : ''}`}>
          <CardView card={card} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/Scoreboard.tsx`**

```tsx
import type { SeatPlayer } from '../engine/game';
import { winningSeats } from '../engine/scoring';

interface ScoreboardProps {
  players: readonly SeatPlayer[];
  roundScores: readonly number[][];
  totals: readonly number[];
  moonRounds?: readonly (number | null)[];
}

export function Scoreboard({ players, roundScores, totals, moonRounds = [] }: ScoreboardProps) {
  const best = winningSeats(totals);
  return (
    <table className="scores">
      <thead>
        <tr>
          <th>Player</th>
          {roundScores.map((_, i) => (
            <th key={i}>R{i + 1}</th>
          ))}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {players.map((player, seat) => (
          <tr key={player.id}>
            <td>{player.name}</td>
            {roundScores.map((round, i) => (
              <td key={i}>
                {round[seat]}
                {moonRounds[i] === seat ? ' 🌙' : ''}
              </td>
            ))}
            <td className={best.includes(seat) ? 'best' : undefined}>{totals[seat]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Write `src/styles/table.css`**

```css
.table {
  position: relative;
  width: 100%;
  max-width: 420px;
  aspect-ratio: 1;
  margin: 0 auto;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.06) 0%, transparent 70%);
}

.seat-label {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
}

.seat-label .name {
  background: rgba(0, 0, 0, 0.35);
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 600;
  white-space: nowrap;
  max-width: 24vw;
  overflow: hidden;
  text-overflow: ellipsis;
}

.seat-label.active .name {
  background: var(--accent);
  color: #222;
}

.seat-label .taken {
  font-size: 0.8rem;
  opacity: 0.85;
}

.seat-label.seat-0 { bottom: 1%; left: 50%; transform: translateX(-50%); }
.seat-label.seat-1 { left: 0; top: 50%; transform: translateY(-50%); }
.seat-label.seat-2 { top: 1%; left: 50%; transform: translateX(-50%); }
.seat-label.seat-3 { right: 0; top: 50%; transform: translateY(-50%); }

.played {
  position: absolute;
  animation: play-in 0.25s ease-out;
}

.played.seat-0 { bottom: 16%; left: 50%; transform: translateX(-50%); }
.played.seat-1 { left: 24%; top: 50%; transform: translateY(-50%); }
.played.seat-2 { top: 16%; left: 50%; transform: translateX(-50%); }
.played.seat-3 { right: 24%; top: 50%; transform: translateY(-50%); }

.played.winner .card {
  box-shadow: 0 0 0 3px var(--accent), 0 2px 4px rgba(0, 0, 0, 0.4);
}

@keyframes play-in {
  from {
    opacity: 0;
    scale: 0.6;
  }
}

.deal-area {
  position: relative;
  width: 100%;
  max-width: 420px;
  aspect-ratio: 1;
  --reach: min(36vw, 150px);
}

.deal-card {
  position: absolute;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  animation: deal-fly 0.35s ease-out both;
}

@keyframes deal-fly {
  from {
    transform: translate(0, 0) rotate(0deg);
  }
  to {
    transform: translate(calc(var(--reach) * var(--x)), calc(var(--reach) * var(--y))) rotate(var(--rot));
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/Table.tsx src/components/Table.test.tsx src/components/Scoreboard.tsx src/components/Scoreboard.test.tsx src/styles/table.css
git commit -m "feat(ui): table layout and scoreboard"
```

---

### Task 12: Setup and Players screens

**Files:**
- Create: `src/screens/SetupScreen.tsx`, `src/screens/PlayersScreen.tsx`
- Test: `src/screens/SetupScreen.test.tsx`, `src/screens/PlayersScreen.test.tsx`

**Interfaces:**
- Consumes: `Player`, `RosterResult`, `activePlayers` from `../engine/roster`; `SeatPlayer` from `../engine/game`.
- Produces:
  - `SetupScreen({ roster: readonly Player[], onAddPlayer(name): RosterResult, onStart(players: SeatPlayer[]), onOpenPlayers(), onOpenStats() })`
    - 4 `<select>`s labelled `Seat 1`..`Seat 4`; options: `Choose player…` (value `''`), each active player (disabled if in another seat), `+ New player…` (value `__new__`)
    - Choosing `__new__` shows an input labelled `New player name` with `Add` / `Cancel`; errors show under it
    - `Start Game` enabled only when 4 distinct players chosen
  - `PlayersScreen({ roster, onAdd(name): RosterResult, onRename(id, name): RosterResult, onArchive(id, archived), onBack() })`
    - Input labelled `New player name` + `Add`; per active player `Rename` / `Hide`; rename shows input labelled `Rename {name}` + `Save` / `Cancel`; hidden players under a `Hidden players (n)` toggle with `Unhide`

- [ ] **Step 1: Write the failing tests**

`src/screens/SetupScreen.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Player } from '../engine/roster';
import { SetupScreen } from './SetupScreen';

const p = (id: string, name: string, archived = false): Player => ({ id, name, archived, createdAt: 0 });
const roster = [p('a', 'Ann'), p('b', 'Bob'), p('c', 'Cat'), p('d', 'Dan'), p('x', 'Gone', true)];
const noop = () => {};

describe('SetupScreen', () => {
  it('starts with four chosen players in seat order', () => {
    const onStart = vi.fn();
    render(<SetupScreen roster={roster} onAddPlayer={vi.fn()} onStart={onStart} onOpenPlayers={noop} onOpenStats={noop} />);
    const start = screen.getByRole('button', { name: 'Start Game' });
    expect(start).toBeDisabled();
    ['c', 'a', 'd', 'b'].forEach((id, i) => {
      fireEvent.change(screen.getByLabelText(`Seat ${i + 1}`), { target: { value: id } });
    });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledWith([
      { id: 'c', name: 'Cat' }, { id: 'a', name: 'Ann' }, { id: 'd', name: 'Dan' }, { id: 'b', name: 'Bob' },
    ]);
  });

  it('hides archived players and disables players already seated', () => {
    render(<SetupScreen roster={roster} onAddPlayer={vi.fn()} onStart={noop} onOpenPlayers={noop} onOpenStats={noop} />);
    expect(screen.queryAllByRole('option', { name: 'Gone' })).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Seat 1'), { target: { value: 'a' } });
    const seat2Ann = screen.getAllByRole('option', { name: 'Ann' })[1] as HTMLOptionElement;
    expect(seat2Ann.disabled).toBe(true);
  });

  it('adds a new player inline and shows validation errors', () => {
    const onAddPlayer = vi
      .fn()
      .mockReturnValueOnce({ ok: false, error: 'That name is already taken' })
      .mockReturnValueOnce({ ok: true, player: p('e', 'Eve'), players: [...roster, p('e', 'Eve')] });
    render(<SetupScreen roster={roster} onAddPlayer={onAddPlayer} onStart={noop} onOpenPlayers={noop} onOpenStats={noop} />);
    fireEvent.change(screen.getByLabelText('Seat 1'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'ann' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('That name is already taken')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'Eve' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAddPlayer).toHaveBeenLastCalledWith('Eve');
    expect(screen.queryByLabelText('New player name')).not.toBeInTheDocument();
  });
});
```

`src/screens/PlayersScreen.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Player } from '../engine/roster';
import { PlayersScreen } from './PlayersScreen';

const p = (id: string, name: string, archived = false): Player => ({ id, name, archived, createdAt: 0 });

describe('PlayersScreen', () => {
  it('adds a player and shows errors', () => {
    const onAdd = vi.fn().mockReturnValueOnce({ ok: false, error: 'Enter a name' });
    render(<PlayersScreen roster={[]} onAdd={onAdd} onRename={vi.fn()} onArchive={vi.fn()} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
  });

  it('renames a player', () => {
    const onRename = vi.fn().mockReturnValue({ ok: true, player: p('a', 'Annie'), players: [p('a', 'Annie')] });
    render(<PlayersScreen roster={[p('a', 'Ann')]} onAdd={vi.fn()} onRename={onRename} onArchive={vi.fn()} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Rename Ann'), { target: { value: 'Annie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onRename).toHaveBeenCalledWith('a', 'Annie');
  });

  it('hides and unhides players', () => {
    const onArchive = vi.fn();
    render(
      <PlayersScreen roster={[p('a', 'Ann'), p('b', 'Bob', true)]} onAdd={vi.fn()} onRename={vi.fn()} onArchive={onArchive} onBack={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(onArchive).toHaveBeenCalledWith('a', true);
    fireEvent.click(screen.getByRole('button', { name: 'Hidden players (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unhide' }));
    expect(onArchive).toHaveBeenCalledWith('b', false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/screens`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Write `src/screens/SetupScreen.tsx`**

```tsx
import { type FormEvent, useState } from 'react';
import type { SeatPlayer } from '../engine/game';
import { activePlayers, type Player, type RosterResult } from '../engine/roster';

const NEW_PLAYER = '__new__';

interface SetupScreenProps {
  roster: readonly Player[];
  onAddPlayer: (name: string) => RosterResult;
  onStart: (players: SeatPlayer[]) => void;
  onOpenPlayers: () => void;
  onOpenStats: () => void;
}

export function SetupScreen({ roster, onAddPlayer, onStart, onOpenPlayers, onOpenStats }: SetupScreenProps) {
  const [seats, setSeats] = useState<string[]>(['', '', '', '']);
  const [adding, setAdding] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const active = activePlayers(roster);

  const setSeat = (index: number, id: string) => setSeats(prev => prev.map((v, i) => (i === index ? id : v)));

  const onSelect = (index: number, value: string) => {
    if (value === NEW_PLAYER) {
      setAdding(index);
      setNewName('');
      setError(null);
      return;
    }
    if (adding === index) setAdding(null);
    setSeat(index, value);
  };

  const submitNew = (event: FormEvent) => {
    event.preventDefault();
    if (adding === null) return;
    const result = onAddPlayer(newName);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSeat(adding, result.player.id);
    setAdding(null);
    setError(null);
  };

  const byId = new Map(roster.map(p => [p.id, p]));
  const ready = seats.every(id => byId.has(id)) && new Set(seats).size === 4;

  const start = () => {
    onStart(seats.map(id => ({ id, name: byId.get(id)!.name })));
  };

  return (
    <div className="screen">
      <h1 className="title">♥ Offline Hearts ♠</h1>
      {seats.map((id, index) => (
        <div className="field" key={index}>
          <label htmlFor={`seat-${index}`}>Seat {index + 1}</label>
          <select id={`seat-${index}`} value={adding === index ? NEW_PLAYER : id} onChange={e => onSelect(index, e.target.value)}>
            <option value="">Choose player…</option>
            {active.map(player => (
              <option key={player.id} value={player.id} disabled={seats.includes(player.id) && id !== player.id}>
                {player.name}
              </option>
            ))}
            <option value={NEW_PLAYER}>+ New player…</option>
          </select>
          {adding === index && (
            <form className="row" onSubmit={submitNew}>
              <input
                aria-label="New player name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn small">
                Add
              </button>
              <button type="button" className="btn small secondary" onClick={() => setAdding(null)}>
                Cancel
              </button>
            </form>
          )}
          {adding === index && error && <div className="error">{error}</div>}
        </div>
      ))}
      <button type="button" className="btn" disabled={!ready} onClick={start}>
        Start Game
      </button>
      <div className="row">
        <button type="button" className="btn small secondary" onClick={onOpenPlayers}>
          Players
        </button>
        <button type="button" className="btn small secondary" onClick={onOpenStats}>
          Stats
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/screens/PlayersScreen.tsx`**

```tsx
import { type FormEvent, useState } from 'react';
import { activePlayers, type Player, type RosterResult } from '../engine/roster';

interface PlayersScreenProps {
  roster: readonly Player[];
  onAdd: (name: string) => RosterResult;
  onRename: (id: string, name: string) => RosterResult;
  onArchive: (id: string, archived: boolean) => void;
  onBack: () => void;
}

export function PlayersScreen({ roster, onAdd, onRename, onArchive, onBack }: PlayersScreenProps) {
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const active = activePlayers(roster);
  const hidden = roster.filter(p => p.archived);

  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    const result = onAdd(newName);
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    setNewName('');
    setAddError(null);
  };

  const startEdit = (player: Player) => {
    setEditingId(player.id);
    setEditName(player.name);
    setEditError(null);
  };

  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    const result = onRename(editingId, editName);
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setEditingId(null);
  };

  return (
    <div className="screen">
      <div className="header" style={{ width: '100%', maxWidth: 420 }}>
        <button type="button" className="btn small secondary" onClick={onBack}>
          ← Back
        </button>
        <h2 className="title">Players</h2>
        <span />
      </div>

      <form className="field" onSubmit={submitAdd}>
        <div className="row">
          <input aria-label="New player name" value={newName} onChange={e => setNewName(e.target.value)} />
          <button type="submit" className="btn small">
            Add
          </button>
        </div>
        {addError && <div className="error">{addError}</div>}
      </form>

      <ul className="list">
        {active.map(player =>
          editingId === player.id ? (
            <li key={player.id}>
              <form className="row grow" onSubmit={submitEdit}>
                <input
                  aria-label={`Rename ${player.name}`}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn small">
                  Save
                </button>
                <button type="button" className="btn small secondary" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
                {editError && <div className="error">{editError}</div>}
              </form>
            </li>
          ) : (
            <li key={player.id}>
              <span className="grow">{player.name}</span>
              <button type="button" className="btn small secondary" onClick={() => startEdit(player)}>
                Rename
              </button>
              <button type="button" className="btn small secondary" onClick={() => onArchive(player.id, true)}>
                Hide
              </button>
            </li>
          ),
        )}
        {active.length === 0 && <li>No players yet. Add some above.</li>}
      </ul>

      {hidden.length > 0 && (
        <>
          <button type="button" className="btn small secondary" onClick={() => setShowHidden(v => !v)}>
            Hidden players ({hidden.length})
          </button>
          {showHidden && (
            <ul className="list">
              {hidden.map(player => (
                <li key={player.id}>
                  <span className="grow">{player.name}</span>
                  <button type="button" className="btn small secondary" onClick={() => onArchive(player.id, false)}>
                    Unhide
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/screens`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/screens/SetupScreen.tsx src/screens/SetupScreen.test.tsx src/screens/PlayersScreen.tsx src/screens/PlayersScreen.test.tsx
git commit -m "feat(ui): setup and player roster screens"
```

---

### Task 13: Gameplay screens (deal, pass, lead, play, trick result)

**Files:**
- Create: `src/screens/DealScreen.tsx`, `src/screens/PassScreen.tsx`, `src/screens/LeadScreen.tsx`, `src/screens/PlayScreen.tsx`, `src/screens/TrickResultScreen.tsx`
- Test: `src/screens/gameplay.test.tsx`

**Interfaces:**
- Consumes: `GameState`, `Action`, `SeatPlayer`, `currentLegalPlays`, `TRICKS_PER_ROUND` from `../engine/game`; `passDirection`, `passTarget` from `../engine/passing`; `cardId`, `cardLabel`, `parseCardId`, `CardId` from `../engine/cards`; components from Tasks 10–11.
- Produces (all take `{ state: GameState; dispatch: Dispatch<Action> }` except Deal):
  - `DealScreen({ players, onDone })` — 52 animated card backs; calls `onDone` once after 1700 ms
  - `PassScreen` — hidden: message `Pass the device to {name}` + button `Show {name}'s hand`; revealed: `{name}: pass 3 cards {direction} → {target}`, counter `n/3 selected`, `Finalize Selection` (enabled at exactly 3)
  - `LeadScreen` — `{name} has the 2♣ and leads.`, `Pass the device to {name}.`, button `Show {name}'s cards` → `BEGIN_PLAY`
  - `PlayScreen` — `Table` with current trick; hidden: `Pass the device to {name}` + `See {name}'s cards`; revealed: hand with legal cards, tap to raise, button `Play {card}` → `PLAY_CARD`
  - `TrickResultScreen` — `Table` with `lastTrick`; `{winner} wins the trick (+n).`; button `Show {winner}'s cards` or `See round results` when the round is over

- [ ] **Step 1: Write the failing test `src/screens/gameplay.test.tsx`**

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { cardId, cardLabel } from '../engine/cards';
import { currentLegalPlays, gameReducer, type GameState, initialState } from '../engine/game';
import { autoAction } from '../test/autoplay';
import { DealScreen } from './DealScreen';
import { LeadScreen } from './LeadScreen';
import { PassScreen } from './PassScreen';
import { PlayScreen } from './PlayScreen';
import { TrickResultScreen } from './TrickResultScreen';

const players = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];
const start = () => gameReducer(initialState(), { type: 'START_GAME', players, gameId: 'g', seed: 11 });
const advance = (s: GameState, done: (s: GameState) => boolean) => {
  let state = s;
  for (let i = 0; i < 5000 && !done(state); i++) state = gameReducer(state, autoAction(state));
  return state;
};

describe('DealScreen', () => {
  it('calls onDone once after the animation', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<DealScreen players={players} onDone={onDone} />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('PassScreen', () => {
  it('hides the hand until revealed, then allows exactly three cards', () => {
    const dispatch = vi.fn();
    const passing = gameReducer(start(), { type: 'DEAL_DONE' });
    const { rerender } = render(<PassScreen state={passing} dispatch={dispatch} />);
    expect(screen.getByText('Pass the device to Ann')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { pressed: false })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: "Show Ann's hand" }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'REVEAL_HAND' });

    const revealed = gameReducer(passing, { type: 'REVEAL_HAND' });
    rerender(<PassScreen state={revealed} dispatch={dispatch} />);
    expect(screen.getByText('Ann: pass 3 cards left → Bob')).toBeInTheDocument();
    const finalize = screen.getByRole('button', { name: 'Finalize Selection' });
    const hand = revealed.hands[0];
    hand.slice(0, 4).forEach(c => fireEvent.click(screen.getByRole('button', { name: cardLabel(c) })));
    expect(screen.getByText('3/3 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: cardLabel(hand[3]) })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(finalize);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'FINALIZE_PASS', cards: hand.slice(0, 3).map(cardId) });
  });
});

describe('LeadScreen', () => {
  it('announces the 2 of clubs holder', () => {
    const dispatch = vi.fn();
    const lead = advance(start(), s => s.phase === 'leadAnnounce');
    const name = players[lead.current].name;
    render(<LeadScreen state={lead} dispatch={dispatch} />);
    expect(screen.getByText(`${name} has the 2♣ and leads.`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Show ${name}'s cards` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'BEGIN_PLAY' });
  });
});

describe('PlayScreen', () => {
  it('shows the gate when hidden', () => {
    const hidden: GameState = { ...advance(start(), s => s.phase === 'playing'), handRevealed: false };
    render(<PlayScreen state={hidden} dispatch={vi.fn()} />);
    const name = players[hidden.current].name;
    expect(screen.getByText(`Pass the device to ${name}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `See ${name}'s cards` })).toBeInTheDocument();
  });

  it('dims illegal cards and confirms the raised card', () => {
    const dispatch = vi.fn();
    const playing = advance(start(), s => s.phase === 'playing' && s.handRevealed);
    render(<PlayScreen state={playing} dispatch={dispatch} />);
    const legal = currentLegalPlays(playing).map(cardId);
    playing.hands[playing.current].forEach(c => {
      const button = screen.getByRole('button', { name: cardLabel(c) });
      if (legal.includes(cardId(c))) expect(button).toBeEnabled();
      else expect(button).toBeDisabled();
    });
    expect(screen.queryByRole('button', { name: /^Play / })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2♣' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play 2♣' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAY_CARD', card: '2C' });
  });
});

describe('TrickResultScreen', () => {
  it('announces the winner and hands over', () => {
    const dispatch = vi.fn();
    const result = advance(start(), s => s.phase === 'trickResult');
    const winner = players[result.lastTrick!.winner].name;
    render(<TrickResultScreen state={result} dispatch={dispatch} />);
    expect(screen.getByText(new RegExp(`${winner} wins the trick`))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Show ${winner}'s cards` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'ACK_TRICK' });
  });

  it('offers round results after the last trick', () => {
    const last = advance(start(), s => s.phase === 'trickResult' && s.trickNumber === 13);
    render(<TrickResultScreen state={last} dispatch={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'See round results' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/gameplay.test.tsx`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Write `src/screens/DealScreen.tsx`**

```tsx
import { type CSSProperties, useEffect, useRef } from 'react';
import type { SeatPlayer } from '../engine/game';

const DEAL_MS = 1700;
const SEAT_VECTORS: readonly [number, number][] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

interface DealScreenProps {
  players: readonly SeatPlayer[];
  onDone: () => void;
}

export function DealScreen({ players, onDone }: DealScreenProps) {
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const timer = setTimeout(() => done.current(), DEAL_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="screen">
      <p className="message">Shuffling and dealing…</p>
      <div className="deal-area">
        {Array.from({ length: 52 }, (_, i) => {
          const [x, y] = SEAT_VECTORS[i % 4];
          const style = {
            '--x': x,
            '--y': y,
            '--rot': `${((i % 7) - 3) * 4}deg`,
            animationDelay: `${i * 25}ms`,
          } as CSSProperties;
          return <div key={i} className="card-back deal-card" style={style} />;
        })}
        {players.map((player, seat) => (
          <div key={player.id} className={`seat-label seat-${seat}`}>
            <div className="name">{player.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/screens/PassScreen.tsx`**

```tsx
import { type Dispatch, useState } from 'react';
import { type Card, type CardId } from '../engine/cards';
import type { Action, GameState } from '../engine/game';
import { passDirection, passTarget } from '../engine/passing';
import { Hand } from '../components/Hand';
import { PrivacyScreen } from '../components/PrivacyScreen';

interface ScreenProps {
  state: GameState;
  dispatch: Dispatch<Action>;
}

export function PassScreen({ state, dispatch }: ScreenProps) {
  const passer = state.players[state.passer];
  const target = state.players[passTarget(state.passer, state.round)];

  if (!state.handRevealed) {
    return (
      <div className="screen">
        <PrivacyScreen
          message={`Pass the device to ${passer.name}`}
          buttonLabel={`Show ${passer.name}'s hand`}
          onReveal={() => dispatch({ type: 'REVEAL_HAND' })}
        />
      </div>
    );
  }

  return (
    <PassSelection
      key={state.passer}
      title={`${passer.name}: pass 3 cards ${passDirection(state.round)} → ${target.name}`}
      hand={state.hands[state.passer]}
      onFinalize={cards => dispatch({ type: 'FINALIZE_PASS', cards })}
    />
  );
}

interface PassSelectionProps {
  title: string;
  hand: readonly Card[];
  onFinalize: (cards: CardId[]) => void;
}

function PassSelection({ title, hand, onFinalize }: PassSelectionProps) {
  const [selected, setSelected] = useState<CardId[]>([]);

  const toggle = (id: CardId) =>
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return prev.length < 3 ? [...prev, id] : prev;
    });

  return (
    <div className="screen">
      <h2 className="message">{title}</h2>
      <p>{selected.length}/3 selected</p>
      <Hand cards={hand} selected={selected} onToggle={toggle} />
      <button type="button" className="btn" disabled={selected.length !== 3} onClick={() => onFinalize(selected)}>
        Finalize Selection
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Write `src/screens/LeadScreen.tsx`**

```tsx
import type { Dispatch } from 'react';
import type { Action, GameState } from '../engine/game';
import { Table } from '../components/Table';

interface ScreenProps {
  state: GameState;
  dispatch: Dispatch<Action>;
}

export function LeadScreen({ state, dispatch }: ScreenProps) {
  const leader = state.players[state.current];
  return (
    <div className="screen">
      <Table players={state.players} taken={state.taken} cards={[]} active={state.current} />
      <p className="message">
        {leader.name} has the 2♣ and leads.
      </p>
      <p>Pass the device to {leader.name}.</p>
      <button type="button" className="btn" onClick={() => dispatch({ type: 'BEGIN_PLAY' })}>
        Show {leader.name}'s cards
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Write `src/screens/PlayScreen.tsx`**

```tsx
import { type Dispatch, useState } from 'react';
import { type CardId, cardId, cardLabel, parseCardId } from '../engine/cards';
import { type Action, currentLegalPlays, type GameState } from '../engine/game';
import { Hand } from '../components/Hand';
import { PrivacyScreen } from '../components/PrivacyScreen';
import { Table } from '../components/Table';

interface ScreenProps {
  state: GameState;
  dispatch: Dispatch<Action>;
}

export function PlayScreen({ state, dispatch }: ScreenProps) {
  const player = state.players[state.current];
  return (
    <div className="screen">
      <Table players={state.players} taken={state.taken} cards={state.trick.cards} active={state.current} />
      {state.handRevealed ? (
        <PlayHand
          key={`${state.current}-${state.trickNumber}-${state.trick.cards.length}`}
          state={state}
          onPlay={card => dispatch({ type: 'PLAY_CARD', card })}
        />
      ) : (
        <PrivacyScreen
          message={`Pass the device to ${player.name}`}
          buttonLabel={`See ${player.name}'s cards`}
          onReveal={() => dispatch({ type: 'REVEAL_HAND' })}
        />
      )}
    </div>
  );
}

interface PlayHandProps {
  state: GameState;
  onPlay: (card: CardId) => void;
}

function PlayHand({ state, onPlay }: PlayHandProps) {
  const [selected, setSelected] = useState<CardId | null>(null);
  const playable = currentLegalPlays(state).map(cardId);
  const received = state.trickNumber === 0 ? state.received[state.current] : [];

  return (
    <>
      <p className="message">{state.players[state.current].name}'s turn</p>
      <Hand
        cards={state.hands[state.current]}
        selected={selected ? [selected] : []}
        playable={playable}
        received={received}
        onToggle={id => setSelected(prev => (prev === id ? null : id))}
      />
      <div style={{ minHeight: 56 }}>
        {selected && (
          <button type="button" className="btn" onClick={() => onPlay(selected)}>
            Play {cardLabel(parseCardId(selected))}
          </button>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 7: Write `src/screens/TrickResultScreen.tsx`**

```tsx
import type { Dispatch } from 'react';
import { type Action, type GameState, TRICKS_PER_ROUND } from '../engine/game';
import { Table } from '../components/Table';

interface ScreenProps {
  state: GameState;
  dispatch: Dispatch<Action>;
}

export function TrickResultScreen({ state, dispatch }: ScreenProps) {
  const last = state.lastTrick!;
  const winner = state.players[last.winner];
  const roundOver = state.trickNumber >= TRICKS_PER_ROUND;
  return (
    <div className="screen">
      <Table players={state.players} taken={state.taken} cards={last.cards} active={last.winner} winner={last.winner} />
      <p className="message">
        {winner.name} wins the trick{last.points > 0 ? ` (+${last.points})` : ''}.
      </p>
      {!roundOver && <p>Pass the device to {winner.name}.</p>}
      <button type="button" className="btn" onClick={() => dispatch({ type: 'ACK_TRICK' })}>
        {roundOver ? 'See round results' : `Show ${winner.name}'s cards`}
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/screens/gameplay.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 9: Commit**

```bash
git add src/screens/DealScreen.tsx src/screens/PassScreen.tsx src/screens/LeadScreen.tsx src/screens/PlayScreen.tsx src/screens/TrickResultScreen.tsx src/screens/gameplay.test.tsx
git commit -m "feat(ui): deal, pass, lead, play and trick result screens"
```

---

### Task 14: Round summary, Game Over and Stats screens

**Files:**
- Create: `src/screens/RoundSummaryScreen.tsx`, `src/screens/GameOverScreen.tsx`, `src/screens/StatsScreen.tsx`
- Test: `src/screens/results.test.tsx`

**Interfaces:**
- Consumes: `GameState`, `Action`, `ROUNDS` from `../engine/game`; `passDirection` from `../engine/passing`; `winningSeats`, `perfectSeats` from `../engine/scoring`; `GameRecord` from `../engine/history`; `computeStats` from `../engine/stats`; `Player` from `../engine/roster`; `randomSeed` from `../random`; `Scoreboard`, `Celebration`, `MOON_EMOJIS`, `PERFECT_EMOJIS`, `ConfirmDialog`.
- Produces:
  - `RoundSummaryScreen({ state, dispatch })` — heading `Round {n} of 4`; if `moonShooter !== null`: `Celebration` + banner `🌙 {name} shot the moon! 🚀`; `Scoreboard` with `moonRounds={state.moonHistory}`; button `Next Round (pass right)` / `Next Round (pass across)` / `Next Round (no pass)` / `See final results` → `NEXT_ROUND` with a random seed
  - `GameOverScreen({ state, onPlayAgain, onNewPlayers, onOpenStats })` — heading `{name} wins!` or `Tie: {a} & {b}`; if any perfect: `Celebration` + banner `💯 Perfect game: {names}!`; buttons `Play Again`, `New Players`, `Stats`
  - `StatsScreen({ records, roster, onClear, onBack })` — stats table (`Player | Games | Wins | Ties | 🌙 | 💯`), `No games played yet.` when empty, game log newest first as `<details>` (summary: date + `name total` with 🏆 on winners), `Clear history` → confirm dialog `Delete all game history?` / `Delete`

- [ ] **Step 1: Write the failing test `src/screens/results.test.tsx`**

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type GameState, initialState } from '../engine/game';
import type { GameRecord } from '../engine/history';
import { GameOverScreen } from './GameOverScreen';
import { RoundSummaryScreen } from './RoundSummaryScreen';
import { StatsScreen } from './StatsScreen';

const players = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];
const base = (over: Partial<GameState>): GameState => ({ ...initialState(), players, gameId: 'g', ...over });

describe('RoundSummaryScreen', () => {
  it('celebrates a moon shot and advances', () => {
    const dispatch = vi.fn();
    const state = base({
      phase: 'roundSummary', round: 0, roundScores: [[26, 0, 26, 26]], totals: [26, 0, 26, 26],
      moonShooter: 1, moonHistory: [1],
    });
    const { container } = render(<RoundSummaryScreen state={state} dispatch={dispatch} />);
    expect(screen.getByText('🌙 Bob shot the moon! 🚀')).toBeInTheDocument();
    expect(container.querySelector('.celebration')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next Round (pass right)' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'NEXT_ROUND', seed: expect.any(Number) });
  });

  it('labels the last round and shows no celebration without a moon', () => {
    const state = base({
      phase: 'roundSummary', round: 3, roundScores: [[1, 2, 3, 20]], totals: [1, 2, 3, 20], moonHistory: [null],
    });
    const { container } = render(<RoundSummaryScreen state={state} dispatch={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'See final results' })).toBeInTheDocument();
    expect(container.querySelector('.celebration')).toBeNull();
  });
});

describe('GameOverScreen', () => {
  it('shows a tie and a perfect game celebration', () => {
    const state = base({ phase: 'gameOver', totals: [0, 0, 52, 52], roundScores: [[0, 0, 26, 26], [0, 0, 26, 26]] });
    render(<GameOverScreen state={state} onPlayAgain={vi.fn()} onNewPlayers={vi.fn()} onOpenStats={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Tie: Ann & Bob' })).toBeInTheDocument();
    expect(screen.getByText('💯 Perfect game: Ann & Bob!')).toBeInTheDocument();
  });

  it('shows a single winner and wires the buttons', () => {
    const onPlayAgain = vi.fn();
    const state = base({ phase: 'gameOver', totals: [10, 20, 30, 44], roundScores: [[10, 20, 30, 44]] });
    render(<GameOverScreen state={state} onPlayAgain={onPlayAgain} onNewPlayers={vi.fn()} onOpenStats={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Ann wins!' })).toBeInTheDocument();
    expect(screen.queryByText(/Perfect game/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(onPlayAgain).toHaveBeenCalled();
  });
});

describe('StatsScreen', () => {
  const record: GameRecord = {
    gameId: 'g1', finishedAt: Date.UTC(2026, 8, 25), seats: players.map(p => ({ playerId: p.id, name: p.name })),
    roundScores: [[26, 0, 26, 26], [0, 5, 10, 11], [0, 0, 0, 26], [0, 0, 26, 0]], totals: [26, 5, 62, 63],
    winners: ['b'], tie: false, moonShooters: ['b', null, null, null], perfect: [],
  };

  it('shows an empty state', () => {
    render(<StatsScreen records={[]} roster={[]} onClear={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('No games played yet.')).toBeInTheDocument();
  });

  it('shows per-player stats and the game log', () => {
    render(<StatsScreen records={[record]} roster={[]} onClear={vi.fn()} onBack={vi.fn()} />);
    const bob = screen.getAllByRole('row', { name: /Bob/ })[0];
    expect(within(bob).getAllByRole('cell').map(c => c.textContent)).toEqual(['Bob', '1', '1', '0', '1', '0']);
    expect(screen.getByText(/Bob 5 🏆/)).toBeInTheDocument();
  });

  it('confirms before clearing history', () => {
    const onClear = vi.fn();
    render(<StatsScreen records={[record]} roster={[]} onClear={onClear} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/results.test.tsx`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Write `src/screens/RoundSummaryScreen.tsx`**

```tsx
import type { Dispatch } from 'react';
import { type Action, type GameState, ROUNDS } from '../engine/game';
import { passDirection } from '../engine/passing';
import { randomSeed } from '../random';
import { Celebration, MOON_EMOJIS } from '../components/Celebration';
import { Scoreboard } from '../components/Scoreboard';

interface ScreenProps {
  state: GameState;
  dispatch: Dispatch<Action>;
}

function nextLabel(round: number): string {
  if (round >= ROUNDS - 1) return 'See final results';
  const direction = passDirection(round + 1);
  return `Next Round (${direction === 'none' ? 'no pass' : `pass ${direction}`})`;
}

export function RoundSummaryScreen({ state, dispatch }: ScreenProps) {
  const shooter = state.moonShooter === null ? null : state.players[state.moonShooter];
  return (
    <div className="screen">
      <h2 className="title">
        Round {state.round + 1} of {ROUNDS}
      </h2>
      {shooter && (
        <>
          <Celebration emojis={MOON_EMOJIS} />
          <p className="banner">🌙 {shooter.name} shot the moon! 🚀</p>
        </>
      )}
      <Scoreboard
        players={state.players}
        roundScores={state.roundScores}
        totals={state.totals}
        moonRounds={state.moonHistory}
      />
      <button type="button" className="btn" onClick={() => dispatch({ type: 'NEXT_ROUND', seed: randomSeed() })}>
        {nextLabel(state.round)}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/screens/GameOverScreen.tsx`**

```tsx
import type { GameState } from '../engine/game';
import { perfectSeats, winningSeats } from '../engine/scoring';
import { Celebration, PERFECT_EMOJIS } from '../components/Celebration';
import { Scoreboard } from '../components/Scoreboard';

interface GameOverScreenProps {
  state: GameState;
  onPlayAgain: () => void;
  onNewPlayers: () => void;
  onOpenStats: () => void;
}

export function GameOverScreen({ state, onPlayAgain, onNewPlayers, onOpenStats }: GameOverScreenProps) {
  const names = (seats: number[]) => seats.map(seat => state.players[seat].name).join(' & ');
  const winners = winningSeats(state.totals);
  const perfect = perfectSeats(state.totals);
  const heading = winners.length > 1 ? `Tie: ${names(winners)}` : `${names(winners)} wins!`;

  return (
    <div className="screen">
      <h1 className="title">{heading}</h1>
      {perfect.length > 0 && (
        <>
          <Celebration emojis={PERFECT_EMOJIS} />
          <p className="banner">💯 Perfect game: {names(perfect)}!</p>
        </>
      )}
      <Scoreboard
        players={state.players}
        roundScores={state.roundScores}
        totals={state.totals}
        moonRounds={state.moonHistory}
      />
      <div className="row">
        <button type="button" className="btn" onClick={onPlayAgain}>
          Play Again
        </button>
        <button type="button" className="btn secondary" onClick={onNewPlayers}>
          New Players
        </button>
        <button type="button" className="btn secondary" onClick={onOpenStats}>
          Stats
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `src/screens/StatsScreen.tsx`**

```tsx
import { useState } from 'react';
import type { GameRecord } from '../engine/history';
import type { Player } from '../engine/roster';
import { computeStats } from '../engine/stats';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Scoreboard } from '../components/Scoreboard';

interface StatsScreenProps {
  records: readonly GameRecord[];
  roster: readonly Player[];
  onClear: () => void;
  onBack: () => void;
}

export function StatsScreen({ records, roster, onClear, onBack }: StatsScreenProps) {
  const [confirming, setConfirming] = useState(false);
  const stats = computeStats(records, roster);
  const newestFirst = [...records].sort((a, b) => b.finishedAt - a.finishedAt);

  return (
    <div className="screen">
      <div className="header" style={{ width: '100%', maxWidth: 420 }}>
        <button type="button" className="btn small secondary" onClick={onBack}>
          ← Back
        </button>
        <h2 className="title">Stats</h2>
        <span />
      </div>

      {stats.length === 0 ? (
        <p className="message">No games played yet.</p>
      ) : (
        <table className="scores">
          <thead>
            <tr>
              <th>Player</th>
              <th>Games</th>
              <th>Wins</th>
              <th>Ties</th>
              <th>🌙</th>
              <th>💯</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.playerId}>
                <td>{s.name}</td>
                <td>{s.games}</td>
                <td>{s.wins}</td>
                <td>{s.ties}</td>
                <td>{s.moons}</td>
                <td>{s.perfect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {newestFirst.map(record => {
        const seats = record.seats.map(seat => ({ id: seat.playerId, name: seat.name }));
        const moonRounds = record.moonShooters.map(id =>
          id === null ? null : record.seats.findIndex(seat => seat.playerId === id),
        );
        return (
          <details key={record.gameId} className="game-log">
            <summary>
              {new Date(record.finishedAt).toLocaleString()} —{' '}
              {record.seats
                .map((seat, i) => `${seat.name} ${record.totals[i]}${record.winners.includes(seat.playerId) ? ' 🏆' : ''}`)
                .join(', ')}
            </summary>
            <Scoreboard players={seats} roundScores={record.roundScores} totals={record.totals} moonRounds={moonRounds} />
          </details>
        );
      })}

      {records.length > 0 && (
        <button type="button" className="btn small secondary" onClick={() => setConfirming(true)}>
          Clear history
        </button>
      )}

      {confirming && (
        <ConfirmDialog
          message="Delete all game history?"
          confirmLabel="Delete"
          onConfirm={() => {
            onClear();
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/screens/results.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add src/screens/RoundSummaryScreen.tsx src/screens/GameOverScreen.tsx src/screens/StatsScreen.tsx src/screens/results.test.tsx
git commit -m "feat(ui): round summary, game over and stats screens"
```

---

### Task 15: App wiring

**Files:**
- Modify: `src/App.tsx` (replace placeholder)
- Modify: `src/App.test.tsx` (replace placeholder test)

**Interfaces:**
- Consumes: `useGame`, `useRoster`, `useHistory` (Task 9); `buildRecord` (Task 8); `newId`, `randomSeed` (Task 9); all screens (Tasks 12–14); `ConfirmDialog`; `ROUNDS`.
- Produces: `export function App()`
  - UI-only `view: 'game' | 'players' | 'stats'`
  - Resume prompt when `useGame().resumable`: text `You have a game in progress.`, buttons `Resume` / `New Game`
  - During play (phase not `setup`/`gameOver`): header `Round n/4` + `New Game` button → confirm `Abandon this game? It won't be recorded.` / `Abandon`
  - When `state.phase === 'gameOver'`: `history.append(buildRecord(state, Date.now()))` in an effect (idempotent by `gameId`)

- [ ] **Step 1: Write the failing test `src/App.test.tsx`** (replace the file)

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { gameReducer, type GameState, initialState } from './engine/game';
import { GAME_KEY, HISTORY_KEY } from './state/storage';
import { autoAction } from './test/autoplay';

const players = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];
const saveGame = (until: (s: GameState) => boolean) => {
  let s = gameReducer(initialState(), { type: 'START_GAME', players, gameId: 'saved', seed: 4 });
  for (let i = 0; i < 5000 && !until(s); i++) s = gameReducer(s, autoAction(s));
  localStorage.setItem(GAME_KEY, JSON.stringify(s));
  return s;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('App', () => {
  it('adds four players, starts a game and reaches the pass screen', () => {
    vi.useFakeTimers();
    render(<App />);
    ['Ann', 'Bob', 'Cat', 'Dan'].forEach((name, i) => {
      fireEvent.change(screen.getByLabelText(`Seat ${i + 1}`), { target: { value: '__new__' } });
      fireEvent.change(screen.getByLabelText('New player name'), { target: { value: name } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
    expect(screen.getByText('Shuffling and dealing…')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('button', { name: "Show Ann's hand" })).toBeInTheDocument();
  });

  it('offers to resume a saved game without revealing a hand', () => {
    saveGame(s => s.phase === 'playing' && s.handRevealed);
    render(<App />);
    expect(screen.getByText('You have a game in progress.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('button', { name: /^See .*'s cards$/ })).toBeInTheDocument();
  });

  it('starts over from the resume prompt', () => {
    saveGame(s => s.phase === 'passing');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
  });

  it('abandons a game after confirming', () => {
    saveGame(s => s.phase === 'passing');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
    expect(localStorage.getItem(HISTORY_KEY)).not.toContain('saved');
  });

  it('records a finished game exactly once across reloads', () => {
    saveGame(s => s.phase === 'gameOver');
    const first = render(<App />);
    expect(screen.getByRole('button', { name: 'Play Again' })).toBeInTheDocument();
    first.unmount();
    render(<App />);
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY)!);
    expect(history.games).toHaveLength(1);
    expect(history.games[0].gameId).toBe('saved');
  });

  it('opens stats from game over', () => {
    saveGame(s => s.phase === 'gameOver');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }));
    expect(screen.getByRole('heading', { name: 'Stats' })).toBeInTheDocument();
    expect(screen.getAllByRole('row', { name: /Ann/ }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — placeholder App has no Setup screen.

- [ ] **Step 3: Write `src/App.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ROUNDS, type SeatPlayer } from './engine/game';
import { buildRecord } from './engine/history';
import { newId, randomSeed } from './random';
import { DealScreen } from './screens/DealScreen';
import { GameOverScreen } from './screens/GameOverScreen';
import { LeadScreen } from './screens/LeadScreen';
import { PassScreen } from './screens/PassScreen';
import { PlayersScreen } from './screens/PlayersScreen';
import { PlayScreen } from './screens/PlayScreen';
import { RoundSummaryScreen } from './screens/RoundSummaryScreen';
import { SetupScreen } from './screens/SetupScreen';
import { StatsScreen } from './screens/StatsScreen';
import { TrickResultScreen } from './screens/TrickResultScreen';
import { useGame } from './state/useGame';
import { useHistory } from './state/useHistory';
import { useRoster } from './state/useRoster';

type View = 'game' | 'players' | 'stats';

export function App() {
  const { state, dispatch, resumable } = useGame();
  const roster = useRoster();
  const history = useHistory();
  const { append } = history;
  const [view, setView] = useState<View>('game');
  const [askResume, setAskResume] = useState(resumable);
  const [confirmQuit, setConfirmQuit] = useState(false);

  useEffect(() => {
    if (state.phase === 'gameOver') append(buildRecord(state, Date.now()));
  }, [state, append]);

  const onDealDone = useCallback(() => dispatch({ type: 'DEAL_DONE' }), [dispatch]);

  const startGame = (players: SeatPlayer[]) =>
    dispatch({ type: 'START_GAME', players, gameId: newId(), seed: randomSeed() });

  if (view === 'players') {
    return (
      <PlayersScreen
        roster={roster.players}
        onAdd={roster.add}
        onRename={roster.rename}
        onArchive={roster.archive}
        onBack={() => setView('game')}
      />
    );
  }

  if (view === 'stats') {
    return (
      <StatsScreen
        records={history.records}
        roster={roster.players}
        onClear={history.clear}
        onBack={() => setView('game')}
      />
    );
  }

  if (askResume) {
    return (
      <div className="screen">
        <h1 className="title">♥ Offline Hearts ♠</h1>
        <p className="message">You have a game in progress.</p>
        <button type="button" className="btn" onClick={() => setAskResume(false)}>
          Resume
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            dispatch({ type: 'NEW_GAME' });
            setAskResume(false);
          }}
        >
          New Game
        </button>
      </div>
    );
  }

  const inGame = state.phase !== 'setup' && state.phase !== 'gameOver';

  const renderPhase = () => {
    switch (state.phase) {
      case 'setup':
        return (
          <SetupScreen
            roster={roster.players}
            onAddPlayer={roster.add}
            onStart={startGame}
            onOpenPlayers={() => setView('players')}
            onOpenStats={() => setView('stats')}
          />
        );
      case 'dealing':
        return <DealScreen key={`${state.gameId}-${state.round}`} players={state.players} onDone={onDealDone} />;
      case 'passing':
        return <PassScreen state={state} dispatch={dispatch} />;
      case 'leadAnnounce':
        return <LeadScreen state={state} dispatch={dispatch} />;
      case 'playing':
        return <PlayScreen state={state} dispatch={dispatch} />;
      case 'trickResult':
        return <TrickResultScreen state={state} dispatch={dispatch} />;
      case 'roundSummary':
        return <RoundSummaryScreen state={state} dispatch={dispatch} />;
      case 'gameOver':
        return (
          <GameOverScreen
            state={state}
            onPlayAgain={() => dispatch({ type: 'PLAY_AGAIN', gameId: newId(), seed: randomSeed() })}
            onNewPlayers={() => dispatch({ type: 'NEW_GAME' })}
            onOpenStats={() => setView('stats')}
          />
        );
    }
  };

  return (
    <>
      {inGame && (
        <header className="header">
          <span>
            Round {state.round + 1}/{ROUNDS}
          </span>
          <button type="button" className="btn small secondary" onClick={() => setConfirmQuit(true)}>
            New Game
          </button>
        </header>
      )}
      {renderPhase()}
      {confirmQuit && (
        <ConfirmDialog
          message="Abandon this game? It won't be recorded."
          confirmLabel="Abandon"
          onConfirm={() => {
            dispatch({ type: 'NEW_GAME' });
            setConfirmQuit(false);
          }}
          onCancel={() => setConfirmQuit(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Full suite, typecheck, build**

Run: `npm test && npm run build`
Expected: all tests pass; build exits 0.

- [ ] **Step 6: Manual smoke check in a browser**

Run: `npm run dev` and open the printed URL (it ends in `/offline-hearts/`) in a mobile-sized viewport (e.g. 390×844). Add 4 players, start, pass cards for all 4, play a few tricks, reload mid-trick (should show Resume, then a hidden-hand gate), then tap `New Game` → `Abandon`. Fix any layout issues (overlapping names/cards at 375px width) by adjusting `src/styles/table.css` offsets only.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: wire screens, resume prompt and history recording"
```

---

### Task 16: PWA, icons and iOS install support

**Files:**
- Create: `public/icon.svg`, generated icons in `public/`
- Modify: `vite.config.ts`, `index.html`, `package.json` (devDependencies)

**Interfaces:**
- Produces: `dist/manifest.webmanifest`, `dist/sw.js`, precached app shell; Home Screen icon on iOS.

- [ ] **Step 1: Install**

Run: `npm install -D vite-plugin-pwa@^1 @vite-pwa/assets-generator@^1`
Expected: installs (peer `workbox-build`/`workbox-window` auto-installed).

- [ ] **Step 2: Write `public/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b5d2a"/>
  <rect x="136" y="88" width="240" height="336" rx="28" fill="#ffffff"/>
  <path d="M256 372 C 150 296 150 196 214 188 C 238 185 252 200 256 214 C 260 200 274 185 298 188 C 362 196 362 296 256 372 Z" fill="#c8102e"/>
</svg>
```

- [ ] **Step 3: Generate icons**

Run: `npx pwa-assets-generator --preset minimal-2023 public/icon.svg`
Then: `ls public`
Expected files: `favicon.ico`, `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `icon.svg`. If names differ, use the actual names in Steps 4–5.

- [ ] **Step 4: Update `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/offline-hearts/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Offline Hearts',
        short_name: 'Hearts',
        description: 'Pass-and-play Hearts for four players, works offline.',
        theme_color: '#0b5d2a',
        background_color: '#0b5d2a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 5: Update `index.html` `<head>`**

Add after the `theme-color` meta:
```html
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Hearts" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```
(Vite rewrites these root-relative URLs to include `/offline-hearts/` at build time.)

- [ ] **Step 6: Build and verify output**

Run: `npm run build`
Then: `ls dist`
Expected: includes `index.html`, `manifest.webmanifest`, `sw.js`, `workbox-*.js`, icons.
Run: `grep -o 'href="[^"]*"' dist/index.html`
Expected: every href starts with `/offline-hearts/` and includes `manifest.webmanifest` and `apple-touch-icon-180x180.png`.

- [ ] **Step 7: Verify offline behaviour**

Run: `npm run preview` and open `http://localhost:4173/offline-hearts/` in Chrome. In DevTools → Application: manifest shows name "Offline Hearts" with icons, service worker is activated. Tick "Offline" in the Network tab and reload: the app still loads.

- [ ] **Step 8: Run tests and commit**

Run: `npm test` → Expected: all pass.

```bash
git add public vite.config.ts index.html package.json package-lock.json
git commit -m "feat: installable offline PWA with iOS home screen support"
```

---

### Task 17: GitHub Pages deployment and README

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write `README.md`**

```markdown
# Offline Hearts

Pass-and-play Hearts for four players on one device. Installable to the iOS Home Screen and fully playable offline.

## Play

Open https://<your-github-user>.github.io/offline-hearts/ in Safari, tap **Share → Add to Home Screen**, then launch it from the Home Screen. After the first load it works without a connection.

## Develop

    npm install
    npm run dev      # http://localhost:5173/offline-hearts/
    npm test
    npm run build    # static site in dist/

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages.
One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
If the repository is not named `offline-hearts`, change `base` in `vite.config.ts` to match.
```

- [ ] **Step 3: Verify locally**

Run: `npm ci && npm test && npm run build`
Expected: all succeed (mirrors the CI job).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "ci: deploy to GitHub Pages and add README"
```

- [ ] **Step 5: Enable Pages (manual, once)**

In the GitHub repository: **Settings → Pages → Source: GitHub Actions**. Push `main`; confirm the workflow succeeds and the site loads at `https://<user>.github.io/offline-hearts/`. On an iPhone, open it in Safari → Share → Add to Home Screen → launch, enable Airplane Mode, relaunch: the game still loads.
