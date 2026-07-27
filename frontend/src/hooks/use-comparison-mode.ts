import { useCallback, useState } from "react";

import { useAuth } from "@/auth/auth-context";
import type { ComparisonMode } from "@/lib/format";

const DEFAULT_COMPARISON_MODE: ComparisonMode = "same-progress";

function storageKey(userId: string) {
  return `baln:comparison-mode:${userId}`;
}

export function parseComparisonMode(value: string | null): ComparisonMode {
  return value === "full-previous" ? value : DEFAULT_COMPARISON_MODE;
}

export function readComparisonMode(
  userId: string,
  storage: Pick<Storage, "getItem"> = window.localStorage,
) {
  try {
    return parseComparisonMode(storage.getItem(storageKey(userId)));
  } catch {
    return DEFAULT_COMPARISON_MODE;
  }
}

export function writeComparisonMode(
  userId: string,
  mode: ComparisonMode,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  const normalized = parseComparisonMode(mode);
  try {
    storage.setItem(storageKey(userId), normalized);
  } catch {
    // Keep the in-memory preference when browser storage is unavailable.
  }
  return normalized;
}

export function useComparisonMode() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [comparisonMode, setComparisonModeState] = useState(() =>
    readComparisonMode(userId),
  );

  const setComparisonMode = useCallback(
    (mode: ComparisonMode) => {
      const normalized = writeComparisonMode(userId, mode);
      setComparisonModeState(normalized);
    },
    [userId],
  );

  return { comparisonMode, setComparisonMode };
}
