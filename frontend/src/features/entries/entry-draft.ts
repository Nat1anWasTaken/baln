import type { PostingDirection } from "@/features/entries/posting-direction";
import { todayTaipei } from "@/lib/format";
import type { PostingInput } from "@/lib/schemas";

export type EditorPosting = {
  accountKey: string;
  direction: PostingDirection;
  amount: number;
  memo: string;
};

export type EditorValues = {
  date: string;
  description: string;
  note: string;
  excludedFromBudgets: boolean;
  postings: EditorPosting[];
};

export function emptyPosting(direction: PostingDirection): EditorPosting {
  return { accountKey: "", direction, amount: 0, memo: "" };
}

export function blankEditorValues(): EditorValues {
  return {
    date: todayTaipei(),
    description: "",
    note: "",
    excludedFromBudgets: false,
    postings: [emptyPosting("debit"), emptyPosting("credit")],
  };
}

/** Treats empty or non-numeric amount inputs as zero. */
export function normalizedAmount(amount: number) {
  const numericAmount = Number(amount);
  return Number.isFinite(numericAmount) ? Math.abs(numericAmount) : 0;
}

export function signedPosting(posting: EditorPosting): PostingInput {
  const absolute = normalizedAmount(posting.amount);
  return {
    account_key: posting.accountKey,
    amount_minor: posting.direction === "debit" ? absolute : -absolute,
    memo: posting.memo.trim() || null,
  };
}

/** Whether a new-entry draft still holds nothing worth confirming a discard. */
export function isBlankEditorValues(values: EditorValues) {
  const blank = blankEditorValues();
  return (
    values.date === blank.date &&
    values.description === "" &&
    values.note === "" &&
    !values.excludedFromBudgets &&
    values.postings.length === blank.postings.length &&
    values.postings.every(
      (posting, index) =>
        posting.direction === blank.postings[index].direction &&
        !posting.accountKey &&
        normalizedAmount(posting.amount) === 0 &&
        posting.memo === "",
    )
  );
}
