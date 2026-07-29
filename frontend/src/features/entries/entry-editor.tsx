import { useFieldArray, useForm, Controller, useWatch } from "react-hook-form";
import { ArrowLeft, CircleAlert, Plus, Trash2 } from "lucide-react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type Direction = "debit" | "credit";
type EntrySubmission = {
  body: EntryWriteRequest;
  confirmedDistinct: boolean;
};

type EditorPosting = {
  accountKey: string;
  direction: Direction;
  amount: number;
  memo: string;
};

type EditorValues = {
  date: string;
  description: string;
  note: string;
  postings: EditorPosting[];
};

function emptyPosting(direction: Direction): EditorPosting {
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
    postings: entry.postings.map((posting) => ({
      accountKey: posting.account.key,
      direction:
        posting.amount_minor > 0 ? ("debit" as const) : ("credit" as const),
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
}: {
  value: string;
  onValueChange: (value: string) => void;
  accounts: Account[];
  id?: string;
  placeholder?: string;
}) {
  return (
    <Combobox
      id={id}
      value={value || undefined}
      onValueChange={onValueChange}
      placeholder={placeholder}
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

        <Card>
          {presentation === "page" ? (
            <CardHeader>
              <CardTitle>{entry ? "編輯交易" : "新增交易"}</CardTitle>
              <CardDescription>輸入交易資料與借貸平衡的分錄。</CardDescription>
            </CardHeader>
          ) : null}
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <Field>
                <FieldLabel htmlFor="entry-date">交易日期</FieldLabel>
                <Input id="entry-date" type="date" {...form.register("date")} />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>分錄明細</CardTitle>
            <CardDescription>
              正數借方與負數貸方會由方向自動轉換；借貸合計必須相等。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-lg border p-3">
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
                          value={directionField.value}
                          onValueChange={directionField.onChange}
                          options={[
                            { value: "debit", label: "借方" },
                            { value: "credit", label: "貸方" },
                          ]}
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
              onClick={() => append(emptyPosting("debit"))}
            >
              <Plus aria-hidden="true" />
              新增分錄
            </Button>
          </CardContent>
          <CardFooter className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">借方合計</p>
              <p className="font-medium tabular-nums">
                {formatMoney(debitTotal)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">貸方合計</p>
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
          </CardFooter>
        </Card>

        {form.formState.errors.root?.message ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <CircleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <FieldError>{form.formState.errors.root.message}</FieldError>
          </div>
        ) : null}
      </EditorBody>

      <EditorFooter
        className={cn(
          presentation === "page"
            ? "sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 flex shrink-0 justify-end gap-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur md:bottom-4"
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
