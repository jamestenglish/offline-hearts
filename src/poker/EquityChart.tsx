import type { useEquity } from './useEquity';

type Points = ReturnType<typeof useEquity>;
const phases = ['preflop', 'flop', 'turn', 'river'] as const;
const colors = ['#f6c453', '#76d6e6', '#ed9bc6', '#a4e49e', '#d5adff', '#ffa88e', '#faf2a0', '#a3b9ff'];
const x = (index: number) => 42 + index * 98;
const percent = (share: number) => `${Number((share * 100).toFixed(4))}%`;
const value = (point: Points[typeof phases[number]], index: number) => point?.shares
  ? percent(point.shares[index]) : point?.error ?? (point ? `Calculating… ${point.processed} / ${point.total}` : 'Unavailable');

export function EquityChart({ players, points }: { players: readonly { seat: number; name: string }[]; points: Points }) {
  return <section className="poker-equity" aria-label="Showdown equity">
    <h3>Equity by street</h3>
    <svg role="img" aria-label="Equity by street graph; exact values in table below" viewBox="0 0 360 180">
      {[0, 50, 100].map(tick => <g key={tick}>
        <line x1="40" x2="340" y1={160 - 1.4 * tick} y2={160 - 1.4 * tick} className="poker-equity-grid" />
        <text x="0" y={164 - 1.4 * tick}>{tick}%</text>
      </g>)}
      {phases.map((phase, index) => <text key={phase} x={x(index)} y="178" textAnchor="middle">{phase[0].toUpperCase() + phase.slice(1)}</text>)}
      {players.map((player, index) => {
        const finished = phases.flatMap((phase, phaseIndex) => points[phase]?.shares
          ? [{ phase, x: x(phaseIndex), y: Number((160 - 140 * points[phase]!.shares![index]).toFixed(4)) }] : []);
        return <g key={player.seat} className={`poker-equity-series poker-equity-series-${index % 4}`} stroke={colors[index % colors.length]}>
          {finished.length > 0 && <polyline fill="none" strokeWidth="2.5" points={finished.map(({ x: px, y }) => `${px},${y}`).join(' ')} />}
          {finished.map(({ phase, x: px, y }) => <circle key={phase} cx={px} cy={y} r="4" fill={colors[index % colors.length]} strokeDasharray="none">
            <title>{player.name} · {phase}: {value(points[phase], index)}</title>
          </circle>)}
        </g>;
      })}
    </svg>
    <div className="poker-equity-legend">{players.map((player, index) => <span key={player.seat} className={`poker-equity-legend-${index % 4}`} style={{ color: colors[index % colors.length] }}>● {player.name}</span>)}</div>
    <div className="poker-equity-scroll"><table aria-label="Exact equity by street">
      <thead><tr><th scope="col">Player</th>{phases.map(phase => <th key={phase} scope="col">{phase[0].toUpperCase() + phase.slice(1)}</th>)}</tr></thead>
      <tbody>{players.map((player, index) => <tr key={player.seat}><th scope="row">{player.name}</th>{phases.map(phase => <td key={phase}>{value(points[phase], index)}</td>)}</tr>)}</tbody>
    </table></div>
  </section>;
}
