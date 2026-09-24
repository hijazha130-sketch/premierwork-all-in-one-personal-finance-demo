/**
 * Insights engine (Phase 6 §5.2–5.7). Pure — no DB, `today` injected, golden
 * tested. Everything here is DERIVED from the ledger; nothing is stored. Screens
 * read these results and never recompute money in components.
 */
import type {
  Account,
  Category,
  Debt,
  Goal,
  IsoDate,
  Minor,
  RecurringRule,
  Transaction,
} from "@/domain/types";
import type { Occurrence } from "@/domain/occurrences";
import type { SafeToSpendResult } from "@/domain/cashflow";
import type { NetWorthPoint } from "@/domain/wealth";
import { daysBetween } from "@/domain/cashflow";
import { savedForGoal } from "@/domain/goals";
import { debtBalanceNow } from "@/domain/debt";
import { inRange, type DateRange } from "@/lib/period";
import { addMinor } from "@/lib/money";
import { getCurrency, quickAmountPresets, putAwayThreshold } from "@/domain/currencies";

// --- §5.2 spending groups -------------------------------------------------

export type GroupKey = "bills" | "everyday" | "fun" | "debt" | "saving";

/** Fixed display/chart order (§8). Assignment PRIORITY is different (below). */
const GROUP_ORDER: { key: GroupKey; label: string }[] = [
  { key: "bills", label: "Bills & rent" },
  { key: "everyday", label: "Everyday needs" },
  { key: "fun", label: "Fun & wants" },
  { key: "debt", label: "Paying off debt" },
  { key: "saving", label: "Saving" },
];

/** Which group an out transaction lands in (exactly one), by §5.2 priority. */
export function groupOf(tx: Transaction, cat: Category | undefined): GroupKey {
  if (tx.debtId || cat?.bucket === "debt") return "debt";
  if (tx.goalId || tx.investmentId || cat?.bucket === "savings") return "saving";
  if (cat?.bucket === "bills") return "bills";
  if (cat?.needsWantsSavings === "wants") return "fun";
  return "everyday";
}

export interface SpendingGroups {
  groups: { key: GroupKey; label: string; amount: Minor }[]; // fixed order, always all 5
  moneyIn: Minor;
  moneyOut: Minor; // = Σ groups
  kept: Minor; // moneyIn − moneyOut (may be negative → UI "Over by …")
}

/** The month-so-far split of out-spending into the five groups (transfers excluded). */
export function spendingGroups(
  transactions: Transaction[],
  categoriesById: Map<string, Category>,
  range: DateRange,
): SpendingGroups {
  const totals: Record<GroupKey, Minor> = { bills: 0, everyday: 0, fun: 0, debt: 0, saving: 0 };
  let moneyIn = 0;
  for (const t of transactions) {
    if (t.type === "transfer") continue;
    if (!inRange(t.date, range)) continue;
    if (t.direction === "in" && t.type === "income") {
      moneyIn = addMinor(moneyIn, t.amount);
    } else if (t.direction === "out" && t.type === "expense") {
      totals[groupOf(t, t.categoryId ? categoriesById.get(t.categoryId) : undefined)] += t.amount;
    }
  }
  const groups = GROUP_ORDER.map((g) => ({ ...g, amount: totals[g.key] }));
  const moneyOut = groups.reduce((s, g) => s + g.amount, 0);
  return { groups, moneyIn, moneyOut, kept: moneyIn - moneyOut };
}

/** Sum of Everyday needs + Fun & wants for one transaction's contribution (0 otherwise). */
function dailyHabitAmount(t: Transaction, categoriesById: Map<string, Category>): Minor {
  if (t.type !== "expense" || t.direction !== "out") return 0;
  const g = groupOf(t, t.categoryId ? categoriesById.get(t.categoryId) : undefined);
  return g === "everyday" || g === "fun" ? t.amount : 0;
}

// --- §5.3 day by day ------------------------------------------------------

export interface DayCell {
  date: IsoDate;
  amount: Minor; // Everyday needs + Fun & wants that day (bills excluded)
  billDue: boolean; // an out occurrence falls on this day
  future: boolean; // date is after today
}

/** One cell per day of `month` ("YYYY-MM"): daily habit spend + bill-due + future flags. */
export function dayByDay(
  transactions: Transaction[],
  categoriesById: Map<string, Category>,
  occurrences: Occurrence[],
  month: string,
  today: IsoDate,
): DayCell[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const spendByDay = new Map<string, Minor>();
  for (const t of transactions) {
    if (!t.date.startsWith(month)) continue;
    const a = dailyHabitAmount(t, categoriesById);
    if (a) spendByDay.set(t.date, (spendByDay.get(t.date) ?? 0) + a);
  }
  const billDays = new Set(occurrences.filter((o) => o.direction === "out" && o.date.startsWith(month)).map((o) => o.date));
  const cells: DayCell[] = [];
  for (let d = 1; d <= days; d++) {
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, amount: spendByDay.get(date) ?? 0, billDue: billDays.has(date), future: date > today });
  }
  return cells;
}

// --- §5.4 until payday ----------------------------------------------------

export interface UntilPayday {
  days: { date: IsoDate; kind: "past" | "today" | "future" | "end" }[];
  periodStart: IsoDate;
  safeUntil: IsoDate;
  endLabel: "payday" | "month end";
  perDay: Minor;
  daysLeft: number;
  spentThisPeriod: Minor; // Everyday needs + Fun & wants since periodStart
}

/** The current pay period strip: most-recent income (or 1st) → the safe-to-spend horizon. */
export function untilPayday(
  sts: SafeToSpendResult,
  transactions: Transaction[],
  occurrences: Occurrence[],
  categoriesById: Map<string, Category>,
  today: IsoDate,
): UntilPayday {
  // periodStart = most recent income tx/occurrence on/before today, else 1st of month.
  const incomeDates: IsoDate[] = [];
  for (const t of transactions) if (t.type === "income" && t.direction === "in" && t.date <= today) incomeDates.push(t.date);
  for (const o of occurrences) if (o.direction === "in" && o.date <= today) incomeDates.push(o.date);
  incomeDates.sort();
  const periodStart = incomeDates.length ? incomeDates[incomeDates.length - 1] : `${today.slice(0, 7)}-01`;
  const safeUntil = sts.horizonEnd;

  const days: UntilPayday["days"] = [];
  const total = Math.max(0, daysBetween(periodStart, safeUntil));
  for (let i = 0; i <= total; i++) {
    const date = shiftDays(periodStart, i);
    const kind = date === safeUntil ? "end" : date < today ? "past" : date === today ? "today" : "future";
    days.push({ date, kind });
  }

  let spentThisPeriod = 0;
  for (const t of transactions) {
    if (t.date >= periodStart && t.date <= today) spentThisPeriod = addMinor(spentThisPeriod, dailyHabitAmount(t, categoriesById));
  }

  return {
    days,
    periodStart,
    safeUntil,
    endLabel: sts.horizonKind === "payday" ? "payday" : "month end",
    perDay: sts.perDay,
    daysLeft: sts.daysLeft,
    spentThisPeriod,
  };
}

// --- §5.5 next step + today's checklist -----------------------------------

export interface StepItem {
  id: "billsOverdue" | "noPayday" | "billSoon" | "loggedToday" | "balanceCheck";
  text: string;
  estimate: string;
  action: "bills" | "money" | "log" | "accounts";
  done: boolean; // for the checklist; the condition is cleared
}

export interface NextStepResult {
  nextStep: { text: string } & Partial<Pick<StepItem, "id" | "estimate" | "action">>;
  checklist: StepItem[]; // billsOverdue, loggedToday, balanceCheck
  doneCount: number; // of 3
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function weekdayOf(iso: IsoDate): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** The single next step + the 3-item today's checklist (§5.5). */
export function nextStepAndChecklist(
  transactions: Transaction[],
  occurrences: Occurrence[],
  recurringRules: RecurringRule[],
  accounts: Account[],
  today: IsoDate,
): NextStepResult {
  const unpaidOut = occurrences.filter((o) => (o.status === "overdue" || o.status === "upcoming") && o.direction === "out");
  const overdue = unpaidOut.filter((o) => o.status === "overdue");
  const hasIncomeRule = recurringRules.some((r) => r.direction === "in" && r.active && !r.archived);
  const loggedTodayDone = transactions.some((t) => t.date === today);
  // newest transaction across accounts older than 7 days
  const newest = transactions.reduce<string | null>((m, t) => (m == null || t.date > m ? t.date : m), null);
  const balanceStale = accounts.length > 0 && newest != null && daysBetween(newest, today) > 7;
  const soon = unpaidOut
    .filter((o) => o.status === "upcoming" && o.date >= today && daysBetween(today, o.date) <= 3)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  const items: Record<StepItem["id"], StepItem> = {
    billsOverdue: {
      id: "billsOverdue", action: "bills", estimate: "~10 sec", done: overdue.length === 0,
      text: overdue.length === 1 ? "1 bill is due and not marked paid" : `${overdue.length} bills are due and not marked paid`,
    },
    noPayday: { id: "noPayday", action: "money", estimate: "~1 min", done: hasIncomeRule, text: "Add when your pay comes in" },
    billSoon: {
      id: "billSoon", action: "bills", estimate: "~10 sec", done: !soon,
      text: soon ? `A bill is due ${weekdayOf(soon.date)}` : "",
    },
    loggedToday: { id: "loggedToday", action: "log", estimate: "~30 sec", done: loggedTodayDone, text: "Write down anything you spent today" },
    balanceCheck: { id: "balanceCheck", action: "accounts", estimate: "~1 min", done: !balanceStale, text: "Check your balance matches your bank" },
  };

  const order: StepItem["id"][] = ["billsOverdue", "noPayday", "billSoon", "loggedToday", "balanceCheck"];
  const firstUnmet = order.map((k) => items[k]).find((i) => !i.done);
  const nextStep = firstUnmet
    ? { id: firstUnmet.id, text: firstUnmet.text, estimate: firstUnmet.estimate, action: firstUnmet.action }
    : { text: "All clear — nothing needs you right now." };

  const checklist = [items.billsOverdue, items.loggedToday, items.balanceCheck];
  return { nextStep, checklist, doneCount: checklist.filter((i) => i.done).length };
}

// --- §5.6 quick log amounts -----------------------------------------------

export interface QuickAmounts {
  presets: Minor[]; // in minor units
  shortcuts: { categoryId: string; label: string; amount: Minor }[]; // up to 3
}

/** Preset amounts by currency (registry) + up to 3 recent (category, amount) shortcuts (§5.6). */
export function quickAmounts(
  transactions: Transaction[],
  categoriesById: Map<string, Category>,
  currencyCode: string,
  today: IsoDate,
): QuickAmounts {
  const presets = quickAmountPresets(currencyCode);

  const cutoff = shiftDays(today, -30);
  const counts = new Map<string, { categoryId: string; amount: Minor; count: number }>();
  for (const t of transactions) {
    if (t.source !== "manual" || t.type !== "expense" || t.direction !== "out") continue;
    if (!t.categoryId || t.date < cutoff || t.date > today) continue;
    const key = `${t.categoryId}|${t.amount}`;
    const cur = counts.get(key) ?? { categoryId: t.categoryId, amount: t.amount, count: 0 };
    cur.count += 1;
    counts.set(key, cur);
  }
  const shortcuts = [...counts.values()]
    .sort((a, b) => b.count - a.count || b.amount - a.amount)
    .slice(0, 3)
    .map((s) => ({ categoryId: s.categoryId, amount: s.amount, label: categoriesById.get(s.categoryId)?.name ?? "Spend" }));

  return { presets, shortcuts };
}

// --- §5.7 milestones ------------------------------------------------------

export interface Milestone {
  id: string;
  label: string;
  detail: string;
  state: "reached" | "notYet" | "notCounted";
}

export interface MilestonesInput {
  transactions: Transaction[];
  categoriesById: Map<string, Category>;
  occurrences: Occurrence[];
  goals: Goal[];
  debts: Debt[];
  netWorthSeries: NetWorthPoint[];
  today: IsoDate;
  currencyCode?: string;
}

/** The 8 milestones (§5.7), each reached / not yet / not counted. */
export function computeMilestones(inp: MilestonesInput): Milestone[] {
  const { transactions, categoriesById, occurrences, goals, debts, netWorthSeries, today } = inp;
  const manualOut = transactions.filter((t) => t.source === "manual" && t.type === "expense" && t.direction === "out");
  const out = transactions.filter((t) => t.type === "expense" && t.direction === "out");

  // 3: any completed day (after first tx, before today) with zero Everyday+Fun.
  const firstTx = transactions.reduce<string | null>((m, t) => (m == null || t.date < m ? t.date : m), null);
  const habitDays = new Set<string>();
  for (const t of transactions) if (dailyHabitAmount(t, categoriesById) > 0) habitDays.add(t.date);
  let noSpendDay = false;
  if (firstTx) {
    for (let i = 1; ; i++) {
      const d = shiftDays(firstTx, i);
      if (d >= today) break;
      if (!habitDays.has(d)) { noSpendDay = true; break; }
    }
  }

  // 4: any completed month with >=1 out occurrence all paid.
  const byMonth = new Map<string, Occurrence[]>();
  for (const o of occurrences) if (o.direction === "out" && o.date.slice(0, 7) < today.slice(0, 7)) {
    const k = o.date.slice(0, 7);
    (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(o);
  }
  let monthAllPaid = false;
  for (const occ of byMonth.values()) if (occ.length > 0 && occ.every((o) => o.status === "paid")) { monthAllPaid = true; break; }

  // 5: total put away ever reached the currency's threshold (goal starting + contributions).
  const cur = getCurrency(inp.currencyCode);
  let totalSaved = goals.reduce((s, g) => s + g.startingAmount, 0);
  for (const t of transactions) if (t.goalId && t.direction === "out") totalSaved += t.amount;
  const putAway = totalSaved >= putAwayThreshold(cur.code);

  // 6: any goal complete.
  const anyGoalDone = goals.some((g) => savedForGoal(g, transactions) >= g.targetAmount);

  // 7: any debt paid off (derived balance <= 0).
  const anyDebtPaid = debts.some((d) => debtBalanceNow(d, transactions) <= 0);

  // 8: any month-end higher than the previous.
  let nwUp = false;
  for (let i = 1; i < netWorthSeries.length; i++) if (netWorthSeries[i].netWorth > netWorthSeries[i - 1].netWorth) { nwUp = true; break; }

  const mk = (id: string, label: string, detail: string, state: Milestone["state"]): Milestone => ({ id, label, detail, state });
  const YN = (b: boolean): Milestone["state"] => (b ? "reached" : "notYet");

  return [
    mk("firstSpend", "First spend written down", "You logged your first spend.", YN(manualOut.length > 0)),
    mk("firstBillPaid", "First bill marked paid", "You marked a repeating bill as paid.", YN(out.some((t) => t.recurringRuleId))),
    mk("noSpendDay", "A day with no spending", "A whole day went by with nothing spent.", YN(noSpendDay)),
    mk("monthAllBillsPaid", "A month with every bill paid", "Every bill in a past month was paid.", YN(monthAllPaid)),
    mk(
      "putAway1000",
      `${cur.symbol}${cur.putAwayMilestone.toLocaleString(cur.locale)} put away`,
      `Your savings reached ${cur.symbol}${cur.putAwayMilestone.toLocaleString(cur.locale)}.`,
      YN(putAway),
    ),
    mk("goalReached", "A goal reached in full", "One of your goals hit its target.", goals.length === 0 ? "notCounted" : YN(anyGoalDone)),
    mk("debtPaidOff", "A debt paid off", "You cleared a debt in full.", debts.length === 0 ? "notCounted" : YN(anyDebtPaid)),
    mk("netWorthUp", "Net worth went up", "Your net worth rose from one month to the next.", netWorthSeries.length < 2 ? "notCounted" : YN(nwUp)),
  ];
}

// --- local date helper ----------------------------------------------------

function shiftDays(iso: IsoDate, n: number): IsoDate {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
