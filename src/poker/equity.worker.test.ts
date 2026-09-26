import { describe, expect, it } from 'vitest';
import { parseCardId, type Card } from '../shared/cards';
import { createEquityQueue } from './equity.queue';
import { equityKey, type EquityJob, type EquityResponse } from './equity.protocol';

const cards = (ids: string[]) => ids.map(parseCardId);
const hole = (ids: string[]) => cards(ids) as [Card, Card];
const players = [
  { seat: 0, hole: hole(['AS', 'AD']) },
  { seat: 1, hole: hole(['QS', 'QD']) },
];
const river: EquityJob = {
  handId: 't1:1', phase: 'river', players,
  board: cards(['2C', '3D', '4H', '8S', 'KC']), key: 'river-1',
};
const turn: EquityJob = {
  ...river, phase: 'turn', board: cards(['2C', '3D', '4H', '8S']), key: 'turn-1',
};

function harness(batchSize = 10) {
  const callbacks: Array<() => void> = [];
  const sent: EquityResponse[] = [];
  const queue = createEquityQueue(message => { sent.push(message); }, callback => { callbacks.push(callback); }, batchSize);
  const drain = () => {
    while (callbacks.length) callbacks.shift()!();
  };
  return { callbacks, sent, queue, drain };
}

describe('cancellable equity queue', () => {
  it('emits one exact river result and no progress for a finished job', () => {
    const { callbacks, sent, queue } = harness();
    queue.receive({ type: 'start', job: river });
    callbacks.shift()!();
    expect(sent).toEqual([{ type: 'result', key: 'river-1', processed: 1, total: 1, shares: [1, 0] }]);
  });

  it('yields after a turn batch and cancels before the next one', () => {
    const { callbacks, sent, queue, drain } = harness();
    queue.receive({ type: 'start', job: turn });
    callbacks.shift()!();
    expect(sent).toEqual([{ type: 'progress', key: 'turn-1', processed: 10, total: 44 }]);
    expect(callbacks).toHaveLength(1);
    queue.receive({ type: 'cancel', key: 'turn-1' });
    drain();
    expect(sent).toEqual([{ type: 'progress', key: 'turn-1', processed: 10, total: 44 }]);
  });

  it('cancels queued and running jobs without suppressing later jobs', () => {
    const { sent, queue, drain } = harness();
    queue.receive({ type: 'start', job: turn });
    queue.receive({ type: 'start', job: { ...river, key: 'old-queued' } });
    queue.receive({ type: 'cancelAll' });
    queue.receive({ type: 'start', job: { ...river, key: 'new' } });
    drain();
    expect(sent).toEqual([{ type: 'result', key: 'new', processed: 1, total: 1, shares: [1, 0] }]);
  });

  it('runs queued jobs in order, one at a time', () => {
    const { sent, queue, drain } = harness();
    queue.receive({ type: 'start', job: river });
    queue.receive({ type: 'start', job: { ...river, key: 'second' } });
    drain();
    expect(sent.map(message => message.key)).toEqual(['river-1', 'second']);
  });

  it('keeps the running job and only the three newest pending jobs when starts exceed four', () => {
    const { sent, queue, drain } = harness();
    for (let index = 0; index < 7; index++) {
      queue.receive({ type: 'start', job: { ...river, key: `job-${index}` } });
    }
    drain();
    expect(sent.map(message => message.key)).toEqual(['job-0', 'job-4', 'job-5', 'job-6']);
  });

  it('coalesces repeated pending keys so only their newest job runs', () => {
    const { sent, queue, drain } = harness();
    queue.receive({ type: 'start', job: { ...river, key: 'active' } });
    queue.receive({ type: 'start', job: { ...river, key: 'repeat', board: cards(['AS', '3D', '4H', '8S', 'KC']) } });
    queue.receive({ type: 'start', job: { ...river, key: 'other' } });
    queue.receive({ type: 'start', job: { ...river, key: 'repeat' } });
    drain();
    expect(sent.map(message => [message.type, message.key])).toEqual([
      ['result', 'active'], ['result', 'other'], ['result', 'repeat'],
    ]);
  });

  it('does not send a stale result for a canceled job while the queue is at capacity', () => {
    const { callbacks, sent, queue, drain } = harness();
    queue.receive({ type: 'start', job: { ...turn, key: 'active' } });
    for (let index = 1; index <= 5; index++) {
      queue.receive({ type: 'start', job: { ...river, key: `job-${index}` } });
    }
    callbacks.shift()!();
    expect(sent.at(-1)).toMatchObject({ type: 'progress', key: 'active', processed: 10 });
    queue.receive({ type: 'cancel', key: 'active' });
    drain();
    expect(sent.map(message => message.key)).toEqual(['active', 'job-3', 'job-4', 'job-5']);
    expect(sent.some(message => message.type === 'result' && message.key === 'active')).toBe(false);
  });

  it('cancels a queued job without interrupting the running one', () => {
    const { sent, queue, drain } = harness();
    queue.receive({ type: 'start', job: river });
    queue.receive({ type: 'start', job: { ...river, key: 'queued' } });
    queue.receive({ type: 'cancel', key: 'queued' });
    drain();
    expect(sent.map(message => message.key)).toEqual(['river-1']);
  });

  it('finishes a turn over multiple yielded batches without duplicate results', () => {
    const { sent, queue, drain } = harness();
    queue.receive({ type: 'start', job: turn });
    drain();
    expect(sent.map(message => [message.type, 'processed' in message ? message.processed : null])).toEqual([
      ['progress', 10], ['progress', 20], ['progress', 30], ['progress', 40], ['result', 44],
    ]);
    expect(sent.at(-1)).toMatchObject({ key: 'turn-1', total: 44 });
  });

  it('reports an invalid job as an error and continues with queued work', () => {
    const { sent, queue, drain } = harness();
    queue.receive({ type: 'start', job: { ...river, board: cards(['AS', '3D', '4H', '8S', 'KC']), key: 'bad' } });
    queue.receive({ type: 'start', job: river });
    drain();
    expect(sent[0]).toMatchObject({ type: 'error', key: 'bad' });
    expect((sent[0] as Extract<EquityResponse, { type: 'error' }>).message).toMatch(/duplicate/i);
    expect(sent[1]).toEqual({ type: 'result', key: 'river-1', processed: 1, total: 1, shares: [1, 0] });
  });

  it('rejects a street that does not match its visible board', () => {
    const { sent, queue, drain } = harness();
    queue.receive({ type: 'start', job: { ...river, phase: 'flop' } });
    drain();
    expect(sent).toMatchObject([{ type: 'error', key: 'river-1' }]);
  });

  it('disposes without sending from scheduled or future work', () => {
    const { sent, queue, drain } = harness();
    queue.receive({ type: 'start', job: river });
    queue.dispose();
    queue.receive({ type: 'start', job: { ...river, key: 'later' } });
    drain();
    expect(sent).toEqual([]);
  });
});

describe('equityKey', () => {
  it('distinguishes hand, street, ordered seats, hole cards and visible board', () => {
    const seated = [players[0], { ...players[1], seat: 2 }];
    const board = cards(['2C', '3D', '4H']);
    const base = equityKey('t1:1', 'flop', seated, board);
    expect(equityKey('t1:2', 'flop', seated, board)).not.toBe(base);
    expect(equityKey('t1:1', 'turn', seated, board)).not.toBe(base);
    expect(equityKey('t1:1', 'flop', [{ ...seated[0], seat: 1 }, seated[1]], board)).not.toBe(base);
    expect(equityKey('t1:1', 'flop', [...seated].reverse(), board)).not.toBe(base);
    expect(equityKey('t1:1', 'flop', [{ ...seated[0], hole: hole(['AS', 'AC']) }, seated[1]], board)).not.toBe(base);
    expect(equityKey('t1:1', 'flop', seated, cards(['2C', '3D', '5H']))).not.toBe(base);
  });
});
