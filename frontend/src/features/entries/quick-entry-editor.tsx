import {
  Controller,
  type FieldErrors,
  useForm,
  useWatch,
} from "react-hook-form";
import { useEffect, useState } from "react";
import { type To, useLocation } from "react-router-dom";

import { AppLink } from "@/components/navigation-transition";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { SwitchField } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AccountPills } from "@/features/entries/account-pills";
import { signedPosting } from "@/features/entries/entry-draft";
import {
  entryEditorPageFooterClassName,
  EntryEditorRootError,
  useEditorValuesSync,
  type EntryEditorPresentation,
} from "@/features/entries/entry-editor";
import {
  DuplicateEntryDialog,
  useEntrySubmission,
} from "@/features/entries/entry-submission";
import {
  blankQuickEntryValues,
  quickEntryCategoryTypes,
  quickEntryFundingTypes,
  quickEntryKindLabels,
  quickToEditorValues,
  type QuickEntryKind,
  type QuickEntryValues,
} from "@/features/entries/quick-entry";
import { accountTypeLabels } from "@/lib/account";
import { cn } from "@/lib/utils";
import type { Account, AccountType, EntryResponse } from "@/lib/schemas";

const quickEntryKinds: QuickEntryKind[] = ["expense", "income"];

/** Field order as rendered, so validation focuses the first visible error. */
const quickEntryFieldOrder = [
  ["amount", "quick-entry-amount"],
  ["description", "quick-entry-description"],
  ["categoryKey", "quick-entry-category"],
  ["fundingKey", "quick-entry-funding"],
  ["date", "quick-entry-date"],
] as const;

function focusFirstInvalidField(errors: FieldErrors<QuickEntryValues>) {
  const invalid = quickEntryFieldOrder.find(([name]) => errors[name]);
  if (!invalid) return;
  const element = document.getElementById(invalid[1]);
  const target =
    element instanceof HTMLInputElement || element instanceof HTMLButtonElement
      ? element
      : element?.querySelector<HTMLElement>("button");
  target?.focus();
}

const fundingLabels: Record<QuickEntryKind, string> = {
  expense: "付款帳戶",
  income: "入帳帳戶",
};

function typeListLabel(types: AccountType[]) {
  return types.map((type) => accountTypeLabels[type]).join("或");
}

function MissingAccounts({
  types,
  presentation,
  onNavigate,
}: {
  types: AccountType[];
  presentation: EntryEditorPresentation;
  onNavigate?: (to: To) => void;
}) {
  return (
    <div className="grid justify-items-start gap-3 rounded-3xl bg-input/30 p-4">
      <FieldDescription>
        尚未建立可用的{typeListLabel(types)}帳戶，請先新增帳戶或改用完整模式。
      </FieldDescription>
      {presentation === "sheet" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onNavigate?.("/accounts")}
        >
          前往帳戶管理
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <AppLink to="/accounts">前往帳戶管理</AppLink>
        </Button>
      )}
    </div>
  );
}

export function QuickEntryEditor({
  accounts,
  draft,
  presentation = "page",
  onCancel,
  onDirtyChange,
  onNavigate,
  onPendingChange,
  onSaved,
  onValuesChange,
}: {
  accounts: Account[];
  /** Initial values carried over from the full editor. */
  draft?: QuickEntryValues;
  presentation?: EntryEditorPresentation;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onNavigate?: (to: To) => void;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (entry: EntryResponse) => void;
  onValuesChange?: (values: QuickEntryValues) => void;
}) {
  const { search } = useLocation();
  const [defaults] = useState(() => draft ?? blankQuickEntryValues());
  const form = useForm<QuickEntryValues>({
    defaultValues: defaults,
    shouldFocusError: false,
  });
  useEditorValuesSync({ form, onValuesChange });
  const kind = useWatch({ control: form.control, name: "kind" });

  const activeAccounts = accounts.filter((account) => !account.archived);
  const categoryTypes = quickEntryCategoryTypes[kind];
  const categoryAccounts = activeAccounts.filter((account) =>
    categoryTypes.includes(account.type),
  );
  const fundingAccounts = activeAccounts.filter((account) =>
    quickEntryFundingTypes.includes(account.type),
  );

  const submission = useEntrySubmission({
    onError: (message) => form.setError("root", { message }),
    onPendingChange,
    onSaved,
  });

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  function submit(values: QuickEntryValues) {
    form.clearErrors("root");
    // Only keys the pills can show count as selected: an unmounted field
    // (no eligible accounts) or a carried-over key that is no longer
    // eligible, such as an archived account, must not reach the API.
    const missingAccounts = (
      [
        ["categoryKey", "請選擇分類。", categoryAccounts],
        ["fundingKey", "請選擇帳戶。", fundingAccounts],
      ] as const
    ).filter(
      ([name, , eligible]) =>
        !eligible.some((account) => account.key === values[name]),
    );
    if (missingAccounts.length > 0) {
      for (const [name, message] of missingAccounts) {
        form.setError(name, { message });
      }
      return;
    }
    const editorValues = quickToEditorValues(values);
    submission.submit({
      date: values.date,
      description: values.description.trim(),
      note: values.note.trim() || null,
      excluded_from_budgets: values.excludedFromBudgets,
      postings: editorValues.postings.map(signedPosting),
    });
  }

  const errors = form.formState.errors;
  const EditorBody = presentation === "sheet" ? DialogBody : "div";
  const EditorFooter = presentation === "sheet" ? DialogFooter : "div";

  return (
    <form
      data-presentation={presentation}
      className={cn(
        presentation === "page" ? "grid gap-5" : "flex min-h-0 flex-1 flex-col",
      )}
      onSubmit={form.handleSubmit(submit, focusFirstInvalidField)}
    >
      <EditorBody
        data-entry-editor-scroll={presentation === "sheet" ? "" : undefined}
        className={cn(
          presentation === "page"
            ? "contents"
            : "grid auto-rows-max content-start gap-5",
        )}
      >
        <FieldGroup className="gap-5">
          <FieldSet className="gap-4">
            <FieldLegend>交易資料</FieldLegend>
            <Field>
              <FieldLabel htmlFor="quick-entry-kind">類型</FieldLabel>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <ToggleGroup
                    id="quick-entry-kind"
                    type="single"
                    variant="pill"
                    aria-label="類型"
                    value={field.value}
                    onValueChange={(nextKind) => {
                      if (!nextKind || nextKind === field.value) return;
                      field.onChange(nextKind);
                      form.setValue("categoryKey", "", { shouldDirty: true });
                      form.clearErrors("categoryKey");
                    }}
                    className="flex w-full flex-wrap justify-start gap-2"
                  >
                    {quickEntryKinds.map((option) => (
                      <ToggleGroupItem key={option} value={option}>
                        {quickEntryKindLabels[option]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <Field data-invalid={Boolean(errors.amount?.message)}>
                <FieldLabel htmlFor="quick-entry-amount">金額</FieldLabel>
                <Controller
                  control={form.control}
                  name="amount"
                  rules={{
                    validate: (amount) =>
                      (Number.isSafeInteger(amount) && amount > 0) ||
                      "請輸入大於零的整數金額。",
                  }}
                  render={({ field, fieldState }) => (
                    <Input
                      ref={field.ref}
                      id="quick-entry-amount"
                      name={field.name}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      placeholder="0"
                      aria-invalid={fieldState.invalid}
                      value={field.value || ""}
                      onBlur={field.onBlur}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === ""
                            ? 0
                            : event.target.valueAsNumber,
                        )
                      }
                    />
                  )}
                />
                <FieldError>{errors.amount?.message}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.description?.message)}>
                <FieldLabel htmlFor="quick-entry-description">
                  交易說明
                </FieldLabel>
                <Input
                  id="quick-entry-description"
                  placeholder="例如：麥當勞早餐"
                  aria-invalid={Boolean(errors.description?.message)}
                  {...form.register("description", {
                    validate: (description) =>
                      Boolean(description.trim()) || "請輸入交易說明。",
                  })}
                />
                <FieldError>{errors.description?.message}</FieldError>
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.categoryKey?.message)}>
              <FieldLabel htmlFor="quick-entry-category">分類</FieldLabel>
              {categoryAccounts.length > 0 ? (
                <Controller
                  control={form.control}
                  name="categoryKey"
                  rules={{ required: "請選擇分類。" }}
                  render={({ field }) => (
                    <AccountPills
                      id="quick-entry-category"
                      accounts={categoryAccounts}
                      label={`${quickEntryKindLabels[kind]}分類`}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              ) : (
                <MissingAccounts
                  types={categoryTypes}
                  presentation={presentation}
                  onNavigate={onNavigate}
                />
              )}
              <FieldError>{errors.categoryKey?.message}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.fundingKey?.message)}>
              <FieldLabel htmlFor="quick-entry-funding">
                {fundingLabels[kind]}
              </FieldLabel>
              {fundingAccounts.length > 0 ? (
                <Controller
                  control={form.control}
                  name="fundingKey"
                  rules={{ required: "請選擇帳戶。" }}
                  render={({ field }) => (
                    <AccountPills
                      id="quick-entry-funding"
                      accounts={fundingAccounts}
                      label={fundingLabels[kind]}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              ) : (
                <MissingAccounts
                  types={quickEntryFundingTypes}
                  presentation={presentation}
                  onNavigate={onNavigate}
                />
              )}
              <FieldError>{errors.fundingKey?.message}</FieldError>
            </Field>
          </FieldSet>

          <FieldSeparator />

          <FieldSet className="gap-4">
            <FieldLegend>其他</FieldLegend>
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <Field data-invalid={Boolean(errors.date?.message)}>
                <FieldLabel htmlFor="quick-entry-date">交易日期</FieldLabel>
                <Controller
                  control={form.control}
                  name="date"
                  rules={{ required: "請選擇交易日期。" }}
                  render={({ field, fieldState }) => (
                    <DatePicker
                      ref={field.ref}
                      id="quick-entry-date"
                      value={field.value}
                      required
                      pickerTitle="選擇交易日期"
                      aria-invalid={fieldState.invalid}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <FieldError>{errors.date?.message}</FieldError>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="quick-entry-note">交易備註</FieldLabel>
              <Textarea
                id="quick-entry-note"
                placeholder="選填"
                {...form.register("note")}
              />
            </Field>
            <Controller
              control={form.control}
              name="excludedFromBudgets"
              render={({ field }) => (
                <SwitchField
                  id="quick-entry-excluded-from-budgets"
                  label="不將此交易計入任何預算"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </FieldSet>

          <EntryEditorRootError message={errors.root?.message} />
        </FieldGroup>
      </EditorBody>

      <EditorFooter
        className={cn(
          presentation === "page" ? entryEditorPageFooterClassName : undefined,
        )}
      >
        {presentation === "page" ? (
          <Button asChild type="button" variant="outline">
            <AppLink
              to={{ pathname: "/entries", search }}
              transitionIntent="back"
            >
              取消
            </AppLink>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={submission.isPending}
            onClick={onCancel}
          >
            取消
          </Button>
        )}
        <Button type="submit" loading={submission.isPending}>
          建立交易
        </Button>
      </EditorFooter>

      <DuplicateEntryDialog
        {...submission.duplicateDialogProps}
        onBeforeConfirm={() => form.clearErrors("root")}
      />
    </form>
  );
}
