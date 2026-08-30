import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useOfflineReadOnly } from "@/auth/auth-context";
import { OfflineUnavailableState } from "@/components/offline-state";
import {
  CardLoading,
  ErrorState,
  InlineErrorState,
  PageLoading,
} from "@/components/page-state";
import {
  CategoryRanking,
  ComparisonModeSelector,
  SpendingTrendCard,
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
import { Combobox } from "@/components/ui/combobox";
import { DateRangePicker } from "@/components/ui/date-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useComparisonMode } from "@/hooks/use-comparison-mode";
import { useMonthStartDay } from "@/hooks/use-month-start-day";
import { reportsApi } from "@/lib/api-client";
import {
  comparisonBoundsForPreset,
  effectiveBounds,
  formatShortDate,
  reportPresetBounds,
  toExclusiveDate,
  toInclusiveDate,
  trendGranularity,
  type DateBounds,
  type ReportPreset,
} from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

const presetLabels: Record<ReportPreset, string> = {
  current: "本期",
  previous: "前期",
  "last-3": "近 3 期",
  "last-6": "近 6 期",
  year: "今年",
  custom: "自訂",
};

const presets = Object.entries(presetLabels) as Array<[ReportPreset, string]>;

export function ReportsPage() {
  const isReadOnly = useOfflineReadOnly();
  const { startDay } = useMonthStartDay();
  const { comparisonMode, setComparisonMode } = useComparisonMode();
  const initialBounds = reportPresetBounds("current", startDay);
  const [preset, setPreset] = useState<ReportPreset>("current");
  const [customFrom, setCustomFrom] = useState(initialBounds.dateFrom);
  const [customTo, setCustomTo] = useState(
    toInclusiveDate(initialBounds.dateTo),
  );
  const [customRangeValid, setCustomRangeValid] = useState(true);
  const [applied, setApplied] = useState<{
    preset: ReportPreset;
    bounds: DateBounds;
  }>({ preset: "current", bounds: initialBounds });
  const [category, setCategory] = useState<"expense" | "income">("expense");
  const [expanded, setExpanded] = useState(false);

  const customIsValid = Boolean(
    customRangeValid && customFrom && customTo && customFrom <= customTo,
  );
  const comparisonBounds = comparisonBoundsForPreset(
    applied.preset,
    applied.bounds,
    startDay,
    comparisonMode,
  );
  const trendBounds = effectiveBounds(applied.bounds);
  const granularity = trendGranularity(trendBounds);

  const report = useQuery({
    queryKey: queryKeys.reports.summary(
      applied.bounds.dateFrom,
      applied.bounds.dateTo,
    ),
    queryFn: () =>
      reportsApi.summary(applied.bounds.dateFrom, applied.bounds.dateTo),
  });
  const comparison = useQuery({
    queryKey: queryKeys.reports.summary(
      comparisonBounds.dateFrom,
      comparisonBounds.dateTo,
    ),
    queryFn: () =>
      reportsApi.summary(comparisonBounds.dateFrom, comparisonBounds.dateTo),
  });
  const trend = useQuery({
    queryKey: queryKeys.reports.trend(
      trendBounds.dateFrom,
      trendBounds.dateTo,
      granularity,
    ),
    queryFn: () =>
      reportsApi.trend(trendBounds.dateFrom, trendBounds.dateTo, granularity),
  });

  function choosePreset(next: ReportPreset) {
    setPreset(next);
    setExpanded(false);
    if (next === "custom") return;
    const bounds = reportPresetBounds(next, startDay);
    setApplied({ preset: next, bounds });
  }

  function applyCustomRange() {
    if (!customIsValid) return;
    setExpanded(false);
    setApplied({
      preset: "custom",
      bounds: {
        dateFrom: customFrom,
        dateTo: toExclusiveDate(customTo),
      },
    });
  }

  const selectedAccounts =
    category === "expense"
      ? report.data?.expense_accounts
      : report.data?.income_accounts;
  const previousAccounts =
    category === "expense"
      ? comparison.data?.expense_accounts
      : comparison.data?.income_accounts;
  const selectedTotal =
    category === "expense"
      ? report.data?.expense_minor
      : report.data?.income_minor;
  const canExpand =
    (selectedAccounts?.filter((item) => item.total_minor !== 0).length ?? 0) >
    8;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>報表期間</CardTitle>
          <CardDescription>
            {formatShortDate(applied.bounds.dateFrom)}–
            {formatShortDate(toInclusiveDate(applied.bounds.dateTo))}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="report-period">期間</FieldLabel>
              <Combobox
                id="report-period"
                value={preset}
                onValueChange={(value) => choosePreset(value as ReportPreset)}
                options={presets.map(([value, label]) => ({ value, label }))}
                sheetTitle="選擇期間"
                searchPlaceholder="搜尋期間…"
                emptyText="找不到期間。"
                aria-label={`報表期間：${presetLabels[preset]}`}
              />
            </Field>
            <Field>
              <FieldLabel>比較基準</FieldLabel>
              <ComparisonModeSelector
                value={comparisonMode}
                onValueChange={setComparisonMode}
                className="w-full"
              />
            </Field>
          </div>

          {preset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <DateRangePicker
                id="report-date-range"
                value={{ from: customFrom, to: customTo }}
                pickerTitle="選擇自訂報表期間"
                onValidityChange={setCustomRangeValid}
                onValueChange={({ from, to }) => {
                  setCustomFrom(from);
                  setCustomTo(to);
                }}
              />
              <Button
                type="button"
                disabled={!customIsValid}
                onClick={applyCustomRange}
              >
                套用
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {report.isPending && isReadOnly ? (
        <OfflineUnavailableState />
      ) : report.isPending ? (
        <PageLoading variant="reports" />
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
              message="比較資料無法載入，目前仍顯示所選期間結果。"
              onRetry={() => void comparison.refetch()}
            />
          ) : null}

          <Tabs
            value={category}
            onValueChange={(value) => {
              setCategory(value as "expense" | "income");
              setExpanded(false);
            }}
          >
            <Card>
              <CardHeader>
                <CardTitle>分類分析</CardTitle>
                <CardDescription>金額、占比與比較期間的變化</CardDescription>
                <CardAction>
                  <TabsList>
                    <TabsTrigger value="expense">支出</TabsTrigger>
                    <TabsTrigger value="income">收入</TabsTrigger>
                  </TabsList>
                </CardAction>
              </CardHeader>
              <CardContent>
                <TabsContent value={category}>
                  <CategoryRanking
                    accounts={selectedAccounts ?? []}
                    previousAccounts={previousAccounts}
                    total={selectedTotal ?? 0}
                    tone={category}
                    dateFrom={applied.bounds.dateFrom}
                    dateTo={applied.bounds.dateTo}
                    limit={expanded ? undefined : 8}
                  />
                  {canExpand ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2 w-full"
                      onClick={() => setExpanded((current) => !current)}
                    >
                      {expanded ? "收合" : "顯示全部"}
                    </Button>
                  ) : null}
                </TabsContent>
              </CardContent>
            </Card>
          </Tabs>

          {trend.isPending && isReadOnly ? (
            <OfflineUnavailableState
              title="尚未儲存趨勢資料"
              description="連線後開啟這個報表期間，即可在離線時檢視。"
            />
          ) : trend.isPending ? (
            <CardLoading rows={4} />
          ) : trend.isError ? (
            <ErrorState
              message={trend.error.message}
              onRetry={() => void trend.refetch()}
            />
          ) : (
            <SpendingTrendCard trend={trend.data} />
          )}
        </>
      )}
    </div>
  );
}
