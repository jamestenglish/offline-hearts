# Task 4 — trick rules report

## RED

- Added `src/engine/rules.test.ts` before implementation, covering opening lead, following suit, first-trick points, void hands, leading hearts, winner, points, and finding the 2♣.
- Ran `npx vitest run src/engine/rules.test.ts`: exit 1, failed to resolve `./rules` because `src/engine/rules.ts` did not exist. No tests ran; this was the expected missing-module failure specified by the brief.

## GREEN

- Added `src/engine/rules.ts` with `TrickCard`, `Trick`, `PlayContext`, `legalPlays`, `trickWinner`, `trickPoints`, and `findTwoOfClubs`.
- Ran `npx vitest run src/engine/rules.test.ts`: 12/12 tests passed. The provided brief has 11 test cases despite saying 11 expected after its sample; the twelfth tests the specified `-1` result when no hand has the 2♣.
- Ran `npm test`: 26/26 tests passed across 4 files.
- Ran `npm run build`: TypeScript and Vite build succeeded.
- Ran `git diff --check`: exit 0.

## Self-review

- Confirmed legal-play branches preserve hand order, return a copied array for unrestricted plays, and return at least one card when hand is nonempty under the stated inputs.
- Confirmed trick winner ignores off-suit high cards and returns the seat associated with the highest led-suit rank. Point count delegates to `cardPoints`.
- No unrelated files modified. `trickWinner` assumes a nonempty trick, as in the brief; no behavior is specified for an empty trick.
