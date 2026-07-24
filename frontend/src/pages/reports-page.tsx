import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { useState } from "react";

import { EmptyState, ErrorState, PageLoading } from "@/components/page-state";
import { CategoryChart, SummaryCards } from "@/components/report-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { reportsApi } from "@/lib/api-client";
import {
  currentMonthTaipei,
  monthBounds,
  toExclusiveDate,
  toInclusiveDate,
} from "@/lib/format";

export function ReportsPage() {
  const currentBounds = monthBounds(currentMonthTaipei());
  const [dateFrom, setDateFrom] = useState(currentBounds.dateFrom);
  const [dateTo, setDateTo] = useState(toInclusiveDate(currentBounds.dateTo));
  const [applied, setApplied] = useState({
    from: currentBounds.dateFrom,
    to: currentBounds.dateTo,
  });

  const isValid = Boolean(dateFrom && dateTo && dateFrom <= dateTo);
  const report = useQuery({
    queryKey: ["report-summary", applied.from, applied.to],
    queryFn: () => reportsApi.summary(applied.from, applied.to),
  });

  function applyRange() {
    if (!isValid) return;
    setApplied({ from: dateFrom, to: toExclusiveDate(dateTo) });
  }

  function setCurrentMonth() {
    const bounds = monthBounds(currentMonthTaipei());
    setDateFrom(bounds.dateFrom);
    setDateTo(toInclusiveDate(bounds.dateTo));
    setApplied({ from: bounds.dateFrom, to: bounds.dateTo });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>報表期間</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor="report-from">開始日期</FieldLabel>
            <Input
              id="report-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="report-to">結束日期</FieldLabel>
            <Input
              id="report-to"
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={setCurrentMonth}>
              本月
            </Button>
            <Button type="button" disabled={!isValid} onClick={applyRange}>
              套用
            </Button>
          </div>
        </CardContent>
      </Card>

      {report.isPending ? (
        <PageLoading rows={4} />
      ) : report.isError ? (
        <ErrorState
          message={report.error.message}
          onRetry={() => void report.refetch()}
        />
      ) : report.data.income_accounts.length === 0 &&
        report.data.expense_accounts.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="這段期間沒有收支資料"
          description="調整報表期間，或先新增一筆收入或支出交易。"
        />
      ) : (
        <>
          <SummaryCards summary={report.data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CategoryChart
              title="支出明細"
              description="依支出帳戶彙整"
              accounts={report.data.expense_accounts}
            />
            <CategoryChart
              title="收入明細"
              description="依收入帳戶彙整"
              accounts={report.data.income_accounts}
            />
          </div>
        </>
      )}
    </div>
  );
}
