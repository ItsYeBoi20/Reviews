/** Tiny SVG trend line of consensus score over time (0-100). */
export function Sparkline({ points }: { points: number[] }) {
  const w = 96, h = 28;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(h - (p / 100) * h).toFixed(1)}`).join(" ");
  const delta = points.at(-1)! - points[0]!;
  return (
    <span className="row small muted" title="Consensus score over time">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        <path d={d} fill="none" stroke="var(--consensus)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {delta === 0 ? "steady" : `${delta > 0 ? "+" : ""}${delta}`}
    </span>
  );
}
