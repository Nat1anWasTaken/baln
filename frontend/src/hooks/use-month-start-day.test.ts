import { beforeEach, describe, expect, it } from "vitest";

import {
  parseMonthStartDay,
  readMonthStartDay,
  writeMonthStartDay,
} from "@/hooks/use-month-start-day";

describe("month start day preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("accepts only integer days from 1 through 31", () => {
    expect(parseMonthStartDay("26")).toBe(26);
    expect(parseMonthStartDay(null)).toBe(1);
    expect(parseMonthStartDay("0")).toBe(1);
    expect(parseMonthStartDay("32")).toBe(1);
    expect(parseMonthStartDay("2.5")).toBe(1);
    expect(parseMonthStartDay("not-a-day")).toBe(1);
  });

  it("stores preferences separately for each user", () => {
    expect(writeMonthStartDay("user-a", 26)).toBe(26);
    expect(writeMonthStartDay("user-b", 31)).toBe(31);

    expect(readMonthStartDay("user-a")).toBe(26);
    expect(readMonthStartDay("user-b")).toBe(31);
    expect(readMonthStartDay("user-c")).toBe(1);
  });
});
