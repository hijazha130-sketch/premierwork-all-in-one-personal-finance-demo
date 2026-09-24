import { useMemo, useState } from "react";
import { useData, useCurrency } from "@/state/dataContext";
import { Card, Segmented } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { HelpTip } from "@/components/HelpTip";
import { StackedBar, type StackSegment } from "@/components/charts/StackedBar";
import { GROUP_COLOR } from "@/components/charts/palette";
import { todayIso } from "@/lib/period";
import type { DateRange } from "@/lib/period";

type Period = "thisMonth" | "last3" | "last6" | "thisYear";

const PERIOD_LABEL: Record<Period, string> = {
  thisMonth: "This month",
  last3: "Last 3 months",
  last6: "Last 6 months",
  thisYear: "This year",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function endOfMonth(y: number, m: number): string {
  return `${y}-${pad2(m)}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

/** The date range for a chosen period, ending at the current month's end. */
function rangeFor(period: Period, today: string): DateRange {
  const [y, m] = today.split("-").map(Number);
  const to = endOfMonth(y, m);
  const startMonth = (back: number) => {
    const idx = y * 12 + (m - 1) - back;
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
  };
  if (period === "thisYear") return { from: `${y}-01-01`, to };
  const back = period === "last3" ? 2 : period === "last6" ? 5 : 0;
  const s = startMonth(back);
  return { from: `${s.year}-${pad2(s.month)}-01`, to };
}

/**
 * Plan → Month: "{period} at a glance" (Architecture §7.3). The five spending
 * groups over a chosen stretch, the in/out/kept tiles, a stacked bar with Left
 * over, and a chronological list of the period's bills, paydays and bigger
 * spends. Everything is read from derived state / pure helpers.
 */
export function MonthGlance() {
  const { spendingForRange, inOutForRange, derived } = useData();
  const { locale } = useCurrency();
  const [period, setPeriod] = useState<Period>("thisMonth");
  const today = todayIso();
  const range = useMemo(() => rangeFor(period, today), [period, today]);
  const s = spendingForRange(range);
  const inOut = inOutForRange(range);

  const segments: StackSegment[] = [
    ...s.groups.filter((g) => g.amount > 0).map((g) => ({ key: g.key, label: g.label, value: g.amount, color: GROUP_COLOR[g.key] })),
    ...(s.kept > 0 ? [{ key: "left", label: "Left over", value: s.kept, color: "hairline" } as StackSegment] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2">
        <h2 className="font-display text-2xl text-ink">{PERIOD_LABEL[period]} at a glance</h2>
        <HelpTip topic="monthAtAGlance" />
      </div>

      <Segmented
        ariaLabel="Period"
        value={period}
        onChange={setPeriod}
        options={(Object.keys(PERIOD_LABEL) as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
      />

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <Tile label="Money in" amount={s.moneyIn} tone="positive" />
        <Tile label="Money out" amount={s.moneyOut} tone="attention" />
        <Tile label={s.kept < 0 ? "Over by" : "Kept"} amount={Math.abs(s.kept)} tone={s.kept < 0 ? "attention" : "positive"} />
        {period === "thisMonth" && <Tile label="Still safe to spend" amount={derived.safeToSpend.amount} tone={derived.safeToSpend.amount < 0 ? "attention" : "default"} />}
      </div>

      {/* Stacked bar + group list */}
      <Card>
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted">Where it went</div>
        <StackedBar segments={segments} />
        <ul className="mt-5 space-y-2">
          {s.groups.map((g) => (
            <li key={g.key} className="flex items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: GROUP_COLOR[g.key] }} aria-hidden />
              <span className="flex-1 text-ink">{g.label}</span>
              <MoneyAmount amount={g.amount} size="sm" tone={g.amount === 0 ? "muted" : "default"} />
            </li>
          ))}
          {s.kept > 0 && (
            <li className="flex items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-sm bg-hairline" aria-hidden />
              <span className="flex-1 text-muted">Left over</span>
              <MoneyAmount amount={s.kept} size="sm" tone="muted" />
            </li>
          )}
        </ul>
      </Card>

      {/* In and out */}
      <Card>
        <div className="mb-4 font-display text-xl text-ink">In and out</div>
        {inOut.length === 0 ? (
          <p className="font-serif italic text-muted">Nothing scheduled or logged in this stretch yet.</p>
        ) : (
          <div className="divide-y divide-hairline">
            {inOut.map((r) => (
              <div key={r.key} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{r.name}</span>
                  <span className="block text-xs text-muted">{shortDate(r.date, locale)} · {r.status}</span>
                </span>
                <MoneyAmount amount={r.amount} size="sm" tone={r.direction === "in" ? "positive" : "default"} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function shortDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function Tile({ label, amount, tone }: { label: string; amount: number; tone: "positive" | "attention" | "default" }) {
  return (
    <Card className="p-3 sm:p-5">
      <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted mb-1 sm:mb-2">{label}</div>
      <MoneyAmount amount={amount} size="sm" tone={tone} className="sm:text-2xl" />
    </Card>
  );
}
