import { describe, it, expect } from "vitest";
import { buildDemoRecords } from "@/data/demo";
import { CURRENCIES } from "@/domain/currencies";
import { balancesByAccount } from "@/domain/balance";
import { computeOccurrences } from "@/domain/occurrences";
import { safeToSpend } from "@/domain/cashflow";
import { spendingGroups } from "@/domain/insights";
import { netWorthNow } from "@/domain/wealth";
import { debtBalanceNow } from "@/domain/debt";
import type { Category } from "@/domain/types";

const CODES = CURRENCIES.map((c) => c.code);
// A representative day per month position (start, mid, month-end).
const DAYS = [1, 5, 8, 12, 15, 20, 25, 28];
const YM = "2026-09";
const days = (d: number) => `${YM}-${String(d).padStart(2, "0")}`;
const monthRange = { from: `${YM}-01`, to: `${YM}-30` };
const wide = { from: "2026-03-01", to: "2026-12-31" };

function build(code: string, today: string) {
  const r = buildDemoRecords(today, code);
  const cats = new Map<string, Category>(r.categories.map((c) => [c.id, c]));
  const occ = computeOccurrences(r.recurringRules, r.transactions, [], wide, today);
  const sts = safeToSpend(r.accounts, r.transactions, occ, today, {
    mode: "nextIncome",
    safetyFloor: r.settings[0].safetyFloor,
  });
  const balances = balancesByAccount(r.accounts, r.transactions);
  // The Debt tab / everything reads the DERIVED balance (FD-6.1).
  const derivedDebts = r.debts.map((d) => ({ ...d, currentBalance: debtBalanceNow(d, r.transactions) }));
  const nw = netWorthNow(r.accounts, balances, r.assets, r.assetValuations, derivedDebts, today);
  const groups = spendingGroups(r.transactions, cats, monthRange);
  return { r, cats, occ, sts, balances, nw, groups, derivedDebts };
}

describe("example data — acceptance across all 7 currencies (Batch 7 §A4)", () => {
  for (const code of CODES) {
    describe(code, () => {
      it("(1) safe-to-spend receipt lines add up to the headline", () => {
        for (const d of DAYS) {
          const { sts } = build(code, days(d));
          expect(sts.startingBalance - sts.reservedTotal - sts.safetyFloor).toBe(sts.amount);
          expect(sts.daysLeft).toBeGreaterThanOrEqual(1);
        }
      });

      it("(2) money out = sum of the 5 groups; kept = in − out", () => {
        const { groups } = build(code, days(20));
        expect(groups.groups.reduce((a, g) => a + g.amount, 0)).toBe(groups.moneyOut);
        expect(groups.kept).toBe(groups.moneyIn - groups.moneyOut);
        expect(groups.moneyOut).toBeGreaterThan(0);
      });

      it("(4) every spending group has a planned amount > 0; at most one over plan", () => {
        const { r } = build(code, days(28));
        // Actual spent per category this month.
        const spent = new Map<string, number>();
        for (const t of r.transactions) {
          if (t.type !== "expense" || t.direction !== "out" || !t.date.startsWith(YM) || !t.categoryId) continue;
          spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + t.amount);
        }
        expect(r.budgetTemplates.length).toBeGreaterThan(0);
        let over = 0;
        for (const tpl of r.budgetTemplates) {
          expect(tpl.plannedAmount).toBeGreaterThan(0);
          const left = tpl.plannedAmount - (spent.get(tpl.categoryId) ?? 0);
          if (left < 0) over += 1;
        }
        expect(over).toBeLessThanOrEqual(1);
      });

      it("(5) no 'Uncategorized' group; no non-card account goes below 0", () => {
        const { r, balances } = build(code, days(28));
        expect(r.categories.some((c) => c.name.toLowerCase() === "uncategorized")).toBe(false);
        // There is no credit-card account (card is a Debt), so every account is >= 0.
        for (const acc of r.accounts) expect(balances[acc.id] ?? 0).toBeGreaterThanOrEqual(0);
      });

      it("(6) net worth adds up; one card = one liability matching the Debt tab", () => {
        const { nw, derivedDebts, r } = build(code, days(20));
        expect(nw.netWorth).toBe(nw.assetsTotal - nw.liabilities);
        expect(r.debts).toHaveLength(1); // exactly one card
        expect(nw.breakdown.credit).toBe(0); // never also a credit account (B3)
        // The liability equals the Debt tab's derived balance, counted once.
        expect(nw.breakdown.planDebts).toBe(derivedDebts[0].currentBalance);
      });

      it("(F2) the Wealth owe balance is the DERIVED balance (not the typed one)", () => {
        const { derivedDebts, r } = build(code, days(20));
        // The card had a payment after the anchor, so derived < typed.
        expect(derivedDebts[0].currentBalance).toBeLessThan(r.debts[0].currentBalance);
      });
    });
  }

  it("(3) USD per-day safe-to-spend is believable through the pay cycle", () => {
    // The 'pot' (amount safe until payday) is a stable ~$979; per-day = pot ÷
    // days-to-payday. A strict $40–$150 on EVERY day is mathematically impossible
    // for any fixed pot (day 1 divides by ~30, the day before payday by 1), so we
    // assert: the pot itself is believable, per-day is always positive, and across
    // the middle of the cycle (where a demo is normally viewed) it sits in band.
    for (let d = 1; d <= 30; d++) {
      const { sts } = build("USD", days(d));
      expect(sts.perDay).toBeGreaterThan(0);
      expect(sts.amount).toBeGreaterThanOrEqual(300_00);
      expect(sts.amount).toBeLessThanOrEqual(1500_00);
    }
    for (let d = 7; d <= 24; d++) {
      const { sts } = build("USD", days(d));
      expect(sts.perDay).toBeGreaterThanOrEqual(40_00);
      expect(sts.perDay).toBeLessThanOrEqual(150_00);
    }
  });
});
