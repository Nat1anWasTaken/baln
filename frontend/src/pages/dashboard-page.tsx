import { useQueries, useQuery } from "@tanstack/react-query";
import { WalletCards } from "lucide-react";
import { Link } from "react-router-dom";

import { EntryCard, EntryTableRow } from "@/components/entry-list-item";
import { EmptyState, ErrorState, PageLoading } from "@/components/page-state";
import { CategoryChart, SummaryCards } from "@/components/report-summary";
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
import { DayOfMonthPicker } from "@/components/ui/day-of-month-picker";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMonthStartDay } from "@/hooks/use-month-start-day";
import { accountTypeLabels } from "@/lib/account";
import { accountsApi, entriesApi, reportsApi } from "@/lib/api-client";
import {
  currentPeriodMonth,
  formatMoney,
  formatShortDate,
  monthPeriodBounds,
  monthLabel,
  todayTaipei,
  toInclusiveDate,
} from "@/lib/format";
import type { Account } from "@/lib/schemas";
import { useState } from "react";

function BalanceGrid({ accounts }: { accounts: Account[] }) {
  const relevant = accounts.filter(
    (account) => account.type === "asset" || account.type === "liability",
  );
  const balances = useQueries({
    queries: relevant.map((account) => ({
      queryKey: ["account-balance", account.id, todayTaipei()],
      queryFn: () => accountsApi.balance(account.id, todayTaipei()),
    })),
  });

  if (relevant.length === 0) {
    return (
      <p className="py-5 text-center text-sm text-muted-foreground">
        尚未建立資產或負債帳戶。
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {relevant.map((account, index) => {
        const balance = balances[index];
        const typeLabel = accountTypeLabels[account.type];
        const formattedBalance = balance.isPending
          ? "載入中"
          : balance.isError
            ? "—"
            : formatMoney(balance.data.display_balance_minor);
        return (
          <div
            key={account.id}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{account.name}</p>
                <Badge
                  variant={
                    account.type === "liability" ? "outline" : "secondary"
                  }
                >
                  {typeLabel}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {account.key}
              </p>
            </div>
            <p
              className="shrink-0 text-sm font-medium tabular-nums"
              aria-label={`${typeLabel}餘額 ${formattedBalance}`}
            >
              {formattedBalance}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardPage() {
  const { startDay, setStartDay } = useMonthStartDay();
  const [month, setMonth] = useState(() => currentPeriodMonth(startDay));
  const bounds = monthPeriodBounds(month, startDay);
  const report = useQuery({
    queryKey: ["report-summary", bounds.dateFrom, bounds.dateTo],
    queryFn: () => reportsApi.summary(bounds.dateFrom, bounds.dateTo),
  });
  const accounts = useQuery({
    queryKey: ["accounts", false, ""],
    queryFn: () => accountsApi.list(),
  });
  const entries = useQuery({
    queryKey: ["entries-recent"],
    queryFn: () => entriesApi.list({ limit: 5 }),
  });

  function changeStartDay(day: number) {
    setStartDay(day);
    setMonth(currentPeriodMonth(day));
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">期間概況</p>
          <h2 className="text-2xl font-semibold">{monthLabel(month)}期</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatShortDate(bounds.dateFrom)}–
            {formatShortDate(toInclusiveDate(bounds.dateTo))}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
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
        </div>
      </div>

      {report.isPending ? (
        <PageLoading variant="dashboard" />
      ) : report.isError ? (
        <ErrorState
          message={report.error.message}
          onRetry={() => void report.refetch()}
        />
      ) : (
        <>
          <SummaryCards summary={report.data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CategoryChart
              title="支出分類"
              description="依支出帳戶彙整本期金額"
              tone="expense"
              accounts={report.data.expense_accounts}
            />
            <CategoryChart
              title="收入分類"
              description="依收入帳戶彙整本期金額"
              tone="income"
              accounts={report.data.income_accounts}
            />
          </div>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>帳戶餘額</CardTitle>
            <CardDescription>截至今日的資產與負債餘額</CardDescription>
          </CardHeader>
          <CardContent>
            {accounts.isPending ? (
              <PageLoading rows={2} />
            ) : accounts.isError ? (
              <ErrorState message={accounts.error.message} />
            ) : (
              <BalanceGrid accounts={accounts.data} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近交易</CardTitle>
            <CardDescription>依交易日期由新到舊排列</CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link to="/entries">查看全部</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {entries.isPending ? (
              <PageLoading rows={3} />
            ) : entries.isError ? (
              <ErrorState message={entries.error.message} />
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
    </div>
  );
}
