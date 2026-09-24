/**
 * A horizontal stacked bar of the spending groups + Left over (Architecture §8).
 * Segments carry a 2px gap; the group names + amounts are listed beneath by the
 * caller, so the bar never carries meaning by colour alone.
 */
export interface StackSegment {
  key: string;
  label: string;
  value: number;
  color: string; // a colour token or "hairline" for the neutral Left over
}

export function StackedBar({ segments, height = 16 }: { segments: StackSegment[]; height?: number }) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return <div className="w-full rounded-pill bg-inset" style={{ height }} aria-hidden />;
  }
  return (
    <div className="flex w-full gap-[2px] overflow-hidden rounded-pill" style={{ height }} role="img" aria-label="Spending groups">
      {shown.map((s) => (
        <div
          key={s.key}
          className="h-full first:rounded-l-pill last:rounded-r-pill"
          style={{
            width: `${(s.value / total) * 100}%`,
            background: s.color === "hairline" ? "rgb(var(--border-hairline))" : s.color,
          }}
          title={s.label}
        />
      ))}
    </div>
  );
}
