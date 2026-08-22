import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Landmark,
  Scale,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { AppLink } from "@/components/navigation-transition";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import type { ComparisonMode } from "@/lib/format";
import { formatMoney, toInclusiveDate } from "@/lib/format";
import type {
  FinancialPosition,
  PeriodSummary,
  ReportTrend,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";

type CategoryTone = "income" | "expense";

const comparisonLabels: Record<ComparisonMode, string> = {
  "same-progress": "同期進度",
  "full-previous": "完整前期",
};

function formatPercent(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
}

function DeltaText({
  current,
  previous,
  favorableWhenHigher,
  compact = false,
}: {
  current: number;
  previous: number;
  favorableWhenHigher: boolean;
  compact?: boolean;
}) {
  if (current === 0 && previous === 0) {
    return (
      <span className="text-muted-foreground">
        {compact ? "無變化" : "較比較期無變化"}
      </span>
    );
  }
  if (previous === 0) {
    return (
      <span className="text-muted-foreground">
        {compact ? "本期新增" : "比較期為零 · 本期新增"}
      </span>
    );
  }

  const percent = ((current - previous) / Math.abs(previous)) * 100;
  const improved =
    current === previous
      ? null
      : favorableWhenHigher
        ? current > previous
        : current < previous;
  const prefix = percent > 0 ? "+" : "";
  return (
    <span
      className={cn(
        improved === true && "text-finance-income",
        improved === false && "text-finance-expense",
        improved === null && "text-muted-foreground",
      )}
    >
      {compact ? "" : "較比較期 "}
      {prefix}
      {formatPercent(percent)}%
    </span>
  );
}

export function ComparisonModeSelector({
  value,
  onValueChange,
  className,
}: {
  value: ComparisonMode;
  onValueChange: (value: ComparisonMode) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("justify-between", className)}
          aria-label={`比較基準：${comparisonLabels[value]}`}
        >
          <span className="truncate">比較：{comparisonLabels[value]}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>比較基準</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onValueChange(next as ComparisonMode)}
        >
          <DropdownMenuRadioItem value="same-progress">
            同期進度
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="full-previous">
            完整前期
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SummaryCards({
  summary,
  comparison,
}: {
  summary: PeriodSummary;
  comparison?: PeriodSummary;
}) {
  const savingsRate =
    summary.income_minor === 0
      ? null
      : (summary.net_minor / summary.income_minor) * 100;
  const cards = [
    {
      label: "支出",
      amount: summary.expense_minor,
      previous: comparison?.expense_minor,
      icon: ArrowDownRight,
      tone: "expense",
      favorableWhenHigher: false,
      amountClassName: "text-finance-expense",
      iconClassName: "bg-finance-expense/10 text-finance-expense",
    },
    {
      label: "收入",
      amount: summary.income_minor,
      previous: comparison?.income_minor,
      icon: ArrowUpRight,
      tone: "income",
      favorableWhenHigher: true,
      amountClassName: "text-finance-income",
      iconClassName: "bg-finance-income/10 text-finance-income",
    },
    {
      label: "收支結餘",
      amount: summary.net_minor,
      previous: comparison?.net_minor,
      icon: Scale,
      tone: "net",
      favorableWhenHigher: true,
      amountClassName: "text-finance-net",
      iconClassName: "bg-finance-net/10 text-finance-net",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((item) => (
        <Card key={item.tone} data-finance-tone={item.tone}>
          <CardHeader>
            <CardDescription>{item.label}</CardDescription>
            <CardAction>
              <span className={`block rounded-xl p-1.5 ${item.iconClassName}`}>
                <item.icon className="size-4" aria-hidden="true" />
              </span>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-1">
            <p
              className={`text-2xl font-semibold tabular-nums ${item.amountClassName}`}
            >
              {formatMoney(item.amount)}
            </p>
            <p className="text-xs tabular-nums">
              {item.previous === undefined ? (
                <span className="text-muted-foreground">比較資料不可用</span>
              ) : (
                <DeltaText
                  current={item.amount}
                  previous={item.previous}
                  favorableWhenHigher={item.favorableWhenHigher}
                />
              )}
            </p>
            {item.tone === "net" ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                儲蓄率{" "}
                {savingsRate === null ? "—" : `${formatPercent(savingsRate)}%`}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function entryFilterUrl(accountKey: string, dateFrom: string, dateTo: string) {
  const params = new URLSearchParams({
    from: dateFrom,
    to: toInclusiveDate(dateTo),
    account: accountKey,
  });
  return `/entries?${params.toString()}`;
}

export function CategoryRanking({
  accounts,
  previousAccounts,
  total,
  tone,
  dateFrom,
  dateTo,
  limit,
}: {
  accounts: PeriodSummary["expense_accounts"];
  previousAccounts?: PeriodSummary["expense_accounts"];
  total: number;
  tone: CategoryTone;
  dateFrom: string;
  dateTo: string;
  limit?: number;
}) {
  const previousById = previousAccounts
    ? new Map(
        previousAccounts.map((account) => [
          account.account_id,
          account.total_minor,
        ]),
      )
    : null;
  const sorted = [...accounts]
    .filter((account) => account.total_minor !== 0)
    .sort((left, right) => right.total_minor - left.total_minor);
  const visible = limit === undefined ? sorted : sorted.slice(0, limit);
  const maximum = Math.max(0, ...visible.map((account) => account.total_minor));

  if (visible.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        這個期間沒有可顯示的資料。
      </p>
    );
  }

  return (
    <div className="grid gap-1">
      {visible.map((account) => {
        const share =
          total > 0 && account.total_minor > 0
            ? (account.total_minor / total) * 100
            : null;
        const progress =
          maximum > 0 && account.total_minor > 0
            ? (account.total_minor / maximum) * 100
            : 0;
        return (
          <AppLink
            key={account.account_id}
            to={entryFilterUrl(account.account_key, dateFrom, dateTo)}
            pressFeedback="surface"
            className="grid gap-2 rounded-2xl p-4 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {account.account_name}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {share === null ? "占比 —" : `占比 ${formatPercent(share)}%`}
                  {" · "}
                  {previousById ? (
                    <DeltaText
                      current={account.total_minor}
                      previous={previousById.get(account.account_id) ?? 0}
                      favorableWhenHigher={tone === "income"}
                      compact
                    />
                  ) : (
                    <span>比較資料不可用</span>
                  )}
                </p>
              </div>
              <p
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  tone === "expense"
                    ? "text-finance-expense"
                    : "text-finance-income",
                )}
              >
                {formatMoney(account.total_minor)}
              </p>
            </div>
            <Progress
              value={progress}
              indicatorClassName={
                tone === "expense" ? "bg-finance-expense" : "bg-finance-income"
              }
            />
          </AppLink>
        );
      })}
    </div>
  );
}

export function OverviewCategoryCard({
  summary,
  comparison,
}: {
  summary: PeriodSummary;
  comparison?: PeriodSummary;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>主要支出</CardTitle>
        <CardDescription>本期支出最高的五個分類</CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <AppLink to="/reports">深入分析</AppLink>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CategoryRanking
          accounts={summary.expense_accounts}
          previousAccounts={comparison?.expense_accounts}
          total={summary.expense_minor}
          tone="expense"
          dateFrom={summary.date_from}
          dateTo={summary.date_to}
          limit={5}
        />
      </CardContent>
    </Card>
  );
}

export function FinancialPositionCard({
  position,
}: {
  position: FinancialPosition;
}) {
  const rows = [
    { label: "資產", value: position.asset_minor },
    { label: "負債", value: position.liability_minor },
    { label: "淨值", value: position.net_worth_minor },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>財務狀況</CardTitle>
        <CardDescription>截至今日的資產、負債與淨值</CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <AppLink to="/accounts">查看帳戶</AppLink>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 rounded-2xl bg-input/30 p-4"
          >
            <div className="flex items-center gap-2">
              <Landmark
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">{row.label}</span>
            </div>
            <span
              className={cn(
                "font-semibold tabular-nums",
                row.label === "淨值" && "text-finance-net",
              )}
            >
              {formatMoney(row.value)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const trendConfig = {
  expense: {
    label: "支出",
    color: "var(--color-finance-expense)",
  },
} satisfies ChartConfig;

function compactDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function SpendingTrendCard({ trend }: { trend: ReportTrend }) {
  const data = trend.points.map((point) => ({
    date: compactDate(point.date_from),
    expense: point.expense_minor,
    dateFrom: point.date_from,
  }));
  const hasData = data.some((point) => point.expense !== 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>支出趨勢</CardTitle>
        <CardDescription>依所選期間彙整支出變化</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            這個期間沒有支出趨勢資料。
          </p>
        ) : (
          <>
            <ChartContainer
              config={trendConfig}
              className="h-64 w-full"
              aria-label="支出趨勢長條圖"
            >
              <BarChart accessibilityLayer data={data}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                />
                <YAxis hide />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatMoney(Number(value))}
                    />
                  }
                />
                <Bar
                  dataKey="expense"
                  fill="var(--color-expense)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
            <ul className="sr-only">
              {data.map((point) => (
                <li key={point.dateFrom}>
                  {point.date}：{formatMoney(point.expense)}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
