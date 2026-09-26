import { useState } from 'react';
import type { GameRecord } from '../engine/history';
import type { Player } from '../engine/roster';
import { computeStats } from '../engine/stats';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Scoreboard } from '../components/Scoreboard';

interface StatsScreenProps {
  records: readonly GameRecord[];
  roster: readonly Player[];
  onClear: () => void;
  onBack: () => void;
}

export function StatsScreen({ records, roster, onClear, onBack }: StatsScreenProps) {
  const [confirming, setConfirming] = useState(false);
  const stats = computeStats(records, roster);
  const newestFirst = [...records].sort((a, b) => b.finishedAt - a.finishedAt);

  return (
    <div className="screen">
      <div className="header" style={{ width: '100%', maxWidth: 420 }}>
        <button type="button" className="btn small secondary" onClick={onBack}>
          ← Back
        </button>
        <h2 className="title">Stats</h2>
        <span />
      </div>

      {stats.length === 0 ? (
        <p className="message">No games played yet.</p>
      ) : (
        <table className="scores">
          <thead>
            <tr>
              <th>Player</th>
              <th>Games</th>
              <th>Wins</th>
              <th>Ties</th>
              <th>🌙</th>
              <th>💯</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.playerId}>
                <td>{s.name}</td>
                <td>{s.games}</td>
                <td>{s.wins}</td>
                <td>{s.ties}</td>
                <td>{s.moons}</td>
                <td>{s.perfect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {newestFirst.map(record => {
        const seats = record.seats.map(seat => ({ id: seat.playerId, name: seat.name }));
        const moonRounds = record.moonShooters.map(id =>
          id === null ? null : record.seats.findIndex(seat => seat.playerId === id),
        );
        return (
          <details key={record.gameId} className="game-log">
            <summary>
              {new Date(record.finishedAt).toLocaleString()} —{' '}
              {record.seats
                .map((seat, i) => `${seat.name} ${record.totals[i]}${record.winners.includes(seat.playerId) ? ' 🏆' : ''}`)
                .join(', ')}
            </summary>
            <Scoreboard players={seats} roundScores={record.roundScores} totals={record.totals} moonRounds={moonRounds} />
          </details>
        );
      })}

      {records.length > 0 && (
        <button type="button" className="btn small secondary" onClick={() => setConfirming(true)}>
          Clear history
        </button>
      )}

      {confirming && (
        <ConfirmDialog
          message="Delete all game history?"
          confirmLabel="Delete"
          onConfirm={() => {
            onClear();
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
