import { createContext, useContext, useState, type ReactNode } from "react";
import type { Debt, Goal, Minor, RecurringRule } from "@/domain/types";
import type { Occurrence } from "@/domain/occurrences";

type CaptureMode = "expense" | "income" | "transfer";

/** Optional starting values for a new spend (Phase 6 quick-log, §5.6). */
export interface CapturePrefill {
  amount?: Minor;
  categoryId?: string;
}

/** Confirming a planned bill/income into a real transaction ("Mark as paid"). */
export interface ConfirmPayload {
  rule: RecurringRule;
  occurrence: Occurrence;
}

/**
 * Phase 4: a contribution toward a goal / a payment on a debt — recorded through
 * the same Quick Capture path, with the goal/debt link carried here.
 */
export type LinkPayload =
  | { kind: "goal"; goal: Goal }
  | { kind: "debt"; debt: Debt };

interface CaptureContextValue {
  open: boolean;
  mode: CaptureMode;
  editingId: string | null;
  confirm: ConfirmPayload | null;
  link: LinkPayload | null;
  prefill: CapturePrefill | null;
  openCapture: (mode?: CaptureMode, prefill?: CapturePrefill) => void;
  openEditor: (id: string) => void;
  openConfirm: (rule: RecurringRule, occurrence: Occurrence) => void;
  openContribution: (goal: Goal) => void;
  openDebtPayment: (debt: Debt) => void;
  close: () => void;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmPayload | null>(null);
  const [link, setLink] = useState<LinkPayload | null>(null);
  const [prefill, setPrefill] = useState<CapturePrefill | null>(null);

  const openCapture = (m: CaptureMode = "expense", pf?: CapturePrefill) => {
    setMode(m);
    setEditingId(null);
    setConfirm(null);
    setLink(null);
    setPrefill(pf ?? null);
    setOpen(true);
  };
  const openEditor = (id: string) => {
    setEditingId(id);
    setConfirm(null);
    setLink(null);
    setPrefill(null);
    setOpen(true);
  };
  const openConfirm = (rule: RecurringRule, occurrence: Occurrence) => {
    setConfirm({ rule, occurrence });
    setEditingId(null);
    setLink(null);
    setOpen(true);
  };
  const openContribution = (goal: Goal) => {
    setLink({ kind: "goal", goal });
    setConfirm(null);
    setEditingId(null);
    setMode("expense");
    setOpen(true);
  };
  const openDebtPayment = (debt: Debt) => {
    setLink({ kind: "debt", debt });
    setConfirm(null);
    setEditingId(null);
    setMode("expense");
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setConfirm(null);
    setLink(null);
    setPrefill(null);
  };

  return (
    <CaptureContext.Provider
      value={{ open, mode, editingId, confirm, link, prefill, openCapture, openEditor, openConfirm, openContribution, openDebtPayment, close }}
    >
      {children}
    </CaptureContext.Provider>
  );
}

export function useCapture(): CaptureContextValue {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture must be used within CaptureProvider");
  return ctx;
}
