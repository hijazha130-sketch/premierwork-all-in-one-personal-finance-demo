/**
 * Money utility (Section 7). The single place currency arithmetic and rendering
 * happen. All money is integer minor units — arithmetic never touches floats.
 */
import type { Minor } from "@/domain/types";

/** Add minor-unit amounts. Guards against non-integer inputs. */
export function addMinor(...amounts: Minor[]): Minor {
  let sum = 0;
  for (const a of amounts) {
    assertInteger(a);
    sum += a;
  }
  return sum;
}

export function subMinor(a: Minor, b: Minor): Minor {
  assertInteger(a);
  assertInteger(b);
  return a - b;
}

export function sumMinor(amounts: Minor[]): Minor {
  return addMinor(...amounts);
}

function assertInteger(a: number): void {
  if (!Number.isInteger(a)) {
    throw new Error(`Money must be integer minor units, received: ${a}`);
  }
}

/**
 * Parse a user-typed major-unit string (e.g. "1,250.50") into minor units.
 * Returns null when the input is not a valid non-negative amount.
 * Rounds half-up at the minor-unit boundary to avoid float drift.
 */
export function parseMajorToMinor(input: string, fractionDigits = 2): Minor | null {
  if (input == null) return null;
  const cleaned = String(input).trim().replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d*(\.\d*)?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "0".repeat(fractionDigits)).slice(0, fractionDigits);
  const fracRounded =
    frac.length > fractionDigits && Number(frac[fractionDigits]) >= 5 ? 1 : 0;
  const factor = Math.pow(10, fractionDigits);
  const value = Number(whole) * factor + Number(fracPadded || "0") + fracRounded;
  if (!Number.isFinite(value)) return null;
  return value;
}

/** Convert minor units to a major-unit number (for input fields only, not math). */
export function minorToMajor(amount: Minor, fractionDigits = 2): number {
  return amount / Math.pow(10, fractionDigits);
}

export interface FormatOptions {
  code: string; // currency code (registry) — drives the native symbol
  locale?: string;
  /** Summary figures: no cents, rounded DOWN (never overstate what's safe). */
  whole?: boolean;
  /** Prefix with + / - for in/out. */
  signed?: boolean;
}

/**
 * Format minor units to a display string using the platform's native currency
 * formatter (Batch 8 §F1): "$163", "-$1,450", "£400", "Rs 20,000" — the symbol
 * attaches with no extra space, and each currency keeps its own spacing. This is
 * the ONE place a currency string is produced.
 *
 * - `whole`: summary figures show no cents, rounded DOWN.
 * - otherwise: cents show only when they are non-zero (transaction rows / entry).
 * The sign is placed before the symbol ("-$1,450"), consistently across locales.
 */
export function formatMoney(amount: Minor, opts: FormatOptions): string {
  const { code, locale = "en-US", whole = false, signed = false } = opts;
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const hasCents = !whole && abs % 100 !== 0;
  const major = whole ? Math.floor(abs / 100) : abs / 100;

  const body = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(major);

  const sign = negative ? "-" : signed ? "+" : "";
  return `${sign}${body}`;
}
