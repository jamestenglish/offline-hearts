import { type Card, type CardId, cardId } from '../engine/cards';
import { sortHand, type SortMode } from '../engine/sort';
import { CardView } from './CardView';

interface HandProps {
  cards: readonly Card[];
  selected: readonly CardId[];
  playable?: readonly CardId[];
  received?: readonly CardId[];
  sortMode?: SortMode;
  onToggle: (id: CardId) => void;
}

export function Hand({ cards, selected, playable, received = [], sortMode = 'descending', onToggle }: HandProps) {
  return (
    <div className="hand">
      {sortHand(cards, sortMode).map(card => {
        const id = cardId(card);
        const canPlay = !playable || playable.includes(id);
        return (
          <CardView
            key={id}
            card={card}
            raised={selected.includes(id)}
            dim={!canPlay}
            received={received.includes(id)}
            onClick={canPlay ? () => onToggle(id) : undefined}
          />
        );
      })}
    </div>
  );
}
