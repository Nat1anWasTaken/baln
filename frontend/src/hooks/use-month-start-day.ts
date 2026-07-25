import { useCallback, useState } from "react";

import { useAuth } from "@/auth/auth-context";

const DEFAULT_MONTH_START_DAY = 1;

function storageKey(userId: string) {
  return `baln:month-start-day:${userId}`;
}

export function parseMonthStartDay(value: string | null) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31
    ? day
    : DEFAULT_MONTH_START_DAY;
}

export function readMonthStartDay(
  userId: string,
  storage: Pick<Storage, "getItem"> = window.localStorage,
) {
  try {
    return parseMonthStartDay(storage.getItem(storageKey(userId)));
  } catch {
    return DEFAULT_MONTH_START_DAY;
  }
}

export function writeMonthStartDay(
  userId: string,
  day: number,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  const normalized = parseMonthStartDay(String(day));
  try {
    storage.setItem(storageKey(userId), String(normalized));
  } catch {
    // Keep the in-memory preference when browser storage is unavailable.
  }
  return normalized;
}

export function useMonthStartDay() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [startDay, setStartDayState] = useState(() =>
    readMonthStartDay(userId),
  );

  const setStartDay = useCallback(
    (day: number) => {
      const normalized = writeMonthStartDay(userId, day);
      setStartDayState(normalized);
    },
    [userId],
  );

  return { startDay, setStartDay };
}
