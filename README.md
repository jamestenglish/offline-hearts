# Offline Hearts

Pass-and-play Hearts for four players on one device. Installable to the iOS Home Screen and fully playable offline.

## Play

Open https://jamestenglish.github.io/offline-hearts/ in Safari, tap **Share → Add to Home Screen**, then launch it from the Home Screen. After the first load it works without a connection.

## Develop

    npm install
    npm run dev      # http://localhost:5173/offline-hearts/
    npm test
    npm run build    # static site in dist/

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages.
One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
If the repository is not named `offline-hearts`, change `base` in `vite.config.ts` to match.
