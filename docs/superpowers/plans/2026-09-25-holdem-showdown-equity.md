# Hold’em Showdown Equity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the actual best five on showdown cards, mark both blinds, and plot exact best-hand chances against the revealed showdown players’ hole cards at all four phases without blocking play.

**Architecture:** A pure enumerator owns exact combinatorial board runouts and poker-hand comparisons. One module Web Worker executes the enumerator in cancellable batches; a poker-only hook reconciles jobs with live participants, board, and hand ID, and a small chart renders completed results. Existing tournament state, Hearts, and saved formats stay unchanged.

**Tech Stack:** Existing React 19, Vite 8, TypeScript ~5.9, Vitest 5, Testing Library, Workbox through `vite-plugin-pwa` 1.x; SVG graph, no chart dependency.

**Spec:** `docs/superpowers/specs/2026-09-25-holdem-showdown-equity-design.md`

## Global Constraints

- Hold’em is at `/offline-hearts/offline-texas-holdem/`; Hearts must be unchanged and continue loading existing saved games.
- No change to serialized `Tournament` version, poker betting/payout behavior, Hearts state, poker storage keys, or shared roster IDs.
- Percentages use actual hole cards of **every showdown participant**; only their hole cards and the phase-visible public board are removed from the candidate deck. Folded hands, burned cards and later board cards are unknown. Enumerate unordered future boards exactly once; tie winners split one unit equally; sum of shares is 1 before display rounding.
- Graph only a contested showdown. Pre-flop uses 0 board cards, flop 3, turn 4, river 5. River is the actual best-hand result; side-pot chip shares are separate.
- Start jobs at the beginning of a hand, invalidate and restart after a fold, enqueue new streets as they appear. All exact work happens in a cancellable module Worker. Showdown and Next Hand are never gated on equity.
- Worker assets must precache under the existing `/offline-hearts/` service-worker scope. No extra worker for Hearts, no online dependencies.

## Review Focus

1. **Privacy**: progress/graph must not reveal hole cards before showdown; the action screen still shows only its owner’s cards — Task 4 tests hidden gate and results conditional.
2. **Folded and burned cards**: their known engine values must not shrink candidate runouts — Task 1 literal count/candidate tests; Task 3 reconciler uses only showdown hole cards and board prefix.
3. **Stale progress/results**: a prior hand, participant group, or phase must not overwrite current results — Tasks 2–3 cancellation tests.
4. **Browser hangs / failure**: exact pre-flop jobs yield to cancellation, show progress, and report an error on unavailable worker without blocking Next Hand — Tasks 2–4 tests.
5. **Existing saves / nested offline URL**: changing only poker presentation cannot alter serialized state; generated worker URL must be precached and load offline — Task 5 build smoke and existing suite.

## File map and interfaces

```
src/poker/engine/equity.ts             pure input validation, iterator, exact accumulation
src/poker/engine/equity.test.ts        literal exact outcomes and runout math
src/poker/equity.protocol.ts          typed worker request/progress/result/error messages and job key
src/poker/equity.queue.ts             bounded cancellable enumeration, worker-free test seam
src/poker/equity.worker.ts            single cancellable queue, bounded batches
src/poker/equity.worker.test.ts       fake worker-message harness / progress and cancellation
src/poker/useEquity.ts                one worker per app mount; job scheduling and stale-reply guard
src/poker/useEquity.test.tsx          fold, street, hand, reload, unmount and error tests
src/poker/EquityChart.tsx             responsive SVG + text table, no external library
src/poker/EquityChart.test.tsx        labels, progress, exact values, accessibility
src/poker/PokerApp.tsx                showdown card rows, seat badges, copy and hook integration
src/poker/PokerApp.test.tsx           UI behavior / no leakage / Next Hand while pending
src/poker/poker.css                   yellow best-five border, badges and graph sizing
scripts/check-pages.mjs              worker asset precache check
README.md                            exact-equity cost and browser/offline checks
```

Use `src/shared/cards.ts` for `Card`, `cardId`, `newDeck`; `src/poker/engine/evaluate.ts` for `bestOfSeven` and `compareHands`; `src/poker/engine/seats.ts` `positions` for blind badges; `Tournament.handNumber`, `Tournament.id`, `Tournament.result.hands`, `Tournament.hand.board` for job identity and display. No additional stored state. Run focused tests in RED and GREEN, then `npm test && npm run build && node scripts/check-pages.mjs` before each commit.

---

### Task 1: Exact, resumable board enumerator

**Files:** Create `src/poker/engine/equity.ts`, `src/poker/engine/equity.test.ts`.

**Interfaces:** `EquityPlayer = {seat:number; hole:[Card,Card]}`; `EquityInput = {players:EquityPlayer[]; board:Card[]}` (board length 0/3/4/5); `EquityCursor = {indices:number[]; processed:number; shares:number[]; total:number; done:boolean}`; `createEquity(input): {cursor:EquityCursor; advance(maxRunouts:number):EquityCursor}`. `advance` processes up to `maxRunouts` *new* unordered boards and returns a fresh cursor; `cursor.shares[i]` corresponds to `players[i]` and counts fractional wins. Expose `runoutCount(available:number,missing:number):number` for tests/progress. Avoid sorting poker player seats or mutating inputs. Export `candidateCards(input):Card[]` for a direct folded/burned-card test; it returns all deck cards excluding only player holes and visible board.

- [ ] **Step 1: Write failing tests.** Construct cards using `parseCardId`, use real `bestOfSeven` comparisons. River board `['2C','3D','4H','8S','KC']`, players `['AS','AD']` and `['QS','QD']`: expect one runout, shares `[1,0]`; board `['10S','JS','QS','KS','AS']`, holes `['2C','3D']` and `['4C','5D']`: expect `[0.5,0.5]`. Turn board `['2C','3D','4H','8S']`, two known hole hands: expect `total=44` (52−4 hole−4 board), `processed=10` after `advance(10)`, 44 after finishing, shares sum exactly 44. Preflop 2 players `C(48,5)=1,712,304`, flop `C(45,2)=990`, turn 44, river 1. Add a candidate-deck test where a card known to be folded/burned from a *separate fixture* remains among the 44 turn runouts; do not pass folded/burned cards into the input. Reject duplicate IDs, board length 1/2, fewer than 2 players, duplicate seats, and invalid card ranks with `RangeError`.

```ts
const cards = (ids:string[]) => ids.map(parseCardId);
const players = [
  {seat:0, hole:cards(['AS','AD']) as [Card,Card]},
  {seat:1, hole:cards(['QS','QD']) as [Card,Card]},
];
const work = createEquity({players, board:cards(['2C','3D','4H','8S','KC'])});
expect(work.advance(1)).toMatchObject({total:1,processed:1,shares:[1,0],done:true});
expect(runoutCount(48,5)).toBe(1712304);
```

- [ ] **Step 2: Run** `npx vitest run src/poker/engine/equity.test.ts`; expect missing module/failed assertions.
- [ ] **Step 3: Implement** lexicographic combination-index increment over remaining candidate deck; initialize indices from zero through `missing - 1`, with empty combination for river. Each `advance` forms a completed board by concatenating visible cards and the candidate cards at those indices; evaluate all players using actual hole cards, award `1/winners.length`, then increment indices. Keep mutable iterator state private inside `createEquity` but return immutable snapshots. Validate known card IDs with `newDeck().map(cardId)` and compare `Set` cardinality. Use integer `total`/`processed`; no random sampling.
- [ ] **Step 4: Run** focused suite, `npm test && npm run build && node scripts/check-pages.mjs`, `git diff --check`; commit `feat(poker): enumerate exact showdown equity`.

### Task 2: Cancellable worker protocol

**Files:** Create `src/poker/equity.protocol.ts`, `src/poker/equity.queue.ts`, `src/poker/equity.worker.ts`, `src/poker/equity.worker.test.ts`.

**Interfaces:** `EquityPhase='preflop'|'flop'|'turn'|'river'`; `EquityJob={key:string; handId:string; phase:EquityPhase; players:EquityPlayer[]; board:Card[]}`; `EquityRequest={type:'start';job:EquityJob}|{type:'cancel';key:string}|{type:'cancelAll'}`; `EquityResponse={type:'progress';key:string;processed:number;total:number}|{type:'result';key:string;processed:number;total:number;shares:number[]}|{type:'error';key:string;message:string}`. `equityKey(handId,phase,players,board):string` includes tournament+hand ID, ordered seat IDs, visible board card IDs; never include folded hands. `createEquityQueue(send:(message:EquityResponse)=>void, schedule:(callback:()=>void)=>void,batchSize=256)` returns `{receive(message:EquityRequest):void,dispose():void}` so worker semantics can be tested in Vitest without a real browser Worker. Module entry attaches `self.onmessage` and uses `setTimeout(callback,0)` for yielding; batches of 256 runouts and **at most one running job**. Queue can hold four street jobs; cancelAll clears queue and running job before the next scheduled batch.

- [ ] **Step 1: Write failing tests** with fake `schedule` collecting callbacks: start river job, run scheduled callback, assert one exact `result`; start turn job, run one callback with a small injected batch size, assert `progress` then cancel, drain callbacks and assert no result; start group A then `cancelAll` and start group B, drain and assert only B reports results; invalid job produces `error`; `dispose` prevents further sends. Assert `equityKey('t1:1','flop',[{seat:0,hole:hole(['AS','AD'])},{seat:2,hole:hole(['QS','QD'])}],['2C','3D','4H'].map(parseCardId))` differs when changing hand/seat/board. Inject `batchSize=10` in queue factory for bounded tests.

```ts
const callbacks: Array<() => void> = [];
const sent: EquityResponse[] = [];
const hole = (ids:string[]) => ids.map(parseCardId) as [Card,Card];
const turnFixture: EquityJob = {
  handId:'t1:1',phase:'turn',players:[
    {seat:0,hole:hole(['AS','AD'])},{seat:1,hole:hole(['QS','QD'])},
  ],board:['2C','3D','4H','8S'].map(parseCardId),key:'turn-1',
};
const queue = createEquityQueue(message => sent.push(message), callback => callbacks.push(callback), 10);
queue.receive({type:'start',job:turnFixture});
callbacks.shift()!();
expect(sent.at(-1)).toMatchObject({type:'progress',key:turnFixture.key,processed:10,total:44});
queue.receive({type:'cancel',key:turnFixture.key});
while (callbacks.length) callbacks.shift()!();
expect(sent.some(message => message.type === 'result')).toBe(false);
```

- [ ] **Step 2: Run** `npx vitest run src/poker/equity.worker.test.ts`; expect missing module.
- [ ] **Step 3: Implement** protocol types and queue. For each scheduled callback check queue generation/key before running `advance`; report progress only for incomplete jobs and result on `done`. `cancel`/`cancelAll` invalidate in-flight callbacks. Wrap validation/enumeration in `try/catch` and send a plain error message. Put testable queue in `src/poker/equity.queue.ts`; make `src/poker/equity.worker.ts` only the module entry (`const queue=createEquityQueue(message=>postMessage(message),callback=>setTimeout(callback,0)); self.onmessage=e=>queue.receive(e.data)`). Tests import the queue, never the worker-entry side effects.
- [ ] **Step 4: Run** focused/full suite/build/page check/diff check; commit `feat(poker): calculate exact equity in cancellable worker`.

### Task 3: Orchestrate early jobs and ignore stale messages

**Files:** Create `src/poker/useEquity.ts`, `src/poker/useEquity.test.tsx`.

**Interfaces:** `useEquity(state:Tournament|null, createWorker:()=>Worker = () => new Worker(new URL('./equity.worker.ts',import.meta.url),{type:'module'}))` returns `Record<EquityPhase, {key:string; processed:number;total:number;shares:number[]|null;error:string|null} | null>`. The live group is derived from `state.hand.betting.seats` where `!folded`; at showdown use `state.result.hands` exclusively. Job hand ID = `${state.id}:${state.handNumber}`; pre-flop prefix `[]`, flop `board.slice(0,3)`, turn `slice(0,4)`, river `slice(0,5)`. Do not enqueue a street before its board prefix exists. Cache completed results by *exact* `equityKey`; a job for 8 players must not populate the 2-player graph. One worker allocated on mount, terminated on unmount. `createWorker` dependency injection allows fake Worker in tests.

- [ ] **Step 1: Tests** using a fake Worker that captures `postMessage` and emits callbacks: started hand enqueues preflop; fold changes live seats and emits cancelAll+new keyed jobs; flop/turn/river add corresponding jobs; on showdown reuses completed matching keys and starts missing points; stale progress and result for prior hand/participants/board ignored; worker `error` sets unfinished point’s error; absent Worker returns error state without throwing; unmount calls `terminate`. Test a saved showdown mounted directly schedules all four phase jobs. Assert no extra `Tournament` fields or `localStorage` keys are written by the hook. Use an actual `tournamentReducer(null,{type:'START',players:[{id:'a',name:'Ann'},{id:'b',name:'Bob'}],stack:100,bigBlind:10,id:'t1',seed:19})!` fixture for `startedTournament`; derive `foldedTournament` with `ACT` after `REVEAL`, not a partial fake. Define `makeFakeWorker()` in the test: `{sent:EquityRequest[],postMessage(message){this.sent.push(message)},onmessage:null,onerror:null,terminate(){this.terminated=true},terminated:false}`.

```tsx
const fake = makeFakeWorker();
const {result,rerender,unmount} = renderHook(({state}) => useEquity(state,()=>fake as unknown as Worker),
  {initialProps:{state:startedTournament}});
expect(fake.sent).toContainEqual(expect.objectContaining({type:'start',job:expect.objectContaining({phase:'preflop'})}));
rerender({state:foldedTournament});
expect(fake.sent).toContainEqual({type:'cancelAll'});
unmount();
expect(fake.terminated).toBe(true);
```

- [ ] **Step 2: Run** `npx vitest run src/poker/useEquity.test.tsx` (RED).
- [ ] **Step 3: Implement** `useEffect` owning worker lifecycle and another effect comparing desired keys to pending/completed keys; set stale state to null on hand/group change; use ref to read active keys in `onmessage` and ignore mismatches. On worker construction/message errors mark pending keys failed; never block render. Pass stable `createWorker` in app (module-level factory) so every React render does not terminate the worker. Cancel old jobs and only enqueue new phase jobs when enough board cards are visible.
- [ ] **Step 4: Run** focused/full suite/build/page check/diff check; commit `feat(poker): preload exact equity by hand and board`.

### Task 4: Showdown cards, seat badges, accessible graph and copy

**Files:** Create `src/poker/EquityChart.tsx`, `src/poker/EquityChart.test.tsx`; modify `src/poker/PokerApp.tsx`, `src/poker/PokerApp.test.tsx`, `src/poker/poker.css`.

**Interfaces:** `EquityChart({players:readonly {seat:number;name:string}[],points:ReturnType<typeof useEquity>})`. Graph y-axis 0–100%, x-axis four street names, one line per player with finished phases connected, and companion `<table>` per player/phase. In `PokerApp` call `useEquity(state,createWorker)` from a stable module-level factory; only render `EquityChart` for contested `result.kind==='showdown'` with >=2 hands. For card highlight, extend local `Cards({cards,highlighted?:ReadonlySet<string>})` and wrap each `CardView` in `span` class `poker-best-card` when `cardId` matches actual `entry.best.bestFive`. Do not add a yellow highlight to ordinary play or folded/uncontested cards.

- [ ] **Step 1: UI tests**: For a showdown fixture, assert each player's `Hole cards` two and `Community cards` five, exactly five highlighted wrappers per player; board-only best five highlights five board wrappers and zero hole wrappers; a one-hole-card best five highlights one hole and four board wrappers; best-five text names the actual cards. Assert 2-player heads-up dealer+SB and other BB, 3- and 8-player seats (eliminated seat never blind), and badges remain in result phase. Assert `Current round bet` labels in public seat row and action panel, `Bet to current round total` input, no visible `Street:`/`street bet`. EquityChart shows the four phase labels, 0/100 axis, names, exact percentages/table, “Calculating… 10 / 44” for pending, and worker error. For an uncontested result assert no hole/board best-five row and no graph; for a contested result with pending calculation assert Next Hand enabled and click works. Preserve privacy-gate tests. Use `tournamentReducer` and `saveVersioned(POKER_KEY,fixture)` to create a real persisted showdown fixture before rendering `PokerApp`; the test's `window.Worker` is replaced by a fake whose `postMessage` records requests without calculating 1.7M runouts.

```tsx
const result = render(<PokerApp />); // seed saved showdown via poker.tournament before render
const ann = screen.getByRole('region',{name:'Ann showdown'});
expect(within(ann).getByRole('group',{name:'Community cards'}).querySelectorAll('.poker-best-card')).toHaveLength(4);
expect(within(ann).getByRole('group',{name:'Hole cards'}).querySelectorAll('.poker-best-card')).toHaveLength(1);
```

- [ ] **Step 2: Run** `npx vitest run src/poker/PokerApp.test.tsx src/poker/EquityChart.test.tsx` (RED).
- [ ] **Step 3: Implement** seat badges using `positions` over the *hand’s participating seats*, not post-payout stacks (some winners/losers have changed stacks). A participant has `hand.hole[seat] !== null`, even if now eliminated. Build that participation mask with `stack: hole ? 1 : 0` for `positions`. Use SVG `viewBox="0 0 360 180"`, four x positions, linear y = `160-1.4*percent`, `polyline` per player from completed points, small circles with `<title>` for value, tick labels at 0/50/100, line legend, and the table below for exact values/error/progress. Use CSS `width:100%; max-width:100%`; distinct line stroke plus markers/legend and no reliance on color alone. Call `cardId` for highlight, and keep best-five label visible. Rename only UI strings; leave reducer and saves unchanged.
- [ ] **Step 4: Run** focused/full suite/build/page check/diff check; commit `feat(poker): mark showdown best five and chart exact equity`.

### Task 5: Build, offline and performance checks

**Files:** Modify `scripts/check-pages.mjs`, `README.md`; create `src/poker/engine/equity.bench.ts` (Node script or Vitest benchmark not run by normal suite); test `src/poker/offline.test.ts` only if build check alone cannot guard asset precaching.

**Interfaces:** Existing Vite emits module worker as a hashed asset referenced by poker JS. `scripts/check-pages.mjs` checks worker file exists and is listed in root `dist/sw.js` precache, that poker HTML still has exactly the poker manifest and worker path resolves under `/offline-hearts/assets/`, and both HTML pages load. `equity.bench.ts` runs full pre-flop enumeration for two and eight known hole-card players, prints runout totals, elapsed time, and correct share sum, never in `npm test` or CI unless explicitly requested. Document output and device caveat, not a promised time.

- [ ] **Step 1: Add failing build regression** in `scripts/check-pages.mjs`: after finding the poker entry JS URL in nested HTML, inspect its bundled code for `new Worker` and its hashed worker asset path; assert that path exists in `dist` and its URL is in the service worker precache. Temporarily change the checked worker filename in the script to a nonexistent value and run `node scripts/check-pages.mjs` to prove it fails, then restore and run the real check. Add an offline navigation procedure to README: `npm run preview`, load both pages online, switch DevTools Network offline, reload each; verify poker worker script is served and showdown remains usable. No physical iOS success claim without a device.
- [ ] **Step 2: Run** `npm run build && node scripts/check-pages.mjs`; if Worker bundling or precache fails, fix `vite.config.ts` Workbox glob patterns to include emitted worker `.js`, then rerun. Avoid copying the Worker script outside Vite output; its hashed asset must be precached.
- [ ] **Step 3: Benchmark** representative known hands: two-player `C(48,5)=1,712,304` runouts and eight-player `C(36,5)=376,992` runouts. Script uses `createEquity`, advances in chunks until done, logs `processed`, `total`, `performance.now()` elapsed and `sum(shares)/total`; document measured machine/runtime in README. Do not run the benchmark during normal test/build.
- [ ] **Step 4: Run** `npm test && npm run build && node scripts/check-pages.mjs && git diff --check`. Open a mobile viewport (375px) for eight-seat showdown and worker-progress layout if browser is available; otherwise state that check remains unverified. Commit `test(poker): verify offline worker and equity workload`.

---

## Final verification

- [ ] Run the full test suite and production build, `node scripts/check-pages.mjs`, and `git diff --check` after the last code change; confirm old Hearts tests and saved-tournament load tests still pass.
- [ ] Check `git status --short` and document any browser/iOS checks not performed; do not push, merge or publish without authorization.
