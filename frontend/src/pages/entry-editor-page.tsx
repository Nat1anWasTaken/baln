import { useQuery } from "@tanstack/react-query";
import {
  type Location,
  type To,
  useBlocker,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, m } from "motion/react";

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
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldDescription } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type EditorValues,
  isBlankEditorValues,
} from "@/features/entries/entry-draft";
import {
  EntryEditor,
  EntryEditorPageHeader,
  type EntryEditorPresentation,
} from "@/features/entries/entry-editor";
import { QuickEntryEditor } from "@/features/entries/quick-entry-editor";
import {
  editorToQuickValues,
  isBlankQuickEntryValues,
  quickToEditorValues,
  type QuickEntryKind,
  type QuickEntryValues,
} from "@/features/entries/quick-entry";
import {
  type EntryCreateMode,
  useEntryCreateMode,
} from "@/hooks/use-entry-create-mode";
import { accountsApi, entriesApi } from "@/lib/api-client";
import { getEntryEditorBackground } from "@/lib/entry-navigation";
import { directionalSwapVariants, motionSpring } from "@/lib/motion";
import type { NavigationDirection } from "@/lib/navigation-transition";
import { queryKeys } from "@/lib/query-keys";
import type { Account, EntryResponse } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type EditorCallbacks = {
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onNavigate?: (to: To) => void;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (entry: EntryResponse) => void;
};

type EntryEditorSurfaceProps = EditorCallbacks & {
  presentation: EntryEditorPresentation;
  createMode: EntryCreateMode;
  onCreateModeChange: (mode: EntryCreateMode) => void;
};

const createModeDescriptions: Record<EntryCreateMode, string> = {
  quick: "記錄支出或收入，分錄會自動產生。",
  full: "輸入交易資料與借貸平衡的分錄。",
};

export function entryEditorDescription(
  isEditing: boolean,
  mode: EntryCreateMode,
) {
  return isEditing ? createModeDescriptions.full : createModeDescriptions[mode];
}

/**
 * Swaps editors in place: the previous mode leaves immediately so only one
 * form (and one footer) exists, and the next mode slides in from its side.
 */
function CreateModePanel({
  mode,
  direction,
  presentation,
  children,
}: {
  mode: EntryCreateMode;
  direction: NavigationDirection;
  presentation: EntryEditorPresentation;
  children: ReactNode;
}) {
  return (
    <m.div
      data-entry-create-mode={mode}
      custom={direction}
      variants={directionalSwapVariants}
      initial="initial"
      animate="animate"
      transition={motionSpring.navigation}
      className={cn(presentation === "sheet" && "flex min-h-0 flex-1 flex-col")}
    >
      {children}
    </m.div>
  );
}

type CarriedDraft =
  | { mode: "quick"; values: QuickEntryValues; blank?: boolean }
  | { mode: "full"; values: EditorValues };

function EntryCreateModes({
  accounts,
  presentation,
  mode,
  onModeChange,
  onCancel,
  onDirtyChange,
  onNavigate,
  onPendingChange,
  onSaved,
}: EditorCallbacks & {
  accounts: Account[];
  presentation: EntryEditorPresentation;
  mode: EntryCreateMode;
  onModeChange: (mode: EntryCreateMode) => void;
}) {
  const [carried, setCarried] = useState<CarriedDraft | null>(null);
  const [direction, setDirection] = useState<NavigationDirection>("none");
  const [quickAvailable, setQuickAvailable] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const valuesRef = useRef<CarriedDraft | null>(null);
  const lastQuickKind = useRef<QuickEntryKind>("expense");

  // Dirty state follows the draft itself rather than each editor's own
  // baseline, so values carried between modes still count as unsaved.
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleQuickValues = useCallback(
    (values: QuickEntryValues, defaultFundingKey?: string) => {
      const blank = isBlankQuickEntryValues(values, defaultFundingKey);
      valuesRef.current = { mode: "quick", values, blank };
      lastQuickKind.current = values.kind;
      setIsDirty(!blank);
      setQuickAvailable(true);
    },
    [],
  );
  const handleFullValues = useCallback(
    (values: EditorValues) => {
      valuesRef.current = { mode: "full", values };
      setIsDirty(!isBlankEditorValues(values));
      setQuickAvailable(
        editorToQuickValues(values, accounts, lastQuickKind.current) !== null,
      );
    },
    [accounts],
  );
  const handlePendingChange = useCallback(
    (pending: boolean) => {
      setIsPending(pending);
      onPendingChange?.(pending);
    },
    [onPendingChange],
  );

  function changeMode(nextMode: EntryCreateMode) {
    if (nextMode === mode || isPending) return;
    const current = valuesRef.current;
    if (nextMode === "full") {
      // A blank quick draft starts the full editor blank too, so an account
      // the quick editor only filled in by itself is not carried as input.
      setCarried(
        current?.mode === "quick" && !current.blank
          ? { mode: "full", values: quickToEditorValues(current.values) }
          : null,
      );
    } else {
      const quickValues =
        current?.mode === "full"
          ? editorToQuickValues(current.values, accounts, lastQuickKind.current)
          : null;
      if (current?.mode === "full" && !quickValues) return;
      setCarried(quickValues ? { mode: "quick", values: quickValues } : null);
    }
    setDirection(nextMode === "full" ? "forward" : "back");
    onModeChange(nextMode);
  }

  const callbacks = {
    onCancel,
    onPendingChange: handlePendingChange,
    onSaved,
  };
  const editor =
    mode === "quick" ? (
      <QuickEntryEditor
        accounts={accounts}
        draft={carried?.mode === "quick" ? carried.values : undefined}
        presentation={presentation}
        onNavigate={onNavigate}
        onValuesChange={handleQuickValues}
        {...callbacks}
      />
    ) : (
      <EntryEditor
        accounts={accounts}
        draft={carried?.mode === "full" ? carried.values : undefined}
        presentation={presentation}
        showPageHeader={false}
        onValuesChange={handleFullValues}
        {...callbacks}
      />
    );

  return (
    <div
      className={cn(
        presentation === "page" ? "grid gap-5" : "flex min-h-0 flex-1 flex-col",
      )}
    >
      {presentation === "page" ? (
        <EntryEditorPageHeader description={createModeDescriptions[mode]} />
      ) : null}
      <div
        className={cn(
          "grid gap-2",
          presentation === "sheet" && "shrink-0 px-6 pb-1",
        )}
      >
        <Tabs
          value={mode}
          onValueChange={(nextMode) => changeMode(nextMode as EntryCreateMode)}
        >
          <TabsList
            aria-label="新增方式"
            className="grid w-full grid-cols-2 sm:w-64"
          >
            <TabsTrigger
              value="quick"
              disabled={isPending || (mode === "full" && !quickAvailable)}
            >
              簡易
            </TabsTrigger>
            <TabsTrigger value="full" disabled={isPending}>
              完整
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "full" && !quickAvailable ? (
          <FieldDescription>
            目前的分錄無法以簡易模式表示，請在完整模式中完成。
          </FieldDescription>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        <CreateModePanel
          key={mode}
          mode={mode}
          direction={direction}
          presentation={presentation}
        >
          {editor}
        </CreateModePanel>
      </AnimatePresence>
    </div>
  );
}

function EntryEditorSurface({
  presentation,
  createMode,
  onCreateModeChange,
  onCancel,
  onDirtyChange,
  onNavigate,
  onPendingChange,
  onSaved,
}: EntryEditorSurfaceProps) {
  const { entryId } = useParams();
  const isEditing = Boolean(entryId);
  const accounts = useQuery({
    queryKey: queryKeys.accounts.list(true, ""),
    queryFn: () => accountsApi.list(true),
  });
  const entry = useQuery({
    queryKey: queryKeys.entries.detail(entryId ?? ""),
    queryFn: () => entriesApi.get(entryId!),
    enabled: isEditing,
  });
  const stateClassName =
    presentation === "sheet" ? "grid content-start" : undefined;
  const StateContainer = presentation === "sheet" ? DialogBody : "div";

  if (accounts.isPending || (isEditing && entry.isPending)) {
    return (
      <StateContainer
        data-entry-editor-scroll={presentation === "sheet" ? "" : undefined}
        className={stateClassName}
      >
        <PageLoading rows={5} />
      </StateContainer>
    );
  }
  if (accounts.isError) {
    return (
      <StateContainer
        data-entry-editor-scroll={presentation === "sheet" ? "" : undefined}
        className={stateClassName}
      >
        <ErrorState
          message={accounts.error.message}
          onRetry={() => void accounts.refetch()}
        />
      </StateContainer>
    );
  }
  if (entry.isError) {
    return (
      <StateContainer
        data-entry-editor-scroll={presentation === "sheet" ? "" : undefined}
        className={stateClassName}
      >
        <ErrorState
          message={entry.error.message}
          onRetry={() => void entry.refetch()}
        />
      </StateContainer>
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
      <StateContainer
        data-entry-editor-scroll={presentation === "sheet" ? "" : undefined}
        className={stateClassName}
      >
        <EmptyState
          title="請先建立帳戶"
          description="至少需要可用的帳戶才能建立交易。"
          action={action}
        />
      </StateContainer>
    );
  }

  if (!isEditing) {
    return (
      <EntryCreateModes
        accounts={accounts.data}
        presentation={presentation}
        mode={createMode}
        onModeChange={onCreateModeChange}
        onCancel={onCancel}
        onDirtyChange={onDirtyChange}
        onNavigate={onNavigate}
        onPendingChange={onPendingChange}
        onSaved={onSaved}
      />
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
  const { entryCreateMode, setEntryCreateMode } = useEntryCreateMode();
  return (
    <EntryEditorSurface
      presentation="page"
      createMode={entryCreateMode}
      onCreateModeChange={setEntryCreateMode}
    />
  );
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
  const { entryCreateMode, setEntryCreateMode } = useEntryCreateMode();
  const [open, setOpen] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const allowNavigation = useRef(false);
  const closeApproved = useRef(false);
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
    closeApproved.current = true;
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

  // Leaving from inside the editor (not after a save) must not drop a draft.
  const requestLeave = useCallback(
    (to: To) => {
      if (isPending) return;
      pendingDestination.current = to;
      if (isDirty) {
        setDiscardOpen(true);
        return;
      }
      closeSheet();
    },
    [closeSheet, isDirty, isPending],
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
          if (!nextOpen && closeApproved.current) finishClose();
        },
      }}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestDismiss();
      }}
    >
      <DialogContent
        closeLabel={isEditing ? "關閉編輯交易" : "關閉新增交易"}
        initialFocus="content"
        mobileSize="near-full"
      >
        <DialogHeader>
          <DialogTitle>{isEditing ? "編輯交易" : "新增交易"}</DialogTitle>
          <DialogDescription>
            {entryEditorDescription(isEditing, entryCreateMode)}
          </DialogDescription>
        </DialogHeader>
        <EntryEditorSurface
          presentation="sheet"
          createMode={entryCreateMode}
          onCreateModeChange={setEntryCreateMode}
          onCancel={requestDismiss}
          onDirtyChange={setIsDirty}
          onNavigate={requestLeave}
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
          if (!nextOpen) pendingDestination.current = null;
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
