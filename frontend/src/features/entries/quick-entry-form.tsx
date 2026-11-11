import { type FieldErrors, useForm, useWatch } from "react-hook-form";
import { useEffect, useRef } from "react";
import type { To } from "react-router-dom";

import { AppLink } from "@/components/navigation-transition";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { signedPosting } from "@/features/entries/entry-draft";
import type { EntryEditorPresentation } from "@/features/entries/entry-editor";
import { useEntrySubmission } from "@/features/entries/entry-submission";
import {
  quickEntryCategoryTypes,
  quickEntryDescription,
  quickEntryFundingTypes,
  quickToEditorValues,
  type QuickEntryKind,
  type QuickEntryValues,
} from "@/features/entries/quick-entry";
import { accountTypeLabels } from "@/lib/account";
import type { Account, AccountType, EntryResponse } from "@/lib/schemas";

export const quickEntryKinds: QuickEntryKind[] = ["expense", "income"];

export type QuickEntryFieldOrder = readonly (readonly [
  keyof QuickEntryValues,
  string,
])[];

/** Focuses the first invalid field, in the order the layout renders them. */
export function focusFirstInvalidField(
  errors: FieldErrors<QuickEntryValues>,
  order: QuickEntryFieldOrder,
) {
  const invalid = order.find(([name]) => errors[name]);
  if (!invalid) return;
  const element = document.getElementById(invalid[1]);
  const target =
    element instanceof HTMLInputElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLOutputElement
      ? element
      : element?.querySelector<HTMLElement>("button");
  target?.focus();
  target?.scrollIntoView?.({ block: "nearest" });
}

export const quickEntryFundingLabels: Record<QuickEntryKind, string> = {
  expense: "付款帳戶",
  income: "入帳帳戶",
};

function typeListLabel(types: AccountType[]) {
  return types.map((type) => accountTypeLabels[type]).join("或");
}

export function MissingAccounts({
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

export type QuickEntryEditorProps = {
  accounts: Account[];
  /** Initial values carried over from the full editor. */
  draft?: QuickEntryValues;
  presentation?: EntryEditorPresentation;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onNavigate?: (to: To) => void;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (entry: EntryResponse) => void;
  /**
   * Reports the draft. `defaultFundingKey` names an account the editor filled
   * in by itself, which alone does not make the draft worth keeping.
   */
  onValuesChange?: (
    values: QuickEntryValues,
    defaultFundingKey?: string,
  ) => void;
};

/**
 * The form state, eligible accounts and submission shared by the desktop and
 * phone layouts, so both validate and save a quick entry the same way.
 */
export function useQuickEntryForm({
  accounts,
  defaults,
  descriptionFallback = false,
  onDirtyChange,
  onPendingChange,
  onSaved,
  onSavedValues,
}: {
  accounts: Account[];
  defaults: QuickEntryValues;
  /** Saves the category name when the description is left blank. */
  descriptionFallback?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (entry: EntryResponse) => void;
  /** Receives the values of each successfully saved entry. */
  onSavedValues?: (values: QuickEntryValues) => void;
}) {
  const form = useForm<QuickEntryValues>({
    defaultValues: defaults,
    shouldFocusError: false,
  });
  const kind = useWatch({ control: form.control, name: "kind" });

  const activeAccounts = accounts.filter((account) => !account.archived);
  const categoryTypes = quickEntryCategoryTypes[kind];
  const categoryAccounts = activeAccounts.filter((account) =>
    categoryTypes.includes(account.type),
  );
  const fundingAccounts = activeAccounts.filter((account) =>
    quickEntryFundingTypes.includes(account.type),
  );

  const submitted = useRef<QuickEntryValues | null>(null);
  const submission = useEntrySubmission({
    onError: (message) => form.setError("root", { message }),
    onPendingChange,
    onSaved,
    onSuccess: () => {
      if (submitted.current) onSavedValues?.(submitted.current);
    },
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
    submitted.current = values;
    submission.submit({
      date: values.date,
      description: descriptionFallback
        ? quickEntryDescription(values, categoryAccounts)
        : values.description.trim(),
      note: values.note.trim() || null,
      excluded_from_budgets: values.excludedFromBudgets,
      postings: editorValues.postings.map(signedPosting),
    });
  }

  return {
    form,
    kind,
    categoryTypes,
    categoryAccounts,
    fundingAccounts,
    submission,
    submit,
  };
}
