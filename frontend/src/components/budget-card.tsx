import { CalendarRange, CircleAlert } from "lucide-react";
import { m } from "motion/react";
import type { ReactNode } from "react";
import type { LinkProps, To } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { AppLink } from "@/components/navigation-transition";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney, formatShortDate, toInclusiveDate } from "@/lib/format";
import { budgetRemainingBreakdown } from "@/lib/budget-remaining";
import { motionSpring } from "@/lib/motion";
import type { BudgetPeriodUnit, BudgetStatus } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export const budgetPeriodUnitLabels: Record<BudgetPeriodUnit, string> = {
  day: "天",
  week: "週",
  month: "月",
  year: "年",
};

export function budgetPeriodLabel(budget: BudgetStatus) {
  return `每 ${budget.period_count} ${budgetPeriodUnitLabels[budget.period_unit]}`;
}

export function BudgetCard({
  budget,
  to,
  state,
  className,
  footer,
}: {
  budget: BudgetStatus;
  to?: To;
  state?: LinkProps["state"];
  className?: string;
  footer?: ReactNode;
}) {
  const upcoming = budget.status === "upcoming";
  const overspent = budget.remaining_minor < 0;
  const remainingBreakdown = budgetRemainingBreakdown(budget);
  const currentUnused = remainingBreakdown.currentMinor;
  const rolloverRemaining =
    remainingBreakdown.adjustment?.kind === "rollover"
      ? remainingBreakdown.adjustment.amountMinor
      : 0;
  const capacity = Math.max(
    Math.max(budget.spent_minor, 0) + currentUnused + rolloverRemaining,
    1,
  );
  const spentPercent = Math.min(
    100,
    Math.max(0, (Math.max(budget.spent_minor, 0) / capacity) * 100),
  );
  const currentUnusedPercent = Math.min(
    100 - spentPercent,
    (currentUnused / capacity) * 100,
  );
  const rolloverPercent = Math.min(
    100 - spentPercent - currentUnusedPercent,
    (rolloverRemaining / capacity) * 100,
  );
  const remainingAriaText = remainingBreakdown.adjustment
    ? `當期剩餘 ${formatMoney(currentUnused)}，${remainingBreakdown.adjustment.kind === "rollover" ? "加上往期沿襲" : "扣除往期超支"} ${formatMoney(remainingBreakdown.adjustment.amountMinor)}`
    : `當期剩餘 ${formatMoney(currentUnused)}`;

  const content = (
    <>
      <CardHeader>
        <CardTitle className="truncate">{budget.name}</CardTitle>
        <CardDescription>
          {formatShortDate(budget.period_from)}–
          {formatShortDate(toInclusiveDate(budget.period_to))}
        </CardDescription>
        <CardAction>
          <Badge variant={overspent ? "destructive" : "secondary"}>
            {upcoming
              ? "尚未開始"
              : overspent
                ? "已超支"
                : budgetPeriodLabel(budget)}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="@container/budget-card grid gap-4">
        {upcoming ? (
          <div className="flex items-start gap-2 rounded-2xl bg-muted/50 p-4 text-sm">
            <CalendarRange
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>將於 {formatShortDate(budget.start_date)} 開始</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-3">
              <div>
                <p className="text-xs text-muted-foreground">已使用</p>
                <p className="font-heading text-[clamp(0.75rem,5cqw,1.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums text-finance-expense">
                  {formatMoney(budget.spent_minor)}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-xs text-muted-foreground">
                  {overspent ? "超支" : "可用餘額"}
                </p>
                {overspent ? (
                  <p
                    data-budget-available-amount
                    className="font-heading text-[clamp(0.75rem,5cqw,1.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums text-destructive"
                  >
                    {formatMoney(Math.abs(budget.remaining_minor))}
                  </p>
                ) : remainingBreakdown.adjustment ? (
                  <p
                    data-budget-available-amount
                    className="flex items-baseline justify-end gap-x-1.5 font-heading text-[clamp(0.75rem,5cqw,1.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums"
                  >
                    <span className="text-finance-income">
                      {formatMoney(currentUnused)}
                    </span>
                    <span className="text-muted-foreground" aria-hidden="true">
                      {remainingBreakdown.adjustment.kind === "rollover"
                        ? "+"
                        : "−"}
                    </span>
                    <span
                      className={cn(
                        remainingBreakdown.adjustment.kind === "rollover"
                          ? "text-finance-rollover"
                          : "text-destructive",
                      )}
                    >
                      {formatMoney(remainingBreakdown.adjustment.amountMinor)}
                    </span>
                  </p>
                ) : (
                  <p
                    data-budget-available-amount
                    className="font-heading text-[clamp(0.75rem,5cqw,1.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums text-finance-income"
                  >
                    {formatMoney(currentUnused)}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <div
                role="progressbar"
                aria-label={`${budget.name} 預算使用狀況`}
                aria-valuemin={0}
                aria-valuemax={capacity}
                aria-valuenow={Math.max(budget.spent_minor, 0)}
                aria-valuetext={
                  overspent
                    ? `已使用 ${formatMoney(budget.spent_minor)}，超支 ${formatMoney(-budget.remaining_minor)}`
                    : `已使用 ${formatMoney(budget.spent_minor)}，${remainingAriaText}`
                }
                className="flex h-2 overflow-hidden rounded-full bg-muted"
              >
                <m.span
                  animate={{ width: `${spentPercent}%` }}
                  className={cn(
                    "h-full bg-finance-expense",
                    overspent && "bg-destructive",
                  )}
                  initial={false}
                  transition={motionSpring.layout}
                />
                <m.span
                  animate={{ width: `${currentUnusedPercent}%` }}
                  className="h-full bg-finance-income"
                  initial={false}
                  transition={motionSpring.layout}
                />
                <m.span
                  animate={{ width: `${rolloverPercent}%` }}
                  className="h-full bg-finance-rollover"
                  initial={false}
                  transition={motionSpring.layout}
                />
              </div>
              <p className="flex items-baseline justify-end gap-x-1.5 text-xs whitespace-nowrap">
                <span className="text-finance-income">當期剩餘</span>
                {remainingBreakdown.adjustment ? (
                  <>
                    <span className="text-muted-foreground" aria-hidden="true">
                      {remainingBreakdown.adjustment.kind === "rollover"
                        ? "+"
                        : "−"}
                    </span>
                    <span
                      className={cn(
                        remainingBreakdown.adjustment.kind === "rollover"
                          ? "text-finance-rollover"
                          : "text-destructive",
                      )}
                    >
                      {remainingBreakdown.adjustment.kind === "rollover"
                        ? "往期沿襲"
                        : "往期超支抵扣"}
                    </span>
                  </>
                ) : null}
              </p>
              <p className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
                <span>本期額度 {formatMoney(budget.amount_minor)}</span>
                <span>總額度 {formatMoney(budget.available_minor)}</span>
              </p>
            </div>
            {budget.available_minor <= 0 ? (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <CircleAlert
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                本期額度已被先前超支抵銷。
              </p>
            ) : null}
          </>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {budget.accounts.map((account) => account.name).join("、")}
        </p>
      </CardContent>
    </>
  );

  const card = (
    <Card
      className={cn("h-full", className)}
      data-budget-status={budget.status}
    >
      {to && footer ? (
        <AppLink
          to={to}
          state={state}
          pressFeedback="surface"
          aria-label={`查看預算：${budget.name}`}
          className="grid gap-(--card-spacing) rounded-t-4xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {content}
        </AppLink>
      ) : (
        content
      )}
      {footer ? (
        <CardFooter className="min-h-14 gap-2">{footer}</CardFooter>
      ) : null}
    </Card>
  );

  if (!to || footer) return card;

  return (
    <AppLink
      to={to}
      state={state}
      pressFeedback="surface"
      aria-label={`查看預算：${budget.name}`}
      className="block h-full rounded-4xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {card}
    </AppLink>
  );
}
