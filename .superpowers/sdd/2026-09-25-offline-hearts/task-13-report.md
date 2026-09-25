# Task 13 — gameplay screens

## Status

Implemented Deal, Pass, Lead, Play, and Trick Result screens on `init`.

## TDD evidence

- RED: `npx vitest run src/screens/gameplay.test.tsx` exited 1; Vite failed to resolve `./DealScreen` (screens did not exist yet).
- GREEN: same focused command exited 0, **10/10 tests passed**.
- Full suite: `npm test` exited 0, **19 files / 116 tests passed**.
- Build: `npm run build` exited 0 (`tsc --noEmit && vite build`).
- `git diff --check` exited 0.

## Self-review

- Privacy: no hand appears in a hidden Pass/Play view; selection components unmount on handoff, with keyed remount per passer/turn.
- Passing: fourth card cannot be selected, and finalize stays disabled until three are selected; selection sends three card IDs.
- Playing: illegal cards are disabled; choosing a legal card raises it without dispatching until explicit Play confirmation.
- Deal timer: effect cleanup cancels pending timer; completion ref prevents duplicate callbacks during StrictMode effect replay.
- Trick result: last trick and winner shown; final trick navigates to round results.

## Concerns

None identified within Task 13. These screens are exported for the app wiring task; this task does not connect them to `App`.

## Commit

`feat(ui): add gameplay screens` (hash recorded in task response).
