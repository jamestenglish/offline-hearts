# Hold’em Showdown Display and Exact Equity — Design Spec

Date: 2026-09-25

## Outcome and scope

Improve the existing offline pass-and-play Texas Hold’em app at `/offline-hearts/offline-texas-holdem/`. At showdown, show how each player’s actual best five cards are formed from their hole cards and the board, alongside an exact, street-by-street graph of each surviving player’s chance to make the strongest hand **against the actual hole cards of the other showdown players**. Showdown cards, actual winner, and payouts must be available immediately; probability calculation must not delay Next Hand. Keep Hearts behavior, storage, and page unchanged.

During play, mark dealer, small blind (SB), and big blind (BB) in the seat list. Replace visible “street bet” wording with “current round bet” without changing betting rules, reducer fields, or existing saved tournaments.

## What the percentages mean

- Graph only when at least two players reach showdown. Its players are exactly the players who reached that showdown, including all-in players. Folded players are never graphed.
- For a given showdown player and phase, use **all showdown players’ actual two-card hole hands**. Known public community cards at that phase are: pre-flop 0, flop first 3, turn first 4, river all 5. Treat every future community card as unknown, even if the saved game knows the eventually dealt board. Folded players’ hole cards and burned cards are **unknown**, not removed from the candidate deck.
- Remove from the 52-card candidate deck only showdown players’ hole cards and that phase’s visible public board. Enumerate each unordered choice of missing community cards exactly once. For each completed board, evaluate each showdown player’s best five of seven. The highest hand receives one unit of win share, split equally among tied highest hands. A player’s percentage is `100 * accumulatedWinShare / runoutCount`. Therefore the players’ shares sum to 100% (up to displayed rounding). This graph measures **best-hand chance**, not expected chip payout or side-pot eligibility.
- On the river there is exactly one possible completed board: the actual public board. Thus the river graph point reflects the actual best-hand result, with ties split equally. Display actual pot-specific winners and chip payouts separately, because an all-in player can have the best hand without winning every side pot.
- Store numerical shares at full precision in calculation results; round only for display. Display a percentage or “Calculating…” for every player at every phase, alongside progress `processed / total` for incomplete work. Do not display approximations as final percentages.

## Architecture and flow

Add a pure, testable equity enumerator in `src/poker/engine/equity.ts` which consumes showdown hands (`{ seat, hole: Card[2] }[]`) and visible board (`Card[]` of length 0, 3, 4, or 5) and returns accumulated win shares and exact runout counts. Validate distinct, deck-valid known cards and a completed seven-card hand for every evaluation. The calculation uses the existing `bestOfSeven` and `compareHands`, including equal-hand tie behavior; its tests exercise the enumerator directly with small known outcomes. Do not make poker engine rules depend on DOM APIs or the worker.

Put asynchronous orchestration in `src/poker/equity.worker.ts` (a module Web Worker). It processes unordered future-board combinations in bounded batches, sends progress between batches, and accepts cancellation keyed by hand ID, participating seat IDs, phase, and visible-board card IDs. Yield to the worker event loop between batches so cancellation/new-hand messages can be handled. No Monte Carlo sampling, random unknown-opponent hands, or opponents omitted from a multiway calculation. Use one worker for the poker app and terminate it when the app unmounts; do not create a worker for Hearts.

At each hand start, schedule pre-flop calculation for the currently live player group. On fold, cancel obsolete jobs and restart for the new group, including already-visible earlier phases. On flop and turn, enqueue their phase calculations for the current group; on river, enqueue the final exact point. At showdown, reconcile work against the final showdown group: cancel mismatched jobs, reuse any completed matching results, schedule missing points, and show the cards/winner/payouts **without waiting**. Since a calculation for eight players does not equal one for two players, never reuse a result across different participant lists. Late messages from cancelled or earlier-hand jobs are ignored. Next Hand is always usable, regardless of calculation progress.

An exact multi-player pre-flop enumeration can be expensive on an iPhone. Batching protects UI responsiveness but does **not** promise a short completion time. Report total runouts and progress honestly, never silently replace exhaustive enumeration with an estimate. If the worker fails or the browser cannot start it, leave the actual showdown usable and show a clear calculation error in place of unfinished points. Each new hand stops work for the old hand. The worker and code must be available offline as part of the existing PWA precache at the nested GitHub Pages URL.

Calculation results are presentation state, not tournament rules or chip accounting. An interrupted/reloaded tournament still resumes with hole cards hidden as before; any needed equity jobs are started again from its restored hand/board as appropriate. No change to serialized `Tournament` version, Hearts saves, poker payouts, or roster IDs is required.

## Showdown presentation

For each player in `result.hands`, retain the existing two-card **Hole cards** row. Beneath it show that player’s five-card **Community cards** row (the same board repeated under each player for clarity). Outline exactly the five cards in `entry.best.bestFive` across both rows with a visible yellow border. The selection comes from the evaluator’s actual card IDs, not a newly recomputed or guessed hand; a board-only best five highlights all five board cards, while a best five using one or two hole cards highlights the corresponding five cards across both rows. Keep an accessible text label (“Best five: …”) so color is not the sole cue. Show the hand name and actual winner/pot awards above the graph. Show the graph only for contested showdowns, never for uncontested fold wins, which still reveal no hole cards.

The graph has four x-axis labels (Pre-flop, Flop, Turn, River), a y-axis from 0 to 100%, one identified line per showdown player, and points for completed exact results. Use a mobile-width responsive chart without adding a heavy charting dependency; underneath provide a compact text table of the same percentages/progress for accessibility and color-blind users. Ensure names are associated with lines and table rows. Preserve the ability to proceed to the next hand while any point is calculating. Respect reduced-motion settings; do not require animations to read results.

## Seat and betting labels

Use the current hand’s blind positions, not the next-hand settings, when marking seats. Three or more active players: first active clockwise from dealer is SB and next active is BB; heads-up: dealer is SB and the other active player is BB. A seat may show both Dealer and SB. Include all badges during the hand and at its result screen. Do not mark eliminated players as posting a blind. Update seat contributions and action-panel copy from “Street”/“street bet” to **“Current round bet”**; clarify that the bet-to input is a total for this betting round, not extra chips. Keep the internal `streetBet` and `currentBet` fields for backward-compatible saved data.

## Testing and verification

- Exact calculation: known river winner and tie (100/0 and 50/50); turn enumeration with a hand-checkable remaining-card fixture; board-only tie; folded/burned cards remain candidate cards; every phase’s results sum to 100% before display rounding; no duplicate runouts; input validation.
- Worker/orchestration: progress batches and eventual exact totals; cancel on fold, new hand, and app unmount; reject stale replies with matching hand/participants/board keys; result of an eight-player job never appears on a two-player graph; worker failure leaves showdown and Next Hand usable. Benchmark exact pre-flop jobs with two and up to eight showdown players, and document runout count/time without claiming a guaranteed completion time.
- UI: two-player and multiway showdowns show hole cards, five board cards, and exactly five yellow-bordered cards per player; text best-five label; uncontested results still hide hands; 2-, 3-, and 8-player seat badges including heads-up Dealer+SB; current-round bet copy and amount semantics; percentage graph + accessible table; Next Hand works during calculation.
- Regression: all existing Hearts and poker tests, saved-tournament load, PWA build output and nested offline URL. Run `npm test`, `npm run build`, and `node scripts/check-pages.mjs`. Verify worker asset precaching and navigation offline in a browser at phone width if available; report any unverified physical iOS behavior explicitly.
