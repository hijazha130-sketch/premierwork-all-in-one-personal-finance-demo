/**
 * Example data + demo edition (Architecture §6, Batch 7 §A4). Every seeded record
 * id starts with `demo-`, so clearing is exact and can never touch a real record.
 * Dates are relative to the injected `today`, so the app always looks alive.
 *
 * The dataset is authored ONCE as a USD base and generated for any currency via
 * `scaleExampleMinor` (a believability scale, NOT an exchange rate). Every derived
 * number is computed from the rounded records, so the maths stays consistent.
 *
 * Invariant kept: transactions remain the single source of truth. Balances, safe
 * to spend, goal progress, debt "still owed" and net worth are all DERIVED —
 * nothing derived is seeded. One real card = one liability (a Debt), never also a
 * credit account, so Wealth and the Debt tab always agree (B3).
 */
import type { FinanceDB } from "@/data/db";
import { SCHEMA_VERSION } from "@/data/db";
import { getCurrency, scaleExampleMinor, defaultCushionMinor } from "@/domain/currencies";
import type {
  Account,
  Asset,
  AssetValuation,
  BudgetTemplate,
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
  budgetTemplates: BudgetTemplate[];
  goals: Goal[];
  debts: Debt[];
  assets: Asset[];
  assetValuations: AssetValuation[];
}

// --- date helpers (pure, UTC, day-precision) ------------------------------

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

// --- the builder ----------------------------------------------------------

/**
 * Build a complete, alive set of example records anchored to `today`, in the
 * chosen currency. Pure + deterministic (fixed timestamps) so tests can assert.
 */
export function buildDemoRecords(today: IsoDate, currencyCode = "USD"): DemoRecords {
  const cur = getCurrency(currencyCode);
  const T = 0; // fixed timestamp — determinism over wall-clock
  // USD-major → this currency's example minor units (believability scale, not a rate).
  const m = (usdMajor: number): Minor => scaleExampleMinor(Math.round(usdMajor * 100), cur.code);

  const settings: Settings[] = [
    {
      id: `${DEMO}settings`,
      currencyCode: cur.code,
      currencySymbol: cur.symbol,
      budgetMethod: "carryOver",
      periodStartMonth: 1,
      periodStartYear: Number(today.slice(0, 4)),
      locale: cur.locale,
      schemaVersion: SCHEMA_VERSION,
      setupComplete: true,
      safeToSpendHorizon: "nextIncome", // FD-6.2
      safetyFloor: defaultCushionMinor(cur.code), // registry cushion (USD 500)
      debtStrategy: "avalanche",
      debtMonthlyExtra: 0,
      wallpaper: "none",
      createdAt: T,
      updatedAt: T,
    },
  ];

  // No credit-card ACCOUNT (B3): the card is a Debt only, so it is one liability.
  const accounts: Account[] = [
    a("checking", "Everyday account", "checking", 0),
    // A modest ready buffer. NOTE: kept small on purpose — Safe to spend counts
    // every cash account, so a large savings balance would inflate the per-day
    // headline. Goal progress ("put away") is derived from goal terms, not this.
    a("savings", "Savings", "savings", m(600)),
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

  // Recurring rules — income + bills. Bills anchored so this month's are marked
  // paid below and next month's stay upcoming (reserved in Safe to spend).
  const som = firstOfMonth(today);
  const recurringRules: RecurringRule[] = [
    rule("salary", "Monthly pay", m(4500), "in", "everyMonth", som, "salary", { accountId: id("acc", "checking") }),
    // Side project income arrives as a past deposit (below), not a recurring rule:
    // that keeps Safe to spend paced to the monthly payday so the per-day headline
    // stays believable through the month rather than spiking to a payday days away.
    rule("rent", "Rent", m(1450), "out", "everyMonth", som, "rent", { accountId: id("acc", "checking") }),
    rule("phone", "Phone bill", m(55), "out", "everyMonth", iso(...bumpDay(som, 8)), "phone", { accountId: id("acc", "checking") }),
    rule("internet", "Internet", m(70), "out", "everyMonth", iso(...bumpDay(som, 12)), "internet", { accountId: id("acc", "checking") }),
    rule("streaming", "Streaming", m(16), "out", "everyMonth", iso(...bumpDay(som, 15)), "streaming", { accountId: id("acc", "checking") }),
    // Card minimum on the calendar (§4): a debt payment, so paying it lowers the balance.
    rule("cardmin", "Card minimum", m(120), "out", "everyMonth", iso(...bumpDay(som, 5)), null, { accountId: id("acc", "checking"), debtId: id("debt", "card") }),
  ];

  const transactions: Transaction[] = [];

  // Paychecks already received: this month's salary (paid) + one side-gig run.
  paidBill("salary", iso(...bumpDay(som, 1)), m(4500), "in", "checking", "salary");
  txn("sidegig-past", addDays(today, -17), m(550), "in", "checking", "salary");

  // Bills already paid this month (only those whose day has arrived).
  paidBill("rent", iso(...bumpDay(som, 1)), m(1450), "out", "checking", "rent");
  maybePaidBill("phone", 8, m(55), "phone");
  maybePaidBill("internet", 12, m(70), "internet");
  maybePaidBill("streaming", 15, m(16), "streaming");

  // ~3 weeks of everyday + fun spending on the everyday account (no card account).
  const spends: Array<[offset: number, cat: string, usd: number]> = [
    [-20, "groceries", 112],
    [-19, "coffee", 5],
    [-18, "transport", 12],
    [-16, "dining", 50],
    [-15, "coffee", 6],
    [-14, "groceries", 124],
    [-12, "transport", 9],
    [-11, "coffee", 4],
    [-10, "dining", 45],
    [-8, "groceries", 98],
    [-7, "coffee", 5],
    [-6, "transport", 15],
    [-4, "coffee", 5],
    [-3, "groceries", 106],
    [-2, "transport", 8],
    [-1, "coffee", 6],
  ];
  spends.forEach(([off, cat, usd], i) => txn(`spend-${i}`, addDays(today, off), m(usd), "out", "checking", cat));

  // Money set aside this month toward the emergency goal (Saving group + progress).
  txn("save-1", addDays(today, -9), m(400), "out", "checking", "saving", { goalId: id("goal", "emergency") });

  // Card is a Debt; this month's minimum is a payment that lowers "still owed"
  // (FD-6.1). Typed balance 3,320 − 120 paid after the anchor = 3,200 still owed.
  const cardAnchor = addDays(today, -40);
  paidBill("cardmin", iso(...bumpDay(som, 5)), m(120), "out", "checking", null, { debtId: id("debt", "card") });

  // Planned amounts for EVERY spending group (B2): most a little under, dining over.
  const budgetTemplates: BudgetTemplate[] = [
    tpl("rent", m(1450)),
    tpl("internet", m(70)),
    tpl("phone", m(55)),
    tpl("streaming", m(16)),
    tpl("groceries", m(470)), // spent ~440 → a little under
    tpl("transport", m(60)), // spent ~44 → under
    tpl("coffee", m(35)), // spent ~26 → under
    tpl("dining", m(90)), // spent ~95 → the one slightly over
    tpl("saving", m(400)),
  ];

  const goals: Goal[] = [
    goal("emergency", "Emergency fund", m(6000), m(2000)), // 2,000 + 400 saved = 2,400 of 6,000
    goal("trip", "Trip", m(1500), m(1200)), // 1,200 of 1,500
  ];

  const debts: Debt[] = [
    {
      id: id("debt", "card"),
      name: "Credit card",
      currentBalance: m(3320),
      annualInterestRate: 22.9,
      minimumPayment: m(120),
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
    val("fund-1", addDays(today, -90), m(7800)),
    val("fund-2", addDays(today, -60), m(8100)),
    val("fund-3", addDays(today, -30), m(8300)),
    val("fund-4", addDays(today, -2), m(8500)),
  ];

  return { settings, accounts, categories, transactions, recurringRules, budgetTemplates, goals, debts, assets, assetValuations };

  // --- record factories (close over `cur`, `T`, `transactions`) -----------

  function a(key: string, name: string, type: Account["type"], openingBalance: Minor): Account {
    return { id: id("acc", key), name, type, openingBalance, currencyCode: cur.code, archived: false, createdAt: T, updatedAt: T };
  }
  function c(key: string, name: string, bucket: Category["bucket"], nws: Category["needsWantsSavings"], color: string): Category {
    return { id: id("cat", key), name, bucket, needsWantsSavings: nws, color, archived: false, createdAt: T, updatedAt: T };
  }
  function tpl(catKey: string, plannedAmount: Minor): BudgetTemplate {
    return { id: id("tpl", catKey), categoryId: id("cat", catKey), plannedAmount, createdAt: T, updatedAt: T };
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
      targetDate: addDays(today, 180), monthlyContribution: m(300), categoryId: id("cat", "saving"),
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
    ["budgetTemplates", records.budgetTemplates],
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
 * Re-create the example records in a chosen currency (Batch 7 §A2). Clears the
 * existing `demo-` records and loads a fresh set. The user's OWN records (ids
 * without the `demo-` prefix) are never touched — only the symbol/scale of the
 * made-up numbers changes. The demo settings row's currency is updated too.
 */
export async function reloadDemoDataInCurrency(db: FinanceDB, today: IsoDate, currencyCode: string): Promise<void> {
  await clearDemoData(db, { keepSettings: true });
  const records = buildDemoRecords(today, currencyCode);
  for (const [table, rows] of tablesOf(records)) {
    if (table === "settings") continue; // the caller owns the settings row's currency
    if (rows.length) await (db[table] as unknown as { bulkPut(r: unknown[]): Promise<unknown> }).bulkPut(rows);
  }
}

/**
 * Remove exactly the example records (`demo-` ids) from every table — and
 * nothing else. Safe to call at any time; real records are untouched.
 */
export async function clearDemoData(db: FinanceDB, opts: { keepSettings?: boolean } = {}): Promise<void> {
  const tables: Array<keyof FinanceDB & string> = [
    "settings", "accounts", "categories", "transactions", "recurringRules",
    "recurringOverrides", "budgetTemplates", "budgetPeriodLines",
    "goals", "debts", "assets", "assetValuations",
  ];
  for (const table of tables) {
    if (table === "settings" && opts.keepSettings) continue;
    const t = db[table] as unknown as {
      where(k: string): { startsWith(p: string): { primaryKeys(): Promise<string[]> } };
      bulkDelete(keys: string[]): Promise<void>;
    };
    const keys = await t.where("id").startsWith(DEMO).primaryKeys();
    if (keys.length) await t.bulkDelete(keys);
  }
}
