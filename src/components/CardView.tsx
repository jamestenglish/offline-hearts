import { type Card, cardLabel, isRed, rankLabel, SUIT_SYMBOL } from '../engine/cards';

interface CardViewProps {
  card: Card;
  raised?: boolean;
  dim?: boolean;
  received?: boolean;
  onClick?: () => void;
}

export function CardView({ card, raised = false, dim = false, received = false, onClick }: CardViewProps) {
  const className = [
    'card',
    isRed(card.suit) ? 'red' : 'black',
    raised && 'raised',
    dim && 'dim',
    received && 'received',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={dim || !onClick}
      aria-label={cardLabel(card)}
      aria-pressed={onClick ? raised : undefined}
    >
      <span className="corner">
        {rankLabel(card.rank)}
        <span className="suit">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="pip">{SUIT_SYMBOL[card.suit]}</span>
    </button>
  );
}
