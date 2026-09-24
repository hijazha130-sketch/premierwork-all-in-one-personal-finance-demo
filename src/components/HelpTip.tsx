import { useState } from "react";
import { HELP } from "@/content/help";

/**
 * The "?" explainer (Architecture §7.5). Sits beside a card title; tapping it
 * opens the registry entry inline (never a modal), in our own plain words.
 */
export function HelpTip({ topic }: { topic: keyof typeof HELP }) {
  const [open, setOpen] = useState(false);
  const entry = HELP[topic];
  if (!entry) return null;
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="What is this?"
        className="grid h-5 w-5 place-items-center rounded-full border border-hairline text-xs text-muted hover:border-gold hover:text-gold"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-0 top-7 z-20 block w-64 rounded-card border border-hairline bg-raised p-3 text-left shadow-card sm:w-72">
          <span className="block text-sm text-ink">{entry.what}</span>
          <span className="mt-2 block text-xs text-muted">{entry.todo}</span>
        </span>
      )}
    </span>
  );
}
