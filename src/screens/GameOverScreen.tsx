import type { GameState } from '../engine/game';
import { perfectSeats, winningSeats } from '../engine/scoring';
import { Celebration, PERFECT_EMOJIS } from '../components/Celebration';
import { Scoreboard } from '../components/Scoreboard';

interface GameOverScreenProps {
  state: GameState;
  onPlayAgain: () => void;
  onNewPlayers: () => void;
  onOpenStats: () => void;
}

export function GameOverScreen({ state, onPlayAgain, onNewPlayers, onOpenStats }: GameOverScreenProps) {
  const names = (seats: number[]) => seats.map(seat => state.players[seat].name).join(' & ');
  const winners = winningSeats(state.totals);
  const perfect = perfectSeats(state.totals);
  const heading = winners.length > 1 ? `Tie: ${names(winners)}` : `${names(winners)} wins!`;

  return (
    <div className="screen">
      <h1 className="title">{heading}</h1>
      {perfect.length > 0 && (
        <>
          <Celebration emojis={PERFECT_EMOJIS} />
          <p className="banner">💯 Perfect game: {names(perfect)}!</p>
        </>
      )}
      <Scoreboard
        players={state.players}
        roundScores={state.roundScores}
        totals={state.totals}
        moonRounds={state.moonHistory}
      />
      <div className="row">
        <button type="button" className="btn" onClick={onPlayAgain}>
          Play Again
        </button>
        <button type="button" className="btn secondary" onClick={onNewPlayers}>
          New Players
        </button>
        <button type="button" className="btn secondary" onClick={onOpenStats}>
          Stats
        </button>
      </div>
    </div>
  );
}
