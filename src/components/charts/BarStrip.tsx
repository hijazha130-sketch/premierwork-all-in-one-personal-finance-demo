/**
 * A single-series day strip (Phase 6 §8): one brand-gold bar per day, today
 * marked in ink, future days faded, and a small dot over days with a bill due.
 * Used for both "Day by day" and "Until payday". Meaning never rests on colour
 * alone — today is also ringed and labelled.
 */
export interface StripItem {
  key: string;
  value: number;
  tone: "past" | "today" | "future" | "end";
  billDue?: boolean;
  label?: string; // shown under the bar (sparse — e.g. week starts / endpoints)
  title?: string; // hover text (exact amount / date)
}

export function BarStrip({ items, height = 64 }: { items: StripItem[]; height?: number }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {items.map((it) => {
          const h = it.value <= 0 ? 2 : Math.max(3, Math.round((it.value / max) * (height - 8)));
          const faded = it.tone === "future" || it.tone === "end";
          return (
            <div key={it.key} className="flex min-w-[6px] flex-1 flex-col items-center justify-end" style={{ height }} title={it.title}>
              {it.billDue && <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-attention" aria-hidden />}
              <div
                className={[
                  "w-full rounded-t-sm",
                  it.tone === "today" ? "bg-gold ring-2 ring-ink/40" : faded ? "bg-gold/25" : "bg-gold/70",
                ].join(" ")}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      {items.some((i) => i.label) && (
        <div className="mt-1 flex gap-[3px]">
          {items.map((it) => (
            <div key={it.key} className="min-w-[6px] flex-1 text-center text-[10px] text-muted">
              {it.label ?? ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
