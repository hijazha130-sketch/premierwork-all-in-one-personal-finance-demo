/**
 * Example data + demo edition (Architecture §6). Every seeded record id starts
 * with `demo-`, so clearing is exact and can never touch a real record. Dates are
 * relative to the injected `today`, so the app always looks alive. The builder is
 * pure and deterministic; load is idempotent; clear removes exactly the demo ids.
 *
 * Invariant kept: transactions remain the single source of truth. Balances, safe
 * to spend, goal progress, debt "still owed" and net worth are all DERIVED from
 * the seeded transactions/valuations — nothing derived is seeded.
 */
import type { FinanceDB } from "@/data/db";
import { SCHEMA_VERSION } from "@/data/db";
import type {
  Account,
  Asset,
  AssetValuation,
  Category,
  Debt,
  Goal,
  IsoDate,
  Minor,
  RecurringRule,
  Settings,
  Transaction,
} from "@/domain/types";

const DEMO = "demo-";

/** All demo records, grouped by the table they belong to. */
export interface DemoRecords {
  settings: Settings[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  goals: Goal[];
  debts: Debt[];
  assets: Asset[];
  assetValuations: AssetValuation[];
}

// --- money + date helpers (pure, UTC, day-precision) ----------------------

/** Major units → integer minor units (×100). All demo currencies use 2 places. */
function rs(major: number): Minor {
  return Math.round(major * 100);
}

function parseIso(iso: IsoDate): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function iso(y: number, m: number, d: number): IsoDate {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function addDays(base: IsoDate, days: number): IsoDate {
  const [y, m, d] = parseIso(base);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
function firstOfMonth(base: IsoDate): IsoDate {
  const [y, m] = parseIso(base);
  return iso(y, m, 1);
}

const CURRENCY: Record<string, { symbol: string; locale: string }> = {
  PKR: { symbol: "Rs", locale: "en-PK" },
  INR: { symbol: "₹", locale: "en-IN" },
  USD: { symbol: "$", locale: "en-US" },
  GBP: { symbol: "£", locale: "en-GB" },
  EUR: { symbol: "€", locale: "en-IE" },
};

// --- the builder ----------------------------------------------------------

/**
 * Build a complete, alive set of example records anchored to `today`. Pure and
 * deterministic (timestamps are fixed) so tests can assert on it directly.
 */
export function buildDemoRecords(today: IsoDate, currencyCode = "PKR"): DemoRecords {
  const cur = CURRENCY[currencyCode] ?? { symbol: currencyCode, locale: "en" };
  const T = 0; // fixed timestamp — determinism over wall-clock

  const settings: Settings[] = [
    {
      id: `${DEMO}settings`,
      currencyCode,
      currencySymbol: cur.symbol,
      budgetMethod: "carryOver",
      periodStartMonth: 1,
      periodStartYear: Number(today.slice(0, 4)),
      locale: cur.locale,
      schemaVersion: SCHEMA_VERSION,
      setupComplete: true,
      safeToSpendHorizon: "nextIncome", // FD-6.2
      safetyFloor: rs(20000),
      debtStrategy: "avalanche",
      debtMonthlyExtra: 0,
      wallpaper: "none",
      createdAt: T,
      updatedAt: T,
    },
  ];

  const accounts: Account[] = [
    a("checking", "Everyday account", "checking"),
    a("savings", "Savings", "savings"),
    a("card", "Credit card", "credit"),
  ];

  const categories: Category[] = [
    c("rent", "Rent & home", "bills", "needs", "#C98A5B"),
    c("phone", "Phone", "bills", "needs", "#B06E3B"),
    c("internet", "Internet", "bills", "needs", "#B06E3B"),
    c("streaming", "Streaming", "bills", "wants", "#7FA88A"),
    c("groceries", "Groceries", "expenses", "needs", "#7FA88A"),
    c("transport", "Transport", "expenses", "needs", "#8FA9C8"),
    c("coffee", "Coffee", "expenses", "wants", "#C8A860"),
    c("dining", "Eating out", "expenses", "wants", "#B58BC0"),
    c("salary", "Salary", "income", "none", "#4E7A5C"),
    c("saving", "Savings", "savings", "savings", "#7FA88A"),
  ];

  // Recurring rules — income + bills. Anchored to the 1st of THIS month so no
  // stale past occurrences pile up as overdue; this month's are marked paid
  // below, next month's stay upcoming (reserved in Safe to spend).
  const som = firstOfMonth(today);
  const salaryDay = 1;
  const recurringRules: RecurringRule[] = [
    rule("salary", "Monthly pay", rs(180000), "in", "everyMonth", som, "salary", { accountId: id("acc", "checking") }),
    rule("sidegig", "Side project", rs(22000), "in", "every2Weeks", addDays(today, 5), "salary", { accountId: id("acc", "checking") }),
    rule("rent", "Rent", rs(55000), "out", "everyMonth", som, "rent", { accountId: id("acc", "checking") }),
    rule("phone", "Phone bill", rs(3500), "out", "everyMonth", iso(...bumpDay(som, 8)), "phone", { accountId: id("acc", "checking") }),
    rule("internet", "Internet", rs(6000), "out", "everyMonth", iso(...bumpDay(som, 12)), "internet", { accountId: id("acc", "checking") }),
    rule("streaming", "Streaming", rs(1500), "out", "everyMonth", iso(...bumpDay(som, 15)), "streaming", { accountId: id("acc", "checking") }),
    // Debt minimum on the calendar (§4): linked to the debt so paying it lowers the balance.
    rule("debtmin", "Card minimum", rs(6000), "out", "everyMonth", iso(...bumpDay(som, 5)), null, { accountId: id("acc", "checking"), debtId: id("debt", "card") }),
  ];

  const transactions: Transaction[] = [];

  // Paychecks already received: this month's salary (paid) + one side-gig run.
  paidBill("salary", iso(...bumpDay(som, salaryDay)), rs(180000), "in", "checking", "salary");
  txn("sidegig-past", addDays(today, -17), rs(22000), "in", "checking", "salary");

  // Bills already paid this month (only those whose date has arrived).
  paidBill("rent", iso(...bumpDay(som, 1)), rs(55000), "out", "checking", "rent");
  maybePaidBill("phone", 8, rs(3500), "phone");
  maybePaidBill("internet", 12, rs(6000), "internet");
  maybePaidBill("streaming", 15, rs(1500), "streaming");

  // ~3 weeks of everyday + fun spending, spread with a couple of no-spend days.
  const spends: Array<[offset: number, cat: string, acct: string, amt: number]> = [
    [-20, "groceries", "checking", 6400],
    [-19, "coffee", "card", 450],
    [-18, "transport", "checking", 300],
    [-16, "dining", "card", 3200],
    [-15, "coffee", "card", 450],
    [-14, "groceries", "checking", 5100],
    [-12, "transport", "checking", 300],
    [-11, "coffee", "card", 500],
    [-10, "dining", "card", 2600],
    [-8, "groceries", "checking", 4800],
    [-7, "coffee", "card", 450],
    [-6, "transport", "checking", 350],
    [-4, "coffee", "card", 500],
    [-3, "groceries", "checking", 5600],
    [-2, "dining", "card", 2100],
    [-1, "coffee", "card", 450],
  ];
  spends.forEach(([off, cat, acct, amt], i) => txn(`spend-${i}`, addDays(today, off), rs(amt), "out", acct, cat));

  // Money set aside toward a goal (linked via goalId — derived progress).
  txn("save-1", addDays(today, -13), rs(15000), "out", "savings", "saving", { goalId: id("goal", "emergency") });

  // One card payment already made, dated AFTER the debt's balanceAsOf (D1: lowers "still owed").
  const cardAnchor = addDays(today, -40);
  txn("debt-pay", addDays(today, -9), rs(6000), "out", "checking", null, { debtId: id("debt", "card") });
  // This month's linked minimum, paid (also lowers the balance, and marks the calendar item paid).
  paidBill("debtmin", iso(...bumpDay(som, 5)), rs(6000), "out", "checking", null, { debtId: id("debt", "card") });

  const goals: Goal[] = [
    goal("emergency", "Emergency fund", rs(200000), rs(65000)), // ~40% (65k + 15k saved = 80k)
    goal("trip", "Trip home", rs(100000), rs(80000)), // 80%
  ];

  const debts: Debt[] = [
    {
      id: id("debt", "card"),
      name: "Credit card",
      currentBalance: rs(60000),
      annualInterestRate: 24,
      minimumPayment: rs(6000),
      balanceAsOf: cardAnchor,
      customOrder: null,
      archived: false,
      paidOffAt: null,
      createdAt: T,
      updatedAt: T,
    },
  ];

  const assets: Asset[] = [
    { id: id("asset", "fund"), name: "Index fund", kind: "investment", accountId: null, archived: false, createdAt: T, updatedAt: T },
  ];
  const assetValuations: AssetValuation[] = [
    val("fund-1", addDays(today, -90), rs(120000)),
    val("fund-2", addDays(today, -60), rs(128000)),
    val("fund-3", addDays(today, -30), rs(133000)),
    val("fund-4", addDays(today, -2), rs(141000)),
  ];

  return { settings, accounts, categories, transactions, recurringRules, goals, debts, assets, assetValuations };

  // --- record factories (close over `today`, `T`, `transactions`) ---------

  function a(key: string, name: string, type: Account["type"]): Account {
    return { id: id("acc", key), name, type, openingBalance: 0, currencyCode, archived: false, createdAt: T, updatedAt: T };
  }
  function c(key: string, name: string, bucket: Category["bucket"], nws: Category["needsWantsSavings"], color: string): Category {
    return { id: id("cat", key), name, bucket, needsWantsSavings: nws, color, archived: false, createdAt: T, updatedAt: T };
  }
  function rule(
    key: string, name: string, amount: Minor, direction: "in" | "out",
    frequency: RecurringRule["frequency"], anchorDate: IsoDate, catKey: string | null,
    extra: { accountId: string; debtId?: string },
  ): RecurringRule {
    return {
      id: id("rule", key), name, amount, direction,
      type: direction === "in" ? "income" : "expense",
      categoryId: catKey ? id("cat", catKey) : null,
      accountId: extra.accountId, personId: null, frequency, anchorDate, endDate: null,
      active: true, archived: false,
      goalId: null, debtId: extra.debtId ?? null, investmentId: null,
      createdAt: T, updatedAt: T,
    };
  }
  function goal(key: string, name: string, target: Minor, starting: Minor): Goal {
    return {
      id: id("goal", key), name, targetAmount: target, startingAmount: starting,
      targetDate: addDays(today, 180), monthlyContribution: rs(10000), categoryId: id("cat", "saving"),
      archived: false, completedAt: null, createdAt: T, updatedAt: T,
    };
  }
  function val(key: string, asOf: IsoDate, value: Minor): AssetValuation {
    return { id: id("val", key), assetId: id("asset", "fund"), value, asOf, createdAt: T, updatedAt: T };
  }
  function txn(
    key: string, date: IsoDate, amount: Minor, direction: "in" | "out",
    acctKey: string, catKey: string | null, links: { goalId?: string; debtId?: string } = {},
  ): void {
    transactions.push({
      id: id("tx", key), date, amount, direction,
      type: direction === "in" ? "income" : "expense",
      categoryId: catKey ? id("cat", catKey) : null,
      accountId: id("acc", acctKey), personId: null, source: "manual", cleared: true,
      transferGroupId: null, recurringRuleId: null, occurrenceDate: null,
      goalId: links.goalId ?? null, debtId: links.debtId ?? null, investmentId: null,
      createdAt: T, updatedAt: T,
    });
  }
  /** A bill/income marked paid: links the transaction to its rule + occurrence date. */
  function paidBill(
    ruleKey: string, date: IsoDate, amount: Minor, direction: "in" | "out",
    acctKey: string, catKey: string | null, links: { debtId?: string } = {},
  ): void {
    transactions.push({
      id: id("tx", `paid-${ruleKey}-${date}`), date, amount, direction,
      type: direction === "in" ? "income" : "expense",
      categoryId: catKey ? id("cat", catKey) : null,
      accountId: id("acc", acctKey), personId: null, source: "recurring", cleared: true,
      transferGroupId: null, recurringRuleId: id("rule", ruleKey), occurrenceDate: date,
      goalId: null, debtId: links.debtId ?? null, investmentId: null,
      createdAt: T, updatedAt: T,
    });
  }
  /** Pay this month's bill only if its day has already arrived (else leave it upcoming). */
  function maybePaidBill(ruleKey: string, day: number, amount: Minor, catKey: string): void {
    const [, , todayDay] = parseIso(today);
    if (day <= todayDay) paidBill(ruleKey, iso(...bumpDay(som, day)), amount, "out", "checking", catKey);
  }
}

function id(kind: string, key: string): string {
  return `${DEMO}${kind}-${key}`;
}
/** [year, month, day] for the given day-of-month within `base`'s month. */
function bumpDay(base: IsoDate, day: number): [number, number, number] {
  const [y, m] = parseIso(base);
  return [y, m, day];
}

// --- load / clear / has (side-effecting; take the db) ---------------------

/** Table name → the demo records for it, in a single object for uniform iteration. */
function tablesOf(records: DemoRecords): Array<[keyof FinanceDB & string, { id: string }[]]> {
  return [
    ["settings", records.settings],
    ["accounts", records.accounts],
    ["categories", records.categories],
    ["transactions", records.transactions],
    ["recurringRules", records.recurringRules],
    ["goals", records.goals],
    ["debts", records.debts],
    ["assets", records.assets],
    ["assetValuations", records.assetValuations],
  ];
}

/** True if any example transaction is present (the cheap marker for the banner). */
export async function hasDemoData(db: FinanceDB): Promise<boolean> {
  const first = await db.transactions.where("id").startsWith(DEMO).first();
  return first !== undefined;
}

/**
 * Load example data. Idempotent: if example data is already present it does
 * nothing. The settings row is only written when the file has no settings yet,
 * so a real user's settings are never overwritten.
 */
export async function loadDemoData(db: FinanceDB, today: IsoDate, currencyCode?: string): Promise<void> {
  if (await hasDemoData(db)) return;
  const existingSettings = await db.settings.count();
  const records = buildDemoRecords(today, currencyCode);
  for (const [table, rows] of tablesOf(records)) {
    if (table === "settings" && existingSettings > 0) continue; // never clobber real settings
    if (rows.length) await (db[table] as unknown as { bulkPut(r: unknown[]): Promise<unknown> }).bulkPut(rows);
  }
}

/**
 * Remove exactly the example records (`demo-` ids) from every table — and
 * nothing else. Safe to call at any time; real records are untouched.
 */
export async function clearDemoData(db: FinanceDB): Promise<void> {
  const tables: Array<keyof FinanceDB & string> = [
    "settings", "accounts", "categories", "transactions", "recurringRules",
    "recurringOverrides", "budgetTemplates", "budgetPeriodLines",
    "goals", "debts", "assets", "assetValuations",
  ];
  for (const table of tables) {
    const t = db[table] as unknown as {
      where(k: string): { startsWith(p: string): { primaryKeys(): Promise<string[]> } };
      bulkDelete(keys: string[]): Promise<void>;
    };
    const keys = await t.where("id").startsWith(DEMO).primaryKeys();
    if (keys.length) await t.bulkDelete(keys);
  }
}
