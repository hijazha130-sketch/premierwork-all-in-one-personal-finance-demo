/**
 * Edition flag (Architecture §6.3). One codebase, never a fork: the demo is a
 * build flag. `VITE_EDITION=demo` at build time turns on the gentle 40-spend
 * limit and turns off the install prompt / service worker. Default is "full".
 *
 * The counting + limit logic is pure and injected with the transaction list, so
 * it is tested without a build flag; only `EDITION`/`isDemo` read the env.
 */
import type { Transaction } from "@/domain/types";

export type Edition = "full" | "demo";

export const EDITION: Edition =
  (import.meta.env.VITE_EDITION as Edition | undefined) === "demo" ? "demo" : "full";

export const isDemo = EDITION === "demo";

/** Where the demo points buyers to the full planner. Set per deploy; optional. */
export const SHOP_URL: string | undefined = import.meta.env.VITE_SHOP_URL as string | undefined;

/** The gentle cap in the demo edition. Everything the user wrote stays readable. */
export const DEMO_SPEND_LIMIT = 40;

/**
 * Spends the user actually wrote down — manual out transactions that are NOT
 * example records (their id does not start with `demo-`). Example data never
 * counts against the limit.
 */
export function userSpendCount(transactions: Transaction[]): number {
  return transactions.filter(
    (t) => t.direction === "out" && t.source === "manual" && !t.id.startsWith("demo-"),
  ).length;
}

/** True when the demo edition's cap has been reached (full edition: never). */
export function demoLimitReached(transactions: Transaction[], edition: Edition = EDITION): boolean {
  return edition === "demo" && userSpendCount(transactions) >= DEMO_SPEND_LIMIT;
}

/**
 * Map a `?start=` value to an in-app path (Architecture §6.3). Unknown/absent →
 * null (stay on Home). Debt and Goals live inside Plan, reached via `?view=`.
 */
export function startScreenPath(start: string | null | undefined): string | null {
  switch (start) {
    case "today":
      return "/";
    case "bills":
      return "/money";
    case "debt":
      return "/plan?view=debt";
    case "goals":
      return "/plan?view=goals";
    case "wealth":
      return "/grow";
    case "plan":
      return "/plan";
    default:
      return null;
  }
}
