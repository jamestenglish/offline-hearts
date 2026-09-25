import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = '/offline-hearts/';

export function checkPages(distDir) {
  const hearts = readFileSync(join(distDir, 'index.html'), 'utf8');
  const poker = readFileSync(join(distDir, 'offline-texas-holdem/index.html'), 'utf8');
  const worker = readFileSync(join(distDir, 'sw.js'), 'utf8');
  assert.match(hearts, /<title>Offline Hearts<\/title>/);
  assert.match(poker, /<title>Offline Texas Hold’em<\/title>/);

  function urls(page) {
    return [...page.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(match => match[1]);
  }
  const manifests = page => [...page.matchAll(/<link\s+rel="manifest"\s+href="([^"]+)"\s*\/?\s*>/g)].map(match => match[1]);
  assert.deepEqual(manifests(hearts), [`${base}manifest.webmanifest`]);
  assert.deepEqual(manifests(poker), [`${base}offline-texas-holdem/poker.webmanifest`]);
  assert.doesNotMatch(poker, /registerSW\.js/);

  for (const [name, page] of [['Hearts', hearts], ['Poker', poker]]) {
    const pageUrls = urls(page);
    assert.ok(pageUrls.some(url => url.startsWith(`${base}assets/`)), `${name}: missing built assets`);
    for (const url of pageUrls) {
      assert.ok(url.startsWith(base), `${name}: URL outside project base: ${url}`);
      assert.ok(existsSync(join(distDir, url.replace(base, ''))), `${name}: missing ${url}`);
    }
  }

  const precache = [...worker.matchAll(/\{url:"([^"]+)",revision:/g)].map(match => match[1].replace(/^\.\//, ''));
  for (const path of ['index.html', 'offline-texas-holdem/index.html', 'manifest.webmanifest', 'offline-texas-holdem/poker.webmanifest']) {
    assert.ok(precache.includes(path), `SW does not precache ${path}`);
  }
  for (const page of [hearts, poker]) {
    for (const url of urls(page).filter(url => url.includes('/assets/'))) {
      assert.ok(precache.includes(url.slice(base.length)), `SW does not precache ${url}`);
    }
  }
  // With navigateFallback disabled, Workbox's precache route must accept clean nested navigation.
  assert.match(worker, /e\.precacheAndRoute\(/);
  assert.doesNotMatch(worker, /NavigationRoute/);
  const workboxFile = `${worker.match(/workbox-[\w-]+/)?.[0]}.js`;
  assert.ok(workboxFile, 'SW does not load Workbox');
  assert.match(readFileSync(join(distDir, workboxFile), 'utf8'), /directoryIndex:\w+="index\.html"/, 'Workbox must map /offline-texas-holdem/ navigation to its precached index.html');
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkPages(resolve(process.argv[2] ?? 'dist'));
  console.log('Both install pages, manifests, assets and worker precache checked.');
}
