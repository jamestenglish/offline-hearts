import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('poker install entry', () => {
  it('has a separate nested page with only its own manifest', () => {
    const page = readFileSync(resolve('offline-texas-holdem/index.html'), 'utf8');
    expect(page).toContain('<title>Offline Texas Hold’em</title>');
    expect(page.match(/rel="manifest"/g)).toHaveLength(1);
    expect(page).toContain('/offline-hearts/offline-texas-holdem/poker.webmanifest');
    expect(page).not.toContain('manifest.webmanifest');
  });

  it('has a separate nested install scope and icons', () => {
    const manifest = JSON.parse(readFileSync(resolve('public/offline-texas-holdem/poker.webmanifest'), 'utf8'));
    expect(manifest.name).toBe('Offline Texas Hold’em');
    expect(manifest.start_url).toBe('/offline-hearts/offline-texas-holdem/');
    expect(manifest.scope).toBe('/offline-hearts/offline-texas-holdem/');
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) expect(existsSync(resolve('public/offline-texas-holdem', icon.src))).toBe(true);
  });

  it('registers the root worker without a nested worker', () => {
    const main = readFileSync(resolve('src/poker/main.tsx'), 'utf8');
    expect(main).toContain('navigator.serviceWorker.register');
    expect(main).toContain('import.meta.env.BASE_URL');
    expect(main).not.toContain('virtual:pwa-register');
  });
});
