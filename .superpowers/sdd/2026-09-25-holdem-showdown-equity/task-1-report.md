# Task 1 report — exact board enumerator

## Outcome

Implemented lexicographic enumeration of unordered boards with private, resumable iterator state and copied cursor snapshots. Awarded equity via `bestOfSeven` and `compareHands`, retaining player input order. Excluded only visible board and participating hole cards from candidate deck.

## TDD evidence

- RED: `npx vitest run src/poker/engine/equity.test.ts` exited 1: failed to resolve `./equity` (module did not yet exist).
- GREEN: same command exited 0: 1 file, 7 tests passed.
- After test-fixture correction: focused command exited 0: 1 file, 7 tests passed.

## Verification

- `npm test`: 31 files, 264 tests passed (after final test edit); Vitest printed its informational jsdom initialization performance hint.
- `npm run build`: passed (`tsc --noEmit` and Vite build). Initial attempt failed TS2352 for a test fixture's explicit invalid-rank cast; changed fixture to `parseCardId('1C')` and reran successfully.
- `node scripts/check-pages.mjs`: passed, both install pages, manifests, assets, and worker precache checked.
- `git diff --check`: passed. New source/test files checked for whitespace on staging.

## Files

- `src/poker/engine/equity.ts`
- `src/poker/engine/equity.test.ts`

## Self-review / concerns

- Preflop is tested for exact combinatorial count but not fully evaluated; processing all 1,712,304 runouts using `bestOfSeven` per player can be expensive, so callers should advance in bounded batches.
- Cursor snapshots are independently copied; the cursor object/arrays are not runtime-frozen, so a caller can edit its own snapshot without affecting the iterator.
