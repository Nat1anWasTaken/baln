import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Filter, Plus, Search, WalletCards, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { EntryCard, EntryTableRow } from "@/components/entry-list-item";
import { EmptyState, ErrorState, PageLoading } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { accountsApi, entriesApi } from "@/lib/api-client";
import { toExclusiveDate } from "@/lib/format";

export function EntriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search);
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";
  const accountKey = searchParams.get("account") ?? "all";

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (current === debouncedSearch) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set("q", debouncedSearch);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  }, [debouncedSearch, searchParams, setSearchParams]);

  const accounts = useQuery({
    queryKey: ["accounts", true, ""],
    queryFn: () => accountsApi.list(true),
  });

  const entries = useInfiniteQuery({
    queryKey: ["entries", dateFrom, dateTo, accountKey, debouncedSearch],
    queryFn: ({ pageParam }) =>
      entriesApi.list({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo ? toExclusiveDate(dateTo) : undefined,
        accountKey: accountKey === "all" ? undefined : accountKey,
        q: debouncedSearch || undefined,
        cursor: pageParam || undefined,
        limit: 50,
      }),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
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

  function clearFilters() {
    setSearch("");
    setSearchParams({}, { replace: true });
  }

  const hasFilters = Boolean(
    debouncedSearch || dateFrom || dateTo || accountKey !== "all",
  );

  return (
    <div className="grid gap-5">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
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
          <Field>
            <FieldLabel htmlFor="entry-from">開始日期</FieldLabel>
            <Input
              id="entry-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setFilter("from", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="entry-to">結束日期</FieldLabel>
            <Input
              id="entry-to"
              type="date"
              min={dateFrom || undefined}
              value={dateTo}
              onChange={(event) => setFilter("to", event.target.value)}
            />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="entry-account">帳戶</FieldLabel>
            <Select
              value={accountKey}
              onValueChange={(value) => setFilter("account", value)}
            >
              <SelectTrigger id="entry-account" className="w-full">
                <SelectValue placeholder="所有帳戶" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有帳戶</SelectItem>
                {accounts.data?.map((account) => (
                  <SelectItem key={account.id} value={account.key}>
                    {account.name}
                    {account.archived ? "（已封存）" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-end gap-2 md:col-span-2 md:justify-end">
            {hasFilters ? (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                <X aria-hidden="true" />
                清除篩選
              </Button>
            ) : null}
            <Button asChild>
              <Link to="/entries/new">
                <Plus aria-hidden="true" />
                新增交易
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      {entries.isPending ? (
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
              ? "請調整搜尋文字、日期或帳戶篩選。"
              : "新增第一筆收入、支出、轉帳或退款。"
          }
          action={
            hasFilters ? (
              <Button type="button" variant="outline" onClick={clearFilters}>
                清除篩選
              </Button>
            ) : (
              <Button asChild>
                <Link to="/entries/new">
                  <Plus aria-hidden="true" />
                  新增第一筆交易
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {items.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
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
                  <EntryTableRow key={entry.id} entry={entry} />
                ))}
              </TableBody>
            </Table>
          </Card>
          {entries.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="mx-auto"
              disabled={entries.isFetchingNextPage}
              onClick={() => void entries.fetchNextPage()}
            >
              {entries.isFetchingNextPage ? "載入中" : "載入更多"}
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
