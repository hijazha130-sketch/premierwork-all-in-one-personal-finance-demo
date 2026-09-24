/**
 * Currency registry (Batch 7 §A3). The ONE table every currency-dependent value
 * reads from: the symbol shown, the unit word ("dollar"/"rupee"), quick-log
 * presets, the fresh-setup safety cushion, the "put away" milestone threshold,
 * and the example-data scale.
 *
 * IMPORTANT: `exampleScale` is NOT an exchange rate. It only makes the made-up
 * example numbers *believable* in each currency (a rupee example shouldn't read
 * like a dollar one). Real user amounts are NEVER converted — switching currency
 * only changes the symbol and formatting in a local-first app.
 */
export interface Currency {
  code: string;
  symbol: string; // shown as (narrow symbol)
  unitWord: string; // "dollar" | "pound" | "euro" | "rupee"
  quickAmounts: number[]; // quick-log presets, in MAJOR units
  defaultCushion: number; // fresh-setup safety cushion, MAJOR units
  putAwayMilestone: number; // "put away" milestone threshold, MAJOR units
  exampleScale: number; // multiply the USD-base example minor units by this
  exampleRound: number; // round example amounts to this step, MAJOR units
  locale: string;
}

export const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$", unitWord: "dollar", quickAmounts: [5, 10, 20, 50], defaultCushion: 500, putAwayMilestone: 1000, exampleScale: 1, exampleRound: 1, locale: "en-US" },
  { code: "GBP", symbol: "£", unitWord: "pound", quickAmounts: [5, 10, 20, 50], defaultCushion: 400, putAwayMilestone: 1000, exampleScale: 0.8, exampleRound: 1, locale: "en-GB" },
  { code: "EUR", symbol: "€", unitWord: "euro", quickAmounts: [5, 10, 20, 50], defaultCushion: 450, putAwayMilestone: 1000, exampleScale: 0.9, exampleRound: 1, locale: "en-IE" },
  { code: "CAD", symbol: "$", unitWord: "dollar", quickAmounts: [5, 10, 20, 50], defaultCushion: 700, putAwayMilestone: 1000, exampleScale: 1.35, exampleRound: 1, locale: "en-CA" },
  { code: "AUD", symbol: "$", unitWord: "dollar", quickAmounts: [5, 10, 20, 50], defaultCushion: 750, putAwayMilestone: 1000, exampleScale: 1.5, exampleRound: 1, locale: "en-AU" },
  { code: "PKR", symbol: "Rs", unitWord: "rupee", quickAmounts: [100, 500, 1000, 2000], defaultCushion: 20000, putAwayMilestone: 40000, exampleScale: 40, exampleRound: 50, locale: "en-PK" },
  { code: "INR", symbol: "₹", unitWord: "rupee", quickAmounts: [50, 100, 500, 1000], defaultCushion: 10000, putAwayMilestone: 20000, exampleScale: 20, exampleRound: 10, locale: "en-IN" },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export const DEFAULT_CURRENCY = "USD";

/** The registry row for a code, falling back to USD for anything unknown. */
export function getCurrency(code: string | undefined | null): Currency {
  return (code && BY_CODE.get(code.toUpperCase())) || BY_CODE.get(DEFAULT_CURRENCY)!;
}

/** Is this a currency we support? (case-insensitive) */
export function isSupportedCurrency(code: string | undefined | null): boolean {
  return !!(code && BY_CODE.has(code.toUpperCase()));
}

const MINOR_PER_MAJOR = 100;

/** Quick-log presets in MINOR units for a currency. */
export function quickAmountPresets(code: string): number[] {
  return getCurrency(code).quickAmounts.map((n) => n * MINOR_PER_MAJOR);
}

/** The "put away" milestone threshold in MINOR units. */
export function putAwayThreshold(code: string): number {
  return getCurrency(code).putAwayMilestone * MINOR_PER_MAJOR;
}

/** The fresh-setup safety cushion in MINOR units. */
export function defaultCushionMinor(code: string): number {
  return getCurrency(code).defaultCushion * MINOR_PER_MAJOR;
}

/**
 * Scale a USD-base MINOR amount into another currency's example scale, rounded to
 * that currency's step. Deterministic; used only to build the example dataset so
 * the numbers read believably. NOT an exchange rate.
 */
export function scaleExampleMinor(usdBaseMinor: number, code: string): number {
  const c = getCurrency(code);
  const scaledMajor = (usdBaseMinor / MINOR_PER_MAJOR) * c.exampleScale;
  const roundedMajor = Math.round(scaledMajor / c.exampleRound) * c.exampleRound;
  return Math.round(roundedMajor * MINOR_PER_MAJOR);
}
