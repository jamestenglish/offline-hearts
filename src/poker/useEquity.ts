import { useEffect, useRef, useState } from 'react';
import type { Card } from '../shared/cards';
import type { EquityPlayer } from './engine/equity';
import type { Tournament } from './engine/tournament';
import { equityKey, type EquityJob, type EquityPhase, type EquityResponse } from './equity.protocol';

const phases: EquityPhase[] = ['preflop', 'flop', 'turn', 'river'];
const boardLengths = [0, 3, 4, 5];
const createDefaultWorker = () => new Worker(new URL('./equity.worker.ts', import.meta.url), { type: 'module' });

type Point = { key: string; processed: number; total: number; shares: number[] | null; error: string | null };
type Points = Record<EquityPhase, Point | null>;
const empty = (): Points => ({ preflop: null, flop: null, turn: null, river: null });
const initial = (key: string): Point => ({ key, processed: 0, total: 0, shares: null, error: null });

function desiredJobs(state: Tournament | null): EquityJob[] {
  if (!state?.hand || state.phase === 'finished' || state.result?.kind === 'uncontested') return [];
  const players: EquityPlayer[] = state.phase === 'result'
    ? state.result!.hands.map(({ seat, hole }) => ({ seat, hole: hole as [Card, Card] }))
    : state.hand.betting.seats.flatMap((seat, index) => !seat.folded && state.hand!.hole[index]
      ? [{ seat: index, hole: state.hand!.hole[index]! as [Card, Card] }] : []);
  if (players.length < 2) return [];
  const handId = `${state.id}:${state.handNumber}`;
  return phases.flatMap((phase, index) => {
    if (state.hand!.board.length < boardLengths[index]) return [];
    const board = state.hand!.board.slice(0, boardLengths[index]);
    return [{ handId, phase, players, board, key: equityKey(handId, phase, players, board) }];
  });
}

export function useEquity(state: Tournament | null, createWorker: () => Worker = createDefaultWorker): Points {
  const jobs = desiredJobs(state);
  const signature = JSON.stringify(jobs.map(job => job.key));
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Set<string>());
  const completed = useRef(new Map<string, Point>());
  const failures = useRef(new Map<string, string>());
  const [points, setPoints] = useState<Points>(empty);
  const reconcileRef = useRef<() => void>(() => {});
  const workerError = useRef<string | null>(null);
  const previous = useRef<EquityJob[]>([]);

  function publish(): void {
    const next = empty();
    for (const job of jobsRef.current) {
      next[job.phase] = completed.current.get(job.key) ?? {
        ...initial(job.key), error: failures.current.get(job.key) ?? workerError.current,
      };
    }
    setPoints(old => {
      for (const phase of phases) {
        if (old[phase] && next[phase] && old[phase].key === next[phase].key && old[phase].processed > next[phase].processed
          && !next[phase]!.error) next[phase] = old[phase];
      }
      return phases.every(phase => JSON.stringify(old[phase]) === JSON.stringify(next[phase])) ? old : next;
    });
  }

  reconcileRef.current = () => {
    const worker = workerRef.current;
    if (!worker || workerError.current) { publish(); return; }
    const current = jobsRef.current;
    const wanted = new Set(current.map(job => job.key));
    if (previous.current.some(job => !wanted.has(job.key))) {
      try { worker.postMessage({ type: 'cancelAll' }); }
      catch (error) { workerError.current = error instanceof Error ? error.message : String(error); }
      pending.current.clear();
    }
    previous.current = current;
    for (const job of current) {
      if (pending.current.size >= 4 || workerError.current) break;
      if (pending.current.has(job.key) || completed.current.has(job.key) || failures.current.has(job.key)) continue;
      try {
        worker.postMessage({ type: 'start', job });
        pending.current.add(job.key);
      } catch (error) {
        workerError.current = error instanceof Error ? error.message : String(error);
      }
    }
    publish();
  };

  useEffect(() => {
    workerError.current = null;
    try {
      const worker = createWorker();
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<EquityResponse>) => {
        const message = event.data;
        if (!pending.current.has(message.key) || !jobsRef.current.some(job => job.key === message.key)) return;
        if (message.type === 'progress') {
          setPoints(old => {
            const phase = jobsRef.current.find(job => job.key === message.key)!.phase;
            return { ...old, [phase]: { ...initial(message.key), processed: message.processed, total: message.total } };
          });
        } else {
          pending.current.delete(message.key);
          if (message.type === 'result') completed.current.set(message.key, {
            key: message.key, processed: message.processed, total: message.total, shares: message.shares, error: null,
          });
          else failures.current.set(message.key, message.message);
          reconcileRef.current();
        }
      };
      worker.onerror = event => {
        workerError.current = event.message || 'Equity worker failed';
        pending.current.clear();
        reconcileRef.current();
      };
    } catch (error) {
      workerError.current = error instanceof Error ? error.message : String(error);
    }
    reconcileRef.current();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pending.current.clear();
      previous.current = [];
    };
  }, [createWorker]);

  useEffect(() => { reconcileRef.current(); }, [signature, createWorker]);

  // Exclude previous hand/participants immediately, before effects run.
  const visible = empty();
  for (const job of jobs) visible[job.phase] = points[job.phase]?.key === job.key ? points[job.phase] : initial(job.key);
  return visible;
}
