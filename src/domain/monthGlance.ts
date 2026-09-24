/**
 * "In and out" list for Month at a glance (Architecture §7.3). Pure: the range's
 * bills + paydays (from occurrences, with their paid/due status) merged with the
 * biggest logged spends, most recent first. Lives in the domain layer so the
 * screen file carries no internal vocabulary.
 */
import type { Transaction } from "@/domain/types";
import type { Occurrence } from "@/domain/occurrences";
import type { DateRange } from "@/lib/period";

export interface InOutRow {
  key: string;
  name: string;
  date: string;
  amount: number;
  direction: "in" | "out";
  status: string;
}

export function buildInOut(
  occurrences: Occurrence[],
  transactions: Transaction[],
  range: DateRange,
  nameById: (id: string) => string | undefined,
): InOutRow[] {
  const rows: InOutRow[] = [];
  for (const o of occurrences) {
    if (o.date < range.from || o.date > range.to) continue;
    const status = o.status === "paid" ? "paid ✓" : o.direction === "in" ? "money in" : "due — not marked paid";
    const name = nameById(o.ruleId) ?? (o.direction === "in" ? "Money in" : "A bill");
    rows.push({ key: `o-${o.ruleId}-${o.date}`, name, date: o.date, amount: o.amount, direction: o.direction, status });
  }
  const bigSpends = transactions
    .filter((t) => t.type === "expense" && t.direction === "out" && t.source === "manual" && t.date >= range.from && t.date <= range.to)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((t) => ({ key: `t-${t.id}`, name: "A larger spend", date: t.date, amount: t.amount, direction: "out" as const, status: "spent" }));
  return [...rows, ...bigSpends].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);
}
