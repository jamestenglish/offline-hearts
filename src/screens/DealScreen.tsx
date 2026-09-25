import { type CSSProperties, useEffect, useRef } from 'react';
import type { SeatPlayer } from '../engine/game';

const DEAL_MS = 1700;
const SEAT_VECTORS: readonly [number, number][] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

interface DealScreenProps {
  players: readonly SeatPlayer[];
  onDone: () => void;
}

export function DealScreen({ players, onDone }: DealScreenProps) {
  const done = useRef(onDone);
  const completed = useRef(false);
  done.current = onDone;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!completed.current) {
        completed.current = true;
        done.current();
      }
    }, DEAL_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="screen">
      <p className="message">Shuffling and dealing…</p>
      <div className="deal-area">
        {Array.from({ length: 52 }, (_, i) => {
          const [x, y] = SEAT_VECTORS[i % 4];
          const style = {
            '--x': x,
            '--y': y,
            '--rot': `${((i % 7) - 3) * 4}deg`,
            animationDelay: `${i * 25}ms`,
          } as CSSProperties;
          return <div key={i} className="card-back deal-card" style={style} />;
        })}
        {players.map((player, seat) => (
          <div key={player.id} className={`seat-label seat-${seat}`}>
            <div className="name">{player.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
