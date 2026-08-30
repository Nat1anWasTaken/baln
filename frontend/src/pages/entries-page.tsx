import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Filter, Plus, Search, WalletCards, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { useOfflineReadOnly } from "@/auth/auth-context";
import { EntryCard, EntryTableRow } from "@/components/entry-list-item";
import { AppLink } from "@/components/navigation-transition";
import { OfflineUnavailableState } from "@/components/offline-state";
import { EmptyState, ErrorState, PageLoading } from "@/components/page-state";
import { AccountFilterSelector } from "@/features/entries/account-filter-selector";
import { BudgetFilterSelector } from "@/features/entries/budget-filter-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { accountsApi, budgetsApi, entriesApi } from "@/lib/api-client";
import { ENTRY_REFETCH_INTERVAL_MS } from "@/lib/entry-refresh";
import { toExclusiveDate } from "@/lib/format";
import { entryEditorRouteState } from "@/lib/entry-navigation";
import { queryKeys } from "@/lib/query-keys";

export function EntriesPage() {
  const isReadOnly = useOfflineReadOnly();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search);
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";
  const accountKey = searchParams.get("account") ?? "all";
  const budgetId = searchParams.get("budget") ?? "all";
  const listSearch = searchParams.size ? `?${searchParams.toString()}` : "";

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (current === debouncedSearch) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set("q", debouncedSearch);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  }, [debouncedSearch, searchParams, setSearchParams]);

  const accounts = useQuery({
    queryKey: queryKeys.accounts.list(true, ""),
    queryFn: () => accountsApi.list(true),
  });
  const budgets = useQuery({
    queryKey: queryKeys.budgets.list(false),
    queryFn: () => budgetsApi.list(false),
  });

  const entries = useInfiniteQuery({
    queryKey: queryKeys.entries.list(
      dateFrom,
      dateTo,
      accountKey,
      budgetId,
      debouncedSearch,
    ),
    queryFn: ({ pageParam }) =>
      entriesApi.list({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo ? toExclusiveDate(dateTo) : undefined,
        accountKey: accountKey === "all" ? undefined : accountKey,
        budgetId: budgetId === "all" ? undefined : budgetId,
        q: debouncedSearch || undefined,
        cursor: pageParam || undefined,
        limit: 50,
      }),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    refetchInterval: ENTRY_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const items = useMemo(
    () => entries.data?.pages.flatMap((page) => page.items) ?? [],
    [entries.data],
  );

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  function setDateRange(from: string, to: string) {
    const next = new URLSearchParams(searchParams);
    if (from) next.set("from", from);
    else next.delete("from");
    if (to) next.set("to", to);
    else next.delete("to");
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearch("");
    setSearchParams({}, { replace: true });
  }

  const hasFilters = Boolean(
    debouncedSearch ||
    dateFrom ||
    dateTo ||
    accountKey !== "all" ||
    budgetId !== "all",
  );

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>篩選條件</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Field>
            <FieldLabel>帳戶</FieldLabel>
            <AccountFilterSelector
              value={accountKey}
              onValueChange={(value) => setFilter("account", value)}
              accounts={accounts.data ?? []}
              isLoading={accounts.isPending}
              errorMessage={
                accounts.isError ? accounts.error.message : undefined
              }
              onRetry={() => void accounts.refetch()}
            />
          </Field>
          <Field>
            <FieldLabel>預算</FieldLabel>
            <BudgetFilterSelector
              value={budgetId}
              onValueChange={(value) => setFilter("budget", value)}
              budgets={budgets.data ?? []}
              isLoading={budgets.isPending}
              errorMessage={budgets.isError ? budgets.error.message : undefined}
              onRetry={() => void budgets.refetch()}
            />
          </Field>
          <Separator />
          <div className="grid gap-3 md:grid-cols-4" data-entry-filter-grid>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="entry-search">搜尋交易</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="entry-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="說明、備註、帳戶或分錄備註"
                  className="pl-8"
                />
              </div>
            </Field>
            <div className="md:col-span-2">
              <DateRangePicker
                id="entry-date-range"
                value={{ from: dateFrom, to: dateTo }}
                allowOpenEnded
                clearable
                pickerTitle="篩選交易日期"
                onValueChange={({ from, to }) => setDateRange(from, to)}
              />
            </div>
          </div>
          <div className="flex items-end gap-2 md:justify-end">
            {hasFilters ? (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                <X aria-hidden="true" />
                清除篩選
              </Button>
            ) : null}
            {isReadOnly ? (
              <Button type="button" disabled title="離線模式僅供檢視">
                <Plus aria-hidden="true" />
                新增交易
              </Button>
            ) : (
              <Button asChild>
                <AppLink
                  to="/entries/new"
                  state={entryEditorRouteState(location)}
                >
                  <Plus aria-hidden="true" />
                  新增交易
                </AppLink>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {entries.isPending && isReadOnly ? (
        <OfflineUnavailableState />
      ) : entries.isPending ? (
        <PageLoading rows={6} />
      ) : entries.isError ? (
        <ErrorState
          message={entries.error.message}
          onRetry={() => void entries.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={hasFilters ? Filter : WalletCards}
          title={hasFilters ? "找不到符合的交易" : "還沒有交易"}
          description={
            hasFilters
              ? "請調整搜尋文字、日期、帳戶或預算篩選。"
              : "新增第一筆收入、支出、轉帳或退款。"
          }
          action={
            hasFilters ? (
              <Button type="button" variant="outline" onClick={clearFilters}>
                清除篩選
              </Button>
            ) : isReadOnly ? null : (
              <Button asChild>
                <AppLink
                  to="/entries/new"
                  state={entryEditorRouteState(location)}
                >
                  <Plus aria-hidden="true" />
                  新增第一筆交易
                </AppLink>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {items.map((entry) => (
              <EntryCard key={entry.id} entry={entry} listSearch={listSearch} />
            ))}
          </div>
          <Card className="hidden overflow-hidden md:block">
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
                {items.map((entry) => (
                  <EntryTableRow
                    key={entry.id}
                    entry={entry}
                    listSearch={listSearch}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
          {entries.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="mx-auto"
              loading={entries.isFetchingNextPage}
              onClick={() => void entries.fetchNextPage()}
            >
              載入更多
            </Button>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              已顯示全部交易
            </p>
          )}
        </>
      )}
    </div>
  );
}
