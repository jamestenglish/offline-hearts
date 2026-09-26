# Offline Hearts

Pass-and-play Hearts for four players and Texas Hold’em for two to eight players on one device. Each game is independently installable and works offline after its first load.

## Play

Open either game in Safari, tap **Share → Add to Home Screen**, then launch it from the Home Screen:

- Hearts: https://jamestenglish.github.io/offline-hearts/
- Texas Hold’em: https://jamestenglish.github.io/offline-hearts/offline-texas-holdem/

The apps have separate install manifests and icons but share one root-scope service worker. Both games share the player roster; their saved games remain separate. Visit each page online once before going offline.

## Develop

    npm install
    npm run dev      # http://localhost:5173/offline-hearts/
                     # http://localhost:5173/offline-hearts/offline-texas-holdem/
    npm test
    npm run build    # static site in dist/
    node scripts/check-pages.mjs # inspect built page URLs and offline precache

To verify offline navigation on desktop: run `npm run build && npm run preview`, load both preview URLs at `/offline-hearts/` and `/offline-hearts/offline-texas-holdem/` while online, and wait for the root service worker to become activated in DevTools → Application → Service Workers. In DevTools → Network choose **Offline**, reload each URL (including the nested path without `index.html`) and confirm each game renders, with no network errors for its scripts, styles, manifest, or icons. In poker, reach showdown with known hole cards: check that the hashed `equity.worker-*.js` request is served offline, progress updates, and the equity result remains usable. Disable Offline when done. Vite's development server is not an offline-install test; use preview of a production build. The 375px eight-seat showdown and worker-progress layout has not been visually verified. Physical iOS Home Screen installation requires a device and HTTPS deployment.

Exact preflop equity workload (explicit only, never part of `npm test` or CI): `node --experimental-strip-types src/poker/engine/equity.bench.ts`. With fixed known hole cards, this enumerates every board in chunks of 1,000 and prints processed/total runouts, elapsed milliseconds, and `sum(shares)/total`. Measured locally on an Apple M4 Max, Node v26.7.0: two players, 1,712,304/1,712,304 runouts in 35,859.1 ms, share ratio 1; eight players, 376,992/376,992 runouts in 31,081.8 ms, share ratio 1. These are desktop Node measurements using Vite's TypeScript module loader, not mobile Web Worker timings; performance varies by device and workload. No physical iOS result is implied.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages.
One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
If the repository is not named `offline-hearts`, change `base` in `vite.config.ts` to match.
