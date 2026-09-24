import { useState } from "react";
import { useData } from "@/state/dataContext";
import { Card, SectionTitle, Segmented } from "@/components/ui";
import { HelpTip } from "@/components/HelpTip";
import type { Milestone } from "@/domain/insights";

type Filter = "all" | "reached" | "notYet";

/**
 * Milestones (Architecture §7.2). The full list of eight, each reached / not yet
 * / not counted, with a simple filter. All eight are derived from the whole
 * history, so a reached one never slips back.
 */
export function Milestones() {
  const { derived } = useData();
  const [filter, setFilter] = useState<Filter>("all");
  const all = derived.milestones;
  const reached = all.filter((m) => m.state === "reached").length;

  const shown = all.filter((m) =>
    filter === "all" ? true : filter === "reached" ? m.state === "reached" : m.state !== "reached",
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-2">
        <SectionTitle
          overline="Milestones"
          title="Small wins, kept"
          subtitle={`You've reached ${reached} of ${all.length}. Each one is worked out from your whole history — once reached, it stays.`}
        />
        <HelpTip topic="milestones" />
      </div>

      <Segmented
        ariaLabel="Filter milestones"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "reached", label: "Reached" },
          { value: "notYet", label: "Not yet" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((m) => (
          <MilestoneCard key={m.id} milestone={m} />
        ))}
      </div>
    </div>
  );
}

function MilestoneCard({ milestone: m }: { milestone: Milestone }) {
  const reached = m.state === "reached";
  return (
    <Card className={reached ? "border-gold/40" : undefined}>
      <div className="flex items-start gap-4">
        <span
          className={[
            "grid h-10 w-10 shrink-0 place-items-center rounded-full border text-lg",
            reached ? "border-gold bg-gold/15 text-gold" : "border-hairline text-muted",
          ].join(" ")}
          aria-hidden
        >
          {reached ? "★" : "☆"}
        </span>
        <div className="min-w-0">
          <div className={reached ? "font-medium text-ink" : "text-ink"}>{m.label}</div>
          <p className="mt-1 text-sm text-muted">{m.detail}</p>
          <div className="mt-2 text-xs font-semibold uppercase tracking-widest text-muted">
            {reached ? <span className="text-gold">Reached</span> : m.state === "notCounted" ? "Not counted yet" : "Not yet"}
          </div>
        </div>
      </div>
    </Card>
  );
}
