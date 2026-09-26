import { type Dispatch, useEffect, useState } from 'react';
import { type Action, type GameState, ROUNDS } from '../engine/game';
import { passDirection } from '../engine/passing';
import { randomSeed } from '../random';
import { Celebration, MOON_EMOJIS } from '../components/Celebration';
import { Scoreboard } from '../components/Scoreboard';

interface ScreenProps {
  state: GameState;
  dispatch: Dispatch<Action>;
}

function nextLabel(round: number): string {
  if (round >= ROUNDS - 1) return 'See final results';
  const direction = passDirection(round + 1);
  return `Next Round (${direction === 'none' ? 'no pass' : `pass ${direction}`})`;
}

const COUNT_MS = 800;
const SEAT_MS = 1200;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function RoundSummaryScreen({ state, dispatch }: ScreenProps) {
  const [elapsed, setElapsed] = useState(() => prefersReducedMotion() ? 4 * SEAT_MS : 0);
  const complete = elapsed >= 4 * SEAT_MS;
  const scores = state.roundScores[state.round];

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const next = Math.min(4 * SEAT_MS, Date.now() - started);
      setElapsed(next);
      if (next >= 4 * SEAT_MS) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, []);

  const shooter = state.moonShooter === null ? null : state.players[state.moonShooter];
  return (
    <div className="screen">
      <h2 className="title">
        Round {state.round + 1} of {ROUNDS}
      </h2>
      {shooter && complete && (
        <>
          <Celebration emojis={MOON_EMOJIS} />
          <p className="banner">🌙 {shooter.name} shot the moon! 🚀</p>
        </>
      )}
      {complete ? (
        <Scoreboard
          players={state.players}
          roundScores={state.roundScores}
          totals={state.totals}
          moonRounds={state.moonHistory}
        />
      ) : (
        <table className="scores round-countup">
          <thead><tr><th>Player</th><th>Round {state.round + 1}</th></tr></thead>
          <tbody>
            {state.players.map((player, seat) => {
              const offset = elapsed - seat * SEAT_MS;
              const visible = offset >= 0;
              const value = Math.min(scores[seat], Math.floor(scores[seat] * Math.min(offset, COUNT_MS) / COUNT_MS));
              return (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{visible ? <span className={offset >= COUNT_MS ? 'score-slam' : 'score-counting'}>{value}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <button type="button" className="btn" disabled={!complete} onClick={() => dispatch({ type: 'NEXT_ROUND', seed: randomSeed() })}>
        {nextLabel(state.round)}
      </button>
    </div>
  );
}
