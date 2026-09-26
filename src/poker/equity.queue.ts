import { createEquity, type EquityCursor } from './engine/equity';
import type { EquityJob, EquityRequest, EquityResponse } from './equity.protocol';

const BOARD_LENGTH = { preflop: 0, flop: 3, turn: 4, river: 5 } as const;

export function createEquityQueue(
  send: (message: EquityResponse) => void,
  schedule: (callback: () => void) => void,
  batchSize = 256,
): { receive(message: EquityRequest): void; dispose(): void } {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) throw new RangeError('batchSize must be positive');

  const pending: EquityJob[] = [];
  let active: { job: EquityJob; work?: ReturnType<typeof createEquity> } | undefined;
  let generation = 0;
  let disposed = false;

  function next(): void {
    if (disposed || active || pending.length === 0) return;
    active = { job: pending.shift()! };
    scheduleBatch();
  }

  function scheduleBatch(): void {
    const current = active!;
    const version = generation;
    schedule(() => {
      if (disposed || active !== current || generation !== version) return;
      const { job } = current;
      let cursor: EquityCursor;
      try {
        if (job.board.length !== BOARD_LENGTH[job.phase]) throw new RangeError('Invalid phase or board length');
        current.work ??= createEquity({ players: job.players, board: job.board });
        cursor = current.work.advance(batchSize);
      } catch (error) {
        if (active !== current || disposed) return;
        active = undefined;
        send({ type: 'error', key: job.key, message: error instanceof Error ? error.message : String(error) });
        next();
        return;
      }
      if (active !== current || disposed) return;
      if (cursor.done) {
        active = undefined;
        send({ type: 'result', key: job.key, processed: cursor.processed, total: cursor.total, shares: cursor.shares });
        next();
      } else {
        send({ type: 'progress', key: job.key, processed: cursor.processed, total: cursor.total });
        if (active === current && !disposed) scheduleBatch();
      }
    });
  }

  return {
    receive(message) {
      if (disposed) return;
      if (message.type === 'start') {
        pending.push(message.job);
        next();
      } else if (message.type === 'cancel') {
        for (let index = pending.length - 1; index >= 0; index--) {
          if (pending[index].key === message.key) pending.splice(index, 1);
        }
        if (active?.job.key === message.key) {
          active = undefined;
          generation++;
        }
        next();
      } else {
        pending.length = 0;
        active = undefined;
        generation++;
      }
    },
    dispose() {
      disposed = true;
      pending.length = 0;
      active = undefined;
      generation++;
    },
  };
}
