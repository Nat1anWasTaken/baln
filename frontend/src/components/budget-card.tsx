import { CalendarRange, CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney, formatShortDate, toInclusiveDate } from "@/lib/format";
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
  className,
}: {
  budget: BudgetStatus;
  className?: string;
}) {
  const upcoming = budget.status === "upcoming";
  const overspent = budget.remaining_minor < 0;
  const capacity = Math.max(
    Math.abs(budget.available_minor),
    Math.max(budget.spent_minor, 0),
    1,
  );
  const spentPercent = Math.min(
    100,
    Math.max(0, (Math.max(budget.spent_minor, 0) / capacity) * 100),
  );
  const remainingPercent = overspent
    ? 0
    : Math.min(
        100 - spentPercent,
        Math.max(0, (budget.remaining_minor / capacity) * 100),
      );

  return (
    <Card
      className={cn("h-full", className)}
      data-budget-status={budget.status}
    >
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
      <CardContent className="grid gap-4">
        {upcoming ? (
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <CalendarRange
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>將於 {formatShortDate(budget.start_date)} 開始</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">已使用</p>
                <p className="font-heading text-xl font-semibold tabular-nums text-finance-expense">
                  {formatMoney(budget.spent_minor)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  {overspent ? "超支" : "尚未使用"}
                </p>
                <p
                  className={cn(
                    "font-heading text-xl font-semibold tabular-nums",
                    overspent ? "text-destructive" : "text-finance-income",
                  )}
                >
                  {formatMoney(Math.abs(budget.remaining_minor))}
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              <div
                role="progressbar"
                aria-label={`${budget.name} 預算使用狀況`}
                aria-valuemin={0}
                aria-valuemax={Math.max(
                  budget.available_minor,
                  budget.spent_minor,
                  0,
                )}
                aria-valuenow={Math.max(budget.spent_minor, 0)}
                className="flex h-2 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className={cn(
                    "h-full bg-finance-expense transition-[width] duration-(--motion-duration-control) ease-(--motion-easing-standard)",
                    overspent && "bg-destructive",
                  )}
                  style={{ width: `${spentPercent}%` }}
                />
                <span
                  className="h-full bg-finance-income transition-[width] duration-(--motion-duration-control) ease-(--motion-easing-standard)"
                  style={{ width: `${remainingPercent}%` }}
                />
              </div>
              <div className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
                <span>基本額度 {formatMoney(budget.amount_minor)}</span>
                <span>累計 {formatMoney(budget.carry_in_minor)}</span>
              </div>
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
    </Card>
  );
}
