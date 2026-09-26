# Task 16 report — PWA, icons, iOS

## Outcome

Installed `vite-plugin-pwa` and `@vite-pwa/assets-generator`; generated the specified SVG, favicon, standard/maskable PWA icons and 180×180 Apple touch icon. Configured auto-updating service worker, standalone portrait manifest and app-shell precache under Vite base `/offline-hearts/`. Added iOS Home Screen meta tags and icon links.

## Verification

- `npm run build`: pass; `dist/manifest.webmanifest`, `dist/sw.js`, `dist/workbox-9c191d2f.js`, app shell and icons generated; Workbox reports 19 precache entries.
- `npm test`: pass, 20 files / 131 tests.
- `dist/index.html`: every `href` starts with `/offline-hearts/`, including the manifest and Apple touch icon. Manifest start URL and scope both `/offline-hearts/`.
- `sips`: PNG dimensions verified at 64, 192, 512, maskable 512, and Apple 180 pixels square.
- Headless Chrome against `npm run preview`: service worker controls the page. CDP offline network emulation blocks an uncached request while cached app shell returns HTTP 200. Offline navigation to `/offline-hearts/` renders the app with zero document transfer bytes.
- `git diff --check`: clean.

## Self-review / limitations

- Changes are limited to specified PWA files, generated icons and this report. No app code changes needed; existing Vite base was already correct.
- Workbox lists some icon precache URLs twice (from both glob and manifest/includeAssets), but generation succeeds and offline navigation works.
- Desktop browser integration was disconnected, so a real iOS Add to Home Screen/standalone launch was not tested. Headless Chrome confirms offline behavior, not actual iOS Safari installation.
- No new automated source test was added: the change is configuration plus generated assets; built-output inspection and browser offline check cover this task.
