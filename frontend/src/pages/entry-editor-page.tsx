import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  type Location,
  type To,
  useBlocker,
  useLocation,
  useParams,
} from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState, ErrorState, PageLoading } from "@/components/page-state";
import {
  AppLink,
  useAppNavigate,
  useSuppressNextNavigationTransition,
} from "@/components/navigation-transition";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EntryEditor } from "@/features/entries/entry-editor";
import { accountsApi, entriesApi } from "@/lib/api-client";
import { getEntryEditorBackground } from "@/lib/entry-navigation";
import type { EntryResponse } from "@/lib/schemas";

type EditorPresentation = "page" | "sheet";

type EntryEditorSurfaceProps = {
  presentation: EditorPresentation;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onNavigate?: (to: To) => void;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (entry: EntryResponse) => void;
};

function EntryEditorSurface({
  presentation,
  onCancel,
  onDirtyChange,
  onNavigate,
  onPendingChange,
  onSaved,
}: EntryEditorSurfaceProps) {
  const { entryId } = useParams();
  const isEditing = Boolean(entryId);
  const accounts = useQuery({
    queryKey: ["accounts", true, ""],
    queryFn: () => accountsApi.list(true),
  });
  const entry = useQuery({
    queryKey: ["entry", entryId],
    queryFn: () => entriesApi.get(entryId!),
    enabled: isEditing,
  });
  const stateClassName =
    presentation === "sheet"
      ? "min-h-0 flex-1 overflow-y-auto px-4 pb-4"
      : undefined;

  if (accounts.isPending || (isEditing && entry.isPending)) {
    return (
      <div className={stateClassName}>
        <PageLoading rows={5} />
      </div>
    );
  }
  if (accounts.isError) {
    return (
      <div className={stateClassName}>
        <ErrorState
          message={accounts.error.message}
          onRetry={() => void accounts.refetch()}
        />
      </div>
    );
  }
  if (entry.isError) {
    return (
      <div className={stateClassName}>
        <ErrorState
          message={entry.error.message}
          onRetry={() => void entry.refetch()}
        />
      </div>
    );
  }

  const activeAccounts = accounts.data.filter((account) => !account.archived);
  if (!isEditing && activeAccounts.length === 0) {
    const action =
      presentation === "sheet" ? (
        <Button type="button" onClick={() => onNavigate?.("/accounts")}>
          前往帳戶管理
        </Button>
      ) : (
        <Button asChild>
          <AppLink to="/accounts">前往帳戶管理</AppLink>
        </Button>
      );

    return (
      <div className={stateClassName}>
        <EmptyState
          title="請先建立帳戶"
          description="至少需要可用的帳戶才能建立交易。"
          action={action}
        />
      </div>
    );
  }

  return (
    <EntryEditor
      accounts={accounts.data}
      entry={entry.data}
      presentation={presentation}
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
      onPendingChange={onPendingChange}
      onSaved={onSaved}
    />
  );
}

export function EntryEditorPage() {
  return <EntryEditorSurface presentation="page" />;
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function EntryEditorSheet({
  backgroundLocation,
}: {
  backgroundLocation: Location;
}) {
  const { entryId } = useParams();
  const location = useLocation();
  const navigate = useAppNavigate();
  const suppressNextNavigationTransition =
    useSuppressNextNavigationTransition();
  const isEditing = Boolean(entryId);
  const [open, setOpen] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const allowNavigation = useRef(false);
  const finalized = useRef(false);
  const pendingDestination = useRef<To | null>(null);
  const hasHistoryBackground = Boolean(
    getEntryEditorBackground(location.state),
  );
  const blocker = useBlocker(() => !allowNavigation.current);

  const finishClose = useCallback(() => {
    if (finalized.current) return;
    finalized.current = true;
    allowNavigation.current = true;

    if (blocker.state === "blocked") {
      suppressNextNavigationTransition();
      blocker.proceed();
      return;
    }
    if (pendingDestination.current) {
      navigate(pendingDestination.current, {
        replace: true,
        transitionIntent: "none",
      });
      return;
    }
    if (hasHistoryBackground) {
      navigate(-1, { transitionIntent: "none" });
      return;
    }
    navigate(
      {
        pathname: backgroundLocation.pathname,
        search: backgroundLocation.search,
        hash: backgroundLocation.hash,
      },
      { replace: true, transitionIntent: "none" },
    );
  }, [
    backgroundLocation,
    blocker,
    hasHistoryBackground,
    navigate,
    suppressNextNavigationTransition,
  ]);

  const closeSheet = useCallback(() => {
    setOpen(false);
    if (prefersReducedMotion()) {
      window.setTimeout(finishClose, 0);
    }
  }, [finishClose]);

  const requestDismiss = useCallback(() => {
    if (isPending) return;
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    closeSheet();
  }, [closeSheet, isDirty, isPending]);

  const requestNavigate = useCallback(
    (to: To) => {
      pendingDestination.current = to;
      closeSheet();
    },
    [closeSheet],
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const timeout = window.setTimeout(() => {
      if (isPending) {
        blocker.reset();
        return;
      }
      if (isDirty) {
        setDiscardOpen(true);
        return;
      }
      closeSheet();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [blocker, closeSheet, isDirty, isPending]);

  return (
    <Dialog
      open={open}
      mobileProps={{
        dismissible: !isPending,
        onAnimationEnd: (nextOpen) => {
          if (!nextOpen) finishClose();
        },
      }}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestDismiss();
      }}
    >
      <DialogContent
        mobileSize="near-full"
        showCloseButton={false}
        onAnimationEnd={(event) => {
          if (
            event.currentTarget === event.target &&
            event.animationName === "slideToBottom"
          ) {
            finishClose();
          }
        }}
      >
        <DialogHeader className="relative border-b pt-3">
          <DialogTitle>{isEditing ? "編輯交易" : "新增交易"}</DialogTitle>
          <DialogDescription>
            使用引導模式處理常見交易，或用進階模式建立拆分分錄。
          </DialogDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-3"
            aria-label={isEditing ? "關閉編輯交易" : "關閉新增交易"}
            disabled={isPending}
            onClick={requestDismiss}
          >
            <X aria-hidden="true" />
          </Button>
        </DialogHeader>
        <EntryEditorSurface
          presentation="sheet"
          onCancel={requestDismiss}
          onDirtyChange={setIsDirty}
          onNavigate={requestNavigate}
          onPendingChange={setIsPending}
          onSaved={(saved) =>
            requestNavigate({
              pathname: `/entries/${saved.id}`,
              search: location.search,
            })
          }
        />
      </DialogContent>
      <AlertDialog
        open={discardOpen}
        onOpenChange={(nextOpen) => {
          setDiscardOpen(nextOpen);
          if (!nextOpen && blocker.state === "blocked") {
            blocker.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isEditing ? "捨棄未儲存的變更？" : "捨棄這筆交易草稿？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isEditing
                ? "尚未儲存的日期、說明、金額與分錄變更都會遺失。"
                : "尚未儲存的日期、說明、金額與分錄都會遺失。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">繼續編輯</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                setDiscardOpen(false);
                closeSheet();
              }}
            >
              捨棄變更
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
