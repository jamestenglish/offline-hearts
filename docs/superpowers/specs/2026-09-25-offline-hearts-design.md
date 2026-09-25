# Offline Hearts — Design Spec

Date: 2026-09-25

## Goal

A pass-and-play Hearts game for 4 players on one device, installable to the iOS Home Screen and fully usable offline. Built with React + Vite (TypeScript), compiled to static assets hosted on GitHub Pages.

## Decisions

| Topic | Decision |
|---|---|
| Game length | Fixed 4 rounds: pass left, right, across, then no pass. Lowest total wins (ties allowed). |
| Rules | Standard (see Rules). |
| Persistence | Autosave full state to localStorage after every action; resume on reopen. |
| Look | Classic green felt, CSS-rendered white cards (no image assets), portrait, iPhone-first. |
| Architecture | Pure TS engine + `useReducer` + `vite-plugin-pwa`. |

## Rules

1. Holder of 2♣ must lead it on the first trick of each round.
2. Players must follow the led suit if able.
3. First trick: no hearts and no Q♠ may be played unless the player holds nothing else.
4. Hearts may not be led until hearts are broken (a heart has been played), unless the leader holds only hearts.
5. Scoring: each heart = 1, Q♠ = 13 (26 per round).
6. Shooting the moon: if one player takes all 26, that player scores 0 and each other player scores 26.
7. Trick winner is the highest card of the led suit (A high). Winner leads next trick.
8. Perfect game: a player whose total after 4 rounds is 0.

## Architecture

```
src/
  engine/            pure TS, no React
    cards.ts         Card type, deck, shuffle(rng), rank compare, card points
    sort.ts          hand sort: suits alternate red/black, high→low within suit
    rules.ts         legalPlays, trickWinner
    passing.ts       passDirection(round), passTarget(seat, round), applyPasses
    scoring.ts       roundPoints, shoot-the-moon adjust, perfect-game check
    game.ts          GameState, Action, reducer
  state/
    useGame.ts       useReducer + localStorage load/save (versioned)
  components/        Card, Hand, TrickArea, Scoreboard, PrivacyScreen, Celebration
  screens/           Setup, Deal, Pass, LeadAnnounce, Play, TrickResult, RoundSummary, GameOver
  App.tsx            screen by state.phase
```

### Card model

`{ suit: 'C'|'D'|'S'|'H', rank: 2..14 }`, id string like `"QS"`.

### Hand sort

Determine suits present in the hand. Choose an ordering of those suits that alternates colors (red: H, D; black: S, C) whenever possible, with preferred base order ♠ ♥ ♣ ♦. Within each suit, sort rank high → low. Examples: all four → ♠♥♣♦; only ♥♦♣ → ♥♣♦; only ♥♦ → ♥♦.

### GameState (serializable)

```ts
{
  version: 1,
  players: string[4],          // seat 0..3 clockwise
  round: 0..3,
  phase: 'setup'|'dealing'|'passing'|'leadAnnounce'|'playing'|'trickResult'|'roundSummary'|'gameOver',
  hands: Card[][4],
  received: CardId[][4],       // cards received in passing (highlighted)
  passSelections: (CardId[]|null)[4], // finalized selections
  passer: 0..3,                // whose turn to select pass
  current: 0..3,               // whose turn to play
  handRevealed: boolean,       // privacy gate
  trick: { leader: number, cards: {seat, card}[] },
  lastTrick: { winner, cards, points } | null,
  trickNumber: 0..12,
  heartsBroken: boolean,
  taken: number[4],            // points taken this round
  roundScores: number[4][],    // per completed round, after moon adjustment
  totals: number[4],
  moonShooter: number|null,    // for the latest round
}
```

### Actions

`START_GAME(names, seed?)`, `DEAL_DONE`, `REVEAL_HAND`, `FINALIZE_PASS(cardIds)`, `PLAY_CARD(cardId)`, `ACK_TRICK`, `NEXT_ROUND(seed?)`, `PLAY_AGAIN`, `NEW_GAME`.

To keep the reducer pure, shuffling uses a seeded PRNG (mulberry32); the UI dispatches `START_GAME`/`NEXT_ROUND`/`PLAY_AGAIN` with a random seed, tests pass fixed seeds.

Pending selection (raised card / 3 pass cards) is component state, not persisted. The reducer validates every action and returns the unchanged state for illegal ones.

### Phase flow

```
setup → dealing → passing (rounds 0–2) → leadAnnounce → playing ⇄ trickResult → roundSummary → dealing | gameOver
```

Round 3 skips passing. Every player handoff sets `handRevealed=false`, so a reload never exposes a hand.

## Screens

1. **Setup** — 4 name inputs (defaults Player 1–4), Start Game. If a saved in-progress game exists on launch, show a Resume / New Game choice first. A small "New Game" control is also available during play (with confirm).
2. **Deal** — ~1.5s animation of card backs flying from center to 4 seats (staggered CSS transforms), then `DEAL_DONE`.
3. **Pass** — per player: privacy screen "Pass the device to X" + "Show X's hand". Header "Pass 3 cards left → Y". Tap toggles raise; max 3. "Finalize Selection" enabled at exactly 3. After finalize: hand hidden, "Pass the device to <next>". After all 4, passes applied simultaneously; received cards highlighted when each player next views.
4. **LeadAnnounce** — "X has the 2♣ and leads. Pass the device to X."
5. **Play** — table with 4 names around the edge and round points taken; center trick area shows each played card in front of its player's name. Privacy screen "See X's cards". Hand at bottom; unplayable cards dimmed (~40%) and not tappable. Tap raises card ~20px and shows "Play <card>" button; tapping another switches. On confirm: card placed in the center, hand hidden, "Pass the device to <next>".
6. **TrickResult** — full trick shown; "Y wins the trick (+N). Pass the device to Y." Continue.
7. **RoundSummary** — round points and running totals per player; moon celebration 🌙🚀 + banner if applicable. "Next Round (pass right)" etc.
8. **GameOver** — final standings, winner(s); perfect-game celebration 🎉💯✨ if any player has 0; Play Again (same names) / New Players.

### Celebration

~40 emojis burst from the bottom with random x offset, rotation, scale and delay; float up and fade over ~2.5s. Pure CSS keyframes; `pointer-events: none`.

## PWA / iOS

- `vite-plugin-pwa`, `registerType: 'autoUpdate'`, precache all build output.
- Manifest: `display: standalone`, `orientation: portrait`, green theme/background, icons 192/512 PNG + 180 apple-touch-icon.
- Meta: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `viewport-fit=cover`; safe-area insets in CSS.
- `touch-action: manipulation`, `user-select: none` on game UI.

## Deployment

- `vite.config` `base: '/offline-hearts/'`.
- GitHub Actions `.github/workflows/deploy.yml` on push to `main`: install → test → build → `actions/deploy-pages`.
- No router; single page.

## Error handling

- Saved state with missing/mismatched `version` or parse failure is discarded → Setup.
- Illegal actions are ignored by the reducer.

## Testing

- Vitest unit tests for engine: deck (52 unique, 13 each), sort alternation, all `legalPlays` rules, trick winner, pass targets and application, scoring incl. moon and perfect detection.
- Full-game simulation with seeded RNG through the reducer (always first legal card): each round sums to 26 (or moon-adjusted 78), game ends after round 4.
- React Testing Library smoke test: setup → start → pass screen appears.
