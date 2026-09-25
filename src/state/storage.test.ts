import { describe, expect, it } from 'vitest';
import { gameReducer, type GameState, initialState } from '../engine/game';
import { autoAction } from '../test/autoplay';
import { GAME_KEY, HISTORY_KEY, loadVersioned, ROSTER_KEY, saveVersioned } from './storage';
import { loadGame } from './useGame';

const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }];

function started(): GameState {
  return gameReducer(initialState(), { type: 'START_GAME', players, gameId: 'g', seed: 3 });
}

describe('loadVersioned', () => {
  it('returns null and clears the key for corrupt JSON', () => {
    localStorage.setItem('k', '{not json');
    expect(loadVersioned('k', 1)).toBeNull();
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('returns null and clears the key for a version mismatch', () => {
    saveVersioned('k', { version: 2 });
    expect(loadVersioned('k', 1)).toBeNull();
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('returns null and clears the key when the validator rejects', () => {
    saveVersioned('k', { version: 1, players: 'nope' });
    expect(loadVersioned<{ version: number; players: unknown }>('k', 1, v => Array.isArray(v.players))).toBeNull();
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('round-trips a valid value', () => {
    saveVersioned('k', { version: 1, a: 1 });
    expect(loadVersioned('k', 1)).toEqual({ version: 1, a: 1 });
  });
});

describe('loadGame', () => {
  it('falls back to a fresh game when nothing is saved', () => {
    expect(loadGame()).toEqual(initialState());
  });

  it('restores a saved trick count and accepts older saves without that field', () => {
    const s = gameReducer(initialState(), {
      type: 'START_GAME',
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }],
      gameId: 'g', seed: 3,
    });
    saveVersioned(GAME_KEY, { ...s, tricksWon: [1, 0, 0, 0] });
    expect(loadGame().tricksWon).toEqual([1, 0, 0, 0]);
    const { tricksWon: _counts, ...older } = s;
    void _counts;
    saveVersioned(GAME_KEY, older);
    expect(loadGame().tricksWon).toEqual([0, 0, 0, 0]);
  });

  it('never restores a revealed hand from a valid passing state', () => {
    const passing = gameReducer(started(), { type: 'DEAL_DONE' });
    const revealed = gameReducer(passing, { type: 'REVEAL_HAND' });
    expect(revealed.phase).toBe('passing');
    expect(revealed.handRevealed).toBe(true);
    saveVersioned(GAME_KEY, revealed);
    expect(loadGame()).toEqual({ ...revealed, handRevealed: false });
  });

  it('resumes a saved mid-game state and can play to the end', () => {
    let s = started();
    for (let i = 0; i < 150; i++) s = gameReducer(s, autoAction(s));
    saveVersioned(GAME_KEY, s);
    let resumed = loadGame();
    expect(resumed.phase).toBe(s.phase);
    for (let i = 0; i < 5000 && resumed.phase !== 'gameOver'; i++) resumed = gameReducer(resumed, autoAction(resumed));
    expect(resumed.phase).toBe('gameOver');
  });

  it('discards a saved game with a malformed shape', () => {
    localStorage.setItem(GAME_KEY, JSON.stringify({ version: 1, phase: 'playing', hands: [] }));
    expect(loadGame()).toEqual(initialState());
    expect(localStorage.getItem(GAME_KEY)).toBeNull();
  });

  it('does not erase roster or history when the game is corrupt', () => {
    const roster = JSON.stringify({ version: 1, players: [{ id: 'a', name: 'Ann', archived: false, createdAt: 1 }] });
    const history = JSON.stringify({ version: 1, games: [] });
    localStorage.setItem(ROSTER_KEY, roster);
    localStorage.setItem(HISTORY_KEY, history);
    localStorage.setItem(GAME_KEY, '{bad');
    expect(loadGame()).toEqual(initialState());
    expect(localStorage.getItem(GAME_KEY)).toBeNull();
    expect(localStorage.getItem(ROSTER_KEY)).toBe(roster);
    expect(localStorage.getItem(HISTORY_KEY)).toBe(history);
  });

  it('rejects malformed nested cards, selections, and trick data', () => {
    const valid = started();
    const invalid = [
      { ...valid, hands: [[{ suit: 'X', rank: 2 }], ...valid.hands.slice(1)] },
      { ...valid, passSelections: [42, null, null, null] },
      { ...valid, trick: { leader: 0, cards: [{ seat: 8, card: valid.hands[0][0] }] } },
      { ...valid, players: valid.players.map((p, i) => i === 0 ? { ...p, id: null } : p) },
      { ...valid, phase: 'nonsense' },
      { ...valid, current: -1 },
    ];
    for (const state of invalid) {
      saveVersioned(GAME_KEY, state);
      expect(loadGame()).toEqual(initialState());
      expect(localStorage.getItem(GAME_KEY)).toBeNull();
    }
  });

  it('rejects a setup state with missing game fields', () => {
    saveVersioned(GAME_KEY, { version: 1, phase: 'setup', players: [] });
    expect(loadGame()).toEqual(initialState());
    expect(localStorage.getItem(GAME_KEY)).toBeNull();
  });

  it('rejects a mid-game save missing its cards rather than resuming a stuck game', () => {
    const passing = gameReducer(started(), { type: 'DEAL_DONE' });
    saveVersioned(GAME_KEY, { ...passing, hands: [[], [], [], []] });
    expect(loadGame()).toEqual(initialState());
    expect(localStorage.getItem(GAME_KEY)).toBeNull();
  });

  it('rejects duplicate cards in the saved hands', () => {
    const state = started();
    const hands = state.hands.map(hand => hand.slice());
    hands[0][0] = hands[1][0];
    saveVersioned(GAME_KEY, { ...state, hands });
    expect(loadGame()).toEqual(initialState());
  });
});
