/**
 * A donut of the spending groups (Phase 6 §8). Segments use the group colour
 * tokens with a 2px surface gap between them; the exact amount shows on hover.
 * The group names + amounts always appear beside it (the caller renders those),
 * so the chart never carries meaning by colour alone.
 */
interface Segment {
  key: string;
  label: string;
  amount: number;
  color: string;
}

const GAP = 1.5; // gap between segments, in pathLength units (0..100)

export function Donut({
  segments,
  size = 176,
  thickness = 22,
  formatAmount,
  children,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  formatAmount?: (minor: number) => string;
  children?: React.ReactNode;
}) {
  const total = segments.reduce((s, g) => s + g.amount, 0);
  const positive = segments.filter((g) => g.amount > 0);
  const r = 50 - thickness / 4; // in the 0..100 viewBox
  const cx = 50;
  const cy = 50;

  // Lay segments out along a normalized 100-unit ring, each shrunk by the gap.
  let offset = 0;
  const arcs = positive.map((g) => {
    const pct = (g.amount / total) * 100;
    const len = Math.max(0.5, pct - GAP);
    const arc = { ...g, len, dashOffset: offset, pct };
    offset += pct;
    return arc;
  });

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90" role="img" aria-label="Money out by group">
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--border-hairline))" strokeWidth={thickness / 2} pathLength={100} />
        {total > 0 &&
          arcs.map((a) => (
            <circle
              key={a.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness / 2}
              strokeLinecap="butt"
              pathLength={100}
              strokeDasharray={`${a.len} ${100 - a.len}`}
              strokeDashoffset={-a.dashOffset}
            >
              <title>
                {a.label}: {formatAmount ? formatAmount(a.amount) : a.amount}
              </title>
            </circle>
          ))}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}
