import type { SeatPlayer } from '../engine/game';
import { winningSeats } from '../engine/scoring';

interface ScoreboardProps {
  players: readonly SeatPlayer[];
  roundScores: readonly number[][];
  totals: readonly number[];
  moonRounds?: readonly (number | null)[];
}

export function Scoreboard({ players, roundScores, totals, moonRounds = [] }: ScoreboardProps) {
  const best = winningSeats(totals);
  return (
    <table className="scores">
      <thead>
        <tr>
          <th>Player</th>
          {roundScores.map((_, i) => (
            <th key={i}>R{i + 1}</th>
          ))}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {players.map((player, seat) => (
          <tr key={player.id}>
            <td>{player.name}</td>
            {roundScores.map((round, i) => (
              <td key={i}>
                {round[seat]}
                {moonRounds[i] === seat ? ' 🌙' : ''}
              </td>
            ))}
            <td className={best.includes(seat) ? 'best' : undefined}>{totals[seat]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
