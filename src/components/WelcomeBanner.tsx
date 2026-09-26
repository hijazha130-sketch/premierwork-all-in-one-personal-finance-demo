import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/data/db";
import { clearDemoData, hasDemoData } from "@/data/demo";
import { showDemoNotice, ETSY_URL, DEMO_BANNER_TEXT } from "@/lib/edition";

const DISMISS_KEY = "demo-banner-dismissed";

function sessionDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Welcome banner (Architecture §6.2). Shown only while example data is present,
 * in both editions. Three calm choices: keep looking, switch to your own
 * numbers (clears the example data), or bring in a planner you already have.
 */
export function WelcomeBanner() {
  const db = getDB();
  const present = useLiveQuery(() => hasDemoData(db), []);
  const [dismissed, setDismissed] = useState(sessionDismissed());
  const navigate = useNavigate();

  if (!present || dismissed) return null;

  function keepExploring() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — fall back to hiding for this render only */
    }
    setDismissed(true);
  }

  async function startMine() {
    await clearDemoData(db);
    navigate("/setup");
  }

  const demo = showDemoNotice();

  return (
    <div className="mb-4 rounded-card border border-gold/40 bg-inset px-4 py-3 sm:mb-6 sm:px-6 sm:py-4">
      {/* Compact on phones (§N1): one line of text, then a row of buttons, so the
          hero number stays visible above the fold. Roomier on desktop. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-sm text-ink">
          {demo ? (
            // Batch 9a: the demo makes it plain that typed numbers aren't kept.
            <span className="font-medium">{DEMO_BANNER_TEXT}</span>
          ) : (
            <>
              <span className="font-semibold">You're looking at example numbers</span>
              <span className="hidden sm:inline">{" — they're made up so you can explore everything safely."}</span>
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {demo && (
            <a
              href={ETSY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-control bg-gold px-3 py-2 text-sm font-semibold text-base hover:opacity-90 min-h-[40px]"
            >
              Get the full app
            </a>
          )}
          <button
            onClick={startMine}
            className={
              demo
                ? "rounded-control border border-hairline px-3 py-2 text-sm font-medium text-muted hover:text-ink min-h-[40px]"
                : "rounded-control bg-gold px-3 py-2 text-sm font-semibold text-base hover:opacity-90 min-h-[40px]"
            }
          >
            Start with my numbers
          </button>
          <button
            onClick={keepExploring}
            className="rounded-control border border-hairline px-3 py-2 text-sm font-medium text-muted hover:text-ink min-h-[40px]"
          >
            Keep exploring
          </button>
          {!demo && (
            <button
              onClick={() => navigate("/more")}
              className="rounded-control border border-hairline px-3 py-2 text-sm font-medium text-muted hover:text-ink min-h-[40px]"
            >
              I already have a planner
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
