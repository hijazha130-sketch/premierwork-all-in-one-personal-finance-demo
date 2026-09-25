import { describe, it, expect } from "vitest";
import type { Account, Category, Debt, Goal, Transaction } from "@/domain/types";
import type { Occurrence, OccurrenceStatus } from "@/domain/occurrences";
import { safeToSpend } from "@/domain/cashflow";
import {
  spendingGroups, dayByDay, untilPayday, nextStepAndChecklist, quickAmounts, computeMilestones, groupOf,
} from "@/domain/insights";

let seq = 0;
function acc(openingBalance: number): Account {
  return { id: "a1", name: "A", type: "checking", openingBalance, currencyCode: "PKR", archived: false, createdAt: 0, updatedAt: 0 };
}
function cat(id: string, bucket: Category["bucket"], nws: Category["needsWantsSavings"] = "none"): Category {
  return { id, name: id, bucket, needsWantsSavings: nws, color: "#000", archived: false, createdAt: 0, updatedAt: 0 };
}
function tx(over: Partial<Transaction> & { amount: number; direction: "in" | "out"; date: string }): Transaction {
  return {
    id: `t${++seq}`, type: over.direction === "in" ? "income" : "expense", categoryId: null, accountId: "a1",
    personId: null, source: "manual", cleared: true, transferGroupId: null, recurringRuleId: null,
    occurrenceDate: null, goalId: null, debtId: null, investmentId: null, createdAt: 0, updatedAt: 0, ...over,
  };
}
function occ(over: Partial<Occurrence> & { date: string; direction: "in" | "out"; amount: number; status: OccurrenceStatus }): Occurrence {
  return { ruleId: "r1", displayDate: over.date, type: over.direction === "in" ? "income" : "expense", categoryId: null, accountId: "a1", personId: null, ...over };
}

describe("safe to spend — receipt + per day (§5.1)", () => {
  it("(a) 1,290 over 8 days = 161.25 a day", () => {
    const r = safeToSpend([acc(1290_00)], [], [occ({ date: "2026-09-09", direction: "in", amount: 1000_00, status: "upcoming" })], "2026-09-01", { mode: "nextIncome" });
    expect(r.horizonKind).toBe("payday");
    expect(r.horizonEnd).toBe("2026-09-09");
    expect(r.daysLeft).toBe(8);
    expect(r.amount).toBe(1290_00);
    expect(r.perDay).toBe(161_25); // floor(129000 / 8) = 16125 = 161.25
  });

  it("(b) the receipt pieces add up to the headline, to the minor unit", () => {
    const os = [
      occ({ date: "2026-09-10", direction: "out", amount: 500_00, status: "upcoming" }),
      occ({ date: "2026-09-20", direction: "in", amount: 3000_00, status: "upcoming" }),
    ];
    const r = safeToSpend([acc(2000_00)], [], os, "2026-09-01", { mode: "nextIncome", safetyFloor: 200_00 });
    expect(r.startingBalance - r.reservedTotal - r.safetyFloor).toBe(r.amount);
    expect(r.amount).toBe(1300_00); // 2,000 − 500 − 200
  });

  it("no payday → month end; perDay 0 when nothing left", () => {
    const r = safeToSpend([acc(0)], [], [], "2026-09-10", { mode: "nextIncome" });
    expect(r.horizonKind).toBe("monthEnd");
    expect(r.horizonEnd).toBe("2026-09-30");
    expect(r.daysLeft).toBe(21); // 10th..30th inclusive
    expect(r.perDay).toBe(0);
  });
});

describe("spending groups (§5.2)", () => {
  const cats = new Map([
    ["rent", cat("rent", "bills")],
    ["food", cat("food", "expenses", "needs")],
    ["movies", cat("movies", "expenses", "wants")],
    ["save", cat("save", "savings", "savings")],
  ]);
  const range = { from: "2026-09-01", to: "2026-09-30" };

  it("(d) every out lands in exactly one group; groups sum to Money out", () => {
    const txns = [
      tx({ amount: 3000_00, direction: "in", date: "2026-09-02" }),
      tx({ amount: 800_00, direction: "out", date: "2026-09-03", categoryId: "rent" }),
      tx({ amount: 200_00, direction: "out", date: "2026-09-04", categoryId: "food" }),
      tx({ amount: 150_00, direction: "out", date: "2026-09-05", categoryId: "movies" }),
      tx({ amount: 500_00, direction: "out", date: "2026-09-06", debtId: "D" }),
      tx({ amount: 400_00, direction: "out", date: "2026-09-07", goalId: "G", categoryId: "food" }),
      tx({ amount: 999_00, direction: "out", date: "2026-08-31", categoryId: "food" }), // out of range
      tx({ amount: 100_00, direction: "out", type: "transfer", date: "2026-09-08" }), // transfer excluded
    ];
    const s = spendingGroups(txns, cats, range);
    expect(s.moneyIn).toBe(3000_00);
    expect(Object.fromEntries(s.groups.map((g) => [g.key, g.amount]))).toEqual({ bills: 800_00, everyday: 200_00, fun: 150_00, debt: 500_00, saving: 400_00 });
    expect(s.moneyOut).toBe(2050_00);
    expect(s.groups.reduce((a, g) => a + g.amount, 0)).toBe(s.moneyOut);
    expect(s.kept).toBe(950_00);
  });

  it("kept goes negative honestly (Over by …)", () => {
    const s = spendingGroups([tx({ amount: 100_00, direction: "out", date: "2026-09-03", categoryId: "rent" })], cats, range);
    expect(s.kept).toBe(-100_00);
  });

  it("groupOf priority: debt > saving > bills > fun > everyday", () => {
    expect(groupOf(tx({ amount: 1, direction: "out", date: "x", debtId: "D", categoryId: "save" }), cats.get("save"))).toBe("debt");
    expect(groupOf(tx({ amount: 1, direction: "out", date: "x", goalId: "G", categoryId: "rent" }), cats.get("rent"))).toBe("saving");
    expect(groupOf(tx({ amount: 1, direction: "out", date: "x", categoryId: "rent" }), cats.get("rent"))).toBe("bills");
    expect(groupOf(tx({ amount: 1, direction: "out", date: "x", categoryId: "movies" }), cats.get("movies"))).toBe("fun");
    expect(groupOf(tx({ amount: 1, direction: "out", date: "x", categoryId: "food" }), cats.get("food"))).toBe("everyday");
  });
});

describe("day by day (§5.3) + until payday (§5.4)", () => {
  const cats = new Map([["food", cat("food", "expenses", "needs")], ["rent", cat("rent", "bills")]]);

  it("daily habit spend excludes bills; flags bill-due and future days", () => {
    const txns = [
      tx({ amount: 50_00, direction: "out", date: "2026-09-03", categoryId: "food" }),
      tx({ amount: 800_00, direction: "out", date: "2026-09-03", categoryId: "rent" }),
    ];
    const bills = [occ({ date: "2026-09-05", direction: "out", amount: 800_00, status: "upcoming" })];
    const cells = dayByDay(txns, cats, bills, "2026-09", "2026-09-04");
    expect(cells).toHaveLength(30);
    expect(cells[2].amount).toBe(50_00); // 3rd: only the food
    expect(cells[4].billDue).toBe(true);
    expect(cells[4].future).toBe(true);
    expect(cells[2].future).toBe(false);
  });

  it("until payday: period starts at the last income, sums habit spend since", () => {
    const income = [occ({ date: "2026-09-20", direction: "in", amount: 3000_00, status: "upcoming" })];
    const sts = safeToSpend([acc(5000_00)], [], income, "2026-09-10", { mode: "nextIncome" });
    const txns = [
      tx({ amount: 600_00, direction: "in", date: "2026-09-05" }),
      tx({ amount: 40_00, direction: "out", date: "2026-09-07", categoryId: "food" }),
      tx({ amount: 9_00, direction: "out", date: "2026-09-02", categoryId: "food" }), // before period
    ];
    const up = untilPayday(sts, txns, income, cats, "2026-09-10");
    expect(up.periodStart).toBe("2026-09-05");
    expect(up.safeUntil).toBe("2026-09-20");
    expect(up.endLabel).toBe("payday");
    expect(up.spentThisPeriod).toBe(40_00);
  });
});

describe("next step + checklist (§5.5)", () => {
  it("overdue bills is the next step; checklist tracks done", () => {
    const os = [occ({ date: "2026-09-01", direction: "out", amount: 100_00, status: "overdue" })];
    const r = nextStepAndChecklist([tx({ amount: 5_00, direction: "out", date: "2026-09-10" })], os, [], [acc(0)], "2026-09-10");
    expect(r.nextStep.id).toBe("billsOverdue");
    expect(r.checklist.find((i) => i.id === "loggedToday")?.done).toBe(true);
  });

  it("all clear when nothing is unmet", () => {
    const rules = [{ id: "r", name: "Pay", amount: 1, direction: "in" as const, type: "income" as const, categoryId: null, accountId: "a1", personId: null, frequency: "everyMonth" as const, anchorDate: "2026-09-01", endDate: null, active: true, archived: false, goalId: null, debtId: null, investmentId: null, createdAt: 0, updatedAt: 0 }];
    const r = nextStepAndChecklist([tx({ amount: 5_00, direction: "out", date: "2026-09-10" })], [], rules, [acc(0)], "2026-09-10");
    expect(r.nextStep.text).toMatch(/All clear/);
  });
});

describe("quick amounts (§5.6)", () => {
  it("high-denomination presets for PKR; recent shortcuts by frequency", () => {
    const cats = new Map([["coffee", cat("coffee", "expenses", "wants")]]);
    const txns = [
      tx({ amount: 4_00, direction: "out", date: "2026-09-09", categoryId: "coffee" }),
      tx({ amount: 4_00, direction: "out", date: "2026-09-10", categoryId: "coffee" }),
    ];
    const q = quickAmounts(txns, cats, "PKR", "2026-09-10");
    expect(q.presets).toEqual([100_00, 500_00, 1000_00, 2000_00]);
    expect(q.shortcuts[0]).toMatchObject({ categoryId: "coffee", amount: 4_00, label: "coffee" });
  });
  it("presets for USD come from the registry", () => {
    expect(quickAmounts([], new Map(), "USD", "2026-09-10").presets).toEqual([5_00, 10_00, 20_00, 50_00]);
  });
  it("§F3: leaves savings moves and debt payments out of the shortcuts", () => {
    const cats = new Map([
      ["coffee", cat("coffee", "expenses", "wants")],
      ["save", cat("save", "savings", "savings")],
    ]);
    const txns = [
      tx({ amount: 4_00, direction: "out", date: "2026-09-08", categoryId: "coffee" }),
      tx({ amount: 4_00, direction: "out", date: "2026-09-09", categoryId: "coffee" }),
      tx({ amount: 400_00, direction: "out", date: "2026-09-07", categoryId: "save", goalId: "g" }), // savings move
      tx({ amount: 120_00, direction: "out", date: "2026-09-06", categoryId: "coffee", debtId: "d" }), // debt payment
    ];
    const q = quickAmounts(txns, cats, "USD", "2026-09-10");
    expect(q.shortcuts.every((s) => s.categoryId === "coffee" && s.amount === 4_00)).toBe(true);
    expect(q.shortcuts.some((s) => s.categoryId === "save")).toBe(false);
    expect(q.shortcuts.some((s) => s.amount === 120_00)).toBe(false);
  });
});

describe("milestones (§5.7)", () => {
  it("reaches the right ones; unused features are not counted", () => {
    const cats = new Map([["food", cat("food", "expenses", "needs")]]);
    const txns = [
      tx({ amount: 50_00, direction: "out", date: "2026-09-01", categoryId: "food" }),
      tx({ amount: 60_00, direction: "out", date: "2026-09-03", categoryId: "food", recurringRuleId: "r1" }),
    ];
    const ms = computeMilestones({ transactions: txns, categoriesById: cats, occurrences: [], goals: [], debts: [], netWorthSeries: [], today: "2026-09-10" });
    const by = Object.fromEntries(ms.map((m) => [m.id, m.state]));
    expect(by.firstSpend).toBe("reached");
    expect(by.firstBillPaid).toBe("reached");
    expect(by.noSpendDay).toBe("reached");
    expect(by.goalReached).toBe("notCounted");
    expect(by.debtPaidOff).toBe("notCounted");
    expect(by.netWorthUp).toBe("notCounted");
  });

  it("goal reached, debt paid off, net worth up when data supports it", () => {
    const goals: Goal[] = [{ id: "g", name: "G", targetAmount: 1000_00, startingAmount: 1000_00, targetDate: null, monthlyContribution: null, categoryId: null, archived: false, completedAt: null, createdAt: 0, updatedAt: 0 }];
    const debts: Debt[] = [{ id: "d", name: "D", currentBalance: 5000_00, annualInterestRate: 0, minimumPayment: 0, balanceAsOf: "2026-09-01", customOrder: null, archived: false, paidOffAt: null, createdAt: 0, updatedAt: 0 }];
    const txns = [tx({ amount: 6000_00, direction: "out", date: "2026-09-05", debtId: "d" })];
    const series = [{ date: "2026-08-31", netWorth: 100 }, { date: "2026-09-30", netWorth: 200 }];
    const ms = computeMilestones({ transactions: txns, categoriesById: new Map(), occurrences: [], goals, debts, netWorthSeries: series, today: "2026-09-10" });
    const by = Object.fromEntries(ms.map((m) => [m.id, m.state]));
    expect(by.goalReached).toBe("reached");
    expect(by.putAway1000).toBe("reached");
    expect(by.debtPaidOff).toBe("reached");
    expect(by.netWorthUp).toBe("reached");
  });
});
