import { createEquity, type EquityCursor } from './engine/equity';
import type { EquityJob, EquityRequest, EquityResponse } from './equity.protocol';

const BOARD_LENGTH = { preflop: 0, flop: 3, turn: 4, river: 5 } as const;
const MAX_JOBS = 4;
const PRIORITY = { river: 0, turn: 1, flop: 2, preflop: 3 } as const;
const MAX_WAIT_BATCHES = 4;
type Work = { job: EquityJob; work?: ReturnType<typeof createEquity>; waited: number };

export function createEquityQueue(
  send: (message: EquityResponse) => void,
  schedule: (callback: () => void) => void,
  batchSize = 256,
): { receive(message: EquityRequest): void; dispose(): void } {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) throw new RangeError('batchSize must be positive');

  const pending: Work[] = [];
  let active: Work | undefined;
  let generation = 0;
  let disposed = false;

  function pick(): Work {
    let chosen = 0;
    for (let i = 1; i < pending.length; i++) {
      const candidate = pending[i];
      const best = pending[chosen];
      const candidateOverdue = candidate.waited >= MAX_WAIT_BATCHES;
      const bestOverdue = best.waited >= MAX_WAIT_BATCHES;
      if (candidateOverdue && !bestOverdue
        || candidateOverdue && bestOverdue && candidate.waited > best.waited
        || !candidateOverdue && !bestOverdue && PRIORITY[candidate.job.phase] < PRIORITY[best.job.phase]) chosen = i;
    }
    return pending.splice(chosen, 1)[0];
  }

  function next(): void {
    if (disposed || active || pending.length === 0) return;
    active = pick();
    scheduleBatch();
  }

  function scheduleBatch(): void {
    const version = generation;
    schedule(() => {
      if (disposed || !active || generation !== version) return;
      const current = active;
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
      for (const waiting of pending) waiting.waited++;
      if (cursor.done) {
        active = undefined;
        send({ type: 'result', key: job.key, processed: cursor.processed, total: cursor.total, shares: cursor.shares });
        next();
      } else {
        send({ type: 'progress', key: job.key, processed: cursor.processed, total: cursor.total });
        if (active === current && !disposed) {
          active = undefined;
          current.waited = 0;
          pending.push(current);
          next();
        }
      }
    });
  }

  return {
    receive(message) {
      if (disposed) return;
      if (message.type === 'start') {
        for (let index = pending.length - 1; index >= 0; index--) {
          if (pending[index].job.key === message.job.key) pending.splice(index, 1);
        }
        // Preserve the running cursor; limit pending work to the most recent four jobs.
        if (pending.length >= MAX_JOBS - (active ? 1 : 0)) pending.shift();
        pending.push({ job: message.job, waited: 0 });
        if (active?.work && pending.some(item => PRIORITY[item.job.phase] < PRIORITY[active!.job.phase])) {
          pending.push(active);
          active = pick();
        }
        next();
      } else if (message.type === 'cancel') {
        for (let index = pending.length - 1; index >= 0; index--) {
          if (pending[index].job.key === message.key) pending.splice(index, 1);
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
