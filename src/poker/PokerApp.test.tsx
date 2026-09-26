import { act, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cardId, cardLabel } from '../shared/cards';
import { ROSTER_KEY, saveVersioned } from '../shared/storage';
import { legalActions } from './engine/betting';
import { tournamentReducer, type Tournament } from './engine/tournament';
import type { EquityRequest, EquityResponse } from './equity.protocol';
import { loadPoker, POKER_KEY, SETTINGS_KEY } from './state';
import { PokerApp } from './PokerApp';

const names = ['Alice', 'Bob', 'Carol', 'Dana', 'Eve', 'Frank', 'Grace', 'Hank'];
const players = names.map((name, i) => ({ id: `p${i}`, name, archived: false, createdAt: i }));
function roster(count = 8) { localStorage.setItem(ROSTER_KEY, JSON.stringify({ version: 1, players: players.slice(0, count) })); }
function start(count = 2, stack = 100, seed = 19): Tournament {
  return tournamentReducer(null, { type: 'START', players: players.slice(0, count).map(({ id, name }) => ({ id, name })), stack, bigBlind: 10, id: 'test', seed })!;
}
function save(state: Tournament) { localStorage.setItem(POKER_KEY, JSON.stringify(state)); }
function showdown(seed = 19, stack = 100): Tournament {
  let state = start(2, stack, seed);
  for (let i = 0; i < 30 && state.phase === 'hand'; i++) {
    state = tournamentReducer(state, { type: 'REVEAL' })!;
    const legal = legalActions(state.hand!.betting);
    state = tournamentReducer(state, { type: 'ACT', action: { type: legal.check ? 'CHECK' : 'CALL' } })!;
  }
  expect(state.phase).toBe('result');
  expect(state.result?.kind).toBe('showdown');
  return state;
}

function manyPlayerShowdown(count: number, seed = 19): Tournament {
  let state = start(count, 100, seed);
  for (let i = 0; i < 100 && state.phase === 'hand'; i++) {
    state = tournamentReducer(state, { type: 'REVEAL' })!;
    const legal = legalActions(state.hand!.betting);
    state = tournamentReducer(state, { type: 'ACT', action: { type: legal.check ? 'CHECK' : 'CALL' } })!;
  }
  expect(state.result?.kind).toBe('showdown');
  return state;
}

const workers: FakeWorker[] = [];
class FakeWorker {
  requests: EquityRequest[] = [];
  onmessage: ((event: MessageEvent<EquityResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() { workers.push(this); }
  postMessage(request: EquityRequest) { this.requests.push(request); }
  terminate() {}
  emit(response: EquityResponse) { this.onmessage?.({ data: response } as MessageEvent<EquityResponse>); }
}

beforeEach(() => {
  localStorage.clear(); vi.restoreAllMocks(); workers.length = 0;
  vi.stubGlobal('Worker', FakeWorker);
  saveVersioned(POKER_KEY, start()); localStorage.removeItem(POKER_KEY);
});

describe('PokerApp', () => {
  it('highlights exactly the evaluated five across each showdown hand and community, and preserves exact awards', async () => {
    const state = showdown();
    saveVersioned(POKER_KEY, state);
    render(<PokerApp />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Resume$/i }));
    for (const entry of state.result!.hands) {
      const section = screen.getByRole('region', { name: `${state.players[entry.seat].name} showdown` });
      const hole = within(section).getByRole('group', { name: 'Hole cards' });
      const board = within(section).getByRole('group', { name: 'Community cards' });
      expect(within(hole).getAllByRole('button')).toHaveLength(2);
      expect(within(board).getAllByRole('button')).toHaveLength(5);
      expect(section.querySelectorAll('.poker-best-card')).toHaveLength(5);
      const best = new Set(entry.best.bestFive.map(cardId));
      const highlighted = [...section.querySelectorAll('.poker-best-card button')].map(button => button.getAttribute('aria-label'));
      expect(new Set(highlighted)).toEqual(new Set(entry.best.bestFive.map(cardLabel)));
      expect(best.size).toBe(5);
      expect(section).toHaveTextContent(`Best five: ${entry.best.bestFive.map(cardLabel).join(', ')}`);
    }
    expect(screen.getByText(/Main pot/)).toHaveTextContent(String(state.result!.pots[0].amount));
    expect(screen.getByRole('table', { name: /equity/i })).toBeInTheDocument();
    expect(screen.getAllByText('Calculating… 0 / 1')).toHaveLength(2);
    const results = screen.getByRole('region', { name: 'Hand result' });
    const awards = within(results).getByRole('heading', { name: 'Pot awards' });
    const graph = within(results).getByRole('region', { name: 'Showdown equity' });
    expect(awards.compareDocumentPosition(graph) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(workers.at(-1)!.requests.filter(request => request.type === 'start')).toHaveLength(4);
    const next = screen.getByRole('button', { name: 'Next hand' });
    expect(next).toBeEnabled();
    await userEvent.setup().click(next);
    expect(screen.queryByRole('table', { name: /equity/i })).not.toBeInTheDocument();
  });

  it.each([0, 1])('highlights %i hole cards when the evaluator selects board-heavy best five', async holeCount => {
    let state: Tournament | undefined;
    let seat = -1;
    for (let seed = 1; seed <= 400 && !state; seed++) {
      const candidate = showdown(seed);
      const entry = candidate.result!.hands.find(hand => hand.hole.filter(card => hand.best.bestFive.some(best => cardId(best) === cardId(card))).length === holeCount);
      if (entry) { state = candidate; seat = entry.seat; }
    }
    expect(state).toBeDefined();
    saveVersioned(POKER_KEY, state!);
    render(<PokerApp />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Resume$/i }));
    const section = screen.getByRole('region', { name: `${state!.players[seat].name} showdown` });
    expect(within(section).getByRole('group', { name: 'Hole cards' }).querySelectorAll('.poker-best-card')).toHaveLength(holeCount);
    expect(within(section).getByRole('group', { name: 'Community cards' }).querySelectorAll('.poker-best-card')).toHaveLength(5 - holeCount);
  });

  it.each([2, 3, 8])('shows blind badges for participating seats at %i-player table even after payout', async count => {
    const state = manyPlayerShowdown(count);
    saveVersioned(POKER_KEY, state);
    render(<PokerApp />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Resume$/i }));
    const seats = screen.getByRole('list', { name: 'Seats' });
    const live = state.hand!.hole.flatMap((hole, seat) => hole ? [seat] : []);
    const small = count === 2 ? state.dealer : live[(live.indexOf(state.dealer) + 1) % live.length];
    const big = live[(live.indexOf(small) + 1) % live.length];
    expect(within(seats.children[small] as HTMLElement).getByText('SB')).toBeInTheDocument();
    expect(within(seats.children[big] as HTMLElement).getByText('BB')).toBeInTheDocument();
    expect(seats.querySelectorAll('.poker-badge')).toHaveLength(2);
  });

  it('does not assign blind badges to seats absent from this hand, regardless of payout stacks', async () => {
    let state: Tournament | undefined;
    for (let seed = 1; seed <= 100 && !state; seed++) {
      let candidate = start(3, 10, seed);
      candidate = tournamentReducer(candidate, { type: 'REVEAL' })!;
      candidate = tournamentReducer(candidate, { type: 'ACT', action: { type: 'FOLD' } })!;
      if (candidate.phase === 'hand') {
        candidate = tournamentReducer(candidate, { type: 'REVEAL' })!;
        candidate = tournamentReducer(candidate, { type: 'ACT', action: { type: legalActions(candidate.hand!.betting).check ? 'CHECK' : 'CALL' } })!;
      }
      if (candidate.phase === 'result' && candidate.stacks.filter(stack => stack > 0).length === 2)
        state = tournamentReducer(candidate, { type: 'NEXT_HAND', seed: 19, bigBlind: 10 })!;
    }
    expect(state).toBeDefined();
    const absent = state!.hand!.hole.findIndex(hole => hole === null);
    expect(absent).toBeGreaterThanOrEqual(0);
    saveVersioned(POKER_KEY, state!);
    render(<PokerApp />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Resume$/i }));
    const seat = screen.getByRole('list', { name: 'Seats' }).children[absent] as HTMLElement;
    expect(within(seat).queryByText(/^(SB|BB)$/)).not.toBeInTheDocument();
  });

  it('shows worker progress at showdown without blocking the next hand', async () => {
    saveVersioned(POKER_KEY, showdown());
    render(<PokerApp />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Resume$/i }));
    const worker = workers.at(-1)!;
    const request = worker.requests.find((entry): entry is Extract<EquityRequest, { type: 'start' }> => entry.type === 'start')!;
    act(() => worker.emit({ type: 'progress', key: request.job.key, processed: 10, total: 44 }));
    expect(screen.getAllByText('Calculating… 10 / 44')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Next hand' })).toBeEnabled();
  });

  it('uses current-round copy in public seats, betting panel, and confirmation without street-bet wording', async () => {
    saveVersioned(POKER_KEY, start());
    render(<PokerApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Resume$/i }));
    expect(screen.getByRole('list', { name: 'Seats' })).toHaveTextContent('Current round bet:');
    expect(document.querySelector('.poker-best-card')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    expect(screen.getByRole('region', { name: 'Betting actions' })).toHaveTextContent('Current round bet:');
    const input = screen.getByRole('spinbutton', { name: 'Bet to current round total' });
    expect(input).toBeInTheDocument();
    await user.type(input, String(legalActions(start().hand!.betting).minTotal));
    await user.click(screen.getByRole('button', { name: /Bet to/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('current round total');
    expect(screen.queryByText(/Street:|street bet|street total/i)).not.toBeInTheDocument();
  });
  it('validates seats and starts an eight-player table with visible chips and an accessible scroll list', async () => {
    roster();
    const user = userEvent.setup();
    render(<PokerApp />);
    expect(screen.getByRole('heading', { name: /Texas Hold’em/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start tournament/i })).toBeDisabled();
    for (const name of names) await user.click(screen.getByRole('checkbox', { name }));
    expect(screen.getByRole('button', { name: /Start tournament/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Start tournament/i }));
    const seats = screen.getByRole('list', { name: /seats/i });
    expect(within(seats).getAllByRole('listitem')).toHaveLength(8);
    expect(screen.getByText(/Pot:/i)).toBeInTheDocument();
    expect(screen.getByText(/Preflop/i)).toBeInTheDocument();
    expect(screen.getByText(/Active blinds:/i)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: /seats/i })).getAllByText(/Contributed:/i)).toHaveLength(8);
  });

  it('adds and renames players in the shared roster without replacing their seat identity', async () => {
    const user = userEvent.setup();
    render(<PokerApp />);
    await user.click(screen.getByRole('button', { name: /Manage players/i }));
    await user.type(screen.getByRole('textbox', { name: /New player name/i }), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const id = JSON.parse(localStorage.getItem(ROSTER_KEY)!).players[0].id;
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.clear(screen.getByRole('textbox', { name: /Rename Alice/i }));
    await user.type(screen.getByRole('textbox', { name: /Rename Alice/i }), 'Alicia');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByRole('checkbox', { name: 'Alicia' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(ROSTER_KEY)!).players[0].id).toBe(id);
  });

  it('adds a validated player inline at setup and seats them from the shared roster', async () => {
    roster(1);
    const user = userEvent.setup();
    render(<PokerApp />);
    await user.type(screen.getByRole('textbox', { name: /Add player name/i }), '  ');
    await user.click(screen.getByRole('button', { name: /^Add player$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i);
    await user.clear(screen.getByRole('textbox', { name: /Add player name/i }));
    await user.type(screen.getByRole('textbox', { name: /Add player name/i }), 'Bob');
    await user.click(screen.getByRole('button', { name: /^Add player$/i }));
    expect(screen.getByRole('checkbox', { name: 'Bob' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Add player name/i }), 'Bob');
    await user.click(screen.getByRole('button', { name: /^Add player$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/already|exists|duplicate/i);
    expect(screen.getAllByRole('checkbox', { name: 'Bob' })).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(ROSTER_KEY)!).players).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Bob' })]));
    await user.click(screen.getByRole('checkbox', { name: 'Alice' }));
    await user.click(screen.getByRole('checkbox', { name: 'Bob' }));
    await user.click(screen.getByRole('button', { name: /Start tournament/i }));
    expect(within(screen.getByRole('list', { name: /Seats/i })).getByText(/^Bob(?: · Dealer)?$/)).toBeInTheDocument();
  });

  it('removes hidden roster players from setup selection before starting', async () => {
    roster(2);
    const user = userEvent.setup();
    render(<PokerApp />);
    await user.click(screen.getByRole('checkbox', { name: 'Alice' }));
    await user.click(screen.getByRole('checkbox', { name: 'Bob' }));
    expect(screen.getByRole('button', { name: /Start tournament/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Manage players/i }));
    const alice = screen.getByText('Alice').closest('li')!;
    await user.click(within(alice).getByRole('button', { name: /Hide/i }));
    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.queryByRole('checkbox', { name: 'Alice' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Bob' })).toBeChecked();
    expect(screen.getByRole('button', { name: /Start tournament/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Manage players/i }));
    await user.click(screen.getByRole('button', { name: /Hidden players/i }));
    await user.click(screen.getByRole('button', { name: /Unhide/i }));
    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByRole('checkbox', { name: 'Alice' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Start tournament/i })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Alice' }));
    await user.click(screen.getByRole('button', { name: /Start tournament/i }));
    expect(within(screen.getByRole('list', { name: /Seats/i })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('hides hole card text before reveal, reveals only the acting hand, and confirms a current-round bet', async () => {
    const state = start(3);
    save(state);
    const user = userEvent.setup();
    render(<PokerApp />);
    await user.click(screen.getByRole('button', { name: /^Resume$/i }));
    const own = state.hand!.hole[state.current!]!.map(cardLabel);
    const other = state.hand!.hole[(state.current! + 1) % 3]!.map(cardLabel);
    for (const label of [...own, ...other]) expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    for (const label of own) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    for (const label of other) expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    const legal = legalActions(state.hand!.betting);
    await user.type(screen.getByRole('spinbutton', { name: /current round total/i }), String(legal.minTotal));
    await user.click(screen.getByRole('button', { name: /Bet to/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(String(legal.minTotal));
    await user.click(within(dialog).getByRole('button', { name: /Confirm/i }));
    for (const label of own) expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
  });

  it('reloads a revealed hand behind both resume and handoff gates without private card text', async () => {
    const state = tournamentReducer(start(), { type: 'REVEAL' })!;
    save(state);
    const secret = state.hand!.hole[state.current!]!.map(cardLabel);
    const user = userEvent.setup();
    render(<PokerApp />);
    for (const label of secret) expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Resume$/i }));
    for (const label of secret) expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    for (const label of secret) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('shows both showdown hands, their actual best five, the winner and pot breakdown', async () => {
    const state = showdown();
    save(state);
    render(<PokerApp />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Resume$/i }));
    for (const entry of state.result!.hands) {
      const section = screen.getByRole('region', { name: `${state.players[entry.seat].name} showdown` });
      for (const card of entry.hole) expect(within(section).getAllByRole('button', { name: cardLabel(card) }).length).toBeGreaterThan(0);
      expect(section.querySelectorAll('.poker-best-card')).toHaveLength(5);
      for (const card of entry.best.bestFive) expect(section).toHaveTextContent(cardLabel(card));
      expect(section).toHaveTextContent(entry.best.label);
    }
    const winners = state.result!.pots[0].winners.map(i => state.players[i].name).join(', ');
    expect(screen.getByText(new RegExp(`Main pot.*${winners}`))).toBeInTheDocument();
    expect(screen.getByText(`Pot: ${state.result!.pots.reduce((sum, pot) => sum + pot.amount, 0)}`)).toBeInTheDocument();
  });

  it('reports ties and side-pot winners with payouts', async () => {
    const state = showdown();
    const total = state.result!.pots[0].amount;
    state.result = { ...state.result!, winnerSeats: [0, 1], pots: [
      { amount: total - 10, eligible: [0, 1], winners: [0, 1] },
      { amount: 10, eligible: [1], winners: [1] },
    ] };
    save(state);
    render(<PokerApp />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Resume$/i }));
    expect(screen.getByText(/Main pot.*Alice.*Bob/i)).toBeInTheDocument();
    expect(screen.getByText(/Side pot 1.*Bob/i)).toBeInTheDocument();
    expect(screen.getByText(/Payout.*Alice/i)).toBeInTheDocument();
  });

  it('labels an actual two-player showdown tie from the dealt board', async () => {
    let tied: Tournament | undefined;
    for (let seed = 1; seed <= 400 && !tied; seed++) {
      const candidate = showdown(seed);
      if (candidate.result!.pots[0].winners.length === 2) tied = candidate;
    }
    expect(tied).toBeDefined();
    save(tied!);
    render(<PokerApp />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Resume$/i }));
    const award = screen.getByText(/Main pot.*tie/i);
    expect(award).toHaveTextContent('Alice');
    expect(award).toHaveTextContent('Bob');
    expect(screen.getByRole('region', { name: /Alice showdown/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Bob showdown/i })).toBeInTheDocument();
  });

  it('never shows hole cards on an uncontested result although the engine retains them', async () => {
    let state = start();
    state = tournamentReducer(state, { type: 'REVEAL' })!;
    state = tournamentReducer(state, { type: 'ACT', action: { type: 'FOLD' } })!;
    expect(state.result?.kind).toBe('uncontested');
    const secret = state.hand!.hole.flatMap(cards => cards ?? []).map(cardLabel);
    save(state);
    render(<PokerApp />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Resume$/i }));
    expect(screen.getByText(/wins uncontested/i)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Best five' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Community cards' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /equity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /equity/i })).not.toBeInTheDocument();
    expect(document.querySelector('.poker-best-card')).not.toBeInTheDocument();
    for (const label of secret) expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
  });

  it('shows changed blinds only as next-hand settings, even during a handoff', async () => {
    save(start());
    const user = userEvent.setup();
    render(<PokerApp />);
    expect(screen.getByRole('button', { name: /Blinds/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Blinds/i }));
    await user.clear(screen.getByRole('spinbutton', { name: /Next hand big blind/i }));
    await user.type(screen.getByRole('spinbutton', { name: /Next hand big blind/i }), '20');
    await user.click(screen.getByRole('button', { name: /Save blinds/i }));
    await user.click(screen.getByRole('button', { name: /^Resume$/i }));
    expect(screen.getByText(/Active blinds: 5 \/ 10/i)).toBeInTheDocument();
    expect(screen.getByText(/Next hand big blind: 20/i)).toBeInTheDocument();
  });

  it('applies a pending blind in memory when settings cannot be saved, including the next hand', async () => {
    save(showdown());
    const user = userEvent.setup();
    render(<PokerApp />);
    await user.click(screen.getByRole('button', { name: /^Resume$/i }));
    await user.click(screen.getByRole('button', { name: /^Blinds$/i }));
    await user.clear(screen.getByRole('spinbutton', { name: /Next hand big blind/i }));
    await user.type(screen.getByRole('spinbutton', { name: /Next hand big blind/i }), '20');
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === SETTINGS_KEY) throw new Error('quota');
      return original.call(this, key, value);
    });
    await user.click(screen.getByRole('button', { name: /Save blinds/i }));
    expect(screen.getByRole('status')).toHaveTextContent(SETTINGS_KEY);
    expect(screen.getByText(/Next hand big blind: 20/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Next hand big blind/i })).toHaveValue(20);
    expect(screen.getByRole('alert')).toHaveTextContent(/not saved/i);
    await user.click(screen.getByRole('button', { name: /Next hand/i }));
    expect(screen.getByText(/Active blinds: 10 \/ 20/i)).toBeInTheDocument();
    expect(screen.getByText(/Next hand big blind: 20/i)).toBeInTheDocument();
  });

  it('retries a failed blind edit when storage recovers and clears its warning', async () => {
    save(start());
    const user = userEvent.setup();
    render(<PokerApp />);
    await user.click(screen.getByRole('button', { name: /^Blinds$/i }));
    await user.clear(screen.getByRole('spinbutton', { name: /Next hand big blind/i }));
    await user.type(screen.getByRole('spinbutton', { name: /Next hand big blind/i }), '20');
    const original = Storage.prototype.setItem;
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === SETTINGS_KEY) throw new Error('quota');
      return original.call(this, key, value);
    });
    await user.click(screen.getByRole('button', { name: /Save blinds/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/not saved/i);
    failure.mockRestore();
    await user.click(screen.getByRole('button', { name: /Save blinds/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).bigBlind).toBe(20);
  });

  it('shows a paid all-in showdown winner as no longer all-in after reload', async () => {
    let state = start(2, 10, 19);
    state = tournamentReducer(state, { type: 'REVEAL' })!;
    state = tournamentReducer(state, { type: 'ACT', action: { type: 'CALL' } })!;
    save(state);
    render(<PokerApp />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Resume$/i }));
    const winner = state.stacks.findIndex(stack => stack > 0);
    expect(winner).toBeGreaterThanOrEqual(0);
    expect(within(screen.getByRole('list', { name: /Seats/i }).children[winner] as HTMLElement).queryByText('All in')).not.toBeInTheDocument();
  });

  it('requires confirmation to abandon and warns when removing saved progress fails', async () => {
    save(start());
    const user = userEvent.setup();
    render(<PokerApp />);
    await user.click(screen.getByRole('button', { name: /^Resume$/i }));
    await user.click(screen.getByRole('button', { name: /New tournament/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const original = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
      if (key === POKER_KEY) throw new Error('denied');
      return original.call(this, key);
    });
    await user.click(screen.getByRole('button', { name: /New tournament/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Abandon/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(POKER_KEY));
    expect(screen.getByRole('button', { name: /Start tournament/i })).toBeInTheDocument();
  });

  it('presents a tournament champion after the last opponent busts', async () => {
    let seed = 19;
    let state = showdown(seed, 10);
    for (let candidate = 1; candidate <= 100 && state.stacks.filter(stack => stack > 0).length !== 1; candidate++) {
      seed = candidate;
      state = showdown(seed, 10);
    }
    expect(state.stacks.filter(stack => stack > 0)).toHaveLength(1);
    save(start(2, 10, seed));
    expect(loadPoker()).not.toBeNull();
    const user = userEvent.setup();
    render(<PokerApp />);
    await user.click(screen.getByRole('button', { name: /^Resume$/i }));
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    await user.click(screen.getByRole('button', { name: /Call/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Confirm Call/i }));
    await user.click(screen.getByRole('button', { name: /Finish tournament/i }));
    expect(screen.getByRole('heading', { name: /Champion/i })).toHaveTextContent(state.players[state.stacks.findIndex(s => s > 0)].name);
  });
});
