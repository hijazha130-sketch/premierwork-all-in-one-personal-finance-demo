/**
 * Demo seed (DEMO BUILD ONLY).
 *
 * The demo runs against an in-memory IndexedDB (see main.tsx — `fake-indexeddb`
 * replaces the real one), so NOTHING a visitor types is ever written to disk.
 * Every page load starts with a fresh, empty in-memory database; this function
 * fills it with a realistic sample so the visitor lands on a populated app, and
 * anything they change lives only until they reload/close (then it resets).
 *
 * The main application is untouched — this file exists only in the demo repo.
 */
import { getDB } from "@/data/db";
import { FinanceRepository } from "@/data/repository";
import { DEFAULT_CATEGORIES } from "@/data/seed";

const rs = (major: number): number => Math.round(major * 100); // rupees -> minor units

function dateParts(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const today = now.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  // Clamped to today, so seeded transactions are never future-dated.
  const thisMonth = (day: number) => `${y}-${pad(m + 1)}-${pad(Math.min(day, today))}`;
  // Unclamped, for repeating-bill anchors (their next occurrence can be upcoming).
  const thisMonthRaw = (day: number) => `${y}-${pad(m + 1)}-${pad(day)}`;
  const monthsAgo = (months: number, day: number) => {
    const idx = y * 12 + m - months;
    const yy = Math.floor(idx / 12);
    const mm = (idx % 12) + 1;
    return `${yy}-${pad(mm)}-${pad(day)}`;
  };
  const monthsAhead = (months: number, day: number) => {
    const idx = y * 12 + m + months;
    const yy = Math.floor(idx / 12);
    const mm = (idx % 12) + 1;
    return `${yy}-${pad(mm)}-${pad(day)}`;
  };
  return { thisMonth, thisMonthRaw, monthsAgo, monthsAhead };
}

/**
 * Populate the (in-memory) demo database once. Safe to call on every load: it
 * no-ops if data already exists in this page's session.
 */
export async function seedDemo(): Promise<void> {
  const repo = new FinanceRepository(getDB());

  // Fresh in-memory DB is always empty; this guard just keeps it idempotent.
  const existing = await repo.listAccounts(true);
  if (existing.length > 0) return;

  const { thisMonth, thisMonthRaw, monthsAgo, monthsAhead } = dateParts();

  // --- Settings -----------------------------------------------------------
  await repo.saveSettings({
    currencyCode: "PKR",
    currencySymbol: "Rs",
    locale: "en-PK",
    setupComplete: true,
    budgetMethod: "carryOver",
    safeToSpendHorizon: "endOfMonth",
    safetyFloor: rs(20000),
    debtStrategy: "avalanche",
    debtMonthlyExtra: rs(5000),
    wallpaper: "none",
  });

  // --- Accounts (cash-type assets only; the card is a Debt below) ---------
  const everyday = await repo.createAccount({ name: "Everyday", type: "checking", openingBalance: rs(50000), currencyCode: "PKR", archived: false });
  const savings = await repo.createAccount({ name: "Savings", type: "savings", openingBalance: rs(220000), currencyCode: "PKR", archived: false });
  await repo.createAccount({ name: "Cash", type: "cash", openingBalance: rs(6500), currencyCode: "PKR", archived: false });

  // --- Categories (the app's own defaults) --------------------------------
  const catId: Record<string, string> = {};
  for (const c of DEFAULT_CATEGORIES) {
    const created = await repo.createCategory({ ...c, archived: false });
    catId[c.name] = created.id;
  }

  // --- Income source ------------------------------------------------------
  await repo.createIncomeSource({ name: "Salary", defaultAmount: rs(300000), defaultAccountId: everyday.id, archived: false });

  // --- This month's activity ---------------------------------------------
  const spend = (day: number, amount: number, cat: string, note?: string) =>
    repo.createTransaction({
      date: thisMonth(day), amount: rs(amount), direction: "out", type: "expense",
      categoryId: catId[cat] ?? null, accountId: everyday.id, personId: null, source: "manual", cleared: true, note,
    });

  await repo.createTransaction({
    date: thisMonth(2), amount: rs(300000), direction: "in", type: "income",
    categoryId: catId["Salary"] ?? null, accountId: everyday.id, personId: null, source: "manual", cleared: true, note: "Monthly salary",
  });
  await spend(3, 55000, "Rent & Home", "September rent");
  await spend(4, 1500, "Subscriptions", "Streaming");
  await spend(6, 9800, "Utilities", "Electricity + gas");
  await spend(5, 8500, "Groceries");
  await spend(9, 3500, "Transport", "Fuel");
  await spend(8, 3200, "Eating Out");
  await spend(11, 6200, "Groceries");
  await spend(14, 12000, "Shopping", "New shoes");
  await spend(15, 2100, "Eating Out");
  await spend(18, 4900, "Groceries");
  // A recent transfer into savings, shown as a normal set-aside spend group.
  await repo.createTransaction({
    date: thisMonth(16), amount: rs(25000), direction: "out", type: "expense",
    categoryId: catId["Savings"] ?? null, accountId: everyday.id, personId: null, source: "manual", cleared: true, note: "Set aside",
    goalId: undefined,
  });

  // --- Repeating bills (show up on the Calendar + "coming up") -------------
  await repo.createRecurringRule({
    name: "Internet", amount: rs(8000), direction: "out", type: "expense",
    categoryId: catId["Utilities"] ?? null, accountId: everyday.id, personId: null,
    frequency: "everyMonth", anchorDate: thisMonthRaw(22), endDate: null,
  });
  await repo.createRecurringRule({
    name: "Streaming", amount: rs(1500), direction: "out", type: "expense",
    categoryId: catId["Subscriptions"] ?? null, accountId: everyday.id, personId: null,
    frequency: "everyMonth", anchorDate: thisMonthRaw(28), endDate: null,
  });

  // --- Budget (planned per group) -----------------------------------------
  const budget: Array<[string, number]> = [
    ["Rent & Home", 55000], ["Groceries", 30000], ["Utilities", 12000],
    ["Transport", 8000], ["Eating Out", 15000], ["Shopping", 15000], ["Subscriptions", 3000],
  ];
  for (const [name, amount] of budget) {
    if (catId[name]) await repo.setBudgetTemplate(catId[name], rs(amount));
  }

  // --- Goals --------------------------------------------------------------
  await repo.createGoal({
    name: "Emergency fund", targetAmount: rs(300000), startingAmount: rs(120000),
    targetDate: monthsAhead(8, 28), monthlyContribution: rs(25000), categoryId: catId["Savings"] ?? null,
  });
  await repo.createGoal({
    name: "New laptop", targetAmount: rs(250000), startingAmount: rs(40000),
    targetDate: null, monthlyContribution: rs(20000), categoryId: null,
  });

  // --- Debts --------------------------------------------------------------
  await repo.createDebt({ name: "Visa card", currentBalance: rs(85000), annualInterestRate: 32, minimumPayment: rs(4000), balanceAsOf: monthsAgo(1, 1) });
  await repo.createDebt({ name: "Car loan", currentBalance: rs(450000), annualInterestRate: 14, minimumPayment: rs(15000), balanceAsOf: monthsAgo(1, 1) });

  // --- Assets (net worth) -------------------------------------------------
  const apartment = await repo.createAsset({ name: "Apartment", kind: "property", accountId: null, note: "Primary home" });
  await repo.addValuation(apartment.id, { value: rs(12000000), asOf: monthsAgo(3, 1) });
  const fund = await repo.createAsset({ name: "Index fund", kind: "investment", accountId: savings.id });
  await repo.addValuation(fund.id, { value: rs(320000), asOf: monthsAgo(2, 1) });
}
