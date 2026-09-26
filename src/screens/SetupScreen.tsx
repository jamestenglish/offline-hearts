import { type FormEvent, useState } from 'react';
import type { SeatPlayer } from '../engine/game';
import { activePlayers, type Player, type RosterResult } from '../engine/roster';

const NEW_PLAYER = '__new__';

interface SetupScreenProps {
  roster: readonly Player[];
  onAddPlayer: (name: string) => RosterResult;
  onStart: (players: SeatPlayer[]) => void;
  onOpenPlayers: () => void;
  onOpenStats: () => void;
}

export function SetupScreen({ roster, onAddPlayer, onStart, onOpenPlayers, onOpenStats }: SetupScreenProps) {
  const [seats, setSeats] = useState<string[]>(['', '', '', '']);
  const [adding, setAdding] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const active = activePlayers(roster);

  const setSeat = (index: number, id: string) => setSeats(prev => prev.map((v, i) => (i === index ? id : v)));

  const onSelect = (index: number, value: string) => {
    if (value === NEW_PLAYER) {
      setAdding(index);
      setNewName('');
      setError(null);
      return;
    }
    if (adding === index) setAdding(null);
    setSeat(index, value);
  };

  const submitNew = (event: FormEvent) => {
    event.preventDefault();
    if (adding === null) return;
    const result = onAddPlayer(newName);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSeat(adding, result.player.id);
    setAdding(null);
    setError(null);
  };

  const byId = new Map(active.map(p => [p.id, p]));
  const ready = adding === null && seats.every(id => byId.has(id)) && new Set(seats).size === 4;

  const start = () => {
    if (!ready) return;
    onStart(seats.map(id => ({ id, name: byId.get(id)!.name })));
  };

  return (
    <div className="screen">
      <h1 className="title">♥ Offline Hearts ♠</h1>
      {seats.map((id, index) => (
        <div className="field" key={index}>
          <label htmlFor={`seat-${index}`}>Seat {index + 1}</label>
          <select id={`seat-${index}`} value={adding === index ? NEW_PLAYER : id} onChange={e => onSelect(index, e.target.value)}>
            <option value="">Choose player…</option>
            {active.map(player => (
              <option key={player.id} value={player.id} disabled={seats.includes(player.id) && id !== player.id}>
                {player.name}
              </option>
            ))}
            <option value={NEW_PLAYER}>+ New player…</option>
          </select>
          {adding === index && (
            <form className="row" onSubmit={submitNew}>
              <input
                aria-label="New player name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn small">
                Add
              </button>
              <button type="button" className="btn small secondary" onClick={() => setAdding(null)}>
                Cancel
              </button>
            </form>
          )}
          {adding === index && error && <div className="error">{error}</div>}
        </div>
      ))}
      <button type="button" className="btn" disabled={!ready} onClick={start}>
        Start Game
      </button>
      <div className="row">
        <button type="button" className="btn small secondary" onClick={onOpenPlayers}>
          Players
        </button>
        <button type="button" className="btn small secondary" onClick={onOpenStats}>
          Stats
        </button>
      </div>
    </div>
  );
}
