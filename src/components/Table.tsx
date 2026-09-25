import { cardId } from '../engine/cards';
import type { SeatPlayer } from '../engine/game';
import type { TrickCard } from '../engine/rules';
import { CardView } from './CardView';

interface TableProps {
  players: readonly SeatPlayer[];
  tricksWon: readonly number[];
  cards: readonly TrickCard[];
  active?: number;
  winner?: number;
}

export function Table({ players, tricksWon, cards, active, winner }: TableProps) {
  return (
    <div className="table">
      {players.map((player, seat) => (
        <div
          key={player.id}
          data-testid={`seat-${seat}`}
          className={`seat-label seat-${seat}${seat === active ? ' active' : ''}`}
        >
          <div className="name">{player.name}</div>
          <div className="taken">{tricksWon[seat]} {tricksWon[seat] === 1 ? 'trick' : 'tricks'}</div>
        </div>
      ))}
      {cards.map(({ seat, card }) => (
        <div key={cardId(card)} className={`played seat-${seat}${seat === winner ? ' winner' : ''}`}>
          <CardView card={card} />
        </div>
      ))}
    </div>
  );
}
