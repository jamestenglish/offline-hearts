# Final review fix wave

## Outcome

- Payout clears/recomputes `allIn` from the awarded stack for showdown and uncontested results. A positive-stack all-in winner now survives snapshot validation and no longer displays “All in” on the result screen.
- The poker hook retains a valid pending big blind in page memory even when the settings write fails. The current hand keeps its original blinds; `NEXT_HAND` consumes the pending value. The editor stays open with a save warning for retry. Successful retry persists and clears the warning. Reload after an unwritten edit reverts to stored/default settings; unavailable storage produces the shared warning.
- Setup now has inline Add player through the existing shared roster hook and its name/duplicate validation. Manage players remains available.

## Evidence

- Red run: focused tests had six expected failures (payout flag, reload, missing pending-blind API/behavior, missing inline Add).
- Green focused: 44/44 after fixes; additional reload and recovery tests 34/34; inline duplicate assertion 16/16.
- Full suite: 257 tests across 30 files passed.
- `npm run build`: TypeScript and Vite/PWA build passed, two HTML entries and worker generated.
- `node scripts/check-pages.mjs`: both install pages, manifests, assets and worker precache checked.
- `git diff --check`: passed.

## Self-review and concerns

- Reviewed the patch for accidental changes outside poker, data migration, altered Hearts keys, loss of privacy gate and unsupported storage retry. No unrelated production edits.
- Existing already-invalid snapshots written before this payout fix remain subject to normal invalid-snapshot discard; this wave prevents future invalid payouts rather than attempting historical repair.
- Under storage failure an unwritten blind is intentionally page-session-only; reload loses that edit with the existing storage warning. No physical iOS Home Screen check in this environment.
