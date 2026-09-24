import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createDB } from "@/data/db";
import { FinanceRepository } from "@/data/repository";
import { buildDemoRecords, loadDemoData, clearDemoData, hasDemoData } from "@/data/demo";
import { userSpendCount, demoLimitReached, DEMO_SPEND_LIMIT, startScreenPath } from "@/lib/edition";
import { debtBalanceNow } from "@/domain/debt";
import { spendingGroups } from "@/domain/insights";
import { safeToSpend } from "@/domain/cashflow";
import { computeOccurrences } from "@/domain/occurrences";
import type { Transaction } from "@/domain/types";

let counter = 0;
const dbName = () => `test-demo-${Date.now()}-${++counter}`;
const TODAY = "2026-09-24";

function tx(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    date: "2026-09-10", amount: 100, direction: "out", type: "expense", categoryId: null,
    accountId: "a1", personId: null, source: "manual", cleared: true, transferGroupId: null,
    recurringRuleId: null, occurrenceDate: null, goalId: null, debtId: null, investmentId: null,
    createdAt: 0, updatedAt: 0, ...over,
  };
}

describe("example data — builder", () => {
  it("every seeded record id starts with demo-", () => {
    const r = buildDemoRecords(TODAY, "PKR");
    const all = [
      ...r.settings, ...r.accounts, ...r.categories, ...r.transactions,
      ...r.recurringRules, ...r.goals, ...r.debts, ...r.assets, ...r.assetValuations,
    ];
    expect(all.length).toBeGreaterThan(20);
    expect(all.every((rec) => rec.id.startsWith("demo-"))).toBe(true);
    expect(r.transactions.length).toBeGreaterThan(10);
  });

  it("is deterministic for a given day + currency", () => {
    expect(JSON.stringify(buildDemoRecords(TODAY, "PKR"))).toBe(JSON.stringify(buildDemoRecords(TODAY, "PKR")));
  });

  it("looks alive: debt payment lowers the balance, a payday horizon, grouped spend", () => {
    const r = buildDemoRecords(TODAY, "PKR");
    const debt = r.debts[0];
    // A payment after the anchor lowers "still owed" (D1).
    expect(debtBalanceNow(debt, r.transactions)).toBeLessThan(debt.currentBalance);

    // Mirror the app's occurrence window (back + forward) so upcoming paydays appear.
    const occ = computeOccurrences(r.recurringRules, r.transactions, [], { from: "2026-06-01", to: "2026-12-31" }, TODAY);
    const sts = safeToSpend(r.accounts, r.transactions, occ, TODAY, { mode: "nextIncome" });
    expect(sts.horizonKind).toBe("payday"); // the recurring pay gives an upcoming payday

    const cats = new Map(r.categories.map((c) => [c.id, c]));
    const groups = spendingGroups(r.transactions, cats, { from: "2026-09-01", to: "2026-09-30" });
    expect(groups.groups.reduce((a, g) => a + g.amount, 0)).toBe(groups.moneyOut);
    expect(groups.moneyOut).toBeGreaterThan(0);
  });
});

describe("example data — load / clear (safety + idempotency)", () => {
  it("loads once, is idempotent on a second call", async () => {
    const db = createDB(dbName());
    await loadDemoData(db, TODAY, "PKR");
    const afterFirst = await db.transactions.count();
    await loadDemoData(db, TODAY, "PKR"); // no-op
    expect(await db.transactions.count()).toBe(afterFirst);
    expect(await hasDemoData(db)).toBe(true);
  });

  it("clearing removes exactly the example records and nothing else (acceptance #9)", async () => {
    const db = createDB(dbName());
    const repo = new FinanceRepository(db);
    // A real record the user created.
    const realAcc = await repo.createAccount({ name: "My bank", type: "checking", openingBalance: 5000_00, currencyCode: "PKR", archived: false });
    await loadDemoData(db, TODAY, "PKR");
    expect(await hasDemoData(db)).toBe(true);

    await clearDemoData(db);
    expect(await hasDemoData(db)).toBe(false);
    // The real account is untouched; no demo account survives.
    const accounts = await db.accounts.toArray();
    expect(accounts.map((a) => a.id)).toEqual([realAcc.id]);
    expect(accounts.every((a) => !a.id.startsWith("demo-"))).toBe(true);
  });

  it("does not overwrite an existing settings row", async () => {
    const db = createDB(dbName());
    const repo = new FinanceRepository(db);
    const mine = await repo.saveSettings({ currencyCode: "USD", currencySymbol: "$" });
    await loadDemoData(db, TODAY, "PKR");
    const settings = await db.settings.toArray();
    expect(settings).toHaveLength(1);
    expect(settings[0].id).toBe(mine.id);
    expect(settings[0].currencyCode).toBe("USD");
  });

  it("seeds a settings row when the file has none", async () => {
    const db = createDB(dbName());
    await loadDemoData(db, TODAY, "PKR");
    const settings = await db.settings.toArray();
    expect(settings).toHaveLength(1);
    expect(settings[0].id).toBe("demo-settings");
    expect(settings[0].safeToSpendHorizon).toBe("nextIncome"); // FD-6.2
  });
});

describe("demo edition — gentle limit + deep links", () => {
  it("counts only real (non-demo) manual out transactions", () => {
    const txns = [
      tx({ id: "demo-tx-1" }), // example — never counts
      tx({ id: "r1" }), // real manual out — counts
      tx({ id: "r2", direction: "in", type: "income" }), // money in — no
      tx({ id: "r3", source: "recurring" }), // a paid bill — no (not manual)
    ];
    expect(userSpendCount(txns)).toBe(1);
  });

  it("the limit only bites in the demo edition, at the cap", () => {
    const under = Array.from({ length: DEMO_SPEND_LIMIT - 1 }, (_, i) => tx({ id: `r${i}` }));
    const at = Array.from({ length: DEMO_SPEND_LIMIT }, (_, i) => tx({ id: `r${i}` }));
    expect(demoLimitReached(under, "demo")).toBe(false);
    expect(demoLimitReached(at, "demo")).toBe(true);
    expect(demoLimitReached(at, "full")).toBe(false); // full edition never limits
  });

  it("maps ?start= values to screens", () => {
    expect(startScreenPath("today")).toBe("/");
    expect(startScreenPath("bills")).toBe("/money");
    expect(startScreenPath("debt")).toBe("/plan?view=debt");
    expect(startScreenPath("goals")).toBe("/plan?view=goals");
    expect(startScreenPath("wealth")).toBe("/grow");
    expect(startScreenPath("plan")).toBe("/plan");
    expect(startScreenPath("nonsense")).toBeNull();
    expect(startScreenPath(null)).toBeNull();
  });
});
