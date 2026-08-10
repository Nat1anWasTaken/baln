import { useQuery } from "@tanstack/react-query";
import { WalletCards } from "lucide-react";
import { useState } from "react";

import { useOfflineReadOnly } from "@/auth/auth-context";
import { EntryCard, EntryTableRow } from "@/components/entry-list-item";
import { BudgetCarousel } from "@/components/budget-carousel";
import { AppLink } from "@/components/navigation-transition";
import { OfflineUnavailableState } from "@/components/offline-state";
import {
  CardLoading,
  EmptyState,
  ErrorState,
  InlineErrorState,
  PageLoading,
} from "@/components/page-state";
import {
  ComparisonModeSelector,
  FinancialPositionCard,
  OverviewCategoryCard,
  SummaryCards,
} from "@/components/report-summary";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DayOfMonthPicker } from "@/components/ui/day-of-month-picker";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useComparisonMode } from "@/hooks/use-comparison-mode";
import { useMonthStartDay } from "@/hooks/use-month-start-day";
import { entriesApi, reportsApi } from "@/lib/api-client";
import {
  comparisonBoundsForMonth,
  currentPeriodMonth,
  formatShortDate,
  monthLabel,
  monthPeriodBounds,
  todayTaipei,
  toInclusiveDate,
} from "@/lib/format";
import { ENTRY_REFETCH_INTERVAL_MS } from "@/lib/entry-refresh";
import { queryKeys } from "@/lib/query-keys";

export function DashboardPage() {
  const isReadOnly = useOfflineReadOnly();
  const { startDay, setStartDay } = useMonthStartDay();
  const { comparisonMode, setComparisonMode } = useComparisonMode();
  const [month, setMonth] = useState(() => currentPeriodMonth(startDay));
  const bounds = monthPeriodBounds(month, startDay);
  const comparisonBounds = comparisonBoundsForMonth(
    month,
    startDay,
    comparisonMode,
  );
  const report = useQuery({
    queryKey: queryKeys.reports.summary(bounds.dateFrom, bounds.dateTo),
    queryFn: () => reportsApi.summary(bounds.dateFrom, bounds.dateTo),
  });
  const comparison = useQuery({
    queryKey: queryKeys.reports.summary(
      comparisonBounds.dateFrom,
      comparisonBounds.dateTo,
    ),
    queryFn: () =>
      reportsApi.summary(comparisonBounds.dateFrom, comparisonBounds.dateTo),
  });
  const position = useQuery({
    queryKey: queryKeys.reports.position(todayTaipei()),
    queryFn: () => reportsApi.position(todayTaipei()),
  });
  const entries = useQuery({
    queryKey: queryKeys.entries.recent,
    queryFn: () => entriesApi.list({ limit: 5 }),
    refetchInterval: ENTRY_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  function changeStartDay(day: number) {
    setStartDay(day);
    setMonth(currentPeriodMonth(day));
  }

  return (
    <div className="grid gap-6">
      <BudgetCarousel />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">期間概況</p>
          <h2 className="text-2xl font-semibold">{monthLabel(month)}期</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatShortDate(bounds.dateFrom)}–
            {formatShortDate(toInclusiveDate(bounds.dateTo))}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <MonthPicker
            aria-label="總覽月份"
            value={month}
            onValueChange={setMonth}
            className="w-full sm:w-40"
          />
          <DayOfMonthPicker
            aria-label="每月起始日"
            value={startDay}
            onValueChange={changeStartDay}
            className="w-full sm:w-40"
          />
          <ComparisonModeSelector
            value={comparisonMode}
            onValueChange={setComparisonMode}
            className="col-span-2 w-full sm:w-40"
          />
        </div>
      </div>

      {report.isPending && isReadOnly ? (
        <OfflineUnavailableState />
      ) : report.isPending ? (
        <PageLoading variant="dashboard" />
      ) : report.isError ? (
        <ErrorState
          message={report.error.message}
          onRetry={() => void report.refetch()}
        />
      ) : (
        <>
          <SummaryCards summary={report.data} comparison={comparison.data} />
          {comparison.isError ? (
            <InlineErrorState
              message="比較資料無法載入，目前仍顯示本期結果。"
              onRetry={() => void comparison.refetch()}
            />
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <OverviewCategoryCard
              summary={report.data}
              comparison={comparison.data}
            />
            {position.isPending && isReadOnly ? (
              <OfflineUnavailableState
                title="尚未儲存財務狀況"
                description="連線後開啟一次，即可在離線時檢視。"
              />
            ) : position.isPending ? (
              <CardLoading rows={3} />
            ) : position.isError ? (
              <ErrorState
                message={position.error.message}
                onRetry={() => void position.refetch()}
              />
            ) : (
              <FinancialPositionCard position={position.data} />
            )}
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>最近交易</CardTitle>
          <CardDescription>依交易日期由新到舊排列</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <AppLink to="/entries">查看全部</AppLink>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {entries.isPending && isReadOnly ? (
            <OfflineUnavailableState
              title="尚未儲存最近交易"
              description="連線後開啟一次，即可在離線時檢視。"
            />
          ) : entries.isPending ? (
            <PageLoading rows={3} />
          ) : entries.isError ? (
            <ErrorState
              message={entries.error.message}
              onRetry={() => void entries.refetch()}
            />
          ) : entries.data.items.length === 0 ? (
            <EmptyState
              icon={WalletCards}
              title="還沒有交易"
              description="建立帳戶後，即可新增第一筆收入、支出或轉帳。"
            />
          ) : (
            <>
              <div className="grid gap-2 md:hidden">
                {entries.data.items.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} />
                ))}
              </div>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期</TableHead>
                      <TableHead>說明</TableHead>
                      <TableHead>帳戶</TableHead>
                      <TableHead className="text-right">金額</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.data.items.map((entry) => (
                      <EntryTableRow key={entry.id} entry={entry} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
