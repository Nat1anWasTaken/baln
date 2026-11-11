import { useCallback, useState } from "react";

import { useAuth } from "@/auth/auth-context";
import type { QuickEntryKind } from "@/features/entries/quick-entry";

/** How many recent categories are kept per kind. */
const RECENT_CATEGORY_LIMIT = 20;

export type QuickEntryKindMemory = {
  /** Category account keys, most recently used first. */
  recentCategoryKeys: string[];
  /** The funding account key used last. */
  fundingKey: string;
};

export type QuickEntryMemory = Record<QuickEntryKind, QuickEntryKindMemory>;

function emptyKindMemory(): QuickEntryKindMemory {
  return { recentCategoryKeys: [], fundingKey: "" };
}

export function emptyQuickEntryMemory(): QuickEntryMemory {
  return { expense: emptyKindMemory(), income: emptyKindMemory() };
}

function storageKey(userId: string) {
  return `baln:quick-entry-memory:${userId}`;
}

function parseKindMemory(value: unknown): QuickEntryKindMemory {
  if (typeof value !== "object" || value === null) return emptyKindMemory();
  const record = value as Record<string, unknown>;
  const recent = Array.isArray(record.recentCategoryKeys)
    ? record.recentCategoryKeys.filter(
        (key): key is string => typeof key === "string" && key !== "",
      )
    : [];
  return {
    recentCategoryKeys: recent.slice(0, RECENT_CATEGORY_LIMIT),
    fundingKey: typeof record.fundingKey === "string" ? record.fundingKey : "",
  };
}

export function parseQuickEntryMemory(value: string | null): QuickEntryMemory {
  if (!value) return emptyQuickEntryMemory();
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) {
      return emptyQuickEntryMemory();
    }
    const record = parsed as Record<string, unknown>;
    return {
      expense: parseKindMemory(record.expense),
      income: parseKindMemory(record.income),
    };
  } catch {
    return emptyQuickEntryMemory();
  }
}

export function readQuickEntryMemory(
  userId: string,
  storage?: Pick<Storage, "getItem">,
) {
  try {
    // Reading `window.localStorage` itself throws when storage is blocked.
    const source = storage ?? window.localStorage;
    return parseQuickEntryMemory(source.getItem(storageKey(userId)));
  } catch {
    return emptyQuickEntryMemory();
  }
}

/** Records a saved quick entry so the next one starts from its choices. */
export function rememberQuickEntry(
  memory: QuickEntryMemory,
  entry: { kind: QuickEntryKind; categoryKey: string; fundingKey: string },
): QuickEntryMemory {
  const previous = memory[entry.kind];
  return {
    ...memory,
    [entry.kind]: {
      recentCategoryKeys: [
        entry.categoryKey,
        ...previous.recentCategoryKeys.filter(
          (key) => key !== entry.categoryKey,
        ),
      ].slice(0, RECENT_CATEGORY_LIMIT),
      fundingKey: entry.fundingKey,
    },
  };
}

export function writeQuickEntryMemory(
  userId: string,
  memory: QuickEntryMemory,
  storage?: Pick<Storage, "setItem">,
) {
  try {
    (storage ?? window.localStorage).setItem(
      storageKey(userId),
      JSON.stringify(memory),
    );
  } catch {
    // Remembering choices is a convenience; blocked storage just skips it.
  }
}

export function useQuickEntryMemory() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  // Read once per editor so chip order stays put while the user picks.
  const [memory] = useState(() => readQuickEntryMemory(userId));

  const remember = useCallback(
    (entry: {
      kind: QuickEntryKind;
      categoryKey: string;
      fundingKey: string;
    }) => {
      writeQuickEntryMemory(
        userId,
        rememberQuickEntry(readQuickEntryMemory(userId), entry),
      );
    },
    [userId],
  );

  return { memory, remember };
}
