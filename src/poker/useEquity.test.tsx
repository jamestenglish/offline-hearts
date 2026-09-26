import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { cardId } from '../shared/cards';
import { legalActions } from './engine/betting';
import { tournamentReducer, type Tournament } from './engine/tournament';
import type { EquityRequest, EquityResponse } from './equity.protocol';
import { useEquity } from './useEquity';

function makeFakeWorker() {
  return {
    sent: [] as EquityRequest[],
    postMessage(message: EquityRequest) { this.sent.push(message); },
    onmessage: null as ((event: MessageEvent<EquityResponse>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    terminate() { this.terminated = true; },
    terminated: false,
    emit(message: EquityResponse) { this.onmessage?.({ data: message } as MessageEvent<EquityResponse>); },
  };
}

const players = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }];
function startedTournament() {
  return tournamentReducer(null, { type: 'START', players, stack: 100, bigBlind: 10, id: 't1', seed: 19 })!;
}
function showdown() {
  let state = startedTournament();
  for (let i = 0; i < 50 && state.phase === 'hand'; i++) {
    state = tournamentReducer(state, { type: 'REVEAL' })!;
    state = tournamentReducer(state, { type: 'ACT', action: { type: legalActions(state.hand!.betting).check ? 'CHECK' : 'CALL' } })!;
  }
  expect(state.result?.kind).toBe('showdown');
  return state;
}
function starts(worker: ReturnType<typeof makeFakeWorker>) {
  return worker.sent.filter((message): message is Extract<EquityRequest, { type: 'start' }> => message.type === 'start').map(message => message.job);
}
function mount(state: Tournament | null, worker = makeFakeWorker()) {
  const createWorker = () => worker as unknown as Worker;
  return { worker, ...renderHook(({ state }) => useEquity(state, createWorker), { initialProps: { state } }) };
}

beforeEach(() => localStorage.clear());

it('preloads preflop with actual hole cards, no visible board, and no persistence or tournament mutation', () => {
  const state = startedTournament();
  const before = JSON.stringify(state);
  const { worker, result, unmount } = mount(state);
  expect(starts(worker)).toHaveLength(1);
  expect(starts(worker)[0]).toMatchObject({ handId: 't1:1', phase: 'preflop', board: [], players: [
    { seat: 0, hole: state.hand!.hole[0] }, { seat: 1, hole: state.hand!.hole[1] },
  ] });
  expect(result.current.preflop?.key).toContain(cardId(state.hand!.hole[0]![0]));
  expect(result.current.flop).toBeNull();
  expect(JSON.stringify(state)).toBe(before);
  expect(localStorage.length).toBe(0);
  unmount();
  expect(worker.terminated).toBe(true);
});

it('cancels and rekeys after a fold without sending folded hole cards', () => {
  const three = tournamentReducer(null, { type: 'START', players: [...players, { id: 'c', name: 'Cam' }], stack: 100, bigBlind: 10, id: 't1', seed: 19 })!;
  const revealed = tournamentReducer(three, { type: 'REVEAL' })!;
  const folded = tournamentReducer(revealed, { type: 'ACT', action: { type: 'FOLD' } })!;
  const { worker, result, rerender } = mount(three);
  const old = result.current.preflop!.key;
  rerender({ state: folded });
  expect(worker.sent).toContainEqual({ type: 'cancelAll' });
  expect(result.current.preflop?.key).not.toBe(old);
  expect(starts(worker).at(-1)!.players.map(player => player.seat)).toEqual(folded.hand!.betting.seats.flatMap((seat, index) => seat.folded ? [] : [index]));
  act(() => worker.emit({ type: 'result', key: old, processed: 1, total: 1, shares: [1, 0, 0] }));
  expect(result.current.preflop?.shares).toBeNull();
});

it('adds each street only when its board prefix is visible, and rejects old board/hand progress', () => {
  let state = startedTournament();
  const { worker, result, rerender } = mount(state);
  const old = result.current.preflop!.key;
  for (const phase of ['flop', 'turn', 'river'] as const) {
    while (state.phase === 'hand' && state.street !== phase) {
      state = tournamentReducer(state, { type: 'REVEAL' })!;
      state = tournamentReducer(state, { type: 'ACT', action: { type: legalActions(state.hand!.betting).check ? 'CHECK' : 'CALL' } })!;
    }
    rerender({ state });
    expect(starts(worker).find(job => job.phase === phase)?.board).toEqual(state.hand!.board.slice(0, { flop: 3, turn: 4, river: 5 }[phase]));
  }
  act(() => worker.emit({ type: 'progress', key: old, processed: 2, total: 100 }));
  expect(result.current.preflop?.processed).toBe(2);
  const next = { ...state, id: 'other' };
  rerender({ state: next });
  act(() => worker.emit({ type: 'result', key: old, processed: 100, total: 100, shares: [0.5, 0.5] }));
  expect(result.current.preflop?.shares).toBeNull();
});

it('mounts directly at a saved showdown and schedules all four exact phases', () => {
  const state = showdown();
  const { worker, result } = mount(state);
  expect(starts(worker).map(job => job.phase)).toEqual(['preflop', 'flop', 'turn', 'river']);
  expect(starts(worker).every(job => job.players.length === state.result!.hands.length)).toBe(true);
  expect(result.current.river?.key).toBe(starts(worker)[3].key);
});

it('reuses completed matching points at showdown but recomputes missing points', () => {
  const state = startedTournament();
  const { worker, result, rerender } = mount(state);
  const old = result.current.preflop!.key;
  act(() => worker.emit({ type: 'result', key: old, processed: 100, total: 100, shares: [0.6, 0.4] }));
  rerender({ state: showdown() });
  expect(result.current.preflop?.shares).toEqual([0.6, 0.4]);
  expect(starts(worker).filter(job => job.key === old)).toHaveLength(1);
  expect(starts(worker).map(job => job.phase)).toEqual(['preflop', 'flop', 'turn', 'river']);
});

it('does not reuse a three-player completion for a two-player showdown, and discards stale shares', () => {
  const three = tournamentReducer(null, { type: 'START', players: [...players, { id: 'c', name: 'Cam' }], stack: 100, bigBlind: 10, id: 't1', seed: 19 })!;
  const { worker, result, rerender } = mount(three);
  const old = result.current.preflop!.key;
  act(() => worker.emit({ type: 'result', key: old, processed: 10, total: 10, shares: [0.2, 0.3, 0.5] }));
  let state = tournamentReducer(three, { type: 'REVEAL' })!;
  state = tournamentReducer(state, { type: 'ACT', action: { type: 'FOLD' } })!;
  for (let i = 0; i < 50 && state.phase === 'hand'; i++) {
    state = tournamentReducer(state, { type: 'REVEAL' })!;
    state = tournamentReducer(state, { type: 'ACT', action: { type: legalActions(state.hand!.betting).check ? 'CHECK' : 'CALL' } })!;
  }
  expect(state.result?.kind).toBe('showdown');
  rerender({ state });
  expect(result.current.preflop?.shares).toBeNull();
  expect(result.current.preflop?.key).not.toBe(old);
  expect(starts(worker).at(-4)!.players.map(player => player.seat)).toEqual(state.result!.hands.map(hand => hand.seat));
  act(() => worker.emit({ type: 'progress', key: old, processed: 10, total: 10 }));
  expect(result.current.preflop?.processed).toBe(0);
});

it('surfaces postMessage failure instead of crashing the page', () => {
  const worker = makeFakeWorker();
  worker.postMessage = () => { throw Error('post failed'); };
  const mounted = mount(startedTournament(), worker);
  expect(mounted.result.current.preflop?.error).toBe('post failed');
});

it('retains a reported progress count while other phases are enqueued', () => {
  const state = showdown();
  const { worker, result } = mount(state);
  const key = starts(worker)[0].key;
  act(() => worker.emit({ type: 'progress', key, processed: 2, total: 100 }));
  expect(result.current.preflop?.processed).toBe(2);
  const other = starts(worker)[1].key;
  act(() => worker.emit({ type: 'result', key: other, processed: 1, total: 1, shares: [0.5, 0.5] }));
  expect(result.current.preflop?.processed).toBe(2);
});


it('marks unfinished jobs failed on worker error and survives unavailable Worker', () => {
  const { worker, result } = mount(startedTournament());
  act(() => worker.onerror?.({ message: 'worker crashed' } as ErrorEvent));
  expect(result.current.preflop?.error).toContain('worker crashed');
  const unavailable = renderHook(() => useEquity(startedTournament(), () => { throw Error('Worker unavailable'); }));
  expect(unavailable.result.current.preflop?.error).toContain('Worker unavailable');
  expect(vi.isMockFunction(localStorage.setItem)).toBe(false);
});
