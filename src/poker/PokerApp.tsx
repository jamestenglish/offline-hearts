import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PrivacyScreen } from '../components/PrivacyScreen';
import { PlayersScreen } from '../screens/PlayersScreen';
import { CardView } from '../shared/CardView';
import { activePlayers } from '../shared/roster';
import { useRoster } from '../shared/useRoster';
import { getSaveFailures, subscribeToSaveFailures } from '../shared/storage';
import { newId, randomSeed } from '../random';
import { legalActions, type BetAction } from './engine/betting';
import type { Tournament } from './engine/tournament';
import { loadSettings, saveSettings, usePoker } from './state';
import './poker.css';

function Cards({ cards }: { cards: NonNullable<Tournament['hand']>['board'] }) {
  return <div className="poker-cards">{cards.map(card => <CardView key={`${card.rank}-${card.suit}`} card={card} />)}</div>;
}

function Table({ state }: { state: Tournament }) {
  const hand = state.hand;
  return <section className="poker-table" aria-label="Public table">
    <p>Hand {state.handNumber} · {state.street ?? 'Finished'}</p>
    {hand && <>
      <p>Active blinds: {hand.smallBlind} / {hand.bigBlind}</p>
      <p>Pot: {state.phase === 'result' ? state.result!.pots.reduce((sum, pot) => sum + pot.amount, 0) : hand.betting.seats.reduce((sum, seat) => sum + seat.committed, 0)}</p>
      <div aria-label="Board"><Cards cards={hand.board} /></div>
    </>}
    <ul className="poker-seats" aria-label="Seats">
      {state.players.map((player, index) => <li key={player.id} className={state.current === index ? 'poker-current' : ''}>
        <strong>{player.name}{state.dealer === index ? ' · Dealer' : ''}</strong>
        <span>Stack: {state.stacks[index]}</span>
        {hand && <span>Contributed: {hand.betting.seats[index].committed} · Street: {hand.betting.seats[index].streetBet}</span>}
        {hand?.betting.seats[index].folded && <span>Folded</span>}
        {hand?.betting.seats[index].allIn && !hand.betting.seats[index].folded && <span>All in</span>}
      </li>)}
    </ul>
  </section>;
}

function Results({ state }: { state: Tournament }) {
  const result = state.result!;
  const name = (seat: number) => state.players[seat].name;
  const payouts = new Map<number, number>();
  for (const pot of result.pots) {
    const winners = [...pot.winners].sort((a, b) =>
      (a - state.dealer - 1 + state.players.length) % state.players.length -
      (b - state.dealer - 1 + state.players.length) % state.players.length);
    winners.forEach((seat, index) => payouts.set(seat, (payouts.get(seat) ?? 0) +
      Math.floor(pot.amount / winners.length) + (index < pot.amount % winners.length ? 1 : 0)));
  }
  return <section className="poker-results" aria-label="Hand result">
    <h2>{result.kind === 'uncontested' ? `${name(result.winnerSeats[0])} wins uncontested` : 'Showdown'}</h2>
    {result.kind === 'showdown' && result.hands.map(entry => <section key={entry.seat} aria-label={`${name(entry.seat)} showdown`} className="poker-showdown-hand">
      <h3>{name(entry.seat)} · {entry.best.label}</h3>
      <p>Hole cards</p><Cards cards={entry.hole} />
      <div role="group" aria-label="Best five"><span>Best five</span><Cards cards={entry.best.bestFive} /></div>
    </section>)}
    <h3>Pot awards</h3>
    <ul>{result.pots.map((pot, index) => <li key={index}>
      {index === 0 ? 'Main pot' : `Side pot ${index}`} · {pot.amount} · {pot.winners.map(name).join(', ')}
      {pot.winners.length > 1 && ' (tie)'}
    </li>)}</ul>
    <ul>{[...payouts].map(([seat, amount]) => <li key={seat}>Payout: {name(seat)} +{amount}</li>)}</ul>
  </section>;
}

function ActionPanel({ state, onAct }: { state: Tournament; onAct: (action: BetAction) => void }) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<BetAction | null>(null);
  const legal = legalActions(state.hand!.betting);
  const total = Number(draft);
  const validTotal = draft.trim() !== '' && Number.isSafeInteger(total) && legal.minTotal !== null && total >= legal.minTotal && total <= legal.maxTotal;
  const actionName = (action: BetAction) => action.type === 'BET_TO' ? `Bet to ${action.total} street total` :
    action.type === 'ALL_IN' ? `All in for ${legal.maxTotal}` : action.type === 'CALL' ? `Call ${legal.call}` :
    action.type === 'CHECK' ? 'Check' : 'Fold';
  return <section className="poker-actions" aria-label="Betting actions">
    <h2>{state.players[state.current!].name}'s turn</h2>
    <div role="group" aria-label="Your hole cards"><Cards cards={state.hand!.hole[state.current!]!} /></div>
    <p>To call: {legal.call ?? 0} · Current street bet: {state.hand!.betting.currentBet}</p>
    <div className="row">
      <button className="btn" disabled={!legal.check} onClick={() => setPending({ type: 'CHECK' })}>Check</button>
      <button className="btn" disabled={legal.call === null} onClick={() => setPending({ type: 'CALL' })}>Call {legal.call ?? ''}</button>
      <button className="btn secondary" disabled={!legal.fold} onClick={() => setPending({ type: 'FOLD' })}>Fold</button>
      <button className="btn" disabled={!legal.allIn} onClick={() => setPending({ type: 'ALL_IN' })}>All in</button>
    </div>
    <label className="field">Bet to street total
      <input type="number" inputMode="numeric" min={legal.minTotal ?? undefined} max={legal.maxTotal} step="1" value={draft} onChange={e => setDraft(e.target.value)} aria-label="Bet to street total" disabled={legal.minTotal === null} />
    </label>
    <p>Minimum street total: {legal.minTotal ?? 'Unavailable'} · Maximum: {legal.maxTotal}</p>
    <button className="btn" disabled={!validTotal} onClick={() => setPending({ type: 'BET_TO', total })}>Bet to {draft || '…'}</button>
    {pending && <ConfirmDialog message={`Confirm ${actionName(pending)} for ${state.players[state.current!].name}?`} confirmLabel={`Confirm ${actionName(pending)}`} onCancel={() => setPending(null)} onConfirm={() => { onAct(pending); setPending(null); setDraft(''); }} />}
  </section>;
}

function BlindEditor({ value, onSave }: { value: number; onSave: (value: number) => boolean }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  const number = Number(draft);
  return <form className="poker-blinds field" onSubmit={(event: FormEvent) => { event.preventDefault(); if (draft.trim() && Number.isSafeInteger(number) && number > 0) setError(!onSave(number)); }}>
    <label htmlFor="poker-blind-value">Next hand big blind</label>
    <input id="poker-blind-value" type="number" inputMode="numeric" min="1" step="1" value={draft} onChange={e => { setDraft(e.target.value); setError(false); }} />
    {error && <p role="alert" className="error">Blinds not saved. Retry when storage is available.</p>}
    <button className="btn small" disabled={!draft.trim() || !Number.isSafeInteger(number) || number < 1} type="submit">Save blinds</button>
  </form>;
}

export function PokerApp() {
  const { state, dispatch, resumable } = usePoker();
  const roster = useRoster();
  const failed = useSyncExternalStore(subscribeToSaveFailures, getSaveFailures);
  const [settings, setSettings] = useState(() => loadSettings().bigBlind);
  const [editingBlinds, setEditingBlinds] = useState(false);
  const [view, setView] = useState<'table' | 'players'>('table');
  const [selected, setSelected] = useState<string[]>([]);
  const [stack, setStack] = useState('1000');
  const [askResume, setAskResume] = useState(resumable);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const active = activePlayers(roster.players);
  useEffect(() => {
    const ids = new Set(roster.players.filter(player => !player.archived).map(player => player.id));
    setSelected(old => old.every(id => ids.has(id)) ? old : old.filter(id => ids.has(id)));
  }, [roster.players]);
  const eligible = selected.filter(id => active.some(player => player.id === id));
  const chips = Number(stack);
  const validSetup = eligible.length >= 2 && eligible.length <= 8 && Number.isSafeInteger(chips) && chips >= settings && Number.isSafeInteger(chips * eligible.length);

  const content = view === 'players' ? <PlayersScreen roster={roster.players} onAdd={roster.add} onRename={roster.rename} onArchive={roster.archive} onBack={() => setView('table')} /> :
    askResume && state ? <div className="poker-gate"><h1>Texas Hold’em</h1><p>Tournament in progress. Pass the device privately before continuing.</p>
      <button className="btn" onClick={() => setAskResume(false)}>Resume</button>
      <button className="btn secondary" onClick={() => setConfirmAbandon(true)}>New tournament</button></div> :
    !state ? <section className="poker-setup">
      <h1>Texas Hold’em</h1><p>Choose 2–8 players from the shared roster.</p>
      <button className="btn secondary" onClick={() => setView('players')}>Manage players</button>
      <div className="poker-picks">{active.map(player => <label key={player.id}><input type="checkbox" checked={eligible.includes(player.id)} disabled={!eligible.includes(player.id) && eligible.length === 8} onChange={e => setSelected(e.target.checked ? [...eligible, player.id] : eligible.filter(id => id !== player.id))} />{player.name}</label>)}</div>
      <label className="field">Starting chips<input type="number" min={settings} step="1" inputMode="numeric" value={stack} onChange={e => setStack(e.target.value)} /></label>
      <button className="btn" disabled={!validSetup} onClick={() => {
        if (!validSetup) return;
        const seats = eligible.map(id => active.find(player => player.id === id)).filter((player): player is (typeof active)[number] => player !== undefined);
        if (seats.length !== eligible.length) return;
        dispatch({ type: 'START', players: seats.map(({ id, name }) => ({ id, name })), stack: chips, bigBlind: settings, id: newId(), seed: randomSeed() });
      }}>Start tournament</button>
    </section> : <>
      <div className="poker-toolbar"><button className="btn small secondary" onClick={() => setConfirmAbandon(true)}>New tournament</button></div>
      <Table state={state} />
      {state.phase === 'hand' && state.current !== null && (state.holeRevealed ?
        <ActionPanel key={`${state.handNumber}-${state.street}-${state.current}`} state={state} onAct={action => dispatch({ type: 'ACT', action })} /> :
        <PrivacyScreen message={`Pass to ${state.players[state.current].name}. Hole cards are hidden.`} buttonLabel={`Reveal ${state.players[state.current].name}'s cards`} onReveal={() => dispatch({ type: 'REVEAL' })} />)}
      {state.result && <Results state={state} />}
      {state.phase === 'result' && <button className="btn" onClick={() => dispatch({ type: 'NEXT_HAND', bigBlind: settings, seed: randomSeed() })}>{state.stacks.filter(value => value > 0).length === 1 ? 'Finish tournament' : 'Next hand'}</button>}
      {state.phase === 'finished' && <h2>Champion: {state.players[state.stacks.findIndex(value => value > 0)].name}</h2>}
    </>;

  return <main className="screen poker-app">
    {failed && <p role="status" className="save-warning">Progress not saved ({failed}). Keep this page open; try another action when storage is available.</p>}
    <div className="poker-settings"><button className="btn small secondary" onClick={() => setEditingBlinds(value => !value)} aria-expanded={editingBlinds}>Blinds</button>
      <span>Next hand big blind: {settings}</span>
      {editingBlinds && <BlindEditor value={settings} onSave={value => {
        if (!saveSettings(value)) return false;
        setSettings(value);
        setEditingBlinds(false);
        return true;
      }} />}
    </div>
    {content}
    {confirmAbandon && <ConfirmDialog message="Abandon this tournament? This cannot be undone." confirmLabel="Abandon" onCancel={() => setConfirmAbandon(false)} onConfirm={() => { dispatch({ type: 'ABANDON' }); setAskResume(false); setConfirmAbandon(false); setSelected([]); }} />}
  </main>;
}
