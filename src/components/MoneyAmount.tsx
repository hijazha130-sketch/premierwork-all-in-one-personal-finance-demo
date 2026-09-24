import { formatMoney } from "@/lib/money";
import { useCurrency } from "@/state/dataContext";
import type { Minor } from "@/domain/types";

/** The single React surface for rendering a money value. */
export function MoneyAmount({
  amount,
  className,
  signed = false,
  tone,
  size = "md",
}: {
  amount: Minor;
  className?: string;
  signed?: boolean;
  tone?: "default" | "positive" | "attention" | "muted";
  size?: "sm" | "md" | "lg" | "hero";
}) {
  const { symbol, locale } = useCurrency();
  const text = formatMoney(amount, { symbol, locale, signed });

  // NOTE: `sm` uses the arbitrary `text-[1rem]`, NOT `text-base`. This app defines
  // a `base` COLOR (surface-base), so `text-base` also emits a color utility that
  // overrides the tone (it sorts before `attention`), which made attention amounts
  // render in the surface colour — invisible. An arbitrary size can't collide.
  const sizes = {
    sm: "text-[1rem]",
    md: "text-2xl",
    lg: "text-4xl",
    hero: "text-6xl md:text-7xl",
  };
  const tones = {
    default: "text-ink",
    positive: "text-positive",
    attention: "text-attention",
    muted: "text-muted",
  };
  // The single hero number uses Playfair (§4); every other amount keeps the
  // tabular serif so digits line up in columns.
  const family = size === "hero" ? "font-display tracking-tight" : "font-amount";
  return (
    <span className={`${family} ${sizes[size]} ${tones[tone ?? "default"]} ${className ?? ""}`}>
      {text}
    </span>
  );
}
