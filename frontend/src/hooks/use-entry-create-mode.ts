import { useCallback, useState } from "react";

import { useAuth } from "@/auth/auth-context";

export type EntryCreateMode = "quick" | "full";

const DEFAULT_ENTRY_CREATE_MODE: EntryCreateMode = "quick";

function storageKey(userId: string) {
  return `baln:entry-create-mode:${userId}`;
}

export function parseEntryCreateMode(value: string | null): EntryCreateMode {
  return value === "full" ? value : DEFAULT_ENTRY_CREATE_MODE;
}

export function readEntryCreateMode(
  userId: string,
  storage: Pick<Storage, "getItem"> = window.localStorage,
) {
  try {
    return parseEntryCreateMode(storage.getItem(storageKey(userId)));
  } catch {
    return DEFAULT_ENTRY_CREATE_MODE;
  }
}

export function writeEntryCreateMode(
  userId: string,
  mode: EntryCreateMode,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  const normalized = parseEntryCreateMode(mode);
  try {
    storage.setItem(storageKey(userId), normalized);
  } catch {
    // Keep the in-memory preference when browser storage is unavailable.
  }
  return normalized;
}

export function useEntryCreateMode() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [entryCreateMode, setEntryCreateModeState] = useState(() =>
    readEntryCreateMode(userId),
  );

  const setEntryCreateMode = useCallback(
    (mode: EntryCreateMode) => {
      const normalized = writeEntryCreateMode(userId, mode);
      setEntryCreateModeState(normalized);
    },
    [userId],
  );

  return { entryCreateMode, setEntryCreateMode };
}
