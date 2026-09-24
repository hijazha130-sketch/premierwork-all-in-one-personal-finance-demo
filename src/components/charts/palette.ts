/**
 * Chart palette (Phase 6 §8). The five spending groups map to CSS variables so
 * the colours swap with the theme automatically. Group names + amounts are
 * always shown next to a chart (required — three light-mode hues are below 3:1
 * contrast), and text is always an ink token, never the series colour.
 */
import type { GroupKey } from "@/domain/insights";

export const GROUP_COLOR: Record<GroupKey, string> = {
  bills: "var(--group-bills)",
  everyday: "var(--group-everyday)",
  fun: "var(--group-fun)",
  debt: "var(--group-debt)",
  saving: "var(--group-saving)",
};
