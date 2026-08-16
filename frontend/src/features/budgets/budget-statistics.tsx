import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  CalendarSearch,
  Check,
  ChevronsUpDown,
  CircleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { OfflineUnavailableState } from "@/components/offline-state";
import { ErrorState, PageLoading } from "@/components/page-state";
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
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { budgetsApi } from "@/lib/api-client";
import {
  formatInteger,
  formatMoney,
  formatShortDate,
  toInclusiveDate,
} from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import type { BudgetPeriodOption, BudgetStatisticsPeriod } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type BudgetStatisticsViewProps = {
  budgetId: string;
  fromOffset?: number;
  toOffset?: number;
  isReadOnly: boolean;
  onApply: (fromOffset: number, toOffset: number) => void;
};

const periodChartConfig = {
  actual: { label: "截至今日支出", color: "var(--color-finance-expense)" },
  scheduled: { label: "未來排程", color: "var(--color-finance-rollover)" },
  utilization: { label: "額度使用率", color: "var(--color-finance-net)" },
} satisfies ChartConfig;

const remainingChartConfig = {
  remaining: { label: "剩餘／超支", color: "var(--color-finance-income)" },
} satisfies ChartConfig;

function formatBps(value: number | null) {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 }).format(value / 100)}%`;
}

function periodLabel(
  period: Pick<BudgetPeriodOption, "period_from" | "period_to">,
) {
  return `${formatShortDate(period.period_from)}–${formatShortDate(toInclusiveDate(period.period_to))}`;
}

function shortPeriodLabel(period: BudgetStatisticsPeriod) {
  return period.period_offset === 0
    ? "本期"
    : `${formatShortDate(period.period_from)} 起`;
}

function mergePeriodOptions(
  loaded: BudgetPeriodOption[],
  selected: BudgetPeriodOption[],
) {
  const byOffset = new Map<number, BudgetPeriodOption>();
  for (const period of [...loaded, ...selected]) {
    byOffset.set(period.period_offset, period);
  }
  return [...byOffset.values()].sort(
    (left, right) => right.period_offset - left.period_offset,
  );
}

function PeriodPicker({
  id,
  label,
  budgetId,
  value,
  options,
  disabled,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onValueChange,
}: {
  id: string;
  label: string;
  budgetId: string;
  value: number;
  options: BudgetPeriodOption[];
  disabled?: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onValueChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().replaceAll("/", "-");
  const searchDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedSearch)
    ? normalizedSearch
    : undefined;
  const searched = useQuery({
    queryKey: [...queryKeys.budgets.periods(budgetId), "date", searchDate],
    queryFn: () => budgetsApi.periods(budgetId, { date: searchDate }),
    enabled: Boolean(searchDate),
  });
  const allOptions = mergePeriodOptions(
    options,
    searched.data?.items.map((period) => ({ ...period })) ?? [],
  );
  const visibleOptions = searchDate
    ? allOptions.filter((period) =>
        searched.data?.items.some(
          (item) => item.period_offset === period.period_offset,
        ),
      )
    : allOptions.filter((period) =>
        periodLabel(period)
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
      );
  const selected = allOptions.find((period) => period.period_offset === value);

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            role="combobox"
            variant="outline"
            disabled={disabled}
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {selected ? periodLabel(selected) : "選擇期別"}
            </span>
            <ChevronsUpDown
              className="text-muted-foreground"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-2"
        >
          <div className="relative mb-2">
            <CalendarSearch
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={`搜尋${label}`}
              placeholder="輸入日期 YYYY-MM-DD"
              className="pl-8"
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto" role="listbox">
            {searched.isPending && searchDate ? (
              <p className="p-3 text-center text-sm text-muted-foreground">
                搜尋中…
              </p>
            ) : visibleOptions.length === 0 ? (
              <p className="p-3 text-center text-sm text-muted-foreground">
                {search && !searchDate
                  ? "請輸入完整日期。"
                  : "找不到符合的期別。"}
              </p>
            ) : (
              visibleOptions.map((period) => (
                <Button
                  key={period.period_offset}
                  type="button"
                  variant="ghost"
                  role="option"
                  aria-selected={period.period_offset === value}
                  className="w-full justify-start font-normal"
                  onClick={() => {
                    onValueChange(period.period_offset);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      period.period_offset !== value && "invisible",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{periodLabel(period)}</span>
                  {period.period_offset === 0 ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      本期
                    </span>
                  ) : null}
                </Button>
              ))
            )}
          </div>
          {!search && hasMore ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              loading={isLoadingMore}
              onClick={onLoadMore}
            >
              載入更早期別
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function SummaryCards({
  periods,
  summary,
}: {
  periods: BudgetStatisticsPeriod[];
  summary: {
    total_actual_spent_minor: number;
    total_scheduled_spent_minor: number;
    average_daily_spend_minor: number | null;
    average_utilization_bps: number | null;
    utilization_spread_bps: number | null;
    overspent_periods: number;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-1">
          <CardDescription>跨期總支出</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums text-finance-expense">
            {formatMoney(
              summary.total_actual_spent_minor +
                summary.total_scheduled_spent_minor,
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            實際 {formatMoney(summary.total_actual_spent_minor)}
            {summary.total_scheduled_spent_minor !== 0
              ? ` · 排程 ${formatMoney(summary.total_scheduled_spent_minor)}`
              : ""}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1">
          <CardDescription>實際日均支出</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums text-finance-expense">
            {summary.average_daily_spend_minor === null
              ? "—"
              : formatMoney(summary.average_daily_spend_minor)}
          </p>
          <p className="text-xs text-muted-foreground">
            依已經過的有效天數計算
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1">
          <CardDescription>平均額度使用率</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums text-finance-net">
            {formatBps(summary.average_utilization_bps)}
          </p>
          <p className="text-xs text-muted-foreground">
            超支 {formatInteger(summary.overspent_periods)} /{" "}
            {formatInteger(periods.length)} 期
            {summary.utilization_spread_bps !== null
              ? ` · 高低差 ${formatBps(summary.utilization_spread_bps)}`
              : ""}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function PeriodOverviewChart({
  periods,
}: {
  periods: BudgetStatisticsPeriod[];
}) {
  const data = periods.map((period) => ({
    label: shortPeriodLabel(period),
    fullLabel: periodLabel(period),
    actual: period.actual_spent_minor,
    scheduled: period.scheduled_spent_minor,
    utilization:
      period.utilization_bps === null ? null : period.utilization_bps / 100,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>各期支出與使用率</CardTitle>
        <CardDescription>實際與排程支出，以及各期額度使用比例</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={periodChartConfig}
          className="h-72 w-full"
          aria-label="各期支出與使用率圖"
        >
          <ComposedChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={18}
            />
            <YAxis yAxisId="money" hide />
            <YAxis yAxisId="percent" hide orientation="right" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value, payload) =>
                    payload[0]?.payload.fullLabel ?? value
                  }
                  formatter={(value, name) =>
                    name === "utilization"
                      ? `${Number(value).toFixed(1)}%`
                      : formatMoney(Number(value))
                  }
                />
              }
            />
            <Bar
              yAxisId="money"
              dataKey="actual"
              stackId="spent"
              fill="var(--color-actual)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              yAxisId="money"
              dataKey="scheduled"
              stackId="spent"
              fill="var(--color-scheduled)"
              fillOpacity={0.65}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              yAxisId="percent"
              dataKey="utilization"
              type="linear"
              stroke="var(--color-utilization)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
        <ul className="sr-only">
          {data.map((item) => (
            <li key={item.fullLabel}>
              {item.fullLabel}：支出 {formatMoney(item.actual)}，排程{" "}
              {formatMoney(item.scheduled)}，使用率{" "}
              {item.utilization === null
                ? "無法計算"
                : `${item.utilization.toFixed(1)}%`}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RemainingChart({ periods }: { periods: BudgetStatisticsPeriod[] }) {
  const data = periods.map((period) => ({
    label: shortPeriodLabel(period),
    fullLabel: periodLabel(period),
    remaining: period.remaining_minor,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>每期剩餘與超支</CardTitle>
        <CardDescription>零線上方為剩餘，下方為超支</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={remainingChartConfig}
          className="h-72 w-full"
          aria-label="每期剩餘與超支圖"
        >
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={18}
            />
            <YAxis hide />
            <ReferenceLine y={0} stroke="var(--border)" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value, payload) =>
                    payload[0]?.payload.fullLabel ?? value
                  }
                  formatter={(value) => formatMoney(Number(value))}
                />
              }
            />
            <Bar
              dataKey="remaining"
              radius={[4, 4, 4, 4]}
              isAnimationActive={false}
            >
              {data.map((item) => (
                <Cell
                  key={item.fullLabel}
                  fill={
                    item.remaining < 0
                      ? "var(--destructive)"
                      : "var(--color-finance-income)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <ul className="sr-only">
          {data.map((item) => (
            <li key={item.fullLabel}>
              {item.fullLabel}：{item.remaining < 0 ? "超支" : "剩餘"}{" "}
              {formatMoney(Math.abs(item.remaining))}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function NormalizedTrendChart({
  periods,
}: {
  periods: BudgetStatisticsPeriod[];
}) {
  const [highlighted, setHighlighted] = useState(
    String(periods.at(-1)?.period_offset ?? 0),
  );
  const activeHighlighted = periods.some(
    (period) => String(period.period_offset) === highlighted,
  )
    ? highlighted
    : String(periods.at(-1)?.period_offset ?? 0);
  const chartData = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    for (const period of periods) {
      if (period.available_minor <= 0) continue;
      const key = `period_${period.period_offset}`;
      for (const point of period.points) {
        const row = rows.get(point.progress_bps) ?? {
          progress: point.progress_bps / 100,
        };
        row[key] = (point.actual_spent_minor * 100) / period.available_minor;
        row[`${key}_committed`] =
          ((point.actual_spent_minor + point.scheduled_spent_minor) * 100) /
          period.available_minor;
        rows.set(point.progress_bps, row);
      }
    }
    return [...rows.values()].sort(
      (left, right) => left.progress - right.progress,
    );
  }, [periods]);
  const highlightedPeriod = periods.find(
    (period) => String(period.period_offset) === activeHighlighted,
  );
  const hasScheduled = highlightedPeriod?.scheduled_spent_minor !== 0;
  const config = Object.fromEntries(
    periods.map((period) => [
      `period_${period.period_offset}`,
      { label: periodLabel(period), color: "var(--color-finance-net)" },
    ]),
  ) satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>期內累積走勢</CardTitle>
        <CardDescription>
          以週期進度正規化，比較不同天數的額度使用速度
        </CardDescription>
        <CardAction className="hidden w-44 sm:block">
          <Combobox
            value={activeHighlighted}
            onValueChange={setHighlighted}
            options={periods.map((period) => ({
              value: String(period.period_offset),
              label:
                period.period_offset === 0
                  ? `本期 · ${periodLabel(period)}`
                  : periodLabel(period),
            }))}
            searchPlaceholder="搜尋期別…"
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4 sm:hidden">
          <Combobox
            value={activeHighlighted}
            onValueChange={setHighlighted}
            options={periods.map((period) => ({
              value: String(period.period_offset),
              label:
                period.period_offset === 0
                  ? `本期 · ${periodLabel(period)}`
                  : periodLabel(period),
            }))}
            searchPlaceholder="搜尋期別…"
          />
        </div>
        {chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            所選期別沒有可計算使用率的資料。
          </p>
        ) : (
          <>
            <ChartContainer
              config={config}
              className="h-80 w-full"
              aria-label="正規化期內累積使用率趨勢圖"
            >
              <LineChart accessibilityLayer data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="progress"
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis hide />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => `週期進度 ${value}%`}
                      formatter={(value) => `${Number(value).toFixed(1)}%`}
                    />
                  }
                />
                {periods.map((period) => {
                  const key = `period_${period.period_offset}`;
                  const active =
                    String(period.period_offset) === activeHighlighted;
                  return (
                    <Line
                      key={key}
                      dataKey={key}
                      name={key}
                      type="linear"
                      stroke="var(--color-finance-net)"
                      strokeWidth={active ? 3 : 1.5}
                      strokeOpacity={active ? 1 : 0.2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  );
                })}
                {hasScheduled && highlightedPeriod ? (
                  <Line
                    dataKey={`period_${highlightedPeriod.period_offset}_committed`}
                    name="排程後使用率"
                    type="linear"
                    stroke="var(--color-finance-rollover)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ) : null}
              </LineChart>
            </ChartContainer>
            <p className="mt-2 text-xs text-muted-foreground">
              粗線為目前選取期別；當期虛線包含未來排程。
            </p>
            <ul className="sr-only">
              {periods.map((period) => (
                <li key={period.period_offset}>
                  {periodLabel(period)}：最終使用率{" "}
                  {formatBps(period.utilization_bps)}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function BudgetStatisticsView({
  budgetId,
  fromOffset,
  toOffset,
  isReadOnly,
  onApply,
}: BudgetStatisticsViewProps) {
  const statistics = useQuery({
    queryKey: queryKeys.budgets.statistics(budgetId, fromOffset, toOffset),
    queryFn: () => budgetsApi.statistics(budgetId, fromOffset, toOffset),
  });
  const periodPages = useInfiniteQuery({
    queryKey: queryKeys.budgets.periods(budgetId),
    queryFn: ({ pageParam }) =>
      budgetsApi.periods(budgetId, {
        cursor: pageParam || undefined,
        limit: 50,
      }),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
  const [draftState, setDraft] = useState({
    source: `${fromOffset}:${toOffset}`,
    from: fromOffset ?? -5,
    to: toOffset ?? 0,
  });
  const resolvedStatistics = statistics.data;
  useEffect(() => {
    if (
      resolvedStatistics &&
      (fromOffset === undefined || toOffset === undefined)
    ) {
      onApply(resolvedStatistics.from_offset, resolvedStatistics.to_offset);
    }
  }, [fromOffset, onApply, resolvedStatistics, toOffset]);

  if (statistics.isPending && isReadOnly)
    return <OfflineUnavailableState title="尚未儲存跨期預算統計" />;
  if (statistics.isPending) return <PageLoading variant="reports" />;
  if (statistics.isError)
    return (
      <ErrorState
        message={statistics.error.message}
        onRetry={() => void statistics.refetch()}
      />
    );

  const value = statistics.data;
  const source = `${value.from_offset}:${value.to_offset}`;
  const draft =
    draftState.source === source
      ? draftState
      : { source, from: value.from_offset, to: value.to_offset };
  const loadedPeriods =
    periodPages.data?.pages.flatMap((page) => page.items) ?? [];
  const options = mergePeriodOptions(loadedPeriods, value.periods);
  const selectedCount = draft.to - draft.from + 1;
  const invalidRange =
    draft.from > draft.to ||
    draft.to > 0 ||
    selectedCount < 1 ||
    selectedCount > 24;

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>跨期範圍</CardTitle>
          <CardDescription>
            {formatShortDate(value.periods[0].period_from)}–
            {formatShortDate(toInclusiveDate(value.periods.at(-1)!.period_to))}{" "}
            · 共 {formatInteger(value.period_count)} 期
            {value.includes_current ? " · 含未結束當期" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <PeriodPicker
              id="statistics-from"
              label="起始期"
              budgetId={budgetId}
              value={draft.from}
              options={options}
              disabled={periodPages.isError}
              hasMore={Boolean(periodPages.hasNextPage)}
              isLoadingMore={periodPages.isFetchingNextPage}
              onLoadMore={() => void periodPages.fetchNextPage()}
              onValueChange={(from) => setDraft({ source, from, to: draft.to })}
            />
            <PeriodPicker
              id="statistics-to"
              label="結束期"
              budgetId={budgetId}
              value={draft.to}
              options={options}
              disabled={periodPages.isError}
              hasMore={Boolean(periodPages.hasNextPage)}
              isLoadingMore={periodPages.isFetchingNextPage}
              onLoadMore={() => void periodPages.fetchNextPage()}
              onValueChange={(to) => setDraft({ source, from: draft.from, to })}
            />
            <Button
              type="button"
              disabled={
                invalidRange ||
                (draft.from === fromOffset && draft.to === toOffset)
              }
              onClick={() => onApply(draft.from, draft.to)}
            >
              套用
            </Button>
          </div>
          {invalidRange ? (
            <FieldDescription className="text-destructive" role="alert">
              起始期須早於或等於結束期，且一次最多比較 24 期。
            </FieldDescription>
          ) : null}
          {periodPages.isError ? (
            <FieldDescription className="text-destructive" role="alert">
              無法載入期別選項；目前統計仍可查看。
            </FieldDescription>
          ) : null}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CircleAlert
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            歷史統計會依目前的預算額度、週期、帳戶與沿襲設定重新計算。
          </p>
        </CardContent>
      </Card>

      <SummaryCards periods={value.periods} summary={value.summary} />
      {value.periods.length === 1 ? (
        <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          目前只有一期資料；建立更多期別後即可比較跨期變化。
        </p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <PeriodOverviewChart periods={value.periods} />
        <RemainingChart periods={value.periods} />
      </div>
      <NormalizedTrendChart periods={value.periods} />
    </div>
  );
}
