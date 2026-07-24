import { describe, expect, it } from "vitest";

import {
  buildGuidedPostings,
  type EditorValues,
} from "@/features/entries/entry-editor";

function values(
  preset: EditorValues["preset"],
  primaryAccountKey: string,
  secondaryAccountKey: string,
): EditorValues {
  return {
    mode: "guided",
    preset,
    date: "2026-07-24",
    description: "測試交易",
    note: "",
    amount: 320,
    primaryAccountKey,
    secondaryAccountKey,
    postings: [],
  };
}

describe("guided entry mapping", () => {
  it.each([
    ["expense", "expense.restaurant", "asset.cash"],
    ["income", "asset.bank.esun", "income.salary"],
    ["transfer", "liability.card.cathay", "asset.bank.esun"],
    ["refund", "asset.bank.esun", "expense.restaurant"],
  ] as const)(
    "maps %s to a balanced debit and credit",
    (preset, debit, credit) => {
      expect(buildGuidedPostings(values(preset, debit, credit))).toEqual([
        { account_key: debit, amount_minor: 320, memo: null },
        { account_key: credit, amount_minor: -320, memo: null },
      ]);
    },
  );
});
