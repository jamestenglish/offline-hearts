// Explicit-only benchmark: node --experimental-strip-types src/poker/engine/equity.bench.ts
// Vite loads the existing extensionless TypeScript imports; this file is not a Vitest test.
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';
import type { Card } from '../../shared/cards';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { createEquity } = await server.ssrLoadModule('./src/poker/engine/equity.ts') as typeof import('./equity');
  const { parseCardId } = await server.ssrLoadModule('./src/shared/cards.ts') as typeof import('../../shared/cards');
  const cards = (ids: [string, string]): [Card, Card] => ids.map(parseCardId) as [Card, Card];
  const hands: [string, string][] = [
    ['AS', 'AD'], ['QS', 'QD'], ['KC', 'KD'], ['JH', 'JD'],
    ['10C', '10D'], ['9H', '9S'], ['8C', '8D'], ['7H', '7S'],
  ];

  for (const count of [2, 8]) {
    const work = createEquity({
      players: hands.slice(0, count).map((hole, seat) => ({ seat, hole: cards(hole) })),
      board: [],
    });
    const start = performance.now();
    let cursor = work.cursor;
    while (!cursor.done) cursor = work.advance(1_000);
    const elapsedMs = performance.now() - start;
    const shareSum = cursor.shares.reduce((sum, share) => sum + share, 0);
    const shareRatio = shareSum / cursor.total;
    console.log(`${count} players: processed=${cursor.processed} total=${cursor.total} elapsedMs=${elapsedMs.toFixed(1)} sum(shares)/total=${shareRatio}`);
    if (Math.abs(shareRatio - 1) > 1e-9) throw new Error(`${count}-player shares do not sum to total`);
  }
} finally {
  await server.close();
}
