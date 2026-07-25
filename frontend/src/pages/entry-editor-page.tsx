import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  type Location,
  type To,
  Link,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";

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
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { EntryEditor } from "@/features/entries/entry-editor";
import { accountsApi, entriesApi } from "@/lib/api-client";
import { getEntryCreateBackground } from "@/lib/entry-navigation";
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
          <Link to="/accounts">前往帳戶管理</Link>
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
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const allowNavigation = useRef(false);
  const finalized = useRef(false);
  const pendingDestination = useRef<To | null>(null);
  const hasHistoryBackground = Boolean(
    getEntryCreateBackground(location.state),
  );
  const blocker = useBlocker(() => !allowNavigation.current);

  const finishClose = useCallback(() => {
    if (finalized.current) return;
    finalized.current = true;
    allowNavigation.current = true;

    if (blocker.state === "blocked") {
      blocker.proceed();
      return;
    }
    if (pendingDestination.current) {
      navigate(pendingDestination.current, { replace: true });
      return;
    }
    if (hasHistoryBackground) {
      navigate(-1);
      return;
    }
    navigate(
      {
        pathname: backgroundLocation.pathname,
        search: backgroundLocation.search,
        hash: backgroundLocation.hash,
      },
      { replace: true },
    );
  }, [backgroundLocation, blocker, hasHistoryBackground, navigate]);

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
    <>
      <Drawer
        open={open}
        dismissible={!isPending}
        fixed
        handleOnly
        preventScrollRestoration
        shouldScaleBackground
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestDismiss();
        }}
        onAnimationEnd={(nextOpen) => {
          if (!nextOpen) finishClose();
        }}
      >
        <DrawerContent
          size="near-full"
          onAnimationEnd={(event) => {
            if (
              event.currentTarget === event.target &&
              event.animationName === "slideToBottom"
            ) {
              finishClose();
            }
          }}
        >
          <DrawerHeader className="relative shrink-0 border-b px-12 pt-3 text-center">
            <DrawerTitle>新增交易</DrawerTitle>
            <DrawerDescription>
              使用引導模式處理常見交易，或用進階模式建立拆分分錄。
            </DrawerDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-3"
              aria-label="關閉新增交易"
              disabled={isPending}
              onClick={requestDismiss}
            >
              <X aria-hidden="true" />
            </Button>
          </DrawerHeader>
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
        </DrawerContent>
      </Drawer>

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
            <AlertDialogTitle>捨棄這筆交易草稿？</AlertDialogTitle>
            <AlertDialogDescription>
              尚未儲存的日期、說明、金額與分錄都會遺失。
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
    </>
  );
}
