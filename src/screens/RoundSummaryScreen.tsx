import type { Dispatch } from 'react';
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

export function RoundSummaryScreen({ state, dispatch }: ScreenProps) {
  const shooter = state.moonShooter === null ? null : state.players[state.moonShooter];
  return (
    <div className="screen">
      <h2 className="title">
        Round {state.round + 1} of {ROUNDS}
      </h2>
      {shooter && (
        <>
          <Celebration emojis={MOON_EMOJIS} />
          <p className="banner">🌙 {shooter.name} shot the moon! 🚀</p>
        </>
      )}
      <Scoreboard
        players={state.players}
        roundScores={state.roundScores}
        totals={state.totals}
        moonRounds={state.moonHistory}
      />
      <button type="button" className="btn" onClick={() => dispatch({ type: 'NEXT_ROUND', seed: randomSeed() })}>
        {nextLabel(state.round)}
      </button>
    </div>
  );
}
