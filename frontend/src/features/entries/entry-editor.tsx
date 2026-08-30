import { useFieldArray, useForm, Controller, useWatch } from "react-hook-form";
import {
  ArrowLeft,
  ChevronRight,
  CircleAlert,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EntrySummary } from "@/components/entry-list-item";
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
import { Card } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { SwitchField } from "@/components/ui/switch";
import {
  PostingDirectionBadge,
  PostingDirectionText,
  postingDirectionFromAmount,
  postingDirectionOptions,
  type PostingDirection,
} from "@/features/entries/posting-direction";
import { useIsMobile } from "@/hooks/use-mobile";
import { accountTypeLabels, accountTypes } from "@/lib/account";
import { ApiError, entriesApi } from "@/lib/api-client";
import { formatMoney, todayTaipei } from "@/lib/format";
import { possibleDuplicateFieldsSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { invalidateAfterEntryWrite } from "@/lib/query-invalidation";
import type {
  Account,
  EntryWriteRequest,
  EntryResponse,
  PossibleDuplicateFields,
  PostingInput,
} from "@/lib/schemas";

type EntrySubmission = {
  body: EntryWriteRequest;
  confirmedDistinct: boolean;
};

type EditorPosting = {
  accountKey: string;
  direction: PostingDirection;
  amount: number;
  memo: string;
};

type EditorValues = {
  date: string;
  description: string;
  note: string;
  excludedFromBudgets: boolean;
  postings: EditorPosting[];
};

type PostingEditorState =
  | { kind: "existing"; index: number; draft: EditorPosting }
  | { kind: "new"; draft: EditorPosting };

type PostingEditorErrors = {
  accountKey?: string;
  amount?: string;
};

function emptyPosting(direction: PostingDirection): EditorPosting {
  return { accountKey: "", direction, amount: 0, memo: "" };
}

function signedPosting(posting: EditorPosting): PostingInput {
  const numericAmount = Number(posting.amount);
  const absolute = Number.isFinite(numericAmount) ? Math.abs(numericAmount) : 0;
  return {
    account_key: posting.accountKey,
    amount_minor: posting.direction === "debit" ? absolute : -absolute,
    memo: posting.memo.trim() || null,
  };
}

function entryDefaults(entry: EntryResponse): EditorValues {
  return {
    date: entry.date,
    description: entry.description,
    note: entry.note ?? "",
    excludedFromBudgets: entry.excluded_from_budgets,
    postings: entry.postings.map((posting) => ({
      accountKey: posting.account.key,
      direction: postingDirectionFromAmount(posting.amount_minor),
      amount: Math.abs(posting.amount_minor),
      memo: posting.memo ?? "",
    })),
  };
}

function AccountCombobox({
  value,
  onValueChange,
  accounts,
  id,
  placeholder = "選擇帳戶",
  ariaInvalid,
}: {
  value: string;
  onValueChange: (value: string) => void;
  accounts: Account[];
  id?: string;
  placeholder?: string;
  ariaInvalid?: boolean;
}) {
  return (
    <Combobox
      id={id}
      sheetTitle="帳戶"
      value={value || undefined}
      onValueChange={onValueChange}
      placeholder={placeholder}
      aria-invalid={ariaInvalid}
      searchPlaceholder="搜尋帳戶…"
      emptyText="找不到帳戶。"
      groups={accountTypes.map((type) => ({
        label: accountTypeLabels[type],
        options: accounts
          .filter((account) => account.type === type)
          .map((account) => ({
            value: account.key,
            label: `${account.name}${account.archived ? "（已封存）" : ""}`,
            keywords: [account.key, accountTypeLabels[type]],
          })),
      }))}
    />
  );
}

function MobilePostingRow({
  accountName,
  index,
  posting,
  onClick,
}: {
  accountName?: string;
  index: number;
  posting: EditorPosting;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      pressFeedback="surface"
      aria-label={`編輯第 ${index + 1} 筆分錄`}
      className="h-auto w-full justify-start rounded-3xl bg-input/30 p-4 text-left whitespace-normal hover:bg-input/40 dark:hover:bg-input/40"
      onClick={onClick}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <PostingDirectionBadge direction={posting.direction} />
            <span
              className={cn(
                "truncate font-medium",
                !accountName && "text-muted-foreground",
              )}
            >
              {accountName ?? "尚未選擇帳戶"}
            </span>
          </div>
          {posting.memo.trim() ? (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {posting.memo.trim()}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 font-medium tabular-nums">
          {formatMoney(Number.isFinite(posting.amount) ? posting.amount : 0)}
        </span>
        <ChevronRight className="text-muted-foreground" aria-hidden="true" />
      </div>
    </Button>
  );
}

export function EntryEditor({
  accounts,
  entry,
  presentation = "page",
  onCancel,
  onDirtyChange,
  onPendingChange,
  onSaved,
}: {
  accounts: Account[];
  entry?: EntryResponse;
  presentation?: "page" | "sheet";
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (entry: EntryResponse) => void;
}) {
  const { search } = useLocation();
  const navigate = useAppNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [postingEditor, setPostingEditor] = useState<PostingEditorState | null>(
    null,
  );
  const [postingEditorOpen, setPostingEditorOpen] = useState(false);
  const [postingEditorErrors, setPostingEditorErrors] =
    useState<PostingEditorErrors>({});
  const [duplicateReview, setDuplicateReview] = useState<{
    submission: EntrySubmission;
    fields: PossibleDuplicateFields;
  } | null>(null);
  const originalKeys = new Set(
    entry?.postings.map((posting) => posting.account.key) ?? [],
  );
  const selectableAccounts = accounts.filter(
    (account) => !account.archived || originalKeys.has(account.key),
  );
  const defaults = entry
    ? entryDefaults(entry)
    : {
        date: todayTaipei(),
        description: "",
        note: "",
        excludedFromBudgets: false,
        postings: [emptyPosting("debit"), emptyPosting("credit")],
      };

  const form = useForm<EditorValues>({ defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "postings",
  });
  const watchedPostings = useWatch({ control: form.control, name: "postings" });

  const mutation = useMutation({
    mutationFn: ({ body, confirmedDistinct }: EntrySubmission) => {
      return entry
        ? entriesApi.update(entry.id, body)
        : entriesApi.create({
            ...body,
            dedup_key: null,
            confirmed_distinct: confirmedDistinct,
          });
    },
    onSuccess: async (saved) => {
      await invalidateAfterEntryWrite(queryClient);
      toast.success(entry ? "交易已更新" : "交易已建立");
      if (onSaved) {
        onSaved(saved);
      } else {
        navigate(
          { pathname: `/entries/${saved.id}`, search },
          {
            replace: true,
            transitionIntent: entry ? "back" : "forward",
          },
        );
      }
    },
    onError: (error, submission) => {
      if (
        !entry &&
        !submission.confirmedDistinct &&
        error instanceof ApiError &&
        error.problem.code === "possible_duplicate"
      ) {
        const fields = possibleDuplicateFieldsSchema.safeParse(
          error.problem.fields,
        );
        if (fields.success) {
          setDuplicateReview({ submission, fields: fields.data });
          return;
        }
      }
      form.setError("root", { message: error.message });
      toast.error(error.message);
    },
  });

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  useEffect(() => {
    onPendingChange?.(mutation.isPending);
  }, [mutation.isPending, onPendingChange]);

  function openPostingEditor(index: number) {
    const posting = form.getValues(`postings.${index}`);
    setPostingEditor({
      kind: "existing",
      index,
      draft: { ...posting },
    });
    setPostingEditorErrors({});
    setPostingEditorOpen(true);
  }

  function openNewPostingEditor() {
    setPostingEditor({ kind: "new", draft: emptyPosting("debit") });
    setPostingEditorErrors({});
    setPostingEditorOpen(true);
  }

  function closePostingEditor() {
    setPostingEditorOpen(false);
  }

  function updatePostingDraft(patch: Partial<EditorPosting>) {
    setPostingEditor((current) =>
      current
        ? {
            ...current,
            draft: { ...current.draft, ...patch },
          }
        : null,
    );
  }

  function completePostingEditor() {
    if (!postingEditor) return;

    const errors: PostingEditorErrors = {};
    if (!postingEditor.draft.accountKey) {
      errors.accountKey = "請選擇帳戶。";
    }
    if (
      !Number.isSafeInteger(postingEditor.draft.amount) ||
      postingEditor.draft.amount <= 0
    ) {
      errors.amount = "請輸入大於零的整數金額。";
    }
    if (Object.keys(errors).length > 0) {
      setPostingEditorErrors(errors);
      return;
    }

    if (postingEditor.kind === "new") {
      append(postingEditor.draft);
    } else {
      form.setValue(`postings.${postingEditor.index}`, postingEditor.draft, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
    closePostingEditor();
  }

  function removePostingFromEditor() {
    if (postingEditor?.kind !== "existing" || fields.length <= 2) return;
    remove(postingEditor.index);
    closePostingEditor();
  }

  function validateAndSubmit(values: EditorValues) {
    form.clearErrors("root");
    if (!values.date) {
      form.setError("root", { message: "請選擇交易日期。" });
      return;
    }
    if (!values.description.trim()) {
      form.setError("root", { message: "請輸入交易說明。" });
      return;
    }

    if (values.postings.length < 2) {
      form.setError("root", { message: "至少需要兩筆分錄。" });
      return;
    }
    if (
      values.postings.some(
        (posting) =>
          !posting.accountKey ||
          !Number.isSafeInteger(posting.amount) ||
          posting.amount <= 0,
      )
    ) {
      form.setError("root", { message: "每筆分錄都需要帳戶與正整數金額。" });
      return;
    }
    const postings = values.postings.map(signedPosting);
    const total = postings.reduce(
      (sum, posting) => sum + posting.amount_minor,
      0,
    );
    if (!Number.isSafeInteger(total) || total !== 0) {
      form.setError("root", { message: "借方與貸方金額必須完全相等。" });
      return;
    }
    mutation.mutate({
      body: {
        date: values.date,
        description: values.description.trim(),
        note: values.note.trim() || null,
        excluded_from_budgets: values.excludedFromBudgets,
        postings,
      },
      confirmedDistinct: false,
    });
  }

  const signedPostings = (watchedPostings ?? []).map(signedPosting);
  const debitTotal = signedPostings
    .filter((posting) => posting.amount_minor > 0)
    .reduce((sum, posting) => sum + posting.amount_minor, 0);
  const creditTotal = signedPostings
    .filter((posting) => posting.amount_minor < 0)
    .reduce((sum, posting) => sum - posting.amount_minor, 0);
  const imbalance = debitTotal - creditTotal;
  const duplicateEntries =
    duplicateReview?.fields.matches
      .flatMap((match) => match.existing_entries)
      .filter(
        (candidate, index, candidates) =>
          candidates.findIndex((entry) => entry.id === candidate.id) === index,
      ) ?? [];
  const EditorBody = presentation === "sheet" ? DialogBody : "div";
  const EditorFooter = presentation === "sheet" ? DialogFooter : "div";

  return (
    <form
      data-presentation={presentation}
      className={cn(
        presentation === "page" ? "grid gap-5" : "flex min-h-0 flex-1 flex-col",
      )}
      onSubmit={form.handleSubmit(validateAndSubmit)}
    >
      <EditorBody
        data-entry-editor-scroll={presentation === "sheet" ? "" : undefined}
        className={cn(
          presentation === "page"
            ? "contents"
            : "grid auto-rows-max content-start gap-5",
        )}
      >
        {presentation === "page" ? (
          <Button asChild variant="ghost" className="w-fit">
            <AppLink
              to={{
                pathname: entry ? `/entries/${entry.id}` : "/entries",
                search,
              }}
              transitionIntent="back"
            >
              <ArrowLeft aria-hidden="true" />
              {entry ? "返回交易明細" : "返回交易"}
            </AppLink>
          </Button>
        ) : null}

        {presentation === "page" ? (
          <div className="grid gap-1.5">
            <h2 className="font-heading text-xl font-semibold">
              {entry ? "編輯交易" : "新增交易"}
            </h2>
            <p className="text-sm text-muted-foreground">
              輸入交易資料與借貸平衡的分錄。
            </p>
          </div>
        ) : null}

        <FieldGroup className="gap-5">
          <FieldSet className="gap-4">
            <FieldLegend>交易資料</FieldLegend>
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <Field
                data-invalid={Boolean(form.formState.errors.date?.message)}
              >
                <FieldLabel htmlFor="entry-date">交易日期</FieldLabel>
                <Controller
                  control={form.control}
                  name="date"
                  rules={{ required: "請選擇交易日期。" }}
                  render={({ field, fieldState }) => (
                    <DatePicker
                      ref={field.ref}
                      id="entry-date"
                      value={field.value}
                      required
                      pickerTitle="選擇交易日期"
                      aria-invalid={fieldState.invalid}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <FieldError>{form.formState.errors.date?.message}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="entry-description">交易說明</FieldLabel>
                <Input
                  id="entry-description"
                  placeholder="例如：麥當勞早餐"
                  {...form.register("description")}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="entry-note">交易備註</FieldLabel>
              <Textarea
                id="entry-note"
                placeholder="選填，不用在備註中放結構化資料"
                {...form.register("note")}
              />
            </Field>
            <Controller
              control={form.control}
              name="excludedFromBudgets"
              render={({ field }) => (
                <SwitchField
                  id="entry-excluded-from-budgets"
                  label="不將此交易計入任何預算"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </FieldSet>

          <FieldSeparator />

          <FieldSet className="gap-3">
            <FieldLegend>分錄明細</FieldLegend>
            <FieldDescription>
              正數借方與負數貸方會由方向自動轉換；借貸合計必須相等。
            </FieldDescription>
            {isMobile
              ? fields.map((field, index) => {
                  const posting =
                    watchedPostings?.[index] ??
                    form.getValues(`postings.${index}`);
                  const accountName = selectableAccounts.find(
                    (account) => account.key === posting.accountKey,
                  )?.name;
                  return (
                    <MobilePostingRow
                      key={field.id}
                      accountName={accountName}
                      index={index}
                      posting={posting}
                      onClick={() => openPostingEditor(index)}
                    />
                  );
                })
              : fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid gap-3 rounded-3xl bg-input/30 p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-[1fr_8rem_10rem_auto] sm:items-end">
                      <Field>
                        <FieldLabel htmlFor={`posting-account-${index}`}>
                          帳戶
                        </FieldLabel>
                        <Controller
                          control={form.control}
                          name={`postings.${index}.accountKey`}
                          render={({ field: accountField }) => (
                            <AccountCombobox
                              id={`posting-account-${index}`}
                              value={accountField.value}
                              onValueChange={accountField.onChange}
                              accounts={selectableAccounts}
                            />
                          )}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`posting-direction-${index}`}>
                          方向
                        </FieldLabel>
                        <Controller
                          control={form.control}
                          name={`postings.${index}.direction`}
                          render={({ field: directionField }) => (
                            <Combobox
                              id={`posting-direction-${index}`}
                              sheetTitle="方向"
                              value={directionField.value}
                              onValueChange={directionField.onChange}
                              options={postingDirectionOptions}
                              searchPlaceholder="搜尋方向…"
                              emptyText="找不到方向。"
                            />
                          )}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`posting-amount-${index}`}>
                          金額
                        </FieldLabel>
                        <Input
                          id={`posting-amount-${index}`}
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          {...form.register(`postings.${index}.amount`, {
                            valueAsNumber: true,
                          })}
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`移除第 ${index + 1} 筆分錄`}
                        disabled={fields.length <= 2}
                        onClick={() => remove(index)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                    <Field>
                      <FieldLabel htmlFor={`posting-memo-${index}`}>
                        分錄備註
                      </FieldLabel>
                      <Input
                        id={`posting-memo-${index}`}
                        placeholder="選填"
                        {...form.register(`postings.${index}.memo`)}
                      />
                    </Field>
                  </div>
                ))}
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={
                isMobile
                  ? openNewPostingEditor
                  : () => append(emptyPosting("debit"))
              }
            >
              <Plus aria-hidden="true" />
              新增分錄
            </Button>
            <FieldSeparator className="my-0" />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs">
                  <PostingDirectionText direction="debit" suffix="合計" />
                </p>
                <p className="font-medium tabular-nums">
                  {formatMoney(debitTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs">
                  <PostingDirectionText direction="credit" suffix="合計" />
                </p>
                <p className="font-medium tabular-nums">
                  {formatMoney(creditTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">未平衡</p>
                <p
                  className={`font-medium tabular-nums ${
                    imbalance === 0 ? "" : "text-destructive"
                  }`}
                >
                  {formatMoney(imbalance)}
                </p>
              </div>
            </div>
          </FieldSet>

          {form.formState.errors.root?.message ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <CircleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <FieldError>{form.formState.errors.root.message}</FieldError>
            </div>
          ) : null}
        </FieldGroup>
      </EditorBody>

      <EditorFooter
        className={cn(
          presentation === "page"
            ? "sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 flex shrink-0 justify-end gap-2 rounded-4xl bg-popover/95 p-4 shadow-xl ring-1 ring-foreground/5 backdrop-blur md:bottom-4 dark:ring-foreground/10"
            : undefined,
        )}
      >
        {presentation === "page" ? (
          <Button asChild type="button" variant="outline">
            <AppLink
              to={{
                pathname: entry ? `/entries/${entry.id}` : "/entries",
                search,
              }}
              transitionIntent="back"
            >
              取消
            </AppLink>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={onCancel}
          >
            取消
          </Button>
        )}
        <Button type="submit" loading={mutation.isPending}>
          {entry ? "儲存變更" : "建立交易"}
        </Button>
      </EditorFooter>

      {isMobile ? (
        <Sheet
          open={postingEditorOpen}
          onAnimationEnd={(open) => {
            if (!open) {
              setPostingEditor(null);
              setPostingEditorErrors({});
            }
          }}
          onOpenChange={(open) => {
            if (!open) closePostingEditor();
          }}
        >
          <SheetContent closeLabel="關閉分錄編輯">
            <SheetHeader>
              <SheetTitle>
                {postingEditor?.kind === "new"
                  ? "新增分錄"
                  : `編輯第 ${(postingEditor?.index ?? 0) + 1} 筆分錄`}
              </SheetTitle>
              <SheetDescription>
                完成後才會將內容套用到交易草稿。
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="grid auto-rows-max content-start gap-4">
              <Field data-invalid={Boolean(postingEditorErrors.accountKey)}>
                <FieldLabel htmlFor="mobile-posting-account">帳戶</FieldLabel>
                <AccountCombobox
                  id="mobile-posting-account"
                  value={postingEditor?.draft.accountKey ?? ""}
                  onValueChange={(accountKey) => {
                    updatePostingDraft({ accountKey });
                    setPostingEditorErrors((current) => ({
                      ...current,
                      accountKey: undefined,
                    }));
                  }}
                  accounts={selectableAccounts}
                  ariaInvalid={Boolean(postingEditorErrors.accountKey)}
                />
                {postingEditorErrors.accountKey ? (
                  <FieldError>{postingEditorErrors.accountKey}</FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="mobile-posting-direction">方向</FieldLabel>
                <Combobox
                  id="mobile-posting-direction"
                  sheetTitle="方向"
                  value={postingEditor?.draft.direction}
                  onValueChange={(direction) =>
                    updatePostingDraft({
                      direction: direction as PostingDirection,
                    })
                  }
                  options={postingDirectionOptions}
                  searchPlaceholder="搜尋方向…"
                  emptyText="找不到方向。"
                />
              </Field>
              <Field data-invalid={Boolean(postingEditorErrors.amount)}>
                <FieldLabel htmlFor="mobile-posting-amount">金額</FieldLabel>
                <Input
                  id="mobile-posting-amount"
                  aria-invalid={Boolean(postingEditorErrors.amount)}
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={postingEditor?.draft.amount || ""}
                  onChange={(event) => {
                    updatePostingDraft({ amount: Number(event.target.value) });
                    setPostingEditorErrors((current) => ({
                      ...current,
                      amount: undefined,
                    }));
                  }}
                />
                {postingEditorErrors.amount ? (
                  <FieldError>{postingEditorErrors.amount}</FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="mobile-posting-memo">分錄備註</FieldLabel>
                <Input
                  id="mobile-posting-memo"
                  placeholder="選填"
                  value={postingEditor?.draft.memo ?? ""}
                  onChange={(event) =>
                    updatePostingDraft({ memo: event.target.value })
                  }
                />
              </Field>
            </SheetBody>
            <SheetFooter>
              {postingEditor?.kind === "existing" ? (
                <Button
                  type="button"
                  variant="destructive"
                  aria-label={`移除第 ${postingEditor.index + 1} 筆分錄`}
                  disabled={fields.length <= 2}
                  onClick={removePostingFromEditor}
                >
                  <Trash2 aria-hidden="true" />
                  移除分錄
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={closePostingEditor}
              >
                取消
              </Button>
              <Button type="button" onClick={completePostingEditor}>
                完成
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : null}

      <AlertDialog
        open={duplicateReview !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDuplicateReview(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>可能重複的交易</AlertDialogTitle>
            <AlertDialogDescription>
              已找到日期、帳戶與金額相同的交易。請確認這是否為另一筆交易。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid max-h-72 gap-2 overflow-y-auto">
            {duplicateEntries.map((candidate) => (
              <Card key={candidate.id}>
                <EntrySummary entry={candidate} />
              </Card>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={mutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={!duplicateReview}
              loading={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (duplicateReview) {
                  form.clearErrors("root");
                  mutation.mutate({
                    ...duplicateReview.submission,
                    confirmedDistinct: true,
                  });
                }
              }}
            >
              仍要建立
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
