import { beforeEach, describe, expect, it } from "vitest";

import {
  blankEditorValues,
  type EditorValues,
  isBlankEditorValues,
} from "@/features/entries/entry-draft";
import {
  blankQuickEntryValues,
  editorToQuickValues,
  isBlankQuickEntryValues,
  quickToEditorValues,
  type QuickEntryValues,
} from "@/features/entries/quick-entry";
import {
  parseEntryCreateMode,
  readEntryCreateMode,
  writeEntryCreateMode,
} from "@/hooks/use-entry-create-mode";
import type { Account, AccountType } from "@/lib/schemas";

function account(key: string, type: AccountType): Account {
  return {
    id: `01980000-0000-7000-8000-${key.length.toString().padStart(12, "0")}`,
    key,
    name: key,
    note: null,
    type,
    archived: false,
    created_at: "2026-07-24T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  };
}

const accounts = [
  account("asset.cash", "asset"),
  account("asset.bank", "asset"),
  account("liability.card", "liability"),
  account("expense.food", "expense"),
  account("income.salary", "income"),
  account("equity.opening", "equity"),
  { ...account("expense.retired", "expense"), archived: true },
];

const expense: QuickEntryValues = {
  kind: "expense",
  date: "2026-07-24",
  description: "午餐",
  note: "公司附近",
  excludedFromBudgets: true,
  amount: 180,
  categoryKey: "expense.food",
  fundingKey: "liability.card",
};

function editorValues(
  postings: EditorValues["postings"],
  overrides: Partial<EditorValues> = {},
): EditorValues {
  return {
    date: "2026-07-24",
    description: "午餐",
    note: "",
    excludedFromBudgets: false,
    postings,
    ...overrides,
  };
}

describe("quick entry conversion", () => {
  it("expands an expense into a debit category and credit funding posting", () => {
    expect(quickToEditorValues(expense)).toEqual({
      date: "2026-07-24",
      description: "午餐",
      note: "公司附近",
      excludedFromBudgets: true,
      postings: [
        {
          accountKey: "expense.food",
          direction: "debit",
          amount: 180,
          memo: "",
        },
        {
          accountKey: "liability.card",
          direction: "credit",
          amount: 180,
          memo: "",
        },
      ],
    });
  });

  it("expands an income into a debit funding and credit category posting", () => {
    const income: QuickEntryValues = {
      ...expense,
      kind: "income",
      categoryKey: "income.salary",
      fundingKey: "asset.bank",
    };
    expect(quickToEditorValues(income).postings).toEqual([
      { accountKey: "asset.bank", direction: "debit", amount: 180, memo: "" },
      {
        accountKey: "income.salary",
        direction: "credit",
        amount: 180,
        memo: "",
      },
    ]);
    expect(editorToQuickValues(quickToEditorValues(income), accounts)).toEqual(
      income,
    );
  });

  it("round-trips quick drafts, including unfinished ones", () => {
    expect(editorToQuickValues(quickToEditorValues(expense), accounts)).toEqual(
      expense,
    );

    const unfinishedIncome = {
      ...blankQuickEntryValues(),
      kind: "income" as const,
    };
    expect(
      editorToQuickValues(
        quickToEditorValues(unfinishedIncome),
        accounts,
        "income",
      ),
    ).toEqual(unfinishedIncome);
  });

  it("carries an invalid negative quick amount over without flipping it", () => {
    const negative = { ...expense, amount: -50 };
    const editorDraft = quickToEditorValues(negative);
    expect(editorDraft.postings.map((posting) => posting.amount)).toEqual([
      -50, -50,
    ]);
    expect(editorToQuickValues(editorDraft, accounts)).toBeNull();
  });

  it("maps a blank full draft and treats unparsed amounts as zero", () => {
    const blank = blankEditorValues();
    blank.postings[0].amount = Number.NaN;
    expect(editorToQuickValues(blank, accounts)).toMatchObject({
      kind: "expense",
      amount: 0,
      categoryKey: "",
      fundingKey: "",
    });
  });

  it("infers the kind from a partially selected full draft", () => {
    expect(
      editorToQuickValues(
        editorValues([
          { accountKey: "", direction: "debit", amount: 50, memo: "" },
          {
            accountKey: "income.salary",
            direction: "credit",
            amount: 50,
            memo: "",
          },
        ]),
        accounts,
      ),
    ).toMatchObject({ kind: "income", categoryKey: "income.salary" });
  });

  it.each([
    [
      "three postings",
      [
        {
          accountKey: "expense.food",
          direction: "debit",
          amount: 50,
          memo: "",
        },
        {
          accountKey: "expense.food",
          direction: "debit",
          amount: 50,
          memo: "",
        },
        {
          accountKey: "asset.cash",
          direction: "credit",
          amount: 100,
          memo: "",
        },
      ],
    ],
    [
      "a transfer between assets",
      [
        { accountKey: "asset.bank", direction: "debit", amount: 50, memo: "" },
        { accountKey: "asset.cash", direction: "credit", amount: 50, memo: "" },
      ],
    ],
    [
      "unequal amounts",
      [
        {
          accountKey: "expense.food",
          direction: "debit",
          amount: 50,
          memo: "",
        },
        { accountKey: "asset.cash", direction: "credit", amount: 40, memo: "" },
      ],
    ],
    [
      "a posting memo",
      [
        {
          accountKey: "expense.food",
          direction: "debit",
          amount: 50,
          memo: "加點",
        },
        { accountKey: "asset.cash", direction: "credit", amount: 50, memo: "" },
      ],
    ],
    [
      "two postings in the same direction",
      [
        { accountKey: "", direction: "debit", amount: 0, memo: "" },
        { accountKey: "", direction: "debit", amount: 0, memo: "" },
      ],
    ],
    [
      "an equity account",
      [
        { accountKey: "asset.cash", direction: "debit", amount: 50, memo: "" },
        {
          accountKey: "equity.opening",
          direction: "credit",
          amount: 50,
          memo: "",
        },
      ],
    ],
    [
      "negative amounts",
      [
        {
          accountKey: "expense.food",
          direction: "debit",
          amount: -50,
          memo: "",
        },
        { accountKey: "asset.cash", direction: "credit", amount: 50, memo: "" },
      ],
    ],
    [
      "an archived account",
      [
        {
          accountKey: "expense.retired",
          direction: "debit",
          amount: 50,
          memo: "",
        },
        { accountKey: "asset.cash", direction: "credit", amount: 50, memo: "" },
      ],
    ],
    [
      "an unknown account",
      [
        {
          accountKey: "expense.gone",
          direction: "debit",
          amount: 50,
          memo: "",
        },
        { accountKey: "asset.cash", direction: "credit", amount: 50, memo: "" },
      ],
    ],
  ] satisfies [string, EditorValues["postings"]][])(
    "keeps drafts with %s in the full editor",
    (_, postings) => {
      expect(editorToQuickValues(editorValues(postings), accounts)).toBeNull();
    },
  );

  it("detects blank drafts for discard confirmation", () => {
    expect(isBlankQuickEntryValues(blankQuickEntryValues("income"))).toBe(true);
    expect(
      isBlankQuickEntryValues({ ...blankQuickEntryValues(), amount: 10 }),
    ).toBe(false);
    expect(isBlankEditorValues(blankEditorValues())).toBe(true);
    expect(
      isBlankEditorValues({ ...blankEditorValues(), description: "午餐" }),
    ).toBe(false);
  });
});

describe("entry create mode preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults invalid values to quick mode", () => {
    expect(parseEntryCreateMode(null)).toBe("quick");
    expect(parseEntryCreateMode("unknown")).toBe("quick");
    expect(parseEntryCreateMode("full")).toBe("full");
  });

  it("stores preferences separately for each user", () => {
    expect(writeEntryCreateMode("user-a", "full")).toBe("full");
    expect(readEntryCreateMode("user-a")).toBe("full");
    expect(readEntryCreateMode("user-b")).toBe("quick");
  });

  it("falls back when reading browser storage itself throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      expect(readEntryCreateMode("user-a")).toBe("quick");
      expect(writeEntryCreateMode("user-a", "full")).toBe("full");
    } finally {
      Object.defineProperty(window, "localStorage", descriptor!);
    }
  });

  it("falls back to quick mode when storage is unavailable", () => {
    const failingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readEntryCreateMode("user-a", failingStorage)).toBe("quick");
    expect(writeEntryCreateMode("user-a", "full", failingStorage)).toBe("full");
  });
});
