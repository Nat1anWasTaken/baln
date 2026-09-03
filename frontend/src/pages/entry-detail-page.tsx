import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useState } from "react";

import { useOfflineReadOnly } from "@/auth/auth-context";
import { OfflineUnavailableState } from "@/components/offline-state";
import { ErrorState, PageLoading } from "@/components/page-state";
import { AppLink, useAppNavigate } from "@/components/navigation-transition";
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
import { Button } from "@/components/ui/button";
import { TransactionDisplay } from "@/components/transaction-display";
import { entriesApi } from "@/lib/api-client";
import { entryEditorRouteState } from "@/lib/entry-navigation";
import { invalidateAfterEntryWrite } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";

export function EntryDetailPage() {
  const isReadOnly = useOfflineReadOnly();
  const { entryId = "" } = useParams();
  const location = useLocation();
  const { search } = location;
  const navigate = useAppNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const entry = useQuery({
    queryKey: queryKeys.entries.detail(entryId),
    queryFn: () => entriesApi.get(entryId),
    enabled: Boolean(entryId),
  });

  const remove = useMutation({
    mutationFn: () => entriesApi.delete(entryId),
    onSuccess: async () => {
      await invalidateAfterEntryWrite(queryClient);
      toast.success("交易已刪除");
      navigate(
        { pathname: "/entries", search },
        { replace: true, transitionIntent: "back" },
      );
    },
    onError: (error) => toast.error(error.message),
  });

  if (entry.isPending && isReadOnly) {
    return <OfflineUnavailableState />;
  }
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
          <AppLink
            to={{ pathname: "/entries", search }}
            transitionIntent="back"
          >
            <ArrowLeft aria-hidden="true" />
            返回交易
          </AppLink>
        </Button>
        <div className="flex gap-2">
          {isReadOnly ? (
            <Button type="button" variant="outline" disabled>
              <Pencil aria-hidden="true" />
              編輯
            </Button>
          ) : (
            <Button asChild variant="outline">
              <AppLink
                to={{ pathname: `/entries/${entryId}/edit`, search }}
                state={entryEditorRouteState(location)}
              >
                <Pencil aria-hidden="true" />
                編輯
              </AppLink>
            </Button>
          )}
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

      <TransactionDisplay entry={entry.data} />

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
              disabled={isReadOnly}
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
