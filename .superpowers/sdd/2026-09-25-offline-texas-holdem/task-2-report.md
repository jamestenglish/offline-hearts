# Task 2 — poker hand evaluation

## Result

Implemented `evaluateFive`, `bestOfSeven`, and `compareHands` with numeric hand categories, ordered tiebreaks, five-card selections, and suit-independent comparisons. `bestOfSeven` enumerates all 21 combinations in input order and preserves the first on a tie.

## RED / GREEN

- RED: `npx vitest run src/poker/engine/evaluate.test.ts` — exit 1; failed to resolve `./evaluate` (evaluator absent). Corrected an equal-choice test fixture before implementation because the original cards inadvertently formed a full house.
- GREEN: `npx vitest run src/poker/engine/evaluate.test.ts` — 1 file, 22 tests passed.
- Full: `npm test` — 23 files, 171 tests passed. Vitest emitted a non-failing jsdom creation/performance advisory.
- Build: `npm run build` — TypeScript and Vite build succeeded.
- `git diff --check` — exit 0.

## Files

- `src/poker/engine/evaluate.ts` — evaluator, comparison, and best-five selection.
- `src/poker/engine/evaluate.test.ts` — literal category/tiebreak fixtures, wheel and royal, ranking/tie scenarios, seven-card selection, input size checks.
- `.superpowers/sdd/2026-09-25-offline-texas-holdem/task-2-report.md` — this report.

## Self-review / concerns

- Reviewed category precedence, wheel versus ace-high straight, lexicographic kickers, deterministic equal-scoring selections, and five-card identity; no known correctness issue for valid distinct cards.
- The evaluator checks hand length but assumes valid, distinct cards from the shared deck; validation of malformed or repeated cards was not requested.
