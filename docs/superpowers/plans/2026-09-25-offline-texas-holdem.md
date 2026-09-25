# Offline Texas Hold’em Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 2–8 player offline no-limit Hold’em tournament at `/offline-hearts/offline-texas-holdem/` while preserving Hearts and sharing the roster, cards, and presentation.

**Architecture:** Keep poker rules in pure TS modules (`src/poker/engine`), with a reducer handling turn order, chip accounting, and public/private state. Reuse the existing card/roster/storage APIs through shared-module re-exports or narrowly moved source files; the two apps have independent game saves and page entries, but one Pages build and shared roster. Never move the existing Hearts localStorage keys or alter their wire formats.

**Tech Stack:** Existing React 19, Vite 8, TypeScript ~5.9, Vitest 5, Testing Library, `vite-plugin-pwa` 1.x.

**Spec:** `docs/superpowers/specs/2026-09-25-offline-texas-holdem-design.md`

## Global Constraints

- Hearts remains at `/offline-hearts/`; poker is at `/offline-hearts/offline-texas-holdem/`; Vite project base remains `/offline-hearts/`.
- The shared roster is `hearts.roster`, retaining version 1 and player IDs. Poker keys are `poker.tournament` and `poker.settings`; Hearts game/history keys must not change.
- 2–8 distinct active players, equal positive integer starting stacks, positive integer big blind no greater than starting stack; small blind `Math.ceil(bigBlind / 2)`.
- Tournament ends when one stack is positive; button starts seeded-random and advances clockwise among live players. Heads-up dealer is small blind and acts first preflop, big blind first postflop.
- Blind edits save immediately but only affect the next hand. Deal two private cards per active player; burn before flop/turn/river, five community cards total.
- No-limit betting, full/minimum raises, short all-ins that do not reopen action, uncalled-bet refunds, folded contributions, side pots, ties, clockwise odd chips; no chip creation or destruction.
- Hole cards stay private until the owner's reveal or showdown; uncontested wins never expose them. Reload must hide hole cards and offer Resume/New Tournament.
- No app code or generated assets may require an internet connection after first install. No cash, payments, or real-money betting.
- Do not overwrite or discard existing user changes or Hearts saves; do not push or publish without authorization.

## Review Focus

1. **Heads-up and short blinds:** dealer small blind acts first preflop and BB retains their option, including an all-in short post — tested in Task 3 and Task 5.
2. **Short all-in raises:** action reopens only after a full raise, and a checked player gets another action if a later bet appears — tested in Task 4.
3. **Side pots and ties:** folded chips remain, uncalled excess is refunded, odd chips start left of dealer; total chips preserved — tested in Task 5.
4. **Corrupt or older saves:** a bad poker state never wipes Hearts/roster; reloading a valid revealed state hides the hole cards; invalid new field values are rejected — tested in Task 7.
5. **Offline nested route:** each page must have its own manifest/name/icon and fetch its assets while offline at the actual project subpath — tested in Task 9.

## File Map

```
src/shared/cards.ts             stable re-export of existing Hearts card/deck API
src/shared/roster.ts            stable re-export of existing roster functions
src/shared/useRoster.ts         existing roster hook, hearts.roster key
src/shared/storage.ts           existing versioned storage/warning API
src/shared/CardView.tsx         existing card face re-export
src/engine/{cards,roster}.ts    existing implementations, unchanged
src/state/{useRoster,storage}.ts existing implementations, unchanged
src/components/CardView.tsx    existing implementation, unchanged
src/poker/engine/evaluate.ts   five-card ranks and best five from seven
src/poker/engine/seats.ts      live seat/button/blind/action order
src/poker/engine/betting.ts    legal actions, street amounts and raise reopening
src/poker/engine/pots.ts       side pot/refund/split/odd chips
src/poker/engine/tournament.ts pure serializable tournament reducer
src/poker/state.ts             poker save/settings hooks and validation
src/poker/PokerApp.tsx          UI/screens, private gate, betting confirmation
src/poker/poker.css             compact responsive 2–8-player layout
src/poker/main.tsx             poker entry
offline-texas-holdem/index.html second Vite entry
vite.config.ts                 multi-entry build and offline precache
public/poker-*                own manifest/icon assets
README.md                     both games' URLs and install instructions
scripts/check-pages.mjs       built-HTML/asset/precache assertions
```

Files with tests use adjacent `*.test.ts` or `*.test.tsx`. Do not copy scoring logic or duplicate the roster; compatibility re-exports keep Hearts imports stable. Each task must run its focused tests, `npm test`, and `npm run build` before committing.

---

### Task 1: Share stable cards, roster, storage and card face

**Files:** Create `src/shared/cards.ts`, `src/shared/roster.ts`, `src/shared/useRoster.ts`, `src/shared/storage.ts`, `src/shared/CardView.tsx`; test `src/shared/shared.test.tsx`. Leave existing Hearts modules unchanged.

**Interfaces:** Produce `Card`, `CardId`, `newDeck`, `shuffle`, `mulberry32`, `cardId`, `useRoster`, `Player`, `loadVersioned`, `saveVersioned`, `CardView` with exactly their existing signatures. Keep `cardPoints`, `deal`, `sortHand` and all Hearts symbols available from original paths (re-export Hearts-only helpers there where appropriate). Keep `hearts.roster` identical.

For this task prefer **compatibility re-exports from `src/shared/` to the existing modules**, not moving the implementations: `src/shared/cards.ts` re-exports `../engine/cards`, etc. This is one source of truth with no changed Hearts import paths and no saved-data migration. Poker imports `src/shared/` only. Keep the shared files dependency-light; if a future Hearts-only import forces a poker bundle to include Hearts UI, move that module with its tests then retain the original re-export.

- [ ] **Step 1: Write the failing shared-boundary test.** Import `newDeck`, `cardId`, `shuffle` from `../shared/cards`; `addPlayer` from `../shared/roster`; `ROSTER_KEY` from `../shared/storage`; `CardView` from `../shared/CardView`. Test that 52 unique cards result, the Hearts and shared card IDs match (`cardId({rank:14,suit:'S'}) === 'AS'`), a player added under `ROSTER_KEY` remains readable by existing `useRoster`, and CardView renders a button named `A♠`.

```tsx
expect(new Set(newDeck().map(cardId)).size).toBe(52);
expect(cardId({ rank: 14, suit: 'S' })).toBe('AS');
expect(ROSTER_KEY).toBe('hearts.roster');
expect(addPlayer([], 'Ann', 'id-ann', 1)).toMatchObject({ ok: true });
render(<CardView card={{ rank: 14, suit: 'S' }} />);
expect(screen.getByRole('button', { name: 'A♠' })).toBeInTheDocument();
```

- [ ] **Step 2: Run** `npx vitest run src/shared/shared.test.tsx`; expect missing shared module imports.
- [ ] **Step 3: Add shared aliases without moving the existing implementations.** The existing Hearts modules stay in place with their import paths and persistence untouched:

```ts
// src/shared/cards.ts
export * from '../engine/cards';
// src/shared/roster.ts
export * from '../engine/roster';
// src/shared/useRoster.ts
export * from '../state/useRoster';
// src/shared/storage.ts
export * from '../state/storage';
// src/shared/CardView.tsx
export * from '../components/CardView';
```

Import existing `hearts.roster` fixtures in the test to check preserved IDs and names. Do not change saved game shapes.
- [ ] **Step 4: Run** `npx vitest run src/shared/shared.test.tsx && npm test && npm run build`; expect all Hearts tests and build to remain green. **Commit:** `git add src/shared && git commit -m "refactor: expose Hearts cards and roster as shared APIs"`.

### Task 2: Evaluate poker hands

**Files:** Create `src/poker/engine/evaluate.ts`; test `src/poker/engine/evaluate.test.ts`.

**Interfaces:** `HandRank { category: 0|1|2|3|4|5|6|7|8; tiebreak: number[]; label: string; bestFive: Card[] }`; `evaluateFive(cards: readonly Card[]): HandRank` (exactly five); `bestOfSeven(cards: readonly Card[]): HandRank` (exactly seven); `compareHands(a: HandRank,b: HandRank): number` (positive means a wins). Cards use `src/shared/cards.ts`. Category order: high card, pair, two pair, trips, straight, flush, full house, quads, straight flush. Royal flush is a labeled ace-high straight flush; suits never break ties.

- [ ] **Step 1: Add literal fixtures for each category and rank tie-break.** Use `parseCardId` to write five-card arrays. Include `['AS','2D','3C','4H','5S']` wheel straight (high 5), `['10S','JS','QS','KS','AS']` royal, quads vs full house, two pair with kicker, same ranks different suits tie, and board-only seven-card tie. Assert bestFive contains exactly five cards from the seven with correct IDs.

```ts
const hand = (ids: string[]) => ids.map(parseCardId);
expect(evaluateFive(hand(['AS','2D','3C','4H','5S'])).tiebreak).toEqual([5]);
expect(evaluateFive(hand(['10S','JS','QS','KS','AS'])).category).toBe(8);
expect(compareHands(bestOfSeven(hand(['2C','3D','10S','JS','QS','KS','AS'])),
  bestOfSeven(hand(['4C','5D','10S','JS','QS','KS','AS'])))).toBe(0);
```

- [ ] **Step 2: Run** `npx vitest run src/poker/engine/evaluate.test.ts`; expect missing evaluator.
- [ ] **Step 3: Implement** evaluation using rank-frequency groups ordered by count then rank; flush = all same suit; straight = distinct ranks plus A-as-1 wheel; tiebreak ordered by hand category. Enumerate all `C(7,5)=21` subsets for `bestOfSeven`, retain the strongest, and use deterministic input order for equal five-card candidates. A five-card rank is computed from cards alone; never rank suits.

```ts
const counts = new Map<number, number>();
for (const card of five) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
const groups = [...counts].map(([rank, count]) => ({ rank, count }))
  .sort((a, b) => b.count - a.count || b.rank - a.rank);
const straightHigh = ranks.includes(14) && [2,3,4,5].every(r => ranks.includes(r))
  ? 5 : findDescendingRun(ranks);
const best = combinationsOfFive(seven).map(evaluateFive)
  .reduce((a, b) => compareHands(a, b) >= 0 ? a : b);
```

- [ ] **Step 4: Run** focused/full tests and build. Commit `feat(poker): evaluate and compare best five-card hands`.

### Task 3: Deal and clockwise seat ordering

**Files:** Create `src/poker/engine/seats.ts`; test `src/poker/engine/seats.test.ts`.

**Interfaces:** `nextLive(seats: readonly {stack:number}[], from:number): number`; `firstDealer(seats,seed:number): number` selects `liveSeats[Math.floor(mulberry32(seed)()*liveSeats.length)]`; `positions(seats,dealer): { small:number; big:number; preflopFirst:number; postflopFirst:number }`; `dealHand(seats,dealer,seed): { hole: (Card[]|null)[]; deck: Card[]; board: Card[]; burned: Card[] }` with 2 cards for each live seat and unused shuffled deck. `revealStreet(hand,street:'flop'|'turn'|'river')` burns then reveals 3/1/1. Verify 52 distinct cards across hole/deck/board/burned at every step.

- [ ] **Step 1: Write tests** for live seats 0,2,4 skipping eliminated 1,3; 3-player positions; heads-up dealer small blind; seeded first dealer `Math.floor(mulberry32(seed)()*n)`; two hole cards each and 3 burns across streets; seeded determinism.

```ts
const live = [{stack:100},{stack:0},{stack:100},{stack:0},{stack:100}];
expect(nextLive(live, 0)).toBe(2);
expect(positions(live, 0)).toEqual({ small:2, big:4, preflopFirst:0, postflopFirst:2 });
expect(positions([{stack:100},{stack:100}], 0))
  .toEqual({ small:0, big:1, preflopFirst:0, postflopFirst:1 });
```

- [ ] **Step 2: Run** `npx vitest run src/poker/engine/seats.test.ts` (RED).
- [ ] **Step 3: Implement** modular clockwise `nextLive` and round-robin deal to eligible seats; consume deck once per hole/burn/board; `revealStreet` returns new arrays rather than mutating. Include explicit guard when live count <2; avoid loops over all-zero seats.
- [ ] **Step 4: Run** focused/full tests and build; commit `feat(poker): deal and advance seats clockwise`.

### Task 4: Legal no-limit betting transitions

**Files:** Create `src/poker/engine/betting.ts`; test `src/poker/engine/betting.test.ts`.

**Interfaces:** `BetSeat {stack:number; streetBet:number; committed:number; folded:boolean; allIn:boolean; actedSinceFullRaise:boolean; raiseLocked:boolean}`; `BettingState { seats:BetSeat[]; currentBet:number; lastFullRaise:number; pending:number[]; current:number|null; bigBlind:number }`. `legalActions(state): {check:boolean; call:number|null; fold:boolean; allIn:boolean; minTotal:number|null; maxTotal:number}`. `act(state, action: {type:'CHECK'|'CALL'|'FOLD'|'ALL_IN'|'BET_TO'; total?:number}): BettingState` returns exact same reference when illegal; amounts for `BET_TO` are **total street contributions**, not incremental chips. `roundComplete(state): boolean`. Keep street-bet and committed accounting independent; blind postings supplied by Task 6.

- [ ] **Step 1: Tests** cover check when no call; call capped by stack; fold only facing a bet; big blind can check preflop after callers; full raise reopens pending action; a short all-in increases call but locks raises for previously acted players; a prior checker can respond to a later bet; all-in with no one able to call is not a legal bet. Assert chip conservation (`sum(stack+committed)` unchanged) after every action, invalid decimal/negative/over-stack/under-minimum returns the *same object*.

```ts
const state: BettingState = {
  seats: [
    {stack:100,streetBet:0,committed:0,folded:false,allIn:false,actedSinceFullRaise:false,raiseLocked:false},
    {stack:95,streetBet:5,committed:5,folded:false,allIn:false,actedSinceFullRaise:false,raiseLocked:false},
    {stack:90,streetBet:10,committed:10,folded:false,allIn:false,actedSinceFullRaise:false,raiseLocked:false},
  ],
  currentBet:10,lastFullRaise:10,pending:[0,1,2],current:0,bigBlind:10,
};
expect(legalActions(state).call).toBe(10);
expect(act(state, {type:'BET_TO',total:9})).toBe(state);
const raised = act(state,{type:'BET_TO',total:30});
expect(raised.lastFullRaise).toBe(20);
expect(raised.pending).toContain(1);
```

- [ ] **Step 2: Run** `npx vitest run src/poker/engine/betting.test.ts` (RED).
- [ ] **Step 3: Implement** explicit `pending` seats clockwise: remove actor on check/call/fold; full raise repopulates pending with other active non-all-in seats; short all-in adds anyone now below the bet but marks already-acted seats `raiseLocked`, leaving their call/fold available; no-op illegal actions. Reset `actedSinceFullRaise`/`raiseLocked` at the next street. `lastFullRaise` starts at the hand's big blind, even if big blind posts short. A street ends only when `pending` is empty or no contestable action remains.
- [ ] **Step 4: Run** focused/full tests and build; commit `feat(poker): enforce no-limit betting and raise reopening`.

### Task 5: Main/side pots, refunds and showdown payouts

**Files:** Create `src/poker/engine/pots.ts`; test `src/poker/engine/pots.test.ts`.

**Interfaces:** `Pot {amount:number; eligible:number[]}`; `refundUncalled(seats: readonly BetSeat[]): {seats:BetSeat[]; refund:number; seat:number|null}`; `buildPots(seats: readonly BetSeat[]): Pot[]`; `awardPots(seats:readonly BetSeat[], dealer:number, ranks:ReadonlyMap<number,HandRank>): {seats:BetSeat[]; pots:{amount:number;eligible:number[];winners:number[]}[]}`. Folded contributors remain in each pot amount but are excluded from `eligible`. `awardUncontested(seats:readonly BetSeat[],winner:number): BetSeat[]` returns new seats with all committed chips awarded after excess refund; never accesses hole cards.

- [ ] **Step 1: Literal tests** for contributions 25/100/100 => main 75 and side 150; folded 40 chips included but folded seat ineligible; 100/40 uncalled 60 refunded; a tied 5-chip pot goes 3/2 with odd chip to first tied winner clockwise left of dealer; distinct winners main and side; all-in with two zero-stack opponents; total stacks after award equals before award plus all committed chips.

```ts
// seatsFrom returns BetSeat entries with committed and streetBet equal to each amount,
// stack 0, folded/allIn/actedSinceFullRaise/raiseLocked all false.
const seatsFrom = (amounts: number[]): BetSeat[] => amounts.map(amount => ({
  stack:0,streetBet:amount,committed:amount,folded:false,allIn:false,
  actedSinceFullRaise:false,raiseLocked:false,
}));
expect(buildPots(seatsFrom([25,100,100]))).toEqual([
  {amount:75,eligible:[0,1,2]}, {amount:150,eligible:[1,2]},
]);
expect(refundUncalled(seatsFrom([100,40])).refund).toBe(60);
const tie = evaluateFive(['2C','2D','4S','7H','JC'].map(parseCardId));
const tiedFiveChipPot = seatsFrom([1,2,2]);
tiedFiveChipPot[0].folded = true;
expect(awardPots(tiedFiveChipPot, 0, new Map([[1,tie],[2,tie]])).pots[0].winners).toEqual([1,2]);
```

- [ ] **Step 2: Run** `npx vitest run src/poker/engine/pots.test.ts` (RED).
- [ ] **Step 3: Implement** pot tiers using distinct positive contribution levels. First return unmatched excess above the second-highest *total contribution* to its owner, updating stack, committed and streetBet. For each tier multiply delta by count of contributors at least that deep. Evaluate eligible ranks per pot; distribute quotient then remainder one chip each to winners in clockwise order from dealer+1. Zero contributions after payout and preserve original tournament chip sum.
- [ ] **Step 4: Run** focused/full tests and build; commit `feat(poker): resolve side pots and odd chips`.

### Task 6: Tournament state machine and end-to-end engine simulation

**Files:** Create `src/poker/engine/tournament.ts`; test `src/poker/engine/tournament.test.ts`.

**Interfaces:** `Tournament {version:1; id:string; players:{id:string;name:string}[]; initialChips:number; stacks:number[]; dealer:number; handNumber:number; phase:'hand'|'result'|'finished'; street:'preflop'|'flop'|'turn'|'river'|null; hand:{hole:(Card[]|null)[];deck:Card[];board:Card[];burned:Card[];betting:BettingState;bigBlind:number;smallBlind:number} | null; result:{kind:'showdown'|'uncontested';pots:{amount:number;eligible:number[];winners:number[]}[];hands:{seat:number;hole:Card[];best:HandRank}[];winnerSeats:number[]} | null; current:number|null; holeRevealed:boolean}`. `Action` union `{type:'START';players:{id:string;name:string}[];stack:number;bigBlind:number;id:string;seed:number}` | `{type:'REVEAL'}` | `{type:'ACT';action:{type:'CHECK'|'CALL'|'FOLD'|'ALL_IN'|'BET_TO';total?:number}}` | `{type:'NEXT_HAND';seed:number;bigBlind:number}` | `{type:'ABANDON'}`. `tournamentReducer(state:Tournament|null,action:Action):Tournament|null` pure and illegal actions return the exact state reference. `initialTournament(): Tournament | null` returns null (setup); `START` accepts 2–8 distinct players and valid amounts. **While a hand is active, `hand.betting.seats[i].stack` is authoritative; after every `ACT`, copy those stacks into `Tournament.stacks`, and after payouts copy awarded stacks before the next hand. They must never diverge.** `current` mirrors `hand.betting.current` for UI only; update them together.

- [ ] **Step 1: Tests** seeded start, blinds charged, hole privacy, consecutive turns clockwise, 3 streets with burns, folded uncontested win hides all hole cards, all-in board runout/showdown, multiway side pot payout, heads-up blind/order, zero-stack elimination/button skip, tournament champion, `NEXT_HAND` accepts new blind but current hand remains on old snapshot, invalid action same reference. Simulate complete hands choosing legal check/call/fold as needed; after *every* action assert `sum(stacks)+sum(committed)===initialChips*players.length`, and during a hand assert `state.stacks[i] === state.hand.betting.seats[i].stack` for every seat.

```ts
const started = tournamentReducer(null, {
  type:'START',players:[{id:'a',name:'A'},{id:'b',name:'B'}],
  stack:100,bigBlind:10,id:'t1',seed:19,
});
expect(started?.hand?.smallBlind).toBe(5);
expect(started?.stacks.reduce((a,b)=>a+b,0) +
  started!.hand!.betting.seats.reduce((a,b)=>a+b.committed,0)).toBe(200);
```

- [ ] **Step 2: Run** `npx vitest run src/poker/engine/tournament.test.ts` (RED).
- [ ] **Step 3: Implement** `START`/`NEXT_HAND` with Task 3 positions and shuffled deck; post blind as min(stack,amount). Only allow `ACT` when current player has revealed hole cards; clear reveal after each action. On street completion, run Task 3 board reveal and reset betting street contributions, or run out remaining board if no further contestable bet. On fold-to-one, award without evaluating hands; at showdown calculate Task 2 ranks and Task 5 pots. On hand result next hand rotates dealer to next positive stack; finish when one remains. `ABANDON` returns null. Preserve total chips at every transition; do not leak poker cards in UI until reveal.
- [ ] **Step 4: Run** focused/full tests and build; commit `feat(poker): tournament reducer and full-hand simulation`.

### Task 7: Poker settings and saved tournament safety

**Files:** Create `src/poker/state.ts`; test `src/poker/state.test.tsx`.

**Interfaces:** `POKER_KEY='poker.tournament'`, `SETTINGS_KEY='poker.settings'`; `loadPoker(): Tournament|null` with `holeRevealed:false`; `loadSettings(): {version:1;bigBlind:number}` default bigBlind 10; `saveSettings(bigBlind:number): boolean` validates positive safe integer; `usePoker(): {state:Tournament|null; dispatch:Dispatch<Action>; resumable:boolean}`; use existing `saveVersioned` failure subscription.

- [ ] **Step 1: Tests** reload revealed `holeRevealed:true` → false, preserve board/hand/stacks and resume; invalid card duplication, negative stack, invalid turn, invalid version → null; malformed saved poker data does not change `hearts.game`, `hearts.history`, or `hearts.roster`; changing settings mid-hand leaves `hand.bigBlind` unchanged but next hand uses new value; read/write failure shows warning using shared store; settings invalid bigBlind (0, fractional, NaN, non-number) rejected.

```ts
localStorage.setItem('hearts.game', 'existing-hearts-save');
localStorage.setItem(POKER_KEY, '{bad');
expect(loadPoker()).toBeNull();
expect(localStorage.getItem('hearts.game')).toBe('existing-hearts-save');
```

- [ ] **Step 2: Run** `npx vitest run src/poker/state.test.tsx` (RED).
- [ ] **Step 3: Implement** `loadVersioned` validation covering deck/hole/burned/board uniqueness (completed cards also in result may be references, not extra deck cards), money fields and conservation, live players/indices, phase/street, record shapes. Save on every reducer state change with existing storage warnings. Guard saved hole privacy on load; never discard roster or Hearts on poker corruption. Persist settings separately. Expose failures by the existing `useSyncExternalStore(subscribeToSaveFailures,getSaveFailures)` pattern.
- [ ] **Step 4: Run** focused/full tests and build; commit `feat(poker): persist tournament and pending blind changes`.

### Task 8: Pass-and-play poker screens

**Files:** Create `src/poker/PokerApp.tsx`, `src/poker/poker.css`, `src/poker/PokerApp.test.tsx`; reuse `src/shared/CardView.tsx`, `src/shared/useRoster.ts`, existing `PlayersScreen`, `PrivacyScreen`, and `ConfirmDialog`.

**Interfaces:** `PokerApp()` renders setup, handoff, actions, results and champion from Task 6 reducer/Task 7 hooks. Render a responsive scrollable seat list for up to 8, board, pot, blinds, current street, stacks and contributions. The current player's hole cards render **only** after `REVEAL`; showdown renders all remaining hole cards and each `bestFive`, label, main/side-pot winners and payouts. `Blinds` control is accessible in all phases including handoff. `BET_TO.total` is explicitly a street-total input; confirm action text includes amount. A fold to one renders result without hole cards.

- [ ] **Step 1: Write RTL tests** for 8 distinct roster players and setup validation, shared roster add/rename identity, handoff hidden before reveal, no other player's hole cards on action screen, amount entry and confirmation, two-player showdown showing both hole cards/actual best five and winner/tie, side-pot breakdown, uncontested win hiding cards, active blind display vs next-hand setting, restart confirmation, resume gate, and winning tournament. Assert the **absence** of private rank/suit text while hidden and the **presence** after reveal, not only component names.

```tsx
render(<PokerApp />);
expect(screen.getByRole('heading', {name:/Texas Hold’em/i})).toBeInTheDocument();
expect(screen.getByRole('button', {name:/Start tournament/i})).toBeDisabled();
// Populate seats with four roster players, then Start, confirm that no hole-card buttons render.
```

- [ ] **Step 2: Run** `npx vitest run src/poker/PokerApp.test.tsx` (RED).
- [ ] **Step 3: Implement** screens in `PokerApp.tsx` with smaller local components for setup, public table, action gate/confirmation, result and blind editor. Reuse the roster hook and card face; guard illegal actions in the reducer as well as disabling UI controls. Keep modal/action draft in component state, not tournament save. Style seat list with two columns on wide screens and one on narrow screens; show stack and contributed chips without tiny overlap. Reduced-motion CSS avoids animation. Keep app accessible by buttons/labels and avoid 16px-small inputs on iOS.
- [ ] **Step 4: Run** focused/full tests and build; check a 375px viewport for 8 seats and a showdown; commit `feat(poker): pass-and-play tournament screens`.

### Task 9: Two installable offline page entries

**Files:** Create `offline-texas-holdem/index.html`, `src/poker/main.tsx`, `public/offline-texas-holdem/poker.webmanifest`, separate poker icons under `public/offline-texas-holdem/`, `scripts/check-pages.mjs`, tests `src/poker/offline.test.ts`; modify `vite.config.ts`, `index.html` only where required, `README.md`.

**Interfaces:** Vite root `index.html` → `dist/index.html` unchanged; second entry → `dist/offline-texas-holdem/index.html`; both HTML files fetch shared hashed assets with `/offline-hearts/` base. Hearts keeps its current generated manifest name/icon/scope. Poker uses a **static** `public/offline-texas-holdem/poker.webmanifest` with `name:'Offline Texas Hold’em'`, `start_url:'/offline-hearts/offline-texas-holdem/'`, `scope:'/offline-hearts/offline-texas-holdem/'`, standalone portrait and separately named icons under the nested path. `vite-plugin-pwa` runs only once, for Hearts: one root-scope worker precaches both HTML entries, both manifests, and their hashed JS/CSS. Register it in the nested entry using `navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {scope:import.meta.env.BASE_URL})` rather than `registerSW.js` if the plugin injects the Hearts manifest into the nested page. The poker HTML must contain exactly its own manifest link. Verify nested navigation fallback explicitly rather than assuming generated navigation handling. Do not register a second worker whose scope is accidentally wrong.

- [ ] **Step 1: Write a standalone build-output check** in `scripts/check-pages.mjs` (Node `node:assert/strict`, `node:fs`) which reads both generated HTML after a separate build; verifies distinct title/manifest URLs, both HTML entries in the service-worker precache, each HTML asset URL exists in `dist`, and no asset resolves to `/offline-texas-holdem/` at domain root. Add a separate Vitest source-level regression test in `src/poker/offline.test.ts` that imports the Vite config and checks `base === '/offline-hearts/'` and two declared input paths. Add headless offline-navigation procedure to README for both nested URLs. Use a build-script function `checkPages(distDir)` from `scripts/check-pages.mjs`, called by the script's CLI entry, to test generated HTML assets using `existsSync(join(distDir, url.replace('/offline-hearts/','')))`. Parse the Workbox precache URLs from `dist/sw.js` and require `index.html` and `offline-texas-holdem/index.html` (or their `./` variants).

```ts
expect(existsSync('dist/index.html')).toBe(true);
expect(existsSync('dist/offline-texas-holdem/index.html')).toBe(true);
expect(readFileSync('dist/offline-texas-holdem/index.html','utf8'))
  .toContain('/offline-hearts/assets/');
```

- [ ] **Step 2: Run** `npx vitest run src/poker/offline.test.ts`; expect missing second entry. Build separately before executing `scripts/check-pages.mjs`, never from a Vitest test.
- [ ] **Step 3: Configure** `build.rollupOptions.input` for both HTML entries, keep base `/offline-hearts/`, ensure the worker precaches both actual navigation paths and the manifest/link belonging to each entry. Add poker HTML with separate meta title, theme and apple-touch-icon; copy/generated poker icons must not overwrite Hearts icons. Root worker scope `/offline-hearts/`, poker manifest scope only the nested path; nested page registers the root worker URL. Inspect built poker HTML for any PWA plugin auto-injected Hearts manifest and remove it if present; require exactly one poker manifest link in the build-output checker. Update README with both install URLs and development instructions.
- [ ] **Step 4: Run** `npm test && npm run build && node scripts/check-pages.mjs`; check URLs using `npm run preview` at `/offline-hearts/` and `/offline-hearts/offline-texas-holdem/`, then navigate offline to both after installing worker. Record whether physical iOS Home Screen validation was possible. Commit `feat: deploy Hearts and Hold’em as offline pages`.

---

## Final verification

- [ ] Run `npm test`, `npm run build`, `node scripts/check-pages.mjs`, `git diff --check`. Record test count, failures, and build output; inspect a seeded full tournament for chip conservation and both offline URLs.
- [ ] Confirm `git status --short` contains only expected changes; do not push or change Pages settings without the human partner's instruction.
