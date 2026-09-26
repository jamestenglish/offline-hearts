import { cardId } from '../engine/cards';
import { type Action, currentLegalPlays, type GameState } from '../engine/game';

export function autoAction(state: GameState): Action {
  switch (state.phase) {
    case 'dealing':
      return { type: 'DEAL_DONE' };
    case 'passing':
      return state.handRevealed
        ? { type: 'FINALIZE_PASS', cards: state.hands[state.passer].slice(0, 3).map(cardId) }
        : { type: 'REVEAL_HAND' };
    case 'leadAnnounce':
      return { type: 'BEGIN_PLAY' };
    case 'playing': {
      if (!state.handRevealed) return { type: 'REVEAL_HAND' };
      const legal = currentLegalPlays(state);
      if (legal.length === 0) throw new Error('no legal plays');
      return { type: 'PLAY_CARD', card: cardId(legal[0]) };
    }
    case 'trickResult':
      return { type: 'ACK_TRICK' };
    case 'roundSummary':
      return { type: 'NEXT_ROUND', seed: 1000 + state.round };
    default:
      throw new Error(`autoAction: unexpected phase ${state.phase}`);
  }
}
