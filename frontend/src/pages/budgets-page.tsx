import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  PiggyBank,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useOfflineReadOnly } from "@/auth/auth-context";
import { BudgetCard, budgetPeriodLabel } from "@/components/budget-card";
import { AppLink } from "@/components/navigation-transition";
import { OfflineUnavailableState } from "@/components/offline-state";
import { EmptyState, ErrorState, PageLoading } from "@/components/page-state";
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
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BudgetDialog } from "@/features/budgets/budget-dialog";
import { accountsApi, budgetsApi } from "@/lib/api-client";
import { formatMoney, formatShortDate, toInclusiveDate } from "@/lib/format";
import { invalidateAfterBudgetWrite } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";
import type { BudgetStatus } from "@/lib/schemas";

export function BudgetsPage() {
  const isReadOnly = useOfflineReadOnly();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetStatus | null>(null);
  const [deleting, setDeleting] = useState<BudgetStatus | null>(null);
  const budgets = useQuery({
    queryKey: queryKeys.budgets.list(false),
    queryFn: () => budgetsApi.list(false),
  });
  const accounts = useQuery({
    queryKey: queryKeys.accounts.list(true, ""),
    queryFn: () => accountsApi.list(true),
  });
  const remove = useMutation({
    mutationFn: (budget: BudgetStatus) => budgetsApi.delete(budget.id),
    onSuccess: async () => {
      await invalidateAfterBudgetWrite(queryClient);
      toast.success("預算已刪除");
      setDeleting(null);
    },
    onError: (error) => toast.error(error.message),
  });
  const visibility = useMutation({
    mutationFn: ({ budget, show }: { budget: BudgetStatus; show: boolean }) =>
      budgetsApi.update(budget.id, { show_on_overview: show }),
    onSuccess: async () => invalidateAfterBudgetWrite(queryClient),
    onError: (error) => toast.error(error.message),
  });
  const reorder = useMutation({
    mutationFn: budgetsApi.reorderOverview,
    onSuccess: async () => invalidateAfterBudgetWrite(queryClient),
    onError: (error) => toast.error(error.message),
  });

  const visible =
    budgets.data?.filter((budget) => budget.show_on_overview) ?? [];
  const filteredBudgets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("zh-TW");
    if (!query) return budgets.data ?? [];

    return (budgets.data ?? []).filter(
      (budget) =>
        budget.name.toLocaleLowerCase("zh-TW").includes(query) ||
        budget.accounts.some(
          (account) =>
            account.name.toLocaleLowerCase("zh-TW").includes(query) ||
            account.key.toLocaleLowerCase("zh-TW").includes(query),
        ),
    );
  }, [budgets.data, search]);
  function move(budget: BudgetStatus, direction: -1 | 1) {
    const index = visible.findIndex((item) => item.id === budget.id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= visible.length) return;
    const order = visible.map((item) => item.id);
    [order[index], order[next]] = [order[next], order[index]];
    reorder.mutate(order);
  }

  const content =
    budgets.isPending && isReadOnly ? (
      <OfflineUnavailableState />
    ) : budgets.isPending ? (
      <PageLoading rows={4} />
    ) : budgets.isError ? (
      <ErrorState
        message={budgets.error.message}
        onRetry={() => void budgets.refetch()}
      />
    ) : filteredBudgets.length === 0 ? (
      <EmptyState
        icon={PiggyBank}
        title={search.trim() ? "找不到符合的預算" : "還沒有預算"}
        description={
          search.trim()
            ? "請嘗試其他預算名稱、帳戶名稱或帳戶代碼。"
            : "建立第一個預算，依你的週期與帳戶掌握支出額度。"
        }
        action={
          !search.trim() && !isReadOnly ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              建立第一個預算
            </Button>
          ) : null
        }
      />
    ) : (
      <>
        <div className="grid gap-3 md:hidden">
          {filteredBudgets.map((budget) => (
            <div key={budget.id} className="grid gap-2">
              <BudgetCard budget={budget} to={`/budgets/${budget.id}`} />
              <div className="flex min-h-11 items-center gap-1 rounded-lg border bg-card px-2">
                <Switch
                  aria-label={`${budget.name} 顯示在總覽`}
                  checked={budget.show_on_overview}
                  disabled={isReadOnly || visibility.isPending}
                  onCheckedChange={(show) =>
                    visibility.mutate({ budget, show })
                  }
                />
                <span className="mr-auto text-sm">總覽</span>
                {budget.show_on_overview ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`上移 ${budget.name}`}
                      disabled={isReadOnly || visible[0]?.id === budget.id}
                      onClick={() => move(budget, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`下移 ${budget.name}`}
                      disabled={isReadOnly || visible.at(-1)?.id === budget.id}
                      onClick={() => move(budget, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`編輯 ${budget.name}`}
                  disabled={isReadOnly}
                  onClick={() => setEditing(budget)}
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`刪除 ${budget.name}`}
                  disabled={isReadOnly}
                  onClick={() => setDeleting(budget)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Card className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>預算</TableHead>
                <TableHead>週期</TableHead>
                <TableHead>目前狀況</TableHead>
                <TableHead>總覽</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBudgets.map((budget) => (
                <TableRow key={budget.id}>
                  <TableCell>
                    <AppLink
                      to={`/budgets/${budget.id}`}
                      className="font-medium hover:underline"
                    >
                      {budget.name}
                    </AppLink>
                    <p className="text-xs text-muted-foreground">
                      {budget.accounts
                        .map((account) => account.name)
                        .join("、")}
                    </p>
                  </TableCell>
                  <TableCell>
                    {budgetPeriodLabel(budget)}
                    <p className="text-xs text-muted-foreground">
                      {formatShortDate(budget.period_from)}–
                      {formatShortDate(toInclusiveDate(budget.period_to))}
                    </p>
                  </TableCell>
                  <TableCell>
                    {budget.status === "upcoming" ? (
                      <>
                        <p className="font-medium">尚未開始</p>
                        <Badge variant="secondary">
                          將於 {formatShortDate(budget.start_date)} 開始
                        </Badge>
                      </>
                    ) : (
                      <>
                        <p className="font-medium tabular-nums">
                          {formatMoney(budget.spent_minor)} /{" "}
                          {formatMoney(budget.available_minor)}
                        </p>
                        <Badge
                          variant={
                            budget.remaining_minor < 0
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {budget.remaining_minor < 0
                            ? `超支 ${formatMoney(-budget.remaining_minor)}`
                            : `剩餘 ${formatMoney(budget.remaining_minor)}`}
                        </Badge>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`${budget.name} 顯示在總覽`}
                      checked={budget.show_on_overview}
                      disabled={isReadOnly || visibility.isPending}
                      onCheckedChange={(show) =>
                        visibility.mutate({ budget, show })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {budget.show_on_overview ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`上移 ${budget.name}`}
                            disabled={
                              isReadOnly || visible[0]?.id === budget.id
                            }
                            onClick={() => move(budget, -1)}
                          >
                            <ArrowUp aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`下移 ${budget.name}`}
                            disabled={
                              isReadOnly || visible.at(-1)?.id === budget.id
                            }
                            onClick={() => move(budget, 1)}
                          >
                            <ArrowDown aria-hidden="true" />
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`編輯 ${budget.name}`}
                        disabled={isReadOnly}
                        onClick={() => setEditing(budget)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`刪除 ${budget.name}`}
                        disabled={isReadOnly}
                        onClick={() => setDeleting(budget)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </>
    );

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field className="flex-1">
          <FieldLabel htmlFor="budget-search">搜尋預算</FieldLabel>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="budget-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="預算名稱、帳戶名稱或帳戶代碼"
              className="pl-8"
            />
          </div>
        </Field>
        <Button
          type="button"
          disabled={isReadOnly || accounts.isPending || accounts.isError}
          onClick={() => setCreateOpen(true)}
        >
          <Plus aria-hidden="true" />
          新增預算
        </Button>
      </div>
      {content}
      {accounts.data ? (
        <>
          <BudgetDialog
            key={createOpen ? "create-open" : "create-closed"}
            open={createOpen}
            onOpenChange={setCreateOpen}
            accounts={accounts.data}
          />
          <BudgetDialog
            key={editing?.id ?? "no-budget"}
            open={Boolean(editing)}
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
            accounts={accounts.data}
            budget={editing ?? undefined}
          />
        </>
      ) : null}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除「{deleting?.name}」？</AlertDialogTitle>
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
                if (deleting) remove.mutate(deleting);
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
