import { cardId, cardLabel, isRed } from '../engine/cards';
import type { SeatPlayer } from '../engine/game';
import type { TrickCard } from '../engine/rules';
import { CardView } from './CardView';

interface TableProps {
  players: readonly SeatPlayer[];
  tricksWon: readonly number[];
  cards: readonly TrickCard[];
  active?: number;
  winner?: number;
  previousCards?: readonly TrickCard[];
}

export function Table({ players, tricksWon, cards, active, winner, previousCards = [] }: TableProps) {
  return (
    <div className="table">
      {players.map((player, seat) => {
        const lastCard = previousCards.find(played => played.seat === seat)?.card;
        return (
          <div
            key={player.id}
            data-testid={`seat-${seat}`}
            className={`seat-label seat-${seat}${seat === active ? ' active' : ''} last-card-${seat % 2 === 0 ? 'beside' : 'below'}`}
          >
            <div className="name">{player.name}</div>
            {lastCard && <span role="img" aria-label={`Last trick: ${cardLabel(lastCard)}`}
              className={`last-card-mini last-card-mini-${isRed(lastCard.suit) ? 'red' : 'black'}`}>
              {cardLabel(lastCard)}
            </span>}
            <div className="taken">{tricksWon[seat]} {tricksWon[seat] === 1 ? 'trick' : 'tricks'}</div>
          </div>
        );
      })}
      {cards.map(({ seat, card }) => (
        <div key={cardId(card)} className={`played seat-${seat}${seat === winner ? ' winner' : ''}`}>
          <CardView card={card} />
        </div>
      ))}
    </div>
  );
}
