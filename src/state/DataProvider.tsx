import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/data/db";
import { loadDemoData } from "@/data/demo";
import { isDemo } from "@/lib/edition";
import { FinanceRepository } from "@/data/repository";
import { balancesByAccount, totalBalance } from "@/domain/balance";
import { moneyIn, moneyOut } from "@/domain/aggregation";
import { currentMonth, monthRange, todayIso, type DateRange } from "@/lib/period";
import { computeOccurrences, overdue, upcoming, type Occurrence } from "@/domain/occurrences";
import { projectCashflow, safeToSpend } from "@/domain/cashflow";
import { computeBudgetPeriod, fiftyThirtyTwenty, type BudgetInput } from "@/domain/budget";
import { computeGoals } from "@/domain/goals";
import { computeDebtPlan, debtBalanceNow } from "@/domain/debt";
import { assetValueAt, netWorthNow, netWorthSeries } from "@/domain/wealth";
import { buildInOut } from "@/domain/monthGlance";
import {
  spendingGroups,
  dayByDay,
  untilPayday,
  nextStepAndChecklist,
  quickAmounts,
  computeMilestones,
} from "@/domain/insights";
import { DataContext, type DataContextValue } from "@/state/dataContext";

/**
 * The app-level derived-state seam. Screens read balances, totals, Safe to Spend,
 * upcoming/overdue etc. from here and never compute money math inline. The
 * context object and hooks live in dataContext.ts so this file exports only a
 * component (Fast Refresh friendly).
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const db = getDB();
  const repo = useMemo(() => new FinanceRepository(db), [db]);

  // First open: bring the app to life with example numbers (Architecture §6).
  // The demo edition always ensures they are present; the full edition seeds
  // them only into a truly empty file (never over a real user's data). Load is
  // idempotent, and the live queries below pick the rows up automatically.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void (async () => {
      const [nAcc, nTx, nSet] = await Promise.all([
        db.accounts.count(),
        db.transactions.count(),
        db.settings.count(),
      ]);
      const emptyFile = nAcc === 0 && nTx === 0 && nSet === 0;
      if (isDemo || emptyFile) await loadDemoData(db, todayIso());
    })();
  }, [db]);

  const settings = useLiveQuery(() => repo.getSettings(), []);
  const accounts = useLiveQuery(() => repo.listAccounts(), []);
  const categories = useLiveQuery(() => repo.listCategories(), []);
  const people = useLiveQuery(() => repo.listPeople(), []);
  const incomeSources = useLiveQuery(() => repo.listIncomeSources(), []);
  const transactions = useLiveQuery(() => repo.listTransactions(), []);
  const recurringRules = useLiveQuery(() => repo.listRecurringRules(), []);
  const recurringOverrides = useLiveQuery(() => repo.listRecurringOverrides(), []);
  const budgetTemplates = useLiveQuery(() => repo.listBudgetTemplates(), []);
  const budgetPeriodLines = useLiveQuery(() => repo.listBudgetPeriodLines(), []);
  const goals = useLiveQuery(() => repo.listGoals(), []);
  const debts = useLiveQuery(() => repo.listDebts(), []);
  const assets = useLiveQuery(() => repo.listAssets(), []);
  const valuations = useLiveQuery(() => repo.listAllValuations(), []);

  // Occurrences for any requested range — used by the Calendar's month paging.
  const occurrencesForRange = useCallback(
    (range: DateRange): Occurrence[] =>
      computeOccurrences(recurringRules ?? [], transactions ?? [], recurringOverrides ?? [], range, todayIso()),
    [recurringRules, transactions, recurringOverrides],
  );

  // One assembled budget input; the month-parameterized helpers close over it so
  // navigating months does no inline computation in the Plan screens.
  const budgetInput = useMemo<BudgetInput>(
    () => ({
      categories: categories ?? [], // already excludes archived — the editable set
      templates: budgetTemplates ?? [],
      lines: budgetPeriodLines ?? [],
      transactions: transactions ?? [],
      incomeSources: incomeSources ?? [],
      settings: {
        budgetMethod: settings?.budgetMethod ?? "carryOver",
        periodStartMonth: settings?.periodStartMonth ?? 1,
        periodStartYear: settings?.periodStartYear ?? Number(todayIso().slice(0, 4)),
      },
    }),
    [categories, budgetTemplates, budgetPeriodLines, transactions, incomeSources, settings],
  );
  const budgetForPeriod = useCallback((periodKey: string) => computeBudgetPeriod(budgetInput, periodKey), [budgetInput]);
  const fiftyThirtyTwentyForPeriod = useCallback((periodKey: string) => fiftyThirtyTwenty(budgetInput, periodKey), [budgetInput]);
  // Phase 6 (§7.3): the five spending groups for any range — powers Month at a glance.
  const spendingForRange = useCallback(
    (range: DateRange) => spendingGroups(transactions ?? [], new Map((categories ?? []).map((c) => [c.id, c])), range),
    [transactions, categories],
  );
  const inOutForRange = useCallback(
    (range: DateRange) =>
      buildInOut(occurrencesForRange(range), transactions ?? [], range, (id) => (recurringRules ?? []).find((r) => r.id === id)?.name),
    [occurrencesForRange, transactions, recurringRules],
  );

  // Any undefined live query means the first read hasn't resolved yet.
  const loading =
    accounts === undefined ||
    categories === undefined ||
    transactions === undefined ||
    people === undefined ||
    incomeSources === undefined ||
    recurringRules === undefined ||
    recurringOverrides === undefined ||
    budgetTemplates === undefined ||
    budgetPeriodLines === undefined ||
    goals === undefined ||
    debts === undefined ||
    assets === undefined ||
    valuations === undefined;

  const value = useMemo<DataContextValue>(() => {
    const acc = accounts ?? [];
    const cats = categories ?? [];
    const ppl = people ?? [];
    const inc = incomeSources ?? [];
    const txns = transactions ?? [];
    const rules = recurringRules ?? [];
    const overrides = recurringOverrides ?? [];
    const gls = goals ?? [];
    const dbtsRaw = debts ?? [];
    // FD-6.1/D1: each debt's balance now reflects linked payments after its anchor.
    // The pure payoff/net-worth engines read this via currentBalance, unchanged.
    const dbts = dbtsRaw.map((d) => ({ ...d, currentBalance: debtBalanceNow(d, txns) }));
    const asts = assets ?? [];
    const vals = valuations ?? [];
    const range = monthRange(currentMonth()); // current month, for month in/out and the cash-flow horizon
    const balances = balancesByAccount(acc, txns); // computed once; reused by net worth

    // today is injected via todayIso() — the one sanctioned clock read; engines
    // never call new Date() inline (matches the Phase 1 purity pattern).
    const today = todayIso();
    const currentPeriodKey = today.slice(0, 7); // "YYYY-MM"
    // Bounded occurrence window: a 12-month look-back so overdue unpaid items are
    // found, plus 3 months forward for upcoming + this-month cash-flow. Never
    // scans from epoch. NOTE: the Calendar navigates arbitrary months and computes
    // its own month's occurrences via occurrencesForRange; this window is the
    // standard one Home reads.
    const occWindow: DateRange = occurrenceWindow(today);

    const occurrences = computeOccurrences(rules, txns, overrides, occWindow, today);

    const safeToSpendConfig = {
      mode: settings?.safeToSpendHorizon ?? "endOfMonth", // FD-1 default
      rollingDays: settings?.safeToSpendRollingDays, // used only for "rollingDays"
      // FD-2: expected income is not pre-credited (creditExpectedIncome omitted -> off).
      safetyFloor: settings?.safetyFloor ?? 0, // FD-4.3: soft emergency cushion
    } as const;

    // Values reused by both the derived block and the Phase 6 insights below.
    const categoriesById = new Map(cats.map((c) => [c.id, c]));
    const sts = safeToSpend(acc, txns, occurrences, today, safeToSpendConfig);
    const nwSeries = netWorthSeries(twelveMonthRange(today), acc, txns, asts, vals, dbts);
    const currencyCode = settings?.currencyCode ?? "PKR";

    return {
      repo,
      loading,
      settings,
      accounts: acc,
      categories: cats,
      people: ppl,
      incomeSources: inc,
      transactions: txns,
      recurringRules: rules,
      recurringOverrides: overrides,
      categoriesById,
      accountsById: new Map(acc.map((a) => [a.id, a])),
      peopleById: new Map(ppl.map((p) => [p.id, p])),
      recurringRulesById: new Map(rules.map((r) => [r.id, r])),
      occurrencesForRange,
      budgetTemplates: budgetTemplates ?? [],
      budgetPeriodLines: budgetPeriodLines ?? [],
      budgetForPeriod,
      fiftyThirtyTwentyForPeriod,
      spendingForRange,
      inOutForRange,
      goals: gls,
      debts: dbtsRaw, // raw typed balances — forms re-anchor from these
      assets: asts,
      valuations: vals,
      derived: {
        total: totalBalance(acc, txns),
        balances,
        monthIn: moneyIn(txns, range),
        monthOut: moneyOut(txns, range),
        occurrences,
        upcoming: upcoming(occurrences),
        overdue: overdue(occurrences),
        safeToSpend: sts,
        projectedCashflow: projectCashflow(acc, txns, occurrences, range, today),
        // Phase 3 (current month): screens read these; navigated months use the helpers.
        budget: budgetForPeriod(currentPeriodKey),
        fiftyThirtyTwenty: fiftyThirtyTwentyForPeriod(currentPeriodKey),
        // Phase 4: goal progress + the debt payoff plan (strategy + extra from settings).
        goalsProgress: computeGoals(gls, txns, today),
        debtPlan: computeDebtPlan(
          dbts,
          { strategy: settings?.debtStrategy ?? "avalanche", monthlyExtra: settings?.debtMonthlyExtra ?? 0 },
          today,
        ),
        // Phase 5: net worth now + the last-12-months monthly trend. Fed the
        // already-computed balances so account balances are derived once.
        netWorth: netWorthNow(acc, balances, asts, vals, dbts, today),
        netWorthSeries: nwSeries,
        assetValues: Object.fromEntries(asts.map((a) => [a.id, assetValueAt(a.id, vals, today)])),
        // FD-6.1/D1: each debt's "still owed" right now (typed balance − later payments).
        debtBalances: Object.fromEntries(dbtsRaw.map((d) => [d.id, debtBalanceNow(d, txns)])),
        // Phase 6 insights (§5.2–5.7): all derived, current month / current period.
        spending: spendingGroups(txns, categoriesById, range),
        dayCells: dayByDay(txns, categoriesById, occurrences, currentPeriodKey, today),
        untilPayday: untilPayday(sts, txns, occurrences, categoriesById, today),
        nextStep: nextStepAndChecklist(txns, occurrences, rules, acc, today),
        quickAmounts: quickAmounts(txns, categoriesById, currencyCode, today),
        milestones: computeMilestones({
          transactions: txns,
          categoriesById,
          occurrences,
          goals: gls,
          debts: dbtsRaw,
          netWorthSeries: nwSeries,
          today,
          currencyCode,
        }),
      },
    };
  }, [repo, loading, settings, accounts, categories, people, incomeSources, transactions, recurringRules, recurringOverrides, occurrencesForRange, budgetTemplates, budgetPeriodLines, budgetForPeriod, fiftyThirtyTwentyForPeriod, spendingForRange, inOutForRange, goals, debts, assets, valuations]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/**
 * Bounded [from, to] window for occurrence status: a 12-month look-back (so
 * overdue unpaid items are generated) plus 3 months forward (upcoming + this
 * month's cash-flow). Snaps to whole months and never scans from epoch.
 */
function occurrenceWindow(today: string): DateRange {
  const [y, m] = today.split("-").map(Number);
  const shift = (delta: number) => {
    const idx = y * 12 + (m - 1) + delta;
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
  };
  return { from: monthRange(shift(-12)).from, to: monthRange(shift(3)).to };
}

/** The last 12 months (inclusive of the current one) for the net-worth trend. */
function twelveMonthRange(today: string): DateRange {
  const [y, m] = today.split("-").map(Number);
  const shift = (delta: number) => {
    const idx = y * 12 + (m - 1) + delta;
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
  };
  return { from: monthRange(shift(-11)).from, to: monthRange(shift(0)).to };
}
