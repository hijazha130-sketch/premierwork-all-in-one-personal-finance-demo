import { useEffect, useRef, useState } from "react";
import { useData, useCurrency } from "@/state/dataContext";
import { getDB } from "@/data/db";
import { hasDemoData, reloadDemoDataInCurrency } from "@/data/demo";
import { CURRENCIES, getCurrency } from "@/domain/currencies";
import { todayIso } from "@/lib/period";
import type { FinanceRepository } from "@/data/repository";

export const CURRENCY_HELP = "Changes how amounts are shown. Your own amounts are not converted.";

/**
 * Switch the display currency (Batch 7 §A2). Saves the choice, and — because a
 * local-first app has no exchange rates — re-creates the EXAMPLE records (ids
 * with the `demo-` prefix) in the new currency's scale, so example numbers stay
 * believable. The user's OWN records are never touched.
 */
export async function applyCurrency(code: string, repo: FinanceRepository): Promise<void> {
  const c = getCurrency(code);
  const db = getDB();
  const hadDemo = await hasDemoData(db);
  await repo.saveSettings({ currencyCode: c.code, currencySymbol: c.symbol, locale: c.locale });
  if (hadDemo) await reloadDemoDataInCurrency(db, todayIso(), c.code);
}

function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);
  return ref;
}

/** The list of currencies, shared by the top-bar button and the Settings row. */
function CurrencyMenu({ current, onPick }: { current: string; onPick: (code: string) => void }) {
  return (
    <div className="absolute right-0 z-30 mt-2 w-60 rounded-card border border-hairline bg-raised p-2 shadow-card">
      <ul className="max-h-72 overflow-auto">
        {CURRENCIES.map((c) => (
          <li key={c.code}>
            <button
              onClick={() => onPick(c.code)}
              className={`flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm hover:bg-inset ${
                c.code === current ? "text-ink font-medium" : "text-muted"
              }`}
            >
              <span className="w-8 font-amount text-ink">{c.symbol}</span>
              <span className="flex-1">{c.code}</span>
              {c.code === current && <span className="text-gold">✓</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="border-t border-hairline px-3 pt-2 pb-1 text-xs text-muted">{CURRENCY_HELP}</p>
    </div>
  );
}

/** Compact currency button for the top bar: "$ USD ▾". */
export function CurrencyPicker() {
  const { repo } = useData();
  const { symbol, code } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(() => setOpen(false));

  async function pick(next: string) {
    setOpen(false);
    if (next !== code) await applyCurrency(next, repo);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change currency"
        className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-3 py-1.5 text-sm text-ink hover:bg-inset min-h-[36px]"
      >
        <span className="font-amount">{symbol}</span>
        <span>{code}</span>
        <span className="text-muted">▾</span>
      </button>
      {open && <CurrencyMenu current={code} onPick={pick} />}
    </div>
  );
}

/** The Settings row (More → Appearance): label, picker, helper line. */
export function CurrencySetting() {
  const { repo } = useData();
  const { symbol, code } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(() => setOpen(false));

  async function pick(next: string) {
    setOpen(false);
    if (next !== code) await applyCurrency(next, repo);
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-ink">Currency</div>
        <p className="mt-0.5 text-xs text-muted">{CURRENCY_HELP}</p>
      </div>
      <div className="relative shrink-0" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-control border border-hairline px-3 py-2 text-sm text-ink hover:bg-inset min-h-[40px]"
        >
          <span className="font-amount">{symbol}</span>
          <span>{code}</span>
          <span className="text-muted">▾</span>
        </button>
        {open && <CurrencyMenu current={code} onPick={pick} />}
      </div>
    </div>
  );
}
