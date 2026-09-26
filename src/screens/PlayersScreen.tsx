import { type FormEvent, useState } from 'react';
import { activePlayers, type Player, type RosterResult } from '../engine/roster';

interface PlayersScreenProps {
  roster: readonly Player[];
  onAdd: (name: string) => RosterResult;
  onRename: (id: string, name: string) => RosterResult;
  onArchive: (id: string, archived: boolean) => void;
  onBack: () => void;
}

export function PlayersScreen({ roster, onAdd, onRename, onArchive, onBack }: PlayersScreenProps) {
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const active = activePlayers(roster);
  const hidden = roster.filter(p => p.archived);

  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    const result = onAdd(newName);
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    setNewName('');
    setAddError(null);
  };

  const startEdit = (player: Player) => {
    setEditingId(player.id);
    setEditName(player.name);
    setEditError(null);
  };

  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    const result = onRename(editingId, editName);
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setEditingId(null);
    setEditError(null);
  };

  return (
    <div className="screen">
      <div className="header" style={{ width: '100%', maxWidth: 420 }}>
        <button type="button" className="btn small secondary" onClick={onBack}>
          ← Back
        </button>
        <h2 className="title">Players</h2>
        <span />
      </div>

      <form className="field" onSubmit={submitAdd}>
        <div className="row">
          <input aria-label="New player name" value={newName} onChange={e => setNewName(e.target.value)} />
          <button type="submit" className="btn small">
            Add
          </button>
        </div>
        {addError && <div className="error">{addError}</div>}
      </form>

      <ul className="list">
        {active.map(player =>
          editingId === player.id ? (
            <li key={player.id}>
              <form className="row grow" onSubmit={submitEdit}>
                <input
                  aria-label={`Rename ${player.name}`}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn small">
                  Save
                </button>
                <button type="button" className="btn small secondary" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
                {editError && <div className="error">{editError}</div>}
              </form>
            </li>
          ) : (
            <li key={player.id}>
              <span className="grow">{player.name}</span>
              <button type="button" className="btn small secondary" onClick={() => startEdit(player)}>
                Rename
              </button>
              <button type="button" className="btn small secondary" onClick={() => onArchive(player.id, true)}>
                Hide
              </button>
            </li>
          ),
        )}
        {active.length === 0 && <li>No players yet. Add some above.</li>}
      </ul>

      {hidden.length > 0 && (
        <>
          <button type="button" className="btn small secondary" onClick={() => setShowHidden(v => !v)}>
            Hidden players ({hidden.length})
          </button>
          {showHidden && (
            <ul className="list">
              {hidden.map(player => (
                <li key={player.id}>
                  <span className="grow">{player.name}</span>
                  <button type="button" className="btn small secondary" onClick={() => onArchive(player.id, false)}>
                    Unhide
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
