import type { GameRecord } from './history';
import type { Player } from './roster';

export interface PlayerStats {
  playerId: string;
  name: string;
  games: number;
  wins: number;
  ties: number;
  moons: number;
  perfect: number;
}

export function computeStats(records: readonly GameRecord[], roster: readonly Player[]): PlayerStats[] {
  const byId = new Map<string, PlayerStats>();
  const chronological = [...records].sort((a, b) => a.finishedAt - b.finishedAt);

  for (const record of chronological) {
    for (const seat of record.seats) {
      const stats = byId.get(seat.playerId) ?? {
        playerId: seat.playerId, name: seat.name, games: 0, wins: 0, ties: 0, moons: 0, perfect: 0,
      };
      stats.name = seat.name;
      stats.games += 1;
      if (record.winners.includes(seat.playerId)) {
        stats.wins += 1;
        if (record.tie) stats.ties += 1;
      }
      stats.moons += record.moonShooters.filter(id => id === seat.playerId).length;
      if (record.perfect.includes(seat.playerId)) stats.perfect += 1;
      byId.set(seat.playerId, stats);
    }
  }

  const currentNames = new Map(roster.map(p => [p.id, p.name]));
  return [...byId.values()]
    .map(s => ({ ...s, name: currentNames.get(s.playerId) ?? s.name }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name));
}
