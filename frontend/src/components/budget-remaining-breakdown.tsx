import type { BudgetRemainingBreakdown as Breakdown } from "@/lib/budget-remaining";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function budgetRemainingBreakdownText(breakdown: Breakdown) {
  if (!breakdown.adjustment) {
    return `當期剩餘 ${formatMoney(breakdown.currentMinor)}`;
  }
  return `當期剩餘 ${formatMoney(breakdown.currentMinor)}，${
    breakdown.adjustment.kind === "rollover" ? "加上往期沿襲" : "扣除往期超支"
  } ${formatMoney(breakdown.adjustment.amountMinor)}`;
}

/**
 * Explains how the available balance is composed when it includes a carried
 * amount from earlier periods, e.g. 「當期剩餘 TWD 400 − 往期超支抵扣 TWD 129」.
 * Renders nothing when the balance comes from the current period only.
 */
export function BudgetRemainingBreakdown({
  breakdown,
  className,
}: {
  breakdown: Breakdown;
  className?: string;
}) {
  const { adjustment } = breakdown;
  if (!adjustment) return null;

  const rollover = adjustment.kind === "rollover";

  return (
    <p
      data-budget-remaining-breakdown
      className={cn(
        "flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground tabular-nums",
        className,
      )}
    >
      <span aria-hidden="true" className="whitespace-nowrap">
        當期剩餘{" "}
        <span className="text-foreground">
          {formatMoney(breakdown.currentMinor)}
        </span>
      </span>
      <span aria-hidden="true">{rollover ? "+" : "−"}</span>
      <span aria-hidden="true" className="whitespace-nowrap">
        {rollover ? "往期沿襲" : "往期超支抵扣"}{" "}
        <span
          className={rollover ? "text-finance-rollover" : "text-destructive"}
        >
          {formatMoney(adjustment.amountMinor)}
        </span>
      </span>
      <span className="sr-only">{budgetRemainingBreakdownText(breakdown)}</span>
    </p>
  );
}
