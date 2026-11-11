import { describe, expect, it } from "vitest";

import {
  emptyQuickEntryMemory,
  parseQuickEntryMemory,
  readQuickEntryMemory,
  rememberQuickEntry,
  writeQuickEntryMemory,
} from "@/hooks/use-quick-entry-memory";

describe("quick entry memory", () => {
  it("moves the used category to the front and keeps the account", () => {
    let memory = emptyQuickEntryMemory();
    memory = rememberQuickEntry(memory, {
      kind: "expense",
      categoryKey: "expense.food",
      fundingKey: "asset.cash",
    });
    memory = rememberQuickEntry(memory, {
      kind: "expense",
      categoryKey: "expense.fun",
      fundingKey: "liability.card",
    });
    memory = rememberQuickEntry(memory, {
      kind: "expense",
      categoryKey: "expense.food",
      fundingKey: "liability.card",
    });

    expect(memory.expense).toEqual({
      recentCategoryKeys: ["expense.food", "expense.fun"],
      fundingKey: "liability.card",
    });
    expect(memory.income).toEqual(emptyQuickEntryMemory().income);
  });

  it("ignores malformed stored values", () => {
    expect(parseQuickEntryMemory(null)).toEqual(emptyQuickEntryMemory());
    expect(parseQuickEntryMemory("{")).toEqual(emptyQuickEntryMemory());
    expect(parseQuickEntryMemory("1")).toEqual(emptyQuickEntryMemory());
    expect(
      parseQuickEntryMemory(
        JSON.stringify({
          expense: { recentCategoryKeys: ["a", 1, ""], fundingKey: 3 },
        }),
      ),
    ).toEqual({
      expense: { recentCategoryKeys: ["a"], fundingKey: "" },
      income: { recentCategoryKeys: [], fundingKey: "" },
    });
  });

  it("survives blocked storage", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readQuickEntryMemory("user", blocked)).toEqual(
      emptyQuickEntryMemory(),
    );
    expect(() =>
      writeQuickEntryMemory("user", emptyQuickEntryMemory(), blocked),
    ).not.toThrow();
  });

  it("round-trips through storage per user", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    const memory = rememberQuickEntry(emptyQuickEntryMemory(), {
      kind: "income",
      categoryKey: "income.salary",
      fundingKey: "asset.bank",
    });
    writeQuickEntryMemory("a", memory, storage);
    expect(readQuickEntryMemory("a", storage)).toEqual(memory);
    expect(readQuickEntryMemory("b", storage)).toEqual(emptyQuickEntryMemory());
  });
});
