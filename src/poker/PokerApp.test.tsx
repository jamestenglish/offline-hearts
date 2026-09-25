import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cardLabel } from '../shared/cards';
import { ROSTER_KEY, saveVersioned } from '../shared/storage';
import { legalActions } from './engine/betting';
import { tournamentReducer, type Tournament } from './engine/tournament';
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

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); saveVersioned(POKER_KEY, start()); localStorage.removeItem(POKER_KEY); });

describe('PokerApp', () => {
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

  it('hides hole card text before reveal, reveals only the acting hand, and confirms a street-total bet', async () => {
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
    await user.type(screen.getByRole('spinbutton', { name: /street total/i }), String(legal.minTotal));
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
      const best = within(section).getByRole('group', { name: /Best five/i });
      expect(within(best).getAllByRole('button')).toHaveLength(5);
      for (const card of entry.best.bestFive) expect(within(best).getByRole('button', { name: cardLabel(card) })).toBeInTheDocument();
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

  it('keeps the effective blind and editor open when settings cannot be saved, including the next hand', async () => {
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
    expect(screen.getByText(/Next hand big blind: 10/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Next hand big blind/i })).toHaveValue(20);
    expect(screen.getByRole('alert')).toHaveTextContent(/not saved/i);
    await user.click(screen.getByRole('button', { name: /Next hand/i }));
    expect(screen.getByText(/Active blinds: 5 \/ 10/i)).toBeInTheDocument();
    expect(screen.getByText(/Next hand big blind: 10/i)).toBeInTheDocument();
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
