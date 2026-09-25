import { describe, expect, it } from 'vitest';
import { autoAction } from '../test/autoplay';
import { cardId } from './cards';
import { findTwoOfClubs } from './rules';
import {
  type Action, currentLegalPlays, gameReducer, type GameState, initialState, type SeatPlayer,
} from './game';

const PLAYERS: SeatPlayer[] = [
  { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }, { id: 'd', name: 'Dan' },
];

const run = (state: GameState, ...actions: Action[]) => actions.reduce(gameReducer, state);
const started = (seed = 1) => run(initialState(), { type: 'START_GAME', players: PLAYERS, gameId: 'g1', seed });
const until = (state: GameState, phase: GameState['phase']) => {
  let s = state;
  for (let i = 0; i < 10000 && s.phase !== phase; i++) s = gameReducer(s, autoAction(s));
  return s;
};

describe('gameReducer', () => {
  it('starts a game and deals 13 cards each', () => {
    const s = started();
    expect(s.phase).toBe('dealing');
    expect(s.gameId).toBe('g1');
    expect(s.players).toEqual(PLAYERS);
    s.hands.forEach(h => expect(h).toHaveLength(13));
  });

  it('rejects starting with duplicate players', () => {
    const init = initialState();
    const dup = [...PLAYERS.slice(0, 3), PLAYERS[0]];
    expect(gameReducer(init, { type: 'START_GAME', players: dup, gameId: 'g', seed: 1 })).toBe(init);
  });

  it('goes to passing after the deal in round 1', () => {
    const s = run(started(), { type: 'DEAL_DONE' });
    expect(s.phase).toBe('passing');
    expect(s.passer).toBe(0);
    expect(s.handRevealed).toBe(false);
  });

  it('ignores FINALIZE_PASS while the hand is hidden or with the wrong card count', () => {
    const s = run(started(), { type: 'DEAL_DONE' });
    const three = s.hands[0].slice(0, 3).map(cardId);
    expect(gameReducer(s, { type: 'FINALIZE_PASS', cards: three })).toBe(s);
    const revealed = gameReducer(s, { type: 'REVEAL_HAND' });
    expect(gameReducer(revealed, { type: 'FINALIZE_PASS', cards: three.slice(0, 2) })).toBe(revealed);
    expect(gameReducer(revealed, { type: 'FINALIZE_PASS', cards: [three[0], three[0], three[1]] })).toBe(revealed);
  });

  it('ignores a repeated FINALIZE_PASS (double tap)', () => {
    const s = run(started(), { type: 'DEAL_DONE' }, { type: 'REVEAL_HAND' });
    const once = gameReducer(s, { type: 'FINALIZE_PASS', cards: s.hands[0].slice(0, 3).map(cardId) });
    expect(once.passer).toBe(1);
    expect(gameReducer(once, { type: 'FINALIZE_PASS', cards: s.hands[0].slice(0, 3).map(cardId) })).toBe(once);
  });

  it('applies passes after all four players finalize and announces the 2 of clubs holder', () => {
    const s = until(started(), 'leadAnnounce');
    expect(s.current).toBe(findTwoOfClubs(s.hands));
    s.received.forEach(r => expect(r).toHaveLength(3));
    s.hands.forEach(h => expect(h).toHaveLength(13));
  });

  it('ignores illegal and hidden-hand plays, including a double tap', () => {
    const lead = run(until(started(), 'leadAnnounce'), { type: 'BEGIN_PLAY' });
    expect(lead.phase).toBe('playing');
    expect(lead.handRevealed).toBe(true);
    const illegal = lead.hands[lead.current].find(c => cardId(c) !== '2C')!;
    expect(gameReducer(lead, { type: 'PLAY_CARD', card: cardId(illegal) })).toBe(lead);
    const played = gameReducer(lead, { type: 'PLAY_CARD', card: '2C' });
    expect(played.trick.cards).toHaveLength(1);
    expect(played.handRevealed).toBe(false);
    expect(played.current).toBe((lead.current + 1) % 4);
    expect(gameReducer(played, { type: 'PLAY_CARD', card: '2C' })).toBe(played);
  });

  it('resolves a trick after four cards', () => {
    const s = until(started(), 'trickResult');
    expect(s.trickNumber).toBe(1);
    expect(s.lastTrick?.cards).toHaveLength(4);
    expect(s.current).toBe(s.lastTrick?.winner);
    expect(s.trick.cards).toHaveLength(0);
    expect(s.taken.reduce((a, b) => a + b, 0)).toBe(s.lastTrick?.points);
  });

  it('scores a moon shot', () => {
    const s: GameState = {
      ...started(), phase: 'trickResult', trickNumber: 13, taken: [26, 0, 0, 0],
    };
    const scored = gameReducer(s, { type: 'ACK_TRICK' });
    expect(scored.phase).toBe('roundSummary');
    expect(scored.moonShooter).toBe(0);
    expect(scored.moonHistory).toEqual([0]);
    expect(scored.roundScores).toEqual([[0, 26, 26, 26]]);
    expect(scored.totals).toEqual([0, 26, 26, 26]);
  });

  it('skips passing in round 4', () => {
    const s: GameState = { ...started(), phase: 'roundSummary', round: 2 };
    const r4 = run(s, { type: 'NEXT_ROUND', seed: 9 }, { type: 'DEAL_DONE' });
    expect(r4.round).toBe(3);
    expect(r4.phase).toBe('leadAnnounce');
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('plays a full game to the end (seed %i)', seed => {
    let s = started(seed);
    let steps = 0;
    while (s.phase !== 'gameOver') {
      if (s.phase === 'playing' && s.handRevealed) {
        expect(currentLegalPlays(s).length).toBeGreaterThan(0);
      }
      s = gameReducer(s, autoAction(s));
      if (++steps > 5000) throw new Error('game did not finish');
    }
    expect(s.roundScores).toHaveLength(4);
    expect(s.moonHistory).toHaveLength(4);
    s.roundScores.forEach((round, i) => {
      const sum = round.reduce((a, b) => a + b, 0);
      expect(sum).toBe(s.moonHistory[i] === null ? 26 : 78);
    });
    expect(s.totals).toEqual([0, 1, 2, 3].map(seat => s.roundScores.reduce((t, r) => t + r[seat], 0)));
  });

  it('PLAY_AGAIN keeps players and resets scores', () => {
    const over = until(started(), 'gameOver');
    const again = gameReducer(over, { type: 'PLAY_AGAIN', gameId: 'g2', seed: 5 });
    expect(again.phase).toBe('dealing');
    expect(again.gameId).toBe('g2');
    expect(again.players).toEqual(PLAYERS);
    expect(again.totals).toEqual([0, 0, 0, 0]);
    expect(again.roundScores).toEqual([]);
    expect(again.moonHistory).toEqual([]);
  });

  it('NEW_GAME resets to setup', () => {
    expect(gameReducer(started(), { type: 'NEW_GAME' })).toEqual(initialState());
  });
});
