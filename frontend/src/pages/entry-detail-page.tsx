import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useState } from "react";

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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { accountTypeLabels } from "@/lib/account";
import { entriesApi } from "@/lib/api-client";
import { formatLedgerDate, formatMoney, formatTimestamp } from "@/lib/format";

export function EntryDetailPage() {
  const { entryId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const entry = useQuery({
    queryKey: ["entry", entryId],
    queryFn: () => entriesApi.get(entryId),
    enabled: Boolean(entryId),
  });

  const remove = useMutation({
    mutationFn: () => entriesApi.delete(entryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["entries"] });
      await queryClient.invalidateQueries({ queryKey: ["report"] });
      await queryClient.invalidateQueries({ queryKey: ["account-balance"] });
      toast.success("交易已刪除");
      navigate("/entries", { replace: true });
    },
    onError: (error) => toast.error(error.message),
  });

  if (entry.isPending) return <PageLoading rows={4} />;
  if (entry.isError) {
    return (
      <ErrorState
        message={entry.error.message}
        onRetry={() => void entry.refetch()}
      />
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link to="/entries">
            <ArrowLeft aria-hidden="true" />
            返回交易
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to={`/entries/${entryId}/edit`}>
              <Pencil aria-hidden="true" />
              編輯
            </Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 aria-hidden="true" />
            刪除
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>{formatLedgerDate(entry.data.date)}</CardDescription>
          <CardTitle className="text-xl">{entry.data.description}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          {entry.data.note ? (
            <div>
              <p className="mb-1 text-sm font-medium">交易備註</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {entry.data.note}
              </p>
            </div>
          ) : null}
          <Separator />
          <div>
            <h2 className="mb-3 font-medium">分錄</h2>
            <div className="grid gap-2 md:hidden">
              {entry.data.postings.map((posting) => (
                <div key={posting.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{posting.account.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {posting.account.key}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">
                        {posting.amount_minor > 0 ? "借方" : "貸方"}
                      </Badge>
                      <p className="mt-1 font-medium tabular-nums">
                        {formatMoney(Math.abs(posting.amount_minor))}
                      </p>
                    </div>
                  </div>
                  {posting.memo ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {posting.memo}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>帳戶</TableHead>
                    <TableHead>類型</TableHead>
                    <TableHead>備註</TableHead>
                    <TableHead className="text-right">借方</TableHead>
                    <TableHead className="text-right">貸方</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entry.data.postings.map((posting) => (
                    <TableRow key={posting.id}>
                      <TableCell>
                        <p className="font-medium">{posting.account.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {posting.account.key}
                        </p>
                      </TableCell>
                      <TableCell>
                        {accountTypeLabels[posting.account.type]}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {posting.memo ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {posting.amount_minor > 0
                          ? formatMoney(posting.amount_minor)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {posting.amount_minor < 0
                          ? formatMoney(-posting.amount_minor)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <Separator />
          <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <dt>建立時間</dt>
              <dd>{formatTimestamp(entry.data.created_at)}</dd>
            </div>
            <div>
              <dt>最後更新</dt>
              <dd>{formatTimestamp(entry.data.updated_at)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這筆交易？</AlertDialogTitle>
            <AlertDialogDescription>
              所有相關分錄都會一起刪除，這項操作無法復原。
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
