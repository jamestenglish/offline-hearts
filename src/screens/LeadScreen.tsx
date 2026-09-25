import type { Dispatch } from 'react';
import type { Action, GameState } from '../engine/game';
import { Table } from '../components/Table';

interface ScreenProps {
  state: GameState;
  dispatch: Dispatch<Action>;
}

export function LeadScreen({ state, dispatch }: ScreenProps) {
  const leader = state.players[state.current];
  return (
    <div className="screen">
      <Table players={state.players} tricksWon={state.tricksWon} cards={[]} active={state.current} />
      <p className="message">{leader.name} has the 2♣ and leads.</p>
      <p>Pass the device to {leader.name}.</p>
      <button type="button" className="btn" onClick={() => dispatch({ type: 'BEGIN_PLAY' })}>
        Show {leader.name}'s cards
      </button>
    </div>
  );
}
