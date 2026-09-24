import { createContext, useContext } from "react";
import type { FinanceRepository } from "@/data/repository";
import type {
  Account,
  Asset,
  AssetValuation,
  BudgetPeriodLine,
  BudgetTemplate,
  Category,
  Debt,
  Goal,
  IncomeSource,
  Minor,
  Person,
  RecurringOverride,
  RecurringRule,
  Settings,
  Transaction,
} from "@/domain/types";
import type { Occurrence } from "@/domain/occurrences";
import type { CashflowProjection, SafeToSpendResult } from "@/domain/cashflow";
import type { BudgetPeriod, FiftyThirtyTwenty } from "@/domain/budget";
import type { GoalsRollup } from "@/domain/goals";
import type { DebtPlan } from "@/domain/debt";
import type { NetWorth, NetWorthPoint } from "@/domain/wealth";
import type {
  SpendingGroups,
  DayCell,
  UntilPayday,
  NextStepResult,
  QuickAmounts,
  Milestone,
} from "@/domain/insights";
import type { InOutRow } from "@/domain/monthGlance";
import type { DateRange } from "@/lib/period";

/**
 * The data layer made available to every screen. Kept in its own module (apart
 * from the DataProvider component) so the provider file exports only a component
 * — which keeps React Fast Refresh happy in development.
 */
export interface DataContextValue {
  repo: FinanceRepository;
  loading: boolean;
  settings: Settings | undefined;
  accounts: Account[];
  categories: Category[];
  people: Person[];
  incomeSources: IncomeSource[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  recurringOverrides: RecurringOverride[];
  categoriesById: Map<string, Category>;
  accountsById: Map<string, Account>;
  peopleById: Map<string, Person>;
  recurringRulesById: Map<string, RecurringRule>;
  occurrencesForRange: (range: DateRange) => Occurrence[];
  // Phase 3: raw budget stores + month-parameterized helpers (like occurrencesForRange).
  budgetTemplates: BudgetTemplate[];
  budgetPeriodLines: BudgetPeriodLine[];
  budgetForPeriod: (periodKey: string) => BudgetPeriod;
  fiftyThirtyTwentyForPeriod: (periodKey: string) => FiftyThirtyTwenty;
  // Phase 6 (§7.3): the five spending groups + the in/out list over any date range.
  spendingForRange: (range: DateRange) => SpendingGroups;
  inOutForRange: (range: DateRange) => InOutRow[];
  // Phase 4: goals & debts (progress/payoff are derived below).
  goals: Goal[];
  debts: Debt[];
  // Phase 5: assets & their valuations (net worth is derived below).
  assets: Asset[];
  valuations: AssetValuation[];
  derived: {
    total: number;
    balances: Record<string, number>;
    monthIn: number;
    monthOut: number;
    occurrences: Occurrence[];
    upcoming: Occurrence[];
    overdue: Occurrence[];
    safeToSpend: SafeToSpendResult;
    projectedCashflow: CashflowProjection;
    // Phase 3 (current month).
    budget: BudgetPeriod;
    fiftyThirtyTwenty: FiftyThirtyTwenty;
    // Phase 4.
    goalsProgress: GoalsRollup;
    debtPlan: DebtPlan;
    // Phase 5.
    netWorth: NetWorth;
    netWorthSeries: NetWorthPoint[];
    assetValues: Record<string, Minor>; // assetId -> current value (from valuations)
    debtBalances: Record<string, Minor>; // debtId -> still owed now (FD-6.1)
    // Phase 6 insights (§5.2–5.7), all current-month / current-period, derived.
    spending: SpendingGroups; // this month's five groups + money in/out/kept
    dayCells: DayCell[]; // this month, day by day
    untilPayday: UntilPayday; // the pay-period strip + per-day
    nextStep: NextStepResult; // the single next step + 3-item checklist
    quickAmounts: QuickAmounts; // preset amounts + recent shortcuts
    milestones: Milestone[]; // the 8 milestones
  };
}

export const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

/** Convenience: currency formatting bound to the current settings. */
export function useCurrency() {
  const { settings } = useData();
  return {
    symbol: settings?.currencySymbol ?? "Rs",
    locale: settings?.locale ?? "en-PK",
  };
}
