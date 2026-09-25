import type { Dispatch } from 'react';
import { type Action, type GameState, TRICKS_PER_ROUND } from '../engine/game';
import { Table } from '../components/Table';

interface ScreenProps {
  state: GameState;
  dispatch: Dispatch<Action>;
}

export function TrickResultScreen({ state, dispatch }: ScreenProps) {
  const last = state.lastTrick!;
  const winner = state.players[last.winner];
  const roundOver = state.trickNumber >= TRICKS_PER_ROUND;
  return (
    <div className="screen">
      <Table players={state.players} taken={state.taken} cards={last.cards} active={last.winner} winner={last.winner} />
      <p className="message">
        {winner.name} wins the trick{last.points > 0 ? ` (+${last.points})` : ''}.
      </p>
      {!roundOver && <p>Pass the device to {winner.name}.</p>}
      <button type="button" className="btn" onClick={() => dispatch({ type: 'ACK_TRICK' })}>
        {roundOver ? 'See round results' : `Show ${winner.name}'s cards`}
      </button>
    </div>
  );
}
