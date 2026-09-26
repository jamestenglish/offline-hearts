import { type Dispatch, useState } from 'react';
import { type CardId, cardId, cardLabel, parseCardId } from '../engine/cards';
import { type Action, currentLegalPlays, type GameState } from '../engine/game';
import { Hand } from '../components/Hand';
import { PrivacyScreen } from '../components/PrivacyScreen';
import { Table } from '../components/Table';
import { useSortPreference } from '../state/sortPreferences';

interface ScreenProps {
  state: GameState;
  dispatch: Dispatch<Action>;
}

export function PlayScreen({ state, dispatch }: ScreenProps) {
  const player = state.players[state.current];
  return (
    <div className="screen">
      <Table players={state.players} tricksWon={state.tricksWon} cards={state.trick.cards} active={state.current} />
      {state.handRevealed ? (
        <PlayHand
          key={`${state.current}-${state.trickNumber}-${state.trick.cards.length}`}
          state={state}
          onPlay={card => dispatch({ type: 'PLAY_CARD', card })}
        />
      ) : (
        <PrivacyScreen
          message={`Pass the device to ${player.name}`}
          buttonLabel={`See ${player.name}'s cards`}
          onReveal={() => dispatch({ type: 'REVEAL_HAND' })}
        />
      )}
    </div>
  );
}

interface PlayHandProps {
  state: GameState;
  onPlay: (card: CardId) => void;
}

function PlayHand({ state, onPlay }: PlayHandProps) {
  const [selected, setSelected] = useState<CardId | null>(null);
  const [sortMode, toggleSort] = useSortPreference(state.players[state.current].id);
  const playable = currentLegalPlays(state).map(cardId);
  const received = state.trickNumber === 0 ? state.received[state.current] : [];

  return (
    <>
      <p className="message">{state.players[state.current].name}'s turn</p>
      <button type="button" className="btn small secondary" onClick={toggleSort}>Sort: {sortMode === 'descending' ? 'Descending' : 'Ascending'}</button>
      {received.some(id => state.hands[state.current].some(card => cardId(card) === id)) && (
        <p className="hand-hint">NEW = received in the pass</p>
      )}
      <Hand
        cards={state.hands[state.current]}
        selected={selected ? [selected] : []}
        playable={playable}
        received={received}
        sortMode={sortMode}
        onToggle={id => setSelected(prev => (prev === id ? null : id))}
      />
      <div style={{ minHeight: 56 }}>
        {selected && (
          <button type="button" className="btn" onClick={() => onPlay(selected)}>
            Play {cardLabel(parseCardId(selected))}
          </button>
        )}
      </div>
    </>
  );
}
