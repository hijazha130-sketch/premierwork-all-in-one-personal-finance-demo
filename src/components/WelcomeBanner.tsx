import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/data/db";
import { clearDemoData, hasDemoData } from "@/data/demo";

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

  return (
    <div className="mb-6 rounded-card border border-gold/40 bg-inset px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink">
          <span className="font-semibold">You're looking at example numbers</span>
          {" — they're made up so you can explore everything safely."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={keepExploring}
            className="rounded-control px-4 py-2 text-sm font-medium text-ink hover:bg-base min-h-[40px]"
          >
            Keep exploring
          </button>
          <button
            onClick={startMine}
            className="rounded-control bg-gold px-4 py-2 text-sm font-semibold text-base hover:opacity-90 min-h-[40px]"
          >
            Start with my numbers
          </button>
          <button
            onClick={() => navigate("/more")}
            className="rounded-control border border-hairline px-4 py-2 text-sm font-medium text-muted hover:text-ink min-h-[40px]"
          >
            I already have a planner
          </button>
        </div>
      </div>
    </div>
  );
}
