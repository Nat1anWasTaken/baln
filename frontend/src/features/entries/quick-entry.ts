import {
  type EditorPosting,
  type EditorValues,
  normalizedAmount,
} from "@/features/entries/entry-draft";
import { todayTaipei } from "@/lib/format";
import type { Account, AccountType } from "@/lib/schemas";

export type QuickEntryKind = "expense" | "income";

export type QuickEntryValues = {
  kind: QuickEntryKind;
  date: string;
  description: string;
  note: string;
  excludedFromBudgets: boolean;
  amount: number;
  /** The expense or income account that classifies the entry. */
  categoryKey: string;
  /** The asset or liability account that pays or receives the money. */
  fundingKey: string;
};

export const quickEntryKindLabels: Record<QuickEntryKind, string> = {
  expense: "支出",
  income: "收入",
};

export const quickEntryCategoryTypes: Record<QuickEntryKind, AccountType[]> = {
  expense: ["expense"],
  income: ["income"],
};

export const quickEntryFundingTypes: AccountType[] = ["asset", "liability"];

export function blankQuickEntryValues(
  kind: QuickEntryKind = "expense",
): QuickEntryValues {
  return {
    kind,
    date: todayTaipei(),
    description: "",
    note: "",
    excludedFromBudgets: false,
    amount: 0,
    categoryKey: "",
    fundingKey: "",
  };
}

/** Whether a quick draft still holds nothing worth confirming a discard. */
export function isBlankQuickEntryValues(values: QuickEntryValues) {
  return (
    values.date === todayTaipei() &&
    values.description === "" &&
    values.note === "" &&
    !values.excludedFromBudgets &&
    normalizedAmount(values.amount) === 0 &&
    !values.categoryKey &&
    !values.fundingKey
  );
}

/**
 * Expands a quick entry into the balanced two-posting draft used by the full
 * editor. Unfilled fields stay blank so the full editor can finish them.
 */
export function quickToEditorValues(values: QuickEntryValues): EditorValues {
  const amount = normalizedAmount(values.amount);
  const category: EditorPosting = {
    accountKey: values.categoryKey,
    direction: values.kind === "expense" ? "debit" : "credit",
    amount,
    memo: "",
  };
  const funding: EditorPosting = {
    accountKey: values.fundingKey,
    direction: values.kind === "expense" ? "credit" : "debit",
    amount,
    memo: "",
  };

  return {
    date: values.date,
    description: values.description,
    note: values.note,
    excludedFromBudgets: values.excludedFromBudgets,
    postings:
      values.kind === "expense" ? [category, funding] : [funding, category],
  };
}

function matchesTypes(type: AccountType | undefined, allowed: AccountType[]) {
  return type === undefined || allowed.includes(type);
}

/**
 * Converts a full-editor draft back into a quick entry, or returns null when
 * the quick form cannot represent it without losing information.
 */
export function editorToQuickValues(
  values: EditorValues,
  accounts: Account[],
  preferredKind: QuickEntryKind = "expense",
): QuickEntryValues | null {
  if (values.postings.length !== 2) return null;
  if (values.postings.some((posting) => posting.memo.trim())) return null;

  const debit = values.postings.find(
    (posting) => posting.direction === "debit",
  );
  const credit = values.postings.find(
    (posting) => posting.direction === "credit",
  );
  if (!debit || !credit) return null;

  // Negative amounts are invalid input; keep them in the full editor rather
  // than silently flipping their sign.
  if (
    values.postings.some(
      (posting) => Number.isFinite(posting.amount) && posting.amount < 0,
    )
  ) {
    return null;
  }
  const debitAmount = normalizedAmount(debit.amount);
  const creditAmount = normalizedAmount(credit.amount);
  if (debitAmount !== creditAmount) return null;

  const accountType = (key: string) =>
    key ? accounts.find((account) => account.key === key)?.type : undefined;
  if (
    (debit.accountKey && !accountType(debit.accountKey)) ||
    (credit.accountKey && !accountType(credit.accountKey))
  ) {
    return null;
  }
  const debitType = accountType(debit.accountKey);
  const creditType = accountType(credit.accountKey);

  const canBeExpense =
    matchesTypes(debitType, quickEntryCategoryTypes.expense) &&
    matchesTypes(creditType, quickEntryFundingTypes);
  const canBeIncome =
    matchesTypes(debitType, quickEntryFundingTypes) &&
    matchesTypes(creditType, quickEntryCategoryTypes.income);

  let kind: QuickEntryKind;
  if (canBeExpense && canBeIncome) kind = preferredKind;
  else if (canBeExpense) kind = "expense";
  else if (canBeIncome) kind = "income";
  else return null;

  return {
    kind,
    date: values.date,
    description: values.description,
    note: values.note,
    excludedFromBudgets: values.excludedFromBudgets,
    amount: debitAmount,
    categoryKey: kind === "expense" ? debit.accountKey : credit.accountKey,
    fundingKey: kind === "expense" ? credit.accountKey : debit.accountKey,
  };
}
