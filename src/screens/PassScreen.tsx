import { type Dispatch, useState } from 'react';
import { type Card, type CardId } from '../engine/cards';
import type { Action, GameState } from '../engine/game';
import { passDirection, passTarget } from '../engine/passing';
import { Hand } from '../components/Hand';
import { PrivacyScreen } from '../components/PrivacyScreen';

interface ScreenProps {
  state: GameState;
  dispatch: Dispatch<Action>;
}

export function PassScreen({ state, dispatch }: ScreenProps) {
  const passer = state.players[state.passer];
  const target = state.players[passTarget(state.passer, state.round)];

  if (!state.handRevealed) {
    return (
      <div className="screen">
        <PrivacyScreen
          message={`Pass the device to ${passer.name}`}
          buttonLabel={`Show ${passer.name}'s hand`}
          onReveal={() => dispatch({ type: 'REVEAL_HAND' })}
        />
      </div>
    );
  }

  return (
    <PassSelection
      key={state.passer}
      title={`${passer.name}: pass 3 cards ${passDirection(state.round)} → ${target.name}`}
      hand={state.hands[state.passer]}
      onFinalize={cards => dispatch({ type: 'FINALIZE_PASS', cards })}
    />
  );
}

interface PassSelectionProps {
  title: string;
  hand: readonly Card[];
  onFinalize: (cards: CardId[]) => void;
}

function PassSelection({ title, hand, onFinalize }: PassSelectionProps) {
  const [selected, setSelected] = useState<CardId[]>([]);

  const toggle = (id: CardId) =>
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return prev.length < 3 ? [...prev, id] : prev;
    });

  return (
    <div className="screen">
      <h2 className="message">{title}</h2>
      <p>{selected.length}/3 selected</p>
      <Hand cards={hand} selected={selected} onToggle={toggle} />
      <button type="button" className="btn" disabled={selected.length !== 3} onClick={() => onFinalize(selected)}>
        Finalize Selection
      </button>
    </div>
  );
}
