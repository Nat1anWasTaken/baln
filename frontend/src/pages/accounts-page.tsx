import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Pencil,
  Plus,
  Search,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useOfflineReadOnly } from "@/auth/auth-context";
import {
  CreateAccountDialog,
  EditAccountDialog,
} from "@/features/accounts/account-dialogs";
import { EmptyState, ErrorState, PageLoading } from "@/components/page-state";
import { OfflineUnavailableState } from "@/components/offline-state";
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SwitchField } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { accountTypeLabels } from "@/lib/account";
import { accountsApi } from "@/lib/api-client";
import { formatMoney, todayTaipei } from "@/lib/format";
import { invalidateAfterAccountWrite } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";
import type { Account } from "@/lib/schemas";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

function AccountBalance({ account }: { account: Account }) {
  const isReadOnly = useOfflineReadOnly();
  const balance = useQuery({
    queryKey: queryKeys.accounts.balance(account.id, todayTaipei()),
    queryFn: () => accountsApi.balance(account.id, todayTaipei()),
  });

  if (balance.isPending && isReadOnly)
    return <span className="text-muted-foreground">—</span>;
  if (balance.isPending)
    return <span className="text-muted-foreground">載入中</span>;
  if (balance.isError) return <span className="text-muted-foreground">—</span>;
  return <span>{formatMoney(balance.data.display_balance_minor)}</span>;
}

export function AccountsPage() {
  const isReadOnly = useOfflineReadOnly();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [changingArchive, setChangingArchive] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  const accounts = useQuery({
    queryKey: queryKeys.accounts.list(includeArchived, debouncedSearch),
    queryFn: () => accountsApi.list(includeArchived, debouncedSearch),
  });

  const archive = useMutation({
    mutationFn: (account: Account) =>
      accountsApi.update(account.id, { archived: !account.archived }),
    onSuccess: async (updated) => {
      await invalidateAfterAccountWrite(queryClient);
      toast.success(updated.archived ? "帳戶已封存" : "帳戶已恢復");
      setChangingArchive(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (account: Account) => accountsApi.delete(account.id),
    onSuccess: async () => {
      await invalidateAfterAccountWrite(queryClient);
      toast.success("帳戶已刪除");
      setDeleting(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const content =
    accounts.isPending && isReadOnly ? (
      <OfflineUnavailableState />
    ) : accounts.isPending ? (
      <PageLoading rows={5} />
    ) : accounts.isError ? (
      <ErrorState
        message={accounts.error.message}
        onRetry={() => void accounts.refetch()}
      />
    ) : accounts.data.length === 0 ? (
      <EmptyState
        icon={WalletCards}
        title={search ? "找不到符合的帳戶" : "還沒有帳戶"}
        description={
          search
            ? "請嘗試其他名稱或帳戶代碼。"
            : "建立資產、負債與收支分類帳戶後，就能開始記帳。"
        }
        action={
          !search && !isReadOnly ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              建立第一個帳戶
            </Button>
          ) : null
        }
      />
    ) : (
      <>
        <div className="grid gap-3 md:hidden">
          {accounts.data.map((account) => (
            <Card key={account.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{account.name}</CardTitle>
                    <CardDescription className="truncate">
                      {account.key}
                    </CardDescription>
                    {account.note ? (
                      <p className="mt-1 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">
                        {account.note}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={account.archived ? "outline" : "secondary"}>
                    {account.archived
                      ? "已封存"
                      : accountTypeLabels[account.type]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <p className="font-medium tabular-nums">
                  <AccountBalance account={account} />
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`編輯 ${account.name}`}
                    disabled={isReadOnly}
                    onClick={() => setEditing(account)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={
                      account.archived
                        ? `恢復 ${account.name}`
                        : `封存 ${account.name}`
                    }
                    disabled={isReadOnly}
                    onClick={() => setChangingArchive(account)}
                  >
                    {account.archived ? (
                      <ArchiveRestore aria-hidden="true" />
                    ) : (
                      <Archive aria-hidden="true" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`刪除 ${account.name}`}
                    disabled={isReadOnly}
                    onClick={() => setDeleting(account)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>帳戶</TableHead>
                <TableHead>類型</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">截至今日餘額</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.data.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {account.key}
                    </p>
                    {account.note ? (
                      <p className="mt-1 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">
                        {account.note}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>{accountTypeLabels[account.type]}</TableCell>
                  <TableCell>
                    <Badge variant={account.archived ? "outline" : "secondary"}>
                      {account.archived ? "已封存" : "使用中"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    <AccountBalance account={account} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`編輯 ${account.name}`}
                        disabled={isReadOnly}
                        onClick={() => setEditing(account)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={
                          account.archived
                            ? `恢復 ${account.name}`
                            : `封存 ${account.name}`
                        }
                        disabled={isReadOnly}
                        onClick={() => setChangingArchive(account)}
                      >
                        {account.archived ? (
                          <ArchiveRestore aria-hidden="true" />
                        ) : (
                          <Archive aria-hidden="true" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`刪除 ${account.name}`}
                        disabled={isReadOnly}
                        onClick={() => setDeleting(account)}
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
          <FieldLabel htmlFor="account-search">搜尋帳戶</FieldLabel>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="account-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="名稱、帳戶代碼或備註"
              className="pl-8"
            />
          </div>
        </Field>
        <SwitchField
          id="include-archived"
          label="顯示已封存"
          checked={includeArchived}
          onCheckedChange={setIncludeArchived}
          containerClassName="sm:pb-1"
        />
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={isReadOnly}
          title={isReadOnly ? "離線模式僅供檢視" : undefined}
        >
          <Plus aria-hidden="true" />
          新增帳戶
        </Button>
      </div>

      {content}

      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditAccountDialog
        key={editing?.id ?? "no-account"}
        account={editing}
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
      <AlertDialog
        open={Boolean(changingArchive)}
        onOpenChange={(open) => {
          if (!open) setChangingArchive(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {changingArchive?.archived ? "恢復帳戶？" : "封存帳戶？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {changingArchive?.archived
                ? "恢復後，這個帳戶可以再次用於新交易。"
                : "既有交易會保留，但封存後不能再把這個帳戶加入新交易。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!changingArchive || isReadOnly}
              loading={archive.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (changingArchive) archive.mutate(changingArchive);
              }}
            >
              {changingArchive?.archived ? "恢復" : "封存"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              只有沒有交易紀錄的帳戶可以刪除。刪除後無法復原；若要保留既有交易，請改為封存。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!deleting || isReadOnly}
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
