import { useState } from "react";
import { Link } from "react-router-dom";
import { useData, useCurrency } from "@/state/dataContext";
import { useCapture } from "@/state/CaptureProvider";
import { Button, Card } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { EmptyState } from "@/components/EmptyState";
import { HelpTip } from "@/components/HelpTip";
import { RecentActivity } from "@/components/RecentActivity";
import { OccurrenceActions } from "@/components/OccurrenceActions";
import { Donut } from "@/components/charts/Donut";
import { BarStrip, type StripItem } from "@/components/charts/BarStrip";
import { GROUP_COLOR } from "@/components/charts/palette";
import { formatMoney } from "@/lib/money";
import { monthLabel, currentMonth, todayIso } from "@/lib/period";
import type { Occurrence } from "@/domain/occurrences";
import type { NextStepResult } from "@/domain/insights";

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function shortDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

const BIG_LABEL: Record<string, string> = {
  safeToSpend: "Safe to spend",
  leftToSpend: "Left to spend",
  okToSpend: "OK to spend",
};

/** Friendly wording once a checklist item is cleared (its unmet text reads oddly done). */
const DONE_TEXT: Record<string, string> = {
  billsOverdue: "Bills are all marked paid",
  loggedToday: "Today's spending is written down",
  balanceCheck: "Balance checked recently",
};

/**
 * Today (Home) — the daily story (Architecture §7.1). One big per-day number,
 * the single next step, today's checklist, this month's spending split, the
 * day-by-day and until-payday strips, and milestones. Every value is read from
 * derived.* — the screen does no money math (invariant #9).
 */
export function Home() {
  const { accounts, transactions, derived, recurringRulesById, categories, settings, repo } = useData();
  const { locale, code } = useCurrency();
  const { openCapture } = useCapture();
  const [showReceipt, setShowReceipt] = useState(false);

  if (accounts.length === 0) {
    return (
      <div className="max-w-2xl">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-2">{greeting()}</div>
          <h1 className="font-serif text-3xl md:text-4xl italic text-ink">Welcome to your money</h1>
        </div>
        <EmptyState
          icon="✦"
          title="Let's set things up"
          message="Add your first account and pick your groups. It takes a minute, and then everything on Home fills in automatically."
          action={
            <Link to="/setup">
              <Button>Start setup</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const today = todayIso();
  const safe = derived.safeToSpend;
  const up = derived.untilPayday;
  const spending = derived.spending;
  const negative = safe.amount < 0;
  const bigLabel = BIG_LABEL[settings?.bigNumberLabel ?? "safeToSpend"];
  const name = settings?.displayName?.trim();
  const endLabel = up.endLabel === "payday" ? "payday" : "the month's end";
  const fmt = (m: number) => formatMoney(m, { code, locale, whole: true });

  const nameOf = (o: Occurrence): string => {
    const found = recurringRulesById.get(o.ruleId)?.name;
    return found ?? (o.direction === "in" ? "Money coming in" : "A bill");
  };

  const upcoming = derived.upcoming.slice(0, 5);
  const overdue = derived.overdue;
  const reachedCount = derived.milestones.filter((m) => m.state === "reached").length;

  return (
    <div className="space-y-8">
      {/* 1 — Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-2">
            {shortDate(today, locale)}
          </div>
          <h1 className="font-display text-4xl md:text-5xl italic text-ink">
            {greeting()}{name ? `, ${name}` : ""}
          </h1>
        </div>
        {/* Hidden on phones (§N2): the floating button + next step cover logging there. */}
        <div className="hidden sm:block">
          <Button onClick={() => openCapture("expense")}>+ Log a spend</Button>
        </div>
      </header>

      {/* 2 — Next step bar */}
      <NextStepBar next={derived.nextStep} onLog={() => openCapture("expense")} />

      {/* 3 — Hero number + today's checklist */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-gold">{bigLabel} today</span>
            <HelpTip topic="safeToSpend" />
          </div>
          <MoneyAmount amount={safe.perDay} size="hero" tone={negative ? "attention" : "default"} />
          <p className="font-serif italic text-muted mt-3">
            {negative
              ? "Your bills before " + endLabel + " add up to more than you have right now."
              : `${fmt(safe.amount)} to last until ${endLabel} (${safe.daysLeft} ${safe.daysLeft === 1 ? "day" : "days"})`}
          </p>
          <button
            className="mt-3 text-sm text-gold hover:underline"
            onClick={() => setShowReceipt((v) => !v)}
            aria-expanded={showReceipt}
          >
            {showReceipt ? "Hide the working" : "How is this worked out?"}
          </button>
          {showReceipt && <Receipt safe={safe} fmt={fmt} nameOf={nameOf} endLabel={endLabel} locale={locale} />}

          {/* Quick-log buttons (§5.6) */}
          <div className="mt-5 flex flex-wrap gap-2">
            {derived.quickAmounts.presets.map((amt) => (
              <button
                key={amt}
                onClick={() => openCapture("expense", { amount: amt })}
                className="rounded-pill border border-hairline px-3 py-1.5 text-sm text-ink hover:bg-inset min-h-[36px]"
              >
                {fmt(amt)}
              </button>
            ))}
            {derived.quickAmounts.shortcuts.map((s) => (
              <button
                key={s.categoryId + s.amount}
                onClick={() => openCapture("expense", { amount: s.amount, categoryId: s.categoryId })}
                className="rounded-pill bg-inset px-3 py-1.5 text-sm text-ink hover:opacity-90 min-h-[36px]"
              >
                + {s.label} {fmt(s.amount)}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-ink">Today's checklist</h2>
            <span className="text-xs text-muted">{derived.nextStep.doneCount} of 3 done</span>
          </div>
          <ul className="space-y-3">
            {derived.nextStep.checklist.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <span
                  className={[
                    "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs",
                    item.done ? "border-positive bg-positive/15 text-positive" : "border-hairline text-muted",
                  ].join(" ")}
                  aria-hidden
                >
                  {item.done ? "✓" : ""}
                </span>
                <span className="min-w-0">
                  <span className={item.done ? "text-muted" : "text-ink"}>
                    {item.done ? DONE_TEXT[item.id] ?? item.text : item.text}
                  </span>
                  {!item.done && <span className="block text-xs text-muted">{item.estimate}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* 4 — This month so far */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl text-ink">This month so far</h2>
            <HelpTip topic="thisMonth" />
          </div>
          <span className="text-sm text-muted">{monthLabel(currentMonth(), locale)}</span>
        </div>

        <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="justify-self-center">
            <Donut
              segments={spending.groups.map((g) => ({ ...g, color: GROUP_COLOR[g.key] }))}
              formatAmount={fmt}
            >
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted">Money out</div>
                <div className="font-amount text-lg text-ink">{fmt(spending.moneyOut)}</div>
              </div>
            </Donut>
          </div>
          <ul className="space-y-2">
            {spending.groups.map((g) => (
              <li key={g.key} className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: GROUP_COLOR[g.key] }} aria-hidden />
                <span className="flex-1 text-ink">{g.label}</span>
                <MoneyAmount amount={g.amount} size="sm" tone={g.amount === 0 ? "muted" : "default"} />
              </li>
            ))}
          </ul>
        </div>

        {/* Tappable category chips — move a group between Everyday needs and Fun & wants (§5.2) */}
        <CategoryChips categories={categories} onFlip={(id, to) => repo.updateCategory(id, { needsWantsSavings: to })} />

        {/* Money in / out / Kept tiles */}
        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
          <Tile label="Money in" amount={spending.moneyIn} tone="positive" />
          <Tile label="Money out" amount={spending.moneyOut} tone="attention" />
          <Tile
            label={spending.kept < 0 ? "Over by" : "Kept this month"}
            amount={Math.abs(spending.kept)}
            tone={spending.kept < 0 ? "attention" : "positive"}
          />
        </div>
        <p className="mt-4 font-serif italic text-muted">
          {spending.kept < 0
            ? "You've spent more than came in this month — worth a look."
            : spending.moneyOut === 0
              ? "Nothing's gone out yet this month."
              : `You've kept ${fmt(spending.kept)} of what came in so far.`}
        </p>
      </Card>

      {/* 5 — Day by day */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="font-display text-2xl text-ink">Day by day</h2>
          <HelpTip topic="dayByDay" />
        </div>
        <p className="text-sm text-muted mb-4">Your everyday spending, one bar a day. Bills are left out so the shape shows your habits.</p>
        <BarStrip items={dayCellsToStrip(derived.dayCells, today, fmt, locale)} />
      </Card>

      {/* 6 — Until payday + Milestones */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-1 flex items-center gap-2">
            <h2 className="font-display text-2xl text-ink">Until {up.endLabel === "payday" ? "payday" : "month end"}</h2>
            <HelpTip topic="untilPayday" />
          </div>
          <p className="text-sm text-muted mb-4">
            {fmt(up.perDay)} a day · {up.daysLeft} {up.daysLeft === 1 ? "day" : "days"} left · {fmt(up.spentThisPeriod)} spent so far
          </p>
          <BarStrip items={up.days.map((d) => ({ key: d.date, value: 1, tone: d.kind === "end" ? "end" : d.kind }))} height={40} />
          <p className="mt-3 text-xs text-muted">From {shortDate(up.periodStart, locale)} to {shortDate(up.safeUntil, locale)}.</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-2xl text-ink">Milestones</h2>
              <HelpTip topic="milestones" />
            </div>
            <Link to="/milestones" className="text-sm text-gold hover:underline">
              {reachedCount} of {derived.milestones.length} reached
            </Link>
          </div>
          <ul className="space-y-3">
            {derived.milestones.slice(0, 4).map((m) => (
              <li key={m.id} className="flex items-start gap-3">
                <span
                  className={[
                    "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs",
                    m.state === "reached" ? "border-gold bg-gold/15 text-gold" : "border-hairline text-muted",
                  ].join(" ")}
                  aria-hidden
                >
                  {m.state === "reached" ? "★" : ""}
                </span>
                <span className="min-w-0">
                  <span className={m.state === "reached" ? "text-ink" : "text-muted"}>{m.label}</span>
                  {m.state === "notCounted" && <span className="block text-xs text-muted">not counted yet</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Needs attention (overdue) */}
      {overdue.length > 0 && (
        <Card className="border-attention/40">
          <h2 className="font-display text-2xl text-ink mb-1">What needs attention</h2>
          <p className="text-sm text-muted mb-4">
            {overdue.length === 1 ? "One bill is" : `${overdue.length} bills are`} past due.
          </p>
          <div className="divide-y divide-hairline">
            {overdue.map((o, i) => (
              <OccurrenceRow
                key={i}
                name={nameOf(o)}
                sub={`was due ${shortDate(o.displayDate, locale)}`}
                subTone="text-attention"
                amount={o.amount}
                amountTone={o.direction === "in" ? "positive" : "attention"}
                occurrence={o}
              />
            ))}
          </div>
        </Card>
      )}

      {/* 7 — Coming up + Recent activity (existing) */}
      {upcoming.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl text-ink">Coming up</h2>
            <Link to="/money" className="text-sm text-gold hover:underline">
              See calendar
            </Link>
          </div>
          <div className="divide-y divide-hairline">
            {upcoming.map((o, i) => (
              <OccurrenceRow
                key={i}
                name={nameOf(o)}
                sub={`Coming up · ${shortDate(o.displayDate, locale)}`}
                subTone="text-muted"
                amount={o.amount}
                amountTone={o.direction === "in" ? "positive" : "default"}
                occurrence={o}
              />
            ))}
          </div>
        </Card>
      )}

      {transactions.length > 0 ? (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl text-ink">Recent activity</h2>
            <Link to="/money" className="text-sm text-gold hover:underline">
              See all
            </Link>
          </div>
          <RecentActivity limit={5} />
        </Card>
      ) : (
        <EmptyState
          icon="＋"
          title="Add today's spending"
          message="The moment you record something, your totals here update on their own."
          action={<Button onClick={() => openCapture("expense")}>Log a spend</Button>}
        />
      )}
    </div>
  );
}

/** A planned/overdue bill or income row: name+date, then amount + actions —
 *  stacks cleanly on mobile so nothing overlaps, single line on desktop. */
function OccurrenceRow({
  name,
  sub,
  subTone,
  amount,
  amountTone,
  occurrence,
}: {
  name: string;
  sub: string;
  subTone: string;
  amount: number;
  amountTone: "positive" | "attention" | "default";
  occurrence: Occurrence;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
      <span className="min-w-0 sm:flex-1">
        <span className="block truncate font-medium text-ink">{name}</span>
        <span className={`block text-xs ${subTone}`}>{sub}</span>
      </span>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <MoneyAmount amount={amount} size="sm" tone={amountTone} />
        <OccurrenceActions occurrence={occurrence} />
      </div>
    </div>
  );
}

/** The dark next-step bar (§7.1 #2). */
function NextStepBar({ next, onLog }: { next: NextStepResult; onLog: () => void }) {
  const step = next.nextStep;
  return (
    <div className="rounded-card bg-hero px-5 py-4 text-hero-text">
      {/* Stacks on mobile so the sentence keeps full width; inline on desktop. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-hero-text/10 font-display text-lg">
            {step.id ? "1" : "✓"}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-widest text-hero-text/60">Your next step</div>
            <div className="text-hero-text">{step.text}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 pl-[52px] sm:pl-0">
          {step.estimate && (
            <span className="rounded-pill bg-hero-text/10 px-3 py-1 text-xs text-hero-text/80">{step.estimate}</span>
          )}
          {step.action === "log" && (
            <button onClick={onLog} className="rounded-control bg-gold px-4 py-2 text-sm font-semibold text-base hover:opacity-90 min-h-[40px]">
              Log a spend
            </button>
          )}
          {step.action && step.action !== "log" && (
            <Link
              to={step.action === "money" ? "/money" : step.action === "accounts" ? "/accounts" : "/money"}
              className="rounded-control bg-gold px-4 py-2 text-sm font-semibold text-base hover:opacity-90 min-h-[40px] inline-flex items-center"
            >
              Take a look
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** The safe-to-spend receipt (§5.1). The lines add up to the headline. */
function Receipt({
  safe,
  fmt,
  nameOf,
  endLabel,
  locale,
}: {
  safe: ReturnType<typeof useData>["derived"]["safeToSpend"];
  fmt: (m: number) => string;
  nameOf: (o: Occurrence) => string;
  endLabel: string;
  locale: string;
}) {
  return (
    <div className="mt-3 rounded-card bg-inset px-4 py-3 text-sm">
      <Row label="In your accounts" value={fmt(safe.startingBalance)} />
      <Row label={`Bills still to pay before ${endLabel}`} value={"−" + fmt(safe.reservedTotal)} muted />
      {safe.reserved.slice(0, 4).map((o, i) => (
        <div key={i} className="flex justify-between pl-4 text-xs text-muted">
          <span className="truncate">{nameOf(o)} · {shortDate(o.displayDate, locale)}</span>
          <span>{fmt(o.amount)}</span>
        </div>
      ))}
      {safe.safetyFloor > 0 && <Row label="Safety cushion kept back" value={"−" + fmt(safe.safetyFloor)} muted />}
      <div className="my-2 border-t border-hairline" />
      <Row label={`Safe until ${endLabel}`} value={fmt(safe.amount)} strong />
      <Row label={`Split over ${safe.daysLeft} ${safe.daysLeft === 1 ? "day" : "days"}`} value={fmt(safe.perDay) + " a day"} strong />
    </div>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${strong ? "text-ink font-medium" : muted ? "text-muted" : "text-ink"}`}>
      <span className="truncate pr-3">{label}</span>
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
}

function Tile({ label, amount, tone }: { label: string; amount: number; tone: "positive" | "attention" }) {
  return (
    <div className="rounded-card bg-inset p-3 sm:p-5">
      <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted mb-1 sm:mb-2">{label}</div>
      <MoneyAmount amount={amount} size="sm" tone={tone} className="sm:text-2xl" />
    </div>
  );
}

/** Chips to move a spending group between Everyday needs and Fun & wants (§5.2). */
function CategoryChips({
  categories,
  onFlip,
}: {
  categories: ReturnType<typeof useData>["categories"];
  onFlip: (id: string, to: "needs" | "wants") => void;
}) {
  const everyday = categories.filter((c) => c.bucket === "expenses" && c.needsWantsSavings === "needs");
  const fun = categories.filter((c) => c.bucket === "expenses" && c.needsWantsSavings === "wants");
  if (everyday.length + fun.length === 0) return null;
  return (
    <div className="mt-5 space-y-3 border-t border-hairline pt-4">
      <ChipRow title="Everyday needs" hint="Tap to move to Fun & wants" items={everyday} onTap={(id) => onFlip(id, "wants")} />
      <ChipRow title="Fun & wants" hint="Tap to move to Everyday needs" items={fun} onTap={(id) => onFlip(id, "needs")} />
    </div>
  );
}

function ChipRow({
  title,
  hint,
  items,
  onTap,
}: {
  title: string;
  hint: string;
  items: ReturnType<typeof useData>["categories"];
  onTap: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">{title}</span>
        {items.length > 0 && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-sm text-muted italic">None yet.</span>
        ) : (
          items.map((c) => (
            <button
              key={c.id}
              onClick={() => onTap(c.id)}
              className="rounded-pill border border-hairline px-3 py-1.5 text-sm text-ink hover:bg-inset min-h-[36px]"
            >
              {c.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Map the month's day cells into the single-series strip (gold; today marked; future faded). */
function dayCellsToStrip(
  cells: ReturnType<typeof useData>["derived"]["dayCells"],
  today: string,
  fmt: (m: number) => string,
  locale: string,
): StripItem[] {
  return cells.map((c) => {
    const day = Number(c.date.slice(8, 10));
    return {
      key: c.date,
      value: c.amount,
      tone: c.date === today ? "today" : c.future ? "future" : "past",
      billDue: c.billDue,
      label: day === 1 || day % 7 === 0 ? String(day) : undefined,
      title: `${shortDate(c.date, locale)}: ${fmt(c.amount)}`,
    };
  });
}
