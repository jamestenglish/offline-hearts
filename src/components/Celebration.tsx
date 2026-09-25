import { type CSSProperties, useMemo } from 'react';

export const MOON_EMOJIS: readonly string[] = ['🌙', '🚀', '⭐', '🌕', '✨'];
export const PERFECT_EMOJIS: readonly string[] = ['🎉', '💯', '✨', '🏆', '🥳'];

interface CelebrationProps {
  emojis: readonly string[];
  count?: number;
}

export function Celebration({ emojis, count = 40 }: CelebrationProps) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        emoji: emojis[i % emojis.length],
        style: {
          '--x': `${Math.random() * 100}%`,
          '--size': `${1.6 + Math.random() * 1.8}rem`,
          '--delay': `${Math.random() * 0.8}s`,
          '--dur': `${1.8 + Math.random() * 1.2}s`,
          '--rot': `${Math.random() * 720 - 360}deg`,
        } as CSSProperties,
      })),
    [emojis, count],
  );
  return (
    <div className="celebration" aria-hidden="true">
      {pieces.map((piece, i) => (
        <span key={i} style={piece.style}>
          {piece.emoji}
        </span>
      ))}
    </div>
  );
}
