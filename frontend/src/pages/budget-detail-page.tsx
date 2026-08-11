import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import { useOfflineReadOnly } from "@/auth/auth-context";
import { budgetPeriodLabel } from "@/components/budget-card";
import { AppLink, useAppNavigate } from "@/components/navigation-transition";
import { OfflineUnavailableState } from "@/components/offline-state";
import { ErrorState, PageLoading } from "@/components/page-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BudgetDialog } from "@/features/budgets/budget-dialog";
import { accountTypeLabels } from "@/lib/account";
import { accountsApi, budgetsApi } from "@/lib/api-client";
import {
  formatInteger,
  formatMoney,
  formatShortDate,
  formatTimestamp,
  toInclusiveDate,
} from "@/lib/format";
import { invalidateAfterBudgetWrite } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";
import type { BudgetDay, BudgetDetail } from "@/lib/schemas";
import { cn } from "@/lib/utils";

function parsePeriodOffset(search: string) {
  const raw = new URLSearchParams(search).get("period");
  if (raw === null) return 0;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= 0 ? value : 0;
}

function periodSearch(offset: number) {
  return offset === 0 ? "" : `?period=${offset}`;
}

function dayEntryUrl(budgetId: string, date: string) {
  const params = new URLSearchParams({
    from: date,
    to: date,
    budget: budgetId,
  });
  return `/entries?${params.toString()}`;
}

const overviewReturnDestination = {
  to: "/",
  label: "返回總覽",
  state: { budgetReturnTo: "/" },
} as const;
const budgetsReturnDestination = {
  to: "/budgets",
  label: "返回預算",
  state: undefined,
} as const;

function budgetReturnDestination(state: unknown) {
  if (
    typeof state === "object" &&
    state !== null &&
    "budgetReturnTo" in state &&
    state.budgetReturnTo === "/"
  ) {
    return overviewReturnDestination;
  }
  return budgetsReturnDestination;
}

function compactDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function periodKindLabel(detail: BudgetDetail) {
  if (detail.period_kind === "upcoming") return "尚未開始";
  if (detail.budget.remaining_minor < 0) return "已超支";
  return detail.period_kind === "past" ? "已結束" : "進行中";
}

function amountDisplay(value: number) {
  return value < 0 ? `−${formatMoney(Math.abs(value))}` : formatMoney(value);
}

function RemainingAmount({ value }: { value: number }) {
  const overspent = value < 0;
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        overspent ? "text-destructive" : "text-finance-income",
      )}
    >
      {overspent ? `超支 ${formatMoney(Math.abs(value))}` : formatMoney(value)}
    </span>
  );
}

function SpentAmount({ value }: { value: number }) {
  const refund = value < 0;
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        refund ? "text-finance-income" : "text-finance-expense",
      )}
    >
      {refund ? `退款 ${formatMoney(Math.abs(value))}` : formatMoney(value)}
    </span>
  );
}

function DayStatus({ day }: { day: BudgetDay }) {
  if (day.is_future) return <Badge variant="secondary">未來日期</Badge>;
  if (day.remaining_minor < 0) return <Badge variant="destructive">超支</Badge>;
  if (day.spent_minor < 0) return <Badge variant="outline">退款</Badge>;
  return null;
}

function MobileDayRow({ day, budgetId }: { day: BudgetDay; budgetId: string }) {
  const content = (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{formatShortDate(day.date)}</p>
          <p className="text-xs text-muted-foreground">
            {day.entry_count > 0
              ? `${formatInteger(day.entry_count)} 筆符合交易`
              : "沒有符合交易"}
          </p>
        </div>
        <DayStatus day={day} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">當日支出</dt>
          <dd className="mt-1">
            <SpentAmount value={day.spent_minor} />
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-xs text-muted-foreground">當日結束剩餘</dt>
          <dd className="mt-1">
            <RemainingAmount value={day.remaining_minor} />
          </dd>
        </div>
      </dl>
    </div>
  );

  if (day.entry_count === 0) {
    return <div data-budget-day-row="mobile">{content}</div>;
  }
  return (
    <AppLink
      to={dayEntryUrl(budgetId, day.date)}
      aria-label={`查看 ${formatShortDate(day.date)} 的 ${day.entry_count} 筆交易`}
      className="touch-surface block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      data-budget-day-row="mobile"
    >
      {content}
    </AppLink>
  );
}

function DailyRows({
  days,
  budgetId,
}: {
  days: BudgetDay[];
  budgetId: string;
}) {
  if (days.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        這個期間沒有每日資料。
      </p>
    );
  }
  return (
    <>
      <div className="grid gap-2 md:hidden">
        {days.map((day) => (
          <MobileDayRow key={day.date} day={day} budgetId={budgetId} />
        ))}
      </div>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日期</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead className="text-right">當日支出</TableHead>
              <TableHead className="text-right">當日結束剩餘</TableHead>
              <TableHead className="text-right">交易</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => (
              <TableRow key={day.date} data-budget-day-row="desktop">
                <TableCell className="font-medium">
                  {formatShortDate(day.date)}
                </TableCell>
                <TableCell>
                  <DayStatus day={day} />
                </TableCell>
                <TableCell className="text-right">
                  <SpentAmount value={day.spent_minor} />
                </TableCell>
                <TableCell className="text-right">
                  <RemainingAmount value={day.remaining_minor} />
                </TableCell>
                <TableCell className="text-right">
                  {day.entry_count > 0 ? (
                    <Button asChild variant="ghost" size="sm">
                      <AppLink to={dayEntryUrl(budgetId, day.date)}>
                        {formatInteger(day.entry_count)} 筆
                        <ChevronRight aria-hidden="true" />
                      </AppLink>
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

const chartConfig = {
  spent: { label: "支出", color: "var(--color-finance-expense)" },
  remaining: { label: "剩餘", color: "var(--color-finance-net)" },
} satisfies ChartConfig;

function BudgetTrendCard({ detail }: { detail: BudgetDetail }) {
  const data = detail.trend.points.map((point) => ({
    date: compactDate(point.date_from),
    dateFrom: point.date_from,
    spent: point.spent_minor,
    remaining: point.remaining_minor,
    future: point.date_from > detail.budget.as_of,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>預算趨勢</CardTitle>
        <CardDescription>
          支出與每日結束剩餘
          {detail.trend.bucket_days > 1
            ? `，每 ${detail.trend.bucket_days} 天彙整`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {detail.period_kind === "upcoming" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            預算開始後，這裡會顯示支出與剩餘趨勢。
          </p>
        ) : data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            這個期間沒有趨勢資料。
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="h-64 w-full"
              aria-label="預算支出與剩餘趨勢圖"
            >
              <ComposedChart accessibilityLayer data={data}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                />
                <YAxis hide />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatMoney(Number(value))}
                    />
                  }
                />
                <Bar
                  dataKey="spent"
                  fill="var(--color-spent)"
                  radius={[4, 4, 0, 0]}
                >
                  {data.map((point) => (
                    <Cell
                      key={point.dateFrom}
                      fillOpacity={point.future ? 0.45 : 1}
                    />
                  ))}
                </Bar>
                <Line
                  dataKey="remaining"
                  type="linear"
                  stroke="var(--color-remaining)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ChartContainer>
            <ul className="sr-only">
              {data.map((point) => (
                <li key={point.dateFrom}>
                  {point.date}：支出 {formatMoney(point.spent)}，剩餘
                  {amountDisplay(point.remaining)}
                  {point.future ? "，未來日期" : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function BudgetDetailPage() {
  const isReadOnly = useOfflineReadOnly();
  const { budgetId = "" } = useParams();
  const location = useLocation();
  const navigate = useAppNavigate();
  const queryClient = useQueryClient();
  const periodOffset = parsePeriodOffset(location.search);
  const returnDestination = budgetReturnDestination(location.state);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    const raw = new URLSearchParams(location.search).get("period");
    if (raw !== null && `?period=${raw}` !== periodSearch(periodOffset)) {
      navigate(
        { pathname: location.pathname, search: periodSearch(periodOffset) },
        {
          replace: true,
          state: returnDestination.state,
          transitionIntent: "none",
        },
      );
    }
  }, [
    location.pathname,
    location.search,
    navigate,
    periodOffset,
    returnDestination.state,
  ]);

  const detail = useQuery({
    queryKey: queryKeys.budgets.detail(budgetId, periodOffset),
    queryFn: () => budgetsApi.details(budgetId, periodOffset),
    enabled: Boolean(budgetId),
  });
  const accounts = useQuery({
    queryKey: queryKeys.accounts.list(true, ""),
    queryFn: () => accountsApi.list(true),
  });
  const days = useInfiniteQuery({
    queryKey: queryKeys.budgets.days(budgetId, periodOffset),
    queryFn: ({ pageParam }) =>
      budgetsApi.days(budgetId, {
        periodOffset,
        cursor: pageParam || undefined,
        limit: 50,
      }),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled:
      Boolean(budgetId) &&
      detail.isSuccess &&
      detail.data.period_kind !== "upcoming",
  });
  const remove = useMutation({
    mutationFn: () => budgetsApi.delete(budgetId),
    onSuccess: async () => {
      await invalidateAfterBudgetWrite(queryClient);
      toast.success("預算已刪除");
      navigate(returnDestination.to, {
        replace: true,
        transitionIntent: "back",
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const dayItems = useMemo(
    () => days.data?.pages.flatMap((page) => page.items) ?? [],
    [days.data],
  );

  if (detail.isPending && isReadOnly) return <OfflineUnavailableState />;
  if (detail.isPending) return <PageLoading variant="reports" />;
  if (detail.isError) {
    return (
      <ErrorState
        message={detail.error.message}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const value = detail.data;
  const budget = value.budget;
  const overspent = budget.remaining_minor < 0;
  const statusLabel = periodKindLabel(value);
  const canEdit = !isReadOnly && !accounts.isPending && !accounts.isError;
  const spendable = value.pace.spendable_per_day_minor;
  const elapsedPercent =
    value.pace.total_days > 0
      ? (value.pace.elapsed_days / value.pace.total_days) * 100
      : 0;
  const spentPercent =
    budget.available_minor > 0
      ? (value.pace.spent_through_as_of_minor / budget.available_minor) * 100
      : 0;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <AppLink to={returnDestination.to} transitionIntent="back">
            <ArrowLeft aria-hidden="true" />
            {returnDestination.label}
          </AppLink>
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit}
            title={accounts.isError ? "無法載入帳戶，請稍後再試" : undefined}
            onClick={() => setEditOpen(true)}
          >
            <Pencil aria-hidden="true" />
            編輯
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isReadOnly}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 aria-hidden="true" />
            刪除
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>{budgetPeriodLabel(budget)}</CardDescription>
          <CardTitle className="text-xl">{budget.name}</CardTitle>
          <CardAction>
            <Badge variant={overspent ? "destructive" : "secondary"}>
              {statusLabel}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <CalendarRange className="size-4" aria-hidden="true" />
            <span>
              {formatShortDate(budget.period_from)}–
              {formatShortDate(toInclusiveDate(budget.period_to))}
            </span>
            {value.period_kind === "upcoming" ? (
              <Badge variant="secondary">
                將於 {formatShortDate(budget.start_date)} 開始
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 p-2">
            {value.has_previous ? (
              <Button asChild variant="outline" size="sm">
                <AppLink
                  to={{
                    pathname: `/budgets/${budgetId}`,
                    search: periodSearch(periodOffset - 1),
                  }}
                  state={returnDestination.state}
                  aria-label="查看上一期預算"
                >
                  <ChevronLeft aria-hidden="true" />
                  上一期
                </AppLink>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                <ChevronLeft aria-hidden="true" />
                上一期
              </Button>
            )}
            <span className="min-w-0 text-center text-sm font-medium">
              {periodOffset === 0
                ? "目前週期"
                : `第 ${Math.abs(periodOffset)} 個前期`}
            </span>
            {value.has_next ? (
              <Button asChild variant="outline" size="sm">
                <AppLink
                  to={{
                    pathname: `/budgets/${budgetId}`,
                    search: periodSearch(periodOffset + 1),
                  }}
                  state={returnDestination.state}
                  aria-label="查看下一期預算"
                >
                  下一期
                  <ChevronRight aria-hidden="true" />
                </AppLink>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                下一期
                <ChevronRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>可用額度</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(budget.available_minor)}
            </p>
            <p className="text-xs text-muted-foreground">
              本期 {formatMoney(budget.amount_minor)} · 沿襲{" "}
              {formatMoney(budget.carry_in_minor)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>已使用與排程</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-finance-expense">
              {formatMoney(budget.spent_minor)}
            </p>
            <p className="text-xs text-muted-foreground">
              截至今日 {formatMoney(value.pace.spent_through_as_of_minor)}
              {value.pace.future_spent_minor !== 0
                ? ` · 未來 ${amountDisplay(value.pace.future_spent_minor)}`
                : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>{overspent ? "超支" : "剩餘"}</CardDescription>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                overspent ? "text-destructive" : "text-finance-income",
              )}
            >
              {formatMoney(Math.abs(budget.remaining_minor))}
            </p>
            <p className="text-xs text-muted-foreground">
              {overspent ? "已超過本期可用額度" : "已扣除未來排程支出"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>支出步調</CardTitle>
            <CardDescription>依本期進度計算</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5">
            {value.period_kind === "upcoming" ? (
              <div className="flex flex-1 items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                <CalendarRange className="size-4 shrink-0" aria-hidden="true" />
                預算開始後，這裡會顯示每日步調。
              </div>
            ) : (
              <>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      目前日均支出
                    </dt>
                    <dd
                      className={cn(
                        "mt-1 text-2xl font-semibold tabular-nums",
                        value.pace.average_daily_spend_minor !== null &&
                          value.pace.average_daily_spend_minor < 0
                          ? "text-finance-income"
                          : "text-finance-expense",
                      )}
                    >
                      {value.pace.average_daily_spend_minor === null
                        ? "—"
                        : formatMoney(value.pace.average_daily_spend_minor)}
                    </dd>
                  </div>
                  <div className="sm:text-right">
                    <dt className="text-xs text-muted-foreground">每日可用</dt>
                    <dd
                      className={cn(
                        "mt-1 text-2xl font-semibold tabular-nums",
                        spendable === null
                          ? "text-muted-foreground"
                          : spendable < 0
                            ? "text-destructive"
                            : "text-finance-income",
                      )}
                    >
                      {spendable === null
                        ? "—"
                        : spendable < 0
                          ? "已超支"
                          : formatMoney(spendable)}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-1 flex-col justify-end gap-4">
                  <div className="grid gap-3 rounded-lg bg-muted/50 p-3">
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground tabular-nums">
                        <span>期間進度</span>
                        <span>
                          {formatInteger(value.pace.elapsed_days)} /{" "}
                          {formatInteger(value.pace.total_days)} 天
                        </span>
                      </div>
                      <Progress
                        aria-label="預算期間進度"
                        value={elapsedPercent}
                        indicatorClassName="bg-finance-net"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground tabular-nums">
                        <span>已使用額度</span>
                        <span>
                          {formatMoney(value.pace.spent_through_as_of_minor)}
                        </span>
                      </div>
                      <Progress
                        aria-label="預算已使用額度"
                        value={spentPercent}
                        indicatorClassName={cn(
                          value.pace.spent_through_as_of_minor < 0
                            ? "bg-finance-income"
                            : overspent
                              ? "bg-destructive"
                              : "bg-finance-expense",
                        )}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    已過 {formatInteger(value.pace.elapsed_days)} 天 · 剩餘{" "}
                    {formatInteger(value.pace.remaining_days)} 天
                  </p>
                </div>
                {overspent ? (
                  <p className="flex items-start gap-1.5 text-xs text-destructive">
                    <CircleAlert
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    本期已超支，新增支出會繼續增加超支金額。
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
        <BudgetTrendCard detail={value} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>每日明細</CardTitle>
          <CardDescription>每日支出、當日結束剩餘與符合的交易</CardDescription>
        </CardHeader>
        <CardContent>
          {value.period_kind === "upcoming" ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              預算尚未開始，暫時沒有每日明細。
            </p>
          ) : days.isPending && isReadOnly ? (
            <OfflineUnavailableState title="尚未儲存每日預算明細" />
          ) : days.isPending ? (
            <PageLoading rows={4} />
          ) : days.isError ? (
            <ErrorState
              message={days.error.message}
              onRetry={() => void days.refetch()}
            />
          ) : (
            <>
              <DailyRows days={dayItems} budgetId={budgetId} />
              {days.hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  loading={days.isFetchingNextPage}
                  onClick={() => void days.fetchNextPage()}
                >
                  顯示更多日期
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>預算設定</CardTitle>
          <CardDescription>週期、帳戶與管理資訊</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">開始日期</dt>
              <dd className="font-medium">
                {formatShortDate(budget.start_date)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">總覽顯示</dt>
              <dd className="font-medium">
                {budget.show_on_overview ? "已顯示" : "未顯示"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">建立時間</dt>
              <dd>{formatTimestamp(budget.created_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">最後更新</dt>
              <dd>{formatTimestamp(budget.updated_at)}</dd>
            </div>
          </dl>
          <Separator />
          <div>
            <p className="mb-2 text-sm font-medium">包含帳戶</p>
            <div className="flex flex-wrap gap-1.5">
              {budget.accounts.map((account) => (
                <Badge key={account.id} variant="outline">
                  {accountTypeLabels[account.type]} · {account.name}
                  {account.archived ? "（已封存）" : ""}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {editOpen && accounts.data ? (
        <BudgetDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          accounts={accounts.data}
          budget={budget}
        />
      ) : null}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除「{budget.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              預算設定與累計會永久刪除，帳戶與交易不受影響。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate();
              }}
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
