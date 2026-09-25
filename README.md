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

To verify offline navigation on desktop: run `npm run build && npm run preview`, open both preview URLs at `/offline-hearts/` and `/offline-hearts/offline-texas-holdem/`, and wait for the root service worker to become activated in DevTools → Application → Service Workers. In DevTools → Network choose **Offline**, reload each URL (including the nested path without `index.html`) and confirm each game renders, with no network errors for its scripts, styles, manifest, or icons. Disable Offline when done. Vite's development server is not an offline-install test; use preview of a production build. Physical iOS Home Screen installation requires a device and HTTPS deployment.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages.
One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
If the repository is not named `offline-hearts`, change `base` in `vite.config.ts` to match.
